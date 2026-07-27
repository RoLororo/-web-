// ============================================================================
// scripts/generate-insights.mjs
//
// Demand Atlas — 「見る」→「行動する」を接続する insights 生成
//
//   ■ 目的
//     demands.json の各テーマに、観測データから導出した以下を `_insights` として
//     付与する。DemandDetail の空セクション (audience/problems/opportunities)
//     を埋め、更に whyTrending / momentum / beginner / competition /
//     content / saas / similar / nextActions で「次の一歩」を可視化する。
//
//   ■ 完全ヒューリスティック (LLM 呼び出しなし)
//     - すべて data/*.json + demands.json の観測値から算出
//     - テーマ固有のテンプレートは THEME_PROFILES に集約
//     - LLM を差し込みたくなったら enrichWithLLM() のフックを追加する構造
//
//   ■ 捏造しない
//     - audience/problems/monetization/content/saas は「観測された signals に
//       基づく提案」であることを UI 側で明示 (実測ではないため信頼度中の
//       ままにする)
//     - beginnerFriendliness / competition / momentum は算出根拠 (signals) を
//       常に添える
//
//   ■ 使い方
//     npm run insights   (先に `npm run demands` が必要)
//
//   ■ 依存
//     - Node.js 18+ の標準機能のみ
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEMANDS_PATH        = resolve(REPO_ROOT, 'data', 'demands.json');
const DEMANDS_PATH_PUBLIC = resolve(REPO_ROOT, 'public', 'data', 'demands.json');

// ---------------------------------------------------------------------------
// テーマプロファイル (11 テーマ分)
//
// 各テーマの:
//   audience     ... 想定オーディエンス (4-5 個)
//   monetization ... 収益化アイデアテンプレート (3-4 個)
//   content      ... コンテンツ化アイデア (3 個)
//   saas         ... SaaS / アプリ化アイデア (2 個)
//
// 観測データの signals によって「どのアイデアが今推せるか」を後段で並び替える。
// テーマ固有性を犠牲にしないため、カテゴリで一般化せずテーマ ID で持つ。
// ---------------------------------------------------------------------------

