import React, { useEffect, useState, useCallback } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { monitorAPI } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../context/AuthContext';

const fmtRM  = v => `RM ${parseFloat(v || 0).toFixed(2)}`;
const fmtNum = v => Math.round(parseFloat(v || 0)).toLocaleString('en-MY');
const fmtPct = v => `${parseFloat(v || 0).toFixed(2)}%`;

const HEALTH_COLOR = { green: '#32cd32', yellow: '#f5a623', red: '#ff4d4d' };
const HEALTH_BG    = { green: 'rgba(50,205,50,0.12)', yellow: 'rgba(245,166,35,0.12)', red: 'rgba(255,77,77,0.12)' };
const HEALTH_LABEL = { green: '● Healthy', yellow: '● At Risk', red: '● Critical' };

const RANGE_OPTIONS = [
  { value: '30d', label: 'Last 30 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '7d',  label: 'Last 7 days'  },
  { value: 'custom', label: 'Custom range' },
];

const STATUS_COLORS = { open: '#f5a623', in_progress: '#1A7FCC', done: '#32cd32', escalated: '#ff4d4d' };
const SEVERITY_COLORS = { minor: '#f5a623', major: '#ff4d4d' };

// ── Health Badge ──────────────────────────────────────────────────────────────
function HealthBadge({ score, size = 'md' }) {
  const isLg = size === 'lg';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: HEALTH_BG[score] || HEALTH_BG.red,
      color: HEALTH_COLOR[score] || '#ff4d4d',
      border: `1px solid ${HEALTH_COLOR[score] || '#ff4d4d'}44`,
      borderRadius: 20, padding: isLg ? '5px 14px' : '3px 10px',
      fontSize: isLg ? 13 : 11, fontWeight: 700
    }}>
      {HEALTH_LABEL[score] || '● Unknown'}
    </span>
  );
}

// ── Metric Row ────────────────────────────────────────────────────────────────
function MetricRow({ label, value, threshold, direction, breached, usingDefaults }) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <td style={td.label}>{label}</td>
      <td style={{ ...td.value, color: breached ? '#ff4d4d' : '#32cd32', fontWeight: 700 }}>{value}</td>
      <td style={td.thresh}>
        {threshold !== null ? (
          <span style={{ fontSize: 11, color: 'rgba(232,245,233,0.4)' }}>
            {direction === 'below' ? '≥' : '≤'} {threshold}
            {usingDefaults && <span style={{ color: 'rgba(232,245,233,0.25)', marginLeft: 4 }}>(default)</span>}
          </span>
        ) : '—'}
      </td>
      <td style={td.status}>
        {breached
          ? <span style={{ color: '#ff4d4d', fontSize: 11 }}>⚠ Breached</span>
          : <span style={{ color: '#32cd32', fontSize: 11 }}>✓ OK</span>
        }
      </td>
    </tr>
  );
}

const td = {
  label:  { padding: '10px 12px', fontSize: 13, color: 'rgba(232,245,233,0.7)' },
  value:  { padding: '10px 12px', fontSize: 14 },
  thresh: { padding: '10px 12px' },
  status: { padding: '10px 12px' },
};

// ── Treemap custom content ────────────────────────────────────────────────────
function TreemapContent({ x, y, width, height, name, value, depth }) {
  if (width < 30 || height < 20) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height}
        style={{ fill: depth === 1 ? '#07503c' : depth === 2 ? '#0a6b4e' : '#0e8060',
          stroke: '#03140e', strokeWidth: 2, opacity: 0.9 }} />
      {width > 60 && height > 28 && (
        <>
          <text x={x + 8} y={y + 16} fill="#32cd32" fontSize={10} fontWeight={700}>{name?.length > 18 ? name.slice(0, 16) + '…' : name}</text>
          {height > 42 && <text x={x + 8} y={y + 30} fill="rgba(232,245,233,0.6)" fontSize={9}>{fmtRM(value)}</text>}
        </>
      )}
    </g>
  );
}

