// ============================================================================
// scripts/fetch-news.mjs
//
// Demand Atlas — Phase 1: ニュース RSS 取得スクリプト
//
//   ■ 目的
//     指定した RSS フィードから記事を取得し、data/articles.json に
//     追記保存する。今回はデータ収集の "最初の一歩" だけを担う。
//
//   ■ このスクリプトが やること
//     - RSS を parse
//     - 各記事を共通スキーマに正規化
//     - 既存 articles.json とマージ (URL 基準で重複排除)
//     - publishedAt の新しい順に並べ、最大 1000 件で保存
//     - どの RSS が成功/失敗したかを最後に表示
//
//   ■ このスクリプトが やらないこと (Phase 1 のスコープ外)
//     - AI 分析
//     - 需要テーマの抽出
//     - 検索トレンドの取得
//     - スコア計算
//     - フロントエンドへの反映
//     - 自動実行 (cron / GitHub Actions)
//
//   ■ 使い方
//     npm run news
//
//   ■ 依存
//     - rss-parser (npm i -D rss-parser)
//     - Node.js 18+ の標準機能 (node:crypto, node:fs/promises, node:path, node:url)
// ============================================================================

import Parser from 'rss-parser';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 設定 — フィードや上限を変えたければここだけを触る
// ---------------------------------------------------------------------------

/** 収集対象の RSS フィード。増やすときは name と url を追加するだけ。 */
const FEEDS = [
  { name: 'NHK',     url: 'https://www.nhk.or.jp/rss/news/cat0.xml' },
  { name: 'ITmedia', url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml' },
  { name: 'Zenn',    url: 'https://zenn.dev/feed' },
  { name: 'はてな',   url: 'https://b.hatena.ne.jp/hotentry.rss' },
];

/** 保存する最大件数 (古いものから溢れる) */
const MAX_ARTICLES = 1000;

/** 1 フィードあたりの取得タイムアウト (ミリ秒) */
const FEED_TIMEOUT_MS = 15000;

// 出力先を「リポジトリ直下 / data / articles.json」の絶対パスで解決する。
// スクリプトを別ディレクトリから呼んでも常に同じ場所に書き込めるようにする。
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DATA_DIR  = resolve(REPO_ROOT, 'data');
const OUTPUT    = resolve(DATA_DIR, 'articles.json');

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * URL からブレない一意 ID を作る。
 * sha1 の先頭 16 文字で十分 (数万件までは実質衝突しない)。
 */
function makeId(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

/**
 * 日付を ISO 8601 (UTC) に正規化する。
 * パースできなければ null を返し、呼び出し側で扱いを決める。
 */
function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** RSS 由来の概要テキストを整形。長すぎる場合は末尾を省略する。 */
function cleanSummary(str, max = 280) {
  if (!str) return '';
  const s = String(str).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/**
 * 既存 articles.json を読み込む。
 * ファイルが無い場合は空配列を返す。
 * 壊れていた場合は警告して空から始める (Phase 1 はシンプルさ優先)。
 */
async function loadExisting() {
  try {
    const raw = await readFile(OUTPUT, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    console.warn(`⚠  既存 ${OUTPUT} が読めませんでした。空から始めます: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// RSS 取得
// ---------------------------------------------------------------------------

const parser = new Parser({ timeout: FEED_TIMEOUT_MS });

/** 1 フィードから記事を取得し、正規化した配列を返す。失敗時は例外を投げる。 */
async function fetchFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const fetchedAt = new Date().toISOString();

  const articles = [];
  for (const it of items) {
    // 記事 URL は link を優先、なければ guid を試す。両方無い場合は捨てる。
    const url = it.link || it.guid;
    if (!url) continue;
    articles.push({
      id:          makeId(url),
      source:      feed.name,
      sourceUrl:   feed.url,
      title:       (it.title || '').trim(),
      url,
      publishedAt: toIso(it.isoDate || it.pubDate),
      summary:     cleanSummary(it.contentSnippet || it.content || it.summary),
      fetchedAt,
    });
  }
  return articles;
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — ニュース取得を開始します');
  console.log(`   出力先: ${OUTPUT}`);
  console.log(`   対象フィード: ${FEEDS.length} 件\n`);

  const existing = await loadExisting();
  console.log(`   既存記事: ${existing.length} 件\n`);

  const results = [];   // 各フィードの成功/失敗ログ
  const collected = []; // 今回取ってきた記事の集約

  for (const feed of FEEDS) {
    console.log(`  → ${feed.name.padEnd(8)} ${feed.url}`);
    try {
      const articles = await fetchFeed(feed);
      collected.push(...articles);
      results.push({ feed: feed.name, ok: true, count: articles.length });
      console.log(`     ✓ ${articles.length} 件を取得`);
    } catch (err) {
      // 1 フィード落ちても他は続ける
      results.push({ feed: feed.name, ok: false, error: err.message });
      console.log(`     ✗ 失敗: ${err.message}`);
    }
  }

  // URL 基準で重複排除しつつマージ (既存を優先。新規のみ追加)
  const byUrl = new Map();
  for (const a of existing) byUrl.set(a.url, a);
  let added = 0;
  for (const a of collected) {
    if (!byUrl.has(a.url)) {
      byUrl.set(a.url, a);
      added++;
    }
  }

  // publishedAt の新しい順に並べ、上限で切る
  const merged = Array.from(byUrl.values())
    .sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return tb - ta;
    })
    .slice(0, MAX_ARTICLES);

  // 書き込み (親ディレクトリが無ければ作る)
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(merged, null, 2) + '\n', 'utf8');

  // サマリー表示
  console.log('\n──────────────  サマリー  ──────────────');
  for (const r of results) {
    const mark   = r.ok ? '✓' : '✗';
    const detail = r.ok ? `${r.count} 件取得` : `失敗 (${r.error})`;
    console.log(`  ${mark} ${r.feed.padEnd(8)} ${detail}`);
  }
  console.log('────────────────────────────────────────');
  console.log(`  今回追加:     ${added} 件`);
  console.log(`  保存後合計:   ${merged.length} 件`);
  console.log(`  出力ファイル: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
