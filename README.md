# Demand Atlas — 需要可視化プロトタイプ

「今、世の中で何が求められているのか」を可視化する Web サービスです。

**7 つの公開情報源を毎日自動観測し、実データで動作します**（Wikipedia 日次閲覧数 /
Qiita / arXiv / App Store JP / GitHub / 国立国会図書館 / 主要ニュース RSS）。
API キーは不要、外部の有料サービスも使いません。取得は GitHub Actions が 1 日 1 回実行します。

`src/data/mockDemands.js` は**取得に失敗した時のフォールバック専用**で、通常は読み込まれません
（dynamic import で必要時のみ取得）。

目的は次を検証することです。

> 「世の中の需要を可視化する体験」に、ユーザーは本当に価値を感じるのか？

---

## クイックスタート

Node.js 18 以上を用意してください。

```bash
cd demand-atlas
npm install
npm run dev
```

ブラウザが `http://localhost:5173` を自動で開きます。

本番ビルドは `npm run build`、そのプレビューは `npm run preview`。

### データの取得と生成

```bash
npm run all          # 取得 → 検査 → 合成 → 判定 → 履歴 → public ミラーまで一括
npm run check        # 情報源の健全性だけ検査（読み取りのみ）
npm run themes:eval  # 追跡テーマの昇格・降格判定と新しい需要候補の種出し（読み取り + 評価ログ追記）
```

個別の取得は `npm run news / wiki / qiita / appstore / arxiv / github / ndl`。
合成は `npm run demands`、判定の生成は `npm run insights`、履歴の追記は `npm run history`。
`npm run all` は GitHub Actions の日次ワークフローが実行するものと同じです。

---

## 使用技術と選定理由

| 技術 | 理由 |
| --- | --- |
| **React 18** | コンポーネント分割が直感的で、初心者にも学習リソースが多い |
| **Vite** | 起動が数秒で、設定が最小 |
| **React Router v6** | 画面遷移を宣言的に書ける標準的な選択肢 |
| **プレーンな CSS** | Tailwind などを導入せず、CSS 変数だけでダーク/ライト両対応 |
| **SVG のグラフ** | Chart.js などの外部ライブラリに依存せず、追加インストール不要 |
| **localStorage** | ログインなしでお気に入り機能を提供 |

意図的に「複雑な機械学習」「バックエンド」「認証」「AWS/GCP」等は使っていません。

---

## 画面一覧

| ルート | 内容 |
| --- | --- |
| `/` | ホーム。今日訪れた人 + 今朝のダイジェスト + 需要ランキング + 分野フィルタ |
| `/demand/:id` | 需要の詳細。推移グラフ、スコア内訳、情報源別の実観測、判定、アイデア |
| `/ideas` | 全テーマ横断のアイデア一覧（収益化 / コンテンツ / SaaS） |
| `/rankings` | 全テーマ × 全情報源の横断ランキング |
| `/compare` | 2 テーマの並列比較 |
| `/changes` | 直近スナップショットとの差分 |
| `/timeline` | 日別に積み上がる観測データ |
| `/whats-new` | 新登場の情報源・指標・日別更新件数 |
| `/explore` | 検索・並び替え・分野・状態でのフィルタ |
| `/categories` | 分野の一覧（観測テーマ 0 件の分野はカードにしない） |
| `/categories/:name` | 単一分野の掘り下げ |
| `/favorites` | 保存した需要（localStorage） |
| `*` | 404 |

---

## アクセス分析（「今日訪れた人」とその基盤）

Home に出る「今日訪れた人 ○人」は **ページビューではなくユニーク訪問者数**です。
この仕組みは今後の分析基盤として設計してあり、指標や切り口を足しても
**キー設計と API の形は変えずに済む**ようにしてある。

| | |
|---|---|
| 数える単位 | ブラウザ単位。同じブラウザなら何回リロードしても、その日は 1 人 |
| 日付の境界 | **JST（Asia/Tokyo）**。0 時をまたぐと翌日ぶんとして再び 1 人 |
| 別ブラウザ / 別端末 | 別の人として数える（仕様） |
| 保存するもの | **整数カウンタ**と、許可リストを通った短い文字列（ルート名・流入元ホスト） |
| 保存しないもの | **IP・User-Agent・Cookie・訪問者 ID・URL のクエリ・流入元のパスは一切保存しない** |

同一人物の判定はブラウザの `localStorage` で行い、サーバーは「1 増やして」という
無記名の通知を受け取るだけ。誰が来たかはサーバーに残らない。

### データ構造（`api/_schema.js` が正本）

