// ============================================================================
// DailyReport — /daily/:date 「その日 1 日の需要変化」
//
//   ■ なぜ作るか（成長=複利、2026-08-09 実測に基づく）
//     ・sitemap の URL は 46 件で固定。毎日データが増えても検索に載る面が
//       増えないので、観測日数が資産に変わらなかった。
//     ・share_home が 3 件発火している一方、累計訪問は 36 のまま動いていない。
//       共有しても「その日だけの中身」が無いので、貼るものが毎回同じだった。
//     このページは 1 日 1 本ずつ恒久 URL を増やし、同時に owner が毎日貼れる
//     「今日ぶんの投稿文」をその場で渡す。
//
//   ■ 新しいデータは取らない
//     demands.json の _scoreHistory だけで組む（dailyService.js）。
//     pipeline・スコア式・既存 17 テーマには一切触らない。
// ============================================================================

import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDemands } from '../services/demandService.js';
import { useSeo, breadcrumbJsonLd } from '../utils/useSeo.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { SITE_URL, SITE_NAME } from '../config/site.js';
import { trackEvent } from '../services/visitorService.js';
import { toast } from '../utils/toast.js';
import {
  availableDates,
  buildDailyReport,
  dailyPostText,
  dailyDescription,
  formatDateJa,
  isValidDate,
} from '../services/dailyService.js';

function sign(n) { return n > 0 ? `+${n}` : String(n); }

/** 上がった / 下がったテーマの 1 行 */
function MoveRow({ item }) {
  const up = item.delta > 0;
  return (
    <li className="daily-row">
      <Link to={`/demand/${item.id}`} className="daily-row-link">
        <span className="daily-row-body">
          <span className="daily-row-title">{item.title}</span>
          <span className="daily-row-cat">{item.category}</span>
        </span>
        <span className="daily-row-flow">
          {item.prevScore}<span className="daily-row-arrow">→</span><strong>{item.score}</strong>
        </span>
        <span className={`daily-row-delta ${up ? 'up' : 'down'}`}>{sign(item.delta)}</span>
      </Link>
    </li>
  );
}

