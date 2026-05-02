import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { monitorAPI } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../context/AuthContext';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtRM  = v => `RM ${parseFloat(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRMS = v => `RM ${parseFloat(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtNum = v => Math.round(parseFloat(v || 0)).toLocaleString('en-MY');
const fmtPct = v => `${parseFloat(v || 0).toFixed(2)}%`;
const fmtSec = v => `${parseFloat(v || 0).toFixed(1)}s`;

function extractFromActions(actions, type) {
  if (!Array.isArray(actions)) return 0;
  const f = actions.find(a => a.action_type === type);
  return f ? parseFloat(f.value || 0) : 0;
}

function detectBranch(name) {
  const n = (name || '').toUpperCase();
  if (n.includes('KL')) return 'KL';
  if (n.includes('RC')) return 'RC';
  if (n.includes('CR')) return 'CR';
  return 'OTHER';
}

function calcChange(curr, prev, higherBetter) {
  if (!prev || prev === 0) return null;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  const dir  = curr > prev ? 'up' : curr < prev ? 'down' : 'flat';
  const isGood = higherBetter === null ? null : higherBetter ? dir === 'up' : dir === 'down';
  return { pct: Math.abs(pct), dir, isGood };
}

// ── Metric definitions ────────────────────────────────────────────────────────
const METRICS = [
  { key: 'spend',          label: 'Total Spend',       fmt: fmtRM,  chartFmt: v => `RM ${parseFloat(v||0).toFixed(2)}`, higherBetter: null },
  { key: 'avgDailySpend',  label: 'Avg Daily Spend',   fmt: fmtRM,  chartFmt: v => `RM ${parseFloat(v||0).toFixed(2)}`, higherBetter: null },
  { key: 'waConvos',       label: 'Conversations',     fmt: fmtNum, chartFmt: v => Math.round(v),                       higherBetter: true  },
  { key: 'reach',          label: 'Reach',             fmt: fmtNum, chartFmt: v => Math.round(v),                       higherBetter: true  },
  { key: 'impressions',    label: 'Impressions',       fmt: fmtNum, chartFmt: v => Math.round(v),                       higherBetter: true  },
  { key: 'cpm',            label: 'CPM',               fmt: fmtRM,  chartFmt: v => `RM ${parseFloat(v||0).toFixed(2)}`, higherBetter: false },
  { key: 'clicks',         label: 'Clicks',            fmt: fmtNum, chartFmt: v => Math.round(v),                       higherBetter: true  },
  { key: 'ctr',            label: 'CTR',               fmt: fmtPct, chartFmt: v => `${parseFloat(v||0).toFixed(2)}%`,  higherBetter: true  },
  { key: 'cpc',            label: 'CPC',               fmt: fmtRM,  chartFmt: v => `RM ${parseFloat(v||0).toFixed(2)}`, higherBetter: false },
  { key: 'active',         label: 'Active Campaigns',  fmt: v => String(Math.round(v || 0)), chartFmt: null,            noCompare: true     },
];

const CHART_COLORS = ['#32cd32', '#f5a623', '#1A7FCC', '#ff4d4d', '#a78bfa'];
const AUDIENCE_COLORS = ['#32cd32', '#1A7FCC', '#f5a623', '#ff4d4d', '#a78bfa', '#06b6d4', '#f97316'];

const RANGES = [
  { value: '7d',        label: 'Last 7 days'  },
  { value: '14d',       label: 'Last 14 days' },
  { value: '30d',       label: 'Last 30 days' },
  { value: 'this_month',label: 'This month'   },
  { value: 'custom',    label: 'Custom'       },
];

// ── Change Badge ──────────────────────────────────────────────────────────────
function ChangeBadge({ curr, prev, higherBetter }) {
  const chg = calcChange(curr, prev, higherBetter);
  if (!chg) return null;
  const arrow  = chg.dir === 'up' ? '↑' : chg.dir === 'down' ? '↓' : '→';
  const color  = chg.isGood === null ? 'rgba(232,245,233,0.4)' : chg.isGood ? '#32cd32' : '#ff4d4d';
  const bg     = chg.isGood === null ? 'rgba(255,255,255,0.06)' : chg.isGood ? 'rgba(50,205,50,0.12)' : 'rgba(255,77,77,0.12)';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 6, padding: '2px 6px', whiteSpace: 'nowrap' }}>
      {arrow} {chg.pct.toFixed(1)}%
    </span>
  );
}

// ── Metric Card ───────────────────────────────────────────────────────────────
function MetricCard({ metric, value, prevValue, activeCampaignCount, active, onClick }) {
  const displayValue = metric.key === 'active' ? fmtNum(activeCampaignCount) : metric.fmt(value);
  const isActive = active;

  return (
    <div
      onClick={onClick}
      style={{
        ...mc.card,
        border: isActive ? '1.5px solid #32cd32' : '1px solid rgba(50,205,50,0.12)',
        background: isActive ? 'rgba(50,205,50,0.08)' : 'rgba(7,80,60,0.15)',
        cursor: 'pointer',
        boxShadow: isActive ? '0 0 0 3px rgba(50,205,50,0.12)' : undefined,
      }}
    >
      <div style={mc.label}>{metric.label}</div>
      <div style={mc.value}>{displayValue}</div>
      {!metric.noCompare && (
        <div style={mc.compare}>
          <ChangeBadge curr={parseFloat(value||0)} prev={parseFloat(prevValue||0)} higherBetter={metric.higherBetter} />
          {prevValue > 0 && <span style={mc.prevLabel}>vs prev</span>}
        </div>
      )}
      {metric.noCompare && (
        <div style={mc.compare}>
          <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.3)' }}>live status</span>
        </div>
      )}
      {isActive && <div style={mc.activeBar} />}
    </div>
  );
}

