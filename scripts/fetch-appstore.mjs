// ============================================================================
// scripts/fetch-appstore.mjs
//
// Demand Atlas — App Store JP RSS 取得 (実験フェーズ / データ収集のみ)
//
//   ■ 目的
//     Apple の Legacy iTunes RSS から、日本ストア (jp) の
//     top-free / top-grossing 各 100 件を取得し、
//     config/appstore-mapping.json に定義された各テーマのアプリを
//     appId で照合する。共通エンベロープ形式で data/appstore.json に保存。
//
//   ■ 共通エンベロープの App Store 固有マッピング
//     metrics.volume       = null (TODO、rank ベースは量ではないため未定義)
//     metrics.engagement   = null (公開 RSS に反応シグナルなし)
//     metrics.contributors = null (publisher は組織であり個人カウントと集約不能)
//     metrics.latestActivityAt = 最新の feed.updated
//     nativeMetrics に量的情報を保存 (matchedAppCount, uniquePublishers,
//       bestRank, averageRank, rankWeightedScore, matchedApps 等)
//
//   ■ このスクリプトが やらないこと
//     - カテゴリ別チャート取得 (v2 で拡張予定)
//     - iTunes Search API による追加情報取得
//     - 需要スコアへの反映 (build-demands.mjs で内部フィールドを付与するだけ)
//     - UI 表示 (フロントエンド無変更)
//     - 履歴保存 (前フェーズで保留中)
//
//   ■ 使い方
//     npm run appstore
//
//   ■ 依存
//     - Node.js 18+ の標準 fetch のみ (追加パッケージなし)
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, classifyFetchError, fetchWithRetry } from './lib/fetch-common.mjs';

// ---------------------------------------------------------------------------
// 設定 (App Store 固有のみ。共通の USER_AGENT / タイムアウト / リトライ待機は
// scripts/lib/fetch-common.mjs のデフォルトを使用)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 500;   // チャート間の待機 (Apple CDN への礼儀)

const APPSTORE_RSS_BASE = 'https://itunes.apple.com';

// ---------------------------------------------------------------------------
// パス
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const MAPPING   = resolve(REPO_ROOT, 'config', 'appstore-mapping.json');
const OUTPUT    = resolve(REPO_ROOT, 'data',   'appstore.json');

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * makeError の 4 番目のフィールド名 (chart) は App Store 固有のため、
 * lib には抽出せずローカルで保持する (Qiita の tag / arXiv の theme
 * とは別)。
 */
function makeError(type, message, retryable, chart) {
  return { type, message, retryable, chart };
}

// ---------------------------------------------------------------------------
// フェッチ (1 チャート)
//
// HTTP レイヤーは lib/fetch-common の fetchWithRetry に委譲。
// App Store 固有処理は JSON ボディの取り出しのみ。
// ---------------------------------------------------------------------------

async function fetchFeedRaw(url) {
  const res = await fetchWithRetry(url, { accept: 'application/json' });
  return res.json();
}

/**
 * 1 チャートを取得し、正規化した entry 配列と feed メタ情報を返す。
 */
async function fetchChart(chart, storefront, feedLimit) {
  const url = `${APPSTORE_RSS_BASE}/${storefront}/rss/${chart}/limit=${feedLimit}/json`;
  const json = await fetchFeedRaw(url);

  const feed = json && json.feed;
  if (!feed) throw new Error('feed-empty: no feed in response');

  const entries = Array.isArray(feed.entry) ? feed.entry : [];
  if (entries.length === 0) throw new Error('feed-empty: feed.entry is empty');

  const feedUpdated = feed.updated && feed.updated.label ? feed.updated.label : null;
  const feedTitle   = feed.title   && feed.title.label   ? feed.title.label   : null;
  const feedRights  = feed.rights  && feed.rights.label  ? feed.rights.label  : null;

  const normalized = entries.map((e, idx) => ({
    appId:       (e.id && e.id.attributes && e.id.attributes['im:id']) || null,
    name:        (e['im:name']    && e['im:name'].label)    || null,
    publisher:   (e['im:artist']  && e['im:artist'].label)  || null,
    releaseDate: (e['im:releaseDate'] && e['im:releaseDate'].label) || null,
    category:    (e.category && e.category.attributes && e.category.attributes.label) || null,
    rank:        idx + 1,      // ★ 位置 = 順位 (feed 内の順序)
    chart,
  }));

  return {
    chart,
    feedUpdated,
    feedTitle,
    feedRights,
    totalEntries: normalized.length,
    entries:      normalized,
  };
}

