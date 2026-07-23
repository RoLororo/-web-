// ============================================================================
// Rankings — 全テーマ × 全ソース横断のランキング
//
//   ・伸び率ランキング (pctChange 降順) — 1 日 / 7 日 / 30 日 window
//   ・急上昇ランキング (delta 絶対値 降順) — 同上
//   ・現在値ランキング (最新 volume 降順) — window 不要
//
// 100 ソース想定: 動的にソース列挙、ソースフィルタで絞り込み可。
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  loadAllTimeseries,
  loadIndex,
  computeAllDiffs,
  computeCurrentValues,
} from '../services/historyService.js';
import { getDemands } from '../services/demandService.js';
import { usePageTitle } from '../utils/usePageTitle.js';

const TABS = [
  { key: 'growth',  label: '伸び率' },
  { key: 'delta',   label: '急上昇 (絶対増)' },
  { key: 'volume',  label: '現在値 (volume)' },
];

const WINDOWS = [
  { key: 1,  label: '1 日' },
  { key: 7,  label: '7 日' },
  { key: 30, label: '30 日' },
];

function sign(n) { return n > 0 ? '+' : ''; }

export default function Rankings() {
  usePageTitle('ランキング — Demand Atlas');
  const [tab, setTab] = useState('growth');
  const [windowDays, setWindowDays] = useState(1);
  const [sourceFilter, setSourceFilter] = useState('');
  const [allSeries, setAllSeries] = useState(null);
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

  const sourceOptions = useMemo(() => {
    if (!index || !index.sources) return [];
    return index.sources.map((s) => s.id).sort();
  }, [index]);

  const rows = useMemo(() => {
    if (!allSeries) return null;

    if (tab === 'volume') {
      const raw = computeCurrentValues(allSeries, 'volume');
      const filtered = sourceFilter ? raw.filter((r) => r.source === sourceFilter) : raw;
      return filtered
        .filter((r) => r.value !== null && r.value !== undefined)
        .sort((a, b) => b.value - a.value)
        .slice(0, 40);
    }

    const raw = computeAllDiffs(allSeries, windowDays);
    // volume metric に絞ることでスケール混在を最小化
    const volOnly = raw.filter((r) => r.metric === 'volume');
    const filtered = sourceFilter ? volOnly.filter((r) => r.source === sourceFilter) : volOnly;

    if (tab === 'growth') {
      return filtered
        .filter((r) => r.pctChange !== null && isFinite(r.pctChange) && r.previous > 0)
        .sort((a, b) => (b.pctChange || 0) - (a.pctChange || 0))
        .slice(0, 40);
    }
    if (tab === 'delta') {
      return filtered
        .filter((r) => r.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 40);
    }
    return [];
  }, [allSeries, tab, windowDays, sourceFilter]);

  return (
    <div className="container rankings-page">
      <section className="page-hero">
        <div className="page-hero-eyebrow">RANKINGS</div>
        <h1>横断ランキング</h1>
        <p>
          全テーマ × 全情報源から、伸び率・急上昇・現在値のランキングを表示します。
          履歴が積み上がるほど順位が動きます。
        </p>
      </section>

      <div className="rankings-toolbar">
        <div className="chip-row">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`chip-btn ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== 'volume' && (
          <div className="chip-row">
            <span className="chip-label">期間:</span>
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                className={`chip-btn small ${windowDays === w.key ? 'active' : ''}`}
                onClick={() => setWindowDays(w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}
        <div className="chip-row">
          <span className="chip-label">ソース:</span>
          <button
            className={`chip-btn small ${sourceFilter === '' ? 'active' : ''}`}
            onClick={() => setSourceFilter('')}
          >
            全て
          </button>
          {sourceOptions.map((s) => (
            <button
              key={s}
              className={`chip-btn small ${sourceFilter === s ? 'active' : ''}`}
              onClick={() => setSourceFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {!rows && <div className="loading-hint">履歴を読み込み中…</div>}
      {rows && rows.length === 0 && (
        <div className="empty-hint">
          このランキングを構築するのに十分な履歴データがまだありません(通常は 2 日以上必要)。
        </div>
      )}

      {rows && rows.length > 0 && (
        <ol className="rankings-list">
          {rows.map((r, i) => (
            <li key={i} className="rankings-item">
              <div className="rank-num">#{i + 1}</div>
              <div className="rank-body">
                <div className="rank-line-1">
                  <Link to={`/demand/${r.themeId}`} className="rank-title">
                    {themeMeta[r.themeId]?.title || r.themeId}
                  </Link>
                  <span className="rank-source">{r.source}</span>
                  <span className="rank-metric">{r.metric}</span>
                </div>
                <div className="rank-line-2">
                  {tab === 'volume' && (
                    <span className="rank-value">{r.value.toLocaleString()}</span>
                  )}
                  {tab === 'growth' && (
                    <>
                      <span className="rank-value">
                        {r.previous.toLocaleString()} → {r.current.toLocaleString()}
                      </span>
                      <span className={`rank-delta ${r.pctChange >= 0 ? 'delta-up' : 'delta-down'}`}>
                        {sign(r.pctChange)}{r.pctChange.toFixed(1)}%
                      </span>
                      <span className="rank-window">({r.previousDate} → {r.currentDate})</span>
                    </>
                  )}
                  {tab === 'delta' && (
                    <>
                      <span className="rank-value">
                        {r.previous.toLocaleString()} → {r.current.toLocaleString()}
                      </span>
                      <span className={`rank-delta ${r.delta >= 0 ? 'delta-up' : 'delta-down'}`}>
                        {sign(r.delta)}{r.delta.toLocaleString()}
                      </span>
                      <span className="rank-window">({r.previousDate} → {r.currentDate})</span>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
