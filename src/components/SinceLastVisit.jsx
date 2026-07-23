// ============================================================================
// SinceLastVisit — 前回訪問からの変化リボン
//
//   ■ 目的
//     ユーザが「毎日開く理由」を作るため、
//     前回訪問以降にデータが動いたテーマ数を Home 上部で示す。
//
//   ■ 挙動
//     - localStorage: `demand-atlas:lastVisitAt` (ISO string)
//     - 初回訪問: 案内文のみ (「初めまして。〜」) を出して timestamp 保存
//     - 2 回目以降: 前回訪問より新しい date のレコードを持つテーマ数を集計、
//       もっとも動いた 3 テーマを Link 表示、WhatsNew ページへ誘導
//     - 表示後に lastVisitAt を「訪問時点」に更新
//
//   ■ 破損耐性
//     - allSeries が空 or 履歴 1 日のみ → 何も表示しない
//     - localStorage が使えない (プライベートモード等) → 何も表示しない
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAllTimeseries, diffRecords } from '../services/historyService.js';
import { sourceDisplay } from '../services/sourceCatalog.js';

const STORAGE_KEY = 'demand-atlas:lastVisitAt';

function readLastVisit() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLastVisit(iso) {
  try {
    localStorage.setItem(STORAGE_KEY, iso);
  } catch {
    /* ignore */
  }
}

/** 日数差 (YYYY-MM-DD 同士、or ISO 同士でも動く。負なら 0) */
function daysBetween(oldIso, newIso) {
  if (!oldIso || !newIso) return null;
  const a = new Date(oldIso);
  const b = new Date(newIso);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.max(0, Math.floor((b - a) / (24 * 60 * 60 * 1000)));
}

export default function SinceLastVisit({ themeTitleMap = {} }) {
  const [state, setState] = useState({ status: 'loading' });
  // 訪問時点で読んだ値を固定（マウント中に他所で書き換わっても影響しない）
  const [lastVisitAtSnapshot] = useState(() => readLastVisit());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await loadAllTimeseries();
      if (cancelled) return;

      // 履歴が全く無い、または 1 日しか無い → 表示なし
      const dateSet = new Set();
      for (const records of Object.values(all || {})) {
        for (const r of records) if (r?.date) dateSet.add(r.date);
      }
      if (dateSet.size < 2) {
        // 訪問記録だけ更新して静かに退場
        writeLastVisit(new Date().toISOString());
        setState({ status: 'insufficient' });
        return;
      }

      const now = new Date().toISOString();
      const last = lastVisitAtSnapshot;
      const lastDate = last ? last.slice(0, 10) : null;

      // 初回訪問 → 「ようこそ」表示
      if (!last) {
        writeLastVisit(now);
        setState({ status: 'first-visit' });
        return;
      }

      // 前回訪問より新しい date のレコード = 「未読の変化」
      const moved = [];
      for (const [themeId, records] of Object.entries(all)) {
        if (!records || records.length < 2) continue;
        // lastDate より後の最新 record と、それ以前の最新 record を比較
        const newer = records.filter((r) => r.date > (lastDate || ''));
        const older = records.filter((r) => r.date <= (lastDate || ''));
        if (newer.length === 0) continue;
        const current = newer[newer.length - 1];
        const previous = older.length > 0 ? older[older.length - 1] : records[0];
        if (current.date === previous.date) continue;

        const diff = diffRecords(current, previous);
        let best = null;
        for (const [key, v] of Object.entries(diff)) {
          const [source, metric] = key.split('.');
          if (metric !== 'volume') continue;
          if (!isFinite(v.pctChange)) continue;
          if (!best || Math.abs(v.pctChange) > Math.abs(best.pctChange)) {
            best = { source, metric, ...v };
          }
        }
        if (best) moved.push({ themeId, ...best });
      }

      moved.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));

      // 表示後に timestamp を更新（訪問確定）
      writeLastVisit(now);

      setState({
        status: 'ready',
        daysSince: daysBetween(last, now),
        movedCount: moved.length,
        top: moved.slice(0, 3),
      });
    })();
    return () => { cancelled = true; };
  }, [lastVisitAtSnapshot]);

  if (state.status !== 'ready' && state.status !== 'first-visit') {
    return null; // loading / insufficient は無音
  }

  if (state.status === 'first-visit') {
    return (
      <div className="since-last-visit welcome container">
        <div className="slv-icon" aria-hidden>👋</div>
        <div className="slv-body">
          <div className="slv-head">ようこそ、Demand Atlas へ</div>
          <div className="slv-desc">
            毎日 JST 06:00 に 11 テーマ × 複数情報源で観測を更新します。
            明日も来ると「前回訪問からの変化」がここに表示されます。
          </div>
        </div>
      </div>
    );
  }

  const { daysSince, movedCount, top } = state;

  if (movedCount === 0) {
    return (
      <div className="since-last-visit quiet container">
        <div className="slv-icon" aria-hidden>🕰</div>
        <div className="slv-body">
          <div className="slv-head">
            {daysSince === 0 ? '今日はもう一度' : `${daysSince} 日ぶり`}のご訪問です
          </div>
          <div className="slv-desc">
            まだ大きな変化は観測されていません。次の更新は明日 JST 06:00。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="since-last-visit active container">
      <div className="slv-icon" aria-hidden>✨</div>
      <div className="slv-body">
        <div className="slv-head">
          {daysSince === 0 ? '今日、' : `前回訪問（${daysSince} 日前）から、`}
          <b>{movedCount}</b> テーマが動きました
        </div>
        <ul className="slv-top">
          {top.map((m, i) => {
            const title = themeTitleMap[m.themeId] || m.themeId;
            const arrow = m.pctChange >= 0 ? '↑' : '↓';
            const cls = m.pctChange >= 0 ? 'up' : 'down';
            return (
              <li key={i}>
                <Link to={`/demand/${m.themeId}`} className="slv-item">
                  <span className="slv-item-title">{title}</span>
                  <span className={`slv-item-move ${cls}`}>
                    {arrow} {Math.abs(Math.round(m.pctChange))}%
                  </span>
                  <span className="slv-item-src">({sourceDisplay(m.source)})</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <Link to="/whats-new" className="slv-cta">
        すべて見る →
      </Link>
    </div>
  );
}
