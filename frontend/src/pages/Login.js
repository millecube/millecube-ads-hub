import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authAPI } from '../utils/api';

export default function Login() {
  const { login }  = useAuth();
  const { theme, toggle } = useTheme();
  const navigate   = useNavigate();

  const [mode, setMode] = useState('login'); // 'login' | 'forgot'
  const [form, setForm]   = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [fpEmail, setFpEmail]   = useState('');
  const [fpSent, setFpSent]     = useState(false);
  const [fpError, setFpError]   = useState('');
  const [fpLoading, setFpLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authAPI.login(form);
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setFpError('');
    setFpLoading(true);
    try {
      await authAPI.forgotPassword(fpEmail);
      setFpSent(true);
    } catch (err) {
      setFpError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setFpLoading(false);
    }
  };

  const backToLogin = () => {
    setMode('login');
    setFpSent(false);
    setFpEmail('');
    setFpError('');
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
        <h1 style={s.title}>Ads Hub</h1>
        <p style={s.sub}>by Millecube Digital</p>

        {mode === 'login' ? (
          <form onSubmit={submit} style={{ marginTop: 28 }}>
            <div style={s.field}>
              <label style={s.label}>Username</label>
              <input
                className="form-input"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="admin"
                autoFocus
                required
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Password</label>
              <input
                className="form-input"
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
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
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" onClick={() => setMode('forgot')} style={s.linkBtn}>
                Forgot password?
              </button>
            </div>
          </form>
        ) : (
          <div style={{ marginTop: 28 }}>
            {fpSent ? (
              <div style={s.successBox}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>✉️</div>
                <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>Check your email</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  If an account with that email exists, a password reset link has been sent. The link expires in 1 hour.
                </div>
              </div>
            ) : (
              <form onSubmit={submitForgot}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
                  Enter the email address linked to your account and we'll send you a reset link.
                </p>
                <div style={s.field}>
                  <label style={s.label}>Email Address</label>
                  <input
                    className="form-input"
                    type="email"
                    value={fpEmail}
                    onChange={e => setFpEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                    required
                  />
                </div>

                {fpError && <div style={s.error}>{fpError}</div>}

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: 8, padding: '12px 0', fontSize: 15 }}
                  disabled={fpLoading}
                >
                  {fpLoading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            )}

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" onClick={backToLogin} style={s.linkBtn}>
                ← Back to login
              </button>
            </div>
          </div>
        )}

        <p style={s.hint}>Secure access · Millecube Digital</p>
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
  error: { background: 'rgba(255,77,77,0.12)', border: '1px solid rgba(255,77,77,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ff6b6b', marginBottom: 12 },
  successBox: { background: 'rgba(50,205,50,0.08)', border: '1px solid rgba(50,205,50,0.25)', borderRadius: 10, padding: '24px 20px', marginBottom: 8 },
  linkBtn: { background: 'none', border: 'none', color: '#32cd32', fontSize: 13, cursor: 'pointer', padding: 0, textDecoration: 'underline' },
  hint:  { fontSize: 11, color: 'var(--text-muted)', marginTop: 24 },
};
