// ============================================================================
// Compare — 2 テーマを横並びで比較する
//
//   ■ URL
//     /compare?a=<themeId>&b=<themeId>
//     a のみ指定 → b の picker を出す
//     両方未指定 → 「テーマを選んでください」ガイド
//
//   ■ 比較する軸
//     - 総合スコア + 前日比
//     - 情報源ごとの volume (棒グラフ)
//     - momentum / beginner / competition (ゲージ)
//     - 収益化アイデア top 3 (テーマごと)
//     - 共通キーワード / 差分キーワード
//
//   ■ 設計原則
//     - 純粋 client-side, demands.json のみで完結
//     - Sparkline/Bar は既存コンポーネント流用 (Sparkline.jsx)
//     - insights のあるテーマ同士でも insights のないテーマ同士でも動く
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getDemands, getDemandById } from '../services/demandService.js';
import { sourceDisplay, sourceColor } from '../services/sourceCatalog.js';
import { usePageTitle } from '../utils/usePageTitle.js';

function ThemePicker({ label, value, onChange, exclude, demands }) {
  return (
    <div className="cmp-picker">
      <label className="cmp-picker-label">{label}</label>
      <select
        className="select"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">— テーマを選択 —</option>
        {demands
          .filter((d) => d.id !== exclude)
          .map((d) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))
        }
      </select>
    </div>
  );
}

function ScoreCell({ label, value, hint, className = '' }) {
  return (
    <div className={`cmp-cell ${className}`}>
      <div className="cmp-cell-label">{label}</div>
      <div className="cmp-cell-value">{value}</div>
      {hint && <div className="cmp-cell-hint">{hint}</div>}
    </div>
  );
}

function GaugeBar({ score = 0, hue = 145 }) {
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div className="cmp-gauge">
      <div className="cmp-gauge-fill" style={{ width: `${clamped}%`, background: `hsl(${hue} 60% 50%)` }} />
    </div>
  );
}

/** テーマから情報源別 volume を抽出 (bar chart 用) */
function extractSourceVolumes(d) {
  const rows = [];
  const q = d._qiitaDetail?.metrics?.volume;
  if (typeof q === 'number') rows.push({ src: 'qiita', label: 'Qiita', value: q, unit: '記事' });
  const w = d._wikipediaDetail?.totalPageviews30d;
  if (typeof w === 'number') rows.push({ src: 'wikipedia', label: 'Wikipedia', value: w, unit: 'PV' });
  const x = d._arxivDetail?.metrics?.volume;
  if (typeof x === 'number') rows.push({ src: 'arxiv', label: 'arXiv', value: x, unit: '論文' });
  const a = d._appstoreDetail?.nativeMetrics?.matchedAppCount;
  if (typeof a === 'number') rows.push({ src: 'appstore', label: 'App Store', value: a, unit: 'app' });
  const n = d._matchingArticleCount;
  if (typeof n === 'number') rows.push({ src: 'news', label: 'ニュース', value: n, unit: '記事' });
  return rows;
}

