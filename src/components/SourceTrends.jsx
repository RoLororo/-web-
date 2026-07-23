// ============================================================================
// SourceTrends
// 1 テーマの詳細ページ用: history/current/{themeId}.jsonl を読み、
// ソース × 主要 metric ごとに 30 日 (or 利用可能な最大日数) のスパークラインを表示。
//
// 履歴が 1 日しか無い場合はレコードカウントのみ表示し、グラフは出さない。
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { loadTimeseries, flattenMetrics } from '../services/historyService.js';
import { sourceDisplay, sourceColor, sourceUnit, sourceIsUnstable, metricLabel } from '../services/sourceCatalog.js';
import Sparkline from './Sparkline.jsx';

export default function SourceTrends({ themeId }) {
  const [records, setRecords] = useState(null);

  useEffect(() => {
    if (!themeId) return;
    loadTimeseries(themeId).then(setRecords);
  }, [themeId]);

  const sourcesFound = useMemo(() => {
    if (!records || records.length === 0) return [];
    // 最新レコードから存在するソース id を採る
    const latest = records[records.length - 1];
    return Object.keys(latest.sources || {}).sort();
  }, [records]);

  // 各 source × metric のシリーズを構築
  // { [sourceId]: [{ metricKey, label, values: [numbers], last }] }
  const seriesBySource = useMemo(() => {
    if (!records || records.length === 0) return {};
    const out = {};
    for (const src of sourcesFound) {
      const seriesArr = [];
      // 各 metric に対して値の時系列を集める
      const metricKeys = new Set();
      for (const rec of records) {
        const m = rec.sources?.[src]?.metrics;
        if (m) for (const k of Object.keys(m)) {
          if (typeof m[k] === 'number') metricKeys.add(k);
        }
      }
      for (const mk of metricKeys) {
        const values = [];
        for (const rec of records) {
          const v = rec.sources?.[src]?.metrics?.[mk];
          if (typeof v === 'number') values.push(v);
        }
        if (values.length === 0) continue;
        seriesArr.push({
          metricKey: mk,
          label: metricLabel(mk),
          values,
          last: values[values.length - 1],
        });
      }
      if (seriesArr.length > 0) out[src] = seriesArr;
    }
    return out;
  }, [records, sourcesFound]);

  if (records === null) {
    return <div className="source-trends-loading">履歴データを読み込み中…</div>;
  }
  if (records.length === 0) {
    return null; // 履歴なしなら表示しない
  }

  return (
    <div className="source-trends">
      <div className="source-trends-head">
        <div className="source-trends-title">情報源別の時系列</div>
        <div className="source-trends-sub">
          このテーマに関する各情報源の観測値の推移。
          日数: {records.length} 日 ({records[0].date} 〜 {records[records.length - 1].date})
        </div>
      </div>

      {sourcesFound.length === 0 && (
        <div className="source-trends-empty">現在このテーマに紐づく情報源データがありません。</div>
      )}

      {sourcesFound.map((src) => (
        <div key={src} className="source-trends-block">
          <div className="source-trends-name">
            <span
              className="source-trends-dot"
              style={{ background: sourceColor(src) }}
            />
            {sourceDisplay(src)}
            <span className="source-trends-unit">({sourceUnit(src)})</span>
            {sourceIsUnstable(src) && (
              <span className="source-trends-warn" title="このソースの volume は日ごとに大きく変動する既知の性質があります (Wikipedia の PV 集計は記事欠損の影響を受けやすい)">
                ⚠ 値変動大
              </span>
            )}
          </div>
          <div className="source-trends-grid">
            {seriesBySource[src]?.map((s) => (
              <div key={s.metricKey} className="source-trends-cell">
                <div className="source-trends-cell-label">{s.label}</div>
                <div className="source-trends-cell-value">
                  {s.last !== null && s.last !== undefined ? s.last.toLocaleString() : '—'}
                </div>
                <div className="source-trends-cell-spark">
                  {s.values.length >= 2 ? (
                    <Sparkline data={s.values} color={sourceColor(src)} />
                  ) : (
                    <div className="source-trends-single">1 日のみ (グラフ待ち)</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
