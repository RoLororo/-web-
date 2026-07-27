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
  // Start at the final value; the animation overwrites it downward-then-up
  // if it actually fires. This guarantees that even when requestAnimationFrame
  // never runs (backgrounded tab, throttled mobile, low-end device), the user
  // still sees the correct number instead of a stuck 0.
  const [display, setDisplay] = useState(() => Number(value) || 0);
  const [landed, setLanded] = useState(reduced);
  const rafRef = useRef(0);
  const landTimerRef = useRef(0);
  const safetyRef = useRef(0);

  useEffect(() => {
    const to = Number(value) || 0;
    if (reduced) {
      setDisplay(to);
      setLanded(true);
      return;
    }
    // If the tab is hidden at mount, RAF won't fire until it becomes visible;
    // rather than showing a stuck initial value, jump straight to the target.
    if (typeof document !== 'undefined' && document.hidden) {
      setDisplay(to);
      setLanded(true);
      return;
    }

    setLanded(false);
    setDisplay(0);
    const start = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      setDisplay(Math.round(to * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setLanded(true);
        landTimerRef.current = window.setTimeout(() => setLanded(false), 700);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    // Safety: if RAF has been throttled to death (tab hidden mid-animation,
    // battery saver), force the final value shortly after the deadline.
    safetyRef.current = window.setTimeout(() => {
      setDisplay(to);
      setLanded(true);
    }, duration + 250);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(landTimerRef.current);
      clearTimeout(safetyRef.current);
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
