// ============================================================================
// Home — 「今朝のダイジェスト」→ お気に入り → ランキング (簡素化 v2)
//
//   ・Hero (統計 3 個 + タグライン)
//   ・DailyBrief (今日のおすすめ 1 テーマ + 動いた 3 テーマ + 更新日時)
//   ・FavoritesStrip (personal)
//   ・ランキング (全テーマ、insights バッジ付きカード)
//
//   削除したもの: AccumulationBanner / TodaysMovers / SinceLastVisit /
//                 急上昇 trending 4 カード / 冗長な hero 統計 1 個。
//   統合先: DailyBrief が全ての情報を包含。
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import DemandCard from '../components/DemandCard.jsx';
import CategoryFilter from '../components/CategoryFilter.jsx';
import AnimatedNumber from '../components/AnimatedNumber.jsx';
import DailyBrief from '../components/DailyBrief.jsx';
import FavoritesStrip from '../components/FavoritesStrip.jsx';
import { getDemands, getTotalArticles } from '../services/demandService.js';
import { loadAllTimeseries, biggestMoverOfTheme } from '../services/historyService.js';
import { usePageTitle } from '../utils/usePageTitle.js';

export default function Home() {
  usePageTitle('Demand Atlas — 世の中の需要を可視化する');
  const [category, setCategory] = useState('');

  const allDemands = useMemo(() => getDemands(), []);

  // history 由来: 各テーマの「今日最も動いた metric」を DemandCard に渡す
  const [historyMovers, setHistoryMovers] = useState({});
  useEffect(() => {
    let cancelled = false;
    loadAllTimeseries().then((all) => {
      if (cancelled) return;
      const out = {};
      for (const [themeId, records] of Object.entries(all)) {
        const mover = biggestMoverOfTheme(records);
        if (mover) out[themeId] = mover;
      }
      setHistoryMovers(out);
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = category
    ? allDemands.filter((d) => d.category === category)
    : allDemands;

  // Hero 統計: 「追跡中/上昇中/急上昇」は build-demands の score saturation で
  // 全テーマ同数 (10/10/10) になり判別力ゼロだったため、意味のある実測値に置換。
  // 情報源 7 は Wikipedia/Qiita/arXiv/App Store JP/GitHub/国立国会図書館/主要ニュース RSS。
  const totalArticles = getTotalArticles();
  const SOURCE_COUNT = 7;

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
            <div className="hero-stat-label">情報源</div>
            <div className="hero-stat-value">
              <AnimatedNumber value={SOURCE_COUNT} duration={800} />
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">直近ニュース観測</div>
            <div className="hero-stat-value green">
              <AnimatedNumber value={totalArticles} duration={900} />
            </div>
          </div>
        </div>
      </section>

      {/* 今朝のダイジェスト: おすすめ 1 + 動いた 3 + 更新日時 */}
      <DailyBrief allDemands={allDemands} />

      {/* お気に入り (personal) */}
      <FavoritesStrip allDemands={allDemands} historyMovers={historyMovers} />

      {/* ランキング */}
      <section className="section container">
        <div className="section-head">
          <div>
            <h2 className="section-title">
              全テーマの需要ランキング
              <span className="count">{filtered.length}件</span>
            </h2>
            <p className="section-sub">
              各カードに「勢い / 参入 / 競争」の 3 スコアを表示。
              今日の実測変化 (履歴 day-over-day) を主指標として並べています。
            </p>
          </div>
        </div>

        <CategoryFilter value={category} onChange={setCategory} />

        <div className="card-list">
          {filtered.map((d, i) => (
            <DemandCard key={d.id} demand={d} rank={i + 1} index={i} historyMove={historyMovers[d.id] || null} />
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
