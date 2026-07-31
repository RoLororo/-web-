// ============================================================================
// visitorService — 「今日訪れた人」
//
// 数え方:
//   1. このブラウザが今日まだ通知していなければ POST /api/visit を 1 回だけ送る
//   2. 送ったことを localStorage に記録する（キーは JST の日付）
//   3. 以後は何回リロードしても、何ページ見ても、何時間後に開いても送らない
//   4. 日付が変われば別のキーになるので、翌日また 1 人として数えられる
//
// サーバーは「1 増やして」という無記名の通知を受け取るだけで、**誰が来たかは
// 保存も送信もしない**。同一人物の判定はこのブラウザの中で完結する。
// つまり別ブラウザ・別端末は別の人として数えられる（仕様どおり）。
// ============================================================================

const ENDPOINT = '/api/visit';
const KEY_PREFIX = 'demand-atlas:visit-sent:';

/** JST の今日（サーバーの日付境界と一致させる） */
export function todayKeyJST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function alreadySentToday(dayKey) {
  try {
    return localStorage.getItem(KEY_PREFIX + dayKey) === '1';
  } catch {
    return false; // localStorage が使えない環境では毎回送る（重複は許容）
  }
}

function markSentToday(dayKey) {
  try {
    localStorage.setItem(KEY_PREFIX + dayKey, '1');
    // 古い日付のキーを掃除する（増え続けさせない）
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX) && k !== KEY_PREFIX + dayKey) localStorage.removeItem(k);
    }
  } catch {
    /* 保存できなくても表示は続ける */
  }
}

function clearSentToday(dayKey) {
  try {
    localStorage.removeItem(KEY_PREFIX + dayKey);
  } catch {
    /* noop */
  }
}

// 同時実行の抑止。StrictMode の二重実行や、タブを続けて開いた時に POST が
// 2 回飛んで 1 人が 2 人になっていた（2026-07-31 実測: 1 訪問で POST 2 回）。
let inflight = null;

/**
 * 今日の訪問者数を取得する。必要ならこのブラウザぶんを 1 回だけ通知する。
 * 返り値は常にこの形。数えられていない時は available: false で、
 * **推定値やゼロを「実測値」として返さない**。
 */
export function fetchTodayVisitors(opts = {}) {
  if (!inflight) {
    inflight = requestTodayVisitors(opts).finally(() => { inflight = null; });
  }
  return inflight;
}

async function requestTodayVisitors({ signal } = {}) {
  const dayKey = todayKeyJST();
  const shouldSend = !alreadySentToday(dayKey);
  // **送る前に**記録する。応答を待ってから記録すると、その間に来た 2 回目の
  // 呼び出しも「まだ送っていない」と判断して二重に数えてしまう。
  if (shouldSend) markSentToday(dayKey);

  try {
    const res = await fetch(ENDPOINT, {
      method: shouldSend ? 'POST' : 'GET',
      signal,
      keepalive: shouldSend,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      if (shouldSend) clearSentToday(dayKey); // 届かなかったので次回やり直す
      return { available: false, reason: `http-${res.status}` };
    }

    const data = await res.json();
    if (!data || data.available !== true) {
      if (shouldSend) clearSentToday(dayKey);
      return { available: false, reason: data?.reason || 'unavailable' };
    }

    return {
      available: true,
      today: Number(data.today) || 0,
      // 将来の表示追加（昨日 / 今週 / 今月 / 累計）はここを読むだけで足りる
      yesterday: Number(data.yesterday) || 0,
      thisWeek: Number(data.thisWeek) || 0,
      thisMonth: Number(data.thisMonth) || 0,
      total: Number(data.total) || 0,
      date: data.date || dayKey,
      countedThisVisit: shouldSend,
    };
  } catch (err) {
    if (shouldSend) clearSentToday(dayKey); // 送れていないので記録を戻す
    if (err?.name === 'AbortError') return { available: false, reason: 'aborted' };
    return { available: false, reason: 'network' };
  }
}
