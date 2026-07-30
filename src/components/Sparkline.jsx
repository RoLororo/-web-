// ============================================================================
// Sparkline
// カード内の小さな折れ線グラフ。軸なし・ホバーなし。
// 末端に小さな発光ドットを置いて「現在地」を示す。
//
// viewBox 100x32 を 140x36 などに伸ばして描くため、横方向だけ拡大される
// （2026-07-30 実測: 1280px のカードで scaleX 1.40 / scaleY 1.13）。
// 折れ線の形は歪んでも構わないが、線幅と丸は歪むと目に見えるので
//   ・線幅は non-scaling-stroke で固定
//   ・末端のドットは HTML で描く（SVG の circle は楕円になる）
// ============================================================================

export default function Sparkline({ data = [], color = 'var(--green-bright)', fill = true }) {
  if (!data || data.length < 2) return null;

  const w = 100;
  const h = 32;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });

  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const areaPath = `${path} L${w - pad},${h} L${pad},${h} Z`;
  const last = points[points.length - 1];

  return (
    <span className="spark-wrap">
      <svg aria-hidden="true" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="spark-svg">
        {fill && <path d={areaPath} fill={color} opacity="0.10" />}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="spark-dot"
        aria-hidden="true"
        style={{
          left: `${(last[0] / w) * 100}%`,
          top: `${(last[1] / h) * 100}%`,
          background: color,
          boxShadow: `0 0 0 3px color-mix(in oklab, ${color} 22%, transparent)`,
        }}
      />
    </span>
  );
}
