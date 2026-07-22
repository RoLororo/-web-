# config/

このディレクトリには、Demand Atlas の **データソース別マッピング** を格納します。

## 役割

各データソース(Qiita / Hacker News / note / GDELT / arXiv 等)は、
テーマ ID(`ai-business-automation` など)を「そのソース上での検索単位」
(タグ・キーワード・記事名など)へ変換する必要があります。

このマッピングをコード内 const で持つと、ソースが増えるたびに
複数のスクリプトを触る必要が出るため、外部 JSON に分離しています。

**マッピングの変更 = JSON ファイルの編集のみ**。スクリプト改修は不要です。

## ファイル命名規則

```
config/{source_id}-mapping.json
```

- `{source_id}` は fetch スクリプト側で使うソース識別子と一致させる
  - 例: `qiita-mapping.json` ↔ `scripts/fetch-qiita.mjs` の `source: "qiita"`
- 単一ソースが複数の観測種別を持つ場合(例: GitHub の repo / star / issue)は
  用途別に分けてもよい: `github-repos-mapping.json`, `github-issues-mapping.json`

## マッピングファイルの共通スキーマ

```json
{
  "$schema": "{source_id}-mapping/v1",
  "description": "このマッピングの目的・作成根拠を 1-2 行で",
  "windowDays": 30,
  "mapping": {
    "theme-id-1": [ /* そのソース上での検索単位配列 */ ],
    "theme-id-2": [],
    "theme-id-3": [ ... ]
  }
}
```

### フィールド定義

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| `$schema` | ✓ | スキーマ識別子。将来の互換性判定用 |
| `description` | ✓ | このファイルの目的・データ検証の根拠(自然言語) |
| `windowDays` | ✓ | fetch スクリプトが参照する取得窓(日数)。ソース側の rate limit や API 制限と整合するよう設計 |
| `mapping` | ✓ | テーマ ID → そのソースでの検索単位配列 |

### `mapping` のキー・値

- **キー**: `data/demands.json` の `id` と厳密一致するテーマ ID
- **値**: 各要素が「そのソース上で実際に検索できる文字列」
  - Qiita なら Qiita タグ名(`ChatGPT` など)
  - Hacker News なら検索キーワード(`GitHub Copilot` など)
  - Wikipedia なら記事名(`生成的人工知能` など)

### 空配列 `[]` の意味

「このテーマは、このソースからは意味あるデータが取れない」ことを
**明示的** に示します(null や省略ではなく、意図的に空)。

例:
- `senior-health` (高齢者向け健康): Qiita には該当タグがないため空
- `ai-regulation` (AI 規制): Qiita には該当タグがないため空

fetch スクリプトは空配列のテーマを skip し、
`data/{source}.json` の `themes` からも省略します(捏造しない原則)。

## 新しいソースを追加するときの手順

1. **タグ/キーワード候補を洗い出す**
   - 各テーマについて、そのソース上で使われている実際の検索単位を列挙
   - 直感で書かず、実際に API を叩いて件数を確認

2. **候補を実データで検証**
   - 過去 30 日(または該当ソースの適切な期間)で、各候補の件数を実測
   - 0 件が続く候補は採用しない
   - 件数が少なくても意味的に重要なら採用可(判断は要記録)

3. **`config/{source_id}-mapping.json` を作成**
   - 上記スキーマに従って記述
   - `description` に「実データ検証済み」の旨と検証日を記載

4. **`scripts/fetch-{source_id}.mjs` を作成**
   - このマッピングを読み込み、各テーマの検索単位で API を叩く
   - 出力は `data/{source_id}.json`
   - 共通エンベロープ(source / windowDays / fetchedAt / metrics / rawMetrics / meta)
     に従って書き出す

5. **`scripts/build-demands.mjs` に貼付ロジックを追加**
   - `data/{source_id}.json` を optional 読み込み
   - 該当テーマに `_{source_id}Detail` 内部フィールドとして貼付
   - **既存の score / breakdown / status / 順序は絶対に変更しない**

6. **`package.json` に script を追加**
   - `"{source_id}": "node scripts/fetch-{source_id}.mjs"`
   - `"all"` チェインに `&& npm run {source_id}` を挿入(demands の前)

