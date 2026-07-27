// ============================================================================
// DemandCard — 需要ランキングの行/カード
//
// 情報階層 (2026-07 リブランド後):
//   ・PRIMARY  今日の実測変化 (historyMove.pctChange, 履歴から day-over-day)
//   ・SECONDARY 総合スコア (0-100, 静的コンテキスト)
//   ・BADGES   momentum / beginner / competition (insights から)
//   ・META     カテゴリ / 更新日時 / news 30 日変化 (小さく)
//
// 「毎日開く動機」を作るため、飽和した +200% news change は主指標から降格し
// (背景コンテキストにとどめ)、実測の day-over-day = 毎日変わる数値を主指標に。
// ============================================================================

import { useNavigate } from 'react-router-dom';
import Sparkline from './Sparkline.jsx';
import StatusBadge from './StatusBadge.jsx';
import AnimatedNumber from './AnimatedNumber.jsx';
import { changeClass, formatChange, timeAgo } from '../utils/format.js';
import { sourceDisplay } from '../services/sourceCatalog.js';

function InsightMiniBadges({ insights }) {
  if (!insights) return null;
  const items = [
    { key: 'momentum',   short: '勢い', obj: insights.momentum,             color: 145 },
    { key: 'beginner',   short: '参入', obj: insights.beginnerFriendliness, color: 200 },
    { key: 'competition',short: '競争', obj: insights.competition,          color: 30 },
  ].filter((x) => x.obj && typeof x.obj.score === 'number');
  if (items.length === 0) return null;
  return (
    <div className="card-insight-badges" onClick={(e) => e.stopPropagation()}>
      {items.map((it) => (
        <span
          key={it.key}
          className="card-insight-badge"
          title={`${it.short}: ${it.obj.label} (${it.obj.score}/100)`}
        >
          <span className="cib-lbl">{it.short}</span>
          <span
            className="cib-dot"
            style={{ background: `hsl(${it.color} 60% 50%)`, opacity: 0.4 + (it.obj.score / 100) * 0.6 }}
          />
          <span className="cib-val">{it.obj.score}</span>
        </span>
      ))}
    </div>
  );
}

export default function DemandCard({ demand, rank, index = 0, historyMove = null }) {
  const nav = useNavigate();

  // Primary indicator: 実測 day-over-day (history-based). Fall back to
  // saturated news `change` only when no history is available yet.
  const hasHistoryMove = historyMove && isFinite(historyMove.pctChange);
  const primaryPct = hasHistoryMove ? historyMove.pctChange : demand.change;
  const primaryLabel = hasHistoryMove ? '今日' : '30日';
  const primarySource = hasHistoryMove ? `(${sourceDisplay(historyMove.source)})` : '(ニュース)';

  const sparkColor =
    primaryPct > 0 ? 'var(--green-bright)' :
    primaryPct < 0 ? 'var(--red)' : 'var(--text-3)';

  return (
    <button
      className="demand-card"
      onClick={() => nav(`/demand/${demand.id}`)}
      aria-label={`${demand.title} の詳細を見る`}
      style={{ '--i': index }}
    >
      <div className={`rank ${rank <= 3 ? 'top' : ''}`}>
        {String(rank).padStart(2, '0')}
      </div>

      <div className="demand-info">
        <div className="demand-title">{demand.title}</div>
        <div className="demand-meta">
          <span>{demand.category}</span>
          <span className="dot" />
          <StatusBadge status={demand.status} />
          <span className="dot" />
          <span>{timeAgo(demand.updatedAt)}更新</span>
        </div>
        <InsightMiniBadges insights={demand._insights} />
        <div className="demand-summary">{demand.summary}</div>
      </div>

      <div className="demand-chart">
        <Sparkline data={demand.trendData['7d']} color={sparkColor} />
      </div>

      <div className="demand-metrics">
        <div className={`card-primary-change ${changeClass(primaryPct)}`}
             title={hasHistoryMove
               ? `${sourceDisplay(historyMove.source)} の ${historyMove.metric}: ${historyMove.previous.toLocaleString()} → ${historyMove.current.toLocaleString()}`
               : 'ニュース記事数 (直近2日 vs 前5日) の伸び率'}>
          <span className="cpc-lbl">{primaryLabel}</span>
          <span className="cpc-val">{formatChange(primaryPct)}</span>
          <span className="cpc-src">{primarySource}</span>
        </div>
        <div className="score">
          <AnimatedNumber value={demand.score} duration={900} />
          <span className="score-lbl">スコア</span>
        </div>
      </div>
    </button>
  );
}
