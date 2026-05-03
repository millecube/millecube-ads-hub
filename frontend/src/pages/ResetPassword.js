import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { authAPI } from '../utils/api';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token    = params.get('token');
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    if (!token) return setError('Invalid reset link. Please request a new one.');
    setLoading(true);
    try {
      await authAPI.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <button onClick={toggle} style={s.themeBtn} title="Toggle theme">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      <div style={s.card} className="glass">
        <div style={s.logoWrap}>
          <img src="/logo.png" alt="Millecube" style={s.logo} />
        </div>
        <h1 style={s.title}>Reset Password</h1>
        <p style={s.sub}>by Millecube Digital</p>

        {!token ? (
          <div style={{ marginTop: 28 }}>
            <div style={s.errorBox}>Invalid or missing reset link. Please request a new one from the login page.</div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 16, padding: '12px 0' }} onClick={() => navigate('/login')}>
              Back to Login
            </button>
          </div>
        ) : done ? (
          <div style={{ marginTop: 28 }}>
            <div style={s.successBox}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
              <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>Password Updated</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Your password has been reset successfully.</div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 16, padding: '12px 0' }} onClick={() => navigate('/login')}>
              Go to Login
            </button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 28 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Enter a new password for your account.
            </p>
            <div style={s.field}>
              <label style={s.label}>New Password</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                autoFocus
                required
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Confirm Password</label>
              <input
                className="form-input"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                required
              />
            </div>

            {error && <div style={s.error}>{error}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8, padding: '12px 0', fontSize: 15 }}
              disabled={loading}
            >
              {loading ? 'Saving…' : 'Set New Password'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" onClick={() => navigate('/login')} style={s.linkBtn}>
                ← Back to login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    position: 'relative',
  },
  themeBtn: {
    position: 'absolute',
    top: 20, right: 20,
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 18,
    cursor: 'pointer',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    padding: '40px 36px',
    textAlign: 'center',
  },
  logoWrap: { marginBottom: 16 },
  logo: { width: 160, height: 'auto' },
  title: { fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '8px 0 4px', fontFamily: 'Montserrat, sans-serif' },
  sub:   { fontSize: 13, color: 'var(--text-muted)', margin: 0 },
  field: { marginBottom: 16, textAlign: 'left' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  error:      { background: 'rgba(255,77,77,0.12)', border: '1px solid rgba(255,77,77,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ff6b6b', marginBottom: 12 },
  errorBox:   { background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.2)', borderRadius: 10, padding: '16px', fontSize: 13, color: '#ff6b6b' },
  successBox: { background: 'rgba(50,205,50,0.08)', border: '1px solid rgba(50,205,50,0.25)', borderRadius: 10, padding: '24px 20px', marginBottom: 8 },
  linkBtn: { background: 'none', border: 'none', color: '#32cd32', fontSize: 13, cursor: 'pointer', padding: 0, textDecoration: 'underline' },
};
