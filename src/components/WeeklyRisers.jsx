// ============================================================================
// WeeklyRisers
// Home 用: 「過去 N 日で需要スコアが最も伸びたテーマ」ランキング。
// demand._scoreHistory（generate-insights が焼き込んだ実スコア履歴）だけを使う
// ので追加 fetch は不要。単日変化 (±1〜5) より多日窓 (exam +34 等) の方が
// 差が大きく、「今週なにが伸びているか」を毎日更新で見せる発見・回遊モジュール。
// ============================================================================

import { Link } from 'react-router-dom';
import Sparkline from './Sparkline.jsx';
import { SITE_URL, SITE_NAME } from '../config/site.js';
import { trackEvent } from '../services/visitorService.js';
import { availableDates } from '../services/dailyService.js';

const MIN_DAYS = 3;
const TOP_N = 5;

export default function WeeklyRisers({ allDemands = [] }) {
  const risers = allDemands
    .map((d) => {
      const sc = d._scoreHistory?.scores || [];
      if (sc.length < MIN_DAYS) return null;
      const first = sc[0];
      const last = sc[sc.length - 1];
      return { d, sc, first, last, delta: last - first, days: sc.length };
    })
    .filter((x) => x && x.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, TOP_N);

  // 蓄積が浅い初期などは無理に見せない
  if (risers.length === 0) return null;
  const windowDays = Math.max(...risers.map((r) => r.days));

  // 日次レポートへの入口。最新の観測日だけを出す（ページが実在する日に限る）
  const latestDate = availableDates(allDemands)[0] || null;

  // 共有ループの起点: この急上昇ランキングを 1 タップで SNS に出す。
  // 共有先はトップ URL（OG が「今週の急上昇ランキング」カードで表示される）。
  const homeUrl = SITE_URL + '/';
  const shareText = [
    '今週いちばん需要が伸びたテーマ📈',
    ...risers.slice(0, 3).map((r, i) => `${i + 1}. ${r.d.title} +${r.delta}`),
    '7つの公開データから毎日更新👇',
  ].join('\n');
  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(homeUrl)}`;

  async function handleShare() {
    trackEvent('share_home');
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `${SITE_NAME} — 今週の急上昇需要`, text: shareText, url: homeUrl });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    if (typeof window !== 'undefined') window.open(xUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="section container">
      <div className="section-head">
        <div>
          <h2 className="section-title">📈 今週、需要が伸びているテーマ</h2>
          <p className="section-sub">
            過去 {windowDays} 日で需要スコアが上がった順。7 情報源を合成したスコアの実測推移で、毎日更新されます。
          </p>
        </div>
      </div>

      <ol className="risers-list">
        {risers.map((r, i) => (
          <li key={r.d.id} className="riser-row">
            <Link to={`/demand/${r.d.id}`} className="riser-link">
              <span className="riser-rank">{i + 1}</span>
              <span className="riser-body">
                <span className="riser-title">{r.d.title}</span>
                <span className="riser-cat">{r.d.category}</span>
              </span>
              <span className="riser-spark" aria-hidden="true">
                <Sparkline data={r.sc} color="var(--green-bright)" />
              </span>
              <span className="riser-flow">
                {r.first}<span className="riser-arrow">→</span><strong>{r.last}</strong>
              </span>
              <span className="riser-delta up">+{r.delta}</span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="risers-actions">
        <button type="button" className="btn primary risers-share-btn" onClick={handleShare}>
          この急上昇ランキングをシェア
        </button>
        <Link to="/explore?sort=scorerise" className="risers-all-link" onClick={() => trackEvent('explore_ranking')}>
          すべての需要を上昇順で見る →
        </Link>
        {latestDate && (
          <Link to={`/daily/${latestDate}`} className="risers-all-link" onClick={() => trackEvent('open_daily')}>
            {latestDate} の日次レポート →
          </Link>
        )}
      </div>
    </section>
  );
}
