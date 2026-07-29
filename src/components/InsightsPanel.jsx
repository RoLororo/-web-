// ============================================================================
// InsightsPanel — DemandDetail に「見る」→「行動する」を接続するブロック群
//
//   ■ 描画する要素 (すべて demand._insights 由来)
//     - whyTrending   : 伸びた理由の synthesis (headline + 3-5 signals)
//     - assessment    : momentum / beginner / competition の 3 スコアパネル
//     - similarThemes : 類似テーマへのリンク
//     - monetization  : 収益化アイデア (business opportunities は既存 shape で
//                        描画されるため、ここでは詳細版 (barrier / revenue) を出す)
//     - content       : コンテンツ化アイデア
//     - saas          : SaaS / アプリ化アイデア
//     - nextActions   : 具体的な次の一歩 (checklist)
//
//   ■ 「捏造しない」姿勢の可視化
//     - 各セクション footer に「観測データからの提案 (LLM 未使用)」ヒントを出す
//     - momentum/beginner/competition は必ず signals[] を並記する
// ============================================================================

import { Link } from 'react-router-dom';

function ScoreGauge({ score = 0, hue = 145 }) {
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div className="insight-gauge" aria-label={`スコア ${clamped}/100`}>
      <div
        className="insight-gauge-fill"
        style={{ width: `${clamped}%`, background: `hsl(${hue} 60% 50%)` }}
      />
    </div>
  );
}

function AssessmentCard({ title, score, label, reason, signals, hue, tone }) {
  return (
    <div className={`insight-assess ${tone}`}>
      <div className="insight-assess-head">
        <span className="insight-assess-title">{title}</span>
        <span className="insight-assess-label">{label}</span>
      </div>
      <div className="insight-assess-scorerow">
        <span className="insight-assess-num">{score}</span>
        <ScoreGauge score={score} hue={hue} />
      </div>
      <div className="insight-assess-reason">{reason}</div>
      {signals && signals.length > 0 && (
        <ul className="insight-assess-signals">
          {signals.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      )}
    </div>
  );
}

function WhyTrending({ data }) {
  if (!data) return null;
  return (
    <div className="insight-why">
      <p className="insight-why-headline">{data.headline}</p>
      {data.signals && data.signals.length > 0 && (
        <ul className="insight-why-list">
          {data.signals.map((s, i) => (
            <li key={i}>
              <span className="insight-why-icon" aria-hidden>{s.icon}</span>
              <span className="insight-why-text">{s.text}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="insight-note">
        ※ 上記は Wikipedia / Qiita / arXiv / App Store JP / GitHub / 主要ニュース RSS の
        観測データから機械的に生成したものです (LLM 未使用)。
      </div>
    </div>
  );
}

function SimilarThemes({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="insight-similar">
      <ul className="insight-similar-list">
        {items.map((s) => (
          <li key={s.id}>
            <Link to={`/demand/${s.id}`} className="insight-similar-card">
              <div className="insight-similar-cat">{s.category}</div>
              <div className="insight-similar-title">{s.title}</div>
              <div className="insight-similar-foot">
                {s.similarity > 0 ? (
                  <span className="insight-similar-sim">
                    キーワード類似 {(s.similarity * 100).toFixed(1)}%
                    {s.sharedKeywords && s.sharedKeywords.length > 0 &&
                      <> ({s.sharedKeywords.slice(0, 3).join(' / ')})</>
                    }
                  </span>
                ) : (
                  <span className="insight-similar-sim faded">同分野</span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdeaGrid({ items, columns = 'monetization' }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`insight-ideas insight-ideas-${columns}`}>
      {items.map((it, i) => (
        <div key={i} className="insight-idea-card">
          {columns === 'monetization' && (
            <>
              <div className="insight-idea-title">{it.title}</div>
              <div className="insight-idea-desc">{it.desc}</div>
              <div className="insight-idea-tags">
                {it.barrier && <span className="insight-tag">参入難度 {it.barrier}</span>}
                {it.revenue && <span className="insight-tag rev">{it.revenue}</span>}
              </div>
            </>
          )}
          {columns === 'content' && (
            <>
              <div className="insight-idea-format">{it.format}</div>
              <div className="insight-idea-title">{it.title}</div>
              <div className="insight-idea-desc">{it.angle}</div>
            </>
          )}
          {columns === 'saas' && (
            <>
              <div className="insight-idea-title">{it.title}</div>
              <div className="insight-idea-desc"><b>対象:</b> {it.target}</div>
              <div className="insight-idea-desc"><b>仮説:</b> {it.hypothesis}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function NextActions({ actions }) {
  if (!actions || actions.length === 0) return null;
  return (
    <ol className="insight-actions">
      {actions.map((a, i) => (
        <li key={i} className={`insight-action kind-${a.kind}`}>
          <div className="insight-action-num">{String(i + 1).padStart(2, '0')}</div>
          <div className="insight-action-body">
            <div className="insight-action-head">
              <span className="insight-action-label">{a.label}</span>
              {a.effort && <span className="insight-action-effort">⏱ {a.effort}</span>}
            </div>
            <div className="insight-action-desc">{a.desc}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// 公開: 主要 5 セクションをそれぞれ単独で render できる形にして、
//       DemandDetail 側で block wrapper に差し込めるようにする
// ---------------------------------------------------------------------------

InsightsPanel.WhyTrending  = WhyTrending;
InsightsPanel.Similar      = SimilarThemes;
InsightsPanel.Ideas        = IdeaGrid;
InsightsPanel.Actions      = NextActions;
InsightsPanel.Assessment   = AssessmentCard;

/**
 * 全て一度に描画する簡易ラッパ (使わなくても OK)
 */
export default function InsightsPanel({ insights }) {
  if (!insights) return null;
  return (
    <div>
      <WhyTrending data={insights.whyTrending} />
      <div className="insight-assess-grid">
        <AssessmentCard
          title="今の勢い"
          score={insights.momentum?.score}
          label={insights.momentum?.label}
          reason={insights.momentum?.reason}
          hue={145}
          tone="momentum"
        />
        <AssessmentCard
          title="初心者の参入しやすさ"
          score={insights.beginnerFriendliness?.score}
          label={insights.beginnerFriendliness?.label}
          reason={insights.beginnerFriendliness?.reason}
          signals={insights.beginnerFriendliness?.signals}
          hue={200}
          tone="beginner"
        />
        <AssessmentCard
          title="競争の激しさ"
          score={insights.competition?.score}
          label={insights.competition?.label}
          reason={insights.competition?.reason}
          signals={insights.competition?.signals}
          hue={30}
          tone="competition"
        />
      </div>
    </div>
  );
}
