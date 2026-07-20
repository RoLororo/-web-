// ============================================================================
// TrendChart
// 詳細ページ用の折れ線グラフ。SVG のみ・外部ライブラリなし。
// 描画時に左から右へ線が引かれるアニメーション付き。
// ============================================================================

import { useMemo, useRef, useState } from 'react';

export default function TrendChart({ data = [], color }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  if (!data || data.length < 2) {
    return <div style={{ height: 260, color: 'var(--text-3)' }}>データがありません</div>;
  }

  const lineColor = color || 'var(--green-bright)';
  const w = 800;
  const h = 260;
  const padL = 32, padR = 16, padT = 20, padB = 30;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const { min, max, yMin, yMax, range } = useMemo(() => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const yMin = Math.max(0, Math.floor((min - (max - min) * 0.1) / 5) * 5);
    const yMax = Math.ceil((max + (max - min) * 0.1) / 5) * 5;
    return { min, max, yMin, yMax, range: yMax - yMin || 1 };
  }, [data]);

  const xFor = (i) => padL + (i / (data.length - 1)) * chartW;
  const yFor = (v) => padT + chartH - ((v - yMin) / range) * chartH;

  const points = data.map((v, i) => [xFor(i), yFor(v)]);
  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const areaPath = `${path} L${xFor(data.length - 1)},${padT + chartH} L${xFor(0)},${padT + chartH} Z`;

  const xLabels = [0, Math.floor(data.length / 2), data.length - 1];
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    v: Math.round(yMin + range * r),
    y: padT + chartH * (1 - r),
  }));

  function handleMove(e) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    const i = Math.round(((relX - padL) / chartW) * (data.length - 1));
    if (i >= 0 && i < data.length) setHoverIdx(i);
  }

  function handleTouch(e) {
    const t = e.touches[0];
    if (t) handleMove({ clientX: t.clientX });
  }

  function pointLabel(i) {
    return `${data.length - i}日前`;
  }

  const tooltipPos = hoverIdx !== null ? {
    left: `${(xFor(hoverIdx) / w) * 100}%`,
    top:  `${(yFor(data[hoverIdx]) / h) * 100}%`,
  } : null;

  const gradId = `chart-grad-${Math.abs(data.reduce((a, b) => a + b, 0)) % 10000}`;

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="chart-svg"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y grid */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={padL} x2={w - padR}
              y1={g.y}  y2={g.y}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray={i === 0 || i === gridLines.length - 1 ? '' : '2 4'}
            />
            <text
              x={padL - 8} y={g.y + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-2)"
              fontFamily="var(--font-num)"
            >
              {g.v}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xLabels.map((i) => (
          <text
            key={i}
            x={xFor(i)}
            y={h - padB + 18}
            textAnchor="middle"
            fontSize="10"
            fill="var(--text-2)"
            fontFamily="var(--font-num)"
          >
            {pointLabel(i)}
          </text>
        ))}

        {/* Area gradient */}
        <path d={areaPath} fill={`url(#${gradId})`} className="chart-area" />

        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-line"
        />

        {/* Always-visible pulsing "current" dot at the latest data point */}
        {hoverIdx === null && (
          <g style={{ opacity: 0, animation: 'fadeIn 0.4s var(--ease) 1.1s forwards' }}>
            <circle
              cx={xFor(data.length - 1)}
              cy={yFor(data[data.length - 1])}
              r="6"
              fill={lineColor}
              opacity="0.18"
            />
            <circle
              cx={xFor(data.length - 1)}
              cy={yFor(data[data.length - 1])}
              r="3.2"
              fill={lineColor}
              style={{ animation: 'chartDotPulse 2.4s ease-in-out infinite' }}
            />
          </g>
        )}

        {/* Hover */}
        {hoverIdx !== null && (
          <>
            <line
              className="chart-hover-line"
              x1={xFor(hoverIdx)} x2={xFor(hoverIdx)}
              y1={padT} y2={padT + chartH}
            />
            <circle cx={xFor(hoverIdx)} cy={yFor(data[hoverIdx])} r="9" fill={lineColor} opacity="0.18" />
            <circle cx={xFor(hoverIdx)} cy={yFor(data[hoverIdx])} r="4" fill={lineColor} />
          </>
        )}
      </svg>
      {hoverIdx !== null && tooltipPos && (
        <div className="chart-tooltip" style={tooltipPos}>
          <span className="k">{pointLabel(hoverIdx)}</span>
          <span className="v">{data[hoverIdx]}</span>
        </div>
      )}
    </div>
  );
}
