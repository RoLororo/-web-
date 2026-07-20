// ============================================================================
// ToastHost
// 画面下部に短時間だけ通知を積むホスト。utils/toast.js の CustomEvent を listen。
// 複数回連打しても順に積まれ、それぞれ 2.4 秒で自動的に消える。
// ============================================================================

import { useEffect, useRef, useState } from 'react';

const DURATION = 2400;

export default function ToastHost() {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  useEffect(() => {
    function handler(e) {
      const { message, type = 'info' } = e.detail || {};
      if (!message) return;
      const id = ++idRef.current;
      setItems((cur) => [...cur, { id, message, type }]);
      window.setTimeout(() => {
        setItems((cur) => cur.filter((t) => t.id !== id));
      }, DURATION);
    }
    window.addEventListener('app-toast', handler);
    return () => window.removeEventListener('app-toast', handler);
  }, []);

  return (
    <div className="toast-host" aria-live="polite" aria-atomic="true">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status">
          <span className="toast-dot" aria-hidden="true" />
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
