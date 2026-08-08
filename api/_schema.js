// ============================================================================
// アクセス分析のスキーマ（キー設計と検証）
//
// ここだけを見れば「何を、どのキーに、どう貯めているか」が分かる状態を保つ。
// 分析項目を増やすときに触るのは **この 1 ファイルの表** で、
// api/visit.js（入出力）と保存層は触らずに済むようにしてある。
//
// ── 保存するもの ──────────────────────────────────────────────
//   v1:d:<YYYY-MM-DD>:<metric>              … 日ごとの整数カウンタ
//   v1:d:<YYYY-MM-DD>:<dimension>:<value>   … 日ごと × 次元値の整数カウンタ
//   v1:t:<metric>                           … 累計の整数カウンタ
//   v1:dim:<dimension>                      … その次元に現れた値の一覧（SET）
//
// ── 保存しないもの ────────────────────────────────────────────
//   IP / User-Agent / Cookie / 訪問者 ID / URL のクエリ / 参照元のパス。
//   保存されるのは **整数と、許可リストを通った短い文字列だけ**。
// ============================================================================

export const SCHEMA_VERSION = 'visits/1.1';
export const KEY_PREFIX = 'v1';
export const DAY_TTL_SECONDS = 400 * 24 * 60 * 60;

// ── 指標（単純カウンタ）──────────────────────────────────────
// 追加するときはここに 1 行足すだけ。GET の応答にも自動で現れる。
export const METRICS = {
  visits:    { label: '訪問者', total: true },   // その日のユニーク訪問者
  new:       { label: '新規',   total: true },   // その日が初訪問だった人
  returning: { label: '再訪',   total: false },  // 以前にも来たことがある人
};

// ── 次元（値ごとに分けて数えるもの）────────────────────────
// 追加するときはここに 1 行 + サニタイザを書くだけ。
export const DIMENSIONS = {
  page: {
    label: 'ページ',
    limit: 40,          // 一覧で読む最大値数（KV の読み取りを有界にする）
    sanitize: sanitizePath,
  },
  referrer: {
    label: '流入元',
    limit: 40,
    sanitize: sanitizeReferrer,
  },
  // 成長イベント（共有・回遊 CTA のクリック）。許可リスト外は記録しない。
  // 共有ループが実際に使われているかを実測するために足す。
  event: {
    label: '操作',
    limit: 20,
    sanitize: sanitizeEvent,
  },
  // 配信元（URL の ?s=）。referrer では区別できない配信先を数えるために足す。
  // 2026-08-09 実測: referrer で分かるのは t.co / youtube.com などのホスト名だけで、
  // LINE・Discord・Slack・メールなど **コピペで貼られた経路は referrer が空** になり、
  // 「どこに配ったから来たのか」が一切分からなかった。許可リスト外は記録しない。
  source: {
    label: '配信元',
    limit: 20,
    sanitize: sanitizeSource,
  },
};

// ── サニタイズ ──────────────────────────────────────────────

/** アプリのルートに一致するパスだけを通し、ID 以外の可変部分は畳む */
const ROUTE_PATTERNS = [
  [/^\/$/,                          () => '/'],
  [/^\/rankings\/?$/,               () => '/rankings'],
  [/^\/compare\/?$/,                () => '/compare'],
  [/^\/ideas\/?$/,                  () => '/ideas'],
  [/^\/explore\/?$/,                () => '/explore'],
  [/^\/timeline\/?$/,               () => '/timeline'],
  [/^\/changes\/?$/,                () => '/changes'],
  [/^\/whats-new\/?$/,              () => '/whats-new'],
  [/^\/favorites\/?$/,              () => '/favorites'],
  [/^\/categories\/?$/,             () => '/categories'],
  [/^\/categories\/[^/]+\/?$/,      () => '/categories/:name'],
  [/^\/demand\/([a-z0-9-]{1,40})\/?$/, (m) => `/demand/${m[1]}`],
  [/^\/daily\/?$/,                  () => '/daily'],
  // 日付は :date に畳む。畳まないと 1 日 1 個ずつ次元値が増え続け、
  // v1:dim:page の SET が無限に伸びる（/categories/:name と同じ扱いにする）。
  [/^\/daily\/\d{4}-\d{2}-\d{2}\/?$/, () => '/daily/:date'],
];

export function sanitizePath(raw) {
  if (typeof raw !== 'string' || raw.length > 120) return null;
  // クエリとハッシュは落とす（検索語などが混ざらないようにする）
  const path = raw.split('?')[0].split('#')[0];
  for (const [re, build] of ROUTE_PATTERNS) {
    const m = path.match(re);
    if (m) return build(m);
  }
  return null; // 未知のパスは記録しない（任意の文字列でキーを作らせない）
}

/** 流入元は **ホスト名だけ**。パス・クエリは受け取っても捨てる */
export function sanitizeReferrer(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 253) return null;
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  if (!/^[a-z0-9.-]{3,64}$/.test(host)) return null;
  if (!host.includes('.')) return null;
  return host;
}

/** 成長イベントは許可リストのみ。未知の値でキーを作らせない */
const ALLOWED_EVENTS = new Set([
  'share_home',       // Home の急上昇ランキング共有
  'share_theme',      // テーマ詳細の共有
  'share_x',          // X（intent）での共有
  'explore_ranking',  // 「急上昇ランキングを全部見る」導線
  'copy_daily_post',  // 日次レポートの投稿文コピー（owner の配布行動の実測）
  'share_daily',      // 日次レポートの共有
  'open_daily',       // Home から日次レポートへの遷移
]);
/**
 * 配信元は許可リストのみ。URL に任意の文字列を書かれてもキーを作らせない
 * （?s=<好きな文字列> で KV に無限に値を増やされるのを防ぐ）。
 * 新しい配信先に貼るときは、ここに 1 行足してから貼る。
 */
const ALLOWED_SOURCES = new Set([
  'x',        // X（ポスト本文に手で貼る）
  'note',     // note
  'qiita',    // Qiita
  'zenn',     // Zenn
  'hatena',   // はてなブックマーク
  'reddit',   // Reddit
  'discord',  // Discord / Slack など referrer が付かないチャット
  'line',     // LINE
  'mail',     // メール
  'daily',    // 日次レポートのコピー導線から貼られたもの
  'share',    // サイト内の共有ボタン経由
]);
export function sanitizeSource(raw) {
  if (typeof raw !== 'string' || raw.length > 16) return null;
  return ALLOWED_SOURCES.has(raw) ? raw : null;
}

export function sanitizeEvent(raw) {
  if (typeof raw !== 'string' || raw.length > 32) return null;
  return ALLOWED_EVENTS.has(raw) ? raw : null;
}

// ── キー生成 ────────────────────────────────────────────────

export const dayMetricKey = (day, metric) => `${KEY_PREFIX}:d:${day}:${metric}`;
export const totalMetricKey = (metric) => `${KEY_PREFIX}:t:${metric}`;
export const dayDimensionKey = (day, dimension, value) => `${KEY_PREFIX}:d:${day}:${dimension}:${value}`;
export const dimensionIndexKey = (dimension) => `${KEY_PREFIX}:dim:${dimension}`;

/** JST の「今日」。日本向けサイトなので日付境界は Asia/Tokyo で固定する */
export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function dayKeyBefore(days, now = new Date()) {
  return todayKey(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}

/** 直近 n 日ぶんのキー（[today, 昨日, …]） */
export function recentDayKeys(n, now = new Date()) {
  return Array.from({ length: n }, (_, i) => dayKeyBefore(i, now));
}
