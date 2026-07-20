// ============================================================================
// scripts/lib/env.mjs
//
// リポジトリ直下の .env ファイルがあれば読み込み、process.env に流し込む。
// KEY=VALUE 形式のシンプルなパーサ。既に process.env に同名の値がある場合は
// 上書きしない（シェルの export を優先する）。dotenv 等の依存を足さないための
// 最小実装。
// ============================================================================

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH  = resolve(REPO_ROOT, '.env');

export async function loadEnv() {
  let contents;
  try {
    contents = await readFile(ENV_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return false; // .env なし。呼び出し側でOK
    throw err;
  }

  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // 前後のクォートを外す
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
  return true;
}
