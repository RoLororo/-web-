// ============================================================================
// scripts/extract-demand-candidates.mjs
//
// Demand Atlas — Phase 2: 需要テーマ候補の抽出 (ルールベース版)
//
//   ■ 目的
//     data/articles.json のニュース記事から、事前定義した「テーマ辞書」
//     との単純なキーワード照合で需要テーマ候補を抽出する。
//     AI API を接続する前に、
//       「今のニュースからどんな需要テーマが浮き上がるのか」
//       「ルールベースだけでどこまで意味のある結果が出るのか」
//     を可視化・検証するのが狙い。
//
//   ■ このスクリプトが やること
//     - articles.json を読み込む
//     - 事前定義した THEMES 辞書に対して、各記事のタイトル/概要で
//       キーワード出現をスコアリング
//     - 一定スコアを超えた記事を「そのテーマの根拠」として束ねる
//     - 根拠件数・キーワード多様性・鮮度から confidence を試算
//     - 結果を data/demand-candidates.json に保存
//     - コンソールに要約を表示
//
//   ■ このスクリプトが やらないこと (Phase 2 スコープ外)
//     - AI 分析 (Claude / OpenAI API)
//     - 検索トレンドの取得
//     - スコアからの需要スコア算出
//     - フロントエンドへの反映
//     - データベースへの保存
//     - 自動実行
//
//   ■ 使い方
//     npm run themes
//
//   ■ 依存
//     - Node.js 18+ の標準機能のみ (npm パッケージ追加なし)
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// パス
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const INPUT     = resolve(REPO_ROOT, 'data', 'articles.json');
const OUTPUT    = resolve(REPO_ROOT, 'data', 'demand-candidates.json');

// ---------------------------------------------------------------------------
// テーマ辞書 — 現時点は手動キュレーション
//
//   構造:
//     - id / name / category / summary は demand-candidates.json にそのまま
//       流れる
//     - keywords.hot   … 決定的なキーワード (少なくとも1つ含まれることが必須)
//     - keywords.warm  … 補助キーワード (組み合わせでスコアを稼ぐ)
//
//   将来 AI API に置き換わる部分は「テーマ名の生成」と「キーワードの充実」。
//   ルールベース段階では、そのプロトタイプとして人間が定義する。
// ---------------------------------------------------------------------------

