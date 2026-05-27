import { Link } from 'react-router-dom';

const PLANS = [
  {
    name: 'Starter',
    price: '₹500',
    note: 'Free on signup',
    perMin: '₹6.00/min',
    desc: 'Perfect for small teams trying AI calling for the first time.',
    features: [
      '₹500 free credits',
      '₹6.00/min calling rate',
      '1 AI agent',
      'Up to 2 campaigns',
      'CSV lead upload',
      'Call recordings + transcripts',
      'Email support',
    ],
    cta: 'Start for free',
    ctaTo: '/register',
    featured: false,
  },
  {
    name: 'Growth',
    price: '₹3,000',
    note: '/month + usage',
    perMin: '₹5.00/min',
    desc: 'For growing teams that need more agents, lower rates, and analytics.',
    features: [
      '₹3,000 platform fee',
      '₹5.00/min calling rate (17% off)',
      'Up to 5 AI agents',
      'Unlimited campaigns',
      'Advanced analytics & export',
      'WhatsApp + Telegram hot lead alerts',
      'Priority support',
      'Custom agent prompts',
    ],
    cta: 'Get started',
    ctaTo: '/register',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    note: 'volume pricing',
    perMin: '₹4.00/min+',
    desc: 'For large developers and broker networks with high call volumes.',
    features: [
      'Volume discounts from ₹4/min',
      'Unlimited AI agents',
      'Dedicated account manager',
      'Custom integrations (CRM, ATS)',
      'On-premise option available',
      'SLA-backed uptime guarantee',
      'TRAI audit support',
      'White-labelling available',
    ],
    cta: 'Contact sales',
    ctaTo: '/contact',
    featured: false,
  },
];

const FAQ = [
  { q: 'What does ₹6/min cover?', a: 'Everything — SIP telephony (Plivo), speech-to-text (Sarvam AI), text-to-speech, LLM inference, storage for recordings and transcripts, and our platform. No hidden add-ons.' },
  { q: 'How do credits work?', a: 'You top up credits into your wallet (minimum ₹1,000). Every call deducts credits at your plan\'s per-minute rate. Credits never expire.' },
  { q: 'Can I try before I pay?', a: "Yes — every new account gets ₹500 free credits. That's roughly 83 minutes of AI calling with no card required." },
  { q: 'What is the minimum top-up?', a: 'The minimum recharge is ₹1,000. You can top up any amount above that in ₹500 increments.' },
  { q: 'Is TRAI DNC compliance included?', a: 'Yes. The DNC list is checked on every call before dialling. You can also upload your own custom DNC list.' },
  { q: 'Can the AI speak Hindi and regional languages?', a: 'Yes. We support Hindi, English, Tamil, Telugu, Kannada, Marathi, Bengali, Gujarati, and more — with regional accent voices.' },
];

function LPNav() {
  return (
    <nav className="lp-nav">
      <Link to="/" className="lp-nav-logo">
        <div className="lp-nav-logo-icon">C</div>
        Callora
      </Link>
      <div className="lp-nav-links">
        <Link to="/">Home</Link>
        <Link to="/pricing">Pricing</Link>
        <Link to="/about">About</Link>
      </div>
      <div className="lp-nav-cta">
        <Link to="/login" className="btn btn-ghost btn-sm" style={{ color: '#374151' }}>Sign in</Link>
        <Link to="/register" className="lp-btn-primary" style={{ padding: '8px 18px', fontSize: 14 }}>Start free →</Link>
      </div>
    </nav>
  );
}

export default function Pricing() {
  return (
    <div className="lp">
      <LPNav />

      {/* HERO */}
      <section style={{ background: '#1e1b4b', padding: '64px 5% 56px', textAlign: 'center' }}>
        <div className="lp-hero-badge">Pricing</div>
        <h1 style={{ fontSize: 'clamp(28px,4vw,48px)', fontWeight: 800, color: 'white', letterSpacing: '-0.03em', margin: '16px auto', maxWidth: 600 }}>
          Simple pricing.<br /><span style={{ color: '#a5b4fc' }}>No surprises.</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, maxWidth: 480, margin: '0 auto' }}>
          Pay only for what you use. Start free with ₹500 credits, top up anytime.
        </p>
      </section>

      {/* PLANS */}
      <section className="lp-section" style={{ background: '#f8f9fc' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div className="lp-pricing-grid">
            {PLANS.map(p => (
              <div key={p.name} className={`lp-pricing-card${p.featured ? ' featured' : ''}`}>
                {p.featured && (
                  <div style={{ display: 'inline-block', background: '#5b5bd6', color: 'white', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, marginBottom: 14, letterSpacing: '0.06em' }}>
                    MOST POPULAR
                  </div>
                )}
                <div className="lp-plan-name" style={{ color: p.featured ? 'rgba(255,255,255,0.5)' : undefined }}>{p.name}</div>
                <div className="lp-price">{p.price} <span>{p.note}</span></div>
                <div className="lp-price-note" style={{ color: p.featured ? 'rgba(255,255,255,0.5)' : undefined }}>{p.perMin} all-in</div>
                <p style={{ fontSize: 13.5, color: p.featured ? 'rgba(255,255,255,0.6)' : '#6b7280', lineHeight: 1.5, marginBottom: 20 }}>{p.desc}</p>
                <ul className="lp-features-list">
                  {p.features.map(f => <li key={f}>{f}</li>)}
                </ul>
                <Link
                  to={p.ctaTo}
                  className="lp-pricing-btn"
                  style={p.featured
                    ? { background: '#5b5bd6', color: 'white' }
                    : { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }
                  }
                >
                  {p.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USAGE ESTIMATE */}
      <section className="lp-section">
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div className="lp-section-label">Usage calculator</div>
          <h2 style={{ margin: '0 auto 14px' }}>Estimate your monthly cost</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 36, marginBottom: 32 }}>
            {[
              { scenario: 'Small team', leads: '500 leads/mo', calls: '~750 min', cost: '~₹4,500/mo' },
              { scenario: 'Growing agency', leads: '3,000 leads/mo', calls: '~5,000 min', cost: '~₹25,000/mo' },
              { scenario: 'Large developer', leads: '15,000 leads/mo', calls: '~25,000 min', cost: 'Enterprise pricing' },
            ].map(s => (
              <div key={s.scenario} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 16px', textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#5b5bd6', marginBottom: 10 }}>{s.scenario}</div>
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{s.leads}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>{s.calls}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{s.cost}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13.5, color: '#6b7280' }}>Based on avg 1.5 min/call. Assumes 1 attempt per lead. Actual usage varies.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-section lp-section-alt">
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div className="lp-section-label">FAQ</div>
            <h2 style={{ margin: '10px auto 0' }}>Common questions</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {FAQ.map(f => (
              <div key={f.q} style={{ padding: '22px 0', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{f.q}</div>
                <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.7 }}>{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-cta-section">
        <h2>Start with ₹500 free</h2>
        <p>No credit card needed. Cancel anytime.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link to="/register" className="lp-btn-primary">Create free account →</Link>
          <Link to="/login" className="lp-btn-secondary">Sign in</Link>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-bottom" style={{ borderTop: 'none', paddingTop: 0 }}>
          <span>© 2025 Callora AI. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link to="/" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'none', fontSize: 13 }}>Home</Link>
            <Link to="/about" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'none', fontSize: 13 }}>About</Link>
            <Link to="/login" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'none', fontSize: 13 }}>Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
