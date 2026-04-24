import React, { useEffect, useState } from 'react';
import { clientsAPI, schedulesAPI } from '../utils/api';
import { useToast } from '../hooks/useToast';

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1); // 1–28 (safe for all months)

function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ScheduleModal({ clients, schedules, onClose, onSaved }) {
  const toast = useToast();
  const [clientId, setClientId] = useState('');
  const [day,      setDay]      = useState(5);
  const [saving,   setSaving]   = useState(false);

  const usedClientIds = new Set(schedules.map(s => s.clientId));
  const available = clients.filter(c => !usedClientIds.has(c.id));

  const submit = async (e) => {
    e.preventDefault();
    if (!clientId) return toast('Select a client.', 'error');
    setSaving(true);
    try {
      await schedulesAPI.create({ clientId, dayOfMonth: day, active: true });
      toast('Schedule created!', 'success');
      onSaved();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create schedule.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass" style={{ maxWidth: 480 }}>
        <div style={ms.header}>
          <h2 style={ms.title}>New Auto Schedule</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {available.length === 0 ? (
          <div style={{ color: 'rgba(232,245,233,0.5)', fontSize: 14, padding: '12px 0' }}>
            All clients already have schedules. Edit or remove existing ones below.
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="form-group">
              <label className="form-label">Client</label>
              <select className="form-input" value={clientId} onChange={e => setClientId(e.target.value)} required>
                <option value="">Select client…</option>
                {available.map(c => (
                  <option key={c.id} value={c.id}>{c.clientCode} — {c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Day of Month to Auto-Generate</label>
              <select className="form-input" value={day} onChange={e => setDay(parseInt(e.target.value))}>
                {DAY_OPTIONS.map(d => (
                  <option key={d} value={d}>{ordinal(d)}{d === 5 ? ' (recommended)' : ''}</option>
                ))}
              </select>
              <span style={ms.hint}>
                On the {ordinal(day)} of each month, the system will auto-generate the previous month's report at 08:00 AM MYT.
              </span>
            </div>

            <div style={ms.preview}>
              <div style={ms.previewTitle}>Schedule Preview</div>
              <div style={ms.previewRow}>
                <span>Next run</span>
                <span>{ordinal(day)} of next month, 08:00 AM</span>
              </div>
              <div style={ms.previewRow}>
                <span>Data captured</span>
                <span>Full previous month</span>
              </div>
              <div style={ms.previewRow}>
                <span>Timezone</span>
                <span>Asia/Kuala_Lumpur (MYT)</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : 'Create Schedule'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Schedules() {
  const toast = useToast();
  const [clients,   setClients]   = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [editing,   setEditing]   = useState(null); // { id, day }

  const load = async () => {
    const [c, s] = await Promise.all([clientsAPI.list(), schedulesAPI.list()]);
    setClients(c); setSchedules(s);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getClientName = (clientId) => {
    const c = clients.find(c => c.id === clientId);
    return c ? `${c.clientCode} — ${c.name}` : clientId;
  };

  const toggleActive = async (s) => {
    await schedulesAPI.update(s.id, { active: !s.active });
    toast(s.active ? 'Schedule paused.' : 'Schedule activated.', 'success');
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this schedule? The client will no longer auto-generate.')) return;
    await schedulesAPI.delete(id);
    toast('Schedule removed.', 'success');
    load();
  };

  const saveEdit = async (id) => {
    await schedulesAPI.update(id, { dayOfMonth: editing.day });
    toast('Schedule updated.', 'success');
    setEditing(null);
    load();
  };

  return (
    <div style={s.page} className="fade-up">
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Auto Schedules</h1>
          <p style={s.sub}>Set recurring monthly report generation per client</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ New Schedule</button>
      </div>

      {/* How it works */}
      <div className="glass" style={s.infoStrip}>
        <span style={s.infoIcon}>◷</span>
        <div>
          <strong style={{ color: '#e8f5e9' }}>How auto-scheduling works:</strong>
          <span style={{ color: 'rgba(232,245,233,0.55)', fontSize: 13 }}>
            {' '}On the selected day of each month at 08:00 AM MYT, the server automatically calls the Meta API and generates the previous full month's report. Reports are saved to <code style={{ color: '#32cd32' }}>/reports/[CLIENT_CODE]/</code> and appear in History.
          </span>
        </div>
      </div>

      {/* Schedules table */}
      <div className="glass" style={s.tableWrap}>
        {loading ? (
          <div style={s.loading}><div className="spinner" /></div>
        ) : schedules.length === 0 ? (
          <div style={s.empty}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>◷</div>
            <div style={{ marginBottom: 16 }}>No schedules yet. Create one to start automating.</div>
            <button className="btn btn-primary" onClick={() => setModal(true)}>+ Create First Schedule</button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Day of Month</th>
                <th>Captures</th>
                <th>Timezone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(sch => (
                <tr key={sch.id}>
                  <td>
                    <div style={s.clientCell}>
                      <span style={s.codeTag}>{sch.clientCode}</span>
                      <span style={{ fontSize: 12, color: 'rgba(232,245,233,0.5)' }}>
                        {getClientName(sch.clientId).split('— ')[1]}
                      </span>
                    </div>
                  </td>
                  <td>
                    {editing?.id === sch.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          className="form-input"
                          value={editing.day}
                          onChange={e => setEditing({ ...editing, day: parseInt(e.target.value) })}
                          style={{ width: 100 }}
                        >
                          {DAY_OPTIONS.map(d => <option key={d} value={d}>{ordinal(d)}</option>)}
                        </select>
                        <button className="btn btn-primary btn-sm" onClick={() => saveEdit(sch.id)}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>✕</button>
                      </div>
                    ) : (
                      <span
                        style={s.dayBadge}
                        onClick={() => setEditing({ id: sch.id, day: sch.dayOfMonth })}
                        title="Click to edit"
                      >
                        {ordinal(sch.dayOfMonth)} ✎
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'rgba(232,245,233,0.55)', fontSize: 13 }}>Previous full month</td>
                  <td style={{ color: 'rgba(232,245,233,0.4)', fontSize: 12 }}>MYT (UTC+8)</td>
                  <td>
                    <span className={`badge ${sch.active ? 'badge-green' : 'badge-dim'}`}>
                      {sch.active ? '● Active' : '○ Paused'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleActive(sch)}
                      >
                        {sch.active ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(sch.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Calendar preview */}
      {schedules.length > 0 && (
        <div style={s.calSection}>
          <h2 style={s.calTitle}>Monthly Run Calendar</h2>
          <div style={s.calGrid}>
            {DAY_OPTIONS.map(day => {
              const hits = schedules.filter(s => s.dayOfMonth === day && s.active);
              return (
                <div key={day} style={{ ...s.calDay, ...(hits.length > 0 ? s.calDayActive : {}) }}>
                  <div style={s.calDayNum}>{day}</div>
                  {hits.map(h => (
                    <div key={h.id} style={s.calTag}>{h.clientCode}</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modal && (
        <ScheduleModal
          clients={clients}
          schedules={schedules}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); load(); }}
        />
      )}
    </div>
  );
}

const s = {
  page: { padding: '32px 36px', maxWidth: 1100 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: '#e8f5e9', letterSpacing: -0.5 },
  sub: { fontSize: 13, color: 'rgba(232,245,233,0.4)', marginTop: 4 },
  infoStrip: {
    display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 20px',
    marginBottom: 20, fontSize: 13, lineHeight: 1.7
  },
  infoIcon: { fontSize: 22, color: '#32cd32', flexShrink: 0, marginTop: 2 },
  tableWrap: { overflow: 'hidden', marginBottom: 28 },
  loading: { padding: 48, display: 'flex', justifyContent: 'center' },
  empty: { padding: 56, textAlign: 'center', color: 'rgba(232,245,233,0.35)', fontSize: 14 },
  clientCell: { display: 'flex', alignItems: 'center', gap: 10 },
  codeTag: {
    background: 'rgba(50,205,50,0.12)', color: '#32cd32',
    border: '1px solid rgba(50,205,50,0.25)',
    borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700
  },
  dayBadge: {
    background: 'rgba(50,205,50,0.1)', color: '#6bc71f',
    border: '1px solid rgba(50,205,50,0.2)', borderRadius: 6,
    padding: '4px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    display: 'inline-block'
  },
  calSection: { marginTop: 8 },
  calTitle: { fontSize: 15, fontWeight: 700, color: '#e8f5e9', marginBottom: 14 },
  calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 },
  calDay: {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 8, padding: '10px 8px', minHeight: 60,
    display: 'flex', flexDirection: 'column', gap: 4
  },
  calDayActive: {
    background: 'rgba(50,205,50,0.07)', border: '1px solid rgba(50,205,50,0.25)'
  },
  calDayNum: { fontSize: 11, fontWeight: 700, color: 'rgba(232,245,233,0.3)' },
  calTag: {
    background: 'rgba(50,205,50,0.18)', color: '#32cd32',
    borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5
  }
};

const ms = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  title: { fontSize: 19, fontWeight: 800, color: '#e8f5e9' },
  hint: { fontSize: 11, color: 'rgba(232,245,233,0.35)', marginTop: 6, display: 'block', lineHeight: 1.6 },
  preview: {
    background: 'rgba(50,205,50,0.06)', border: '1px solid rgba(50,205,50,0.15)',
    borderRadius: 8, padding: '14px 16px', marginTop: 4
  },
  previewTitle: { fontSize: 11, fontWeight: 700, color: '#32cd32', marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' },
  previewRow: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 12, color: 'rgba(232,245,233,0.55)', marginBottom: 6
  }
};
