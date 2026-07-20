import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Phase 5: demandService.js がトップレベル await で /data/demands.json を
  // fetch するため、ビルドターゲットを ES2022+ (トップレベル await 対応) に
  // 引き上げる。既に color-mix() や backdrop-filter を使っているので、
  // 実質的な対応ブラウザは既に Chrome 111+ / Safari 16.4+ / Firefox 113+ 相当。
  build: { target: 'es2022' },
  server: { port: 5173, open: true },
});