// ── Action Board ──────────────────────────────────────────────────────────────
function ActionBoard({ clientId, clientCode }) {
  const toast = useToast();
  const { user } = useAuth();
  const [actions, setActions]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ campaignName: '', metric: '', issue: '', recommendation: '', severity: 'minor' });
  const [saving, setSaving]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setActions(await monitorAPI.actions(clientId)); }
    catch { toast('Failed to load actions.', 'error'); }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await monitorAPI.addAction(clientId, { ...form, clientCode });
      setForm({ campaignName: '', metric: '', issue: '', recommendation: '', severity: 'minor' });
      setShowForm(false);
      await load();
      toast('Action added.', 'success');
    } catch { toast('Failed to add action.', 'error'); }
    finally { setSaving(false); }
  };

  const handleStatus = async (actionId, status) => {
    try {
      await monitorAPI.updateAction(actionId, { status });
      await load();
    } catch { toast('Failed to update.', 'error'); }
  };

  const openCount = actions.filter(a => a.status === 'open' || a.status === 'in_progress').length;

  return (
    <div style={ab.wrap}>
      <div style={ab.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={ab.title}>Action Board</span>
          {openCount > 0 && (
            <span style={ab.badge}>{openCount} open</span>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Add Action'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} style={ab.form}>
          <div style={ab.formGrid}>
            <div>
              <label style={ab.label}>Campaign (optional)</label>
              <input className="form-input" value={form.campaignName} onChange={e => setForm(p => ({ ...p, campaignName: e.target.value }))} placeholder="Campaign name" />
            </div>
            <div>
              <label style={ab.label}>Metric</label>
              <input className="form-input" value={form.metric} onChange={e => setForm(p => ({ ...p, metric: e.target.value }))} placeholder="e.g. CTR, CPM" />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={ab.label}>Issue *</label>
            <input className="form-input" value={form.issue} onChange={e => setForm(p => ({ ...p, issue: e.target.value }))} placeholder="Describe the issue" required />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={ab.label}>Recommendation</label>
            <input className="form-input" value={form.recommendation} onChange={e => setForm(p => ({ ...p, recommendation: e.target.value }))} placeholder="What should be done?" />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <select className="form-input" style={{ width: 140 }} value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
            </select>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save Action'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" /></div>
      ) : actions.length === 0 ? (
        <div style={ab.empty}>No action items for this client.</div>
      ) : (
        <div style={ab.list}>
          {actions.map(a => (
            <div key={a.id} style={{ ...ab.item, borderLeft: `3px solid ${SEVERITY_COLORS[a.severity] || '#aaa'}` }}>
              <div style={ab.itemTop}>
                <div style={{ flex: 1 }}>
                  {a.campaignName && <div style={ab.campaign}>{a.campaignName}</div>}
                  <div style={ab.issue}>{a.issue}</div>
                  {a.recommendation && <div style={ab.rec}>{a.recommendation}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span style={{ ...ab.statusBadge, color: STATUS_COLORS[a.status], border: `1px solid ${STATUS_COLORS[a.status]}44` }}>
                    {a.status.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(232,245,233,0.3)' }}>by {a.createdBy}</span>
                </div>
              </div>
              <div style={ab.itemActions}>
                {['open','in_progress','done','escalated'].map(s => (
                  <button key={s} onClick={() => handleStatus(a.id, s)}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 10, padding: '3px 8px', opacity: a.status === s ? 1 : 0.45,
                      color: a.status === s ? STATUS_COLORS[s] : undefined,
                      borderColor: a.status === s ? STATUS_COLORS[s] : undefined }}>
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ab = {
  wrap:       { marginTop: 24 },
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title:      { fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1.2, textTransform: 'uppercase' },
  badge:      { background: 'rgba(245,166,35,0.15)', color: '#f5a623', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  form:       { background: 'rgba(50,205,50,0.03)', border: '1px solid rgba(50,205,50,0.12)', borderRadius: 10, padding: '16px', marginBottom: 16 },
  formGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: 10 },
  label:      { display: 'block', fontSize: 10, fontWeight: 600, color: 'rgba(232,245,233,0.5)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.8 },
  empty:      { color: 'rgba(232,245,233,0.3)', fontSize: 13, padding: '20px 0', textAlign: 'center' },
  list:       { display: 'flex', flexDirection: 'column', gap: 8 },
  item:       { background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '12px 14px' },
  itemTop:    { display: 'flex', gap: 12, marginBottom: 8 },
  campaign:   { fontSize: 11, color: '#32cd32', fontWeight: 700, marginBottom: 3, letterSpacing: 0.5 },
  issue:      { fontSize: 13, color: 'rgba(232,245,233,0.85)', fontWeight: 600, marginBottom: 3 },
  rec:        { fontSize: 11, color: 'rgba(232,245,233,0.45)', fontStyle: 'italic' },
  statusBadge:{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 7px', textTransform: 'capitalize' },
  itemActions:{ display: 'flex', gap: 6 },
};

// ── Client Detail Panel ───────────────────────────────────────────────────────
function ClientDetail({ clientId, rangeParams, onClose }) {
  const toast = useToast();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('overview');
  const [diagnosing,setDiagnosing]= useState(false);
  const [diagnosis, setDiagnosis] = useState(null);
  const [ctx,       setCtx]       = useState('');
  const [sort,      setSort]      = useState({ key: 'spend', dir: 'desc' });
  const [filter,    setFilter]    = useState('');

  useEffect(() => {
    setLoading(true);
    setData(null);
    setDiagnosis(null);
    monitorAPI.client(clientId, rangeParams)
      .then(setData)
      .catch(err => toast(err.response?.data?.error || 'Failed to load client data.', 'error'))
      .finally(() => setLoading(false));
  }, [clientId, JSON.stringify(rangeParams)]);

  const handleDiagnose = async () => {
    setDiagnosing(true);
    try {
      const res = await monitorAPI.diagnose(clientId, { ...rangeParams, context: ctx || undefined });
      setDiagnosis(res.diagnosis);
    } catch (err) {
      toast(err.response?.data?.error || 'Diagnosis failed.', 'error');
    } finally { setDiagnosing(false); }
  };

  if (loading) return (
    <div className="glass" style={dp.wrap}>
      <div style={{ padding: 48, textAlign: 'center' }}><div className="spinner" /></div>
    </div>
  );

  if (!data) return null;

  const { client, totals, health, campaigns, adsets, ads, daily, branches } = data;

  // Build treemap data
  const treemapData = campaigns.map(c => ({
    name: c.campaign_name?.length > 24 ? c.campaign_name.slice(0, 22) + '…' : c.campaign_name,
    size: parseFloat(c.spend || 0)
  })).filter(c => c.size > 0);

  // Build drill-down table rows
  const allRows = [
    ...(campaigns || []).map(r => ({ ...r, _level: 'campaign', _name: r.campaign_name })),
    ...(adsets    || []).map(r => ({ ...r, _level: 'adset',    _name: r.adset_name })),
    ...(ads       || []).map(r => ({ ...r, _level: 'ad',       _name: r.ad_name })),
  ];
  const filtered = allRows.filter(r =>
    !filter || r._name?.toLowerCase().includes(filter.toLowerCase()) ||
    r.campaign_name?.toLowerCase().includes(filter.toLowerCase())
  );
  const sorted = [...filtered].sort((a, b) => {
    const av = parseFloat(a[sort.key] || 0), bv = parseFloat(b[sort.key] || 0);
    return sort.dir === 'desc' ? bv - av : av - bv;
  });

  const thSort = (key) => ({
    cursor: 'pointer', userSelect: 'none',
    color: sort.key === key ? '#32cd32' : undefined,
    onClick: () => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))
  });

  const breachedMap = {};
  (health.breaches || []).forEach(b => { breachedMap[b.metric] = b; });

  return (
    <div className="glass" style={dp.wrap}>
      {/* Header */}
      <div style={dp.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={dp.code}>{client.clientCode}</span>
            <span style={dp.name}>{client.name}</span>
            <HealthBadge score={health.score} size="lg" />
          </div>
          <div style={{ fontSize: 12, color: 'rgba(232,245,233,0.4)' }}>
            {data.dateStart} – {data.dateStop}
            {data.cachedAt && <span style={{ marginLeft: 8 }}>· cached {new Date(data.cachedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}</span>}
            {health.usingDefaults && <span style={{ marginLeft: 8, color: '#f5a623' }}>· using benchmark defaults</span>}
          </div>
        </div>
        <button onClick={onClose} style={dp.closeBtn}>✕</button>
      </div>

      {/* KPI strip */}
      <div style={dp.kpiRow}>
        {[
          { label: 'Spend',       value: fmtRM(totals.spend)            },
          { label: 'Reach',       value: fmtNum(totals.reach)           },
          { label: 'Impressions', value: fmtNum(totals.impressions)     },
          { label: 'CTR',         value: fmtPct(totals.ctr),    breached: !!breachedMap['CTR']       },
          { label: 'CPM',         value: fmtRM(totals.cpm),     breached: !!breachedMap['CPM']       },
          { label: 'CPR',         value: fmtRM(totals.cpr),     breached: !!breachedMap['CPR']       },
          { label: 'Frequency',   value: totals.frequency?.toFixed(2),  breached: !!breachedMap['Frequency'] },
          { label: 'Results',     value: fmtNum(totals.primaryResults)  },
        ].map(k => (
          <div key={k.label} style={dp.kpi}>
            <div style={{ ...dp.kpiVal, color: k.breached ? '#ff4d4d' : 'var(--text-primary)' }}>{k.value}</div>
            <div style={dp.kpiLabel}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={dp.tabs}>
        {['overview','treemap','table'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...dp.tab, ...(tab === t ? dp.tabActive : {}) }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === 'overview' && (
        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr style={{ background: 'rgba(7,80,60,0.4)' }}>
                <th style={{ ...td.label, fontWeight: 700, color: '#32cd32' }}>Metric</th>
                <th style={{ ...td.label, fontWeight: 700, color: '#32cd32' }}>Value</th>
                <th style={{ ...td.label, fontWeight: 700, color: '#32cd32' }}>Threshold</th>
                <th style={{ ...td.label, fontWeight: 700, color: '#32cd32' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow label="CTR"       value={fmtPct(totals.ctr)}            threshold={health.thresholds?.ctr}       direction="below" breached={!!breachedMap['CTR']}       usingDefaults={health.usingDefaults} />
              <MetricRow label="CPM"       value={fmtRM(totals.cpm)}             threshold={`RM ${health.thresholds?.cpm}`} direction="above" breached={!!breachedMap['CPM']}       usingDefaults={health.usingDefaults} />
              <MetricRow label="CPR"       value={fmtRM(totals.cpr)}             threshold={`RM ${health.thresholds?.cpr}`} direction="above" breached={!!breachedMap['CPR']}       usingDefaults={health.usingDefaults} />
              <MetricRow label="Frequency" value={totals.frequency?.toFixed(2)}  threshold={health.thresholds?.frequency} direction="above" breached={!!breachedMap['Frequency']} usingDefaults={health.usingDefaults} />
            </tbody>
          </table>

          {/* VK branches */}
          {branches && (
            <div style={{ marginBottom: 24 }}>
              <div style={dp.subTitle}>Branch Breakdown (Viking Fitness)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {Object.entries(branches).map(([branch, d]) => (
                  <div key={branch} className="glass" style={{ padding: '14px 16px', borderRadius: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#32cd32', marginBottom: 4 }}>{branch}</div>
                    <div style={{ fontSize: 12, color: 'rgba(232,245,233,0.7)' }}>{fmtRM(d.spend)} spend</div>
                    <div style={{ fontSize: 11, color: 'rgba(232,245,233,0.4)' }}>{fmtNum(d.results)} results</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Diagnosis */}
          <div style={dp.diagnoseWrap}>
            <div style={dp.subTitle}>AI Diagnosis</div>
            <textarea
              className="form-input"
              rows={2}
              placeholder="Optional: add context for the AI (e.g. campaign changes, client notes)…"
              value={ctx}
              onChange={e => setCtx(e.target.value)}
              style={{ marginBottom: 10, resize: 'vertical' }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleDiagnose}
              disabled={diagnosing}
              style={{ marginBottom: diagnosis ? 16 : 0 }}
            >
              {diagnosing
                ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Diagnosing…</>
                : '◎ Run AI Diagnosis'
              }
            </button>
            {diagnosis && (
              <div style={dp.diagnosisBox}>
                <div style={{ fontSize: 11, color: '#32cd32', fontWeight: 700, marginBottom: 10, letterSpacing: 1 }}>AI DIAGNOSIS</div>
                {diagnosis.split('\n').filter(l => l.trim()).map((line, i) => (
                  <p key={i} style={{ fontSize: 13, color: 'rgba(232,245,233,0.8)', lineHeight: 1.7, margin: '0 0 8px' }}>{line}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Treemap */}
      {tab === 'treemap' && (
        <div>
          <div style={{ fontSize: 12, color: 'rgba(232,245,233,0.4)', marginBottom: 12 }}>
            Spend distribution by campaign — darker = higher level
          </div>
          {treemapData.length === 0 ? (
            <div style={{ color: 'rgba(232,245,233,0.3)', padding: '32px 0', textAlign: 'center' }}>No spend data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <Treemap
                data={treemapData}
                dataKey="size"
                aspectRatio={4 / 3}
                content={<TreemapContent />}
              >
                <Tooltip formatter={(v) => fmtRM(v)} contentStyle={{ background: '#03140e', border: '1px solid rgba(50,205,50,0.2)', borderRadius: 8, fontSize: 12 }} />
              </Treemap>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Tab: Table */}
      {tab === 'table' && (
        <div>
          <input
            className="form-input"
            placeholder="Filter by name…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ marginBottom: 12, maxWidth: 320 }}
          />
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Name</th>
                  <th style={thSort('spend')}>Spend {sort.key === 'spend' ? (sort.dir === 'desc' ? '↓' : '↑') : ''}</th>
                  <th style={thSort('impressions')}>Impr. {sort.key === 'impressions' ? (sort.dir === 'desc' ? '↓' : '↑') : ''}</th>
                  <th style={thSort('clicks')}>Clicks {sort.key === 'clicks' ? (sort.dir === 'desc' ? '↓' : '↑') : ''}</th>
                  <th style={thSort('ctr')}>CTR {sort.key === 'ctr' ? (sort.dir === 'desc' ? '↓' : '↑') : ''}</th>
                  <th style={thSort('cpm')}>CPM {sort.key === 'cpm' ? (sort.dir === 'desc' ? '↓' : '↑') : ''}</th>
                  <th style={thSort('cpc')}>CPC {sort.key === 'cpc' ? (sort.dir === 'desc' ? '↓' : '↑') : ''}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span style={{
                        fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px',
                        background: r._level === 'campaign' ? 'rgba(7,80,60,0.5)' : r._level === 'adset' ? 'rgba(26,127,204,0.2)' : 'rgba(232,160,0,0.15)',
                        color:      r._level === 'campaign' ? '#32cd32'           : r._level === 'adset' ? '#1A7FCC'               : '#E8A000',
                      }}>{r._level}</span>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r._name}>{r._name}</td>
                    <td>{fmtRM(r.spend)}</td>
                    <td>{fmtNum(r.impressions)}</td>
                    <td>{fmtNum(r.clicks)}</td>
                    <td style={{ color: parseFloat(r.ctr) < 0.8 ? '#ff4d4d' : 'inherit' }}>{fmtPct(r.ctr)}</td>
                    <td style={{ color: parseFloat(r.cpm) > 25 ? '#ff4d4d' : 'inherit' }}>{fmtRM(r.cpm)}</td>
                    <td>{fmtRM(r.cpc)}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'rgba(232,245,233,0.3)', padding: 24 }}>No results.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Board */}
      <ActionBoard clientId={clientId} clientCode={client.clientCode} />
    </div>
  );
}

const dp = {
  wrap:        { padding: '24px 28px', marginBottom: 16 },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  code:        { fontSize: 13, fontWeight: 800, color: '#32cd32', letterSpacing: 2 },
  name:        { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  closeBtn:    { background: 'none', border: '1px solid rgba(232,245,233,0.15)', color: 'rgba(232,245,233,0.5)', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontSize: 14, flexShrink: 0 },
  kpiRow:      { display: 'flex', gap: 0, marginBottom: 24, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(50,205,50,0.15)' },
  kpi:         { flex: 1, padding: '14px 10px', textAlign: 'center', borderRight: '1px solid rgba(50,205,50,0.1)', background: 'rgba(7,80,60,0.2)' },
  kpiVal:      { fontSize: 16, fontWeight: 800, lineHeight: 1.1, marginBottom: 4 },
  kpiLabel:    { fontSize: 10, color: 'rgba(232,245,233,0.4)', textTransform: 'uppercase', letterSpacing: 0.8 },
  tabs:        { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(50,205,50,0.12)', paddingBottom: 0 },
  tab:         { background: 'none', border: 'none', borderBottom: '2px solid transparent', color: 'rgba(232,245,233,0.4)', fontSize: 13, fontWeight: 600, padding: '8px 16px', cursor: 'pointer', marginBottom: -1 },
  tabActive:   { color: '#32cd32', borderBottomColor: '#32cd32' },
  subTitle:    { fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 },
  diagnoseWrap:{ marginTop: 8 },
  diagnosisBox:{ background: 'rgba(50,205,50,0.04)', border: '1px solid rgba(50,205,50,0.15)', borderRadius: 10, padding: '16px 20px', marginTop: 4 },
};

// ── Overview Card ─────────────────────────────────────────────────────────────
function ClientCard({ card, onClick, selected }) {
  if (card.error) {
    return (
      <div className="glass" style={{ ...oc.card, borderColor: 'rgba(255,77,77,0.3)', cursor: 'default' }}>
        <div style={oc.code}>{card.clientCode}</div>
        <div style={oc.name}>{card.name}</div>
        <div style={{ fontSize: 11, color: '#ff4d4d', marginTop: 8 }}>⚠ {card.error}</div>
      </div>
    );
  }

  const { totals, health, todaySpend, monthlyBudget, branches } = card;
  const budgetPct = monthlyBudget && todaySpend ? Math.min((totals.spend / monthlyBudget) * 100, 100) : null;

  return (
    <div
      className="glass"
      onClick={onClick}
      style={{
        ...oc.card,
        borderColor: selected ? HEALTH_COLOR[health.score] : `${HEALTH_COLOR[health.score]}33`,
        boxShadow: selected ? `0 0 0 2px ${HEALTH_COLOR[health.score]}44` : undefined,
        cursor: 'pointer'
      }}
    >
      <div style={oc.cardTop}>
        <div>
          <div style={oc.code}>{card.clientCode}</div>
          <div style={oc.name}>{card.name}</div>
        </div>
        <HealthBadge score={health.score} />
      </div>

      {/* Spend vs budget */}
      <div style={oc.spendRow}>
        <div>
          <div style={oc.spendToday}>Today: {fmtRM(todaySpend)}</div>
          <div style={oc.spendPeriod}>{fmtRM(totals.spend)} ({card.rangeKey})</div>
        </div>
        {monthlyBudget && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'rgba(232,245,233,0.4)' }}>of {fmtRM(monthlyBudget)}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: budgetPct > 90 ? '#ff4d4d' : '#32cd32' }}>{budgetPct?.toFixed(0)}%</div>
          </div>
        )}
      </div>

      {/* Budget progress bar */}
      {budgetPct !== null && (
        <div style={oc.progressTrack}>
          <div style={{ ...oc.progressBar, width: `${budgetPct}%`, background: budgetPct > 90 ? '#ff4d4d' : budgetPct > 70 ? '#f5a623' : '#32cd32' }} />
        </div>
      )}

      {/* Key metrics */}
      <div style={oc.metrics}>
        {[
          { label: 'CTR', value: fmtPct(totals.ctr), bad: health.breaches?.some(b => b.metric === 'CTR') },
          { label: 'CPM', value: fmtRM(totals.cpm),  bad: health.breaches?.some(b => b.metric === 'CPM') },
          { label: 'CPR', value: fmtRM(totals.cpr),  bad: health.breaches?.some(b => b.metric === 'CPR') },
        ].map(m => (
          <div key={m.label} style={oc.metric}>
            <div style={{ ...oc.metricVal, color: m.bad ? '#ff4d4d' : 'var(--text-primary)' }}>{m.value}</div>
            <div style={oc.metricLabel}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* VK branch sub-rows */}
      {branches && (
        <div style={oc.branches}>
          {Object.entries(branches).map(([b, d]) => (
            <div key={b} style={oc.branch}>
              <span style={oc.branchCode}>{b}</span>
              <span style={oc.branchSpend}>{fmtRM(d.spend)}</span>
              <span style={oc.branchResults}>{fmtNum(d.results)} results</span>
            </div>
          ))}
        </div>
      )}

      {/* Breach pills */}
      {health.breaches?.length > 0 && (
        <div style={oc.breaches}>
          {health.breaches.map(b => (
            <span key={b.metric} style={oc.breachPill}>⚠ {b.metric}</span>
          ))}
        </div>
      )}
    </div>
  );
}

const oc = {
  card:          { padding: '18px 20px', borderRadius: 12, border: '1px solid', transition: 'all 0.2s' },
  cardTop:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  code:          { fontSize: 11, fontWeight: 800, color: '#32cd32', letterSpacing: 2, marginBottom: 2 },
  name:          { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  spendRow:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  spendToday:    { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' },
  spendPeriod:   { fontSize: 11, color: 'rgba(232,245,233,0.4)', marginTop: 2 },
  progressTrack: { height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, marginBottom: 14, overflow: 'hidden' },
  progressBar:   { height: '100%', borderRadius: 2, transition: 'width 0.4s ease' },
  metrics:       { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 },
  metric:        { textAlign: 'center' },
  metricVal:     { fontSize: 13, fontWeight: 700 },
  metricLabel:   { fontSize: 10, color: 'rgba(232,245,233,0.35)', textTransform: 'uppercase', letterSpacing: 0.6 },
  branches:      { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 },
  branch:        { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.04)' },
  branchCode:    { fontWeight: 800, color: '#32cd32', width: 28 },
  branchSpend:   { color: 'rgba(232,245,233,0.7)', flex: 1 },
  branchResults: { color: 'rgba(232,245,233,0.4)' },
  breaches:      { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  breachPill:    { fontSize: 10, color: '#ff4d4d', background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.25)', borderRadius: 10, padding: '2px 8px', fontWeight: 700 },
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdsMonitor() {
  const toast = useToast();
  const [overview,    setOverview]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [selectedId,  setSelectedId]  = useState(null);
  const [range,       setRange]       = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [refreshing,  setRefreshing]  = useState(false);

  const rangeParams = range === 'custom' && customStart && customEnd
    ? { dateStart: customStart, dateStop: customEnd }
    : { range };

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await monitorAPI.overview(rangeParams);
      setOverview(data);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to load monitor data.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [JSON.stringify(rangeParams)]);

  useEffect(() => { load(); }, [load]);

  const handleCardClick = (id) => {
    setSelectedId(prev => prev === id ? null : id);
  };

  const greenCount  = overview?.cards?.filter(c => c.health?.score === 'green').length  || 0;
  const yellowCount = overview?.cards?.filter(c => c.health?.score === 'yellow').length || 0;
  const redCount    = overview?.cards?.filter(c => c.health?.score === 'red').length    || 0;

  return (
    <div style={pg.page} className="fade-up">
      {/* Page header */}
      <div style={pg.header}>
        <div>
          <h1 style={pg.title}>Ads Monitor</h1>
          <p style={pg.sub}>Live Meta Ads health across all assigned clients</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Health summary pills */}
          {!loading && overview && (
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ ...pg.pill, background: 'rgba(50,205,50,0.12)',  color: '#32cd32',  border: '1px solid rgba(50,205,50,0.25)'  }}>{greenCount} healthy</span>
              <span style={{ ...pg.pill, background: 'rgba(245,166,35,0.12)', color: '#f5a623',  border: '1px solid rgba(245,166,35,0.25)' }}>{yellowCount} at risk</span>
              <span style={{ ...pg.pill, background: 'rgba(255,77,77,0.12)',  color: '#ff4d4d',  border: '1px solid rgba(255,77,77,0.25)'  }}>{redCount} critical</span>
            </div>
          )}
          {/* Refresh button */}
          <button className="btn btn-ghost btn-sm" onClick={() => load(true)} disabled={refreshing || loading}>
            {refreshing ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Refreshing…</> : '↺ Refresh'}
          </button>
        </div>
      </div>

      {/* Range selector */}
      <div style={pg.rangeBar}>
        {RANGE_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setRange(opt.value)}
            className="btn btn-ghost btn-sm"
            style={{ borderColor: range === opt.value ? 'rgba(50,205,50,0.5)' : undefined, color: range === opt.value ? '#32cd32' : undefined }}>
            {opt.label}
          </button>
        ))}
        {range === 'custom' && (
          <>
            <input type="date" className="form-input" style={{ width: 150 }} value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span style={{ color: 'rgba(232,245,233,0.4)', alignSelf: 'center' }}>→</span>
            <input type="date" className="form-input" style={{ width: 150 }} value={customEnd}   onChange={e => setCustomEnd(e.target.value)}   />
          </>
        )}
        {overview?.cachedAt === undefined && overview?.cards?.[0]?.cachedAt && (
          <span style={{ fontSize: 11, color: 'rgba(232,245,233,0.3)', marginLeft: 8, alignSelf: 'center' }}>
            · data as of {new Date(overview.cards[0].cachedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Loading state */}
      {loading ? (
        <div style={{ padding: 80, textAlign: 'center' }}><div className="spinner" /></div>
      ) : (
        <>
          {/* Client cards grid */}
          <div style={pg.grid}>
            {(overview?.cards || []).map(card => (
              <ClientCard
                key={card.id}
                card={card}
                selected={selectedId === card.id}
                onClick={() => !card.error && handleCardClick(card.id)}
              />
            ))}
            {overview?.cards?.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'rgba(232,245,233,0.3)', padding: 48 }}>
                No clients assigned. Ask your admin to assign clients to your account.
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedId && (
            <ClientDetail
              key={selectedId}
              clientId={selectedId}
              rangeParams={rangeParams}
              onClose={() => setSelectedId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

const pg = {
  page:     { padding: '32px 36px', maxWidth: 1200 },
  header:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
  title:    { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 },
  sub:      { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  pill:     { fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '4px 10px' },
  rangeBar: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' },
  grid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 24 },
};
