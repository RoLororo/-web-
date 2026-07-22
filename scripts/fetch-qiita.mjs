// ============================================================================
// scripts/fetch-qiita.mjs
//
// Demand Atlas — Qiita 記事メタデータ取得 (実験フェーズ / データ収集のみ)
//
//   ■ 目的
//     Qiita API v2 から、config/qiita-mapping.json に定義された各テーマの
//     タグごとに、直近 30 日の記事メタデータを取得。テーマ単位で重複排除して
//     data/qiita.json に保存する。
//
//   ■ このスクリプトが やること
//     - config/qiita-mapping.json を読み込む
//     - テーマ内の各タグについて、全ページを取得 (per_page=100)
//     - item.id で重複排除してテーマ単位に集約
//     - 共通エンベロープ (source / metrics / rawMetrics / meta) で保存
//     - Rate-Remaining ヘッダを常時監視し、5 未満なら以降のタグを skip
//     - 429 受信時は 60 秒待って 1 回だけリトライ
//     - タグ単位の失敗は errors[] に記録して継続
//
//   ■ このスクリプトが やらないこと (今回スコープ外)
//     - 需要スコアへの反映 (build-demands.mjs 側で内部フィールドを付与するだけ、
//       score / breakdown / status / 順序には影響しない)
//     - UI 表示 (フロントエンド無変更)
//     - 記事本文の保存 (指標のみ扱う。Qiita ToS 上の再配布懸念を回避)
//     - Qiita 認証 (無認証 60 req/hr で十分足りるため、トークン管理を避ける)
//
//   ■ 使い方
//     npm run qiita
//
//   ■ 依存
//     - Node.js 18+ の標準 fetch のみ (追加パッケージなし)
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, classifyFetchError, fetchWithRetry } from './lib/fetch-common.mjs';

// ---------------------------------------------------------------------------
// 設定 (Qiita 固有のみ。共通の USER_AGENT / タイムアウト / リトライ待機は
// scripts/lib/fetch-common.mjs のデフォルトを使用)
// ---------------------------------------------------------------------------

/** リクエスト間の待機時間 (rate limit 保護、Qiita 固有) */
const RATE_LIMIT_MS = 800;

/** Rate-Remaining がこの値未満になったら以降のタグを skip (Qiita 固有) */
const RATE_SAFETY_THRESHOLD = 5;

/** per_page の最大値 (Qiita API v2 仕様上限) */
const PER_PAGE = 100;

/** page の最大値 (Qiita API v2 仕様上限) — 実質 10,000 件までしか辿れない */
const MAX_PAGE = 100;

/** Qiita API のベース URL */
const QIITA_API_BASE = 'https://qiita.com/api/v2/items';

// ---------------------------------------------------------------------------
// パス
// ---------------------------------------------------------------------------

const __dirname   = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT   = resolve(__dirname, '..');
const MAPPING     = resolve(REPO_ROOT, 'config', 'qiita-mapping.json');
const OUTPUT      = resolve(REPO_ROOT, 'data',   'qiita.json');

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

/** now から N 日前の YYYY-MM-DD (UTC) */
function cutoffDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return isoDay(d);
}

/**
 * 構造化エラーオブジェクトを生成する。
 * すべての failure/skip はこの形式で errors[] に記録する。
 * 4 番目のフィールド名 (tag) はソース固有のため、共通 lib には抽出せず
 * ローカル定義で保持する (App Store の chart / arXiv の theme とは名前が違う)。
 *
 *   type       ... 分類 (rate-limit / rate-limit-429 / http-error / timeout / network / parse)
 *   message    ... 人間可読な理由
 *   retryable  ... 時間経過や再試行で成功する見込みがあるか
 *   tag        ... どのタグで発生したか
 */
function makeError(type, message, retryable, tag) {
  return { type, message, retryable, tag };
}

// ---------------------------------------------------------------------------
// フェッチ (1 タグの 1 ページ)
// ---------------------------------------------------------------------------

/**
 * 1 リクエストを実行。ステータス/ヘッダ/body(パース済) を返す。
 * HTTP レイヤーは lib/fetch-common の fetchWithRetry (タイムアウト + 429
 * リトライ + 非 OK throw) に委譲。Qiita 固有のヘッダ (Total-Count,
 * Rate-Remaining) パースだけここで行う。
 */
