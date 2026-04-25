import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const nav = [
  { to: '/',           label: 'Dashboard',  icon: '◈' },
  { to: '/clients',    label: 'Clients',    icon: '◉' },
  { to: '/generate',   label: 'Generate',   icon: '▶' },
  { to: '/schedules',  label: 'Schedules',  icon: '◷' },
  { to: '/history',    label: 'History',    icon: '◫' },
  { to: '/settings',   label: 'Settings',   icon: '⚙' },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <aside style={styles.sidebar}>
      {/* Logo */}
      <div style={styles.logoWrap}>
        <img src="/logo.png" alt="Millecube" style={styles.logo} />
      </div>

      <div style={styles.divider} />

      {/* Nav */}
      <nav style={styles.nav}>
        {nav.map(item => {
          const active = item.to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              style={{ ...styles.navItem, ...(active ? styles.navActive : {}) }}
            >
              <span style={{ ...styles.navIcon, ...(active ? styles.navIconActive : {}) }}>
                {item.icon}
              </span>
              <span style={styles.navLabel}>{item.label}</span>
              {active && <div style={styles.activeBar} />}
            </NavLink>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Theme toggle */}
      <div style={styles.themeWrap}>
        <button onClick={toggle} style={styles.themeBtn}>
          <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span style={styles.themeLabel}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>

      {/* User + logout */}
      {user && (
        <div style={styles.userWrap}>
          <div style={styles.userInfo}>
            <div style={styles.userAvatar}>{user.username?.[0]?.toUpperCase()}</div>
            <div style={styles.userName}>{user.username}</div>
          </div>
          <button onClick={handleLogout} style={styles.logoutBtn} title="Sign out">⏻</button>
        </div>
      )}

      {/* Footer */}
      <div style={styles.sidebarFooter}>
        <div style={styles.footerTag}>TECHNICAL-FIRST</div>
        <div style={styles.footerTag}>NO CONTRACT</div>
        <div style={styles.footerTag}>RESULT DRIVEN</div>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 220,
    minHeight: '100vh',
    background: 'var(--sidebar-bg)',
    borderRight: '1px solid var(--border)',
    backdropFilter: 'blur(20px)',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 0',
    position: 'fixed',
    top: 0, left: 0, bottom: 0,
    zIndex: 100,
  },
  logoWrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 16px', marginBottom: 4
  },
  logo: { width: 160, height: 'auto', objectFit: 'contain' },
  divider: { borderTop: '1px solid var(--border)', margin: '18px 20px' },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 14px',
    borderRadius: 10,
    textDecoration: 'none',
    color: 'var(--text-muted)',
    fontSize: 13, fontWeight: 500,
    transition: 'all 0.2s',
    position: 'relative',
    cursor: 'pointer',
  },
  navActive: {
    background: 'rgba(50,205,50,0.1)',
    color: 'var(--text-primary)',
    border: '1px solid rgba(50,205,50,0.2)',
  },
  navIcon:       { fontSize: 16, width: 20, textAlign: 'center', opacity: 0.6 },
  navIconActive: { opacity: 1, color: 'var(--accent)' },
  navLabel:      { flex: 1 },
  activeBar: {
    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
    width: 3, height: '60%', background: 'var(--accent)', borderRadius: '2px 0 0 2px'
  },
  themeWrap: { padding: '8px 10px' },
  themeBtn: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 14px', borderRadius: 10,
    background: 'none', border: '1px solid var(--border)',
    color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
    transition: 'all 0.2s',
  },
  themeLabel: { flex: 1, textAlign: 'left' },
  userWrap: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', margin: '4px 10px',
    borderRadius: 10, border: '1px solid var(--border)',
    background: 'rgba(50,205,50,0.05)',
  },
  userInfo:   { display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  userAvatar: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--accent)', color: '#07503c',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, flexShrink: 0,
  },
  userName:   { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  logoutBtn:  { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer', padding: 4, flexShrink: 0 },
  sidebarFooter: { padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 4 },
  footerTag: {
    fontSize: 8, letterSpacing: 2.5, color: 'rgba(50,205,50,0.3)',
    fontWeight: 700, fontFamily: 'Montserrat, sans-serif'
  }
};
