// ============================================================================
// Sparkline
// カード内の小さな折れ線グラフ。軸なし・ホバーなし。
// 末端に小さな発光ドットを置いて「現在地」を示す。
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
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      {fill && <path d={areaPath} fill={color} opacity="0.10" />}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} opacity="0.25" />
      <circle cx={last[0]} cy={last[1]} r="1.5" fill={color} />
    </svg>
  );
}
