// ============================================================================
// DemandDetail — 需要テーマの詳細
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import TrendChart from '../components/TrendChart.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import FavoriteButton from '../components/FavoriteButton.jsx';
import AnimatedNumber from '../components/AnimatedNumber.jsx';
import FoxMark from '../components/FoxMark.jsx';
import SourceTrends from '../components/SourceTrends.jsx';
import SourceObservations from '../components/SourceObservations.jsx';
import SourceMetrics from '../components/SourceMetrics.jsx';
import InsightsPanel from '../components/InsightsPanel.jsx';
import { getDemandById } from '../services/demandService.js';
import { changeClass, formatChange, formatDateTime } from '../utils/format.js';
import { trendSeries, sliceSeries, availableRanges, seriesPeriodLabel } from '../utils/series.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { useSeo, breadcrumbJsonLd } from '../utils/useSeo.js';
import { SITE_URL, SITE_NAME, NEWS_FEED_COUNT, NEWS_DIVERSITY_SATURATION } from '../config/site.js';
import { toast } from '../utils/toast.js';

export default function DemandDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  // レンジは固定値ではなく実データの長さから決める（下の availableRanges）。
  // null = 「全期間」を意味し、系列が伸びれば自動で追従する。
  const [rangeDays, setRangeDays] = useState(null);

  const demand = useMemo(() => getDemandById(id), [id]);

  // 推移グラフの系列。Wikipedia 日次 PV が主、無ければニュース件数に退避する。
  const fullSeries = useMemo(() => trendSeries(demand), [demand]);
  const ranges = useMemo(() => availableRanges(fullSeries), [fullSeries]);
  const shownSeries = useMemo(
    () => sliceSeries(fullSeries, rangeDays ?? Infinity),
    [fullSeries, rangeDays],
  );

  // 検索結果に出るのはほぼこのページなので、description はテーマごとに変える。
  // 全ページ共通の説明文のままだと、10 件のテーマが同じ内容だと見なされる。
  const seoDescription = demand
    ? [
        `「${demand.title}」の需要スコアは ${demand.score}/100。`,
        demand._insights?.verdict ? `判定は「${demand._insights.verdict.label}」。` : '',
        `Wikipedia・Qiita・arXiv・GitHub など ${demand.sourceCount || 7} 種類の公開データから観測しました。`,
        'スコアの内訳と、根拠になった実際のニュース記事を掲載しています。',
      ].join('').slice(0, 160)
    : 'お探しの需要テーマは見つかりませんでした。';

  useSeo({
    title: demand
      ? `${demand.title}の需要スコアと根拠 — ${SITE_NAME}`
      : `ページが見つかりません — ${SITE_NAME}`,
    description: seoDescription,
    noindex: !demand,
    jsonLd: demand
      ? [
          breadcrumbJsonLd([
            { name: '分野', path: '/categories' },
            { name: demand.category, path: `/categories/${encodeURIComponent(demand.category)}` },
            { name: demand.title, path: `/demand/${demand.id}` },
          ]),
          {
            // 生成物であることを隠さない。Dataset として申告する
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: `${demand.title} の需要観測データ`,
            description: demand.summary,
            url: `${SITE_URL}/demand/${demand.id}`,
            inLanguage: 'ja',
            license: `${SITE_URL}/terms`,
            isAccessibleForFree: true,
            creator: { '@type': 'Person', name: 'RoLororo' },
            dateModified: demand.updatedAt || undefined,
            variableMeasured: [
              { '@type': 'PropertyValue', name: '需要スコア', value: demand.score, maxValue: 100, minValue: 0 },
              { '@type': 'PropertyValue', name: '観測情報源数', value: demand.sourceCount },
            ],
          },
        ]
      : null,
  });

  if (!demand) {
    return (
      <div className="container section">
        <Link to="/" className="back-link">← ホームに戻る</Link>
        <div className="empty">
          <div className="empty-icon"><FoxMark size={36} /></div>
          {/* このブランチはページ唯一の見出しなので h1（NotFound と同じ扱い） */}
          <h1>この需要は見つかりませんでした</h1>
          <p>URLが正しいかご確認ください。</p>
          <Link to="/" className="btn primary">ランキングを見る</Link>
        </div>
      </div>
    );
  }

  async function handleShare() {
    const url = window.location.href;
    // 1) Web Share API があればそれを使う（モバイルで OS のシートが出る）
    if (navigator.share) {
      try {
        await navigator.share({ title: demand.title, text: demand.summary, url });
        toast('共有しました');
        return;
      } catch (err) {
        // ユーザーがキャンセルした場合は何もしない
        if (err && err.name === 'AbortError') return;
        // それ以外は clipboard にフォールバック
      }
    }
    // 2) clipboard にフォールバック
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(url);
        toast('URLをコピーしました');
        return;
      } catch {
        toast('コピーに失敗しました', 'error');
        return;
      }
    }
    toast('この端末では共有できませんでした', 'error');
  }

  const chartColor =
    demand.change > 0 ? 'var(--green-bright)' :
    demand.change < 0 ? 'var(--red)' : 'var(--text-2)';

  const breakdownLabels = {
    search: '検索関心',
    sns: 'SNSでの話題',
    problems: '関連する悩み',
    jobs: '関連求人',
  };

  return (
    <div>
      <div className="container">
        <div className="detail-header">
          {/* 検索から直接ここへ着地した人は、自分がサイトのどこにいるか分からない。
              「← 一覧に戻る」だけでは分野へ横に移動できないので、パンくずを併置する */}
          <Breadcrumbs
            items={[
              { name: '分野', path: '/categories' },
              { name: demand.category, path: `/categories/${encodeURIComponent(demand.category)}` },
              { name: demand.title, path: `/demand/${demand.id}` },
            ]}
          />
          <Link to="/" className="back-link">← 一覧に戻る</Link>

          <div className="detail-header-top">
            <div>
              <div className="detail-cat">{demand.category}</div>
              <h1 className="detail-title">{demand.title}</h1>
              {/* verdict がある場合は StatusBadge を隠す (verdict が上位互換の判定) */}
              {!demand._insights?.verdict && <StatusBadge status={demand.status} />}
            </div>
            <div className="detail-actions">
              <FavoriteButton demandId={demand.id} />
              <button className="btn" onClick={handleShare}>
                共有
              </button>
            </div>
          </div>

          <p className="detail-summary" style={{ marginTop: 12 }}>{demand.summary}</p>

          {/* 総合判定 (verdict): 意思決定用の 1 行結論。矛盾する signal を横断して統合。 */}
          {demand._insights?.verdict && (
            <div className={`verdict verdict-${demand._insights.verdict.label.toLowerCase()}`}>
              <span className="verdict-label">総合判定</span>
              <span className="verdict-value">{demand._insights.verdict.label}</span>
              <span className="verdict-rationale">{demand._insights.verdict.rationale}</span>
            </div>
          )}

          <div className="detail-hero-metrics">
            <div className="hero-metric">
              <div className="hero-metric-label">需要スコア</div>
              <div className="hero-metric-value">
                <AnimatedNumber value={demand.score} duration={1100} />
              </div>
              <div className="hero-metric-hint">4 指標 (ニュース量40% / 直近成長30% / ニュース媒体の多様性20% / 鮮度10%) の重み付き合成 (100点満点)</div>
            </div>
            <div className="hero-metric">
              <div className="hero-metric-label">相対的な勢い</div>
              <div className={`hero-metric-value ${demand.change > 0 ? 'up' : demand.change < 0 ? 'down' : ''}`}>
                {formatChange(demand.change)}
              </div>
              <div className="hero-metric-hint">他テーマの中央値と比べたニュース増加ペース。0% が中央値、+100% で 2 倍</div>
            </div>
            <div className="hero-metric">
              <div className="hero-metric-label">観測情報源</div>
              <div className="hero-metric-value">
                <AnimatedNumber value={Object.keys(demand._insights?.beginnerFriendliness || {}).length > 0 ? 7 : demand.sourceCount} duration={900} />
                <span style={{ fontSize: 15, marginLeft: 4, color: 'var(--text-3)' }}>種</span>
              </div>
              <div className="hero-metric-hint">Wikipedia PV / Qiita / arXiv / App Store JP / GitHub / 国立国会図書館 / 主要ニュース RSS</div>
            </div>
            <div className="hero-metric">
              <div className="hero-metric-label">データ更新</div>
              <div className="hero-metric-value" style={{ fontSize: 16 }}>{formatDateTime(demand.updatedAt).slice(0, 10)}</div>
              <div className="hero-metric-hint">GitHub Actions が 1 日 1 回自動更新（配信時刻は日により前後します）</div>
            </div>
          </div>
        </div>

        <div className="detail-body">
          {/* ── 左：本文 ── */}
          <div>
            {/* ▼ 意思決定ゾーン (Hero 直後、スクロール前に見せる) ▼ */}

            {/* なぜ伸びたのか (合成) — 最も重要な結論を最初に */}
            {demand._insights?.whyTrending && (
              <div className="block">
                <h2 className="block-title">なぜ伸びたのか</h2>
                <InsightsPanel.WhyTrending data={demand._insights.whyTrending} />
              </div>
            )}

            {/* 3スコア評価: 勢い / 参入しやすさ / 競争 */}
            {demand._insights && (
              <div className="block">
                <h2 className="block-title">このテーマの評価</h2>
                <div className="insight-assess-grid">
                  <InsightsPanel.Assessment
                    title="今の勢い"
                    score={demand._insights.momentum?.score}
                    label={demand._insights.momentum?.label}
                    reason={demand._insights.momentum?.reason}
                    hue={145}
                    tone="momentum"
                  />
                  <InsightsPanel.Assessment
                    title="初心者の参入しやすさ"
                    score={demand._insights.beginnerFriendliness?.score}
                    label={demand._insights.beginnerFriendliness?.label}
                    reason={demand._insights.beginnerFriendliness?.reason}
                    signals={demand._insights.beginnerFriendliness?.signals}
                    hue={200}
                    tone="beginner"
                  />
                  <InsightsPanel.Assessment
                    title="競争の激しさ"
                    score={demand._insights.competition?.score}
                    label={demand._insights.competition?.label}
                    reason={demand._insights.competition?.reason}
                    signals={demand._insights.competition?.signals}
                    hue={30}
                    tone="competition"
                  />
                </div>
              </div>
            )}

            {/* スコアの内訳 (説明性) */}
            <div className="block">
              <h2 className="block-title">
                需要スコア {demand.score} の内訳
                <span className="block-title-count">4 要素の合計</span>
              </h2>
              <p className="score-breakdown-lead">
                needs = 40×ニュース量 + 30×直近成長 + 20×ニュース媒体の多様性 + 10×鮮度。各要素は 0〜1 に正規化。
                <br />
                「ニュース媒体の多様性」は購読している {NEWS_FEED_COUNT} 媒体のうち何媒体が報じたかを表します。
                {NEWS_DIVERSITY_SATURATION} 媒体で満点です。ページ下部の情報源（Wikipedia・Qiita 等）とは別の指標です。
              </p>
              {(() => {
                const sb = demand._scoreBreakdown || {};
                const rows = [
                  { key: 'newsVolume',      label: 'ニュース量',        val: sb.newsVolume ?? 0,      weight: 40 },
                  { key: 'growth',          label: '直近成長',          val: sb.growth ?? 0,          weight: 30 },
                  { key: 'sourceDiversity', label: 'ニュース媒体の多様性', val: sb.sourceDiversity ?? 0, weight: 20 },
                  { key: 'freshness',       label: '鮮度',              val: sb.freshness ?? 0,       weight: 10 },
                ];
                // 各行を独立に四捨五入すると、行の合計が demand.score と 1 点ずれて
                // 見えることがある（例: 33+10+20+8=71 だが合計 72）。最大剰余法で
                // 端数の大きい行から 1 点ずつ配り、表示上の各行が必ず合計に一致させる。
                const raw = rows.map((r) => r.val * r.weight);
                const contributions = raw.map((x) => Math.floor(x));
                let deficit = demand.score - contributions.reduce((a, c) => a + c, 0);
                raw
                  .map((x, i) => ({ i, frac: x - Math.floor(x) }))
                  .sort((a, b) => b.frac - a.frac)
                  .forEach(({ i }) => { if (deficit > 0) { contributions[i] += 1; deficit -= 1; } });
                return (
                  <>
                    <ul className="score-bars">
                      {rows.map((r, ri) => {
                        const contribution = contributions[ri];
                        return (
                          <li key={r.key} className="score-bar-row">
                            <div className="score-bar-head">
                              <span className="score-bar-name">{r.label}</span>
                              <span className="score-bar-formula">
                                {r.val.toFixed(2)} × {r.weight}
                                <span className="score-bar-contribution"> = {contribution} 点</span>
                              </span>
                            </div>
                            <div className="score-bar-track">
                              <div
                                className="score-bar-fill"
                                style={{ width: `${(r.val * r.weight) / 100 * 100}%` }}
                                aria-label={`${r.label}: ${contribution} 点 / ${r.weight} 点満点`}
                              />
                              <div
                                className="score-bar-max"
                                style={{ width: `${r.weight}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="score-total-row">
                      <span>合計</span>
                      {/* 各行は表示のために丸めているので、行の見た目を足すと
                          1 点ずれることがある。合計は必ず本物のスコアを出す。 */}
                      <span className="score-total-val">{demand.score} 点</span>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* ▲ 意思決定ゾーン ここまで ▲ */}

            {/* 広告枠 1。判定・評価・スコア内訳まで読み終えた直後の区切り。
                ここまでで「知りたかったこと」が一度満たされるので、
                読解を中断させずに挟める唯一の位置。 */}
            <AdSlot variant="inline" id="detail-after-decision" />

            {/* 需要の変化 */}
            <div className="block">
              <h2 className="block-title">需要の変化</h2>
              <div className="chart-card">
                <div className="chart-toolbar">
                  <div className="range-tabs" role="tablist">
                    {ranges.map((r) => {
                      const active = (rangeDays ?? fullSeries?.values.length) === r.days;
                      return (
                        <button
                          key={r.days}
                          className={`range-tab ${active ? 'active' : ''}`}
                          onClick={() => setRangeDays(r.days)}
                          role="tab"
                          aria-selected={active}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    最終更新：{formatDateTime(demand.updatedAt)}
                  </div>
                </div>

                {shownSeries ? (
                  <>
                    {/* 何の系列を描いているかを必ず明示する */}
                    <div className="chart-legend">
                      <span className="chart-legend-dot" style={{ background: chartColor }} />
                      <span className="chart-legend-name">{shownSeries.label}</span>
                      <span className="chart-legend-period">{seriesPeriodLabel(shownSeries)}</span>
                    </div>
                    <TrendChart
                      key={`${shownSeries.id}-${shownSeries.values.length}`}
                      data={shownSeries.values}
                      labels={shownSeries.dates}
                      unit={shownSeries.unit}
                      color={chartColor}
                    />
                    <div className="chart-note">
                      同じテーマで直近 30 日に観測したニュースは {demand._matchingArticleCount ?? 0} 件。
                      日次のニュース件数は 1 日あたり 0〜数件で線にならないため、グラフには
                      閲覧数を使っています。
                    </div>
                  </>
                ) : (
                  <div className="chart-note">推移を描けるだけの観測データがまだありません。</div>
                )}
              </div>
            </div>

            {/* 情報源ごとの実数 (demands.json に既に含まれる nativeMetrics) */}
            <div className="block">
              <h2 className="block-title">情報源ごとの実数</h2>
              <p className="block-lead">
                各情報源が直近の観測窓で実際に返した数字です。判断の材料にならない内部計算値は出していません。
              </p>
              <SourceMetrics demand={demand} />
            </div>

            {/* 情報源別の時系列 (history/current から動的読み込み) */}
            <div className="block">
              <h2 className="block-title">情報源別に見る積み上がり</h2>
              <SourceTrends themeId={demand.id} />
            </div>

            {/* 情報源別の実際の観測 (demand._{source}Detail.topItems 由来) */}
            <div className="block">
              <h2 className="block-title">情報源別に見る実際の観測</h2>
              <SourceObservations demand={demand} />
            </div>

            {/* 誰が求めているか */}
            <div className="block">
              <h2 className="block-title">どのような人が求めているか</h2>
              <div className="pill-list">
                {demand.audience.map((a) => <span className="pill" key={a}>{a}</span>)}
              </div>
            </div>

            {/* 具体的な悩み */}
            <div className="block">
              <h2 className="block-title">具体的な悩み</h2>
              <div className="quote-list">
                {demand.problems.map((p) => (
                  <div className="quote" key={p}>「{p}」</div>
                ))}
              </div>
            </div>

            {/* 実際の観測 (ニュース記事一覧) */}
            <div className="block">
              <h2 className="block-title">
                この需要が観測された実際のニュース
                <span className="block-title-count">{demand.evidence.length}</span>
              </h2>
              {demand.evidence.length === 0 && (
                <div className="empty-hint">直近のニュース記事はまだ観測されていません。</div>
              )}
              <ul className="news-evidence-list">
                {demand.evidence.map((e, i) => {
                  const dateStr = e.checkedAt || (e.publishedAt || '').slice(0, 10);
                  const src = e.source || e.type;
                  return (
                    <li key={i} className="news-evidence-item">
                      <div className="news-evidence-head">
                        <span className="news-evidence-source">{src}</span>
                        {dateStr && <span className="news-evidence-date">{dateStr}</span>}
                      </div>
                      {e.url ? (
                        <a
                          className="news-evidence-title"
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {e.title}
                          <span className="news-evidence-ext" aria-hidden="true">↗</span>
                        </a>
                      ) : (
                        <span className="news-evidence-title no-link">{e.title}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="disclaimer" style={{ marginTop: 12 }}>
                リンク先は各媒体の公式ページです。Demand Atlas は情報源への参照のみを行い、
                記事の内容には責任を負いません。
              </div>
            </div>

            {/* 広告枠 2。根拠のニュースを読み終えた後、アイデア群に入る前。
                ここまで到達した人は滞在時間が長く、離脱リスクが低い。
                外部リンクの一覧の直後なので、広告と記事リンクが隣り合わない
                （隣り合うと誤クリックを誘発し、AdSense のポリシー違反になる）。 */}
            <AdSlot variant="rectangle" id="detail-after-evidence" />

            {/* 収益化アイデア (詳細版: barrier + revenue バッジ付き) */}
            {demand._insights?.monetization && demand._insights.monetization.length > 0 && (
              <div className="block">
                <h2 className="block-title">
                  収益化アイデア
                  <span className="block-title-count">{demand._insights.monetization.length}</span>
                </h2>
                <InsightsPanel.Ideas items={demand._insights.monetization} columns="monetization" />
              </div>
            )}

            {/* コンテンツ化アイデア */}
            {demand._insights?.content && demand._insights.content.length > 0 && (
              <div className="block">
                <h2 className="block-title">
                  コンテンツ化アイデア
                  <span className="block-title-count">{demand._insights.content.length}</span>
                </h2>
                <InsightsPanel.Ideas items={demand._insights.content} columns="content" />
              </div>
            )}

            {/* SaaS / アプリ化アイデア */}
            {demand._insights?.saas && demand._insights.saas.length > 0 && (
              <div className="block">
                <h2 className="block-title">
                  SaaS / アプリ化アイデア
                  <span className="block-title-count">{demand._insights.saas.length}</span>
                </h2>
                <InsightsPanel.Ideas items={demand._insights.saas} columns="saas" />
              </div>
            )}

            {/* 似たテーマ */}
            {demand._insights?.similarThemes && demand._insights.similarThemes.length > 0 && (
              <div className="block">
                <h2 className="block-title">似たテーマを比べる</h2>
                <InsightsPanel.Similar items={demand._insights.similarThemes} />
                <div className="similar-cta-row">
                  <Link to={`/compare?a=${demand.id}`} className="btn primary">
                    このテーマを他と比較する →
                  </Link>
                </div>
              </div>
            )}

            {/* 次の一歩 (行動チェックリスト) */}
            {demand._insights?.nextActions && demand._insights.nextActions.length > 0 && (
              <div className="block next-actions-block">
                <h2 className="block-title">次の一歩</h2>
                <div className="next-actions-lead">
                  観測を眺めるだけで終わらせないための、実行可能な 5 ステップ。
                </div>
                <InsightsPanel.Actions actions={demand._insights.nextActions} />
              </div>
            )}
          </div>

          {/* ── 右：サイドバー ── */}
          <aside>
            <div className="sidebar-card">
              <div className="sidebar-title">観測基盤の内訳</div>
              <div className="meta-row">
                <span className="label">分野</span>
                <span className="value">
                  <Link to={`/categories/${encodeURIComponent(demand.category)}`}>{demand.category}</Link>
                </span>
              </div>
              <div className="meta-row">
                <span className="label">総合判定</span>
                <span className="value" style={{ fontFamily: 'inherit' }}>
                  {demand._insights?.verdict?.label || demand.status}
                </span>
              </div>
              <div className="meta-row">
                <span className="label">観測ソース</span>
                <span className="value" style={{ fontFamily: 'inherit', fontSize: 12 }}>
                  Wikipedia / Qiita / arXiv / App Store / RSS
                </span>
              </div>
              <div className="meta-row">
                <span className="label">実観測点</span>
                <span className="value">
                  {(demand._qiitaDetail?.topItems?.length || 0)
                   + (demand._arxivDetail?.topItems?.length || 0)
                   + (demand._appstoreDetail?.topItems?.length || 0)
                   + (demand.evidence?.length || 0)} 件
                </span>
              </div>
              <div className="meta-row">
                <span className="label">最終更新</span>
                <span className="value" style={{ fontFamily: 'inherit', fontSize: 12 }}>
                  {formatDateTime(demand.updatedAt)}
                </span>
              </div>
            </div>

            <div className="disclaimer">
              このページの数値は Wikipedia / Qiita / arXiv / App Store JP / 主要ニュース RSS の
              公開データを日次観測し、ルールベースで合成した推定値です。
              意思決定の一次資料としてご活用ください (LLM 未使用)。
            </div>

            {demand._insights && (
              <div className="sidebar-assess-mini">
                <div className="sidebar-mini-row">
                  <span className="sidebar-mini-label">勢い</span>
                  <span className="sidebar-mini-value momentum">
                    {demand._insights.momentum?.label} ({demand._insights.momentum?.score})
                  </span>
                </div>
                <div className="sidebar-mini-row">
                  <span className="sidebar-mini-label">参入</span>
                  <span className="sidebar-mini-value beginner">
                    {demand._insights.beginnerFriendliness?.label} ({demand._insights.beginnerFriendliness?.score})
                  </span>
                </div>
                <div className="sidebar-mini-row">
                  <span className="sidebar-mini-label">競争</span>
                  <span className="sidebar-mini-value competition">
                    {demand._insights.competition?.label} ({demand._insights.competition?.score})
                  </span>
                </div>
              </div>
            )}

            <Link
              to={`/compare?a=${demand.id}`}
              className="btn primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 12, textDecoration: 'none' }}
            >
              他のテーマと比較する
            </Link>
            <button
              className="btn"
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              onClick={() => nav('/explore')}
            >
              他の需要を探す
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
