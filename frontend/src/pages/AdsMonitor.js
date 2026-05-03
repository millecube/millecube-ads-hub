import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
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
const fmtDec = v => parseFloat(v || 0).toFixed(2);

function extractFromActions(actions, type) {
  if (!Array.isArray(actions)) return 0;
  const f = actions.find(a => a.action_type === type);
  return f ? parseFloat(f.value || 0) : 0;
}

function calcChange(curr, prev, higherBetter) {
  if (!prev || prev === 0) return null;
  const pct  = ((curr - prev) / Math.abs(prev)) * 100;
  const dir  = curr > prev ? 'up' : curr < prev ? 'down' : 'flat';
  const isGood = higherBetter === null ? null : higherBetter ? dir === 'up' : dir === 'down';
  return { pct: Math.abs(pct), dir, isGood };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const METRICS = [
  { key: 'spend',          label: 'Total Spend',     fmt: fmtRM,  chartFmt: v => `RM ${parseFloat(v||0).toFixed(2)}`, higherBetter: null  },
  { key: 'avgDailySpend',  label: 'Avg Daily Spend', fmt: fmtRM,  chartFmt: null,                                      higherBetter: null  },
  { key: 'costPerMessage', label: 'Cost / Message',  fmt: fmtRM,  chartFmt: v => `RM ${parseFloat(v||0).toFixed(2)}`, higherBetter: false },
  { key: 'frequency',      label: 'Frequency',       fmt: fmtDec, chartFmt: fmtDec,                                   higherBetter: false },
  { key: 'waConvos',       label: 'Conversations',   fmt: fmtNum, chartFmt: v => String(Math.round(v)),               higherBetter: true  },
  { key: 'reach',          label: 'Reach',           fmt: fmtNum, chartFmt: v => String(Math.round(v)),               higherBetter: true  },
  { key: 'impressions',    label: 'Impressions',     fmt: fmtNum, chartFmt: v => String(Math.round(v)),               higherBetter: true  },
  { key: 'cpm',            label: 'CPM',             fmt: fmtRM,  chartFmt: v => `RM ${parseFloat(v||0).toFixed(2)}`, higherBetter: false },
  { key: 'clicks',         label: 'Clicks',          fmt: fmtNum, chartFmt: v => String(Math.round(v)),               higherBetter: true  },
  { key: 'ctr',            label: 'CTR',             fmt: fmtPct, chartFmt: v => `${parseFloat(v||0).toFixed(2)}%`,  higherBetter: true  },
  { key: 'cpc',            label: 'CPC',             fmt: fmtRM,  chartFmt: v => `RM ${parseFloat(v||0).toFixed(2)}`, higherBetter: false },
  { key: 'active',         label: 'Active Campaigns',fmt: v => String(Math.round(v || 0)), chartFmt: null,            noCompare: true     },
];

const AUDIENCE_METRICS = [
  { key: 'impressions', label: 'Impressions', fmt: fmtNum },
  { key: 'reach',       label: 'Reach',       fmt: fmtNum },
  { key: 'spend',       label: 'Spend',       fmt: fmtRMS },
  { key: 'clicks',      label: 'Clicks',      fmt: fmtNum },
];

const COMBO_DIMS = [
  { key: 'age',      label: 'Age',      dataKey: 'age'                },
  { key: 'platform', label: 'Platform', dataKey: 'publisher_platform' },
  { key: 'device',   label: 'Device',   dataKey: 'impression_device'  },
  { key: 'gender',   label: 'Gender',   dataKey: 'gender'             },
  { key: 'region',   label: 'Region',   dataKey: 'region'             },
];

const COMBO_METRIC_DEFS = [
  { key: 'impressions', label: 'Impressions', fmt: fmtNum },
  { key: 'reach',       label: 'Reach',       fmt: fmtNum },
  { key: 'clicks',      label: 'Clicks',      fmt: fmtNum },
  { key: 'spend',       label: 'Spend',       fmt: fmtRMS },
  { key: 'ctr',         label: 'CTR',         fmt: v => `${parseFloat(v||0).toFixed(2)}%` },
  { key: 'cpm',         label: 'CPM',         fmt: fmtRM  },
  { key: 'cpc',         label: 'CPC',         fmt: fmtRM  },
];

const CHART_COLORS    = ['#32cd32', '#f5a623', '#1A7FCC', '#ff4d4d', '#a78bfa'];
const AUDIENCE_COLORS = ['#32cd32', '#1A7FCC', '#f5a623', '#ff4d4d', '#a78bfa', '#06b6d4', '#f97316'];

const RANGES = [
  { value: 'today',      label: 'Today'        },
  { value: 'yesterday',  label: 'Yesterday'    },
  { value: '7d',         label: 'Last 7 days'  },
  { value: '14d',        label: 'Last 14 days' },
  { value: '30d',        label: 'Last 30 days' },
  { value: 'this_month', label: 'This month'   },
  { value: 'custom',     label: 'Custom'       },
];

const TOOLTIP_STYLE = { background: '#03140e', border: '1px solid rgba(50,205,50,0.2)', borderRadius: 8, fontSize: 11 };

// ── Change Badge ──────────────────────────────────────────────────────────────
function ChangeBadge({ curr, prev, higherBetter }) {
  const chg = calcChange(curr, prev, higherBetter);
  if (!chg) return null;
  const arrow = chg.dir === 'up' ? '↑' : chg.dir === 'down' ? '↓' : '→';
  const color = chg.isGood === null ? 'rgba(232,245,233,0.4)' : chg.isGood ? '#32cd32' : '#ff4d4d';
  const bg    = chg.isGood === null ? 'rgba(255,255,255,0.06)' : chg.isGood ? 'rgba(50,205,50,0.12)' : 'rgba(255,77,77,0.12)';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 6, padding: '2px 6px', whiteSpace: 'nowrap' }}>
      {arrow} {chg.pct.toFixed(1)}%
    </span>
  );
}

