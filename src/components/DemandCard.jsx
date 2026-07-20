// ============================================================================
// DemandCard — 需要ランキングの行/カード
// ============================================================================

import { useNavigate } from 'react-router-dom';
import Sparkline from './Sparkline.jsx';
import StatusBadge from './StatusBadge.jsx';
import AnimatedNumber from './AnimatedNumber.jsx';
import { changeClass, formatChange, timeAgo } from '../utils/format.js';

export default function DemandCard({ demand, rank, index = 0 }) {
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
