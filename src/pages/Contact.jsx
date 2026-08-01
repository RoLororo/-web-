// ============================================================================
// Contact — お問い合わせ
//
// CONTACT_FORM_URL（src/config/site.js）が空の間は「準備中」ではなく、
// **何が足りていないかを運営者自身に向けて明示する**表示にする。
// 空のまま公開すると、広告審査で「運営者に連絡する手段がない」と判定される。
// ============================================================================

import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { useSeo, breadcrumbJsonLd } from '../utils/useSeo.js';
import ContactForm from '../components/ContactForm.jsx';
import { SITE_NAME, SITE_URL, OPERATOR, CONTACT_FORM_URL } from '../config/site.js';

export default function Contact() {
  useSeo({
    title: `お問い合わせ — ${SITE_NAME}`,
    description:
      'Demand Atlas への質問、データの誤りの指摘、掲載内容の削除依頼、その他のご連絡はこちらから受け付けています。',
    path: '/contact',
    jsonLd: [
      breadcrumbJsonLd([{ name: 'お問い合わせ', path: '/contact' }]),
      {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        name: 'お問い合わせ',
        url: `${SITE_URL}/contact`,
        inLanguage: 'ja',
      },
    ],
  });

  return (
    <div className="container section prose-page">
      <Breadcrumbs items={[{ name: 'お問い合わせ', path: '/contact' }]} />

      <header className="page-hero">
        <div className="page-hero-eyebrow">CONTACT</div>
        <h1>お問い合わせ</h1>
        <p>
          運営者（{OPERATOR}）が直接読んでいます。個人で運営しているため、
          返信までに数日いただくことがあります。
        </p>
      </header>

      <div className="prose">
        <h2>お問い合わせフォーム</h2>
        <p>
          このページから直接送信できます。会員登録は不要です。
          返信先の入力は任意で、書かなくても送信できます。
        </p>
        <ContactForm />

        {/* 外部フォームを併用したい場合の受け皿。未設定なら何も出さない
            （空の案内を出すと「連絡手段が無い」ように見えるため） */}
        {CONTACT_FORM_URL && (
          <p>
            フォームがうまく動かない場合は、
            <a href={CONTACT_FORM_URL} target="_blank" rel="noopener noreferrer">
              こちらの外部フォーム
            </a>
            もご利用いただけます。
          </p>
        )}

        <h2>送信された内容の扱い</h2>
        <ul>
          <li>ご用件・本文・返信先（入力された場合）・受付日時のみを保存します</li>
          <li>IP アドレスなど、こちらが自動で付ける識別情報は保存しません</li>
          <li>保存した内容は <strong>180 日後に自動で削除</strong>されます</li>
          <li>運営者以外は閲覧しません。第三者に提供することもありません</li>
        </ul>
        <p>
          詳しくは<Link to="/privacy">プライバシーポリシー</Link>をご確認ください。
        </p>

        <h2>こんなご連絡をお待ちしています</h2>
        <ul>
          <li>
            <strong>データの誤りの指摘</strong> —
            スコアや判定が明らかにおかしい、根拠の記事とテーマが合っていない、など。
            機械的に集めている以上、取りこぼしや誤りは起こります。指摘は歓迎します。
          </li>
          <li>
            <strong>掲載内容の削除依頼</strong> —
            当サイトはニュースの見出しと出典元へのリンクのみを掲載していますが、
            権利者の方から削除のご依頼があれば速やかに対応します。
          </li>
          <li>
            <strong>観測してほしいテーマの提案</strong> —
            追跡するテーマは手動で登録しています。提案があれば検討します。
          </li>
          <li>
            <strong>不具合の報告</strong> —
            表示が崩れる、リンクが開かない、数字が更新されない、など。
            使っている端末とブラウザを教えていただけると助かります。
          </li>
          <li>取材・掲載に関するご相談</li>
        </ul>

        <h2>お答えできないこと</h2>
        <ul>
          <li>
            個別の事業や投資に関するご相談。当サイトは観測結果を表示するだけで、
            助言を行うサービスではありません（<Link to="/terms">利用規約</Link>）。
          </li>
          <li>
            特定の個人のアクセス記録に関するお問い合わせ。
            当サイトは個人を特定できる情報を保存していないため、
            技術的に検索できません（<Link to="/privacy">プライバシーポリシー</Link>）。
          </li>
        </ul>

        <h2>先に確認していただけると早いこと</h2>
        <ul>
          <li><Link to="/methodology">計算方法と用語</Link> — スコアの出し方、判定の意味、この方法の限界</li>
          <li><Link to="/about">このサイトについて</Link> — できること・できないこと</li>
          <li><Link to="/whats-new">情報源と追加履歴</Link> — どの情報源がいつから動いているか</li>
        </ul>
      </div>
    </div>
  );
}
