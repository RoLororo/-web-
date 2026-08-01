// ============================================================================
// DemandCard v3 (compact) — 情報階層を絞り、密度を上げて scan しやすく
//
//   ・行1 タイトル + 順位
//   ・行2 バッジ帯: verdict / 勢い / 参入 / 競争 (統一 chip row)
//   ・行3 summary (1 行 truncate)
//   ・右カラム 実測 day-over-day + score
//
// 意思決定に不要な要素を削減:
//   - StatusBadge (急上昇 etc) を verdict に統合
//   - "N 分前更新" は verdict/score より優先度低 → 削除
//   - meta の dot 区切りは 1 行 chip row に統合
// ============================================================================

import { Link } from 'react-router-dom';
import Sparkline from './Sparkline.jsx';
import AnimatedNumber from './AnimatedNumber.jsx';
import { changeClass, formatChange } from '../utils/format.js';
import { trendSeries, sliceSeries } from '../utils/series.js';
import { sourceDisplay } from '../services/sourceCatalog.js';

function BadgeRow({ verdict, insights }) {
  const items = [];
  if (verdict?.label) {
    items.push({
      kind: 'verdict',
      cls: `card-badge verdict-chip verdict-chip-${verdict.label}`,
      text: verdict.label,
      title: verdict.rationale || '',
    });
  }
  if (insights) {
    const triad = [
      { k: 'momentum',    short: '勢い', obj: insights.momentum,             hue: 145 },
      { k: 'beginner',    short: '参入', obj: insights.beginnerFriendliness, hue: 200 },
      { k: 'competition', short: '競争', obj: insights.competition,          hue: 30 },
    ];
    for (const t of triad) {
      if (!t.obj || typeof t.obj.score !== 'number') continue;
      items.push({
        kind: t.k,
        cls: 'card-badge triad-chip',
        text: <>
          <span className="tc-lbl">{t.short}</span>
          <span className="tc-dot" style={{ background: `hsl(${t.hue} 60% 50%)`, opacity: 0.4 + t.obj.score / 100 * 0.6 }} />
          <span className="tc-val">{t.obj.score}</span>
        </>,
        title: `${t.short}: ${t.obj.label} (${t.obj.score}/100)`,
      });
    }
  }
  if (items.length === 0) return null;
  return (
    <div className="card-badge-row" onClick={(e) => e.stopPropagation()}>
      {items.map((it, i) => (
        <span key={i} className={it.cls} title={it.title}>{it.text}</span>
      ))}
    </div>
  );
}

export default function DemandCard({ demand, rank, index = 0, historyMove = null }) {
  const insights = demand._insights;
  const verdict = insights?.verdict;

  const hasHistoryMove = historyMove && isFinite(historyMove.pctChange);
  const primaryPct = hasHistoryMove ? historyMove.pctChange : demand.change;
  const primaryLabel = hasHistoryMove ? '今日' : '30日';
  const primarySrc = hasHistoryMove ? sourceDisplay(historyMove.source) : 'ニュース';

  const sparkColor =
    primaryPct > 0 ? 'var(--green-bright)' :
    primaryPct < 0 ? 'var(--red)' : 'var(--text-3)';

  const cardSeries = sliceSeries(trendSeries(demand), 7)?.values || [];
  const sourceTotal = ['_wikipediaDetail', '_qiitaDetail', '_arxivDetail',
    '_appstoreDetail', '_githubDetail', '_ndlDetail'].filter((k) => demand[k]).length;

  // Subtle tiering: top-3 get a slightly stronger border
  const tier = rank <= 3 ? 'top3' : rank <= 6 ? 'mid' : 'rest';

  // <button onClick={nav()}> から <Link> に変更した（2026-08-01）。
  // カードは詳細ページへの唯一の入口なのに <a> が 1 本も無く、
  // クローラーは 10 件のテーマ詳細（1 ページ 4,692 字・サイトで最も厚い）へ
  // 内部リンクで到達できなかった（実測: Home の内部リンク 4 本、Explore は 0 本）。
  // 副次的に、キーボードでの遷移・新しいタブで開く・リンクのコピーも可能になる。
  return (
    <Link
      to={`/demand/${demand.id}`}
      className={`demand-card compact tier-${tier}`}
      aria-label={`${demand.title} の詳細を見る`}
      style={{ '--i': index }}
    >
      <div className={`rank ${rank <= 3 ? 'top' : ''}`}>
        {String(rank).padStart(2, '0')}
      </div>

      <div className="demand-info">
        <div className="card-title-row">
          <div className="demand-title">{demand.title}</div>
          <span className="demand-cat-inline">{demand.category}</span>
        </div>
        <BadgeRow verdict={verdict} insights={insights} />
        <div className="demand-summary">{demand.summary}</div>

        {/* 根拠の量。カードは意図的に簡素化してあるので、判断に効く 2 つだけ足す
            （ニュース件数 = 根拠の数、情報源数 = 裏取りの広さ）。
            グリッドは 4 列なので、独立した子ではなく info 列の中に置く
            （2026-07-30 実測: 5 番目の子にすると metrics が 2 行目 38px 幅に
            落ちて、ピルが x=-8 まで画面外へはみ出していた） */}
        <div className="demand-evidence">
          <span title="直近 30 日でこのテーマに紐付いたニュース記事">
            ニュース <b>{demand._matchingArticleCount ?? 0}</b> 件
          </span>
          <span className="demand-evidence-sep">·</span>
          <span title="実際に観測できた情報源の数（最大 6）">
            <b>{sourceTotal}</b> 情報源
          </span>
        </div>
      </div>

      <div className="demand-chart">
        {/* 詳細ページと同じ系列（Wikipedia 日次 PV）の末尾 7 点。
            旧実装は trendData['7d'] = ニュース件数で、2 テーマが全ゼロだった */}
        <Sparkline data={cardSeries} color={sparkColor} />
      </div>

      <div className="demand-metrics compact">
        <div className={`card-primary-change ${changeClass(primaryPct)}`}
             title={hasHistoryMove
               ? `${sourceDisplay(historyMove.source)} の ${historyMove.metric}: ${historyMove.previous.toLocaleString()} → ${historyMove.current.toLocaleString()}`
               : '他テーマの中央値と比べたニュース増加ペース'}>
          <span className="cpc-lbl">{primaryLabel}</span>
          <span className="cpc-val">{formatChange(primaryPct)}</span>
          <span className="cpc-src">{primarySrc}</span>
        </div>
        <div className="score">
          <AnimatedNumber value={demand.score} duration={900} />
          <span className="score-lbl">スコア</span>
        </div>
      </div>
    </Link>
  );
}
