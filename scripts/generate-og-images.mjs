// ============================================================================
// generate-og-images — テーマ別の OG 画像（1200×630 PNG）をビルド時に生成する。
//
// なぜ必要か（成長=シェア率）:
//   これまで全ページの og:image が共通の og-image.jpg で、X/Slack/LINE に
//   テーマのリンクを貼っても「どのテーマも同じ汎用カード」だった。SNS 共有の
//   クリック率はカードの内容依存が大きく、テーマ名＋需要スコア＋今週の増減を
//   出すだけで大きく変わる。owner が X に投稿する 1 回の価値を最大化する。
//
//   satori(JSX→SVG) + resvg(SVG→PNG)。フォントはビルド時のラスタライズにだけ
//   使い、PNG には埋め込まれない。出力は dist/og/*.png（gitignore、デプロイ毎に
//   最新スコアで再生成）。生成に失敗しても prerender 側が og-image.jpg に
//   フォールバックするので、共有カードが消えることはない。
//
// 実行: build の中で vite build → generate-og-images → prerender の順。
// ============================================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DIST = resolve(REPO, 'dist');
const FONT = resolve(HERE, 'assets/NotoSansJP-Bold.otf');

const BG = '#0a0a0a';
const FG = '#fafafa';
const GREEN = '#4ade80';
const MUTED = '#a3a3a3';
const DIM = '#737373';

const div = (style, children) => ({ type: 'div', props: { style, children } });
const txt = (style, s) => ({ type: 'div', props: { style, children: s } });

