// ============================================================================
// scripts/prerender.mjs
//
// ビルド済みの SPA に、ルートごとの静的 HTML を追加する。
//
//   なぜ必要か（2026-08-01 実測・本番）:
//     37 URL すべてが同じ生 HTML を返していた。
//       title    … 全ページ "Demand Atlas — 世の中の需要を可視化する"
//       og:title … 同上
//       本文     … 251 文字（アプリの殻だけ）
//       内部リンク … 0 本
//     X・Slack・LINE・Facebook のカードは **JavaScript を実行しない**ので、
//     どのテーマを共有しても同じ見出しが出ていた。SNS からの流入が
//     構造的に伸びない状態だった。検索側も、描画待ちの列に入るぶん反映が遅い。
//
//   何をするか:
//     1. entry-server.jsx を Node 用にビルド（vite build --ssr）
//     2. 各ルートを renderToString して HTML と meta を得る
//     3. dist/index.html の <head> と #root に差し込み、
//        dist/<ルート>/index.html として書き出す
//
//   ブラウザ側は無変更。main.jsx は今までどおり createRoot で描画する
//   （hydrate にはしない。AnimatedNumber や日時表示でサーバーと差が出るため、
//     不一致を無理に合わせるより、素直に描き直す方が壊れにくい）。
//     静的 HTML は「最初に見えるもの」と「クローラーが読むもの」を兼ねる。
//
//   実行: npm run prerender（build の後に自動実行）
// ============================================================================

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { PATHS } from './lib/paths.mjs';

const REPO = resolve(PATHS.publicMirror.root, '..');
const DIST = resolve(REPO, 'dist');
const SSR_OUT = resolve(REPO, '.ssr-build');

/** 情報源の解説ページ。generate-sitemap.mjs と同じ一覧 */
const SOURCE_SLUGS = ['wikipedia', 'arxiv', 'qiita', 'github', 'appstore', 'news', 'ndl'];

/** 固定ルート。sitemap の固定ページと揃える。
 *  /favorites は端末ごとの内容だが、静的ファイルとして存在させることで
 *  「未定義 URL だけを 404 に送る」rewrite を安全にできる（getFavorites は
 *  localStorage 不在時に [] を返す SSR セーフ実装。noindex 済み）。 */
const STATIC_ROUTES = [
  '/', '/rankings', '/ideas', '/categories', '/explore', '/compare',
  '/changes', '/timeline', '/whats-new', '/favorites',
  '/guide', '/sources', '/glossary', '/methodology', '/about', '/contact',
  '/privacy', '/terms',
];

// ---------------------------------------------------------------------------
// ブラウザの API を最小限だけ用意する
//
// demandService はモジュール読み込み時に fetch('/data/demands.json') する。
// Node の fetch は絶対 URL しか受け付けないので、サイト内のパスは
// ビルド済みの dist/ から読むように差し替える。
// ---------------------------------------------------------------------------
function installFetchShim() {
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input);
    if (url.startsWith('/')) {
      const clean = url.split('?')[0];
      const file = resolve(DIST, '.' + clean);
      if (!existsSync(file)) {
        return { ok: false, status: 404, json: async () => null, text: async () => '' };
      }
      const body = await readFile(file, 'utf8');
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(body),
        text: async () => body,
      };
    }
    // 外部 URL はプリレンダ中に叩かない（ビルドを外部の都合で落とさない）
    if (!real) throw new Error('fetch unavailable');
    return { ok: false, status: 599, json: async () => null, text: async () => '' };
  };
}

const escapeAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * テンプレートの <head> を、そのページの値で置き換える。
 * index.html にもとからある静的タグを**書き換える**（重複させない）。
 */
