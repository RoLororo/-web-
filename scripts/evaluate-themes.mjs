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
/** 種出しの既定値。registry.seedFilter で上書きできる */
const SEED_MIN_OCCURRENCES = 5;
const SEED_MIN_DISPERSION = 0.6;
const SEED_TOP_N = 20;

/** カテゴリマスタ（src/data/mockDemands.js と同じ 9 分野） */
const ALL_CATEGORIES = [
  'AI・テクノロジー', 'ビジネス', '起業', '副業', '教育', '生活', 'エンタメ', '健康', '美容',
];

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
 *
 * 除外するもの（STEP 4 の重複除去）:
 *   - 既存テーマの relatedKeywords / keyword-trends のキー
 *   - registry.seedFilter.rejectedWords（過去に却下した語。散文ではなく設定に置く）
 *
 * 分散フィルタ: 分散 = 出現日数 / 出現件数。
 *   実測（2026-07-30）で事件名は 0.1〜0.29、継続的な語は 1.0 に寄る。
 *   単発の出来事をテーマ候補に混ぜないため、しきい値未満を落とす。
 */
function seedKeywords(articles, candidates, trends, filter) {
  const minOcc = filter?.minOccurrences ?? SEED_MIN_OCCURRENCES;
  const minDisp = filter?.minDispersion ?? SEED_MIN_DISPERSION;

  const known = new Set();
  for (const c of candidates?.candidates || []) {
    for (const k of c.relatedKeywords || []) known.add(k.trim());
  }
  for (const k of Object.keys(trends?.keywords || {})) known.add(k.trim());

  const rejected = new Set();
  for (const list of Object.values(filter?.rejectedWords || {})) {
    for (const w of list) rejected.add(w.trim());
  }

  const matched = new Set();
  for (const c of candidates?.candidates || []) {
    for (const id of c.evidenceArticleIds || []) matched.add(id);
  }

  const unmatched = articles.filter((a) => !matched.has(a.id));
  const freq = new Map();
  const days = new Map();
  for (const a of unmatched) {
    const day = (a.publishedAt || '').slice(0, 10);
    // カタカナ語 / 英字語 / 漢字語 を素朴に切り出す（形態素解析は依存を増やすため使わない）
    const tokens = (a.title || '').match(/[ァ-ヶー]{3,}|[A-Za-z][A-Za-z0-9.+-]{2,}|[一-龥]{2,4}/g) || [];
    for (const t of new Set(tokens)) {
      freq.set(t, (freq.get(t) || 0) + 1);
      if (!days.has(t)) days.set(t, new Set());
      days.get(t).add(day);
    }
  }

  const scored = [...freq.entries()]
    .filter(([w, n]) => n >= minOcc)
    .map(([word, articleCount]) => {
      const dayCount = days.get(word).size;
      const dispersion = Number((dayCount / articleCount).toFixed(2));
      return {
        word,
        articleCount,
        dayCount,
        dispersion,
        // 優先度 = 件数 × 分散。件数だけだと事件が上位に来る（STEP 6 の再現性のため式で決める）
        priority: Number((articleCount * dispersion).toFixed(1)),
      };
    });

  const excludedKnown = scored.filter((s) => known.has(s.word)).length;
  const excludedRejected = scored.filter((s) => !known.has(s.word) && rejected.has(s.word)).length;
  const excludedSpike = scored.filter(
    (s) => !known.has(s.word) && !rejected.has(s.word) && s.dispersion < minDisp,
  );

  const seeds = scored
    .filter((s) => !known.has(s.word) && !rejected.has(s.word) && s.dispersion >= minDisp)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, SEED_TOP_N);

  return {
    unmatchedCount: unmatched.length,
    totalArticles: articles.length,
    knownCount: known.size,
    rejectedCount: rejected.size,
    excludedKnown,
    excludedRejected,
    excludedSpike: excludedSpike.map((s) => `${s.word}(${s.dispersion})`),
    minOcc,
    minDisp,
    seeds,
  };
}

/**
 * テーマがどの段階にいるかを「ファイルの実体」から判定する。
 * レジストリの自己申告は信じない（食い違いを検出するのが目的）。
 *
 *   Phase A 済み = 情報源マッピングに載っている（取得はマッピングが駆動する）
 *   Phase B 済み = キーワード辞書に載っている（公開は辞書が駆動する）
 */
async function detectPhases(themeIds) {
  const mappingFiles = [
    PATHS.config.qiitaMapping, PATHS.config.appstoreMapping, PATHS.config.arxivMapping,
    PATHS.config.githubMapping, PATHS.config.ndlMapping,
  ];
  const inMapping = new Map(themeIds.map((id) => [id, 0]));
  for (const p of mappingFiles) {
    const j = await storage.readJson(p);
    for (const id of Object.keys(j?.mapping || {})) {
      if (inMapping.has(id)) inMapping.set(id, inMapping.get(id) + 1);
    }
  }

  // キーワード辞書は .mjs 内のリテラル。テキストとして存在確認する
  const dictText = (await storage.readText(PATHS.themeDictionary)) || '';
  const wikiText = (await storage.readText(PATHS.wikipediaFetcher)) || '';

  const out = {};
  for (const id of themeIds) {
    out[id] = {
      mappingCount: inMapping.get(id) || 0,
      inWikipedia: wikiText.includes(`'${id}'`),
      inDictionary: dictText.includes(`id: '${id}'`),
    };
    out[id].phaseA = out[id].mappingCount > 0 || out[id].inWikipedia;
    out[id].phaseB = out[id].inDictionary;
  }
  return out;
}

