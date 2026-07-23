// ============================================================================
// TodaysMovers — Home 用「今日の伸び / 急上昇 TOP 3」ウィジェット
//
//   history から直近 1 日差分(なければ最古との比較)を計算し、
//   上位を「今日、この指標がこれだけ伸びた」の形で表示。
//   ユーザが毎日訪問する動機を作る動的要素。
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAllTimeseries, computeAllDiffs } from '../services/historyService.js';
import { getDemands } from '../services/demandService.js';

export default function TodaysMovers() {
  const [allSeries, setAllSeries] = useState(null);

  useEffect(() => {
    loadAllTimeseries().then(setAllSeries);
  }, []);

  const demands = useMemo(() => getDemands(), []);
  const themeMeta = useMemo(() => {
    const m = {};
    for (const d of demands) m[d.id] = { title: d.title, category: d.category };
    return m;
  }, [demands]);

  const movers = useMemo(() => {
    if (!allSeries) return null;
    const diffs = computeAllDiffs(allSeries, 1);
    const volume = diffs.filter((d) => d.metric === 'volume' && d.previous > 0);
    // 伸び率上位 3 と 絶対増上位 3
    const growth = [...volume]
      .filter((d) => d.pctChange !== null && isFinite(d.pctChange))
      .sort((a, b) => (b.pctChange || 0) - (a.pctChange || 0))
      .slice(0, 3);
    const delta = [...volume]
      .filter((d) => d.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
    return { growth, delta };
  }, [allSeries]);

  if (!movers) {
    return null; // 読み込み中は静かに (ホームレイアウトの安定性優先)
  }

  const hasAny = movers.growth.length > 0 || movers.delta.length > 0;
  if (!hasAny) return null; // 履歴不足なら表示しない

  return (
    <section className="section container todays-movers">
      <div className="section-head">
        <h2 className="section-title">📈 今日、動いた需要</h2>
        <Link to="/rankings" className="section-link">全ランキング →</Link>
      </div>
      <div className="movers-grid">
        <div className="movers-col">
          <div className="movers-col-title">伸び率 TOP</div>
          {movers.growth.length === 0 && <div className="movers-empty">まだ十分な履歴がありません</div>}
          {movers.growth.map((m, i) => (
            <Link
              key={`g${i}`}
              to={`/demand/${m.themeId}`}
              className="mover-card"
            >
              <div className="mover-rank">{i + 1}</div>
              <div className="mover-body">
                <div className="mover-title">{themeMeta[m.themeId]?.title || m.themeId}</div>
                <div className="mover-meta">
                  <span className="mover-src">{m.source}</span>
                  <span className="mover-val">
                    {m.previous.toLocaleString()} → {m.current.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className={`mover-badge ${m.pctChange >= 0 ? 'up' : 'down'}`}>
                {m.pctChange >= 0 ? '+' : ''}{m.pctChange.toFixed(0)}%
              </div>
            </Link>
          ))}
        </div>
        <div className="movers-col">
          <div className="movers-col-title">絶対増 TOP</div>
          {movers.delta.length === 0 && <div className="movers-empty">まだ十分な履歴がありません</div>}
          {movers.delta.map((m, i) => (
            <Link
              key={`d${i}`}
              to={`/demand/${m.themeId}`}
              className="mover-card"
            >
              <div className="mover-rank">{i + 1}</div>
              <div className="mover-body">
                <div className="mover-title">{themeMeta[m.themeId]?.title || m.themeId}</div>
                <div className="mover-meta">
                  <span className="mover-src">{m.source}</span>
                  <span className="mover-val">
                    {m.previous.toLocaleString()} → {m.current.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className={`mover-badge ${m.delta >= 0 ? 'up' : 'down'}`}>
                {m.delta >= 0 ? '+' : ''}{m.delta.toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