```
v1:d:<YYYY-MM-DD>:<metric>              日ごとの指標        例 v1:d:2026-07-31:visits
v1:d:<YYYY-MM-DD>:<dimension>:<value>   日ごと × 次元値      例 v1:d:2026-07-31:page:/rankings
v1:t:<metric>                           累計                例 v1:t:visits
v1:dim:<dimension>                      その次元に現れた値の一覧（SET）
```

- **指標**（単純カウンタ）: `visits` 訪問者 / `new` 新規 / `returning` 再訪
- **次元**（値ごとの内訳）: `page` 人気ページ / `referrer` 流入元ホスト
- 日別キーは 400 日で自然消滅。次元値は SET から読むので **SCAN 不要**（読み取り量が有界）

### 分析項目の増やし方

| やりたいこと | 触るところ |
|---|---|
| 指標を足す（例: ブックマーク数） | `METRICS` に 1 行 → GET の応答に自動で出る |
| 切り口を足す（例: 端末種別・国） | `DIMENSIONS` に 1 行 + サニタイザ 1 個 |
| 期間を足す（例: 今年・去年） | GET が読む日数を変えるだけ（キーは日別なので再集計できる） |
| 画面に出す | `visitorService` の戻り値 `metrics` / `breakdowns` を読むだけ |

`api/visit.js` は「スキーマに書いてあるものを数えて返す」だけなので、
**項目追加でエンドポイントを書き換える必要はない**。応答には `schema` バージョン
（現在 `visits/1.1`）が入るので、将来の形式変更も検出できる。

- `api/visit.js` … エンドポイント（GET = 集計、POST = 加算）
- `api/_schema.js` … 指標・次元・キー設計・サニタイズ（**増やすときはここ**）
- `api/_store.js` … 保存層。env が無ければ driver を作らない
- `src/services/visitorService.js` … 1 日 1 回の訪問通知と、ページ単位の重複排除
- `src/components/TodayVisitors.jsx` … 表示（数えられていない時は**何も描画しない**）

### 有効化に必要な設定

KV（Redis 互換）が未設定の間、API は `{ "available": false }` を返し、**Home には何も出ない**。
0 人と表示すると実測していない主張になるため、あえて非表示にしている。

1. Vercel のプロジェクト → Storage → Redis（Upstash・無料枠）を作成して Connect
2. 環境変数 `KV_REST_API_URL` と `KV_REST_API_TOKEN` が入る（Upstash 側の
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` でも動く）
3. 再デプロイすると表示が始まる

無料枠の消費は 1 訪問あたり INCR 2 回、閲覧側は **エッジで 60 秒キャッシュ**するため
ページビューが増えても KV への読み取りは 1 分 1 回に収まる。

---

## ファイル構成と各ファイルの役割

```
demand-atlas/
├── package.json               依存関係とスクリプト（21 本）
├── index.html                 エントリ HTML（OGP / meta もここ）
├── README.md
├── REVIEW_ENGINE.md           継続改善レビューの手順とモード定義（凍結寄り）
├── REVIEW_STATE.md            実測値・保留中の改善案・コマンド一覧（毎回更新）
│
├── .github/workflows/
│   └── daily-update.yml       日次で npm run all を実行し data/history を commit
│
├── config/                    情報源ごとのテーマ別マッピング（テーマ追加時に編集）
│   ├── qiita / appstore / arxiv / github / ndl-mapping.json
│   └── theme-registry.json    追跡テーマの状態と候補・却下語（needs: themes:eval）
│
├── scripts/                   取得・合成・判定・履歴（16 本・すべて Node 標準のみ）
│   ├── fetch-*.mjs            7 情報源の取得。共通 envelope で出力
│   ├── check-sources.mjs      情報源の健全性検査。致命時は exit 1 で公開を止める
│   ├── build-demands.mjs      スコア算出と合成 → data/demands.json
│   ├── generate-insights.mjs  判定・アイデア生成（LLM 不使用のルールベース）
│   ├── append-history.mjs     日次スナップショットを history/ へ追記
│   ├── evaluate-themes.mjs    テーマの昇格・降格判定と候補の種出し
│   └── lib/                   paths.mjs（パス集中管理）/ storage.mjs（保存層 adapter）
│
├── data/                      取得結果と合成結果（git 管理・日次で更新される）
├── history/                   日次スナップショット（current 90 日 + archive）
│
└── src/
    ├── main.jsx / App.jsx     エントリとルーティング（13 ルート）
    ├── styles.css             デザインシステム全体（1 ファイル）
    ├── data/mockDemands.js    フォールバック専用（dynamic import）
    ├── services/              demandService / historyService / sourceCatalog / themeCatalog
    ├── utils/                 favorites / format / series（グラフ系列の選択）/ toast
    ├── components/            16 個（DemandCard / TrendChart / SourceTrends / InsightsPanel …）
    └── pages/                 13 個（Home / DemandDetail / Ideas / Rankings / Compare …）
