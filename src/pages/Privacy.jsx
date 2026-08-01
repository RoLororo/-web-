// ============================================================================
// Privacy — プライバシーポリシー
//
// 実装と一致させること。ここに書いてあるのに保存していない、逆に書いていない
// のに保存している、という状態を作らない。
// 2026-08-01 時点の実装（実測）:
//   localStorage … theme / favorites / visit-sent:<日付> / pages-sent:<日付> / known-visitor
//   サーバー保存 … 整数カウンタ、サイト内のパス、外部リンク元のホスト名のみ
//   保存しない  … IP アドレス、User-Agent、Cookie、個人を識別できる ID
// ============================================================================

import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { useSeo, breadcrumbJsonLd } from '../utils/useSeo.js';
import { SITE_NAME, OPERATOR } from '../config/site.js';
import { ADS_ENABLED } from '../components/AdSlot.jsx';

const UPDATED = '2026年8月1日';

export default function Privacy() {
  useSeo({
    title: `プライバシーポリシー — ${SITE_NAME}`,
    description:
      'Demand Atlas が取得する情報と取得しない情報、localStorage の用途、アクセス集計の仕組み、広告配信について説明します。IP アドレスなど個人を特定できる情報は保存していません。',
    path: '/privacy',
    jsonLd: breadcrumbJsonLd([{ name: 'プライバシーポリシー', path: '/privacy' }]),
  });

  return (
    <div className="container section prose-page">
      <Breadcrumbs items={[{ name: 'プライバシーポリシー', path: '/privacy' }]} />

      <header className="page-hero">
        <div className="page-hero-eyebrow">PRIVACY POLICY</div>
        <h1>プライバシーポリシー</h1>
        <p>最終更新日：{UPDATED}</p>
      </header>

      <div className="prose">
        <p>
          {SITE_NAME}（以下「当サイト」）は、{OPERATOR} が個人で運営しています。
          当サイトが扱う情報について、実際の実装どおりに説明します。
        </p>

        <h2>1. 保存していない情報</h2>
        <p>当サイトは、次の情報を<strong>保存していません</strong>。</p>
        <ul>
          <li>IP アドレス</li>
          <li>User-Agent（ブラウザの種類・OS の情報）</li>
          <li>氏名・メールアドレス・電話番号・住所などの個人情報（ただし、お問い合わせフォームに利用者ご自身が入力された返信先は除きます。第 4 項をご覧ください）</li>
          <li>利用者を一意に識別するための ID やフィンガープリント</li>
          <li>当サイトが発行する Cookie（現時点では 1 つも発行していません）</li>
        </ul>
        <p>
          アクセス集計のリクエスト処理中、短時間の連続送信を弾く目的で IP アドレスを
          サーバーのメモリ上で一時的に参照しますが、
          <strong>保存も記録も外部送信もしていません</strong>（1 分で消えます）。
        </p>

        <h2>2. ブラウザに保存する情報（localStorage）</h2>
        <p>
          利用者の端末のブラウザ内にのみ保存され、当サイトのサーバーには送信されません。
          ブラウザの設定からいつでも削除できます。
        </p>
        <table className="prose-table">
          <thead>
            <tr><th>キー</th><th>用途</th></tr>
          </thead>
          <tbody>
            <tr><td>demand-atlas:theme</td><td>配色（ダーク／ライト）の設定を覚えておくため</td></tr>
            <tr><td>demand-atlas:favorites</td><td>お気に入りに登録したテーマの一覧</td></tr>
            <tr><td>demand-atlas:visit-sent:&lt;日付&gt;</td><td>その日すでに訪問を集計したかどうかの記録（同じ人を二重に数えないため）</td></tr>
            <tr><td>demand-atlas:pages-sent:&lt;日付&gt;</td><td>その日すでに見たページの一覧（同じページを二重に数えないため）</td></tr>
            <tr><td>demand-atlas:known-visitor</td><td>初めての訪問か、再訪かの判定のため</td></tr>
          </tbody>
        </table>
        <p>
          日付の付いたキーは、翌日以降に自動で削除されます。
        </p>

        <h2>3. アクセス集計について</h2>
        <p>
          当サイトは Google アナリティクスなどの外部アクセス解析サービスを使用していません。
          自前の仕組みで、次の情報だけをサーバー側に記録しています。
        </p>
        <ul>
          <li>その日の訪問件数、新規／再訪の件数（<strong>数値のみ</strong>）</li>
          <li>閲覧されたページのパス（あらかじめ定義したサイト内のパスに限る。検索語やパラメータは削除します）</li>
          <li>外部サイトから来た場合の、リンク元の<strong>ホスト名のみ</strong>（例：<code>x.com</code>。URL のパスやパラメータは記録しません）</li>
        </ul>
        <p>
          記録されるのは「訪問が 1 件あった」という無記名の事実だけで、
          <strong>誰が訪問したかを後から特定することはできません</strong>。
          同じ人かどうかの判定は利用者のブラウザ内で完結しており、
          サーバーには判定結果の集計値だけが届きます。
          そのため、別のブラウザや別の端末からの訪問は別の訪問として数えられます。
        </p>
        <p>
          集計値は Upstash（Redis 互換のデータベースサービス）に保存され、
          日別の記録は約 400 日で自動的に削除されます。
        </p>

        <h2>4. お問い合わせで送信された情報</h2>
        <p>
          <Link to="/contact">お問い合わせページ</Link>のフォームから送信された場合、
          次の情報のみを保存します。
        </p>
        <table className="prose-table">
          <thead>
            <tr><th>項目</th><th>内容</th></tr>
          </thead>
          <tbody>
            <tr><td>ご用件</td><td>あらかじめ用意した選択肢のいずれか</td></tr>
            <tr><td>本文</td><td>利用者が入力した文章（最大 2,000 文字）</td></tr>
            <tr><td>返信先</td><td><strong>入力は任意です。</strong>入力された場合のみ保存します</td></tr>
            <tr><td>受付日時</td><td>送信された日時</td></tr>
          </tbody>
        </table>
        <p>
          <strong>IP アドレスや、こちらが自動で付ける識別情報は保存しません。</strong>
          連続送信を弾く目的で IP アドレスをサーバーのメモリ上で一時的に参照しますが、
          保存も記録もしていません。
        </p>
        <p>
          送信された内容は Upstash に保存され、<strong>180 日後に自動的に削除されます</strong>。
          運営者以外は閲覧せず、第三者に提供することもありません。
          返信先を入力されなかった場合、当サイトから連絡する手段はありません。
        </p>

        <h2>5. 外部サイトへのリンク</h2>
        <p>
          当サイトには、ニュース記事・論文・技術記事など外部サイトへのリンクが多数あります。
          リンク先での個人情報の扱いについては、各サイトのプライバシーポリシーをご確認ください。
          当サイトはリンク先の内容や、リンク先で収集される情報について責任を負いません。
        </p>

        <h2>6. 広告配信について</h2>
        {ADS_ENABLED ? (
          <>
            <p>
              当サイトでは、第三者配信の広告サービス（Google AdSense）を利用しています。
              広告配信事業者は、利用者の興味に応じた広告を表示するために Cookie を使用することがあります。
            </p>
            <p>
              Cookie を無効にする方法や、Google AdSense に関する詳細は
              <a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank" rel="noopener noreferrer">
                広告 – ポリシーと規約 – Google
              </a>
              をご確認ください。パーソナライズ広告は
              <a href="https://myadcenter.google.com/" target="_blank" rel="noopener noreferrer">
                Google の広告設定
              </a>
              から無効にできます。
            </p>
          </>
        ) : (
          <>
            <p>
              <strong>現時点では、当サイトに広告は掲載されていません。</strong>
            </p>
            <p>
              将来的に第三者配信の広告サービス（Google AdSense など）を利用する場合、
              広告配信事業者が利用者の興味に応じた広告を表示するために Cookie を使用することがあります。
              その際は、掲載開始前にこのページを更新してお知らせします。
              Cookie を無効にする方法や、Google AdSense に関する詳細は
              <a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank" rel="noopener noreferrer">
                広告 – ポリシーと規約 – Google
              </a>
              をご確認ください。
            </p>
          </>
        )}

        <h2>7. 掲載しているデータについて</h2>
        <p>
          当サイトが表示するニュース記事の見出し、論文情報、技術記事の情報は、
          各サービスが公開している API および RSS から取得したものです。
          見出しと出典元へのリンクのみを掲載しており、本文の複製は行っていません。
          掲載内容の削除をご希望の権利者の方は、<Link to="/contact">お問い合わせ</Link>からご連絡ください。
        </p>

        <h2>8. 利用者の権利</h2>
        <p>
          当サイトは個人を特定できる情報を保存していないため、
          特定の個人に関する記録を検索・訂正・削除することは技術的にできません。
          端末に保存された情報については、ブラウザの設定から利用者ご自身でいつでも削除できます。
        </p>
        <p>
          お問い合わせで送信された内容については、受付番号をお知らせいただければ、
          保持期間の 180 日を待たずに削除します。
        </p>

        <h2>9. ポリシーの変更</h2>
        <p>
          内容を変更する場合は、このページの「最終更新日」を更新します。
          広告の掲載開始など、扱う情報が増える変更の場合は、その内容を明記します。
        </p>

        <h2>10. お問い合わせ</h2>
        <p>
          本ポリシーに関するご質問は、<Link to="/contact">お問い合わせページ</Link>からご連絡ください。
        </p>
      </div>
    </div>
  );
}
