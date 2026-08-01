// ============================================================================
// Sources — 7 つの情報源の一覧と、それぞれの「取れ具合」
//
// 数字は data/source-report.json（毎日生成）から。解釈は src/data/sourceGuide.js。
// 取れなかったテーマとその理由を**そのまま出す**のがこのページの要点で、
// 「7 情報源で観測」という説明が実態より強く見えるのを防ぐ。
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { useSeo, breadcrumbJsonLd } from '../utils/useSeo.js';
import { loadSourceReport, coverageOf } from '../services/sourceReportService.js';
import { SOURCE_GUIDE, SOURCE_ORDER } from '../data/sourceGuide.js';
import { SITE_NAME } from '../config/site.js';

export default function Sources() {
  const [report, setReport] = useState(undefined); // undefined=読込中 / null=失敗

  useEffect(() => {
    let cancelled = false;
    loadSourceReport().then((r) => { if (!cancelled) setReport(r); });
    return () => { cancelled = true; };
  }, []);

  useSeo({
    title: `7 つの情報源とその限界 — ${SITE_NAME}`,
    description:
      'Demand Atlas が需要スコアの計算に使っている 7 つの公開データ（Wikipedia・arXiv・Qiita・GitHub・App Store・ニュース・国立国会図書館）について、何が見えて何が見えないか、実際にどれだけ取得できているかを公開しています。',
    path: '/sources',
    jsonLd: breadcrumbJsonLd([{ name: '情報源', path: '/sources' }]),
  });

  const byId = {};
  if (report) {
    for (const s of report.sources) byId[s.id] = s;
    if (report.news) byId.news = report.news;
  }

  return (
    <div className="container section prose-page">
      <Breadcrumbs items={[{ name: '情報源', path: '/sources' }]} />

      <header className="page-hero">
        <div className="page-hero-eyebrow">SOURCES</div>
        <h1>7 つの情報源と、その限界</h1>
        <p>
          需要スコアは 7 か所の公開データから計算しています。
          それぞれ見えるものが違い、見えないものもあります。
          <strong>実際にどれだけ取得できているか</strong>も、毎日の実行結果をそのまま出しています。
        </p>
      </header>

      <div className="prose">
        <h2>なぜ 7 つも見るのか</h2>
        <p>
          需要は 1 か所を見ても分かりません。
          「調べている人」「研究している人」「作っている人」「売っている人」「報道」は、
          それぞれ違うタイミングで動きます。
          研究が先に動いて、数年後に製品が出て、それから報道される、という順番になることもあれば、
          事故が起きて報道が先に立ち、後から対策が作られることもあります。
        </p>
        <p>
          1 か所だけを見ると、その順番のどこにいるのかが分かりません。
          性質の違う 7 か所を並べているのはそのためです。
        </p>

        <h2>情報源の一覧</h2>
        <p>
          「取得できたテーマ」は直近の実行結果です。
          <strong>数字が欠けている情報源ほど、そのテーマの判断材料が薄い</strong>ことになります。
        </p>

        {report === undefined && <p className="loading-hint">読み込み中です…</p>}
        {report === null && (
          <div className="notice notice-warn" role="status">
            <strong>取得状況を読み込めませんでした。</strong>
            <span>
              各情報源の説明は下に表示されています。取得件数だけが表示できていません。
            </span>
          </div>
        )}

        <div className="src-cards">
          {SOURCE_ORDER.map((slug) => {
            const g = SOURCE_GUIDE[slug];
            const s = byId[slug];
            const cov = s ? coverageOf(s) : null;
            return (
              <Link key={slug} to={`/sources/${slug}`} className="src-card">
                <div className="src-card-head">
                  <span className="src-card-role">{g.role}</span>
                  <span className="src-card-name">{g.label}</span>
                </div>
                <p className="src-card-line">{g.oneLine}</p>
                <div className="src-card-stats">
                  {s && s.mappedThemeCount != null && (
                    <span className={`src-stat ${cov != null && cov < 60 ? 'low' : ''}`}>
                      取得できたテーマ <b>{s.successCount}/{s.mappedThemeCount}</b>
                    </span>
                  )}
                  {s && s.articleCount != null && (
                    <span className="src-stat">記事 <b>{s.articleCount.toLocaleString()}</b> 件</span>
                  )}
                  {g.isStock && <span className="src-stat kind">累積の数字</span>}
                  {g.isSnapshot && <span className="src-stat kind">その日の断面</span>}
                  {s && s.errorCount > 0 && (
                    <span className="src-stat low">直近の失敗 <b>{s.errorCount}</b> 件</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        <h2>取得できない日があります</h2>
        <p>
          相手のサービスが混んでいれば取得は失敗しますし、
          テーマによっては初めから対象外にしているものもあります。
          その場合、その情報源はその日の計算から外れます。
          <strong>失敗を埋めたり、前日の値で代用したりはしていません。</strong>
        </p>
        <p>
          代わりに、テーマ詳細ページの「観測の確かさ」がその分だけ下がります。
          スコアが高くても観測の確かさが低いテーマは、
          少ない材料で出た数字だと考えてください。
          各情報源のページに、直近で何件失敗したかを出しています。
        </p>

        <h2>関連ページ</h2>
        <ul>
          <li><Link to="/methodology">計算方法と用語</Link> — 7 つをどう 1 つのスコアにまとめているか</li>
          <li><Link to="/glossary">用語集</Link> — フロー・ストック・観測の確かさ などの定義</li>
          <li><Link to="/whats-new">追加履歴</Link> — どの情報源をいつ追加したか</li>
        </ul>
      </div>
    </div>
  );
}
