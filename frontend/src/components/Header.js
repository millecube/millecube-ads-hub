import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { budgetAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const navigate = useNavigate();
  const { user }  = useAuth();
  const [open,    setOpen]    = useState(false);
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data     = await budgetAPI.overview();
      const today    = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const nextD    = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const nxtMonth = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;

      const unconfirmed = [];
      (data.clients || []).forEach(client => {
        client.months.forEach(({ month, budget }) => {
          if (month !== curMonth && month !== nxtMonth) return;
          if (!budget || !budget.confirmed) {
            unconfirmed.push({
              clientCode: client.clientCode,
              name:       client.name,
              month,
              amount:     budget ? budget.amount : null,
            });
          }
        });
      });
      setItems(unconfirmed);
    } catch { /* silent — header bell is non-critical */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const fmtMonth = (yyyyMM) => {
    const [y, m] = yyyyMM.split('-');
    return new Date(parseInt(y), parseInt(m) - 1, 1)
      .toLocaleString('en-MY', { month: 'short', year: 'numeric' });
  };

  return (
    <div style={s.bar}>
      <div style={{ flex: 1 }} />

      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => { setOpen(v => !v); if (!open) load(); }}
          style={s.bell}
          title="Budget notifications"
        >
          🔔
          {items.length > 0 && (
            <span style={s.badge}>{items.length}</span>
          )}
        </button>

        {open && (
          <div style={s.dropdown}>
            <div style={s.ddHeader}>
              <span style={s.ddTitle}>Budget Alerts</span>
              <button onClick={() => { setOpen(false); navigate('/budget'); }} style={s.ddLink}>
                View Budget →
              </button>
            </div>

            {loading ? (
              <div style={{ padding: '16px', textAlign: 'center' }}><div className="spinner" style={{ width: 16, height: 16, margin: '0 auto' }} /></div>
            ) : items.length === 0 ? (
              <div style={s.ddEmpty}>✓ All budgets confirmed</div>
            ) : (
              <div style={s.ddList}>
                {items.map((item, i) => (
                  <div key={i} style={s.ddItem} onClick={() => { setOpen(false); navigate('/budget'); }}>
                    <div style={s.ddClient}>
                      <span style={s.ddCode}>{item.clientCode}</span>
                      <span style={s.ddName}>{item.name}</span>
                    </div>
                    <div style={s.ddMeta}>
                      <span style={s.ddMonth}>{fmtMonth(item.month)}</span>
                      <span style={item.amount !== null ? s.ddWarn : s.ddMissing}>
                        {item.amount !== null
                          ? `RM ${parseFloat(item.amount).toLocaleString('en-MY', { minimumFractionDigits: 0 })} — unconfirmed`
                          : 'Not set'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  bar: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
    padding: '10px 32px 0',
    position: 'relative', zIndex: 50,
  },
  bell: {
    position: 'relative',
    background: 'none', border: '1px solid rgba(50,205,50,0.15)',
    borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
    fontSize: 16, lineHeight: 1,
    color: 'var(--text-primary)',
    transition: 'border-color 0.2s',
  },
  badge: {
    position: 'absolute', top: -6, right: -6,
    background: '#ff4d4d', color: '#fff',
    borderRadius: '50%', width: 18, height: 18,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 800, border: '2px solid var(--bg)',
  },
  dropdown: {
    position: 'absolute', top: '100%', right: 0, marginTop: 8,
    width: 320,
    background: 'var(--card-bg, #0a1f16)',
    border: '1px solid rgba(50,205,50,0.2)',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    zIndex: 200,
  },
  ddHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid rgba(50,205,50,0.1)',
    background: 'rgba(7,80,60,0.3)',
  },
  ddTitle: { fontSize: 12, fontWeight: 700, color: '#32cd32', letterSpacing: 1, textTransform: 'uppercase' },
  ddLink:  { background: 'none', border: 'none', color: 'rgba(232,245,233,0.5)', fontSize: 12, cursor: 'pointer', padding: 0 },
  ddEmpty: { padding: '16px', textAlign: 'center', color: '#32cd32', fontSize: 13 },
  ddList:  { maxHeight: 320, overflowY: 'auto' },
  ddItem:  {
    padding: '10px 16px', cursor: 'pointer',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    transition: 'background 0.15s',
  },
  ddClient: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 },
  ddCode:   { fontSize: 10, fontWeight: 800, color: '#32cd32', letterSpacing: 1.5 },
  ddName:   { fontSize: 12, color: 'rgba(232,245,233,0.8)', fontWeight: 600 },
  ddMeta:   { display: 'flex', alignItems: 'center', gap: 8 },
  ddMonth:  { fontSize: 11, color: 'rgba(232,245,233,0.4)' },
  ddWarn:   { fontSize: 11, color: '#f5a623' },
  ddMissing:{ fontSize: 11, color: '#ff4d4d' },
};
