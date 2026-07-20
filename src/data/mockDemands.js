// ============================================================================
// mockDemands.js
//
// フロントエンドプロトタイプで使用するダミーの需要データ。
// 実際のAPIやDBは接続せず、この配列のみを情報源とする。
//
// 将来 API に置き換えるときは demandService.js の実装のみを差し替える。
// このファイルの形式（フィールド名）は API レスポンス想定のスキーマ。
// ============================================================================

/** 需要ステータスの定数（表示ラベルとしても使う） */
export const STATUS = {
  HOT: '急上昇',
  GROW: '成長中',
  STABLE: '安定',
  DOWN: '下降',
};

/** カテゴリー一覧（フィルタチップ用） */
export const CATEGORIES = [
  'AI・テクノロジー',
  'ビジネス',
  '起業',
  '副業',
  '教育',
  '生活',
  'エンタメ',
  '健康',
  '美容',
];

/** カテゴリーの説明文 */
export const CATEGORY_DESCRIPTIONS = {
  'AI・テクノロジー': 'AI・自動化・新しいツールに関する需要。',
  'ビジネス': '企業活動・業務改善・BtoBサービスに関する需要。',
  '起業': '新規事業・スタートアップ支援に関する需要。',
  '副業': '個人が本業以外で収入や自己実現を得るための需要。',
  '教育': '学びなおし・スキル獲得・子育て教育に関する需要。',
  '生活': '日常生活の質の向上や困りごと解決に関する需要。',
  'エンタメ': '娯楽・コンテンツ体験に関する需要。',
  '健康': 'フィジカル・メンタル両面のヘルスケア需要。',
  '美容': '外見・自己ケアに関する需要。',
};

// ----------------------------------------------------------------------------
// trend データ生成ヘルパー
// ----------------------------------------------------------------------------

/**
 * 与えられたステータスと現在値から、それらしい形の時系列データを作る。
 * これは本物のデータではなく、UI 検証用の「それっぽい」ダミー。
 */
function buildTrend(status, current, length, seed = 1) {
  const arr = [];
  const rand = (i) => {
    // 決定論的な小さなノイズ
    const x = Math.sin((i + seed) * 12.9898) * 43758.5453;
    return (x - Math.floor(x) - 0.5) * 6;
  };
  for (let i = 0; i < length; i++) {
    const t = i / (length - 1);
    let base;
    switch (status) {
      case STATUS.HOT:
        // 直近で急激に上昇
        base = current * (0.4 + 0.6 * Math.pow(t, 2.4));
        break;
      case STATUS.GROW:
        // 継続的な右肩上がり
        base = current * (0.65 + 0.35 * t);
        break;
      case STATUS.STABLE:
        // ほぼ水平
        base = current * (0.94 + 0.06 * Math.sin(t * Math.PI));
        break;
      case STATUS.DOWN:
        // 徐々に下降
        base = current * (1.2 - 0.35 * t);
        break;
      default:
        base = current;
    }
    arr.push(Math.max(0, Math.round(base + rand(i))));
  }
  return arr;
}

// ----------------------------------------------------------------------------
// 需要データ本体
// ----------------------------------------------------------------------------

