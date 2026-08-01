// ============================================================================
// Breadcrumbs — 現在地と、ひとつ上の階層へ戻る導線
//
// 検索結果からいきなり詳細ページに着地した人は、自分がサイトのどこにいるのか
// 分からないまま最初の判断をする（2026-08-01 実測: 詳細ページに現在地を示す
// 表示は無く、上へ戻る手段は「← 一覧に戻る」1 本だけだった）。
// 構造化データも同時に出すので、検索結果の URL 表示がパンくず表記になる。
//
// items: [{ name, path }]（最後の 1 件が現在地。リンクにしない）
// ============================================================================

import { Link } from 'react-router-dom';

export default function Breadcrumbs({ items }) {
  if (!items || items.length === 0) return null;
  const trail = [{ name: 'ホーム', path: '/' }, ...items];

  return (
    <nav className="breadcrumbs" aria-label="パンくずリスト">
      <ol>
        {trail.map((it, i) => {
          const isLast = i === trail.length - 1;
          return (
            <li key={it.path + i}>
              {isLast
                ? <span aria-current="page">{it.name}</span>
                : <Link to={it.path}>{it.name}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
