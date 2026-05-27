import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export default function AuthCallback() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const token = params.get('token');
    const error = params.get('error');
    if (error || !token) { nav('/login?error=' + (error || 'unknown')); return; }
    localStorage.setItem('pc_token', token);
    api.auth.me().then(({ user }) => {
      login(token, user);
      nav('/dashboard');
    }).catch(() => nav('/login?error=token_invalid'));
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Signing you in...</p>
    </div>
  );
}
