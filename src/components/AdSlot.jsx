// ============================================================================
// AdSlot — 広告の「置き場所」だけを先に決めておくための枠
//
// 広告コードはまだ入れない。入れる前にやっておかないと後で壊れるのは
// **高さの確保**で、広告が後から挿し込まれると本文が下へ飛び、読んでいる途中の
// 人が行を見失う（Core Web Vitals の CLS が悪化し、検索順位にも効く）。
// そこで先に枠だけ確保し、コードは ADS_ENABLED を true にした時だけ入れる。
//
// 現在: ADS_ENABLED = false → 本番では何も描画しない（空箱を出さない）。
// 開発時 (import.meta.env.DEV) は薄い枠線で位置だけ見えるようにする。
//
// 有効化の手順:
//   1. AdSense の審査に通る
//   2. ADS_ENABLED を true にする
//   3. index.html に AdSense のスクリプトタグを 1 本だけ追加する
//   4. この中の <ins className="adsbygoogle"> のコメントを実物に置き換える
// ============================================================================

/** 審査通過後に true にする。ここ 1 か所で全枠が同時に切り替わる */
export const ADS_ENABLED = false;

/**
 * 枠の種類ごとの予約高さ。widthに対して高さを固定し、CLS を 0 に保つ。
 *   inline    … 本文の途中に挟む横長枠（モバイル 280px / デスクトップ 100px）
 *   rectangle … 記事末尾やサイドの長方形（300x250 相当）
 *   list      … 一覧の途中に 1 枚だけ挟むカード型
 */
const SIZES = {
  inline:    { mobile: 280, desktop: 100 },
  rectangle: { mobile: 250, desktop: 250 },
  list:      { mobile: 280, desktop: 250 },
};

export default function AdSlot({ variant = 'inline', label = '広告', id }) {
  const size = SIZES[variant] || SIZES.inline;

  if (!ADS_ENABLED) {
    // 開発中だけ位置を可視化する。本番では完全に何も出さない
    if (!import.meta.env.DEV) return null;
    return (
      <div
        className={`ad-slot ad-slot-${variant} ad-slot-preview`}
        style={{ '--ad-h-mobile': `${size.mobile}px`, '--ad-h-desktop': `${size.desktop}px` }}
        aria-hidden="true"
      >
        <span>広告枠（{variant} / {id || '未設定'}）</span>
      </div>
    );
  }

  return (
    <aside
      className={`ad-slot ad-slot-${variant}`}
      style={{ '--ad-h-mobile': `${size.mobile}px`, '--ad-h-desktop': `${size.desktop}px` }}
      aria-label={label}
    >
      {/* 審査通過後にここへ <ins className="adsbygoogle" ...> を入れる */}
    </aside>
  );
}