## マッピングの保守方針

- **タグ・キーワードは変わる**: サービス側で新タグが定着したら追加、廃れたら削除
- **変更履歴は git で追う**: マッピングファイルは PR で議論・レビュー可能
- **削除より無効化を優先**: 一時的にヒットが減ったタグは残す(季節性の可能性)
- **定期的な見直し**: 3-6 ヶ月に 1 度、実データを叩き直して現状を確認

## 現行ソース一覧

| ソース | マッピングファイル | fetch スクリプト |
| --- | --- | --- |
| Qiita | [qiita-mapping.json](qiita-mapping.json) | `scripts/fetch-qiita.mjs` |
| Wikipedia | (スクリプト内 const、将来外部化予定) | `scripts/fetch-wikipedia-pageviews.mjs` |
| App Store JP | [appstore-mapping.json](appstore-mapping.json) | `scripts/fetch-appstore.mjs` |
| arXiv | [arxiv-mapping.json](arxiv-mapping.json) | `scripts/fetch-arxiv.mjs` |

Wikipedia のマッピングは Phase A 以前に実装されたため、スクリプト内の
const 辞書に留まっています。将来ここへ移設予定(既存機能への影響を避けるため急がない)。

## テーマ ID の管理について

現状、テーマ ID の一覧は `scripts/extract-demand-candidates.mjs` の
`THEMES` 定数が正本(source of truth)です。マッピングファイルのキーは
必ずこれと一致させてください。

将来的にテーマ辞書自体も `config/themes.json` に外部化する構想がありますが、
現時点では変更しません(過去にリファクタは行わない方針を採用)。

---

## 共通エンベロープ仕様 (全ソース共通)

各 fetch スクリプトが `data/{source}.json` に書き出す各テーマ値は、
以下の共通エンベロープ形式に従います。これにより将来 Hacker News・
Reddit・GitHub・arXiv などを追加しても、下流の消費側(build-demands・
将来のスコア統合・AI 分析)は同じロジックで扱えます。

### エンベロープのトップレベル (全ソース共通)

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `source` | string | ソース識別子 (例: `"qiita"`, `"hackernews"`) |
| `windowDays` | integer | 取得窓 (日数) |
| `fetchedAt` | ISO string | 取得時刻 |
| `requestCount` | integer | 実際に発行した API リクエスト数 |
| `complete` | boolean | **全ての検索単位が最後まで完了したか**。1 つでも rate-limit / error / max-page 到達があれば `false` |
| `coverage` | float 0..1 \| null | **取得率**。期待件数のうち何割を実際に取得できたか。計算不能なら null |
| `errors` | array | 構造化エラーの配列 (下記 §エラー構造) |
| `metrics` | object | 共通語彙の指標 (下記 §共通 metrics) |
| `nativeMetrics` | object | ソースネイティブ語彙の指標 (下記 §nativeMetrics) |
| `meta` | object | ソース固有のコンテキスト (検索条件・タグ内訳など) |

### エラー構造 (`errors[]`)

各要素は 4 フィールドを持つオブジェクト:

```json
{
  "type":      "rate-limit",  
  "message":   "skipped (rate-remaining=4 <= 5)",  
  "retryable": true,  
  "tag":       "生成AI"
}
```

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `type` | string | 分類。以下のいずれか |
| `message` | string | 人間可読な理由 |
| `retryable` | boolean | 時間経過や再試行で成功する見込みがあるか。運用監視で「再取得すべきか」判定に使う |
| `tag` | string | どの検索単位で発生したか (Qiita ならタグ名、HN ならキーワード) |

**`type` の候補** (fetch-qiita.mjs / classifyFetchError の分類):

| type | 意味 | retryable |
| --- | --- | --- |
| `rate-limit` | 事前チェックで Rate-Remaining が閾値未満で skip | true (時間経過で解消) |
| `rate-limit-429` | 429 を受信し、リトライも失敗 | true (時間経過で解消) |
| `http-error` | 200/429 以外の HTTP エラー | 5xx は true、4xx は false |
| `timeout` | REQUEST_TIMEOUT_MS を超過 | true |
| `network` | DNS / TCP 接続エラー | true |
| `parse` | レスポンス JSON パース失敗 | false |

