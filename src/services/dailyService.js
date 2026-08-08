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

/**
 * 日次レポートが存在する日付の一覧（全テーマの和集合）。新しい順。
 *
 * **_scoreHistory ではなく _scoreSeries を使う。** _scoreHistory は直近 14 日に
 * 切られているので、そちらを使うと観測 15 日目から古い日付が落ち、
 * 公開済みの /daily/<古い日> が消えて 404 になる（2026-08-09 に scratch で再現）。
 * _scoreSeries は全期間。古い demands.json との互換のため fallback は残す。
 */
function seriesOf(d) {
  return d?._scoreSeries?.dates?.length ? d._scoreSeries : d?._scoreHistory;
}

export function availableDates(demands = []) {
  const set = new Set();
  for (const d of demands) {
    for (const dt of seriesOf(d)?.dates || []) set.add(dt);
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
    const h = seriesOf(d);
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

// 投稿文の長さの上限。X の数え方に合わせる。
//   ・全角（CJK）は 2、それ以外は 1
//   ・URL は実際の長さに関係なく一律 23
// 2026-08-09 実測: 生成した投稿文は 308 で、X の上限 280 を 28 超えていた。
// 「投稿文をコピー」をそのまま貼っても投稿できず、手作業で削る必要があった。
// 毎日貼るのが前提の導線なので、貼れない文面を作らない。
const POST_LIMIT = 280;
const URL_WEIGHT = 23;

/** X と同じ重み付けで数える。URL は 23 に置き換える */
export function postWeight(text) {
  if (!text) return 0;
  const url = text.match(/https?:\/\/\S+/);
  const body = url ? text.replace(url[0], '') : text;
  let n = 0;
  for (const ch of body) {
    const c = ch.codePointAt(0);
    const wide =
      (c >= 0x1100 && c <= 0x11ff) || (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6);
    n += wide ? 2 : 1;
  }
  return n + (url ? URL_WEIGHT : 0);
}

/**
 * その日のぶんの投稿文（コピーしてそのまま SNS に貼れる本文）。
 *
 * owner の「毎日 1 回投稿する」を 15 分から 1 分にするのが目的なので、
 * **数字と固有名詞だけ**にして煽り文句を入れない。データが面白いから読まれる、
 * という前提を崩すと 2 回目以降が読まれなくなる。
 *
 * 上限を超える場合は、テーマ名を削らずに **行ごと落とす**。
 * 名前を切り詰めると「決済インフラ・キャッ…」のような読めない行になり、
 * データとしての価値が消えるため。落とす順は 下がった → 伸びた の末尾から
 * （伸びたテーマは最低 1 行残す）。テーマ名の長さは日によって変わるので、
 * 固定の件数ではなく実際に数えながら減らす。
 */
export function dailyPostText(report, siteUrl, source = 'x') {
  if (!report) return '';

  const build = (nRise, nFall) => {
    const lines = [`${formatDateJa(report.date)}の需要変化`, ''];
    const rise = report.risers.slice(0, nRise);
    const fall = report.fallers.slice(0, nFall);
    if (rise.length) {
      lines.push('▲ 伸びた');
      for (const r of rise) lines.push(`${r.title} ${r.prevScore}→${r.score} (+${r.delta})`);
    }
    if (fall.length) {
      if (rise.length) lines.push('');
      lines.push('▼ 下がった');
      for (const f of fall) lines.push(`${f.title} ${f.prevScore}→${f.score} (${f.delta})`);
    }
    lines.push('', `${report.themeCount}テーマを7つの公開データから毎日観測しています。`);
    // URL に ?s= を付けて配信元を数える。referrer が付かない経路（LINE・Discord・
    // メールなどコピペで貼られる先）でも「どこに配ったから来たのか」が分かる。
    lines.push(dailyUrl(report.date, siteUrl, source));
    return lines.join('\n');
  };

  let nRise = Math.min(3, report.risers.length);
  let nFall = Math.min(2, report.fallers.length);
  let text = build(nRise, nFall);
  while (postWeight(text) > POST_LIMIT && (nFall > 0 || nRise > 1)) {
    if (nFall > 0) nFall -= 1;
    else nRise -= 1;
    text = build(nRise, nFall);
  }
  return text;
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
