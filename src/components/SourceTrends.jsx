// ============================================================================
// SourceTrends
// 1 テーマの詳細ページ用: history/current/{themeId}.jsonl を読み、
// ソース × 主要 metric ごとに 30 日 (or 利用可能な最大日数) のスパークラインを表示。
//
// 履歴が 1 日しか無い場合はレコードカウントのみ表示し、グラフは出さない。
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { loadTimeseries, flattenMetrics } from '../services/historyService.js';
import Sparkline from './Sparkline.jsx';

const METRIC_LABELS = {
  volume:           '量 (volume)',
  engagement:       '反応 (engagement)',
  contributors:     '関与者 (contributors)',
};

const SOURCE_LABELS = {
  qiita:     'Qiita 記事',
  wikipedia: 'Wikipedia PV',
  appstore:  'App Store ランク観測',
  arxiv:     'arXiv 論文',
};

const SOURCE_COLOR = {
  qiita:     'var(--green-bright)',
  wikipedia: '#7c9bff',
  appstore:  '#ff9c66',
  arxiv:     '#c58aff',
};

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
          label: METRIC_LABELS[mk] || mk,
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
              style={{ background: SOURCE_COLOR[src] || 'var(--text-3)' }}
            />
            {SOURCE_LABELS[src] || src}
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
                    <Sparkline data={s.values} color={SOURCE_COLOR[src]} />
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
