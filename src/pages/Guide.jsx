// ============================================================================
// Guide — このサイトの読み方
//
// 使い方の説明を抽象的に書いても伝わらないので、**実際に今出ているテーマ**を
// 例にして手順を追う。例に使う数字は demands.json から取るので、
// データが更新されれば説明も一緒に更新される（古い数字が残らない）。
// ============================================================================

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { useSeo, breadcrumbJsonLd } from '../utils/useSeo.js';
import { getDemands } from '../services/demandService.js';
import { SITE_NAME } from '../config/site.js';

export default function Guide() {
  const demands = useMemo(() => getDemands(), []);

  // 例に使うテーマ。スコア最上位ではなく「観測の確かさが最も高いもの」を選ぶ。
  // 説明の例が観測不足のテーマだと、書いてある手順を自分で否定することになる。
  const example = useMemo(() => {
    const scored = demands
      .filter((d) => d._insights?.verdict && d._scoreBreakdown)
      .sort((a, b) => (b._insights?.dataQuality?.score || 0) - (a._insights?.dataQuality?.score || 0));
    return scored[0] || demands[0] || null;
  }, [demands]);

  // 対比に使う「観測の確かさが低いテーマ」
  const weak = useMemo(() => {
    const scored = demands
      .filter((d) => d._insights?.dataQuality)
      .sort((a, b) => (a._insights.dataQuality.score || 0) - (b._insights.dataQuality.score || 0));
    return scored[0] && scored[0].id !== example?.id ? scored[0] : null;
  }, [demands, example]);

  useSeo({
    title: `このサイトの読み方 — 需要スコアから判断までの手順 | ${SITE_NAME}`,
    description:
      '需要スコアを見て、根拠を確かめ、他のテーマと比べて判断するまでの手順を、実際に観測中のテーマを例に説明します。数字を鵜呑みにしないための確認点も載せています。',
    path: '/guide',
    jsonLd: [
      breadcrumbJsonLd([{ name: 'このサイトの読み方', path: '/guide' }]),
      {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: 'Demand Atlas の読み方',
        description: '需要スコアから判断にたどり着くまでの 5 つの手順。',
        step: [
          { '@type': 'HowToStep', name: '観測の確かさを先に見る', text: 'スコアより先に、そのスコアがどれだけ揃った材料から出たかを確認します。' },
          { '@type': 'HowToStep', name: '判定を読む', text: '拡大局面・研究先行など、いまどの段階にあるかを確認します。' },
          { '@type': 'HowToStep', name: 'スコアの内訳を開く', text: '4 要素のどれで点を稼いでいるかを見ます。' },
          { '@type': 'HowToStep', name: '根拠の記事を実際に開く', text: '数字の裏にある出来事を確認します。' },
          { '@type': 'HowToStep', name: '他のテーマと比べる', text: '単独の数字ではなく、相対的な位置で判断します。' },
        ],
      },
    ],
  });

  const q = example?._insights?.dataQuality;
  const v = example?._insights?.verdict;
  const bd = example?._scoreBreakdown;

  return (
    <div className="container section prose-page">
      <Breadcrumbs items={[{ name: 'このサイトの読み方', path: '/guide' }]} />

      <header className="page-hero">
        <div className="page-hero-eyebrow">GUIDE</div>
        <h1>このサイトの読み方</h1>
        <p>
          スコアの数字だけを見ても判断はできません。
          実際に観測中のテーマを例に、どの順番で何を見るかを説明します。
        </p>
      </header>

      <div className="prose">
        <h2>結論から言うと</h2>
        <p>
          <strong>スコアは最後に見てください。</strong>
          先に見るべきなのは「その数字がどれだけ確かか」と「いまどの段階にあるか」です。
          スコアが高いテーマが良いテーマとは限りませんし、
          スコアが低いテーマが駄目とも限りません。
        </p>

        {example ? (
          <>
            <h2>手順 1 — 観測の確かさを先に見る</h2>
            <p>
              例として<Link to={`/demand/${example.id}`}>「{example.title}」</Link>を開いてみます。
              このテーマの需要スコアは <strong>{example.score}</strong> ですが、
              まず見るのは観測の確かさです。
            </p>
            {q && (
              <p className="prose-formula">
                観測の確かさ：{q.score}/100（{q.label}）
                {q.signals?.length > 0 && <><br />根拠：{q.signals.join(' / ')}</>}
              </p>
            )}
            <p>
              この数字は「7 つの情報源のうち何か所で実際に観測できたか」
              「実際に取れた件数はいくつか」から決まります。
              ここが低ければ、スコアの数字そのものを額面どおりに受け取らないでください。
            </p>
            {weak && weak._insights?.dataQuality && (
              <p>
                対照的に、<Link to={`/demand/${weak.id}`}>「{weak.title}」</Link>の観測の確かさは
                <strong> {weak._insights.dataQuality.score}/100</strong> です。
                同じサイトに並んでいても、後ろにある材料の量はこれだけ違います。
              </p>
            )}

            <h2>手順 2 — 判定を読む</h2>
            {v && (
              <>
                <p>
                  ページ上部に「総合判定」が出ます。「{example.title}」は
                  <strong>「{v.label}」</strong>です。
                </p>
                <p className="prose-formula">{v.rationale}</p>
              </>
            )}
            <p>
              判定は 7 種類あり、それぞれ意味が違います。
              「研究先行」なら論文は多いが製品はまだ、「認知拡大中」なら報道が先行している、という具合です。
              意味は<Link to="/glossary">用語集</Link>にまとめています。
            </p>

            <h2>手順 3 — スコアの内訳を開く</h2>
            <p>
              需要スコアは 4 つの足し算です。<strong>どこで点を取っているかで意味が変わります。</strong>
            </p>
            {bd && (
              <table className="prose-table">
                <thead><tr><th>要素</th><th>満点</th><th>このテーマ</th></tr></thead>
                <tbody>
                  <tr><td>ニュースの量</td><td>40</td><td>{Math.round((bd.newsVolume ?? 0) * 40)}</td></tr>
                  <tr><td>直近の伸び</td><td>30</td><td>{Math.round((bd.growth ?? 0) * 30)}</td></tr>
                  <tr><td>話題の広がり</td><td>20</td><td>{Math.round((bd.sourceDiversity ?? 0) * 20)}</td></tr>
                  <tr><td>情報の新しさ</td><td>10</td><td>{Math.round((bd.freshness ?? 0) * 10)}</td></tr>
                </tbody>
              </table>
            )}
            <p>
              ニュースの量だけが高いテーマは、報道は多いが作り手がまだ動いていない状態です。
              逆に話題の広がりが高ければ、複数の場所で同時に動いていることになります。
              <strong>同じ 80 点でも、中身が違えば取るべき行動は変わります。</strong>
            </p>

            <h2>手順 4 — 根拠の記事を実際に開く</h2>
            <p>
              テーマ詳細ページの下部に、スコアの計算に使われた実際のニュース記事が並んでいます。
              {example._matchingArticleCount != null && (
                <>「{example.title}」では <strong>{example._matchingArticleCount} 件</strong>です。</>
              )}
              <strong>ここは必ず開いてください。</strong>
            </p>
            <p>
              報道が増える理由は、良いことばかりではありません。
              事故・障害・不祥事でも記事数は増え、スコアは上がります。
              見出しを 3 本も読めば、その数字が何を意味しているかはすぐ分かります。
            </p>

            <h2>手順 5 — 他のテーマと比べる</h2>
            <p>
              単独の数字には意味がありません。
              <Link to="/compare">比較ページ</Link>で 2 つ並べると、
              スコア・勢い・参入しやすさ・競争・情報源の内訳が同時に見えます。
              <Link to="/rankings">ランキング</Link>では並べ替えの軸を変えられます。
            </p>
          </>
        ) : (
          <p className="loading-hint">データを読み込めませんでした。時間をおいてお試しください。</p>
        )}

        <h2>やってはいけない読み方</h2>
        <ul>
          <li>
            <strong>スコアだけを見て順位を信じる。</strong>
            観測の確かさが低いテーマは、少ない材料で出た数字です。
          </li>
          <li>
            <strong>「スコアが上がった＝良いことが起きた」と読む。</strong>
            事故や障害でも上がります。
          </li>
          <li>
            <strong>ここに無いものを「需要がない」と判断する。</strong>
            追跡しているテーマは限られており、日本語圏に偏っています。
          </li>
          <li>
            <strong>将来の予測として使う。</strong>
            このサイトが出すのは、すでに起きたことの集計だけです。
          </li>
          <li>
            <strong>情報源をまたいで絶対量を比べる。</strong>
            観測している期間も単位も違います（
            <Link to="/sources">情報源のページ</Link>に一覧があります）。
          </li>
        </ul>

        <h2>どこから始めるか</h2>
        <ul>
          <li><Link to="/rankings">需要ランキング</Link> — まず全体を眺める</li>
          <li><Link to="/changes">変化</Link> — 昨日から動いたものだけを見る</li>
          <li><Link to="/categories">分野から探す</Link> — 興味のある領域から入る</li>
          <li><Link to="/ideas">アイデア一覧</Link> — 具体的な打ち手から逆に入る</li>
        </ul>

        <h2>関連ページ</h2>
        <ul>
          <li><Link to="/glossary">用語集</Link> — 出てくる言葉の定義</li>
          <li><Link to="/sources">情報源</Link> — 7 か所で何が見えて何が見えないか</li>
          <li><Link to="/methodology">計算方法</Link> — 式と手法の限界</li>
        </ul>
      </div>
    </div>
  );
}
