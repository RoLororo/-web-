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

import { mkdir, readFile, writeFile, rename, readdir, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// パス
// ---------------------------------------------------------------------------

const DATA_QIITA     = resolve(REPO_ROOT, 'data', 'qiita.json');
const DATA_APPSTORE  = resolve(REPO_ROOT, 'data', 'appstore.json');
const DATA_WIKIPEDIA = resolve(REPO_ROOT, 'data', 'wikipedia-pageviews.json');
const DATA_ARXIV     = resolve(REPO_ROOT, 'data', 'arxiv.json');
const DATA_DEMANDS   = resolve(REPO_ROOT, 'data', 'demands.json');

const HISTORY_DIR   = resolve(REPO_ROOT, 'history');
const CURRENT_DIR   = resolve(HISTORY_DIR, 'current');
const ARCHIVE_DIR   = resolve(HISTORY_DIR, 'archive');
const MANIFEST_PATH = resolve(HISTORY_DIR, 'manifest.json');
const INDEX_PATH    = resolve(HISTORY_DIR, 'index.json');

// フロントエンド配信用ミラー先 (Vite が build 時に dist/ に運ぶ)。
// history/ は git 追跡の canonical、public/history/ は配信用の二次コピー。
// build-demands.mjs の data/demands.json → public/data/demands.json と同型パターン。
const PUBLIC_HISTORY_DIR = resolve(REPO_ROOT, 'public', 'history');

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

const RETENTION_DAYS   = 90;
const SCHEMA_VERSION   = 1;
const ARCHIVE_STRATEGY = 'year';
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

async function tryReadJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

/**
 * JSONL を読み込み、整合性チェックしながらパースする。
 * 各行を JSON.parse し、date フィールドの有無を確認。
 * 壊れた行は console.warn して skip、他行はそのまま返す。
 * ファイルが存在しなければ空配列を返す。
 */
async function readJsonlSafe(path) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { records: [], skipped: 0, corruptLines: [] };
    throw err;
  }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const records = [];
  const corruptLines = [];
  const name = basename(path);
  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.date !== 'string') {
        console.warn(`  ! ${name}:L${i + 1} missing "date" field, skipping`);
        corruptLines.push(i + 1);
        continue;
      }
      records.push(parsed);
    } catch {
      console.warn(`  ! ${name}:L${i + 1} JSON parse error, skipping`);
      corruptLines.push(i + 1);
    }
  }
  return { records, skipped: corruptLines.length, corruptLines };
}

/**
 * Atomic write:
 *   1. .tmp に全行書き込み
 *   2. 再読み込みして行数と各行の JSON.parse を検証
 *   3. 成功時のみ本ファイルへ rename
 * クラッシュや部分書き込みに対する保険。
 */
async function writeJsonlAtomic(path, records) {
  const tmp = path + '.tmp';
  await ensureDir(dirname(path));
  const content = records.map((r) => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '');
  await writeFile(tmp, content, 'utf8');

  // 検証: 行数一致 + 各行 parse 可能
  const raw = await readFile(tmp, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length !== records.length) {
    throw new Error(`${basename(path)}: 書き込み後の行数不一致 (${lines.length} vs ${records.length})`);
  }
  for (let i = 0; i < lines.length; i++) {
    try {
      JSON.parse(lines[i]);
    } catch {
      throw new Error(`${basename(path)}: 書き込み後 L${i + 1} が JSON として不正`);
    }
  }
  await rename(tmp, path);
}

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

// ---------------------------------------------------------------------------
// public/history/ ミラー (フロント配信用)
//
// history/ (git canonical) を public/history/ にそのままコピーする。
// Vite の build がこれを dist/ に運ぶことで、フロントは
// /history/index.json や /history/current/{theme}.jsonl を fetch できる。
//
// 冗長性のトレードオフ: 2 箇所書くがサイズは小さい (数十 KB)、
// 一貫性は毎回全ミラー再生成で担保 (差分同期を試みると壊れ方が複雑になる)。
// ---------------------------------------------------------------------------