新しいソースを追加する際、上記の分類に該当しない障害があれば `type` を
拡張し、この表に追記してください。

### 共通 metrics (全ソース共通の意味的スロット)

**目的**: 将来のスコア統合フェーズで、ソースを跨いで同じ意味の値を集約するため。
「Qiita の articleCount」と「Hacker News の storyCount」は、共に
"そのソース上で観測された発信量" という意味で同等 → 両方 `metrics.volume` に入れる。

| キー | 意味 | 型 | 各ソースでの実体例 |
| --- | --- | --- | --- |
| `volume` | **数量**: そのソースで観測された量。「どれだけ発信/観測されたか」 | integer \| null | Qiita 記事数 / HN ストーリー数 / Wikipedia 総 PV / Reddit 投稿数 |
| `engagement` | **反応**: 他者からのリアクションの総量。反応を持たないソースは `null` | integer \| null | Qiita LGTM 合計 / HN スコア合計 / Reddit upvote 合計 / GitHub スター増分 |
| `contributors` | **参加者数**: ユニークな行為者の数。追跡できないソースは `null` | integer \| null | Qiita 投稿者 / HN 投稿者 / Reddit 投稿者 / arXiv 論文著者 |
| `latestActivityAt` | **最新活動時刻**: そのソース上で最も新しい観測時刻 (ISO 8601) | ISO string \| null | Qiita 最新記事 created_at / HN 最新ストーリー / Wikipedia 窓終端 |

**設計原則**:
- 該当ソースで意味を持たない指標は `null` を入れる (捏造しない)
- キー名は変えない。すべてのソースが同じキー名で書く
- 値の意味は「数量的に比較可能な絶対値」であること。正規化・スコア化は下流の責務

**Wikipedia は例外**: 既存の `_wikipediaDetail` はこの共通エンベロープ導入 (Phase A)
より前に実装されており、既存機能への影響を避けるため現状維持しています。
将来のリファクタフェーズで統一する予定。

### nativeMetrics (ソースネイティブ語彙)

**目的**: ソース独自の指標名で 100% 情報を保存し、監査・再計算・
将来のスキーマ変更に耐えるため。

`metrics` (共通語彙) と対比:
- `metrics.volume = 956` (共通語彙、他ソースと比較可能)
- `nativeMetrics.articleCount = 956` (Qiita 独自語彙、Qiita の API 仕様と 1:1 対応)

多くの場合、両方は同じ値を持ちます (単なる別名)。異なるのは
「その数値の意味が抽象化されているか、ソース固有かどうか」だけです。

新ソースを追加する際、nativeMetrics にはそのソースの API が返す
概念をそのままの名前で書いてください (例: HN なら `storyCount`, `pointsSum`,
`commentsSum`; Reddit なら `postCount`, `upvoteSum`, `awardSum` など)。

---

### 共通 metrics のソース別セマンティクス

`metrics` の 4 スロットは同名だが、ソースにより「実体」と「単位」が異なります。
**将来のスコア統合フェーズでは、この差を認識した上で正規化する必要があります**
(単純合算・単純比較は禁止)。

#### `volume` の意味

| ソース | 実体 | 単位 |
| --- | --- | --- |
| Qiita | ユニーク記事数(重複排除後) | 記事(件) |
| Wikipedia | (現状は独自形式、共通化時に PV 総量になる予定) | ページビュー(件) |
| **App Store** | **`null`(TODO)** | **概念不整合のため未定義** |

**App Store の volume が null の理由**:
App Store は「量」ではなく「ランキング位置」を観測するソース。
「マッチしたアプリ数」を volume に入れると mapping 要素数が上限になり、
本質的な需要量を表さない。無理に埋めず、`nativeMetrics.matchedAppCount` に
実際のマッチ数を保存する。**将来スコア組み込み時に「rank ベース需要指標」を
どう common metric に流し込むか、または derivedMetrics 層で扱うかを再検討**。

#### `engagement` の意味

