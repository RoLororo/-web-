// ============================================================================
// dailyService — 「その日 1 日の需要変化」を組み立てる
//
//   ■ なぜ作るか（成長=複利）
//     Demand Atlas は毎日データが増えるのに、URL は 46 本から**増えない**
//     （2026-08-09 実測: sitemap.xml の <loc> は 46 件で固定）。
//     観測を続けても検索に載る面が増えないので、日数の蓄積が資産にならない。
//     日付ページを作ると 1 日 1 本ずつ恒久 URL が増え、
//     「その日なにが動いたか」は他所に存在しない一次情報になる。
//
//   ■ 新しいデータ取得はしない
//     demands.json の _scoreHistory（{dates, scores}）だけで組み立てる。
//     fetch も pipeline も増やさない。スコア式も触らない。
// ============================================================================

/** _scoreHistory を持つ全テーマの日付の和集合。新しい順 */
export function availableDates(demands = []) {
  const set = new Set();
  for (const d of demands) {
    for (const dt of d?._scoreHistory?.dates || []) set.add(dt);
  }
  return [...set].sort().reverse();
}

/** YYYY-MM-DD の形だけを通す（URL からそのままファイル名にしないための門） */
export function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** 2026-08-07 → 2026年8月7日（金） */
export function formatDateJa(iso) {
  if (!isValidDate(iso)) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  // 日付だけの比較なので UTC で作る（端末のタイムゾーンで曜日がずれないように）
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}年${m}月${d}日（${wd}）`;
}

/**
 * 指定日のスナップショット。
 * その日のスコアと、**そのテーマにとっての 1 つ前の観測日**との差を出す。
 * 全テーマが毎日そろっているとは限らない（実測: 8/01 は 15 テーマ、8/05 以降 17）
 * ので、日付を固定で 1 日引くのではなく履歴の 1 つ前を使う。
 */
export function buildDailyReport(demands = [], date) {
  if (!isValidDate(date)) return null;

  const items = [];
  for (const d of demands) {
    const h = d?._scoreHistory;
    if (!h || !Array.isArray(h.dates) || !Array.isArray(h.scores)) continue;
    const i = h.dates.indexOf(date);
    if (i < 0) continue;

    const score = h.scores[i];
    if (typeof score !== 'number') continue;
    const prev = i > 0 ? h.scores[i - 1] : null;

    items.push({
      id: d.id,
      title: d.title,
      category: d.category,
      score,
      prevScore: typeof prev === 'number' ? prev : null,
      delta: typeof prev === 'number' ? score - prev : null,
    });
  }

  if (items.length === 0) return null;

  const comparable = items.filter((x) => typeof x.delta === 'number');
  const moved = comparable.filter((x) => x.delta !== 0);
  const risers = moved.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta);
  const fallers = moved.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta);

  return {
    date,
    themeCount: items.length,
    all: [...items].sort((a, b) => b.score - a.score),
    risers,
    fallers,
    unchanged: comparable.length - moved.length,
    // 前の観測が無く比較できないテーマ。観測初日は全件がここに入る。
    // これを「横ばい」と数えると、動いていないという嘘になる。
    noPrev: items.length - comparable.length,
    topScore: items.reduce((m, x) => (x.score > m.score ? x : m), items[0]),
  };
}

/**
 * その日のぶんの投稿文（コピーしてそのまま SNS に貼れる本文）。
 *
 * owner の「毎日 1 回投稿する」を 15 分から 1 分にするのが目的なので、
 * **数字と固有名詞だけ**にして煽り文句を入れない。データが面白いから読まれる、
 * という前提を崩すと 2 回目以降が読まれなくなる。
 */
export function dailyPostText(report, siteUrl, source = 'x') {
  if (!report) return '';
  const lines = [`${formatDateJa(report.date)}の需要変化`, ''];

  if (report.risers.length) {
    lines.push('▲ 伸びた');
    for (const r of report.risers.slice(0, 3)) lines.push(`${r.title} ${r.prevScore}→${r.score} (+${r.delta})`);
  }
  if (report.fallers.length) {
    if (report.risers.length) lines.push('');
    lines.push('▼ 下がった');
    for (const f of report.fallers.slice(0, 2)) lines.push(`${f.title} ${f.prevScore}→${f.score} (${f.delta})`);
  }

  lines.push('', `${report.themeCount}テーマを7つの公開データから毎日観測しています。`);
  // URL に ?s= を付けて配信元を数える。referrer が付かない経路（LINE・Discord・
  // メールなどコピペで貼られる先）でも「どこに配ったから来たのか」が分かる。
  lines.push(dailyUrl(report.date, siteUrl, source));
  return lines.join('\n');
}

/** 日次レポートの URL。source を付けると流入を配信元別に数えられる */
export function dailyUrl(date, siteUrl, source) {
  const base = `${siteUrl}/daily/${date}`;
  return source ? `${base}?s=${encodeURIComponent(source)}` : base;
}

/** 検索結果に出す説明文。実際に動いたテーマ名を入れて日ごとに別の文にする */
export function dailyDescription(report) {
  if (!report) return '';
  // 比較できる前日が無い日（観測初日）は「上昇 0」ではなく観測の事実だけを書く
  if (report.noPrev === report.themeCount) {
    return `${formatDateJa(report.date)}時点の需要スコア一覧。この日は観測を始めた日で、${report.themeCount} テーマのスコアを記録しています。`;
  }
  const head = report.risers.slice(0, 3).map((r) => `${r.title}（+${r.delta}）`).join('、');
  const base = `${formatDateJa(report.date)}時点の需要スコアと前日からの変化。観測 ${report.themeCount} テーマ中 ${report.risers.length} テーマが上昇、${report.fallers.length} テーマが下降しました。`;
  return head ? `${base} 伸びたのは ${head}。` : base;
}
