// ============================================================================
// 訪問カウンタの保存層（サーバーレス）
//
// 保存するのは整数カウンタと、次元値の一覧（短い文字列）だけ。
// **誰が来たかは保存しない。** IP・User-Agent・Cookie・識別子は保存も送信もせず、
// ログにも出さない。「同じ人を 1 日 1 回だけ数える」判定はブラウザ側で行い、
// サーバーは無記名の「1 増やして」を受け取るだけ。
//
// driver は env で決まる。未設定なら null（= 機能そのものを出さない）。
// キー設計は api/_schema.js に集約してあり、この層は**キーの意味を知らない**。
// ============================================================================

import { DAY_TTL_SECONDS } from './_schema.js';

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

  const pipeline = async (commands) => {
    if (commands.length === 0) return [];
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`store ${res.status}`);
    const json = await res.json();
    return (Array.isArray(json) ? json : []).map((r) => r.result);
  };

  return {
    name: 'redis-rest',

    /**
     * 複数キーをまとめて +1 する。
     * ttlKeys に入れたキーには初回だけ有効期限を張る（日別キーの無限増殖を防ぐ）。
     */
    async incrementMany(keys, { expiring = [] } = {}) {
      if (keys.length === 0) return [];
      const results = await pipeline(keys.map((k) => ['INCR', k]));
      const firstTimeExpiring = keys
        .map((k, i) => ({ k, isFirst: Number(results[i]) === 1 }))
        .filter((x) => x.isFirst && expiring.includes(x.k));
      if (firstTimeExpiring.length) {
        await pipeline(firstTimeExpiring.map((x) => ['EXPIRE', x.k, String(DAY_TTL_SECONDS)]));
      }
      return results.map((v) => Number(v) || 0);
    },

    /** 複数キーをまとめて読む（1 コマンド） */
    async readMany(keys) {
      if (keys.length === 0) return [];
      const values = await call(['MGET', ...keys]);
      return (values || []).map((v) => Number(v) || 0);
    },

    /** 次元値の一覧に追加する（重複は自動で無視される） */
    async addToIndex(indexKey, member) {
      await call(['SADD', indexKey, member]);
    },

    /**
     * 本文を 1 件保存する（お問い合わせ用）。
     * カウンタと違って上書きも加算もしないので、必ず新しいキーを渡すこと。
     * ttlSeconds を必ず要求するのは、置きっぱなしにしないため
     * （利用者が書いた文章を無期限に持ち続ける理由がない）。
     */
    async pushMessage(key, value, ttlSeconds) {
      await call(['SET', key, value, 'EX', String(ttlSeconds)]);
    },

    /** 保存した本文を読む。運用者が CLI から読むためだけに使う */
    async readMessage(key) {
      return call(['GET', key]);
    },

    /** キーの残り寿命（秒）。-1 = 無期限、-2 = キーが無い */
    async ttl(key) {
      const v = await call(['TTL', key]);
      return Number(v);
    },

    /** 次元値の一覧を読む（limit で読み過ぎを防ぐ） */
    async readIndex(indexKey, limit = 100) {
      const members = await call(['SMEMBERS', indexKey]);
      return (members || []).slice(0, limit);
    },
  };
}

/**
 * env から driver を組み立てる。
 * Vercel KV / Upstash どちらの変数名でも動く（移行時に書き換え不要）。
 */
export function resolveCredentials(env = process.env) {
  // 1) よくある名前をそのまま探す
  const pairs = [
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  ];
  for (const [u, t] of pairs) {
    if (env[u] && env[t]) return { url: env[u], token: env[t], names: [u, t] };
  }
  // 2) Vercel の Marketplace 連携は接頭辞を自由に付けられる
  //    （STORAGE_REST_API_URL のように任意の名前になる）。
  //    末尾で機械的に見つけ、同じ接頭辞の TOKEN と組にする。
  for (const key of Object.keys(env)) {
    const m = key.match(/^(.*)_REST_API_URL$/);
    if (!m || !env[key]) continue;
    const tokenKey = `${m[1]}_REST_API_TOKEN`;
    if (env[tokenKey]) return { url: env[key], token: env[tokenKey], names: [key, tokenKey] };
  }
  return null;
}

export function getStore(env = process.env) {
  const creds = resolveCredentials(env);
  if (!creds) return null; // 未設定 = 機能を出さない
  return redisRestDriver({ url: creds.url, token: creds.token });
}
