// ============================================================================
// scripts/fetch-ndl.mjs
//
// Demand Atlas — 国立国会図書館サーチから「定着度 / 市場成熟度」を観測
//
//   ■ なぜ NDL か
//     保有している 6 情報源は
//       一般の関心 (Wikipedia PV) / 技術者の実装 (Qiita) / OSS 実装 (GitHub) /
//       研究 (arXiv) / 製品市場 (App Store JP) / 報道 (News RSS)
//     を覆うが、「そのテーマがどれだけ世に定着したか」を示す軸だけが空白だった。
//     書籍・雑誌記事の蓄積量はその代理指標になる。
//
//   ■ これは momentum ではない (重要)
//     累積の書誌件数なので日々ほとんど動かない。それが正常な挙動である。
//     したがって:
//       ・静止率 (flat ratio) の計算対象から除外すること
//       ・「今日動いた」系の UI には出さないこと
//     用途は _insights の competition / beginnerFriendliness の裏付け。
//     現状これらはヒューリスティック (既製アプリの有無、Qiita 記事数など) のみで
//     算出されており、市場の成熟度を示す実測データが 1 つも無い。
//
//   ■ 全 10 テーマを覆える唯一の情報源
//     GitHub は senior-health に 2 件しか返さないが、NDL は 3,488 件で最多。
//     技術系ソースが届かない領域をここで補う。
//
//   ■ 出力
//     data/ndl.json — 共通 envelope v1.0.0
//       metrics.volume       = 該当書誌件数 (累積)
//       metrics.engagement   = null (書誌には該当概念が無い)
//       metrics.contributors = null
//
//   ■ 使い方
//     npm run ndl
// ============================================================================

import { PATHS } from './lib/paths.mjs';
import { storage } from './lib/storage.mjs';
import { USER_AGENT, fetchWithRetry, classifyFetchError, sleep } from './lib/fetch-common.mjs';

const MAPPING = PATHS.config.ndlMapping;
const OUTPUT  = PATHS.source.ndl;

const API = 'https://ndlsearch.ndl.go.jp/api/opensearch';

// ---------------------------------------------------------------------------
// XML パース (arXiv と同じ正規表現方式。追加パッケージを入れない)
// ---------------------------------------------------------------------------

/** XML エンティティを戻す */
function unescapeXml(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? unescapeXml(m[1]) : null;
}

function makeError(type, message, retryable, themeId) {
  return { theme: themeId, type, message, retryable };
}

/**
 * 1 テーマ分の検索。
 * totalResults を volume、上位 topN を topItems として返す。
 */
async function processTheme(themeCfg, topN) {
  const url = `${API}?any=${encodeURIComponent(themeCfg.query)}&cnt=${topN}`;
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } });
  const xml = await res.text();

  const totalMatch = xml.match(/<openSearch:totalResults>(\d+)<\/openSearch:totalResults>/);
  if (!totalMatch) throw new Error('totalResults が返らなかった');
  const total = Number(totalMatch[1]);

  const items = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, topN).map((b) => ({
    title:       pick(b, 'title'),
    url:         pick(b, 'link'),
    // dcterms:issued は "2020.8" のような表記も返るため文字列のまま保持する
    issued:      pick(b, 'dcterms:issued') || pick(b, 'dc:date'),
    publisher:   pick(b, 'dc:publisher'),
    author:      pick(b, 'dc:creator'),
  })).filter((it) => it.title);

  return { total, topItems: items };
}

/** 共通 envelope v1.0.0 */
function toEnvelope(result, fetchedAt) {
  return {
    envelopeVersion: '1.0.0',
    source:   'ndl',
    // これはストック指標であることを envelope 自身に明示する。
    // 消費側 (静止率の計算など) はこれを見て除外できる。
    metricKind: 'stock',
    windowDays: null,
    fetchedAt,
    complete: true,
    coverage: 1.0,
    metrics: {
      volume:           result.total,
      engagement:       null,
      contributors:     null,
      latestActivityAt: null,
    },
    nativeMetrics: {
      bibliographyCount: result.total,
    },
    topItems: result.topItems,
    errors:   [],
  };
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — 国立国会図書館サーチから定着度を観測');

  const cfg = await storage.readJson(MAPPING);
  if (!cfg) { console.error(`✗ mapping not found: ${MAPPING}`); process.exit(1); }

  const mapping    = cfg.mapping || {};
  const topN       = cfg.topItemsCount ?? 5;
  const intervalMs = cfg.requestIntervalMs ?? 700;

  console.log(`   対象テーマ: ${Object.keys(mapping).length} 件`);
  console.log(`   指標種別:   stock (累積書誌件数。静止率の対象外)`);
  console.log(`   mapping:    v${cfg.mappingVersion} (verified ${cfg.verifiedAt})`);
  console.log('');

  const fetchedAt = new Date().toISOString();
  const themes        = {};
  const themesSkipped = [];
  const errorsAll     = [];

  const themeIds = Object.keys(mapping);
  for (let i = 0; i < themeIds.length; i++) {
    const themeId  = themeIds[i];
    const themeCfg = mapping[themeId];
    const label = `  [${i + 1}/${themeIds.length}] ${themeId.padEnd(26)}`;

    if (!themeCfg || !themeCfg.query) {
      console.log(`${label}  - (query 未定義、skip)`);
      themesSkipped.push({ theme: themeId, reason: 'no-query', note: themeCfg?.note || '' });
      continue;
    }

    process.stdout.write(label);
    try {
      const result = await processTheme(themeCfg, topN);
      themes[themeId] = toEnvelope(result, fetchedAt);
      console.log(`  ✓ 書誌=${String(result.total).padStart(6)} (topItems ${result.topItems.length})`);
    } catch (err) {
      const { type, retryable } = classifyFetchError(err);
      const message = err && err.message ? err.message : String(err);
      errorsAll.push(makeError(type, message, retryable, themeId));
      console.log(`  ✗ ${type} (${retryable ? 'retryable' : 'fatal'}): ${message}`);
    }

    if (i < themeIds.length - 1) await sleep(intervalMs);
  }

  const successCount = Object.keys(themes).length;

  const output = {
    generatedAt:       fetchedAt,
    source:            'ndl',
    method:            'NDL Search OpenSearch API (bibliography count)',
    metricKind:        'stock',
    mappingVersion:    cfg.mappingVersion,
    verifiedAt:        cfg.verifiedAt,
    mappedThemeCount:  themeIds.length,
    successCount,
    skippedCount:      themesSkipped.length,
    errorCount:        errorsAll.length,
    totalRequestCount: successCount + errorsAll.length,
    themesSkipped,
    errors:            errorsAll,
    themes,
  };

  await storage.writeJson(OUTPUT, output);

  console.log('');
  console.log(`  成功: ${successCount} / スキップ: ${themesSkipped.length} / エラー: ${errorsAll.length}`);
  console.log(`  出力: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
