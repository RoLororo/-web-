// ============================================================================
// Explore — 検索・フィルタ・並び替えができる探索ページ
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DemandCard from '../components/DemandCard.jsx';
import CategoryFilter from '../components/CategoryFilter.jsx';
import FoxMark from '../components/FoxMark.jsx';
import { searchDemands, stageCounts } from '../services/demandService.js';
import { useSeo } from '../utils/useSeo.js';

const STATUS_OPTIONS = ['', '急上昇', '成長中', '安定', '下降'];
const SORT_OPTIONS = [
  { value: 'score',   label: '需要度が高い順' },
  { value: 'lead',    label: '研究・開発の先行度順' },
  { value: 'change',  label: '急上昇順' },
  { value: 'updated', label: '最近注目された順' },
];

// 需要ステージ = 研究(arXiv)・開発(Qiita)・認知(ニュース) の横断合成。
// スコアはニュース由来なので、研究先行の早期テーマは下位に埋もれる。ここで拾えるようにする。
const STAGE_OPTIONS = [
  { value: '',           label: 'すべて',       tint: 'var(--text-2)' },
  { value: 'emerging',   label: '🔬 研究・開発が先行', tint: 'hsl(265 60% 55%)', hint: '世間に知られる前の早期需要' },
  { value: 'parallel',   label: '⚖ 研究と話題が並走',  tint: 'hsl(210 15% 50%)' },
  { value: 'mainstream', label: '📣 世間が先行',       tint: 'hsl(30 70% 50%)',  hint: '既に広く知られている' },
];

export default function Explore() {
  useSeo({
    title: "需要を検索する — Demand Atlas",
    description: "キーワードや分野で需要テーマを絞り込めます。スコア順・変化率順に並べ替えて、気になるテーマの詳細へ移動できます。",
    path: "/explore",
  });
  const [params, setParams] = useSearchParams();

  const [keyword, setKeyword]   = useState(params.get('q') || '');
  const [category, setCategory] = useState(params.get('category') || '');
  const [status, setStatus]     = useState(params.get('status') || '');
  const [stage, setStage]       = useState(params.get('stage') || '');
  const [sort, setSort]         = useState(params.get('sort') || 'score');

  useEffect(() => {
    const next = {};
    if (keyword)  next.q = keyword;
    if (category) next.category = category;
    if (status)   next.status = status;
    if (stage)    next.stage = stage;
    if (sort && sort !== 'score') next.sort = sort;
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, category, status, stage, sort]);

  const results = useMemo(
    () => searchDemands({ keyword, category, status, stage, sort }),
    [keyword, category, status, stage, sort]
  );

  // ステージチップに出す実数（stage 条件は無視し、他の絞り込みは反映）
  const counts = useMemo(
    () => stageCounts({ keyword, category, status }),
    [keyword, category, status]
  );

  return (
    <div>
      <section className="section container">
        <div className="section-head">
          <div>
            <h1 className="section-title">需要を探す</h1>
            <p className="section-sub">キーワード・分野・状態から需要テーマを探索できます。</p>
          </div>
        </div>

        <div className="search-bar">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            aria-label="キーワードで需要を探す"
            placeholder="例：AI、副業、健康、教育…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <CategoryFilter value={category} onChange={setCategory} />

        {/* 需要ステージで絞り込む — スコアに埋もれた早期需要を拾える発見軸 */}
        <div className="stage-filter" role="group" aria-label="需要ステージで絞り込む">
          {STAGE_OPTIONS.map((s) => {
            const active = stage === s.value;
            const n = s.value ? counts[s.value] : counts.all;
            return (
              <button
                key={s.value || 'all'}
                type="button"
                className={`stage-filter-chip${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => setStage(active ? '' : s.value)}
                style={active ? { borderColor: s.tint, color: s.tint, background: 'color-mix(in srgb, currentColor 8%, transparent)' } : { borderColor: 'var(--border)' }}
                title={s.hint || ''}
              >
                {s.label}<span className="stage-filter-count">{n}</span>
              </button>
            );
          })}
        </div>
        {STAGE_OPTIONS.find((s) => s.value === stage)?.hint && (
          <p className="stage-filter-note">
            {stage === 'emerging'
              ? '研究や開発が世間の報道より先行している需要。ニュース由来の需要スコアでは下位に埋もれがちですが、早めに仕込む価値がある領域です。'
              : '既に広く報道され、世間に知られている需要。技術的な参入障壁は低めです。'}
          </p>
        )}

        <div className="filter-row">
          <div className="filter-group">
            <label>状態</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s || 'すべて'}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>並び替え</label>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="result-count">{results.length} 件見つかりました</div>
        </div>

        <div className="card-list">
          {results.map((d, i) => (
            <DemandCard key={d.id} demand={d} rank={i + 1} index={i} />
          ))}
          {results.length === 0 && (
            <div className="empty">
              <div className="empty-icon"><FoxMark size={36} /></div>
              <h2>条件に合う需要が見つかりませんでした</h2>
              <p>キーワードや分野を変えて試してみてください。</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