async function mirrorHistoryToPublic() {
  const { readdir, stat, rm, copyFile } = await import('node:fs/promises');

  // 既存の public/history/ を丸ごと消して再生成 (冪等性・整合性最優先)
  await rm(PUBLIC_HISTORY_DIR, { recursive: true, force: true });
  await ensureDir(PUBLIC_HISTORY_DIR);

  // ルートの manifest.json / index.json / README.md をコピー
  const rootFiles = ['manifest.json', 'index.json', 'README.md'];
  for (const name of rootFiles) {
    const src = resolve(HISTORY_DIR, name);
    try {
      await stat(src);
      await copyFile(src, resolve(PUBLIC_HISTORY_DIR, name));
    } catch {
      /* README.md や manifest.json が無い状態もあり得るので黙って skip */
    }
  }

  // current/*.jsonl をコピー
  const publicCurrent = resolve(PUBLIC_HISTORY_DIR, 'current');
  await ensureDir(publicCurrent);
  try {
    const files = (await readdir(CURRENT_DIR)).filter((f) => f.endsWith('.jsonl'));
    for (const f of files) {
      await copyFile(resolve(CURRENT_DIR, f), resolve(publicCurrent, f));
    }
  } catch {
    /* current/ が空 or 未生成の場合は skip */
  }

  // archive/{year}/*.jsonl をコピー
  try {
    const years = await readdir(ARCHIVE_DIR);
    for (const y of years) {
      const yearDir = resolve(ARCHIVE_DIR, y);
      const publicYearDir = resolve(PUBLIC_HISTORY_DIR, 'archive', y);
      await ensureDir(publicYearDir);
      const files = (await readdir(yearDir)).filter((f) => f.endsWith('.jsonl'));
      for (const f of files) {
        await copyFile(resolve(yearDir, f), resolve(publicYearDir, f));
      }
    }
  } catch {
    /* archive/ が未生成の場合は skip */
  }
}

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
  const [qiitaData, appstoreData, wikiData, arxivData, demandsData] = await Promise.all([
    tryReadJson(DATA_QIITA),
    tryReadJson(DATA_APPSTORE),
    tryReadJson(DATA_WIKIPEDIA),
    tryReadJson(DATA_ARXIV),
    tryReadJson(DATA_DEMANDS),
  ]);

  const qiitaThemes    = (qiitaData    && qiitaData.themes)    || {};
  const appstoreThemes = (appstoreData && appstoreData.themes) || {};
  const wikiThemes     = (wikiData     && wikiData.themes)     || {};
  const arxivThemes    = (arxivData    && arxivData.themes)    || {};

  // テーマ表示名/カテゴリを demands.json から補完
  const themeMeta = {};
  if (demandsData && Array.isArray(demandsData.demands)) {
    for (const d of demandsData.demands) {
      themeMeta[d.id] = { name: d.title, category: d.category };
    }
  }

  // 全ソースに登場するテーマ ID の union
  const allThemeIds = new Set([
    ...Object.keys(qiitaThemes),
    ...Object.keys(appstoreThemes),
    ...Object.keys(wikiThemes),
    ...Object.keys(arxivThemes),
  ]);

  console.log(
    `   sources: qiita(${Object.keys(qiitaThemes).length}) ` +
    `appstore(${Object.keys(appstoreThemes).length}) ` +
    `wikipedia(${Object.keys(wikiThemes).length}) ` +
    `arxiv(${Object.keys(arxivThemes).length})`
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
    if (q) sources.qiita     = q;
    if (a) sources.appstore  = a;
    if (w) sources.wikipedia = w;
    if (x) sources.arxiv     = x;
    if (Object.keys(sources).length === 0) continue;

    const todayRecord = { date: today, generatedAt, sources };
    const currentPath = resolve(CURRENT_DIR, `${themeId}.jsonl`);
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

  let currentFiles = [];
  try {
    currentFiles = (await readdir(CURRENT_DIR)).filter((f) => f.endsWith('.jsonl'));
  } catch {}

  for (const filename of currentFiles) {
    const currentPath = resolve(CURRENT_DIR, filename);
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
      const archiveYearDir = resolve(ARCHIVE_DIR, year);
      await ensureDir(archiveYearDir);
      const archivePath = resolve(archiveYearDir, filename);
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

  let currentFiles2 = [];
  try {
    currentFiles2 = (await readdir(CURRENT_DIR)).filter((f) => f.endsWith('.jsonl'));
  } catch {}

  for (const filename of currentFiles2) {
    const themeId = filename.replace(/\.jsonl$/, '');
    const currentPath = resolve(CURRENT_DIR, filename);
    const { records } = await readJsonlSafe(currentPath);
    if (records.length === 0) continue;

    const dates = records.map((r) => r.date).sort();
    const firstDate = dates[0];
    const lastDate  = dates[dates.length - 1];

    // このテーマの archive パスを列挙
    const archivePaths = [];
    try {
      const years = (await readdir(ARCHIVE_DIR)).sort();
      for (const y of years) {
        const p = resolve(ARCHIVE_DIR, y, filename);
        try {
          await stat(p);
          archivePaths.push(`history/archive/${y}/${filename}`);
        } catch {}
      }
    } catch {}

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
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2) + '\n', 'utf8');

  // ─── Step 4: manifest.json 更新 ───

  manifest.lastRunAt = generatedAt;
  if (rotationOccurred) manifest.lastRotationAt = generatedAt;
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // ─── Step 5: public/history/ にミラー (フロント配信用) ───
  await mirrorHistoryToPublic();

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
