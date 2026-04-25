import React, { useEffect, useState } from 'react';
import { clientsAPI, schedulesAPI } from '../utils/api';
import { useToast } from '../hooks/useToast';

const MONTH_DAYS    = Array.from({ length: 28 }, (_, i) => i + 1);
const BIWEEKLY_DAYS = Array.from({ length: 14 }, (_, i) => i + 1); // 1-14, second run = day+14
const HOUR_OPTIONS  = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_OPTIONS = [0, 15, 30, 45];
const DOW_LABELS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DOW_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function fmtTime(h = 8, m = 0) {
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function freqLabel(f) {
  return { monthly: 'Monthly', biweekly: 'Biweekly', weekly: 'Weekly' }[f] || 'Monthly';
}
function scheduleDesc(sch) {
  const f = sch.frequency || 'monthly';
  const t = fmtTime(sch.hour ?? 8, sch.minute ?? 0);
  if (f === 'weekly')   return `Every ${DOW_LABELS[sch.dayOfWeek ?? 1]} at ${t} MYT`;
  if (f === 'biweekly') {
    const d = Math.min(sch.dayOfMonth ?? 5, 14);
    return `${ordinal(d)} & ${ordinal(d + 14)} of month at ${t} MYT`;
  }
  return `${ordinal(sch.dayOfMonth ?? 5)} of month at ${t} MYT`;
}
function periodDesc(f) {
  return { monthly: 'Full previous month', biweekly: 'Last 14 days', weekly: 'Last 7 days' }[f] || 'Full previous month';
}
function freqColor(f) {
  return { monthly: '#32cd32', biweekly: '#4aade8', weekly: '#f5a623' }[f] || '#32cd32';
}

// ── Mini time picker ────────────────────────────────────────────────────────────
function TimePicker({ hour, minute, onHour, onMinute, small }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select className="form-input" value={hour} onChange={e => onHour(parseInt(e.target.value))} style={small ? { width: 72 } : {}}>
        {HOUR_OPTIONS.map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}
      </select>
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>:</span>
      <select className="form-input" value={minute} onChange={e => onMinute(parseInt(e.target.value))} style={small ? { width: 68 } : {}}>
        {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
      </select>
    </div>
  );
}

// ── Schedule config fields (shared by modal + inline edit) ──────────────────────
function ScheduleFields({ frequency, setFrequency, dayOfMonth, setDayOfMonth, dayOfWeek, setDayOfWeek, hour, setHour, minute, setMinute }) {
  return (
    <>
      {/* Frequency tabs */}
      <div style={{ marginBottom: 20 }}>
        <div className="form-label" style={{ marginBottom: 8 }}>Recurrence</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['monthly','biweekly','weekly'].map(f => (
            <button key={f} type="button"
              className={`btn btn-sm ${frequency === f ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFrequency(f)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {freqLabel(f)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Day picker */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">{frequency === 'weekly' ? 'Day of Week' : 'Day of Month'}</label>
          {frequency === 'weekly' ? (
            <select className="form-input" value={dayOfWeek} onChange={e => setDayOfWeek(parseInt(e.target.value))}>
              {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          ) : (
            <select className="form-input" value={dayOfMonth} onChange={e => setDayOfMonth(parseInt(e.target.value))}>
              {(frequency === 'biweekly' ? BIWEEKLY_DAYS : MONTH_DAYS).map(d => (
                <option key={d} value={d}>
                  {ordinal(d)}{frequency === 'biweekly' ? ` & ${ordinal(d + 14)}` : ''}{d === 5 && frequency === 'monthly' ? ' (recommended)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Time picker */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Time (MYT)</label>
          <TimePicker hour={hour} minute={minute} onHour={setHour} onMinute={setMinute} />
        </div>
      </div>

      {/* Preview box */}
      <div style={ms.preview}>
        <div style={ms.previewTitle}>Preview</div>
        <div style={ms.previewRow}>
          <span>Runs</span>
          <span>{scheduleDesc({ frequency, dayOfMonth: Math.min(dayOfMonth, frequency === 'biweekly' ? 14 : 28), dayOfWeek, hour, minute })}</span>
        </div>
        <div style={ms.previewRow}>
          <span>Report covers</span>
          <span style={{ color: freqColor(frequency), fontWeight: 600 }}>{periodDesc(frequency)}</span>
        </div>
        <div style={ms.previewRow}>
          <span>Timezone</span>
          <span>Asia/Kuala_Lumpur (MYT)</span>
        </div>
      </div>
    </>
  );
}

// ── Create modal ────────────────────────────────────────────────────────────────
function ScheduleModal({ clients, schedules, onClose, onSaved }) {
  const toast = useToast();
  const [clientId,   setClientId]   = useState('');
  const [frequency,  setFrequency]  = useState('monthly');
  const [dayOfMonth, setDayOfMonth] = useState(5);
  const [dayOfWeek,  setDayOfWeek]  = useState(1); // Monday
  const [hour,       setHour]       = useState(8);
  const [minute,     setMinute]     = useState(0);
  const [saving,     setSaving]     = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!clientId) return toast('Select a client.', 'error');
    setSaving(true);
    try {
      await schedulesAPI.create({ clientId, frequency, dayOfMonth, dayOfWeek, hour, minute, active: true });
      toast('Schedule created!', 'success');
      onSaved();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create schedule.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass" style={{ maxWidth: 520 }}>
        <div style={ms.header}>
          <h2 style={ms.title}>New Auto Schedule</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {clients.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '12px 0' }}>
            No clients found. Add a client first.
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="form-group">
              <label className="form-label">Client</label>
              <select className="form-input" value={clientId} onChange={e => setClientId(e.target.value)} required>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.clientCode} — {c.name}</option>)}
              </select>
            </div>

            <ScheduleFields
              frequency={frequency}   setFrequency={setFrequency}
              dayOfMonth={dayOfMonth} setDayOfMonth={setDayOfMonth}
              dayOfWeek={dayOfWeek}   setDayOfWeek={setDayOfWeek}
              hour={hour}             setHour={setHour}
              minute={minute}         setMinute={setMinute}
            />

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

// ── Main page ───────────────────────────────────────────────────────────────────
export default function Schedules() {
  const toast = useToast();
  const [clients,   setClients]   = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [editing,   setEditing]   = useState(null);

  const load = async () => {
    const [c, s] = await Promise.all([clientsAPI.list(), schedulesAPI.list()]);
    setClients(c); setSchedules(s); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const getClientName = (clientId) => {
    const c = clients.find(c => c.id === clientId);
    return c ? `${c.clientCode} — ${c.name}` : clientId;
  };

  const toggleActive = async (sch) => {
    await schedulesAPI.update(sch.id, { active: !sch.active });
    toast(sch.active ? 'Schedule paused.' : 'Schedule activated.', 'success');
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this schedule? The client will no longer auto-generate.')) return;
    await schedulesAPI.delete(id);
    toast('Schedule removed.', 'success');
    load();
  };

  const startEdit = (sch) => setEditing({
    id:        sch.id,
    frequency:  sch.frequency  || 'monthly',
    dayOfMonth: sch.dayOfMonth || 5,
    dayOfWeek:  sch.dayOfWeek  ?? 1,
    hour:       sch.hour       ?? 8,
    minute:     sch.minute     ?? 0,
  });

  const saveEdit = async () => {
    await schedulesAPI.update(editing.id, {
      frequency:  editing.frequency,
      dayOfMonth: editing.dayOfMonth,
      dayOfWeek:  editing.dayOfWeek,
      hour:       editing.hour,
      minute:     editing.minute,
    });
    toast('Schedule updated.', 'success');
    setEditing(null);
    load();
  };

  return (
    <div style={s.page} className="fade-up">
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Auto Schedules</h1>
          <p style={s.sub}>Set recurring report generation per client</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ New Schedule</button>
      </div>

      {/* Info strip */}
      <div className="glass" style={s.infoStrip}>
        <span style={s.infoIcon}>◷</span>
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-primary)' }}>How auto-scheduling works: </strong>
          <span style={{ color: 'var(--text-muted)' }}>
            The server calls Meta API on your chosen schedule (MYT timezone) and generates a report covering the selected period. Reports appear in History automatically.
          </span>
        </div>
      </div>

      {/* Period legend */}
      <div style={s.legend}>
        {[
          { f: 'monthly',  label: 'Monthly',  desc: 'Full previous calendar month' },
          { f: 'biweekly', label: 'Biweekly', desc: 'Last 14 days from run date' },
          { f: 'weekly',   label: 'Weekly',   desc: 'Last 7 days from run date' },
        ].map(({ f, label, desc }) => (
          <div key={f} style={{ ...s.legendItem, borderColor: freqColor(f) + '44' }}>
            <div style={{ ...s.legendDot, background: freqColor(f) }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: freqColor(f) }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
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
                <th>Frequency</th>
                <th>Schedule</th>
                <th>Report Covers</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(sch => {
                const f = sch.frequency || 'monthly';
                const isEditing = editing?.id === sch.id;
                return (
                  <tr key={sch.id}>
                    <td>
                      <div style={s.clientCell}>
                        <span style={s.codeTag}>{sch.clientCode}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {getClientName(sch.clientId).split('— ')[1]}
                        </span>
                      </div>
                    </td>

                    {isEditing ? (
                      /* ── Inline edit spans 4 columns ── */
                      <td colSpan={4} style={{ padding: '16px 14px' }}>
                        <ScheduleFields
                          frequency={editing.frequency}   setFrequency={v => setEditing(e => ({ ...e, frequency: v }))}
                          dayOfMonth={editing.dayOfMonth} setDayOfMonth={v => setEditing(e => ({ ...e, dayOfMonth: v }))}
                          dayOfWeek={editing.dayOfWeek}   setDayOfWeek={v => setEditing(e => ({ ...e, dayOfWeek: v }))}
                          hour={editing.hour}             setHour={v => setEditing(e => ({ ...e, hour: v }))}
                          minute={editing.minute}         setMinute={v => setEditing(e => ({ ...e, minute: v }))}
                        />
                      </td>
                    ) : (
                      <>
                        <td>
                          <span style={{ ...s.freqBadge, color: freqColor(f), borderColor: freqColor(f) + '44', background: freqColor(f) + '15' }}>
                            {freqLabel(f)}
                          </span>
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          {scheduleDesc(sch)}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {periodDesc(f)}
                        </td>
                      </>
                    )}

                    <td>
                      {!isEditing && (
                        <span className={`badge ${sch.active ? 'badge-green' : 'badge-dim'}`}>
                          {sch.active ? '● Active' : '○ Paused'}
                        </span>
                      )}
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {isEditing ? (
                          <>
                            <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => startEdit(sch)}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(sch)}>
                              {sch.active ? 'Pause' : 'Resume'}
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(sch.id)}>Remove</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Calendar — monthly only */}
      {schedules.some(s => (s.frequency || 'monthly') === 'monthly' && s.active) && (
        <div style={s.calSection}>
          <h2 style={s.calTitle}>Monthly Run Calendar</h2>
          <div style={s.calGrid}>
            {MONTH_DAYS.map(day => {
              const hits = schedules.filter(s => (s.frequency || 'monthly') === 'monthly' && s.dayOfMonth === day && s.active);
              return (
                <div key={day} style={{ ...s.calDay, ...(hits.length > 0 ? s.calDayActive : {}) }}>
                  <div style={s.calDayNum}>{day}</div>
                  {hits.map(h => (
                    <div key={h.id} style={s.calTag}>
                      <div>{h.clientCode}</div>
                      <div style={{ fontSize: 9, opacity: 0.75 }}>{fmtTime(h.hour ?? 8, h.minute ?? 0)}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly / biweekly summary */}
      {schedules.some(s => ['weekly','biweekly'].includes(s.frequency) && s.active) && (
        <div style={s.calSection}>
          <h2 style={s.calTitle}>Weekly / Biweekly Schedules</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {schedules.filter(s => ['weekly','biweekly'].includes(s.frequency) && s.active).map(sch => (
              <div key={sch.id} className="glass" style={s.weekCard}>
                <span style={{ ...s.freqBadge, color: freqColor(sch.frequency), borderColor: freqColor(sch.frequency) + '44', background: freqColor(sch.frequency) + '15', marginBottom: 8 }}>
                  {freqLabel(sch.frequency)}
                </span>
                <div style={{ fontWeight: 700, color: '#32cd32', fontSize: 13, marginBottom: 4 }}>{sch.clientCode}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{scheduleDesc(sch)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{periodDesc(sch.frequency)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <ScheduleModal
          clients={clients} schedules={schedules}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); load(); }}
        />
      )}
    </div>
  );
}

const s = {
  page: { padding: '32px 36px', maxWidth: 1200 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 },
  sub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  infoStrip: { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 20px', marginBottom: 16 },
  infoIcon: { fontSize: 22, color: '#32cd32', flexShrink: 0, marginTop: 2 },
  legend: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, border: '1px solid', background: 'var(--glass-bg)' },
  legendDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  tableWrap: { overflow: 'hidden', marginBottom: 28 },
  loading: { padding: 48, display: 'flex', justifyContent: 'center' },
  empty: { padding: 56, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 },
  clientCell: { display: 'flex', alignItems: 'center', gap: 10 },
  codeTag: { background: 'rgba(50,205,50,0.12)', color: '#32cd32', border: '1px solid rgba(50,205,50,0.25)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 },
  freqBadge: { display: 'inline-block', borderRadius: 6, border: '1px solid', padding: '3px 10px', fontSize: 11, fontWeight: 700 },
  calSection: { marginTop: 8, marginBottom: 28 },
  calTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 },
  calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 },
  calDay: { background: 'var(--glass-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 8px', minHeight: 60, display: 'flex', flexDirection: 'column', gap: 4 },
  calDayActive: { background: 'rgba(50,205,50,0.07)', border: '1px solid rgba(50,205,50,0.25)' },
  calDayNum: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' },
  calTag: { background: 'rgba(50,205,50,0.18)', color: '#32cd32', borderRadius: 4, padding: '3px 6px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 },
  weekCard: { padding: '16px 20px', display: 'flex', flexDirection: 'column', minWidth: 200 },
};

const ms = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  title: { fontSize: 19, fontWeight: 800, color: 'var(--text-primary)' },
  preview: { background: 'rgba(50,205,50,0.06)', border: '1px solid rgba(50,205,50,0.15)', borderRadius: 8, padding: '14px 16px' },
  previewTitle: { fontSize: 11, fontWeight: 700, color: '#32cd32', marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' },
  previewRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 },
};
