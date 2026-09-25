import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useEffect, useState } from 'react';

import LogoutButton from './LogoutButton';

interface AppShellProps {
  authenticated?: boolean;
  children: ReactNode;
}

function getNavClass(active: boolean) {
  return [
    'rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
    active
      ? 'border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--ink)]'
      : 'border-transparent text-[var(--ink-soft)] hover:border-[var(--line)] hover:bg-white/70 hover:text-[var(--ink)]',
  ].join(' ');
}

export default function AppShell({ authenticated = false, children }: AppShellProps) {
  const location = useLocation();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('lightframe-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const nextDarkMode = savedTheme ? savedTheme === 'dark' : prefersDark;
    setDarkMode(nextDarkMode);
    document.documentElement.classList.toggle('theme-dark', nextDarkMode);
  }, []);

  const toggleTheme = () => {
    setDarkMode((current) => {
      const nextDarkMode = !current;
      document.documentElement.classList.toggle('theme-dark', nextDarkMode);
      window.localStorage.setItem('lightframe-theme', nextDarkMode ? 'dark' : 'light');
      return nextDarkMode;
    });
  };
  const currentPath =
    location.pathname.includes('gallery')
      ? location.pathname.includes('/manage')
        ? '/manage/gallery'
        : '/gallery'
      : location.pathname.includes('about')
        ? '/about'
        : location.pathname.startsWith('/manage')
          ? '/manage'
          : '/';

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Link to={authenticated ? '/manage' : '/'} className="brand-lockup">
            <span className="brand-mark"><img src="/brand/avatar.png" alt="" /></span>
            <span>
              <span className="brand-name">Lightframe</span>
              <span className="brand-subtitle">image archive</span>
            </span>
          </Link>

          {authenticated ? (
            <div className="header-actions">
              <nav className="nav-cluster">
                <Link to="/manage" className={getNavClass(currentPath === '/manage')}>
                  上传
                </Link>
                <Link to="/manage/gallery" className={getNavClass(currentPath === '/manage/gallery')}>
                  图库
                </Link>
                <Link to="/gallery" className={getNavClass(false)}>
                  公开画廊
                </Link>
              </nav>
              <button
                type="button"
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label={darkMode ? '切换到浅色主题' : '切换到深色主题'}
                title={darkMode ? '切换到浅色主题' : '切换到深色主题'}
              >
                {darkMode ? '☼' : '◐'}
              </button>
              <LogoutButton />
            </div>
          ) : (
            <div className="header-actions">
              <nav className="nav-cluster">
                <Link to="/gallery" className={getNavClass(currentPath === '/gallery')}>画廊</Link>
                <Link to="/about" className={getNavClass(currentPath === '/about')}>说明</Link>
              </nav>
              <button
                type="button"
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label={darkMode ? '切换到浅色主题' : '切换到深色主题'}
                title={darkMode ? '切换到浅色主题' : '切换到深色主题'}
              >
                {darkMode ? '☼' : '◐'}
              </button>
              <Link to="/login" className="button-primary px-4 py-2.5">管理登录</Link>
            </div>
          )}
        </div>
      </header>

      <main className="site-main">{children}</main>
    </div>
  );
}
