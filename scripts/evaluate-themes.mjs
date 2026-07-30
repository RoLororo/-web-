// ============================================================================
// scripts/evaluate-themes.mjs
//
// Demand Atlas — 追跡テーマの昇格・降格判定と、新しい需要候補の種出し
//
//   ■ 目的
//     「いま何が公開中で、何が停滞していて、次に何を追跡すべきか」を
//     既存データだけで機械が答えられるようにする。
//     判定を出力するだけで、テーマ定義・スコア・UI・pipeline は一切変更しない。
//
//   ■ 入力（すべて既存ファイル）
//     - config/theme-registry.json … テーマの状態
//     - data/demands.json          … 公開中テーマの実測値
//     - data/demand-candidates.json… ルールベース照合の結果
//     - data/keyword-trends.json   … 任意キーワードの Google News RSS 集計
//     - data/articles.json         … ニュース原文（未紐付け記事の抽出用）
//
//   ■ 出力
//     - 標準出力に判定レポート
//     - data/theme-evaluations.jsonl に日付キーで 1 行追記（連続日数の判定用）
//
//   ■ このスクリプトが やらないこと
//     - テーマの追加・削除（判定を出すだけ。反映は人間の判断）
//     - score 計算への関与
//     - 新しい API の呼び出し（ネットワークアクセスは一切しない）
//
//   ■ 判定の根拠（2026-07-30 実測）
//     - 昇格基準「3 ソース以上 かつ news 5 件以上」: 2 ソース以下は停止率 60〜70%
//     - 降格は 3 日連続で未達の時だけ提案する（1 日では日次の揺れで振動する）
//     - keyword-trends の totalItems は 57 語中 55 語が RSS の 100 件上限に
//       飽和して判別力がない。velocity（件/日）は 0.4〜26.5 で飽和しないため
//       こちらを使う
//
//   ■ 使い方
//     npm run themes:eval
// ============================================================================

import { PATHS } from './lib/paths.mjs';
import { storage } from './lib/storage.mjs';

const MIN_SOURCES = 3;
const MIN_NEWS = 5;
const DEMOTION_CONSECUTIVE_DAYS = 3;
/** 種出しで拾う語の最低出現数。1〜2 件は偶然の混入が多い */
const SEED_MIN_OCCURRENCES = 5;
const SEED_TOP_N = 20;

const SOURCE_KEYS = [
  '_wikipediaDetail', '_qiitaDetail', '_arxivDetail',
  '_appstoreDetail', '_githubDetail', '_ndlDetail',
];

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

/** storage adapter 経由で読む（fs / 将来の DB を透過的に扱うため既存 driver を再利用） */
async function readJson(path, label) {
  const obj = await storage.readJson(path);
  if (!obj) console.warn(`⚠  ${label} を読めませんでした`);
  return obj;
}

async function readLog(path) {
  const res = await storage.readJsonl(path);
  if (!res) return [];
  // corruptLines は行番号の配列。空配列は truthy なので length で見る
  if (res.corruptLines?.length) {
    console.warn(`⚠  評価ログに壊れた行が ${res.corruptLines.length} 件あります（行: ${res.corruptLines.join(',')}）`);
  }
  return res.records || [];
}

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------

function countSources(demand) {
  return SOURCE_KEYS.filter((k) => demand[k]).length;
}

/** 公開中テーマを昇格基準に照らす */
function evaluateActive(demands) {
  return demands.map((d) => {
    const sources = countSources(d);
    const news = d._matchingArticleCount || 0;
    return {
      id: d.id,
      news,
      sources,
      score: d.score,
      meets: sources >= MIN_SOURCES && news >= MIN_NEWS,
      shortfall: [
        sources < MIN_SOURCES ? `ソース ${sources}/${MIN_SOURCES}` : null,
        news < MIN_NEWS ? `ニュース ${news}/${MIN_NEWS}` : null,
      ].filter(Boolean).join(' / '),
    };
  });
}

