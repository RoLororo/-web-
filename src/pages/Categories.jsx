// ============================================================================
// Categories — 分野の一覧
// ============================================================================

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getCategorySummaries } from '../services/demandService.js';
import { useSeo } from '../utils/useSeo.js';

export default function Categories() {
  useSeo({
    title: "分野から需要を探す — Demand Atlas",
    description: "需要テーマを分野ごとに一覧できます。各分野の登録数と平均変化率を見て、興味のある分野から掘り下げてください。",
    path: "/categories",
  });
  const cats = useMemo(() => getCategorySummaries(), []);
  // 観測テーマが 0 件の分野はカードにしない。
  //   実測 (2026-07-30): 9 分野中 6 分野が 0 件で、いずれも「まだ需要が登録され
  //   ていません」だけのページに着地する行き止まりだった。カードから外し、
  //   準備中であることだけを 1 行で示す。
  const active = useMemo(() => cats.filter((c) => c.count > 0), [cats]);
  const upcoming = useMemo(() => cats.filter((c) => c.count === 0), [cats]);

  return (
    <section className="section container">
      <div className="section-head">
        <div>
          <h1 className="section-title">分野から探す</h1>
          <p className="section-sub">
            各分野の需要動向を俯瞰し、興味のあるテーマを掘り下げてください。
          </p>
        </div>
      </div>

      <div className="cat-grid">
        {active.map((c, i) => (
          // button から Link へ（2026-08-01）。分野ページへの内部リンクが
          // 1 本も無く、クローラーは sitemap 経由でしか到達できなかった
          <Link
            key={c.name}
            to={`/categories/${encodeURIComponent(c.name)}`}
            className="cat-card"
            style={{ '--i': i }}
          >
            <div className="cat-card-head">
              <div className="cat-name">{c.name}</div>
              {c.dominantStageMeta && (
                <span
                  className="cat-stage-badge"
                  style={{ borderColor: c.dominantStageMeta.tint, color: c.dominantStageMeta.tint }}
                  title={`この分野で最も多い需要ステージ：${c.dominantStageMeta.label}`}
                >
                  {c.dominantStageMeta.icon} {c.dominantStageMeta.label}
                </span>
              )}
            </div>
            <div className="cat-desc">{c.description}</div>
            {c.topDemand && (
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                注目：<strong style={{ color: 'var(--text)' }}>{c.topDemand.title}</strong>
                <span style={{ color: 'var(--text-3)' }}>（需要 {c.topDemand.score}）</span>
              </div>
            )}
            {c.count > 0 && (
              <div
                className="cat-stage-dist"
                title={`需要ステージ内訳 — 研究先行 ${c.stageDist.emerging} / 並走 ${c.stageDist.parallel} / 世間先行 ${c.stageDist.mainstream}`}
                aria-label={`ステージ内訳 研究先行${c.stageDist.emerging} 並走${c.stageDist.parallel} 世間先行${c.stageDist.mainstream}`}
              >
                {c.stageDist.emerging > 0 && <span style={{ flex: c.stageDist.emerging, background: 'hsl(265 60% 55%)' }} />}
                {c.stageDist.parallel > 0 && <span style={{ flex: c.stageDist.parallel, background: 'hsl(210 15% 50%)' }} />}
                {c.stageDist.mainstream > 0 && <span style={{ flex: c.stageDist.mainstream, background: 'hsl(30 70% 50%)' }} />}
              </div>
            )}
            <div className="cat-meta">
              <span><span className="k">テーマ </span><span className="v">{c.count}</span></span>
              <span><span className="k">平均需要 </span><span className="v">{c.avgScore}</span></span>
              <span>
                <span className="k">平均変化率 </span>
                <span className={`v ${c.avgChange > 0 ? 'up' : c.avgChange < 0 ? 'down' : ''}`}>
                  {c.avgChange > 0 ? `+${c.avgChange}%` : `${c.avgChange}%`}
                </span>
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* 準備中の 6 分野は 1 行のテキストだけで、3 枚しかないグリッドの下に
          ぶら下がって見えていた（2026-07-30 実測: 本文 1 行 20px）。
          押せないことは保ったまま、同じグリッドに枠として並べる。 */}
      {upcoming.length > 0 && (
        <>
          <p className="cat-upcoming">観測準備中の分野（{upcoming.length}）</p>
          <div className="cat-grid cat-grid-upcoming">
            {upcoming.map((c) => (
              <div key={c.name} className="cat-card cat-card-upcoming" aria-disabled="true">
                <div className="cat-name">{c.name}</div>
                <div className="cat-desc">{c.description}</div>
                <div className="cat-meta">
                  <span className="cat-upcoming-tag">観測準備中</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 2026-08-01 実測: このページの本文は 377 字しかなく、
          カードのラベル以外に説明が無かった。分野が何を意味するのか、
          なぜ空の分野があるのかが分からないと、カードを見ても判断できない。 */}
      <div className="prose cat-explainer">
        <h2>分野はどう決めているか</h2>
        <p>
          分野は、テーマを登録するときに手で割り当てています。
          自動分類はしていません。1 テーマが属する分野は 1 つだけです。
        </p>
        <p>
          そのため、複数の分野にまたがるテーマ（たとえば「AI 規制」は技術でも社会でもあります）は、
          どちらか主だと考えた方に入っています。
          分野をまたいで探したいときは<Link to="/explore">検索</Link>や
          <Link to="/rankings">ランキング</Link>を使ってください。
        </p>

        <h2>なぜ空の分野があるのか</h2>
        <p>
          分野の枠は先に用意してありますが、そこに入るテーマをまだ登録していません。
          テーマを増やすには、7 つの情報源それぞれに検索条件を設定する必要があり、
          設定できない情報源が多いテーマは、登録しても観測の確かさが低いままになります。
          <strong>数を増やすより、観測できる状態で登録することを優先しています。</strong>
        </p>
        <p>
          どのテーマをいつ追加したかは<Link to="/whats-new">追加履歴</Link>で確認できます。
          追加してほしい分野やテーマがあれば<Link to="/contact">お問い合わせ</Link>からご提案ください。
        </p>

        <h2>分野ごとの平均変化率について</h2>
        <p>
          カードに出ている平均変化率は、その分野に属するテーマの変化率を単純に平均したものです。
          テーマ数が少ない分野では、1 テーマの動きがそのまま平均になります。
          分野同士を比べるときは、登録数も合わせて見てください。
        </p>
        <p>
          数字の意味は<Link to="/glossary">用語集</Link>に、
          計算方法は<Link to="/methodology">計算方法のページ</Link>にまとめています。
        </p>
      </div>
    </section>
  );
}
