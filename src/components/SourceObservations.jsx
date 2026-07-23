// ============================================================================
// SourceObservations — DemandDetail 用「情報源別の実際の観測」
//
//   ■ 目的
//     demand._{source}Detail.topItems (fetch-{source}.mjs が保存) を読み、
//     UI に「実際に観測された Qiita 記事 / arXiv 論文 / App Store アプリ」を出す。
//     数字だけだった SourceTrends を補完し「なぜ動いた」を人間可読にする。
//
//   ■ 対象ソース
//     - qiita:    { title, url, publishedAt, likes, author }
//     - arxiv:    { title, url, publishedAt, category, authorCount, firstAuthor }
//     - appstore: { name, publisher, rank, chart, appId, category }  (url 無)
//
//   ■ 表示ポリシー
//     - topItems が無いソースは silent skip (デプロイ直後は空になり得る)
//     - App Store は Apple ToS 準拠のためリンクは張らない、テキスト表示のみ
//     - ソース catalog (sourceCatalog.js) の display 名/色を継承
// ============================================================================

import { sourceDisplay, sourceColor } from '../services/sourceCatalog.js';

function fmtDate(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

function ItemRow({ children }) {
  return <li className="src-obs-item">{children}</li>;
}

function ExternalLink({ href, children }) {
  if (!href) return <span className="src-obs-title no-link">{children}</span>;
  return (
    <a className="src-obs-title" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="src-obs-ext" aria-hidden>↗</span>
    </a>
  );
}

function QiitaBlock({ items }) {
  return (
    <ul className="src-obs-list">
      {items.map((it, i) => (
        <ItemRow key={i}>
          <div className="src-obs-meta">
            <span className="src-obs-badge">LGTM {it.likes ?? 0}</span>
            {it.author && <span className="src-obs-sub">@{it.author}</span>}
            <span className="src-obs-date">{fmtDate(it.publishedAt)}</span>
          </div>
          <ExternalLink href={it.url}>{it.title}</ExternalLink>
        </ItemRow>
      ))}
    </ul>
  );
}

function ArxivBlock({ items }) {
  return (
    <ul className="src-obs-list">
      {items.map((it, i) => (
        <ItemRow key={i}>
          <div className="src-obs-meta">
            {it.category && <span className="src-obs-badge">{it.category}</span>}
            {it.firstAuthor && (
              <span className="src-obs-sub">
                {it.firstAuthor}
                {it.authorCount > 1 ? ` et al. (${it.authorCount})` : ''}
              </span>
            )}
            <span className="src-obs-date">{fmtDate(it.publishedAt)}</span>
          </div>
          <ExternalLink href={it.url}>{it.title}</ExternalLink>
        </ItemRow>
      ))}
    </ul>
  );
}

function AppstoreBlock({ items }) {
  const chartLabel = (c) =>
    c === 'topfreeapplications'     ? '無料 top' :
    c === 'topgrossingapplications' ? '売上 top' :
    c || '';
  return (
    <ul className="src-obs-list">
      {items.map((it, i) => (
        <ItemRow key={i}>
          <div className="src-obs-meta">
            <span className="src-obs-badge rank">#{it.rank}</span>
            <span className="src-obs-sub">{chartLabel(it.chart)}</span>
            {it.category && <span className="src-obs-date">{it.category}</span>}
          </div>
          <span className="src-obs-title no-link">
            {it.name}
            {it.publisher && <span className="src-obs-publisher">— {it.publisher}</span>}
          </span>
        </ItemRow>
      ))}
    </ul>
  );
}

const SOURCE_RENDERERS = {
  qiita:    { Block: QiitaBlock,    getItems: (d) => d._qiitaDetail?.topItems || [] },
  arxiv:    { Block: ArxivBlock,    getItems: (d) => d._arxivDetail?.topItems || [] },
  appstore: { Block: AppstoreBlock, getItems: (d) => d._appstoreDetail?.topItems || [] },
};

const SOURCE_ORDER = ['qiita', 'arxiv', 'appstore'];

export default function SourceObservations({ demand }) {
  if (!demand) return null;

  const sections = SOURCE_ORDER
    .map((src) => {
      const def = SOURCE_RENDERERS[src];
      const items = def.getItems(demand);
      return items.length > 0 ? { src, Block: def.Block, items } : null;
    })
    .filter(Boolean);

  if (sections.length === 0) {
    // まだ topItems が populate されていない (旧データ) 場合は無音
    return null;
  }

  return (
    <div className="src-obs">
      {sections.map(({ src, Block, items }) => (
        <div key={src} className="src-obs-block">
          <div className="src-obs-head">
            <span className="src-obs-dot" style={{ background: sourceColor(src) }} />
            <span className="src-obs-name">{sourceDisplay(src)}</span>
            <span className="src-obs-count">上位 {items.length} 件</span>
          </div>
          <Block items={items} />
        </div>
      ))}
    </div>
  );
}
