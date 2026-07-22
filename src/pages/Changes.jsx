// ============================================================================
// Changes — 昨日 / 1週間前 / 30日前との比較
//
//   全テーマの current jsonl を横断し、最新レコードと過去 N 日前のレコードを
//   比較して metrics の差分を計算・表示する。
//
//   期間セレクタ: 1日 / 7日 / 30日
//   出力: テーマ別カード → source × metric ごとの delta / pctChange
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  loadAllTimeseries,
  diffRecords,
} from '../services/historyService.js';
import { getDemands } from '../services/demandService.js';
import { usePageTitle } from '../utils/usePageTitle.js';

const WINDOWS = [
  { key: 1,  label: '昨日と比較' },
  { key: 7,  label: '1 週間前と比較' },
  { key: 30, label: '30 日前と比較' },
];

function findRecordNDaysBefore(records, targetDaysBack) {
  // records は date 昇順を仮定
  if (!records || records.length === 0) return null;
  const latest = records[records.length - 1];
  const latestDate = new Date(latest.date + 'T00:00:00Z');
  const targetMs = latestDate.getTime() - targetDaysBack * 24 * 60 * 60 * 1000;

  // ターゲット日以下で最も新しい record を返す
  let best = null;
  for (const rec of records) {
    const recMs = new Date(rec.date + 'T00:00:00Z').getTime();
    if (recMs <= targetMs) {
      if (!best || rec.date > best.date) best = rec;
    }
  }
  return best;
}

function formatDelta(delta, pctChange) {
  const sign = delta > 0 ? '+' : '';
  const pctPart = pctChange !== null && isFinite(pctChange)
    ? ` (${pctChange > 0 ? '+' : ''}${pctChange.toFixed(0)}%)`
    : '';
  return `${sign}${delta.toLocaleString()}${pctPart}`;
}

function deltaClass(delta) {
  if (delta > 0) return 'delta-up';
  if (delta < 0) return 'delta-down';
  return 'delta-flat';
}

export default function Changes() {
  usePageTitle('変化 — Demand Atlas');

  const [allSeries, setAllSeries] = useState(null);
  const [windowDays, setWindowDays] = useState(1);

  useEffect(() => {
    loadAllTimeseries().then(setAllSeries);
  }, []);

  const demands = useMemo(() => getDemands(), []);
  const themeMeta = useMemo(() => {
    const m = {};
    for (const d of demands) m[d.id] = { title: d.title, category: d.category };
    return m;
  }, [demands]);

  const diffs = useMemo(() => {
    if (!allSeries) return null;
    const out = [];
    for (const [themeId, records] of Object.entries(allSeries)) {
      if (records.length < 2) continue;
      const current = records[records.length - 1];
      const previous = findRecordNDaysBefore(records, windowDays);
      if (!previous || previous.date === current.date) continue;
      const diff = diffRecords(current, previous);
      // metrics/native 全部混じっているので metrics.* だけ拾う (共通軸で比較)
      const displayDiff = {};
      for (const [k, v] of Object.entries(diff)) {
        const [, part] = k.split('.');
        // 'source.metric' の形。native.* は除外
        if (part === 'native') continue;
        displayDiff[k] = v;
      }
      out.push({ themeId, currentDate: current.date, prevDate: previous.date, diff: displayDiff });
    }
    return out;
  }, [allSeries, windowDays]);

  const noData = diffs && diffs.length === 0;

  return (
    <div className="container changes-page">
      <section className="page-hero">
        <div className="page-hero-eyebrow">DIFF</div>
        <h1>最近の変化を追う</h1>
        <p>
          最新スナップショットと過去のスナップショットを比較し、
          各テーマの各ソースでどれだけ観測値が動いたかを表示します。
        </p>
      </section>

      <div className="changes-toolbar">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            className={`chip-btn ${windowDays === w.key ? 'active' : ''}`}
            onClick={() => setWindowDays(w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {!diffs && <div className="loading-hint">履歴を読み込み中…</div>}
      {noData && (
        <div className="empty-hint">
          比較できる履歴データがまだ十分にありません(履歴が {windowDays + 1} 日以上必要)。<br />
          数日運用後にお試しください。
        </div>
      )}

      {diffs && diffs.length > 0 && (
        <div className="changes-list">
          {diffs.map(({ themeId, currentDate, prevDate, diff }) => {
            const rows = Object.entries(diff).sort(
              (a, b) => Math.abs(b[1].delta) - Math.abs(a[1].delta)
            );
            const rowsToShow = rows.slice(0, 8);
            return (
              <div key={themeId} className="changes-card">
                <div className="changes-card-head">
                  <Link to={`/demand/${themeId}`} className="changes-card-title">
                    {themeMeta[themeId]?.title || themeId}
                  </Link>
                  <div className="changes-card-dates">{prevDate} → {currentDate}</div>
                </div>
                {rowsToShow.length === 0 && (
                  <div className="changes-empty">数値変化なし</div>
                )}
                <table className="changes-table">
                  <tbody>
                    {rowsToShow.map(([key, val]) => {
                      const [source, metric] = key.split('.');
                      return (
                        <tr key={key}>
                          <td className="changes-src">{source}</td>
                          <td className="changes-metric">{metric}</td>
                          <td className="changes-prev">{val.previous.toLocaleString()}</td>
                          <td className="changes-arrow">→</td>
                          <td className="changes-cur">{val.current.toLocaleString()}</td>
                          <td className={`changes-delta ${deltaClass(val.delta)}`}>
                            {formatDelta(val.delta, val.pctChange)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
