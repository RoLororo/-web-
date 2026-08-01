// ============================================================================
// Glossary — サイトに出てくる言葉の定義
//
// 判定ラベルとスコアの重みは src/config/site.js から取る（説明と実装がずれないため）。
// それ以外の用語はここに人が書く。
// ============================================================================

import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { useSeo, breadcrumbJsonLd } from '../utils/useSeo.js';
import { SITE_NAME, SCORE_FORMULA, VERDICTS } from '../config/site.js';

/** 用語。q は FAQ 構造化データ用の質問文 */
const TERMS = [
  {
    term: '需要スコア',
    q: '需要スコアとは何ですか？',
    body:
      '0〜100 の数字で、「そのテーマが直近どれだけ動いたか」を表します。' +
      'ニュースの量・直近の伸び・話題の広がり・情報の新しさの 4 つを、決まった重みで足したものです。' +
      '計算式は固定で、日によって変わりません。',
    note: '将来の予測ではありません。すでに起きたことの集計です。',
    link: { to: '/methodology', label: '計算方法を見る' },
  },
  {
    term: '観測の確かさ',
    q: '「観測の確かさ」はどう決まりますか？',
    body:
      'そのスコアが、どれだけ揃った材料から出たかを示す数字です。' +
      '7 つのうち何か所で実際に観測できたか、実際に取れた件数はいくつか、' +
      '情報源どうしで動きが食い違っていないか、の 3 点から決まります。',
    note: 'スコアより先にこちらを見てください。これが低いテーマは、少ない材料で出た数字です。',
    link: { to: '/sources', label: '取得状況を見る' },
  },
  {
    term: 'フロー指標',
    q: 'フロー指標とは何ですか？',
    body:
      '「決まった期間に、新しくどれだけ起きたか」を数える指標です。' +
      '直近 30 日に投稿された記事の数、作られたリポジトリの数などがこれにあたります。' +
      'Demand Atlas の 7 情報源のうち 5 つがフローです。',
    note: '期間を区切っているので、増えたか減ったかを比べられます。',
  },
  {
    term: 'ストック指標',
    q: 'ストック指標とは何ですか？',
    body:
      '「これまでに合計でどれだけ存在するか」を数える指標です。' +
      '国立国会図書館の書誌件数がこれにあたります。' +
      '古くからある話題ほど数字が大きくなります。',
    note:
      'フローと同じ計算に混ぜると、昔からある主題ほど「成長している」ように見えてしまいます。' +
      'そのため増加率の計算からは外しています。',
    link: { to: '/sources/ndl', label: '国立国会図書館の扱いを見る' },
  },
  {
    term: '勢い',
    q: '「勢い」の数字は何を見ていますか？',
    body:
      '直近 2 日の観測量が、他のテーマと比べてどれだけ速いペースかを 0〜100 で表したものです。' +
      '観測中の全テーマの中央値を基準にしています。',
    note: '絶対量ではなく「相対的な速さ」です。全体が静かな日は、小さな動きでも高く出ます。',
  },
  {
    term: '参入しやすさ',
    q: '「参入しやすさ」はどう判断していますか？',
    body:
      '既製のアプリがあるか、実装ノウハウが共有されているか、一般の認知があるかの 3 点から、' +
      '0〜100 で機械的に算出しています。',
    note:
      '事業としての難易度ではありません。資金・規制・人材といった要素は一切見ていません。',
  },
  {
    term: '競争',
    q: '「競争」の数字は何を意味しますか？',
    body:
      '同じテーマで既に動いている作り手・製品がどれだけいるかを 0〜100 で表したものです。' +
      '数字が大きいほど、既に人が多い領域です。',
    note:
      'App Store で観測できていないテーマは低く出やすくなります。' +
      '「競争がゆるい」ではなく「観測できていない」可能性を先に疑ってください。',
    link: { to: '/sources/appstore', label: 'App Store の限界を見る' },
  },
  {
    term: '根拠',
    q: 'スコアの根拠は確認できますか？',
    body:
      'できます。テーマ詳細ページの下部に、スコアの計算に使われた実際のニュース記事の見出しが並んでいます。' +
      'そのまま出典元のページを開けます。',
    note:
      'Demand Atlas は見出しと出典元へのリンクのみを掲載しています。記事本文の複製はしていません。',
  },
  {
    term: 'ルールベース',
    q: 'AI が分析しているのですか？',
    body:
      'いいえ。スコア・判定・事業アイデアを含め、サイトに出ている数字と文章は' +
      'すべてあらかじめ決めたルールによる計算結果です。大規模言語モデルによる生成は使っていません。',
    note:
      '表現は硬く、同じ言い回しが繰り返されます。代わりに、同じ入力からは必ず同じ出力が出ますし、' +
      '存在しない事実が混ざることもありません。',
  },
  {
    term: '観測窓',
    q: '「直近 30 日」はいつからいつまでですか？',
    body:
      '取得を実行した日を終わりとする 30 日間です。毎日 1 回実行するので、毎日 1 日ずつずれていきます。' +
      'App Store だけは当日 1 日分の断面です。',
    note: '情報源ごとに窓の長さが違うため、情報源をまたいだ絶対量の比較はできません。',
  },
];

