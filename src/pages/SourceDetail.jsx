// ============================================================================
// SourceDetail — 情報源 1 つの詳しい説明
//
// 「見えるもの」と同じ重さで「見えないもの」を出す。
// 実行結果（成功数・スキップ理由・失敗の種類）は毎日の生成物から。
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import FoxMark from '../components/FoxMark.jsx';
import { useSeo, breadcrumbJsonLd } from '../utils/useSeo.js';
import { loadSourceReport, coverageOf } from '../services/sourceReportService.js';
import { guideOf } from '../data/sourceGuide.js';
import { getDemands } from '../services/demandService.js';
import { SITE_NAME } from '../config/site.js';

/** テーマ id → 表示名。無ければ id をそのまま返す */
function useThemeTitles() {
  const [map] = useState(() => {
    const m = {};
    for (const d of getDemands()) m[d.id] = d.title;
    return m;
  });
  return map;
}

const SKIP_REASON_JA = {
  'apps-exist-but-not-charting': '該当するアプリは存在するが、総合ランキング 100 位以内に入っていない',
  'no-mapping': 'このテーマ用の検索条件を設定していない',
  'not-applicable': 'この情報源では扱われない種類の話題',
};

const ERROR_TYPE_JA = {
  timeout: '応答が返ってこなかった（タイムアウト）',
  'rate-limit-429': '短時間に送りすぎて断られた（429）',
  'http-error': 'エラー応答が返ってきた',
  unknown: '分類できない失敗',
};

