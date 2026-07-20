// ============================================================================
// FoxMark
//
// サービスのブランドアイコン。「情報の中から需要を見つけ出す知的な狐」。
// 白黒基調、ミニマルな幾何学デザイン。currentColor でヘッドの色を切り替え、
// くり抜き部分は背景色（--bg）を透過させて表現する。
// ============================================================================

export default function FoxMark({ size = 32, className = '', style, ariaLabel = 'Demand Atlas' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Head silhouette — angular fox with pointed ears */}
      <path
        d="M4.5 4.5 L11.5 9.5 L20.5 9.5 L27.5 4.5 L27 15 L22.5 22.5 L16 27.5 L9.5 22.5 L5 15 Z"
        fill="currentColor"
      />

      {/* Inner ears (subtle triangular cut) */}
      <path d="M7 7 L11 10 L9 12 Z" fill="var(--bg)" opacity="0.55" />
      <path d="M25 7 L21 10 L23 12 Z" fill="var(--bg)" opacity="0.55" />

      {/* Sharp diagonal eyes */}
      <path
        d="M9.4 13 L12.4 15"
        stroke="var(--bg)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M22.6 13 L19.6 15"
        stroke="var(--bg)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* Muzzle wedge */}
      <path
        d="M13.5 18 L16 22.5 L18.5 18 Z"
        fill="var(--bg)"
      />

      {/* Tiny green nose — the "insight" spark */}
      <circle cx="16" cy="18.4" r="1.05" fill="var(--green-bright)" />
    </svg>
  );
}