const THEME_PROFILES = {
  'ai-business-automation': {
    audience: [
      '業務効率化を進める中堅・中小企業のIT担当者',
      '生成AIを自社に導入したい経営者',
      'RPAから次の一手を探す情シス',
      'AIを自分の副業に組み込みたい個人',
    ],
    monetization: [
      { title: 'AI業務導入コンサル', desc: '自社データの整理からツール選定・運用ルール設計までを伴走', barrier: '中', revenue: 'スポット 30-100万円 / 月額 10万円〜' },
      { title: '業界特化 AI プロンプト集の販売', desc: '経理・営業・人事など職種別のプロンプト集を note / Zenn で有料販売', barrier: '低', revenue: '1,000-5,000円 × 継続販売' },
      { title: 'AI活用ワークショップ', desc: 'ChatGPT/Claude/Copilot を業務で使いこなすハンズオン研修', barrier: '低', revenue: '1日 20-50万円' },
    ],
    content: [
      { format: 'YouTube', title: '毎週:「今週の業務効率化 AI 事例 3 選」', angle: '実際の業務を録画してビフォーアフター比較' },
      { format: 'Newsletter', title: '週1配信:「今週試すべき AI プロンプト」', angle: '実測 LGTM の高い Qiita 記事を要約 + 自分の追試結果' },
      { format: 'ブログ', title: '「非エンジニアが AI で自動化できた業務 100 個」', angle: 'カテゴリ別に検索流入を狙う長期資産型' },
    ],
    saas: [
      { title: '部署別プロンプト管理 SaaS', target: '社内で AI 活用を統制したい情シス', hypothesis: 'プロンプトが個人資産化していて共有・改善サイクルが回らない' },
      { title: 'AI 利用 KPI ダッシュボード', target: '生成AI導入企業の経営層', hypothesis: '導入しても効果測定できず継続判断ができていない' },
    ],
  },
  'ai-coding': {
    audience: [
      'Copilot/Claude Code/Cursor を使うソフトウェアエンジニア',
      'AI 駆動開発を組織に広めたい CTO / テックリード',
      '副業で受託開発を効率化したいフリーランス',
      '学生・若手開発者',
    ],
    monetization: [
      { title: 'AI ペアプロコーチング', desc: '週1で 1on1 して各自の Copilot / Claude Code ワークフローを最適化', barrier: '低', revenue: '月額 3-10万円/人' },
      { title: 'AI 駆動リポジトリ設計テンプレート販売', desc: 'Claude Code / Cursor に最適化した monorepo / CLAUDE.md テンプレを有料配布', barrier: '低', revenue: '5,000-20,000円 × 継続販売' },
      { title: 'AI コードレビュー SaaS の受託チューニング', desc: '既存 SaaS を自社リポジトリに合わせてカスタム設定する導入支援', barrier: '中', revenue: 'スポット 30-100万円' },
    ],
    content: [
      { format: 'ブログ / Zenn', title: '「今週の Claude Code 実験ログ」', angle: '観測された Qiita 記事の実追試 + 自分のリポジトリでの結果' },
      { format: 'YouTube', title: 'ライブコーディング: 1時間で MVP を Claude Code で作る', angle: 'ライブでの試行錯誤自体が価値' },
      { format: 'GitHub リポ', title: '「AI Coding Cookbook」パターン集', angle: 'コミュニティに Star が付きやすい形で知見を蓄積' },
    ],
    saas: [
      { title: 'AI コーディング品質メトリクス SaaS', target: 'AI 導入した開発組織', hypothesis: 'AI が書いたコードの品質を継続測定する仕組みがない' },
      { title: 'マルチエージェント統合ダッシュボード', target: '複数の AI コーディングツールを併用するチーム', hypothesis: 'Cursor/Copilot/Claude Code の稼働状況・コスト・出力を一元管理したい' },
    ],
  },
  'ai-content-generation': {
    audience: [
      'ブロガー / インフルエンサー',
      '広告代理店 / SNS 運用担当',
      'YouTuber / ポッドキャスター',
      '出版・編集業界の個人',
    ],
    monetization: [
      { title: 'AI 生成コンテンツ品質チェック代行', desc: 'ハルシネーション・SEO・トーン整合を人が最終チェック', barrier: '低', revenue: '記事1本 5,000-30,000円' },
      { title: 'テンプレート付き AI ワークフロー販売', desc: 'Notion + Claude/GPT のテンプレをセット販売', barrier: '低', revenue: '3,000-15,000円' },
      { title: '業種別 AI 画像・動画パイプライン構築', desc: '不動産・EC 等向けの画像大量生成パイプラインを SaaS 化前段階で受託', barrier: '中', revenue: '10-50万円 / スポット' },
    ],
    content: [
      { format: 'Newsletter', title: '週次: 「今週バズった AI 生成コンテンツの分解」', angle: '実際のバイラル投稿を構造分析' },
      { format: 'YouTube', title: '「AI で作った動画チャンネルを 3 ヶ月運営してみた」', angle: '運営 KPI をリアルタイム公開' },
      { format: 'コース', title: 'Udemy: 「AI + Canva で SNS 素材を10倍速で作る」', angle: '実務スキル特化型' },
    ],
    saas: [
      { title: 'AI 生成コンテンツ検知 & 品質評価 SaaS', target: 'メディア / 教育機関', hypothesis: 'AI 生成の氾濫でオリジナル vs 生成の区別が需要になる' },
      { title: 'ブランドトーン学習型ライティング SaaS', target: '中規模ブランド', hypothesis: '汎用 AI ではトンマナが崩れる不満が定着' },
    ],
  },
  'ai-hardware': {
    audience: [
      'AI スタートアップの技術責任者',
      'データセンター事業関係者',
      'GPU / NPU リサーチャー',
      '省エネ / グリーン IT 志向の投資家',
    ],
    monetization: [
      { title: 'GPU クラウド最適化コンサル', desc: '既存の GPU 利用を効率化するアドバイザリー', barrier: '中', revenue: 'スポット 50-300万円' },
      { title: 'AI 推論エッジ導入支援', desc: '製造業などのエッジ AI 案件の PoC 代行', barrier: '中', revenue: 'PoC 100-500万円' },
      { title: 'AI ハードウェア動向レポート販売', desc: '国内外ベンダー動向の定期レポート', barrier: '低', revenue: '月額 3-10万円 (法人向け)' },
    ],
    content: [
      { format: 'ブログ', title: '「今週の AI 推論ハードウェア価格ウォッチ」', angle: '数値中心の資産型コンテンツ' },
      { format: 'YouTube', title: '「自作 AI ワークステーション ビルド log」', angle: 'ビルド動画は再生時間長く広告収益と親和性◎' },
      { format: 'Newsletter', title: '月次: 「主要 GPU クラウド価格ベンチ」', angle: '継続比較で法人購読を狙う' },
    ],
    saas: [
      { title: 'GPU クラスタ稼働率可視化 SaaS', target: 'AI スタートアップ', hypothesis: '高額 GPU を借りているが稼働率把握が甘い' },
      { title: 'AI 推論コスト予測ツール', target: '事業サイド', hypothesis: '推論コストの予測ができず本番展開の意思決定が遅れる' },
    ],
  },
  'infrastructure-outages': {
    audience: [
      '情シス / SRE / DevOps',
      'BCP 担当者 (中堅・大企業)',
      'クラウド運用会社',
      '中小事業者のシステム管理者',
    ],
    monetization: [
      { title: '障害時 BCP アドバイザリー', desc: '障害発生後 24 時間以内に入って復旧・対外説明を伴走', barrier: '中', revenue: 'スポット 50-200万円' },
      { title: 'システム可用性診断サービス', desc: '週次で監視設定・BCP をレビューするサブスク', barrier: '中', revenue: '月額 20-80万円' },
      { title: '障害事例データベース販売', desc: '業界別の障害事例と教訓を整理したデータベース', barrier: '低', revenue: '年額 10-50万円' },
    ],
    content: [
      { format: 'ブログ', title: '「今週の主要障害事例分析」', angle: '発生原因 → 対処 → 教訓の3段構成' },
      { format: 'ポッドキャスト', title: '「SRE の現場から」', angle: '匿名インタビュー形式で継続' },
      { format: 'Newsletter', title: '月次: 「主要クラウドの障害統計」', angle: '数値ベースの資産型' },
    ],
    saas: [
      { title: '中小向け障害通知アグリゲータ', target: '複数 SaaS を使う中小企業', hypothesis: '各サービスのステータスページを個別に見ていられない' },
      { title: '障害復旧手順ドキュメント自動生成', target: '情シスチーム', hypothesis: '障害対応ドキュメントが古く、いざという時に使えない' },
    ],
  },
  'security-breach': {
    audience: [
      '情シス / セキュリティ担当者',
      '中小企業の経営者',
      '個人事業主 (取引先の要求で対策が必要)',
      '個人 (自分の情報漏洩を心配する層)',
    ],
    monetization: [
      { title: 'セキュリティ診断サービス', desc: '中小企業向けのライトな脆弱性診断', barrier: '中', revenue: 'スポット 20-100万円' },
      { title: 'インシデント対応リテナー', desc: '契約企業に何かあった時に即対応するリテナー契約', barrier: '中', revenue: '月額 5-30万円' },
      { title: '実務者向けセキュリティ研修', desc: '事例ベースの短時間研修を法人向けに提供', barrier: '低', revenue: '1回 15-50万円' },
    ],
    content: [
      { format: 'YouTube / TikTok', title: '「今週の情報漏洩ニュース解説」', angle: '一般人向けにやさしく解説してリーチを取る' },
      { format: 'Newsletter', title: '中小経営者向け「今週のセキュリティ危機」', angle: '専門用語を使わず経営目線でまとめる' },
      { format: 'ブログ / 書籍', title: '「はじめての情報セキュリティ」', angle: '検索流入 + Kindle 収益の複線' },
    ],
    saas: [
      { title: '中小向けセキュリティ健康診断 SaaS', target: '30人未満の企業', hypothesis: '大企業向けツールは高すぎ、中小には需要と供給のギャップがある' },
      { title: '個人向け情報漏洩通知サービス', target: '一般個人', hypothesis: '自分のメアドが漏れたか常時知りたいニーズが継続' },
    ],
  },
  'payment-troubles': {
    audience: [
      '小売・飲食店主',
      'EC 事業者',
      '決済インフラエンジニア',
      '個人事業主 (キャッシュレス対応が急務)',
    ],
    monetization: [
      { title: '中小店舗向け決済導入・切替コンサル', desc: 'PayPay/楽天/Stripe など最適構成の設計と設定代行', barrier: '低', revenue: '導入1店舗 5-20万円' },
      { title: '決済トラブル解決サポート', desc: '月額サブスクで決済関連の相談窓口', barrier: '低', revenue: '月額 5,000-20,000円' },
      { title: '決済横断ダッシュボードの受託構築', desc: '複数決済の管理画面を統合する開発案件', barrier: '中', revenue: 'プロジェクト 50-200万円' },
    ],
    content: [
      { format: 'ブログ', title: '「中小店主のためのキャッシュレス完全ガイド」', angle: '検索意図が明確、長期資産型' },
      { format: 'YouTube', title: '「決済トラブル現場レポ」', angle: '実店舗訪問して問題解決の一部始終' },
      { format: 'Newsletter', title: '週次: 「主要決済サービスの障害まとめ」', angle: '事業者にとって即実用性がある' },
    ],
    saas: [
      { title: '決済失敗リカバリー自動化 SaaS', target: 'EC 事業者', hypothesis: '決済失敗はカゴ落ちに直結、リトライ自動化に需要' },
      { title: 'マルチ決済統合レポート SaaS', target: '複数決済併用の中規模店', hypothesis: '会計処理・売上分析の分断が痛点' },
    ],
  },
  'home-server-selfhost': {
    audience: [
      '技術好きの個人 (ホビー層)',
      'プライバシー志向のパワーユーザー',
      '小規模チームの内製派エンジニア',
      'クラウドコスト削減を狙う個人事業主',
    ],
    monetization: [
      { title: 'セルフホスト構築支援', desc: 'Nextcloud/Home Assistant/Immich 等の初期構築代行', barrier: '低', revenue: '1件 3-15万円' },
      { title: 'ホームラボ機材のキュレーション販売', desc: 'アフィリエイト + セットアップ動画で収益化', barrier: '低', revenue: '成果報酬型' },
      { title: 'セルフホスト月額メンテナンス', desc: 'アップデート・バックアップ確認を代行', barrier: '低', revenue: '月額 3,000-10,000円/世帯' },
    ],
    content: [
      { format: 'YouTube', title: '「1万円のホームサーバー構築 log」', angle: '価格帯別ビルドで再生数を狙う' },
      { format: 'ブログ', title: '「Nextcloud で家族の写真を全部セルフホスト」', angle: '検索性能◎ + アフィリエイト親和性◎' },
      { format: 'コミュニティ', title: 'Discord: 「日本の Homelab」', angle: 'コミュニティ化して長期資産化' },
    ],
    saas: [
      { title: 'セルフホストサービスの死活監視 SaaS (無料枠あり)', target: 'Homelab ユーザ', hypothesis: '自宅サーバーが落ちても気付けない痛点' },
      { title: 'セルフホストレシピ配布プラットフォーム', target: '入門者', hypothesis: 'docker-compose のコピペ元が散らばっていて中央集約に需要' },
    ],
  },
  'remote-work': {
    audience: [
      'リモートワーク推進中の人事',
      'ハイブリッド勤務の中間管理職',
      'フルリモートで働きたい個人',
      '地方移住検討層',
    ],
    monetization: [
      { title: 'ハイブリッド勤務制度設計コンサル', desc: '就業規則・評価制度・オフィスレイアウトまで一気通貫', barrier: '中', revenue: 'プロジェクト 100-500万円' },
      { title: 'リモート採用支援', desc: 'エンジニア以外もリモート採用したい企業の支援', barrier: '中', revenue: '成果報酬型 or 月額 30-100万円' },
      { title: 'リモートワーク環境の物販 + アフィリエイト', desc: 'デスク・チェア・照明・オーディオを YouTube でレビュー', barrier: '低', revenue: '成果報酬型' },
    ],
    content: [
      { format: 'YouTube', title: '「地方に住みながら都会の仕事をする1週間」', angle: 'ライフスタイル系で継続視聴を取る' },
      { format: 'ブログ / Podcast', title: '「フルリモート企業の中の人インタビュー」', angle: '匿名 + 実データで信頼を得る' },
      { format: 'Newsletter', title: '週次: 「今週のリモートワーク求人まとめ」', angle: '継続購読を取りやすい' },
    ],
    saas: [
      { title: 'ハイブリッド勤務用の出社スケジュール調整 SaaS', target: '中堅企業', hypothesis: '週に何日出社するかの調整が Excel/Slack で回っており改善余地大' },
      { title: 'リモート勤務者の生産性可視化ツール (プライバシー保護型)', target: 'マネージャ層', hypothesis: '成果ではなくアクティビティ監視は嫌われる、健全な指標に需要' },
    ],
  },
  'senior-health': {
    audience: [
      '介護家族 (親の健康を気にする 40-60代)',
      '高齢者本人 (アクティブシニア層)',
      'ケアマネ・介護事業者',
      '製薬・ヘルスケア企業',
    ],
    monetization: [
      { title: '認知症予防プログラム講師', desc: '週次のオンライン運動 / 脳トレクラスを主催', barrier: '低', revenue: '月額 3,000-10,000円/人' },
      { title: '介護家族向けカウンセリング', desc: '孤立しがちな介護家族へのメンタルサポート', barrier: '中', revenue: '1回 5,000-15,000円' },
      { title: 'シニア向け商品のキュレーション EC', desc: '転倒防止靴・見守りグッズ等の厳選 EC', barrier: '中', revenue: '粗利ベース' },
    ],
    content: [
      { format: 'YouTube', title: '「親の認知症、介護1年目のリアル」', angle: 'ドキュメンタリー型で共感を取る' },
      { format: 'Newsletter', title: '週次: 「認知症予防エビデンス最新」', angle: 'arXiv/PubMed 由来で医療従事者にも刺さる' },
      { format: 'ブログ', title: '「地方在住の親を東京から見守る」', angle: '検索意図の明確な悩み系' },
    ],
    saas: [
      { title: '見守りアプリの家族版統合ダッシュボード', target: '離れて暮らす家族', hypothesis: '複数の見守りツール (センサ/カメラ/アプリ) が分散して見づらい' },
      { title: '認知機能セルフチェック定期便', target: 'アクティブシニア本人', hypothesis: '早期発見の需要 vs 病院に行きたくない心理のギャップ' },
    ],
  },
  'ai-regulation': {
    audience: [
      '法務・コンプライアンス担当',
      '生成AI導入企業の PM',
      'AI 政策・シンクタンク関係者',
      'AI プロダクトを海外展開する開発者',
    ],
    monetization: [
      { title: '生成AI 利用ガイドライン策定支援', desc: '企業の AI 利用ポリシーとチェック体制の設計', barrier: '中', revenue: 'プロジェクト 100-400万円' },
      { title: 'AI 規制動向レポートの法人向けサブスク', desc: '国内外の AI 規制動向を月次レポート', barrier: '中', revenue: '月額 5-30万円 (法人)' },
      { title: 'AI 監査サービス', desc: 'モデル利用実態のリスク監査', barrier: '高', revenue: '年次 100-500万円' },
    ],
    content: [
      { format: 'Newsletter', title: '月次: 「世界の AI 規制 30 分アップデート」', angle: '法務にとって購読価値が高い' },
      { format: 'ブログ / SNS', title: '「生成AI 事故事例 wiki」', angle: '共同編集で権威性を築く' },
      { format: 'ポッドキャスト', title: '「AI と法律」', angle: '専門家対談で権威と広告収益' },
    ],
    saas: [
      { title: 'AI プロンプト / 出力のコンプラチェック SaaS', target: '大企業の情シス', hypothesis: 'AI 利用ルールを守っているか自動監査する需要が急上昇' },
      { title: 'AI 倫理レビュー ワークフロー SaaS', target: 'AI 開発企業', hypothesis: '社内でのリリース前レビューを型化したい' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 悩みキーワード抽出のためのパターン
// evidence titles や topItems titles をこれに引っかけて「悩み文」を推定
// ---------------------------------------------------------------------------

// 「悩み・関心事」を示唆する語彙。実タイトルからの抽出精度を上げるため広めに取る。
// (「実際に観測された記事から悩みを推定した」ことを UI で明示するので、
// broad match でも捏造にはならない — 出典を辿れる)
const PROBLEM_PATTERNS = [
  /(困|悩|課題|問題|エラー|失敗|難しい|できない|できず|対応|対策|落ちた|障害|漏洩|流出|遅い|重い|バグ|不具合|止ま)/,
  /(守り方|使い方|攻略|解決|方法|コツ|ハマ|つらい|大変|面倒|高い|安い|節約|効率)/,
  /(どうする|どうやって|やり方|活用|導入|運用|設計|統制|管理|整理|レビュー)/,
  /(選び方|比較|違い|とは|意味|理解)/,
];

/** タイトルが「悩み・関心事」系の signal を含むか */
function looksLikeProblem(title) {
  if (!title || title.length < 5) return false;
  return PROBLEM_PATTERNS.some((re) => re.test(title));
}

/** タイトルから最大 30 字程度の悩み文に整形 */
function shortenAsProblem(title) {
  // GitHub - foo/bar: プレフィックスを除去
  let t = title.replace(/^GitHub - [^:]+:\s*/i, '');
  // 記事ID・末尾のクレジット記号を除去
  t = t.replace(/\s+-\s+[^-]+$/, '');
  t = t.trim();
  if (t.length > 60) t = t.slice(0, 58) + '…';
  return t;
}

// ---------------------------------------------------------------------------
// momentum / beginner / competition のヒューリスティック
// ---------------------------------------------------------------------------

function classifyMomentum(demand) {
  const g = demand._growthDetail || {};
  const changePct = Number.isFinite(demand.change) ? demand.change : 0;
  const hasData = demand._hasEnoughGrowthData;

  if (!hasData) return { label: '判定困難', score: 0, reason: '基準期間のニュース数が少なく、伸びの判定に必要なデータが不足しています。' };
  if (changePct >= 100) return { label: '加速', score: Math.min(100, 60 + Math.round(changePct / 5)), reason: `直近2日=${g.recent2Days}件 / 前5日平均比 +${changePct}% (${g.window})` };
  if (changePct >= 20)  return { label: '成長中', score: 45 + Math.round(changePct / 4), reason: `直近2日=${g.recent2Days}件 / 前5日平均比 +${changePct}%` };
  if (changePct >= -5)  return { label: '定着', score: 40, reason: `直近2日=${g.recent2Days}件、前5日平均と同水準を維持` };
  if (changePct >= -30) return { label: '減速', score: 25, reason: `直近2日=${g.recent2Days}件、前5日平均比 ${changePct}%` };
  return { label: '沈静化', score: 10, reason: `直近2日=${g.recent2Days}件、大きく落ち込み` };
}

function evaluateBeginnerFriendliness(demand) {
  // 信号 (それぞれ 0-25 点相当、合計で 0-100)
  const signals = [];
  let score = 40; // ベース

  // 1. App Store に既製品があるか (製品存在 = 参入余地の明確化にプラス)
  const apps = demand._appstoreDetail?.nativeMetrics?.matchedAppCount || 0;
  if (apps === 0) {
    score += 15; signals.push('既製アプリがない → 空白市場');
  } else if (apps <= 3) {
    score += 5; signals.push(`既製アプリが少数 (${apps}件) → 差別化余地あり`);
  } else {
    score -= 10; signals.push(`既製アプリが多数 (${apps}件) → 差別化難`);
  }

  // 2. Qiita 記事量 (多い = ノウハウが公開されている = 学びやすい)
  const qiitaVol = demand._qiitaDetail?.nativeMetrics?.articleCount || 0;
  if (qiitaVol >= 100) {
    score += 15; signals.push(`Qiita に ${qiitaVol} 記事、学習素材豊富`);
  } else if (qiitaVol >= 20) {
    score += 5;  signals.push(`Qiita に ${qiitaVol} 記事、ノウハウ収集可`);
  } else {
    score -= 5; signals.push(`Qiita 記事が少なく (${qiitaVol})、独学は手探り`);
  }

  // 3. arXiv 論文量 (多い = アカデミック障壁が高い)
  const arxivVol = demand._arxivDetail?.nativeMetrics?.paperCount || 0;
  if (arxivVol >= 500) {
    score -= 15; signals.push(`arXiv 論文 ${arxivVol} 本、アカデミック障壁高`);
  } else if (arxivVol >= 100) {
    score -= 5;  signals.push(`arXiv 論文 ${arxivVol} 本、ある程度の学術素養が必要`);
  }

  // 4. ニュース多い = 一般に知られている → 導入しやすい
  const newsN = demand._matchingArticleCount || 0;
  if (newsN >= 10) {
    score += 5; signals.push(`ニュース ${newsN} 件、一般認知あり`);
  }

  score = Math.max(0, Math.min(100, score));
  let label;
  if (score >= 70)      label = '高い';
  else if (score >= 55) label = 'やや高い';
  else if (score >= 40) label = '中程度';
  else if (score >= 25) label = 'やや低い';
  else                  label = '低い';

  return { score, label, signals };
}

function evaluateCompetition(demand) {
  const signals = [];
  let score = 20; // ベース

  // 1. App Store の混雑度
  const apps = demand._appstoreDetail?.nativeMetrics?.matchedAppCount || 0;
  const bestRank = demand._appstoreDetail?.nativeMetrics?.bestRank;
  if (apps >= 5) {
    score += 25; signals.push(`App Store に ${apps} 本 (best rank #${bestRank || '-'}) → 激戦`);
  } else if (apps >= 2) {
    score += 15; signals.push(`App Store に ${apps} 本 → 一定の競合`);
  }

  // 2. Qiita 執筆者数 = 参入者数の代理指標
  const authors = demand._qiitaDetail?.nativeMetrics?.uniqueAuthors || 0;
  if (authors >= 500) {
    score += 25; signals.push(`Qiita 執筆者 ${authors} 名 → 個人プレイヤー多数`);
  } else if (authors >= 50) {
    score += 15; signals.push(`Qiita 執筆者 ${authors} 名`);
  } else if (authors <= 20) {
    score -= 5;  signals.push(`Qiita 執筆者 ${authors} 名、まだ少ない`);
  }

  // 3. arXiv 論文量 = アカデミック競合
  const papers = demand._arxivDetail?.nativeMetrics?.paperCount || 0;
  if (papers >= 1000) {
    score += 20; signals.push(`arXiv 論文 ${papers} 本 → 世界規模で研究が加熱`);
  } else if (papers >= 100) {
    score += 10; signals.push(`arXiv 論文 ${papers} 本 → 研究が進行中`);
  }

  // 4. Wikipedia 30d PV = 一般認知度 (高いほど競合参入も進む)
  const wikiPV = demand._wikipediaDetail?.totalPageviews30d || 0;
  if (wikiPV >= 10000) {
    score += 10; signals.push(`Wikipedia 月間 ${wikiPV.toLocaleString()} PV → 一般認知高、既存プレイヤー既に居る想定`);
  }

  score = Math.max(0, Math.min(100, score));
  let label;
  if (score >= 75)      label = '激戦';
  else if (score >= 55) label = '混雑';
  else if (score >= 35) label = 'やや競争';
  else if (score >= 20) label = 'ゆるい';
  else                  label = '空白';

  return { score, label, signals };
}

// ---------------------------------------------------------------------------
// whyTrending の synthesis
// ---------------------------------------------------------------------------

/**
 * 総合判定 (verdict) — 「結局このテーマは今どんな局面か」を 1 語 + 1 文で。
 *
 * 意思決定者は、矛盾する signal (Wikipedia -40% と Qiita +N% など) を
 * 眺めても判断できない。ここで判定を 1 個に統合してから根拠 signals を並べる。
 *
 * 判定基準:
 *   拡大局面   momentum >= 70 かつ (Wikipedia growth > +10% or newsN >= 8)
 *              → 一般認知と勢いが揃っている。参入コストが上がる前の窓
 *   実装フェーズ momentum >= 60 かつ Qiita 記事密度が高い (>= 50)
 *              → 開発者コミュニティが実装ノウハウを共有中。技術参入好機
 *   認知拡大中  Wikipedia growth > +25% で momentum < 60
 *              → 一般関心先行、実装コミュニティはこれから
 *   鎮静化中   momentum < 40 かつ Wikipedia growth < -20%
 *              → ピーク後、関心が落ち着いた
 *   様子見     上記いずれも該当しない
 */
function buildVerdict(demand) {
  const m = classifyMomentum(demand);
  const wGrowth = Number(demand._wikipediaDetail?.growthPercent) || 0;
  const wPV = Number(demand._wikipediaDetail?.totalPageviews30d) || 0;
  const qArt = Number(demand._qiitaDetail?.nativeMetrics?.articleCount) || 0;
  const xVol = Number(demand._arxivDetail?.nativeMetrics?.paperCount) || 0;
  const newsN = Number(demand._matchingArticleCount) || 0;

  let label, rationale;
  if (m.score >= 70 && (wGrowth >= 10 || newsN >= 8)) {
    label = '拡大局面';
    rationale = `勢い ${m.score}/100 に加え、${wGrowth >= 10 ? `Wikipedia 閲覧が +${wGrowth}%` : `ニュース報道 ${newsN} 件`} で一般認知が広がっている。参入コストが上がる前の窓。`;
  } else if (m.score >= 60 && qArt >= 50) {
    label = '実装フェーズ';
    rationale = `勢い ${m.score}/100、Qiita に ${qArt} 記事 (直近30日) で開発者コミュニティが実装ノウハウを積極共有中。技術で参入する好機。`;
  } else if (wGrowth >= 25 && m.score < 60) {
    label = '認知拡大中';
    rationale = `Wikipedia 閲覧が +${wGrowth}% (計 ${wPV.toLocaleString()} PV) で一般関心が先行。実装コミュニティはまだ形成中。`;
  } else if (m.score < 40 && wGrowth <= -20) {
    label = '鎮静化中';
    rationale = `勢い ${m.score}/100、Wikipedia 閲覧も ${wGrowth}% と後退。ピーク通過の可能性、新規参入は慎重に。`;
  } else if (xVol >= 500 && qArt < 20) {
    label = '研究先行';
    rationale = `arXiv に ${xVol} 本の論文投稿。研究は活発だが Qiita 実装事例が ${qArt} 件と少なく、産業応用はまだ手薄。`;
  } else {
    label = '様子見';
    rationale = `勢い ${m.score}/100、明確なトリガー signal は観測されていない。次の 1-2 週間の変化を待ってから判断。`;
  }
  return { label, rationale };
}

function buildWhyTrending(demand) {
  const bullets = [];

  // ソース別の signal
  const wPV = demand._wikipediaDetail?.totalPageviews30d;
  const wGrowth = demand._wikipediaDetail?.growthPercent;
  if (Number.isFinite(wGrowth) && Math.abs(wGrowth) >= 15) {
    bullets.push({
      icon: '📚',
      type: 'wikipedia',
      text: `Wikipedia の閲覧が直近 30 日で ${wGrowth > 0 ? '+' : ''}${wGrowth}% (計 ${wPV?.toLocaleString?.() || wPV} PV) — 一般的な関心が${wGrowth > 0 ? '高まっている' : '落ち着いている'}兆候`,
    });
  }

  const qEng = demand._qiitaDetail?.nativeMetrics?.lgtmSum;
  const qArt = demand._qiitaDetail?.nativeMetrics?.articleCount;
  if (qArt && qArt >= 10) {
    bullets.push({
      icon: '💬',
      type: 'qiita',
      text: `Qiita に直近30日で ${qArt} 記事 (LGTM 合計 ${qEng})、技術者コミュニティで実装ノウハウが活発に共有中`,
    });
  }

  const xVol = demand._arxivDetail?.nativeMetrics?.paperCount;
  const xCat = demand._arxivDetail?.nativeMetrics?.primaryCategoryTop;
  if (xVol && xVol >= 20) {
    bullets.push({
      icon: '🔬',
      type: 'arxiv',
      text: `arXiv に直近30日で ${xVol} 本の論文投稿 (主分野 ${xCat}) — 研究者コミュニティが継続的に取り組み中`,
    });
  }

  const aApps = demand._appstoreDetail?.nativeMetrics?.matchedAppCount;
  const aBest = demand._appstoreDetail?.nativeMetrics?.bestRank;
  if (aApps && aApps > 0) {
    bullets.push({
      icon: '📱',
      type: 'appstore',
      text: `App Store JP に ${aApps} 本の関連アプリが登場 (最高 #${aBest}) — 消費者向け市場として既に立ち上がり中`,
    });
  }

  const newsN = demand._matchingArticleCount || 0;
  if (newsN >= 5) {
    bullets.push({
      icon: '📰',
      type: 'news',
      text: `ニュース記事 ${newsN} 件が観測、報道による社会的関心の獲得段階`,
    });
  }

  // ニュースタイトルから話題キーワードを抽出 (簡易)
  const evidenceTitles = (demand.evidence || []).map((e) => e.title).join(' ');
  const kwCounts = new Map();
  // 3-8 字の中で頻出する漢字/カタカナ塊
  const tokens = evidenceTitles.match(/[一-龠々]{2,6}|[ァ-ヴー]{3,10}|[A-Za-z]{3,15}/g) || [];
  for (const t of tokens) kwCounts.set(t, (kwCounts.get(t) || 0) + 1);
  const topKw = [...kwCounts.entries()]
    .filter(([w]) => !/^(こと|これ|それ|ため|よう|さん|する|される|できる|なる|なった|ある|いる|しました)$/.test(w))
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
  if (topKw.length > 0) {
    bullets.push({
      icon: '🔑',
      type: 'keywords',
      text: `直近ニュースで頻出: ${topKw.map((k) => `「${k}」`).join(' / ')}`,
    });
  }

  // ヘッドライン (最大 3 bullets を組み合わせて 1-2 文)
  const primaryDriver = bullets[0];
  let headline;
  if (!primaryDriver) {
    headline = 'このテーマは観測範囲が薄く、明確な伸びの理由を特定できません。';
  } else {
    const secondary = bullets.slice(1, 3).map((b) => b.text.split(' — ')[0]).join('、');
    headline = `主な観測: ${primaryDriver.text.split(' — ')[0]}。` +
               (secondary ? `加えて ${secondary}。` : '');
  }

  return { headline, signals: bullets };
}

// ---------------------------------------------------------------------------
// audience / problems の実データ寄せ込み
// ---------------------------------------------------------------------------

function buildAudience(themeId) {
  return THEME_PROFILES[themeId]?.audience || [];
}

function buildProblems(demand) {
  // 実観測されたタイトルから悩みっぽいものを最大 5 個ピック
  const seenTitles = new Set();
  const candidates = [];
  const sources = [
    { list: demand.evidence, key: 'title' },
    { list: demand._qiitaDetail?.topItems, key: 'title' },
    { list: demand._arxivDetail?.topItems, key: 'title' },
  ];
  for (const { list, key } of sources) {
    if (!Array.isArray(list)) continue;
    for (const it of list) {
      const title = it?.[key];
      if (!title || seenTitles.has(title)) continue;
      seenTitles.add(title);
      if (looksLikeProblem(title)) candidates.push(shortenAsProblem(title));
      if (candidates.length >= 8) break;
    }
    if (candidates.length >= 8) break;
  }
  return candidates.slice(0, 5);
}

// ---------------------------------------------------------------------------
// similarThemes: Jaccard 類似度 (relatedKeywords)
// ---------------------------------------------------------------------------

/** キーワードを小さなトークンに分解して部分一致を取れるようにする */
function tokenizeKeyword(kw) {
  const s = String(kw || '').trim().toLowerCase();
  if (!s) return [];
  // 空白 or ハイフン or ・ で分割 (「Claude Code」→ ["claude","code"])
  const parts = s.split(/[\s\-・/]+/).filter(Boolean);
  // 元の連結形も残す (「claudecode」的な結合も救う)
  return [...new Set([s, ...parts])];
}

function computeSimilarThemes(demands, themeIndex) {
  const out = new Map(); // themeId -> [{ id, similarity, sharedKeywords }]
  const kwSets = new Map(); // themeId -> Set<token>
  for (const d of demands) {
    const tokens = new Set();
    for (const kw of d._relatedKeywords || []) {
      for (const t of tokenizeKeyword(kw)) tokens.add(t);
    }
    kwSets.set(d.id, tokens);
  }
  for (const d of demands) {
    const setA = kwSets.get(d.id);
    const rows = [];
    for (const other of demands) {
      if (other.id === d.id) continue;
      const setB = kwSets.get(other.id);
      const inter = [...setA].filter((k) => setB.has(k));
      const uni = new Set([...setA, ...setB]);
      const sim = uni.size > 0 ? inter.length / uni.size : 0;
      rows.push({
        id: other.id,
        title: themeIndex[other.id]?.title || other.id,
        category: other.category,
        similarity: Math.round(sim * 1000) / 1000,
        sharedKeywords: inter,
      });
    }
    rows.sort((a, b) => b.similarity - a.similarity);
    // 少なくとも 3 個返す。similarity 0 でも「同カテゴリ」で fallback
    let top = rows.filter((r) => r.similarity > 0).slice(0, 3);
    if (top.length < 3) {
      const seen = new Set(top.map((r) => r.id));
      const sameCat = rows.filter((r) => r.category === d.category && !seen.has(r.id));
      top = [...top, ...sameCat].slice(0, 3);
    }
    out.set(d.id, top);
  }
  return out;
}

// ---------------------------------------------------------------------------
// nextActions
// ---------------------------------------------------------------------------

function buildNextActions(demand) {
  const actions = [];

  // 1. 観測をウォッチ
  actions.push({
    label: '観測を1週間ウォッチする',
    desc: `毎朝 JST 06:00 の更新で、Wikipedia / Qiita / arXiv / App Store の変化を追う。★お気に入り登録で Home に常時表示。`,
    effort: '15 分/日',
    kind: 'observe',
  });

  // 2. 競合ツール (App Store があれば触る)
  const apps = demand._appstoreDetail?.topItems || [];
  if (apps.length > 0) {
    actions.push({
      label: '既存アプリを 3 本触ってみる',
      desc: `App Store 上位: ${apps.slice(0, 3).map((a) => `${a.name} (#${a.rank})`).join(' / ')}。何が既に解決されていて、何が残っているかを確認。`,
      effort: '2 時間',
      kind: 'compete',
    });
  }

  // 3. 悩み整理
  const evN = (demand.evidence || []).length;
  if (evN >= 5) {
    actions.push({
      label: `${evN} 件のニュースから 3 つの悩み仮説を書く`,
      desc: `本ページの「実際のニュース」を上から順に読み、共通する困りごとを 3 つに集約する。仮説メモを残せば来週の変化と照らせる。`,
      effort: '30 分',
      kind: 'analyze',
    });
  }

  // 4. アイデアメモ
  actions.push({
    label: '今日のアイデアを 1 つ書き出す',
    desc: '下記の収益化 / コンテンツ / SaaS 候補から 1 つ選び、対象顧客と仮説を 3 行でメモ。書き溜めが後で効いてくる。',
    effort: '10 分',
    kind: 'ideate',
  });

  // 5. 共有
  actions.push({
    label: '同じ課題を持つ人に共有する',
    desc: 'このページの URL を Slack/X/知人に共有し、反応を集める。共感が集まればテーマとして有望。',
    effort: '5 分',
    kind: 'validate',
  });

  return actions;
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — Insights 生成');

  const raw = await readFile(DEMANDS_PATH, 'utf8');
  const payload = JSON.parse(raw);
  const demands = payload.demands || [];

  // similar 計算のためのインデックス
  const themeIndex = Object.fromEntries(demands.map((d) => [d.id, { title: d.title, category: d.category }]));
  const similarMap = computeSimilarThemes(demands, themeIndex);

  let filled = 0;
  for (const d of demands) {
    const profile = THEME_PROFILES[d.id] || {};

    const verdict     = buildVerdict(d);
    const whyTrending = buildWhyTrending(d);
    const momentum    = classifyMomentum(d);
    const beginner    = evaluateBeginnerFriendliness(d);
    const competition = evaluateCompetition(d);
    const problems    = buildProblems(d);
    const audience    = buildAudience(d.id);
    const monetization = profile.monetization || [];
    const content      = profile.content || [];
    const saas         = profile.saas || [];
    const similar      = similarMap.get(d.id) || [];
    const nextActions  = buildNextActions(d);

    // 既存の空フィールドを埋める (mockDemands 互換シェイプを維持)
    if (Array.isArray(d.audience) && d.audience.length === 0 && audience.length > 0) {
      d.audience = audience;
    }
    if (Array.isArray(d.problems) && d.problems.length === 0 && problems.length > 0) {
      d.problems = problems;
    }
    if (Array.isArray(d.businessOpportunities) && d.businessOpportunities.length === 0 && monetization.length > 0) {
      // mockDemands の shape に合わせる: { title, desc }
      d.businessOpportunities = monetization.map((m) => ({ title: m.title, desc: m.desc }));
    }

    d._insights = {
      version: 1,
      generatedAt: new Date().toISOString(),
      method: 'heuristic (rule-based, no LLM)',
      verdict,
      whyTrending,
      momentum,
      beginnerFriendliness: beginner,
      competition,
      audience,
      problems,
      monetization,
      content,
      saas,
      similarThemes: similar,
      nextActions,
    };
    filled++;
  }

  payload.insightsGeneratedAt = new Date().toISOString();
  payload.insightsMethod = 'heuristic-v1';

  const out = JSON.stringify(payload, null, 2) + '\n';
  await mkdir(dirname(DEMANDS_PATH), { recursive: true });
  await writeFile(DEMANDS_PATH, out, 'utf8');
  await mkdir(dirname(DEMANDS_PATH_PUBLIC), { recursive: true });
  await writeFile(DEMANDS_PATH_PUBLIC, out, 'utf8');

  console.log(`   ${filled} テーマに _insights を付与`);
  console.log(`   canonical: ${DEMANDS_PATH}`);
  console.log(`   mirror:    ${DEMANDS_PATH_PUBLIC}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
