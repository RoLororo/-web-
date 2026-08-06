// ============================================================================
// validate-data — 公開前のデータ整合性ゲート（read-only・破損時に exit 1）
//
// なぜ必要か:
//   日次 GitHub Action は `npm run all` の後、demands/history を無検査で commit
//   → 本番へ自動デプロイする。fetcher やマッピングが壊れて誤スコア・null 漏れ・
//   テーマ消失が起きても、従来の `check`(check-sources) は「劣化は継続」する設計で
//   止まらなかった。壊れた数字が検索/共有された初回訪問者に出ると信頼を失い、
//   ユーザー獲得の土台（口コミ・再訪）が崩れる。
//
//   このスクリプトは demands.json の HARD 不変条件だけを検査し、1 つでも破れたら
//   exit 1 して pipeline を止める（＝壊れたデータは commit されない）。
//   ソフトな品質指標は completeness/ に任せ、ここは「本番に出してはいけない破損」
//   のみを対象にする（誤検知でパイプラインを不必要に止めないため）。
//
// 実行: node scripts/validate-data.mjs  （package.json の "validate"、all チェーン内）
// ============================================================================

import { readFileSync } from 'node:fs';
import { PATHS } from './lib/paths.mjs';

const MIN_THEMES = 12; // 現在 17。壊滅的なテーマ消失を検出する下限（正常な増減では割らない）
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const BAD_TEXT = /(undefined|null|NaN|\[object)/;

const errors = [];
const fail = (msg) => errors.push(msg);

let payload;
try {
  payload = JSON.parse(readFileSync(PATHS.output.demands, 'utf8'));
} catch (e) {
  console.error('✗ demands.json を読めない/JSON 不正:', e.message);
  process.exit(1);
}

const demands = payload && Array.isArray(payload.demands) ? payload.demands : null;
if (!demands || demands.length === 0) {
  console.error('✗ demands が空、または配列でない');
  process.exit(1);
}
if (demands.length < MIN_THEMES) {
  fail(`テーマ数 ${demands.length} が下限 ${MIN_THEMES} を下回った（テーマ消失の疑い）`);
}
if (!payload.generatedAt || Number.isNaN(Date.parse(payload.generatedAt))) {
  fail(`generatedAt が不正: ${payload.generatedAt}`);
}

const seenIds = new Set();
for (const d of demands) {
  const id = d && d.id;
  if (typeof id !== 'string' || id.length === 0) { fail(`id が無いテーマがある`); continue; }
  if (seenIds.has(id)) fail(`${id}: id が重複`);
  seenIds.add(id);

  // タイトル
  if (typeof d.title !== 'string' || d.title.trim().length === 0) fail(`${id}: title が空`);

  // スコアは 0..100 の数値
  if (!isNum(d.score) || d.score < 0 || d.score > 100) fail(`${id}: score 異常 = ${d.score}`);

  // スコア再現（内訳が存在するとき）: round(40nv+30g+20sd+10f) === score
  const b = d._scoreBreakdown;
  if (b && isNum(b.newsVolume) && isNum(b.growth) && isNum(b.sourceDiversity) && isNum(b.freshness)) {
    const recon = Math.round(40 * b.newsVolume + 30 * b.growth + 20 * b.sourceDiversity + 10 * b.freshness);
    if (recon !== d.score) fail(`${id}: score ${d.score} ≠ 内訳から再現した ${recon}`);
  }

  // ユーザーに見えるテキストに undefined/null/NaN/[object が漏れていない
  const texts = [d.title, d.summary, d._insights?.verdict?.label, d._insights?.verdict?.rationale];
  for (const t of texts) {
    if (typeof t === 'string' && BAD_TEXT.test(t)) fail(`${id}: 可視テキストに異常語: "${t.slice(0, 50)}"`);
  }

  // 需要スコア履歴の末尾は現在のスコアと一致（焼き込みズレの検出）
  const sh = d._scoreHistory && d._scoreHistory.scores;
  if (Array.isArray(sh) && sh.length > 0 && sh[sh.length - 1] !== d.score) {
    fail(`${id}: _scoreHistory 末尾 ${sh[sh.length - 1]} ≠ score ${d.score}`);
  }

  // 観測記事があるのに根拠 0 件（表示の矛盾）
  const ev = Array.isArray(d.evidence) ? d.evidence.length : 0;
  if (isNum(d._matchingArticleCount) && d._matchingArticleCount > 0 && ev === 0) {
    fail(`${id}: matching ${d._matchingArticleCount} 件だが evidence 0 件`);
  }
}

console.log('🦊 Demand Atlas — データ整合性ゲート');
console.log(`   検査テーマ: ${demands.length} / generatedAt: ${payload.generatedAt}`);
if (errors.length > 0) {
  console.error(`\n✗ 整合性エラー ${errors.length} 件（本番へ出してはいけません）:`);
  for (const e of errors) console.error('   - ' + e);
  process.exit(1);
}
console.log('   ✓ HARD 不変条件をすべて満たす（公開可）');