async function fetchPage(url) {
  const res = await fetchWithRetry(url, { accept: 'application/json' });

  const totalCount   = Number(res.headers.get('total-count')    || '0');
  const rateRemaining = Number(res.headers.get('rate-remaining') || '0');
  const rateLimit    = Number(res.headers.get('rate-limit')     || '0');
  const items        = await res.json();

  return { items: Array.isArray(items) ? items : [], totalCount, rateRemaining, rateLimit };
}

/**
 * 1 タグの全ページを取得。100 件未満が返ったら終了、
 * MAX_PAGE を超えたら諦める。
 * Rate-Remaining が RATE_SAFETY_THRESHOLD 未満に落ちたら中断。
 */
async function fetchAllForTag(tag, cutoff, rateGuard) {
  const q = encodeURIComponent(`tag:${tag} created:>${cutoff}`);
  const all = [];
  let totalCount = 0;
  let requestCount = 0;
  let stoppedBy = null; // 'done' | 'rate-limit' | 'max-page'

  for (let page = 1; page <= MAX_PAGE; page++) {
    const url = `${QIITA_API_BASE}?query=${q}&per_page=${PER_PAGE}&page=${page}`;

    const { items, totalCount: tc, rateRemaining } = await fetchPage(url);
    requestCount++;
    rateGuard.lastRemaining = rateRemaining;
    if (page === 1) totalCount = tc;
    for (const it of items) all.push(it);

    if (rateRemaining < RATE_SAFETY_THRESHOLD) {
      stoppedBy = 'rate-limit';
      break;
    }
    if (items.length < PER_PAGE) {
      stoppedBy = 'done';
      break;
    }
    if (page === MAX_PAGE) {
      stoppedBy = 'max-page';
      break;
    }
    await sleep(RATE_LIMIT_MS);
  }

  return { items: all, totalCount, requestCount, stoppedBy };
}

// ---------------------------------------------------------------------------
// テーマ集約 (タグ間の重複を item.id で排除)
// ---------------------------------------------------------------------------

/**
 * テーマにマップされた全タグから記事を集め、item.id で重複排除して
 * 指標を計算する。
 */
async function processTheme(themeId, tags, cutoff, rateGuard) {
  const themeRequestCount = { n: 0 };
  const themeErrors = [];
  const tagBreakdown = [];
  const uniqueItems = new Map(); // item.id -> item

  for (const tag of tags) {
    if (rateGuard.lastRemaining <= RATE_SAFETY_THRESHOLD) {
      themeErrors.push(makeError(
        'rate-limit',
        `skipped (rate-remaining=${rateGuard.lastRemaining} <= ${RATE_SAFETY_THRESHOLD})`,
        true,
        tag,
      ));
      tagBreakdown.push({ tag, totalCount: null, fetched: 0, pages: 0, stoppedBy: 'rate-limit-skip' });
      continue;
    }

    try {
      const { items, totalCount, requestCount, stoppedBy } =
        await fetchAllForTag(tag, cutoff, rateGuard);
      themeRequestCount.n += requestCount;

      for (const it of items) {
        if (it && it.id && !uniqueItems.has(it.id)) uniqueItems.set(it.id, it);
      }

      tagBreakdown.push({
        tag,
        totalCount,
        fetched: items.length,
        pages: requestCount,
        stoppedBy,
      });
    } catch (err) {
      const { type, retryable } = classifyFetchError(err);
      const message = err && err.message ? err.message : String(err);
      themeErrors.push(makeError(type, message, retryable, tag));
      tagBreakdown.push({ tag, totalCount: null, fetched: 0, pages: 0, stoppedBy: 'error' });
    }

    await sleep(RATE_LIMIT_MS);
  }

  // 集計
  const items = [...uniqueItems.values()];
  const articleCount = items.length;
  const lgtmSum      = items.reduce((s, it) => s + (Number(it.likes_count) || 0), 0);
  const authorSet    = new Set(items.map((it) => it.user && it.user.id).filter(Boolean));
  const uniqueAuthors = authorSet.size;

  let latestPublishedAt = null;
  for (const it of items) {
    if (!it.created_at) continue;
    if (!latestPublishedAt || it.created_at > latestPublishedAt) {
      latestPublishedAt = it.created_at;
    }
  }

  return {
    themeId,
    tags,
    tagBreakdown,
    requestCount: themeRequestCount.n,
    errors: themeErrors,
    // 共通エンベロープ用の集計値
    articleCount,
    lgtmSum,
    uniqueAuthors,
    latestPublishedAt,
  };
}

