// Events page — activity feed for all platform events
import { useState, useEffect } from 'react';
import { Activity, RefreshCw, CheckCheck } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

function fmtTime(d) {
  const diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function dotColor(type) {
  if (type?.startsWith('call')) return 'var(--blue)';
  if (type?.startsWith('lead')) return 'var(--green)';
  if (type?.startsWith('credit')) return 'var(--amber)';
  if (type?.startsWith('campaign')) return 'var(--purple)';
  return 'var(--accent)';
}

export default function Events() {
  const { showToast } = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.events.list(100).then(d => setEvents(d.events || [])).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function markAllRead() {
    try {
      await api.events.readAll();
      setEvents(prev => prev.map(e => ({ ...e, read: true })));
      showToast('All events marked as read', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  const unread = events.filter(e => !e.read).length;

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Events {unread > 0 && <span className="badge badge-accent" style={{ fontSize: 13 }}>{unread}</span>}</h1>
          <p className="page-subtitle">Real-time activity feed — calls, leads, campaigns, credits</p>
        </div>
        <div className="page-actions">
          {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={markAllRead}><CheckCheck size={14} /> Mark all read</button>}
          <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={13} /></button>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: '8px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : !events.length ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Activity size={24} /></div>
              <h3>No events yet</h3>
              <p>Events will appear here as you launch campaigns and make calls.</p>
            </div>
          ) : (
            events.map(ev => (
              <div key={ev.id} className="event-item" style={{ opacity: ev.read ? .7 : 1 }}>
                <div className="event-dot" style={{ background: dotColor(ev.type), marginTop: 5 }} />
                <div style={{ flex: 1 }}>
                  <div className="event-title">{ev.title}</div>
                  {ev.body && <div className="event-body">{ev.body}</div>}
                </div>
                <div className="event-time">{fmtTime(ev.created_at)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
