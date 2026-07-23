// ============================================================================
// DemandCard — 需要ランキングの行/カード
// ============================================================================

import { useNavigate } from 'react-router-dom';
import Sparkline from './Sparkline.jsx';
import StatusBadge from './StatusBadge.jsx';
import AnimatedNumber from './AnimatedNumber.jsx';
import { changeClass, formatChange, timeAgo } from '../utils/format.js';
import { sourceDisplay } from '../services/sourceCatalog.js';

/**
 * historyMove (optional): { source, metric, pctChange, delta, current, previous }
 *   親から渡す。history から算出した「このテーマで今日最も動いた metric」。
 *   未指定なら何も表示しない (履歴なし・浅い履歴時のフォールバック)。
 */
export default function DemandCard({ demand, rank, index = 0, historyMove = null }) {
  const nav = useNavigate();
  const sparkColor =
    demand.change > 0 ? 'var(--green-bright)' :
    demand.change < 0 ? 'var(--red)' : 'var(--text-3)';

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
          {historyMove && isFinite(historyMove.pctChange) && (
            <>
              <span className="dot" />
              <span
                className={`today-move ${historyMove.pctChange >= 0 ? 'up' : 'down'}`}
                title={`${sourceDisplay(historyMove.source)} の ${historyMove.metric}: ${historyMove.previous.toLocaleString()} → ${historyMove.current.toLocaleString()}`}
              >
                今日 {historyMove.pctChange >= 0 ? '+' : ''}{historyMove.pctChange.toFixed(0)}% ({sourceDisplay(historyMove.source)})
              </span>
            </>
          )}
        </div>
        <div className="demand-summary">{demand.summary}</div>
      </div>

      <div className="demand-chart">
        <Sparkline data={demand.trendData['7d']} color={sparkColor} />
      </div>

      <div className="demand-metrics">
        <div className="score">
          <AnimatedNumber value={demand.score} duration={900} />
        </div>
        <div className={`change ${changeClass(demand.change)}`}>
          {formatChange(demand.change)}
        </div>
      </div>
    </button>
  );
}
