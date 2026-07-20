// ============================================================================
// usePageTitle
// ページマウント時に document.title を切り替える最小限のフック。
// アンマウント時は特に戻さない（次ページが必ず自分のタイトルをセットする前提）。
// ============================================================================

import { useEffect } from 'react';

const DEFAULT_TITLE = 'Demand Atlas — 世の中の需要を可視化する';

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title || DEFAULT_TITLE;
  }, [title]);
}
