import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSidebar } from '../context/SidebarContext';

const nav = [
  { to: '/',          label: 'Dashboard', icon: '◈' },
  { to: '/clients',   label: 'Clients',   icon: '◉' },
  { to: '/generate',  label: 'Generate',  icon: '▶' },
  { to: '/schedules', label: 'Schedules', icon: '◷' },
  { to: '/history',   label: 'History',   icon: '◫' },
  { to: '/settings',  label: 'Settings',  icon: '⚙' },
];

export default function Sidebar() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user, logout }   = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebar();

  const handleLogout = () => { logout(); navigate('/login'); };
  const w = collapsed ? 64 : 220;

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div onClick={closeMobile} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 99, display: 'none'
        }} className="mobile-backdrop" />
      )}

      <aside style={{ ...st.sidebar, width: w }} className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Collapse toggle button */}
        <button onClick={toggle} style={st.collapseBtn} title={collapsed ? 'Expand' : 'Collapse'}>
          <span style={{ display: 'inline-block', transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>‹</span>
        </button>

        {/* Logo */}
        <div style={st.logoWrap}>
          {collapsed
            ? <img src="/logo.png" alt="M" style={st.logoSmall} />
            : <img src="/logo.png" alt="Millecube" style={st.logo} />
          }
        </div>

        <div style={st.divider} />

        {/* Nav */}
        <nav style={st.nav}>
          {nav.map(item => {
            const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeMobile}
                title={collapsed ? item.label : ''}
                style={{ ...st.navItem, justifyContent: collapsed ? 'center' : 'flex-start', ...(active ? st.navActive : {}) }}
              >
                <span style={{ ...st.navIcon, ...(active ? st.navIconActive : {}) }}>{item.icon}</span>
                {!collapsed && <span style={st.navLabel}>{item.label}</span>}
                {active && !collapsed && <div style={st.activeBar} />}
              </NavLink>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Theme toggle */}
        {!collapsed ? (
          <div style={{ padding: '4px 10px' }}>
            <button onClick={toggleTheme} style={st.themeBtn}>
              <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
              <span style={st.themeLabel}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        ) : (
          <div style={{ padding: '4px 10px' }}>
            <button onClick={toggleTheme} style={{ ...st.themeBtn, justifyContent: 'center', padding: '9px 0' }} title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}>
              <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>
          </div>
        )}

        {/* User + logout */}
        {user && (
          <div style={{ ...st.userWrap, justifyContent: collapsed ? 'center' : 'space-between' }}>
            <div style={st.userInfo}>
              <div style={st.userAvatar}>{user.username?.[0]?.toUpperCase()}</div>
              {!collapsed && <div style={st.userName}>{user.username}</div>}
            </div>
            {!collapsed && (
              <button onClick={handleLogout} style={st.logoutBtn} title="Sign out">⏻</button>
            )}
          </div>
        )}

        {/* Footer text */}
        {!collapsed && (
          <div style={st.sidebarFooter}>
            <div style={st.footerTag}>TECHNICAL-FIRST</div>
            <div style={st.footerTag}>NO CONTRACT</div>
            <div style={st.footerTag}>RESULT DRIVEN</div>
          </div>
        )}
      </aside>
    </>
  );
}

// Sidebar always uses dark theme regardless of app theme
const st = {
  sidebar: {
    minHeight: '100vh',
    background: '#03140e',
    borderRight: '1px solid rgba(50,205,50,0.15)',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 0 16px',
    position: 'fixed',
    top: 0, left: 0, bottom: 0,
    zIndex: 100,
    transition: 'width 0.25s ease',
    overflow: 'hidden',
  },
  collapseBtn: {
    position: 'absolute',
    top: 20, right: -12,
    width: 24, height: 24,
    borderRadius: '50%',
    background: '#32cd32',
    color: '#03140e',
    border: 'none',
    fontSize: 16,
    fontWeight: 900,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 101,
    lineHeight: 1,
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  },
  logoWrap:  { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px', marginBottom: 4 },
  logo:      { width: 150, height: 'auto', objectFit: 'contain' },
  logoSmall: { width: 36, height: 36, objectFit: 'contain' },
  divider:   { borderTop: '1px solid rgba(50,205,50,0.12)', margin: '14px 14px' },
  nav:       { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 12px', borderRadius: 10,
    textDecoration: 'none', color: 'rgba(232,245,233,0.5)',
    fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
    position: 'relative', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  navActive:     { background: 'rgba(50,205,50,0.1)', color: '#e8f5e9', border: '1px solid rgba(50,205,50,0.2)' },
  navIcon:       { fontSize: 16, width: 20, textAlign: 'center', opacity: 0.6, flexShrink: 0 },
  navIconActive: { opacity: 1, color: '#32cd32' },
  navLabel:      { flex: 1 },
  activeBar: {
    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
    width: 3, height: '60%', background: '#32cd32', borderRadius: '2px 0 0 2px'
  },
  themeBtn: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '9px 12px', borderRadius: 10,
    background: 'none', border: '1px solid rgba(50,205,50,0.15)',
    color: 'rgba(232,245,233,0.6)', fontSize: 13, cursor: 'pointer',
    transition: 'all 0.2s', whiteSpace: 'nowrap',
  },
  themeLabel: { flex: 1, textAlign: 'left', color: 'rgba(232,245,233,0.6)' },
  userWrap: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px', margin: '4px 8px',
    borderRadius: 10, border: '1px solid rgba(50,205,50,0.15)',
    background: 'rgba(50,205,50,0.05)',
  },
  userInfo:   { display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  userAvatar: {
    width: 28, height: 28, borderRadius: '50%',
    background: '#32cd32', color: '#07503c',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, flexShrink: 0,
  },
  userName:   { fontSize: 12, fontWeight: 600, color: 'rgba(232,245,233,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  logoutBtn:  { background: 'none', border: 'none', color: 'rgba(232,245,233,0.4)', fontSize: 16, cursor: 'pointer', padding: 4, flexShrink: 0 },
  sidebarFooter: { padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  footerTag: { fontSize: 8, letterSpacing: 2.5, color: 'rgba(50,205,50,0.3)', fontWeight: 700, fontFamily: 'Montserrat, sans-serif' },
};
