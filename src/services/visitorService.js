// ============================================================================
// visitorService — アクセス分析のクライアント側
//
// 数え方:
//   1. このブラウザが今日まだ通知していなければ POST /api/visit を 1 回だけ送る
//   2. 送ったことを localStorage に記録する（キーは JST の日付）
//   3. 以後は何回リロードしても、何時間後に開いても訪問としては送らない
//   4. 日付が変われば別のキーになるので、翌日また 1 人として数えられる
//
// 送るもの（すべてこのブラウザの中で決まる無記名の値）:
//   visit        … その日の初回訪問か
//   visitorType  … 'new'（このブラウザで初めて来た）/ 'returning'
//   page         … そのページをその日まだ見ていなければ 1 回だけ
//   referrer     … 外部サイトから来た場合の **ホスト名だけ**
//
// **識別子は作らない・送らない。** サーバーが受け取るのは「訪問が 1 件あった」
// 「このページが 1 件見られた」という無記名の事実だけ。同一人物の判定は
// このブラウザの中で完結するので、別ブラウザ・別端末は別の人になる（仕様）。
// ============================================================================

const ENDPOINT   = '/api/visit';
const VISIT_KEY  = 'demand-atlas:visit-sent:';   // + YYYY-MM-DD
const PAGES_KEY  = 'demand-atlas:pages-sent:';   // + YYYY-MM-DD → JSON 配列
const KNOWN_KEY  = 'demand-atlas:known-visitor'; // 新規 / 再訪の判定だけに使う

/** JST の今日（サーバーの日付境界と一致させる） */
export function todayKeyJST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

const read  = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* noop */ } };
const drop  = (k) => { try { localStorage.removeItem(k); } catch { /* noop */ } };

/** 古い日付のキーを掃除する（増え続けさせない） */
function pruneOldKeys(dayKey) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if ((k.startsWith(VISIT_KEY) || k.startsWith(PAGES_KEY)) && !k.endsWith(dayKey)) drop(k);
    }
  } catch { /* noop */ }
}

/** 外部サイトから来た場合だけホスト名を返す（サイト内の遷移は対象外） */
function referrerHost() {
  try {
    if (typeof document === 'undefined' || !document.referrer) return null;
    const host = new URL(document.referrer).hostname;
    return host && host !== location.hostname ? host : null;
  } catch {
    return null;
  }
}

function pagesSentToday(dayKey) {
  try {
    const raw = read(PAGES_KEY + dayKey);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// 同時実行の抑止。StrictMode の二重実行や、タブを続けて開いた時に POST が
// 2 回飛んで 1 人が 2 人になっていた（2026-07-31 実測: 1 訪問で POST 2 回）。
let inflight = null;

/**
 * 訪問を通知し、集計を取得する。
 * 返り値の metrics / breakdowns は将来の表示追加（新規・再訪・人気ページ・
 * 流入元）用。数えられていない時は available:false で、**推定値を返さない**。
 */
export function fetchTodayVisitors(opts = {}) {
  if (!inflight) {
    inflight = requestVisits(opts).finally(() => { inflight = null; });
  }
  return inflight;
}

async function requestVisits({ path } = {}) {
  const dayKey = todayKeyJST();
  const currentPath = path || (typeof location !== 'undefined' ? location.pathname : '/');

  const firstVisitToday = read(VISIT_KEY + dayKey) !== '1';
  const seenPages = pagesSentToday(dayKey);
  const firstViewOfPage = !seenPages.includes(currentPath);
  const shouldPost = firstVisitToday || firstViewOfPage;

  // **送る前に**記録する。応答を待ってから記録すると、その間に来た 2 回目の
  // 呼び出しも「まだ送っていない」と判断して二重に数えてしまう。
  if (firstVisitToday) write(VISIT_KEY + dayKey, '1');
  if (firstViewOfPage) write(PAGES_KEY + dayKey, JSON.stringify([...seenPages, currentPath]));

  const payload = shouldPost ? {
    visit: firstVisitToday,
    visitorType: read(KNOWN_KEY) === '1' ? 'returning' : 'new',
    page: firstViewOfPage ? currentPath : null,
    referrer: firstVisitToday ? referrerHost() : null,
  } : null;

  try {
    const res = await fetch(ENDPOINT, {
      method: shouldPost ? 'POST' : 'GET',
      keepalive: shouldPost,
      headers: shouldPost
        ? { 'Content-Type': 'application/json', Accept: 'application/json' }
        : { Accept: 'application/json' },
      body: shouldPost ? JSON.stringify(payload) : undefined,
    });

    if (!res.ok) {
      rollback(dayKey, firstVisitToday, firstViewOfPage, seenPages);
      return { available: false, reason: `http-${res.status}` };
    }

    const data = await res.json();
    if (!data || data.available !== true) {
      rollback(dayKey, firstVisitToday, firstViewOfPage, seenPages);
      return { available: false, reason: data?.reason || 'unavailable' };
    }

    if (data.throttled) {
      // サーバー側で弾かれた = 数えられていない。記録を戻して次の遷移で再挑戦する
      // （戻さないと「送信済み」のまま残り、その人は二度と数えられない）
      rollback(dayKey, firstVisitToday, firstViewOfPage, seenPages);
    } else if (firstVisitToday) {
      write(KNOWN_KEY, '1');
      pruneOldKeys(dayKey);
    }

    return {
      available: true,
      schema: data.schema || null,
      date: data.date || dayKey,
      today: Number(data.today) || 0,
      yesterday: Number(data.yesterday) || 0,
      thisWeek: Number(data.thisWeek) || 0,
      thisMonth: Number(data.thisMonth) || 0,
      total: Number(data.total) || 0,
      throttled: Boolean(data.throttled),
      // 将来の表示追加はここを読むだけで足りる（新規 / 再訪 / ページ別 / 流入元別）
      metrics: data.metrics || null,
      breakdowns: data.breakdowns || null,
      countedThisVisit: firstVisitToday && !data.throttled,
    };
  } catch (err) {
    rollback(dayKey, firstVisitToday, firstViewOfPage, seenPages);
    return { available: false, reason: err?.name === 'AbortError' ? 'aborted' : 'network' };
  }
}

/** 送れていなければ記録を戻す（次回やり直せるように） */
function rollback(dayKey, didVisit, didPage, previousPages) {
  if (didVisit) drop(VISIT_KEY + dayKey);
  if (didPage) write(PAGES_KEY + dayKey, JSON.stringify(previousPages));
}

/**
 * 成長イベント（共有・回遊 CTA のクリック）を 1 件記録する。
 * サーバ側は許可リスト（api/_schema.js の ALLOWED_EVENTS）にある値だけ数える。
 * 個人情報は送らない。fire-and-forget で、失敗しても UI には影響しない。
 * 共有ループが実際に使われているかを実測するために使う。
 */
export function trackEvent(name) {
  if (typeof name !== 'string' || !name) return;
  try {
    const body = JSON.stringify({ event: name });
    // 遷移で消えないよう sendBeacon を優先（クリック直後に別ページへ飛ぶため）
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(ENDPOINT, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {});
  } catch {
    /* 計測失敗は無視 */
  }
}