| ソース | 実体 |
| --- | --- |
| Qiita | LGTM 合計 |
| Wikipedia | `null`(閲覧行動そのものが engagement ではないため) |
| **App Store** | **`null`(公開 RSS に反応シグナルなし)** |

#### `contributors` の意味

| ソース | 実体 | 個人 or 組織 |
| --- | --- | --- |
| Qiita | 記事執筆者 (user.id) | **個人** |
| Wikipedia | `null` | - |
| Hacker News (将来) | ストーリー投稿者(キュレーター) | 個人 |
| **App Store** | **`null`**(共通スロットには入れない) | - |
| arXiv (将来) | 論文著者 | 個人 |

**App Store の contributors が null の理由**:
App Store の publisher(発行会社)は **組織** であり、他ソースの「個人執筆者」
とは意味が根本的に異なる。「個人 5 人 + 組織 5 社 = 10 contributors」の集約は
意味を成さない。組織カウントは `nativeMetrics.uniquePublishers` に保存し、
共通スロットには入れない。

#### `latestActivityAt` の意味

| ソース | 実体 |
| --- | --- |
| Qiita | 最新記事の作成日時 |
| Wikipedia | PV データ窓の終端日 |
| App Store | fetch した各チャートの feed.updated の最新値 |

`latestActivityAt` は最も普遍性が高く、全ソースで意味がほぼ一致する
(=「そのソースで最も新しい観測時刻」)。

---

### coverage のソース別セマンティクス

`coverage` は「取得率」を表すが、**分母がソースにより異なる**ため、
数値の直接比較には注意が必要です。

| ソース | coverage の分母 | coverage の分子 | coverage=1 の意味 |
| --- | --- | --- | --- |
| Qiita | 各タグの `totalCount` の総和 | 実際に fetch できた item 数 | そのテーマの全マッチ記事を漏れなく取得 |
| Wikipedia | マッピング記事数 | 200 OK で PV データが取れた記事数 | 全マッピング記事の PV 取得成功 |
| **App Store** | **チャート総数(v1 では 2)** | **成功したチャート数** | **top-free と top-grossing 両方の feed 取得成功** |

**App Store の coverage=1 が「11 テーマ全て取得成功」を意味 しない**
ことに注意。App Store の coverage は「fetch のインフラ層」に対する成功率
であり、「テーマがカバーされたか」とは別概念。テーマがカバーされたかは
`themes` オブジェクトのキー数、または `themesSkipped` を参照。

同様の理由で、Qiita/Wikipedia の coverage も「テーマ全体のカバレッジ」
ではなく「そのテーマ内でのデータ取得完全性」を表す。

---

### themesSkipped の skippedReason 語彙

各ソースは「マッピング空でスキップしたテーマ」を `themesSkipped` に
列挙するが、その理由を `skippedReasons` として同時に保存する。

| reason | 意味 | 例 |
| --- | --- | --- |
| `concept-not-app` | 概念自体がそのソースで扱えない(存在しない) | AI ハードウェアを App Store で観測、政策を Qiita で観測 |
| `apps-exist-but-not-charting` | 対象は存在するが、v1 の取得範囲(top 100 等)に入らない | Developer Tools アプリが App Store 総合 top 100 に上がらない |
| `not-verified` | マッピング候補があるが未検証(レビュー中フラグ) | - |
| `deprecated` | 以前マッピングされていたが廃止 | - |
| `no-japanese-signal` | 日本語圏でシグナルが取れない | 認知症を Qiita で観測(エンジニア向けプラットフォーム) |

各マッピング JSON の `skippedReasons` セクションで、この語彙を使って
理由を明示。`data/{source}.json` の実行結果には `themesSkipped` 配列と
併せて理由も transparently に出力される。

---

### mapping ファイルのバージョン管理

各マッピング JSON は以下 2 フィールドを持つ:

- `mappingVersion` (integer): 編集ごとにインクリメント
- `verifiedAt` (ISO date string): 最終検証日(実データで確認した日)

**運用ルール**:
- マッピング編集時は必ず両方を更新
- `verifiedAt` の更新は「実際にそのソースを叩いて mapping の妥当性を再確認した」ことを意味する
- 3-6 ヶ月ごとに定期見直しを推奨(README の「マッピングの保守方針」参照)

