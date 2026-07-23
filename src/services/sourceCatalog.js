// ============================================================================
// sourceCatalog — 情報源メタデータの単一 source of truth
//
//   ■ 目的
//     全 UI コンポーネント (SourceTrends / Rankings / Changes / WhatsNew /
//     TodaysMovers / DemandCard 等) が参照する「情報源の見た目と説明」を
//     ここに集約する。
//     新ソース追加時は SOURCE_METADATA に 1 エントリ追加するだけで
//     全 UI に反映される (Open/Closed principle への部分適合)。
//
//   ■ この catalog の責務
//     - displayName: UI での表示名 (日本語)
//     - color:       グラフや chip の色 (var(--...) or #hex)
//     - unit:        値の単位 (「記事」「閲覧」等)
//     - description: 短い説明 (tooltip 等で使用)
//     - stability:   'stable' | 'unstable' | 'experimental'
//                    unstable なら UI 側で注意表示を出す (Wikipedia の
//                    totalPageviews30d が日ごとに大きく変動する既知問題を
//                    ユーザーに伝える)
//
//   ■ 未登録ソースへのフォールバック
//     source_id をそのまま displayName に、色は var(--text-3) に。
//     新ソース追加後にここへ登録し忘れても最低限機能する。
// ============================================================================

export const SOURCE_METADATA = {
  qiita: {
    displayName: 'Qiita',
    color:       'var(--green-bright)',
    unit:        '記事',
    description: '日本のエンジニアが Qiita に投稿した技術記事の量と反応 (LGTM)',
    stability:   'stable',
  },
  wikipedia: {
    displayName: 'Wikipedia',
    color:       '#7c9bff',
    unit:        '閲覧',
    description: 'Wikipedia 日本語版のページビュー (総 30 日、日毎に変動しやすい)',
    // Wikipedia の totalPageviews30d は各記事の PV 合算のため、
    // 1 記事の欠損で総量が大きく振れる既知の性質。UI 側で警告表示。
    stability:   'unstable',
  },
  appstore: {
    displayName: 'App Store JP',
    color:       '#ff9c66',
    unit:        'アプリ',
    description: 'iOS App Store 日本ストアの top-free / top-grossing ランキング',
    stability:   'stable',
  },
  arxiv: {
    displayName: 'arXiv',
    color:       '#c58aff',
    unit:        '論文',
    description: 'arXiv (プレプリント論文) の投稿数と著者数',
    stability:   'stable',
  },
};

/** 未登録 source の共通フォールバック値 */
const FALLBACK = {
  displayName: null, // caller が source id をそのまま出す
  color:       'var(--text-3)',
  unit:        '',
  description: '',
  stability:   'experimental',
};

export function getSourceMeta(sourceId) {
  return SOURCE_METADATA[sourceId] || FALLBACK;
}

export function sourceDisplay(sourceId) {
  const m = SOURCE_METADATA[sourceId];
  return (m && m.displayName) || sourceId;
}

export function sourceColor(sourceId) {
  const m = SOURCE_METADATA[sourceId];
  return (m && m.color) || FALLBACK.color;
}

export function sourceUnit(sourceId) {
  const m = SOURCE_METADATA[sourceId];
  return (m && m.unit) || '';
}

export function sourceIsUnstable(sourceId) {
  const m = SOURCE_METADATA[sourceId];
  return m ? m.stability === 'unstable' : false;
}

// ---------------------------------------------------------------------------
// metric の共通ラベル (source をまたぐ共通 metrics 側)
// ---------------------------------------------------------------------------

export const METRIC_LABELS = {
  volume:           '量',
  engagement:       '反応',
  contributors:     '参加者',
  latestActivityAt: '最新活動',
};

export function metricLabel(metricKey) {
  return METRIC_LABELS[metricKey] || metricKey;
}