// ---------------------------------------------------------------------------
// 共通エンベロープ生成
// ---------------------------------------------------------------------------

/**
 * テーマ単位のカバレッジと完了フラグを算出する。
 *
 *   coverage: 期待されたアイテムのうち何割を実際に取得できたか。
 *             totalCount が判明したタグ (=1 ページ目に到達できたタグ) の
 *             合計に対する取得件数の比。
 *             = sum(fetched) / sum(totalCount) across tags where totalCount is known
 *             ・全タグ done かつ全件取得: 1.0
 *             ・一部 rate-limit で途中終了: <1.0
 *             ・全タグ 1 ページ目すら失敗: null (計算不能、denominator ゼロ)
 *
 *   complete: すべてのタグが最後まで完了したか (errors 無し + 全 stoppedBy が 'done')。
 *             coverage が 1.0 でも、tagBreakdown に max-page 到達があれば complete=false。
 */
function computeCoverageAndComplete(tagBreakdown, errors) {
  let expected = 0;
  let fetched  = 0;
  let hasKnownTotal = false;
  for (const tb of tagBreakdown) {
    if (tb.totalCount !== null && tb.totalCount !== undefined) {
      hasKnownTotal = true;
      expected += tb.totalCount;
      fetched  += tb.fetched;
    }
  }
  const coverage = hasKnownTotal && expected > 0
    ? Math.round(Math.min(1, fetched / expected) * 10000) / 10000
    : (hasKnownTotal ? 1 : null); // totalCount=0 が全部なら「完全カバー(取るもの無し)」

  const allTagsDone = tagBreakdown.every((tb) => tb.stoppedBy === 'done');
  const complete = errors.length === 0 && allTagsDone;

  return { coverage, complete };
}

/**
 * テーマ単位の集計結果を「共通エンベロープ」に整形する。
 *
 *   共通トップレベル (全ソース共通):
 *     source       ... ソース識別子
 *     windowDays   ... 取得窓 (日数)
 *     fetchedAt    ... 取得時刻 (ISO)
 *     requestCount ... 実 API 呼び出し回数
 *     complete     ... 完全取得できたか (true=全タグ done、false=途中終了 or エラーあり)
 *     coverage     ... 取得率 0..1 (期待件数のうち何割取れたか、計算不能なら null)
 *     errors       ... 構造化エラー配列 [{type,message,retryable,tag}]
 *
 *   metrics       ... 全ソース共通の意味的スロット (将来のスコア統合フェーズで使う)
 *                       volume           : 数量 (どれだけ発信/観測されたか)
 *                       engagement       : 反応 (他者からのリアクション量、無い場合 null)
 *                       contributors     : 参加者数 (ユニークな行為者、無い場合 null)
 *                       latestActivityAt : 最新活動時刻 (ISO)
 *
 *   nativeMetrics ... ソースネイティブの語彙で表現した指標 (監査・再計算用)
 *                     metrics と意味的に対比: 共通語彙 vs ソース固有語彙
 *
 *   meta          ... ソース固有のコンテキスト (どんな検索条件でこの数値を得たか)
 *
 * この構造は将来 Hacker News / arXiv / Reddit / GitHub 等でも同じ形で使う。
 * metrics のキー名は変えず、値の意味だけ各ソースで適切にマッピングする。
 * (詳細な metrics スロットの定義は config/README.md を参照)
 */
