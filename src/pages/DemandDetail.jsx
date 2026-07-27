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

          <div className="detail-hero-metrics">
            <div className="hero-metric">
              <div className="hero-metric-label">需要度</div>
              <div className="hero-metric-value">
                <AnimatedNumber value={demand.score} duration={1100} />
              </div>
              <div className="hero-metric-hint">複数の参考データをもとにした試算値（100点満点）</div>
            </div>
            <div className="hero-metric">
              <div className="hero-metric-label">前日比</div>
              <div className={`hero-metric-value ${demand.change > 0 ? 'up' : demand.change < 0 ? 'down' : ''}`}>
                {formatChange(demand.change)}
              </div>
              <div className="hero-metric-hint">昨日のスコアと比較した変化率</div>
            </div>
            <div className="hero-metric">
              <div className="hero-metric-label">参考データ</div>
              <div className="hero-metric-value">
                <AnimatedNumber value={demand.sourceCount} duration={900} />
                <span style={{ fontSize: 15, marginLeft: 4, color: 'var(--text-3)' }}>件</span>
              </div>
              <div className="hero-metric-hint">SNS・検索・求人など</div>
            </div>
            <div className="hero-metric">
              <div className="hero-metric-label">信頼度</div>
              <div className="hero-metric-value" style={{ fontSize: 20 }}>{demand.confidence}</div>
              <div className="hero-metric-hint">プロトタイプ段階の参考指標</div>
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
              <div className="block-title">数値ベースの内訳</div>
              <div className="reason-grid">
                {Object.entries(demand.breakdown).map(([k, v]) => (
                  <div key={k} className="reason-card">
                    <div className="reason-label">{breakdownLabels[k] || k}</div>
                    <div
                      className="reason-value"
                      style={{ color: v >= 0 ? 'var(--green-bright)' : 'var(--red)' }}
                    >
                      {v > 0 ? `+${v}%` : `${v}%`}
                    </div>
                  </div>
                ))}
              </div>
              <div className="disclaimer" style={{ marginTop: 12 }}>
                こちらは news volume から算出した簡易な変化率です。上の「なぜ伸びたのか」がより
                広い観測に基づいた解釈になります。
              </div>
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
              <div className="sidebar-title">この需要のメタ情報</div>
              <div className="meta-row">
                <span className="label">分野</span>
                <span className="value">
                  <Link to={`/categories/${encodeURIComponent(demand.category)}`}>{demand.category}</Link>
                </span>
              </div>
              <div className="meta-row">
                <span className="label">状態</span>
                <span className="value" style={{ fontFamily: 'inherit' }}>{demand.status}</span>
              </div>
              <div className="meta-row">
                <span className="label">参考データ</span>
                <span className="value">{demand.sourceCount}件</span>
              </div>
              <div className="meta-row">
                <span className="label">信頼度</span>
                <span className="value" style={{ fontFamily: 'inherit' }}>{demand.confidence}</span>
              </div>
              <div className="meta-row">
                <span className="label">最終更新</span>
                <span className="value" style={{ fontFamily: 'inherit', fontSize: 12 }}>
                  {formatDateTime(demand.updatedAt)}
                </span>
              </div>
            </div>

            <div className="disclaimer">
              需要スコアはSNS・検索・求人・報道などの参考データから算出したものです。
              現時点ではプロトタイプ用のダミー値であり、正確な市場規模を示すものではありません。
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
