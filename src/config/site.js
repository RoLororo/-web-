// ============================================================================
// site.js — サイト全体で使う「事実」の単一の置き場所
//
// 運営者名・連絡先・公開URL は About / プライバシーポリシー / 利用規約 /
// お問い合わせ / 構造化データ / sitemap の 5 か所以上から参照される。
// 散らばると必ず食い違うので、ここだけを書き換えれば全部に反映されるようにする。
//
// **CONTACT_FORM_URL は AdSense 申請前に必ず実物へ差し替えること。**
// 空のままだと /contact は「準備中」を表示し、審査で落ちる原因になる。
// ============================================================================

/** 本番の正規 URL（末尾スラッシュなし）。canonical / OGP / sitemap の基準 */
export const SITE_URL = 'https://demand-atlas.vercel.app';

/** サイト名 */
export const SITE_NAME = 'Demand Atlas';

/** 運営者の表示名。実名は出さない方針 */
export const OPERATOR = 'RoLororo';

/** 運営者の一言紹介。About と構造化データで使う */
export const OPERATOR_BIO = '日本の高校生。個人でこのサイトを開発・運用しています。';

/**
 * お問い合わせフォームの URL（Google フォーム）。
 * 未設定（空文字）の間は /contact が代替表示になる。
 */
export const CONTACT_FORM_URL = '';

/** 公開開始日。About で「いつから動いているか」を示す */
export const LAUNCH_DATE = '2026-07-20';

/** 観測している情報源。フッター・About・方法論ページで共通に使う */
export const SOURCES = [
  { name: 'Wikipedia 日本語版 日次閲覧数', what: 'そのテーマを調べた人がどれだけいたか', url: 'https://wikimedia.org/api/rest_v1/' },
  { name: 'Qiita',                        what: '技術者が実装ノウハウを書いた量',        url: 'https://qiita.com/api/v2/docs' },
  { name: 'arXiv',                        what: '研究者が論文を出した量',                url: 'https://arxiv.org/help/api/' },
  { name: 'App Store（日本）',            what: '既に売られている製品があるか',          url: 'https://performance-partners.apple.com/search-api' },
  { name: 'GitHub',                       what: '実際に作っている人がいるか',            url: 'https://docs.github.com/rest' },
  { name: '国立国会図書館サーチ',          what: '書籍として蓄積されているか',            url: 'https://ndlsearch.ndl.go.jp/help/api' },
  { name: '主要ニュース RSS（4 媒体）',    what: '報道としてどれだけ扱われたか',          url: null },
];

/** 需要スコアの定義。方法論ページと About が同じ数字を出せるようにする */
export const SCORE_FORMULA = {
  expression: 'スコア = 40 × ニュースの量 + 30 × 直近の伸び + 20 × 話題の広がり + 10 × 情報の新しさ',
  terms: [
    { key: 'ニュースの量',   weight: 40, desc: 'そのテーマを扱ったニュース記事が、観測期間中にどれだけ出たか。' },
    { key: '直近の伸び',     weight: 30, desc: '直近 2 日の観測量が、それ以前と比べて増えているか。' },
    { key: '話題の広がり',   weight: 20, desc: '7 つの情報源のうち、いくつで実際に観測できたか。1 か所だけで騒がれている状態と区別する。' },
    { key: '情報の新しさ',   weight: 10, desc: '観測できた情報が、どれだけ最近のものか。' },
  ],
};

/** 判定ラベルの意味。用語集と方法論ページで共通に使う */
export const VERDICTS = [
  { label: '拡大局面',   meaning: 'スコアと勢いがどちらも高く、報道でも扱われている状態。' },
  { label: '認知拡大中', meaning: '報道が先行していて、作り手や研究の動きはこれからの状態。' },
  { label: '研究先行',   meaning: '論文が多い一方で、報道や製品の動きが少ない状態。' },
  { label: '定着',       meaning: '観測量が高い水準で安定していて、急な増減がない状態。' },
  { label: '様子見',     meaning: '観測はできているが、判断できるほどの偏りがない状態。' },
  { label: '鎮静化中',   meaning: '直近の観測量が、それ以前より減っている状態。' },
  { label: '観測不足',   meaning: 'データが少なすぎて、スコアを額面どおりに受け取れない状態。' },
];