function toEnvelope(themeResult, fetchedAt, windowDays) {
  const { coverage, complete } =
    computeCoverageAndComplete(themeResult.tagBreakdown, themeResult.errors);

  return {
    envelopeVersion: '1.0.0',
    source:       'qiita',
    windowDays,
    fetchedAt,
    requestCount: themeResult.requestCount,
    complete,
    coverage,
    errors:       themeResult.errors,
    metrics: {
      volume:           themeResult.articleCount,
      engagement:       themeResult.lgtmSum,
      contributors:     themeResult.uniqueAuthors,
      latestActivityAt: themeResult.latestPublishedAt,
    },
    nativeMetrics: {
      articleCount:      themeResult.articleCount,
      lgtmSum:           themeResult.lgtmSum,
      uniqueAuthors:     themeResult.uniqueAuthors,
      latestPublishedAt: themeResult.latestPublishedAt,
    },
    meta: {
      tags:         themeResult.tags,
      tagBreakdown: themeResult.tagBreakdown,
    },
  };
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — Qiita 記事メタデータ取得 (実験)');
  console.log(`   マッピング: ${MAPPING}`);
  console.log(`   出力:       ${OUTPUT}`);

  // マッピング読み込み
  const raw = await readFile(MAPPING, 'utf8');
  const cfg = JSON.parse(raw);
  const mapping = cfg.mapping || {};
  const windowDays = Number(cfg.windowDays) || 30;
  const cutoff = cutoffDate(windowDays);

  console.log(`   期間:       過去 ${windowDays} 日 (created:>${cutoff})`);
  console.log(`   対象テーマ: ${Object.keys(mapping).length} 件`);
  console.log('');

  const fetchedAt = new Date().toISOString();
  const themes = {};
  const themesSkipped = [];
  const errorsAll = [];
  let successThemeCount = 0;
  let totalRequestCount = 0;
  const rateGuard = { lastRemaining: 60 };

  const themeIds = Object.keys(mapping);
  for (let i = 0; i < themeIds.length; i++) {
    const themeId = themeIds[i];
    const tags = mapping[themeId] || [];
    const label = `  [${i + 1}/${themeIds.length}] ${themeId.padEnd(24)}`;

    if (tags.length === 0) {
      console.log(`${label}  - (マッピング空、Qiita 非対応テーマとして skip)`);
      themesSkipped.push(themeId);
      continue;
    }

    process.stdout.write(label);
    const result = await processTheme(themeId, tags, cutoff, rateGuard);
    totalRequestCount += result.requestCount;

    if (result.articleCount === 0 && result.errors.length === tags.length) {
      console.log(`  ✗ 全タグ失敗 (${tags.join(', ')})`);
      errorsAll.push(...result.errors.map((e) => ({ theme: themeId, ...e })));
      continue;
    }

    successThemeCount++;
    const envelope = toEnvelope(result, fetchedAt, windowDays);
    themes[themeId] = envelope;
    if (result.errors.length > 0) {
      errorsAll.push(...result.errors.map((e) => ({ theme: themeId, ...e })));
    }
    const cov = envelope.coverage === null ? '-'
      : (envelope.coverage * 100).toFixed(1) + '%';
    const done = envelope.complete ? 'complete' : 'partial ';
    console.log(
      `  ✓ ${result.articleCount.toString().padStart(4)} 記事, ` +
      `LGTM=${result.lgtmSum.toString().padStart(5)}, ` +
      `著者=${result.uniqueAuthors.toString().padStart(3)}, ` +
      `req=${result.requestCount.toString().padStart(2)}, ` +
      `cov=${cov.padStart(6)}, ${done}, remain=${rateGuard.lastRemaining}`
    );
  }

  const output = {
    generatedAt:       fetchedAt,
    source:            'qiita',
    method:            'qiita-api-v2 (unauth, per_page=100, dedup by item.id)',
    windowDays,
    cutoffDate:        cutoff,
    mappedThemeCount:  themeIds.length,
    successCount:      successThemeCount,
    skippedCount:      themesSkipped.length,
    errorCount:        errorsAll.length,
    totalRequestCount,
    rateRemainingAtEnd: rateGuard.lastRemaining,
    themesSkipped,
    themes,
    errors:            errorsAll,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log('');
  console.log('──────────────  サマリー  ──────────────');
  console.log(`  マップ済みテーマ:      ${themeIds.length}`);
  console.log(`  取得成功:              ${successThemeCount}`);
  console.log(`  マッピング空で skip:   ${themesSkipped.length}  (${themesSkipped.join(', ')})`);
  console.log(`  タグ失敗:              ${errorsAll.length}`);
  console.log(`  総リクエスト数:        ${totalRequestCount}`);
  console.log(`  Rate-Remaining 終端:  ${rateGuard.lastRemaining}`);
  if (errorsAll.length > 0) {
    console.log('  失敗タグ:');
    for (const e of errorsAll) {
      const retry = e.retryable ? 'retryable' : 'fatal';
      console.log(`    - [${e.theme}] ${e.tag} (${e.type}, ${retry}): ${e.message}`);
    }
  }
  console.log(`  出力: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
