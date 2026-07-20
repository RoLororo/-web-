import { getCategories } from '../services/demandService.js';

export default function CategoryFilter({ value, onChange }) {
  const categories = ['すべて', ...getCategories()];
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
