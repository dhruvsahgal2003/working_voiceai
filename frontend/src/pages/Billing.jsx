import { useState, useEffect } from 'react';
import { CreditCard, Phone, Plus, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

const AMOUNTS = [1000, 2000, 5000, 10000];

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function Billing() {
  const { showToast } = useToast();
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [usage, setUsage] = useState(null);
  const [selected, setSelected] = useState(1000);
  const [custom, setCustom] = useState('');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    Promise.all([
      api.billing.balance().then(d => setBalance(d.balance)),
      api.billing.history().then(d => setHistory(d.transactions || [])),
      api.billing.usage().then(d => setUsage(d.usage)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleTopUp() {
    const amount = custom ? parseInt(custom) : selected;
    if (!amount || amount < 1000) return showToast('Minimum top-up is ₹1,000', 'error');
    setPaying(true);
    try {
      const order = await api.billing.createOrder(amount);
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: order.name || 'Callora',
        description: order.description || `Add ₹${amount} credits`,
        prefill: order.prefill || {},
        theme: { color: '#5b5bd6' },
        handler: async (response) => {
          try {
            await api.billing.verify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount: order.amount,
            });
            showToast(`₹${amount} credits added successfully!`, 'success');
            const d = await api.billing.balance();
            setBalance(d.balance);
            api.billing.history().then(d => setHistory(d.transactions || []));
          } catch (err) {
            showToast('Payment verification failed: ' + err.message, 'error');
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.open();
    } catch (err) {
      showToast(err.message, 'error');
      setPaying(false);
    }
  }

  function loadRazorpay() {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve();
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = resolve;
      document.body.appendChild(s);
    });
  }

  if (loading) return <div className="page-body" style={{ textAlign: 'center', paddingTop: 80 }}><div className="spinner" /></div>;

  const isLow = balance < 100;

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing & Credits</h1>
          <p className="page-subtitle">₹6/min per AI call</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Credit Balance */}
        <div className="card">
          <div className="card-body">
            <div className="credit-display">
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Current Balance</div>
              <div>
                <span className="credit-currency">₹</span>
                <span className="credit-amount">{Number(balance).toFixed(2)}</span>
              </div>
              {isLow && <div style={{ color: 'var(--amber)', fontSize: 13, marginTop: 8 }}>⚠️ Low balance — top up to keep campaigns running</div>}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Quick top-up</div>
              <div className="recharge-grid" style={{ marginBottom: 14 }}>
                {AMOUNTS.map(a => (
                  <div key={a} className={`recharge-card${selected === a && !custom ? ' selected' : ''}`} onClick={() => { setSelected(a); setCustom(''); }}>
                    <div className="recharge-amount">₹{a}</div>
                    <div className="recharge-label">~{Math.floor(a / 6)} min</div>
                  </div>
                ))}
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <input className="form-input" type="number" placeholder="Custom amount (₹)" value={custom} onChange={e => setCustom(e.target.value)} min="100" />
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleTopUp} disabled={paying}>
                {paying ? <span className="spinner spinner-sm" /> : <><Plus size={14} /> Add ₹{custom || selected} Credits</>}
              </button>
            </div>
          </div>
        </div>

        {/* Usage Summary */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Usage Summary</h3></div>
          <div className="card-body">
            {usage && (usage.total_cost > 0 || usage.total_minutes > 0) ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 800 }}>₹{Number(usage.total_cost).toFixed(0)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Total Spent</div>
                  </div>
                  <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 800 }}>{Math.floor(usage.total_minutes)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Minutes Called</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--bg)', borderRadius: 9 }}>
                  <Phone size={15} color="var(--accent)" />
                  <div style={{ fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>₹6/min</span>
                    <span style={{ color: 'var(--text-muted)' }}> · credits deducted per minute of call time</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
                <Phone size={28} style={{ opacity: 0.3, marginBottom: 10 }} />
                <div style={{ fontSize: 13 }}>No usage yet — launch a campaign to get started</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="table-card">
        <div className="table-header">
          <h3 className="table-title">Transaction History</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => api.billing.history().then(d => setHistory(d.transactions || []))}><RefreshCw size={13} /></button>
        </div>
        {!history.length ? (
          <div className="empty-state"><div className="empty-state-icon"><CreditCard size={20} /></div><h3>No transactions</h3><p>Add credits to get started.</p></div>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Balance After</th></tr></thead>
            <tbody>
              {history.map(t => (
                <tr key={t.id}>
                  <td className="cell-muted">{fmtDate(t.created_at)}</td>
                  <td>
                    <span className={`badge ${t.type === 'credit_added' ? 'badge-green' : t.type === 'call_charge' ? 'badge-amber' : 'badge-gray'}`}>
                      {t.type === 'credit_added' ? '+ Added' : t.type === 'call_charge' ? '− Call' : t.type}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{t.description}</td>
                  <td style={{ fontWeight: 600, color: t.amount > 0 ? 'var(--green)' : 'var(--red)' }}>
                    {t.amount > 0 ? '+' : ''}₹{Math.abs(t.amount).toFixed(2)}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>₹{Number(t.balance_after).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
