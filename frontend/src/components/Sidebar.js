import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSidebar } from '../context/SidebarContext';
import { useWindowWidth } from '../hooks/useWindowWidth';

const SECTIONS = [
  {
    id: 'analytic',
    label: 'Analytic',
    icon: '◎',
    children: [
      { to: '/monitor',     label: 'Dashboard',   icon: '◈' },
      { to: '/performance', label: 'Performance',  icon: '▦' },
      { to: '/compare',     label: 'Monitor',      icon: '◬' },
    ],
  },
  {
    id: 'report',
    label: 'Report',
    icon: '◫',
    children: [
      { to: '/',          label: 'Dashboard', icon: '◈' },
      { to: '/generate',  label: 'Generate',  icon: '▶' },
      { to: '/budget',    label: 'Budget',    icon: '◐' },
      { to: '/schedules', label: 'Schedule',  icon: '◷' },
      { to: '/history',   label: 'History',   icon: '▣' },
    ],
  },
  { to: '/clients',  label: 'Client',   icon: '◉' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

function isChildActive(children, pathname) {
  return children.some(c => c.to === '/' ? pathname === '/' : pathname.startsWith(c.to));
}

function getInitialExpanded(pathname) {
  const s = new Set();
  SECTIONS.forEach(sec => {
    if (sec.children && isChildActive(sec.children, pathname)) s.add(sec.id);
  });
  if (s.size === 0) { s.add('analytic'); s.add('report'); }
  return s;
}

const EASE = [0.4, 0, 0.2, 1];

export default function Sidebar() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user, logout }   = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebar();

  const [expanded, setExpanded] = useState(() => getInitialExpanded(location.pathname));

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  const handleLogout = () => { logout(); navigate('/login'); };

  const toggleSection = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isActive = (to) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  // On mobile the sidebar is always full-width (never icon-only)
  const isCollapsed = isMobile ? false : collapsed;

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeMobile}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={
          isMobile
            ? {
                x: mobileOpen ? 0 : -230,
                boxShadow: mobileOpen ? '6px 0 32px rgba(0,0,0,0.55)' : 'none',
              }
            : { width: collapsed ? 64 : 220, x: 0, boxShadow: 'none' }
        }
        transition={{ duration: 0.28, ease: EASE }}
        style={st.sidebar}
        className="sidebar"
      >
        {/* Collapse toggle — desktop only */}
        {!isMobile && (
          <motion.button
            onClick={toggle}
            style={st.collapseBtn}
            title={collapsed ? 'Expand' : 'Collapse'}
            whileHover={{ scale: 1.15, boxShadow: '0 4px 14px rgba(50,205,50,0.5)' }}
            whileTap={{ scale: 0.88 }}
            transition={{ duration: 0.15 }}
          >
            <motion.span
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              style={{ display: 'inline-block', lineHeight: 1 }}
            >
              ‹
            </motion.span>
          </motion.button>
        )}

        {/* Logo */}
        <div style={st.logoWrap}>
          <AnimatePresence mode="wait" initial={false}>
            {isCollapsed ? (
              <motion.img
                key="logo-sm"
                src="/logo.png"
                alt="M"
                style={st.logoSmall}
                initial={{ opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.75 }}
                transition={{ duration: 0.18 }}
              />
            ) : (
              <motion.img
                key="logo-lg"
                src="/logo.png"
                alt="Millecube"
                style={st.logo}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              />
            )}
          </AnimatePresence>
        </div>

        <div style={st.divider} />

        {/* Nav */}
        <nav style={st.nav}>
          {SECTIONS.map(sec => {
            if (sec.to) {
              const active = isActive(sec.to);
              return (
                <NavLink
                  key={sec.to}
                  to={sec.to}
                  onClick={closeMobile}
                  title={isCollapsed ? sec.label : ''}
                  style={{ ...st.navItem, justifyContent: isCollapsed ? 'center' : 'flex-start', ...(active ? st.navActive : {}) }}
                >
                  <span style={{ ...st.navIcon, ...(active ? st.navIconActive : {}) }}>{sec.icon}</span>
                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0, transition: { delay: 0.06, duration: 0.16 } }}
                        exit={{ opacity: 0, x: -6, transition: { duration: 0.1 } }}
                        style={st.navLabel}
                      >
                        {sec.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {active && !isCollapsed && <div style={st.activeBar} />}
                </NavLink>
              );
            }

            const sectionActive = isChildActive(sec.children, location.pathname);
            const isOpen = expanded.has(sec.id);

            return (
              <div key={sec.id}>
                {!isCollapsed ? (
                  <motion.button
                    onClick={() => toggleSection(sec.id)}
                    style={{ ...st.sectionHeader, ...(sectionActive ? st.sectionHeaderActive : {}) }}
                    whileHover={{ backgroundColor: 'rgba(50,205,50,0.06)' }}
                    transition={{ duration: 0.15 }}
                  >
                    <span style={{ ...st.navIcon, ...(sectionActive ? st.navIconActive : {}), fontSize: 14 }}>{sec.icon}</span>
                    <span style={{ ...st.navLabel, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                      {sec.label}
                    </span>
                    <motion.span
                      animate={{ rotate: isOpen ? 90 : 0 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      style={{ fontSize: 10, opacity: 0.5, flexShrink: 0 }}
                    >
                      ▶
                    </motion.span>
                  </motion.button>
                ) : (
                  <div style={st.collapsedSectionDivider} title={sec.label}>
                    <span style={{ fontSize: 9, opacity: 0.35, color: '#32cd32' }}>{sec.icon}</span>
                  </div>
                )}

                {/* Expanded children (animated) */}
                <AnimatePresence initial={false}>
                  {!isCollapsed && isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      {sec.children.map((child, i) => {
                        const active = isActive(child.to);
                        return (
                          <motion.div
                            key={child.to}
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: i * 0.045, duration: 0.18, ease: EASE }}
                          >
                            <NavLink
                              to={child.to}
                              onClick={closeMobile}
                              style={{
                                ...st.navItem,
                                justifyContent: 'flex-start',
                                ...st.childItem,
                                ...(active ? st.navActive : {}),
                              }}
                            >
                              <span style={{ ...st.navIcon, ...(active ? st.navIconActive : {}), fontSize: 13 }}>{child.icon}</span>
                              <span style={{ ...st.navLabel, fontSize: 12 }}>{child.label}</span>
                              {active && <div style={st.activeBar} />}
                            </NavLink>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Collapsed children: icons only */}
                {isCollapsed && sec.children.map(child => {
                  const active = isActive(child.to);
                  return (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      onClick={closeMobile}
                      title={`${sec.label} · ${child.label}`}
                      style={{ ...st.navItem, justifyContent: 'center', ...(active ? st.navActive : {}) }}
                    >
                      <span style={{ ...st.navIcon, ...(active ? st.navIconActive : {}), fontSize: 13 }}>{child.icon}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Theme toggle */}
        <div style={{ padding: '4px 10px' }}>
          <motion.button
            onClick={toggleTheme}
            style={{ ...st.themeBtn, justifyContent: isCollapsed ? 'center' : undefined, padding: isCollapsed ? '9px 0' : undefined }}
            whileHover={{ borderColor: 'rgba(50,205,50,0.45)', backgroundColor: 'rgba(50,205,50,0.07)' }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.15 }}
            title={isCollapsed ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : ''}
          >
            <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto', transition: { delay: 0.06, duration: 0.16 } }}
                  exit={{ opacity: 0, width: 0, transition: { duration: 0.1 } }}
                  style={{ ...st.themeLabel, overflow: 'hidden', whiteSpace: 'nowrap' }}
                >
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* User + logout */}
        {user && (
          <div style={{ ...st.userWrap, justifyContent: isCollapsed ? 'center' : 'space-between' }}>
            <div style={st.userInfo}>
              <div style={st.userAvatar}>{user.username?.[0]?.toUpperCase()}</div>
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: 0.06, duration: 0.16 } }}
                    exit={{ opacity: 0, x: -8, transition: { duration: 0.1 } }}
                    style={st.userName}
                  >
                    {user.username}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1, transition: { delay: 0.1, duration: 0.16 } }}
                  exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.1 } }}
                  whileHover={{ color: '#ff4d4d', scale: 1.15 }}
                  whileTap={{ scale: 0.88 }}
                  onClick={handleLogout}
                  style={st.logoutBtn}
                  title="Sign out"
                >
                  ⏻
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Footer */}
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.1, duration: 0.2 } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              style={st.sidebarFooter}
            >
              <div style={st.footerTag}>TECHNICAL-FIRST</div>
              <div style={st.footerTag}>NO CONTRACT</div>
              <div style={st.footerTag}>RESULT DRIVEN</div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>
    </>
  );
}

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
  nav:       { display: 'flex', flexDirection: 'column', gap: 1, padding: '0 8px' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', borderRadius: 10,
    textDecoration: 'none', color: 'rgba(232,245,233,0.5)',
    fontSize: 13, fontWeight: 500, transition: 'background 0.18s, color 0.18s, border-color 0.18s',
    position: 'relative', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  childItem: {
    paddingLeft: 28,
    paddingTop: 8,
    paddingBottom: 8,
  },
  navActive:     { background: 'rgba(50,205,50,0.1)', color: '#e8f5e9', border: '1px solid rgba(50,205,50,0.2)' },
  navIcon:       { fontSize: 16, width: 20, textAlign: 'center', opacity: 0.6, flexShrink: 0 },
  navIconActive: { opacity: 1, color: '#32cd32' },
  navLabel:      { flex: 1 },
  activeBar: {
    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
    width: 3, height: '60%', background: '#32cd32', borderRadius: '2px 0 0 2px',
  },
  sectionHeader: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 12px', borderRadius: 10,
    background: 'none', border: 'none',
    color: 'rgba(232,245,233,0.4)', cursor: 'pointer',
    whiteSpace: 'nowrap', marginTop: 4,
  },
  sectionHeaderActive: { color: 'rgba(232,245,233,0.75)' },
  collapsedSectionDivider: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '6px 0', margin: '2px 0',
    borderTop: '1px solid rgba(50,205,50,0.1)',
  },
  themeBtn: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '9px 12px', borderRadius: 10,
    background: 'none', border: '1px solid rgba(50,205,50,0.15)',
    color: 'rgba(232,245,233,0.6)', fontSize: 13, cursor: 'pointer',
    whiteSpace: 'nowrap',
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
