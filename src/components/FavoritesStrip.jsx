// ============================================================================
// FavoritesStrip — Home「お気に入りの今日」ストリップ
//
//   ■ 目的
//     お気に入り登録済みテーマの「今日の動き」を Home 上部にまとめて出す。
//     0 件時は空状態を出して「お気に入り」機能そのものを教える。
//
//   ■ 挙動
//     - localStorage の favorites を読み、favorites-changed イベントで再描画
//     - allDemands から favorite id をフィルタ → 元の score 順で表示
//     - 各カードに historyMove (biggestMoverOfTheme の結果) を貼る
//
//   ■ 空状態
//     - お気に入り 0 件 → 「お気に入りに登録すると〜」を短く出す
//     - allDemands 空 → 何も出さない
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFavorites } from '../utils/favorites.js';
import { sourceDisplay } from '../services/sourceCatalog.js';

export default function FavoritesStrip({ allDemands = [], historyMovers = {} }) {
  const [favIds, setFavIds] = useState(() => getFavorites());

  useEffect(() => {
    const handler = () => setFavIds(getFavorites());
    window.addEventListener('favorites-changed', handler);
    // 別タブでの変更にも追随
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('favorites-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  if (!allDemands || allDemands.length === 0) return null;

  const favSet = new Set(favIds);
  const favorites = allDemands.filter((d) => favSet.has(d.id));

  if (favorites.length === 0) {
    return (
      <section className="section container fav-strip-empty">
        <div className="fav-strip-empty-body">
          <div className="fav-strip-empty-icon" aria-hidden>☆</div>
          <div>
            <div className="fav-strip-empty-head">お気に入りに登録すると、ここに集まります</div>
            <div className="fav-strip-empty-desc">
              各テーマの★ボタンから登録。毎日の動きを一望できます。
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section container fav-strip">
      <div className="section-head" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="section-title">
            お気に入りの今日
            <span className="count">{favorites.length}件</span>
          </h2>
          <p className="section-sub">登録したテーマの直近の動きです。</p>
        </div>
        <Link to="/favorites" className="section-link">お気に入り一覧 →</Link>
      </div>

      <ul className="fav-tile-grid">
        {favorites.map((d) => {
          const move = historyMovers[d.id];
          const hasMove = move && isFinite(move.pctChange);
          const cls = hasMove ? (move.pctChange >= 0 ? 'up' : 'down') : 'flat';
          return (
            <li key={d.id}>
              <Link to={`/demand/${d.id}`} className="fav-tile">
                <div className="fav-tile-cat">{d.category}</div>
                <div className="fav-tile-title">{d.title}</div>
                <div className="fav-tile-foot">
                  <span className="fav-tile-score">
                    <span className="fav-tile-score-label">score</span>
                    <span className="fav-tile-score-val">{d.score}</span>
                  </span>
                  {hasMove ? (
                    <span className={`fav-tile-move ${cls}`}>
                      {move.pctChange >= 0 ? '↑' : '↓'} {Math.abs(Math.round(move.pctChange))}%
                      <span className="fav-tile-move-src">
                        {sourceDisplay(move.source)}
                      </span>
                    </span>
                  ) : (
                    <span className="fav-tile-move flat">— まだ変化なし</span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
