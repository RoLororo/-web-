// ============================================================================
// ThemeLink — 履歴由来のテーマ参照を安全にリンクする
//
//   ■ なぜ必要か（2026-07-30 実測）
//     history には 11 テーマの観測があるが、demands.json は 10 テーマしか持たない。
//     `ai-content-generation` はニュースが 1 件も取れない日に demand 配列から
//     外れる（themeCatalog.js の注記どおり、恒久的な欠落ではない）。
//     その結果、履歴を読む 4 ページ（Home / ランキング / 変化 / 新規追加）から
//     詳細ページへのリンクが 11 本張られ、押すと「この需要は見つかりませんでした」
//     に着地していた。ランキングでは 1 位がこのリンクだった。
//
//   ■ 方針
//     詳細ページが存在するテーマだけリンクにする。存在しないテーマは
//     同じ見た目のテキストとして描画し、理由を title 属性で説明する。
//     観測データ自体は本物なので、行そのものは消さない。
//
//   ■ 表示名
//     demands.json → themeCatalog の順に解決する。生の id は表示しない。
// ============================================================================

import { Link } from 'react-router-dom';
import { getDemandById } from '../services/demandService.js';
import { themeTitle } from '../services/themeCatalog.js';

const NO_DETAIL_HINT = 'この期間はニュースが観測されず、詳細ページが生成されていません（観測データ自体は有効です）';

/**
 * @param {string} themeId    テーマ id
 * @param {string} className  リンク／テキスト共通のクラス
 * @param {React.ReactNode} children 明示的な表示内容（省略時はテーマ名を解決）
 */
export default function ThemeLink({ themeId, className = '', children }) {
  const demand = getDemandById(themeId);
  const label = children ?? demand?.title ?? themeTitle(themeId);

  if (!demand) {
    return (
      <span className={`${className} theme-link-plain`.trim()} title={NO_DETAIL_HINT}>
        {label}
      </span>
    );
  }
  return (
    <Link to={`/demand/${themeId}`} className={className}>
      {label}
    </Link>
  );
}
