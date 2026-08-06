// ============================================================================
// ScoreTrajectory
// 1 テーマの詳細ページ用: history/current/{themeId}.jsonl の
// derived.score（毎日記録している“実測の需要スコア”）を時系列で描く。
//
// これは競合が後から再現できない蓄積データ。ニュース件数の代理指標ではなく、
// 7 情報源を合成した需要スコアそのものの推移を見せる。
//
// score 付きレコードが 2 日未満のときはグラフを出さず、蓄積中である旨を示す
// （日々 1 点ずつ増える＝毎日見に来る理由になる）。
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { loadTimeseries } from '../services/historyService.js';
import TrendChart from './TrendChart.jsx';

export default function ScoreTrajectory({ themeId, currentScore }) {
  const [records, setRecords] = useState(null);

  useEffect(() => {
    if (!themeId) return;
    let alive = true;
    loadTimeseries(themeId).then((r) => { if (alive) setRecords(r); });
    return () => { alive = false; };
  }, [themeId]);

  const series = useMemo(() => {
    if (!records || records.length === 0) return null;
    const dates = [];
    const values = [];
    for (const rec of records) {
      const s = rec?.derived?.score;
      if (typeof s === 'number' && rec.date) {
        dates.push(rec.date);
        values.push(s);
      }
    }
    if (values.length === 0) return null;
    return { dates, values };
  }, [records]);

  // 読み込み中
  if (records === null) {
    return <div className="chart-note">需要スコアの推移を読み込み中…</div>;
  }

  // 蓄積が 2 日未満：グラフは出さず、蓄積中であることを正直に伝える
  if (!series || series.values.length < 2) {
    const n = series?.values.length ?? 0;
    return (
      <div className="chart-note">
        需要スコアの推移は蓄積中です（現在 {n} 日分）。
        毎日 1 点ずつ記録が増えるので、数日後から線で確認できます。
      </div>
    );
  }

  const { dates, values } = series;
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const peak = Math.max(...values);
  const trough = Math.min(...values);
  const days = values.length;
  const deltaClass = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
  const deltaText = delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <div>
      <div className="score-traj-summary">
        <span className="score-traj-range">蓄積 {days} 日</span>
        <span className="score-traj-flow">
          {first} <span className="score-traj-arrow">→</span> <strong>{last}</strong>
        </span>
        <span className={`score-traj-delta ${deltaClass}`}>{deltaText}</span>
        <span className="score-traj-peak">最高 {peak} / 最低 {trough}</span>
      </div>
      <TrendChart
        key={`score-${themeId}-${values.length}`}
        data={values}
        labels={dates}
        unit=""
        color="var(--green-bright)"
      />
      <div className="chart-note">
        7 情報源を合成した<strong>需要スコアそのもの</strong>の実測推移です（1 日 1 点、毎日更新）。
        ニュース件数の代理ではありません。この履歴は今この期間しか蓄積できません。
      </div>
    </div>
  );
}
