// ============================================================================
// 訪問カウンタの保存層（サーバーレス）
//
// 保存するのは「日付 → 整数」だけ。
//   visits:day:YYYY-MM-DD  … その日に届いた訪問通知の数
//   visits:total           … 累計
//
// **誰が来たかは一切保存しない。** IP・User-Agent・Cookie・識別子を保存も送信も
// しない。「同じ人を 1 日 1 回だけ数える」判定はブラウザ側の localStorage で行い、
// サーバーは「1 増やして」という無記名の通知を受け取るだけ。
//
// driver は env で決まる。未設定なら null driver（= 機能を出さない）。
// これは既存 scripts/lib/storage.mjs と同じ「アダプタを差し替える」方針に合わせた。
// ============================================================================

const DAY_TTL_SECONDS = 400 * 24 * 60 * 60; // 400 日で自然消滅（無限増殖の防止）

/** Upstash / Vercel KV の REST API を叩く driver（無料枠で動く） */
function redisRestDriver({ url, token }) {
  const call = async (command) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`store ${res.status}`);
    const json = await res.json();
    return json.result;
  };

  return {
    name: 'redis-rest',
    /** 当日カウンタを 1 増やして、増やした後の値を返す */
    async increment(dayKey) {
      const value = await call(['INCR', `visits:day:${dayKey}`]);
      // 初回だけ TTL を張る（2 回目以降の EXPIRE は無害だがコマンドを節約する）
      if (value === 1) await call(['EXPIRE', `visits:day:${dayKey}`, String(DAY_TTL_SECONDS)]);
      await call(['INCR', 'visits:total']);
      return Number(value) || 0;
    },
    /** 複数日ぶんをまとめて読む（1 コマンド） */
    async readDays(dayKeys) {
      const values = await call(['MGET', ...dayKeys.map((d) => `visits:day:${d}`)]);
      return (values || []).map((v) => Number(v) || 0);
    },
    async readTotal() {
      const value = await call(['GET', 'visits:total']);
      return Number(value) || 0;
    },
  };
}

/**
 * env から driver を組み立てる。
 * Vercel KV / Upstash どちらの変数名でも動くようにしてある（移行時に書き換え不要）。
 */
export function getStore(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // 未設定 = 機能そのものを出さない
  return redisRestDriver({ url, token });
}

/** JST の「今日」。日本向けのサイトなので日付境界は Asia/Tokyo で固定する */
export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** today から n 日前のキー（0 = today） */
export function dayKeyBefore(days, now = new Date()) {
  return todayKey(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}

/** 直近 n 日ぶんのキー（[today, 昨日, …]） */
export function recentDayKeys(n, now = new Date()) {
  return Array.from({ length: n }, (_, i) => dayKeyBefore(i, now));
}
