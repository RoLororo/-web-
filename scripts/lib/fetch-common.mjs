// ============================================================================
// scripts/lib/fetch-common.mjs
//
// Demand Atlas — fetch 系スクリプト共通ユーティリティ
//
//   ■ 目的
//     fetch-qiita / fetch-appstore / fetch-arxiv 等で重複していた
//     ボイラープレート (sleep, USER_AGENT, タイムアウト, 429 リトライ,
//     エラー分類) を集約する。
//
//   ■ このファイルが やること
//     - sleep / USER_AGENT / 各種タイムアウト定数を提供
//     - classifyFetchError(err) でエラーを構造化タイプに分類
//     - fetchWithRetry(url, opts) で AbortController + 429 リトライ + 非 OK
//       throw をまとめて提供
//
//   ■ このファイルが やらないこと (責務分離)
//     - 各ソース固有のパース (JSON/Atom/RSS 別)
//     - 各ソース固有の makeError (error 内の追加フィールド名がソースごとに
//       違う: tag / chart / theme。呼び出し側で thin wrapper を持つ)
//     - source registry / plugin 機構 (Phase X-2 で検討、今回スコープ外)
//     - 共通エンベロープ生成 (envelope 内容がソースで大きく異なる)
//
//   ■ 互換性ポリシー
//     このモジュールへの変更は fetch スクリプトの出力を変えてはならない。
//     出力形式の互換性は fetch スクリプト側で担保する。
//     ここは「HTTP レイヤーの共通化」のみ。
//
//   ■ 依存
//     Node.js 18+ 標準 fetch のみ
// ============================================================================

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * Demand Atlas 全 fetch 共通の User-Agent。
 * 各 API 提供元への礼儀 + トラブル時の連絡経路。変更は全ソースに影響する
 * ため慎重に。
 */
export const USER_AGENT =
  'DemandAtlas/0.1 (+https://demand-atlas.vercel.app; research/personal-use)';

/** 1 リクエストのデフォルトタイムアウト (ms) */
export const DEFAULT_TIMEOUT_MS = 20000;

/** 429 受信時のデフォルトリトライ待機 (ms) */
export const DEFAULT_RETRY_AFTER_MS = 60_000;

// ---------------------------------------------------------------------------
// 汎用ユーティリティ
// ---------------------------------------------------------------------------

/** Promise ベースの sleep。await sleep(1000) で 1 秒待機。 */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// エラー分類
// ---------------------------------------------------------------------------

/**
 * fetch 系例外を構造化タイプへ分類する。
 * 戻り値の retryable は「時間経過 or 再試行で成功見込みがあるか」を示し、
 * 運用監視・自動リトライ判定に使う。
 *
 * type 一覧:
 *   - timeout         : AbortController によるタイムアウト
 *   - network         : DNS / TCP 接続失敗 (ENOTFOUND / ECONNRESET 等)
 *   - parse           : レスポンスのパース失敗 (JSON / XML)
 *   - rate-limit-429  : HTTP 429、時間経過で解消見込み
 *   - http-error      : 200/429 以外の HTTP エラー。5xx は retryable=true、
 *                       4xx は retryable=false
 */
export function classifyFetchError(err) {
  if (err && err.name === 'AbortError') {
    return { type: 'timeout',  retryable: true };
  }
  if (err && (err.code === 'ENOTFOUND' || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED')) {
    return { type: 'network',  retryable: true };
  }
  if (err instanceof SyntaxError) {
    return { type: 'parse',    retryable: false };
  }
  const msg = err && err.message ? err.message : String(err);
  const m = /^HTTP (\d+)/.exec(msg);
  if (m) {
    const status = Number(m[1]);
    if (status === 429)  return { type: 'rate-limit-429', retryable: true };
    if (status >= 500)   return { type: 'http-error',     retryable: true };
    return { type: 'http-error', retryable: false };
  }
  return { type: 'http-error', retryable: false };
}

// ---------------------------------------------------------------------------
// fetch wrapper
// ---------------------------------------------------------------------------

/**
 * 標準的な fetch ラッパー。
 *   - AbortController によるタイムアウト
 *   - 429 受信時に 1 回だけ待機してリトライ
 *   - 200/429 以外は `HTTP {status} {statusText}` を throw
 *     (classifyFetchError と一貫、"HTTP 500 ..." のような文字列)
 *   - Response オブジェクトを返す (caller が .json() / .text() を選択)
 *
 * オプション:
 *   timeout            (ms)     デフォルト 20000
 *   accept             (string) デフォルト 'application/json'
 *   userAgent          (string) デフォルト USER_AGENT
 *   retryOn429AfterMs  (ms)     デフォルト 60000
 *   redirect           (string) デフォルト 'follow'
 *
 * 内部:
 *   _retriedOnce       (bool)   再帰呼び出しの重複リトライ防止フラグ
 */
export async function fetchWithRetry(url, {
  timeout           = DEFAULT_TIMEOUT_MS,
  accept            = 'application/json',
  userAgent         = USER_AGENT,
  retryOn429AfterMs = DEFAULT_RETRY_AFTER_MS,
  redirect          = 'follow',
  _retriedOnce      = false,
} = {}) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept:       accept,
      },
      signal:   ctrl.signal,
      redirect,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429 && !_retriedOnce) {
    console.log(`      ! 429 受信、${retryOn429AfterMs / 1000}s 待機してリトライ`);
    await sleep(retryOn429AfterMs);
    return fetchWithRetry(url, {
      timeout, accept, userAgent, retryOn429AfterMs, redirect,
      _retriedOnce: true,
    });
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return res;
}
