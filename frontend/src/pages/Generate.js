import React, { useEffect, useState } from 'react';
import { clientsAPI, reportsAPI } from '../utils/api';
import { useToast } from '../hooks/useToast';

function monthLabel(y, m) {
  return new Date(y, m - 1, 1).toLocaleString('en-MY', { month: 'long', year: 'numeric' });
}

function getMonthRange(y, m) {
  const first = new Date(y, m - 1, 1);
  const last  = new Date(y, m, 0);
  const fmt   = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { dateStart: fmt(first), dateStop: fmt(last) };
}

// Build last 13 month options
function buildMonthOptions() {
  const now = new Date();
  const opts = [];
  for (let i = 0; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    opts.push({ label: monthLabel(y, m), y, m });
  }
  return opts;
}

export default function Generate() {
  const toast = useToast();
  const monthOpts = buildMonthOptions();

  const [clients,     setClients]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [mode,        setMode]        = useState('month');   // 'month' | 'custom'
  const [monthIdx,    setMonthIdx]    = useState(1);         // default: last month
  const [customStart, setCustomStart] = useState('');
  const [customStop,  setCustomStop]  = useState('');
  const [generating,  setGenerating]  = useState(false);
  const [lastJobs,    setLastJobs]    = useState([]);

  useEffect(() => {
    clientsAPI.list().then(setClients).finally(() => setLoading(false));
  }, []);

  const toggleClient = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll  = () => setSelectedIds(clients.map(c => c.id));
  const clearAll   = () => setSelectedIds([]);

  const getRange = () => {
    if (mode === 'month') {
      const { y, m, label } = monthOpts[monthIdx];
      const { dateStart, dateStop } = getMonthRange(y, m);
      return { dateStart, dateStop, label: label.replace(' ', '') };
    }
    return {
      dateStart: customStart,
      dateStop:  customStop,
      label: `${customStart}_to_${customStop}`
    };
  };

  const handleGenerate = async () => {
    if (selectedIds.length === 0) return toast('Select at least one client.', 'error');
    const { dateStart, dateStop, label } = getRange();
    if (!dateStart || !dateStop) return toast('Set a valid date range.', 'error');
    if (dateStart > dateStop)   return toast('Start date must be before end date.', 'error');

    setGenerating(true);
    const jobs = [];

    for (const clientId of selectedIds) {
      const client = clients.find(c => c.id === clientId);
      try {
        const res = await reportsAPI.generate({ clientId, dateStart, dateStop, periodLabel: label });
        jobs.push({ clientCode: client?.clientCode, period: label, ok: true });
        toast(`Report queued for ${client?.clientCode}`, 'success');
      } catch (err) {
        jobs.push({ clientCode: client?.clientCode, period: label, ok: false, error: err.response?.data?.error || err.message });
        toast(`Failed: ${client?.clientCode} — ${err.response?.data?.error || err.message}`, 'error');
      }
    }

    setLastJobs(jobs);
    setGenerating(false);
  };

  const { dateStart, dateStop, label } = getRange();

  return (
    <div style={s.page} className="fade-up">
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Generate Report</h1>
          <p style={s.sub}>Pull Meta Ads data and produce a Word report for one or more clients</p>
        </div>
      </div>

      <div style={s.grid}>
        {/* Left — Config */}
        <div style={s.left}>

          {/* Step 1 — Select Clients */}
          <div className="glass" style={s.card}>
            <div style={s.stepHeader}>
              <span style={s.stepBadge}>01</span>
              <span style={s.stepTitle}>Select Clients</span>
              <div style={s.stepActions}>
                <button className="btn btn-ghost btn-sm" onClick={selectAll}>All</button>
                <button className="btn btn-ghost btn-sm" onClick={clearAll}>None</button>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
                <div className="spinner" />
              </div>
            ) : clients.length === 0 ? (
              <div style={s.noClients}>
                No clients onboarded yet. <a href="/clients" style={{ color: '#32cd32' }}>Add clients →</a>
              </div>
            ) : (
              <div style={s.clientList}>
                {clients.map(c => {
                  const selected = selectedIds.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      style={{ ...s.clientRow, ...(selected ? s.clientRowSelected : {}) }}
                      onClick={() => toggleClient(c.id)}
                    >
                      <div style={{ ...s.checkbox, ...(selected ? s.checkboxOn : {}) }}>
                        {selected && '✓'}
                      </div>
                      <div>
                        <div style={s.clientRowCode}>{c.clientCode}</div>
                        <div style={s.clientRowName}>{c.name}</div>
                      </div>
                      <div style={s.clientRowAcct}>{c.adAccountId}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2 — Date Range */}
          <div className="glass" style={s.card}>
            <div style={s.stepHeader}>
              <span style={s.stepBadge}>02</span>
              <span style={s.stepTitle}>Reporting Period</span>
            </div>

            <div style={s.modeTabs}>
              <button
                className={`btn btn-sm ${mode === 'month' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setMode('month')}
              >By Month</button>
              <button
                className={`btn btn-sm ${mode === 'custom' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setMode('custom')}
              >Custom Range</button>
            </div>

            {mode === 'month' ? (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Select Month</label>
                <select className="form-input" value={monthIdx} onChange={e => setMonthIdx(parseInt(e.target.value))}>
                  {monthOpts.map((o, i) => (
                    <option key={i} value={i}>{o.label}{i === 0 ? ' (current)' : i === 1 ? ' (last month)' : ''}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={s.customRange}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Start Date</label>
                  <input type="date" className="form-input" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">End Date</label>
                  <input type="date" className="form-input" value={customStop}  onChange={e => setCustomStop(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Step 3 — Generate */}
          <div className="glass" style={s.card}>
            <div style={s.stepHeader}>
              <span style={s.stepBadge}>03</span>
              <span style={s.stepTitle}>Generate</span>
            </div>

            {/* Summary */}
            <div style={s.summary}>
              <div style={s.summaryRow}>
                <span style={s.summaryKey}>Clients selected</span>
                <span style={s.summaryVal}>{selectedIds.length}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryKey}>Period</span>
                <span style={s.summaryVal}>{dateStart} → {dateStop}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryKey}>Label</span>
                <span style={s.summaryVal}>{label}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryKey}>Output folder</span>
                <span style={{ ...s.summaryVal, fontFamily: 'monospace', fontSize: 11 }}>
                  /reports/[CLIENT_CODE]/[CODE]-[Name]-Meta-Ads-Report-{label}.docx
                </span>
              </div>
            </div>

            <button
              className="btn btn-primary w-full"
              style={{ marginTop: 20, justifyContent: 'center', padding: '14px 0', fontSize: 14 }}
              onClick={handleGenerate}
              disabled={generating || selectedIds.length === 0}
            >
              {generating
                ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Generating…</>
                : `▶  Generate ${selectedIds.length > 1 ? `${selectedIds.length} Reports` : 'Report'}`
              }
            </button>
          </div>
        </div>

        {/* Right — Info + Result */}
        <div style={s.right}>
          {/* What happens */}
          <div className="glass" style={s.card}>
            <div style={s.infoTitle}>What happens when you generate</div>
            <ol style={s.infoList}>
              <li>The server calls the <strong>Meta Graph API</strong> using the client's Access Token</li>
              <li>Two API calls per client: <strong>Platform/Day</strong> breakdown + <strong>Age/Gender</strong> breakdown</li>
              <li>Data is processed and a <strong>Word .docx</strong> is generated with 9 sections</li>
              <li>The file is saved to <code>/reports/[CLIENT_CODE]/</code></li>
              <li>Track progress in <strong>History</strong> — download when status is Done</li>
            </ol>
          </div>

          {/* Output naming */}
          <div className="glass" style={s.card}>
            <div style={s.infoTitle}>Output File Naming</div>
            <div style={s.codeBlock}>
              {'[CLIENT_CODE]-[ClientName]-Meta-Ads-Report-[Period].docx'}
            </div>
            <div style={s.exampleRow}><span style={{ color: '#32cd32' }}>VF</span>-VikingFitness-Meta-Ads-Report-March2026.docx</div>
            <div style={s.exampleRow}><span style={{ color: '#32cd32' }}>PF</span>-PetiteFleur-Meta-Ads-Report-April2026.docx</div>
            <div style={s.exampleRow}><span style={{ color: '#32cd32' }}>MJ</span>-MasterJessie-Meta-Ads-Report-March2026.docx</div>
          </div>

          {/* Last job results */}
          {lastJobs.length > 0 && (
            <div className="glass" style={s.card}>
              <div style={s.infoTitle}>Last Batch Results</div>
              {lastJobs.map((j, i) => (
                <div key={i} style={s.jobResult}>
                  <span style={s.codeTag}>{j.clientCode}</span>
                  <span style={{ fontSize: 12, color: j.ok ? '#32cd32' : '#ff4d4d', marginLeft: 10 }}>
                    {j.ok ? '✓ Queued — check History' : `✕ ${j.error}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { padding: '32px 36px', maxWidth: 1100 },
  header: { marginBottom: 28 },
  title: { fontSize: 28, fontWeight: 800, color: '#e8f5e9', letterSpacing: -0.5 },
  sub: { fontSize: 13, color: 'rgba(232,245,233,0.4)', marginTop: 4 },
  grid: { display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 20, alignItems: 'start' },
  left: { display: 'flex', flexDirection: 'column', gap: 16 },
  right: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: { padding: '22px 24px' },
  stepHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 },
  stepBadge: {
    background: 'rgba(50,205,50,0.15)', color: '#32cd32',
    border: '1px solid rgba(50,205,50,0.3)',
    borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 800, letterSpacing: 1
  },
  stepTitle: { fontSize: 15, fontWeight: 700, color: '#e8f5e9', flex: 1 },
  stepActions: { display: 'flex', gap: 8 },
  noClients: { color: 'rgba(232,245,233,0.35)', fontSize: 13, padding: '8px 0' },
  clientList: { display: 'flex', flexDirection: 'column', gap: 8 },
  clientRow: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.15)', transition: 'all 0.15s'
  },
  clientRowSelected: {
    border: '1px solid rgba(50,205,50,0.4)',
    background: 'rgba(50,205,50,0.08)',
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    border: '1.5px solid rgba(232,245,233,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: '#051c14',
    flexShrink: 0, transition: 'all 0.15s'
  },
  checkboxOn: { background: '#32cd32', border: '1.5px solid #32cd32' },
  clientRowCode: { fontSize: 13, fontWeight: 800, color: '#32cd32', letterSpacing: 1 },
  clientRowName: { fontSize: 12, color: 'rgba(232,245,233,0.6)', marginTop: 2 },
  clientRowAcct: { fontSize: 10, color: 'rgba(232,245,233,0.25)', fontFamily: 'monospace', marginLeft: 'auto', flexShrink: 0 },
  modeTabs: { display: 'flex', gap: 8, marginBottom: 16 },
  customRange: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  summary: { display: 'flex', flexDirection: 'column', gap: 10 },
  summaryRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  summaryKey: { fontSize: 12, color: 'rgba(232,245,233,0.4)', flexShrink: 0 },
  summaryVal: { fontSize: 12, color: '#e8f5e9', fontWeight: 600, textAlign: 'right' },
  infoTitle: { fontSize: 12, fontWeight: 700, color: '#32cd32', letterSpacing: 0.8, marginBottom: 12, textTransform: 'uppercase' },
  infoList: { paddingLeft: 18, color: 'rgba(232,245,233,0.55)', fontSize: 13, lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: 4 },
  codeBlock: {
    background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '10px 14px',
    fontFamily: 'monospace', fontSize: 11, color: '#32cd32', marginBottom: 10,
    border: '1px solid rgba(50,205,50,0.15)'
  },
  exampleRow: { fontSize: 12, color: 'rgba(232,245,233,0.45)', fontFamily: 'monospace', marginBottom: 4 },
  codeTag: {
    background: 'rgba(50,205,50,0.12)', color: '#32cd32',
    border: '1px solid rgba(50,205,50,0.25)',
    borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700
  },
  jobResult: { display: 'flex', alignItems: 'center', marginBottom: 8 }
};
