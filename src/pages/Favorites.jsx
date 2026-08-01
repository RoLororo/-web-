// ============================================================================
// Favorites — 保存した需要（localStorage ベース）
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DemandCard from '../components/DemandCard.jsx';
import FoxMark from '../components/FoxMark.jsx';
import { getFavorites } from '../utils/favorites.js';
import { getDemandById } from '../services/demandService.js';
import { useSeo } from '../utils/useSeo.js';

export default function Favorites() {
  // 中身は端末ごとに違い、他人が開くと必ず空になる。
  // 検索結果に出しても価値がないので索引から外す（sitemap にも入れていない）。
  useSeo({
    title: 'お気に入りの需要 — Demand Atlas',
    description: 'この端末で保存した需要テーマの一覧です。',
    path: '/favorites',
    noindex: true,
  });
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
          {/* ページ唯一の見出しなので h1。.section-title のみで装飾しているため
              見た目は h2 の時と同一 */}
          <h1 className="section-title">
            保存した需要 <span className="count">{items.length}件</span>
          </h1>
          <p className="section-sub">気になる需要を後から追跡できます（このブラウザに保存されます）。</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><FoxMark size={36} /></div>
          <h2>まだ保存した需要はありません</h2>
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
