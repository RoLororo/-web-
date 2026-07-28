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
 * 需要探索用のフィルタ・並び替え。
 * options: { keyword, category, status, sort }
 */
export function searchDemands(options = {}) {
  const { keyword = '', category = '', status = '', sort = 'score' } = options;
  let list = [...DEMANDS];

  if (keyword.trim()) {
    const k = keyword.trim().toLowerCase();
    list = list.filter((d) =>
      d.title.toLowerCase().includes(k) ||
      d.summary.toLowerCase().includes(k) ||
      d.category.toLowerCase().includes(k)
    );
  }
  if (category) list = list.filter((d) => d.category === category);
  if (status)   list = list.filter((d) => d.status === status);

  switch (sort) {
    case 'change':
      list.sort((a, b) => b.change - a.change);
      break;
    case 'updated':
      list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      break;
    case 'score':
    default:
      list.sort((a, b) => b.score - a.score);
  }

  return list;
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
