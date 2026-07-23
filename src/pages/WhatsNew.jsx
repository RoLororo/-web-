// ============================================================================
// WhatsNew — 新規登場情報
//
//   ・新登場ソース (index.sources[].firstSeenDate が最近)
//   ・新登場メトリクス (過去には無かったが最新レコードで取れた metric)
//   ・毎日の更新件数 (dailyActivity)
//   ・全ソースの firstSeenDate 一覧
//
// 「見るたびに新しい発見がある」印象を作るページ。
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  loadIndex,
  loadAllTimeseries,
  newlyAppearedSources,
  newlyAppearedMetrics,
  dailyActivity,
} from '../services/historyService.js';
import { getDemands } from '../services/demandService.js';
import { sourceDisplay } from '../services/sourceCatalog.js';
import { usePageTitle } from '../utils/usePageTitle.js';

export default function WhatsNew() {
  usePageTitle('新規追加 — Demand Atlas');
  const [index, setIndex] = useState(null);
  const [allSeries, setAllSeries] = useState(null);

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

  const recentSources = useMemo(() => index ? newlyAppearedSources(index, 30) : [], [index]);
  const newMetrics    = useMemo(() => allSeries ? newlyAppearedMetrics(allSeries) : [], [allSeries]);
  const activity      = useMemo(() => allSeries ? dailyActivity(allSeries) : [], [allSeries]);

  const totalRecords = activity.reduce((s, a) => s + a.recordCount, 0);
  const activityRecent = [...activity].slice(-30).reverse(); // 直近 30 日 (新しい順)

  return (
    <div className="container whats-new-page">
      <section className="page-hero">
        <div className="page-hero-eyebrow">WHAT&rsquo;S NEW</div>
        <h1>本日の新しい情報</h1>
        <p>
          Demand Atlas は毎日 JST 06:00 に自動観測されます。
          新しく登場した情報源、初めて取れた指標、日別の更新件数を一望します。
        </p>
      </section>

      {/* Section 1: 更新カレンダー (日別 activity) */}
      <section className="wn-block">
        <h2 className="wn-h2">📅 毎日の更新件数</h2>
        <p className="wn-sub">
          直近 <b>{activity.length}</b> 日で <b>{totalRecords.toLocaleString()}</b> 件の観測レコードが蓄積されました。
        </p>
        <div className="activity-grid">
          {activityRecent.length === 0 && (
            <div className="empty-hint">履歴データがまだありません。</div>
          )}
          {activityRecent.map((a) => (
            <div key={a.date} className="activity-cell">
              <div className="activity-date">{a.date}</div>
              <div className="activity-stat">
                <span className="activity-big">{a.recordCount}</span>
                <span className="activity-unit">レコード</span>
              </div>
              <div className="activity-sub">
                {a.themeCount} テーマ / {a.sourceCount} ソース
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: 新登場ソース */}
      <section className="wn-block">
        <h2 className="wn-h2">🛰 新しく追加された情報源</h2>
        {recentSources.length === 0 ? (
          <div className="empty-hint">直近 30 日で新規追加された情報源はありません。</div>
        ) : (
          <ul className="wn-source-list">
            {recentSources.map((s) => (
              <li key={s.id} className="wn-source-item">
                <div className="wn-source-name">{sourceDisplay(s.id)} <span className="wn-source-id">({s.id})</span></div>
                <div className="wn-source-date">初出: {s.firstSeenDate}</div>
                <div className="wn-source-metrics">
                  metrics: {(s.metricsKeys || []).join(', ')}
                </div>
                <div className="wn-source-envver">
                  envelopeVersion: <code>{s.envelopeVersion || '—'}</code>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Section 3: 新登場 metrics */}
      <section className="wn-block">
        <h2 className="wn-h2">✨ 今日新しく取れるようになった指標</h2>
        <p className="wn-sub">
          過去のスナップショットには無かったが、最新スナップショットで初めて観測された
          (テーマ × ソース × 指標) の組み合わせ。
        </p>
        {newMetrics.length === 0 ? (
          <div className="empty-hint">
            現時点で新登場 metrics はありません
            (履歴が浅い場合はここに全 metric が出ることがあります)。
          </div>
        ) : (
          <ul className="wn-metric-list">
            {newMetrics.slice(0, 50).map((m, i) => (
              <li key={i} className="wn-metric-item">
                <Link to={`/demand/${m.themeId}`} className="wn-metric-link">
                  {themeMeta[m.themeId]?.title || m.themeId}
                </Link>
                <span className="wn-metric-src">{sourceDisplay(m.source)}</span>
                <span className="wn-metric-name">{m.metric}</span>
                <span className="wn-metric-val">
                  {typeof m.value === 'number' ? m.value.toLocaleString() : String(m.value)}
                </span>
                <span className="wn-metric-date">初出 {m.firstDate}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Section 4: 全情報源カタログ */}
      <section className="wn-block">
        <h2 className="wn-h2">📚 現在動いている全情報源</h2>
        {!index ? <div className="loading-hint">読み込み中…</div> : (
          <ul className="wn-catalog-list">
            {index.sources.map((s) => (
              <li key={s.id} className="wn-catalog-item">
                <span className="wn-catalog-id">{sourceDisplay(s.id)} <span className="wn-catalog-raw">({s.id})</span></span>
                <span className="wn-catalog-since">since {s.firstSeenDate}</span>
                <span className="wn-catalog-envver"><code>{s.envelopeVersion || '—'}</code></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
