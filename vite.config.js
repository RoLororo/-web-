import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// build 時刻を version として注入。demands.json / history/index.json などの
// static asset に ?v=<ID> を付けて Vercel CDN + browser cache を build 毎に
// 無効化するために使う (services から `__BUILD_ID__` として参照)。
// dev では現在時刻、production では build コミット時刻に相当。
const BUILD_ID = JSON.stringify(String(Date.now()));

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: BUILD_ID,
  },
  // Phase 5: demandService.js がトップレベル await で /data/demands.json を
  // fetch するため、ビルドターゲットを ES2022+ (トップレベル await 対応) に
  // 引き上げる。既に color-mix() や backdrop-filter を使っているので、
  // 実質的な対応ブラウザは既に Chrome 111+ / Safari 16.4+ / Firefox 113+ 相当。
  build: { target: 'es2022' },
  server: { port: 5173, open: true },
});
