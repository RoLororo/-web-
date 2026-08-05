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

import { PATHS } from './lib/paths.mjs';
import { storage } from './lib/storage.mjs';

// ---------------------------------------------------------------------------
// パス
// ---------------------------------------------------------------------------

const INPUT  = PATHS.source.articles;
const OUTPUT = PATHS.source.candidates;

/**
 * 1 テーマあたり保持する根拠記事の最大数。
 *
 * build-demands.mjs は evidenceArticleIds を newsVolume / sourceDiversity /
 * freshness の 3 要素すべての入力に使うため、この上限がそのままスコアの
 * 上限になる。
 *
 * 2026-08-01 に 20 → 60 へ引き上げた。
 * 理由: フィードを 4 本 → 13 本に増やした結果、AI業務自動化 は 48 件
 * ヒットするようになったが、20 件で切られるため 21 件目以降が
 * スコアから完全に消えていた（48 件のテーマと 20 件のテーマが同点になる）。
 * 実測の最大が 48 件なので、当面の余裕を見て 60 とする。
 */
const MAX_EVIDENCE = 60;

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

  // ── 教育カテゴリ（2026-08-02 追加） ──────────────────────────────
  // 実装前に、提案したキーワードを実際のフィードに当てて検証した。
  //   学習法: STUDY HACKER 27 / ライフハッカー 2 / ICT教育 1 = 3 情報源 30 件
  //   受験:   リセマム 6 / STUDY HACKER 2 / ICT教育 1        = 3 情報源  9 件
  // どちらも昇格基準（3 情報源以上 かつ 5 件以上）を満たす。
  //
  // 同時に検討した「学校のデジタル化・EdTech」は、GIGAスクール /
  // 教育DX / デジタル教科書 などの語が 3 フィード 100 件に対して
  // **0 件**だったため作らなかった。証拠が無いテーマは置かない。
  {
    id: 'study-methods',
    name: '学習法・勉強効率',
    category: '教育',
    summary: '限られた時間で学び直し・スキル習得を進めたい需要',
    keywords: {
      // 「勉強」「学習」単体は広すぎて技術記事に誤爆するので hot に入れない。
      // 「インプット/アウトプット」も同様（Qiita/Zenn の記事に頻出）。
      //
      // 「独学」は hot から外して warm に落とした。実測（2026-08-02）で
      // 特許庁の記事が拾われ、原因は本文ではなく RSS 概要末尾の
      // 「独学の弁理士講座BBS…」というサイト定型文だった。
      // 概要には媒体の定型文が混ざるため、固有名詞になりうる語は hot に置かない。
      hot:  ['勉強法', '学習法', '記憶術', '暗記', '集中力', 'ノート術', '読書術',
             '脳科学', 'リスキリング', '学び直し', '資格取得'],
      // warm を広げた理由: 実測で hot に当たった 14 件のうち 6 件しか
      // 合計 4 点に届かず、「脳科学者が教えるストレスに強い脳のつくり方」
      // 「脳を消耗させる認知負荷の正体」のような明らかに学習の記事が
      // 3 点で落ちていた。共起語を足して拾えるようにする。
      warm: ['勉強', '学習', '記憶', '集中', '習慣', '思考法', '効率', 'スキル', '教養',
             '脳', 'ストレス', 'テクニック', '実践', '読書', 'ノート', '身につ', '独学'],
    },
  },
  {
    id: 'exam-admission',
    name: '受験・進学',
    category: '教育',
    summary: '志望校選び・入試対策など、進学に向けた情報の需要',
    keywords: {
      // 「受験」「進学」単体は資格試験や雑談に誤爆したため使わない
      // （実測: 電工二種試験 / 東大工学部のどこに進学したか、が引っかかった）。
      //
      // 「受験生」も外した。実測（2026-08-02）で特許庁の記事が拾われ、
      // 原因は「弁理士講座BBS では、受験生の質問にお答えしています」という
      // サイト定型文だった。学校の受験は 中学受験 / 大学受験 / 高校受験 /
      // 入試 で十分に拾える。
      hot:  ['中学受験', '大学受験', '高校受験', '入試', '志望校', '偏差値',
             '共通テスト', '予備校', '受験勉強', '受験対策'],
      // warm を広げた理由: 実測（2026-08-02）で 中学受験情報局 の記事が
      // hot に当たっても 2-3 点で落ちていた。同媒体の語彙は
      // 子 / 親 / 塾 / 成績 / 宿題 が中心で、旧 warm（併願・内申・奨学金）と
      // 噛み合っていなかった。hot 側が十分に限定的なので warm は広くてよい。
      warm: ['合格', '併願', '出願', '模試', '内申', '学費', '奨学金', '推薦', '大学', '高校',
             '成績', '塾', '対策', '学校', '保護者', '子ども', '我が子', '勉強',
             '過去問', '願書', '進路', '中学', '小学'],
    },
  },

  // ── 生活カテゴリ（2026-08-02 追加） ──────────────────────────────
  // 実装前に本物の判定式で測った結果（昇格基準: 3 情報源以上 かつ 5 件以上）
  //   住まい・住宅        4 情報源 / 18 件  ✓
  //   家電・暮らしの道具    4 情報源 /  7 件  ✓
  //   家計・節約          1 情報源 /  8 件  ✗ → **作らない**
  // 家計・節約は ノマド的節約術 1 本しか供給元が無く、他の候補
  // （ソレドコ / ヨムーノ）は中身が買い物ハウツーで節約の需要ではなかった。
  {
    id: 'housing',
    name: '住まい・住宅',
    category: '生活',
    summary: '住み替え・リノベ・断熱など、住まいをよくしたい需要',
    keywords: {
      hot:  ['マンション', '一戸建て', '戸建て', '賃貸', '住宅ローン', 'リノベーション',
             'リフォーム', '断熱', '間取り', '持ち家', '住み替え'],
      warm: ['住宅', '住まい', '物件', '不動産', '購入', '価格', '相場', '駅',
             '部屋', '暮らし', '家族', '快適', '万円'],
    },
  },
  {
    id: 'home-appliance',
    name: '家電・暮らしの道具',
    category: '生活',
    summary: '家電の買い替え・選び方・電気代など、暮らしの道具の需要',
    keywords: {
      // 「家電」は hot に入れない。実測（2026-08-02）で採用 21 件のうち
      // 10 件が窓の杜の Amazon セール記事になり、「ミニカップ麺ブタメンが
      // 安い」「ゼロカロリー炭酸が安い」まで家電需要の根拠に入った。
      // 個別の機器名だけを hot にすると 7 件すべてが実際の家電記事になる。
      hot:  ['冷蔵庫', '洗濯機', 'エアコン', '掃除機', '炊飯器', '電子レンジ', '食洗機',
             '加湿器', '除湿機', 'ドライヤー', '空気清浄機', '照明器具'],
      warm: ['家電', '価格', '発売', '購入', '便利', '快適', '省エネ', '収納',
             'キッチン', '暮らし', '電気代'],
    },
  },

  // ── 健康カテゴリの 2 テーマめ（2026-08-02 追加） ──────────────────
  // 実装前に本物の判定式で測った結果（昇格基準: 3 情報源以上 かつ 5 件以上）
  //   フィットネス・筋トレ  3 情報源 / 17 件  ✓
  //   睡眠の質            4 情報源 /  6 件  ✗ → **作らない**
  //   メンタルヘルス       1 情報源 /  1 件  ✗
  //   食事・栄養          2 情報源 /  2 件  ✗
  //
  // 睡眠の質は件数だけ見れば基準を満たすが、中身が
  // 「鯵干物のまぜ寿司」「高市首相の睡眠時間」「熱中症備忘録」で、
  // 6 件中 4 件が睡眠の需要と無関係だった。数字が基準を満たしても
  // 中身が伴わないテーマは作らない。
  {
    id: 'fitness-training',
    name: 'フィットネス・筋トレ',
    category: '健康',
    summary: '体を動かして体力・姿勢・見た目を変えたい需要',
    keywords: {
      hot:  ['筋トレ', 'トレーニング', 'ストレッチ', 'スクワット', '体幹', '筋肉',
             'プランク', '有酸素運動', 'ジム', 'ランニング'],
      warm: ['運動', '効果', '毎日', '姿勢', '柔軟', '股関節', '肩こり', '腰痛',
             '体力', '習慣', '分間'],
    },
  },

  // ── 未使用記事を活用するために追加（2026-08-02） ──────────────────
  // corpus 1,721 件のうち根拠になっていたのは 265 件 (15%) だけで、
  // 1,213 件 (70%) が完全に未使用だった。未使用記事を共起でクラスタリングし、
  // 候補 8 件を本物の判定式で測った結果:
  //
  //   脆弱性対応・パッチ管理  25 件（新規 24 / 重複 1）11 情報源 2.9 件/日 ← 採用
  //   熱中症・暑さ対策       25 件（新規 23 / 重複 2） 8 情報源 2.6 件/日
  //   AIエージェント         22 件（新規 10 / 重複 12） 8 情報源 2.0 件/日
  //   クラウド運用           14 件（新規 11 / 重複 3） 5 情報源
  //   Linux・OSS運用        13 件（新規 11 / 重複 2） 5 情報源
  //   スマホ選び              5 件（新規  4 / 重複 1） 4 情報源 0.3 件/日
  //   ゲーム・アニメ制作        5 件（新規  4 / 重複 1） 4 情報源
  //   スタートアップ・資金調達    0 件 ← 現 corpus には存在しない
  //
  // 熱中症は 25 件中 NHK 7 件が「熊本 地震活動が活発…熱中症対策を」のような
  // 災害・気象報道で、需要ではなかった。冬季に 0 件化する季節性もある。
  // AIエージェントは 22 件中 12 件が ai-business-automation / ai-coding と重複し、
  // 純増は 10 件しかない。
  //
  // 既存 security-breach の hot は 個人情報 / 漏えい / ランサム / サイバー攻撃 で、
  // 「脆弱性」を持たない。実測でも重複は 1 件だけだった。
  {
    id: 'vulnerability-response',
    name: '脆弱性対応・パッチ管理',
    category: 'ビジネス',
    summary: '公表された脆弱性に、どれだけ早く手を打てるかという需要',
    keywords: {
      hot:  ['脆弱性', 'CVE', 'ゼロデイ', 'セキュリティ更新', 'セキュリティアップデート'],
      warm: ['更新', '修正', '攻撃', '対策', 'アップデート', '緊急', 'リスク',
             '悪用', 'パッチ', '影響'],
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

  const articles = await storage.readJson(INPUT);
  if (!articles) {
    console.error('✗ data/articles.json が見つかりません。先に `npm run news` を実行してください。');
    process.exit(1);
  }
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

    // 根拠は publishedAt 新しい順に上位 MAX_EVIDENCE 件を保持
    const sortedEvidence = evidence
      .sort((a, b) => Date.parse(b.article.publishedAt || 0) - Date.parse(a.article.publishedAt || 0))
      .slice(0, MAX_EVIDENCE);

    candidates.push({
      id: theme.id,
      theme: theme.name,
      summary: theme.summary,
      category: theme.category,
      relatedKeywords,
      // このテーマを定義している語をすべて出す。
      //
      // relatedKeywords は「実際にヒットした上位 6 語」なので、辞書にあっても
      // その日たまたま記事が無い語は落ちる。検索でそれを落とすと、
      // 「勉強法」でも「偏差値」でも「掃除機」でも 0 件になる
      // （実測 2026-08-02: テーマ定義語 228 語のうち 165 語で、
      //   そのテーマ自身が検索に出てこなかった）。
      // 検索用途では辞書全体を持つ。
      searchTerms: [...new Set([...theme.keywords.hot, ...theme.keywords.warm])],
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

  await storage.writeJson(OUTPUT, output);

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
