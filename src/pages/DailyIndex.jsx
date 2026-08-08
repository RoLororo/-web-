// ============================================================================
// DailyIndex — /daily 日次レポートの目次
//
// 観測した日を新しい順に並べる。1 日 1 本ずつ増えるので、
// ここが「どれだけ観測を続けているか」を示す唯一の場所になる。
// 各行にその日の上昇テーマを出して、クリックする理由を作る。
// ============================================================================

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getDemands } from '../services/demandService.js';
import { useSeo, breadcrumbJsonLd } from '../utils/useSeo.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { SITE_NAME } from '../config/site.js';
import { availableDates, buildDailyReport, formatDateJa } from '../services/dailyService.js';

export default function DailyIndex() {
  const demands = getDemands();

  const rows = useMemo(() => {
    return availableDates(demands)
      .map((d) => buildDailyReport(demands, d))
      .filter(Boolean);
  }, [demands]);

  useSeo({
    title: `日次レポート — 毎日の需要スコアの記録 | ${SITE_NAME}`,
    description: `Demand Atlas が観測した ${rows.length} 日ぶんの需要スコアの記録です。どの日にどのテーマが伸び、どのテーマが下がったかを日付ごとに残しています。`,
    path: '/daily',
    jsonLd: breadcrumbJsonLd([{ name: '日次レポート', path: '/daily' }]),
  });

  return (
    <div className="section container">
      <Breadcrumbs items={[{ name: '日次レポート', path: '/daily' }]} />

      <h1 className="section-title">日次レポート</h1>
      <p className="section-sub">
        観測した日ごとの需要スコアの記録です。現在 {rows.length} 日ぶん。
        毎日 1 本ずつ増えていきます。
      </p>

      {rows.length === 0 ? (
        <p className="section-sub">まだ記録がありません。</p>
      ) : (
        <ol className="daily-index-list">
          {rows.map((r) => (
            <li key={r.date} className="daily-index-row">
              <Link to={`/daily/${r.date}`} className="daily-index-link">
                <span className="daily-index-date">{formatDateJa(r.date)}</span>
                <span className="daily-index-summary">
                  {r.noPrev === r.themeCount
                    ? `観測を始めた日・${r.themeCount} テーマを記録`
                    : r.risers.length > 0
                      ? `${r.risers[0].title} +${r.risers[0].delta} ほか、${r.risers.length} テーマが上昇`
                      : `${r.themeCount} テーマを観測（上昇なし）`}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
