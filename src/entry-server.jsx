// ============================================================================
// entry-server — ビルド時のプリレンダ専用のエントリ
//
// ブラウザは main.jsx を使い、このファイルは読み込まない。
// scripts/prerender.mjs が Node から呼び、ルートごとに HTML と meta を得る。
//
// renderToString ではなく renderToPipeableStream を使う理由:
//   説明ページ 9 本は React.lazy で分割してある。renderToString は
//   Suspense を待てないので、それらは**フォールバックのまま**出力される
//   （2026-08-01 実測: /sources /guide /glossary が本文 746 字・
//     title は既定値・canonical と構造化データが欠落していた）。
//   onAllReady は全ての Suspense 境界が解けてから発火するので、
//   遅延読み込みのページも中身まで描き切れる。
//
// meta は効果（useEffect）では取れない（サーバーでは走らない）ので、
// SeoCollectorContext 経由でレンダー中に受け取る。
// ============================================================================

import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Writable } from 'node:stream';
import App from './App.jsx';
import { SeoCollectorContext } from './utils/useSeo.js';

/**
 * @param {string} url  プリレンダするパス（例 "/sources/ndl"）
 * @returns {Promise<{ html: string, seo: object }>}
 */
export function render(url) {
  const collector = { currentPath: url };

  return new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        // React の Node 向けストリームは、チャンク境界で使い切らなかった
        // バッファの余りをそのまま渡してくることがある。実測（2026-08-01）では
        // 完全な UTF-8 文字と文字の**あいだ**に 0x00 が 1〜6 個入っていた
        //   … e3 81 8a("お") 00 e3 82 8a("り") …
        // NUL は HTML では常に不正な文字なので、ここで落とす。
        // 文字が壊れていないことは prerender.mjs 側で U+FFFD の有無で検査する。
        const buf = Buffer.from(chunk);
        chunks.push(buf.includes(0) ? Buffer.from(buf.filter((b) => b !== 0)) : buf);
        cb();
      },
      final(cb) { cb(); },
    });

    let settled = false;
    const stream = renderToPipeableStream(
      <SeoCollectorContext.Provider value={collector}>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </SeoCollectorContext.Provider>,
      {
        // 全ての Suspense が解けてから流す（遅延ページの中身も含める）
        onAllReady() {
          sink.on('finish', () => {
            if (settled) return;
            settled = true;
            resolve({ html: Buffer.concat(chunks).toString('utf8'), seo: collector });
          });
          stream.pipe(sink);
        },
        onShellError(err) { if (!settled) { settled = true; reject(err); } },
        onError(err) { if (!settled) { settled = true; reject(err); } },
      },
    );
  });
}
