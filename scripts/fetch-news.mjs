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
import http from 'node:http';
import https from 'node:https';
import { PATHS } from './lib/paths.mjs';
import { storage } from './lib/storage.mjs';

// ---------------------------------------------------------------------------
// 設定 — フィードや上限を変えたければここだけを触る
// ---------------------------------------------------------------------------

/**
 * 収集対象の RSS フィード。増やすときは name と url を追加するだけ。
 * 重複は URL 基準で排除されるため、総合フィードとカテゴリ別フィードの併用は安全。
 *
 * ■ フィード採用の基準（2026-07-30 実測で確定）
 *   採否は「テーマ紐付き率」= そのフィードの記事のうち需要テーマの根拠になった
 *   割合で決める。実測値: ITmedia 24% / Zenn 24% / はてブ総合 5% / NHK 3%。
 *
 *   はてブのカテゴリ別（経済 / 暮らし / 学び）を 63 件追加して試したところ
 *   **紐付き 0 件（0%）**で、候補語の上位が トランプ・ロシア・自分・現場 と
 *   国際政治や汎用語に置き換わり発見の質が下がったため撤回した。
 *   一般ニュースの分野別フィードには需要（作りたい / 買いたい / 困っている）が
 *   現れない。**紐付き率 0% のフィードは採用しない。**
 *
 * ■ 2026-08-01 の拡張（4 本 → 13 本）
 *   候補 12 本を実測し、紐付き率 50% 以上の 9 本を採用した。
 *   実測値: Publickey 100% / ITmedia AI+ 90% / CodeZine 85% / Qiita人気 77% /
 *           窓の杜 75% / はてブIT 70% / Impress Watch 60% / GIGAZINE 57% /
 *           ITmedia Mobile 50%
 *   不採用: マイナビ 12%（内容はスポーツ結果）/ ITmedia ビジネス（フィード統合済み
 *           で 1 件のみ）/ TechCrunch JP（証明書が jp.techcrunch.com と不一致で取得不可）
 *
 *   注目すべきは「はてブ IT 70%」で、同じサイトの総合フィード（5%）の 14 倍。
 *   はてブは総合ではなくカテゴリを選べば有効という結論になった。
 */