const mc = {
  card:      { padding: '14px 16px', borderRadius: 10, position: 'relative', transition: 'all 0.2s', overflow: 'hidden' },
  label:     { fontSize: 10, fontWeight: 600, color: 'rgba(232,245,233,0.45)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  value:     { fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, marginBottom: 8 },
  compare:   { display: 'flex', alignItems: 'center', gap: 6, minHeight: 18 },
  prevLabel: { fontSize: 10, color: 'rgba(232,245,233,0.25)' },
  activeBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: '#32cd32', borderRadius: '0 0 10px 10px' },
};

// ── Multi-metric Line Chart ───────────────────────────────────────────────────
function MetricLineChart({ daily, activeMetricKeys }) {
  if (!daily || daily.length === 0 || activeMetricKeys.length === 0) {
    return (
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(232,245,233,0.25)', fontSize: 13 }}>
        {activeMetricKeys.length === 0 ? 'Click metric cards above to plot on chart (max 3)' : 'No daily data available'}
      </div>
    );
  }

  // Build chart data with normalization (0-100 index per metric)
  const metricMaxes = {};
  activeMetricKeys.forEach(k => {
    metricMaxes[k] = Math.max(...daily.map(d => parseFloat(d[k] || 0)), 1);
  });

  const chartData = daily.map(d => {
    const row = { date: d.date_start?.slice(5) || d.date || '' };
    activeMetricKeys.forEach(k => {
      row[k]        = parseFloat(d[k] || 0);
      row[`${k}_n`] = (parseFloat(d[k] || 0) / metricMaxes[k]) * 100;
    });
    return row;
  });

  const metaDefs = METRICS.filter(m => activeMetricKeys.includes(m.key));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(50,205,50,0.08)" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(232,245,233,0.35)' }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'rgba(232,245,233,0.35)' }} tickLine={false} tickFormatter={v => `${Math.round(v)}`} />
        <Tooltip
          contentStyle={{ background: '#03140e', border: '1px solid rgba(50,205,50,0.2)', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: 'rgba(232,245,233,0.6)', marginBottom: 4 }}
          formatter={(val, name) => {
            const m = metaDefs.find(x => `${x.key}_n` === name);
            const actual = m ? chartData.find(d => d[`${m.key}_n`] === val)?.[m.key] : val;
            return [m ? m.chartFmt(actual) : val, m?.label || name];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={name => {
          const m = metaDefs.find(x => `${x.key}_n` === name);
          return <span style={{ color: 'rgba(232,245,233,0.7)' }}>{m?.label || name}</span>;
        }} />
        {metaDefs.map((m, i) => (
          <Line key={m.key} type="monotone" dataKey={`${m.key}_n`} stroke={CHART_COLORS[i]} strokeWidth={2}
            dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── AI Findings Row ───────────────────────────────────────────────────────────
const FINDING_COLORS = {
  warning:  { bg: 'rgba(245,166,35,0.08)', border: 'rgba(245,166,35,0.25)', title: '#f5a623', icon: '⚠' },
  positive: { bg: 'rgba(50,205,50,0.08)',  border: 'rgba(50,205,50,0.25)',  title: '#32cd32', icon: '✓' },
  info:     { bg: 'rgba(26,127,204,0.08)', border: 'rgba(26,127,204,0.25)', title: '#1A7FCC', icon: '◎' },
};

function AIFindingsRow({ findings, loading }) {
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0', color: 'rgba(232,245,233,0.4)', fontSize: 13 }}>
      <div className="spinner" style={{ width: 14, height: 14 }} /> Generating AI analysis…
    </div>
  );
  if (!findings || findings.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 0 16px', marginBottom: 4 }}>
      {findings.map((f, i) => {
        const style = FINDING_COLORS[f.type] || FINDING_COLORS.info;
        return (
          <div key={i} style={{
            flexShrink: 0, width: 240,
            background: style.bg, border: `1px solid ${style.border}`,
            borderRadius: 10, padding: '14px 16px'
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: style.title, marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span>{style.icon}</span>
              <span style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{f.title}</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(232,245,233,0.7)', lineHeight: 1.6 }}>{f.body}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Engagement Donut ──────────────────────────────────────────────────────────
function EngagementDonut({ reactions, comments, shares, saves }) {
  const total = reactions + comments + shares + saves;
  const data = [
    { name: 'Reactions', value: reactions },
    { name: 'Comments',  value: comments  },
    { name: 'Shares',    value: shares    },
    { name: 'Saves',     value: saves     },
  ].filter(d => d.value > 0);

  if (total === 0) return (
    <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(232,245,233,0.25)', fontSize: 12 }}>
      No engagement data
    </div>
  );

  return (
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={78} dataKey="value" paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={AUDIENCE_COLORS[i]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#03140e', border: '1px solid rgba(50,205,50,0.2)', borderRadius: 8, fontSize: 11 }}
            formatter={(v, n) => [fmtNum(v), n]} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{fmtNum(total)}</div>
        <div style={{ fontSize: 9, color: 'rgba(232,245,233,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8 }}>
        {data.map((d, i) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: AUDIENCE_COLORS[i] }} />
            <span style={{ color: 'rgba(232,245,233,0.5)' }}>{d.name}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtNum(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Conversion Funnel ─────────────────────────────────────────────────────────
function ConversionFunnel({ reach, clicks, messages, funnelType, videoP25, videoP50, videoP75, videoP100, videoAvgWatch }) {
  if (funnelType === 'video') {
    const steps = [
      { label: '25% Plays', value: videoP25  },
      { label: '50% Plays', value: videoP50  },
      { label: '75% Plays', value: videoP75  },
      { label: '100% Plays', value: videoP100 },
    ];
    const max = Math.max(videoP25, 1);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {steps.map((s, i) => {
          const prev  = i > 0 ? steps[i - 1].value : null;
          const rate  = prev && prev > 0 ? ((s.value / prev) * 100).toFixed(1) : null;
          const width = Math.max((s.value / max) * 100, 12);
          return (
            <React.Fragment key={s.label}>
              {rate && <div style={fn.rate}>↓ {rate}% retention</div>}
              <div style={{ ...fn.step, width: `${width}%`, background: CHART_COLORS[i] }}>
                <div style={fn.stepLabel}>{s.label}</div>
                <div style={fn.stepVal}>{fmtNum(s.value)}</div>
              </div>
            </React.Fragment>
          );
        })}
        {videoAvgWatch > 0 && (
          <div style={fn.watchTime}>Avg watch time: {fmtSec(videoAvgWatch)}</div>
        )}
      </div>
    );
  }

  const steps = [
    { label: 'Reach',    value: reach    },
    { label: 'Clicks',   value: clicks   },
    { label: 'Messages', value: messages },
  ];
  const max = Math.max(reach, 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {steps.map((s, i) => {
        const prev  = i > 0 ? steps[i - 1].value : null;
        const rate  = prev && prev > 0 ? ((s.value / prev) * 100).toFixed(2) : null;
        const width = Math.max((s.value / max) * 100, 12);
        return (
          <React.Fragment key={s.label}>
            {rate && <div style={fn.rate}>↓ {rate}% conversion</div>}
            <div style={{ ...fn.step, width: `${width}%`, background: ['#07503c', '#0a6b4e', '#32cd32'][i] }}>
              <div style={fn.stepLabel}>{s.label}</div>
              <div style={fn.stepVal}>{fmtNum(s.value)}</div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

const fn = {
  step:      { minWidth: 100, padding: '10px 20px', borderRadius: 6, textAlign: 'center', transition: 'width 0.5s ease' },
  stepLabel: { fontSize: 10, color: 'rgba(232,245,233,0.6)', textTransform: 'uppercase', letterSpacing: 0.6 },
  stepVal:   { fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 2 },
  rate:      { fontSize: 10, color: 'rgba(232,245,233,0.35)', letterSpacing: 0.3 },
  watchTime: { marginTop: 8, fontSize: 12, color: '#32cd32', fontWeight: 700 },
};

// ── Audience Bar Chart ────────────────────────────────────────────────────────
function AudienceBar({ data, labelKey, valueKey, horizontal, color }) {
  if (!data || data.length === 0) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(232,245,233,0.25)', fontSize: 11 }}>No data</div>
  );
  const sorted    = [...data].sort((a, b) => parseFloat(b[valueKey] || 0) - parseFloat(a[valueKey] || 0)).slice(0, 10);
  const formatted = sorted.map(d => ({ name: d[labelKey] || '—', val: parseFloat(d[valueKey] || 0) }));

  if (horizontal) {
    return (
      <ResponsiveContainer width="100%" height={Math.max(160, formatted.length * 28)}>
        <BarChart data={formatted} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(50,205,50,0.07)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 9, fill: 'rgba(232,245,233,0.3)' }} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'rgba(232,245,233,0.5)' }} tickLine={false} width={58} />
          <Tooltip contentStyle={{ background: '#03140e', border: '1px solid rgba(50,205,50,0.2)', borderRadius: 8, fontSize: 11 }} />
          <Bar dataKey="val" fill={color || '#32cd32'} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={formatted} margin={{ top: 0, right: 8, bottom: 20, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(50,205,50,0.07)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'rgba(232,245,233,0.4)' }} tickLine={false} angle={-30} textAnchor="end" />
        <YAxis tick={{ fontSize: 9, fill: 'rgba(232,245,233,0.3)' }} tickLine={false} />
        <Tooltip contentStyle={{ background: '#03140e', border: '1px solid rgba(50,205,50,0.2)', borderRadius: 8, fontSize: 11 }} />
        <Bar dataKey="val" radius={[3, 3, 0, 0]}>
          {formatted.map((_, i) => <Cell key={i} fill={AUDIENCE_COLORS[i % AUDIENCE_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function AudienceDonut({ data, labelKey, valueKey }) {
  const sorted  = [...(data || [])].sort((a, b) => parseFloat(b[valueKey]||0) - parseFloat(a[valueKey]||0));
  const entries = sorted.map(d => ({ name: d[labelKey] || '—', value: parseFloat(d[valueKey] || 0) })).filter(d => d.value > 0);
  if (entries.length === 0) return <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(232,245,233,0.25)', fontSize: 11 }}>No data</div>;
  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={entries} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={2}>
            {entries.map((_, i) => <Cell key={i} fill={AUDIENCE_COLORS[i % AUDIENCE_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#03140e', border: '1px solid rgba(50,205,50,0.2)', borderRadius: 8, fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap', marginTop: 6 }}>
        {entries.map((d, i) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: AUDIENCE_COLORS[i % AUDIENCE_COLORS.length] }} />
            <span style={{ color: 'rgba(232,245,233,0.5)' }}>{d.name}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtNum(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Action Widget ─────────────────────────────────────────────────────────────
function ActionWidget({ clientId, clientCode }) {
  const toast = useToast();
  const { user } = useAuth();
  const [open,   setOpen]   = useState(false);
  const [actions,setActions]= useState([]);
  const [form,   setForm]   = useState({ issue: '', metric: '', recommendation: '', severity: 'minor' });
  const [saving, setSaving] = useState(false);
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    try { setActions(await monitorAPI.actions(clientId)); } catch {}
  }, [clientId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open) return;
    const h = e => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.issue.trim()) return;
    setSaving(true);
    try {
      await monitorAPI.addAction(clientId, { ...form, clientCode });
      setForm({ issue: '', metric: '', recommendation: '', severity: 'minor' });
      await load();
      toast('Action added.', 'success');
    } catch { toast('Failed to add action.', 'error'); }
    finally { setSaving(false); }
  };

  const handleStatus = async (actionId, status) => {
    try { await monitorAPI.updateAction(actionId, { status }); await load(); } catch {}
  };

  const openCount = actions.filter(a => a.status === 'open' || a.status === 'in_progress').length;

  return (
    <>
      {/* Floating button */}
      <button onClick={() => setOpen(v => !v)} style={aw.fab} title="Action Board">
        ◉
        {openCount > 0 && <span style={aw.fabBadge}>{openCount}</span>}
      </button>

      {/* Slide-out panel */}
      {open && (
        <div ref={panelRef} style={aw.panel}>
          <div style={aw.panelHead}>
            <span style={aw.panelTitle}>Action Board</span>
            {clientCode && <span style={aw.panelClient}>{clientCode}</span>}
            <button onClick={() => setOpen(false)} style={aw.closeBtn}>✕</button>
          </div>

          <form onSubmit={handleAdd} style={aw.form}>
            <input className="form-input" placeholder="Issue *" value={form.issue} onChange={e => setForm(p => ({ ...p, issue: e.target.value }))} required style={{ marginBottom: 7 }} />
            <input className="form-input" placeholder="Metric (e.g. CTR, CPM)" value={form.metric} onChange={e => setForm(p => ({ ...p, metric: e.target.value }))} style={{ marginBottom: 7 }} />
            <input className="form-input" placeholder="Recommendation" value={form.recommendation} onChange={e => setForm(p => ({ ...p, recommendation: e.target.value }))} style={{ marginBottom: 7 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="form-input" style={{ flex: 1 }} value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}>
                <option value="minor">Minor</option>
                <option value="major">Major</option>
              </select>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? '…' : '+ Add'}</button>
            </div>
          </form>

          <div style={aw.list}>
            {actions.length === 0
              ? <div style={aw.empty}>No actions yet.</div>
              : actions.map(a => (
                  <div key={a.id} style={{ ...aw.item, borderLeft: `3px solid ${a.severity === 'major' ? '#ff4d4d' : '#f5a623'}` }}>
                    <div style={aw.itemIssue}>{a.issue}</div>
                    {a.recommendation && <div style={aw.itemRec}>{a.recommendation}</div>}
                    <div style={aw.itemMeta}>
                      <span style={{ color: { open:'#f5a623', in_progress:'#1A7FCC', done:'#32cd32', escalated:'#ff4d4d' }[a.status] || '#aaa', fontSize: 10, fontWeight: 700 }}>
                        {a.status.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.3)' }}>{a.createdBy}</span>
                    </div>
                    <div style={aw.itemBtns}>
                      {['open','in_progress','done','escalated'].map(s => (
                        <button key={s} onClick={() => handleStatus(a.id, s)} className="btn btn-ghost btn-sm"
                          style={{ fontSize: 9, padding: '2px 6px', opacity: a.status === s ? 1 : 0.4 }}>{s.replace('_', ' ')}</button>
                      ))}
                    </div>
                  </div>
                ))
            }
          </div>
        </div>
      )}
    </>
  );
}

const aw = {
  fab:       { position: 'fixed', bottom: 28, right: 28, width: 48, height: 48, borderRadius: '50%', background: '#32cd32', color: '#03140e', border: 'none', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, boxShadow: '0 4px 16px rgba(50,205,50,0.4)', fontWeight: 900 },
  fabBadge:  { position: 'absolute', top: -4, right: -4, background: '#ff4d4d', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg)' },
  panel:     { position: 'fixed', bottom: 86, right: 28, width: 320, maxHeight: '70vh', background: 'var(--card-bg,#0a1f16)', border: '1px solid rgba(50,205,50,0.2)', borderRadius: 12, display: 'flex', flexDirection: 'column', zIndex: 299, boxShadow: '0 8px 40px rgba(0,0,0,0.5)', overflow: 'hidden' },
  panelHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(50,205,50,0.1)', background: 'rgba(7,80,60,0.3)', flexShrink: 0 },
  panelTitle:{ fontSize: 12, fontWeight: 800, color: '#32cd32', letterSpacing: 1, textTransform: 'uppercase', flex: 1 },
  panelClient:{ fontSize: 10, color: 'rgba(232,245,233,0.4)', fontWeight: 700 },
  closeBtn:  { background: 'none', border: 'none', color: 'rgba(232,245,233,0.4)', cursor: 'pointer', fontSize: 12 },
  form:      { padding: '12px 16px', borderBottom: '1px solid rgba(50,205,50,0.08)', flexShrink: 0 },
  list:      { overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 },
  empty:     { color: 'rgba(232,245,233,0.25)', fontSize: 12, textAlign: 'center', padding: '16px 0' },
  item:      { background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 7, padding: '10px 12px' },
  itemIssue: { fontSize: 12, color: 'rgba(232,245,233,0.85)', fontWeight: 600, marginBottom: 3 },
  itemRec:   { fontSize: 11, color: 'rgba(232,245,233,0.4)', fontStyle: 'italic', marginBottom: 5 },
  itemMeta:  { display: 'flex', gap: 10, marginBottom: 6 },
  itemBtns:  { display: 'flex', gap: 4, flexWrap: 'wrap' },
};

// ── Client Panel ──────────────────────────────────────────────────────────────
function ClientPanel({ clients, selectedId, onSelect, collapsed, onToggleCollapse, selectedBranch, onSelectBranch }) {
  const w = collapsed ? 48 : 200;
  return (
    <div style={{ ...cp.panel, width: w, minWidth: w, maxWidth: w }}>
      <button onClick={onToggleCollapse} style={cp.collapseBtn} title={collapsed ? 'Expand' : 'Collapse'}>
        <span style={{ display: 'inline-block', transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>‹</span>
      </button>

      {!collapsed && <div style={cp.heading}>Clients</div>}

      <div style={cp.list}>
        {clients.map(c => {
          const isSelected = c.id === selectedId;
          return (
            <div key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                style={{
                  ...cp.item,
                  background: isSelected ? 'rgba(50,205,50,0.12)' : 'transparent',
                  border: isSelected ? '1px solid rgba(50,205,50,0.3)' : '1px solid transparent',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                }}
                title={collapsed ? c.name : ''}
              >
                <span style={{ ...cp.avatar, background: isSelected ? '#32cd32' : '#1a3a2a', color: isSelected ? '#03140e' : '#32cd32' }}>
                  {c.clientCode?.[0]}
                </span>
                {!collapsed && (
                  <div style={{ overflow: 'hidden' }}>
                    <div style={cp.code}>{c.clientCode}</div>
                    <div style={cp.name}>{c.name}</div>
                  </div>
                )}
              </button>
              {/* VK Branch filter */}
              {isSelected && c.clientCode === 'VK' && !collapsed && (
                <div style={cp.branches}>
                  {['ALL', 'KL', 'RC', 'CR'].map(b => (
                    <button key={b} onClick={() => onSelectBranch(b)}
                      style={{ ...cp.branch, background: selectedBranch === b ? '#32cd32' : 'rgba(50,205,50,0.08)', color: selectedBranch === b ? '#03140e' : '#32cd32' }}>
                      {b}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const cp = {
  panel:       { background: '#03140e', borderRight: '1px solid rgba(50,205,50,0.12)', display: 'flex', flexDirection: 'column', padding: '60px 0 16px', position: 'relative', transition: 'width 0.25s ease', flexShrink: 0, overflowX: 'hidden' },
  collapseBtn: { position: 'absolute', top: 14, right: -12, width: 24, height: 24, borderRadius: '50%', background: '#32cd32', color: '#03140e', border: 'none', fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  heading:     { fontSize: 9, fontWeight: 800, color: 'rgba(50,205,50,0.4)', letterSpacing: 2.5, textTransform: 'uppercase', padding: '0 14px', marginBottom: 10 },
  list:        { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 6px', overflowY: 'auto', flex: 1 },
  item:        { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 6px', borderRadius: 8, cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden' },
  avatar:      { width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, transition: 'all 0.15s' },
  code:        { fontSize: 10, fontWeight: 800, color: '#32cd32', letterSpacing: 1.2 },
  name:        { fontSize: 11, color: 'rgba(232,245,233,0.6)', overflow: 'hidden', textOverflow: 'ellipsis' },
  branches:    { display: 'flex', gap: 4, padding: '4px 8px 8px', flexWrap: 'wrap' },
  branch:      { fontSize: 9, fontWeight: 800, borderRadius: 4, padding: '3px 7px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', letterSpacing: 0.5 },
};

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children, right }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(50,205,50,0.6)', letterSpacing: 2, textTransform: 'uppercase' }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdsMonitor() {
  const toast  = useToast();
  const { user } = useAuth();

  // Layout
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Clients
  const [clients,     setClients]     = useState([]);
  const [selectedId,  setSelectedId]  = useState(null);
  const [selectedBranch, setSelectedBranch] = useState('ALL');

  // Data
  const [clientData,    setClientData]    = useState(null);
  const [audienceData,  setAudienceData]  = useState(null);
  const [loadingMain,   setLoadingMain]   = useState(false);
  const [loadingAudience, setLoadingAudience] = useState(false);

  // Date range
  const [range,       setRange]       = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');

  // Line chart
  const [activeMetrics, setActiveMetrics] = useState([]);

  // AI
  const [showAI,     setShowAI]     = useState(false);
  const [aiFindings, setAiFindings] = useState(null);
  const [loadingAI,  setLoadingAI]  = useState(false);
  const [aiConfirm,  setAiConfirm]  = useState(false);
  const [aiCtx,      setAiCtx]      = useState('');

  // Engagement funnel
  const [funnelType, setFunnelType] = useState('conversion');

  // Audience metric
  const [audienceMetric, setAudienceMetric] = useState('impressions');

  const rangeParams = useMemo(() => (
    range === 'custom' && customStart && customEnd
      ? { dateStart: customStart, dateStop: customEnd }
      : { range }
  ), [range, customStart, customEnd]);

  // Load client list
  useEffect(() => {
    const load = async () => {
      try {
        const data = await monitorAPI.overview(rangeParams);
        const list = (data.cards || []).filter(c => !c.error);
        setClients(list);
        if (!selectedId && list.length > 0) setSelectedId(list[0].id);
      } catch (err) {
        toast(err.response?.data?.error || 'Failed to load clients.', 'error');
      }
    };
    load();
  }, []);

  // Load main client data when selection or range changes
  useEffect(() => {
    if (!selectedId) return;
    const load = async () => {
      setLoadingMain(true);
      setClientData(null);
      setAiFindings(null);
      setShowAI(false);
      setActiveMetrics([]);
      try {
        const data = await monitorAPI.client(selectedId, rangeParams);
        setClientData(data);
      } catch (err) {
        toast(err.response?.data?.error || 'Failed to load client data.', 'error');
      } finally { setLoadingMain(false); }
    };
    load();
  }, [selectedId, JSON.stringify(rangeParams)]);

  // Load audience data separately
  useEffect(() => {
    if (!selectedId) return;
    const load = async () => {
      setLoadingAudience(true);
      setAudienceData(null);
      try {
        const data = await monitorAPI.audience(selectedId, rangeParams);
        setAudienceData(data);
      } catch { /* audience section shows empty state */ }
      finally { setLoadingAudience(false); }
    };
    load();
  }, [selectedId, JSON.stringify(rangeParams)]);

  const handleSelectClient = (id) => {
    setSelectedId(id);
    setSelectedBranch('ALL');
  };

  const toggleMetric = (key) => {
    setActiveMetrics(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 3)   return [...prev.slice(1), key];
      return [...prev, key];
    });
  };

  const handleAIClick = () => {
    if (!showAI) { setAiConfirm(true); return; }
    setShowAI(false);
    setAiFindings(null);
  };

  const handleAIConfirm = async () => {
    setAiConfirm(false);
    setShowAI(true);
    setLoadingAI(true);
    setAiFindings(null);
    try {
      const res = await monitorAPI.diagnose(selectedId, { ...rangeParams, context: aiCtx || undefined });
      setAiFindings(res.findings || []);
    } catch (err) {
      toast(err.response?.data?.error || 'AI diagnosis failed.', 'error');
      setShowAI(false);
    } finally { setLoadingAI(false); }
  };

  // Build display totals (branch-aware)
  const displayTotals = useMemo(() => {
    if (!clientData) return null;
    const { totals, branches } = clientData;
    if (selectedBranch === 'ALL' || !branches || !branches[selectedBranch]) return totals;
    const b = branches[selectedBranch];
    const ctr = b.impressions > 0 ? b.clicks / b.impressions * 100 : 0;
    const cpm = b.impressions > 0 ? b.spend  / b.impressions * 1000 : 0;
    const cpc = b.clicks      > 0 ? b.spend  / b.clicks : 0;
    const days = clientData.daily?.length || 1;
    return { ...totals, spend: b.spend, impressions: b.impressions, clicks: b.clicks, ctr, cpm, cpc, waConvos: b.results, primaryResults: b.results, avgDailySpend: b.spend / days };
  }, [clientData, selectedBranch]);

  const displayPrevTotals = clientData?.prevTotals;

  // Process daily data for chart
  const chartDaily = useMemo(() => {
    if (!clientData?.daily) return [];
    return clientData.daily.map(d => ({
      date_start:   d.date_start,
      spend:        parseFloat(d.spend        || 0),
      reach:        parseFloat(d.reach        || 0),
      impressions:  parseFloat(d.impressions  || 0),
      clicks:       parseFloat(d.clicks       || 0),
      ctr:          parseFloat(d.ctr          || 0),
      cpm:          parseFloat(d.cpm          || 0),
      cpc:          parseFloat(d.cpc          || 0),
      waConvos:     extractFromActions(d.actions, 'onsite_conversion.messaging_first_reply'),
    }));
  }, [clientData]);

  const selectedClient = clients.find(c => c.id === selectedId);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Inner client panel */}
      <ClientPanel
        clients={clients}
        selectedId={selectedId}
        onSelect={handleSelectClient}
        collapsed={panelCollapsed}
        onToggleCollapse={() => setPanelCollapsed(v => !v)}
        selectedBranch={selectedBranch}
        onSelectBranch={setSelectedBranch}
      />

      {/* Main content */}
      <div style={{ flex: 1, overflowX: 'hidden', padding: '28px 32px' }} className="fade-up">

        {/* Page header */}
        <div style={pg.header}>
          <div>
            <h1 style={pg.title}>Analytic</h1>
            <p style={pg.sub}>{selectedClient ? `${selectedClient.clientCode} — ${selectedClient.name}` : 'Select a client'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* AI button */}
            <button
              className={`btn ${showAI ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={handleAIClick}
              disabled={!clientData || loadingAI}
              style={{ borderColor: showAI ? '#32cd32' : undefined }}
            >
              {loadingAI ? <><div className="spinner" style={{ width: 10, height: 10 }} /> Analysing…</> : showAI ? '✕ Hide AI' : '◎ AI Analyse'}
            </button>
          </div>
        </div>

        {/* AI confirm dialog */}
        {aiConfirm && (
          <div style={pg.confirmBox}>
            <div style={pg.confirmText}>
              ⚠ Running AI diagnosis uses API tokens (costs money). Confirm to proceed?
            </div>
            <div style={{ marginBottom: 12 }}>
              <input className="form-input" placeholder="Optional: add context for AI…" value={aiCtx} onChange={e => setAiCtx(e.target.value)} style={{ marginTop: 8 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={handleAIConfirm}>Confirm</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAiConfirm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Date range bar */}
        <div style={pg.rangeBar}>
          {RANGES.map(r => (
            <button key={r.value} onClick={() => setRange(r.value)} className="btn btn-ghost btn-sm"
              style={{ borderColor: range === r.value ? 'rgba(50,205,50,0.5)' : undefined, color: range === r.value ? '#32cd32' : undefined }}>
              {r.label}
            </button>
          ))}
          {range === 'custom' && (
            <>
              <input type="date" className="form-input" style={{ width: 140 }} value={customStart} onChange={e => setCustomStart(e.target.value)} />
              <span style={{ color: 'rgba(232,245,233,0.4)', alignSelf: 'center' }}>→</span>
              <input type="date" className="form-input" style={{ width: 140 }} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </>
          )}
          {clientData?.dateStart && (
            <span style={{ fontSize: 11, color: 'rgba(232,245,233,0.25)', marginLeft: 8, alignSelf: 'center' }}>
              {clientData.dateStart} → {clientData.dateStop}
              {clientData.cachedAt && ` · cached ${new Date(clientData.cachedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          )}
        </div>

        {loadingMain ? (
          <div style={{ padding: 80, textAlign: 'center' }}><div className="spinner" /></div>
        ) : !clientData ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'rgba(232,245,233,0.25)' }}>Select a client to view analytics</div>
        ) : (
          <>
            {/* ── PERFORMANCE SECTION ── */}
            <Section title="Performance" right={
              clientData?.prevDateStart && (
                <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.3)' }}>
                  vs {clientData.prevDateStart} → {clientData.prevDateStop}
                </span>
              )
            }>
              {/* AI Findings */}
              {showAI && <AIFindingsRow findings={aiFindings} loading={loadingAI} />}

              {/* Metric cards grid */}
              <div style={pg.metricGrid}>
                {METRICS.map(m => (
                  <MetricCard
                    key={m.key}
                    metric={m}
                    value={m.key === 'active' ? clientData.activeCampaignCount : displayTotals?.[m.key]}
                    prevValue={m.key === 'active' ? null : displayPrevTotals?.[m.key]}
                    activeCampaignCount={clientData.activeCampaignCount}
                    active={activeMetrics.includes(m.key)}
                    onClick={() => m.chartFmt !== null && toggleMetric(m.key)}
                  />
                ))}
              </div>

              {/* Line chart */}
              <div className="glass" style={{ padding: '16px 20px', marginTop: 16, borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: 'rgba(232,245,233,0.35)', marginBottom: 8 }}>
                  {activeMetrics.length === 0
                    ? 'Click metric cards to plot on chart (max 3 at a time)'
                    : `Plotting: ${activeMetrics.map(k => METRICS.find(m => m.key === k)?.label).join(' · ')}`}
                </div>
                <MetricLineChart daily={chartDaily} activeMetricKeys={activeMetrics} />
              </div>
            </Section>

            {/* ── ENGAGEMENT SECTION ── */}
            <Section title="Engagement">
              <div style={pg.engagementGrid}>
                {/* Post engagement donut */}
                <div className="glass" style={pg.engCard}>
                  <div style={pg.engCardTitle}>Post Engagement</div>
                  <EngagementDonut
                    reactions={displayTotals?.reactions || 0}
                    comments={displayTotals?.comments || 0}
                    shares={displayTotals?.shares || 0}
                    saves={displayTotals?.saves || 0}
                  />
                </div>

                {/* Engagement metric cards */}
                <div className="glass" style={pg.engCard}>
                  <div style={pg.engCardTitle}>Engagement Metrics</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'Video Views',     value: fmtNum(displayTotals?.videoViews    || 0) },
                      { label: 'Page Engagement', value: fmtNum(displayTotals?.pageEngagement|| 0) },
                      { label: 'FB Page Likes',   value: fmtNum(displayTotals?.pageLikes     || 0) },
                      { label: 'IG Follows',      value: fmtNum(displayTotals?.igFollows     || 0) },
                      { label: 'Avg Watch Time',  value: fmtSec(displayTotals?.videoAvgWatch || 0) },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 12, color: 'rgba(232,245,233,0.5)' }}>{item.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Funnel */}
                <div className="glass" style={pg.engCard}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={pg.engCardTitle}>Conversion Funnel</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[{ key: 'conversion', label: 'WA' }, { key: 'video', label: 'Video' }].map(t => (
                        <button key={t.key} onClick={() => setFunnelType(t.key)} className="btn btn-ghost btn-sm"
                          style={{ fontSize: 10, padding: '3px 8px', borderColor: funnelType === t.key ? '#32cd32' : undefined, color: funnelType === t.key ? '#32cd32' : undefined }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ConversionFunnel
                    reach={displayTotals?.reach || 0}
                    clicks={displayTotals?.clicks || 0}
                    messages={displayTotals?.waConvos || 0}
                    funnelType={funnelType}
                    videoP25={displayTotals?.videoP25 || 0}
                    videoP50={displayTotals?.videoP50 || 0}
                    videoP75={displayTotals?.videoP75 || 0}
                    videoP100={displayTotals?.videoP100 || 0}
                    videoAvgWatch={displayTotals?.videoAvgWatch || 0}
                  />
                </div>
              </div>
            </Section>

            {/* ── AUDIENCE SECTION ── */}
            <Section title="Audience" right={
              <select className="form-input" style={{ padding: '4px 10px', fontSize: 11, width: 140 }}
                value={audienceMetric} onChange={e => setAudienceMetric(e.target.value)}>
                {['impressions','clicks','spend','reach','ctr','cpm','cpc'].map(k => (
                  <option key={k} value={k}>{k.toUpperCase()}</option>
                ))}
              </select>
            }>
              {loadingAudience ? (
                <div style={{ padding: 48, textAlign: 'center' }}><div className="spinner" /></div>
              ) : !audienceData ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'rgba(232,245,233,0.25)', fontSize: 12 }}>Audience data unavailable</div>
              ) : (
                <>
                  {/* Row 1: Gender + Age */}
                  <div style={pg.audienceRow}>
                    <div className="glass" style={pg.audienceCard}>
                      <div style={pg.audienceCardTitle}>Gender</div>
                      <AudienceDonut data={audienceData.gender} labelKey="gender" valueKey={audienceMetric} />
                    </div>
                    <div className="glass" style={{ ...pg.audienceCard, flex: 2 }}>
                      <div style={pg.audienceCardTitle}>Age Group</div>
                      <AudienceBar data={audienceData.age} labelKey="age" valueKey={audienceMetric} color="#32cd32" />
                    </div>
                  </div>

                  {/* Row 2: Platform + Device */}
                  <div style={pg.audienceRow}>
                    <div className="glass" style={pg.audienceCard}>
                      <div style={pg.audienceCardTitle}>Platform</div>
                      <AudienceBar data={audienceData.platform} labelKey="publisher_platform" valueKey={audienceMetric} color="#1A7FCC" />
                    </div>
                    <div className="glass" style={pg.audienceCard}>
                      <div style={pg.audienceCardTitle}>Device</div>
                      <AudienceBar data={audienceData.device} labelKey="impression_device" valueKey={audienceMetric} color="#f5a623" />
                    </div>
                  </div>

                  {/* Row 3: Region */}
                  <div className="glass" style={{ padding: '18px 20px', borderRadius: 12 }}>
                    <div style={pg.audienceCardTitle}>Region (Top 10)</div>
                    <AudienceBar data={audienceData.region} labelKey="region" valueKey={audienceMetric} horizontal color="#a78bfa" />
                  </div>
                </>
              )}
            </Section>
          </>
        )}
      </div>

      {/* Action Widget — only when client is selected */}
      {selectedId && (
        <ActionWidget clientId={selectedId} clientCode={selectedClient?.clientCode} />
      )}
    </div>
  );
}

const pg = {
  header:          { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  title:           { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 },
  sub:             { fontSize: 12, color: 'var(--text-muted)', marginTop: 3 },
  rangeBar:        { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' },
  metricGrid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 },
  engagementGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },
  engCard:         { padding: '18px 20px', borderRadius: 12 },
  engCardTitle:    { fontSize: 11, fontWeight: 700, color: 'rgba(50,205,50,0.6)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 },
  audienceRow:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 14 },
  audienceCard:    { padding: '18px 20px', borderRadius: 12, flex: 1 },
  audienceCardTitle:{ fontSize: 10, fontWeight: 700, color: 'rgba(50,205,50,0.5)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },
  confirmBox:      { background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 },
  confirmText:     { fontSize: 13, color: 'rgba(232,245,233,0.8)', marginBottom: 8, fontWeight: 600 },
};
