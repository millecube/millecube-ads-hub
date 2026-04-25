import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authAPI } from '../utils/api';
import { useToast } from '../hooks/useToast';

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const { theme, toggle } = useTheme();
  const toast = useToast();

  const [profile, setProfile] = useState({ username: user?.username || '', email: user?.email || '' });
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd,     setSavingPwd]     = useState(false);

  // Team management (admin only)
  const [teamUsers, setTeamUsers]   = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'member' });
  const [addingUser, setAddingUser] = useState(false);

  const isAdmin = user?.role === 'admin';

  const loadTeam = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingTeam(true);
    try { setTeamUsers(await authAPI.listUsers()); }
    catch { toast('Failed to load team users.', 'error'); }
    finally { setLoadingTeam(false); }
  }, [isAdmin]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await authAPI.updateProfile(profile);
      updateUser(res.user, res.token);
      toast('Profile updated.', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Update failed.', 'error');
    } finally { setSavingProfile(false); }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (pwd.newPassword !== pwd.confirmPassword) return toast('New passwords do not match.', 'error');
    if (pwd.newPassword.length < 6) return toast('Password must be at least 6 characters.', 'error');
    setSavingPwd(true);
    try {
      await authAPI.changePassword({ currentPassword: pwd.currentPassword, newPassword: pwd.newPassword });
      setPwd({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast('Password changed successfully.', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Password change failed.', 'error');
    } finally { setSavingPwd(false); }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddingUser(true);
    try {
      await authAPI.createUser(newUser);
      setNewUser({ username: '', email: '', password: '', role: 'member' });
      setShowAddUser(false);
      toast(`User "${newUser.username}" created.`, 'success');
      loadTeam();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create user.', 'error');
    } finally { setAddingUser(false); }
  };

  const handleDeleteUser = async (id, username) => {
    if (!window.confirm(`Remove user "${username}"? This cannot be undone.`)) return;
    try {
      await authAPI.deleteUser(id);
      toast(`User "${username}" removed.`, 'success');
      loadTeam();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to remove user.', 'error');
    }
  };

  return (
    <div style={s.page} className="fade-up">
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Settings</h1>
          <p style={s.sub}>Manage your account and preferences</p>
        </div>
      </div>

      <div style={s.grid}>
        {/* Appearance */}
        <div className="glass" style={s.card}>
          <div style={s.cardTitle}>Appearance</div>
          <div style={s.row}>
            <div>
              <div style={s.settingLabel}>Theme</div>
              <div style={s.settingDesc}>Switch between dark and light mode</div>
            </div>
            <button onClick={toggle} style={{ ...s.toggleBtn, background: theme === 'dark' ? 'rgba(50,205,50,0.15)' : 'rgba(7,80,60,0.12)' }}>
              <span style={s.toggleIcon}>{theme === 'dark' ? '🌙' : '☀️'}</span>
              <span style={s.toggleLabel}>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
            </button>
          </div>
        </div>

        {/* Profile */}
        <div className="glass" style={s.card}>
          <div style={s.cardTitle}>Profile</div>
          <form onSubmit={saveProfile}>
            <div style={s.field}>
              <label style={s.label}>Username</label>
              <input className="form-input" value={profile.username} onChange={e => setProfile(p => ({ ...p, username: e.target.value }))} required />
            </div>
            <div style={s.field}>
              <label style={s.label}>Email</label>
              <input className="form-input" type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* Password */}
        <div className="glass" style={s.card}>
          <div style={s.cardTitle}>Change Password</div>
          <form onSubmit={savePassword}>
            <div style={s.field}>
              <label style={s.label}>Current Password</label>
              <input className="form-input" type="password" value={pwd.currentPassword} onChange={e => setPwd(p => ({ ...p, currentPassword: e.target.value }))} required />
            </div>
            <div style={s.field}>
              <label style={s.label}>New Password</label>
              <input className="form-input" type="password" value={pwd.newPassword} onChange={e => setPwd(p => ({ ...p, newPassword: e.target.value }))} required />
            </div>
            <div style={s.field}>
              <label style={s.label}>Confirm New Password</label>
              <input className="form-input" type="password" value={pwd.confirmPassword} onChange={e => setPwd(p => ({ ...p, confirmPassword: e.target.value }))} required />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={savingPwd}>
              {savingPwd ? 'Changing…' : 'Change Password'}
            </button>
          </form>
        </div>

        {/* Team Management — admin only */}
        {isAdmin && (
          <div className="glass" style={s.card}>
            <div style={{ ...s.row, marginBottom: 20 }}>
              <div style={s.cardTitle}>Team Members</div>
              <button onClick={() => setShowAddUser(v => !v)} className="btn btn-primary btn-sm">
                {showAddUser ? 'Cancel' : '+ Add User'}
              </button>
            </div>

            {/* Add user form */}
            {showAddUser && (
              <form onSubmit={handleAddUser} style={s.addForm}>
                <div style={s.addGrid}>
                  <div style={s.field}>
                    <label style={s.label}>Username *</label>
                    <input className="form-input" value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} required />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Email</label>
                    <input className="form-input" type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Password *</label>
                    <input className="form-input" type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} required minLength={6} />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Role</label>
                    <select className="form-input" value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={addingUser}>
                  {addingUser ? 'Creating…' : 'Create User'}
                </button>
              </form>
            )}

            {/* User list */}
            {loadingTeam ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}><div className="spinner" /></div>
            ) : (
              <div style={s.userList}>
                {teamUsers.map(u => (
                  <div key={u.id} style={s.userRow}>
                    <div style={s.userAvatar}>{u.username[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.userName}>{u.username}</div>
                      <div style={s.userMeta}>{u.email || '—'} · <span style={{ color: u.role === 'admin' ? 'var(--accent)' : 'var(--text-muted)' }}>{u.role}</span></div>
                    </div>
                    {u.username !== user?.username && (
                      <button onClick={() => handleDeleteUser(u.id, u.username)} style={s.deleteBtn} title="Remove user">✕</button>
                    )}
                    {u.username === user?.username && (
                      <span style={s.youBadge}>You</span>
                    )}
                  </div>
                ))}
                {teamUsers.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No team users found.</div>}
              </div>
            )}
          </div>
        )}

        {/* Session */}
        <div className="glass" style={s.card}>
          <div style={s.cardTitle}>Session</div>
          <div style={s.row}>
            <div>
              <div style={s.settingLabel}>Signed in as <strong style={{ color: 'var(--accent)' }}>{user?.username}</strong></div>
              <div style={s.settingDesc}>Your session is valid for 7 days</div>
            </div>
            <button onClick={logout} className="btn btn-danger btn-sm">Sign Out</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page:        { padding: '32px 36px', maxWidth: 900 },
  header:      { marginBottom: 28 },
  title:       { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 },
  sub:         { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  grid:        { display: 'flex', flexDirection: 'column', gap: 20 },
  card:        { padding: '24px 28px' },
  cardTitle:   { fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 20 },
  field:       { marginBottom: 16 },
  label:       { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  row:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  settingLabel:{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 },
  settingDesc: { fontSize: 12, color: 'var(--text-muted)' },
  toggleBtn:   { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', transition: 'all 0.2s' },
  toggleIcon:  { fontSize: 18 },
  toggleLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  addForm:     { background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 20 },
  addGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' },
  userList:    { display: 'flex', flexDirection: 'column', gap: 8 },
  userRow:     { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(50,205,50,0.03)' },
  userAvatar:  { width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 },
  userName:    { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' },
  userMeta:    { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  deleteBtn:   { background: 'none', border: '1px solid rgba(220,50,50,0.3)', color: '#e55', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 },
  youBadge:    { fontSize: 10, fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 6, padding: '2px 6px', flexShrink: 0 },
};
