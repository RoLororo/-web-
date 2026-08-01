// ============================================================================
// scripts/append-history.mjs
//
// Demand Atlas — 需要データ履歴の追記・回転
//
//   ■ 目的
//     各ソース (Qiita / App Store / Wikipedia) が生成した data/*.json から、
//     時系列分析用の指標 (metrics + nativeMetrics) を抽出し、
//     history/current/{theme}.jsonl に日次で追記する。
//     90 日超過分は history/archive/{YYYY}/{theme}.jsonl へ move、
//     常に history/index.json を再生成する。
//
//   ■ データ整合性 (今回の重点)
//     - 同一日付重複防止: date キーで find→replace or append
//     - JSONL 整合性: 各行を再パース、壊れ行は警告してスキップ (書き込みは中断しない)
//     - Atomic write: .tmp → verify → rename でクラッシュ耐性
//     - Rotation 検証: 移動前後の行数一致を assert
//     - Archive dedup: 既存 date と衝突する行は追記しない
//     - index.json 全再生成: 常に current の実状態を反映
//
//   ■ このスクリプトが やらないこと
//     - derivedMetrics (percentile / z-score / burst) の計算 — 別フェーズ
//     - meta / errors / matchedApps / tagBreakdown の保存 — 冗長
//     - demands.json の変更 — 純粋な副作用
//
//   ■ 使い方
//     npm run history
//     (npm run all の末尾で自動実行される)
//
//   ■ 依存
//     - Node.js 18+ の標準機能のみ
// ============================================================================

import { basename } from 'node:path';
import { PATHS, CONFIG } from './lib/paths.mjs';
import { storage } from './lib/storage.mjs';

// ---------------------------------------------------------------------------
// パス (PATHS 経由、env で上書き可)
// ---------------------------------------------------------------------------

const DATA_QIITA     = PATHS.source.qiita;
const DATA_APPSTORE  = PATHS.source.appstore;
const DATA_WIKIPEDIA = PATHS.source.wikipedia;
const DATA_ARXIV     = PATHS.source.arxiv;
const DATA_GITHUB    = PATHS.source.github;
const DATA_NDL       = PATHS.source.ndl;
const DATA_DEMANDS   = PATHS.output.demands;

const HISTORY_DIR   = PATHS.history.root;
const CURRENT_DIR   = PATHS.history.current;
const ARCHIVE_DIR   = PATHS.history.archive;
const MANIFEST_PATH = PATHS.history.manifest;
const INDEX_PATH    = PATHS.history.index;

// public/history ミラーは prebuild hook (scripts/mirror-public.mjs) が生成。
// このスクリプトからは書き込まない。二重 git 追跡を避けるため public/history/
// は .gitignore 対象。

// ---------------------------------------------------------------------------
// 設定 (env で上書き可)
// ---------------------------------------------------------------------------

