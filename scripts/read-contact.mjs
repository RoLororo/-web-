// ============================================================================
// scripts/read-contact.mjs
//
// /api/contact に届いた問い合わせを読む。
//
//   実行: npm run contact:read
//   必要: .env またはシェルに <接頭辞>_REST_API_URL と <接頭辞>_REST_API_TOKEN
//         （アクセス集計と同じ変数。新しく用意するものはない）
//
// 保存は 180 日で自動的に消える。返信は自分のメールソフトから行う。
// このスクリプトは読むだけで、削除も返信もしない。
// ============================================================================

import { getStore } from '../api/_store.js';

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch {
    return iso;
  }
}

async function main() {
  const store = getStore();
  if (!store) {
    console.error('接続情報がありません。<接頭辞>_REST_API_URL と _REST_API_TOKEN を設定してください。');
    process.exit(1);
  }

  const tickets = await store.readIndex('v1:contact:index', 500);
  if (tickets.length === 0) {
    console.log('お問い合わせはまだありません。');
    return;
  }

  const items = [];
  for (const t of tickets) {
    const raw = await store.readMessage(`v1:contact:${t}`);
    if (!raw) continue; // 180 日を過ぎて消えたもの
    try { items.push(JSON.parse(raw)); } catch { /* 壊れていたら飛ばす */ }
  }
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  console.log(`\n🦊 お問い合わせ ${items.length} 件（受付番号 ${tickets.length} 件のうち、保持期間内のもの）\n`);
  for (const it of items) {
    console.log('─'.repeat(70));
    console.log(`  ${fmt(it.at)}   [${it.kind}]   受付番号 ${it.ticket}`);
    if (it.replyTo) console.log(`  返信先: ${it.replyTo}`);
    console.log('');
    for (const line of String(it.message).split('\n')) console.log(`  ${line}`);
    console.log('');
  }
  console.log('─'.repeat(70));
  console.log('※ 保存は 180 日で自動的に消えます。返信は自分のメールソフトから行ってください。\n');
}

main().catch((e) => {
  console.error('読み取りに失敗:', e.message);
  process.exit(1);
});