// ── Metric Card ───────────────────────────────────────────────────────────────
function MetricCard({ metric, value, prevValue, activeCampaignCount, active, onClick }) {
  const displayValue = metric.key === 'active' ? fmtNum(activeCampaignCount) : metric.fmt(value);
  return (
    <div onClick={onClick} style={{
      ...mc.card,
      border: active ? '1.5px solid #32cd32' : '1px solid rgba(50,205,50,0.12)',
      background: active ? 'rgba(50,205,50,0.08)' : 'rgba(7,80,60,0.15)',
      cursor: metric.chartFmt !== null ? 'pointer' : 'default',
      boxShadow: active ? '0 0 0 3px rgba(50,205,50,0.12)' : undefined,
    }}>
      <div style={mc.label}>{metric.label}</div>
      <div style={mc.value}>{displayValue}</div>
      {!metric.noCompare ? (
        <div style={mc.compare}>
          <ChangeBadge curr={parseFloat(value || 0)} prev={parseFloat(prevValue || 0)} higherBetter={metric.higherBetter} />
          {parseFloat(prevValue || 0) > 0 && <span style={mc.prevLabel}>vs prev</span>}
        </div>
      ) : (
        <div style={mc.compare}>
          <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.3)' }}>live status</span>
        </div>
      )}
      {active && <div style={mc.activeBar} />}
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
function MetricLineChart({ daily, prevDaily, activeMetricKeys, showPrevPeriod }) {
  if (!daily || daily.length === 0 || activeMetricKeys.length === 0) {
    return (
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(232,245,233,0.25)', fontSize: 13 }}>
        {activeMetricKeys.length === 0 ? 'Click metric cards above to plot on chart (max 3)' : 'No daily data'}
      </div>
    );
  }

  const metricMaxes = {};
  activeMetricKeys.forEach(k => {
    const vals = [
      ...daily.map(d => parseFloat(d[k] || 0)),
      ...(showPrevPeriod && prevDaily?.length ? prevDaily.map(d => parseFloat(d[k] || 0)) : []),
    ];
    metricMaxes[k] = Math.max(...vals, 1);
  });

  const chartData = daily.map((d, idx) => {
    const row = { date: d.date_start?.slice(5) || '' };
    activeMetricKeys.forEach(k => {
      row[k]        = parseFloat(d[k] || 0);
      row[`${k}_n`] = (parseFloat(d[k] || 0) / metricMaxes[k]) * 100;
    });
    if (showPrevPeriod && prevDaily?.[idx]) {
      activeMetricKeys.forEach(k => {
        row[`p_${k}`]   = parseFloat(prevDaily[idx][k] || 0);
        row[`p_${k}_n`] = (parseFloat(prevDaily[idx][k] || 0) / metricMaxes[k]) * 100;
      });
    }
    return row;
  });

  const metaDefs = METRICS.filter(m => activeMetricKeys.includes(m.key));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(50,205,50,0.08)" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(232,245,233,0.35)' }} tickLine={false} />
        <YAxis domain={[0, 105]} tick={{ fontSize: 10, fill: 'rgba(232,245,233,0.35)' }} tickLine={false} tickFormatter={v => `${Math.round(v)}`} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: 'rgba(232,245,233,0.6)', marginBottom: 4 }}
          formatter={(val, name) => {
            const isPrev = name.startsWith('p_');
            const key    = (isPrev ? name.slice(2) : name).replace('_n', '');
            const m      = metaDefs.find(x => x.key === key);
            const rawKey = isPrev ? `p_${key}` : key;
            const row    = chartData.find(d => d[name] === val);
            const actual = row?.[rawKey] ?? val;
            return [m ? m.chartFmt(actual) : actual, m ? `${m.label}${isPrev ? ' (prev)' : ''}` : name];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={name => {
          const isPrev = name.startsWith('p_');
          const key    = (isPrev ? name.slice(2) : name).replace('_n', '');
          const m      = metaDefs.find(x => x.key === key);
          return <span style={{ color: 'rgba(232,245,233,0.7)' }}>{m?.label || name}{isPrev ? ' ···' : ''}</span>;
        }} />
        {metaDefs.map((m, i) => (
          <React.Fragment key={m.key}>
            <Line type="monotone" dataKey={`${m.key}_n`} stroke={CHART_COLORS[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            {showPrevPeriod && prevDaily?.length > 0 && (
              <Line type="monotone" dataKey={`p_${m.key}_n`} stroke={CHART_COLORS[i]} strokeWidth={1.5} strokeDasharray="5 3" dot={false} opacity={0.45} />
            )}
          </React.Fragment>
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── AI Findings Row ───────────────────────────────────────────────────────────
const FINDING_COLORS = {
  warning:  { bg: 'rgba(245,166,35,0.08)',  border: 'rgba(245,166,35,0.25)', title: '#f5a623', icon: '⚠' },
  positive: { bg: 'rgba(50,205,50,0.08)',   border: 'rgba(50,205,50,0.25)',  title: '#32cd32', icon: '✓' },
  info:     { bg: 'rgba(26,127,204,0.08)',  border: 'rgba(26,127,204,0.25)', title: '#1A7FCC', icon: '◎' },
};

function AIFindingsRow({ findings, loading }) {
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0', color: 'rgba(232,245,233,0.4)', fontSize: 13 }}>
      <div className="spinner" style={{ width: 14, height: 14 }} /> Generating AI analysis…
    </div>
  );
  if (!findings || findings.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 0 16px' }}>
      {findings.map((f, i) => {
        const s = FINDING_COLORS[f.type] || FINDING_COLORS.info;
        return (
          <div key={i} style={{ flexShrink: 0, width: 240, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: s.title, marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span>{s.icon}</span>
              <span style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{f.title}</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(232,245,233,0.7)', lineHeight: 1.6 }}>{f.body}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Post Engagement Bar ───────────────────────────────────────────────────────
function PostEngagementBar({ reactions, comments, shares, saves, postEngagement }) {
  const data = [
    { name: 'Reactions', value: reactions },
    { name: 'Comments',  value: comments  },
    { name: 'Shares',    value: shares    },
    { name: 'Saves',     value: saves     },
  ].filter(d => d.value > 0);

  return (
    <div>
      {data.length === 0 ? (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(232,245,233,0.25)', fontSize: 12 }}>No engagement data</div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 64 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(50,205,50,0.07)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 9, fill: 'rgba(232,245,233,0.3)' }} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'rgba(232,245,233,0.55)' }} tickLine={false} width={62} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [fmtNum(v), n]} />
            <Bar dataKey="value" radius={[0, 3, 3, 0]}>
              {data.map((_, i) => <Cell key={i} fill={AUDIENCE_COLORS[i % AUDIENCE_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <div style={{ marginTop: 12, padding: '9px 14px', background: 'rgba(50,205,50,0.07)', borderRadius: 8, border: '1px solid rgba(50,205,50,0.18)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.45)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>Total Post Engagement</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#32cd32' }}>{fmtNum(postEngagement)}</span>
      </div>
    </div>
  );
}

// ── Video Milestone Boxes ─────────────────────────────────────────────────────
function VideoMilestoneBoxes({ videoP25, videoP50, videoP75, videoP100, videoAvgWatch }) {
  const steps = [
    { label: '25% Plays',  value: videoP25,  color: CHART_COLORS[0] },
    { label: '50% Plays',  value: videoP50,  color: CHART_COLORS[1] },
    { label: '75% Plays',  value: videoP75,  color: CHART_COLORS[2] },
    { label: '100% Plays', value: videoP100, color: CHART_COLORS[3] },
  ];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : null;
          const drop = prev && prev > 0 ? ((s.value / prev) * 100).toFixed(1) : null;
          return (
            <div key={s.label} style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: `1px solid ${s.color}33` }}>
              <div style={{ fontSize: 9, color: 'rgba(232,245,233,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{fmtNum(s.value)}</div>
              {drop && <div style={{ fontSize: 9, color: 'rgba(232,245,233,0.3)', marginTop: 3 }}>↓ {drop}% retention</div>}
            </div>
          );
        })}
      </div>
      {videoAvgWatch > 0 && (
        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: '#32cd32', fontWeight: 700 }}>
          Avg watch time: {fmtSec(videoAvgWatch)}
        </div>
      )}
    </div>
  );
}

// ── Conversion Funnel (WA) ────────────────────────────────────────────────────
function ConversionFunnel({ reach, clicks, messages }) {
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
            <div style={{ ...fn.step, width: `${width}%`, background: ['#07503c','#0a6b4e','#32cd32'][i] }}>
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
  step:      { minWidth: 80, padding: '10px 20px', borderRadius: 6, textAlign: 'center', transition: 'width 0.5s ease' },
  stepLabel: { fontSize: 10, color: 'rgba(232,245,233,0.6)', textTransform: 'uppercase', letterSpacing: 0.6 },
  stepVal:   { fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 2 },
  rate:      { fontSize: 10, color: 'rgba(232,245,233,0.35)' },
};

// ── Audience Charts ───────────────────────────────────────────────────────────
function AudienceBar({ data, labelKey, valueKey, horizontal, color }) {
  if (!data || data.length === 0) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(232,245,233,0.25)', fontSize: 11 }}>No data</div>
  );
  const sorted    = [...data].sort((a, b) => parseFloat(b[valueKey] || 0) - parseFloat(a[valueKey] || 0)).slice(0, 10);
  const formatted = sorted.map(d => ({ name: d[labelKey] || '—', val: parseFloat(d[valueKey] || 0) }));
  const fmtTip    = v => [fmtNum(v), (valueKey || '').toUpperCase()];

  if (horizontal) {
    return (
      <ResponsiveContainer width="100%" height={Math.max(160, formatted.length * 28)}>
        <BarChart data={formatted} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(50,205,50,0.07)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 9, fill: 'rgba(232,245,233,0.3)' }} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'rgba(232,245,233,0.5)' }} tickLine={false} width={58} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtTip} />
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
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtTip} />
        <Bar dataKey="val" radius={[3, 3, 0, 0]}>
          {formatted.map((_, i) => <Cell key={i} fill={AUDIENCE_COLORS[i % AUDIENCE_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function AudienceDonut({ data, labelKey, valueKey }) {
  const entries = [...(data || [])]
    .sort((a, b) => parseFloat(b[valueKey] || 0) - parseFloat(a[valueKey] || 0))
    .map(d => ({ name: d[labelKey] || '—', value: parseFloat(d[valueKey] || 0) }))
    .filter(d => d.value > 0);
  if (entries.length === 0) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(232,245,233,0.25)', fontSize: 11 }}>No data</div>
  );
  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={entries} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={2}>
            {entries.map((_, i) => <Cell key={i} fill={AUDIENCE_COLORS[i % AUDIENCE_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [fmtNum(v), n]} />
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

// ── Combo Chart ───────────────────────────────────────────────────────────────
function ComboChart({ audienceData, comboDim, comboSel }) {
  const dimDef  = COMBO_DIMS.find(d => d.key === comboDim);
  const rawData = audienceData?.[comboDim] || [];
  const sorted  = [...rawData].sort((a, b) => parseFloat(b['impressions'] || 0) - parseFloat(a['impressions'] || 0)).slice(0, 10);

  const metricMaxes = {};
  comboSel.forEach(m => {
    metricMaxes[m.key] = Math.max(...sorted.map(d => parseFloat(d[m.key] || 0)), 1);
  });

  const chartData = sorted.map(d => {
    const row = { name: d[dimDef?.dataKey || 'age'] || '—' };
    comboSel.forEach(m => {
      row[m.key]        = parseFloat(d[m.key] || 0);
      row[`${m.key}_n`] = (parseFloat(d[m.key] || 0) / metricMaxes[m.key]) * 100;
    });
    return row;
  });

  if (comboSel.length === 0 || sorted.length === 0) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(232,245,233,0.25)', fontSize: 13 }}>
        {sorted.length === 0 ? 'No audience data loaded' : 'Select metrics below to plot'}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(50,205,50,0.08)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'rgba(232,245,233,0.4)' }} tickLine={false} angle={-20} textAnchor="end" />
        <YAxis domain={[0, 110]} tick={{ fontSize: 9, fill: 'rgba(232,245,233,0.3)' }} tickLine={false} tickFormatter={v => `${Math.round(v)}`} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(val, name) => {
            const key  = name.replace('_n', '');
            const mDef = COMBO_METRIC_DEFS.find(x => x.key === key);
            const row  = chartData.find(d => d[name] === val);
            return [mDef ? mDef.fmt(row?.[key] ?? val) : val, mDef?.label || name];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={name => {
          const mDef = COMBO_METRIC_DEFS.find(x => `${x.key}_n` === name);
          return <span style={{ color: 'rgba(232,245,233,0.7)' }}>{mDef?.label || name}</span>;
        }} />
        {comboSel.map((m, i) => m.type === 'bar'
          ? <Bar  key={m.key} dataKey={`${m.key}_n`} fill={CHART_COLORS[i]} fillOpacity={0.8} radius={[3,3,0,0]} />
          : <Line key={m.key} type="monotone" dataKey={`${m.key}_n`} stroke={CHART_COLORS[i]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Threaded Action Widget ────────────────────────────────────────────────────
function ThreadActionWidget({ clientId, clientCode }) {
  const toast = useToast();
  const { user } = useAuth();
  const [open,             setOpen]            = useState(false);
  const [view,             setView]            = useState('list');
  const [actions,          setActions]         = useState([]);
  const [selectedAction,   setSelectedAction]  = useState(null);
  const [newForm,          setNewForm]         = useState({ issue: '', metric: '', recommendation: '', severity: 'minor' });
  const [replyText,        setReplyText]       = useState('');
  const [replyAttachment,  setReplyAttachment] = useState(null);
  const [saving,           setSaving]          = useState(false);
  const fileInputRef   = useRef(null);
  const messagesEndRef = useRef(null);
  const panelRef       = useRef(null);

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

  useEffect(() => {
    if (view === 'thread') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [view, actions]);

  useEffect(() => {
    if (selectedAction) {
      const updated = actions.find(a => a.id === selectedAction.id);
      if (updated) setSelectedAction(updated);
    }
  }, [actions]);

  const handleNewThread = async e => {
    e.preventDefault();
    if (!newForm.issue.trim()) return;
    setSaving(true);
    try {
      await monitorAPI.addAction(clientId, { ...newForm, clientCode });
      setNewForm({ issue: '', metric: '', recommendation: '', severity: 'minor' });
      await load();
      setView('list');
      toast('Thread created.', 'success');
    } catch { toast('Failed to create thread.', 'error'); }
    finally { setSaving(false); }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() && !replyAttachment) return;
    setSaving(true);
    try {
      await monitorAPI.addReply(selectedAction.id, {
        message: replyText,
        attachments: replyAttachment ? [replyAttachment] : [],
      });
      setReplyText('');
      setReplyAttachment(null);
      await load();
    } catch { toast('Failed to send reply.', 'error'); }
    finally { setSaving(false); }
  };

  const handleStatus = async (actionId, status) => {
    try { await monitorAPI.updateAction(actionId, { status }); await load(); } catch {}
  };

  const handleFileChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('File too large (max 5 MB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = evt => setReplyAttachment({ name: file.name, type: file.type, data: evt.target.result.split(',')[1] });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openCount = actions.filter(a => a.status === 'open' || a.status === 'in_progress').length;
  const SC = { open: '#f5a623', in_progress: '#1A7FCC', done: '#32cd32', escalated: '#ff4d4d' };
  const fmtTime = iso => new Date(iso).toLocaleString('en-MY', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const currentAction = view === 'thread' ? (actions.find(a => a.id === selectedAction?.id) || selectedAction) : null;

  return (
    <>
      <button onClick={() => setOpen(v => !v)} style={aw.fab} title="Action Board">
        ◉
        {openCount > 0 && <span style={aw.fabBadge}>{openCount}</span>}
      </button>

      {open && (
        <div ref={panelRef} style={aw.panel}>
          {/* Header */}
          <div style={aw.head}>
            {view !== 'list' && <button onClick={() => setView('list')} style={aw.iconBtn}>←</button>}
            <span style={aw.title}>{view === 'new' ? 'New Thread' : view === 'thread' ? 'Thread' : 'Action Board'}</span>
            {view === 'list' && clientCode && <span style={aw.clientTag}>{clientCode}</span>}
            {view === 'list' && <button onClick={() => setView('new')} className="btn btn-primary btn-sm" style={{ fontSize: 10, padding: '3px 10px' }}>+ New</button>}
            <button onClick={() => setOpen(false)} style={aw.iconBtn}>✕</button>
          </div>

          {/* New Thread Form */}
          {view === 'new' && (
            <form onSubmit={handleNewThread} style={{ padding: '14px 16px', flex: 1, overflowY: 'auto' }}>
              <input className="form-input" placeholder="Issue *" value={newForm.issue} onChange={e => setNewForm(p => ({ ...p, issue: e.target.value }))} required style={{ marginBottom: 8 }} />
              <input className="form-input" placeholder="Metric (e.g. CTR, CPM)" value={newForm.metric} onChange={e => setNewForm(p => ({ ...p, metric: e.target.value }))} style={{ marginBottom: 8 }} />
              <input className="form-input" placeholder="Recommendation" value={newForm.recommendation} onChange={e => setNewForm(p => ({ ...p, recommendation: e.target.value }))} style={{ marginBottom: 8 }} />
              <select className="form-input" style={{ marginBottom: 16 }} value={newForm.severity} onChange={e => setNewForm(p => ({ ...p, severity: e.target.value }))}>
                <option value="minor">Minor</option>
                <option value="major">Major</option>
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={saving}>{saving ? '…' : 'Create Thread'}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView('list')}>Cancel</button>
              </div>
            </form>
          )}

          {/* Thread List */}
          {view === 'list' && (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {actions.length === 0
                ? <div style={{ color: 'rgba(232,245,233,0.25)', fontSize: 12, textAlign: 'center', padding: '28px 0' }}>No threads yet.</div>
                : actions.map(a => (
                    <div key={a.id} onClick={() => { setSelectedAction(a); setView('thread'); }}
                      style={{ ...aw.threadItem, borderLeft: `3px solid ${a.severity === 'major' ? '#ff4d4d' : '#f5a623'}` }}>
                      <div style={aw.threadTitle}>{a.issue}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ ...aw.pill, background: `${SC[a.status]||'#aaa'}22`, color: SC[a.status]||'#aaa' }}>
                          {(a.status||'').replace('_',' ')}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.3)' }}>{a.createdBy}</span>
                        {(a.replies||[]).length > 0 && (
                          <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.25)', marginLeft: 'auto' }}>
                            {(a.replies||[]).length} repl{(a.replies||[]).length === 1 ? 'y' : 'ies'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
              }
            </div>
          )}

          {/* Thread Detail */}
          {view === 'thread' && currentAction && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Status row */}
              <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(50,205,50,0.08)', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
                {['open','in_progress','done','escalated'].map(s => (
                  <button key={s} onClick={() => handleStatus(currentAction.id, s)} className="btn btn-ghost btn-sm"
                    style={{ fontSize: 9, padding: '2px 6px', opacity: currentAction.status === s ? 1 : 0.35,
                      borderColor: currentAction.status === s ? SC[s] : undefined,
                      color: currentAction.status === s ? SC[s] : undefined }}>
                    {s.replace('_',' ')}
                  </button>
                ))}
              </div>

              {/* Messages */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '12px 12px 4px' }}>
                {/* Original post */}
                <div style={aw.bubble}>
                  <div style={aw.bubbleHeader}>
                    <span style={aw.author}>{currentAction.createdBy}</span>
                    <span style={aw.time}>{fmtTime(currentAction.createdAt)}</span>
                  </div>
                  <div style={aw.msgText}>{currentAction.issue}</div>
                  {currentAction.metric && <div style={aw.msgMeta}>Metric: {currentAction.metric}</div>}
                  {currentAction.recommendation && <div style={aw.msgMeta}>Rec: {currentAction.recommendation}</div>}
                </div>

                {/* Replies */}
                {(currentAction.replies || []).map(r => {
                  const isMine = r.author === user?.username;
                  return (
                    <div key={r.replyId} style={{
                      ...aw.bubble,
                      marginLeft: isMine ? 16 : 0,
                      marginRight: isMine ? 0 : 16,
                      background: isMine ? 'rgba(50,205,50,0.08)' : 'rgba(0,0,0,0.2)',
                      border: isMine ? '1px solid rgba(50,205,50,0.15)' : '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <div style={aw.bubbleHeader}>
                        <span style={aw.author}>{r.author}</span>
                        <span style={aw.time}>{fmtTime(r.createdAt)}</span>
                      </div>
                      {r.message && <div style={aw.msgText}>{r.message}</div>}
                      {(r.attachments || []).map((att, ai) => (
                        <div key={ai} style={{ marginTop: 6 }}>
                          {att.type?.startsWith('image/') ? (
                            <img src={`data:${att.type};base64,${att.data}`} alt={att.name}
                              style={{ maxWidth: '100%', borderRadius: 6, maxHeight: 160, objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <a href={`data:${att.type};base64,${att.data}`} download={att.name}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#32cd32', fontSize: 11, textDecoration: 'none', background: 'rgba(50,205,50,0.08)', padding: '4px 8px', borderRadius: 5 }}>
                              📄 {att.name}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(50,205,50,0.08)', flexShrink: 0, background: 'rgba(7,80,60,0.2)' }}>
                {replyAttachment && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '4px 8px', background: 'rgba(50,205,50,0.08)', borderRadius: 6, border: '1px solid rgba(50,205,50,0.15)' }}>
                    <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.6)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {replyAttachment.name}</span>
                    <button onClick={() => setReplyAttachment(null)} style={{ background: 'none', border: 'none', color: 'rgba(232,245,233,0.4)', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                  <textarea className="form-input" placeholder="Reply… (Enter to send)" value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                    rows={2} style={{ flex: 1, resize: 'none', fontSize: 12 }} />
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,.pdf" style={{ display: 'none' }} />
                  <button onClick={() => fileInputRef.current?.click()} className="btn btn-ghost btn-sm" style={{ padding: '7px 8px', flexShrink: 0 }} title="Attach image or PDF">📎</button>
                  <button onClick={handleSendReply} className="btn btn-primary btn-sm" style={{ padding: '7px 12px', flexShrink: 0 }}
                    disabled={saving || (!replyText.trim() && !replyAttachment)}>
                    {saving ? '…' : '→'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const aw = {
  fab:         { position: 'fixed', bottom: 28, right: 28, width: 48, height: 48, borderRadius: '50%', background: '#32cd32', color: '#03140e', border: 'none', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, boxShadow: '0 4px 16px rgba(50,205,50,0.4)', fontWeight: 900 },
  fabBadge:    { position: 'absolute', top: -4, right: -4, background: '#ff4d4d', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg)' },
  panel:       { position: 'fixed', bottom: 86, right: 28, width: 340, maxHeight: '76vh', background: 'var(--card-bg,#0a1f16)', border: '1px solid rgba(50,205,50,0.2)', borderRadius: 12, display: 'flex', flexDirection: 'column', zIndex: 299, boxShadow: '0 8px 40px rgba(0,0,0,0.5)', overflow: 'hidden' },
  head:        { display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px', borderBottom: '1px solid rgba(50,205,50,0.1)', background: 'rgba(7,80,60,0.3)', flexShrink: 0 },
  title:       { fontSize: 12, fontWeight: 800, color: '#32cd32', letterSpacing: 1, textTransform: 'uppercase', flex: 1 },
  clientTag:   { fontSize: 10, color: 'rgba(232,245,233,0.4)', fontWeight: 700 },
  iconBtn:     { background: 'none', border: 'none', color: 'rgba(232,245,233,0.5)', cursor: 'pointer', fontSize: 13, padding: '2px 4px', lineHeight: 1 },
  threadItem:  { padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' },
  threadTitle: { fontSize: 12, color: 'rgba(232,245,233,0.85)', fontWeight: 600, marginBottom: 5 },
  pill:        { fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  bubble:      { background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 },
  bubbleHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  author:      { fontSize: 10, fontWeight: 700, color: 'rgba(232,245,233,0.7)' },
  time:        { fontSize: 9, color: 'rgba(232,245,233,0.3)' },
  msgText:     { fontSize: 12, color: 'rgba(232,245,233,0.85)', lineHeight: 1.5 },
  msgMeta:     { fontSize: 11, color: 'rgba(232,245,233,0.4)', marginTop: 3, fontStyle: 'italic' },
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
              <button onClick={() => onSelect(c.id)} style={{
                ...cp.item,
                background: isSelected ? 'rgba(50,205,50,0.12)' : 'transparent',
                border: isSelected ? '1px solid rgba(50,205,50,0.3)' : '1px solid transparent',
                justifyContent: collapsed ? 'center' : 'flex-start',
              }} title={collapsed ? c.name : ''}>
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
              {isSelected && c.clientCode === 'VK' && !collapsed && (
                <div style={cp.branches}>
                  {['ALL','KL','RC','CR'].map(b => (
                    <button key={b} onClick={() => onSelectBranch(b)} style={{
                      ...cp.branch,
                      background: selectedBranch === b ? '#32cd32' : 'rgba(50,205,50,0.08)',
                      color: selectedBranch === b ? '#03140e' : '#32cd32',
                    }}>{b}</button>
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
  const toast   = useToast();

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [clients,        setClients]        = useState([]);
  const [selectedId,     setSelectedId]     = useState(null);
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [clientData,     setClientData]     = useState(null);
  const [audienceData,   setAudienceData]   = useState(null);
  const [loadingMain,    setLoadingMain]    = useState(false);
  const [loadingAudience,setLoadingAudience]= useState(false);
  const [range,          setRange]          = useState('30d');
  const [customStart,    setCustomStart]    = useState('');
  const [customEnd,      setCustomEnd]      = useState('');
  const [activeMetrics,  setActiveMetrics]  = useState([]);
  const [showPrevLine,   setShowPrevLine]   = useState(false);
  const [showAI,         setShowAI]         = useState(false);
  const [aiFindings,     setAiFindings]     = useState(null);
  const [loadingAI,      setLoadingAI]      = useState(false);
  const [aiConfirm,      setAiConfirm]      = useState(false);
  const [aiCtx,          setAiCtx]          = useState('');
  const [audienceMetric, setAudienceMetric] = useState('impressions');
  const [comboDim,       setComboDim]       = useState('age');
  const [comboSel,       setComboSel]       = useState([]);

  const rangeParams = useMemo(() => (
    range === 'custom' && customStart && customEnd
      ? { dateStart: customStart, dateStop: customEnd }
      : { range }
  ), [range, customStart, customEnd]);

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

  useEffect(() => {
    if (!selectedId) return;
    const load = async () => {
      setLoadingMain(true);
      setClientData(null);
      setAiFindings(null);
      setShowAI(false);
      setActiveMetrics([]);
      setShowPrevLine(false);
      try {
        const data = await monitorAPI.client(selectedId, rangeParams);
        setClientData(data);
      } catch (err) {
        toast(err.response?.data?.error || 'Failed to load client data.', 'error');
      } finally { setLoadingMain(false); }
    };
    load();
  }, [selectedId, JSON.stringify(rangeParams)]);

  useEffect(() => {
    if (!selectedId) return;
    const load = async () => {
      setLoadingAudience(true);
      setAudienceData(null);
      setComboSel([]);
      try {
        const data = await monitorAPI.audience(selectedId, rangeParams);
        setAudienceData(data);
      } catch {}
      finally { setLoadingAudience(false); }
    };
    load();
  }, [selectedId, JSON.stringify(rangeParams)]);

  const handleSelectClient = id => { setSelectedId(id); setSelectedBranch('ALL'); };

  const toggleMetric = key => {
    setActiveMetrics(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 3)   return [...prev.slice(1), key];
      return [...prev, key];
    });
  };

  const toggleComboMetric = key => {
    setComboSel(prev => {
      const existing = prev.find(m => m.key === key);
      if (existing) return prev.filter(m => m.key !== key);
      if (prev.length >= 3) return [...prev.slice(1), { key, type: 'bar' }];
      return [...prev, { key, type: 'bar' }];
    });
  };

  const toggleComboType = key => {
    setComboSel(prev => prev.map(m => m.key === key ? { ...m, type: m.type === 'bar' ? 'line' : 'bar' } : m));
  };

  const handleAIClick = () => {
    if (!showAI) { setAiConfirm(true); return; }
    setShowAI(false); setAiFindings(null);
  };

  const handleAIConfirm = async () => {
    setAiConfirm(false); setShowAI(true); setLoadingAI(true); setAiFindings(null);
    try {
      const res = await monitorAPI.diagnose(selectedId, { ...rangeParams, context: aiCtx || undefined });
      setAiFindings(res.findings || []);
    } catch (err) {
      toast(err.response?.data?.error || 'AI diagnosis failed.', 'error');
      setShowAI(false);
    } finally { setLoadingAI(false); }
  };

  const displayTotals = useMemo(() => {
    if (!clientData) return null;
    const { totals, branches } = clientData;
    let t = { ...totals };
    if (selectedBranch !== 'ALL' && branches?.[selectedBranch]) {
      const b    = branches[selectedBranch];
      const days = clientData.daily?.length || 1;
      t = {
        ...totals,
        spend: b.spend, impressions: b.impressions, clicks: b.clicks,
        ctr: b.impressions > 0 ? b.clicks / b.impressions * 100 : 0,
        cpm: b.impressions > 0 ? b.spend  / b.impressions * 1000 : 0,
        cpc: b.clicks      > 0 ? b.spend  / b.clicks : 0,
        waConvos: b.results, primaryResults: b.results,
        avgDailySpend: b.spend / days,
      };
    }
    return {
      ...t,
      costPerMessage: t.waConvos > 0 ? t.spend / t.waConvos : 0,
      frequency:      t.reach    > 0 ? t.impressions / t.reach : 0,
    };
  }, [clientData, selectedBranch]);

  const displayPrevTotals = useMemo(() => {
    const p = clientData?.prevTotals;
    if (!p) return null;
    return {
      ...p,
      costPerMessage: p.waConvos > 0 ? p.spend / p.waConvos : 0,
      frequency:      p.reach    > 0 ? p.impressions / p.reach : 0,
    };
  }, [clientData]);

  const processDaily = d => {
    const sp = parseFloat(d.spend || 0);
    const wc = extractFromActions(d.actions, 'onsite_conversion.messaging_first_reply');
    return {
      date_start:     d.date_start,
      spend:          sp,
      reach:          parseFloat(d.reach       || 0),
      impressions:    parseFloat(d.impressions || 0),
      clicks:         parseFloat(d.clicks      || 0),
      ctr:            parseFloat(d.ctr         || 0),
      cpm:            parseFloat(d.cpm         || 0),
      cpc:            parseFloat(d.cpc         || 0),
      frequency:      parseFloat(d.frequency   || 0),
      waConvos:       wc,
      costPerMessage: wc > 0 ? sp / wc : 0,
    };
  };

  const chartDaily     = useMemo(() => (clientData?.daily    || []).map(processDaily), [clientData]);
  const prevChartDaily = useMemo(() => (clientData?.prevDaily || []).map(processDaily), [clientData]);

  const selectedClient = clients.find(c => c.id === selectedId);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <ClientPanel
        clients={clients} selectedId={selectedId} onSelect={handleSelectClient}
        collapsed={panelCollapsed} onToggleCollapse={() => setPanelCollapsed(v => !v)}
        selectedBranch={selectedBranch} onSelectBranch={setSelectedBranch}
      />

      <div style={{ flex: 1, overflowX: 'hidden', padding: '28px 32px' }} className="fade-up">

        {/* Page header */}
        <div style={pg.header}>
          <div>
            <h1 style={pg.title}>Analytic</h1>
            <p style={pg.sub}>{selectedClient ? `${selectedClient.clientCode} — ${selectedClient.name}` : 'Select a client'}</p>
          </div>
          <button className={`btn ${showAI ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={handleAIClick}
            disabled={!clientData || loadingAI} style={{ borderColor: showAI ? '#32cd32' : undefined }}>
            {loadingAI ? <><div className="spinner" style={{ width: 10, height: 10 }} /> Analysing…</> : showAI ? '✕ Hide AI' : '◎ AI Analyse'}
          </button>
        </div>

        {/* AI confirm dialog */}
        {aiConfirm && (
          <div style={pg.confirmBox}>
            <div style={pg.confirmText}>⚠ Running AI diagnosis uses API tokens (costs money). Confirm to proceed?</div>
            <input className="form-input" placeholder="Optional: add context for AI…" value={aiCtx} onChange={e => setAiCtx(e.target.value)} style={{ marginTop: 8, marginBottom: 12 }} />
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
            {/* ── PERFORMANCE ── */}
            <Section title="Performance" right={
              clientData?.prevDateStart && (
                <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.3)' }}>
                  vs {clientData.prevDateStart} → {clientData.prevDateStop}
                </span>
              )
            }>
              {showAI && <AIFindingsRow findings={aiFindings} loading={loadingAI} />}

              <div style={pg.metricGrid}>
                {METRICS.map(m => (
                  <MetricCard key={m.key} metric={m}
                    value={m.key === 'active' ? clientData.activeCampaignCount : displayTotals?.[m.key]}
                    prevValue={m.key === 'active' ? null : displayPrevTotals?.[m.key]}
                    activeCampaignCount={clientData.activeCampaignCount}
                    active={activeMetrics.includes(m.key)}
                    onClick={() => m.chartFmt !== null && toggleMetric(m.key)}
                  />
                ))}
              </div>

              <div className="glass" style={{ padding: '16px 20px', marginTop: 16, borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'rgba(232,245,233,0.35)' }}>
                    {activeMetrics.length === 0
                      ? 'Click metric cards to plot on chart (max 3 at a time)'
                      : `Plotting: ${activeMetrics.map(k => METRICS.find(m => m.key === k)?.label).join(' · ')}`}
                  </div>
                  {activeMetrics.length > 0 && prevChartDaily.length > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowPrevLine(v => !v)}
                      style={{ fontSize: 10, padding: '3px 10px', borderColor: showPrevLine ? '#32cd32' : undefined, color: showPrevLine ? '#32cd32' : undefined }}>
                      {showPrevLine ? '✓ Prev period' : '○ Compare prev period'}
                    </button>
                  )}
                </div>
                <MetricLineChart daily={chartDaily} prevDaily={prevChartDaily} activeMetricKeys={activeMetrics} showPrevPeriod={showPrevLine} />
              </div>
            </Section>

            {/* ── ENGAGEMENT ── */}
            <Section title="Engagement">
              <div style={pg.engGrid}>
                <div className="glass" style={pg.engCard}>
                  <div style={pg.engCardTitle}>Post Engagement</div>
                  <PostEngagementBar
                    reactions={displayTotals?.reactions || 0}
                    comments={displayTotals?.comments   || 0}
                    shares={displayTotals?.shares       || 0}
                    saves={displayTotals?.saves         || 0}
                    postEngagement={displayTotals?.postEngagement || 0}
                  />
                </div>

                <div className="glass" style={pg.engCard}>
                  <div style={pg.engCardTitle}>Engagement Metrics</div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
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

                <div className="glass" style={pg.engCard}>
                  <div style={pg.engCardTitle}>Video Retention</div>
                  <VideoMilestoneBoxes
                    videoP25={displayTotals?.videoP25       || 0}
                    videoP50={displayTotals?.videoP50       || 0}
                    videoP75={displayTotals?.videoP75       || 0}
                    videoP100={displayTotals?.videoP100     || 0}
                    videoAvgWatch={displayTotals?.videoAvgWatch || 0}
                  />
                </div>

                <div className="glass" style={pg.engCard}>
                  <div style={pg.engCardTitle}>Conversion Funnel</div>
                  <ConversionFunnel
                    reach={displayTotals?.reach     || 0}
                    clicks={displayTotals?.clicks   || 0}
                    messages={displayTotals?.waConvos || 0}
                  />
                </div>
              </div>
            </Section>

            {/* ── AUDIENCE ── */}
            <Section title="Audience">
              {/* 4 metric filter cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
                {AUDIENCE_METRICS.map(m => {
                  const val      = displayTotals?.[m.key] || 0;
                  const isActive = audienceMetric === m.key;
                  return (
                    <div key={m.key} onClick={() => setAudienceMetric(m.key)} style={{
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      background: isActive ? 'rgba(50,205,50,0.10)' : 'rgba(7,80,60,0.15)',
                      border: isActive ? '1.5px solid rgba(50,205,50,0.4)' : '1px solid rgba(50,205,50,0.1)',
                      transition: 'all 0.2s',
                      boxShadow: isActive ? '0 0 0 3px rgba(50,205,50,0.1)' : 'none',
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(232,245,233,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>{m.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: isActive ? '#32cd32' : 'var(--text-primary)' }}>{m.fmt(val)}</div>
                    </div>
                  );
                })}
              </div>

              {loadingAudience ? (
                <div style={{ padding: 48, textAlign: 'center' }}><div className="spinner" /></div>
              ) : !audienceData ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'rgba(232,245,233,0.25)', fontSize: 12 }}>Audience data unavailable</div>
              ) : (
                <>
                  {/* Row 1: Gender + Age */}
                  <div style={pg.audRow}>
                    <div className="glass" style={pg.audCard}>
                      <div style={pg.audTitle}>Gender</div>
                      <AudienceDonut data={audienceData.gender} labelKey="gender" valueKey={audienceMetric} />
                    </div>
                    <div className="glass" style={{ ...pg.audCard, flex: 2 }}>
                      <div style={pg.audTitle}>Age Group</div>
                      <AudienceBar data={audienceData.age} labelKey="age" valueKey={audienceMetric} color="#32cd32" />
                    </div>
                  </div>

                  {/* Row 2: Platform + Device */}
                  <div style={pg.audRow}>
                    <div className="glass" style={pg.audCard}>
                      <div style={pg.audTitle}>Platform</div>
                      <AudienceBar data={audienceData.platform} labelKey="publisher_platform" valueKey={audienceMetric} color="#1A7FCC" />
                    </div>
                    <div className="glass" style={pg.audCard}>
                      <div style={pg.audTitle}>Device</div>
                      <AudienceBar data={audienceData.device} labelKey="impression_device" valueKey={audienceMetric} color="#f5a623" />
                    </div>
                  </div>

                  {/* Row 3: Region */}
                  <div className="glass" style={{ padding: '18px 20px', borderRadius: 12, marginBottom: 14 }}>
                    <div style={pg.audTitle}>Region (Top 10)</div>
                    <AudienceBar data={audienceData.region} labelKey="region" valueKey={audienceMetric} horizontal color="#a78bfa" />
                  </div>

                  {/* Combo chart */}
                  <div className="glass" style={{ padding: '18px 20px', borderRadius: 12 }}>
                    <div style={pg.audTitle}>Trend Analysis — Combo Chart</div>

                    {/* Dimension selector */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.35)', alignSelf: 'center', marginRight: 4 }}>X-Axis:</span>
                      {COMBO_DIMS.map(d => (
                        <button key={d.key} onClick={() => { setComboDim(d.key); setComboSel([]); }} className="btn btn-ghost btn-sm"
                          style={{ fontSize: 10, padding: '3px 10px', borderColor: comboDim === d.key ? '#32cd32' : undefined, color: comboDim === d.key ? '#32cd32' : undefined }}>
                          {d.label}
                        </button>
                      ))}
                    </div>

                    {/* Metric selector + type toggle */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.35)', marginRight: 4 }}>Metrics:</span>
                      {COMBO_METRIC_DEFS.map(m => {
                        const sel = comboSel.find(s => s.key === m.key);
                        return (
                          <div key={m.key} style={{ display: 'flex', gap: 0 }}>
                            <button onClick={() => toggleComboMetric(m.key)} className="btn btn-ghost btn-sm"
                              style={{ fontSize: 10, padding: '3px 8px', borderColor: sel ? CHART_COLORS[comboSel.indexOf(sel)] : undefined, color: sel ? CHART_COLORS[comboSel.indexOf(sel)] : undefined,
                                borderTopRightRadius: sel ? 0 : undefined, borderBottomRightRadius: sel ? 0 : undefined }}>
                              {m.label}
                            </button>
                            {sel && (
                              <button onClick={() => toggleComboType(m.key)} style={{
                                fontSize: 9, fontWeight: 800, padding: '3px 6px', cursor: 'pointer',
                                background: sel.type === 'bar' ? 'rgba(50,205,50,0.15)' : 'rgba(26,127,204,0.15)',
                                border: `1px solid ${CHART_COLORS[comboSel.indexOf(sel)]}`,
                                borderLeft: 'none', borderRadius: '0 4px 4px 0',
                                color: CHART_COLORS[comboSel.indexOf(sel)],
                              }}>
                                {sel.type === 'bar' ? 'B' : 'L'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <ComboChart audienceData={audienceData} comboDim={comboDim} comboSel={comboSel} setComboSel={setComboSel} />
                  </div>
                </>
              )}
            </Section>
          </>
        )}
      </div>

      {selectedId && <ThreadActionWidget clientId={selectedId} clientCode={selectedClient?.clientCode} />}
    </div>
  );
}

const pg = {
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  title:     { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 },
  sub:       { fontSize: 12, color: 'var(--text-muted)', marginTop: 3 },
  rangeBar:  { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' },
  metricGrid:{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 10 },
  engGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 },
  engCard:   { padding: '18px 20px', borderRadius: 12 },
  engCardTitle:{ fontSize: 11, fontWeight: 700, color: 'rgba(50,205,50,0.6)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 },
  audRow:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14, marginBottom: 14 },
  audCard:   { padding: '18px 20px', borderRadius: 12, flex: 1 },
  audTitle:  { fontSize: 10, fontWeight: 700, color: 'rgba(50,205,50,0.5)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },
  confirmBox:{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 },
  confirmText:{ fontSize: 13, color: 'rgba(232,245,233,0.8)', marginBottom: 8, fontWeight: 600 },
};
