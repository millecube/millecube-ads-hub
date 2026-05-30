import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { compareAPI, clientsAPI, performanceAPI } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtRM   = v  => v > 0 ? `RM ${v.toFixed(2)}` : '—';
const fmtPct  = v  => v !== null && v !== undefined ? `${v.toFixed(2)}%` : '—';
const fmtNum  = v  => v > 0 ? Math.round(v).toLocaleString() : '—';

const PERIOD_OPTIONS = [
  { value: 'today',      label: 'Today' },
  { value: 'yesterday',  label: 'Yesterday' },
  { value: '7d',         label: 'Last 7 Days' },
  { value: '14d',        label: 'Last 14 Days' },
  { value: '30d',        label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
];

const LEVEL_OPTIONS = ['campaign', 'adset', 'ad'];

const BADGE_META = {
  SCALE:   { color: '#32cd32',  bg: 'rgba(50,205,50,0.15)',   label: 'SCALE'   },
  KEEP:    { color: '#888',     bg: 'rgba(136,136,136,0.12)', label: 'KEEP'    },
  WATCH:   { color: '#f0a500',  bg: 'rgba(240,165,0,0.15)',   label: 'WATCH'   },
  PAUSE:   { color: '#ff4d4d',  bg: 'rgba(255,77,77,0.15)',   label: 'PAUSE'   },
  REFRESH: { color: '#ff8c00',  bg: 'rgba(255,140,0,0.15)',   label: 'REFRESH' },
};

function getDeltaColor(delta, lowerIsBetter) {
  if (delta === null || delta === undefined) return { color: 'var(--text-dim)', arrow: '—' };
  const isGood = lowerIsBetter ? delta < 0 : delta > 0;
  const magnitude = Math.abs(delta);
  if (isGood && magnitude > 2)  return { color: '#32cd32', arrow: lowerIsBetter ? '↓' : '↑' };
  if (!isGood && magnitude > 10) return { color: '#ff4d4d', arrow: lowerIsBetter ? '↑' : '↓' };
  if (magnitude <= 2)            return { color: 'rgba(232,245,233,0.3)', arrow: '→' };
  return { color: '#f0a500', arrow: !isGood ? (lowerIsBetter ? '↑' : '↓') : (lowerIsBetter ? '↓' : '↑') };
}

function healthDot(score) {
  if (score >= 75) return '#32cd32';
  if (score >= 55) return '#f0a500';
  if (score >= 35) return '#ff8c00';
  return '#ff4d4d';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DeltaCell({ curr, delta, format, lowerIsBetter }) {
  const { color, arrow } = getDeltaColor(delta, lowerIsBetter);
  const sign = delta > 0 ? '+' : '';
  return (
    <td style={tds.metricCell}>
      <div style={tds.currVal}>{curr !== null && curr !== undefined ? format(curr) : '—'}</div>
      {delta !== null && delta !== undefined ? (
        <div style={{ fontSize: 10, color, marginTop: 1 }}>
          {arrow} {sign}{delta.toFixed(1)}%
        </div>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>no prev data</div>
      )}
    </td>
  );
}

function ToggleBtn({ row, clientId, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const isActive = row.status === 'ACTIVE';

  const handle = async () => {
    setBusy(true);
    try {
      await performanceAPI.toggle({ clientId, objectId: row.id, status: isActive ? 'PAUSED' : 'ACTIVE' });
      toast(isActive ? `Paused: ${row.name}` : `Enabled: ${row.name}`, 'success');
      onDone();
    } catch (err) {
      toast(err.response?.data?.error || 'Toggle failed', 'error');
    } finally { setBusy(false); }
  };

  return (
    <motion.button
      onClick={handle} disabled={busy}
      whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
      transition={{ duration: 0.13 }}
      style={{
        width: 34, height: 20, borderRadius: 10,
        background: isActive ? '#32cd32' : 'rgba(50,205,50,0.15)',
        border: `1.5px solid ${isActive ? '#32cd32' : 'rgba(50,205,50,0.3)'}`,
        cursor: busy ? 'wait' : 'pointer', padding: 0, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        justifyContent: isActive ? 'flex-end' : 'flex-start',
        paddingLeft: isActive ? 0 : 3, paddingRight: isActive ? 3 : 0,
        transition: 'background 0.2s, border-color 0.2s',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: isActive ? '#07503c' : 'rgba(50,205,50,0.5)' }} />
    </motion.button>
  );
}

function BudgetChip({ row, onEdit }) {
  if (!row.budget || (row.level !== 'campaign' && row.level !== 'adset')) return null;
  return (
    <motion.button
      onClick={() => onEdit(row)}
      whileHover={{ scale: 1.04, borderColor: '#32cd32' }}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.13 }}
      style={{
        fontSize: 10, color: 'var(--text-secondary)', borderRadius: 4,
        border: '1px solid rgba(50,205,50,0.18)', background: 'rgba(50,205,50,0.05)',
        padding: '2px 6px', cursor: 'pointer', whiteSpace: 'nowrap', marginTop: 3,
      }}
    >
      {row.budget.type === 'daily' ? '📅' : '📆'} RM {row.budget.amount.toFixed(0)}/
      {row.budget.type === 'daily' ? 'day' : 'ltm'}
    </motion.button>
  );
}

// ── Health Weights Modal ──────────────────────────────────────────────────────

function WeightsModal({ onClose, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    compareAPI.getSettings().then(r => {
      setSettings(r.settings);
      const d = {};
      r.settings.forEach(s => { d[s.id] = { ...s.weights }; });
      setDrafts(d);
    }).finally(() => setLoading(false));
  }, []);

  const setW = (clientId, key, val) => {
    setDrafts(p => ({ ...p, [clientId]: { ...p[clientId], [key]: Number(val) } }));
  };

  const total = (clientId) => Object.values(drafts[clientId] || {}).reduce((s, v) => s + Number(v), 0);

  const handleSave = (clientId) => {
    const t = total(clientId);
    if (Math.abs(t - 100) > 1) return toast(`Weights must sum to 100 (currently ${t})`, 'error');
    setConfirm(clientId);
  };

  const confirmSave = async () => {
    setSaving(confirm);
    try {
      await compareAPI.saveSettings(confirm, drafts[confirm]);
      toast('Health weights saved.', 'success');
      setConfirm(null);
      onSaved();
    } catch (err) {
      toast(err.response?.data?.error || 'Save failed', 'error');
    } finally { setSaving(null); }
  };

  const WEIGHT_KEYS = [
    { key: 'costPerResult', label: 'Cost / Result', hint: 'Lower is better' },
    { key: 'results',       label: 'Results Volume', hint: 'Higher is better' },
    { key: 'ctr',           label: 'CTR',             hint: 'Higher is better' },
    { key: 'cpm',           label: 'CPM',             hint: 'Lower is better' },
    { key: 'frequency',     label: 'Frequency',       hint: 'Lower is better' },
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass" style={{ maxWidth: 640, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>⚖️ Health Score Weights</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Adjust how much each metric contributes to the health score. Weights must sum to 100.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {settings.map(s => {
              const d = drafts[s.id] || s.weights;
              const t = total(s.id);
              const valid = Math.abs(t - 100) <= 1;
              return (
                <div key={s.id} style={{ borderRadius: 10, border: '1px solid rgba(50,205,50,0.12)', padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{s.clientCode}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: valid ? '#32cd32' : '#ff4d4d' }}>
                      Total: {t}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {WEIGHT_KEYS.map(({ key, label, hint }) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 130, flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{hint}</div>
                        </div>
                        <input
                          type="range" min={0} max={100} step={5}
                          value={d[key] || 0}
                          onChange={e => setW(s.id, key, e.target.value)}
                          disabled={!isAdmin}
                          style={{ flex: 1, accentColor: '#32cd32' }}
                        />
                        <div style={{ width: 36, textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#32cd32' }}>
                          {d[key] || 0}
                        </div>
                      </div>
                    ))}
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSave(s.id)}
                        disabled={!valid || saving === s.id}
                      >
                        {saving === s.id ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : 'Apply'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Reconfirm dialog */}
        <AnimatePresence>
          {confirm && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="glass" style={{ padding: '28px 32px', borderRadius: 14, textAlign: 'center', maxWidth: 340 }}
              >
                <div style={{ fontSize: 32, marginBottom: 12 }}>⚖️</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>Confirm Weight Change</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                  This will update the health score formula for <strong style={{ color: 'var(--text-primary)' }}>
                    {settings.find(s => s.id === confirm)?.name}
                  </strong>. New weights will apply on next data fetch.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={confirmSave} disabled={!!saving}>
                    {saving ? 'Saving…' : 'Confirm & Save'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Colour Guide Modal ────────────────────────────────────────────────────────

function ColourGuide({ onClose }) {
  const rules = [
    { color: '#32cd32', label: 'Green', desc: 'Positive change (>2%) in the right direction — metric improving' },
    { color: '#ff4d4d', label: 'Red',   desc: 'Negative change (>10%) in the wrong direction, or metric above threshold' },
    { color: '#f0a500', label: 'Yellow', desc: 'Minor negative change (2–10%) — monitor closely' },
    { color: 'rgba(232,245,233,0.3)', label: 'Grey', desc: 'Flat change (≤2%) or no previous period data available' },
  ];
  const badges = [
    { ...BADGE_META.SCALE,   desc: 'Health ≥75, 3+ green signals — ready to increase budget' },
    { ...BADGE_META.KEEP,    desc: 'Stable performance, no action needed' },
    { ...BADGE_META.WATCH,   desc: 'Mixed signals — check again in 2–3 days' },
    { ...BADGE_META.PAUSE,   desc: 'Health <35 or 2+ red signals — consider pausing' },
    { ...BADGE_META.REFRESH, desc: 'High frequency — creative fatigue, refresh ad creative' },
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass" style={{ maxWidth: 480, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>🎨 Delta Colour Guide</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={gs.sectionLabel}>Delta Arrow Colours</div>
          {rules.map(r => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color, flexShrink: 0, marginTop: 3 }} />
              <div>
                <span style={{ fontWeight: 700, fontSize: 12, color: r.color }}>{r.label}: </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div style={gs.sectionLabel}>Recommendation Badges</div>
          {badges.map(b => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, color: b.color, background: b.bg,
                borderRadius: 4, padding: '2px 6px', flexShrink: 0, marginTop: 1,
              }}>{b.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.desc}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 8, background: 'rgba(50,205,50,0.06)', border: '1px solid rgba(50,205,50,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#32cd32', marginBottom: 6 }}>Health Score (0–100)</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[['75–100', '#32cd32', 'Strong'], ['55–74', '#f0a500', 'OK'], ['35–54', '#ff8c00', 'Weak'], ['0–34', '#ff4d4d', 'Critical']].map(([range, color, label]) => (
              <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color, fontSize: 12 }}>●</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{range} — {label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Budget Edit Modal ─────────────────────────────────────────────────────────

function BudgetEditModal({ row, clientId, onClose, onSaved }) {
  const toast = useToast();
  const [amount, setAmount] = useState(row.budget?.amount?.toFixed(2) || '');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) return toast('Enter a valid amount', 'error');
    setSaving(true);
    try {
      await compareAPI.updateBudget({ clientId, objectId: row.id, budgetType: row.budget.type, budgetAmount: val });
      toast('Budget updated.', 'success');
      onSaved();
    } catch (err) {
      toast(err.response?.data?.error || 'Update failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass" style={{ maxWidth: 380, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Edit Budget</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          {row.level === 'campaign' ? '📢' : '🎯'} <strong style={{ color: 'var(--text-secondary)' }}>{row.name}</strong>
          <br />{row.budget.type === 'daily' ? 'Daily Budget' : 'Lifetime Budget'}
        </p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Budget Amount (RM)</label>
            <input className="form-input" type="number" min="1" step="0.01"
              value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Saving…</> : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const SORT_DEFAULTS = { col: 'healthScore', dir: 'asc' };

export default function CompareMonitor() {
  const toast = useToast();
  const { user } = useAuth();

  const [clients,     setClients]     = useState([]);
  const [clientId,    setClientId]    = useState(() => localStorage.getItem('cm_clientId') || '');
  const [period,      setPeriod]      = useState(() => localStorage.getItem('cm_period') || '7d');
  const [level,       setLevel]       = useState(() => localStorage.getItem('cm_level') || 'campaign');
  const [rows,        setRows]        = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  // Filters
  const [quickChip,   setQuickChip]   = useState('all');
  const [search,      setSearch]      = useState('');
  const [statusFlt,   setStatusFlt]   = useState('all');   // all | active | paused
  const [minSpend,    setMinSpend]    = useState('');
  const [badgeFlt,    setBadgeFlt]    = useState('all');   // all | SCALE | KEEP | WATCH | PAUSE | REFRESH

  // Sort
  const [sort, setSort] = useState(SORT_DEFAULTS);

  // Selection
  const [selected, setSelected] = useState(new Set());

  // Modals
  const [showWeights,     setShowWeights]     = useState(false);
  const [showGuide,       setShowGuide]       = useState(false);
  const [editBudget,      setEditBudget]      = useState(null);
  const [bulkAction,      setBulkAction]      = useState(null); // 'pause' | 'enable'
  const [bulkBusy,        setBulkBusy]        = useState(false);

  // Load clients
  useEffect(() => {
    clientsAPI.getAssigned().then(list => {
      setClients(list);
      if (!clientId && list.length > 0) setClientId(list[0].id);
    });
  }, []);

  // Persist prefs
  useEffect(() => { if (clientId) localStorage.setItem('cm_clientId', clientId); }, [clientId]);
  useEffect(() => { localStorage.setItem('cm_period', period); }, [period]);
  useEffect(() => { localStorage.setItem('cm_level', level); }, [level]);

  const fetchData = useCallback(async (force = false) => {
    if (!clientId) return;
    setLoading(true); setError(null);
    try {
      const res = await compareAPI.fetch({ clientId, range: period, level });
      setRows(res.rows || []);
      setMeta(res);
      setSelected(new Set());
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setLoading(false); }
  }, [clientId, period, level]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Filtering ────────────────────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    let r = [...rows];

    if (quickChip === 'pause')   r = r.filter(x => x.badge === 'PAUSE');
    else if (quickChip === 'scale')  r = r.filter(x => x.badge === 'SCALE');
    else if (quickChip === 'watch')  r = r.filter(x => ['WATCH', 'REFRESH'].includes(x.badge));
    else if (quickChip === 'off')    r = r.filter(x => x.status === 'PAUSED');
    else if (quickChip === 'fatigue') r = r.filter(x => x.badge === 'REFRESH');

    if (search)    r = r.filter(x => x.name?.toLowerCase().includes(search.toLowerCase()) || x.parentName?.toLowerCase().includes(search.toLowerCase()));
    if (statusFlt !== 'all') r = r.filter(x => x.status === (statusFlt === 'active' ? 'ACTIVE' : 'PAUSED'));
    if (minSpend)  r = r.filter(x => x.curr.spend >= parseFloat(minSpend));
    if (badgeFlt !== 'all') r = r.filter(x => x.badge === badgeFlt);

    // Sort
    if (sort.col) {
      r.sort((a, b) => {
        let av, bv;
        const getVal = (row) => {
          if (sort.col === 'name')          return row.name?.toLowerCase() || '';
          if (sort.col === 'healthScore')   return row.healthScore || 0;
          if (sort.col === 'badge')         return ['PAUSE','REFRESH','WATCH','KEEP','SCALE'].indexOf(row.badge);
          if (sort.col === 'status')        return row.status === 'ACTIVE' ? 0 : 1;
          if (sort.col === 'budget')        return row.budget?.amount || 0;
          const [group, key] = sort.col.split('.');
          if (group === 'curr')   return row.curr?.[key] || 0;
          if (group === 'delta')  return row.deltas?.[key] ?? -9999;
          return 0;
        };
        av = getVal(a); bv = getVal(b);
        if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        return sort.dir === 'asc' ? av - bv : bv - av;
      });
    }

    return r;
  }, [rows, quickChip, search, statusFlt, minSpend, badgeFlt, sort]);

  // ── Sort handler ─────────────────────────────────────────────────────────────

  const handleSort = (col) => {
    setSort(prev => {
      if (prev.col === col) return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { col, dir: 'asc' };
    });
  };

  const SortIcon = ({ col }) => {
    if (sort.col !== col) return <span style={{ opacity: 0.25, fontSize: 9, marginLeft: 3 }}>▲▼</span>;
    return <span style={{ fontSize: 9, color: '#32cd32', marginLeft: 3 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>;
  };

  // ── Selection ────────────────────────────────────────────────────────────────

  const allSelected = filteredRows.length > 0 && filteredRows.every(r => selected.has(r.id));
  const toggleAll   = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filteredRows.map(r => r.id)));
  };
  const toggleRow = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Bulk actions ─────────────────────────────────────────────────────────────

  const executeBulk = async () => {
    setBulkBusy(true);
    const targetStatus = bulkAction === 'pause' ? 'PAUSED' : 'ACTIVE';
    const targetRows = filteredRows.filter(r => selected.has(r.id));
    let ok = 0, fail = 0;
    for (const r of targetRows) {
      try {
        await performanceAPI.toggle({ clientId, objectId: r.id, status: targetStatus });
        ok++;
      } catch { fail++; }
    }
    setBulkBusy(false);
    setBulkAction(null);
    setSelected(new Set());
    toast(`Done — ${ok} updated${fail > 0 ? `, ${fail} failed` : ''}`, ok > 0 ? 'success' : 'error');
    fetchData();
  };

  // ── Quick chip counts ─────────────────────────────────────────────────────────

  const chipCounts = useMemo(() => ({
    pause:   rows.filter(r => r.badge === 'PAUSE').length,
    scale:   rows.filter(r => r.badge === 'SCALE').length,
    watch:   rows.filter(r => ['WATCH', 'REFRESH'].includes(r.badge)).length,
    fatigue: rows.filter(r => r.badge === 'REFRESH').length,
    off:     rows.filter(r => r.status === 'PAUSED').length,
  }), [rows]);

  const activeFiltersCount = [search, statusFlt !== 'all', minSpend, badgeFlt !== 'all'].filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────────

  const selectedCount = selected.size;
  const currentClient = clients.find(c => c.id === clientId);

  const Th = ({ col, children, style: sx }) => (
    <th onClick={() => handleSort(col)} style={{ ...tds.th, cursor: 'pointer', userSelect: 'none', ...sx }}>
      {children}<SortIcon col={col} />
    </th>
  );

  return (
    <div style={s.page} className="page-wrap fade-up">
      {/* Header */}
      <div style={s.header} className="page-header">
        <div>
          <h1 style={s.title}>Monitor</h1>
          <p style={s.sub}>
            Period-over-period comparison
            {meta && (
              <span style={{ marginLeft: 8, color: 'var(--text-dim)', fontSize: 11 }}>
                · {meta.dateStart} → {meta.dateStop}
                &nbsp;vs&nbsp;
                {meta.prevDateStart} → {meta.prevDateStop}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowGuide(true)}>🎨 Colour Guide</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowWeights(true)}>⚖️ Health Weights</button>
          <button className="btn btn-ghost btn-sm" onClick={() => fetchData(true)} disabled={loading}>
            {loading ? <div className="spinner" style={{ width: 13, height: 13 }} /> : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* Controls row */}
      <div style={s.controls} className="glass">
        {/* Client */}
        <div style={s.controlGroup}>
          <label style={s.controlLabel}>Client</label>
          <select className="form-input" style={s.controlSelect}
            value={clientId} onChange={e => setClientId(e.target.value)}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Period */}
        <div style={s.controlGroup}>
          <label style={s.controlLabel}>Period</label>
          <select className="form-input" style={s.controlSelect}
            value={period} onChange={e => setPeriod(e.target.value)}>
            {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Level */}
        <div style={s.controlGroup}>
          <label style={s.controlLabel}>Level</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {LEVEL_OPTIONS.map(l => (
              <button key={l} className={`btn btn-sm ${level === l ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setLevel(l)} style={{ textTransform: 'capitalize', minWidth: 64 }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick chips */}
      <div style={s.chips}>
        {[
          { id: 'all',    label: `All (${rows.length})` },
          { id: 'pause',  label: `🔴 Pause Candidates (${chipCounts.pause})` },
          { id: 'scale',  label: `🟢 Scale Opportunities (${chipCounts.scale})` },
          { id: 'watch',  label: `🟡 Watch List (${chipCounts.watch})` },
          { id: 'fatigue',label: `🟠 Creative Fatigue (${chipCounts.fatigue})` },
          { id: 'off',    label: `⏸ Currently Off (${chipCounts.off})` },
        ].map(chip => (
          <motion.button key={chip.id}
            onClick={() => setQuickChip(chip.id)}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.13 }}
            style={{
              ...s.chip,
              background: quickChip === chip.id ? 'rgba(50,205,50,0.18)' : 'rgba(50,205,50,0.06)',
              border: `1px solid ${quickChip === chip.id ? 'rgba(50,205,50,0.55)' : 'rgba(50,205,50,0.15)'}`,
              color: quickChip === chip.id ? '#32cd32' : 'var(--text-secondary)',
              fontWeight: quickChip === chip.id ? 700 : 500,
            }}
          >
            {chip.label}
          </motion.button>
        ))}
      </div>

      {/* Filter row */}
      <div style={s.filterRow} className="glass">
        <input className="form-input" placeholder="🔍 Search name…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 140, fontSize: 12 }} />
        <select className="form-input" value={statusFlt} onChange={e => setStatusFlt(e.target.value)}
          style={{ width: 120, fontSize: 12 }}>
          <option value="all">All Status</option>
          <option value="active">Active only</option>
          <option value="paused">Paused only</option>
        </select>
        <select className="form-input" value={badgeFlt} onChange={e => setBadgeFlt(e.target.value)}
          style={{ width: 120, fontSize: 12 }}>
          <option value="all">All Badges</option>
          {Object.keys(BADGE_META).map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <input className="form-input" placeholder="Min Spend (RM)" type="number" min="0"
          value={minSpend} onChange={e => setMinSpend(e.target.value)}
          style={{ width: 130, fontSize: 12 }} />
        {activeFiltersCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStatusFlt('all'); setMinSpend(''); setBadgeFlt('all'); }}>
            ✕ Clear ({activeFiltersCount})
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={s.bulkBar} className="glass">
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {selectedCount} selected
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setBulkAction('pause')}>
                ⏸ Pause All
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setBulkAction('enable')}>
                ▶ Enable All
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
                ✕ Deselect
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="glass table-scroll-wrap" style={s.tableWrap}>
        {loading ? (
          <div style={s.center}><div className="spinner" /></div>
        ) : error ? (
          <div style={s.center}>
            <div style={{ color: '#ff4d4d', marginBottom: 10 }}>⚠ {error}</div>
            <button className="btn btn-ghost btn-sm" onClick={fetchData}>Retry</button>
          </div>
        ) : !clientId ? (
          <div style={s.center}>Select a client to start monitoring.</div>
        ) : filteredRows.length === 0 ? (
          <div style={s.center}>No data matches your filters.</div>
        ) : (
          <table className="data-table" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ width: 36, padding: '10px 8px' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    style={{ accentColor: '#32cd32', cursor: 'pointer' }} />
                </th>
                <Th col="name" style={{ minWidth: 200 }}>Name</Th>
                <Th col="status" style={{ width: 80 }}>Status</Th>
                <Th col="budget" style={{ width: 110 }}>Budget</Th>
                <Th col="curr.spend" style={{ width: 110 }}>Spend</Th>
                <Th col="curr.results" style={{ width: 100 }}>Results</Th>
                <Th col="curr.ctr" style={{ width: 90 }}>CTR</Th>
                <Th col="curr.cpm" style={{ width: 90 }}>CPM</Th>
                <Th col="curr.frequency" style={{ width: 90 }}>Freq</Th>
                <Th col="curr.costPerResult" style={{ width: 120 }}>Cost/Result</Th>
                <Th col="healthScore" style={{ width: 80 }}>Health</Th>
                <Th col="badge" style={{ width: 90 }}>Badge</Th>
                <th style={tds.th}>On/Off</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => {
                const isSelected = selected.has(row.id);
                const bm = BADGE_META[row.badge] || BADGE_META.KEEP;

                return (
                  <tr key={row.id} style={{ background: isSelected ? 'rgba(50,205,50,0.05)' : undefined }}>
                    <td style={{ padding: '10px 8px' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(row.id)}
                        style={{ accentColor: '#32cd32', cursor: 'pointer' }} />
                    </td>

                    {/* Name */}
                    <td style={tds.nameCell}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                        {row.name}
                      </div>
                      {row.parentName && (
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                          ↳ {row.parentName}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td style={tds.metricCell}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px',
                        background: row.status === 'ACTIVE' ? 'rgba(50,205,50,0.15)' : 'rgba(136,136,136,0.12)',
                        color: row.status === 'ACTIVE' ? '#32cd32' : '#888',
                      }}>
                        {row.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </td>

                    {/* Budget */}
                    <td style={tds.metricCell}>
                      {row.budget ? (
                        <BudgetChip row={row} onEdit={setEditBudget} />
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>
                      )}
                    </td>

                    {/* Metric deltas */}
                    <DeltaCell curr={row.curr.spend}         delta={row.deltas?.spend}         format={fmtRM}  lowerIsBetter={false} />
                    <DeltaCell curr={row.curr.results}       delta={row.deltas?.results}       format={fmtNum} lowerIsBetter={false} />
                    <DeltaCell curr={row.curr.ctr}           delta={row.deltas?.ctr}           format={fmtPct} lowerIsBetter={false} />
                    <DeltaCell curr={row.curr.cpm}           delta={row.deltas?.cpm}           format={fmtRM}  lowerIsBetter={true} />
                    <DeltaCell curr={row.curr.frequency}     delta={row.deltas?.frequency}     format={v => v.toFixed(2)} lowerIsBetter={true} />
                    <DeltaCell curr={row.curr.costPerResult} delta={row.deltas?.costPerResult} format={fmtRM}  lowerIsBetter={true} />

                    {/* Health score */}
                    <td style={tds.metricCell}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ color: healthDot(row.healthScore), fontSize: 8 }}>●</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: healthDot(row.healthScore) }}>
                          {row.healthScore}
                        </span>
                      </div>
                    </td>

                    {/* Badge */}
                    <td style={tds.metricCell}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
                        color: bm.color, background: bm.bg,
                        borderRadius: 4, padding: '3px 7px',
                      }}>
                        {bm.label}
                      </span>
                    </td>

                    {/* Toggle */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <ToggleBtn row={row} clientId={clientId} onDone={fetchData} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Row count */}
      {!loading && !error && filteredRows.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
          Showing {filteredRows.length} of {rows.length} {level}s
          {meta && <span> · Cached {meta.cachedAt ? new Date(meta.cachedAt).toLocaleTimeString() : '—'}</span>}
        </div>
      )}

      {/* Modals */}
      {showWeights && (
        <WeightsModal onClose={() => setShowWeights(false)} onSaved={fetchData} />
      )}
      {showGuide && (
        <ColourGuide onClose={() => setShowGuide(false)} />
      )}
      {editBudget && (
        <BudgetEditModal row={editBudget} clientId={clientId}
          onClose={() => setEditBudget(null)} onSaved={() => { setEditBudget(null); fetchData(); }} />
      )}

      {/* Bulk confirm */}
      <AnimatePresence>
        {bulkAction && (
          <div className="modal-overlay">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }} transition={{ duration: 0.18 }}
              className="modal-box glass" style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>
                {bulkAction === 'pause' ? '⏸' : '▶'}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                {bulkAction === 'pause' ? 'Pause' : 'Enable'} {selectedCount} {level}s?
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                This will {bulkAction === 'pause' ? 'pause' : 'enable'} all {selectedCount} selected {level}s via the Meta API.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-ghost" onClick={() => setBulkAction(null)} disabled={bulkBusy}>Cancel</button>
                <button className="btn btn-primary" onClick={executeBulk} disabled={bulkBusy}>
                  {bulkBusy ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Processing…</> : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page:       { padding: '32px 36px', maxWidth: 1400 },
  header:     { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  title:      { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 },
  sub:        { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  controls:   { display: 'flex', alignItems: 'flex-end', gap: 20, padding: '14px 18px', borderRadius: 12, marginBottom: 14, flexWrap: 'wrap' },
  controlGroup: { display: 'flex', flexDirection: 'column', gap: 5 },
  controlLabel: { fontSize: 10, fontWeight: 700, color: '#32cd32', letterSpacing: 1.2, textTransform: 'uppercase' },
  controlSelect: { fontSize: 13, padding: '6px 10px', height: 34 },
  chips:      { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip:       { padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: 'none' },
  filterRow:  { display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  bulkBar:    { display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10, marginBottom: 12, alignItems: 'center' },
  tableWrap:  { overflow: 'hidden', marginBottom: 8 },
  center:     { padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 },
};

const tds = {
  th:         { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 12px', whiteSpace: 'nowrap' },
  nameCell:   { padding: '10px 12px', maxWidth: 240, wordBreak: 'break-word' },
  metricCell: { padding: '10px 12px', whiteSpace: 'nowrap' },
  currVal:    { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
};

const gs = {
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#32cd32', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
};
