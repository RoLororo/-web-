// ============================================================================
// /api/visit — 「今日訪れた人」のカウンタ（Vercel Serverless Function）
//
//   GET   … 今日 / 昨日 / 今週 / 今月 / 累計 を返す（読むだけ）
//   POST  … 今日のカウンタを 1 増やす（ブラウザが 1 日 1 回だけ呼ぶ）
//
// 保存するのは日付ごとの整数のみ。**個人を特定できる情報は保存しない**
// （IP・UA・Cookie・識別子のいずれも保存せず、ログにも出さない）。
//
// ストアが未設定なら { available: false } を返す。UI 側はそれを見て何も
// 表示しない。**数えられていない時に推定値を出さない**のがこの機能の原則。
// ============================================================================

import { getStore, todayKey, recentDayKeys } from './_store.js';

// 同一インスタンス内の簡易レート制限。
// キーはメモリ上だけに置き、**保存も送信もしない**（プロセスが終われば消える）。
const recentPosts = new Map();
const POST_WINDOW_MS = 60 * 1000;
const POST_MAX_PER_WINDOW = 5;

function rateLimited(fingerprint) {
  const now = Date.now();
  const hits = (recentPosts.get(fingerprint) || []).filter((t) => now - t < POST_WINDOW_MS);
  hits.push(now);
  recentPosts.set(fingerprint, hits);
  if (recentPosts.size > 5000) recentPosts.clear(); // 上限を超えたら丸ごと破棄
  return hits.length > POST_MAX_PER_WINDOW;
}

/** 別サイトからの水増しを弾く（同一オリジンのみ受け付ける） */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // ブラウザ以外・同一オリジン fetch では付かないことがある
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  const store = getStore();

  if (!store) {
    // ストア未設定。エラーではなく「まだ数えていない」という状態。
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).json({ available: false, reason: 'store-not-configured' });
  }

  try {
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return res.status(403).json({ available: false, reason: 'bad-origin' });
      // レート制限のキーは Vercel が付ける転送元。**保存しない**（メモリのみ・TTL 60 秒相当）
      const fingerprint = req.headers['x-forwarded-for'] || 'unknown';
      if (rateLimited(fingerprint)) {
        const [today] = await store.readDays([todayKey()]);
        return res.status(429).json({ available: true, today, throttled: true });
      }
      const today = await store.increment(todayKey());
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ available: true, today, date: todayKey() });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ available: false, reason: 'method-not-allowed' });
    }

    // 31 日ぶんを 1 コマンドで読み、今日 / 昨日 / 今週 / 今月をここで導く。
    // 将来の表示追加（昨日・今週・今月・累計）はこの戻り値だけで足りる。
    const keys = recentDayKeys(31);
    const days = await store.readDays(keys);
    const total = await store.readTotal();

    // エッジで 60 秒キャッシュ。ページを何回開いてもストアは 1 分に 1 回しか読まない
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      available: true,
      date: keys[0],
      timezone: 'Asia/Tokyo',
      today: days[0] || 0,
      yesterday: days[1] || 0,
      thisWeek: days.slice(0, 7).reduce((a, b) => a + b, 0),
      thisMonth: days.slice(0, 31).reduce((a, b) => a + b, 0),
      total,
    });
  } catch {
    // ストア障害。**推定値を返さない**
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ available: false, reason: 'store-unavailable' });
  }
}
