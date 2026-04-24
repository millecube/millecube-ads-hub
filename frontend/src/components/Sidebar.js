import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { logocolor } from '../assets/brandAssets';

const nav = [
  { to: '/',           label: 'Dashboard',   icon: '◈' },
  { to: '/clients',    label: 'Clients',      icon: '◉' },
  { to: '/generate',   label: 'Generate',     icon: '▶' },
  { to: '/schedules',  label: 'Schedules',    icon: '◷' },
  { to: '/history',    label: 'History',      icon: '◫' },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside style={styles.sidebar}>
      {/* Logo */}
      <div style={styles.logoWrap}>
        <img src={logocolor} alt="Millecube" style={styles.logo} />
        <div>
          <div style={styles.logoTitle}>ADS HUB</div>
          <div style={styles.logoSub}>by Millecube Digital</div>
        </div>
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
    background: 'rgba(3,20,14,0.85)',
    borderRight: '1px solid rgba(50,205,50,0.12)',
    backdropFilter: 'blur(20px)',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 0',
    position: 'fixed',
    top: 0, left: 0, bottom: 0,
    zIndex: 100,
  },
  logoWrap: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '0 20px 0 20px', marginBottom: 4
  },
  logo: { width: 36, height: 36, objectFit: 'contain' },
  logoTitle: {
    fontSize: 13, fontWeight: 800, color: '#32cd32',
    letterSpacing: 3, fontFamily: 'Montserrat, sans-serif'
  },
  logoSub: {
    fontSize: 9, color: 'rgba(232,245,233,0.35)',
    letterSpacing: 1, fontFamily: 'Montserrat, sans-serif', marginTop: 1
  },
  divider: { borderTop: '1px solid rgba(50,205,50,0.12)', margin: '18px 20px' },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 14px',
    borderRadius: 10,
    textDecoration: 'none',
    color: 'rgba(232,245,233,0.45)',
    fontSize: 13, fontWeight: 500,
    transition: 'all 0.2s',
    position: 'relative',
    cursor: 'pointer',
  },
  navActive: {
    background: 'rgba(50,205,50,0.1)',
    color: '#e8f5e9',
    border: '1px solid rgba(50,205,50,0.2)',
  },
  navIcon: { fontSize: 16, width: 20, textAlign: 'center', opacity: 0.6 },
  navIconActive: { opacity: 1, color: '#32cd32' },
  navLabel: { flex: 1 },
  activeBar: {
    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
    width: 3, height: '60%', background: '#32cd32', borderRadius: '2px 0 0 2px'
  },
  sidebarFooter: {
    padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: 4
  },
  footerTag: {
    fontSize: 8, letterSpacing: 2.5, color: 'rgba(50,205,50,0.3)',
    fontWeight: 700, fontFamily: 'Montserrat, sans-serif'
  }
};
