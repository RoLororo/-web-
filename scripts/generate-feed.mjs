// ============================================================================
// scripts/generate-feed.mjs
//
// 「今日なにが動いたか」を RSS で配る。
//
//   なぜ必要か（2026-08-01 実測）:
//     再訪率 15%。毎日 1 回データが更新されるサイトなのに、
//     更新を知る手段が **1 つも無かった**（RSS・通知・メール購読すべて無し）。
//     訪問者は「今日は何か変わったかな」と自分で見に来るしかなく、
//     1 回来て終わりになる。1 人あたりの生涯 PV が伸びない＝広告表示も伸びない。
//
//   設計:
//     履歴（history/*.jsonl）には score が入っていないので、過去の日次スコアは
//     復元できない。そこで**フィード自身が日々ためていく**形にする。
//       data/feed-state.json … 前回のスコアと判定（比較用）
//       data/feed-items.jsonl … 発行済みアイテム（追記のみ・git 追跡）
//       public/feed.xml       … 直近 50 件を RSS 2.0 で描画
//     日次の GitHub Actions が回るたびに 1 日ぶん積み上がる。
//
//   何をアイテムにするか:
//     「変わったこと」だけ。毎日同じ 10 テーマを流すと通知が意味を失う。
//       - 判定が変わった      … いちばん重要な出来事
//       - スコアが 3 以上動いた
//       - 新しいテーマが増えた
//       - 首位が入れ替わった
//     何も動かなかった日はアイテムを作らない（無理に埋めない）。
//
//   実行: npm run feed（npm run all と prebuild の中で自動実行）
// ============================================================================

import { PATHS } from './lib/paths.mjs';
import { storage } from './lib/storage.mjs';
import { resolve } from 'node:path';

const SITE_URL = 'https://demand-atlas.vercel.app';
const SITE_NAME = 'Demand Atlas';
const MAX_ITEMS = 50;
/** スコアがこれ以上動いたらアイテムにする。小さすぎると毎日鳴って無視される */
const SCORE_DELTA = 3;

const STATE_PATH = PATHS.output.feedState;
const ITEMS_PATH = PATHS.output.feedItems;

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** JST の日付（サイト内の他の日付境界と合わせる） */
function todayJST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

