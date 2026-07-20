// ============================================================================
// Favorites — 保存した需要（localStorage ベース）
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DemandCard from '../components/DemandCard.jsx';
import FoxMark from '../components/FoxMark.jsx';
import { getFavorites } from '../utils/favorites.js';
import { getDemandById } from '../services/demandService.js';
import { usePageTitle } from '../utils/usePageTitle.js';

export default function Favorites() {
  usePageTitle('お気に入りの需要 — Demand Atlas');
  const [ids, setIds] = useState(getFavorites());

  useEffect(() => {
    const handler = () => setIds(getFavorites());
    window.addEventListener('favorites-changed', handler);
    return () => window.removeEventListener('favorites-changed', handler);
  }, []);

  const items = ids.map(getDemandById).filter(Boolean);

  return (
    <section className="section container">
      <div className="section-head">
        <div>
          <h2 className="section-title">
            保存した需要 <span className="count">{items.length}件</span>
          </h2>
          <p className="section-sub">気になる需要を後から追跡できます（このブラウザに保存されます）。</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><FoxMark size={36} /></div>
          <h3>まだ保存した需要はありません</h3>
          <p>
            気になる需要を保存すると、
            ここから変化を追跡できます。
          </p>
          <Link to="/" className="btn primary">ランキングを見る</Link>
        </div>
      ) : (
        <div className="card-list">
          {items.map((d, i) => (
            <DemandCard key={d.id} demand={d} rank={i + 1} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
