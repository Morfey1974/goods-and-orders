import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { languages } from '../i18n';
import i18n from '../i18n';

const navItems = [
  { to: '/', key: 'dashboard' },
  { to: '/orders', key: 'orders' },
  { to: '/customers', key: 'customers' },
  { to: '/products', key: 'products' },
  { to: '/warehouse', key: 'warehouse' },
  { to: '/documents', key: 'documents' },
  { to: '/reports', key: 'reports' },
  { to: '/settings', key: 'settings' },
] as const;

export function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  const changeLang = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('lang', code);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">{t('appTitle')}</div>
        <div className="header-actions">
          <select
            className="lang-select"
            value={i18n.language}
            onChange={(e) => changeLang(e.target.value)}
            aria-label={t('language')}
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <span className="user-label">{user?.businessName}</span>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            {t('logout')}
          </button>
        </div>
      </header>
      <div className="app-body">
        <nav className="app-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
