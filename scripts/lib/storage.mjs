// ============================================================================
// scripts/lib/storage.mjs
//
// ストレージ抽象化 (Repository / Adapter パターン)
//
//   目的:
//     - fetcher / builder / history append を fs 実装に直接束縛せず
//     - 将来 Turso / R2 / D1 等へ移行するときに Driver 差替 だけで済む状態にする
//     - 全 fetcher と builder はこの module 経由で I/O を行う
//
//   採用 driver は env STORAGE_DRIVER で選択:
//     fs    (default, 実装済み) — ローカル fs、canonical と一致
//     turso (未実装 stub)         — LibSQL, history append-only 向き
//     r2    (未実装 stub)         — Cloudflare R2, source snapshot 向き
//
//   公開 API (driver 実装が満たすべき shape):
//     readJson(pathOrKey) → object | null
//     writeJson(pathOrKey, obj)  → void  (atomic)
//     readText(pathOrKey) → string | null
//     writeText(pathOrKey, str)  → void  (atomic)
//     readJsonl(pathOrKey) → { records, skipped, corruptLines }
//     writeJsonl(pathOrKey, records) → void  (atomic + 行数検証)
//     ensureDir(pathOrKey) → void
//     listFiles(pathOrKey, {ext}) → string[]  (filenames only)
//     copyFile(fromPath, toPath) → void
//     fileExists(pathOrKey) → boolean
//     rmTree(pathOrKey) → void
//
//   なぜ "pathOrKey"?
//     fs driver は絶対パス、他 driver は key/URI を受け取れる汎用 shape。
//     現在の fs 実装ではそのままパスとして扱う。
// ============================================================================

import { mkdir, readFile, writeFile, rename, readdir, stat, rm, copyFile as fsCopy } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { CONFIG } from './paths.mjs';

// ---------------------------------------------------------------------------
// FsDriver — 現行の fs 実装をそのまま Driver 化 (動作 bit-identical)
// ---------------------------------------------------------------------------

const fsDriver = {
  name: 'fs',

  async readJson(path) {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  },

  async writeJson(path, obj) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  },

  async readText(path) {
    try {
      return await readFile(path, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  },

  async writeText(path, str) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, str, 'utf8');
  },

  /**
   * JSONL を読み込み、壊れ行を skip しながらパース。
   * 各 record に date フィールドがなければ skip (append-history と同じ挙動)。
   */
  async readJsonl(path) {
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
  },

  /**
   * Atomic JSONL 書込 (.tmp → verify → rename)。
   * 書込後に行数と各行 parse を検証、失敗時は throw して古いファイルを保護。
   */
  async writeJsonl(path, records) {
    const tmp = path + '.tmp';
    await mkdir(dirname(path), { recursive: true });
    const content = records.map((r) => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '');
    await writeFile(tmp, content, 'utf8');
    const raw = await readFile(tmp, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length !== records.length) {
      throw new Error(`${basename(path)}: 書き込み後の行数不一致 (${lines.length} vs ${records.length})`);
    }
    for (let i = 0; i < lines.length; i++) {
      try { JSON.parse(lines[i]); }
      catch { throw new Error(`${basename(path)}: 書き込み後 L${i + 1} が JSON として不正`); }
    }
    await rename(tmp, path);
  },

  async ensureDir(path) {
    await mkdir(path, { recursive: true });
  },

  async listFiles(path, { ext } = {}) {
    try {
      const files = await readdir(path);
      return ext ? files.filter((f) => f.endsWith(ext)) : files;
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  },

  async copyFile(from, to) {
    await mkdir(dirname(to), { recursive: true });
    await fsCopy(from, to);
  },

  async fileExists(path) {
    try { await stat(path); return true; }
    catch { return false; }
  },

  async rmTree(path) {
    await rm(path, { recursive: true, force: true });
  },
};

// ---------------------------------------------------------------------------
// Stub drivers (未実装)
// ---------------------------------------------------------------------------

function makeStubDriver(name) {
  const stub = () => { throw new Error(`storage driver "${name}" is not yet implemented`); };
  return {
    name,
    readJson: stub, writeJson: stub, readText: stub, writeText: stub,
    readJsonl: stub, writeJsonl: stub, ensureDir: stub, listFiles: stub,
    copyFile: stub, fileExists: stub, rmTree: stub,
  };
}

// ---------------------------------------------------------------------------
// Driver selector
// ---------------------------------------------------------------------------

const DRIVERS = {
  fs:    fsDriver,
  turso: makeStubDriver('turso'),
  r2:    makeStubDriver('r2'),
};

const selected = DRIVERS[CONFIG.storageDriver];
if (!selected) {
  throw new Error(`unknown STORAGE_DRIVER "${CONFIG.storageDriver}"; expected one of: ${Object.keys(DRIVERS).join(', ')}`);
}

/**
 * 選択された storage driver。全 fetcher / builder / history はこれを import する。
 *
 *   import { storage } from './lib/storage.mjs';
 *   await storage.writeJson(PATHS.source.qiita, envelope);
 */
export const storage = selected;

/** どの driver が使われているかを起動時に表示するための helper */
export function driverName() {
  return storage.name;
}
