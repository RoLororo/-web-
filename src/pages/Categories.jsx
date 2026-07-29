// ============================================================================
// Categories — 分野の一覧
// ============================================================================

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCategorySummaries } from '../services/demandService.js';
import { usePageTitle } from '../utils/usePageTitle.js';

export default function Categories() {
  usePageTitle('分野から探す — Demand Atlas');
  const nav = useNavigate();
  const cats = useMemo(() => getCategorySummaries(), []);
  // 観測テーマが 0 件の分野はカードにしない。
  //   実測 (2026-07-30): 9 分野中 6 分野が 0 件で、いずれも「まだ需要が登録され
  //   ていません」だけのページに着地する行き止まりだった。カードから外し、
  //   準備中であることだけを 1 行で示す。
  const active = useMemo(() => cats.filter((c) => c.count > 0), [cats]);
  const upcoming = useMemo(() => cats.filter((c) => c.count === 0), [cats]);

  return (
    <section className="section container">
      <div className="section-head">
        <div>
          <h1 className="section-title">分野から探す</h1>
          <p className="section-sub">
            各分野の需要動向を俯瞰し、興味のあるテーマを掘り下げてください。
          </p>
        </div>
      </div>

      <div className="cat-grid">
        {active.map((c, i) => (
          <button
            key={c.name}
            className="cat-card"
            onClick={() => nav(`/categories/${encodeURIComponent(c.name)}`)}
            style={{ '--i': i }}
          >
            <div className="cat-name">{c.name}</div>
            <div className="cat-desc">{c.description}</div>
            {c.topDemand && (
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                注目：<strong style={{ color: 'var(--text)' }}>{c.topDemand.title}</strong>
              </div>
            )}
            <div className="cat-meta">
              <span><span className="k">登録数 </span><span className="v">{c.count}</span></span>
              <span>
                <span className="k">平均変化率 </span>
                <span className={`v ${c.avgChange > 0 ? 'up' : c.avgChange < 0 ? 'down' : ''}`}>
                  {c.avgChange > 0 ? `+${c.avgChange}%` : `${c.avgChange}%`}
                </span>
              </span>
            </div>
          </button>
        ))}
      </div>

      {upcoming.length > 0 && (
        <p className="cat-upcoming">
          観測準備中の分野：{upcoming.map((c) => c.name).join(' / ')}
        </p>
      )}
    </section>
  );
}
