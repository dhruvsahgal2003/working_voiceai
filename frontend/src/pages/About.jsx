import { Link } from 'react-router-dom';

const TEAM = [
  { name: 'Arjun Kapoor', role: 'CEO & Co-founder', bg: '#5b5bd6', initials: 'AK', bio: 'Ex-Amazon. 10 years in proptech. Built and sold two B2B SaaS companies.' },
  { name: 'Sneha Reddy', role: 'CTO & Co-founder', bg: '#0891b2', initials: 'SR', bio: 'ML engineer from IIT-Bombay. Previously led voice AI at Sarvam AI.' },
  { name: 'Rahul Verma', role: 'Head of Product', bg: '#16a34a', initials: 'RV', bio: 'Product lead at MagicBricks for 6 years. Obsessed with conversion funnels.' },
  { name: 'Divya Menon', role: 'Head of Sales', bg: '#d97706', initials: 'DM', bio: "Grew NoBroker's enterprise segment from 0 to ₹50Cr ARR." },
];

const VALUES = [
  { icon: '⚡', title: 'Speed over perfection', desc: 'We ship fast and iterate. A working product today beats a perfect one next quarter.' },
  { icon: '🤝', title: 'Customer obsession', desc: 'Every feature we build exists because a customer asked for it. We answer support tickets ourselves.' },
  { icon: '🔒', title: 'Trust and compliance', desc: 'TRAI DNC compliance is non-negotiable. We handle sensitive calling data with zero compromise.' },
  { icon: '🌏', title: 'Built for India', desc: 'Hindi, Tamil, Telugu, Kannada — we support Indian languages first, not as an afterthought.' },
];

function LPNav() {
  return (
    <nav className="lp-nav">
      <Link to="/" className="lp-nav-logo">
        <div className="lp-nav-logo-icon">C</div>
        Velryx
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

export default function About() {
  return (
    <div className="lp">
      <LPNav />

      {/* HERO */}
      <section className="lp-hero" style={{ padding: '72px 5% 64px' }}>
        <div className="lp-hero-badge">Our story</div>
        <h1>We're making <span>every sales call</span><br />count more</h1>
        <p>Velryx was built by a team that spent years watching real estate salespeople burn out on manual dialing. There had to be a better way.</p>
      </section>

      {/* STORY */}
      <section className="lp-section" style={{ maxWidth: 800, margin: '0 auto' }}>
        <div className="lp-section-label">Our story</div>
        <h2>Why we built Velryx</h2>
        <p style={{ fontSize: 16, color: '#374151', lineHeight: 1.8, marginBottom: 20 }}>
          In 2023, our co-founder Arjun was consulting for a top-5 Mumbai developer. Their 40-person sales team was making 200 manual calls per day — and only reaching 30% of their list. The rest: voicemails, no answers, wrong numbers. ₹8 lakhs/month in salaries for a team mostly dialing into the void.
        </p>
        <p style={{ fontSize: 16, color: '#374151', lineHeight: 1.8, marginBottom: 20 }}>
          He partnered with Sneha, who had spent years building conversational AI systems. Together they built the first version of Velryx in 6 weeks. The developer ran it on a 5,000-lead campaign. The AI handled the first touch for all 5,000 — qualified 380 hot leads, scheduled 94 site visits. In 4 days.
        </p>
        <p style={{ fontSize: 16, color: '#374151', lineHeight: 1.8 }}>
          We've been building in the open ever since. Today Velryx processes millions of calls a month for real estate teams across India.
        </p>
      </section>

      {/* VALUES */}
      <section className="lp-section lp-section-alt">
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="lp-section-label">Values</div>
          <h2>What we believe in</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20, marginTop: 40 }}>
            {VALUES.map(v => (
              <div key={v.title} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24 }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{v.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{v.title}</h3>
                <p style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.6 }}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section className="lp-section">
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="lp-section-label">Team</div>
          <h2>Meet the founders</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginTop: 40 }}>
            {TEAM.map(m => (
              <div key={m.name} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: m.bg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, margin: '0 auto 14px' }}>{m.initials}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 3 }}>{m.name}</div>
                <div style={{ fontSize: 12.5, color: '#5b5bd6', fontWeight: 600, marginBottom: 10 }}>{m.role}</div>
                <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>{m.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-cta-section">
        <h2>Want to join us?</h2>
        <p>We're hiring across engineering, product, and sales. We're remote-first and pay well.</p>
        <Link to="/register" className="lp-btn-primary">View open roles →</Link>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-bottom" style={{ borderTop: 'none', paddingTop: 0 }}>
          <span>© 2025 Velryx AI. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link to="/" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'none', fontSize: 13 }}>Home</Link>
            <Link to="/pricing" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'none', fontSize: 13 }}>Pricing</Link>
            <Link to="/login" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'none', fontSize: 13 }}>Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
