// ============================================================================
// NotFound — 存在しないルートで表示される 404 ページ
//
// SPA は全ルートを index.html に書き換えて返すため、存在しない URL でも
// HTTP ステータスは 200 になる（2026-08-01 実測: /this-page-does-not-exist が
// 200 を返していた）。検索エンジンから見ると「中身の薄いページが無限にある」
// 状態になり、サイト全体の評価が下がる。
// 静的ホスティングのままステータスを 404 にはできないので、
// **このページにいる間だけ noindex を出して**索引から外してもらう。
// follow は残して、ここからホームへ辿れることは伝える。
// ============================================================================

import { Link } from 'react-router-dom';
import FoxMark from '../components/FoxMark.jsx';
import { useSeo } from '../utils/useSeo.js';

export default function NotFound() {
  useSeo({
    title: 'ページが見つかりません — Demand Atlas',
    description: 'お探しのページは見つかりませんでした。ホームから需要ランキングや分野別の一覧を辿ってください。',
    noindex: true,
  });

  return (
    <div className="container section">
      <div className="empty">
        <div className="empty-icon"><FoxMark size={36} /></div>
        {/* 404 でも見出しレベルは h1 から始める（CSS は .empty h1 で h3 と同一） */}
        <h1>ページが見つかりません</h1>
        <p>
          URL をご確認いただくか、下のリンクから探し直してください。
          テーマの URL が変わることはないので、リンク切れであれば
          <Link to="/contact">お問い合わせ</Link>から教えていただけると助かります。
        </p>
        <div className="empty-actions">
          <Link to="/" className="btn primary">ホームへ戻る</Link>
          <Link to="/rankings" className="btn">需要ランキングを見る</Link>
          <Link to="/explore" className="btn">テーマを検索する</Link>
        </div>
      </div>
    </div>
  );
}
