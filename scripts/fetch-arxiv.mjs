// ============================================================================
// scripts/fetch-arxiv.mjs
//
// Demand Atlas — arXiv 論文投稿量取得 (実験フェーズ / データ収集のみ)
//
//   ■ 目的
//     arXiv Atom API から、config/arxiv-mapping.json に定義された各テーマの
//     検索クエリ + 過去 30 日フィルタで論文投稿数を取得し、共通エンベロープ
//     形式で data/arxiv.json に保存する。
//
//   ■ このスクリプトが やること
//     - config/arxiv-mapping.json を読み込む
//     - 各テーマにつき 1 リクエスト (max_results=100)
//     - opensearch:totalResults で正確な paperCount を取得
//     - 返却された最新 100 件から uniqueAuthors / primaryCategoryTop
//       / avgAuthorsPerPaper をサンプル計算 (isAuthorsSampled=true)
//     - 3.2 秒間隔で rate limit 遵守
//     - 各テーマ失敗しても他は継続、構造化エラーで記録
//
//   ■ このスクリプトが やらないこと (今回スコープ外)
//     - 全ページ paginate (paperCount は totalResults で既に正確)
//     - 論文本文/abstract の保存 (指標のみ扱う)
//     - カテゴリ別/年代別集計 (v2 で検討)
//     - スコアへの反映 (build-demands.mjs で内部フィールドを付与のみ)
//
//   ■ 使い方
//     npm run arxiv
//
//   ■ 依存
//     - Node.js 18+ の標準機能のみ
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, classifyFetchError, fetchWithRetry } from './lib/fetch-common.mjs';

// ---------------------------------------------------------------------------
// 設定 (arXiv 固有のみ。共通の USER_AGENT / タイムアウト / リトライ待機は
// scripts/lib/fetch-common.mjs のデフォルトを使用)
// ---------------------------------------------------------------------------

const DEFAULT_RATE_LIMIT_MS = 3200;  // arXiv 公式推奨は 3 秒、余裕を持たせる

const ARXIV_API_BASE = 'https://export.arxiv.org/api/query';

// ---------------------------------------------------------------------------
// パス
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const MAPPING   = resolve(REPO_ROOT, 'config', 'arxiv-mapping.json');
const OUTPUT    = resolve(REPO_ROOT, 'data',   'arxiv.json');

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * arXiv 日付フィルタ形式に整形。
 * YYYYMMDDHHMM (12桁、UTC)。space は保持したまま encodeURIComponent する。
 */
