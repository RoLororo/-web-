// ============================================================================
// AccumulationBanner
// 「毎日データが積み上がっている」ことを一目で伝えるヘッダバナー。
// history/index.json から統計を非同期取得し、4 スロットで表示。
//
//   ・追跡日数   (firstDate 〜 lastDate)
//   ・情報源数   (index.json.sources.length)
//   ・観測レコード合計 (index.json.themes[].recordCount の総和)
//   ・最終更新   (demands.json.generatedAt or history.lastRunAt)
//
// history 未生成時 (初日のみ動いた場合含む) は控えめな placeholder 表示。
// 既存 hero-stats のスタイルと親和するデザイン。
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AnimatedNumber from './AnimatedNumber.jsx';
import { getAggregateStats } from '../services/historyService.js';
import { getGeneratedAt } from '../services/demandService.js';

function formatRelativeDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return '1 時間以内';
    if (diffH < 24) return `${diffH} 時間前`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD} 日前`;
    return d.toISOString().slice(0, 10);
  } catch {
    return '—';
  }
}

export default function AccumulationBanner() {
  const [stats, setStats] = useState(null);
  const generatedAt = getGeneratedAt();

  useEffect(() => {
    getAggregateStats().then(setStats);
  }, []);

  const dayCount     = stats ? stats.dayCount     : 0;
  const sourceCount  = stats ? stats.sourceCount  : 0;
  const totalRecords = stats ? stats.totalRecords : 0;
  const lastDate     = stats ? stats.lastDate     : null;

  return (
    <section className="accumulation-banner container">
      <div className="accum-header">
        <div className="accum-eyebrow">📈 毎日積み上がる観測データ</div>
        <div className="accum-lead">
          過去 <b>{dayCount || '—'}</b> 日ぶん、<b>{sourceCount || '—'}</b> の情報源から
          <b> {totalRecords || '—'} </b>件のスナップショットが蓄積されています。
        </div>
      </div>
      <div className="accum-grid">
        <div className="accum-stat">
          <div className="accum-label">追跡日数</div>
          <div className="accum-value">
            <AnimatedNumber value={dayCount} duration={700} />
            <span className="accum-unit">日</span>
          </div>
        </div>
        <div className="accum-stat">
          <div className="accum-label">情報源</div>
          <div className="accum-value">
            <AnimatedNumber value={sourceCount} duration={700} />
            <span className="accum-unit">種</span>
          </div>
        </div>
        <div className="accum-stat">
          <div className="accum-label">観測レコード</div>
          <div className="accum-value">
            <AnimatedNumber value={totalRecords} duration={800} />
            <span className="accum-unit">件</span>
          </div>
        </div>
        <div className="accum-stat">
          <div className="accum-label">最終更新</div>
          <div className="accum-value accum-value-sm">
            {formatRelativeDate(generatedAt || (lastDate ? lastDate + 'T00:00:00Z' : null))}
          </div>
        </div>
      </div>
      <div className="accum-actions">
        <Link to="/timeline" className="accum-link">
          日別タイムラインを見る →
        </Link>
        <Link to="/changes" className="accum-link">
          最近の変化を見る →
        </Link>
      </div>
    </section>
  );
}