export default function DailyReport() {
  const { date } = useParams();
  const demands = getDemands();

  const dates = useMemo(() => availableDates(demands), [demands]);
  const report = useMemo(
    () => (isValidDate(date) ? buildDailyReport(demands, date) : null),
    [demands, date],
  );

  // 前後の日へ。日付の連番ではなく「観測がある日」で送る（欠測日に飛ばさない）
  const idx = report ? dates.indexOf(report.date) : -1;
  const newer = idx > 0 ? dates[idx - 1] : null;          // dates は新しい順
  const older = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;

  const description = report ? dailyDescription(report) : '';
  const title = report
    ? `${formatDateJa(report.date)}の需要変化 — ${report.themeCount}テーマのスコア推移 | ${SITE_NAME}`
    : `指定された日付の記録はありません | ${SITE_NAME}`;

  useSeo({
    title,
    description,
    path: `/daily/${date}`,
    // 観測が無い日付は索引に入れない（存在しない日の空ページを量産しないため）
    noindex: !report,
    jsonLd: report
      ? [
          breadcrumbJsonLd([
            { name: '日次レポート', path: '/daily' },
            { name: formatDateJa(report.date), path: `/daily/${report.date}` },
          ]),
          {
            // その日の観測を Dataset として申告する。テーマ詳細と同じ扱い。
            // 日付・観測数・出典を機械可読にしておくと、検索エンジンや
            // データを引用する側が「いつの、何件の観測か」を判断できる。
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: `${formatDateJa(report.date)}の需要観測データ（${report.themeCount} テーマ）`,
            description: dailyDescription(report),
            url: `${SITE_URL}/daily/${report.date}`,
            inLanguage: 'ja',
            license: `${SITE_URL}/terms`,
            isAccessibleForFree: true,
            creator: { '@type': 'Person', name: 'RoLororo' },
            temporalCoverage: report.date,
            dateModified: report.date,
            variableMeasured: [
              { '@type': 'PropertyValue', name: '観測テーマ数', value: report.themeCount },
              { '@type': 'PropertyValue', name: '上昇テーマ数', value: report.risers.length },
              { '@type': 'PropertyValue', name: '下降テーマ数', value: report.fallers.length },
            ],
          },
        ]
      : null,
  });

  if (!report) {
    return (
      <div className="section container">
        <Breadcrumbs items={[{ name: '日次レポート', path: '/daily' }]} />
        <h1 className="section-title">この日の記録はありません</h1>
        <p className="section-sub">
          観測を始めたのは {dates.length ? formatDateJa(dates[dates.length - 1]) : '—'} です。
          記録がある日は <Link to="/daily">日次レポート一覧</Link> から選べます。
        </p>
      </div>
    );
  }

  const pageUrl = `${SITE_URL}/daily/${report.date}`;
  const postText = dailyPostText(report, SITE_URL);
  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(postText.replace(`\n${pageUrl}`, ''))}&url=${encodeURIComponent(pageUrl)}`;

  async function handleCopy() {
    trackEvent('copy_daily_post');
    try {
      await navigator.clipboard.writeText(postText);
      toast('投稿文をコピーしました');
    } catch {
      toast('コピーに失敗しました', 'error');
    }
  }

  async function handleShare() {
    trackEvent('share_daily');
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: postText.split('\n')[0], url: pageUrl });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    if (typeof window !== 'undefined') window.open(xUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="daily-page">
      <div className="section container">
        <Breadcrumbs items={[
          { name: '日次レポート', path: '/daily' },
          { name: formatDateJa(report.date), path: `/daily/${report.date}` },
        ]} />

        <h1 className="section-title">{formatDateJa(report.date)}の需要変化</h1>
        <p className="section-sub">
          7 つの公開データから計算した需要スコアの、この日の実測値です。
          {report.noPrev === report.themeCount
            ? `この日は観測を始めた日で、${report.themeCount} テーマのスコアを記録しています（比較できる前日がないため増減は出せません）。`
            : `観測 ${report.themeCount} テーマのうち ${report.risers.length} テーマが上昇、${report.fallers.length} テーマが下降、${report.unchanged} テーマが横ばいでした。`}
        </p>

        <nav className="daily-nav" aria-label="日付の移動">
          {older ? <Link to={`/daily/${older}`}>← {formatDateJa(older)}</Link> : <span />}
          <Link to="/daily" className="daily-nav-index">日次レポート一覧</Link>
          {newer ? <Link to={`/daily/${newer}`}>{formatDateJa(newer)} →</Link> : <span />}
        </nav>
      </div>

      {report.risers.length > 0 && (
        <section className="section container">
          <h2 className="section-title">▲ この日 伸びたテーマ</h2>
          <ol className="daily-list">
            {report.risers.map((r) => <MoveRow key={r.id} item={r} />)}
          </ol>
        </section>
      )}

      {report.fallers.length > 0 && (
        <section className="section container">
          <h2 className="section-title">▼ この日 下がったテーマ</h2>
          <ol className="daily-list">
            {report.fallers.map((f) => <MoveRow key={f.id} item={f} />)}
          </ol>
        </section>
      )}

      <section className="section container">
        <h2 className="section-title">この日の全 {report.themeCount} テーマ</h2>
        <p className="section-sub">スコアの高い順。数字はこの日時点の需要スコア（100 点満点）です。</p>
        <div className="daily-table-wrap">
          <table className="daily-table">
            <thead>
              <tr><th>テーマ</th><th>分野</th><th>スコア</th><th>前回比</th></tr>
            </thead>
            <tbody>
              {report.all.map((t) => (
                <tr key={t.id}>
                  <td><Link to={`/demand/${t.id}`}>{t.title}</Link></td>
                  <td className="daily-td-cat">{t.category}</td>
                  <td className="daily-td-score">{t.score}</td>
                  <td className={`daily-td-delta ${t.delta > 0 ? 'up' : t.delta < 0 ? 'down' : ''}`}>
                    {typeof t.delta === 'number' ? sign(t.delta) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section container">
        <h2 className="section-title">この日のぶんを共有する</h2>
        <p className="section-sub">
          そのまま貼れる本文です。中身はこの日の実測値だけで、書き足しは要りません。
        </p>
        <pre className="daily-post">{postText}</pre>
        <div className="daily-actions">
          <button type="button" className="btn primary" onClick={handleCopy}>投稿文をコピー</button>
          <button type="button" className="btn" onClick={handleShare}>共有する</button>
        </div>
      </section>
    </div>
  );
}
