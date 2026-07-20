// ============================================================================
// Explore — 検索・フィルタ・並び替えができる探索ページ
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DemandCard from '../components/DemandCard.jsx';
import CategoryFilter from '../components/CategoryFilter.jsx';
import FoxMark from '../components/FoxMark.jsx';
import { searchDemands } from '../services/demandService.js';
import { usePageTitle } from '../utils/usePageTitle.js';

const STATUS_OPTIONS = ['', '急上昇', '成長中', '安定', '下降'];
const SORT_OPTIONS = [
  { value: 'score',   label: '需要度が高い順' },
  { value: 'change',  label: '急上昇順' },
  { value: 'updated', label: '最近注目された順' },
];

export default function Explore() {
  usePageTitle('需要を探索する — Demand Atlas');
  const [params, setParams] = useSearchParams();

  const [keyword, setKeyword]   = useState(params.get('q') || '');
  const [category, setCategory] = useState(params.get('category') || '');
  const [status, setStatus]     = useState(params.get('status') || '');
  const [sort, setSort]         = useState(params.get('sort') || 'score');

  useEffect(() => {
    const next = {};
    if (keyword)  next.q = keyword;
    if (category) next.category = category;
    if (status)   next.status = status;
    if (sort && sort !== 'score') next.sort = sort;
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, category, status, sort]);

  const results = useMemo(
    () => searchDemands({ keyword, category, status, sort }),
    [keyword, category, status, sort]
  );

  return (
    <div>
      <section className="section container">
        <div className="section-head">
          <div>
            <h2 className="section-title">需要を探す</h2>
            <p className="section-sub">キーワード・分野・状態から需要テーマを探索できます。</p>
          </div>
        </div>

        <div className="search-bar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="例：AI、副業、健康、教育…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <CategoryFilter value={category} onChange={setCategory} />

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
              <h3>条件に合う需要が見つかりませんでした</h3>
              <p>キーワードや分野を変えて試してみてください。</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