function arxivDate(d) {
  const y  = d.getUTCFullYear();
  const m  = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}${m}${dd}${hh}${mm}`;
}

function computeWindow(days) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - days * DAY_MS);
  return { start, end };
}

/**
 * makeError の 4 番目のフィールド名 (theme) は arXiv 固有のため、
 * lib には抽出せずローカルで保持する (Qiita の tag / App Store の chart
 * とは別)。
 */
function makeError(type, message, retryable, theme) {
  return { type, message, retryable, theme };
}

// ---------------------------------------------------------------------------
// arXiv API 呼び出し + Atom XML パース
//
// HTTP レイヤーは lib/fetch-common の fetchWithRetry に委譲。
// arXiv 固有処理は Atom XML 用 Accept ヘッダと text() 取得のみ。
// ---------------------------------------------------------------------------

async function fetchArxivRaw(url) {
  const res = await fetchWithRetry(url, { accept: 'application/atom+xml' });
  return res.text();
}

/**
 * arXiv Atom XML を軽量パースする。
 * arxiv 独自 namespace (arxiv:primary_category, opensearch:totalResults) を
 * 使うため rss-parser より正規表現ベースの方が確実。
 */
function parseArxivFeed(xml) {
  const totalMatch = xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/);
  const totalResults = totalMatch ? Number(totalMatch[1]) : 0;

  const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const entries = entryBlocks.map((block) => {
    const idMatch      = block.match(/<id>(.*?)<\/id>/);
    const titleMatch   = block.match(/<title>([\s\S]*?)<\/title>/);
    const pubMatch     = block.match(/<published>(.*?)<\/published>/);
    const updMatch     = block.match(/<updated>(.*?)<\/updated>/);
    const primaryMatch = block.match(/<arxiv:primary_category\s+term="([^"]+)"/);

    const authorNames = [];
    const authorRe = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
    let am;
    while ((am = authorRe.exec(block)) !== null) {
      authorNames.push(am[1].trim());
    }

    return {
      id:              idMatch    ? idMatch[1].trim()    : null,
      title:           titleMatch ? titleMatch[1].trim() : null,
      published:       pubMatch   ? pubMatch[1].trim()   : null,
      updated:         updMatch   ? updMatch[1].trim()   : null,
      primaryCategory: primaryMatch ? primaryMatch[1]    : null,
      authors:         authorNames,
    };
  });

  return { totalResults, entries };
}

// ---------------------------------------------------------------------------
// テーマ処理
// ---------------------------------------------------------------------------

async function processTheme(themeId, cfg, windowStart, windowEnd, maxResults) {
  const dateFilter = `submittedDate:[${arxivDate(windowStart)} TO ${arxivDate(windowEnd)}]`;
  const fullQuery  = `${cfg.query} AND ${dateFilter}`;
  const url = `${ARXIV_API_BASE}?search_query=${encodeURIComponent(fullQuery)}` +
              `&start=0&max_results=${maxResults}` +
              `&sortBy=submittedDate&sortOrder=descending`;

  const xml = await fetchArxivRaw(url);
  const { totalResults, entries } = parseArxivFeed(xml);

  // uniqueAuthors: サンプル (取得した entries 内での重複排除)
  const authorSet = new Set();
  let authorSumForAvg = 0;
  for (const e of entries) {
    for (const a of e.authors) authorSet.add(a);
    authorSumForAvg += e.authors.length;
  }
  const uniqueAuthors     = authorSet.size;
  const avgAuthorsPerPaper = entries.length > 0
    ? Math.round((authorSumForAvg / entries.length) * 10) / 10
    : null;

  // primaryCategoryTop: 最頻出の主分類
  const catCount = new Map();
  for (const e of entries) {
    if (!e.primaryCategory) continue;
    catCount.set(e.primaryCategory, (catCount.get(e.primaryCategory) || 0) + 1);
  }
  let primaryCategoryTop = null;
  let topCount = -1;
  for (const [cat, cnt] of catCount) {
    if (cnt > topCount) { topCount = cnt; primaryCategoryTop = cat; }
  }

  // latestPaperPublished: 最新論文の published
  let latestPaperPublished = null;
  for (const e of entries) {
    if (!e.published) continue;
    if (!latestPaperPublished || e.published > latestPaperPublished) {
      latestPaperPublished = e.published;
    }
  }

  const isAuthorsSampled = totalResults > entries.length;

  // topItems: 最新 5 論文。UI で「実際の論文」として表示する最小メタ。
  // arXiv には engagement 指標が無いため published desc = 最新順で選ぶ。
  // arxiv:id は https://arxiv.org/abs/… の URL 形式なのでそのまま使える。
  const topItems = entries
    .slice()
    .sort((a, b) => (b.published || '').localeCompare(a.published || ''))
    .slice(0, 5)
    .map((e) => ({
      title:       (e.title || '').replace(/\s+/g, ' ').trim(),
      url:         e.id || null,
      publishedAt: e.published || null,
      category:    e.primaryCategory || null,
      authorCount: e.authors.length,
      firstAuthor: e.authors[0] || null,
    }));

  return {
    themeId,
    query:                fullQuery,
    paperCount:           totalResults,
    fetchedEntries:       entries.length,
    uniqueAuthors,
    avgAuthorsPerPaper,
    primaryCategoryTop,
    latestPaperPublished,
    isAuthorsSampled,
    sampleSize:           entries.length,
    topItems,
  };
}

// ---------------------------------------------------------------------------
// 共通エンベロープ生成
// ---------------------------------------------------------------------------

function toEnvelope(themeResult, fetchedAt, windowDays, dateFilterForMeta, maxResults) {
  // 1 テーマ 1 リクエストなので coverage は取得成否のみで決まる。成功時は 1.0。
  const coverage = 1.0;
  const complete = true;

  return {
    envelopeVersion: '1.0.0',
    source:          'arxiv',
    windowDays,
    fetchedAt,
    requestCount:    1,
    complete,
    coverage,
    errors:          [],
    metrics: {
      volume:           themeResult.paperCount,             // 正確値 (totalResults)
      engagement:       null,                                // arXiv に反応なし
      contributors:     themeResult.uniqueAuthors,           // サンプル値 (isAuthorsSampled で透明化)
      latestActivityAt: themeResult.latestPaperPublished,
    },
    nativeMetrics: {
      paperCount:            themeResult.paperCount,
      uniqueAuthors:         themeResult.uniqueAuthors,
      avgAuthorsPerPaper:    themeResult.avgAuthorsPerPaper,
      primaryCategoryTop:    themeResult.primaryCategoryTop,
      isAuthorsSampled:      themeResult.isAuthorsSampled,
      sampleSize:            themeResult.sampleSize,
      latestPaperPublished:  themeResult.latestPaperPublished,
    },
    meta: {
      searchQuery:  themeResult.query,
      dateFilter:   dateFilterForMeta,
      maxResults,
      sortBy:       'submittedDate',
      sortOrder:    'descending',
    },
    // history から strip される (append-history が metrics/nativeMetrics のみ抽出)
    topItems: themeResult.topItems || [],
  };
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — arXiv 論文投稿量取得 (実験)');
  console.log(`   マッピング: ${MAPPING}`);
  console.log(`   出力:       ${OUTPUT}`);

  const raw = await readFile(MAPPING, 'utf8');
  const cfg = JSON.parse(raw);
  const mapping         = cfg.mapping || {};
  const skippedReasons  = cfg.skippedReasons || {};
  const windowDays      = Number(cfg.windowDays) || 30;
  const maxResults      = Number(cfg.maxResultsPerQuery) || 100;
  const rateLimitMs     = Number(cfg.requestIntervalMs) || DEFAULT_RATE_LIMIT_MS;
  const mappingVersion  = Number(cfg.mappingVersion) || null;
  const verifiedAt      = cfg.verifiedAt || null;

  const { start: windowStart, end: windowEnd } = computeWindow(windowDays);
  const dateFilterMeta = `${arxivDate(windowStart)} TO ${arxivDate(windowEnd)}`;

  console.log(`   期間:       過去 ${windowDays} 日 (${arxivDate(windowStart)} TO ${arxivDate(windowEnd)})`);
  console.log(`   対象テーマ: ${Object.keys(mapping).length} 件`);
  console.log(`   1 テーマ 1 リクエスト、rate limit: ${rateLimitMs}ms 間隔`);
  console.log(`   mapping:    v${mappingVersion} (verified ${verifiedAt})`);
  console.log('');

  const fetchedAt = new Date().toISOString();
  const themes         = {};
  const themesSkipped  = [];
  const errorsAll      = [];
  let successThemeCount = 0;

  const themeIds = Object.keys(mapping);
  for (let i = 0; i < themeIds.length; i++) {
    const themeId = themeIds[i];
    const themeCfg = mapping[themeId];
    const label = `  [${i + 1}/${themeIds.length}] ${themeId.padEnd(26)}`;

    if (!themeCfg || !themeCfg.query) {
      const info = skippedReasons[themeId] || { reason: 'not-verified', note: '' };
      console.log(`${label}  - (query 未定義、skip)`);
      themesSkipped.push({ theme: themeId, reason: info.reason, note: info.note });
      continue;
    }

    process.stdout.write(label);
    try {
      const result = await processTheme(themeId, themeCfg, windowStart, windowEnd, maxResults);
      themes[themeId] = toEnvelope(result, fetchedAt, windowDays, dateFilterMeta, maxResults);
      successThemeCount++;
      const cat = result.primaryCategoryTop ? `[${result.primaryCategoryTop}]` : '[-]';
      const sampled = result.isAuthorsSampled ? '(sampled)' : '';
      console.log(
        `  ✓ paper=${String(result.paperCount).padStart(5)} ` +
        `authors=${String(result.uniqueAuthors).padStart(4)} ${sampled} ` +
        `avg=${String(result.avgAuthorsPerPaper || '-').padStart(4)} ${cat}`
      );
    } catch (err) {
      const { type, retryable } = classifyFetchError(err);
      const message = err && err.message ? err.message : String(err);
      errorsAll.push(makeError(type, message, retryable, themeId));
      console.log(`  ✗ ${type} (${retryable ? 'retryable' : 'fatal'}): ${message}`);
    }

    // 最後のテーマ以外はレートリミット待機
    if (i < themeIds.length - 1) await sleep(rateLimitMs);
  }

  const output = {
    generatedAt:        fetchedAt,
    source:             'arxiv',
    method:             'arxiv-atom-api (1 request per theme, max_results=100, sampled uniqueAuthors)',
    mappingVersion,
    verifiedAt,
    windowDays,
    windowStart:        arxivDate(windowStart),
    windowEnd:          arxivDate(windowEnd),
    mappedThemeCount:   themeIds.length,
    successCount:       successThemeCount,
    skippedCount:       themesSkipped.length,
    errorCount:         errorsAll.length,
    totalRequestCount:  successThemeCount + errorsAll.length,
    themesSkipped,
    themes,
    errors:             errorsAll,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log('');
  console.log('──────────────  サマリー  ──────────────');
  console.log(`  マップ済みテーマ:   ${themeIds.length}`);
  console.log(`  取得成功:           ${successThemeCount}`);
  console.log(`  スキップ:           ${themesSkipped.length}`);
  console.log(`  エラー:             ${errorsAll.length}`);
  console.log(`  総リクエスト数:     ${successThemeCount + errorsAll.length}`);
  if (errorsAll.length > 0) {
    console.log('  エラー詳細:');
    for (const e of errorsAll) {
      console.log(`    - [${e.theme}] (${e.type}, ${e.retryable ? 'retryable' : 'fatal'}): ${e.message}`);
    }
  }
  console.log(`  出力: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
