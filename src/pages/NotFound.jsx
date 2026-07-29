// ============================================================================
// NotFound — 存在しないルートで表示される 404 ページ
// ============================================================================

import { Link } from 'react-router-dom';
import FoxMark from '../components/FoxMark.jsx';
import { usePageTitle } from '../utils/usePageTitle.js';

export default function NotFound() {
  usePageTitle('ページが見つかりません — Demand Atlas');
  return (
    <div className="container section">
      <div className="empty">
        <div className="empty-icon"><FoxMark size={36} /></div>
        {/* 404 でも見出しレベルは h1 から始める（CSS は .empty h1 で h3 と同一） */}
        <h1>ページが見つかりません</h1>
        <p>URLをご確認いただくか、ホームから再度探索してみてください。</p>
        <Link to="/" className="btn primary">ホームへ戻る</Link>
      </div>
    </div>
  );
}
