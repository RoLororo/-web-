// ============================================================================
// favorites.js
//
// お気に入り機能。ログイン機能はまだ無いので、
// ブラウザの localStorage に保存する。
//
// 将来ログインを実装するときは、この関数の中を API 呼び出しに置き換える。
// ============================================================================

const KEY = 'demand-atlas:favorites';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('favorites-changed'));
  } catch {
    /* ignore */
  }
}

export function getFavorites() {
  return read();
}

export function isFavorite(id) {
  return read().includes(id);
}

export function toggleFavorite(id) {
  const list = read();
  const idx = list.indexOf(id);
  if (idx === -1) list.push(id);
  else list.splice(idx, 1);
  write(list);
  return list.includes(id);
}
