// ============================================================================
// historyService — public/history/ から日次スナップショット履歴を fetch
//
//   ■ 目的
//     Vercel 配信の /history/index.json + /history/current/{theme}.jsonl を
//     fetch し、UI から扱いやすい形に整形して提供する。
//
//   ■ 提供 API (すべて Promise ベース、初回 fetch 後は内部キャッシュ)
//     loadIndex()            → { themes: [...], sources: [...], generatedAt }
//     loadTimeseries(themeId) → [{date, generatedAt, sources: {...}}] 昇順
//     loadAllTimeseries()    → { [themeId]: [...records] } 全テーマ
//     getAggregateStats()    → 全体の蓄積統計 (総日数/レコード数/ソース数)
//
//   ■ 設計原則
//     - fetch 失敗時はエラーを throw せず null / [] を返す (UI 側で保険表示)
//     - JSONL の壊れ行は skip (整合性劣化への耐性)
//     - キャッシュは in-memory (SPA 内、再訪でも保持)
//     - 100 ソース時代を想定: index.json ベースで動的にソース列挙
// ============================================================================

const HISTORY_BASE = `${import.meta.env.BASE_URL}history`;

let _indexPromise = null;
const _timeseriesCache = new Map();

// ---------------------------------------------------------------------------
// 内部: JSONL パース (壊れ行スキップ)
// ---------------------------------------------------------------------------

