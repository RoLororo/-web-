// ============================================================================
// scripts/check-completeness.mjs
//
// Demand Atlas — 完成度の実測
//
//   ■ 目的
//     「日本で一番情報量の多い需要分析サイト」に向けて、
//     毎回同じ方法で完成度を測る。推測を挟まないために、
//     すべて data/ と dist/ の実ファイルから数える。
//
//   ■ 測る 8 指標（ユーザー指定）
//     1. カテゴリ充足率（9 分野）
//     2. テーマ数
//     3. 情報源数
//     4. 記事数
//     5. カテゴリごとの情報量
//     6. 検索対象テキスト量
//     7. 内部リンク密度
//     8. データ品質
//
//   ■ 使い方
//     npm run completeness            … 現在の値を表示
//     npm run completeness -- --json  … JSON で出力（差分比較用）
//
//   ■ 注意
//     内部リンク密度とページ文字数は dist/ を読む。
//     `npm run build` を通していないと古い値になる。
// ============================================================================

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, REPO_ROOT } from './lib/paths.mjs';

/** カテゴリマスタ。src/data/categories.js と同じ 9 分野（唯一の正本はあちら） */
const ALL_CATEGORIES = [
  'AI・テクノロジー', 'ビジネス', '起業', '副業', '教育', '生活', 'エンタメ', '健康', '美容',
];

const asJson = process.argv.includes('--json');
const num = (n) => n.toLocaleString('ja-JP');

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

const demands = readJson(PATHS.output.demands, { demands: [] }).demands || [];
const articles = readJson(PATHS.source.articles, []);
const candidates = readJson(PATHS.source.candidates, { candidates: [] }).candidates || [];
const registry = readJson(PATHS.config.themeRegistry, { themes: {} });

// ---------------------------------------------------------------------------
// 1. カテゴリ充足率
// ---------------------------------------------------------------------------

const byCategory = {};
for (const c of ALL_CATEGORIES) byCategory[c] = [];
for (const d of demands) {
  if (!byCategory[d.category]) byCategory[d.category] = [];
  byCategory[d.category].push(d);
}
const filled = ALL_CATEGORIES.filter((c) => byCategory[c].length > 0);

// ---------------------------------------------------------------------------
// 3. 情報源数
// ---------------------------------------------------------------------------

const newsFeeds = [...new Set(articles.map((a) => a.source).filter(Boolean))];
// 横断ソースは demands に _xxxDetail として付く。実際に値を持つものだけ数える
const CROSS = ['_wikipediaDetail', '_qiitaDetail', '_arxivDetail', '_appstoreDetail', '_githubDetail', '_ndlDetail'];
const crossActive = CROSS.filter((k) => demands.some((d) => d[k]));

// ---------------------------------------------------------------------------
// 5. カテゴリごとの情報量 / 6. 検索対象テキスト量
// ---------------------------------------------------------------------------

/** 検索は title + summary + category しか見ない（src/services/demandService.js searchDemands） */
const searchableOf = (d) => `${d.title}${d.summary}${d.category}`.length;
const searchableTotal = demands.reduce((s, d) => s + searchableOf(d), 0);

/** テーマ 1 件がページに出す文字量（検索対象外だが情報量としては効く） */
const proseOf = (d) => {
  const arr = (a) => (a || []).join('').length;
  const ev = (d.evidence || []).reduce((s, e) => s + String(e.title || '').length, 0);
  const bo = (d.businessOpportunities || []).reduce((s, o) => s + `${o.title}${o.desc || ''}`.length, 0);
  return arr(d.audience) + arr(d.problems) + ev + bo;
};

// ---------------------------------------------------------------------------
// 7. 内部リンク密度（dist/ のプリレンダ済み HTML から）
// ---------------------------------------------------------------------------

function walkHtml(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkHtml(p, acc);
    else if (e.name === 'index.html') acc.push(p);
  }
  return acc;
}

