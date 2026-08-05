// ============================================================================
// themeCatalog.js
//
// 11 テーマの表示名/カテゴリを一元管理する fallback catalog。
// scripts/extract-demand-candidates.mjs の THEMES 定数と同期させる。
//
// なぜ必要か:
//   demands.json は news マッチが 0 のテーマを落とす仕様
//   (例: ai-content-generation はニュースが取れない日は demand 配列に入らない)。
//   一方 history/index.json や history 由来ランキングにはそのテーマ id が出るため、
//   demands.json だけを見てタイトル解決しようとすると raw id が UI に出てしまう。
//
//   このモジュールは demands.json に依存しない安定した表示名を提供する。
//
// 更新方針:
//   THEMES 定数を触ったら (id 追加/削除、name 変更)、ここも同時に更新する。
//   自動同期の仕組みは build 側に持たせても良いが、YAGNI として手動同期に留める。
// ============================================================================

export const THEME_CATALOG = {
  'ai-business-automation': { title: 'AI業務自動化',                     category: 'AI・テクノロジー' },
  'ai-coding':              { title: 'AI駆動のコード生成・開発支援',     category: 'AI・テクノロジー' },
  'ai-content-generation':  { title: '生成AIによるコンテンツ制作',        category: 'AI・テクノロジー' },
  'ai-hardware':            { title: 'AI向けハードウェア・計算基盤',     category: 'AI・テクノロジー' },
  'ai-regulation':          { title: 'AI規制・安全性・プライバシー',     category: 'AI・テクノロジー' },
  'infrastructure-outages': { title: 'システム障害・可用性への関心',     category: 'ビジネス' },
  'security-breach':        { title: '個人情報漏洩・セキュリティ対策',   category: 'ビジネス' },
  'payment-troubles':       { title: '決済インフラ・キャッシュレス',     category: 'ビジネス' },
  'home-server-selfhost':   { title: '自宅サーバー・セルフホスト',       category: 'AI・テクノロジー' },
  'remote-work':            { title: 'リモートワーク・ハイブリッド勤務', category: 'ビジネス' },
  'senior-health':          { title: '高齢者向け健康・認知症予防',       category: '健康' },
  'study-methods':          { title: '学習法・勉強効率',                 category: '教育' },
  'exam-admission':         { title: '受験・進学',                       category: '教育' },
  'housing':                { title: '住まい・住宅',                     category: '生活' },
  'home-appliance':         { title: '家電・暮らしの道具',               category: '生活' },
  'fitness-training':       { title: 'フィットネス・筋トレ',             category: '健康' },
  'vulnerability-response': { title: '脆弱性対応・パッチ管理',         category: 'ビジネス' },
};

/** テーマ ID → 表示名 (未知の id なら id をそのまま返す) */
export function themeTitle(id) {
  return THEME_CATALOG[id]?.title || id;
}

/** テーマ ID → カテゴリ */
export function themeCategory(id) {
  return THEME_CATALOG[id]?.category || null;
}
