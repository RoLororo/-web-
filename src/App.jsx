import { Routes, Route, useLocation } from 'react-router-dom';
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
import NotFound from './pages/NotFound.jsx';

export default function App() {
  const location = useLocation();

  return (
    <div className="app">
      <Header />
      <main className="main">
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
      <footer className="footer">
        <div className="container">
          <p className="footer-text">
            <span className="brand-mini">
              <FoxMark size={16} />
              Demand Atlas
            </span>
            プロトタイプ版。表示されている需要スコア・データはすべてサービス検証のためのモックデータです。
          </p>
        </div>
      </footer>
      <ToastHost />
    </div>
  );
}
