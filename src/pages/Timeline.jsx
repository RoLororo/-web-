// ============================================================================
// Timeline — 日次スナップショットの累積タイムライン
//
//   全テーマの current jsonl を横断集約し、
//     ・記録がある日一覧 (縦タイムライン)
//     ・各日: どのソースが観測したか + 総観測レコード数
//     ・各日: その日の主要ハイライト (最大 volume を持つ theme×source)
//   を表示する。
//
// 目的: 「毎日データが積み上がっている」ことをユーザに視覚的に伝える。
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAllTimeseries, loadIndex, flattenMetrics } from '../services/historyService.js';
import { getDemands } from '../services/demandService.js';
import { usePageTitle } from '../utils/usePageTitle.js';

export default function Timeline() {
  usePageTitle('タイムライン — Demand Atlas');

  const [allSeries, setAllSeries] = useState(null); // { themeId: [records] }
  const [index, setIndex] = useState(null);

  useEffect(() => {
    Promise.all([loadIndex(), loadAllTimeseries()]).then(([idx, all]) => {
      setIndex(idx);
      setAllSeries(all);
    });
  }, []);

  const demands = useMemo(() => getDemands(), []);
  const themeMeta = useMemo(() => {
    const m = {};
    for (const d of demands) m[d.id] = { title: d.title, category: d.category };
    return m;
  }, [demands]);

  // 日付ごとに集計: { 'YYYY-MM-DD': { sources: Set, records: [...] } }
  const byDate = useMemo(() => {
    if (!allSeries) return null;
    const map = new Map();
    for (const [themeId, records] of Object.entries(allSeries)) {
      for (const rec of records) {
        if (!map.has(rec.date)) {
          map.set(rec.date, { sources: new Set(), records: [], themes: new Set() });
        }
        const bucket = map.get(rec.date);
        bucket.records.push({ themeId, rec });
        bucket.themes.add(themeId);
        for (const srcId of Object.keys(rec.sources || {})) {
          bucket.sources.add(srcId);
        }
      }
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // 新しい順
      .map(([date, val]) => ({ date, ...val }));
  }, [allSeries]);

  // 各日のハイライト: 全 (theme, source, metric) の最大 volume を出す
  function highlightsOf(dayEntry) {
    const rows = [];
    for (const { themeId, rec } of dayEntry.records) {
      const flat = flattenMetrics(rec);
      for (const [key, val] of Object.entries(flat)) {
        if (!key.endsWith('.volume')) continue;
        if (typeof val !== 'number' || val === 0) continue;
        const source = key.split('.')[0];
        rows.push({
          themeId, source, volume: val,
          title: themeMeta[themeId]?.title || themeId,
        });
      }
    }
    rows.sort((a, b) => b.volume - a.volume);
    return rows.slice(0, 3);
  }

  return (
    <div className="container timeline-page">
      <section className="page-hero">
        <div className="page-hero-eyebrow">HISTORY TIMELINE</div>
        <h1>日別に積み上がる観測データ</h1>
        <p>
          毎日 JST 06:00 に自動観測される情報源のスナップショットを日付順に表示します。
          各日にどのソースが何を観測したかを、上から新しい順で確認できます。
        </p>
      </section>

      {!byDate && <div className="loading-hint">履歴を読み込み中…</div>}
      {byDate && byDate.length === 0 && (
        <div className="empty-hint">履歴データがまだありません。数日運用後にお試しください。</div>
      )}

      {byDate && byDate.length > 0 && (
        <ol className="timeline-list">
          {byDate.map((day) => {
            const hi = highlightsOf(day);
            return (
              <li key={day.date} className="timeline-item">
                <div className="timeline-date">
                  <div className="timeline-date-day">{day.date.slice(8, 10)}</div>
                  <div className="timeline-date-month">{day.date.slice(0, 7)}</div>
                </div>
                <div className="timeline-body">
                  <div className="timeline-meta">
                    <span className="timeline-chip">🎯 {day.themes.size} テーマ</span>
                    <span className="timeline-chip">
                      🛰 {day.sources.size} ソース: {[...day.sources].sort().join(' / ')}
                    </span>
                    <span className="timeline-chip">📄 {day.records.length} レコード</span>
                  </div>
                  {hi.length > 0 && (
                    <div className="timeline-highlights">
                      <div className="timeline-highlights-title">この日の主要観測 (volume 上位):</div>
                      <ul className="timeline-highlights-list">
                        {hi.map((h, i) => (
                          <li key={i}>
                            <Link to={`/demand/${h.themeId}`} className="timeline-hi-link">
                              <b>{h.title}</b>
                            </Link>
                            <span className="timeline-hi-badge">{h.source}</span>
                            <span className="timeline-hi-val">{h.volume.toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
