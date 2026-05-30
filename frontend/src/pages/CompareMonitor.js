import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { compareAPI, clientsAPI, performanceAPI } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtRM  = v => v > 0 ? `RM ${v.toFixed(2)}` : '—';
const fmtPct = v => v !== null && v !== undefined ? `${v.toFixed(2)}%` : '—';
const fmtNum = v => v > 0 ? Math.round(v).toLocaleString() : '—';

const PERIOD_OPTIONS = [
  { value: 'today',      label: 'Today' },
  { value: 'yesterday',  label: 'Yesterday' },
  { value: '7d',         label: 'Last 7 Days' },
  { value: '14d',        label: 'Last 14 Days' },
  { value: '30d',        label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
];

const LEVEL_TABS = [
  { value: 'campaign', label: 'Campaign', icon: '📢' },
  { value: 'adset',   label: 'Ad Set',   icon: '🎯' },
  { value: 'ad',      label: 'Ad',       icon: '🖼️' },
];

const BADGE_META = {
  SCALE:   { color: '#32cd32',  bg: 'rgba(50,205,50,0.15)',   label: 'SCALE'   },
  KEEP:    { color: '#888',     bg: 'rgba(136,136,136,0.12)', label: 'KEEP'    },
  WATCH:   { color: '#f0a500',  bg: 'rgba(240,165,0,0.15)',   label: 'WATCH'   },
  PAUSE:   { color: '#ff4d4d',  bg: 'rgba(255,77,77,0.15)',   label: 'PAUSE'   },
  REFRESH: { color: '#ff8c00',  bg: 'rgba(255,140,0,0.15)',   label: 'REFRESH' },
};

const WEIGHT_DEFAULTS = { costPerResult: 35, results: 25, ctr: 20, cpm: 10, frequency: 10 };

const DEFAULT_COLUMNS = [
  { key: 'status',        label: 'Status',      width: 80  },
  { key: 'budget',        label: 'Budget',       width: 110 },
  { key: 'spend',         label: 'Spend',        width: 100 },
  { key: 'results',       label: 'Results',      width: 100 },
  { key: 'ctr',           label: 'CTR',          width: 90  },
  { key: 'cpm',           label: 'CPM',          width: 90  },
  { key: 'frequency',     label: 'Freq',         width: 90  },
  { key: 'costPerResult', label: 'Cost/Result',  width: 120 },
  { key: 'health',        label: 'Health',       width: 80  },
  { key: 'badge',         label: 'Badge',        width: 90  },
  { key: 'toggle',        label: 'On/Off',       width: 70  },
];

function loadColConfig() {
  try {
    const saved = localStorage.getItem('cm_columns');
    if (!saved) return DEFAULT_COLUMNS.map(c => ({ ...c, on: true }));
    const parsed = JSON.parse(saved);
    const merged = DEFAULT_COLUMNS.map(d => ({ ...d, on: parsed.find(p => p.key === d.key)?.on ?? true }));
    const order = parsed.map(p => p.key);
    merged.sort((a, b) => {
      const ai = order.indexOf(a.key), bi = order.indexOf(b.key);
      if (ai === -1) return 1; if (bi === -1) return -1;
      return ai - bi;
    });
    return merged;
  } catch { return DEFAULT_COLUMNS.map(c => ({ ...c, on: true })); }
}

const DELTA_DEFAULTS = {
  costPerResult: { good: 5,  bad: 10 },
  results:       { good: 5,  bad: 15 },
  ctr:           { good: 2,  bad: 10 },
  cpm:           { good: 5,  bad: 10 },
  frequency:     { good: 5,  bad: 15 },
};

const BASE_DEFAULTS = {
  costPerResult: { value: 30,  enabled: true },
  results:       { value: 10,  enabled: true },
  ctr:           { value: 1.5, enabled: true },
  cpm:           { value: 20,  enabled: true },
  frequency:     { value: 2.5, enabled: true },
};

function getDeltaColor(delta, lowerIsBetter, thresholds, base, currVal) {
  if (delta === null || delta === undefined) return { color: 'var(--text-dim)', arrow: '—' };
  const t = thresholds || { good: 2, bad: 10 };
  let color, arrow;
  if (lowerIsBetter) {
    if (delta >= t.bad)        { color = '#ff4d4d'; arrow = '↑'; }
    else if (delta <= -t.good) { color = '#32cd32'; arrow = '↓'; }
    else if (Math.abs(delta) <= 2) { color = 'rgba(232,245,233,0.3)'; arrow = '→'; }
    else { color = '#f0a500'; arrow = delta > 0 ? '↑' : '↓'; }
  } else {
    if (delta <= -t.bad)       { color = '#ff4d4d'; arrow = '↓'; }
    else if (delta >= t.good)  { color = '#32cd32'; arrow = '↑'; }
    else if (Math.abs(delta) <= 2) { color = 'rgba(232,245,233,0.3)'; arrow = '→'; }
    else { color = '#f0a500'; arrow = delta > 0 ? '↑' : '↓'; }
  }
  if (base?.enabled && currVal != null) {
    const withinBase = lowerIsBetter ? currVal <= base.value : currVal >= base.value;
    if (withinBase) {
      if (color === '#ff4d4d')  color = '#f0a500';
      else if (color === '#f0a500') color = 'rgba(232,245,233,0.3)';
    }
  }
  return { color, arrow };
}

function healthDot(score) {
  if (score >= 75) return '#32cd32';
  if (score >= 55) return '#f0a500';
  if (score >= 35) return '#ff8c00';
  return '#ff4d4d';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DeltaCell({ curr, delta, format, lowerIsBetter, thresholds, base }) {
  const { color, arrow } = getDeltaColor(delta, lowerIsBetter, thresholds, base, curr);
  const sign = delta > 0 ? '+' : '';
  return (
    <td style={tds.metricCell}>
      <div style={tds.currVal}>{curr !== null && curr !== undefined ? format(curr) : '—'}</div>
      {delta !== null && delta !== undefined ? (
        <div style={{ fontSize: 10, color, marginTop: 1 }}>{arrow} {sign}{delta.toFixed(1)}%</div>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>no prev data</div>
      )}
    </td>
  );
}

function SpendDeltaCell({ curr, delta }) {
  const sign = delta > 0 ? '+' : '';
  return (
    <td style={tds.metricCell}>
      <div style={tds.currVal}>{curr != null && curr > 0 ? fmtRM(curr) : '—'}</div>
      {delta !== null && delta !== undefined ? (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
          {delta > 0 ? '↑' : '↓'} {sign}{delta.toFixed(1)}%
        </div>
      ) : null}
    </td>
  );
}

function ColumnsModal({ colConfig, onApply, onClose }) {
  const [local, setLocal] = useState(colConfig);
  const toggle = key => setLocal(p => p.map(c => c.key === key ? { ...c, on: !c.on } : c));
  const move = (key, dir) => setLocal(p => {
    const idx = p.findIndex(c => c.key === key);
    const next = idx + dir;
    if (next < 0 || next >= p.length) return p;
    const copy = [...p]; [copy[idx], copy[next]] = [copy[next], copy[idx]]; return copy;
  });
  const apply = () => {
    localStorage.setItem('cm_columns', JSON.stringify(local.map(c => ({ key: c.key, on: c.on }))));
    onApply(local); onClose();
  };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass" style={{ maxWidth: 340, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>📊 Columns</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>Toggle and reorder. Name is always shown.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {local.map((col, i) => (
            <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8, background: 'rgba(50,205,50,0.04)', border: '1px solid rgba(50,205,50,0.08)' }}>
              <input type="checkbox" checked={col.on} onChange={() => toggle(col.key)} style={{ accentColor: '#32cd32', cursor: 'pointer' }} />
              <span style={{ flex: 1, fontSize: 13, color: col.on ? 'var(--text-secondary)' : 'var(--text-dim)', fontWeight: col.on ? 600 : 400 }}>{col.label}</span>
              <div style={{ display: 'flex', gap: 2 }}>
                <button onClick={() => move(col.key, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: i === 0 ? 'not-allowed' : 'pointer', color: 'var(--text-dim)', fontSize: 11, padding: '2px 5px', opacity: i === 0 ? 0.3 : 0.8 }}>▲</button>
                <button onClick={() => move(col.key, 1)} disabled={i === local.length - 1} style={{ background: 'none', border: 'none', cursor: i === local.length - 1 ? 'not-allowed' : 'pointer', color: 'var(--text-dim)', fontSize: 11, padding: '2px 5px', opacity: i === local.length - 1 ? 0.3 : 0.8 }}>▼</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setLocal(DEFAULT_COLUMNS.map(d => ({ ...d, on: true })))}>↺ Reset</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={apply}>Apply</button>
          </div>
        </div>
      </div>
    </div>
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

