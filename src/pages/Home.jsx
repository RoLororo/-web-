// ============================================================================
// Home — ランキング + 急上昇 + 分野フィルタ
// ============================================================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DemandCard from '../components/DemandCard.jsx';
import CategoryFilter from '../components/CategoryFilter.jsx';
import Sparkline from '../components/Sparkline.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import AnimatedNumber from '../components/AnimatedNumber.jsx';
import AccumulationBanner from '../components/AccumulationBanner.jsx';
import TodaysMovers from '../components/TodaysMovers.jsx';
import { getDemands, getTrendingDemands } from '../services/demandService.js';
import { changeClass, formatChange } from '../utils/format.js';
import { usePageTitle } from '../utils/usePageTitle.js';

export default function Home() {
  usePageTitle('Demand Atlas — 世の中の需要を可視化する');
  const nav = useNavigate();
  const [category, setCategory] = useState('');

  const allDemands = useMemo(() => getDemands(), []);
  const trending = useMemo(() => getTrendingDemands(4), []);

  const filtered = category
    ? allDemands.filter((d) => d.category === category)
    : allDemands;

  const risingCount = allDemands.filter((d) => d.change > 0).length;
  const hotCount = allDemands.filter((d) => d.status === '急上昇').length;

  return (
    <div>
      {/* Hero */}
      <section className="hero container">
        <div className="hero-eyebrow">LIVE — 世の中の兆候を追跡中</div>
        <h1>
          今、世の中で
          <br />
          <span className="accent">何が求められているのか。</span>
        </h1>
        <p>
          需要の変化から、次のビジネスチャンスを発見する。
          単なるトレンドランキングではなく、その裏側にある悩みと勢いを可視化します。
        </p>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-label">追跡中の需要</div>
            <div className="hero-stat-value">
              <AnimatedNumber value={allDemands.length} duration={700} />
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">上昇中</div>
            <div className="hero-stat-value green">
              <AnimatedNumber value={risingCount} duration={800} />
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">急上昇</div>
            <div className="hero-stat-value green">
              <AnimatedNumber value={hotCount} duration={900} />
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">最終更新</div>
            <div className="hero-stat-value" style={{ fontSize: 15, color: 'var(--text-2)' }}>本日</div>
          </div>
        </div>
      </section>

      {/* 蓄積ダッシュボード (history/index.json ベースの毎日積み上がる系表示) */}
      <AccumulationBanner />

      {/* 今日の伸び / 急上昇 (history 由来、毎日動く) */}
      <TodaysMovers />

      {/* 急上昇 */}
      <section className="section container">
        <div className="section-head">
          <div>
            <h2 className="section-title">急上昇している需要</h2>
            <p className="section-sub">直近の変化率がとくに大きいテーマ</p>
          </div>
          <button className="section-link" onClick={() => nav('/explore?sort=change')}>
            すべて見る →
          </button>
        </div>
        <div className="trending">
          {trending.map((d, i) => (
            <button
              key={d.id}
              className="trending-card"
              onClick={() => nav(`/demand/${d.id}`)}
              aria-label={`${d.title} の詳細`}
              style={{ '--i': i }}
            >
              <div className="trending-card-top">
                <div>
                  <div className="demand-title">{d.title}</div>
                  <div className="demand-meta" style={{ marginBottom: 0 }}>
                    <span>{d.category}</span>
                  </div>
                </div>
                <div className={`change ${changeClass(d.change)}`}>{formatChange(d.change)}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <StatusBadge status={d.status} />
                <div className="score" style={{ fontSize: 20 }}>
                  <AnimatedNumber value={d.score} duration={700} />
                </div>
              </div>
              <div className="demand-chart">
                <Sparkline data={d.trendData['30d']} color="var(--green-bright)" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ランキング */}
      <section className="section container">
        <div className="section-head">
          <div>
            <h2 className="section-title">
              今日の需要ランキング
              <span className="count">{filtered.length}件</span>
            </h2>
            <p className="section-sub">
              現在の需要度・話題性・成長性を参考にした総合スコア順。
            </p>
          </div>
        </div>

        <CategoryFilter value={category} onChange={setCategory} />

        <div className="card-list">
          {filtered.map((d, i) => (
            <DemandCard key={d.id} demand={d} rank={i + 1} index={i} />
          ))}
          {filtered.length === 0 && (
            <div className="empty">
              <h3>この分野の需要はまだ登録されていません</h3>
              <p>別の分野を選ぶか、需要を探すページを試してみてください。</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
