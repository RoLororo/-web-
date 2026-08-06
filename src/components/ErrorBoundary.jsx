// ============================================================================
// ErrorBoundary — 描画時の例外を受け止め、白画面（＝100% 直帰）を防ぐ安全網。
//
// なぜ必要か:
//   SPA は hydrate 後、いずれかのコンポーネントが描画で throw すると React が
//   ツリー全体を unmount し、全ページが白画面になる。検索/共有で着地した初回
//   ユーザーが白画面を見ると即離脱し、二度と来ず、共有もされない＝獲得の複利を
//   直接失う。データ取得失敗は demandService が mock で吸収するが、描画時の例外
//   （想定外のデータ形状・null 参照など）は従来どこも受け止めていなかった。
//
//   この境界はエラー時に「壊れた画面」ではなく、ヘッダー/フッターを残したまま
//   本文だけを穏やかな復帰導線（再読み込み・ホーム）に差し替える。
//   App 側で location.pathname を key に持つ要素の内側に置くため、別ページへ
//   遷移すると境界は再マウントされ自動的に復帰を試みる。
// ============================================================================

import { Component } from 'react';
import { Link } from 'react-router-dom';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // 本番でも原因を追えるように残す（ユーザーには出さない）。
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] 描画中に例外を捕捉:', error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="container section" style={{ minHeight: '60vh' }}>
        <h1 className="section-title">表示中に問題が発生しました</h1>
        <p className="section-sub" style={{ maxWidth: '40em' }}>
          このページの表示で予期しないエラーが起きました。ページを再読み込みするか、
          ホームから他の需要テーマをご覧ください。データ自体は毎日更新されています。
        </p>
        <div style={{ display: 'flex', gap: 'var(--s-3)', marginTop: 'var(--s-4)', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            再読み込み
          </button>
          <Link className="btn" to="/">ホームへ</Link>
        </div>
      </div>
    );
  }
}