export default function SourceDetail() {
  const { id } = useParams();
  const guide = guideOf(id);
  const [report, setReport] = useState(undefined);
  const titles = useThemeTitles();

  useEffect(() => {
    let cancelled = false;
    loadSourceReport().then((r) => { if (!cancelled) setReport(r); });
    return () => { cancelled = true; };
  }, []);

  useSeo({
    title: guide
      ? `${guide.label}から何が分かるか — ${SITE_NAME}`
      : `情報源が見つかりません — ${SITE_NAME}`,
    description: guide
      ? `${guide.oneLine} Demand Atlas が ${guide.label} をどう使っているか、この情報源から見えるもの・見えないもの、実際の取得状況を公開しています。`
      : 'お探しの情報源は見つかりませんでした。',
    noindex: !guide,
    jsonLd: guide
      ? breadcrumbJsonLd([
          { name: '情報源', path: '/sources' },
          { name: guide.label, path: `/sources/${guide.slug}` },
        ])
      : null,
  });

  if (!guide) {
    return (
      <div className="container section">
        <div className="empty">
          <div className="empty-icon"><FoxMark size={36} /></div>
          <h1>この情報源は見つかりませんでした</h1>
          <p>URL をご確認ください。</p>
          <Link to="/sources" className="btn primary">情報源の一覧へ</Link>
        </div>
      </div>
    );
  }

  const stat = report
    ? (report.sources.find((s) => s.id === id) || (report.news?.id === id ? report.news : null))
    : null;
  const cov = coverageOf(stat);

  return (
    <div className="container section prose-page">
      <Breadcrumbs
        items={[
          { name: '情報源', path: '/sources' },
          { name: guide.label, path: `/sources/${guide.slug}` },
        ]}
      />

      <header className="page-hero">
        <div className="page-hero-eyebrow">{guide.role}</div>
        <h1>{guide.label}</h1>
        <p>{guide.oneLine}</p>
      </header>

      <div className="prose">
        <h2>この情報源から見えるもの</h2>
        <ul>{guide.sees.map((s) => <li key={s}>{s}</li>)}</ul>

        <h2>見えないもの</h2>
        <ul>{guide.blind.map((s) => <li key={s}>{s}</li>)}</ul>

        <h2>読むときの注意</h2>
        <p>{guide.caution}</p>

        <h2>なぜこの情報源を選んだのか</h2>
        <p>{guide.whyChosen}</p>

        {/* 情報源ごとの追加解説。持っているものだけ出す */}
        {guide.extra?.map((sec) => (
          <div key={sec.heading}>
            <h2>{sec.heading}</h2>
            <p>{sec.body}</p>
          </div>
        ))}

        <h2>直近の取得状況</h2>
        {report === undefined && <p className="loading-hint">読み込み中です…</p>}
        {report === null && (
          <div className="notice notice-warn" role="status">
            <strong>取得状況を読み込めませんでした。</strong>
            <span>時間をおいて再度お試しください。</span>
          </div>
        )}
        {stat && (
          <>
            <table className="prose-table">
              <tbody>
                {stat.mappedThemeCount != null && (
                  <tr>
                    <th>取得できたテーマ</th>
                    <td>
                      {stat.successCount} / {stat.mappedThemeCount} 件
                      {cov != null && `（${cov}%）`}
                    </td>
                  </tr>
                )}
                {stat.articleCount != null && (
                  <tr><th>取得した記事</th><td>{stat.articleCount.toLocaleString()} 件</td></tr>
                )}
                {Array.isArray(stat.feeds) && stat.feeds.length > 0 && (
                  <tr><th>購読している媒体</th><td>{stat.feeds.join(' / ')}</td></tr>
                )}
                {stat.windowDays != null && (
                  <tr><th>観測している期間</th><td>直近 {stat.windowDays} 日</td></tr>
                )}
                {guide.isStock && (
                  <tr><th>数字の種類</th><td>累積（これまでの総数。増加率の計算には使いません）</td></tr>
                )}
                {guide.isSnapshot && (
                  <tr><th>数字の種類</th><td>その日の断面（期間の合計ではありません）</td></tr>
                )}
                {stat.totalVolume != null && (
                  <tr><th>観測できた合計</th><td>{stat.totalVolume.toLocaleString()}</td></tr>
                )}
                {stat.requestCount != null && (
                  <tr><th>送ったリクエスト</th><td>{stat.requestCount} 回</td></tr>
                )}
                {stat.generatedAt && (
                  <tr><th>最終取得</th><td>{new Date(stat.generatedAt).toLocaleString('ja-JP')}</td></tr>
                )}
              </tbody>
            </table>

            {stat.skipped?.length > 0 && (
              <>
                <h2>この情報源で見ていないテーマ</h2>
                <p>
                  最初から対象外にしているものです。
                  該当する話題が無いか、この情報源の仕組み上とれないかのどちらかです。
                </p>
                <dl className="prose-dl">
                  {stat.skipped.map((s) => (
                    <div key={s.theme}>
                      <dt>{titles[s.theme] || s.theme}</dt>
                      <dd>
                        {SKIP_REASON_JA[s.reason] || s.reason || '対象外に設定しています'}
                        {s.note && <><br />{s.note}</>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}

            {stat.errors?.length > 0 && (
              <>
                <h2>直近の実行で失敗したもの</h2>
                <p>
                  取得しようとしたが取れなかったものです。
                  <strong>失敗した分は、その日の計算から外れます。</strong>
                  前日の値で埋めることはしていません。
                </p>
                <table className="prose-table">
                  <thead><tr><th>テーマ</th><th>失敗の種類</th><th>再試行</th></tr></thead>
                  <tbody>
                    {stat.errors.map((e, i) => (
                      <tr key={i}>
                        <td>{titles[e.theme] || e.theme || '—'}</td>
                        <td>{ERROR_TYPE_JA[e.type] || e.type}</td>
                        <td>{e.retryable ? '翌日に再取得' : '設定の見直しが必要'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {stat.observedThemes?.length > 0 && (
              <>
                <h2>この情報源で観測できているテーマ</h2>
                <ul className="src-theme-links">
                  {stat.observedThemes.map((t) => (
                    <li key={t}>
                      {titles[t]
                        ? <Link to={`/demand/${t}`}>{titles[t]}</Link>
                        : <span>{t}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        <h2>取得の方法</h2>
        <p>
          公開されている API または RSS のみを使用しています。スクレイピングは行っていません。
          認証が必要な有料 API も使っていないため、取得できる範囲には制限があります。
        </p>
        {(guide.homepage || guide.apiDocs || stat?.homepage || stat?.apiDocs) && (
          <ul>
            {(stat?.homepage || guide.homepage) && (
              <li>
                <a href={stat?.homepage || guide.homepage} target="_blank" rel="noopener noreferrer">
                  {guide.label} の公式サイト
                </a>
              </li>
            )}
            {(stat?.apiDocs || guide.apiDocs) && (
              <li>
                <a href={stat?.apiDocs || guide.apiDocs} target="_blank" rel="noopener noreferrer">
                  API のドキュメント
                </a>
              </li>
            )}
          </ul>
        )}

        <h2>関連ページ</h2>
        <ul>
          <li><Link to="/sources">情報源の一覧に戻る</Link></li>
          <li><Link to="/methodology">計算方法と用語</Link></li>
          <li><Link to="/glossary">用語集</Link></li>
        </ul>
      </div>
    </div>
  );
}
