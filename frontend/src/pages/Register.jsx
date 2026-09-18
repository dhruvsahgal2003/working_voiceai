import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ArrowRight } from 'lucide-react';

export default function Register() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { token, user } = await api.auth.register(form);
      login(token, user);
      nav('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div className="vx-orbs" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--cream-100)' }}>
      <span className="vx-orb" />

      <div className="glass-strong" style={{ borderRadius: 24, padding: 40, width: '100%', maxWidth: 460, boxShadow: 'var(--shadow-xl), var(--shadow-inner)' }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, color: '#fff', boxShadow: '0 8px 24px rgba(230,57,70,0.30)' }}>V</div>
          <div style={{ font: "700 20px/1 'Inter Tight'", letterSpacing: '-0.025em', color: '#0B0B14', marginTop: 8 }}>Create an account</div>
          <div style={{ font: "500 13px/1 'Inter'", color: '#52525F' }}>Get started with ₹120 free credits</div>
        </div>

        {error && <div className="callout callout-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="field">
              <label className="label">Full name</label>
              <input className="input" placeholder="Priya Sharma" value={form.name} onChange={set('name')} required />
            </div>
            <div className="field">
              <label className="label">Company</label>
              <input className="input" placeholder="PropTech Pvt Ltd" value={form.company} onChange={set('company')} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="priya@company.com" value={form.email} onChange={set('email')} required />
          </div>
          <div className="field" style={{ marginBottom: 20 }}>
            <label className="label">Password</label>
            <input className="input" type="password" placeholder="Min 8 characters" value={form.password} onChange={set('password')} required minLength={8} />
          </div>
          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? <span className="spinner spinner-sm" /> : <><span>Create account</span> <ArrowRight size={14} /></>}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 18, font: "500 13px/1 'Inter'", color: '#52525F' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--red-600)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
