import { useMemo } from 'react';
import { getCategorySummaries } from '../services/demandService.js';

export default function CategoryFilter({ value, onChange }) {
  // 観測テーマが 0 件の分野はチップに出さない。
  //   実測 (2026-07-30): カテゴリマスタ 9 件のうち実データがあるのは 3 件で、
  //   残り 6 チップは押すと結果 0 件・説明なしの行き止まりだった。
  const categories = useMemo(
    () => ['すべて', ...getCategorySummaries().filter((c) => c.count > 0).map((c) => c.name)],
    [],
  );
  return (
    <div className="chips" role="tablist" aria-label="分野で絞り込み">
      {categories.map((cat) => {
        const active = value === cat || (cat === 'すべて' && !value);
        return (
          <button
            key={cat}
            className={`chip ${active ? 'active' : ''}`}
            onClick={() => onChange(cat === 'すべて' ? '' : cat)}
            role="tab"
            aria-selected={active}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
