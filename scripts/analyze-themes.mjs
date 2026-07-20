// ============================================================================
// scripts/analyze-themes.mjs
//
// Demand Atlas — Phase 3: AI による需要テーマの発見と分類
//
//   ■ 目的
//     data/articles.json のニュース記事群を Anthropic API (Claude) に渡し、
//     「事前定義した辞書に頼らず」需要テーマを発見・命名させる。
//     ルールベース (Phase 2) の限界を検証するのが狙い。
//
//   ■ このスクリプトが やること
//     - articles.json を読み込み、直近 N 件に絞る
//     - 必要最小限のフィールド (id / title / summary / source / publishedAt) だけを
//       AI に渡す
//     - 1 回の API 呼び出しで 5〜10 個の需要テーマを JSON で返してもらう
//     - 結果を data/demand-themes.ai.json に保存
//     - コンソールに要約を表示
//
//   ■ このスクリプトが やらないこと (Phase 3 スコープ外)
//     - 検索トレンドの取得
//     - 需要スコアの最終計算
//     - フロントエンドへの反映
//     - データベースへの保存
//     - 自動実行
//
//   ■ 使い方
//     export ANTHROPIC_API_KEY=sk-ant-...   (または .env に記載)
//     npm run themes:ai
//
//   ■ 依存
//     - @anthropic-ai/sdk (公式 SDK)
//     - Node.js 18+ の標準機能のみ
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from './lib/env.mjs';
await loadEnv(); // 先に .env を反映させてから SDK を読む

import { createClient, getModel, reportError } from './lib/anthropic-client.mjs';

// ---------------------------------------------------------------------------
// パス設定
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const INPUT     = resolve(REPO_ROOT, 'data', 'articles.json');
const OUTPUT    = resolve(REPO_ROOT, 'data', 'demand-themes.ai.json');

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

/** AI に渡す記事の最大件数（新しい順） */
const MAX_ARTICLES = 100;

/** 生成する需要テーマの目安件数 */
const MIN_THEMES = 5;
const MAX_THEMES = 10;

/** 応答トークン上限。テーマ10件×充実したフィールドで 4K 程度が現実的 */
const MAX_TOKENS = 8000;

// ---------------------------------------------------------------------------
// プロンプト
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `あなたはニュース記事群を分析し、「世の中で高まっている需要・困りごと・関心」を発見する分析者です。

# あなたの任務
入力されたニュース記事群を分析し、複数の記事から読み取れる「需要テーマ」を ${MIN_THEMES}〜${MAX_THEMES} 個抽出してください。

# 「需要テーマ」とは何か

** 良い例 **
- 「クラウドサービス障害への備え・可用性監視への需要」
- 「企業のAI導入・業務自動化支援への需要」
- 「個人情報漏えい対策・セキュリティ強化への需要」
- 「エンジニアのAI駆動開発を支援するツールへの需要」

** 悪い例 **
- 「AWSで障害が発生した」← 単なる出来事の要約
- 「AIに関するニュース」← 分類ラベルであってテーマではない
- 「トランプ大統領の発言」← 一時的な話題
- 「Xの新機能」← 個別のプロダクト情報

# 抽出の原則
1. ニュースそのものを要約しない。ニュースの背後にある「求めているもの」「困っていること」「今後必要とされそうなこと」を読み取る
2. 複数の記事に共通する背景・課題を優先する
3. 1つの記事だけから大きな需要テーマを作らない (根拠は最低 2 件を目安)
4. 需要があると断定しすぎない。ニュースから推測できる範囲と、推測に過ぎない部分を区別する
5. 根拠となった記事の ID を必ず evidenceArticleIds に含める
6. カテゴリは以下から選ぶ:
   AI・テクノロジー / ビジネス / 起業 / 副業 / 教育 / 生活 / エンタメ / 健康 / 美容
   どれにも該当しない場合は「その他」

# confidence の付け方
0.0〜1.0 の範囲で、以下を総合して評価する:
- 根拠記事の数 (多いほど高い)
- 複数の異なる情報源 (source) にまたがっているか (多いほど高い)
- 記事の公開時期が近いか (集中して起きているほど高い)
- ニュースから需要への推測の直接性 (直接的なほど高い)

これはまだ暫定値であり、正式な需要スコアではないことを念頭に置いてください。
根拠が弱いテーマは 0.3〜0.5 程度に留め、無理に高くしないでください。

# 出力
指定された JSON スキーマに厳密に従ってください。日本語で記述してください。`;

