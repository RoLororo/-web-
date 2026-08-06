// ============================================================================
// WeeklyRisers
// Home 用: 「過去 N 日で需要スコアが最も伸びたテーマ」ランキング。
// demand._scoreHistory（generate-insights が焼き込んだ実スコア履歴）だけを使う
// ので追加 fetch は不要。単日変化 (±1〜5) より多日窓 (exam +34 等) の方が
// 差が大きく、「今週なにが伸びているか」を毎日更新で見せる発見・回遊モジュール。
// ============================================================================

import { Link } from 'react-router-dom';
import Sparkline from './Sparkline.jsx';

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
    </section>
  );
}
