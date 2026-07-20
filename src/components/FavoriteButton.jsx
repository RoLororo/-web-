import { useEffect, useState } from 'react';
import { isFavorite, toggleFavorite } from '../utils/favorites.js';

export default function FavoriteButton({ demandId, label = true }) {
  const [fav, setFav] = useState(false);

  useEffect(() => {
    setFav(isFavorite(demandId));
    const handler = () => setFav(isFavorite(demandId));
    window.addEventListener('favorites-changed', handler);
    return () => window.removeEventListener('favorites-changed', handler);
  }, [demandId]);

  function onClick(e) {
    e.stopPropagation();
    e.preventDefault();
    setFav(toggleFavorite(demandId));
  }

  return (
    <button
      className={`btn ${fav ? 'fav-active' : ''}`}
      onClick={onClick}
      aria-pressed={fav}
      aria-label={fav ? 'お気に入りを解除' : 'お気に入りに追加'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill={fav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
      </svg>
      {label && (fav ? '保存済み' : '保存する')}
    </button>
  );
}
