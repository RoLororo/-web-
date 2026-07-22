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