const THEMES = [
  {
    id: 'ai-business-automation',
    name: 'AI業務自動化',
    category: 'AI・テクノロジー',
    summary: 'AIを使って業務や作業を自動化・効率化したい需要',
    keywords: {
      hot:  ['生成AI', 'ChatGPT', 'Claude', 'Copilot', 'LLM', '人工知能', ' AI'],
      warm: ['業務', '自動化', '効率化', '仕事', '活用', '生産性', '導入', 'ワークフロー'],
    },
  },
  {
    id: 'ai-coding',
    name: 'AI駆動のコード生成・開発支援',
    category: 'AI・テクノロジー',
    summary: 'エンジニアがAIをコーディングやレビューに活用する需要',
    keywords: {
      hot:  ['Claude Code', 'Copilot', 'Cursor', 'codex', 'GitHub Copilot'],
      warm: ['エンジニア', 'コード', 'コーディング', 'レビュー', 'IDE', '開発', 'リンター', 'CI'],
    },
  },
  {
    id: 'ai-content-generation',
    name: '生成AIによるコンテンツ制作',
    category: 'AI・テクノロジー',
    summary: 'AIによる動画・画像・音声・3Dなどコンテンツ生成の需要',
    keywords: {
      hot:  ['動画生成', '画像生成', '音声合成'],
      warm: ['動画', '画像', 'Blender', 'クリエイター', '3D', 'イラスト', '音楽', 'Netflix'],
    },
  },
  {
    id: 'ai-hardware',
    name: 'AI向けハードウェア・計算基盤',
    category: 'AI・テクノロジー',
    summary: 'GPU・専用チップなど AI 学習/推論向けハードウェアの需要',
    keywords: {
      hot:  ['NVIDIA', 'GPU', 'フィジカルAI', 'Rubin', 'H100'],
      warm: ['計算基盤', 'チップ', '半導体', 'データセンター', '学習', 'キオクシア'],
    },
  },
  {
    id: 'infrastructure-outages',
    name: 'システム障害・可用性への関心',
    category: 'ビジネス',
    summary: '大規模障害の頻発を背景にした、可用性・監視・復旧設計への需要',
    keywords: {
      hot:  ['障害', 'ダウン', '復旧', '不調'],
      warm: ['AWS', 'CloudFront', 'PayPay', 'システム', 'サービス', '停止', 'アクセス', '影響'],
    },
  },
  {
    id: 'security-breach',
    name: '個人情報漏洩・セキュリティ対策',
    category: 'ビジネス',
    summary: '相次ぐ情報漏洩・ランサム攻撃を背景にしたセキュリティ需要',
    keywords: {
      hot:  ['個人情報', '漏えい', '漏洩', 'ランサム', 'フィッシング', 'サイバー攻撃'],
      warm: ['情報', '流出', 'セキュリティ', '不正アクセス', '被害'],
    },
  },
  {
    id: 'payment-troubles',
    name: '決済インフラ・キャッシュレス',
    category: 'ビジネス',
    summary: '決済障害の顕在化を背景に、決済基盤の信頼性への需要',
    keywords: {
      hot:  ['決済', 'クレカ', 'クレジットカード', 'PayPay', 'Visa', 'Suica'],
      warm: ['カード', '支払い', '払え', 'キャッシュレス', '取引'],
    },
  },
  {
    id: 'home-server-selfhost',
    name: '自宅サーバー・セルフホスト',
    category: 'AI・テクノロジー',
    summary: '個人がサーバーを自宅で構築する「おうちラボ」需要',
    keywords: {
      hot:  ['自宅', 'ホームラボ', 'おうち', 'セルフホスト', 'homelab'],
      warm: ['サーバ', 'サーバー', 'ラボ', 'ラック', '構築', 'Docker'],
    },
  },
  {
    id: 'remote-work',
    name: 'リモートワーク・ハイブリッド勤務',
    category: 'ビジネス',
    summary: '出社回帰の流れの中で、柔軟な働き方への需要',
    keywords: {
      hot:  ['リモートワーク', '在宅勤務', 'ハイブリッド勤務'],
      warm: ['出社', '働き方', '勤務', 'テレワーク', 'GMO', '在宅'],
    },
  },
  {
    id: 'senior-health',
    name: '高齢者向け健康・認知症予防',
    category: '健康',
    summary: '認知症・健康寿命の関心が高い需要',
    keywords: {
      hot:  ['認知症', '高齢者', 'シニア'],
      warm: ['健康', 'サウナ', 'ボケ', '介護', '寿命'],
    },
  },
  {
    id: 'ai-regulation',
    name: 'AI規制・安全性・プライバシー',
    category: 'AI・テクノロジー',
    summary: 'AI の急速な普及に伴う規制・安全性・倫理面の需要',
    keywords: {
      hot:  ['規制', '安全性', 'プライバシー', '倫理'],
      warm: ['AI', '欧州委員会', 'Meta', '通知', '保護', '差別', '偽広告'],
    },
  },
];

// ---------------------------------------------------------------------------
// スコアリング
// ---------------------------------------------------------------------------

/**
 * 1 記事を 1 テーマに対して採点する。
 *
 *   タイトル hot 一致  = +3
 *   概要   hot 一致  = +2
 *   タイトル warm 一致 = +2
 *   概要   warm 一致 = +1
 *
 *   採用条件: hot が最低 1 つヒット かつ 合計スコア >= 4
 */
function scoreArticle(article, theme) {
  const title   = (article.title   || '').toLowerCase();
  const summary = (article.summary || '').toLowerCase();

  let score = 0;
  let hotHit = false;
  const hits = new Set();

  for (const kw of theme.keywords.hot) {
    const k = kw.toLowerCase();
    if (title.includes(k)) {
      score += 3; hotHit = true; hits.add(kw);
    } else if (summary.includes(k)) {
      score += 2; hotHit = true; hits.add(kw);
    }
  }
  for (const kw of theme.keywords.warm) {
    const k = kw.toLowerCase();
    if (title.includes(k)) {
      score += 2; hits.add(kw);
    } else if (summary.includes(k)) {
      score += 1; hits.add(kw);
    }
  }
  return { score, hotHit, hits: [...hits] };
}