export default function Glossary() {
  useSeo({
    title: `用語集 — 需要スコア・観測の確かさ・フローとストック | ${SITE_NAME}`,
    description:
      'Demand Atlas に出てくる用語の定義です。需要スコア、観測の確かさ、フロー指標とストック指標の違い、勢い・参入しやすさ・競争の意味を説明します。',
    path: '/glossary',
    jsonLd: [
      breadcrumbJsonLd([{ name: '用語集', path: '/glossary' }]),
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          ...TERMS.map((t) => ({
            '@type': 'Question',
            name: t.q,
            acceptedAnswer: { '@type': 'Answer', text: `${t.body} ${t.note}` },
          })),
          ...VERDICTS.map((v) => ({
            '@type': 'Question',
            name: `判定「${v.label}」はどういう意味ですか？`,
            acceptedAnswer: { '@type': 'Answer', text: v.meaning },
          })),
        ],
      },
    ],
  });

  return (
    <div className="container section prose-page">
      <Breadcrumbs items={[{ name: '用語集', path: '/glossary' }]} />

      <header className="page-hero">
        <div className="page-hero-eyebrow">GLOSSARY</div>
        <h1>用語集</h1>
        <p>
          このサイトに出てくる言葉の意味と、その数字を読むときに気をつけることをまとめています。
        </p>
      </header>

      <div className="prose">
        <h2>指標と用語</h2>
        <dl className="prose-dl glossary-dl">
          {TERMS.map((t) => (
            <div key={t.term} id={encodeURIComponent(t.term)}>
              <dt>{t.term}</dt>
              <dd>
                <p>{t.body}</p>
                {t.note && <p className="glossary-note">{t.note}</p>}
                {t.link && <p><Link to={t.link.to}>{t.link.label}</Link></p>}
              </dd>
            </div>
          ))}
        </dl>

        <h2>判定ラベル</h2>
        <p>
          テーマ詳細ページの一番上に出る「総合判定」です。
          スコアと勢い、観測できた情報源の組み合わせから機械的に決まります。
        </p>
        <dl className="prose-dl">
          {VERDICTS.map((v) => (
            <div key={v.label}>
              <dt>{v.label}</dt>
              <dd>{v.meaning}</dd>
            </div>
          ))}
        </dl>

        <h2>スコアの配点</h2>
        <p className="prose-formula">{SCORE_FORMULA.expression}</p>
        <table className="prose-table">
          <thead><tr><th>要素</th><th>配点</th><th>内容</th></tr></thead>
          <tbody>
            {SCORE_FORMULA.terms.map((t) => (
              <tr key={t.key}>
                <td><strong>{t.key}</strong></td>
                <td>{t.weight}</td>
                <td>{t.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>関連ページ</h2>
        <ul>
          <li><Link to="/methodology">計算方法</Link> — 式の詳細と手法の限界</li>
          <li><Link to="/sources">情報源</Link> — 7 か所それぞれで何が見えるか</li>
          <li><Link to="/guide">このサイトの読み方</Link> — 実際のテーマで手順を追う</li>
        </ul>
      </div>
    </div>
  );
}
