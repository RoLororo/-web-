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
export function getStore(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // 未設定 = 機能を出さない
  return redisRestDriver({ url, token });
}
