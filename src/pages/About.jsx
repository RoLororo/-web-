// ============================================================================
// About — このサイトは何で、誰が作っていて、何ができないのか
//
// 検索から来た人と、広告審査の担当者が最初に確認するページ。
// 「できること」だけを並べると実態と食い違うので、**できないことも同じ重さで
// 書く**。誇張した紹介はここでは書かない。
// ============================================================================

import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { useSeo, breadcrumbJsonLd } from '../utils/useSeo.js';
import { getDemands } from '../services/demandService.js';
import { SITE_NAME, SITE_URL, OPERATOR, OPERATOR_BIO, LAUNCH_DATE, SOURCES } from '../config/site.js';

export default function About() {
  const themeCount = getDemands().length;

  useSeo({
    title: `${SITE_NAME} について — 何を観測し、何を観測していないか`,
    description:
      'Demand Atlas は Wikipedia・Qiita・arXiv・App Store・GitHub・国立国会図書館・ニュースの公開データを毎日集め、需要の動きをスコアにして並べるサイトです。運営者・仕組み・限界を説明します。',
    path: '/about',
    jsonLd: [
      breadcrumbJsonLd([{ name: 'このサイトについて', path: '/about' }]),
      {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: `${SITE_NAME} について`,
        url: `${SITE_URL}/about`,
        inLanguage: 'ja',
        publisher: { '@type': 'Person', name: OPERATOR },
      },
    ],
  });

  return (
    <div className="container section prose-page">
      <Breadcrumbs items={[{ name: 'このサイトについて', path: '/about' }]} />

      <header className="page-hero">
        <div className="page-hero-eyebrow">ABOUT</div>
        <h1>このサイトについて</h1>
        <p>
          何を観測していて、何は観測していないのか。判断の材料として使ってもらうために、
          仕組みと限界の両方をここに書いています。
        </p>
      </header>

      <div className="prose">
        <h2>Demand Atlas とは</h2>
        <p>
          「いま世の中で何が求められているのか」は、たいてい感覚で語られます。
          肌感覚は大事ですが、それが自分の周囲だけで起きていることなのか、
          もっと広い範囲で起きていることなのかは、感覚だけでは区別できません。
        </p>
        <p>
          Demand Atlas は、誰でも見られる公開データを毎日決まった手順で集め、
          テーマごとに<strong>需要スコア</strong>という数字にして並べるサイトです。
          現在 {themeCount} 件のテーマを追跡しています。
          スコアの計算式は固定で、日によって変わりません。
          そして<strong>その数字の根拠になった実際の記事や論文まで辿れる</strong>ようにしています。
        </p>

        <h2>できること</h2>
        <ul>
          <li>テーマごとの需要スコアと、その内訳（4 要素の内訳）を見る</li>
          <li>スコアの根拠になったニュース記事・論文・技術記事を実際に開く</li>
          <li>「拡大局面」「研究先行」などの判定と、その理由を読む</li>
          <li>テーマ同士を並べて比べる</li>
          <li>観測データから機械的に導いた事業アイデアを一覧で見る</li>
          <li>日ごとの推移を追う</li>
        </ul>

        <h2>できないこと（重要）</h2>
        <ul>
          <li>
            <strong>未来を予測しません。</strong>
            このサイトが出すのは「すでに起きたことの観測結果」です。
            スコアが高いテーマが今後も伸びる保証はありません。
          </li>
          <li>
            <strong>AI が分析しているわけではありません。</strong>
            スコアも判定も、あらかじめ決めたルールで計算しています。
            大規模言語モデルによる生成は使っていません。
          </li>
          <li>
            <strong>網羅していません。</strong>
            観測しているのは 7 つの情報源だけで、しかも日本語圏に偏っています。
            ここに出ていないから需要がない、とは言えません。
          </li>
          <li>
            <strong>履歴がまだ短いです。</strong>
            日次の記録を貯め始めたばかりなので、長期のトレンドは判断できません。
          </li>
          <li>
            <strong>投資判断・経営判断の助言ではありません。</strong>
            利用は自己責任でお願いします（<Link to="/terms">利用規約</Link>）。
          </li>
        </ul>

        <h2>どこからデータを取っているか</h2>
        <p>
          すべて公開されている API と RSS のみを使っています。
          スクレイピングはしていません。各サービスの利用条件に従って取得しています。
        </p>
        <table className="prose-table">
          <thead>
            <tr><th>情報源</th><th>そこから分かること</th></tr>
          </thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td>{s.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          なぜこの 7 つなのか、スコアをどう計算しているかは
          <Link to="/methodology">計算方法のページ</Link>に詳しく書いています。
        </p>

        <h2>更新のタイミング</h2>
        <p>
          毎日 1 回、日本時間の午前 6 時ごろに自動で実行されます。
          手作業での更新はしていません。取得に失敗した情報源があった場合は、
          その情報源を除いて計算し、詳細ページに「観測の確かさ」として反映されます。
        </p>

        <h2>運営者</h2>
        <p>
          <strong>{OPERATOR}</strong>／{OPERATOR_BIO}
        </p>
        <p>
          {LAUNCH_DATE} から公開しています。企画・設計・実装・運用をひとりで行っています。
          法人ではなく、個人が個人の責任で運営しているサイトです。
        </p>
        <p>
          このサイトは、自分が「次に何を作るか」を決めるときに、
          感覚ではなく観測できるもので判断したいと思って作り始めました。
          同じことを考えている人に使ってもらえたら嬉しいです。
        </p>

        <h2>間違いを見つけたら</h2>
        <p>
          データの取り違え、明らかにおかしいスコア、リンク切れなどを見つけた場合は
          <Link to="/contact">お問い合わせ</Link>から教えてください。
          指摘は歓迎します。仕組み上、機械的に集めている以上、取りこぼしや誤りは起こります。
        </p>

        <h2>関連ページ</h2>
        <ul>
          <li><Link to="/methodology">計算方法と用語</Link> — スコアの出し方、判定ラベルの意味</li>
          <li><Link to="/privacy">プライバシーポリシー</Link> — 何を保存し、何を保存していないか</li>
          <li><Link to="/terms">利用規約</Link></li>
          <li><Link to="/contact">お問い合わせ</Link></li>
        </ul>
      </div>
    </div>
  );
}