const distDir = join(REPO_ROOT, 'dist');
const pages = walkHtml(distDir);
const pageStats = pages.map((f) => {
  const html = readFileSync(f, 'utf8');
  const i = html.indexOf('<div id="root">');
  const body = i < 0 ? '' : html.slice(i)
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const links = [...new Set((html.match(/href="(\/[^"#]*)"/g) || []).map((s) => s.slice(6, -1)))];
  return { path: f.slice(distDir.length).replace(/\\/g, '/'), chars: body.length, links: links.length };
});
const totalChars = pageStats.reduce((s, p) => s + p.chars, 0);
const avgLinks = pageStats.length ? pageStats.reduce((s, p) => s + p.links, 0) / pageStats.length : 0;
const thin = pageStats.filter((p) => p.chars < 400);

// ---------------------------------------------------------------------------
// 8. データ品質
// ---------------------------------------------------------------------------

/** 昇格基準（config/theme-registry.json promotionCriteria）: 3 情報源以上 かつ ニュース 5 件以上 */
const MIN_SOURCES = registry.promotionCriteria?.minSources ?? 3;
const MIN_NEWS = registry.promotionCriteria?.minNewsArticles ?? 5;
const promoted = demands.filter((d) => (d.sourceCount || 0) >= MIN_SOURCES && (d._matchingArticleCount || 0) >= MIN_NEWS);
const avgQuality = demands.length
  ? demands.reduce((s, d) => s + (d._dataQuality || 0), 0) / demands.length : 0;
const verdicts = {};
for (const d of demands) {
  const v = d._insights?.verdict?.label || '(なし)';
  verdicts[v] = (verdicts[v] || 0) + 1;
}
/** 内訳から score を再現できるか（出した根拠で説明できるか） */
const reproducible = demands.filter((d) => {
  const b = d._scoreBreakdown || {};
  const re = Math.round(40 * b.newsVolume + 30 * b.growth + 20 * b.sourceDiversity + 10 * b.freshness);
  return re === d.score;
}).length;

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

const report = {
  measuredAt: new Date().toISOString(),
  カテゴリ充足率: { 充足: filled.length, 全体: ALL_CATEGORIES.length, 率: Math.round((filled.length / ALL_CATEGORIES.length) * 100) },
  テーマ数: demands.length,
  情報源数: { ニュース媒体: newsFeeds.length, 横断ソース: crossActive.length, 合計: newsFeeds.length + crossActive.length },
  記事数: articles.length,
  カテゴリごとの情報量: Object.fromEntries(ALL_CATEGORIES.map((c) => {
    const ds = byCategory[c];
    return [c, {
      テーマ: ds.length,
      根拠記事: ds.reduce((s, d) => s + (d._matchingArticleCount || 0), 0),
      本文字数: ds.reduce((s, d) => s + proseOf(d), 0),
    }];
  })),
  検索対象テキスト量: searchableTotal,
  内部リンク密度: { ページ数: pageStats.length, 平均リンク数: Math.round(avgLinks * 10) / 10, 総本文字数: totalChars, 本文400字未満: thin.length },
  データ品質: {
    昇格基準を満たすテーマ: promoted.length,
    平均dataQuality: Math.round(avgQuality * 100) / 100,
    内訳からscore再現: `${reproducible}/${demands.length}`,
    判定の分布: verdicts,
  },
};

// ---------------------------------------------------------------------------
// 整合性チェック — 画面に出している数字が実データとズレていないか
//
// 2026-08-02 に媒体を 13 → 23 に増やしたとき、詳細ページに
// 「購読している 13 媒体」が残ったまま公開された。同じ数字が 4 箇所に
// 手書きされていたため。1 箇所（src/config/site.js）に集約したうえで、
// ここで実データと突き合わせる。
// ---------------------------------------------------------------------------

const drift = [];
const siteJs = existsSync(join(REPO_ROOT, 'src', 'config', 'site.js'))
  ? readFileSync(join(REPO_ROOT, 'src', 'config', 'site.js'), 'utf8') : '';
const declaredFeeds = Number((siteJs.match(/NEWS_FEED_COUNT\s*=\s*(\d+)/) || [])[1]);
if (declaredFeeds && declaredFeeds !== newsFeeds.length) {
  drift.push(`site.js の NEWS_FEED_COUNT = ${declaredFeeds} だが、実際に記事がある媒体は ${newsFeeds.length}`);
}
const buildJs = existsSync(join(REPO_ROOT, 'scripts', 'build-demands.mjs'))
  ? readFileSync(join(REPO_ROOT, 'scripts', 'build-demands.mjs'), 'utf8') : '';
const sat = Number((buildJs.match(/SOURCE_SATURATION\s*=\s*(\d+)/) || [])[1]);
const declaredSat = Number((siteJs.match(/NEWS_DIVERSITY_SATURATION\s*=\s*(\d+)/) || [])[1]);
if (sat && declaredSat && sat !== declaredSat) {
  drift.push(`SOURCE_SATURATION = ${sat} だが site.js の NEWS_DIVERSITY_SATURATION = ${declaredSat}`);
}
report.整合性 = drift.length ? drift : 'ズレなし';

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const r = report;
  console.log('🦊 Demand Atlas — 完成度の実測\n');
  console.log(`  ① カテゴリ充足率   ${r.カテゴリ充足率.充足} / ${r.カテゴリ充足率.全体} 分野 (${r.カテゴリ充足率.率}%)`);
  console.log(`  ② テーマ数         ${num(r.テーマ数)}`);
  console.log(`  ③ 情報源数         ${r.情報源数.合計}（ニュース媒体 ${r.情報源数.ニュース媒体} + 横断 ${r.情報源数.横断ソース}）`);
  console.log(`  ④ 記事数           ${num(r.記事数)}`);
  console.log(`  ⑥ 検索対象テキスト ${num(r.検索対象テキスト量)} 字  ※検索は title+summary+category のみ対象`);
  console.log(`  ⑦ 内部リンク密度   ${r.内部リンク密度.ページ数} ページ / 平均 ${r.内部リンク密度.平均リンク数} リンク / 総本文 ${num(r.内部リンク密度.総本文字数)} 字`);
  console.log(`  ⑧ データ品質       昇格基準クリア ${r.データ品質.昇格基準を満たすテーマ}/${r.テーマ数} / 平均品質 ${r.データ品質.平均dataQuality} / score再現 ${r.データ品質.内訳からscore再現}`);
  console.log('\n  ⑤ カテゴリごとの情報量');
  console.log('     分野'.padEnd(22) + 'テーマ  根拠記事  本文字数');
  for (const c of ALL_CATEGORIES) {
    const v = r.カテゴリごとの情報量[c];
    const mark = v.テーマ === 0 ? '  ← 空' : '';
    console.log(`     ${c.padEnd(18)}${String(v.テーマ).padStart(4)}${String(v.根拠記事).padStart(9)}${String(num(v.本文字数)).padStart(10)}${mark}`);
  }
  if (thin.length) {
    console.log(`\n  本文 400 字未満のページ (${thin.length}):`);
    thin.forEach((p) => console.log(`     ${p.path} = ${p.chars} 字`));
  }
  console.log('\n  判定の分布:', Object.entries(r.データ品質.判定の分布).map(([k, v]) => `${k} ${v}`).join(' / '));
  if (drift.length) {
    console.log('\n  ⚠ 画面の数字と実データのズレ:');
    drift.forEach((d) => console.log(`     ${d}`));
    process.exitCode = 1;
  } else {
    console.log('  整合性: 画面の数字と実データにズレなし');
  }
}
