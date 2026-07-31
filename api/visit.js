// ============================================================================
// /api/visit — アクセス分析の入口（Vercel Serverless Function）
//
//   GET   … 指標（訪問者 / 新規 / 再訪）と次元別（ページ / 流入元）を返す
//   POST  … その日の初回だけブラウザが呼ぶ。該当カウンタを +1 する
//
// 分析項目を増やすときに触るのは api/_schema.js の表だけで済むようにしてある。
// このファイルは「スキーマに書いてあるものを、そのまま数えて、そのまま返す」。
//
// 保存するのは整数と許可済みの短い文字列のみ。**個人を特定できる情報は扱わない**。
// ストア未設定・障害時は { available: false } を返し、UI 側は何も表示しない
// （数えられていない時に推定値を出さないため）。
// ============================================================================

import { getStore, resolveCredentials } from './_store.js';
import {
  SCHEMA_VERSION, METRICS, DIMENSIONS,
  dayMetricKey, totalMetricKey, dayDimensionKey, dimensionIndexKey,
  todayKey, recentDayKeys,
} from './_schema.js';

// 同一インスタンス内の簡易レート制限。メモリ上だけに置き、保存も送信もしない。
const recentPosts = new Map();
const POST_WINDOW_MS = 60 * 1000;
const POST_MAX_PER_WINDOW = 20; // ページ別の通知があるので訪問 1 回で数リクエスト来る

function rateLimited(fingerprint) {
  const now = Date.now();
  const hits = (recentPosts.get(fingerprint) || []).filter((t) => now - t < POST_WINDOW_MS);
  hits.push(now);
  recentPosts.set(fingerprint, hits);
  if (recentPosts.size > 5000) recentPosts.clear();
  return hits.length > POST_MAX_PER_WINDOW;
}

/** 別サイトからの水増しを弾く（同一オリジンのみ受け付ける） */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel が解析済み
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return {};
}

// ── POST: 数える ────────────────────────────────────────────
async function handlePost(req, res, store) {
  if (!sameOrigin(req)) return res.status(403).json({ available: false, reason: 'bad-origin' });

  const fingerprint = req.headers['x-forwarded-for'] || 'unknown';
  const day = todayKey();

  if (rateLimited(fingerprint)) {
    const [today] = await store.readMany([dayMetricKey(day, 'visits')]);
    return res.status(429).json({ available: true, today, throttled: true });
  }

  const body = await readBody(req);
  const keys = [];
  const expiring = [];
  const counted = [];

  // 1) 指標。visit=true なら「訪問者」を数え、新規/再訪もここで分ける
  if (body.visit === true) {
    keys.push(dayMetricKey(day, 'visits'), totalMetricKey('visits'));
    expiring.push(dayMetricKey(day, 'visits'));
    counted.push('visits');

    const kind = body.visitorType === 'new' ? 'new' : 'returning';
    if (METRICS[kind]) {
      keys.push(dayMetricKey(day, kind));
      expiring.push(dayMetricKey(day, kind));
      if (METRICS[kind].total) keys.push(totalMetricKey(kind));
      counted.push(kind);
    }
  }

  // 2) 次元。スキーマのサニタイザを通ったものだけ数える
  const indexUpdates = [];
  for (const [name, def] of Object.entries(DIMENSIONS)) {
    const value = def.sanitize(body[name]);
    if (!value) continue;
    const key = dayDimensionKey(day, name, value);
    keys.push(key);
    expiring.push(key);
    indexUpdates.push([dimensionIndexKey(name), value]);
    counted.push(`${name}:${value}`);
  }

  if (keys.length === 0) {
    const [today] = await store.readMany([dayMetricKey(day, 'visits')]);
    return res.status(200).json({ available: true, today, counted: [] });
  }

  await store.incrementMany(keys, { expiring });
  for (const [indexKey, member] of indexUpdates) await store.addToIndex(indexKey, member);

  const [today] = await store.readMany([dayMetricKey(day, 'visits')]);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ available: true, schema: SCHEMA_VERSION, date: day, today, counted });
}

