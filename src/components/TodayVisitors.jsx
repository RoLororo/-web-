// ============================================================================
// TodayVisitors — 「今日訪れた人 ○人」
//
// 数えられていない時（ストア未設定・障害・ネットワーク断）は**何も表示しない**。
// 0 人と表示すると「今日は誰も来ていない」という実測していない主張になるため。
// ============================================================================

import { useEffect, useState } from 'react';
import AnimatedNumber from './AnimatedNumber.jsx';
import { fetchTodayVisitors } from '../services/visitorService.js';

export default function TodayVisitors() {
  const [state, setState] = useState(null);

  useEffect(() => {
    // アンマウント時に abort しない。StrictMode の即時アンマウントや素早い
    // 画面遷移で、共有している 1 本のリクエストごと中断してしまうため
    // （2026-07-31 実測）。結果を捨てるだけにする。
    let cancelled = false;
    fetchTodayVisitors().then((r) => {
      if (!cancelled && r.available) setState(r);
    });
    return () => { cancelled = true; };
  }, []);

  if (!state) return null;

  return (
    <div className="today-visitors" title="同じブラウザからは 1 日 1 人として数えます（ページビューではありません）">
      <span className="tv-dot" aria-hidden="true" />
      <span className="tv-label">今日訪れた人</span>
      <span className="tv-value">
        <AnimatedNumber value={state.today} duration={800} />
        <span className="tv-unit">人</span>
      </span>
      {state.countedThisVisit && <span className="tv-you">あなたを含む</span>}
    </div>
  );
}
