# Demand Atlas 履歴データ

Demand Atlas の **最重要資産** である「過去の需要データ」を保存するディレクトリ。

- `current/` は直近 90 日、フロントエンドや AI が読む
- `archive/YYYY/` は 90 日超過分、**永続保持**
- `index.json` はカタログ、`manifest.json` は設定

将来の需要分析(前年比較・季節性検出・トレンド予測)のための土台。

---

## ディレクトリ構造

```
history/
├── README.md                             (この文書)
├── manifest.json                         (設定・ポリシー、ほぼ不変)
├── index.json                            (動的カタログ、毎回自動再生成)
├── current/
│   ├── {theme_id}.jsonl                  (直近 90 日、テーマ 1 ファイル)
│   └── ...
└── archive/
    ├── 2026/
    │   ├── {theme_id}.jsonl              (2026 年に current から流れた分)
    │   └── ...
    ├── 2027/
    └── ...
```

---

## JSONL レコードスキーマ

**1 レコード = 1 テーマ × 1 日**(JSONL 1 行 = 1 JSON オブジェクト)

```json
{
  "date": "2026-07-22",
  "generatedAt": "2026-07-22T22:00:00Z",
  "sources": {
    "qiita": {
      "envelopeVersion": "1.0.0",
      "complete": true,
      "coverage": 1.0,
      "metrics":       { "volume": 2065, "engagement": 4780, "contributors": 729, "latestActivityAt": "2026-07-22T07:06:46+09:00" },
      "nativeMetrics": { "articleCount": 2065, "lgtmSum": 4780, "uniqueAuthors": 729, "latestPublishedAt": "2026-07-22T07:06:46+09:00" }
    },
    "appstore": {
      "envelopeVersion": "1.0.0",
      "complete": true,
      "coverage": 1.0,
      "metrics":       { "volume": null, "engagement": null, "contributors": null, "latestActivityAt": "..." },
      "nativeMetrics": { "matchedAppCount": 4, "uniquePublishers": 4, "topFreeMatchCount": 4, "topGrossingMatchCount": 3, "bestRank": 2, "averageRank": 12.3, "rankWeightedScore": 572 }
    },
    "wikipedia": {
      "envelopeVersion": "legacy-wiki-0",
      "metrics":       { "volume": 145230, "engagement": null, "contributors": null, "latestActivityAt": "2026-07-20" },
      "nativeMetrics": { "totalPageviews30d": 145230, "totalPageviews7d": 38210, "totalPageviewsPrior7d": 32100, "growthPercent": 19 }
    }
  }
}
```

### フィールド定義

| フィールド | 説明 |
| --- | --- |
| `date` | 記録日 (UTC の `npm run history` 実行日) |
| `generatedAt` | 記録時刻 (ISO 8601、監査用) |
| `sources` | ソース id → 縮約エンベロープ |

### 各 source ブロックに含まれるもの

- `envelopeVersion`: `"1.0.0"` (共通エンベロープ) or `"legacy-wiki-0"` (Wikipedia)
- `complete`, `coverage` (共通エンベロープ準拠のソースのみ)
- `metrics`: 共通語彙の指標 (`volume` / `engagement` / `contributors` / `latestActivityAt`)
- `nativeMetrics`: ソースネイティブの指標

### 各 source ブロックに **含まれない** もの

- `meta` (tagBreakdown / matchedApps / mappedApps 等) — 静的参照、日次で保存すると肥大化
- `errors` — transient state、再実行で復元される
- `requestCount` / `fetchedAt` — 監査に不要
- `derivedMetrics` — 別レイヤーで計算(将来)

**設計原則**: 「時系列分析に必要な数値のみ」を保存。参照情報が必要なら `data/*.json` の git 履歴を参照。

---

## envelopeVersion の意味

| version | 意味 |
| --- | --- |
| `1.0.0` | 現行共通エンベロープ (Qiita / App Store JP) |
| `legacy-wiki-0` | Wikipedia の Legacy 独自形式。将来 Wikipedia を共通化したら `1.0.0` に統一予定 |

将来スキーマ変更 (例: coverage 分割) 時は semver でバージョンを更新し、
古い version の行を自動変換または compatibility layer で読めるようにする。

---

## フロントエンド / AI の読み方

### 手順 1: `index.json` で存在確認

```
GET /history/index.json
→ 利用可能なテーマ一覧、各テーマの firstDate/lastDate、ソース一覧を確認
```