// ---------------------------------------------------------------------------
// テーマ集約
// ---------------------------------------------------------------------------

/**
 * テーマ ID にマップされたアプリ ID 集合を作り、
 * 全チャートの entry を走査してマッチを収集する。
 * appId + chart の複合キーで dedup。
 */
function processTheme(themeId, mappingApps, chartResults) {
  const idToMapEntry = new Map();
  for (const a of mappingApps) idToMapEntry.set(String(a.id), a);

  // { chartName: matchCount }
  const matchesByChart = new Map(chartResults.map((c) => [c.chart, 0]));
  const matchedApps = [];
  const seenKeys = new Set();   // appId + '|' + chart

  for (const chartResult of chartResults) {
    for (const entry of chartResult.entries) {
      if (!entry.appId) continue;
      if (!idToMapEntry.has(entry.appId)) continue;
      const key = entry.appId + '|' + entry.chart;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      matchedApps.push(entry);
      matchesByChart.set(entry.chart, (matchesByChart.get(entry.chart) || 0) + 1);
    }
  }

  // 集計
  const uniqueAppIds     = new Set(matchedApps.map((m) => m.appId));
  const uniquePublishers = new Set(matchedApps.map((m) => m.publisher).filter(Boolean));
  const matchedAppCount  = uniqueAppIds.size;

  let bestRank = null;
  let rankSum = 0;
  let rankWeightedScore = 0;
  for (const m of matchedApps) {
    if (bestRank === null || m.rank < bestRank) bestRank = m.rank;
    rankSum += m.rank;
    rankWeightedScore += (101 - m.rank);   // rank=1 → 100, rank=100 → 1
  }
  const averageRank = matchedApps.length > 0
    ? Math.round((rankSum / matchedApps.length) * 10) / 10
    : null;

  // latestActivityAt: マッチが登場したチャートの feed.updated のうち最も新しい
  let latestActivityAt = null;
  const chartsWithMatch = new Set(matchedApps.map((m) => m.chart));
  for (const cr of chartResults) {
    if (chartsWithMatch.has(cr.chart) && cr.feedUpdated) {
      if (!latestActivityAt || cr.feedUpdated > latestActivityAt) {
        latestActivityAt = cr.feedUpdated;
      }
    }
  }
  // マッチゼロの場合はどのチャートの feed.updated でも代表可 (最も新しい方)
  if (latestActivityAt === null) {
    for (const cr of chartResults) {
      if (cr.feedUpdated && (!latestActivityAt || cr.feedUpdated > latestActivityAt)) {
        latestActivityAt = cr.feedUpdated;
      }
    }
  }

  return {
    themeId,
    mappingApps,
    matchedApps,
    matchedAppCount,
    uniquePublishersCount: uniquePublishers.size,
    bestRank,
    averageRank,
    rankWeightedScore,
    matchesByChart,
    latestActivityAt,
  };
}

// ---------------------------------------------------------------------------
// エンベロープ生成
// ---------------------------------------------------------------------------

function computeCoverage(chartResults, chartErrors) {
  const total = chartResults.length + chartErrors.length;
  if (total === 0) return null;
  return Math.round((chartResults.length / total) * 10000) / 10000;
}

/**
 * テーマ集計結果を共通エンベロープに整形する。
 *
 *   metrics       ... 全ソース共通の意味的スロット
 *                       volume/engagement/contributors は null (semantic mismatch)
 *                       詳細は config/README.md 参照
 *   nativeMetrics ... App Store 固有の量的指標
 *   meta          ... マッピング情報とチャート内訳
 */
