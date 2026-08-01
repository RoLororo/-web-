// ============================================================================
// scripts/mirror-public.mjs
//
// canonical (data/, history/) → public/ ミラー
//
//   目的:
//     Vite が dist/ にコピーする対象は public/ 配下のみ。
//     canonical を git 追跡 (履歴・比較用) しつつ、public/ は build 時に
//     生成する派生物として扱う。 → git 二重追跡を解消。
//
//   実行:
//     直接:  npm run mirror
//     自動:  vite build の prebuild フックで実行 (package.json 参照)
//
//   idempotent: 既存 public/data/ + public/history/ を丸ごと消してから再生成。
//   一貫性は "全ミラー再生成" で担保 (差分同期はしない)。
// ============================================================================

import { PATHS } from './lib/paths.mjs';
import { storage } from './lib/storage.mjs';
import { resolve, relative } from 'node:path';

async function main() {
  console.log('🦊 Demand Atlas — public ミラー生成');

  const dataDir       = PATHS.publicMirror.dataDir;
  const historyDir    = PATHS.publicMirror.historyRoot;
  let filesCopied = 0;

  // ─── data/ → public/data/ ─────────────────────────────────────────
  await storage.rmTree(dataDir);
  await storage.ensureDir(dataDir);

  // demands.json のみ配信対象 (他の fetcher artifacts は配信不要)
  if (await storage.fileExists(PATHS.output.demands)) {
    await storage.copyFile(PATHS.output.demands, PATHS.publicMirror.demands);
    filesCopied++;
  }

  // 情報源の成績表 (/sources が読む)。demands.json とは別ファイルにして、
  // 需要データを見るだけの人に余分な payload を配らないようにする
  if (await storage.fileExists(PATHS.output.sourceReport)) {
    await storage.copyFile(PATHS.output.sourceReport, PATHS.publicMirror.sourceReport);
    filesCopied++;
  }

  // ─── history/ → public/history/ ────────────────────────────────────
  await storage.rmTree(historyDir);
  await storage.ensureDir(historyDir);

  // ルートの manifest.json / index.json / README.md
  for (const src of [PATHS.history.index, PATHS.history.manifest, PATHS.history.readme]) {
    if (await storage.fileExists(src)) {
      const name = src.split(/[\\/]/).pop();
      await storage.copyFile(src, resolve(historyDir, name));
      filesCopied++;
    }
  }

  // current/*.jsonl
  const publicCurrent = resolve(historyDir, 'current');
  await storage.ensureDir(publicCurrent);
  const currentFiles = await storage.listFiles(PATHS.history.current, { ext: '.jsonl' });
  for (const f of currentFiles) {
    await storage.copyFile(PATHS.history.currentTheme(f.replace(/\.jsonl$/, '')), resolve(publicCurrent, f));
    filesCopied++;
  }

  // archive/{year}/*.jsonl
  const years = await storage.listFiles(PATHS.history.archive);
  for (const y of years) {
    const publicYearDir = resolve(historyDir, 'archive', y);
    await storage.ensureDir(publicYearDir);
    const files = await storage.listFiles(resolve(PATHS.history.archive, y), { ext: '.jsonl' });
    for (const f of files) {
      const themeId = f.replace(/\.jsonl$/, '');
      await storage.copyFile(PATHS.history.archiveTheme(y, themeId), resolve(publicYearDir, f));
      filesCopied++;
    }
  }

  console.log(`   ${filesCopied} ファイルを public/ にミラー`);
  console.log(`   public/data/       ← ${relative(process.cwd(), PATHS.output.demands)}`);
  console.log(`   public/history/    ← ${relative(process.cwd(), PATHS.history.root)}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
