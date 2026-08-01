// ============================================================================
// sourceReportService — /data/source-report.json の読み込み
//
// demandService と違ってトップレベル await にはしない。
// このデータを使うのは /sources だけで、他の全ページの初回描画を
// 待たせる理由がないため、必要になったときに 1 回だけ取りに行く。
// 取れなかった場合は null を返し、ページ側が「取得できませんでした」を出す
// （推定値や前回値でごまかさない）。
// ============================================================================

const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : '';

let cache = null;    // 成功した結果
let inflight = null; // 同時に複数回呼ばれても fetch は 1 回

export function loadSourceReport() {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  const url = `${import.meta.env.BASE_URL}data/source-report.json${BUILD_ID ? '?v=' + BUILD_ID : ''}`;
  inflight = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`http-${res.status}`);
      return res.json();
    })
    .then((data) => {
      if (!data || !Array.isArray(data.sources)) throw new Error('shape');
      cache = data;
      return data;
    })
    .catch(() => null)
    .finally(() => { inflight = null; });

  return inflight;
}

/** 成功率。取れなかったテーマがある情報源を見分けるために使う */
export function coverageOf(source) {
  if (!source || !source.mappedThemeCount) return null;
  return Math.round((source.successCount / source.mappedThemeCount) * 100);
}
