// ============================================================================
// AnimatedNumber
//
// 数値を 0 から value まで軽くカウントアップして表示する。
// - easeOutCubic で自然な減速
// - 着地時に短い緑グロー（.num-land）を焚いて「値が確定した」感じを出す
// - prefers-reduced-motion が有効なら、即座に最終値を表示する
// ============================================================================

import { useEffect, useRef, useState } from 'react';

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function AnimatedNumber({
  value,
  duration = 900,
  suffix = '',
  prefix = '',
  format = (n) => n,
}) {
  const reduced = prefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const [landed, setLanded] = useState(reduced);
  const rafRef = useRef(0);
  const landTimerRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      setLanded(true);
      return;
    }

    setLanded(false);
    const start = performance.now();
    const to = Number(value) || 0;

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      setDisplay(Math.round(to * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Trigger landing pulse; remove class after animation completes
        setLanded(true);
        landTimerRef.current = window.setTimeout(() => setLanded(false), 700);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(landTimerRef.current);
    };
  }, [value, duration, reduced]);

  return (
    <span className={landed ? 'num-land' : undefined} style={{ display: 'inline-block' }}>
      {prefix}
      {format(display)}
      {suffix}
    </span>
  );
}
