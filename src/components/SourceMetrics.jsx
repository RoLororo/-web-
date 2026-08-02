// ============================================================================
// SourceMetrics — 情報源ごとの「実数」
//
//   ■ なぜ作るか（2026-07-30 実測）
//     demands.json には情報源ごとに 27 個の実数（nativeMetrics）が入っているが、
//     UI が参照しているフィールドは 142 中 93 で、残りは一度も表示されていない。
//     完全に不可視だったもの: NDL 書誌数 792 / GitHub 新規 repo 54・主要言語 /
//     arXiv 著者数 219・平均著者数 / Wikipedia の 7 日窓（865 → 1,812）など。
//
//     これらは既に demands.json に含まれているため、**表示しても転送量は増えない**。
//
//   ■ 表示しないもの
//     - 内部の計算値（rawRatio / medianRatio / sampleSize / isAuthorsSampled）
//       … ユーザーの判断に使えないため
//     - 値が null / undefined のもの … 「取れなかった」を数字に見せない
// ============================================================================

import { sourceDisplay, sourceColor } from '../services/sourceCatalog.js';

const num = (v) => (typeof v === 'number' ? v.toLocaleString() : null);
const day = (v) => (v ? String(v).slice(0, 10) : null);
const pct = (v) => (typeof v === 'number' ? `${v > 0 ? '+' : ''}${v}%` : null);

/**
 * 情報源ごとに「ユーザーが読める実数」を並べる。
 * 各 extract は { label, value } の配列を返す。value が null の項目は落とす。
 */
const SOURCE_FIGURES = {
  wikipedia: (d) => {
    const w = d._wikipediaDetail;
    if (!w) return null;
    // 取得に失敗した日は「0 回読まれた」ではなく「取れなかった」と書く。
    // 以前は失敗を 0 として保存していたため、実際には 2,787 PV ある
    // 認知症のページに「30 日の閲覧数 0」と出ていた（2026-08-02 実測）。
    if (w.fetchFailed) {
      return [{ label: '30 日の閲覧数', value: '取得できず' }];
    }
    return [
      { label: '30 日の閲覧数', value: num(w.totalPageviews30d) },
      { label: '直近 7 日',     value: num(w.totalPageviews7d) },
      { label: 'その前の 7 日', value: num(w.totalPageviewsPrior7d) },
      { label: '7 日比',        value: pct(w.growthPercent) },
      // articlesFetched は配列。num() は数値しか通さないので、
      // これまでこの行は一度も表示されていなかった（2026-08-02 実測）。
      { label: '対象記事',      value: num((w.articlesFetched || []).length) },
    ];
  },
  qiita: (d) => {
    const m = d._qiitaDetail?.nativeMetrics;
    if (!m) return null;
    return [
      { label: '記事',       value: num(m.articleCount) },
      { label: 'LGTM 合計',  value: num(m.lgtmSum) },
      { label: '投稿者',     value: num(m.uniqueAuthors) },
      { label: '最新投稿',   value: day(m.latestPublishedAt) },
    ];
  },
  arxiv: (d) => {
    const m = d._arxivDetail?.nativeMetrics;
    if (!m) return null;
    return [
      { label: '論文',       value: num(m.paperCount) },
      { label: '著者',       value: num(m.uniqueAuthors) },
      { label: '平均著者数', value: num(m.avgAuthorsPerPaper) },
      { label: '主分野',     value: m.primaryCategoryTop || null },
      { label: '最新投稿',   value: day(m.latestPaperPublished) },
    ];
  },
  appstore: (d) => {
    const m = d._appstoreDetail?.nativeMetrics;
    if (!m) return null;
    return [
      { label: '該当アプリ', value: num(m.matchedAppCount) },
      { label: '発行元',     value: num(m.uniquePublishers) },
      { label: '無料 top',   value: num(m.topFreeMatchCount) },
      { label: '売上 top',   value: num(m.topGrossingMatchCount) },
      { label: '最高順位',   value: typeof m.bestRank === 'number' ? `#${m.bestRank}` : null },
      { label: '平均順位',   value: typeof m.averageRank === 'number' ? `#${Math.round(m.averageRank)}` : null },
    ];
  },
  github: (d) => {
    const m = d._githubDetail?.nativeMetrics;
    if (!m) return null;
    return [
      { label: '新規リポジトリ', value: num(m.newRepoCount) },
      { label: 'star 合計',     value: num(m.topStarSum) },
      { label: '主要言語',      value: m.topLanguage || null },
      { label: '集計開始',      value: day(m.createdSince) },
    ];
  },
  ndl: (d) => {
    const m = d._ndlDetail?.nativeMetrics;
    if (!m) return null;
    return [{ label: '書誌', value: num(m.bibliographyCount) }];
  },
};

const ORDER = ['wikipedia', 'qiita', 'arxiv', 'github', 'appstore', 'ndl'];

export default function SourceMetrics({ demand }) {
  if (!demand) return null;

  const rows = ORDER.map((src) => {
    const figures = (SOURCE_FIGURES[src](demand) || []).filter((f) => f.value !== null);
    return figures.length ? { src, figures } : null;
  }).filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <div className="src-metrics">
      {rows.map(({ src, figures }) => (
        <div key={src} className="src-metrics-row">
          <div className="src-metrics-head">
            <span className="src-metrics-dot" style={{ background: sourceColor(src) }} />
            <span className="src-metrics-name">{sourceDisplay(src)}</span>
          </div>
          <dl className="src-metrics-figures">
            {figures.map((f) => (
              <div key={f.label} className="src-metrics-figure">
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
