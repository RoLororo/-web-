// ============================================================================
// Methodology — スコアの計算方法と、用語の意味
//
// このサイトで一番独自性のあるコンテンツ。数字の出どころを全部書く。
// 数式・重みは src/config/site.js の SCORE_FORMULA を唯一の出典にして、
// 実装と説明が食い違う状態を作らない。
// ============================================================================

import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { useSeo, breadcrumbJsonLd } from '../utils/useSeo.js';
import { SITE_NAME, SITE_URL, SCORE_FORMULA, VERDICTS, SOURCES } from '../config/site.js';

export default function Methodology() {
  useSeo({
    title: `需要スコアの計算方法と用語 — ${SITE_NAME}`,
    description:
      '需要スコアは「ニュースの量 40 ＋ 直近の伸び 30 ＋ 話題の広がり 20 ＋ 情報の新しさ 10」で計算しています。7 つの情報源、判定ラベルの意味、この方法の限界までを説明します。',
    path: '/methodology',
    jsonLd: [
      breadcrumbJsonLd([{ name: '計算方法と用語', path: '/methodology' }]),
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: VERDICTS.map((v) => ({
          '@type': 'Question',
          name: `判定「${v.label}」はどういう意味ですか？`,
          acceptedAnswer: { '@type': 'Answer', text: v.meaning },
        })),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: '需要スコアの計算方法',
        url: `${SITE_URL}/methodology`,
        inLanguage: 'ja',
      },
    ],
  });

  return (
    <div className="container section prose-page">
      <Breadcrumbs items={[{ name: '計算方法と用語', path: '/methodology' }]} />

      <header className="page-hero">
        <div className="page-hero-eyebrow">METHODOLOGY</div>
        <h1>計算方法と用語</h1>
        <p>
          サイトに出ている数字が、どこから来て、どう計算されたものなのか。
          納得できないまま数字を使うのは危ないので、全部書いておきます。
        </p>
      </header>

      <div className="prose">
        <h2>需要スコアの計算式</h2>
        <p>
          需要スコアは 0〜100 の数字です。次の 4 つを足し合わせて出しています。
          <strong>この式は固定で、日によって変わりません。</strong>
        </p>
        <p className="prose-formula">{SCORE_FORMULA.expression}</p>
        <table className="prose-table">
          <thead>
            <tr><th>要素</th><th>配点</th><th>何を見ているか</th></tr>
          </thead>
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
        <p>
          各要素は 0〜1 に正規化してから重みを掛けます。
          たとえばニュースの量が満点なら 40 点、半分なら 20 点です。
          テーマの詳細ページを開くと、そのテーマの内訳が実際の数字で表示されます。
        </p>

        <h2>なぜこの 7 つの情報源なのか</h2>
        <p>
          需要は 1 か所だけを見ても分かりません。
          「知りたい人」「作っている人」「研究している人」「売っている人」「報道」は
          それぞれ別の動き方をするので、なるべく性質の違う場所を選んでいます。
        </p>
        <table className="prose-table">
          <thead>
            <tr><th>情報源</th><th>誰の動きが見えるか</th></tr>
          </thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.name}>
                <td>
                  {s.url
                    ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
                    : s.name}
                </td>
                <td>{s.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          すべて公開 API と RSS を使っています。スクレイピングは行っていません。
          有料 API も使っていないため、取得できる範囲には制限があります。
        </p>

        <h2>判定ラベルの意味</h2>
        <p>
          スコアだけだと「高いけど何なのか」が分かりません。
          スコアと勢い、そして観測できた情報源の組み合わせから、次のいずれかを機械的に決めています。
        </p>
        <dl className="prose-dl">
          {VERDICTS.map((v) => (
            <div key={v.label}>
              <dt>{v.label}</dt>
              <dd>{v.meaning}</dd>
            </div>
          ))}
        </dl>

        <h2>「観測の確かさ」とは</h2>
        <p>
          スコアが高くても、その根拠が 1 つの情報源しかない場合があります。
          そういうテーマを高スコアのまま出すと誤解を招くので、
          <strong>データがどれだけ揃っているかを別の数字として表示しています。</strong>
        </p>
        <ul>
          <li>7 つのうち何か所で実際に観測できたか</li>
          <li>実際に取れた件数はいくつか</li>
          <li>情報源どうしで動きが食い違っていないか</li>
        </ul>
        <p>
          この数字が低いテーマには「観測不足」の判定が付きます。
          スコアの数字よりも、こちらを先に見てください。
        </p>

        <h2>AI は使っていません</h2>
        <p>
          スコア、判定、事業アイデアを含め、サイトに出ている文章と数字は
          <strong>あらかじめ決めたルールによる計算結果</strong>です。
          大規模言語モデルによる生成は使っていません。
          そのため表現は硬く、同じ言い回しが繰り返されますが、
          代わりに<strong>同じ入力からは必ず同じ出力が出ます</strong>し、
          存在しない事実が混ざることもありません。
        </p>

        <h2>この方法の限界</h2>
        <ul>
          <li>
            <strong>日本語圏に偏っています。</strong>
            Wikipedia は日本語版、ニュースは国内 4 媒体、App Store は日本ストアです。
            海外で先に起きている動きは拾えません。
          </li>
          <li>
            <strong>テーマは事前に登録したものだけです。</strong>
            現在追跡しているテーマ以外は、どれだけ話題でもスコアが付きません。
          </li>
          <li>
            <strong>ニュースの重み付けをしていません。</strong>
            大手の報道も小さな記事も 1 件として数えます。
          </li>
          <li>
            <strong>報道量と需要は同じではありません。</strong>
            事故や障害のように「悪いことが起きたから報道が増えた」場合もスコアは上がります。
            判定と根拠記事をセットで見てください。
          </li>
          <li>
            <strong>履歴が短いです。</strong>
            日次記録を貯め始めたばかりなので、季節変動や長期トレンドは判断できません。
          </li>
        </ul>

        <h2>データの更新</h2>
        <p>
          毎日 1 回、日本時間の午前 6 時ごろに自動実行されます。
          取得に失敗した情報源はその日の計算から除外され、
          「観測の確かさ」に反映されます。失敗を隠して埋めることはしません。
        </p>

        <h2>関連ページ</h2>
        <ul>
          <li><Link to="/about">このサイトについて</Link></li>
          <li><Link to="/whats-new">情報源と追加履歴</Link></li>
          <li><Link to="/rankings">需要ランキング</Link> — 実際のスコアを見る</li>
        </ul>
      </div>
    </div>
  );
}
