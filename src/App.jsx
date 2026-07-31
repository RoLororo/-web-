import { useEffect } from 'react';
import { Routes, Route, useLocation, useNavigationType } from 'react-router-dom';
import { fetchTodayVisitors } from './services/visitorService.js';
import Header from './components/Header.jsx';
import FoxMark from './components/FoxMark.jsx';
import ToastHost from './components/ToastHost.jsx';
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
import NotFound from './pages/NotFound.jsx';

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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <nav className="footer-nav" aria-label="補助ナビゲーション">
            <a href="/explore">需要を探す</a>
            <a href="/categories">分野</a>
            <a href="/changes">変化</a>
            <a href="/timeline">履歴</a>
            <a href="/whats-new">新規追加</a>
          </nav>
          <p className="footer-text">
            <span className="brand-mini">
              <FoxMark size={16} />
              Demand Atlas
            </span>
            Wikipedia / Qiita / arXiv / App Store JP / GitHub / 国立国会図書館 / 主要ニュース RSS の公開データを日次観測。
          </p>
        </div>
      </footer>
      <ToastHost />
    </div>
  );
}
