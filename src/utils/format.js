// ============================================================================
// format.js — 表示用の小さなユーティリティ
// ============================================================================

/** ステータスラベル → CSS クラス */
export function statusClass(status) {
  switch (status) {
    case '急上昇': return 'hot';
    case '成長中': return 'grow';
    case '安定':   return 'stable';
    case '下降':   return 'down';
    default:       return 'stable';
  }
}

/** 変化率 → CSS クラス */
export function changeClass(change) {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}

/** 変化率の表示テキスト（符号付き） */
export function formatChange(change) {
  if (change > 0) return `+${change}%`;
  if (change < 0) return `${change}%`;
  return '±0%';
}

/** 「N時間前」「N日前」形式 */
export function timeAgo(iso) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.max(0, Math.floor((now - then) / 60000));
  if (diffMin < 60) return `${diffMin}分前`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  return `${d}日前`;
}

/** yyyy-mm-dd hh:mm 形式 */
export function formatDateTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
