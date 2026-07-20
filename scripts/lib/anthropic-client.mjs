// ============================================================================
// scripts/lib/anthropic-client.mjs
//
// Anthropic API クライアントの最小ラッパ。
// - 公式 SDK `@anthropic-ai/sdk` を使う
// - ANTHROPIC_API_KEY を検証し、無ければ親切なエラーで落とす
// - デフォルトモデルは ANTHROPIC_MODEL 環境変数で上書き可能
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';

// コストと性能のバランス重視で Sonnet を採用。ANTHROPIC_MODEL で上書き可能。
// 例:
//   ANTHROPIC_MODEL=claude-haiku-4-5  ← より安く
//   ANTHROPIC_MODEL=claude-opus-4-8   ← より高性能
//
// 呼び出し時に読む (import 時ではない) ため、.env の loadEnv() 完了後の値が反映される。
export function getModel() {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
}

export function createClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('');
    console.error('✗ ANTHROPIC_API_KEY 環境変数が設定されていません。');
    console.error('');
    console.error('  以下のいずれかを実行してください:');
    console.error('');
    console.error('  ① プロジェクトルートに .env を作成 (推奨)');
    console.error('     ────────────────────────────────');
    console.error('     cp .env.example .env');
    console.error('     # .env を編集して ANTHROPIC_API_KEY=sk-ant-... を書き込む');
    console.error('     npm run themes:ai');
    console.error('');
    console.error('  ② シェルで直接指定 (一時的)');
    console.error('     ────────────────────────────');
    console.error('     PowerShell:  $env:ANTHROPIC_API_KEY = "sk-ant-..."; npm run themes:ai');
    console.error('     bash/zsh:    ANTHROPIC_API_KEY=sk-ant-... npm run themes:ai');
    console.error('');
    console.error('  API キーは https://console.anthropic.com/ で取得できます。');
    console.error('  → 左メニューの "API Keys" → "Create Key"');
    console.error('');
    process.exit(1);
  }
  return new Anthropic({ apiKey });
}

/** SDK が投げる典型的なエラーを分かりやすく整形して stderr に書く */
export function reportError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error('✗ 認証失敗: ANTHROPIC_API_KEY が無効です。');
    console.error('  キーが正しいか、Console でリボークされていないか確認してください。');
  } else if (err instanceof Anthropic.PermissionDeniedError) {
    console.error('✗ 権限エラー: このモデル/機能にアクセスする権限がありません。');
    console.error('  Anthropic Console でモデルアクセスや workspace 設定を確認してください。');
  } else if (err instanceof Anthropic.NotFoundError) {
    console.error('✗ モデルが見つかりません:', err.message);
    console.error('  ANTHROPIC_MODEL の指定が正しいか確認してください。');
  } else if (err instanceof Anthropic.RateLimitError) {
    console.error('✗ レート制限に達しました。しばらく待って再試行してください。');
  } else if (err instanceof Anthropic.APIError) {
    console.error(`✗ API エラー (${err.status || '???'}): ${err.message}`);
  } else if (err instanceof SyntaxError) {
    console.error('✗ AI 出力の JSON パースに失敗しました:', err.message);
  } else {
    console.error('✗ 予期しないエラー:', err && err.message ? err.message : err);
  }
}
