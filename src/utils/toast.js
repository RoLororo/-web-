// ============================================================================
// toast — シンプルなイベントベースのトースト API
//
// どこからでも `toast('メッセージ')` を呼ぶだけで、
// <ToastHost /> がそれを拾って画面下に短時間表示する。
// ============================================================================

export function toast(message, type = 'info') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('app-toast', { detail: { message, type } })
  );
}