async function readJsonl(path) {
  if (!(await storage.fileExists(path))) return [];
  const raw = await storage.readText(path);
  return raw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/**
 * 前回との差から「今日の出来事」を作る。
 * prev が空（初回）のときは、比較対象が無いので変化アイテムは作らず、
 * 「観測を開始した」ことだけを 1 件出す。無いものを動いたことにはしない。
 */
function buildItems(demands, prev, date) {
  const items = [];
  const at = new Date().toISOString();
  const byId = Object.fromEntries(demands.map((d) => [d.id, d]));
  const isFirstRun = Object.keys(prev.themes || {}).length === 0;

  if (isFirstRun) {
    items.push({
      guid: `start-${date}`,
      date, at,
      kind: 'start',
      title: `${SITE_NAME} の観測記録を公開しました（${demands.length} テーマ）`,
      link: `${SITE_URL}/`,
      body: `${demands.length} 件の需要テーマについて、7 つの公開データからの観測を毎日記録しています。`
          + `以後、判定が変わったテーマとスコアが ${SCORE_DELTA} 以上動いたテーマをこのフィードでお知らせします。`,
    });
    return items;
  }

  for (const d of demands) {
    const before = prev.themes[d.id];
    const link = `${SITE_URL}/demand/${encodeURIComponent(d.id)}`;
    const verdict = d._insights?.verdict?.label || null;

    // 新しく追加されたテーマ
    if (!before) {
      items.push({
        guid: `new-${d.id}-${date}`,
        date, at, kind: 'new', themeId: d.id,
        title: `新しいテーマの観測を開始：${d.title}`,
        link,
        body: `${d.summary || ''} 現在の需要スコアは ${d.score}/100${verdict ? `、判定は「${verdict}」` : ''}です。`,
      });
      continue;
    }

    // 判定が変わった（いちばん意味のある出来事）
    if (verdict && before.verdict && verdict !== before.verdict) {
      items.push({
        guid: `verdict-${d.id}-${date}`,
        date, at, kind: 'verdict', themeId: d.id,
        title: `${d.title}：「${before.verdict}」→「${verdict}」`,
        link,
        body: (d._insights?.verdict?.rationale || '')
            + ` 需要スコアは ${before.score} → ${d.score}。`,
      });
      continue; // 同じテーマで二重に鳴らさない
    }

    // スコアが大きく動いた
    const delta = d.score - (before.score ?? d.score);
    if (Math.abs(delta) >= SCORE_DELTA) {
      items.push({
        guid: `score-${d.id}-${date}`,
        date, at, kind: 'score', themeId: d.id,
        title: `${d.title}：需要スコアが ${before.score} → ${d.score}（${delta > 0 ? '+' : ''}${delta}）`,
        link,
        body: `${d.summary || ''}`
            + (verdict ? ` 判定は「${verdict}」のままです。` : '')
            + ` 内訳と根拠のニュースはテーマのページで確認できます。`,
      });
    }
  }

  // その日の日次レポート 1 件。
  //
  // 2026-08-09 実測: フィードのアイテムはすべてテーマ個別ページ宛てで、
  // 「その日ぜんぶ」をまとめて読む導線がフィード側に無かった。
  // 1 日 1 件だけ全体像へのアイテムを出すと、購読者は毎日 1 回だけ確実に
  // 「今日の全体像」を受け取れる（テーマ個別は動いた日にしか出ない）。
  // 変化アイテムが 1 件も無い日は出さない（無い変化を鳴らさない）。
  //
  // リンク先の日付は **todayJST ではなく _scoreHistory の最終日** を使う。
  // パイプラインは JST 早朝（cron 21:00Z 前後）に回るため todayJST が
  // 履歴の最終日より 1 日進むことがあり、そのまま貼ると存在しない
  // /daily/<明日> を指して 404 になる。実在する日だけリンクする。
  const latestDaily = [...new Set(demands.flatMap((d) => d._scoreHistory?.dates || []))]
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort().pop();

  if (items.length > 0 && latestDaily) {
    const ups = items.filter((i) => i.kind === 'score' && /（\+\d/.test(i.title)).length;
    items.push({
      guid: `daily-${latestDaily}`,
      date, at, kind: 'daily',
      title: `${latestDaily} の需要変化（${demands.length} テーマ）`,
      link: `${SITE_URL}/daily/${latestDaily}`,
      body: `${latestDaily} 時点の ${demands.length} テーマの需要スコアと前日比をまとめています。`
          + (ups ? `この日は ${ups} テーマのスコアが大きく上昇しました。` : '')
          + ' 全テーマの一覧と、その日の上昇・下降はレポートのページで確認できます。',
    });
  }

  // 首位の入れ替わり
  const topNow = demands[0];
  if (topNow && prev.topId && prev.topId !== topNow.id) {
    const prevTop = byId[prev.topId];
    items.push({
      guid: `top-${topNow.id}-${date}`,
      date, at, kind: 'top',
      title: `首位が入れ替わりました：${topNow.title}（${topNow.score}点）`,
      link: `${SITE_URL}/rankings`,
      body: prevTop
        ? `前日まで首位だった「${prevTop.title}」は ${prevTop.score} 点です。`
        : '前日までの首位は観測対象から外れています。',
    });
  }

  return items;
}

function renderRss(items, generatedAt) {
  const rfc822 = (iso) => new Date(iso).toUTCString();
  const body = items.map((it) => [
    '    <item>',
    `      <title>${esc(it.title)}</title>`,
    `      <link>${esc(it.link)}</link>`,
    `      <guid isPermaLink="false">${esc(it.guid)}</guid>`,
    `      <pubDate>${rfc822(it.at)}</pubDate>`,
    `      <description>${esc(it.body)}</description>`,
    '    </item>',
  ].join('\n')).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${esc(SITE_NAME)} — 今日動いた需要</title>`,
    `    <link>${SITE_URL}/</link>`,
    `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />`,
    '    <description>7 つの公開データから毎日観測している需要テーマのうち、判定が変わったものとスコアが大きく動いたものをお知らせします。</description>',
    '    <language>ja</language>',
    `    <lastBuildDate>${rfc822(generatedAt)}</lastBuildDate>`,
    '    <ttl>720</ttl>',
    body,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

async function main() {
  console.log('🦊 Demand Atlas — フィード生成');

  const payload = JSON.parse(await storage.readText(PATHS.output.demands));
  const demands = payload.demands || [];
  if (demands.length === 0) {
    console.error('   demands が空。フィードは更新しない');
    return;
  }

  const prev = (await storage.fileExists(STATE_PATH))
    ? JSON.parse(await storage.readText(STATE_PATH))
    : { themes: {}, topId: null };

  const date = todayJST();
  const fresh = buildItems(demands, prev, date);

  // 既存アイテムと重複しないものだけ足す（同じ日に複数回流しても増えない）
  const existing = await readJsonl(ITEMS_PATH);
  const seen = new Set(existing.map((i) => i.guid));
  const added = fresh.filter((i) => !seen.has(i.guid));
  const all = [...existing, ...added];

  if (added.length) {
    await storage.writeText(ITEMS_PATH, all.map((i) => JSON.stringify(i)).join('\n') + '\n');
  }

  // 新しい順に MAX_ITEMS 件を描画
  const shown = [...all].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, MAX_ITEMS);
  const generatedAt = new Date().toISOString();
  await storage.writeText(resolve(PATHS.publicMirror.root, 'feed.xml'), renderRss(shown, generatedAt));

  // 次回比較用の状態を保存
  const state = {
    updatedAt: generatedAt,
    date,
    topId: demands[0]?.id || null,
    themes: Object.fromEntries(demands.map((d) => [d.id, {
      score: d.score,
      verdict: d._insights?.verdict?.label || null,
    }])),
  };
  await storage.writeText(STATE_PATH, JSON.stringify(state, null, 2) + '\n');

  console.log(`   今日の出来事 ${fresh.length} 件（新規 ${added.length} 件）`);
  for (const i of added) console.log(`     [${i.kind}] ${i.title}`);
  console.log(`   フィード ${shown.length} 件 → public/feed.xml`);
}

main().catch((e) => {
  console.error('フィード生成に失敗:', e.message);
  process.exit(1);
});
