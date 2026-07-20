// ============================================================================
// CategoryDetail — 単一分野の探索ページ
// ============================================================================

import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import DemandCard from '../components/DemandCard.jsx';
import AnimatedNumber from '../components/AnimatedNumber.jsx';
import { getCategoryDescription, searchDemands } from '../services/demandService.js';
import { usePageTitle } from '../utils/usePageTitle.js';

export default function CategoryDetail() {
  const { name } = useParams();
  const category = decodeURIComponent(name);
  usePageTitle(`${category}の需要ランキング — Demand Atlas`);

  const desc = getCategoryDescription(category);
  const all = useMemo(() => searchDemands({ category, sort: 'score' }), [category]);
  const rising = useMemo(() => [...all].sort((a, b) => b.change - a.change).slice(0, 3), [all]);
  const falling = useMemo(() => [...all].filter((d) => d.change < 0).sort((a, b) => a.change - b.change), [all]);

  const avgChange = all.length
    ? Math.round((all.reduce((s, d) => s + d.change, 0) / all.length) * 10) / 10
    : 0;

  return (
    <div className="container">
      <section className="section">
        <Link to="/categories" className="back-link">← 分野一覧に戻る</Link>

        <div className="detail-cat">分野</div>
        <h1 className="detail-title">{category}</h1>
        <p className="detail-summary">{desc}</p>

        <div className="detail-hero-metrics">
          <div className="hero-metric">
            <div className="hero-metric-label">登録された需要</div>
            <div className="hero-metric-value">
              <AnimatedNumber value={all.length} duration={700} />
            </div>
          </div>
          <div className="hero-metric">
            <div className="hero-metric-label">平均変化率</div>
            <div className={`hero-metric-value ${avgChange > 0 ? 'up' : avgChange < 0 ? 'down' : ''}`}>
              {avgChange > 0 ? `+${avgChange}%` : `${avgChange}%`}
            </div>
            <div className="hero-metric-hint">この分野に含まれる需要の平均</div>
          </div>
          <div className="hero-metric">
            <div className="hero-metric-label">急上昇テーマ</div>
            <div className="hero-metric-value">
              <AnimatedNumber value={rising.filter((d) => d.change > 0).length} duration={800} />
            </div>
          </div>
        </div>
      </section>

      {rising.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">この分野で急上昇</h2>
          </div>
          <div className="card-list">
            {rising.map((d, i) => (
              <DemandCard key={d.id} demand={d} rank={i + 1} index={i} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">
            すべての需要 <span className="count">{all.length}件</span>
          </h2>
        </div>
        <div className="card-list">
          {all.map((d, i) => (
            <DemandCard key={d.id} demand={d} rank={i + 1} index={i} />
          ))}
          {all.length === 0 && (
            <div className="empty">
              <h3>この分野にはまだ需要が登録されていません</h3>
            </div>
          )}
        </div>
      </section>

      {falling.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">下降傾向</h2>
            <p className="section-sub">全体は下降でも、局所に機会が残っている場合があります。</p>
          </div>
          <div className="card-list">
            {falling.map((d, i) => (
              <DemandCard key={d.id} demand={d} rank={i + 1} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