const FEEDS = [
  { name: 'NHK',            url: 'https://www.nhk.or.jp/rss/news/cat0.xml' },
  { name: 'ITmedia',        url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml' },
  { name: 'Zenn',           url: 'https://zenn.dev/feed' },
  { name: 'はてな',          url: 'https://b.hatena.ne.jp/hotentry.rss' },
  { name: 'ITmedia AI+',    url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml' },
  { name: 'ITmedia Mobile', url: 'https://rss.itmedia.co.jp/rss/2.0/mobile.xml' },
  { name: 'Qiita',          url: 'https://qiita.com/popular-items/feed' },
  { name: 'CodeZine',       url: 'https://codezine.jp/rss/new/20/index.xml' },
  { name: 'Publickey',      url: 'https://www.publickey1.jp/atom.xml' },
  { name: '窓の杜',          url: 'https://forest.watch.impress.co.jp/data/rss/1.0/wf/feed.rdf' },
  { name: 'Impress Watch',  url: 'https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf' },
  { name: 'GIGAZINE',       url: 'https://gigazine.net/news/rss_2.0/' },
  { name: 'はてなIT',        url: 'https://b.hatena.ne.jp/hotentry/it.rss' },

  // ── 教育カテゴリ（2026-08-02 追加） ──────────────────────────────
  // ここまでの 13 本は技術・ビジネス媒体に偏っており、9 分野のうち
  // 稼働していたのは 3 分野だけだった。分野を埋めるには、その分野を
  // 継続的に扱う媒体を足すしかない。
  //
  // 採否は技術系と同じく実測で決めた。ただし「紐付き率」は使えない
  // （既存テーマが技術寄りなので、新分野ほど低く出るため逆向きの指標になる）。
  // 代わりに「反復語が何であるか」で判断した。実測:
  //   STUDY HACKER   30件 需要語100% 反復語=勉強法(18)/学習(17)/脳科学(19) → 継続する話題
  //   リセマム        50件 需要語 10% 反復語=高校野球/インターハイ         → 出来事が主
  //                        ただし受験語で絞ると 6 件が残り、他に代えがない
  //   ICT教育ニュース  20件 需要語 25% 反復語=開催/運営                  → 定型文寄り、量の補助
  //   ライフハッカー    20件 需要語 35% 反復語=方法(4)/時間(4)            → 学習法を 3 情報源にするため
  //
  // 不採用: 東洋経済 / プレジデント / ダイヤモンド / 日経ビジネス /
  //         リクナビNEXT（学習法・受験とも 0-1 件で、量として成立しない）
  { name: 'STUDY HACKER',   url: 'https://studyhacker.net/feed' },
  { name: 'リセマム',        url: 'https://resemom.jp/rss/index.rdf' },
  { name: 'ICT教育ニュース',  url: 'https://ict-enews.net/feed/' },
  { name: 'ライフハッカー',    url: 'https://www.lifehacker.jp/feed/index.xml' },
  // 受験テーマが リセマム 1 本に依存していたので追加。
  // 実測: 10 件すべてが受験の記事（10/10 = 100%）。
  { name: '中学受験情報局',    url: 'https://www.e-juken.jp/feed' },

  // ── 生活カテゴリ（2026-08-02 追加） ──────────────────────────────
  // 本物の判定式（hot >= 1 かつ 合計 >= 4 点）で測った採用件数:
  //   SUUMOジャーナル   15件 → 住まい 10
  //   アットホームタイムズ 10件 → 住まい  6
  //   家電Watch        15件 → 家電    4（変種Bの語で 3）
  //   roomie          20件 → 住まい  1
  //   ソレドコ          30件 → 住まい  1 / 家電 1
  //
  // 既存 13 テーマへの混入は 2 件だけで、どちらも SUUMO の高齢者住宅記事が
  // senior-health に入るもの。内容として正しく、1 情報源しか無かった
  // senior-health の補強になるのでそのままにする。
  //
  // 着手前に「home-server-selfhost の hot 語『自宅』が住宅記事を吸う」と
  // 見ていたが、実測すると混入 0 件だった。採用条件が hot 単独では 3 点で、
  // warm（サーバ / 構築 / NAS）が無いと 4 点に届かないため。修正は不要。
  { name: 'SUUMOジャーナル',   url: 'https://suumo.jp/journal/feed/' },
  { name: 'アットホームタイムズ', url: 'https://athome-inc.jp/feed/' },
  { name: '家電Watch',       url: 'https://kaden.watch.impress.co.jp/data/rss/1.0/kdw/feed.rdf' },
  { name: 'roomie',         url: 'https://www.roomie.jp/feed/' },
  { name: 'ソレドコ',         url: 'https://soredoko.jp/feed' },

  // ── 健康カテゴリ（2026-08-02 追加） ──────────────────────────────
  // 健康は 1 テーマ（高齢者向け健康）しか無く、稼働 5 分野で最も痩せていた。
  //
  // 本物の判定式で 12 本を測り、採用は MELOS 1 本のみ:
  //   MELOS      50件 → フィットネス 15 件。反復語は 筋肉/トレーニング/
  //              ストレッチ/股関節/スクワット で、継続する話題
  //   QLifePro   10件 → 全テーマ 0 件（大学の研究発表で需要が現れない）
  //   介護ニュース  10件 → 全テーマ 0 件（介護事業者向けの制度ニュース）
  //   女性自身    10件 → 全テーマ 0 件
  //   FYTTE      10件 → 新テーマ 1 件だが、既存の自宅サーバーテーマに
  //              アイスメーカーの記事を混入させるため不採用
  //   Tarzan / NHK健康 / ヨガジャーナル / 日経Gooday など 6 本は取得不可
  //
  // MELOS は 家電・暮らしの道具 にもエアコンの電気代記事を 2 件足す（内容は正しい）。
  { name: 'MELOS',          url: 'https://melos.media/feed/' },

  // ── 記事量の底上げ（2026-08-02 追加） ────────────────────────────
  // これまでは「分野を埋める」ために足してきたが、今回は
  // **1 日あたりの記事量そのもの**を増やすために足す。
  //
  // 採否は 2 つの実測で決めた。
  //   ① 寄与率 = 取得した記事のうち、既存 16 テーマの根拠になった割合
  //      （hot >= 1 かつ 合計 >= 4 点。実際に評価に使われる基準そのもの）
  //   ② 件/日 = 返ってきた記事の日付から算出した実際の公開ペース
  //
  // 既存 24 フィードの寄与率は 全体 15% / 中央値 15% なので、
  // **20% 以上**を採用ラインにした。
  //
  //   ITmedia エンタープライズ  50件  3.2 件/日  寄与 14 件 (28%)
  //   Security NEXT          20件 12.9 件/日  寄与  6 件 (30%)
  //   Think IT               30件  0.9 件/日  寄与  9 件 (30%)
  //   ケータイ Watch           30件 19.6 件/日  寄与  7 件 (23%)
  //   ScanNetSecurity        50件 12.5 件/日  寄与 10 件 (20%)
  //   さくらのナレッジ          30件  0.2 件/日  寄与  6 件 (20%)
  //   クラウドWatch            15件 14.9 件/日  寄与  3 件 (20%)
  //   合計 225 件 / 64.2 件/日 / 寄与 55 件 (24%)
  //
  // 不採用（寄与率が既存中央値 15% 以下、または量が出ない）:
  //   ASCII.jp 7% / CNET Japan 3% / DevelopersIO 3% / はてブ世の中 3% /
  //   INTERNET Watch 0% / AV Watch 0% / PC Watch 10% /
  //   ITmedia NEWS 速報 16%（0.4 件/日で量にならない）
  //   InfoQ Japan・マイナビTECH+・ZDNET Japan は取得不可
  { name: 'ITmedia エンタープライズ', url: 'https://rss.itmedia.co.jp/rss/2.0/enterprise.xml' },
  { name: 'Security NEXT',   url: 'https://www.security-next.com/feed' },
  { name: 'Think IT',        url: 'https://thinkit.co.jp/rss.xml' },
  { name: 'ケータイWatch',     url: 'https://k-tai.watch.impress.co.jp/data/rss/1.0/ktw/feed.rdf' },
  { name: 'ScanNetSecurity', url: 'https://scan.netsecurity.ne.jp/rss/index.rdf' },
  { name: 'さくらのナレッジ',    url: 'https://knowledge.sakura.ad.jp/feed/' },
  { name: 'クラウドWatch',     url: 'https://cloud.watch.impress.co.jp/data/rss/1.0/clw/feed.rdf' },
];

/**
 * 保存する最大件数 (古いものから溢れる)。
 *
 * フィードを 4 本 → 13 本に増やした時点で 1000 では足りなくなった。
 * 実測: 1 回の取得で 100 件 → 245 件になり、重複除去後の 1 日あたり純増は
 * 約 70 件 → 約 170 件。1000 件のままだと保持できるのは 6 日弱で、
 * growth の判定窓（直近 2 日 vs その前 5 日 = 7 日）を割ってしまう。
 */
// 2026-08-02 に 3000 → 8000 へ引き上げた。
// 実測: 既存 94.9 件/日 + 追加 7 本 64.2 件/日 = 159.1 件/日。
// MAX_AGE_DAYS = 45 を保つには 159.1 × 45 = 7,160 件が要る。
// 1 件あたり 807 バイトなので 8000 件で raw 約 6.2MB / gzip 約 2MB。
// articles.json は日次コミットされるが、日々の差分は新規 160 件ぶんなので
// git の delta 圧縮が効く。ブラウザには配信されない（public/ にミラーしない）。
const MAX_ARTICLES = 8000;

/**
 * 保持する最大日数。件数上限とは別に、古い記事は日付で落とす。
 *
 * なぜ必要か:
 *   - freshness は 30 日で 0 に減衰するため、それより古い記事は
 *     newsVolume を押し上げるだけで freshness の平均を下げる（純粋なノイズ）
 *   - 件数上限だけだとフィードを増減させるたびに「何日ぶん残るか」が変わり、
 *     スコアの意味が静かにズレる。日数で切れば窓が固定される
 *   - articles.json は日次でコミットされるため、無制限に増やすとリポジトリが膨らむ
 *
 * 45 日 = freshness 窓 30 日 + 余裕 15 日。
 */
const MAX_AGE_DAYS = 45;

/** 1 フィードあたりの取得タイムアウト (ミリ秒) */
const FEED_TIMEOUT_MS = 15000;

// 出力先は PATHS 経由 (env で DATA_ROOT 上書き可)
const OUTPUT = PATHS.source.articles;

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
  const parsed = await storage.readJson(OUTPUT);
  if (parsed === null) return [];
  return Array.isArray(parsed) ? parsed : [];
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

  // MAX_AGE_DAYS より古い記事を落とす。
  // publishedAt が読めない記事は日付で判断できないため残し、件数上限に任せる。
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const all = Array.from(byUrl.values());
  const fresh = all.filter((a) => {
    if (!a.publishedAt) return true;
    const t = Date.parse(a.publishedAt);
    return Number.isNaN(t) ? true : t >= cutoff;
  });
  const dropped = all.length - fresh.length;

  // publishedAt の新しい順に並べ、上限で切る
  const merged = fresh
    .sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return tb - ta;
    })
    .slice(0, MAX_ARTICLES);

  // 書き込み (親ディレクトリが無ければ作る)
  await storage.writeJson(OUTPUT, merged);

  // サマリー表示
  console.log('\n──────────────  サマリー  ──────────────');
  for (const r of results) {
    const mark   = r.ok ? '✓' : '✗';
    const detail = r.ok ? `${r.count} 件取得` : `失敗 (${r.error})`;
    console.log(`  ${mark} ${r.feed.padEnd(8)} ${detail}`);
  }
  console.log('────────────────────────────────────────');
  console.log(`  今回追加:     ${added} 件`);
  console.log(`  期限切れ削除: ${dropped} 件 (${MAX_AGE_DAYS} 日より古い)`);
  console.log(`  保存後合計:   ${merged.length} 件`);
  console.log(`  出力ファイル: ${OUTPUT}`);

  // ── keep-alive ソケットを明示的に閉じる ──────────────────────────────
  // Node 19 以降、http(s).globalAgent は keepAlive: true が既定。
  // 一部の配信元は接続を長時間開いたままにするため、全ての取得が終わって
  // ファイルも書き終えた後もソケットが event loop を掴み続け、
  // プロセスが終了しない。
  //
  // 実測 (2026-08-02): 13 フィードの取得自体は 1.5 秒で終わるのに、
  // プロセスは 7 分以上残り続けた。残存ハンドルは TCPSocketWrap 1 個。
  // これを放置すると `npm run all` が news の後ろで止まり、
  // GitHub Actions の日次更新が丸ごと動かなくなる。
  //
  // process.exit() で強制終了するとパイプ経由の stdout が途中で切れるため、
  // アイドルソケットだけを閉じて event loop を自然に空にする。
  http.globalAgent.destroy();
  https.globalAgent.destroy();
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