### 手順 2: `current/{theme}.jsonl` で直近推移を取得

```
GET /history/current/payment-troubles.jsonl
→ 90 日分の日次スナップショット
→ split('\n') → parse each line → 時系列データ
```

### 手順 3: 必要なら `archive/YYYY/{theme}.jsonl` で過去比較

```
GET /history/archive/2025/payment-troubles.jsonl
→ 2025 年の全日次スナップショット
```

---

## データ整合性の保証

`scripts/append-history.mjs` は以下を保証:

### 1. 同一日付重複防止

同じ `date` の行は current/{theme}.jsonl に最大 1 行のみ。
既存行があれば **replace**、なければ **append**。

### 2. Atomic write

`.tmp` ファイルに書き込み → 全行 JSON.parse 検証 → 成功時のみ rename。
プロセスが途中で殺されても本ファイルは無傷。

### 3. JSONL 整合性チェック

読み込み時に各行を JSON.parse し、`date` フィールドの有無を確認。
壊れた行は console.warn で報告してスキップ(**書き込みは中断しない**)。

### 4. Rotation 検証

90 日超過行を archive へ move する際:
- 移動前後の行数一致を assert
- archive 追記後の再読み込みで期待件数を verify
- current 側の rotation 後も再検証

### 5. Archive dedup

archive/{year}/{theme}.jsonl への追記時、既存 date と衝突する行は追記しない(冪等性)。

### 6. `index.json` 全再生成

毎回 current/ を完全走査して index を作り直す。
壊れた index が残り続けることがない。

---

## 保持ポリシー

| レイヤー | 保持期間 | 場所 |
| --- | --- | --- |
| current | 直近 **90 日** rolling | `history/current/` |
| archive | **永続** | `history/archive/{YYYY}/` |

archive は **削除しない**。Demand Atlas の資産として蓄積し続ける。
容量が問題になったら gzip 圧縮 or SQLite 移行を検討(YAGNI、今は不要)。

---

## 実行と自動化

### 手動実行

```
npm run history
```

### 自動実行

`npm run all` の末尾で自動実行される。GitHub Actions の日次ワークフローで
毎日 JST 06:00 に走り、`data public/data history` を commit する。

### 単独実行の前提

`data/qiita.json` / `data/appstore.json` / `data/wikipedia-pageviews.json`
のうち少なくとも 1 つが存在すること。
無ければ空実行(テーマ 0 更新、index は再生成のみ)。

---

## 新しいソースを追加するとき

1. そのソースの fetch スクリプトが共通エンベロープで `data/{source}.json` を出力する
2. `scripts/append-history.mjs` に 3 行追加:

```
const s = extractCommonEnvelopeSource(newSourceThemes[themeId]);
if (s) sources.newsource = s;
```

(Wikipedia のような legacy 形式なら独自 extractor を追加)

3. 過去の日次レコードには自動的にその source が **含まれない**
   (新 source 導入日以降のみ観測される、これが正しい挙動)

4. `index.json.sources[]` が自動的に新 source を検出して登録する

---

## SQLite / PostgreSQL 移行

将来データ量が増えたら SQL DB に移行できる。JSONL の各行が 1 テーブル行に対応:

```sql
CREATE TABLE theme_daily_snapshot (
  theme_id     TEXT NOT NULL,
  date         TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  sources      JSON NOT NULL,
  PRIMARY KEY (theme_id, date)
);
```

インポート例:

```
for jsonl in history/current/*.jsonl history/archive/YYYY/*.jsonl:
  theme_id = ファイル名 (拡張子除く)
  for line in jsonl:
    rec = JSON.parse(line)
    INSERT INTO theme_daily_snapshot VALUES (theme_id, rec.date, rec.generatedAt, rec.sources)
```

現行 JSONL 構造をそのまま JSONB カラムに入れるだけで移行完了。
追加のスキーマ設計は不要。

---

## derivedMetrics との接続(将来)

history/ は raw 観測データのみ保存。**derivedMetrics(percentile, z-score, burst)
は別ファイルに計算結果を保存する**(YAGNI、履歴が数日蓄積してから設計):

```
history/current/{theme}.jsonl   (raw 時系列)
        ↓
scripts/derive-metrics.mjs      (履歴から派生値を計算)
        ↓
data/derived-metrics.json       (テーマ × ソース × 派生指標)
        ↓
scripts/build-demands.mjs       (optional 読み、_derivedDetail として付与)
```

派生値の計算式を変えても history は無変更で済む(職責分離)。
