// ============================================================================
// demandService.js
//
// アプリのすべての「データ取得」はこのファイル経由で行う。
//
//   ■ 実データ接続
//     モジュール読み込み時に /data/demands.json を fetch。
//     取得成功: DEMANDS = payload.demands。
//     取得失敗: mockDemands.js を dynamic import して fallback。
//
//   ■ Dynamic import の理由 (2026-08 リファクタ)
//     旧: static import → production bundle に MOCK_DEMANDS (25KB src / ~5KB
//         gzip) が常時含まれる。real fetch が成功する本番では完全に dead
//         weight。
//     新: fallback 発火時のみ dynamic import。bundle 減量。
//     カテゴリ定数は data/categories.js に分離 (常に必要な軽量部)。
//
//   ■ Cache-busting
//     data/demands.json は Vercel CDN + browser cache で無限保持されるため
//     ?v=<buildTime> を付けて更新を確実に反映する。__BUILD_ID__ は
//     vite.config.js で define されている (現在時刻)。ローカル dev では
//     undefined なので付与しない。
// ============================================================================

import { CATEGORIES, CATEGORY_DESCRIPTIONS } from '../data/categories.js';

// ---------------------------------------------------------------------------
// 実データの読み込み (モジュール初期化時に 1 回だけ)
// ---------------------------------------------------------------------------

/** 実際に使う需要データ配列。fetch 成功で上書き、失敗時は mock を dynamic import。 */
let DEMANDS = [];

/** データソースの識別。'real' / 'mock' / 'empty'。デバッグや将来の UI ヒント用。 */
let SOURCE = 'empty';

/** demands.json の generatedAt (ISO string) — UI の「最終更新」表示等に使う */
let GENERATED_AT = null;

/** payload.totalArticles — 直近 30 日で観測した実ニュース記事の総数 (Home Hero 統計用) */
let TOTAL_ARTICLES = 0;

/** build-time version (vite.config で define)。未設定なら空 (dev 環境)。 */
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : '';

async function loadRealDemands() {
  try {
    // BASE_URL は Vite の base (未指定なら '/') を反映するので subpath デプロイ対応
    // ?v= で CDN cache を build 毎に無効化 (dev では空文字なので効果なし)
    const url = `${import.meta.env.BASE_URL}data/demands.json${BUILD_ID ? '?v=' + BUILD_ID : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const payload = await res.json();
    if (!payload || !Array.isArray(payload.demands) || payload.demands.length === 0) {
      throw new Error('demands array is empty or malformed');
    }

    DEMANDS = payload.demands;
    SOURCE  = 'real';
    GENERATED_AT = payload.generatedAt || null;
    TOTAL_ARTICLES = Number.isFinite(payload.totalArticles) ? payload.totalArticles : 0;
    // eslint-disable-next-line no-console
    console.info(
      `[demandService] real data loaded (${DEMANDS.length} items, generatedAt=${payload.generatedAt || 'unknown'})`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[demandService] real data unavailable, dynamic-importing mockDemands: ${err && err.message ? err.message : err}`
    );
    // dynamic import で mockDemands をこの時だけ読む (production bundle には含めない)
    try {
      const mod = await import('../data/mockDemands.js');
      DEMANDS = mod.MOCK_DEMANDS;
      SOURCE  = 'mock';
    } catch (importErr) {
      // eslint-disable-next-line no-console
      console.error('[demandService] mock fallback also failed:', importErr);
      DEMANDS = [];
      SOURCE  = 'empty';
    }
  }
}

// トップレベル await — ページの import 解決前に完了させる
await loadRealDemands();

// ---------------------------------------------------------------------------
// 公開 API (シグネチャは Phase 4 以前と完全に同じ — ページ側の変更不要)
// ---------------------------------------------------------------------------

/** データソースを取得 ('real' / 'mock')。将来のデバッグ表示等で使う用。 */
export function getDataSource() {
  return SOURCE;
}

/** demands.json の generatedAt (ISO string or null)。UI の最終更新表示等で使う。 */
export function getGeneratedAt() {
  return GENERATED_AT;
}

/** 直近 30 日で観測した実ニュース記事の総数。Home Hero 統計で使う。 */
export function getTotalArticles() {
  return TOTAL_ARTICLES;
}

/** 全需要を取得（ランキング用に score 降順） */
export function getDemands() {
  return [...DEMANDS].sort((a, b) => b.score - a.score);
}

/** id で1件取得 */
export function getDemandById(id) {
  return DEMANDS.find((d) => d.id === id) || null;
}

/** カテゴリー一覧 (カテゴリマスタは常に mockDemands 由来) */
export function getCategories() {
  return CATEGORIES;
}

/** カテゴリーの説明を取得 */
export function getCategoryDescription(name) {
  return CATEGORY_DESCRIPTIONS[name] || '';
}

/** 急上昇テーマ（change 降順、上位のみ） */
export function getTrendingDemands(limit = 4) {
  return [...DEMANDS]
    .sort((a, b) => b.change - a.change)
    .slice(0, limit);
}