/** キーワードの velocity（件/日）。totalItems は上限飽和するため期間で割る */
function keywordVelocity(trends) {
  if (!trends || !trends.keywords) return [];
  return Object.entries(trends.keywords).map(([keyword, v]) => {
    const dates = Object.keys(v.byDate || {}).sort();
    const spanDays = dates.length
      ? Math.round((Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000) + 1
      : 0;
    return {
      keyword,
      items: v.totalItems || 0,
      spanDays,
      velocity: spanDays ? Number(((v.totalItems || 0) / spanDays).toFixed(2)) : 0,
      saturated: (v.totalItems || 0) >= 100,
    };
  }).sort((a, b) => b.velocity - a.velocity);
}

/**
 * 未紐付け記事から候補語の種を出す。
 * 既知の語（テーマの relatedKeywords / keyword-trends のキー）は重複として除く。
 */
function seedKeywords(articles, candidates, trends) {
  const known = new Set();
  for (const c of candidates?.candidates || []) {
    for (const k of c.relatedKeywords || []) known.add(k.trim());
  }
  for (const k of Object.keys(trends?.keywords || {})) known.add(k.trim());

  const matched = new Set();
  for (const c of candidates?.candidates || []) {
    for (const id of c.evidenceArticleIds || []) matched.add(id);
  }

  const unmatched = articles.filter((a) => !matched.has(a.id));
  const freq = new Map();
  for (const a of unmatched) {
    // カタカナ語 / 英字語 / 漢字語 を素朴に切り出す（形態素解析は依存を増やすため使わない）
    const tokens = (a.title || '').match(/[ァ-ヶー]{3,}|[A-Za-z][A-Za-z0-9.+-]{2,}|[一-龥]{2,4}/g) || [];
    for (const t of new Set(tokens)) freq.set(t, (freq.get(t) || 0) + 1);
  }

  const seeds = [...freq.entries()]
    .filter(([w, n]) => n >= SEED_MIN_OCCURRENCES && !known.has(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, SEED_TOP_N)
    .map(([word, articleCount]) => ({ word, articleCount }));

  return { unmatchedCount: unmatched.length, totalArticles: articles.length, knownCount: known.size, seeds };
}

/** 過去の評価ログから、基準未達が何日連続しているかを数える */
function consecutiveDaysBelow(log, themeId) {
  let n = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    const row = (log[i].active || []).find((t) => t.id === themeId);
    if (!row) break;
    if (row.meets) break;
    n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — テーマ評価');
  console.log('');

  const registry   = await readJson(PATHS.config.themeRegistry, 'config/theme-registry.json');
  const demandsDoc = await readJson(PATHS.output.demands, 'data/demands.json');
  const candidates = await readJson(PATHS.source.candidates, 'data/demand-candidates.json');
  const trends     = await readJson(PATHS.source.trends, 'data/keyword-trends.json');
  const articlesDoc= await readJson(PATHS.source.articles, 'data/articles.json');

  if (!registry || !demandsDoc) {
    console.error('❌ registry と demands.json は必須です');
    process.exitCode = 1;
    return;
  }

  const demands = demandsDoc.demands || [];
  const articles = Array.isArray(articlesDoc) ? articlesDoc : (articlesDoc?.articles || []);
  const today = new Date().toISOString().slice(0, 10);

  // ── 1. レジストリと実データの突き合わせ ──────────────────────────
  const registered = Object.keys(registry.themes || {});
  const published = new Set(demands.map((d) => d.id));
  const activeInRegistry = registered.filter((id) => registry.themes[id].status === 'active');

  const missingFromRegistry = [...published].filter((id) => !registered.includes(id));
  const activeButUnpublished = activeInRegistry.filter((id) => !published.has(id));
  const publishedButNotActive = [...published].filter(
    (id) => registered.includes(id) && registry.themes[id].status !== 'active',
  );

  console.log('■ レジストリと実データの整合');
  console.log(`   登録 ${registered.length} / うち active ${activeInRegistry.length} / 公開中 ${published.size}`);
  if (missingFromRegistry.length) console.log(`   ⚠ 未登録なのに公開中: ${missingFromRegistry.join(', ')}`);
  if (activeButUnpublished.length) console.log(`   ⚠ active なのに非公開: ${activeButUnpublished.join(', ')}`);
  if (publishedButNotActive.length) console.log(`   ⚠ active 以外なのに公開中: ${publishedButNotActive.join(', ')}`);
  if (!missingFromRegistry.length && !activeButUnpublished.length && !publishedButNotActive.length) {
    console.log('   ✅ 不整合なし');
  }
  console.log('');

  // ── 2. 昇格基準の充足 ────────────────────────────────────────
  const active = evaluateActive(demands);
  const below = active.filter((t) => !t.meets);
  console.log('■ 公開中テーマの基準充足（3 ソース以上 かつ ニュース 5 件以上）');
  for (const t of active.sort((a, b) => b.score - a.score)) {
    console.log(
      `   ${t.meets ? '✅' : '✗ '} ${t.id.padEnd(24)} news ${String(t.news).padStart(3)} / src ${t.sources} / score ${String(t.score).padStart(3)}` +
      (t.meets ? '' : `   ← 未達: ${t.shortfall}`),
    );
  }
  console.log(`   未達 ${below.length} / ${active.length} 件`);
  console.log('');

  // ── 3. 降格の提案（連続日数を評価ログから数える）────────────────
  const log = await readLog(PATHS.evaluations);
  const priorLog = log.filter((r) => r.date !== today);
  console.log('■ 降格の判定');
  if (priorLog.length === 0) {
    console.log(`   判断材料不足: 過去の評価ログが 0 日分。連続 ${DEMOTION_CONSECUTIVE_DAYS} 日の判定には
   このスクリプトを ${DEMOTION_CONSECUTIVE_DAYS} 日以上動かす必要がある`);
  } else {
    const proposals = [];
    for (const t of below) {
      const streak = consecutiveDaysBelow([...priorLog, { date: today, active }], t.id);
      if (streak >= DEMOTION_CONSECUTIVE_DAYS) proposals.push({ id: t.id, streak });
      else console.log(`   ${t.id}: 未達 ${streak} 日連続（提案は ${DEMOTION_CONSECUTIVE_DAYS} 日から）`);
    }
    if (proposals.length) {
      console.log('   降格を提案:');
      for (const p of proposals) console.log(`     - ${p.id}（${p.streak} 日連続で未達）`);
    } else if (below.length === 0) {
      console.log('   ✅ 未達テーマなし');
    }
  }
  console.log('');

  // ── 4. 停滞テーマ（observing）の再評価 ──────────────────────────
  const observing = registered.filter((id) => registry.themes[id].status === 'observing');
  console.log('■ 停滞テーマ（observing）');
  if (observing.length === 0) {
    console.log('   なし');
  } else {
    for (const id of observing) {
      const cand = (candidates?.candidates || []).find((c) => c.id === id);
      const hit = cand ? cand.evidenceArticleCount : 0;
      console.log(`   ${id}: ルールベース照合の根拠記事 ${hit} 件` +
        (hit === 0 ? '（0 件のため公開されない）' : '（1 件以上あり、次回ビルドで公開され得る）'));
      if (registry.themes[id].note) console.log(`     note: ${registry.themes[id].note}`);
    }
  }
  console.log('');

  // ── 5. キーワードの velocity ───────────────────────────────
  const vel = keywordVelocity(trends);
  console.log('■ 既知キーワードの velocity（件/日・上位 10）');
  console.log(`   totalItems が 100 件上限に飽和: ${vel.filter((v) => v.saturated).length} / ${vel.length} 語`);
  for (const v of vel.slice(0, 10)) {
    console.log(`   ${String(v.velocity).padStart(6)} 件/日  ${v.keyword}（${v.items} 件 / ${v.spanDays} 日）`);
  }
  console.log('');

  // ── 6. 新しい需要候補の種（重複除去済み）──────────────────────
  const seed = seedKeywords(articles, candidates, trends);
  console.log('■ 未紐付け記事からの候補語（既知語を除去済み）');
  console.log(`   未紐付け ${seed.unmatchedCount} / ${seed.totalArticles} 件・既知語 ${seed.knownCount} 語を除外`);
  if (seed.seeds.length === 0) {
    console.log(`   ${SEED_MIN_OCCURRENCES} 件以上に出る新しい語はなし`);
  } else {
    console.log('   ' + seed.seeds.map((s) => `${s.word}(${s.articleCount})`).join(' '));
    console.log('   ※ これは種であって候補ではない。事件名・固有名詞が混ざるため、');
    console.log('     テーマ化の判断には velocity と特異度の確認が必要');
  }
  console.log('');

  // ── 7. 評価ログに追記（同日は上書き）──────────────────────────
  const record = {
    date: today,
    generatedAt: new Date().toISOString(),
    published: published.size,
    registered: registered.length,
    belowCriteria: below.length,
    active,
    observing,
    seedTop: seed.seeds.slice(0, 10),
  };
  const nextLog = [...log.filter((r) => r.date !== today), record].sort((a, b) => a.date.localeCompare(b.date));
  await storage.writeJsonl(PATHS.evaluations, nextLog);
  console.log(`📝 評価ログ: ${nextLog.length} 日分 → ${PATHS.evaluations}`);
}

main().catch((err) => {
  console.error('❌ 失敗:', err);
  process.exitCode = 1;
});
