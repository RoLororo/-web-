// ============================================================================
// scripts/build-demands.mjs
//
// Demand Atlas — Phase 4-a: 需要データの統合とスコア算出
//
//   ■ 目的
//     Phase 1 (articles.json) + Phase 2 (demand-candidates.json) +
//     Phase 4-a 前段 (keyword-trends.json) を統合し、
//     フロント (mockDemands.js) と互換性のある data/demands.json を生成する。
//
//   ■ スコア式 (ユーザ指定)
//     score = 40 * newsVolume + 30 * growth + 20 * sourceDiversity + 10 * freshness
//     各要素は 0〜1 に正規化。合計は 0〜100。
//
//   ■ 存在しない情報を捏造しない (ユーザ指定)
//     - audience / problems / businessOpportunities → 空配列
//     - description → summary を流用 (捏造しない)
//     - breakdown → { 'ニュース': change } のみ (SNS/求人などは無いので入れない)
//     - confidence → 常に '参考レベル' (プロトタイプ段階の宣言)
//     - trendData → 実データが不足する期間は 0 で埋める
//     - growth 判定に必要な履歴が不足なら「データ不足」として neutral 扱い
//
//   ■ 使い方
//     npm run demands   (先に `npm run news`, `npm run themes`, `npm run trends`)
//
//   ■ 依存
//     - Node.js 18+ の標準機能のみ (追加パッケージなし)
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// パス
// ---------------------------------------------------------------------------

const __dirname   = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT   = resolve(__dirname, '..');
const ARTICLES    = resolve(REPO_ROOT, 'data', 'articles.json');
const CANDIDATES  = resolve(REPO_ROOT, 'data', 'demand-candidates.json');
const TRENDS      = resolve(REPO_ROOT, 'data', 'keyword-trends.json');
// 実験フェーズ (データ取得のみ)。存在すれば _wikipediaDetail として貼るだけで
// score / breakdown / ランキングには影響を与えない。ファイルが無ければ黙って
// スキップし、従来と完全に同一の出力になる。
const WIKI_PV     = resolve(REPO_ROOT, 'data', 'wikipedia-pageviews.json');
// 同じく実験フェーズ (Qiita)。存在すれば _qiitaDetail として貼るだけで
// score / breakdown / ランキングには影響を与えない。
const QIITA       = resolve(REPO_ROOT, 'data', 'qiita.json');
// 同じく実験フェーズ (App Store JP)。存在すれば _appstoreDetail として貼るだけ。
const APPSTORE    = resolve(REPO_ROOT, 'data', 'appstore.json');
// 同じく実験フェーズ (arXiv)。存在すれば _arxivDetail として貼るだけ。
const ARXIV       = resolve(REPO_ROOT, 'data', 'arxiv.json');

// canonical: 履歴確認・比較用 (git 追跡)
const OUTPUT         = resolve(REPO_ROOT, 'data', 'demands.json');
// mirror: Vite が build 時に dist/ にコピーする (フロントエンド配信用)
const OUTPUT_PUBLIC  = resolve(REPO_ROOT, 'public', 'data', 'demands.json');

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** newsVolume の飽和点 (根拠記事 + キーワードトレンド件数の合計) */
const VOLUME_SATURATION = 100;

/** sourceDiversity の飽和点 (ユニーク情報源数) */
const SOURCE_SATURATION = 6;

/** freshness を 0 にする最大日数 */
const FRESHNESS_MAX_DAYS = 30;

/** growth 判定の基準期間 (prior) に最低これだけ件数が無ければ「データ不足」 */
const GROWTH_MIN_PRIOR_SAMPLES = 5;

/** growth の change% の上下限 (RSS 一発取得では真の成長は測れないため保守的に頭打ち) */
const GROWTH_CHANGE_MIN = -80;
const GROWTH_CHANGE_MAX = 200;

/** 最新記事に含める evidence 上限 */
const EVIDENCE_LIMIT = 8;

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

/** 今日から N 日前までの YYYY-MM-DD の配列 (古い順) */
function daysBack(n) {
  const arr = [];
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    arr.push(isoDay(new Date(now.getTime() - i * DAY_MS)));
  }
  return arr;
}

