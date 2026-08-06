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

  console.log('🦊 Demand Atlas — OG 画像生成');
  console.log(`   ${ok}/${demands.length} テーマの OG 画像を dist/og/ に生成`);
  if (failed.length) {
    console.error(`   ✗ ${failed.length} 件失敗:`);
    for (const f of failed) console.error('     ' + f);
    // 失敗しても prerender が og-image.jpg にフォールバックするため build は止めない。
  }
}

main().catch((e) => {
  console.error('OG 画像生成でエラー（フォールバックあり・build は継続）:', e.message);
});
