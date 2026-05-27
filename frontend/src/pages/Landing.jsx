import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/* ─── USE CASES (ringg.ai style: industry + specific call count) ─────────── */
const USE_CASES = [
  {
    label: 'Lead Qualification',
    description: 'Instantly call every new inquiry. Qualify intent, budget and timeline before your team picks up the phone.',
    stat: '1.2M+',
    statLabel: 'leads qualified',
    icon: IconTarget,
    color: '#eef2ff',
    iconColor: '#4f46e5',
  },
  {
    label: 'Site Visit Booking',
    description: 'Confirm visits, send reminders, handle reschedules. Zero manual effort, dramatically higher show-up rates.',
    stat: '380K+',
    statLabel: 'visits booked',
    icon: IconCalendar,
    color: '#f0fdf4',
    iconColor: '#16a34a',
  },
  {
    label: 'Resale Follow-up',
    description: 'Re-engage cold leads at scale. The AI remembers context and picks up conversations naturally.',
    stat: '520K+',
    statLabel: 'follow-ups completed',
    icon: IconRefresh,
    color: '#fffbeb',
    iconColor: '#d97706',
  },
  {
    label: 'NRI Inquiries',
    description: 'Handle calls across time zones in English, Hindi and regional languages. Available around the clock.',
    stat: '24/7',
    statLabel: 'availability',
    icon: IconGlobe,
    color: '#fff1f2',
    iconColor: '#e11d48',
  },
  {
    label: 'Payment Reminders',
    description: 'Automate installment reminders, due date follow-ups and overdue alerts with a polite, persistent voice.',
    stat: '94%',
    statLabel: 'contact rate',
    icon: IconBell,
    color: '#f5f3ff',
    iconColor: '#7c3aed',
  },
  {
    label: 'Post-Sale Engagement',
    description: 'Welcome new buyers, collect satisfaction feedback and nurture referrals — all on autopilot.',
    stat: '4.8★',
    statLabel: 'avg. CSAT score',
    icon: IconStar,
    color: '#ecfdf5',
    iconColor: '#059669',
  },
];

const STATS = [
  { value: '10,000+', label: 'Concurrent calls' },
  { value: '800ms',   label: 'Avg response time' },
  { value: '20+',     label: 'Indian languages' },
  { value: '99.9%',   label: 'Uptime SLA' },
];

const HOW_IT_WORKS = [
  { n: '01', title: 'Describe your agent', body: 'Enter your brand and use case. AI writes the full conversation script — opening, objection handling, FAQs — in 30 seconds.' },
  { n: '02', title: 'Import your leads', body: 'Upload any CSV. Numbers are auto-formatted, duplicates removed, DNC list checked. Campaign ready in minutes.' },
  { n: '03', title: 'Launch your campaign', body: 'Set calling hours (e.g. 10am–7pm IST), concurrency limit and hit launch. The platform handles everything.' },
  { n: '04', title: 'Close hot leads', body: 'Get instant alerts on interested leads with full transcripts. Your team only talks to people who want to hear from you.' },
];

const TESTIMONIALS = [
  { quote: 'We went from 80 calls a day to 800. Site visit bookings tripled in the first month. The Hindi voice is indistinguishable from a real person.', name: 'Nikhil Mehta', role: 'Sales Head, Mumbai Developer', avatar: 'NM' },
  { quote: 'NRI leads were impossible — different time zones, no one to answer at 2am. Now the AI handles them 24/7. Conversion rate up 40%.', name: 'Deepika Rao', role: 'GM Marketing, Bangalore Realty', avatar: 'DR' },
  { quote: "Setup took 20 minutes. First campaign live the same day. I've closed 3 deals from hot-lead alerts already.", name: 'Arjun Sharma', role: 'Founder, PropTech Startup', avatar: 'AS' },
];

/* ─── ANIMATION HELPERS ───────────────────────────────────────────────────── */
const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

function Reveal({ children, delay = 0, style }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div ref={ref} initial="hidden" animate={inView ? 'visible' : 'hidden'}
      variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] } } }}
      style={style}>
      {children}
    </motion.div>
  );
}

