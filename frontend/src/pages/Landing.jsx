// Landing.jsx — Velryx marketing homepage
// Big black type · cream substrate · pastel section panels · warm glass cards
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Phone, BarChart2, Zap, Shield, Globe, Book, Check, ArrowRight, Play } from 'lucide-react';

/* ── Scroll progress bar ─────────────────────────────────────────────── */
function useScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = (document.documentElement.scrollHeight - window.innerHeight) || 1;
      setP(Math.max(0, Math.min(1, window.scrollY / max)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return p;
}

function ScrollProgressBar() {
  const p = useScrollProgress();
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 200, pointerEvents: 'none' }}>
      <div style={{ height: '100%', width: `${p * 100}%`, background: 'var(--red-500)', transition: 'width 100ms linear' }} />
    </div>
  );
}

/* ── Navbar ──────────────────────────────────────────────────────────── */
function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 50, padding: '14px 5%' }}>
      <div style={{
        maxWidth: 1180, margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', borderRadius: 9999,
        background: scrolled ? 'rgba(255,253,247,0.92)' : 'rgba(255,253,247,0.70)',
        border: '1px solid rgba(20,20,40,0.08)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        transition: 'background 0.2s',
        boxShadow: scrolled ? '0 4px 20px rgba(20,20,40,0.07)' : 'none',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: '#fff' }}>V</div>
          <span style={{ font: "700 16px/1 'Inter Tight'", letterSpacing: '-0.02em', color: '#0B0B14' }}>Velryx</span>
        </Link>
        <div className="vx-lp-navlinks" style={{ display: 'flex', gap: 4 }}>
          {['Product', 'Pricing', 'Industries', 'Docs'].map(l => (
            <a key={l} style={{ padding: '7px 14px', font: "500 13.5px/1 'Inter'", color: '#2B2B36', textDecoration: 'none', borderRadius: 8, cursor: 'pointer' }}>{l}</a>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link to="/login" className="vx-lp-signin" style={{ padding: '8px 16px', font: "500 13.5px/1 'Inter'", color: '#2B2B36', textDecoration: 'none' }}>Sign in</Link>
          <Link to="/register" style={{ padding: '10px 20px', font: "600 13.5px/1 'Inter'", color: '#fff', background: '#0B0B14', borderRadius: 9999, textDecoration: 'none' }}>
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section style={{ position: 'relative', padding: '60px 5% 80px', background: 'var(--cream-100)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 70% 40% at 25% 0%, rgba(230,57,70,0.05) 0%, transparent 60%), radial-gradient(ellipse 60% 35% at 85% 30%, rgba(244,178,51,0.07) 0%, transparent 60%)' }} />
      <div className="vx-lp-hero" style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 56, alignItems: 'center' }}>
        <div>
          <span className="vx-stamp-tilt" style={{ color: 'var(--red-700)', marginBottom: 28, display: 'inline-flex' }}>
            Built in India · TRAI compliant
          </span>
          <h1 style={{ font: "800 clamp(38px,5.5vw,68px)/1.02 'Inter Tight'", letterSpacing: '-0.035em', color: '#0B0B14', margin: '16px 0 22px', maxWidth: 680 }}>
            The voice agent platform for{' '}
            <span style={{ background: 'linear-gradient(180deg, transparent 60%, #F5DE7E 60%, #F5DE7E 96%, transparent 96%)', padding: '0 6px' }}>
              real estate
            </span>{' '}
            in India.
          </h1>
          <p style={{ font: "500 17px/1.6 'Inter'", color: '#2B2B36', maxWidth: 520, marginBottom: 36, letterSpacing: '-0.005em' }}>
            Velryx calls every new inquiry in under 60 seconds — qualifying intent, budget and timeline in Hindi, English, and 20+ Indian languages.
          </p>

          {/* Phone demo widget */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ font: "500 13px/1 'Inter'", color: '#52525F', marginBottom: 10 }}>Experience the agent →</div>
            <form className="vx-phone-input" onSubmit={e => e.preventDefault()}>
              <div className="vx-flag" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRight: '1px solid rgba(20,20,40,0.08)', font: "500 13px/1 'Inter'", color: 'var(--ink-700)' }}>
                <svg width="22" height="14" viewBox="0 0 22 14" style={{ borderRadius: 2 }}>
                  <rect width="22" height="4.67" y="0" fill="#FF9933" />
                  <rect width="22" height="4.67" y="4.67" fill="#fff" />
                  <rect width="22" height="4.67" y="9.34" fill="#138808" />
                  <circle cx="11" cy="7" r="1.4" fill="none" stroke="#000088" strokeWidth="0.4" />
                </svg>
                <span>+91</span>
              </div>
              <input type="tel" placeholder="Enter your number" />
              <button type="submit"><Phone size={13} /> Try Velryx</button>
            </form>
            <div className="marginalia" style={{ marginTop: 10, marginLeft: 16, fontSize: 13 }}>
              We call you back in under 60 seconds. No credit card.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 36, paddingTop: 24, borderTop: '1px solid rgba(20,20,40,0.10)' }}>
            {[['10K+', 'Concurrent calls', <Phone size={16} />], ['99.9%', 'Uptime', <Shield size={16} />], ['20+', 'Languages', <Globe size={16} />]].map(([v, l, icon]) => (
              <div key={l} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ color: 'var(--red-600)' }}>{icon}</div>
                <div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 32, lineHeight: 0.9, color: '#0B0B14' }}>{v}</div>
                  <div style={{ font: "italic 400 12px/1.2 'Instrument Serif',serif", color: '#52525F', marginTop: 4 }}>{l}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: glass mini-app card */}
        <div className="vx-lp-hero-visual" style={{ position: 'relative', height: 440 }}>
          <div className="card-glass-warm" style={{ position: 'absolute', right: 0, top: 0, width: 400, borderRadius: 22, overflow: 'hidden', transform: 'rotate(0.5deg)', boxShadow: 'var(--shadow-lg), var(--shadow-inner)' }}>
            <span className="vx-corner vx-corner-tl" style={{ color: 'rgba(230,57,70,0.5)' }} />
            <span className="vx-corner vx-corner-br" style={{ color: 'rgba(230,57,70,0.5)' }} />
            <div style={{ padding: '12px 16px', background: 'rgba(255,253,247,0.7)', borderBottom: '1px solid rgba(20,20,40,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--grad-brand)' }} />
                <span style={{ font: "700 12px/1 'Inter Tight'", letterSpacing: '-0.01em' }}>Live · Mumbai NRI Q4</span>
              </div>
              <span className="badge badge-live" style={{ fontSize: 10 }}>4 calls</span>
            </div>
            <div style={{ padding: 16 }}>
              {[
                { who: 'V', text: 'Namaste Sneha ji — 2BHK Bangalore ke baare mein baat karte hain?', right: false },
                { who: 'S', text: 'Haan bolo, kya offer hai?', right: true },
                { who: 'V', text: 'Marathahalli area mein ₹90L. Saturday 11am site visit book kar dun?', right: false },
                { who: 'S', text: 'Perfect, kar do.', right: true, hot: true },
              ].map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: b.right ? 'flex-end' : 'flex-start', gap: 8, marginBottom: 8 }}>
                  {!b.right && <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--red-500)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 10px/1 Inter', flexShrink: 0 }}>{b.who}</div>}
                  <div style={{ maxWidth: '78%', padding: '7px 11px', borderRadius: 10, background: b.right ? '#0B0B14' : 'rgba(255,255,255,0.88)', color: b.right ? '#fff' : '#0B0B14', border: b.right ? 'none' : '1px solid rgba(20,20,40,0.06)', font: '500 11.5px/1.45 Inter', position: 'relative' }}>
                    {b.text}
                    {b.hot && <span style={{ position: 'absolute', top: -8, right: -8, font: "700 9px/1 'JetBrains Mono'", letterSpacing: '0.12em', background: 'var(--red-500)', color: '#fff', padding: '3px 6px', borderRadius: 4 }}>HOT</span>}
                  </div>
                  {b.right && <div style={{ width: 24, height: 24, borderRadius: 6, background: '#F4B233', color: '#1F1606', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 10px/1 Inter', flexShrink: 0 }}>{b.who}</div>}
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(20,20,40,0.06)', background: 'rgba(245,222,126,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ font: "700 20px/1 'Inter Tight'", letterSpacing: '-0.02em' }}>+42 hot leads</div>
                <div style={{ font: '500 11px/1 Inter', color: '#52525F', marginTop: 3 }}>vs yesterday · ▲ 18%</div>
              </div>
              <span className="vx-stamp" style={{ color: '#9D1924', background: 'rgba(255,255,255,0.6)' }}>TODAY</span>
            </div>
          </div>

          {/* Floating chip */}
          <div style={{ position: 'absolute', left: -8, top: 40, width: 180, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(20,20,40,0.08)', boxShadow: '0 14px 32px rgba(20,20,40,0.10)', transform: 'rotate(-3deg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--red-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: 14 }}>🔥</span>
              </div>
              <div>
                <div style={{ font: '700 11px/1.1 Inter', color: '#0B0B14' }}>Hot · Rohan V.</div>
                <div style={{ font: '500 10px/1 Inter', color: '#52525F', marginTop: 3 }}>Gurgaon · ₹1.5Cr</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Trust bar ───────────────────────────────────────────────────────── */
function TrustBar() {
  return (
    <div style={{ borderTop: '1px solid rgba(20,20,40,0.06)', borderBottom: '1px solid rgba(20,20,40,0.06)', padding: '28px 5%', background: 'var(--cream-100)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', textAlign: 'center' }}>
        <div className="t-eyebrow" style={{ color: '#52525F', marginBottom: 16 }}>Trusted by India's fastest teams</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: '24px 48px' }}>
          {['DCB BANK', 'Flipkart', 'Groww', 'PharmEasy', 'PropTech', 'eKart', 'Growth School'].map(name => (
            <div key={name} style={{ font: "800 17px/1 'Inter Tight'", letterSpacing: '-0.04em', color: 'rgba(20,20,40,0.45)' }}>{name}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Use Cases ───────────────────────────────────────────────────────── */
const USE_CASES = [
  { panel: 'terracotta', title: 'Sales',          body: 'Convert leads with intelligent outreach and screen interest before your closers spend a minute.', stat: '500K+', statLabel: 'Calls completed' },
  { panel: 'marigold',   title: 'Collection',     body: 'Re-engage overdue accounts and screen payment capabilities. Automate follow-ups for better recovery.', stat: '12',    statLabel: 'Active campaigns' },
  { panel: 'sage',       title: 'Site Visit Booking', body: 'Real-estate-specific: confirm visits, send reminders, handle reschedules. Higher show-up rates.', stat: '380K+', statLabel: 'Visits booked' },
  { panel: 'mist',       title: 'Appointment Booking', body: 'Identify patient needs and screen preferences. Automate scheduling to increase conversions.', stat: '180K+', statLabel: 'Bookings processed' },
  { panel: 'clay',       title: 'Last Mile Delivery', body: 'Identify delivery windows and screen recipient availability. Automate coordination for success.', stat: '200K+', statLabel: 'Calls handled' },
  { panel: 'sand',       title: 'NRI & 24/7',     body: 'Handle calls across time zones in English, Hindi and regional languages. Never miss a NRI inquiry.', stat: '24/7',  statLabel: 'Availability' },
];

function UseCasesPanel() {
  return (
    <section style={{ padding: '120px 5%', background: 'var(--cream-100)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ font: "800 clamp(28px,4vw,52px)/1.05 'Inter Tight'", letterSpacing: '-0.03em', maxWidth: 820, margin: '0 auto 16px' }}>
            One platform for every voice agent you'll need.
          </h2>
          <p style={{ font: "500 17px/1.6 'Inter'", color: '#52525F', maxWidth: 600, margin: '0 auto' }}>
            From the first cold call to the final renewal — deploy production-grade voice agents for any function.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {USE_CASES.map((u, i) => (
            <div key={i} className={`panel-${u.panel} tx-waves`} style={{ borderRadius: 22, padding: 28, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 320, position: 'relative' }}>
              <span className="vx-corner vx-corner-tr" style={{ color: 'rgba(20,20,40,0.25)' }} />
              <div style={{ font: "700 22px/1.15 'Inter Tight'", letterSpacing: '-0.025em', color: '#0B0B14' }}>{u.title}</div>
              <div style={{ font: "500 14px/1.55 'Inter'", color: '#2B2B36', flex: 1 }}>{u.body}</div>
              <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,253,247,0.85)', border: '1px solid rgba(20,20,40,0.07)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ font: "800 20px/1 'Inter Tight'", letterSpacing: '-0.03em', color: '#0B0B14' }}>{u.stat}</div>
                  <div style={{ font: '500 11px/1 Inter', color: '#52525F', marginTop: 4 }}>{u.statLabel}</div>
                </div>
                <button style={{ font: '600 12px/1 Inter', color: '#fff', background: '#0B0B14', border: 0, borderRadius: 8, padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                  <Play size={9} /> Demo
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Stats panel ─────────────────────────────────────────────────────── */
function StatsPanel() {
  return (
    <section className="panel-sage tx-waves" style={{ padding: '120px 5%' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h2 style={{ font: "800 clamp(28px,4vw,52px)/1.05 'Inter Tight'", letterSpacing: '-0.03em' }}>
            Powering voice agents across India at scale.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
          {[
            { icon: <BarChart2 size={22} />, color: '#E63946', value: '1.2M+', body: 'Lead-qualification conversations handled.' },
            { icon: <Zap size={22} />, color: '#F4B233', value: '8×', body: 'More productive than traditional outbound call teams.' },
            { icon: <Phone size={22} />, color: '#1F8A5B', value: '83%', body: 'Of property-related queries resolved autonomously.' },
            { icon: <Shield size={22} />, color: '#9D1924', value: '99.9%', body: 'Uptime during peak Diwali and FY-end seasons.' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: 24, borderRadius: 18, background: 'rgba(255,253,247,0.75)', border: '1px solid rgba(20,20,40,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: s.color, color: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 12px ${s.color}40` }}>{s.icon}</div>
              <div>
                <div style={{ font: "800 28px/1 'Inter Tight'", letterSpacing: '-0.03em', color: '#0B0B14', marginBottom: 8 }}>{s.value}</div>
                <div style={{ font: "500 13px/1.55 'Inter'", color: '#2B2B36' }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Knowledge panel ─────────────────────────────────────────────────── */
function KnowledgePanel() {
  return (
    <section className="panel-mist tx-dots" style={{ padding: '120px 5%' }}>
      <div className="vx-lp-2col" style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
        <div style={{ padding: 32, background: 'rgba(255,253,247,0.85)', borderRadius: 22, border: '1px solid rgba(20,20,40,0.08)', boxShadow: '0 18px 40px rgba(20,20,40,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#0B0B14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Book size={18} color="#fff" /></div>
            <div>
              <div style={{ font: "700 13px/1 'Inter Tight'", letterSpacing: '-0.01em' }}>Sector 65 Project</div>
              <div style={{ font: '500 11px/1 Inter', color: '#52525F', marginTop: 3 }}>14 documents · indexed 2m ago</div>
            </div>
          </div>
          {[['Brochure_Sec65.pdf', '2.1 MB · 24 pages', true], ['Pricing_Q4.xlsx', '84 KB · 6 sheets', false], ['Floor_plans_2BHK.pdf', '1.4 MB · 8 plans', false], ['RERA_HRERA_2024.pdf', '440 KB · 12 pages', false]].map(([n, m, active], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: active ? 'rgba(230,57,70,0.06)' : 'rgba(20,20,40,0.03)', border: active ? '1px solid rgba(230,57,70,0.18)' : '1px solid transparent' }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: active ? 'var(--red-500)' : 'var(--cream-200)', color: active ? '#fff' : '#52525F', display: 'flex', alignItems: 'center', justifyContent: 'center', font: "700 8px/1 'JetBrains Mono'", letterSpacing: '0.04em' }}>{n.split('.').pop().toUpperCase().slice(0, 3)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 12px/1.1 Inter', color: '#0B0B14' }}>{n}</div>
                <div style={{ font: '500 10.5px/1 Inter', color: '#8B8B98', marginTop: 3 }}>{m}</div>
              </div>
              {active && <Check size={13} color="#1F8A5B" />}
            </div>
          ))}
        </div>
        <div>
          <span className="vx-stamp" style={{ color: '#475569', background: 'rgba(255,253,247,0.55)', marginBottom: 18, display: 'inline-flex' }}>Knowledge base</span>
          <h2 style={{ font: "700 clamp(24px,3vw,38px)/1.15 'Inter Tight'", letterSpacing: '-0.025em', marginBottom: 18, marginTop: 16, maxWidth: 480 }}>
            Train your voice agent with what it needs to sound smart.
          </h2>
          <p style={{ font: "500 16px/1.6 'Inter'", color: '#2B2B36', marginBottom: 28, maxWidth: 480 }}>
            Upload brochures, price lists, project PDFs. Velryx grounds every answer in your real data — no hallucination on RERA numbers, no made-up amenities.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['Brochure_Sec65.pdf', 'RERA_certs.zip', 'Pricing_Q4.xlsx', 'FAQs.md'].map(f => (
              <span key={f} style={{ padding: '7px 12px', borderRadius: 9999, background: 'rgba(255,253,247,0.85)', border: '1px solid rgba(20,20,40,0.10)', font: "500 12px/1 'Inter'", color: '#2B2B36' }}>{f}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Pricing ─────────────────────────────────────────────────────────── */
function PricingPanel() {
  return (
    <section className="panel-sand tx-cross" style={{ padding: '120px 5%' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
        <span className="vx-stamp-tilt right" style={{ color: 'var(--red-700)', marginBottom: 18, display: 'inline-flex' }}>Pricing</span>
        <h2 style={{ font: "800 clamp(28px,4vw,52px)/1.05 'Inter Tight'", letterSpacing: '-0.03em', marginTop: 18, marginBottom: 16 }}>
          Priced for <em style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', color: 'var(--red-600)' }}>Indian budgets.</em>
        </h2>
        <div className="marginalia" style={{ display: 'inline-block', marginBottom: 56 }}>Pay-as-you-go. No seat fees. No hidden setup costs.</div>

        {/* Single price card */}
        <div className="ticket" style={{ maxWidth: 440, margin: '0 auto', padding: '44px 48px', background: 'rgba(255,253,247,0.97)', borderRadius: 22, border: '2px solid #0B0B14', boxShadow: '0 24px 60px rgba(20,20,40,0.12)', position: 'relative' }}>
          <span className="vx-stamp-tilt" style={{ color: '#fff', background: 'var(--red-500)', border: '1.5px solid var(--red-500)', position: 'absolute', top: -16, right: 24 }}>Simple pricing</span>
          <div style={{ font: "italic 400 15px/1 'Instrument Serif',serif", color: '#52525F', marginBottom: 12 }}>Billed at</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 80, lineHeight: 1, color: '#0B0B14', letterSpacing: '-0.03em' }}>₹6</span>
            <span style={{ font: "600 22px/1 'Inter Tight'", color: '#52525F', letterSpacing: '-0.02em' }}>/&thinsp;minute</span>
          </div>
          <div className="vx-note" style={{ marginBottom: 32, fontSize: 13 }}>
            Per AI agent minute. Carrier charges (~₹2/min) billed separately.
          </div>
          <hr className="stitch-thick" style={{ margin: '0 0 24px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              'Pay-as-you-go · no commitment',
              'All 20+ Indian languages',
              'Knowledge-base RAG included',
              'Hot-lead WhatsApp alerts',
              'TRAI DND scrubbing',
              'IST calling-hours enforcement',
              'Recording &amp; transcript storage',
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderBottom: i < 6 ? '1.5px dashed rgba(20,20,40,0.10)' : 'none' }}>
                <Check size={13} color="var(--red-600)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ font: "500 13.5px/1.35 'Inter'", color: '#0B0B14' }} dangerouslySetInnerHTML={{ __html: f }} />
              </div>
            ))}
          </div>
          <Link to="/register" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#0B0B14', color: '#fff', borderRadius: 9999, padding: '14px 28px', font: "600 14px/1 'Inter'", cursor: 'pointer', textDecoration: 'none', marginTop: 28 }}>
            Get started <ArrowRight size={13} />
          </Link>
          <div style={{ font: "italic 400 12px/1 'Instrument Serif',serif", color: '#8B8B98', marginTop: 12 }}>₹120 free credits on signup · ₹10,000 one-time setup fee.</div>
        </div>
      </div>
    </section>
  );
}

/* ── FAQ ─────────────────────────────────────────────────────────────── */
const FAQS = [
  { q: 'How does Velryx handle Hindi-English code-switching mid-call?', a: "Velryx auto-detects the language a caller uses and switches in real time — even mid-sentence. We use Sarvam AI for speech and a fine-tuned LLM for response. NRI callers can start in English, drop into Hindi for negotiation, and the agent stays natural throughout." },
  { q: 'Is Velryx TRAI-DND compliant?', a: "Yes. Every uploaded CSV is scrubbed against the National Do Not Call registry before any campaign runs. We enforce IST calling hours (10am–7pm by default). Opt-outs are honored immediately and propagated across all your assistants." },
  { q: 'Can the AI book a site visit on its own?', a: "Yes. Connect your Google / Outlook calendar (or a Calendly link) and the agent will offer real time-slots, confirm with the lead, and drop a calendar invite. The booking shows up in your dashboard within seconds." },
  { q: 'What does it cost in real rupee terms?', a: "Pay-as-you-go: ₹6/min for the AI agent, plus Plivo's per-minute carrier rate (~₹2/min for Indian DIDs). A typical 3-minute qualification call lands around ₹24. Most teams break even after 1–2 closed deals." },
  { q: 'How long does setup take?', a: "Twenty to thirty minutes if you have a Plivo account already. We give you three starter assistants and one starter campaign template. Upload a CSV and you're live." },
];

function FAQPanel() {
  const [open, setOpen] = useState(0);
  return (
    <section style={{ padding: '120px 5%', background: 'var(--cream-100)' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div className="vx-lp-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 56, alignItems: 'flex-start', marginBottom: 32 }}>
          <div>
            <span className="vx-stamp-tilt" style={{ color: 'var(--red-700)', marginBottom: 14, display: 'inline-flex' }}>Questions</span>
            <h2 style={{ font: "800 clamp(28px,4vw,44px)/1.0 'Inter Tight'", letterSpacing: '-0.03em', marginTop: 18 }}>
              Real <em style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', color: 'var(--red-600)' }}>answers.</em>
            </h2>
          </div>
          <p style={{ font: "500 16px/1.6 'Inter'", color: '#52525F', paddingTop: 12 }}>
            Most of these came from our customers' first 30 minutes on the platform.
          </p>
        </div>
        <div>
          {FAQS.map((f, i) => (
            <div key={i} className="faq-row" data-open={open === i ? 'true' : 'false'}>
              <div className="faq-q" onClick={() => setOpen(open === i ? -1 : i)}>
                <span className="num">{String(i + 1).padStart(2, '0')}.</span>
                <span style={{ flex: 1 }}>{f.q}</span>
                <span className="toggle-icon">
                  <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </span>
              </div>
              {open === i && <div className="faq-a">{f.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA ─────────────────────────────────────────────────────────────── */
function CTASection() {
  return (
    <section className="panel-terracotta tx-cross" style={{ padding: '120px 5%', textAlign: 'center' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <span className="vx-stamp" style={{ color: '#9D1924', background: 'rgba(255,253,247,0.55)', marginBottom: 22, display: 'inline-flex' }}>Get started today</span>
        <h2 style={{ font: "800 clamp(28px,4.5vw,56px)/1.05 'Inter Tight'", letterSpacing: '-0.03em', margin: '18px 0' }}>Never miss a hot lead again.</h2>
        <p style={{ font: "500 17px/1.6 'Inter'", color: '#2B2B36', maxWidth: 480, margin: '0 auto 36px' }}>
          Start your first campaign in under 30 minutes. Free credits, India-hosted.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/register" style={{ padding: '14px 28px', background: '#0B0B14', color: '#fff', font: "600 15px/1 'Inter'", borderRadius: 9999, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Try Velryx <ArrowRight size={14} />
          </Link>
          <a style={{ padding: '13px 26px', background: 'rgba(255,253,247,0.65)', color: '#0B0B14', font: "600 15px/1 'Inter'", borderRadius: 9999, cursor: 'pointer', textDecoration: 'none', border: '1px solid rgba(20,20,40,0.18)' }}>
            Book a demo
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ background: '#0B0B14', color: '#8B8B98', padding: '56px 5% 32px' }}>
      <div className="vx-lp-footer" style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48, marginBottom: 40 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--grad-brand)' }} />
            <span style={{ font: "700 16px/1 'Inter Tight'", letterSpacing: '-0.02em', color: '#fff' }}>Velryx</span>
          </div>
          <p style={{ font: "500 13px/1.65 'Inter'", maxWidth: 280, color: '#8B8B98' }}>
            AI voice agents for Indian real-estate teams that need to call at scale.
          </p>
        </div>
        {[
          { title: 'Product', links: ['Features', 'Pricing', 'Industries', 'Changelog'] },
          { title: 'Company', links: ['About', 'Blog', 'Customers', 'Careers'] },
          { title: 'Legal',   links: ['Privacy', 'Terms', 'Security', 'TRAI compliance'] },
        ].map(col => (
          <div key={col.title}>
            <div style={{ font: "700 10px/1 'Inter'", letterSpacing: '0.10em', textTransform: 'uppercase', color: '#52525F', marginBottom: 16 }}>{col.title}</div>
            {col.links.map(l => (
              <a key={l} style={{ display: 'block', font: "500 13px/1 'Inter'", color: '#B5B5BF', marginBottom: 11, textDecoration: 'none', cursor: 'pointer' }}>{l}</a>
            ))}
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ font: "500 12px/1 'Inter'", color: '#52525F' }}>© 2026 Velryx Technologies · Made in India 🇮🇳</span>
        <span style={{ font: "500 12px/1 'Inter'", color: '#52525F' }}>TRAI · SOC 2 · ISO 27001</span>
      </div>
    </footer>
  );
}

/* ── Main export ─────────────────────────────────────────────────────── */
export default function Landing() {
  return (
    <div style={{ background: 'var(--cream-100)', color: '#0B0B14', minHeight: '100vh', overflowX: 'hidden' }}>
      <ScrollProgressBar />
      <NavBar />
      <Hero />
      <TrustBar />
      <UseCasesPanel />
      <StatsPanel />
      <KnowledgePanel />
      <PricingPanel />
      <FAQPanel />
      <CTASection />
      <Footer />
    </div>
  );
}