/**
 * 1 テーマの検索対象テキストを作る。
 *
 * ■ なぜ広げたか（2026-08-02 実測）
 *   旧実装は title + summary + category の 3 つだけで、全 15 テーマ合わせて
 *   **638 字**しか検索できなかった（ページに出ている本文は 120,511 字）。
 *   結果として、そのテーマ自身のページに載っている語で検索しても
 *   見つからない状態だった:
 *     - テーマ定義語 228 語のうち **165 語 (72%)** で、そのテーマが出ない
 *     - 「ChatGPT」「マンション」「エアコン」「中学受験」「在宅勤務」は 0 件
 *   情報を増やしても、到達できなければ無いのと同じなので対象を広げる。
 *
 * ■ 何を入れるか
 *   「そのテーマのページを見れば書いてある語」に限る。
 *   ページに出ていない内部計算値は入れない（検索でヒットしても
 *   なぜ出たのか説明できないため）。
 *
 * ■ 実測（638 字 → 10,991 字 / 17.2 倍）
 *   定義語で自分が出ない語: 165 → **0**
 *   1 語あたり平均ヒット: 0.4 → 1.5 テーマ（全 15 テーマ中。絞り込みとして健全）
 */
function searchHaystack(d) {
  // 空文字もキャッシュ済みとして扱う。`if (d.__haystack)` だと
  // 空文字のとき毎回 defineProperty に入り、2 回目で TypeError になる。
  if (Object.prototype.hasOwnProperty.call(d, '__haystack')) return d.__haystack;
  const parts = [
    d.title, d.summary, d.category,
    ...(d._searchTerms || []),        // テーマを定義している語（hot + warm）
    ...(d._relatedKeywords || []),    // 実際にヒットした語
    ...(d.audience || []),
    ...(d.problems || []),
    ...(d.evidence || []).map((e) => e.title || ''),
    ...(d.businessOpportunities || []).map((o) => `${o.title || ''} ${o.desc || ''}`),
    d._insights?.verdict?.label || '',
  ];
  // 1 テーマにつき 1 回だけ作って使い回す（キーストロークごとに再構築しない）
  const built = parts.join(' ').toLowerCase();
  // enumerable: false → JSON.stringify や {...d} に混ざらない
  // configurable: true → 万一の再定義でも落ちない
  try {
    Object.defineProperty(d, '__haystack', { value: built, enumerable: false, configurable: true });
  } catch {
    // 凍結されたオブジェクトなら諦めてキャッシュしない（検索自体は動く）
  }
  return built;
}

/**
 * 需要探索用のフィルタ・並び替え。
 * options: { keyword, category, status, stage, sort }
 * stage: '' | 'emerging' | 'parallel' | 'mainstream' — 需要ステージで絞り込む
 */
export function demandStageOf(d) {
  return d?._insights?.demandStage || null;
}

export function searchDemands(options = {}) {
  const { keyword = '', category = '', status = '', stage = '', sort = 'score' } = options;
  let list = [...DEMANDS];

  if (keyword.trim()) {
    const k = keyword.trim().toLowerCase();
    list = list.filter((d) => searchHaystack(d).includes(k));
  }
  if (category) list = list.filter((d) => d.category === category);
  if (status)   list = list.filter((d) => d.status === status);
  if (stage)    list = list.filter((d) => demandStageOf(d)?.stage === stage);

  const lead = (d) => demandStageOf(d)?.leadScore ?? -Infinity;
  switch (sort) {
    case 'change':
      list.sort((a, b) => b.change - a.change);
      break;
    case 'updated':
      list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      break;
    case 'lead':
      // 研究・開発が世間より先行している順。同点はスコアで割る。
      list.sort((a, b) => (lead(b) - lead(a)) || (b.score - a.score));
      break;
    case 'score':
    default:
      list.sort((a, b) => b.score - a.score);
  }

  return list;
}

/**
 * 現在の絞り込み条件下での需要ステージ別テーマ数。
 * Explore のステージチップに実数を出すために使う（stage 条件は無視して数える）。
 */
export function stageCounts(options = {}) {
  const base = searchDemands({ ...options, stage: '', sort: 'score' });
  const counts = { all: base.length, emerging: 0, parallel: 0, mainstream: 0 };
  for (const d of base) {
    const s = demandStageOf(d)?.stage;
    if (s && counts[s] != null) counts[s] += 1;
  }
  return counts;
}

/** カテゴリー別のサマリー（一覧画面用） */
export function getCategorySummaries() {
  return CATEGORIES.map((name) => {
    const items = DEMANDS.filter((d) => d.category === name);
    const avgChange = items.length
      ? items.reduce((sum, d) => sum + d.change, 0) / items.length
      : 0;
    return {
      name,
      description: CATEGORY_DESCRIPTIONS[name],
      count: items.length,
      avgChange: Math.round(avgChange * 10) / 10,
      topDemand: items.sort((a, b) => b.score - a.score)[0] || null,
    };
  });
}
