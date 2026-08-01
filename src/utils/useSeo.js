// ============================================================================
// useSeo — ページごとの title / description / canonical / 構造化データ
//
// SPA は index.html を全ルートで使い回すため、放っておくと全ページが同じ
// description と canonical を名乗る（2026-08-01 実測: 生 HTML の <title> は
// どのルートでも "Demand Atlas — 世の中の需要を可視化する" だった）。
// 検索エンジンから見ると「同じページが 13 個ある」状態になり、どれを載せるか
// 決められなくなる。ここでルートごとに書き換える。
//
// 消し忘れると次のページに前のページの description が残るので、
// **このフックが作ったタグは必ずアンマウント時に消す**。
// index.html にもともと書いてある静的タグは触らない（消してはいけない）。
// ============================================================================

import { createContext, useContext, useEffect } from 'react';
import { SITE_URL, SITE_NAME } from '../config/site.js';

const DEFAULT_TITLE = 'Demand Atlas — 世の中の需要を可視化する';
const MANAGED = 'data-seo-managed'; // このフックが作った印。静的タグと区別する

/**
 * ビルド時のプリレンダ用の受け皿。
 *
 * meta タグを効果（useEffect）で書き換える方式は、ブラウザでは正しく動くが
 * **サーバーでは効果が走らない**ので、生 HTML には何も入らない。
 * 2026-08-01 実測: 37 URL すべてが同じ title / og:title を返していた。
 * X・Slack・LINE などのカードは JavaScript を実行しないため、
 * どのページを共有しても同じ見出しが出ていた。
 *
 * そこで、収集器が渡されている時（= プリレンダ中）だけ、
 * レンダー中に値を渡す。ブラウザでは収集器が null なので従来どおり。
 */
export const SeoCollectorContext = createContext(null);

/** name / property 属性の meta を、無ければ作って書き換える */
function setMeta(attr, key, content) {
  if (!content) return null;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  let created = false;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute(MANAGED, '1');
    document.head.appendChild(el);
    created = true;
  }
  const previous = el.getAttribute('content');
  el.setAttribute('content', content);
  return { el, created, previous };
}

function setLink(rel, href) {
  if (!href) return null;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  let created = false;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute(MANAGED, '1');
    document.head.appendChild(el);
    created = true;
  }
  const previous = el.getAttribute('href');
  el.setAttribute('href', href);
  return { el, created, previous };
}

/**
 * @param {object}  o
 * @param {string}  o.title        <title> と og:title
 * @param {string}  o.description  meta description と og:description（120〜160 字が目安）
 * @param {string}  o.path         canonical に使うパス（省略時は現在の pathname）
 * @param {object|object[]} o.jsonLd  schema.org の構造化データ
 * @param {boolean} o.noindex      検索結果に出したくないページ（404 など）
 */
export function useSeo({ title, description, path, jsonLd, noindex = false } = {}) {
  // jsonLd はオブジェクトリテラルで渡されることが多く、毎レンダー別参照になる。
  // 文字列化したものを依存配列に使い、中身が同じなら再実行しない。
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : '';

  // プリレンダ中だけ、レンダー中に値を書き出す。
  // サーバーでは 1 回しか描画されないので二重登録は起きない。
  const collector = useContext(SeoCollectorContext);
  if (collector) {
    collector.title = title || DEFAULT_TITLE;
    collector.description = description || '';
    collector.canonical = noindex ? null : SITE_URL + (path || collector.currentPath || '/');
    collector.noindex = noindex;
    collector.jsonLd = jsonLdKey || null;
  }

  useEffect(() => {
    const restore = [];
    const previousTitle = document.title;
    document.title = title || DEFAULT_TITLE;

    const canonical = SITE_URL + (path || window.location.pathname);

    restore.push(
      setMeta('name', 'description', description),
      setMeta('property', 'og:title', title || DEFAULT_TITLE),
      setMeta('property', 'og:description', description),
      setMeta('property', 'og:url', canonical),
      setMeta('name', 'twitter:title', title || DEFAULT_TITLE),
      setMeta('name', 'twitter:description', description),
      // noindex のページには canonical を出さない。
      // 「索引に入れるな」と「この URL を正規とみなせ」は矛盾した指示になり、
      // 404 では存在しない URL を正規として名乗ることにもなる
      // （実測: /this-does-not-exist が自分自身を canonical にしていた）。
      noindex ? null : setLink('canonical', canonical),
    );

    // noindex はこのページにいる間だけ。付けっぱなしにすると全ページが消える
    let robotsEl = null;
    if (noindex) {
      robotsEl = document.createElement('meta');
      robotsEl.setAttribute('name', 'robots');
      robotsEl.setAttribute('content', 'noindex, follow');
      robotsEl.setAttribute(MANAGED, '1');
      document.head.appendChild(robotsEl);
    }

    let ldEl = null;
    if (jsonLdKey) {
      ldEl = document.createElement('script');
      ldEl.type = 'application/ld+json';
      ldEl.setAttribute(MANAGED, '1');
      ldEl.textContent = jsonLdKey;
      document.head.appendChild(ldEl);
    }

    return () => {
      document.title = previousTitle;
      for (const r of restore) {
        if (!r) continue;
        // 自分で作ったタグは消す。もとからあった静的タグは値を戻すだけ
        if (r.created) r.el.remove();
        else if (r.previous !== null) {
          r.el.setAttribute(r.el.tagName === 'LINK' ? 'href' : 'content', r.previous);
        }
      }
      if (robotsEl) robotsEl.remove();
      if (ldEl) ldEl.remove();
    };
  }, [title, description, path, jsonLdKey, noindex]);
}

/** サイト全体を表す WebSite。トップページだけに付ける */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL + '/',
    inLanguage: 'ja',
    description: '公開データから需要の変化を観測し、スコアと判定として可視化するサービス。',
  };
}

/** パンくずの構造化データ。items は [{ name, path }] */
export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: SITE_URL + it.path,
    })),
  };
}
