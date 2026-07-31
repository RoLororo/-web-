#!/usr/bin/env node
// ============================================================================
// アクセス分析の接続チェック（読み取りのみ）
//
//   npm run visits:check              … 本番を確認
//   npm run visits:check -- <origin>  … 任意の環境を確認
//
// 「実装されているか」ではなく「**今この瞬間に数えられているか**」を確かめる。
// 値（トークン等）は取得も表示もしない。
// ============================================================================

const origin = process.argv[2] || 'https://demand-atlas.vercel.app';

const get = async (path) => {
  const res = await fetch(origin + path, { headers: { Accept: 'application/json' } });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) {
    throw new Error(`JSON ではなく ${type} が返りました（/api がデプロイされていない可能性）`);
  }
  return res.json();
};

console.log(`\n🦊 アクセス分析の接続チェック — ${origin}\n`);

try {
  const diag = await get('/api/visit?diag=1');
  if (!Array.isArray(diag.envPresent)) {
    console.log('  ⚠ 診断エンドポイントが応答しません（?diag=1 が未対応のデプロイの可能性）');
  } else {
    console.log('  スキーマ         :', diag.schema);
    console.log('  設定済みの変数   :', diag.envPresent.length ? diag.envPresent.join(', ') : '（なし）');
    console.log('  未設定の変数     :', diag.envMissing.join(', ') || '（なし）');
    console.log('  保存先の設定     :', diag.storeConfigured ? 'あり' : 'なし');
    console.log('  保存先への接続   :', diag.storeReachable === null ? '—' : diag.storeReachable ? 'OK' : `失敗 (${diag.error})`);
  }

  const data = await get('/api/visit');
  console.log('');
  if (!data.available) {
    console.log(`  ❌ まだ数えていません（reason: ${data.reason}）`);
    console.log(`  → ${diag.hint || 'KV_REST_API_URL と KV_REST_API_TOKEN を設定して再デプロイしてください'}`);
    process.exit(1);
  }

  console.log('  ✅ 計測中');
  console.log(`  日付             : ${data.date} (${data.timezone})`);
  for (const [name, m] of Object.entries(data.metrics || {})) {
    console.log(`  ${String(m.label || name).padEnd(6)}         : 今日 ${m.today} / 昨日 ${m.yesterday} / 今週 ${m.thisWeek} / 今月 ${m.thisMonth}` +
      (m.total !== null && m.total !== undefined ? ` / 累計 ${m.total}` : ''));
  }
  for (const [name, b] of Object.entries(data.breakdowns || {})) {
    const top = (b.items || []).slice(0, 5).map((i) => `${i.value}=${i.today}`).join(' , ');
    console.log(`  ${String(b.label || name).padEnd(6)}         : ${top || '（まだデータなし）'}`);
  }
  console.log('');
} catch (err) {
  console.error('  ❌ 確認できませんでした:', err.message);
  process.exit(1);
}
