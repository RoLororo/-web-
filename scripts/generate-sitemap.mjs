// ============================================================================
// scripts/generate-sitemap.mjs
//
// public/sitemap.xml を生成する。
//
//   なぜ生成なのか:
//     テーマと分野は demands.json から増減する。手書きすると必ずずれる
//     （2026-08-01 実測: sitemap.xml はそもそも存在せず、/sitemap.xml は
//      SPA の rewrite に飲まれて HTML を返していた）。
//
//   実行:
//     直接:  npm run sitemap
//     自動:  vite build の prebuild で mirror のあとに実行
//
//   lastmod は demands.json の generatedAt を使う。ビルド時刻ではない
//   （中身が変わっていないのに更新日だけ動くと、クローラの信用を落とす）。
// ============================================================================

import { PATHS } from './lib/paths.mjs';
import { storage } from './lib/storage.mjs';
import { resolve } from 'node:path';

const SITE_URL = 'https://demand-atlas.vercel.app';

/**
 * 固定ページ。
 *   priority … サイト内での相対的な重要度（0.0〜1.0）
 *   changefreq … クローラへの目安。実態と合わせる
 */
const STATIC_PAGES = [
  { path: '/',            priority: '1.0', changefreq: 'daily' },
  { path: '/rankings',    priority: '0.9', changefreq: 'daily' },
  { path: '/ideas',       priority: '0.8', changefreq: 'daily' },
  { path: '/categories',  priority: '0.7', changefreq: 'weekly' },
  { path: '/explore',     priority: '0.7', changefreq: 'daily' },
  { path: '/compare',     priority: '0.6', changefreq: 'weekly' },
  { path: '/changes',     priority: '0.6', changefreq: 'daily' },
  { path: '/timeline',    priority: '0.5', changefreq: 'daily' },
  { path: '/whats-new',   priority: '0.5', changefreq: 'weekly' },
  { path: '/guide',       priority: '0.8', changefreq: 'monthly' },
  { path: '/sources',     priority: '0.8', changefreq: 'weekly' },
  { path: '/glossary',    priority: '0.7', changefreq: 'monthly' },
  { path: '/methodology', priority: '0.8', changefreq: 'monthly' },
  { path: '/about',       priority: '0.7', changefreq: 'monthly' },
  { path: '/contact',     priority: '0.4', changefreq: 'yearly' },
  { path: '/privacy',     priority: '0.3', changefreq: 'yearly' },
  { path: '/terms',       priority: '0.3', changefreq: 'yearly' },
];

// お気に入りは端末ごとの内容で、他人が開いても空。載せる意味がないので除外する
const EXCLUDED = ['/favorites'];

// 情報源の解説ページ。src/data/sourceGuide.js の SOURCE_ORDER と一致させる
const SOURCE_SLUGS = ['wikipedia', 'arxiv', 'qiita', 'github', 'appstore', 'news', 'ndl'];

const escapeXml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
           .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function urlEntry({ path, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${escapeXml(SITE_URL + path)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n');
}

async function main() {
  console.log('🦊 Demand Atlas — sitemap.xml 生成');

  const raw = await storage.readText(PATHS.output.demands);
  const data = JSON.parse(raw);
  const demands = data.demands || [];

  // generatedAt を YYYY-MM-DD に。無ければ lastmod を省く（嘘の日付を書かない）
  const lastmod = data.generatedAt ? String(data.generatedAt).slice(0, 10) : null;

  const entries = [];

  for (const p of STATIC_PAGES) {
    if (EXCLUDED.includes(p.path)) continue;
    // 内容が日次で変わるページだけ lastmod を付ける。固定文のページには付けない
    const isDynamic = p.changefreq === 'daily';
    entries.push(urlEntry({ ...p, lastmod: isDynamic ? lastmod : null }));
  }

  for (const d of demands) {
    if (!d.id) continue;
    entries.push(urlEntry({
      path: `/demand/${encodeURIComponent(d.id)}`,
      lastmod,
      changefreq: 'daily',
      priority: '0.9',
    }));
  }

  // 情報源の解説ページ。sourceGuide.js の slug と 1 対 1 で対応する
  //（ここを増やしたら src/data/sourceGuide.js にも追加すること）
  for (const slug of SOURCE_SLUGS) {
    entries.push(urlEntry({
      path: `/sources/${slug}`,
      lastmod,
      changefreq: 'weekly',
      priority: '0.6',
    }));
  }

  // 実際にテーマが 1 件以上ある分野だけ。0 件の分野は中身のないページになる
  const categories = [...new Set(demands.map((d) => d.category).filter(Boolean))];
  for (const c of categories) {
    entries.push(urlEntry({
      path: `/categories/${encodeURIComponent(c)}`,
      lastmod,
      changefreq: 'weekly',
      priority: '0.6',
    }));
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries.join('\n'),
    '</urlset>',
    '',
  ].join('\n');

  const out = resolve(PATHS.publicMirror.root, 'sitemap.xml');
  await storage.writeText(out, xml);

  console.log(`   固定ページ ${STATIC_PAGES.length - EXCLUDED.length} 件`);
  console.log(`   テーマ     ${demands.length} 件`);
  console.log(`   情報源     ${SOURCE_SLUGS.length} 件`);
  console.log(`   分野       ${categories.length} 件`);
  console.log(`   → ${out}（合計 ${entries.length} URL / lastmod ${lastmod || 'なし'}）`);
}

main().catch((e) => {
  console.error('sitemap 生成に失敗:', e.message);
  process.exit(1);
});
