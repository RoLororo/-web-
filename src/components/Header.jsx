import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import FoxMark from './FoxMark.jsx';

export default function Header() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    return localStorage.getItem('demand-atlas:theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('demand-atlas:theme', theme);
  }, [theme]);

  function goSearch() {
    nav('/explore');
    setOpen(false);
  }

  return (
    <header className="header">
      <div className="container header-inner">
        <NavLink to="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark" aria-hidden="true">
            <FoxMark size={26} />
          </span>
          Demand&nbsp;Atlas
          <span className="brand-name-mono" aria-hidden="true">v0.1</span>
        </NavLink>

        <nav className={`nav ${open ? 'mobile-open' : ''}`} aria-label="サイトナビゲーション">
          <NavLink to="/" end onClick={() => setOpen(false)}>ホーム</NavLink>
          <NavLink to="/explore" onClick={() => setOpen(false)}>需要を探す</NavLink>
          <NavLink to="/categories" onClick={() => setOpen(false)}>分野</NavLink>
          <NavLink to="/favorites" onClick={() => setOpen(false)}>保存した需要</NavLink>
        </nav>

        <div className="header-actions">
          <button className="icon-btn" onClick={goSearch} aria-label="需要を検索">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label="配色を切り替え"
          >
            {theme === 'light' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            )}
          </button>
          <button
            className="icon-btn mobile-menu"
            onClick={() => setOpen((o) => !o)}
            aria-label="メニューを開く"
            aria-expanded={open}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? (
                <>
                  <line x1="6" x2="18" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="18" y2="6" />
                </>
              ) : (
                <>
                  <line x1="4" x2="20" y1="7" y2="7" />
                  <line x1="4" x2="20" y1="12" y2="12" />
                  <line x1="4" x2="20" y1="17" y2="17" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
