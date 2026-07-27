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
import InsightsPanel from '../components/InsightsPanel.jsx';
import { getDemandById } from '../services/demandService.js';
import { changeClass, formatChange, formatDateTime } from '../utils/format.js';
import { usePageTitle } from '../utils/usePageTitle.js';
import { toast } from '../utils/toast.js';

const RANGES = [
  { key: '7d',  label: '7日間' },
  { key: '30d', label: '30日間' },
  { key: '90d', label: '90日間' },
];

export default function DemandDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [range, setRange] = useState('30d');

  const demand = useMemo(() => getDemandById(id), [id]);

  usePageTitle(
    demand
      ? `${demand.title} — 需要分析 | Demand Atlas`
      : 'ページが見つかりません — Demand Atlas'
  );

  if (!demand) {
    return (
      <div className="container section">
        <Link to="/" className="back-link">← ホームに戻る</Link>
        <div className="empty">
          <div className="empty-icon"><FoxMark size={36} /></div>
          <h3>この需要は見つかりませんでした</h3>
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
          <Link to="/" className="back-link">← 一覧に戻る</Link>

          <div className="detail-header-top">
            <div>
              <div className="detail-cat">{demand.category}</div>
              <h1 className="detail-title">{demand.title}</h1>
              <StatusBadge status={demand.status} />
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
              <div className="hero-metric-hint">4 指標 (ニュース量40% / 直近成長30% / 情報源多様性20% / 鮮度10%) の重み付き合成 (100点満点)</div>
            </div>
            <div className="hero-metric">
              <div className="hero-metric-label">30日成長率</div>
              <div className={`hero-metric-value ${demand.change > 0 ? 'up' : demand.change < 0 ? 'down' : ''}`}>
                {formatChange(demand.change)}
              </div>
              <div className="hero-metric-hint">ニュース記事数 (直近2日 vs 前5日) から算出。±200% で頭打ち</div>
            </div>
            <div className="hero-metric">
              <div className="hero-metric-label">観測情報源</div>
              <div className="hero-metric-value">
                <AnimatedNumber value={Object.keys(demand._insights?.beginnerFriendliness || {}).length > 0 ? 5 : demand.sourceCount} duration={900} />
                <span style={{ fontSize: 15, marginLeft: 4, color: 'var(--text-3)' }}>種</span>
              </div>
              <div className="hero-metric-hint">Wikipedia PV / Qiita / arXiv / App Store JP / 主要ニュース RSS</div>
            </div>
            <div className="hero-metric">
              <div className="hero-metric-label">データ更新</div>
              <div className="hero-metric-value" style={{ fontSize: 16 }}>{formatDateTime(demand.updatedAt).slice(0, 10)}</div>
              <div className="hero-metric-hint">GitHub Actions が毎日 JST 06:00 に自動更新</div>
            </div>
          </div>
        </div>

        <div className="detail-body">
          {/* ── 左：本文 ── */}
          <div>
            {/* 需要の変化 */}
            <div className="block">
              <div className="block-title">需要の変化</div>
              <div className="chart-card">
                <div className="chart-toolbar">
                  <div className="range-tabs" role="tablist">
                    {RANGES.map((r) => (
                      <button
                        key={r.key}
                        className={`range-tab ${range === r.key ? 'active' : ''}`}
                        onClick={() => setRange(r.key)}
                        role="tab"
                        aria-selected={range === r.key}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    最終更新：{formatDateTime(demand.updatedAt)}
                  </div>
                </div>
                <TrendChart key={range} data={demand.trendData[range]} color={chartColor} />
              </div>
            </div>

            {/* 情報源別の時系列 (history/current から動的読み込み) */}
            <div className="block">
              <div className="block-title">情報源別に見る積み上がり</div>
              <SourceTrends themeId={demand.id} />
            </div>

            {/* 情報源別の実際の観測 (demand._{source}Detail.topItems 由来) */}
            <div className="block">
              <div className="block-title">情報源別に見る実際の観測</div>
              <SourceObservations demand={demand} />
            </div>

            {/* なぜ伸びたのか (合成) */}
            {demand._insights?.whyTrending && (
              <div className="block">
                <div className="block-title">なぜ伸びたのか</div>
                <InsightsPanel.WhyTrending data={demand._insights.whyTrending} />
              </div>
            )}

            {/* 3スコア評価: 勢い / 参入しやすさ / 競争 */}
            {demand._insights && (
              <div className="block">
                <div className="block-title">このテーマの評価</div>
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

            {/* 数字ベースの内訳 (旧「なぜ高まっているのか」の代わりに縮小して残す) */}
            <div className="block">
              <div className="block-title">
                需要スコア {demand.score} の内訳
                <span className="block-title-count">4 要素の合計</span>
              </div>
              <p className="score-breakdown-lead">
                needs = 40×ニュース量 + 30×直近成長 + 20×情報源多様性 + 10×鮮度。各要素は 0〜1 に正規化。
              </p>
              {(() => {
                const sb = demand._scoreBreakdown || {};
                const rows = [
                  { key: 'newsVolume',      label: 'ニュース量',        val: sb.newsVolume ?? 0,      weight: 40 },
                  { key: 'growth',          label: '直近成長',          val: sb.growth ?? 0,          weight: 30 },
                  { key: 'sourceDiversity', label: '情報源多様性',      val: sb.sourceDiversity ?? 0, weight: 20 },
                  { key: 'freshness',       label: '鮮度',              val: sb.freshness ?? 0,       weight: 10 },
                ];
                const total = rows.reduce((s, r) => s + r.val * r.weight, 0);
                return (
                  <>
                    <ul className="score-bars">
                      {rows.map((r) => {
                        const contribution = Math.round(r.val * r.weight);
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
                      <span className="score-total-val">{Math.round(total)} 点</span>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* 誰が求めているか */}
            <div className="block">
              <div className="block-title">どのような人が求めているか</div>
              <div className="pill-list">
                {demand.audience.map((a) => <span className="pill" key={a}>{a}</span>)}
              </div>
            </div>

            {/* 具体的な悩み */}
            <div className="block">
              <div className="block-title">具体的な悩み</div>
              <div className="quote-list">
                {demand.problems.map((p) => (
                  <div className="quote" key={p}>「{p}」</div>
                ))}
              </div>
            </div>

            {/* 実際の観測 (ニュース記事一覧) */}
            <div className="block">
              <div className="block-title">
                この需要が観測された実際のニュース
                <span className="block-title-count">{demand.evidence.length}</span>
              </div>
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

            {/* 収益化アイデア (詳細版: barrier + revenue バッジ付き) */}
            {demand._insights?.monetization && demand._insights.monetization.length > 0 && (
              <div className="block">
                <div className="block-title">
                  収益化アイデア
                  <span className="block-title-count">{demand._insights.monetization.length}</span>
                </div>
                <InsightsPanel.Ideas items={demand._insights.monetization} columns="monetization" />
              </div>
            )}

            {/* コンテンツ化アイデア */}
            {demand._insights?.content && demand._insights.content.length > 0 && (
              <div className="block">
                <div className="block-title">
                  コンテンツ化アイデア
                  <span className="block-title-count">{demand._insights.content.length}</span>
                </div>
                <InsightsPanel.Ideas items={demand._insights.content} columns="content" />
              </div>
            )}

            {/* SaaS / アプリ化アイデア */}
            {demand._insights?.saas && demand._insights.saas.length > 0 && (
              <div className="block">
                <div className="block-title">
                  SaaS / アプリ化アイデア
                  <span className="block-title-count">{demand._insights.saas.length}</span>
                </div>
                <InsightsPanel.Ideas items={demand._insights.saas} columns="saas" />
              </div>
            )}

            {/* 似たテーマ */}
            {demand._insights?.similarThemes && demand._insights.similarThemes.length > 0 && (
              <div className="block">
                <div className="block-title">似たテーマを比べる</div>
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
                <div className="block-title">次の一歩</div>
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
