// ============================================================================
// TrendChart
// 詳細ページ用の折れ線グラフ。SVG のみ・外部ライブラリなし。
// 描画時に左から右へ線が引かれるアニメーション付き。
//
// 目盛りのラベルは SVG の <text> ではなく HTML で描く。
// SVG は幅 100% で描かれ viewBox は固定なので、横方向だけ拡縮される
// （2026-07-30 実測: 1280px で 714/800 = 89%、375px では 293/800 = 41%）。
// その中に文字を置くと日付が横 41% に潰れて読めない。折れ線と面の歪みは
// 見た目に影響しないが、文字は影響するため文字だけ外に出す。
// 縦方向も 640px 以下では 220px / 260 単位で縮むため、位置は % で置く。
// ============================================================================

import { useMemo, useRef, useState } from 'react';

// H は viewBox の高さ。実際の描画高さは CSS 変数 --chart-h（モバイルで 220px）
// なので、縦位置は px ではなく % で置く。
const H = 260;
const PAD_T = 20, PAD_B = 30;                    // 上下の余白（viewBox 単位）

export default function TrendChart({ data = [], color, labels = null, unit = '' }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  const stats = useMemo(() => {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const yMin = Math.max(0, Math.floor((min - (max - min) * 0.1) / 5) * 5);
    const yMax = Math.ceil((max + (max - min) * 0.1) / 5) * 5;
    return { min, max, yMin, yMax, range: yMax - yMin || 1 };
  }, [data]);

  if (!stats) {
    return <div style={{ height: H, color: 'var(--text-3)' }}>データがありません</div>;
  }

  const { min, max, yMin, yMax, range } = stats;
  const lineColor = color || 'var(--green-bright)';
  const w = 800;                                 // viewBox 幅（横は拡縮される）
  const chartH = H - PAD_T - PAD_B;

  const xRatio = (i) => i / (data.length - 1);   // 0..1（HTML 側は % で置く）
  const xFor = (i) => xRatio(i) * w;
  const yFor = (v) => PAD_T + chartH - ((v - yMin) / range) * chartH;

  const points = data.map((v, i) => [xFor(i), yFor(v)]);
  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const areaPath = `${path} L${w},${PAD_T + chartH} L0,${PAD_T + chartH} Z`;

  const xIdx = [0, Math.floor(data.length / 2), data.length - 1];
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    v: Math.round(yMin + range * r),
    y: PAD_T + chartH * (1 - r),
  }));

  function handleMove(e) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const i = Math.round(ratio * (data.length - 1));
    if (i >= 0 && i < data.length) setHoverIdx(i);
  }

  function handleTouch(e) {
    const t = e.touches[0];
    if (t) handleMove({ clientX: t.clientX });
  }

  // labels（実日付）が渡された場合はそれを使う。
  // 系列の最終点は必ずしも「今日」ではない（Wikipedia の集計は 1〜2 日遅れる）ため、
  // 相対表記だけだと最大 2 日ずれた説明になる。
  function pointLabel(i) {
    if (labels && labels[i]) return labels[i].slice(5).replace('-', '/');
    return `${data.length - i}日前`;
  }

  const gradId = `chart-grad-${Math.abs(data.reduce((a, b) => a + b, 0)) % 10000}`;

  return (
    <div className="chart-wrap">
      <div className="chart-plot">
        {/* y 目盛り。縦位置は plot 高さに対する % */}
        <div className="chart-yaxis" aria-hidden="true">
          {gridLines.map((g, i) => (
            <span key={i} className="chart-ylabel" style={{ top: `${(g.y / H) * 100}%` }}>{g.v}</span>
          ))}
        </div>

        {/* グラフは装飾ではなくデータなので隠さず、読み上げ用の要約を付ける
            （2026-07-30: aria-hidden も label も無く、無名の図として読まれていた） */}
        <svg
          ref={svgRef}
          role="img"
          aria-label={
            `折れ線グラフ。${labels ? `${labels[0]} から ${labels[labels.length - 1]} まで` : `${data.length} 点`}、` +
            `最小 ${min.toLocaleString()}${unit}、最大 ${max.toLocaleString()}${unit}、` +
            `最新 ${data[data.length - 1].toLocaleString()}${unit}。`
          }
          viewBox={`0 0 ${w} ${H}`}
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
            <line
              key={i}
              x1="0" x2={w}
              y1={g.y} y2={g.y}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray={i === 0 || i === gridLines.length - 1 ? '' : '2 4'}
              vectorEffect="non-scaling-stroke"
            />
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
            vectorEffect="non-scaling-stroke"
          />

          {/* Hover の縦線だけ SVG に置く（点と値は HTML 側で丸く描く） */}
          {hoverIdx !== null && (
            <line
              className="chart-hover-line"
              x1={xFor(hoverIdx)} x2={xFor(hoverIdx)}
              y1={PAD_T} y2={PAD_T + chartH}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* 最新点のドット / hover のドットは HTML。SVG 内の円は横方向に
            潰れて楕円になるため（41% 幅では明確に歪む）。 */}
        <span
          className={`chart-dot ${hoverIdx === null ? 'chart-dot-latest' : ''}`}
          aria-hidden="true"
          style={{
            left: `calc(var(--chart-gutter) + ${xRatio(hoverIdx ?? data.length - 1) * 100}% - var(--chart-gutter) * ${xRatio(hoverIdx ?? data.length - 1)})`,
            top: `${(yFor(data[hoverIdx ?? data.length - 1]) / H) * 100}%`,
            background: lineColor,
          }}
        />

        {/* ツールチップも plot の中。top の % が plot の高さ基準になる */}
      {hoverIdx !== null && (
          <div
            className="chart-tooltip"
            style={{
              left: `calc(var(--chart-gutter) + ${xRatio(hoverIdx) * 100}% - var(--chart-gutter) * ${xRatio(hoverIdx)})`,
              top: `${(yFor(data[hoverIdx]) / H) * 100}%`,
            }}
          >
            <span className="k">{pointLabel(hoverIdx)}</span>
            <span className="v">{data[hoverIdx].toLocaleString()}{unit}</span>
          </div>
        )}
      </div>

      {/* x 目盛り。% 指定なので拡縮しても位置がずれない */}
      <div className="chart-xaxis" aria-hidden="true">
        {xIdx.map((i) => (
          <span
            key={i}
            className="chart-xlabel"
            style={{ left: `calc(var(--chart-gutter) + ${xRatio(i) * 100}% - var(--chart-gutter) * ${xRatio(i)})` }}
          >
            {pointLabel(i)}
          </span>
        ))}
      </div>

    </div>
  );
}
