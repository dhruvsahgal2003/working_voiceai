import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ArrowRight } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Handle Google OAuth callback
  useEffect(() => {
    const token = params.get('token');
    const oauthError = params.get('error');
    if (oauthError) {
      setError(oauthError === 'google_cancelled' ? 'Google sign-in was cancelled.' : 'Google sign-in failed. Please try again.');
      return;
    }
    if (token) {
      localStorage.setItem('pc_token', token);
      api.auth.me().then(({ user }) => {
        login(token, user);
        nav('/dashboard');
      }).catch(() => setError('Failed to load user after Google sign-in'));
    }
  }, [params]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { token, user } = await api.auth.login(form);
      login(token, user);
      nav('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vx-orbs" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--cream-100)' }}>
      <span className="vx-orb" />

      <div className="glass-strong" style={{ borderRadius: 24, padding: 40, width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-xl), var(--shadow-inner)' }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, color: '#fff', boxShadow: '0 8px 24px rgba(230,57,70,0.30)' }}>V</div>
          <div style={{ font: "700 20px/1 'Inter Tight'", letterSpacing: '-0.025em', color: '#0B0B14', marginTop: 8 }}>Welcome back</div>
          <div style={{ font: "500 13px/1 'Inter'", color: '#52525F' }}>Sign in to your Velryx workspace</div>
        </div>

        {error && <div className="callout callout-error" style={{ marginBottom: 16 }}>{error}</div>}

        {/* Google OAuth */}
        <a href="/api/auth/google" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: 16, gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(20,20,40,0.08)' }} />
          <span style={{ font: "500 12px/1 'Inter'", color: '#8B8B98' }}>or with email</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(20,20,40,0.08)' }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="you@company.in" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="field" style={{ marginBottom: 6 }}>
            <label className="label">Password</label>
            <input className="input" type="password" placeholder="••••••••" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          <a style={{ font: "600 12.5px/1 'Inter'", color: 'var(--red-600)', display: 'block', textAlign: 'right', marginBottom: 18, cursor: 'pointer', textDecoration: 'none' }}>Forgot password?</a>
          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? <span className="spinner spinner-sm" /> : <><span>Sign in</span> <ArrowRight size={14} /></>}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 18, font: "500 13px/1 'Inter'", color: '#52525F' }}>
          New to Velryx?{' '}
          <Link to="/register" style={{ color: 'var(--red-600)', fontWeight: 600, textDecoration: 'none' }}>Create an account</Link>
        </div>
      </div>
    </div>
  );
}
