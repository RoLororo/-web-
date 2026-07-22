// ============================================================================
// scripts/fetch-wikipedia-pageviews.mjs
//
// Demand Atlas — Wikipedia Pageviews 取得 (実験フェーズ / データ収集のみ)
//
//   ■ 目的
//     ja.wikipedia の Pageviews API から、テーマに対応する記事の日次 PV を
//     取得して data/wikipedia-pageviews.json に保存する。
//
//   ■ このスクリプトが やること
//     - テーマ ID -> Wikipedia 記事名 のマッピング (WIKI_MAPPING) を反復
//     - 各記事について直近 WINDOW_DAYS 日の日次 PV を取得
//     - テーマ単位に集約 (複数記事は合算) して byDate に格納
//     - totalPageviews30d / 7d / prior7d / growthPercent を計算
//     - 失敗しても他記事の処理は継続 (per-article try/catch)
//     - 結果を data/wikipedia-pageviews.json に保存
//
//   ■ このスクリプトが やらないこと (今回スコープ外)
//     - 需要スコアへの反映 (build-demands.mjs 側で _wikipediaDetail の
//       内部フィールドを付与するだけ。score / breakdown は一切触らない)
//     - UI 表示 (フロントエンド無変更)
//     - 過去 PV データのマージ (毎回上書き。時系列を残したい場合は
//       daily-update workflow の git commit 履歴を参照)
//
//   ■ 使い方
//     npm run wiki
//
//   ■ 依存
//     - Node.js 18+ の標準 fetch のみ (追加パッケージなし)
// ============================================================================

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

/** 取得対象期間 (日数) */
const WINDOW_DAYS = 30;

/** 1 リクエストのタイムアウト */
const REQUEST_TIMEOUT_MS = 15000;

/** 記事間の待機時間 (Wikimedia に優しく) */
const RATE_LIMIT_MS = 200;

/** Wikipedia REST API のベース URL (ja / all-access / user agent) */
const PV_API_BASE =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ja.wikipedia/all-access/user';

/** Wikimedia の礼儀として明示的な User-Agent を送る */
const USER_AGENT =
  'DemandAtlas/0.1 (+https://demand-atlas.vercel.app; research/personal-use)';

/**
 * テーマ ID → Wikipedia 記事名 (ja) のマッピング
 *
 *   - 記事名は ja.wikipedia の URL 末尾と同じ表記 (スペースはアンダースコア)
 *   - 1 テーマに複数記事を割り当ててよい (合算される)
 *   - 存在しない記事は API が 404 を返すので errors[] に記録される
 *   - 実行結果を見て記事名を調整するのが前提
 */
const WIKI_MAPPING = {
  'ai-business-automation': ['生成的人工知能', 'ChatGPT'],
  'ai-coding':              ['GitHub_Copilot'],
  'ai-content-generation':  ['Stable_Diffusion'],
  'ai-hardware':            ['NVIDIA'],
  'infrastructure-outages': ['Amazon_Web_Services'],
  'security-breach':        ['ランサムウェア'],
  'payment-troubles':       ['PayPay'],
  'home-server-selfhost':   ['自宅サーバ'],
  'remote-work':            ['テレワーク'],
  'senior-health':          ['認知症'],
  'ai-regulation':          ['人工知能'],
};

// ---------------------------------------------------------------------------
// パス
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUTPUT    = resolve(REPO_ROOT, 'data', 'wikipedia-pageviews.json');

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Date -> 'YYYYMMDD' (UTC) */
function apiDay(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

/** Date -> 'YYYY-MM-DD' (UTC) */
function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

/** Pageviews API のタイムスタンプ 'YYYYMMDDHH' -> 'YYYY-MM-DD' */
function apiTimestampToIso(ts) {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

/** Wikipedia REST API はスラッシュとクエスチョンを含む記事名は encodeURIComponent が必要 */
function encodeArticle(name) {
  return encodeURIComponent(name);
}

/** Wikimedia PV API は "昨日" までしかデータを持たない。今日を含めない */
function computeWindow(days) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 1); // yesterday (UTC)
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  return { start, end };
}

// ---------------------------------------------------------------------------
// フェッチ (1 記事)
// ---------------------------------------------------------------------------

/**
 * 1 記事の日次 PV を取得する。
 * 戻り値: { byDate: { 'YYYY-MM-DD': views }, itemCount }
 * 失敗時: throw
 */