/* ─── SVG ICONS (no emoji) ────────────────────────────────────────────────── */
function IconTarget({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
}
function IconCalendar({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
}
function IconRefresh({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
}
function IconGlobe({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
}
function IconBell({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function IconStar({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
}
function IconPhone({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.4a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2.72h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
}
function IconZap({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
}
function IconBarChart({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
}
function IconBook({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
}
function IconWebhook({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/></svg>;
}

/* ─── PRODUCT MOCKUP SVG ──────────────────────────────────────────────────── */
function ProductMockup() {
  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
      {/* Browser chrome */}
      <div style={{ background: '#1e1b4b', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 22, marginLeft: 8, display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>app.callora.in/campaigns</span>
        </div>
      </div>

      {/* App UI */}
      <div style={{ background: '#0f172a', padding: '20px 20px 0' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>Campaigns</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>3 active campaigns</div>
          </div>
          <div style={{ background: '#4f46e5', color: 'white', fontSize: 11, fontWeight: 600, padding: '6px 14px', borderRadius: 8 }}>+ New Campaign</div>
        </div>

        {/* Campaign rows */}
        {[
          { name: 'Gurgaon Sector 65 Launch', status: 'Running', color: '#22c55e', bg: '#052e16', leads: 847, hot: 62, pct: 68 },
          { name: 'Mumbai NRI Follow-up Q4', status: 'Running', color: '#22c55e', bg: '#052e16', leads: 512, hot: 41, pct: 44 },
          { name: 'Delhi Resale Oct Batch', status: 'Paused', color: '#f59e0b', bg: '#451a03', leads: 1200, hot: 88, pct: 81 },
        ].map((c, i) => (
          <div key={i} style={{ background: '#1e293b', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{c.name}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{c.leads} leads</span>
                  <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>{c.hot} hot</span>
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, background: c.bg, color: c.color }}>{c.status}</div>
            </div>
            <div style={{ height: 3, background: '#334155', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${c.pct}%`, background: 'linear-gradient(90deg, #4f46e5, #818cf8)', borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 4 }}>{c.pct}% complete</div>
          </div>
        ))}

        {/* Live call feed */}
        <div style={{ borderTop: '1px solid #1e293b', padding: '14px 0 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)' }} />
            LIVE CALLS
          </div>
          {[
            { name: 'Ravi K.', city: 'Gurgaon', outcome: 'Hot lead', oc: '#22c55e' },
            { name: 'Priya S.', city: 'Mumbai', outcome: 'Calling…', oc: '#f59e0b' },
            { name: 'Anil M.', city: 'Delhi', outcome: 'Voicemail', oc: '#64748b' },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#94a3b8' }}>{row.name[0]}</div>
                <div>
                  <div style={{ fontSize: 11, color: '#f1f5f9', fontWeight: 500 }}>{row.name}</div>
                  <div style={{ fontSize: 9, color: '#475569' }}>{row.city}</div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: row.oc, fontWeight: 600 }}>{row.outcome}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── MAIN COMPONENT ──────────────────────────────────────────────────────── */
export default function Landing() {
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: '#ffffff', color: '#0f172a', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── NAV ────────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, borderBottom: '1px solid #f1f5f9', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
              <div style={{ width: 30, height: 30, background: '#4f46e5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.4a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2.72h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', letterSpacing: '-0.02em' }}>Callora</span>
            </Link>
            <div style={{ display: 'flex', gap: 4 }}>
              {['Features', 'Pricing', 'Industries'].map(l => (
                <a key={l} href="#" style={{ padding: '6px 12px', fontSize: 13.5, fontWeight: 500, color: '#64748b', textDecoration: 'none', borderRadius: 6, transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.target.style.color = '#0f172a'; e.target.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { e.target.style.color = '#64748b'; e.target.style.background = 'transparent'; }}>{l}</a>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link to="/login" style={{ padding: '7px 16px', fontSize: 13.5, fontWeight: 500, color: '#374151', textDecoration: 'none', borderRadius: 7, transition: 'background 0.15s' }}
              onMouseEnter={e => e.target.style.background = '#f3f4f6'} onMouseLeave={e => e.target.style.background = 'transparent'}>Sign in</Link>
            <Link to="/register" style={{ padding: '7px 18px', fontSize: 13.5, fontWeight: 600, color: 'white', background: '#4f46e5', textDecoration: 'none', borderRadius: 7, boxShadow: '0 1px 2px rgba(79,70,229,0.4)' }}>Get started free</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 24px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
          {/* Left */}
          <div>
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 100, padding: '4px 12px 4px 6px', marginBottom: 24 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4f46e5' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#4338ca', letterSpacing: '0.02em' }}>AI Voice Agent Platform · Built for India</span>
              </div>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              style={{ fontSize: 'clamp(36px, 4.5vw, 58px)', fontWeight: 900, lineHeight: 1.06, letterSpacing: '-0.04em', color: '#0f172a', margin: '0 0 20px' }}>
              The Voice Agent Platform<br />
              <span style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>to Scale Lead Qualification</span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.18 }}
              style={{ fontSize: 17, color: '#475569', lineHeight: 1.7, marginBottom: 32, maxWidth: 460 }}>
              Call every new inquiry in under 60 seconds. Qualify budget, intent and timeline at scale — in Hindi, English, and 20+ Indian languages.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.26 }}
              style={{ display: 'flex', gap: 10, marginBottom: 40, flexWrap: 'wrap' }}>
              <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 24px', background: '#4f46e5', color: 'white', fontSize: 14.5, fontWeight: 600, textDecoration: 'none', borderRadius: 8, boxShadow: '0 2px 8px rgba(79,70,229,0.4)' }}>
                Start free trial
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 24px', background: 'white', color: '#374151', fontSize: 14.5, fontWeight: 600, textDecoration: 'none', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <IconPhone size={14} color="#374151" />
                See a live demo
              </Link>
            </motion.div>

            {/* Stats row */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.38 }}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderTop: '1px solid #f1f5f9', paddingTop: 24 }}>
              {STATS.map((s, i) => (
                <div key={i} style={{ paddingRight: 20, borderRight: i < 3 ? '1px solid #f1f5f9' : 'none', paddingLeft: i > 0 ? 20 : 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>{s.value}</div>
                  <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2, lineHeight: 1.3 }}>{s.label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: Product mockup */}
          <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.65, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}>
            <ProductMockup />
          </motion.div>
        </div>
      </section>

      {/* ── TRUST BAR ──────────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', padding: '14px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 4 }}>Trusted infrastructure:</span>
          {['TRAI DND Compliant', 'SOC 2 Certified', 'Hosted in India', 'End-to-end encrypted', '99.9% Uptime SLA'].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', background: '#f8fafc', borderRadius: 100, border: '1px solid #e2e8f0' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── USE CASES ──────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 24px' }}>
        <Reveal>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Use cases</div>
            <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', margin: 0 }}>Built for every real estate workflow</h2>
          </div>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {USE_CASES.map((u, i) => (
            <Reveal key={i} delay={i * 0.07}>
              <motion.div whileHover={{ y: -3, boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}
                style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px', height: '100%', cursor: 'default', transition: 'box-shadow 0.2s' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: u.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <u.icon size={18} color={u.iconColor} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{u.label}</div>
                <div style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.65, marginBottom: 20 }}>{u.description}</div>
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: u.iconColor, letterSpacing: '-0.03em' }}>{u.stat}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{u.statLabel}</div>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section style={{ background: '#f8fafc', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 24px' }}>
          <Reveal>
            <div style={{ marginBottom: 48 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>How it works</div>
              <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', margin: 0 }}>Live in under 30 minutes</h2>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
            {HOW_IT_WORKS.map((s, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div style={{ padding: '0 24px 0 0', borderRight: i < 3 ? '1px solid #e2e8f0' : 'none', marginRight: i < 3 ? 24 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#4f46e5', letterSpacing: '0.08em', marginBottom: 16 }}>{s.n}</div>
                  <div style={{ fontSize: 15.5, fontWeight: 700, color: '#0f172a', marginBottom: 10, lineHeight: 1.3 }}>{s.title}</div>
                  <div style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.7 }}>{s.body}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 24px' }}>
        <Reveal>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Platform</div>
            <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', margin: 0 }}>Everything you need to close more deals</h2>
          </div>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { Icon: IconZap,      title: 'Sub-second responses',   body: 'Responses in under 800ms. No dead air, no lag. Conversations flow like a real call.' },
            { Icon: IconGlobe,    title: '20+ Indian languages',   body: 'English, Hindi, Tamil, Telugu, Marathi and more — even mid-call language switching.' },
            { Icon: IconBarChart, title: 'Structured lead scores',  body: 'Every call produces intent, budget, timeline, objections — ready for your CRM.' },
            { Icon: IconBook,     title: 'Your knowledge base',    body: 'Upload project brochures and price lists. The agent answers questions with your exact data.' },
            { Icon: IconWebhook,  title: 'Real-time hot-lead alerts', body: 'The moment someone is interested, your closer gets a full call summary by webhook or WhatsApp.' },
            { Icon: IconPhone,    title: 'High-volume outbound',   body: 'Run thousands of concurrent calls with automatic retries, DNC compliance and live monitoring.' },
          ].map(({ Icon, title, body }, i) => (
            <Reveal key={i} delay={i * 0.07}>
              <div style={{ padding: '24px', border: '1px solid #e2e8f0', borderRadius: 14, background: 'white' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#c7d2fe'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Icon size={18} color="#4f46e5" />
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.65 }}>{body}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────────────────────────────── */}
      <section style={{ background: '#f8fafc', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 24px' }}>
          <Reveal>
            <div style={{ marginBottom: 48 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Testimonials</div>
              <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', margin: 0 }}>Real estate teams are already closing more</h2>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '28px' }}>
                  {/* Stars */}
                  <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    ))}
                  </div>
                  <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.75, margin: '0 0 24px' }}>"{t.quote}"</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#4f46e5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{t.avatar}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.role}</div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section style={{ background: '#0f172a', position: 'relative', overflow: 'hidden' }}>
        {/* bg gradient */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(79,70,229,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '100px 24px', textAlign: 'center', position: 'relative' }}>
          <Reveal>
            <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: '#818cf8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>Get started today</div>
            <h2 style={{ fontSize: 'clamp(30px, 4vw, 52px)', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.035em', lineHeight: 1.08, margin: '0 0 18px' }}>
              Never miss a hot lead again
            </h2>
            <p style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.7, margin: '0 0 40px' }}>
              Start your first campaign in under 30 minutes. Free trial included — no credit card required.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 28px', background: '#4f46e5', color: 'white', fontSize: 15, fontWeight: 600, textDecoration: 'none', borderRadius: 8, boxShadow: '0 2px 16px rgba(79,70,229,0.5)' }}>
                Start free trial
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 28px', background: 'rgba(255,255,255,0.07)', color: '#e2e8f0', fontSize: 15, fontWeight: 600, textDecoration: 'none', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}>
                Sign in
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#0f172a', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '48px 24px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40, marginBottom: 40 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, background: '#4f46e5', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.4a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2.72h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#f8fafc', letterSpacing: '-0.02em' }}>Callora</span>
              </div>
              <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, maxWidth: 220, margin: 0 }}>AI voice agents for real estate teams that need to call at scale.</p>
            </div>
            {[
              { title: 'Product', links: ['Features', 'Pricing', 'Changelog'] },
              { title: 'Company', links: ['About', 'Blog', 'Careers'] },
              { title: 'Legal', links: ['Privacy', 'Terms', 'Security'] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 14, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{col.title}</div>
                {col.links.map(l => (
                  <a key={l} href="#" style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 10, textDecoration: 'none' }}
                    onMouseEnter={e => e.target.style.color = '#94a3b8'} onMouseLeave={e => e.target.style.color = '#475569'}>{l}</a>
                ))}
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#334155' }}>
            <span>© 2025 Callora Technologies. All rights reserved.</span>
            <span>Made in India 🇮🇳</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
