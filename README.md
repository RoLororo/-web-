# Demand Atlas — 需要可視化プロトタイプ

「今、世の中で何が求められているのか」を可視化する Web サービスのフロントエンドプロトタイプです。
本物の API・DB・AI・SNS 連携などは一切行わず、**すべてモックデータで動作**します。

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
| `/` | ホーム。需要ランキング + 急上昇 + 分野フィルタ |
| `/demand/:id` | 需要の詳細。トレンドグラフ、根拠、悩み、機会など |
| `/explore` | 検索・並び替え・分野・状態でのフィルタ |
| `/categories` | 分野の一覧 |
| `/categories/:name` | 単一分野の掘り下げ |
| `/favorites` | 保存した需要（localStorage） |

---

## ファイル構成と各ファイルの役割

```
demand-atlas/
├── package.json               依存関係とスクリプト
├── vite.config.js             Vite 設定（最小）
├── index.html                 エントリ HTML
├── README.md
└── src/
    ├── main.jsx               React のエントリ。BrowserRouter を差す
    ├── App.jsx                ルーティングとレイアウトの骨格
    ├── styles.css             デザインシステム全体（1ファイル）
    │
    ├── data/
    │   └── mockDemands.js     ★ すべての需要データ（12件）
    │
    ├── services/
    │   └── demandService.js   ★ データ取得層。将来ここだけを API 化する
    │
    ├── utils/
    │   ├── favorites.js       localStorage ラッパ
    │   └── format.js          表示用の小さな整形関数
    │
    ├── components/
    │   ├── Header.jsx         ヘッダー + ナビ + ダークモード切替
    │   ├── DemandCard.jsx     ランキング行のカード
    │   ├── Sparkline.jsx      カード内の小さな折れ線
    │   ├── TrendChart.jsx     詳細ページの大きなグラフ（ホバー対応）
    │   ├── StatusBadge.jsx    「急上昇」等のバッジ
    │   ├── CategoryFilter.jsx 分野フィルタチップ
    │   └── FavoriteButton.jsx お気に入りボタン
    │
    └── pages/
        ├── Home.jsx
        ├── DemandDetail.jsx
        ├── Explore.jsx
        ├── Categories.jsx
        ├── CategoryDetail.jsx
        └── Favorites.jsx
```

---

## モックデータの構造

`src/data/mockDemands.js` を参照。1件は次のような形をしています。

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

1. **本物のデータソースへの接続** — SNS/検索/求人のいずれか1系統だけでも試す
2. **需要スコアの算出ロジック** — 単純な線形結合から始めて透明性を担保
3. **需要テーマの自動抽出** — 現状は手動キュレーション想定
4. **ユーザー認証と、複数端末をまたぐお気に入り**
5. **通知・ウォッチリスト** — 「保存した需要のスコアが急変したら知らせる」
6. **地域・年代など次元の追加** — 需要をより文脈化する
7. **公開ページ / 共有カード（OGP）**
8. **管理画面（キュレーション向け）**

---

## 免責

このプロトタイプで表示されるすべての需要スコア、変化率、根拠、ビジネス機会等は
**サービスの UX 検証のためのモックデータ**であり、実際の市場動向を示すものではありません。
