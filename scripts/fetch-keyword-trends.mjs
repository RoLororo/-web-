// ============================================================================
// scripts/fetch-keyword-trends.mjs
//
// Demand Atlas — Phase 4-a (前段): キーワード別 Google ニュース RSS 取得
//
//   ■ 目的
//     data/demand-candidates.json に含まれる各テーマの relatedKeywords を
//     使って Google ニュース RSS を検索し、キーワード単位の「話題性」の
//     生データを収集する。有料 API・API キー不要・追加依存なし
//     (rss-parser は既導入)。
//
//   ■ このスクリプトが やること
//     - demand-candidates.json から全テーマの relatedKeywords を集める
//     - 重複除去・トリム・空文字除外
//     - キーワードごとに Google ニュース RSS を叩き、日付別・情報源別に集計
//     - 失敗しても他キーワードの処理は継続、末尾で成功/失敗を表示
//     - 結果を data/keyword-trends.json に保存
//
//   ■ このスクリプトが やらないこと (Phase 4-a スコープ外)
//     - Google Trends / pytrends / 検索指数 API の使用
//     - Wikipedia Pageviews (今回スコープ外)
//     - 需要スコアの計算 (build-demands.mjs の担当)
//     - フロントエンドへの反映
//
//   ■ 使い方
//     npm run trends
//
//   ■ 依存
//     - rss-parser (既導入)
//     - Node.js 18+ の標準機能のみ
// ============================================================================

import Parser from 'rss-parser';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

/** キーワード間の待機時間 (Google に優しく) */
const RATE_LIMIT_MS = 800;

/** 1 リクエストのタイムアウト */
const FEED_TIMEOUT_MS = 15000;

/** Google ニュース RSS の検索エンドポイント (日本語) */
const NEWS_RSS_BASE = 'https://news.google.com/rss/search';
const NEWS_RSS_QS   = 'hl=ja&gl=JP&ceid=JP:ja';

/** キーワード長の下限 (短すぎるとノイズが多い) */
const MIN_KEYWORD_LEN = 2;

// 出力先を絶対パスで解決
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const INPUT     = resolve(REPO_ROOT, 'data', 'demand-candidates.json');
const OUTPUT    = resolve(REPO_ROOT, 'data', 'keyword-trends.json');

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Date → 'YYYY-MM-DD' (UTC) */
function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

function buildRssUrl(keyword) {
  const q = encodeURIComponent(keyword);
  return `${NEWS_RSS_BASE}?q=${q}&${NEWS_RSS_QS}`;
}

// rss-parser の User-Agent はデフォルトでも動くが、明示しておくと安心
const parser = new Parser({
  timeout: FEED_TIMEOUT_MS,
  headers: {
    'User-Agent': 'DemandAtlas/0.1 (+https://demand-atlas.local; personal-research)',
    Accept: 'application/rss+xml, application/xml, text/xml',
  },
});

// ---------------------------------------------------------------------------
// フィード取得
// ---------------------------------------------------------------------------

/** 1 キーワードの RSS を取得し、日付別・情報源別に集計 */
async function fetchKeywordTrend(keyword) {
  const url = buildRssUrl(keyword);
  const parsed = await parser.parseURL(url);
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  const byDate  = {}; // { 'YYYY-MM-DD': count }
  const sources = {}; // { source name: count }

  for (const it of items) {
    // 日付集計
    const iso = it.isoDate || it.pubDate;
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        const day = isoDay(d);
        byDate[day] = (byDate[day] || 0) + 1;
      }
    }
    // 情報源集計 (Google News RSS は <source> 要素に配信元名が入る)
    const src =
      (it.source && (it.source._ || it.source.name)) ||
      it.creator ||
      'unknown';
    sources[src] = (sources[src] || 0) + 1;
  }

  return {
    fetchedAt: new Date().toISOString(),
    query: keyword,
    totalItems: items.length,
    byDate,
    sources,
  };
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — キーワード別 Google ニュース RSS 取得');
  console.log(`   入力: ${INPUT}`);
  console.log(`   出力: ${OUTPUT}`);

  // 入力読み込み
  const raw = await readFile(INPUT, 'utf8').catch(() => null);
  if (!raw) {
    console.error('✗ data/demand-candidates.json が見つかりません。');
    console.error('  先に `npm run themes` を実行してください。');
    process.exit(1);
  }
  const parsed = JSON.parse(raw);
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  if (candidates.length === 0) {
    console.error('✗ demand-candidates.json にテーマが 1 件もありません。');
    process.exit(1);
  }

  // 全キーワードを集めて正規化・重複排除
  const keywordSet = new Set();
  for (const c of candidates) {
    for (const kw of c.relatedKeywords || []) {
      const cleaned = String(kw).trim();
      if (cleaned.length >= MIN_KEYWORD_LEN) keywordSet.add(cleaned);
    }
  }
  const keywords = [...keywordSet];
  console.log(`   対象テーマ: ${candidates.length} 件`);
  console.log(`   ユニークキーワード: ${keywords.length} 件`);
  console.log(`   レート制限: ${RATE_LIMIT_MS}ms / リクエスト`);
  console.log('');

  // 順次フェッチ
  const result = {};
  const errors = [];

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const label = `  [${i + 1}/${keywords.length}] ${kw}`;
    process.stdout.write(label.padEnd(48));
    try {
      const data = await fetchKeywordTrend(kw);
      result[kw] = data;
      console.log(`✓ ${data.totalItems}件`);
    } catch (err) {
      errors.push({ keyword: kw, error: err && err.message ? err.message : String(err) });
      console.log(`✗ 失敗: ${err.message || err}`);
    }
    // 最後以外はスリープ
    if (i < keywords.length - 1) await sleep(RATE_LIMIT_MS);
  }

  // 出力オブジェクト
  const output = {
    generatedAt:  new Date().toISOString(),
    method:       'google-news-rss (per-keyword search feed)',
    rateLimitMs:  RATE_LIMIT_MS,
    keywordCount: keywords.length,
    successCount: Object.keys(result).length,
    errorCount:   errors.length,
    keywords:     result,
    errors,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');

  // サマリー
  console.log('');
  console.log('──────────────  サマリー  ──────────────');
  console.log(`  成功: ${output.successCount} / ${output.keywordCount}`);
  console.log(`  失敗: ${output.errorCount}`);
  if (errors.length > 0) {
    console.log('  失敗したキーワード:');
    for (const e of errors) console.log(`    - ${e.keyword}: ${e.error}`);
  }
  console.log(`  出力ファイル: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