function toEnvelope(themeResult, fetchedAt, windowDays, storefront, feedRights, chartResults, chartErrors) {
  const coverage = computeCoverage(chartResults, chartErrors);
  const complete = chartErrors.length === 0 && chartResults.length > 0;

  // チャート単位のエラーはこのテーマにも該当する共通エラーとして流用
  // (テーマ固有のエラーは現在の設計では発生しない)
  const errors = chartErrors.map((e) => ({ ...e, tag: e.chart }));

  const topFreeMatchCount     = themeResult.matchesByChart.get('topfreeapplications')     || 0;
  const topGrossingMatchCount = themeResult.matchesByChart.get('topgrossingapplications') || 0;

  const chartBreakdown = [];
  for (const cr of chartResults) {
    const matchCount = themeResult.matchesByChart.get(cr.chart) || 0;
    const ranksInThisChart = themeResult.matchedApps
      .filter((m) => m.chart === cr.chart)
      .map((m) => m.rank);
    const bestRank = ranksInThisChart.length > 0 ? Math.min(...ranksInThisChart) : null;
    chartBreakdown.push({
      chart:        cr.chart,
      feedUpdated:  cr.feedUpdated,
      totalEntries: cr.totalEntries,
      matchCount,
      bestRank,
    });
  }

  return {
    envelopeVersion: '1.0.0',
    source:       'appstore',
    windowDays,
    fetchedAt,
    requestCount: chartResults.length + chartErrors.length,
    complete,
    coverage,
    errors,
    metrics: {
      // ★ 変更 ①: App Store の rank は「量」ではないため null
      volume:           null,
      // App Store は反応シグナルなし
      engagement:       null,
      // ★ 変更 ②: publisher は組織、他ソースの個人 contributors と集約不能なため null
      contributors:     null,
      latestActivityAt: themeResult.latestActivityAt,
    },
    nativeMetrics: {
      matchedAppCount:        themeResult.matchedAppCount,
      uniquePublishers:       themeResult.uniquePublishersCount,
      topFreeMatchCount,
      topGrossingMatchCount,
      bestRank:               themeResult.bestRank,
      averageRank:            themeResult.averageRank,
      rankWeightedScore:      themeResult.rankWeightedScore,
      matchedApps:            themeResult.matchedApps,
    },
    meta: {
      mappedApps:    themeResult.mappingApps,
      storefront,
      copyright:     feedRights,
      chartBreakdown,
    },
  };
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — App Store JP RSS 取得 (実験)');
  console.log(`   マッピング: ${MAPPING}`);
  console.log(`   出力:       ${OUTPUT}`);

  const raw = await readFile(MAPPING, 'utf8');
  const cfg = JSON.parse(raw);
  const mapping         = cfg.mapping || {};
  const skippedReasons  = cfg.skippedReasons || {};
  const windowDays      = Number(cfg.windowDays) || 1;
  const storefront      = cfg.storefront || 'jp';
  const charts          = Array.isArray(cfg.charts) && cfg.charts.length > 0
    ? cfg.charts
    : ['topfreeapplications', 'topgrossingapplications'];
  const feedLimit       = Number(cfg.feedLimit) || 100;
  const mappingVersion  = Number(cfg.mappingVersion) || null;
  const verifiedAt      = cfg.verifiedAt || null;

  console.log(`   ストア:     ${storefront}`);
  console.log(`   チャート:   ${charts.join(', ')} (limit=${feedLimit})`);
  console.log(`   window:     ${windowDays} 日 (スナップショット)`);
  console.log(`   mapping:    v${mappingVersion} (verified ${verifiedAt})`);
  console.log('');

  const fetchedAt = new Date().toISOString();

  // Step 1-2: チャート取得
  const chartResults = [];
  const chartErrors  = [];
  for (let i = 0; i < charts.length; i++) {
    const chart = charts[i];
    process.stdout.write(`  [${i + 1}/${charts.length}] ${chart.padEnd(28)} `);
    try {
      const cr = await fetchChart(chart, storefront, feedLimit);
      chartResults.push(cr);
      console.log(`✓ ${cr.totalEntries} entries, updated=${cr.feedUpdated}`);
    } catch (err) {
      const { type, retryable } = classifyFetchError(err);
      const message = err && err.message ? err.message : String(err);
      chartErrors.push(makeError(type, message, retryable, chart));
      console.log(`✗ ${message}`);
    }
    if (i < charts.length - 1) await sleep(RATE_LIMIT_MS);
  }
  console.log('');

  if (chartResults.length === 0) {
    console.error('✗ 全チャート取得失敗。出力ファイルを生成せず終了。');
    process.exit(1);
  }

  // Copyright 表示 (Apple ToS 遵守)
  const feedRights = chartResults[0].feedRights;

  // Step 3-5: テーマ集約 + エンベロープ生成
  const themes         = {};
  const themesSkipped  = [];
  let successThemeCount = 0;

  const themeIds = Object.keys(mapping);
  for (const themeId of themeIds) {
    const apps = mapping[themeId] || [];
    if (apps.length === 0) {
      const info = skippedReasons[themeId] || { reason: 'not-verified', note: '' };
      themesSkipped.push({ theme: themeId, reason: info.reason, note: info.note });
      continue;
    }

    const result = processTheme(themeId, apps, chartResults);
    themes[themeId] = toEnvelope(
      result, fetchedAt, windowDays, storefront, feedRights, chartResults, chartErrors
    );
    successThemeCount++;
  }

  // Step 6: 出力
  const output = {
    generatedAt:        fetchedAt,
    source:             'appstore',
    method:             'itunes-rss (jp storefront, topfreeapplications + topgrossingapplications, limit=100)',
    mappingVersion,
    verifiedAt,
    windowDays,
    storefront,
    charts,
    feedLimit,
    mappedThemeCount:   themeIds.length,
    successCount:       successThemeCount,
    skippedCount:       themesSkipped.length,
    errorCount:         chartErrors.length,
    totalRequestCount:  chartResults.length + chartErrors.length,
    themesSkipped,
    themes,
    errors:             chartErrors,
    copyright:          feedRights,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');

  // サマリー
  console.log('──────────────  サマリー  ──────────────');
  console.log(`  マップ済みテーマ:   ${themeIds.length}`);
  console.log(`  取得成功:           ${successThemeCount}`);
  console.log(`  スキップ:           ${themesSkipped.length}`);
  console.log(`  チャート失敗:       ${chartErrors.length}`);
  console.log('');
  console.log('  テーマ別内訳:');
  for (const [themeId, env] of Object.entries(themes)) {
    const n = env.nativeMetrics;
    const label = themeId.padEnd(26);
    console.log(
      `    ${label} matched=${String(n.matchedAppCount).padStart(2)} ` +
      `bestRank=${String(n.bestRank || '-').padStart(3)} ` +
      `topFree=${String(n.topFreeMatchCount).padStart(2)} ` +
      `topGrossing=${String(n.topGrossingMatchCount).padStart(2)} ` +
      `weighted=${String(n.rankWeightedScore).padStart(4)}`
    );
  }
  if (themesSkipped.length > 0) {
    console.log('');
    console.log('  スキップテーマ (skippedReason):');
    for (const t of themesSkipped) {
      console.log(`    ${t.theme.padEnd(26)} [${t.reason}]`);
    }
  }
  if (chartErrors.length > 0) {
    console.log('');
    console.log('  チャートエラー:');
    for (const e of chartErrors) {
      const retry = e.retryable ? 'retryable' : 'fatal';
      console.log(`    - [${e.chart}] (${e.type}, ${retry}): ${e.message}`);
    }
  }
  console.log('');
  console.log(`  出力: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