---

## エンベロープバージョン (envelopeVersion)

共通エンベロープの各テーマ値は `envelopeVersion` (semver 文字列) を持つ。
将来スキーマを変更 (coverage 分割 / skippedReason 2 次元化 / metrics 削減
等) する際に、旧データとの識別と自動移行を可能にする保険。

### 現在のバージョン

- **1.0.0**: 現行スキーマ (source / complete / coverage / errors / metrics /
  nativeMetrics / meta / envelopeVersion)

### バージョン更新ルール

semver に従う:

- **PATCH** (1.0.x): 破壊的でない bug 修正・内部計算精度改善など
- **MINOR** (1.x.0): 後方互換のフィールド追加 (新スロット、meta 拡張等)
- **MAJOR** (x.0.0): 既存フィールド削除・型変更・意味変更 (破壊的変更)

### 対応状況

| ソース | envelopeVersion 対応 | 備考 |
| --- | --- | --- |
| Qiita | ✅ 1.0.0 | fetch-qiita.mjs 出力 |
| App Store JP | ✅ 1.0.0 | fetch-appstore.mjs 出力 |
| arXiv | ✅ 1.0.0 | fetch-arxiv.mjs 出力 |
| Wikipedia | ❌ (Legacy) | 共通エンベロープ未移行、独自形式のため `envelopeVersion` 非対応。将来の共通化フェーズで `1.0.0` 相当を付与予定 |

### history/ での役割

各日次スナップショット行に `envelopeVersion` が含まれる。
将来スキーマ変更時、過去データの再解釈・自動変換の判定材料に使用する。

---

## 設計メモ: 将来の `_sources` 統合構想 (今回は未実装)

現在 `data/demands.json` の各 demand には内部フィールドとして
以下が並んでいます:

```
demands[i]._wikipediaDetail = { ...envelope... }
demands[i]._qiitaDetail      = { ...envelope... }
```

将来 Hacker News / note / arXiv などが追加されると、
`_hackernewsDetail`, `_noteDetail`, `_arxivDetail` … と
アンダースコアプレフィックス付きの兄弟フィールドが増え続けます。

これは以下の点で扱いにくくなる懸念があります:
- **反復処理が煩雑**: `Object.keys(demand).filter(k => k.startsWith('_') && k.endsWith('Detail'))`
- **識別子の重複**: ソース名がフィールド名(`_qiitaDetail`)と envelope 内(`source: "qiita"`)の 2 箇所にある
- **AI/フロントの取り扱い**: 「全ソースを列挙して」というコードが書きにくい

### 統合案 (将来のリファクタで検討)

```
demands[i]._sources = {
  qiita:      { ...envelope... },
  wikipedia:  { ...envelope... },
  hackernews: { ...envelope... }
}
```

**メリット**:
- 全ソースを 1 箇所で列挙できる (`Object.values(demand._sources)`)
- ソース名がキーだけに集約 (envelope 内の `source` フィールドと重複しない)
- フロント/AI が「使えるソース一覧」を demand ごとに直接取得できる
- 将来 `_scoreBreakdown` などの他内部フィールドと衝突しない

**移行コスト**:
- build-demands.mjs で貼付方法を変更 (`last._sources[sourceId] = envelope`)
- 既存 `_wikipediaDetail` と `_qiitaDetail` の同時廃止(または一時併存)
- consumers (フロント・AI 分析スクリプト) の read パス変更

**今回は実装しない理由**:
- Wikipedia を触ると「既存機能への影響ゼロ」制約に抵触する
- ソースが増えて実際に扱いにくくなってから判断すべき (推測で先取りしない)
- 統合の適切なタイミングは「3 ソース目以降が加わったとき」

### 移行判断のトリガー

以下いずれかが観測されたら、統合リファクタを検討してください:
- 3 つ目以降のソースが追加された時
- フロント/AI コードで `_xxxDetail` を列挙する処理が複数箇所に増えた時
- 「新ソース追加時に build-demands.mjs のパターンをまた書き足す」ことが
  苦痛になった時 (現在は 5 行の追加で済むが、10 ソースで 50 行になる)