const RAW = [
  {
    id: 'ai-business-automation',
    title: 'AI業務自動化',
    category: 'AI・テクノロジー',
    score: 96,
    change: 18,
    status: STATUS.HOT,
    summary:
      '企業や個人が、日常業務をAIで効率化したいという需要が急速に高まっています。',
    description:
      '定型作業や情報整理、資料作成といった業務時間の多くを占める作業を、生成AIを組み合わせて自動化したいという声が幅広い業種で増加しています。特に人手不足に悩む中小企業や、少人数で事業を回す個人事業主からの関心が強く見られます。',
    audience: ['中小企業経営者', '個人事業主', 'バックオフィス担当者', '副業で業務代行を行う個人'],
    problems: [
      '毎日同じ作業に時間を取られている',
      'AIを使いたいが、何から始めればいいかわからない',
      '自社に合うAIツールがわからない',
      'AI導入の費用対効果が読めない',
    ],
    evidence: [
      { type: 'SNS上の悩み', title: '「業務 AI化」を含む投稿数が過去30日で増加', confidence: 0.8, checkedAt: '2026-07-19' },
      { type: '検索トレンド', title: '「AI 自動化 導入」の関連検索が過去90日で拡大', confidence: 0.75, checkedAt: '2026-07-20' },
      { type: 'ニュース', title: '生成AIの業務導入に関する報道が継続的に増加', confidence: 0.7, checkedAt: '2026-07-18' },
      { type: '求人', title: 'AI活用支援ポジションの求人が増加傾向', confidence: 0.65, checkedAt: '2026-07-17' },
    ],
    businessOpportunities: [
      { title: 'AI導入支援サービス', desc: '中小企業向けに、ヒアリングから運用定着までを一貫支援する伴走型サービス。' },
      { title: '初心者向けAI業務改善コンサルティング', desc: 'AIツールに詳しくない層向けに、まず何を自動化するかを整理して伴走。' },
      { title: '業界特化型AIツール', desc: '業種特有の書類・業務フローに特化した薄いAIプロダクト。' },
    ],
    breakdown: { search: 32, sns: 24, problems: 41, jobs: 18 },
    sourceCount: 12,
    confidence: '参考レベル',
    updatedAt: '2026-07-20T09:12:00+09:00',
  },
  {
    id: 'video-generation-ai',
    title: '動画生成AI',
    category: 'AI・テクノロジー',
    score: 89,
    change: 24,
    status: STATUS.HOT,
    summary:
      'テキストや画像から動画を生成する需要が急速に立ち上がっており、個人クリエイターや広告制作の現場で試行が広がっています。',
    description:
      'これまで動画制作は撮影・編集の負担が大きく参入障壁が高い領域でしたが、生成AIの精度向上により、SNS動画やプロトタイプ映像の制作コストが下がりつつあります。まだ画質・尺・一貫性に課題があるものの、試したい・導入したいという層の関心は非常に強い状態です。',
    audience: ['個人クリエイター', '広告代理店', 'マーケター', '中小企業のSNS担当'],
    problems: [
      '動画を作りたいが編集の時間がない',
      '外注コストが高く継続的に発注できない',
      'SNS向けの短尺動画を大量に作りたい',
    ],
    evidence: [
      { type: 'SNS上の悩み', title: '動画生成AIの活用事例投稿が急増', confidence: 0.85, checkedAt: '2026-07-19' },
      { type: '検索トレンド', title: '「動画生成 AI 無料」の検索ボリュームが上昇', confidence: 0.8, checkedAt: '2026-07-20' },
      { type: '商品・サービスの増加', title: '関連SaaSのリリースが継続', confidence: 0.7, checkedAt: '2026-07-15' },
    ],
    businessOpportunities: [
      { title: 'テンプレート型動画生成サービス', desc: '特定用途（求人・不動産・LP）に絞って動画を自動生成。' },
      { title: 'AI動画運用代行', desc: '毎週N本の運用動画を提供するサブスク型サービス。' },
    ],
    breakdown: { search: 28, sns: 34, problems: 21, jobs: 12 },
    sourceCount: 9,
    confidence: '参考レベル',
    updatedAt: '2026-07-20T08:40:00+09:00',
  },
  {
    id: 'ai-education-beginner',
    title: '生成AI初心者向け教育',
    category: '教育',
    score: 91,
    change: 21,
    status: STATUS.HOT,
    summary:
      '生成AIを「聞いたことはあるが使いこなせていない」層向けの、実務ベースの学習需要が高まっています。',
    description:
      '検索や画像生成の使い方を単発で紹介する情報は溢れる一方、実際の業務に組み込むための体系的な入門は依然として不足しています。ITリテラシーがそこまで高くない層でも安心して学べる、伴走型のカリキュラムに対する需要が強い状態です。',
    audience: ['非エンジニア職の会社員', '中高年の再学習層', '教育担当者', '副業希望者'],
    problems: [
      'AIを触ってみたが結局何に使えるかわからない',
      '記事や動画で断片的に学んでも定着しない',
      '社内で自分だけ取り残されている感覚がある',
    ],
    evidence: [
      { type: '検索トレンド', title: '「生成AI 使い方 初心者」が継続的に増加', confidence: 0.8, checkedAt: '2026-07-19' },
      { type: 'SNS上の悩み', title: '「AIについていけない」という趣旨の投稿が増加', confidence: 0.7, checkedAt: '2026-07-18' },
      { type: 'ニュース', title: 'リスキリング関連の政策・報道が継続', confidence: 0.7, checkedAt: '2026-07-16' },
    ],
    businessOpportunities: [
      { title: '職種別AIスクール', desc: '営業・経理・人事など、職種に絞った実務直結カリキュラム。' },
      { title: '社内AI活用チャンピオン育成', desc: '社内に伝道師を育てる企業向け短期研修。' },
    ],
    breakdown: { search: 40, sns: 22, problems: 30, jobs: 9 },
    sourceCount: 10,
    confidence: '参考レベル',
    updatedAt: '2026-07-20T07:30:00+09:00',
  },
  {
    id: 'side-hustle-efficiency',
    title: '副業の効率化',
    category: '副業',
    score: 88,
    change: 12,
    status: STATUS.GROW,
    summary:
      '本業の合間の限られた時間で副業を成立させるための、時間対効果を高めるツールやサービスへの需要が伸びています。',
    description:
      '副業を始める人が増える一方で、「時間が足りない」「本業が忙しい月は継続できない」といった継続の難しさが顕在化しています。案件獲得の効率化、請求・確定申告の負荷軽減、副業向けの学び直しなど、周辺領域を含めて需要が広がっています。',
    audience: ['会社員副業層', 'フリーランス予備軍', '子育て世代の在宅ワーカー'],
    problems: [
      '案件探しに時間がかかりすぎる',
      '本業繁忙期に副業が止まってしまう',
      '請求書や税務が面倒で続かない',
    ],
    evidence: [
      { type: '検索トレンド', title: '「副業 効率化」関連キーワードが安定して増加', confidence: 0.7, checkedAt: '2026-07-19' },
      { type: 'SNS上の悩み', title: '「副業 続かない」という投稿が定常的に発生', confidence: 0.7, checkedAt: '2026-07-18' },
      { type: '商品・サービスの増加', title: '副業マッチングサービスの新規参入が継続', confidence: 0.65, checkedAt: '2026-07-15' },
    ],
    businessOpportunities: [
      { title: '副業特化タスク管理', desc: '本業のカレンダーと連動して、副業に使える時間を可視化。' },
      { title: '副業向け会計SaaS', desc: '副業規模に最適化した超シンプルな請求・確定申告サービス。' },
    ],
    breakdown: { search: 22, sns: 26, problems: 33, jobs: 14 },
    sourceCount: 11,
    confidence: '参考レベル',
    updatedAt: '2026-07-20T06:00:00+09:00',
  },
  {
    id: 'online-education-personal',
    title: '個人向けオンライン教育',
    category: '教育',
    score: 81,
    change: 3,
    status: STATUS.STABLE,
    summary:
      '個人が自分の関心に合わせて学べる、小規模で専門的なオンライン学習への需要は安定して継続しています。',
    description:
      '大規模な学習プラットフォームだけでなく、特定テーマに深く踏み込んだ小規模な講座やコミュニティ型学習が、静かに支持を集め続けています。爆発的な急上昇はないものの、下がる気配のない定常需要です。',
    audience: ['自己投資意識の高い社会人', '専門職の学びなおし層', '副業準備層'],
    problems: [
      '広く浅い講座では実務に活かせない',
      '同じ関心の人と一緒に学びたい',
      '教材だけでは続かない',
    ],
    evidence: [
      { type: '検索トレンド', title: '専門テーマの学習キーワードが横ばいで推移', confidence: 0.75, checkedAt: '2026-07-19' },
      { type: '商品・サービスの増加', title: '個人講師によるオンライン講座が増加', confidence: 0.6, checkedAt: '2026-07-17' },
    ],
    businessOpportunities: [
      { title: 'コーホート型講座プラットフォーム', desc: '同時期に学ぶ仲間と伴走できる小規模学習体験。' },
      { title: '専門家×コミュニティ運営代行', desc: '講師が本業に集中できるよう運営を代行するサービス。' },
    ],
    breakdown: { search: 12, sns: 10, problems: 18, jobs: 7 },
    sourceCount: 8,
    confidence: '参考レベル',
    updatedAt: '2026-07-20T05:20:00+09:00',
  },
  {
    id: 'smb-marketing-support',
    title: '小規模事業者向けマーケティング支援',
    category: 'ビジネス',
    score: 76,
    change: 6,
    status: STATUS.GROW,
    summary:
      '小規模事業者が、自社で無理なく続けられるマーケティング施策を求める需要が着実に伸びています。',
    description:
      '広告代理店に依頼する予算はないが、SNSやMEO、簡単な広告運用は自分たちでやりたい――そんな小規模事業者のニーズが増えています。「大手向けの手法をそのまま持ち込まれても回せない」という不満と結びついています。',
    audience: ['店舗経営者', '士業・専門職', '地域中小企業', 'D2Cの個人ブランド'],
    problems: [
      '自分たちで運用できる範囲でやりたい',
      '効果が見えるまで継続できない',
      '外注してもナレッジが自社に残らない',
    ],
    evidence: [
      { type: '検索トレンド', title: '「MEO 自分で」「SNS運用 内製」の検索が漸増', confidence: 0.7, checkedAt: '2026-07-18' },
      { type: 'SNS上の悩み', title: '中小事業者の運用相談投稿が増加', confidence: 0.65, checkedAt: '2026-07-17' },
    ],
    businessOpportunities: [
      { title: '内製化伴走コンサル', desc: '外注ではなく自社で運用できる状態を目指す支援。' },
      { title: '業種別テンプレート集', desc: '飲食・美容・治療院など業種別のマーケ施策テンプレート。' },
    ],
    breakdown: { search: 18, sns: 14, problems: 22, jobs: 10 },
    sourceCount: 8,
    confidence: '参考レベル',
    updatedAt: '2026-07-20T04:40:00+09:00',
  },
  {
    id: 'senior-digital-support',
    title: '高齢者向けデジタル支援',
    category: '生活',
    score: 72,
    change: 8,
    status: STATUS.GROW,
    summary:
      'スマホ・行政手続き・オンライン診療などのデジタル領域で、高齢者やその家族を支援する需要が広がっています。',
    description:
      '行政サービスやコミュニケーションのオンライン化が進む一方で、使いこなせない層と支援する家族の負担が可視化されています。単発の教室ではなく、日常的に頼れる伴走型の支援へのニーズが強くなっています。',
    audience: ['高齢者本人', '離れて暮らす家族', '地域包括支援関係者'],
    problems: [
      '家族に毎回操作を聞かれる',
      '公式のマニュアルが読めない',
      '詐欺やトラブルが怖くて触れない',
    ],
    evidence: [
      { type: 'SNS上の悩み', title: '「親のスマホ設定」に関する投稿が定常的に多い', confidence: 0.75, checkedAt: '2026-07-19' },
      { type: 'ニュース', title: '高齢者向けデジタル格差を扱う報道が継続', confidence: 0.7, checkedAt: '2026-07-16' },
    ],
    businessOpportunities: [
      { title: '家族向け遠隔サポートアプリ', desc: '離れた家族が高齢者の端末をやさしく支援できる。' },
      { title: '地域密着型デジタル相談窓口', desc: '曜日ごとに巡回する“町のデジタル相談員”モデル。' },
    ],
    breakdown: { search: 10, sns: 22, problems: 26, jobs: 6 },
    sourceCount: 7,
    confidence: '参考レベル',
    updatedAt: '2026-07-20T03:15:00+09:00',
  },
  {
    id: 'personal-info-organizing',
    title: '個人の情報整理・管理',
    category: '生活',
    score: 71,
    change: 9,
    status: STATUS.GROW,
    summary:
      '書類・パスワード・サブスク・家族の情報など、生活まわりの情報を整理したい需要が伸びています。',
    description:
      '生活のあらゆる場面でアカウントや契約が増える一方、それらを一元的に把握できていないという不安が広がっています。ライフイベント（結婚・出産・介護）を機に整理を始める人が増加しています。',
    audience: ['共働き世帯', '介護に関わる家族', 'サブスクを多数契約している個人'],
    problems: [
      '契約中のサービスの全体像がわからない',
      '家族と情報が共有されていない',
      '万一のときに家族がアクセスできる自信がない',
    ],
    evidence: [
      { type: '検索トレンド', title: '「サブスク 管理」「エンディングノート デジタル」が増加', confidence: 0.7, checkedAt: '2026-07-19' },
      { type: 'SNS上の悩み', title: '家計や契約の見直し投稿が定常的', confidence: 0.65, checkedAt: '2026-07-17' },
    ],
    businessOpportunities: [
      { title: '家族で共有できる情報金庫', desc: '暗号化された情報を家族と限定共有できるサービス。' },
      { title: 'サブスク見直し代行', desc: '契約棚卸しと解約手続きを代行する時短サービス。' },
    ],
    breakdown: { search: 20, sns: 16, problems: 24, jobs: 4 },
    sourceCount: 7,
    confidence: '参考レベル',
    updatedAt: '2026-07-20T02:50:00+09:00',
  },
  {
    id: 'ai-personal-coach',
    title: 'AIパーソナルコーチ',
    category: '健康',
    score: 79,
    change: 15,
    status: STATUS.GROW,
    summary:
      '運動・食事・睡眠・メンタルなど、生活習慣を継続的に支援するAIコーチへの関心が伸びています。',
    description:
      'スマートウォッチや食事記録アプリが浸透するにつれ、単なる記録に留まらず、自分の状況に合わせて助言・励ましをくれる存在への需要が高まっています。人による指導は高価で継続しづらいため、AI活用の余地が見込まれています。',
    audience: ['健康意識の高い会社員', 'ダイエット継続層', '睡眠・メンタル改善希望層'],
    problems: [
      '記録はできても行動が変わらない',
      '一般論ではなく自分に合った助言が欲しい',
      '専門家に相談するほどではないが放置は不安',
    ],
    evidence: [
      { type: 'SNS上の悩み', title: '習慣化・継続のつまずきに関する投稿が多い', confidence: 0.7, checkedAt: '2026-07-19' },
      { type: '商品・サービスの増加', title: 'AI×ヘルスケアの新サービスが継続的にリリース', confidence: 0.65, checkedAt: '2026-07-15' },
    ],
    businessOpportunities: [
      { title: '特化型AIコーチ', desc: '不眠・食事・運動など、症状/目的に絞ったコーチング体験。' },
      { title: 'ウェアラブル連携伴走サービス', desc: '既存デバイスのデータを解釈して行動提案するSaaS。' },
    ],
    breakdown: { search: 24, sns: 20, problems: 28, jobs: 8 },
    sourceCount: 9,
    confidence: '参考レベル',
    updatedAt: '2026-07-20T01:10:00+09:00',
  },
  {
    id: 'sustainable-beauty',
    title: 'サステナブル美容',
    category: '美容',
    score: 66,
    change: 11,
    status: STATUS.GROW,
    summary:
      '肌や環境への負荷が少ないコスメ・サービスに対する関心が、若年層を中心に緩やかに広がっています。',
    description:
      '価格や流行だけでなく、成分や生産背景を含めて選ぶ購買行動が定着しつつあります。過剰な広告訴求への疲れも背景にあり、透明性のあるブランドへの信頼が需要を押し上げています。',
    audience: ['Z世代', '子育て中の親', '敏感肌の層'],
    problems: [
      '成分表示を見ても判断できない',
      '本当にサステナブルかどうか見分けられない',
      '選択肢が多すぎて疲れる',
    ],
    evidence: [
      { type: '検索トレンド', title: '「クリーンビューティー」「詰め替え」検索が漸増', confidence: 0.65, checkedAt: '2026-07-18' },
      { type: 'SNS上の悩み', title: 'グリーンウォッシュ懸念の投稿が増加', confidence: 0.6, checkedAt: '2026-07-16' },
    ],
    businessOpportunities: [
      { title: '成分ベースのレコメンドサービス', desc: '肌質・志向に応じて成分観点で提案するアプリ。' },
      { title: '詰め替えステーションの物販支援', desc: '既存小売店に詰め替え什器を提供するBtoB。' },
    ],
    breakdown: { search: 14, sns: 18, problems: 20, jobs: 5 },
    sourceCount: 6,
    confidence: '参考レベル',
    updatedAt: '2026-07-19T22:40:00+09:00',
  },
  {
    id: 'health-management',
    title: '健康管理サービス',
    category: '健康',
    score: 68,
    change: -2,
    status: STATUS.STABLE,
    summary:
      '記録型の健康管理サービスの需要は依然として大きいものの、伸びは鈍化しています。',
    description:
      '歩数計・体重記録・食事記録などの単純な記録機能は成熟してきており、単体アプリでの伸びは鈍化。むしろ他サービスと連携したり、行動変容につながる仕組みと組み合わされることで再び需要が伸びる可能性があります。',
    audience: ['シニア層', 'ダイエット希望層', '運動継続層'],
    problems: [
      '記録するだけで結局続かない',
      'サービスをまたぐと一元管理できない',
    ],
    evidence: [
      { type: '検索トレンド', title: '「健康管理 アプリ」検索が横ばい〜微減', confidence: 0.7, checkedAt: '2026-07-19' },
    ],
    businessOpportunities: [
      { title: '既存サービスの統合ダッシュボード', desc: '複数アプリのデータを1画面で見せる。' },
    ],
    breakdown: { search: 8, sns: 6, problems: 12, jobs: 4 },
    sourceCount: 5,
    confidence: '参考レベル',
    updatedAt: '2026-07-19T20:00:00+09:00',
  },
  {
    id: 'remote-work-support',
    title: 'リモートワーク支援',
    category: 'ビジネス',
    score: 63,
    change: -5,
    status: STATUS.DOWN,
    summary:
      '出社回帰の流れの中で、単純なリモートワーク支援ツールへの需要は緩やかに下降しています。',
    description:
      '一方で、ハイブリッド前提での「出社日を最大限活用するツール」「非同期コミュニケーションの改善」といったサブテーマは依然として需要があります。全体像は下降傾向でも、局所には機会が残っています。',
    audience: ['ハイブリッド勤務の企業', 'マネージャー層'],
    problems: [
      '出社日と在宅日で情報格差が生まれる',
      '会議ばかりで作業時間が確保できない',
    ],
    evidence: [
      { type: 'ニュース', title: '大手企業の出社回帰の報道が継続', confidence: 0.7, checkedAt: '2026-07-18' },
      { type: '検索トレンド', title: '「リモートワーク ツール」検索がゆるやかに減少', confidence: 0.65, checkedAt: '2026-07-17' },
    ],
    businessOpportunities: [
      { title: 'ハイブリッド最適化ツール', desc: '出社日程・座席・議題を最適化する軽量SaaS。' },
    ],
    breakdown: { search: -8, sns: -4, problems: 12, jobs: -6 },
    sourceCount: 6,
    confidence: '参考レベル',
    updatedAt: '2026-07-19T18:30:00+09:00',
  },
];

// trend データを付与
export const MOCK_DEMANDS = RAW.map((d, i) => ({
  ...d,
  trendData: {
    '7d': buildTrend(d.status, d.score, 7, i + 1),
    '30d': buildTrend(d.status, d.score, 30, i + 2),
    '90d': buildTrend(d.status, d.score, 90, i + 3),
  },
}));
