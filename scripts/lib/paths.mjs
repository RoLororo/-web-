// ============================================================================
// scripts/lib/paths.mjs
//
// 全パス定数の集中管理。
//
//   目的:
//     - 32 箇所に散った resolve(REPO_ROOT, 'data', 'X.json') を単一 module に
//     - env で STORAGE_ROOT / HISTORY_ROOT / PUBLIC_ROOT / DATA_ROOT の
//       上書きを許容 → staging / prod / DB 移行時の切替を可能に
//     - default 値は 現状と bit-identical (動作不変)
//
//   使い方:
//     import { PATHS } from './lib/paths.mjs';
//     await readFile(PATHS.source.qiita, 'utf8');
//     await writeFile(PATHS.output.demands, ...);
//
//   将来:
//     STORAGE_DRIVER=turso のときは PATHS を無視し scripts/lib/storage.mjs
//     の adapter 経由でアクセスする。 paths.mjs は fs backend の実装詳細。
// ============================================================================

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_DEFAULT = resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// ROOT 系 (env で上書き可、default は repo 直下の相対パス)
// ---------------------------------------------------------------------------

/** リポジトリルート (通常は上書き不要) */
export const REPO_ROOT = process.env.REPO_ROOT
  ? resolve(process.env.REPO_ROOT)
  : REPO_ROOT_DEFAULT;

/** fetcher が生成する原始データの root (default: {REPO}/data) */
export const DATA_ROOT = process.env.DATA_ROOT
  ? resolve(process.env.DATA_ROOT)
  : resolve(REPO_ROOT, 'data');

/** history JSONL の root (default: {REPO}/history) */
export const HISTORY_ROOT = process.env.HISTORY_ROOT
  ? resolve(process.env.HISTORY_ROOT)
  : resolve(REPO_ROOT, 'history');

/** Vercel/Vite が配信する public root (default: {REPO}/public) */
export const PUBLIC_ROOT = process.env.PUBLIC_ROOT
  ? resolve(process.env.PUBLIC_ROOT)
  : resolve(REPO_ROOT, 'public');

/** config ファイルの root (default: {REPO}/config) */
export const CONFIG_ROOT = process.env.CONFIG_ROOT
  ? resolve(process.env.CONFIG_ROOT)
  : resolve(REPO_ROOT, 'config');

// ---------------------------------------------------------------------------
// PATHS: 全 fetcher / builder / history / config の一覧
//
//   ここに集約したことで:
//     - どのファイルがどこに書かれるか一目で分かる
//     - 名前を変えたい時に 1 箇所修正で全 script に反映
//     - 将来 DB/Storage 移行時にこのオブジェクト単位で adapter を実装できる
// ---------------------------------------------------------------------------

export const PATHS = {
  // fetcher が書き込む原始データ
  source: {
    articles:   resolve(DATA_ROOT, 'articles.json'),
    candidates: resolve(DATA_ROOT, 'demand-candidates.json'),
    trends:     resolve(DATA_ROOT, 'keyword-trends.json'),
    wikipedia:  resolve(DATA_ROOT, 'wikipedia-pageviews.json'),
    qiita:      resolve(DATA_ROOT, 'qiita.json'),
    appstore:   resolve(DATA_ROOT, 'appstore.json'),
    arxiv:      resolve(DATA_ROOT, 'arxiv.json'),
    github:     resolve(DATA_ROOT, 'github.json'),
    ndl:        resolve(DATA_ROOT, 'ndl.json'),
  },
  // builder が書き込む合成データ (canonical)
  output: {
    demands: resolve(DATA_ROOT, 'demands.json'),
  },
  // history 層 (canonical)
  history: {
    root:     HISTORY_ROOT,
    current:  resolve(HISTORY_ROOT, 'current'),
    archive:  resolve(HISTORY_ROOT, 'archive'),
    index:    resolve(HISTORY_ROOT, 'index.json'),
    manifest: resolve(HISTORY_ROOT, 'manifest.json'),
    readme:   resolve(HISTORY_ROOT, 'README.md'),
    /** 1 テーマの current jsonl パス */
    currentTheme: (themeId) => resolve(HISTORY_ROOT, 'current', `${themeId}.jsonl`),
    /** 1 テーマの年次 archive jsonl パス */
    archiveTheme: (year, themeId) => resolve(HISTORY_ROOT, 'archive', year, `${themeId}.jsonl`),
  },
  // Vite が配信する public root (canonical → mirror コピー先)
  publicMirror: {
    root:     PUBLIC_ROOT,
    dataDir:  resolve(PUBLIC_ROOT, 'data'),
    demands:  resolve(PUBLIC_ROOT, 'data', 'demands.json'),
    historyRoot: resolve(PUBLIC_ROOT, 'history'),
  },
  // mapping / config
  config: {
    qiitaMapping:    resolve(CONFIG_ROOT, 'qiita-mapping.json'),
    appstoreMapping: resolve(CONFIG_ROOT, 'appstore-mapping.json'),
    arxivMapping:    resolve(CONFIG_ROOT, 'arxiv-mapping.json'),
    githubMapping:   resolve(CONFIG_ROOT, 'github-mapping.json'),
    ndlMapping:      resolve(CONFIG_ROOT, 'ndl-mapping.json'),
  },
};

// ---------------------------------------------------------------------------
// 設定値 (env で上書き可)
// ---------------------------------------------------------------------------

export const CONFIG = {
  /** history の rolling window (default 90 日) */
  retentionDays: Number(process.env.HISTORY_RETENTION_DAYS) || 90,
  /** archive の粒度 ('year' | 'month') — 現状 year 固定 */
  archiveStrategy: process.env.HISTORY_ARCHIVE_STRATEGY || 'year',
  /**
   * 将来の storage driver (現在は fs のみ実装、他は stub)
   * env: STORAGE_DRIVER=fs|turso|r2
   */
  storageDriver: process.env.STORAGE_DRIVER || 'fs',
};
