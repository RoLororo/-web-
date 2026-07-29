// ============================================================================
// Ideas — 全テーマ横断の「アイデア一覧」
//
//   ■ なぜ作るか（実測）
//     generate-insights.mjs は 1 テーマあたり
//       収益化 3 / コンテンツ 3 / SaaS 2 = 8 件のアイデアを生成しており、
//     10 テーマで計 80 件が既に demands.json に存在する。
//     しかし従来これを読めるのは DemandDetail の深部と Compare だけで、
//     Home からは 0 件見えなかった（2026-07-30 実測）。
//     本ページは「テーマを選ぶ前にアイデアから入る」導線を作る。
//
//   ■ 追加コストゼロの設計
//     - 新しいデータ取得は行わない（demands.json は既に読み込み済み）
//     - 新しい生成処理も行わない（pipeline 無変更）
//     - カードの見た目は DemandDetail と同じ .insight-idea-* を再利用
// ============================================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDemands } from '../services/demandService.js';
import { usePageTitle } from '../utils/usePageTitle.js';

const KINDS = [
  { key: 'all',          label: '全て' },
  { key: 'monetization', label: '収益化' },
  { key: 'content',      label: 'コンテンツ' },
  { key: 'saas',         label: 'SaaS' },
];

const KIND_LABEL = {
  monetization: '収益化',
  content:      'コンテンツ',
  saas:         'SaaS',
};

const BARRIERS = ['低', '中', '高'];

/** demands.json の _insights から、テーマ情報を付けた 1 次元のアイデア配列を作る */
function flattenIdeas(demands) {
  const out = [];
  for (const d of demands) {
    const ins = d._insights;
    if (!ins) continue;
    const meta = { themeId: d.id, themeTitle: d.title, category: d.category, score: d.score };
    for (const it of ins.monetization || []) out.push({ ...meta, kind: 'monetization', item: it });
    for (const it of ins.content      || []) out.push({ ...meta, kind: 'content',      item: it });
    for (const it of ins.saas         || []) out.push({ ...meta, kind: 'saas',         item: it });
  }
  return out;
}

function IdeaBody({ kind, item }) {
  if (kind === 'monetization') {
    return (
      <>
        <div className="insight-idea-title">{item.title}</div>
        <div className="insight-idea-desc">{item.desc}</div>
        <div className="insight-idea-tags">
          {item.barrier && <span className="insight-tag">参入難度 {item.barrier}</span>}
          {item.revenue && <span className="insight-tag rev">{item.revenue}</span>}
        </div>
      </>
    );
  }
  if (kind === 'content') {
    return (
      <>
        <div className="insight-idea-format">{item.format}</div>
        <div className="insight-idea-title">{item.title}</div>
        <div className="insight-idea-desc">{item.angle}</div>
      </>
    );
  }
  return (
    <>
      <div className="insight-idea-title">{item.title}</div>
      <div className="insight-idea-desc"><b>対象:</b> {item.target}</div>
      <div className="insight-idea-desc"><b>仮説:</b> {item.hypothesis}</div>
    </>
  );
}

export default function Ideas() {
  usePageTitle('アイデア一覧 — Demand Atlas');

  const [kind, setKind] = useState('all');
  const [theme, setTheme] = useState('');
  const [barrier, setBarrier] = useState('');

  const demands = useMemo(() => getDemands(), []);
  const all = useMemo(() => flattenIdeas(demands), [demands]);

  const counts = useMemo(() => {
    const c = { all: all.length, monetization: 0, content: 0, saas: 0 };
    for (const r of all) c[r.kind] += 1;
    return c;
  }, [all]);

  // 参入難度は収益化アイデアだけが持つ属性なので、コンテンツ / SaaS タブでは
  // 選択欄を出さない。その間フィルタが裏で効き続けると「操作できない条件で
  // 0 件」になるため、表示していない時は絞り込みにも使わない。
  const barrierApplies = kind === 'monetization' || kind === 'all';
  const activeBarrier = barrierApplies ? barrier : '';

  const rows = useMemo(() => {
    return all.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false;
      if (theme && r.themeId !== theme) return false;
      if (activeBarrier && (r.kind !== 'monetization' || r.item.barrier !== activeBarrier)) return false;
      return true;
    });
  }, [all, kind, theme, activeBarrier]);

  return (
    <div className="container ideas-page">
      <section className="page-hero">
        <div className="page-hero-eyebrow">IDEAS</div>
        <h1>アイデア一覧</h1>
        <p>
          観測中の {demands.length} テーマから機械的に導いた {all.length} 件の事業アイデアを、
          テーマをまたいで一覧できます。気になったものはテーマ詳細で根拠データを確認できます。
        </p>
      </section>

      <div className="ideas-toolbar">
        <div className="chip-row">
          {KINDS.map((k) => (
            <button
              key={k.key}
              className={`chip-btn ${kind === k.key ? 'active' : ''}`}
              onClick={() => setKind(k.key)}
            >
              {k.label} <span className="ideas-chip-count">{counts[k.key]}</span>
            </button>
          ))}
        </div>

        <div className="chip-row">
          <span className="chip-label">テーマ:</span>
          <button
            className={`chip-btn small ${theme === '' ? 'active' : ''}`}
            onClick={() => setTheme('')}
          >
            全て
          </button>
          {demands.map((d) => (
            <button
              key={d.id}
              className={`chip-btn small ${theme === d.id ? 'active' : ''}`}
              onClick={() => setTheme(d.id)}
            >
              {d.title}
            </button>
          ))}
        </div>

        {barrierApplies && (
          <div className="chip-row">
            <span className="chip-label">参入難度:</span>
            <button
              className={`chip-btn small ${barrier === '' ? 'active' : ''}`}
              onClick={() => setBarrier('')}
            >
              指定なし
            </button>
            {BARRIERS.map((b) => (
              <button
                key={b}
                className={`chip-btn small ${barrier === b ? 'active' : ''}`}
                onClick={() => setBarrier(b)}
              >
                {b}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ideas-count">{rows.length} 件を表示中</div>

      {rows.length === 0 ? (
        <div className="empty-hint">条件に一致するアイデアがありません。</div>
      ) : (
        <div className="ideas-grid">
          {rows.map((r, i) => (
            <div key={`${r.themeId}-${r.kind}-${i}`} className="insight-idea-card idea-card-x">
              <div className="idea-card-head">
                <span className={`idea-kind-badge kind-${r.kind}`}>{KIND_LABEL[r.kind]}</span>
                <Link to={`/demand/${r.themeId}`} className="idea-theme-link">
                  {r.themeTitle}
                </Link>
              </div>
              <IdeaBody kind={r.kind} item={r.item} />
            </div>
          ))}
        </div>
      )}

      <p className="ideas-note">
        アイデアは各テーマの観測データ（ニュース件数・情報源の内訳・カテゴリ）から
        ルールベースで生成しています。投資判断ではなく、検討の出発点としてご利用ください。
      </p>
    </div>
  );
}