// ---------------------------------------------------------------------------
// スコア要素の計算 (すべて 0〜1 に正規化して返す)
// ---------------------------------------------------------------------------

/**
 * newsVolume: そのテーマにマッチする記事数 + キーワードトレンドの総件数。
 * VOLUME_SATURATION で頭打ち。
 */
function computeNewsVolume(matchingArticles, keywordTrendTotal) {
  const total = matchingArticles + keywordTrendTotal;
  return Math.min(1, total / VOLUME_SATURATION);
}

/**
 * growth: 直近2日の件数を「その前5日の平均」から予想した件数と比較する
 * "バースト検出"型の指標。
 *
 * ⚠ なぜ 7日 vs 7日 ではないか
 *   Google ニュース RSS は 1 クエリあたり直近 ~100 件しか返さないため、
 *   ほぼ全件が直近 7 日に集中し、"前7日" はほとんど空になる。
 *   そのまま比較すると +7000% 級の偽急上昇を大量生産してしまう。
 *   多日間の履歴を積む仕組み (Phase 6 以降の GitHub Actions 等) が
 *   整うまでは、単一スナップショット内で測れる「直近の集中度」を
 *   change として採用する。
 *
 *   将来 keyword-trends を日次で蓄積するようになれば、
 *   ここを本来の N日 vs 前N日 比較に差し戻す。
 */
function computeGrowth(articlesByDate) {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  let recent2 = 0; // 直近 2 日 (今日含む)
  let prior5  = 0; // その前 5 日 (計 7 日窓)

  for (const [day, count] of Object.entries(articlesByDate)) {
    const d = new Date(day);
    if (Number.isNaN(d.getTime())) continue;
    const diffDays = Math.floor((now.getTime() - d.getTime()) / DAY_MS);
    if (diffDays < 0) continue;
    if (diffDays <= 1) recent2 += count;
    else if (diffDays <= 6) prior5 += count;
  }

  const hasEnoughData = prior5 >= GROWTH_MIN_PRIOR_SAMPLES;

  if (!hasEnoughData) {
    // 基準期間が薄い → 変化率不明として neutral を返す (捏造しない)
    return { value: 0.5, changePercent: 0, hasEnoughData: false, recent2, prior5 };
  }

  // 基準の日次平均を 2 日分に伸ばした期待値
  const expected2d = (prior5 / 5) * 2;
  let changePercent = Math.round(((recent2 - expected2d) / expected2d) * 100);
  // 上下限で頭打ち (RSS の 1 発取得で無理に大きい成長率を出さない)
  changePercent = Math.max(GROWTH_CHANGE_MIN, Math.min(GROWTH_CHANGE_MAX, changePercent));

  // 0〜1 スコアへ写像: +100% → 0.75, +200% → 1.0, -80% → 0.3
  const growthScore = Math.max(0, Math.min(1, 0.5 + changePercent / 400));

  return { value: growthScore, changePercent, hasEnoughData: true, recent2, prior5 };
}

/** sourceDiversity: ユニーク情報源数を SOURCE_SATURATION で頭打ち */
function computeSourceDiversity(matchingArticles) {
  const sources = new Set();
  for (const a of matchingArticles) {
    if (a && a.source) sources.add(a.source);
  }
  return {
    value: Math.min(1, sources.size / SOURCE_SATURATION),
    uniqueSources: sources.size,
  };
}

/** freshness: 直近ほど高い。FRESHNESS_MAX_DAYS で 0 に線形減衰 */
function computeFreshness(matchingArticles) {
  if (!matchingArticles.length) return 0;
  const now = Date.now();
  let sum = 0, n = 0;
  for (const a of matchingArticles) {
    if (!a || !a.publishedAt) continue;
    const ageDays = (now - Date.parse(a.publishedAt)) / DAY_MS;
    if (Number.isNaN(ageDays)) continue;
    sum += Math.max(0, 1 - ageDays / FRESHNESS_MAX_DAYS);
    n++;
  }
  return n ? sum / n : 0;
}

// ---------------------------------------------------------------------------
// ステータス判定 (ルールベース)
// ---------------------------------------------------------------------------