function SourceBars({ leftVolumes, rightVolumes }) {
  // すべての source id を union してから、双方の値を並記
  const srcSet = new Set([...leftVolumes.map((r) => r.src), ...rightVolumes.map((r) => r.src)]);
  const rows = [...srcSet].map((src) => {
    const l = leftVolumes.find((r) => r.src === src) || { value: 0, label: sourceDisplay(src), unit: '' };
    const r = rightVolumes.find((r) => r.src === src) || { value: 0, label: sourceDisplay(src), unit: '' };
    const max = Math.max(l.value, r.value, 1);
    return { src, label: l.label || r.label, unit: l.unit || r.unit, left: l.value, right: r.value, max };
  });
  return (
    <div className="cmp-src-table">
      {rows.map((row) => (
        <div key={row.src} className="cmp-src-row">
          <div className="cmp-src-label">
            <span className="cmp-src-dot" style={{ background: sourceColor(row.src) }} />
            {row.label} <span className="cmp-src-unit">({row.unit})</span>
          </div>
          <div className="cmp-src-bars">
            <div className="cmp-src-bar left">
              <div className="cmp-src-bar-fill" style={{
                width: `${(row.left / row.max) * 100}%`,
                background: sourceColor(row.src),
              }} />
              <span className="cmp-src-bar-num">{row.left.toLocaleString()}</span>
            </div>
            <div className="cmp-src-bar right">
              <div className="cmp-src-bar-fill" style={{
                width: `${(row.right / row.max) * 100}%`,
                background: sourceColor(row.src),
              }} />
              <span className="cmp-src-bar-num">{row.right.toLocaleString()}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AssessTriad({ demand }) {
  const i = demand._insights;
  if (!i) return <div className="cmp-empty-hint">insights 未生成のテーマです。</div>;
  return (
    <div className="cmp-triad">
      <div>
        <div className="cmp-triad-lbl">勢い</div>
        <div className="cmp-triad-val">{i.momentum?.label} ({i.momentum?.score})</div>
        <GaugeBar score={i.momentum?.score} hue={145} />
      </div>
      <div>
        <div className="cmp-triad-lbl">参入しやすさ</div>
        <div className="cmp-triad-val">{i.beginnerFriendliness?.label} ({i.beginnerFriendliness?.score})</div>
        <GaugeBar score={i.beginnerFriendliness?.score} hue={200} />
      </div>
      <div>
        <div className="cmp-triad-lbl">競争</div>
        <div className="cmp-triad-val">{i.competition?.label} ({i.competition?.score})</div>
        <GaugeBar score={i.competition?.score} hue={30} />
      </div>
    </div>
  );
}

function IdeaList({ ideas }) {
  if (!ideas || ideas.length === 0) return <div className="cmp-empty-hint">アイデアなし</div>;
  return (
    <ul className="cmp-idea-list">
      {ideas.slice(0, 3).map((it, i) => (
        <li key={i}>
          <div className="cmp-idea-title">{it.title}</div>
          <div className="cmp-idea-desc">{it.desc}</div>
        </li>
      ))}
    </ul>
  );
}

/** 共通 / 差分キーワードの分類 */
function classifyKeywords(a, b) {
  const setA = new Set((a._relatedKeywords || []).map((k) => String(k).trim()));
  const setB = new Set((b._relatedKeywords || []).map((k) => String(k).trim()));
  const common = [...setA].filter((k) => setB.has(k));
  const onlyA = [...setA].filter((k) => !setB.has(k));
  const onlyB = [...setB].filter((k) => !setA.has(k));
  return { common, onlyA, onlyB };
}

/** 数値比較を「A > B」形式のインサイト文にする */
function buildComparisonNarrative(a, b) {
  const bullets = [];
  if (a.score !== b.score) {
    const diff = Math.abs(a.score - b.score);
    const w = a.score > b.score ? a : b;
    const l = a.score > b.score ? b : a;
    bullets.push(`総合スコアは「${w.title}」が ${diff} 点高い (${w.score} vs ${l.score})`);
  }
  const aM = a._insights?.momentum?.score, bM = b._insights?.momentum?.score;
  if (aM != null && bM != null && Math.abs(aM - bM) >= 15) {
    const w = aM > bM ? a : b;
    bullets.push(`直近の勢いは「${w.title}」が明確に上`);
  }
  const aB = a._insights?.beginnerFriendliness?.score, bB = b._insights?.beginnerFriendliness?.score;
  if (aB != null && bB != null && Math.abs(aB - bB) >= 15) {
    const w = aB > bB ? a : b;
    bullets.push(`初心者の参入は「${w.title}」の方がやりやすそう`);
  }
  const aC = a._insights?.competition?.score, bC = b._insights?.competition?.score;
  if (aC != null && bC != null && Math.abs(aC - bC) >= 15) {
    const w = aC < bC ? a : b;
    bullets.push(`競争が緩いのは「${w.title}」`);
  }
  return bullets;
}

export default function Compare() {
  usePageTitle('テーマ比較 — Demand Atlas');
  const [params, setParams] = useSearchParams();
  const demands = useMemo(() => getDemands(), []);

  const [a, setA] = useState(params.get('a') || null);
  const [b, setB] = useState(params.get('b') || null);

  function updateParam(next) {
    const p = {};
    if (next.a) p.a = next.a;
    if (next.b) p.b = next.b;
    setParams(p, { replace: true });
  }

  function pickA(id) { setA(id); updateParam({ a: id, b }); }
  function pickB(id) { setB(id); updateParam({ a, b: id }); }
  function swap() {
    const na = b, nb = a;
    setA(na); setB(nb);
    updateParam({ a: na, b: nb });
  }

  const demandA = a ? getDemandById(a) : null;
  const demandB = b ? getDemandById(b) : null;

  const volA = demandA ? extractSourceVolumes(demandA) : [];
  const volB = demandB ? extractSourceVolumes(demandB) : [];
  const kwClass = (demandA && demandB) ? classifyKeywords(demandA, demandB) : null;
  const narrative = (demandA && demandB) ? buildComparisonNarrative(demandA, demandB) : [];

  return (
    <div className="container compare-page">
      <section className="page-hero">
        <div className="page-hero-eyebrow">COMPARE</div>
        <h1>2 つのテーマを並べて見る</h1>
        <p>スコア・情報源・勢い・アイデアを横並びで比較して、どちらに賭けるかの判断材料にします。</p>
      </section>

      <div className="cmp-pickers">
        <ThemePicker label="テーマ A" value={a} onChange={pickA} exclude={b} demands={demands} />
        <button className="cmp-swap" onClick={swap} disabled={!a && !b} aria-label="A と B を入れ替え">
          ⇄
        </button>
        <ThemePicker label="テーマ B" value={b} onChange={pickB} exclude={a} demands={demands} />
      </div>

      {(!demandA || !demandB) && (
        <div className="cmp-guide">
          {(!demandA && !demandB) && '上の 2 つのセレクタでテーマを選んでください。'}
          {(demandA && !demandB) && `「${demandA.title}」ともう 1 テーマを選んでください。`}
          {(!demandA && demandB) && `「${demandB.title}」ともう 1 テーマを選んでください。`}
        </div>
      )}

      {demandA && demandB && (
        <>
          {/* 見出し */}
          <div className="cmp-header">
            <Link to={`/demand/${demandA.id}`} className="cmp-header-title">{demandA.title}</Link>
            <div className="cmp-vs">VS</div>
            <Link to={`/demand/${demandB.id}`} className="cmp-header-title right">{demandB.title}</Link>
          </div>

          {/* 数値 4 セル */}
          <div className="cmp-grid">
            <ScoreCell label="総合スコア" value={demandA.score} hint={demandA.category} />
            <ScoreCell label="総合スコア" value={demandB.score} hint={demandB.category} className="right" />

            <ScoreCell label="前日比" value={`${demandA.change > 0 ? '+' : ''}${demandA.change}%`} />
            <ScoreCell label="前日比" value={`${demandB.change > 0 ? '+' : ''}${demandB.change}%`} className="right" />

            <ScoreCell label="ステータス" value={demandA.status} />
            <ScoreCell label="ステータス" value={demandB.status} className="right" />
          </div>

          {/* 情報源別 volume */}
          <div className="cmp-section">
            <h3 className="cmp-section-title">情報源別の観測量</h3>
            <SourceBars leftVolumes={volA} rightVolumes={volB} />
          </div>

          {/* 3スコア triad */}
          <div className="cmp-section">
            <h3 className="cmp-section-title">評価スコア</h3>
            <div className="cmp-triad-grid">
              <AssessTriad demand={demandA} />
              <AssessTriad demand={demandB} />
            </div>
          </div>

          {/* インサイト narrative */}
          {narrative.length > 0 && (
            <div className="cmp-section cmp-narrative">
              <h3 className="cmp-section-title">この 2 つの差</h3>
              <ul>
                {narrative.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}

          {/* キーワード */}
          {kwClass && (
            <div className="cmp-section">
              <h3 className="cmp-section-title">関連キーワード</h3>
              <div className="cmp-kw-grid">
                <div>
                  <div className="cmp-kw-label">A だけ ({kwClass.onlyA.length})</div>
                  <div className="cmp-kw-list">{kwClass.onlyA.map((k) => <span key={k} className="pill">{k}</span>)}</div>
                </div>
                <div>
                  <div className="cmp-kw-label common">共通 ({kwClass.common.length})</div>
                  <div className="cmp-kw-list">{kwClass.common.map((k) => <span key={k} className="pill common">{k}</span>)}</div>
                </div>
                <div>
                  <div className="cmp-kw-label">B だけ ({kwClass.onlyB.length})</div>
                  <div className="cmp-kw-list">{kwClass.onlyB.map((k) => <span key={k} className="pill">{k}</span>)}</div>
                </div>
              </div>
            </div>
          )}

          {/* アイデア */}
          <div className="cmp-section">
            <h3 className="cmp-section-title">収益化アイデア (上位 3)</h3>
            <div className="cmp-idea-grid">
              <IdeaList ideas={demandA._insights?.monetization} />
              <IdeaList ideas={demandB._insights?.monetization} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
