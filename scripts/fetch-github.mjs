// ============================================================================
// scripts/fetch-github.mjs
//
// Demand Atlas — GitHub Search API から「OSS 実装活動」を観測
//
//   ■ なぜ GitHub か
//     既存 4 情報源は「一般の関心 (Wikipedia PV) / 技術者の実装 (Qiita) /
//     研究 (arXiv) / 製品市場 (App Store JP)」を覆っている。GitHub は
//     「OSS 実装」という未取得のカテゴリを追加する。
//     採用時に OpenAlex・NDL とも比較したが、
//       ・OpenAlex は arXiv と同じ「研究」カテゴリで信号が重複する
//       ・NDL は累積書誌数のストック指標で日次ではほぼ動かない
//     ため、唯一の日次フロー指標である GitHub を選定した。
//
//   ■ 何を測るか
//     windowDays 以内に「作成された」リポジトリ数 (created:>YYYY-MM-DD)。
//     累積のスター数ではなく新規作成数にすることで、ストックではなく
//     フロー (その期間に新しく始まった実装の量) を観測する。
//
//   ■ 認証
//     GitHub Actions 上では GITHUB_TOKEN が自動注入される (5,000 req/h)。
//     新しい secret の作成・管理は不要。
//     ローカルでは未認証 (Search API は 10 req/min) で動くため、
//     requestIntervalMs で間隔を空けている。
//
//   ■ 出力
//     data/github.json — 共通 envelope v1.0.0
//       metrics.volume       = 期間内の新規リポジトリ数
//       metrics.engagement   = 上位リポジトリのスター合計
//       metrics.contributors = null (Search API からは取得できない)
//
//   ■ 使い方
//     npm run github
// ============================================================================

import { PATHS } from './lib/paths.mjs';
import { storage } from './lib/storage.mjs';
import { USER_AGENT, fetchWithRetry, classifyFetchError, sleep } from './lib/fetch-common.mjs';

const MAPPING = PATHS.config.githubMapping;
const OUTPUT  = PATHS.source.github;

const API = 'https://api.github.com/search/repositories';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** N 日前の YYYY-MM-DD */
function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function makeError(type, message, retryable, themeId) {
  return { theme: themeId, type, message, retryable };
}

/**
 * 1 テーマ分の検索。
 * total_count を volume、上位 topN を topItems として返す。
 */
async function processTheme(themeCfg, since, topN, headers) {
  const q = `${themeCfg.query} created:>${since}`;
  const url = `${API}?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${topN}`;

  const res = await fetchWithRetry(url, { headers });
  const json = await res.json();

  if (typeof json.total_count !== 'number') {
    throw new Error(json.message || 'total_count が返らなかった');
  }

  const items = (json.items || []).slice(0, topN).map((r) => ({
    title:       r.full_name,
    url:         r.html_url,
    stars:       r.stargazers_count ?? 0,
    language:    r.language || null,
    description: (r.description || '').slice(0, 120) || null,
    publishedAt: r.created_at || null,
  }));

  return {
    repoCount:  json.total_count,
    starSum:    items.reduce((s, r) => s + r.stars, 0),
    topLanguage: items.find((r) => r.language)?.language || null,
    latestCreatedAt: items[0]?.publishedAt || null,
    topItems:   items,
  };
}

/** 共通 envelope v1.0.0 */
function toEnvelope(result, fetchedAt, windowDays, since) {
  return {
    envelopeVersion: '1.0.0',
    source:   'github',
    windowDays,
    fetchedAt,
    // 1 テーマ 1 リクエストのため、成功した時点で完全取得。
    // 失敗したテーマは themes から除外され errors に記録される。
    complete: true,
    coverage: 1.0,
    metrics: {
      volume:           result.repoCount,
      engagement:       result.starSum,
      contributors:     null,
      latestActivityAt: result.latestCreatedAt,
    },
    nativeMetrics: {
      newRepoCount:  result.repoCount,
      topStarSum:    result.starSum,
      topLanguage:   result.topLanguage,
      createdSince:  since,
    },
    topItems: result.topItems,
    errors:   [],
  };
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  console.log('🦊 Demand Atlas — GitHub の OSS 実装活動を観測');

  const cfg = await storage.readJson(MAPPING);
  if (!cfg) { console.error(`✗ mapping not found: ${MAPPING}`); process.exit(1); }

  const mapping    = cfg.mapping || {};
  const windowDays = cfg.windowDays ?? 30;
  const topN       = cfg.topItemsCount ?? 5;
  const intervalMs = cfg.requestIntervalMs ?? 2500;
  const since      = daysAgo(windowDays);

  // Actions 上では GITHUB_TOKEN が自動で入る。無ければ未認証で続行する。
  const token = process.env.GITHUB_TOKEN || '';
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  console.log(`   対象テーマ: ${Object.keys(mapping).length} 件`);
  console.log(`   窓:         直近 ${windowDays} 日 (created:>${since})`);
  console.log(`   認証:       ${token ? 'GITHUB_TOKEN あり (5,000 req/h)' : 'なし (10 req/min)'}`);
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
      const result = await processTheme(themeCfg, since, topN, headers);
      themes[themeId] = toEnvelope(result, fetchedAt, windowDays, since);
      console.log(
        `  ✓ repo=${String(result.repoCount).padStart(6)} ` +
        `stars=${String(result.starSum).padStart(6)} ` +
        `[${result.topLanguage || '-'}]`
      );
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
    source:            'github',
    method:            'GitHub Search API (repositories created in window)',
    mappingVersion:    cfg.mappingVersion,
    verifiedAt:        cfg.verifiedAt,
    windowDays,
    createdSince:      since,
    authenticated:     Boolean(token),
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