async function fetchArticlePV(articleName, start, end) {
  const url = `${PV_API_BASE}/${encodeArticle(articleName)}/daily/${apiDay(start)}/${apiDay(end)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 404: 記事が存在しない or 期間内に PV データがない
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const items = Array.isArray(json.items) ? json.items : [];

  const byDate = {};
  for (const it of items) {
    if (!it || !it.timestamp) continue;
    const day = apiTimestampToIso(String(it.timestamp));
    byDate[day] = (byDate[day] || 0) + (Number(it.views) || 0);
  }

  return { byDate, itemCount: items.length };
}

// ---------------------------------------------------------------------------
// テーマ集約
// ---------------------------------------------------------------------------

/**
 * 1 テーマにマップされた全記事を取得し、日次 PV を合算する。
 * 記事単位で失敗しても他は継続、失敗リストは呼び出し側に返す。
 */
async function fetchThemePV(themeId, articleNames, start, end) {
  const themeByDate = {}; // 'YYYY-MM-DD' -> views
  const successArticles = [];
  const failedArticles  = []; // { article, error }

  for (const article of articleNames) {
    try {
      const { byDate } = await fetchArticlePV(article, start, end);
      successArticles.push(article);
      for (const [day, views] of Object.entries(byDate)) {
        themeByDate[day] = (themeByDate[day] || 0) + views;
      }
    } catch (err) {
      failedArticles.push({
        article,
        error: err && err.message ? err.message : String(err),
      });
    }
    // 記事間で軽くスリープ
    await sleep(RATE_LIMIT_MS);
  }

  return { themeByDate, successArticles, failedArticles };
}

// ---------------------------------------------------------------------------
// 集計 (期間別合計と成長率)
// ---------------------------------------------------------------------------

function summarize(themeByDate) {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  let total30d = 0;
  let recent7 = 0;
  let prior7  = 0;

  for (const [day, views] of Object.entries(themeByDate)) {
    const d = new Date(day);
    if (Number.isNaN(d.getTime())) continue;
    const diffDays = Math.floor((now.getTime() - d.getTime()) / DAY_MS);
    if (diffDays < 0) continue;
    total30d += views;
    if (diffDays >= 1 && diffDays <= 7)       recent7 += views; // 直近 7 日 (昨日から 7 日)
    else if (diffDays >= 8 && diffDays <= 14) prior7  += views; // その前 7 日
  }

  let growthPercent = null;
  if (prior7 > 0) {
    growthPercent = Math.round(((recent7 - prior7) / prior7) * 100);
  }

  return { total30d, recent7, prior7, growthPercent };
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — Wikipedia Pageviews 取得 (実験)');
  console.log(`   出力: ${OUTPUT}`);

  const { start, end } = computeWindow(WINDOW_DAYS);
  console.log(`   期間: ${isoDay(start)} 〜 ${isoDay(end)} (${WINDOW_DAYS} 日)`);
  console.log(`   対象テーマ: ${Object.keys(WIKI_MAPPING).length} 件`);
  console.log('');

  const fetchedAt = new Date().toISOString();
  const themes = {};        // themeId -> detail
  const errorsAll = [];     // { theme, article, error }
  let successThemeCount = 0;

  const themeIds = Object.keys(WIKI_MAPPING);
  for (let i = 0; i < themeIds.length; i++) {
    const themeId = themeIds[i];
    const articles = WIKI_MAPPING[themeId];
    const label = `  [${i + 1}/${themeIds.length}] ${themeId}`;
    process.stdout.write(label.padEnd(48));

    const { themeByDate, successArticles, failedArticles } =
      await fetchThemePV(themeId, articles, start, end);

    for (const f of failedArticles) {
      errorsAll.push({ theme: themeId, article: f.article, error: f.error });
    }

    const hasAnyData = Object.keys(themeByDate).length > 0;
    if (!hasAnyData) {
      console.log(`✗ 全記事失敗 (${articles.join(', ')})`);
      themes[themeId] = {
        articles,
        articlesFetched: successArticles,
        articlesFailed:  failedArticles.map((f) => f.article),
        totalPageviews30d:      0,
        totalPageviews7d:       0,
        totalPageviewsPrior7d:  0,
        growthPercent:          null,
        byDate:                 {},
        fetchedAt,
      };
      continue;
    }

    const s = summarize(themeByDate);
    successThemeCount++;

    const growthStr =
      s.growthPercent === null ? 'n/a' :
      s.growthPercent >= 0 ? `+${s.growthPercent}%` : `${s.growthPercent}%`;

    console.log(`✓ 30d=${s.total30d.toLocaleString()} PV, 7d成長=${growthStr}`);

    themes[themeId] = {
      articles,
      articlesFetched: successArticles,
      articlesFailed:  failedArticles.map((f) => f.article),
      totalPageviews30d:      s.total30d,
      totalPageviews7d:       s.recent7,
      totalPageviewsPrior7d:  s.prior7,
      growthPercent:          s.growthPercent,
      byDate:                 themeByDate,
      fetchedAt,
    };
  }

  const output = {
    generatedAt:      fetchedAt,
    method:           'wikipedia-pageviews-api (ja, per-article daily, user, all-access)',
    windowDays:       WINDOW_DAYS,
    windowStart:      isoDay(start),
    windowEnd:        isoDay(end),
    mappedThemeCount: themeIds.length,
    successCount:     successThemeCount,
    errorCount:       errorsAll.length,
    themes,
    errors:           errorsAll,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log('');
  console.log('──────────────  サマリー  ──────────────');
  console.log(`  マップ済みテーマ: ${themeIds.length}`);
  console.log(`  取得成功:         ${successThemeCount}`);
  console.log(`  記事失敗:         ${errorsAll.length}`);
  if (errorsAll.length > 0) {
    console.log('  失敗記事:');
    for (const e of errorsAll) {
      console.log(`    - [${e.theme}] ${e.article} : ${e.error}`);
    }
  }
  console.log(`  出力: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