function parseJsonl(text) {
  if (!text) return [];
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const records = [];
  for (const line of lines) {
    try {
      const rec = JSON.parse(line);
      if (rec && typeof rec === 'object' && typeof rec.date === 'string') {
        records.push(rec);
      }
    } catch {
      /* skip corrupt line */
    }
  }
  // date 昇順に確実にソート
  records.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return records;
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

/**
 * history/index.json をロード。失敗時は null。
 * SPA 内で 1 度だけ fetch、以降キャッシュ。
 */
export function loadIndex() {
  if (_indexPromise) return _indexPromise;
  _indexPromise = fetch(`${HISTORY_BASE}/index.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .catch((err) => {
      console.warn('[historyService] index.json load failed:', err.message);
      return null;
    });
  return _indexPromise;
}

/**
 * 1 テーマの current jsonl をロード。失敗時は []。
 */
export async function loadTimeseries(themeId) {
  if (_timeseriesCache.has(themeId)) return _timeseriesCache.get(themeId);
  const promise = fetch(`${HISTORY_BASE}/current/${themeId}.jsonl`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then((text) => parseJsonl(text))
    .catch((err) => {
      console.warn(`[historyService] timeseries load failed for ${themeId}:`, err.message);
      return [];
    });
  _timeseriesCache.set(themeId, promise);
  return promise;
}

/**
 * 全テーマの current jsonl をパラレルロード。失敗テーマは [] で返る。
 * 戻り値: { themeId: [records] } の Map ではなく Object
 */
export async function loadAllTimeseries() {
  const index = await loadIndex();
  if (!index || !Array.isArray(index.themes)) return {};
  const themeIds = index.themes.map((t) => t.id);
  const results = await Promise.all(themeIds.map((id) => loadTimeseries(id)));
  const out = {};
  themeIds.forEach((id, i) => { out[id] = results[i]; });
  return out;
}

/**
 * 蓄積統計。ダッシュボード表示用。
 * 履歴が未生成 or 取れない場合はゼロ値を返す。
 */
export async function getAggregateStats() {
  const index = await loadIndex();
  if (!index) {
    return {
      themeCount: 0,
      sourceCount: 0,
      totalRecords: 0,
      firstDate: null,
      lastDate: null,
      dayCount: 0,
      sourceIds: [],
    };
  }
  const themes = index.themes || [];
  const sources = index.sources || [];

  // 集計は index.json の recordCount / firstDate / lastDate から
  let totalRecords = 0;
  let firstDate = null;
  let lastDate = null;
  for (const t of themes) {
    totalRecords += (t.recordCount || 0);
    if (t.firstDate && (!firstDate || t.firstDate < firstDate)) firstDate = t.firstDate;
    if (t.lastDate  && (!lastDate  || t.lastDate  > lastDate))  lastDate  = t.lastDate;
  }

  // dayCount: firstDate 〜 lastDate の日数
  let dayCount = 0;
  if (firstDate && lastDate) {
    const ms = new Date(lastDate + 'T00:00:00Z') - new Date(firstDate + 'T00:00:00Z');
    dayCount = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  }

  return {
    themeCount:   themes.length,
    sourceCount:  sources.length,
    totalRecords,
    firstDate,
    lastDate,
    dayCount,
    sourceIds:    sources.map((s) => s.id),
  };
}

// ---------------------------------------------------------------------------
// メトリクス抽出ヘルパー (UI で頻用する型変換を集約)
// ---------------------------------------------------------------------------

/**
 * 1 レコードの sources 内から数値メトリクスを抽出して flat 化する。
 * 戻り値: { 'qiita.volume': 12, 'qiita.engagement': 0, ... }
 */
export function flattenMetrics(record) {
  const out = {};
  if (!record || !record.sources) return out;
  for (const [srcId, src] of Object.entries(record.sources)) {
    if (src && src.metrics) {
      for (const [k, v] of Object.entries(src.metrics)) {
        if (typeof v === 'number') out[`${srcId}.${k}`] = v;
      }
    }
    if (src && src.nativeMetrics) {
      for (const [k, v] of Object.entries(src.nativeMetrics)) {
        if (typeof v === 'number') out[`${srcId}.native.${k}`] = v;
      }
    }
  }
  return out;
}

/**
 * 1 テーマの時系列から、指定した metric key の日次配列を抽出。
 * 例: extractSeries(records, 'arxiv.volume') → [{date, value}, ...]
 */
export function extractSeries(records, metricKey) {
  const out = [];
  for (const rec of records) {
    const flat = flattenMetrics(rec);
    if (metricKey in flat) {
      out.push({ date: rec.date, value: flat[metricKey] });
    }
  }
  return out;
}

/**
 * 2 レコード間 (最新 vs N 日前) の差分を計算。
 * 戻り値: { [source.metric]: { current, previous, delta, pctChange } }
 */
export function diffRecords(current, previous) {
  const out = {};
  const curFlat = flattenMetrics(current);
  const prevFlat = flattenMetrics(previous);
  const allKeys = new Set([...Object.keys(curFlat), ...Object.keys(prevFlat)]);
  for (const k of allKeys) {
    const c = curFlat[k];
    const p = prevFlat[k];
    if (c === undefined || p === undefined) continue;
    const delta = c - p;
    const pctChange = p !== 0 ? (delta / p) * 100 : null;
    out[k] = { current: c, previous: p, delta, pctChange };
  }
  return out;
}

// ---------------------------------------------------------------------------
// 横断ヘルパー: 全テーマ × 全 source × metric のランキング / 発見
// ---------------------------------------------------------------------------

/**
 * 最新 record から N 日前 record を探す (records は date 昇順)。
 * 見つからなければ最古の record を previous とする。
 */
function findPreviousRecord(records, daysBack) {
  if (!records || records.length < 2) return null;
  const latest = records[records.length - 1];
  const latestMs = new Date(latest.date + 'T00:00:00Z').getTime();
  const target   = latestMs - daysBack * 24 * 60 * 60 * 1000;
  let best = null;
  for (const rec of records) {
    if (rec.date === latest.date) continue;
    const ms = new Date(rec.date + 'T00:00:00Z').getTime();
    if (ms <= target) {
      if (!best || rec.date > best.date) best = rec;
    }
  }
  // 履歴が短い場合は最古 (latest 以外で最も古い) を fallback
  if (!best && records.length >= 2) best = records[0];
  return best;
}

/**
 * 全テーマの current jsonl を横断し、
 * (theme × source × metric) 単位で「N 日前 → 最新」の差分を計算。
 * ソート済み配列を返す (絶対 delta 降順 or pctChange 降順は caller が選ぶ)。
 *
 * 戻り値: Array<{ themeId, source, metric, previous, current, delta, pctChange, previousDate, currentDate }>
 */
export function computeAllDiffs(allSeries, daysBack, { onlyMetrics = true } = {}) {
  const out = [];
  for (const [themeId, records] of Object.entries(allSeries)) {
    if (!records || records.length < 2) continue;
    const current = records[records.length - 1];
    const previous = findPreviousRecord(records, daysBack);
    if (!previous || previous.date === current.date) continue;

    const diff = diffRecords(current, previous);
    for (const [key, v] of Object.entries(diff)) {
      const parts = key.split('.');
      // parts: [source, metric] or [source, 'native', name]
      if (onlyMetrics && parts[1] === 'native') continue;
      const source = parts[0];
      const metric = parts[1] === 'native' ? parts.slice(2).join('.') : parts[1];
      const isNative = parts[1] === 'native';
      out.push({
        themeId,
        source,
        metric,
        isNative,
        previous: v.previous,
        current: v.current,
        delta: v.delta,
        pctChange: v.pctChange,
        previousDate: previous.date,
        currentDate: current.date,
      });
    }
  }
  return out;
}

/**
 * 全テーマの current jsonl を横断し、
 * (theme × source × metric) の最新値を取得。ソースネイティブスケール。
 * volume-only 相当。ランキング表示用。
 */
export function computeCurrentValues(allSeries, metric = 'volume') {
  const out = [];
  for (const [themeId, records] of Object.entries(allSeries)) {
    if (!records || records.length === 0) continue;
    const latest = records[records.length - 1];
    for (const [srcId, src] of Object.entries(latest.sources || {})) {
      const v = src?.metrics?.[metric];
      if (typeof v === 'number') {
        out.push({ themeId, source: srcId, metric, value: v, date: latest.date });
      }
    }
  }
  return out;
}

/**
 * index.json.sources[] から「firstSeenDate が新しい順」= 新登場ソース。
 */
export function newlyAppearedSources(indexData, daysWindow = 30) {
  if (!indexData || !Array.isArray(indexData.sources)) return [];
  const now = new Date();
  const cutoffMs = now.getTime() - daysWindow * 24 * 60 * 60 * 1000;
  return indexData.sources
    .filter((s) => s.firstSeenDate && new Date(s.firstSeenDate + 'T00:00:00Z').getTime() >= cutoffMs)
    .sort((a, b) => (a.firstSeenDate < b.firstSeenDate ? 1 : -1));
}

/**
 * 全テーマ × 全 (source, metric) について、
 * 「過去のいずれかの record では null/欠損だったが、最新 record では値がある」
 * 組み合わせを検出。= 新しく取れるようになった metric = 新登場データ。
 */
export function newlyAppearedMetrics(allSeries) {
  const out = [];
  for (const [themeId, records] of Object.entries(allSeries)) {
    if (!records || records.length < 2) continue;
    const latest = records[records.length - 1];
    const latestFlat = flattenMetrics(latest);
    // 過去の全 record にあった keys を union
    const historicalKeys = new Set();
    for (let i = 0; i < records.length - 1; i++) {
      for (const k of Object.keys(flattenMetrics(records[i]))) historicalKeys.add(k);
    }
    for (const key of Object.keys(latestFlat)) {
      if (!historicalKeys.has(key)) {
        const [source, ...rest] = key.split('.');
        out.push({
          themeId, source,
          metric: rest.join('.'),
          value: latestFlat[key],
          firstDate: latest.date,
        });
      }
    }
  }
  return out;
}

/**
 * 履歴の「深さ」= current 内の distinct 日数 (最大値)。
 * UI が「7 日/30 日セレクタを出すか」を判定するのに使う。
 * 例: 履歴 2 日しかない場合、7 日セレクタは無意味なので隠す。
 */
export function historyDepthDays(allSeries) {
  const dateSet = new Set();
  for (const records of Object.values(allSeries || {})) {
    for (const rec of records) if (rec && rec.date) dateSet.add(rec.date);
  }
  return dateSet.size;
}

/**
 * 1 テーマの「最新 vs 1 日前 (or 直前 record)」で、最も動いた
 * (source, metric) を 1 つだけ返す。DemandCard の badge 用。
 * 戻り値: { source, metric, delta, pctChange, current, previous } or null
 */
export function biggestMoverOfTheme(records) {
  if (!records || records.length < 2) return null;
  const current = records[records.length - 1];
  const previous = records[records.length - 2];
  const diff = diffRecords(current, previous);
  let best = null;
  for (const [key, v] of Object.entries(diff)) {
    // metrics/volume に絞る (共通スケール指標)
    const [source, metric] = key.split('.');
    if (metric !== 'volume') continue;
    if (v.previous === 0) continue; // 0 除算避け
    if (!isFinite(v.pctChange)) continue;
    if (!best || Math.abs(v.pctChange) > Math.abs(best.pctChange)) {
      best = { source, metric, ...v };
    }
  }
  return best;
}

/**
 * index.json の themes[] から日次更新件数を集計。
 * = テーマ×日ごとにレコードが 1 個増えるので、日別の書き込み件数を返す。
 * ただし直接には index からは取れない。allSeries から集計する。
 * 戻り値: [{ date, recordCount, themeCount, sourceCount }]
 */
export function dailyActivity(allSeries) {
  const byDate = new Map();
  for (const [themeId, records] of Object.entries(allSeries)) {
    for (const rec of records) {
      if (!byDate.has(rec.date)) {
        byDate.set(rec.date, { date: rec.date, records: 0, themes: new Set(), sources: new Set() });
      }
      const b = byDate.get(rec.date);
      b.records++;
      b.themes.add(themeId);
      for (const src of Object.keys(rec.sources || {})) b.sources.add(src);
    }
  }
  return [...byDate.values()]
    .map((b) => ({
      date: b.date,
      recordCount: b.records,
      themeCount: b.themes.size,
      sourceCount: b.sources.size,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
