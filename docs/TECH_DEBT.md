# Tech Debt & Known Issues

現時点で認識している技術的負債・未解決の設計課題を記録する。
「今放置」と「今直す」の判断根拠を残し、将来レビュー時に忘れないようにする。

## 🔴 Data Quality

### 1. Wikipedia の `volume` (= totalPageviews30d) が日ごとに大きく変動する

- **実測例**: 2026-07-22 → 2026-07-23 で ai-business-automation の
  Wikipedia PV が 36,041 → 3,254 (**-91%**)。翌日には元スケールに戻ることも。
- **原因仮説**: Wikimedia の Pageviews API が一部記事に対して部分的な
  データを返すことがあり、totalPageviews30d が急変する。
  fetch-wikipedia-pageviews.mjs は返された値をそのまま合算するため、
  数記事欠損しただけで総量が大きく振れる。
- **影響**: Rankings で Wikipedia が常に上位に来る (絶対値/伸び率の両方)。
- **UI 側の対応 (現状)**: `sourceCatalog.js` で `stability: 'unstable'` を
  設定し、SourceTrends に「⚠ 値変動大」バッジを出している。
- **本質対応 (将来)**:
  - fetch 側で「1 記事でも欠損したら complete=false にする」判定を追加
  - または metrics.volume に 7 日移動平均を用いる
  - または個別記事の PV を JSONL に持ち、UI 側で合算 (fetcher は生値のみ)

## 🟠 UI / UX

### 2. Home のセクション数が多い

Hero + AccumulationBanner + TodaysMovers + 急上昇 + Ranking + CategoryFilter
= 6 セクション。ユーザ視点で情報過多。

- **判断**: 現状は放置 (数週間運用してから、実際にどのセクションが使われるか
  観察した上で整理する)
- **将来的な整理案**: TodaysMovers を「急上昇」セクションに統合、
  AccumulationBanner を Hero の一部として折り込む

### 3. Rankings と Changes の役割重複

- Rankings は「全テーマ横断ソート」、Changes は「テーマ別カード」。
  概念的には別だがデータ源は同じ (`diffRecords`)。
- **判断**: 現状は分離維持 (視点が違うので UX 上の価値はある)
- **将来的な統合案**: Rankings 内にタブで「テーマ別詳細」を持たせる

## 🟠 Common Envelope 設計課題

### 4. `metrics.volume` の意味的発散 (前レビュー継続課題)

- Qiita: 記事数
- Wikipedia: 総 PV (数万オーダー、桁が違う)
- App Store: null (概念不整合)
- arXiv: 論文数
- **将来の対応**: derivedMetrics 導入時に percentile / z-score で正規化

### 5. `coverage` の意味が source で異なる (前レビュー継続課題)

- Qiita: データ完全性
- App Store: fetch 成功率
- **将来の対応**: v1.1 で `dataCompleteness` / `fetchSuccessRate` の 2 分割

### 6. `_wikipediaDetail` が legacy-wiki-0 のまま (共通エンベロープ未移行)

- **判断**: 今のところ SourceTrends / historyService の extractWikipedia で
  best-effort mapping しているので UI 側の実害は小さい
- **将来の対応**: 5-6 ソース目追加時にまとめて共通化

## 🟡 Performance / Scale

### 7. Home mount で loadAllTimeseries を eager fetch

- 11 テーマの JSONL を並列 fetch (合計 ~15 KB)。in-memory キャッシュあり。
- **100 テーマ想定**: 100 並列 fetch = ~150 KB。HTTP/2 + gzip で許容範囲だが
  ネットワーク弱環境では体感遅延の可能性。
- **将来の対応**: 30 テーマ超過時に IntersectionObserver / lazy load 検討

### 8. バンドルサイズ 234 KB (gzip 79 KB)

- 現状 healthy。
- **将来の対応**: 500 KB (gzip 150 KB) 超えたら React.lazy でルート分割

### 9. index.json の metricsKeys 配列肥大化

- 100 ソース × 平均 5 metric = 500 キー羅列
- **将来の対応**: index.json 構造の見直し (sources[].id / envelopeVersion のみ
  にし、metricsKeys は不要にする案)

## 🟢 記録のみ (今は不要)

### 10. `_sources` 統合 (前レビュー継続保留)

- `_wikipediaDetail` / `_qiitaDetail` / `_appstoreDetail` / `_arxivDetail`
  → `_sources: { wikipedia: ..., qiita: ..., ... }` へ統合案
- **判断**: 4 ソースなら現状で許容、6 ソース超えで再判断

### 11. `newlyAppearedMetrics` は履歴 3 日以上ないと信号弱い

- 2 日だと「昨日にはあったが今日ある」= 全て new としてカウントされる可能性
- **判断**: 実運用で 3-7 日蓄積後に自然に有意な信号になる

## 参考: 直した項目 (この review で対応済み)

- ✅ `sourceCatalog.js` 一元化 (100 ソース対応、UI 側修正なしで新ソース吸収)
- ✅ Rankings / Changes に履歴深度対応 (`historyDepthDays`、無意味な window
  セレクタを非表示、ヒント表示)
- ✅ DemandCard に今日の変化バッジ (`historyMove` prop 経由)
- ✅ Wikipedia unstable 警告表示 (SourceTrends)
- ✅ Timeline の重複 stat 削除

## 継続監視項目

- history の深さが 7 日 / 30 日を超えた時点で Rankings/Changes の window
  セレクタが自動有効化される。動作確認要。
- Actions が何日連続で成功しているか、失敗が起きたら通知手段が無い状態。
  将来 Discord/Slack webhook 通知検討。
