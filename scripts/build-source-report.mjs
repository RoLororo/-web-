// ============================================================================
// scripts/build-source-report.mjs
//
// 各 fetcher の出力から「情報源そのものの成績表」を作る。
//
//   なぜ必要か:
//     fetcher の出力（data/qiita.json など）には、その日どのテーマが取れて
//     どれが取れなかったか、なぜ取れなかったかが全部残っている。
//     しかしこれはリポジトリの中にしか無く、サイトを見る人には届いていない。
//     一方でこの情報は「その数字をどこまで信じてよいか」の判断に直結する。
//     例（2026-07-31 実測）:
//       - App Store は 11 テーマ中 4 テーマしか取れていない
//       - 国立国会図書館は 6 件が timeout / 429 で落ちている
//       - Qiita は senior-health と ai-regulation を意図的に外している
//     これを隠すと「7 情報源で観測」という説明が実態より強く見える。
//
//   出力: data/source-report.json（public/data/ にミラーされ、/sources で表示）
//   ここでは**事実だけ**を出す。解釈と読み方は UI 側（Sources.jsx）に書く。
//
//   実行: npm run sources:report（npm run all の中で demands の後に実行）
// ============================================================================

import { PATHS } from './lib/paths.mjs';
import { storage } from './lib/storage.mjs';


/** 情報源の静的な定義。ここに無いものは出さない */
const SOURCES = [
  {
    id: 'wikipedia',
    file: PATHS.source.wikipedia,
    name: 'Wikipedia 日本語版 日次閲覧数',
    metricKind: 'flow',
    unit: '閲覧数',
    homepage: 'https://ja.wikipedia.org/',
    apiDocs: 'https://wikimedia.org/api/rest_v1/',
  },
  {
    id: 'qiita',
    file: PATHS.source.qiita,
    name: 'Qiita',
    metricKind: 'flow',
    unit: '記事数',
    homepage: 'https://qiita.com/',
    apiDocs: 'https://qiita.com/api/v2/docs',
  },
  {
    id: 'arxiv',
    file: PATHS.source.arxiv,
    name: 'arXiv',
    metricKind: 'flow',
    unit: '論文数',
    homepage: 'https://arxiv.org/',
    apiDocs: 'https://info.arxiv.org/help/api/index.html',
  },
  {
    id: 'appstore',
    file: PATHS.source.appstore,
    name: 'App Store（日本ストア）',
    metricKind: 'snapshot',
    unit: 'アプリ数',
    homepage: 'https://www.apple.com/jp/app-store/',
    apiDocs: 'https://rss.marketingtools.apple.com/',
  },
  {
    id: 'github',
    file: PATHS.source.github,
    name: 'GitHub',
    metricKind: 'flow',
    unit: '新規リポジトリ数',
    homepage: 'https://github.com/',
    apiDocs: 'https://docs.github.com/rest/search',
  },
  {
    id: 'ndl',
    file: PATHS.source.ndl,
    name: '国立国会図書館サーチ',
    metricKind: 'stock',
    unit: '書誌件数',
    homepage: 'https://ndlsearch.ndl.go.jp/',
    apiDocs: 'https://ndlsearch.ndl.go.jp/help/api',
  },
];

/** テーマの配列 / 連想配列どちらでも id の一覧を返す */
function themeIds(payload) {
  const t = payload.themes || payload.results || payload.data || {};
  return Array.isArray(t) ? t.map((x) => x.id).filter(Boolean) : Object.keys(t);
}

/** そのテーマで実際に観測できた量（envelope の metrics.volume）を足す */
function totalVolume(payload) {
  const t = payload.themes || payload.results || payload.data || {};
  const list = Array.isArray(t) ? t : Object.values(t);
  let sum = 0, counted = 0;
  for (const x of list) {
    const v = x?.metrics?.volume ?? x?.totalPageviews30d;
    if (typeof v === 'number' && isFinite(v)) { sum += v; counted++; }
  }
  return counted ? sum : null;
}

/** スキップ理由を、文字列でも {theme, reason} でも同じ形にそろえる */
function normalizeSkipped(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) =>
    typeof s === 'string'
      ? { theme: s, reason: null, note: null }
      : { theme: s.theme ?? null, reason: s.reason ?? null, note: s.note ?? null }
  ).filter((s) => s.theme);
}

/** エラーは種類と対象テーマだけを残す（メッセージは内部事情なので出さない） */
function normalizeErrors(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => ({
    theme: e.theme ?? null,
    type: e.type ?? 'unknown',
    retryable: Boolean(e.retryable),
  }));
}

async function main() {
  console.log('🦊 Demand Atlas — 情報源レポート生成');

  const sources = [];
  for (const def of SOURCES) {
    if (!(await storage.fileExists(def.file))) {
      console.log(`   ${def.id}: ファイルなし（スキップ）`);
      continue;
    }
    const p = JSON.parse(await storage.readText(def.file));
    const ids = themeIds(p);

    sources.push({
      id: def.id,
      name: def.name,
      metricKind: def.metricKind,
      unit: def.unit,
      homepage: def.homepage,
      apiDocs: def.apiDocs,
      method: p.method ?? null,
      windowDays: p.windowDays ?? null,
      generatedAt: p.generatedAt ?? null,
      mappedThemeCount: p.mappedThemeCount ?? null,
      successCount: p.successCount ?? ids.length,
      skippedCount: p.skippedCount ?? 0,
      errorCount: p.errorCount ?? 0,
      requestCount: p.totalRequestCount ?? p.requestCount ?? null,
      observedThemes: ids,
      skipped: normalizeSkipped(p.themesSkipped),
      errors: normalizeErrors(p.errors),
      totalVolume: totalVolume(p),
    });
    const s = sources[sources.length - 1];
    console.log(`   ${def.id.padEnd(10)} 成功 ${s.successCount}/${s.mappedThemeCount ?? '?'}  スキップ ${s.skippedCount}  エラー ${s.errorCount}`);
  }

  // ニュースは fetcher の形が違う（テーマ別ではなく記事の配列）ので別に数える
  let news = null;
  if (await storage.fileExists(PATHS.source.articles)) {
    const articles = JSON.parse(await storage.readText(PATHS.source.articles));
    const feeds = [...new Set(articles.map((a) => a.source).filter(Boolean))];
    news = {
      id: 'news',
      name: '主要ニュース RSS',
      metricKind: 'flow',
      unit: '記事数',
      homepage: null,
      apiDocs: null,
      method: 'RSS',
      articleCount: articles.length,
      feeds,
    };
    console.log(`   news       記事 ${articles.length} 件 / 媒体 ${feeds.length}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sources,
    news,
  };

  const out = PATHS.output.sourceReport;
  await storage.writeJson(out, report);
  console.log(`   → ${out}`);
}

main().catch((e) => {
  console.error('情報源レポートの生成に失敗:', e.message);
  process.exit(1);
});
