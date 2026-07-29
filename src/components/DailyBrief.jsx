// ============================================================================
// DailyBrief — Home 最上部の「今朝のダイジェスト」
//
//   ■ 目的
//     毎日 1 番の来訪動機を「1 テーマの推奨」に凝縮する。
//     + 前回訪問からの動いた 3 テーマ + 明示的な更新日時。
//
//   ■ 「今日のおすすめ」ロジック
//     各テーマの opportunity score =
//       momentum * 0.4 + beginner * 0.35 + (100 - competition) * 0.25
//     の最大テーマを「今日はこれを見て」として提示。
//     insights 未生成のテーマはスキップ。
//
//   ■ 「動いた 3 テーマ」ロジック
//     history-based day-over-day の絶対 pctChange 降順、上位 3。
//     (Home 側で computed 済みの historyMovers を再利用)
//
//   ■ 更新日時
//     history/index.json の最新日 (lastDate) を「YYYY-MM-DD 時点のデータ」
//     で明示。2 日以上古ければ本日未更新の警告を出す。
//     配信時刻は書かない: schedule は cron 21:00Z に対し実測 8/8 が遅延し
//     (中央値 +3.3h / 最大 +12h)、時刻を約束すると必ず外れるため。
//
//   ■ localStorage
//     lastVisitAt は SinceLastVisit と共有 (このコンポーネントが後継)。
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ThemeLink from './ThemeLink.jsx';
import { loadAllTimeseries, loadIndex, biggestMoverOfTheme } from '../services/historyService.js';
import { sourceDisplay } from '../services/sourceCatalog.js';
import { themeTitle } from '../services/themeCatalog.js';

const STORAGE_KEY = 'demand-atlas:lastVisitAt';

function readLastVisit() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } }
function writeLastVisit(iso) { try { localStorage.setItem(STORAGE_KEY, iso); } catch {} }

/**
 * Pick "今日のおすすめ": highest opportunity score.
 * opportunity = momentum*0.4 + beginner*0.35 + (100 - competition)*0.25
 */
function pickRecommendation(demands) {
  let best = null;
  let bestScore = -Infinity;
  for (const d of demands) {
    const i = d._insights;
    if (!i) continue;
    const m = i.momentum?.score ?? 0;
    const b = i.beginnerFriendliness?.score ?? 0;
    const c = i.competition?.score ?? 0;
    const opp = m * 0.4 + b * 0.35 + (100 - c) * 0.25;
    if (opp > bestScore) { bestScore = opp; best = { demand: d, opp: Math.round(opp) }; }
  }
  return best;
}

function formatUpdatedLabel(lastDateStr) {
  if (!lastDateStr) return null;
  // lastDateStr = "YYYY-MM-DD"
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const last = new Date(lastDateStr + 'T00:00:00Z');
  const ageDays = Math.floor((today - last) / (24 * 60 * 60 * 1000));
  const stale = ageDays >= 2;
  return { text: `${lastDateStr} 時点のデータ`, stale, ageDays };
}

export default function DailyBrief({ allDemands = [] }) {
  const [movers, setMovers] = useState(null);
  const [updatedLabel, setUpdatedLabel] = useState(null);
  const [lastVisitAt] = useState(() => readLastVisit());

  const themeTitleMap = useMemo(
    () => Object.fromEntries(allDemands.map((d) => [d.id, d.title])),
    [allDemands],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [all, index] = await Promise.all([loadAllTimeseries(), loadIndex()]);
      if (cancelled) return;

      // Top movers (any theme, day-over-day biggest metric)
      const list = [];
      for (const [themeId, records] of Object.entries(all || {})) {
        const m = biggestMoverOfTheme(records);
        if (m && isFinite(m.pctChange)) list.push({ themeId, ...m });
      }
      list.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
      setMovers(list.slice(0, 5));

      // Update timestamp
      let lastDate = null;
      for (const t of (index?.themes || [])) {
        if (t.lastDate && (!lastDate || t.lastDate > lastDate)) lastDate = t.lastDate;
      }
      setUpdatedLabel(formatUpdatedLabel(lastDate));

      // Record visit after render
      writeLastVisit(new Date().toISOString());
    })();
    return () => { cancelled = true; };
  }, []);

  const recommended = useMemo(() => pickRecommendation(allDemands), [allDemands]);

  // Show at least "loading" state to avoid layout jump
  if (allDemands.length === 0) return null;

  return (
    <section className="daily-brief container">
      <div className="daily-brief-head">
        <h2 className="daily-brief-title">🌅 今朝のダイジェスト</h2>
        {updatedLabel && (
          <span className="daily-brief-updated">
            {updatedLabel.text}
            {updatedLabel.stale && <span className="db-stale">・本日未更新 ({updatedLabel.ageDays}日前)</span>}
          </span>
        )}
      </div>

      <div className="daily-brief-grid">
        {/* 今日のおすすめ */}
        <div>
          {recommended ? (
            <Link to={`/demand/${recommended.demand.id}`} className="db-pick">
              <div className="db-pick-eyebrow">今日はこれを見て · opportunity {recommended.opp}</div>
              <div className="db-pick-title">{recommended.demand.title}</div>
              <div className="db-pick-why">
                {recommended.demand._insights?.whyTrending?.headline || recommended.demand.summary}
              </div>
              <div className="db-pick-scores">
                <span className="db-pick-score">勢い <b>{recommended.demand._insights?.momentum?.score}</b></span>
                <span className="db-pick-score">参入 <b>{recommended.demand._insights?.beginnerFriendliness?.score}</b></span>
                <span className="db-pick-score">競争 <b>{recommended.demand._insights?.competition?.score}</b></span>
              </div>
            </Link>
          ) : (
            <div className="db-empty">insights 未生成のためおすすめを選べません。</div>
          )}
        </div>

        {/* 今日動いた 3 テーマ */}
        <div>
          <h3 className="db-movers-title">
            {lastVisitAt ? '前回訪問からの動き' : '直近で動いた TOP 3'}
          </h3>
          {movers && movers.length > 0 ? (
            <ul className="db-movers-list">
              {movers.slice(0, 3).map((m, i) => (
                <li key={i}>
                  <ThemeLink themeId={m.themeId}>
                    <span className="db-mover-title">{themeTitleMap[m.themeId] || themeTitle(m.themeId)}</span>
                    <span className={`db-mover-move ${m.pctChange >= 0 ? 'up' : 'down'}`}>
                      {m.pctChange >= 0 ? '↑' : '↓'} {Math.abs(Math.round(m.pctChange))}%
                    </span>
                    <span className="db-mover-src">{sourceDisplay(m.source)}</span>
                  </ThemeLink>
                </li>
              ))}
            </ul>
          ) : (
            <div className="db-empty">履歴データがまだ蓄積されていません。</div>
          )}
        </div>
      </div>
    </section>
  );
}