/** Anthropic の Structured Outputs 用 JSON Schema */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      minItems: MIN_THEMES,
      maxItems: MAX_THEMES,
      items: {
        type: 'object',
        properties: {
          theme:              { type: 'string', description: '需要テーマ名（15〜25文字程度）' },
          category:           { type: 'string', description: '既定カテゴリのいずれか' },
          summary:            { type: 'string', description: 'この需要が何であるかの簡潔な説明（1〜2文）' },
          whyNow:             { type: 'string', description: 'なぜ今この需要が注目されている可能性があるのか（1〜2文）' },
          relatedKeywords:    { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 8, description: '検索トレンド取得等に使えそうな関連キーワード' },
          problems:           { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5, description: 'この需要の背景にある具体的な悩み・課題' },
          potentialDemand:    { type: 'string', description: 'どのような需要 (製品・サービス・情報) につながる可能性があるか（1文）' },
          evidenceArticleIds: { type: 'array', items: { type: 'string' }, minItems: 1, description: '根拠となった記事 ID の配列' },
          confidence:         { type: 'number', description: '0.0〜1.0 の暫定信頼度' },
        },
        required: ['theme', 'category', 'summary', 'whyNow', 'relatedKeywords', 'problems', 'potentialDemand', 'evidenceArticleIds', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['themes'],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — 需要テーマを AI に抽出させます');
  console.log(`   入力: ${INPUT}`);
  console.log(`   出力: ${OUTPUT}`);
  console.log(`   モデル: ${getModel()}`);
  console.log('');

  // 記事読み込み
  const raw = await readFile(INPUT, 'utf8').catch(() => null);
  if (!raw) {
    console.error('✗ data/articles.json が見つかりません。先に `npm run news` を実行してください。');
    process.exit(1);
  }
  const articles = JSON.parse(raw);
  console.log(`   全記事: ${articles.length} 件`);

  // 直近 MAX_ARTICLES 件に絞り、AI に渡す最小フィールドに整形
  const trimmed = [...articles]
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, MAX_ARTICLES)
    .map((a) => ({
      id:          a.id,
      title:       a.title,
      summary:     a.summary,
      source:      a.source,
      publishedAt: a.publishedAt,
    }));
  console.log(`   AI に渡す記事: ${trimmed.length} 件 (直近順)`);

  // ユーザメッセージを組み立て
  const userMessage = [
    `以下は最近取得したニュース記事 ${trimmed.length} 件です。`,
    `これらから「需要テーマ」を ${MIN_THEMES}〜${MAX_THEMES} 個抽出し、指定された JSON スキーマで返してください。`,
    '',
    '## 記事一覧 (JSON)',
    '```json',
    JSON.stringify(trimmed, null, 2),
    '```',
  ].join('\n');

  // API 呼び出し
  console.log('');
  console.log('… Claude に問い合わせ中 (数十秒かかります)');
  const client = createClient();
  const start = Date.now();

  let response;
  try {
    response = await client.messages.create({
      model: getModel(),
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: OUTPUT_SCHEMA,
        },
      },
    });
  } catch (err) {
    reportError(err);
    process.exit(1);
  }

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`   応答: ${elapsedSec}s / stop_reason=${response.stop_reason}`);

  // レスポンスから JSON テキストを取り出してパース
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    console.error('✗ 応答に text ブロックがありません。stop_reason:', response.stop_reason);
    console.error('   これは max_tokens 到達や refusal の可能性があります。');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (err) {
    console.error('✗ AI の出力が JSON としてパースできませんでした。');
    console.error('   出力の先頭 500 文字:');
    console.error(textBlock.text.slice(0, 500));
    process.exit(1);
  }

  const themes = Array.isArray(parsed.themes) ? parsed.themes : [];
  if (themes.length === 0) {
    console.error('✗ テーマが抽出されませんでした。');
    process.exit(1);
  }

  // evidenceCount を配列長から算出して付与
  const enrichedThemes = themes.map((t) => ({
    ...t,
    evidenceCount: Array.isArray(t.evidenceArticleIds) ? t.evidenceArticleIds.length : 0,
  }));

  // 出力オブジェクト
  const usage = response.usage || {};
  const output = {
    generatedAt:     new Date().toISOString(),
    model:           response.model || getModel(),
    method:          'anthropic-api (single batch call)',
    inputArticles:   trimmed.length,
    totalArticles:   articles.length,
    apiCalls:        1,
    tokenUsage: {
      input:  usage.input_tokens ?? null,
      output: usage.output_tokens ?? null,
      cacheCreate: usage.cache_creation_input_tokens ?? null,
      cacheRead:   usage.cache_read_input_tokens ?? null,
    },
    stopReason:      response.stop_reason,
    themes:          enrichedThemes,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');

  // コンソール要約
  console.log('');
  console.log('──────────────  AI 抽出結果  ──────────────');
  for (const t of enrichedThemes) {
    const bar = '█'.repeat(Math.min(20, t.evidenceCount));
    console.log(`  ${String(t.evidenceCount).padStart(3)}件 [conf ${(+t.confidence || 0).toFixed(2)}] ${bar}`);
    console.log(`         ${t.theme}  (${t.category})`);
    console.log(`         → ${(t.relatedKeywords || []).slice(0, 5).join(', ')}`);
  }
  console.log('──────────────────────────────────────────');
  console.log(`  抽出テーマ数: ${enrichedThemes.length}`);
  if (usage.input_tokens != null && usage.output_tokens != null) {
    console.log(`  トークン: 入力 ${usage.input_tokens} / 出力 ${usage.output_tokens}`);
  }
  console.log(`  出力: ${OUTPUT}`);
}

main().catch((err) => {
  reportError(err);
  process.exit(1);
});