function deriveStatus(score, changePercent, hasEnoughData) {
  if (!hasEnoughData) return '安定'; // 過信しない
  if (changePercent >= 20 && score >= 40) return '急上昇';
  if (changePercent >= 5) return '成長中';
  if (changePercent <= -5) return '下降';
  return '安定';
}

// ---------------------------------------------------------------------------
// trendData 生成
// ---------------------------------------------------------------------------

/** 記事群を N 日分の日次カウントに整形 (古い順、不足日は 0) */
function buildDailyCounts(matchingArticles, days) {
  const buckets = daysBack(days);
  const index = new Map(buckets.map((d) => [d, 0]));
  for (const a of matchingArticles) {
    if (!a || !a.publishedAt) continue;
    const d = new Date(a.publishedAt);
    if (Number.isNaN(d.getTime())) continue;
    const day = isoDay(d);
    if (index.has(day)) index.set(day, index.get(day) + 1);
  }
  return buckets.map((d) => index.get(d));
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — 需要データ (demands.json) を統合生成');
  console.log('');

  // 3 つの入力を読み込む (Wikipedia PV / Qiita / App Store / arXiv は optional)
  const [articlesRaw, candidatesRaw, trendsRaw, wikiRaw, qiitaRaw, appstoreRaw, arxivRaw] = await Promise.all([
    readFile(ARTICLES,   'utf8').catch(() => null),
    readFile(CANDIDATES, 'utf8').catch(() => null),
    readFile(TRENDS,     'utf8').catch(() => null),
    readFile(WIKI_PV,    'utf8').catch(() => null),
    readFile(QIITA,      'utf8').catch(() => null),
    readFile(APPSTORE,   'utf8').catch(() => null),
    readFile(ARXIV,      'utf8').catch(() => null),
  ]);

  if (!articlesRaw) {
    console.error('✗ data/articles.json が見つかりません。`npm run news` を先に実行してください。');
    process.exit(1);
  }
  if (!candidatesRaw) {
    console.error('✗ data/demand-candidates.json が見つかりません。`npm run themes` を先に実行してください。');
    process.exit(1);
  }
  if (!trendsRaw) {
    console.warn('⚠  data/keyword-trends.json が見つかりません。');
    console.warn('   キーワードトレンドが無い状態でスコアを計算します (news volume 過小、growth データ不足扱い)。');
    console.warn('   本来は先に `npm run trends` を実行することを推奨します。');
    console.warn('');
  }

  const articles   = JSON.parse(articlesRaw);
  const candidates = JSON.parse(candidatesRaw).candidates || [];
  const trends     = trendsRaw ? JSON.parse(trendsRaw) : { keywords: {} };
  const trendsMap  = trends.keywords || {};
  // Wikipedia PV (実験フェーズ、optional、無ければ空)
  const wikiThemes = wikiRaw ? (JSON.parse(wikiRaw).themes || {}) : {};
  // Qiita (実験フェーズ、optional、無ければ空)
  const qiitaThemes = qiitaRaw ? (JSON.parse(qiitaRaw).themes || {}) : {};
  // App Store (実験フェーズ、optional、無ければ空)
  const appstoreThemes = appstoreRaw ? (JSON.parse(appstoreRaw).themes || {}) : {};
  // arXiv (実験フェーズ、optional、無ければ空)
  const arxivThemes = arxivRaw ? (JSON.parse(arxivRaw).themes || {}) : {};

  // 記事を id で lookup できるようにする
  const articleById = new Map(articles.map((a) => [a.id, a]));

  console.log(`   記事: ${articles.length} 件`);
  console.log(`   テーマ: ${candidates.length} 件`);
  console.log(`   トレンドキーワード: ${Object.keys(trendsMap).length} 件`);
  console.log(`   Wikipedia PV: ${Object.keys(wikiThemes).length} テーマ (実験・スコアに影響なし)`);
  console.log(`   Qiita:        ${Object.keys(qiitaThemes).length} テーマ (実験・スコアに影響なし)`);
  console.log(`   App Store:    ${Object.keys(appstoreThemes).length} テーマ (実験・スコアに影響なし)`);
  console.log(`   arXiv:        ${Object.keys(arxivThemes).length} テーマ (実験・スコアに影響なし)`);
  console.log('');

  const demands = [];

  for (const c of candidates) {
    // 根拠記事を lookup
    const evidenceArticles = (c.evidenceArticleIds || [])
      .map((id) => articleById.get(id))
      .filter(Boolean);

    // このテーマのキーワードトレンドを集約 (件数合計 / 日別カウント)
    let keywordTrendTotal = 0;
    const keywordTrendByDate = {};
    for (const kw of c.relatedKeywords || []) {
      const key = String(kw).trim();
      const kwData = trendsMap[key];
      if (!kwData) continue;
      keywordTrendTotal += kwData.totalItems || 0;
      for (const [day, count] of Object.entries(kwData.byDate || {})) {
        keywordTrendByDate[day] = (keywordTrendByDate[day] || 0) + count;
      }
    }

    // スコア要素
    const newsVolume     = computeNewsVolume(evidenceArticles.length, keywordTrendTotal);
    const growth         = computeGrowth(keywordTrendByDate);
    const diversity      = computeSourceDiversity(evidenceArticles);
    const freshness      = computeFreshness(evidenceArticles);

    // 合成スコア (0-100)
    const score = Math.max(0, Math.min(100, Math.round(
      40 * newsVolume +
      30 * growth.value +
      20 * diversity.value +
      10 * freshness
    )));

    const change  = growth.changePercent;
    const status  = deriveStatus(score, change, growth.hasEnoughData);

    // evidence 配列 (ニュースのみ、直近優先で上限)
    const evidence = evidenceArticles
      .slice()
      .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
      .slice(0, EVIDENCE_LIMIT)
      .map((a) => ({
        type: 'ニュース',
        title: a.title,
        confidence: 0.7,
        checkedAt: (a.publishedAt || '').slice(0, 10),
      }));

    // trendData: articles ベースの日次カウント (不足日は 0 埋め)
    const trendData = {
      '7d':  buildDailyCounts(evidenceArticles, 7),
      '30d': buildDailyCounts(evidenceArticles, 30),
      '90d': buildDailyCounts(evidenceArticles, 90),
    };

    // breakdown: 実データがあるのは "ニュース" のみ (捏造しない)
    // フロントの breakdownLabels[k] || k のフォールバックで "ニュース: +N%" と表示される
    const breakdown = { 'ニュース': change };

    // データ品質指標 (内部フィールド)
    const dataQuality = growth.hasEnoughData
      ? Math.round(((newsVolume + diversity.value + freshness) / 3) * 100) / 100
      : Math.round(((newsVolume + diversity.value + freshness) / 3 * 0.6) * 100) / 100;

    demands.push({
      // ── mockDemands.js 互換フィールド ──
      id:                    c.id,
      title:                 c.theme,
      category:              c.category,
      score,
      change,
      status,
      summary:               c.summary,
      description:           c.summary, // 別途の長文説明は無い → summary を流用 (捏造しない)
      audience:              [],        // ニュースだけからは正確に判定不能 → 空
      problems:              [],        // 同上
      evidence,
      businessOpportunities: [],        // 同上
      breakdown,
      sourceCount:           diversity.uniqueSources,
      confidence:            '参考レベル', // mockDemands と同じ文字列表現
      updatedAt:             new Date().toISOString(),
      trendData,

      // ── 内部フィールド (フロント無変更のまま参考として保存。表示には使われない) ──
      _dataQuality:          dataQuality,
      _hasEnoughGrowthData:  growth.hasEnoughData,
      _scoreBreakdown: {
        newsVolume:      Math.round(newsVolume      * 100) / 100,
        growth:          Math.round(growth.value    * 100) / 100,
        sourceDiversity: Math.round(diversity.value * 100) / 100,
        freshness:       Math.round(freshness       * 100) / 100,
        formula: 'score = 40*newsVolume + 30*growth + 20*sourceDiversity + 10*freshness',
      },
      _growthDetail: {
        recent2Days:  growth.recent2,
        prior5Days:   growth.prior5,
        window:       '直近2日 vs その前5日 (RSS 一発取得の中でのバースト検出)',
        note: growth.hasEnoughData
          ? `直近2日=${growth.recent2}件 / 前5日=${growth.prior5}件`
          : `データ不足 (前5日=${growth.prior5}件 < 閾値${GROWTH_MIN_PRIOR_SAMPLES})`,
      },
      _relatedKeywords:      c.relatedKeywords || [],
      _matchingArticleCount: evidenceArticles.length,
      _keywordTrendTotal:    keywordTrendTotal,
    });

    // ── Wikipedia PV (実験フェーズ・データ観測のみ) ──
    // fetch-wikipedia-pageviews.mjs が生成した情報を該当テーマに貼るだけで、
    // 上流で計算済みの score / breakdown / status / 並び順には一切影響しない。
    // 該当テーマに Wikipedia データが無ければ何もしない (=従来と完全同一の出力)。
    const wikiDetail = wikiThemes[c.id];
    if (wikiDetail) {
      const last = demands[demands.length - 1];
      last._wikipediaDetail = wikiDetail;
    }

    // ── Qiita (実験フェーズ・データ観測のみ) ──
    // Wikipedia と完全に同型。fetch-qiita.mjs が生成した情報を該当テーマに
    // 貼るだけで、score / breakdown / status / 順序には影響しない。
    // マッピング空 (senior-health / ai-regulation) のテーマには貼らない。
    const qiitaDetail = qiitaThemes[c.id];
    if (qiitaDetail) {
      const last = demands[demands.length - 1];
      last._qiitaDetail = qiitaDetail;
    }

    // ── App Store JP (実験フェーズ・データ観測のみ) ──
    // Qiita / Wikipedia と完全に同型。fetch-appstore.mjs が生成した情報を
    // 該当テーマに貼るだけで、score / breakdown / status / 順序には影響しない。
    // マッピング空テーマ (7 テーマ、skippedReasons 参照) には貼らない。
    const appstoreDetail = appstoreThemes[c.id];
    if (appstoreDetail) {
      const last = demands[demands.length - 1];
      last._appstoreDetail = appstoreDetail;
    }

    // ── arXiv (実験フェーズ・データ観測のみ) ──
    // 同型パターン。fetch-arxiv.mjs が生成した論文投稿量情報を貼るだけ。
    // 11 テーマすべてで検索式が定義されているため通常全テーマに付与される。
    const arxivDetail = arxivThemes[c.id];
    if (arxivDetail) {
      const last = demands[demands.length - 1];
      last._arxivDetail = arxivDetail;
    }
  }

  // スコア降順
  demands.sort((a, b) => b.score - a.score);

  const output = {
    generatedAt:          new Date().toISOString(),
    method:               'news-only signals (Phase 4-a)',
    formula:              'score = 40*newsVolume + 30*growth + 20*sourceDiversity + 10*freshness',
    disclaimer:           'ニュース信号のみによる暫定スコア。SNS・検索指数・求人などの他データ源は未統合。',
    totalArticles:        articles.length,
    totalKeywordsQueried: Object.keys(trendsMap).length,
    demandCount:          demands.length,
    demands,
  };

  // canonical に書き出し
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');

  // mirror (public/data) にも同じ内容を書き出す — Vite build で dist/ に運ばれる
  await mkdir(dirname(OUTPUT_PUBLIC), { recursive: true });
  await writeFile(OUTPUT_PUBLIC, JSON.stringify(output, null, 2) + '\n', 'utf8');

  // コンソール要約
  console.log('──────────────  需要スコア (score 降順)  ──────────────');
  for (const d of demands) {
    const bar = '█'.repeat(Math.max(1, Math.floor(d.score / 5)));
    const chg = d.change > 0 ? `+${d.change}%` : `${d.change}%`;
    const flag = d._hasEnoughGrowthData ? '' : ' (成長率データ不足)';
    console.log(`  ${String(d.score).padStart(3)} ${bar}`);
    console.log(`      ${d.title}  [${d.category}]  ${d.status}  ${chg}${flag}`);
  }
  console.log('────────────────────────────────────────────────');
  console.log(`  canonical: ${OUTPUT}`);
  console.log(`  mirror:    ${OUTPUT_PUBLIC}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