// ── Ad Creative Modal ──────────────────────────────────────────────────────────

const CTA_LABELS = {
  LEARN_MORE: 'Learn More', SHOP_NOW: 'Shop Now', SIGN_UP: 'Sign Up',
  CONTACT_US: 'Contact Us', MESSAGE_PAGE: 'Send Message', WHATSAPP_MESSAGE: 'WhatsApp',
  SUBSCRIBE: 'Subscribe', DOWNLOAD: 'Download', GET_OFFER: 'Get Offer',
  GET_QUOTE: 'Get Quote', BOOK_TRAVEL: 'Book Now', CALL_NOW: 'Call Now',
  APPLY_NOW: 'Apply Now', WATCH_MORE: 'Watch More', LISTEN_NOW: 'Listen Now',
  GET_DIRECTIONS: 'Get Directions', ORDER_NOW: 'Order Now', BUY_NOW: 'Buy Now',
  OPEN_LINK: 'Open Link', LIKE_PAGE: 'Like Page',
};

function AdCreativeModal({ adId, adName, clientId, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    compareAPI.adCreative(adId, clientId)
      .then(setData)
      .catch(err => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [adId, clientId]);

  const ctaLabel = data?.ctaButton ? (CTA_LABELS[data.ctaButton] || data.ctaButton.replace(/_/g, ' ')) : null;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass" style={{ maxWidth: 480, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>🖼️ Ad Preview</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, wordBreak: 'break-word' }}>{adName}</p>

        {loading && <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>}

        {error && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#ff4d4d', fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        {data && !loading && (
          <div>
            {/* Media */}
            {data.mediaType === 'image' && data.mediaUrl && (
              <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 16, background: 'rgba(0,0,0,0.2)', maxHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={data.mediaUrl} alt="Ad creative"
                  style={{ width: '100%', maxHeight: 280, objectFit: 'contain', display: 'block' }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              </div>
            )}

            {data.mediaType === 'video' && data.thumbnailUrl && (
              <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', marginBottom: 16, background: '#000', maxHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={data.thumbnailUrl} alt="Video thumbnail"
                  style={{ width: '100%', maxHeight: 280, objectFit: 'contain', opacity: 0.85, display: 'block' }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 18, marginLeft: 3 }}>▶</span>
                  </div>
                  {data.mediaUrl && (
                    <a href={data.mediaUrl} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.5)', padding: '3px 10px', borderRadius: 12, textDecoration: 'none' }}
                    >View on Facebook ↗</a>
                  )}
                </div>
              </div>
            )}

            {data.mediaType === 'carousel' && (
              <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(50,205,50,0.06)', border: '1px solid rgba(50,205,50,0.1)', marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                🎠 Carousel ad — individual cards not available via API
              </div>
            )}

            {/* Text fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.primaryText && (
                <div>
                  <div style={creativeLabel}>Primary Text</div>
                  <div style={creativeValue}>{data.primaryText}</div>
                </div>
              )}
              {data.headline && (
                <div>
                  <div style={creativeLabel}>Headline</div>
                  <div style={{ ...creativeValue, fontWeight: 700 }}>{data.headline}</div>
                </div>
              )}
              {data.description && (
                <div>
                  <div style={creativeLabel}>Description</div>
                  <div style={creativeValue}>{data.description}</div>
                </div>
              )}
              {ctaLabel && (
                <div>
                  <div style={creativeLabel}>Button</div>
                  <span style={{
                    display: 'inline-block', fontSize: 12, fontWeight: 700,
                    background: 'rgba(50,205,50,0.15)', color: '#32cd32',
                    border: '1px solid rgba(50,205,50,0.3)',
                    borderRadius: 6, padding: '4px 14px',
                  }}>{ctaLabel}</span>
                </div>
              )}
              {!data.primaryText && !data.headline && !data.description && !ctaLabel && (
                <p style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '8px 0' }}>
                  No text content available for this ad creative.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const creativeLabel = { fontSize: 10, fontWeight: 700, color: '#32cd32', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 };
const creativeValue = { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-word' };

// ── Info Modal ─────────────────────────────────────────────────────────────────

function InfoKV({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
      <div style={{ width: 140, fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{value || '—'}</div>
    </div>
  );
}

function InfoModal({ row, onClose }) {
  const targeting = row.info?.targeting;

  const formatAge = t => !t ? '—' : `${t.age_min || 18}–${t.age_max || '65+'}`;
  const formatGenders = t => {
    if (!t?.genders?.length) return 'All genders';
    return t.genders.map(g => g === 1 ? 'Male' : g === 2 ? 'Female' : g).join(', ');
  };
  const formatLocations = t => {
    if (!t?.geo_locations) return '—';
    const parts = [
      ...(t.geo_locations.countries || []).map(c => c.name || c.key),
      ...(t.geo_locations.regions   || []).map(r => r.name),
      ...(t.geo_locations.cities    || []).map(c => c.name),
    ];
    return parts.length ? parts.slice(0, 6).join(', ') + (parts.length > 6 ? ` +${parts.length - 6} more` : '') : '—';
  };
  const formatInterests = t => {
    if (!t) return null;
    const names = [];
    if (Array.isArray(t.flexible_spec)) {
      t.flexible_spec.forEach(spec => {
        if (Array.isArray(spec.interests)) spec.interests.forEach(i => names.push(i.name));
      });
    }
    if (Array.isArray(t.interests)) t.interests.forEach(i => names.push(i.name));
    return names.length ? names.slice(0, 8).join(', ') + (names.length > 8 ? ` +${names.length - 8} more` : '') : null;
  };

  const interests = formatInterests(targeting);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass" style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
            {row.level === 'campaign' ? '📢 Campaign Info' : '🎯 Ad Set Info'}
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16, wordBreak: 'break-word' }}>
          {row.name}
        </p>
        {row.level === 'campaign' ? (
          <InfoKV label="Objective" value={row.info?.objective || row.objective} />
        ) : (
          <>
            <InfoKV label="Optimization Goal" value={row.info?.optimization_goal || row.objective} />
            <InfoKV label="Billing Event"     value={row.info?.billing_event} />
            {targeting && <>
              <InfoKV label="Age Range"  value={formatAge(targeting)} />
              <InfoKV label="Genders"    value={formatGenders(targeting)} />
              <InfoKV label="Locations"  value={formatLocations(targeting)} />
              {interests && <InfoKV label="Interests" value={interests} />}
            </>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Health Rules Modal ─────────────────────────────────────────────────────────

const WEIGHT_KEYS = [
  { key: 'costPerResult', label: 'Cost / Result', lowerIsBetter: true,  unit: 'RM'  },
  { key: 'results',       label: 'Results',       lowerIsBetter: false, unit: 'num' },
  { key: 'ctr',           label: 'CTR',           lowerIsBetter: false, unit: '%'   },
  { key: 'cpm',           label: 'CPM',           lowerIsBetter: true,  unit: 'RM'  },
  { key: 'frequency',     label: 'Frequency',     lowerIsBetter: true,  unit: 'num' },
];

function WeightsModal({ onClose, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [settings,     setSettings]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(null);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [confirm,      setConfirm]      = useState(null);
  const [expandedId,   setExpandedId]   = useState(null);
  const [showGlobal,   setShowGlobal]   = useState(false);

  const [drafts,          setDrafts]          = useState({});
  const [draftThresholds, setDraftThresholds] = useState({});
  const [draftBase,       setDraftBase]       = useState({});

  const [gDraftW,  setGDraftW]  = useState(null);
  const [gDraftDT, setGDraftDT] = useState(null);
  const [gDraftB,  setGDraftB]  = useState(null);

  const mkDT = (saved) => WEIGHT_KEYS.reduce((acc, { key }) => ({ ...acc, [key]: { ...DELTA_DEFAULTS[key], ...(saved?.[key] || {}) } }), {});
  const mkDB = (saved) => WEIGHT_KEYS.reduce((acc, { key }) => ({ ...acc, [key]: { ...BASE_DEFAULTS[key],  ...(saved?.[key] || {}) } }), {});

  useEffect(() => {
    compareAPI.getSettings().then(r => {
      setSettings(r.settings);
      setExpandedId(r.settings[0]?.id || null);
      const d = {}, dt = {}, db = {};
      r.settings.forEach(s => {
        d[s.id]  = { ...s.weights };
        dt[s.id] = mkDT(s.deltaThresholds);
        db[s.id] = mkDB(s.baseThresholds);
      });
      setDrafts(d); setDraftThresholds(dt); setDraftBase(db);
      if (isAdmin) {
        const gd = r.globalDefaults || {};
        setGDraftW({ ...WEIGHT_DEFAULTS, ...(gd.weights || {}) });
        setGDraftDT(mkDT(gd.deltaThresholds));
        setGDraftB(mkDB(gd.baseThresholds));
      }
    }).finally(() => setLoading(false));
  }, []);

  const setW  = (id, k, v) => setDrafts(p => ({ ...p, [id]: { ...p[id], [k]: Math.max(0, Math.min(100, Number(v) || 0)) } }));
  const setDT = (id, m, f, v) => setDraftThresholds(p => ({ ...p, [id]: { ...p[id], [m]: { ...(p[id]?.[m] || {}), [f]: Math.max(1, Math.min(100, Number(v) || 1)) } } }));
  const setDB = (id, m, f, v) => setDraftBase(p => ({ ...p, [id]: { ...p[id], [m]: { ...(p[id]?.[m] || {}), [f]: f === 'enabled' ? v : Math.max(0, Number(v) || 0) } } }));

  const setGW  = (k, v) => setGDraftW(p => ({ ...p, [k]: Math.max(0, Math.min(100, Number(v) || 0)) }));
  const setGDT = (m, f, v) => setGDraftDT(p => ({ ...p, [m]: { ...(p?.[m] || {}), [f]: Math.max(1, Math.min(100, Number(v) || 1)) } }));
  const setGB  = (m, f, v) => setGDraftB(p => ({ ...p, [m]: { ...(p?.[m] || {}), [f]: f === 'enabled' ? v : Math.max(0, Number(v) || 0) } }));

  const total  = (id) => Object.values(drafts[id] || {}).reduce((s, v) => s + Number(v), 0);
  const gTotal = ()   => Object.values(gDraftW || {}).reduce((s, v) => s + Number(v), 0);

  const resetClient = async (id) => {
    const resetW  = { ...(gDraftW  || WEIGHT_DEFAULTS) };
    const resetDT = { ...(gDraftDT || mkDT(null)) };
    const resetDB = { ...(gDraftB  || mkDB(null)) };
    setDrafts(p => ({ ...p, [id]: resetW }));
    setDraftThresholds(p => ({ ...p, [id]: resetDT }));
    setDraftBase(p => ({ ...p, [id]: resetDB }));
    try {
      await compareAPI.saveSettings(id, resetW, resetDT, resetDB);
      toast('Reset to defaults and saved.', 'success');
      onSaved();
    } catch (err) { toast(err.response?.data?.error || 'Reset failed', 'error'); }
  };

  const handleSave = (id) => {
    const t = total(id);
    if (Math.abs(t - 100) > 1) return toast(`Weights must sum to 100 (currently ${t})`, 'error');
    setConfirm(id);
  };

  const confirmSave = async () => {
    setSaving(confirm);
    try {
      await compareAPI.saveSettings(confirm, drafts[confirm], draftThresholds[confirm], draftBase[confirm]);
      toast('Health rules saved.', 'success');
      setConfirm(null); onSaved();
    } catch (err) { toast(err.response?.data?.error || 'Save failed', 'error'); }
    finally { setSaving(null); }
  };

  const handleSaveGlobal = async () => {
    const t = gTotal();
    if (Math.abs(t - 100) > 1) return toast(`Global weights must sum to 100 (currently ${t})`, 'error');
    setSavingGlobal(true);
    try {
      await compareAPI.saveDefaults(gDraftW, gDraftDT, gDraftB);
      toast('Global defaults saved.', 'success'); onSaved();
    } catch (err) { toast(err.response?.data?.error || 'Save failed', 'error'); }
    finally { setSavingGlobal(false); }
  };

  const renderMetrics = (wt, setWt, dth, setDth, bth, setBth, disabled) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 50px 76px 76px 110px', gap: '4px 8px', alignItems: 'center', marginBottom: 2 }}>
        <div style={gs.colHeader}>Metric</div>
        <div style={gs.colHeader}>Weight</div>
        <div style={{ ...gs.colHeader, textAlign: 'center' }}>%</div>
        <div style={{ ...gs.colHeader, textAlign: 'center', color: '#32cd32' }}>🟢 Good if</div>
        <div style={{ ...gs.colHeader, textAlign: 'center', color: '#ff4d4d' }}>🔴 Bad if</div>
        <div style={{ ...gs.colHeader, textAlign: 'center', color: '#a0a0ff' }}>🏠 Base</div>
      </div>
      {WEIGHT_KEYS.map(({ key, label, lowerIsBetter, unit }) => {
        const w = wt?.[key] || 0;
        const t = dth?.[key] || DELTA_DEFAULTS[key];
        const b = bth?.[key] || BASE_DEFAULTS[key];
        const unitLabel = unit === 'RM' ? 'RM' : unit === '%' ? '%' : '#';
        return (
          <div key={key} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 50px 76px 76px 110px', gap: '0 8px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{lowerIsBetter ? 'Lower = better' : 'Higher = better'}</div>
            </div>
            <input type="range" min={0} max={100} step={5} value={w} onChange={e => setWt(key, e.target.value)} disabled={disabled} style={{ accentColor: '#32cd32', width: '100%' }} />
            <input type="number" min={0} max={100} step={5} value={w} onChange={e => setWt(key, e.target.value)} disabled={disabled} className="form-input" style={{ width: '100%', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#32cd32', padding: '3px 4px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
              <input type="number" min={1} max={100} step={1} value={t.good} onChange={e => setDth(key, 'good', e.target.value)} disabled={disabled} className="form-input" style={{ width: 38, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#32cd32', padding: '3px 4px' }} />
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
              <input type="number" min={1} max={100} step={1} value={t.bad} onChange={e => setDth(key, 'bad', e.target.value)} disabled={disabled} className="form-input" style={{ width: 38, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#ff4d4d', padding: '3px 4px' }} />
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
              <label style={{ fontSize: 9, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 2, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                <input type="checkbox" checked={b.enabled} onChange={e => setBth(key, 'enabled', e.target.checked)} disabled={disabled} style={{ accentColor: '#a0a0ff', cursor: 'pointer' }} />
              </label>
              <input type="number" min={0} step={unit === '%' ? 0.1 : 0.5} value={b.value} onChange={e => setBth(key, 'value', e.target.value)} disabled={disabled || !b.enabled} className="form-input" style={{ width: 42, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#a0a0ff', padding: '3px 4px', opacity: b.enabled ? 1 : 0.4 }} />
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{unitLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass" style={{ maxWidth: 820, width: '100%', margin: '0 auto', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>⚖️ Health Rules</h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Weights (must total 100) · % change thresholds for 🟢/🔴 · Base value to soften signals when metric is still acceptable
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
        ) : (
          <>
            {/* Admin: Global Defaults */}
            {isAdmin && gDraftW && (
              <div style={{ marginBottom: 14, border: '1px solid rgba(160,160,255,0.2)', borderRadius: 10, overflow: 'hidden' }}>
                <button onClick={() => setShowGlobal(v => !v)} style={{ width: '100%', background: 'rgba(160,160,255,0.06)', border: 'none', padding: '11px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, color: '#a0a0ff' }}>{showGlobal ? '▼' : '▶'}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#a0a0ff' }}>🌐 Global Defaults</span>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'rgba(160,160,255,0.1)', borderRadius: 4, padding: '1px 6px' }}>Admin Only</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: Math.abs(gTotal() - 100) <= 1 ? '#a0a0ff' : '#ff4d4d' }}>Total: {gTotal()}</span>
                </button>
                {showGlobal && (
                  <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(160,160,255,0.1)' }}>
                    <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
                      Default rules for clients without custom settings.
                    </p>
                    {renderMetrics(gDraftW, setGW, gDraftDT, setGDT, gDraftB, setGB, false)}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setGDraftW({ ...WEIGHT_DEFAULTS }); setGDraftDT(mkDT(null)); setGDraftB(mkDB(null)); }}>↺ Reset</button>
                      <button className="btn btn-primary btn-sm" onClick={handleSaveGlobal} disabled={Math.abs(gTotal() - 100) > 1 || savingGlobal}>
                        {savingGlobal ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : 'Save Global Defaults'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Per-client accordion */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {settings.map(s => {
                const isExpanded = expandedId === s.id;
                const d  = drafts[s.id] || {};
                const dt = draftThresholds[s.id] || {};
                const db = draftBase[s.id] || {};
                const t  = total(s.id);
                const valid = Math.abs(t - 100) <= 1;
                return (
                  <div key={s.id} style={{ borderRadius: 10, border: `1px solid ${isExpanded ? 'rgba(50,205,50,0.25)' : 'rgba(50,205,50,0.1)'}`, overflow: 'hidden' }}>
                    <button onClick={() => setExpandedId(isExpanded ? null : s.id)} style={{ width: '100%', background: isExpanded ? 'rgba(50,205,50,0.06)' : 'transparent', border: 'none', padding: '11px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 9, color: '#32cd32' }}>{isExpanded ? '▼' : '▶'}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.clientCode}</span>
                        {!s.hasCustom && <span style={{ fontSize: 9, color: '#a0a0ff', background: 'rgba(160,160,255,0.1)', borderRadius: 4, padding: '1px 5px' }}>using defaults</span>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: valid ? '#32cd32' : '#ff4d4d' }}>Total: {t}</span>
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
                          <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(50,205,50,0.1)' }}>
                            {renderMetrics(
                              d, (k, v) => setW(s.id, k, v),
                              dt, (m, f, v) => setDT(s.id, m, f, v),
                              db, (m, f, v) => setDB(s.id, m, f, v),
                              !isAdmin
                            )}
                            {isAdmin && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => resetClient(s.id)}>↺ Reset to Default</button>
                                <button className="btn btn-primary btn-sm" onClick={() => handleSave(s.id)} disabled={!valid || saving === s.id}>
                                  {saving === s.id ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : 'Apply'}
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <AnimatePresence>
          {confirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass" style={{ padding: '28px 32px', borderRadius: 14, textAlign: 'center', maxWidth: 340 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⚖️</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>Confirm Rule Change</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                  Update health rules for <strong style={{ color: 'var(--text-primary)' }}>{settings.find(s => s.id === confirm)?.name}</strong>. New rules apply on next data fetch.
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

// ── Colour Guide Modal ─────────────────────────────────────────────────────────

function ColourGuide({ onClose }) {
  const rules = [
    { color: '#32cd32', label: 'Green', desc: 'Positive change (>2%) in the right direction — metric improving' },
    { color: '#ff4d4d', label: 'Red',   desc: 'Negative change (>10%) in the wrong direction' },
    { color: '#f0a500', label: 'Yellow', desc: 'Minor negative change (2–10%) — monitor closely' },
    { color: 'rgba(232,245,233,0.3)', label: 'Grey', desc: 'Flat change (≤2%) or no previous period data' },
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
      <div className="modal-box glass" style={{ maxWidth: 480, width: '100%', margin: '0 auto' }}>
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

// ── Budget Edit Modal ──────────────────────────────────────────────────────────

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
      <div className="modal-box glass" style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
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

// ── Main Page ──────────────────────────────────────────────────────────────────

const SORT_DEFAULTS = { col: 'healthScore', dir: 'asc' };

export default function CompareMonitor() {
  const toast = useToast();
  const { user } = useAuth();

  const [colConfig,   setColConfig]   = useState(loadColConfig);
  const [clients,     setClients]     = useState([]);
  const [clientId,    setClientId]    = useState(() => localStorage.getItem('cm_clientId') || '');
  const [period,      setPeriod]      = useState(() => localStorage.getItem('cm_period') || '7d');
  const [level,       setLevel]       = useState(() => localStorage.getItem('cm_level') || 'campaign');
  const [rows,        setRows]        = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  // Filters
  const [quickChip,  setQuickChip]  = useState('all');
  const [search,     setSearch]     = useState('');
  const [statusFlt,  setStatusFlt]  = useState('all');
  const [minSpend,   setMinSpend]   = useState('');
  const [badgeFlt,   setBadgeFlt]   = useState('all');

  // Sort
  const [sort, setSort] = useState(SORT_DEFAULTS);

  // Selection
  const [selected, setSelected] = useState(new Set());

  // Grouping expand/collapse
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [expandedPaused,  setExpandedPaused]  = useState(new Set());

  // Modals
  const [showWeights,  setShowWeights]  = useState(false);
  const [showColumns,  setShowColumns]  = useState(false);
  const [showGuide,    setShowGuide]    = useState(false);
  const [editBudget,   setEditBudget]   = useState(null);
  const [infoRow,      setInfoRow]      = useState(null);
  const [creativeRow,  setCreativeRow]  = useState(null);
  const [bulkAction,   setBulkAction]   = useState(null);
  const [bulkBusy,     setBulkBusy]     = useState(false);

  useEffect(() => {
    clientsAPI.getAssigned().then(list => {
      setClients(list);
      if (!clientId && list.length > 0) setClientId(list[0].id);
    });
  }, []);

  useEffect(() => { if (clientId) localStorage.setItem('cm_clientId', clientId); }, [clientId]);
  useEffect(() => { localStorage.setItem('cm_period', period); }, [period]);
  useEffect(() => { localStorage.setItem('cm_level', level); }, [level]);

  // Reset group state when data refreshes
  useEffect(() => {
    setCollapsedGroups(new Set());
    setExpandedPaused(new Set());
    setSelected(new Set());
  }, [rows]);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true); setError(null);
    try {
      const res = await compareAPI.fetch({ clientId, range: period, level });
      setRows(res.rows || []);
      setMeta(res);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setLoading(false); }
  }, [clientId, period, level]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Filtering & sorting ────────────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    let r = [...rows];

    if (quickChip === 'pause')   r = r.filter(x => x.badge === 'PAUSE');
    else if (quickChip === 'scale')   r = r.filter(x => x.badge === 'SCALE');
    else if (quickChip === 'watch')   r = r.filter(x => ['WATCH', 'REFRESH'].includes(x.badge));
    else if (quickChip === 'off')     r = r.filter(x => x.status === 'PAUSED');
    else if (quickChip === 'fatigue') r = r.filter(x => x.badge === 'REFRESH');

    if (search)           r = r.filter(x => x.name?.toLowerCase().includes(search.toLowerCase()) || x.parentName?.toLowerCase().includes(search.toLowerCase()));
    if (statusFlt !== 'all') r = r.filter(x => x.status === (statusFlt === 'active' ? 'ACTIVE' : 'PAUSED'));
    if (minSpend)         r = r.filter(x => x.curr.spend >= parseFloat(minSpend));
    if (badgeFlt !== 'all') r = r.filter(x => x.badge === badgeFlt);

    if (sort.col) {
      r.sort((a, b) => {
        const getVal = row => {
          if (sort.col === 'name')        return row.name?.toLowerCase() || '';
          if (sort.col === 'healthScore') return row.healthScore || 0;
          if (sort.col === 'badge')       return ['PAUSE','REFRESH','WATCH','KEEP','SCALE'].indexOf(row.badge);
          if (sort.col === 'status')      return row.status === 'ACTIVE' ? 0 : 1;
          if (sort.col === 'budget')      return row.budget?.amount || 0;
          const [group, key] = sort.col.split('.');
          if (group === 'curr')  return row.curr?.[key] || 0;
          if (group === 'delta') return row.deltas?.[key] ?? -9999;
          return 0;
        };
        const av = getVal(a), bv = getVal(b);
        if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        return sort.dir === 'asc' ? av - bv : bv - av;
      });
    }

    return r;
  }, [rows, quickChip, search, statusFlt, minSpend, badgeFlt, sort]);

  // ── Grouping ───────────────────────────────────────────────────────────────────

  // Auto-expand paused sections when filtering for paused items
  const autoExpandPaused = statusFlt === 'paused' || quickChip === 'off';

  const groupedRows = useMemo(() => {
    if (level === 'campaign') {
      return [{
        key: '__all__',
        label: null,
        activeRows: filteredRows.filter(r => r.status === 'ACTIVE'),
        pausedRows: filteredRows.filter(r => r.status !== 'ACTIVE'),
      }];
    }
    const groupMap = new Map();
    const groupOrder = [];
    filteredRows.forEach(row => {
      const key = row.parentId || row.parentName || '__unknown__';
      if (!groupMap.has(key)) {
        groupMap.set(key, { key, label: row.parentName || 'Unknown', activeRows: [], pausedRows: [] });
        groupOrder.push(key);
      }
      const g = groupMap.get(key);
      (row.status === 'ACTIVE' ? g.activeRows : g.pausedRows).push(row);
    });
    return groupOrder.map(k => groupMap.get(k));
  }, [filteredRows, level]);

  const toggleGroup = key => {
    setCollapsedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };
  const togglePaused = key => {
    setExpandedPaused(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  // Visible rows (for selection logic)
  const visibleRows = useMemo(() => {
    const visible = [];
    groupedRows.forEach(g => {
      if (collapsedGroups.has(g.key)) return;
      g.activeRows.forEach(r => visible.push(r));
      if (autoExpandPaused || expandedPaused.has(g.key)) {
        g.pausedRows.forEach(r => visible.push(r));
      }
    });
    return visible;
  }, [groupedRows, collapsedGroups, expandedPaused, autoExpandPaused]);

  // ── Sort ───────────────────────────────────────────────────────────────────────

  const handleSort = col => {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  };

  const SortIcon = ({ col }) => {
    if (sort.col !== col) return <span style={{ opacity: 0.25, fontSize: 9, marginLeft: 3 }}>▲▼</span>;
    return <span style={{ fontSize: 9, color: '#32cd32', marginLeft: 3 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>;
  };

  const Th = ({ col, children, style: sx }) => (
    <th onClick={() => handleSort(col)} style={{ ...tds.th, cursor: 'pointer', userSelect: 'none', ...sx }}>
      {children}<SortIcon col={col} />
    </th>
  );

  // ── Selection ──────────────────────────────────────────────────────────────────

  const allSelected = visibleRows.length > 0 && visibleRows.every(r => selected.has(r.id));
  const toggleAll   = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visibleRows.map(r => r.id)));
  };
  const toggleRow = id => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // ── Bulk actions ───────────────────────────────────────────────────────────────

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

  // ── Quick chip counts ──────────────────────────────────────────────────────────

  const chipCounts = useMemo(() => ({
    pause:   rows.filter(r => r.badge === 'PAUSE').length,
    scale:   rows.filter(r => r.badge === 'SCALE').length,
    watch:   rows.filter(r => ['WATCH', 'REFRESH'].includes(r.badge)).length,
    fatigue: rows.filter(r => r.badge === 'REFRESH').length,
    off:     rows.filter(r => r.status === 'PAUSED').length,
  }), [rows]);

  const activeFiltersCount = [search, statusFlt !== 'all', minSpend, badgeFlt !== 'all'].filter(Boolean).length;
  const selectedCount = selected.size;

  // ── Column count for colSpan ──────────────────────────────────────────────────
  const visibleColCount = useMemo(() => 2 + colConfig.filter(c => c.on).length, [colConfig]);

  // ── Delta thresholds (from API or defaults) ────────────────────────────────────

  const deltaThresholds = useMemo(() => {
    const saved = meta?.client?.compareDeltaThresholds || {};
    return {
      costPerResult: { ...DELTA_DEFAULTS.costPerResult, ...(saved.costPerResult || {}) },
      results:       { ...DELTA_DEFAULTS.results,       ...(saved.results       || {}) },
      ctr:           { ...DELTA_DEFAULTS.ctr,           ...(saved.ctr           || {}) },
      cpm:           { ...DELTA_DEFAULTS.cpm,           ...(saved.cpm           || {}) },
      frequency:     { ...DELTA_DEFAULTS.frequency,     ...(saved.frequency     || {}) },
    };
  }, [meta]);

  const baseThresholds = useMemo(() => {
    const saved = meta?.client?.compareBaseThresholds || {};
    return {
      costPerResult: { ...BASE_DEFAULTS.costPerResult, ...(saved.costPerResult || {}) },
      results:       { ...BASE_DEFAULTS.results,       ...(saved.results       || {}) },
      ctr:           { ...BASE_DEFAULTS.ctr,           ...(saved.ctr           || {}) },
      cpm:           { ...BASE_DEFAULTS.cpm,           ...(saved.cpm           || {}) },
      frequency:     { ...BASE_DEFAULTS.frequency,     ...(saved.frequency     || {}) },
    };
  }, [meta]);

  // ── Row renderer ───────────────────────────────────────────────────────────────

  const renderColHeader = (col) => {
    switch (col.key) {
      case 'status':        return <Th key="status"        col="status"              style={{ width: col.width }}>Status</Th>;
      case 'budget':        return <Th key="budget"        col="budget"              style={{ width: col.width }}>Budget</Th>;
      case 'spend':         return <Th key="spend"         col="curr.spend"          style={{ width: col.width }}>Spend</Th>;
      case 'results':       return <Th key="results"       col="curr.results"        style={{ width: col.width }}>Results</Th>;
      case 'ctr':           return <Th key="ctr"           col="curr.ctr"            style={{ width: col.width }}>CTR</Th>;
      case 'cpm':           return <Th key="cpm"           col="curr.cpm"            style={{ width: col.width }}>CPM</Th>;
      case 'frequency':     return <Th key="frequency"     col="curr.frequency"      style={{ width: col.width }}>Freq</Th>;
      case 'costPerResult': return <Th key="costPerResult" col="curr.costPerResult"  style={{ width: col.width }}>Cost/Result</Th>;
      case 'health':        return <Th key="health"        col="healthScore"         style={{ width: col.width }}>Health</Th>;
      case 'badge':         return <Th key="badge"         col="badge"               style={{ width: col.width }}>Badge</Th>;
      case 'toggle':        return <th  key="toggle"                                 style={tds.th}>On/Off</th>;
      default: return null;
    }
  };

  const renderRow = (row) => {
    const isSelected = selected.has(row.id);
    const bm = BADGE_META[row.badge] || BADGE_META.KEEP;
    const hasInfo = row.level === 'campaign' || row.level === 'adset';

    const renderCell = (col) => {
      switch (col.key) {
        case 'status': return (
          <td key="status" style={tds.metricCell}>
            <span style={{
              fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px',
              background: row.status === 'ACTIVE' ? 'rgba(50,205,50,0.15)' : 'rgba(136,136,136,0.12)',
              color: row.status === 'ACTIVE' ? '#32cd32' : '#888',
            }}>
              {row.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED'}
            </span>
          </td>
        );
        case 'budget': return (
          <td key="budget" style={tds.metricCell}>
            {row.budget
              ? <BudgetChip row={row} onEdit={setEditBudget} />
              : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>}
          </td>
        );
        case 'spend': return <SpendDeltaCell key="spend" curr={row.curr.spend} delta={row.deltas?.spend} />;
        case 'results': return <DeltaCell key="results" curr={row.curr.results} delta={row.deltas?.results} format={fmtNum} lowerIsBetter={false} thresholds={deltaThresholds.results} base={baseThresholds.results} />;
        case 'ctr': return <DeltaCell key="ctr" curr={row.curr.ctr} delta={row.deltas?.ctr} format={fmtPct} lowerIsBetter={false} thresholds={deltaThresholds.ctr} base={baseThresholds.ctr} />;
        case 'cpm': return <DeltaCell key="cpm" curr={row.curr.cpm} delta={row.deltas?.cpm} format={fmtRM} lowerIsBetter={true} thresholds={deltaThresholds.cpm} base={baseThresholds.cpm} />;
        case 'frequency': return <DeltaCell key="frequency" curr={row.curr.frequency} delta={row.deltas?.frequency} format={v => v.toFixed(2)} lowerIsBetter={true} thresholds={deltaThresholds.frequency} base={baseThresholds.frequency} />;
        case 'costPerResult': return <DeltaCell key="costPerResult" curr={row.curr.costPerResult} delta={row.deltas?.costPerResult} format={fmtRM} lowerIsBetter={true} thresholds={deltaThresholds.costPerResult} base={baseThresholds.costPerResult} />;
        case 'health': return (
          <td key="health" style={tds.metricCell}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: healthDot(row.healthScore), fontSize: 8 }}>●</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: healthDot(row.healthScore) }}>{row.healthScore}</span>
            </div>
          </td>
        );
        case 'badge': return (
          <td key="badge" style={tds.metricCell}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
              color: bm.color, background: bm.bg,
              borderRadius: 4, padding: '3px 7px',
            }}>
              {bm.label}
            </span>
          </td>
        );
        case 'toggle': return (
          <td key="toggle" style={{ padding: '10px 12px', textAlign: 'center' }}>
            <ToggleBtn row={row} clientId={clientId} onDone={fetchData} />
          </td>
        );
        default: return null;
      }
    };

    return (
      <tr key={row.id} style={{ background: isSelected ? 'rgba(50,205,50,0.05)' : undefined }}>
        <td style={{ padding: '10px 8px' }}>
          <input type="checkbox" checked={isSelected} onChange={() => toggleRow(row.id)}
            style={{ accentColor: '#32cd32', cursor: 'pointer' }} />
        </td>
        <td style={tds.nameCell}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.3, flex: 1, wordBreak: 'break-word' }}>
              {row.name}
            </div>
            {hasInfo && (
              <button
                onClick={() => setInfoRow(row)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 12, padding: '0 2px', flexShrink: 0, lineHeight: 1.2 }}
                title="View info"
              >ⓘ</button>
            )}
            {row.level === 'ad' && (
              <button
                onClick={() => setCreativeRow(row)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 12, padding: '0 2px', flexShrink: 0, lineHeight: 1.2 }}
                title="Preview ad creative"
              >👁</button>
            )}
          </div>
        </td>
        {colConfig.filter(c => c.on).map(renderCell)}
      </tr>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────────

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
          <button className="btn btn-ghost btn-sm" onClick={() => setShowWeights(true)}>⚖️ Health Rules</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowColumns(true)}>📊 Columns</button>
          <button className="btn btn-ghost btn-sm" onClick={fetchData} disabled={loading}>
            {loading ? <div className="spinner" style={{ width: 13, height: 13 }} /> : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* Controls row — client + period only */}
      <div style={s.controls} className="glass">
        <div style={s.controlGroup}>
          <label style={s.controlLabel}>Client</label>
          <select className="form-input" style={s.controlSelect}
            value={clientId} onChange={e => setClientId(e.target.value)}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div style={s.controlGroup}>
          <label style={s.controlLabel}>Period</label>
          <select className="form-input" style={s.controlSelect}
            value={period} onChange={e => setPeriod(e.target.value)}>
            {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Quick chips */}
      <div style={s.chips}>
        {[
          { id: 'all',     label: `All (${rows.length})` },
          { id: 'pause',   label: `🔴 Pause Candidates (${chipCounts.pause})` },
          { id: 'scale',   label: `🟢 Scale Opportunities (${chipCounts.scale})` },
          { id: 'watch',   label: `🟡 Watch List (${chipCounts.watch})` },
          { id: 'fatigue', label: `🟠 Creative Fatigue (${chipCounts.fatigue})` },
          { id: 'off',     label: `⏸ Currently Off (${chipCounts.off})` },
        ].map(chip => (
          <motion.button key={chip.id}
            onClick={() => setQuickChip(chip.id)}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.13 }}
            style={{
              ...s.chip,
              background:  quickChip === chip.id ? 'rgba(50,205,50,0.18)' : 'rgba(50,205,50,0.06)',
              border: `1px solid ${quickChip === chip.id ? 'rgba(50,205,50,0.55)' : 'rgba(50,205,50,0.15)'}`,
              color:       quickChip === chip.id ? '#32cd32' : 'var(--text-secondary)',
              fontWeight:  quickChip === chip.id ? 700 : 500,
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
          <button className="btn btn-ghost btn-sm"
            onClick={() => { setSearch(''); setStatusFlt('all'); setMinSpend(''); setBadgeFlt('all'); }}>
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
              <button className="btn btn-ghost btn-sm" onClick={() => setBulkAction('pause')}>⏸ Pause All</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setBulkAction('enable')}>▶ Enable All</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>✕ Deselect</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level folder tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 0 }}>
        {LEVEL_TABS.map(tab => (
          <motion.button key={tab.value}
            onClick={() => setLevel(tab.value)}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12 }}
            style={{
              padding: '8px 18px',
              border: level === tab.value
                ? '1px solid rgba(50,205,50,0.3)'
                : '1px solid rgba(50,205,50,0.1)',
              borderBottom: level === tab.value ? '1px solid var(--card-bg)' : '1px solid rgba(50,205,50,0.1)',
              borderRadius: '8px 8px 0 0',
              background: level === tab.value ? 'var(--card-bg)' : 'rgba(50,205,50,0.03)',
              color: level === tab.value ? '#32cd32' : 'var(--text-muted)',
              fontWeight: level === tab.value ? 700 : 500,
              fontSize: 12, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab.icon} {tab.label}
          </motion.button>
        ))}
      </div>

      {/* Table */}
      <div className="glass table-scroll-wrap" style={{ ...s.tableWrap, borderTopLeftRadius: 0 }}>
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
          <table className="data-table" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ width: 36, padding: '10px 8px' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    style={{ accentColor: '#32cd32', cursor: 'pointer' }} />
                </th>
                <Th col="name" style={{ minWidth: 200 }}>Name</Th>
                {colConfig.filter(c => c.on).map(renderColHeader)}
              </tr>
            </thead>
            <tbody>
              {groupedRows.map(group => (
                <React.Fragment key={group.key}>
                  {/* Group header — shown for adset / ad levels */}
                  {group.label && (
                    <tr style={{ background: 'rgba(50,205,50,0.05)', borderTop: '1px solid rgba(50,205,50,0.1)' }}>
                      <td colSpan={visibleColCount} style={{ padding: '7px 12px' }}>
                        <button
                          onClick={() => toggleGroup(group.key)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}
                        >
                          <span style={{ color: '#32cd32', fontSize: 9 }}>
                            {collapsedGroups.has(group.key) ? '▶' : '▼'}
                          </span>
                          <strong style={{ color: 'var(--text-primary)', fontSize: 12 }}>{group.label}</strong>
                          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                            {group.activeRows.length} active
                            {group.pausedRows.length > 0 ? `, ${group.pausedRows.length} paused` : ''}
                          </span>
                        </button>
                      </td>
                    </tr>
                  )}

                  {/* Active rows */}
                  {!collapsedGroups.has(group.key) && group.activeRows.map(renderRow)}

                  {/* Paused collapsible section */}
                  {!collapsedGroups.has(group.key) && group.pausedRows.length > 0 && (
                    <>
                      <tr style={{ background: 'rgba(136,136,136,0.04)' }}>
                        <td colSpan={visibleColCount} style={{ padding: `5px 12px 5px ${group.label ? '28px' : '12px'}` }}>
                          <button
                            onClick={() => togglePaused(group.key)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 11 }}
                          >
                            <span style={{ fontSize: 9 }}>
                              {autoExpandPaused || expandedPaused.has(group.key) ? '▼' : '▶'}
                            </span>
                            ⏸ Paused ({group.pausedRows.length})
                          </button>
                        </td>
                      </tr>
                      {(autoExpandPaused || expandedPaused.has(group.key)) && group.pausedRows.map(renderRow)}
                    </>
                  )}
                </React.Fragment>
              ))}
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
      {showColumns && (
        <ColumnsModal colConfig={colConfig} onApply={setColConfig} onClose={() => setShowColumns(false)} />
      )}
      {creativeRow && (
        <AdCreativeModal
          adId={creativeRow.id} adName={creativeRow.name} clientId={clientId}
          onClose={() => setCreativeRow(null)}
        />
      )}
      {infoRow     && <InfoModal row={infoRow} onClose={() => setInfoRow(null)} />}
      {showWeights && <WeightsModal onClose={() => setShowWeights(false)} onSaved={fetchData} />}
      {showGuide   && <ColourGuide onClose={() => setShowGuide(false)} />}
      {editBudget  && (
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

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = {
  page:         { padding: '32px 36px', maxWidth: 1400 },
  header:       { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  title:        { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 },
  sub:          { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  controls:     { display: 'flex', alignItems: 'flex-end', gap: 20, padding: '14px 18px', borderRadius: 12, marginBottom: 14, flexWrap: 'wrap' },
  controlGroup: { display: 'flex', flexDirection: 'column', gap: 5 },
  controlLabel: { fontSize: 10, fontWeight: 700, color: '#32cd32', letterSpacing: 1.2, textTransform: 'uppercase' },
  controlSelect:{ fontSize: 13, padding: '6px 10px', height: 34 },
  chips:        { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip:         { padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: 'none' },
  filterRow:    { display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  bulkBar:      { display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10, marginBottom: 12, alignItems: 'center' },
  tableWrap:    { overflow: 'hidden', marginBottom: 8 },
  center:       { padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 },
};

const tds = {
  th:         { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 12px', whiteSpace: 'nowrap' },
  nameCell:   { padding: '10px 12px', maxWidth: 240, wordBreak: 'break-word' },
  metricCell: { padding: '10px 12px', whiteSpace: 'nowrap' },
  currVal:    { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
};

const gs = {
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#32cd32', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  colHeader:    { fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 0.8, textTransform: 'uppercase' },
};