// ── GET: 集計を返す ─────────────────────────────────────────
async function handleGet(req, res, store) {
  const days = recentDayKeys(31);

  // 指標ごとに 31 日ぶんを読み、today / yesterday / thisWeek / thisMonth を導く
  const metricNames = Object.keys(METRICS);
  const metricKeys = metricNames.flatMap((m) => days.map((d) => dayMetricKey(d, m)));
  const metricValues = await store.readMany(metricKeys);
  const totalNames = metricNames.filter((m) => METRICS[m].total);
  const totals = totalNames.length ? await store.readMany(totalNames.map(totalMetricKey)) : [];

  const metrics = {};
  metricNames.forEach((name, i) => {
    const series = metricValues.slice(i * days.length, (i + 1) * days.length);
    const totalIdx = totalNames.indexOf(name);
    metrics[name] = {
      label: METRICS[name].label,
      today: series[0] || 0,
      yesterday: series[1] || 0,
      thisWeek: series.slice(0, 7).reduce((a, b) => a + b, 0),
      thisMonth: series.reduce((a, b) => a + b, 0),
      total: totalIdx >= 0 ? (totals[totalIdx] || 0) : null,
    };
  });

  // 次元別。値の一覧は SET から読むので SCAN 不要（読み取り量が有界）
  const breakdowns = {};
  for (const [name, def] of Object.entries(DIMENSIONS)) {
    const values = await store.readIndex(dimensionIndexKey(name), def.limit);
    if (values.length === 0) { breakdowns[name] = { label: def.label, items: [] }; continue; }
    const todayValues = await store.readMany(values.map((v) => dayDimensionKey(days[0], name, v)));
    const weekValues = await store.readMany(
      values.flatMap((v) => days.slice(0, 7).map((d) => dayDimensionKey(d, name, v)))
    );
    const items = values.map((value, i) => ({
      value,
      today: todayValues[i] || 0,
      thisWeek: weekValues.slice(i * 7, (i + 1) * 7).reduce((a, b) => a + b, 0),
    })).sort((a, b) => b.thisWeek - a.thisWeek || b.today - a.today);
    breakdowns[name] = { label: def.label, items };
  }

  // ページを何回開いてもストアは 1 分に 1 回しか読まない
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({
    available: true,
    schema: SCHEMA_VERSION,
    date: days[0],
    timezone: 'Asia/Tokyo',
    metrics,
    breakdowns,
    // 互換のための平坦なフィールド（既存の表示はこれだけを見ている）
    today: metrics.visits.today,
    yesterday: metrics.visits.yesterday,
    thisWeek: metrics.visits.thisWeek,
    thisMonth: metrics.visits.thisMonth,
    total: metrics.visits.total,
  });
}

/**
 * 接続診断。**値は絶対に返さない**（設定されている変数の「名前」と、実際に
 * 読めたかどうかだけ）。設定したのに出ない時の原因切り分けに使う。
 */
async function handleDiag(req, res, store) {
  const names = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const creds = resolveCredentials();
  // 実際に使っている変数名（接頭辞が何であっても検出できる）
  const present = [...new Set([...names.filter((n) => Boolean(process.env[n])), ...(creds?.names || [])])];
  let reachable = null;
  let error = null;
  if (store) {
    try { await store.readMany([totalMetricKey('visits')]); reachable = true; }
    catch (e) { reachable = false; error = String(e.message || e).slice(0, 60); }
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    schema: SCHEMA_VERSION,
    envPresent: present,          // 名前のみ。値は返さない
    envMissing: names.filter((n) => !present.includes(n)),
    storeConfigured: Boolean(store),
    storeReachable: reachable,
    error,
    hint: store
      ? (reachable ? 'ok' : 'URL / TOKEN の組み合わせを確認してください')
      : '接頭辞は任意。<接頭辞>_REST_API_URL と <接頭辞>_REST_API_TOKEN があれば動きます。設定後に再デプロイしてください',
  });
}

export default async function handler(req, res) {
  const store = getStore();

  // Vercel は req.query を用意するが、実行環境によっては url だけのこともある
  const wantsDiag = req.query?.diag === '1' || /[?&]diag=1(&|$)/.test(req.url || '');
  if (req.method === 'GET' && wantsDiag) return handleDiag(req, res, store);

  if (!store) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).json({ available: false, reason: 'store-not-configured' });
  }

  try {
    if (req.method === 'POST') return await handlePost(req, res, store);
    if (req.method === 'GET' || req.method === 'HEAD') return await handleGet(req, res, store);
    return res.status(405).json({ available: false, reason: 'method-not-allowed' });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ available: false, reason: 'store-unavailable' });
  }
}