```

---

## 需要データの構造

実データは `data/demands.json`（`npm run demands` が生成）、フォールバックは
`src/data/mockDemands.js`。どちらも同じ形で、1 件は次のような構造です。
実データにはこれに加えて `_wikipediaDetail` / `_qiitaDetail` などの情報源別の観測と、
`_insights`（判定・アイデア）、`_scoreBreakdown`（スコア内訳）が付きます。

```js
{
  id: 'ai-business-automation',
  title: 'AI業務自動化',
  category: 'AI・テクノロジー',
  score: 96,                // 0–100 の参考スコア
  change: 18,               // 前日比（%）
  status: '急上昇',          // 急上昇 / 成長中 / 安定 / 下降
  summary: '…',             // 1〜2 行
  description: '…',         // 段落
  audience: ['中小企業経営者', …],
  problems: ['毎日同じ作業に…', …],
  evidence: [{ type, title, confidence, checkedAt }, …],
  businessOpportunities: [{ title, desc }, …],
  breakdown: { search, sns, problems, jobs },
  trendData: {
    '7d':  [7 個の数値],
    '30d': [30 個の数値],
    '90d': [90 個の数値],
  },
  sourceCount: 12,
  confidence: '参考レベル',
  updatedAt: 'ISO 文字列',
}
```

このスキーマは、そのまま API レスポンスとして返せる形にしてあります。

---

## 将来 API / DB に接続する場合の変更箇所

**書き換えるのは基本的に `src/services/demandService.js` の中身だけ**です。

たとえば `getDemands` を次のように置き換えれば OK：

```js
export async function getDemands() {
  const res = await fetch('/api/demands');
  return await res.json();
}
```

- `services/demandService.js` の各関数を `async` にする
- 呼び出し側 (`Home.jsx` など) の `useMemo` を `useEffect + useState` に置き換える
- `utils/favorites.js` は、ログインを実装したら POST/GET 化する

UI コンポーネントには**モックへの直接依存が一切ない**ため、他の書き換えはほぼ不要です。

---

## 初心者向けコード解説

- **どのデータがどこにある？** → 需要の中身はすべて `data/mockDemands.js`
- **画面の骨格はどこ？** → `App.jsx` にルーティング、各画面は `pages/` 配下
- **画面から呼ばれる関数は？** → `services/demandService.js` の関数のみ
- **色やフォントを変えたい** → `styles.css` の先頭 `:root { … }` の CSS 変数
- **需要スコアの計算式** → 現在はモックのため計算していない。将来は「需要量 + 成長率 + 話題性 + 継続性 + 複数ソース一致度」を組み合わせる想定
- **お気に入りはどこに保存される？** → ブラウザの `localStorage` （キー `demand-atlas:favorites`）

「なぜ実装が分かれているのか」の意図：

- **データ (`mockDemands.js`) と取得 (`demandService.js`) を分けている** のは、将来 API 化するとき UI を触らずに切り替えるため
- **各画面 (`pages/*`) は必ず `services/*` 経由でデータを取る** ようにして、ページ内にデータを直書きしていない

---

## 今後追加すべき機能の優先順位

1. ~~**本物のデータソースへの接続**~~ — 完了。7 情報源を日次観測中
2. ~~**需要スコアの算出ロジック**~~ — 完了。`score = 40×ニュース量 + 30×直近成長 + 20×ニュース媒体の多様性 + 10×鮮度`（詳細ページに内訳を表示）
3. **需要テーマの自動抽出** — 部分的に着手。`npm run themes:eval` が候補の種出しと昇格・降格判定を出力する（テーマ辞書は手動キュレーション）
4. **ユーザー認証と、複数端末をまたぐお気に入り**
5. **通知・ウォッチリスト** — 「保存した需要のスコアが急変したら知らせる」
6. **地域・年代など次元の追加** — 需要をより文脈化する
7. **公開ページ / 共有カード（OGP）**
8. **管理画面（キュレーション向け）**

---

## 免責

表示される需要スコア・変化率・判定・ビジネス機会は、**公開情報源の観測値から
ルールベースで算出した参考値**です。投資判断や事業判断の根拠として十分な精度は
保証しません。アイデアは検討の出発点として利用してください。

スコアの算出式と各成分は詳細ページに表示しています。判定に使ったデータが少ない場合は
「観測不足」と明示します。
