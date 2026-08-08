import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Link, useLocation, useNavigationType } from 'react-router-dom';
import { fetchTodayVisitors } from './services/visitorService.js';
import Header from './components/Header.jsx';
import FoxMark from './components/FoxMark.jsx';
import ToastHost from './components/ToastHost.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Home from './pages/Home.jsx';
import DemandDetail from './pages/DemandDetail.jsx';
import Explore from './pages/Explore.jsx';
import Categories from './pages/Categories.jsx';
import CategoryDetail from './pages/CategoryDetail.jsx';
import Favorites from './pages/Favorites.jsx';
import Timeline from './pages/Timeline.jsx';
import Changes from './pages/Changes.jsx';
import Rankings from './pages/Rankings.jsx';
import WhatsNew from './pages/WhatsNew.jsx';
import Compare from './pages/Compare.jsx';
import Ideas from './pages/Ideas.jsx';
import DailyIndex from './pages/DailyIndex.jsx';
import DailyReport from './pages/DailyReport.jsx';
import NotFound from './pages/NotFound.jsx';

// 説明・法的ページは長い散文で、開かれる回数もごく少ない。
// 一緒に束ねると初回表示の JS が重くなる（実測: 同梱すると gzip 後 +11.5KB）。
// 別チャンクにして、そのページを開いた人だけが読み込むようにする。
const About       = lazy(() => import('./pages/About.jsx'));
const Methodology = lazy(() => import('./pages/Methodology.jsx'));
const Privacy     = lazy(() => import('./pages/Privacy.jsx'));
const Terms       = lazy(() => import('./pages/Terms.jsx'));
const Contact     = lazy(() => import('./pages/Contact.jsx'));
const Sources      = lazy(() => import('./pages/Sources.jsx'));
const SourceDetail = lazy(() => import('./pages/SourceDetail.jsx'));
const Glossary     = lazy(() => import('./pages/Glossary.jsx'));
const Guide        = lazy(() => import('./pages/Guide.jsx'));

export default function App() {
  const location = useLocation();
  const navigationType = useNavigationType();

  // ページを移動したら先頭から見せる。
  // SPA は遷移してもスクロール位置が残るため、一覧を下まで見てからテーマを開くと
  // ページの途中から始まっていた（2026-07-31 実測: scrollY 1800 のまま、見出しが
  // 画面の 1628px 上にある状態で開いていた）。
  // 「戻る / 進む」(POP) はブラウザの位置復元に任せる。ハッシュ付きはその要素へ。
  useEffect(() => {
    if (navigationType === 'POP') return;
    if (location.hash) {
      const target = document.querySelector(location.hash);
      if (target) { target.scrollIntoView(); return; }
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.hash, navigationType]);

  // 画面が変わるたびに 1 回だけ通知する。訪問そのものは 1 日 1 回、ページは
  // 「その日そのページを初めて見た時」だけ数える（判定は visitorService 側）。
  // 失敗しても表示には影響しないので投げっぱなしにする。
  useEffect(() => {
    fetchTodayVisitors({ path: location.pathname });
  }, [location.pathname]);

  return (
    <div className="app">
      {/* キーボード利用者がナビ 5 項目を毎ページ通過せず本文へ飛べるようにする。
          top の切り替えでは :focus が効かなかったため clip-path 方式にした
          （2026-07-30 実測: ルールは適用されるのに computed top が変わらなかった） */}
      <a href="#main" className="skip-link">本文へスキップ</a>
      <Header />
      <main className="main" id="main" tabIndex={-1}>
        {/* key forces a remount → page-fade animation replays on every navigation */}
        <div className="page-fade" key={location.pathname}>
          {/* 描画時の例外を本文だけで受け止める安全網（白画面＝直帰を防ぐ）。
              key に pathname を持つこの div の内側に置くので、別ページへ遷移すると
              境界も再マウントされ自動復帰する。 */}
          <ErrorBoundary>
          {/* 遅延読み込みするのは説明・法的ページだけ。読み込みは一瞬なので、
              スピナーではなく高さだけ確保して画面が飛び跳ねないようにする */}
          <Suspense fallback={<div className="container section" style={{ minHeight: '60vh' }} />}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/categories/:name" element={<CategoryDetail />} />
            <Route path="/demand/:id" element={<DemandDetail />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/changes" element={<Changes />} />
            <Route path="/rankings" element={<Rankings />} />
            <Route path="/whats-new" element={<WhatsNew />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/ideas" element={<Ideas />} />
            <Route path="/daily" element={<DailyIndex />} />
            <Route path="/daily/:date" element={<DailyReport />} />
            {/* サイトの説明・法的情報。検索と広告審査の両方から参照される */}
            <Route path="/about" element={<About />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/contact" element={<Contact />} />
            {/* 情報源・用語・読み方。サイトの中身を説明する読み物 */}
            <Route path="/sources" element={<Sources />} />
            <Route path="/sources/:id" element={<SourceDetail />} />
            <Route path="/glossary" element={<Glossary />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </div>
      </main>
      {/* フッターは <a href> だと毎回ページ全体を読み込み直していた（SPA の遷移に
          ならず、状態も破棄される）。全て <Link> に統一する。
          サイトの説明と法的情報は、どのページからも 1 クリックで届く必要がある
          （検索から詳細ページに着地した人と、広告審査の担当者の両方が使う）。 */}
      <footer className="footer">
        <div className="container footer-inner">
          <nav className="footer-nav" aria-label="補助ナビゲーション">
            <Link to="/explore">需要を探す</Link>
            <Link to="/categories">分野</Link>
            <Link to="/changes">変化</Link>
            <Link to="/timeline">履歴</Link>
            <Link to="/whats-new">新規追加</Link>
          </nav>
          <nav className="footer-nav footer-nav-meta" aria-label="サイト情報">
            <Link to="/guide">読み方</Link>
            <Link to="/sources">情報源</Link>
            <Link to="/glossary">用語集</Link>
            <Link to="/about">このサイトについて</Link>
            <Link to="/methodology">計算方法</Link>
            <Link to="/contact">お問い合わせ</Link>
            <Link to="/privacy">プライバシーポリシー</Link>
            <Link to="/terms">利用規約</Link>
            {/* フィードは React のルートではないので <Link> にしない */}
            <a href="/feed.xml">RSS</a>
          </nav>
          <p className="footer-text">
            <span className="brand-mini">
              <FoxMark size={16} />
              Demand Atlas
            </span>
            Wikipedia / Qiita / arXiv / App Store JP / GitHub / 国立国会図書館 / 主要ニュース RSS の公開データを日次観測。
            スコアは決まった計算式による観測結果で、将来の予測ではありません。
          </p>
        </div>
      </footer>
      <ToastHost />
    </div>
  );
}