function patchHead(template, seo) {
  let html = template;
  const title = seo.title || 'Demand Atlas — 世の中の需要を可視化する';
  const desc = seo.description || '';

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(title)}</title>`);

  const setMeta = (attr, key, value) => {
    if (!value) return;
    const re = new RegExp(`<meta ${attr}="${key}" content="[\\s\\S]*?"\\s*/?>`);
    const tag = `<meta ${attr}="${key}" content="${escapeAttr(value)}" />`;
    html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
  };

  setMeta('name', 'description', desc);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', desc);
  setMeta('property', 'og:url', seo.canonical || 'https://demand-atlas.vercel.app/');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', desc);
  // テーマ別 OG 画像がある場合は共通画像を上書きする（SNS 共有カードの CTR 向上）。
  if (seo.ogImage) {
    setMeta('property', 'og:image', seo.ogImage);
    setMeta('name', 'twitter:image', seo.ogImage);
  }

  const extra = [];
  if (seo.canonical) extra.push(`<link rel="canonical" href="${escapeAttr(seo.canonical)}" />`);
  if (seo.noindex) extra.push('<meta name="robots" content="noindex, follow" />');
  if (seo.jsonLd) {
    // </script> が中に現れると HTML が壊れるので分割してエスケープする
    const safe = seo.jsonLd.replace(/<\/script/gi, '<\\/script');
    extra.push(`<script type="application/ld+json">${safe}</script>`);
  }
  if (extra.length) html = html.replace('</head>', `    ${extra.join('\n    ')}\n  </head>`);

  return html;
}

async function main() {
  console.log('🦊 Demand Atlas — プリレンダ');

  if (!existsSync(resolve(DIST, 'index.html'))) {
    console.error('   dist/index.html がありません。先に vite build を実行してください。');
    process.exit(1);
  }

  // ── 1. SSR バンドルを作る ─────────────────────────────────────
  await rm(SSR_OUT, { recursive: true, force: true });
  await build({
    root: REPO,
    logLevel: 'error',
    build: {
      ssr: resolve(REPO, 'src/entry-server.jsx'),
      outDir: SSR_OUT,
      emptyOutDir: true,
      target: 'es2022',
      rollupOptions: { output: { entryFileNames: 'entry-server.js' } },
    },
  });
  console.log('   SSR バンドルを作成');

  // ── 2. ルート一覧を作る ───────────────────────────────────────
  const demandsRaw = await readFile(resolve(DIST, 'data/demands.json'), 'utf8');
  const demands = JSON.parse(demandsRaw).demands || [];
  const categories = [...new Set(demands.map((d) => d.category).filter(Boolean))];

  const routes = [
    ...STATIC_ROUTES,
    ...SOURCE_SLUGS.map((s) => `/sources/${s}`),
    ...demands.map((d) => `/demand/${d.id}`),
    ...categories.map((c) => `/categories/${encodeURIComponent(c)}`),
  ];

  // ── 3. 各ルートを描画して書き出す ─────────────────────────────
  installFetchShim();
  const { render } = await import(pathToFileURL(resolve(SSR_OUT, 'entry-server.js')).href);
  const template = await readFile(resolve(DIST, 'index.html'), 'utf8');

  let written = 0, totalBytes = 0, failed = [];
  for (const route of routes) {
    let out;
    try {
      out = await render(route);
    } catch (e) {
      failed.push(`${route}: ${e.message}`);
      continue;
    }
    // 文字化けの検査。entry-server が NUL を落としているので、
    // その処理で本物の文字を巻き込んでいれば U+FFFD として現れる。
    if (out.html.includes('�') || out.html.includes(' ')) {
      failed.push(`${route}: 出力に不正な文字が含まれる`);
      continue;
    }
    if (!out.seo.title) {
      failed.push(`${route}: title が取れていない（useSeo が呼ばれていない可能性）`);
      continue;
    }

    // テーマ詳細 / トップに、生成済みの専用 OG 画像があれば絶対 URL で差し込む。
    // 無ければ何もしない（テンプレート既定の og-image.jpg にフォールバック）。
    const demandMatch = route.match(/^\/demand\/(.+)$/);
    if (demandMatch && existsSync(resolve(DIST, 'og', `${demandMatch[1]}.png`))) {
      out.seo.ogImage = `https://demand-atlas.vercel.app/og/${demandMatch[1]}.png`;
    } else if (route === '/' && existsSync(resolve(DIST, 'og', 'home.png'))) {
      out.seo.ogImage = 'https://demand-atlas.vercel.app/og/home.png';
    }

    const page = patchHead(template, out.seo).replace(
      '<div id="root"></div>',
      `<div id="root">${out.html}</div>`,
    );

    // "/" は dist/index.html を上書き、それ以外は <ルート>/index.html
    const file = route === '/'
      ? resolve(DIST, 'index.html')
      : resolve(DIST, '.' + decodeURIComponent(route), 'index.html');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, page, 'utf8');
    written++;
    totalBytes += Buffer.byteLength(page);
  }

  // ── 4. 未定義 URL 用の 404.html（noindex）─────────────────────
  // vercel.json の rewrite はここへ送る。存在しない URL がホーム HTML を
  // 200 で返す soft-404（＝ホームの重複が索引されうる）を防ぐ。
  try {
    const nf = await render('/__not_found__');
    if (!nf.seo.noindex) throw new Error('NotFound が noindex になっていない');
    const nfPage = patchHead(template, nf.seo).replace(
      '<div id="root"></div>',
      `<div id="root">${nf.html}</div>`,
    );
    await writeFile(resolve(DIST, '404.html'), nfPage, 'utf8');
    console.log('   404.html を生成（noindex）');
  } catch (e) {
    failed.push(`404.html: ${e.message}`);
  }

  await rm(SSR_OUT, { recursive: true, force: true });

  console.log(`   ${written} ルートを書き出し（平均 ${Math.round(totalBytes / written / 1024)}KB）`);
  if (failed.length) {
    console.error(`   ✗ ${failed.length} ルートが失敗:`);
    for (const f of failed) console.error(`     ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('プリレンダに失敗:', e);
  process.exit(1);
});
