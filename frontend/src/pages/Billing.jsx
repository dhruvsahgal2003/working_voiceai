// Billing — Paygic payment gateway
import { useState, useEffect, useRef } from 'react';
import { CreditCard, Phone, Plus, RefreshCw, ExternalLink, CheckCircle, Clock } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useSearchParams } from 'react-router-dom';

const AMOUNTS = [500, 1000, 2000, 5000];

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

export default function Billing() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [usage, setUsage] = useState(null);
  const [selected, setSelected] = useState(1000);
  const [custom, setCustom] = useState('');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef(null);
  const prevBalanceRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  // Handle return from Paygic payment page
  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      setPolling(true);
      setSearchParams({}, { replace: true }); // clean URL
      startPollingBalance();
    }
  }, []);

  async function loadData() {
    try {
      const [bal, hist, usag] = await Promise.all([
        api.billing.balance(),
        api.billing.history(),
        api.billing.usage(),
      ]);
      prevBalanceRef.current = bal.balance;
      setBalance(bal.balance);
      setHistory(hist.transactions || []);
      setUsage(usag.usage);
    } catch {}
    setLoading(false);
  }

  function startPollingBalance() {
    let attempts = 0;
    const maxAttempts = 36; // poll for 3 minutes (every 5s)
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const d = await api.billing.balance();
        const newBal = d.balance;
        if (newBal > (prevBalanceRef.current || 0)) {
          clearInterval(pollRef.current);
          setPolling(false);
          setPaying(false);
          setBalance(newBal);
          prevBalanceRef.current = newBal;
          showToast(`₹${(newBal - (prevBalanceRef.current || 0)).toFixed(0)} credits added!`, 'success');
          api.billing.history().then(d => setHistory(d.transactions || []));
        } else if (attempts >= maxAttempts) {
          clearInterval(pollRef.current);
          setPolling(false);
          setPaying(false);
          showToast('Payment not confirmed yet — refresh in a moment', 'info');
        }
      } catch {}
    }, 5000);
  }

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function handleTopUp() {
    const amount = custom ? parseInt(custom) : selected;
    if (!amount || amount < 500) return showToast('Minimum top-up is ₹500', 'error');
    setPaying(true);
    try {
      const order = await api.billing.createOrder(amount);
      if (!order.payment_url) throw new Error('No payment URL returned by gateway');

      prevBalanceRef.current = balance;
      // Open Paygic payment page in a new tab
      window.open(order.payment_url, '_blank', 'noopener');
      setPolling(true);
      startPollingBalance();
      showToast('Payment page opened — complete payment and return here', 'info');
    } catch (err) {
      showToast(err.message, 'error');
      setPaying(false);
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', paddingTop: 80 }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto' }} />
    </div>
  );

  const isLow = balance < 100;
  const payAmount = custom ? parseInt(custom) : selected;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Polling banner */}
      {polling && (
        <div style={{ padding: '14px 20px', borderRadius: 12, background: 'rgba(244,178,51,0.10)', border: '1px solid rgba(244,178,51,0.30)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Clock size={16} color="#C2810F" />
          <div style={{ flex: 1, font: "500 13px/1 'Inter'", color: '#92640A' }}>
            Waiting for payment confirmation — complete the payment in the tab that opened, then return here.
          </div>
          <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderColor: '#F4B233', borderTopColor: 'transparent', flexShrink: 0 }} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        {/* Credit balance + top up */}
        <div className="card-glass card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Balance display */}
          <div className="deboss" style={{ textAlign: 'center', padding: '18px 12px' }}>
            <div style={{ font: "italic 400 13px/1 'Instrument Serif',serif", color: '#52525F', marginBottom: 8 }}>Credits remaining</div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 52, lineHeight: 1, color: isLow ? '#C2180F' : '#0B0B14', letterSpacing: '-0.03em' }}>
              ₹{Number(balance).toFixed(0)}
            </div>
            {isLow && (
              <div style={{ font: "500 12px/1 'Inter'", color: '#C2180F', marginTop: 8 }}>
                ⚠ Low balance — top up to keep campaigns running
              </div>
            )}
          </div>

          {/* Amount selector */}
          <div>
            <div style={{ font: "700 12px/1 'Inter'", letterSpacing: '0.06em', textTransform: 'uppercase', color: '#52525F', marginBottom: 12 }}>Top up</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
              {AMOUNTS.map(a => (
                <button key={a} onClick={() => { setSelected(a); setCustom(''); }} style={{
                  padding: '10px 0', borderRadius: 10, border: `1.5px solid ${selected === a && !custom ? '#0B0B14' : 'rgba(20,20,40,0.12)'}`,
                  background: selected === a && !custom ? '#0B0B14' : 'rgba(255,253,247,0.70)',
                  color: selected === a && !custom ? '#fff' : '#0B0B14',
                  cursor: 'pointer', textAlign: 'center',
                }}>
                  <div style={{ font: "700 13px/1 'Inter Tight'", letterSpacing: '-0.01em' }}>₹{a}</div>
                  <div style={{ font: "500 10px/1 'Inter'", marginTop: 4, opacity: 0.65 }}>~{Math.floor(a / 6)}m</div>
                </button>
              ))}
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <input className="input" type="number" placeholder="Custom amount (₹ 500 minimum)"
                value={custom} onChange={e => setCustom(e.target.value)} min="500" style={{ height: 38 }} />
            </div>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center', gap: 8 }}
              onClick={handleTopUp}
              disabled={paying}
            >
              {paying && !polling ? (
                <span className="spinner spinner-sm" />
              ) : polling ? (
                <><Clock size={14} /> Waiting for payment…</>
              ) : (
                <><ExternalLink size={14} /> Pay ₹{payAmount || '—'} via Paygic</>
              )}
            </button>
            <div style={{ font: "italic 400 11px/1.3 'Instrument Serif',serif", color: '#8B8B98', textAlign: 'center', marginTop: 8 }}>
              Secure payment via Paygic · Credits added instantly after payment
            </div>
          </div>
        </div>

        {/* Usage summary */}
        <div className="card-glass card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ font: "700 14px/1 'Inter Tight'", letterSpacing: '-0.01em', color: '#0B0B14' }}>Usage</div>
          {usage && (usage.total_cost > 0 || usage.total_minutes > 0) ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['Total spent', `₹${Number(usage.total_cost).toFixed(0)}`],
                  ['Minutes called', `${Math.floor(usage.total_minutes)}`],
                ].map(([l, v]) => (
                  <div key={l} className="deboss" style={{ textAlign: 'center', padding: '14px 8px' }}>
                    <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, lineHeight: 1, color: '#0B0B14', letterSpacing: '-0.02em' }}>{v}</div>
                    <div style={{ font: "500 11px/1 'Inter'", color: '#52525F', marginTop: 6 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['AI agent', `₹${Number(usage.total_cost || 0).toFixed(2)}`],
                  ['Carrier (Plivo)', `₹${Number(usage.plivo_cost || 0).toFixed(2)}`],
                  ['Speech recognition', `₹${Number(usage.stt_cost || 0).toFixed(2)}`],
                  ['Voice synthesis', `₹${Number(usage.tts_cost || 0).toFixed(2)}`],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', font: "500 12px/1 'Inter'", color: '#52525F', padding: '6px 0', borderBottom: '1px dashed rgba(20,20,40,0.08)' }}>
                    <span>{l}</span><span style={{ fontWeight: 600, color: '#0B0B14' }}>{v}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
              <Phone size={28} style={{ opacity: 0.2, marginBottom: 10 }} />
              <div style={{ font: "italic 400 14px/1 'Instrument Serif',serif", color: '#8B8B98' }}>No calls yet</div>
              <div style={{ font: "500 12px/1 'Inter'", color: '#8B8B98', marginTop: 4 }}>Usage appears here after your first campaign</div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction history */}
      <div className="card-glass" style={{ padding: '4px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 12px' }}>
          <div>
            <div style={{ font: "700 14px/1 'Inter Tight'", letterSpacing: '-0.01em', color: '#0B0B14' }}>Transaction history</div>
            <div style={{ font: '500 12px/1 Inter', color: '#8B8B98', marginTop: 3 }}>{history.length} transactions</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={() => api.billing.history().then(d => setHistory(d.transactions || []))} title="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>
        {!history.length ? (
          <div className="empty-state" style={{ padding: '40px 0' }}>
            <div className="empty-icon"><CreditCard size={24} /></div>
            <h3>No transactions yet</h3>
            <p>Add credits to get started.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Balance after</th></tr>
            </thead>
            <tbody>
              {history.map(t => (
                <tr key={t.id}>
                  <td style={{ fontSize: 11, color: '#8B8B98' }}>{fmtDate(t.created_at)}</td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      font: "600 10px/1 'Inter'", letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '3px 7px', borderRadius: 4,
                      background: t.type === 'credit_added' ? 'rgba(31,138,91,0.10)' : 'rgba(244,178,51,0.10)',
                      color: t.type === 'credit_added' ? '#16613F' : '#92640A',
                    }}>
                      {t.type === 'credit_added' ? <CheckCircle size={8} /> : <Phone size={8} />}
                      {t.type === 'credit_added' ? 'Top-up' : t.type === 'call_charge' ? 'Call' : t.type}
                    </span>
                  </td>
                  <td style={{ font: "500 12px/1 'Inter'", color: '#52525F' }}>{t.description || '—'}</td>
                  <td style={{ font: "700 13px/1 'Inter Tight'", color: t.amount > 0 ? '#16613F' : '#0B0B14' }}>
                    {t.amount > 0 ? '+' : ''}₹{Math.abs(t.amount).toFixed(2)}
                  </td>
                  <td style={{ font: "500 12px/1 'Inter'", color: '#8B8B98' }}>₹{Number(t.balance_after).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