/** カテゴリと情報源の空白を数える（STEP 2 を毎回手計算しないため） */
function coverageGaps(demands) {
  const byCategory = {};
  for (const d of demands) byCategory[d.category] = (byCategory[d.category] || 0) + 1;
  const emptyCategories = ALL_CATEGORIES.filter((c) => !byCategory[c]);

  const missingBySource = {};
  for (const key of SOURCE_KEYS) {
    const name = key.replace(/^_|Detail$/g, '');
    missingBySource[name] = demands.filter((d) => !d[key]).map((d) => d.id);
  }

  const sourceCountDist = {};
  for (const d of demands) {
    const n = countSources(d);
    sourceCountDist[n] = (sourceCountDist[n] || 0) + 1;
  }

  return { byCategory, emptyCategories, missingBySource, sourceCountDist };
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

  // ── 4.2 レジストリの status と実体の突き合わせ ──────────────
  const phases = await detectPhases(registered);
  const expected = (p) => (p.phaseB ? 'active/stalled' : p.phaseA ? 'observing' : 'candidate');
  const drift = registered.filter((id) => {
    const st = registry.themes[id].status;
    const exp = expected(phases[id]);
    if (exp === 'active/stalled') return !['active', 'stalled'].includes(st);
    return st !== exp;
  });
  console.log('■ status とファイル実体の整合（自己申告を信じない）');
  for (const id of registered) {
    const p = phases[id];
    console.log(`   ${id.padEnd(24)} status=${registry.themes[id].status.padEnd(10)}` +
      ` mapping ${p.mappingCount}/5 ${p.inWikipedia ? '+wiki' : '     '} 辞書 ${p.inDictionary ? '有' : '無'}` +
      `  → 実体は ${expected(p)}`);
  }
  console.log(drift.length ? `   ⚠ 食い違い ${drift.length} 件: ${drift.join(', ')}` : '   ✅ 食い違いなし');
  console.log('');

  // ── 4.5 候補（Phase A 前）────────────────────────────────
  const candidateIds = registered.filter((id) => registry.themes[id].status === 'candidate');
  console.log('■ 候補（マッピング未投入 = Phase A 前）');
  if (candidateIds.length === 0) {
    console.log('   なし');
  } else {
    for (const id of candidateIds) {
      const t = registry.themes[id];
      const ev = t.seedEvidence?.words || {};
      const total = Object.values(ev).reduce((s2, v) => s2 + (v.articles || 0), 0);
      console.log(`   ${id}（${t.proposedName || '-'} / ${t.proposedCategory || '-'}）`);
      console.log(`     根拠: ${Object.entries(ev).map(([w, v]) => `${w} ${v.articles}件/分散${v.dispersion}`).join(' / ')} = 計 ${total} 件`);
      if (t.blockedBy) console.log(`     未着手の理由: ${t.blockedBy}`);
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

  // ── 6. カテゴリと情報源の空白（STEP 2）──────────────────────
  const gaps = coverageGaps(demands);
  console.log('■ カテゴリの空白');
  console.log(`   使用 ${Object.keys(gaps.byCategory).length} / ${ALL_CATEGORIES.length} 分野` +
    `（${Object.entries(gaps.byCategory).map(([c, n]) => `${c} ${n}`).join(' / ')}）`);
  console.log(`   空白: ${gaps.emptyCategories.join(' / ') || 'なし'}`);
  console.log('');
  console.log('■ 情報源の空白');
  for (const [name, ids] of Object.entries(gaps.missingBySource)) {
    console.log(`   ${name.padEnd(10)} 欠損 ${String(ids.length).padStart(2)} テーマ` +
      (ids.length ? `  → ${ids.join(', ')}` : ''));
  }
  console.log(`   ソース数の分布: ${JSON.stringify(gaps.sourceCountDist)}（キー=ソース数 / 値=テーマ数）`);
  console.log('');

  // ── 7. 新しい需要候補の種（重複除去 + 分散フィルタ）────────────
  const seed = seedKeywords(articles, candidates, trends, registry.seedFilter);
  console.log('■ 未紐付け記事からの候補語');
  console.log(`   未紐付け ${seed.unmatchedCount} / ${seed.totalArticles} 件`);
  console.log(`   除外: 既知語 ${seed.excludedKnown} / 却下済み ${seed.excludedRejected}` +
    ` / 単発の出来事 ${seed.excludedSpike.length}（分散 < ${seed.minDisp}）`);
  if (seed.excludedSpike.length) {
    console.log(`     単発と判定: ${seed.excludedSpike.join(' ')}`);
  }
  if (seed.seeds.length === 0) {
    console.log(`   → ${seed.minOcc} 件以上・分散 ${seed.minDisp} 以上の新しい語は **なし**`);
  } else {
    console.log('   優先度 = 出現件数 × 分散（高い順）:');
    for (const s of seed.seeds) {
      console.log(`     ${String(s.priority).padStart(5)}  ${s.word.padEnd(14)} ${s.articleCount} 件 / ${s.dayCount} 日 / 分散 ${s.dispersion}`);
    }
  }
  console.log('');

  // ── 8. 評価ログに追記（同日は上書き）──────────────────────────
  const record = {
    date: today,
    generatedAt: new Date().toISOString(),
    published: published.size,
    registered: registered.length,
    belowCriteria: below.length,
    active,
    observing,
    candidates: candidateIds,
    seedTop: seed.seeds.slice(0, 10),
    emptyCategories: gaps.emptyCategories,
    sourceCountDist: gaps.sourceCountDist,
  };
  const nextLog = [...log.filter((r) => r.date !== today), record].sort((a, b) => a.date.localeCompare(b.date));
  await storage.writeJsonl(PATHS.evaluations, nextLog);
  console.log(`📝 評価ログ: ${nextLog.length} 日分 → ${PATHS.evaluations}`);
}

main().catch((err) => {
  console.error('❌ 失敗:', err);
  process.exitCode = 1;
});
