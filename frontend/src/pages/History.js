import React, { useEffect, useState, useCallback } from 'react';
import { clientsAPI, jobsAPI, backendUrl } from '../utils/api';

const STATUS_COLORS = { done: '#32cd32', running: '#f5a623', failed: '#ff4d4d' };
const STATUS_LABELS = { done: 'Done', running: 'Running…', failed: 'Failed' };

export default function History() {
  const [jobs,       setJobs]       = useState([]);
  const [clients,    setClients]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filterCode, setFilterCode] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [search,     setSearch]     = useState('');

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

  const clientCodes = ['ALL', ...new Set(jobs.map(j => j.clientCode).filter(Boolean))];

  const filtered = jobs.filter(j => {
    if (filterCode !== 'ALL' && j.clientCode !== filterCode) return false;
    if (filterStatus !== 'ALL' && j.status !== filterStatus) return false;
    if (search && !`${j.clientCode} ${j.period}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    done:    jobs.filter(j => j.status === 'done').length,
    running: jobs.filter(j => j.status === 'running').length,
    failed:  jobs.filter(j => j.status === 'failed').length,
  };

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
        <input
          className="form-input"
          placeholder="Search by client code or period…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 300 }}
        />
        <select className="form-input" value={filterCode} onChange={e => setFilterCode(e.target.value)} style={{ width: 160 }}>
          {clientCodes.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Clients' : c}</option>)}
        </select>
        <select className="form-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 150 }}>
          <option value="ALL">All Status</option>
          <option value="done">Done</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
        </select>
        {(filterCode !== 'ALL' || filterStatus !== 'ALL' || search) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterCode('ALL'); setFilterStatus('ALL'); setSearch(''); }}>
            Clear filters
          </button>
        )}
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
              </tr>
            </thead>
            <tbody>
              {filtered.map(job => (
                <tr key={job.id}>
                  <td>
                    <span style={s.codeTag}>{job.clientCode}</span>
                  </td>
                  <td style={{ fontSize: 13, color: 'rgba(232,245,233,0.75)' }}>{job.period}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {job.status === 'running' && <div className="spinner" style={{ width: 12, height: 12 }} />}
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: STATUS_COLORS[job.status] || '#aaa'
                      }}>
                        {STATUS_LABELS[job.status] || job.status}
                      </span>
                    </div>
                    {job.status === 'failed' && job.error && (
                      <div style={{ fontSize: 10, color: '#ff4d4d', marginTop: 3, maxWidth: 200 }}
                        title={job.error}>
                        {job.error.length > 50 ? job.error.slice(0, 50) + '…' : job.error}
                      </div>
                    )}
                  </td>
                  <td style={s.timeCell}>
                    {new Date(job.createdAt).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                    <br />
                    <span style={{ color: 'rgba(232,245,233,0.3)' }}>
                      {new Date(job.createdAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td style={s.timeCell}>
                    {job.updatedAt !== job.createdAt
                      ? new Date(job.updatedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
                      : '—'
                    }
                  </td>
                  <td>
                    {job.filePath ? (
                      <a
                        href={backendUrl(job.filePath)}
                        download
                        className="btn btn-primary btn-sm"
                        style={{ textDecoration: 'none' }}
                      >
                        ↓ .docx
                      </a>
                    ) : job.status === 'running' ? (
                      <span style={{ fontSize: 12, color: 'rgba(232,245,233,0.3)' }}>Generating…</span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'rgba(232,245,233,0.2)' }}>—</span>
                    )}
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
          Reports are saved locally on the server at:
          <code style={s.codePath}> /millecube-ads-hub/reports/[CLIENT_CODE]/[filename].docx</code>
          <br />
          Each client gets its own subfolder. Files are accessible via the Download button above or directly from the filesystem.
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { padding: '32px 36px', maxWidth: 1100 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: '#e8f5e9', letterSpacing: -0.5 },
  sub: { fontSize: 13, color: 'rgba(232,245,233,0.4)', marginTop: 4 },
  pills: { display: 'flex', gap: 12, marginBottom: 20 },
  pill: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '12px 22px', cursor: 'pointer',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, minWidth: 80, transition: 'all 0.15s'
  },
  pillNum: { fontSize: 24, fontWeight: 800, color: '#e8f5e9', lineHeight: 1.1 },
  pillLabel: { fontSize: 11, color: 'rgba(232,245,233,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 },
  filterBar: { display: 'flex', gap: 12, padding: '14px 18px', marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  tableWrap: { overflow: 'hidden', marginBottom: 20 },
  center: { padding: 48, display: 'flex', justifyContent: 'center' },
  empty: { padding: 52, textAlign: 'center', color: 'rgba(232,245,233,0.3)', fontSize: 14 },
  codeTag: {
    background: 'rgba(50,205,50,0.12)', color: '#32cd32',
    border: '1px solid rgba(50,205,50,0.25)',
    borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, letterSpacing: 1
  },
  timeCell: { fontSize: 12, color: 'rgba(232,245,233,0.55)', lineHeight: 1.6 },
  noteBox: { padding: '16px 22px' },
  noteTitle: { fontSize: 13, fontWeight: 700, color: '#6bc71f', marginBottom: 8 },
  noteBody: { fontSize: 13, color: 'rgba(232,245,233,0.5)', lineHeight: 1.7 },
  codePath: {
    fontFamily: 'monospace', fontSize: 12, color: '#32cd32',
    background: 'rgba(50,205,50,0.08)', borderRadius: 4, padding: '1px 6px'
  }
};