function card(font, { title, category, score, rise }) {
  const riseLine = typeof rise === 'number' && rise >= 3 ? ` ・ 今週 +${rise}` : '';
  return div(
    { width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', padding: '68px 72px', backgroundColor: BG, color: FG },
    [
      div({ display: 'flex', alignItems: 'center', fontSize: 30, color: GREEN, letterSpacing: '0.04em' },
        [txt({}, 'Demand Atlas ・ 需要スコア')]),
      div({ display: 'flex', flexDirection: 'column' }, [
        category ? txt({ fontSize: 30, color: DIM, marginBottom: 16 }, category) : txt({}, ''),
        txt({ fontSize: 82, fontWeight: 700, lineHeight: 1.15 }, title),
        div({ display: 'flex', alignItems: 'baseline', marginTop: 28 }, [
          txt({ fontSize: 96, fontWeight: 700, color: GREEN }, String(score)),
          txt({ fontSize: 40, color: MUTED, marginLeft: 12 }, `/ 100${riseLine}`),
        ]),
      ]),
      txt({ fontSize: 28, color: DIM }, 'demand-atlas.vercel.app ・ 7つの公開データで需要を可視化'),
    ],
  );
}

// トップページ用: 「今週 需要が伸びたテーマ」ランキングカード。
// ランキングは 1 テーマより SNS 拡散されやすく、owner が最も貼りやすい
// ホーム URL の共有カードを最もクリックされる内容にする。
function homeCard({ risers }) {
  const rows = risers.map((r, i) =>
    div({ display: 'flex', alignItems: 'baseline', marginBottom: i === risers.length - 1 ? 0 : 18 }, [
      txt({ fontSize: 34, color: DIM, width: 44 }, `${i + 1}`),
      txt({ fontSize: 44, fontWeight: 700, flexGrow: 1 }, r.title),
      txt({ fontSize: 44, fontWeight: 700, color: GREEN, marginLeft: 24 }, `+${r.delta}`),
    ]),
  );
  return div(
    { width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', padding: '60px 72px', backgroundColor: BG, color: FG },
    [
      div({ display: 'flex', fontSize: 32, color: GREEN, letterSpacing: '0.04em' },
        [txt({}, '今週 需要が伸びたテーマ ・ Demand Atlas')]),
      div({ display: 'flex', flexDirection: 'column' }, rows),
      txt({ fontSize: 28, color: DIM }, 'demand-atlas.vercel.app ・ 7つの公開データで需要を毎日可視化'),
    ],
  );
}

// 日次レポート用: 「この日 動いたテーマ」カード。
// 日付が入ることで、同じリンクを毎日貼っても中身が毎回変わる
// （2026-08-09 実測: 共有は発火しているが貼るものが毎回同じだった）。
function dailyCard({ dateLabel, rows }) {
  const lines = rows.map((r, i) =>
    div({ display: 'flex', alignItems: 'baseline', marginBottom: i === rows.length - 1 ? 0 : 16 }, [
      txt({ fontSize: 42, fontWeight: 700, flexGrow: 1 }, r.title),
      txt({ fontSize: 42, fontWeight: 700, color: r.delta > 0 ? GREEN : MUTED, marginLeft: 24 },
        `${r.delta > 0 ? '+' : ''}${r.delta}`),
    ]),
  );
  return div(
    { width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', padding: '60px 72px', backgroundColor: BG, color: FG },
    [
      div({ display: 'flex', flexDirection: 'column' }, [
        txt({ fontSize: 32, color: GREEN, letterSpacing: '0.04em' }, 'Demand Atlas ・ 日次レポート'),
        txt({ fontSize: 56, fontWeight: 700, marginTop: 12 }, `${dateLabel}の需要変化`),
      ]),
      div({ display: 'flex', flexDirection: 'column' }, lines),
      txt({ fontSize: 28, color: DIM }, 'demand-atlas.vercel.app ・ 7つの公開データで需要を毎日観測'),
    ],
  );
}

/** 2026-08-07 → 2026年8月7日（UTC で解釈し、実行環境の時差で日付をずらさない） */
function dateLabelJa(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

async function main() {
  const font = await readFile(FONT);
  const payload = JSON.parse(await readFile(resolve(DIST, 'data/demands.json'), 'utf8'));
  const demands = payload.demands || [];
  await mkdir(resolve(DIST, 'og'), { recursive: true });

  const renderPng = async (el) => {
    const svg = await satori(el, {
      width: 1200, height: 630,
      fonts: [{ name: 'NotoJP', data: font, weight: 700, style: 'normal' }],
    });
    return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  };

  let ok = 0;
  const failed = [];
  for (const d of demands) {
    const sc = d._scoreHistory?.scores;
    const rise = Array.isArray(sc) && sc.length >= 2 ? sc[sc.length - 1] - sc[0] : null;
    try {
      const png = await renderPng(card(font, { title: d.title, category: d.category, score: d.score, rise }));
      await writeFile(resolve(DIST, 'og', `${d.id}.png`), png);
      ok++;
    } catch (e) {
      failed.push(`${d.id}: ${e.message}`);
    }
  }

  // トップページ用: 今週の急上昇 TOP5 ランキングカード
  let homeOk = false;
  try {
    const risers = demands
      .map((d) => {
        const sc = d._scoreHistory?.scores;
        return Array.isArray(sc) && sc.length >= 3 ? { title: d.title, delta: sc[sc.length - 1] - sc[0] } : null;
      })
      .filter((x) => x && x.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);
    if (risers.length >= 3) {
      const png = await renderPng(homeCard({ risers }));
      await writeFile(resolve(DIST, 'og', 'home.png'), png);
      homeOk = true;
    }
  } catch (e) {
    failed.push(`home: ${e.message}`);
  }

  // 日次レポート用: 観測できた日ごとに 1 枚。過去日も毎回作り直すが
  // 元データ（_scoreHistory）が固定なので出力は同じになる。
  let dailyOk = 0;
  try {
    const dates = [...new Set(demands.flatMap((d) => d._scoreHistory?.dates || []))]
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort().reverse();
    await mkdir(resolve(DIST, 'og', 'daily'), { recursive: true });

    for (const dt of dates) {
      const moves = [];
      for (const d of demands) {
        const h = d._scoreHistory;
        const i = h?.dates?.indexOf(dt) ?? -1;
        if (i <= 0) continue; // 初日は前日が無いので変化を出せない
        const delta = h.scores[i] - h.scores[i - 1];
        if (delta !== 0) moves.push({ title: d.title, delta });
      }
      // 変化が 1 件も無い日は専用カードを作らない（既定の OG にフォールバック）
      if (moves.length === 0) continue;
      moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      const png = await renderPng(dailyCard({ dateLabel: dateLabelJa(dt), rows: moves.slice(0, 5) }));
      await writeFile(resolve(DIST, 'og', 'daily', `${dt}.png`), png);
      dailyOk++;
    }
  } catch (e) {
    failed.push(`daily: ${e.message}`);
  }

  console.log('🦊 Demand Atlas — OG 画像生成');
  console.log(`   ${ok}/${demands.length} テーマ + home ${homeOk ? '✓' : '×'} + 日次 ${dailyOk} 枚 の OG 画像を dist/og/ に生成`);
  if (failed.length) {
    console.error(`   ✗ ${failed.length} 件失敗:`);
    for (const f of failed) console.error('     ' + f);
    // 失敗しても prerender が og-image.jpg にフォールバックするため build は止めない。
  }
}

main().catch((e) => {
  console.error('OG 画像生成でエラー（フォールバックあり・build は継続）:', e.message);
});
