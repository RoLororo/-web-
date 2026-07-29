// ============================================================================
// scripts/check-sources.mjs
//
// Demand Atlas — 取得直後のデータ健全性チェック
//
//   ■ 背景
//     fetcher は情報源が部分的に失敗しても graceful に継続し、劣化した
//     envelope を書き出して exit 0 する。pipeline は `&&` 連結なので後続も
//     完走し、劣化データがそのまま commit・公開され、Actions は緑のまま
//     になる。envelope には complete / coverage / errorCount が記録されて
//     いるが、これを読むコードがどこにも無かった。
//     → 「CI 成功 = データ健全」が成立していなかった。
//
//   ■ 方針 (プロトタイプ段階なので過剰にしない)
//     致命 (ERROR) — pipeline を止める。公開されず旧データが残る = 安全側
//       ・ソースファイルが存在しない
//       ・successCount が 0 (その情報源が全滅)
//       ・articles.json が空
//     劣化 (WARN)  — 止めない。開発速度を落とさないため警告のみ
//       ・errorCount > 0
//       ・successCount < mappedThemeCount (一部テーマがスキップ)
//       ・complete=false / coverage<1 のテーマがある
//
//     部分劣化で失敗させない理由: 外部 API の一過性エラーは日常的に起き、
//     そのたびに更新が止まる方が害が大きい。劣化は警告として可視化し、
//     継続的に発生する場合に人が判断する。
//
//   ■ GitHub Actions 連携
//     GITHUB_ACTIONS 環境下では ::warning:: / ::error:: を出力し、
//     Actions の UI 上にアノテーションとして表示させる。
//
//   ■ 使い方
//     npm run check          (fetcher 群の後、build-demands の前に実行)
// ============================================================================

import { PATHS } from './lib/paths.mjs';
import { storage } from './lib/storage.mjs';

/** チェック対象の情報源 (すべて mappedThemeCount / successCount / errorCount を持つ) */
const SOURCES = [
  { name: 'wikipedia', path: PATHS.source.wikipedia },
  { name: 'qiita',     path: PATHS.source.qiita },
  { name: 'appstore',  path: PATHS.source.appstore },
  { name: 'arxiv',     path: PATHS.source.arxiv },
];

const inCI = Boolean(process.env.GITHUB_ACTIONS);
const errors = [];
const warns  = [];

function fail(msg) {
  errors.push(msg);
  console.log(inCI ? `::error::${msg}` : `  ✗ ${msg}`);
}

function warn(msg) {
  warns.push(msg);
  console.log(inCI ? `::warning::${msg}` : `  ⚠ ${msg}`);
}

async function main() {
  console.log('🦊 Demand Atlas — 取得データの健全性チェック');
  console.log('');

  // ── ニュース記事 (score の主要因なので空なら致命) ──
  const articles = await storage.readJson(PATHS.source.articles);
  if (!Array.isArray(articles) || articles.length === 0) {
    fail('articles.json が空または不正。ニュース取得が全滅している');
  } else {
    console.log(`  articles: ${articles.length} 件`);
  }

  // ── 各情報源の envelope ──
  for (const src of SOURCES) {
    const payload = await storage.readJson(src.path);

    if (!payload) {
      fail(`${src.name}: ソースファイルが存在しない (取得が完全に失敗)`);
      continue;
    }

    const themes  = payload.themes || {};
    const present = Object.keys(themes).length;
    const errCnt  = payload.errorCount ?? 0;

    // 注意: successCount < mappedThemeCount は劣化ではない。
    // qiita は 9/11、appstore は 4/11 が定常状態で、差分は「マッピングを
    // 意図的に空にしたテーマ」(themesSkipped) である。ここを劣化として
    // 扱うと毎回警告が出て、警告そのものが無視されるようになる。
    // 実際の劣化シグナルは errorCount と complete/coverage。

    if (present === 0 || payload.successCount === 0) {
      fail(`${src.name}: 取得テーマが 0 件 (この情報源が全滅)`);
      continue;
    }

    // 品質フラグ (qiita / appstore のみ持つ。無い情報源は 0 として扱う)
    const incomplete = Object.values(themes).filter((t) => t.complete === false).length;
    const lowCov     = Object.values(themes).filter(
      (t) => typeof t.coverage === 'number' && t.coverage < 1,
    ).length;

    const flags = [];
    if (errCnt > 0)     flags.push(`errors=${errCnt}`);
    if (incomplete > 0) flags.push(`complete=false×${incomplete}`);
    if (lowCov > 0)     flags.push(`coverage<1×${lowCov}`);

    if (flags.length > 0) {
      warn(`${src.name}: 部分的に劣化 (${flags.join(', ')})`);
    } else {
      console.log(`  ${src.name}: ${present} テーマ OK`);
    }
  }

  // ── 結果 ──
  console.log('');
  if (errors.length > 0) {
    console.log(`✗ 致命的な問題 ${errors.length} 件。pipeline を中断する`);
    console.log('  (公開は行われず、前日のデータが本番に残る)');
    process.exit(1);
  }
  if (warns.length > 0) {
    console.log(`⚠ 劣化 ${warns.length} 件。処理は継続する`);
    console.log('  (継続的に発生する場合はマッピングや API 制限を確認すること)');
  } else {
    console.log('✓ 全情報源が健全');
  }
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