/** 記事群の鮮度スコア (0..1)。30 日で 0 に線形減衰した平均。 */
function computeFreshness(publishedIsoDates) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let sum = 0, n = 0;
  for (const iso of publishedIsoDates) {
    if (!iso) continue;
    const ageDays = (now - Date.parse(iso)) / dayMs;
    const s = Math.max(0, 1 - ageDays / 30);
    sum += s; n++;
  }
  return n ? sum / n : 0;
}

/**
 * confidence (0..1) の試算式。
 *   50% ... 根拠件数 (8 件で飽和)
 *   30% ... キーワード多様性 (辞書のうち何種類ヒットしたか)
 *   20% ... 鮮度
 */
function computeConfidence({ evidenceCount, uniqueHits, totalKeywords, freshness }) {
  const evidence = Math.min(1, evidenceCount / 8);
  const variety  = totalKeywords ? Math.min(1, uniqueHits / totalKeywords) : 0;
  const raw = evidence * 0.5 + variety * 0.3 + freshness * 0.2;
  return Math.round(raw * 100) / 100;
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — 需要テーマ候補を抽出 (ルールベース)\n');
  console.log(`   入力: ${INPUT}`);
  console.log(`   出力: ${OUTPUT}`);

  const raw = await readFile(INPUT, 'utf8').catch(() => null);
  if (!raw) {
    console.error('✗ data/articles.json が見つかりません。先に `npm run news` を実行してください。');
    process.exit(1);
  }
  const articles = JSON.parse(raw);
  console.log(`   対象記事: ${articles.length} 件`);
  console.log(`   定義テーマ: ${THEMES.length} 件\n`);

  const candidates = [];

  for (const theme of THEMES) {
    const evidence = [];       // { article, score, hits }
    const hitCounter = new Map(); // keyword -> hit count across articles

    for (const article of articles) {
      const { score, hotHit, hits } = scoreArticle(article, theme);
      if (hotHit && score >= 4) {
        evidence.push({ article, score, hits });
        for (const h of hits) hitCounter.set(h, (hitCounter.get(h) || 0) + 1);
      }
    }

    if (evidence.length === 0) continue;

    const totalKeywords = theme.keywords.hot.length + theme.keywords.warm.length;
    const uniqueHits    = hitCounter.size;
    const freshness     = computeFreshness(evidence.map((e) => e.article.publishedAt));
    const confidence    = computeConfidence({
      evidenceCount: evidence.length,
      uniqueHits,
      totalKeywords,
      freshness,
    });

    // 頻度が高い上位キーワードを relatedKeywords に採用
    const relatedKeywords = [...hitCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k);

    // 根拠は publishedAt 新しい順に上位 20 件を保持
    const sortedEvidence = evidence
      .sort((a, b) => Date.parse(b.article.publishedAt || 0) - Date.parse(a.article.publishedAt || 0))
      .slice(0, 20);

    candidates.push({
      id: theme.id,
      theme: theme.name,
      summary: theme.summary,
      category: theme.category,
      relatedKeywords,
      evidenceArticleIds: sortedEvidence.map((e) => e.article.id),
      evidenceArticleCount: evidence.length,
      confidence,
      reason:
        `${uniqueHits} 種類のキーワードが ${evidence.length} 件の記事でヒット` +
        `（例：${relatedKeywords.slice(0, 3).join('、')}）`,
    });
  }

  // 根拠件数の多い順に並べる
  candidates.sort((a, b) => b.evidenceArticleCount - a.evidenceArticleCount);

  const output = {
    generatedAt:    new Date().toISOString(),
    totalArticles:  articles.length,
    themeCount:     THEMES.length,
    candidateCount: candidates.length,
    method:         'rule-based keyword matching',
    candidates,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');

  // コンソール要約
  console.log('──────────────  抽出結果  ──────────────');
  for (const c of candidates) {
    const bar = '█'.repeat(Math.min(20, c.evidenceArticleCount));
    console.log(`  ${c.evidenceArticleCount.toString().padStart(3)}件 [conf ${c.confidence.toFixed(2)}] ${bar}`);
    console.log(`         ${c.theme}  (${c.category})`);
    console.log(`         → ${c.relatedKeywords.join(', ')}`);
  }
  console.log('────────────────────────────────────────');
  console.log(`  候補テーマ: ${candidates.length} / ${THEMES.length}`);
  console.log(`  出力: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
