import React, { useEffect, useState, useCallback } from 'react';
import { clientsAPI, jobsAPI, backendUrl } from '../utils/api';
import { useToast } from '../hooks/useToast';

const STATUS_COLORS = { done: '#32cd32', running: '#f5a623', failed: '#ff4d4d' };
const STATUS_LABELS = { done: 'Done', running: 'Running…', failed: 'Failed' };

export default function History() {
  const toast = useToast();
  const [jobs,       setJobs]       = useState([]);
  const [clients,    setClients]    = useState([]);
  const [loading,    setLoading]    = useState(true);

  // Filters
  const [filterCode,   setFilterCode]   = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [search,       setSearch]       = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');

  const load = useCallback(() => {
    Promise.all([jobsAPI.list({ limit: 200 }), clientsAPI.list()])
      .then(([j, c]) => { setJobs(j); setClients(c); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const handleDelete = async (id, label) => {
    if (!window.confirm(`Delete job "${label}"? This cannot be undone.`)) return;
    try {
      await jobsAPI.delete(id);
      toast('Job deleted.', 'success');
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch {
      toast('Failed to delete job.', 'error');
    }
  };

  const clientCodes = ['ALL', ...new Set(jobs.map(j => j.clientCode).filter(Boolean))];

  const filtered = jobs.filter(j => {
    if (filterCode !== 'ALL' && j.clientCode !== filterCode) return false;
    if (filterStatus !== 'ALL' && j.status !== filterStatus) return false;
    if (search && !`${j.clientCode} ${j.period}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom && j.createdAt < dateFrom) return false;
    if (dateTo   && j.createdAt > dateTo + 'T23:59:59') return false;
    return true;
  });

  const counts = {
    done:    jobs.filter(j => j.status === 'done').length,
    running: jobs.filter(j => j.status === 'running').length,
    failed:  jobs.filter(j => j.status === 'failed').length,
  };

  const hasFilters = filterCode !== 'ALL' || filterStatus !== 'ALL' || search || dateFrom || dateTo;
  const clearFilters = () => { setFilterCode('ALL'); setFilterStatus('ALL'); setSearch(''); setDateFrom(''); setDateTo(''); };

  return (
    <div style={s.page} className="fade-up">
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Report History</h1>
          <p style={s.sub}>All generated report jobs — download completed reports</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {/* Summary pills */}
      <div style={s.pills}>
        <div style={s.pill} onClick={() => setFilterStatus('ALL')}>
          <span style={s.pillNum}>{jobs.length}</span>
          <span style={s.pillLabel}>Total</span>
        </div>
        <div style={{ ...s.pill, borderColor: 'rgba(50,205,50,0.3)' }} onClick={() => setFilterStatus('done')}>
          <span style={{ ...s.pillNum, color: '#32cd32' }}>{counts.done}</span>
          <span style={s.pillLabel}>Done</span>
        </div>
        <div style={{ ...s.pill, borderColor: 'rgba(245,166,35,0.3)' }} onClick={() => setFilterStatus('running')}>
          <span style={{ ...s.pillNum, color: '#f5a623' }}>{counts.running}</span>
          <span style={s.pillLabel}>Running</span>
        </div>
        <div style={{ ...s.pill, borderColor: 'rgba(255,77,77,0.3)' }} onClick={() => setFilterStatus('failed')}>
          <span style={{ ...s.pillNum, color: '#ff4d4d' }}>{counts.failed}</span>
          <span style={s.pillLabel}>Failed</span>
        </div>
      </div>

      {/* Filters */}
      <div className="glass" style={s.filterBar}>
        {/* Row 1: search + client + status */}
        <div style={s.filterRow}>
          <input
            className="form-input"
            placeholder="Search by client code or period…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select className="form-input" value={filterCode} onChange={e => setFilterCode(e.target.value)} style={{ width: 160 }}>
            {clientCodes.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Clients' : c}</option>)}
          </select>
          <select className="form-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 140 }}>
            <option value="ALL">All Status</option>
            <option value="done">Done</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        {/* Row 2: date range */}
        <div style={s.filterRow}>
          <span style={s.filterLabel}>Created from</span>
          <input
            type="date" className="form-input"
            value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ width: 160 }}
          />
          <span style={s.filterLabel}>to</span>
          <input
            type="date" className="form-input"
            value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ width: 160 }}
          />
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>✕ Clear all</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="glass" style={s.tableWrap}>
        {loading ? (
          <div style={s.center}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>◫</div>
            {jobs.length === 0 ? 'No report jobs yet.' : 'No jobs match your filters.'}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Period</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Download</th>
                <th>Drive</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(job => (
                <tr key={job.id}>
                  <td>
                    <span style={s.codeTag}>{job.clientCode}</span>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{job.period}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {job.status === 'running' && <div className="spinner" style={{ width: 12, height: 12 }} />}
                      <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLORS[job.status] || 'var(--text-muted)' }}>
                        {STATUS_LABELS[job.status] || job.status}
                      </span>
                    </div>
                    {job.status === 'failed' && job.error && (
                      <div style={{ fontSize: 10, color: '#ff4d4d', marginTop: 3, maxWidth: 200 }} title={job.error}>
                        {job.error.length > 50 ? job.error.slice(0, 50) + '…' : job.error}
                      </div>
                    )}
                  </td>
                  <td style={s.timeCell}>
                    {new Date(job.createdAt).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                    <br />
                    <span style={{ color: 'var(--text-dim)' }}>
                      {new Date(job.createdAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td style={s.timeCell}>
                    {job.updatedAt && job.updatedAt !== job.createdAt
                      ? new Date(job.updatedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
                      : '—'
                    }
                  </td>
                  <td>
                    {job.filePath ? (
                      <a href={backendUrl(job.filePath)} download className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                        ↓ .docx
                      </a>
                    ) : job.status === 'running' ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Generating…</span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {job.driveUrl ? (
                      <a href={job.driveUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm"
                        style={{ textDecoration: 'none', background: 'rgba(26,127,204,0.15)', color: '#1A7FCC', border: '1px solid rgba(26,127,204,0.3)' }}>
                        ↗ Drive
                      </a>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => handleDelete(job.id, `${job.clientCode} ${job.period}`)}
                      style={s.deleteBtn}
                      title="Delete this record"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* File system note */}
      <div className="glass" style={s.noteBox}>
        <div style={s.noteTitle}>📁 File Storage Location</div>
        <div style={s.noteBody}>
          Reports are saved on the server at:
          <code style={s.codePath}> /reports/[CLIENT_CODE]/[filename].docx</code>
          <br />
          Each client gets its own subfolder. Download via the button above or directly from the server filesystem.
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { padding: '32px 36px', maxWidth: 1100 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 },
  sub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  pills: { display: 'flex', gap: 12, marginBottom: 20 },
  pill: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '12px 22px', cursor: 'pointer',
    background: 'var(--glass-bg)', border: '1px solid var(--border)',
    borderRadius: 10, minWidth: 80, transition: 'all 0.15s'
  },
  pillNum: { fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 },
  pillLabel: { fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 },
  filterBar: { padding: '14px 18px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  filterRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  filterLabel: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' },
  tableWrap: { overflow: 'hidden', marginBottom: 20 },
  center: { padding: 48, display: 'flex', justifyContent: 'center' },
  empty: { padding: 52, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 },
  codeTag: {
    background: 'rgba(50,205,50,0.12)', color: '#32cd32',
    border: '1px solid rgba(50,205,50,0.25)',
    borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, letterSpacing: 1
  },
  timeCell: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 },
  deleteBtn: {
    background: 'none', border: '1px solid rgba(220,50,50,0.25)',
    color: 'var(--text-muted)', borderRadius: 6,
    width: 30, height: 30, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, transition: 'all 0.15s',
  },
  noteBox: { padding: '16px 22px' },
  noteTitle: { fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 },
  noteBody: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 },
  codePath: {
    fontFamily: 'monospace', fontSize: 12, color: '#32cd32',
    background: 'rgba(50,205,50,0.08)', borderRadius: 4, padding: '1px 6px'
  }
};
