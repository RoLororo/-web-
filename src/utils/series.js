// ============================================================================
// series — 詳細ページとカードで共有する「推移グラフの系列」の決定ロジック
//
//   ■ なぜ必要か（2026-07-30 実測）
//     グラフは `demand.trendData`（= ニュース記事の日次件数）を描いていたが、
//     非ゼロ率は 7d 26% / 30d 18% / 90d 6% で、y 軸の上限は 5。
//     remote-work と senior-health は 7 日スパークラインが全ゼロだった。
//     一方 `_wikipediaDetail.byDate` には 29 日連続・非ゼロ率 100% の
//     日次ページビューが全 10 テーマ分あり、UI からは一度も参照していなかった。
//
//   ■ 方針
//     - 主系列は Wikipedia の日次閲覧数。何の系列かを UI に明示する
//     - Wikipedia が無いテーマ（fallback データなど）はニュース件数に退避する
//     - 実データが存在しない期間のレンジは出さない（90 日タブは廃止）
//     - `trendData` は削除しない。副情報として保持する
// ============================================================================

/** 主系列の候補。上から順に、実データがあるものを採用する */
const SERIES_SOURCES = [
  {
    id: 'wikipedia',
    label: 'Wikipedia 日次閲覧数',
    unit: 'PV',
    extract: (demand) => {
      const byDate = demand?._wikipediaDetail?.byDate;
      if (!byDate) return null;
      const dates = Object.keys(byDate).sort();
      if (dates.length < 2) return null;
      return { dates, values: dates.map((d) => Number(byDate[d]) || 0) };
    },
  },
  {
    id: 'news',
    label: 'ニュース記事数（日次）',
    unit: '件',
    extract: (demand) => {
      const arr = demand?.trendData?.['30d'] || demand?.trendData?.['7d'];
      if (!Array.isArray(arr) || arr.length < 2) return null;
      // trendData は日付を持たないため、最終点を「今日」として逆算する
      const dates = arr.map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (arr.length - 1 - i));
        return d.toISOString().slice(0, 10);
      });
      return { dates, values: arr };
    },
  },
];

/**
 * テーマの推移系列を返す。
 * @returns {{id, label, unit, dates: string[], values: number[]} | null}
 */
export function trendSeries(demand) {
  for (const src of SERIES_SOURCES) {
    const got = src.extract(demand);
    if (got) return { id: src.id, label: src.label, unit: src.unit, ...got };
  }
  return null;
}

/** 系列の末尾 n 点を切り出す（n が系列より長ければ全部返す） */
export function sliceSeries(series, n) {
  if (!series) return null;
  if (!Number.isFinite(n) || n >= series.values.length) return series;
  return { ...series, dates: series.dates.slice(-n), values: series.values.slice(-n) };
}

/**
 * 選択できるレンジを、実データの長さから決める。
 * 7 日は常に、それより長い場合は「全期間」を実際の日数ラベルで出す。
 */
export function availableRanges(series) {
  if (!series) return [];
  const n = series.values.length;
  if (n <= 7) return [{ days: n, label: `${n}日間` }];
  return [
    { days: 7, label: '7日間' },
    { days: n, label: `${n}日間` },
  ];
}

/** グラフの凡例に出す「いつからいつまでか」 */
export function seriesPeriodLabel(series) {
  if (!series || series.dates.length === 0) return '';
  const fmt = (iso) => iso.slice(5).replace('-', '/');
  return `${fmt(series.dates[0])} → ${fmt(series.dates[series.dates.length - 1])}`;
}