const RETENTION_DAYS   = CONFIG.retentionDays;
const SCHEMA_VERSION   = 1;
const ARCHIVE_STRATEGY = CONFIG.archiveStrategy;
const DAY_MS           = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function isoDayUTC(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function daysBefore(days, ref = new Date()) {
  return isoDayUTC(new Date(ref.getTime() - days * DAY_MS));
}

// tryReadJson / ensureDir / readJsonlSafe / writeJsonlAtomic は storage 経由に
// 集約 (scripts/lib/storage.mjs)。 fs 実装は現行と bit-identical。将来 turso/r2
// driver への切替時にここを触る必要はない。
const tryReadJson    = (path)         => storage.readJson(path);
const ensureDir      = (path)         => storage.ensureDir(path);
const readJsonlSafe  = (path)         => storage.readJsonl(path);
const writeJsonlAtomic = (path, recs) => storage.writeJsonl(path, recs);

function sortByDate(records) {
  return records.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---------------------------------------------------------------------------
// ソース別 extractor
//
//   history には metrics + nativeMetrics + envelopeVersion + complete + coverage
//   のみ保存。meta / errors / matchedApps / tagBreakdown 等は含めない
//   (冗長・肥大化の原因、derivedMetrics 計算にも不要)。
// ---------------------------------------------------------------------------

/**
 * 時系列指標として意味のない「参照リスト」フィールドを除外する。
 * これらは day-over-day でほぼ静的、かつサイズが大きい (JSONL 肥大化の原因):
 *   - matchedApps    (App Store: 各マッチアプリの詳細配列)
 *   - matchedItems   (将来ソース想定)
 *   - tagBreakdown   (仮に nativeMetrics に紛れ込んだ場合の保険)
 *
 * これらの情報が必要な場合は data/*.json の git 履歴を参照。
 */
const BULK_NATIVE_KEYS_TO_STRIP = new Set([
  'matchedApps',
  'matchedItems',
  'tagBreakdown',
]);

function stripBulkNativeKeys(nativeMetrics) {
  if (!nativeMetrics || typeof nativeMetrics !== 'object') return nativeMetrics;
  const out = {};
  for (const [k, v] of Object.entries(nativeMetrics)) {
    if (BULK_NATIVE_KEYS_TO_STRIP.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function extractCommonEnvelopeSource(env) {
  if (!env) return null;
  return {
    envelopeVersion: env.envelopeVersion || '1.0.0',
    complete:        env.complete,
    coverage:        env.coverage,
    metrics:         env.metrics || null,
    nativeMetrics:   env.nativeMetrics ? stripBulkNativeKeys(env.nativeMetrics) : null,
  };
}

/**
 * Wikipedia (legacy 独自形式) を history 用に best-effort マッピング。
 * envelopeVersion = "legacy-wiki-0" で明示的にレガシー扱い。
 * 将来 Wikipedia を共通エンベロープに移行したら "1.0.0" に統一する。
 */
function extractWikipedia(themeData) {
  if (!themeData) return null;
  // latestActivityAt: byDate の最新日付を使用
  let latestActivityAt = null;
  if (themeData.byDate && typeof themeData.byDate === 'object') {
    const dates = Object.keys(themeData.byDate).sort();
    if (dates.length > 0) latestActivityAt = dates[dates.length - 1];
  }
  return {
    envelopeVersion: 'legacy-wiki-0',
    metrics: {
      volume:           themeData.totalPageviews30d ?? null,
      engagement:       null,
      contributors:     null,
      latestActivityAt,
    },
    nativeMetrics: {
      totalPageviews30d:     themeData.totalPageviews30d ?? null,
      totalPageviews7d:      themeData.totalPageviews7d ?? null,
      totalPageviewsPrior7d: themeData.totalPageviewsPrior7d ?? null,
      growthPercent:         themeData.growthPercent ?? null,
    },
  };
}

// public/history/ ミラーは scripts/mirror-public.mjs が生成する。
// このスクリプト (append-history.mjs) は canonical だけを扱う。

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — 履歴保存 (append-history)');
  console.log(`   history dir: ${HISTORY_DIR}`);

  await ensureDir(HISTORY_DIR);
  await ensureDir(CURRENT_DIR);

  // manifest.json の初期化 or 読み込み
  let manifest = await tryReadJson(MANIFEST_PATH);
  if (!manifest) {
    manifest = {
      schemaVersion:   SCHEMA_VERSION,
      retentionDays:   RETENTION_DAYS,
      archiveStrategy: ARCHIVE_STRATEGY,
      createdAt:       new Date().toISOString(),
      lastRunAt:       null,
      lastRotationAt:  null,
    };
    console.log('   manifest.json を新規作成');
  }

  const today       = isoDayUTC();
  const generatedAt = new Date().toISOString();
  console.log(`   today (UTC): ${today}`);

  // ソースデータ読み込み
  const [qiitaData, appstoreData, wikiData, arxivData, githubData, ndlData, demandsData] = await Promise.all([
    tryReadJson(DATA_QIITA),
    tryReadJson(DATA_APPSTORE),
    tryReadJson(DATA_WIKIPEDIA),
    tryReadJson(DATA_ARXIV),
    tryReadJson(DATA_GITHUB),
    tryReadJson(DATA_NDL),
    tryReadJson(DATA_DEMANDS),
  ]);

  const qiitaThemes    = (qiitaData    && qiitaData.themes)    || {};
  const appstoreThemes = (appstoreData && appstoreData.themes) || {};
  const wikiThemes     = (wikiData     && wikiData.themes)     || {};
  const arxivThemes    = (arxivData    && arxivData.themes)    || {};
  const githubThemes   = (githubData   && githubData.themes)   || {};
  const ndlThemes      = (ndlData      && ndlData.themes)      || {};

  // テーマ表示名/カテゴリを demands.json から補完
  const themeMeta = {};
  if (demandsData && Array.isArray(demandsData.demands)) {
    for (const d of demandsData.demands) {
      themeMeta[d.id] = { name: d.title, category: d.category };
    }
  }

  // 導出値（score / 判定 / 内訳 / 評価）のその日の値。
  //
  // ここまで履歴は生の観測値 55 項目だけを記録していて、パイプラインが
  // 計算した値は 1 つも残していなかった（2026-08-01 実測）。
  // 生の値は残っているので後から再計算できそうに見えるが、実際にはできない。
  // スコアは「その日の全テーマの中央値」など横断の統計に依存していて、
  // 計算式や正規化を変えた瞬間に過去の値は再現できなくなる。
  // **その日に出した数字は、その日に残さないと永久に失われる。**
  //
  // これが無いと作れないもの:
  //   需要スコアの推移 / ランキング履歴（いつ何位だったか）/ 判定の遷移
  //   （いつ拡大局面に入ったか）/ スコア込みの CSV 出力
  // いずれも Premium の中心になる機能。
  const derivedOf = (id) => {
    const d = (demandsData?.demands || []).find((x) => x.id === id);
    if (!d) return null;
    const b = d._scoreBreakdown || {};
    const i = d._insights || {};
    const out = {
      score: d.score ?? null,
      rank: null, // 下で全テーマを並べてから入れる
      change: d.change ?? null,
      status: d.status ?? null,
      confidence: d.confidence ?? null,
      sourceCount: d.sourceCount ?? null,
      matchedArticles: d._matchingArticleCount ?? null,
      dataQuality: d._dataQuality ?? null,
      breakdown: {
        newsVolume: b.newsVolume ?? null,
        growth: b.growth ?? null,
        sourceDiversity: b.sourceDiversity ?? null,
        freshness: b.freshness ?? null,
      },
      verdict: i.verdict?.label ?? null,
      momentum: i.momentum?.score ?? null,
      beginnerFriendliness: i.beginnerFriendliness?.score ?? null,
      competition: i.competition?.score ?? null,
    };
    return out;
  };

  // 順位はスコアの降順。同点は id で決めて、日によって揺れないようにする
  const rankOf = {};
  [...(demandsData?.demands || [])]
    .filter((d) => typeof d.score === 'number')
    .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)))
    .forEach((d, i) => { rankOf[d.id] = i + 1; });

  // 全ソースに登場するテーマ ID の union
  const allThemeIds = new Set([
    ...Object.keys(qiitaThemes),
    ...Object.keys(appstoreThemes),
    ...Object.keys(wikiThemes),
    ...Object.keys(arxivThemes),
    ...Object.keys(githubThemes),
    ...Object.keys(ndlThemes),
  ]);

  console.log(
    `   sources: qiita(${Object.keys(qiitaThemes).length}) ` +
    `appstore(${Object.keys(appstoreThemes).length}) ` +
    `wikipedia(${Object.keys(wikiThemes).length}) ` +
    `arxiv(${Object.keys(arxivThemes).length}) ` +
    `github(${Object.keys(githubThemes).length}) ` +
    `ndl(${Object.keys(ndlThemes).length})`
  );
  console.log(`   union テーマ数: ${allThemeIds.size}`);
  console.log('');

  // ─── Step 1: current/{theme}.jsonl に今日のレコードを追記 or 置換 ───

  let updatedThemes    = 0;
  let appendedRows     = 0;
  let replacedRows     = 0;
  let totalReadSkipped = 0;

  for (const themeId of allThemeIds) {
    const sources = {};
    const q = extractCommonEnvelopeSource(qiitaThemes[themeId]);
    const a = extractCommonEnvelopeSource(appstoreThemes[themeId]);
    const w = extractWikipedia(wikiThemes[themeId]);
    const x = extractCommonEnvelopeSource(arxivThemes[themeId]);
    const g = extractCommonEnvelopeSource(githubThemes[themeId]);
    const n = extractCommonEnvelopeSource(ndlThemes[themeId]);
    if (q) sources.qiita     = q;
    if (a) sources.appstore  = a;
    if (w) sources.wikipedia = w;
    if (x) sources.arxiv     = x;
    if (g) sources.github    = g;
    if (n) sources.ndl       = n;
    if (Object.keys(sources).length === 0) continue;

    // derived は sources と並べて別枝に置く。既存の読み手（historyService /
    // Rankings / Timeline / Changes）は sources しか見ていないので影響しない。
    const derived = derivedOf(themeId);
    if (derived) derived.rank = rankOf[themeId] ?? null;

    const todayRecord = derived
      ? { date: today, generatedAt, sources, derived }
      : { date: today, generatedAt, sources };
    const currentPath = PATHS.history.currentTheme(themeId);
    const { records, skipped } = await readJsonlSafe(currentPath);
    totalReadSkipped += skipped;

    // 同一日付検出: 見つかれば replace (最新スナップショット)、なければ append
    const idx = records.findIndex((r) => r.date === today);
    if (idx >= 0) {
      records[idx] = todayRecord;
      replacedRows++;
    } else {
      records.push(todayRecord);
      appendedRows++;
    }

    await writeJsonlAtomic(currentPath, sortByDate(records));
    updatedThemes++;
  }

  console.log(
    `  📝 追記/更新: ${updatedThemes} テーマ ` +
    `(append=${appendedRows}, replace=${replacedRows}, corrupt-skip=${totalReadSkipped})`
  );

  // ─── Step 2: current → archive rotation ───

  const cutoff = daysBefore(RETENTION_DAYS);
  let rotationOccurred    = false;
  let totalMoved          = 0;
  let totalArchiveWritten = 0;

  const currentFiles = await storage.listFiles(CURRENT_DIR, { ext: '.jsonl' });

  for (const filename of currentFiles) {
    const themeIdForFile = filename.replace(/\.jsonl$/, '');
    const currentPath = PATHS.history.currentTheme(themeIdForFile);
    const { records } = await readJsonlSafe(currentPath);
    if (records.length === 0) continue;

    const keep = records.filter((r) => r.date >= cutoff);
    const move = records.filter((r) => r.date <  cutoff);

    // 整合性: kept + moved == original
    if (keep.length + move.length !== records.length) {
      throw new Error(`${filename}: rotation の行数計算に矛盾`);
    }
    if (move.length === 0) continue;

    rotationOccurred = true;

    // 年別に group by
    const byYear = new Map();
    for (const rec of move) {
      const year = rec.date.slice(0, 4);
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(rec);
    }

    for (const [year, recs] of byYear) {
      const archivePath = PATHS.history.archiveTheme(year, themeIdForFile);
      const { records: existingArchive } = await readJsonlSafe(archivePath);
      const existingDates = new Set(existingArchive.map((r) => r.date));

      // Archive dedup: 既存 date と衝突する行は追記しない (冪等性)
      const newRecs = recs.filter((r) => !existingDates.has(r.date));
      const merged = sortByDate([...existingArchive, ...newRecs]);
      await writeJsonlAtomic(archivePath, merged);

      // 検証: 追記後に再読み込みして期待件数と一致するか
      const { records: verify } = await readJsonlSafe(archivePath);
      if (verify.length !== merged.length) {
        throw new Error(`archive/${year}/${filename}: 書き込み後の verify 失敗`);
      }

      totalArchiveWritten += newRecs.length;
    }

    totalMoved += move.length;
    await writeJsonlAtomic(currentPath, sortByDate(keep));

    // 検証: current 側も rotation 後の件数が一致するか
    const { records: rereadKeep } = await readJsonlSafe(currentPath);
    if (rereadKeep.length !== keep.length) {
      throw new Error(`${filename}: rotation 後の current 検証失敗`);
    }
  }

  console.log(
    `  🔄 rotate: 移動=${totalMoved} 行, archive 追記=${totalArchiveWritten} 行 ` +
    `(cutoff ${cutoff})`
  );

  // ─── Step 3: index.json 全再生成 ───

  const themes = [];
  const sourcesSeen = new Map();

  const currentFiles2 = await storage.listFiles(CURRENT_DIR, { ext: '.jsonl' });

  for (const filename of currentFiles2) {
    const themeId = filename.replace(/\.jsonl$/, '');
    const currentPath = PATHS.history.currentTheme(themeId);
    const { records } = await readJsonlSafe(currentPath);
    if (records.length === 0) continue;

    const dates = records.map((r) => r.date).sort();
    const firstDate = dates[0];
    const lastDate  = dates[dates.length - 1];

    // このテーマの archive パスを列挙 (public URL パスは canonical のまま維持)
    const archivePaths = [];
    const years = (await storage.listFiles(ARCHIVE_DIR)).sort();
    for (const y of years) {
      if (await storage.fileExists(PATHS.history.archiveTheme(y, themeId))) {
        archivePaths.push(`history/archive/${y}/${filename}`);
      }
    }

    themes.push({
      id:           themeId,
      name:         themeMeta[themeId]?.name || null,
      category:     themeMeta[themeId]?.category || null,
      currentPath:  `history/current/${filename}`,
      archivePaths,
      recordCount:  records.length,
      firstDate,
      lastDate,
    });

    // ソースカタログ更新 (metricsKeys / nativeMetricsKeys の union)
    for (const rec of records) {
      for (const [srcId, srcData] of Object.entries(rec.sources || {})) {
        if (!sourcesSeen.has(srcId)) {
          sourcesSeen.set(srcId, {
            id:                srcId,
            envelopeVersion:   srcData.envelopeVersion || null,
            metricsKeys:       srcData.metrics       ? Object.keys(srcData.metrics)       : [],
            nativeMetricsKeys: srcData.nativeMetrics ? Object.keys(srcData.nativeMetrics) : [],
            firstSeenDate:     rec.date,
          });
        } else {
          const s = sourcesSeen.get(srcId);
          if (rec.date < s.firstSeenDate) s.firstSeenDate = rec.date;
          if (srcData.metrics) {
            s.metricsKeys = [...new Set([...s.metricsKeys, ...Object.keys(srcData.metrics)])];
          }
          if (srcData.nativeMetrics) {
            s.nativeMetricsKeys = [...new Set([...s.nativeMetricsKeys, ...Object.keys(srcData.nativeMetrics)])];
          }
          if (srcData.envelopeVersion) s.envelopeVersion = srcData.envelopeVersion;
        }
      }
    }
  }

  themes.sort((a, b) => a.id.localeCompare(b.id));
  const sources = [...sourcesSeen.values()].sort((a, b) => a.id.localeCompare(b.id));

  const index = {
    generatedAt,
    schemaVersion: SCHEMA_VERSION,
    themes,
    sources,
  };
  await storage.writeJson(INDEX_PATH, index);

  // ─── Step 4: manifest.json 更新 ───

  manifest.lastRunAt = generatedAt;
  if (rotationOccurred) manifest.lastRotationAt = generatedAt;
  await storage.writeJson(MANIFEST_PATH, manifest);

  // public/history/ ミラーは "npm run mirror" (scripts/mirror-public.mjs) が
  // 生成する。 append-history 自体は canonical だけを扱う。

  // ─── サマリー ───

  console.log('');
  console.log('──────────────  サマリー  ──────────────');
  console.log(`  更新テーマ:            ${updatedThemes}`);
  console.log(`  append / replace:      ${appendedRows} / ${replacedRows}`);
  console.log(`  スキップした壊れ行:    ${totalReadSkipped}`);
  console.log(`  archive 移動:          ${totalMoved} 行 (writeあり=${totalArchiveWritten})`);
  console.log(`  index.json テーマ:     ${themes.length}`);
  console.log(`  index.json ソース:     ${sources.length} (${sources.map((s) => s.id).join(', ')})`);
  console.log(`  出力:                  ${HISTORY_DIR}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
