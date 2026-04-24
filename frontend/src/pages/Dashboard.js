import React, { useEffect, useState } from 'react';
import { clientsAPI, jobsAPI, schedulesAPI } from '../utils/api';

const statusColor = { done: '#32cd32', running: '#f5a623', failed: '#ff4d4d' };
const statusLabel = { done: 'Done', running: 'Running', failed: 'Failed' };

export default function Dashboard() {
  const [clients, setClients]     = useState([]);
  const [jobs, setJobs]           = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([clientsAPI.list(), jobsAPI.list({ limit: 20 }), schedulesAPI.list()])
      .then(([c, j, s]) => { setClients(c); setJobs(j); setSchedules(s); })
      .finally(() => setLoading(false));

    // Poll jobs every 8s for live status
    const interval = setInterval(() =>
      jobsAPI.list({ limit: 20 }).then(setJobs), 8000
    );
    return () => clearInterval(interval);
  }, []);

  const activeSchedules = schedules.filter(s => s.active).length;
  const doneJobs = jobs.filter(j => j.status === 'done').length;
  const failedJobs = jobs.filter(j => j.status === 'failed').length;

  const kpis = [
    { label: 'Active Clients', value: clients.length, sub: 'connected', icon: '◉' },
    { label: 'Auto Schedules', value: activeSchedules, sub: 'recurring', icon: '◷' },
    { label: 'Reports Generated', value: doneJobs, sub: 'this session', icon: '◫' },
    { label: 'Failed Jobs', value: failedJobs, sub: 'need attention', icon: '⚠', danger: failedJobs > 0 },
  ];

  return (
    <div style={styles.page} className="fade-up">
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.sub}>Meta Ads performance hub — Millecube Digital</p>
        </div>
        <div style={styles.liveDot}>
          <div style={styles.dot} />
          <span style={styles.liveText}>Live</span>
        </div>
      </div>

      {/* KPI Row */}
      <div style={styles.kpiGrid}>
        {kpis.map(k => (
          <div key={k.label} className="glass stat-card" style={styles.kpiCard}>
            <div style={{ ...styles.kpiIcon, color: k.danger ? '#ff4d4d' : '#32cd32' }}>{k.icon}</div>
            <div style={{ ...styles.kpiValue, color: k.danger ? '#ff4d4d' : '#e8f5e9' }}>{loading ? '—' : k.value}</div>
            <div style={styles.kpiLabel}>{k.label}</div>
            <div style={styles.kpiSub}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Recent Jobs */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Recent Report Jobs</h2>
          <span className="badge badge-dim">{jobs.length} jobs</span>
        </div>
        <div className="glass" style={styles.tableWrap}>
          {loading ? (
            <div style={styles.loading}><div className="spinner" /></div>
          ) : jobs.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>◫</div>
              <div>No report jobs yet. Generate your first report.</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id}>
                    <td>
                      <span style={styles.codeTag}>{job.clientCode}</span>
                    </td>
                    <td style={{ color: 'rgba(232,245,233,0.7)', fontSize: 13 }}>{job.period}</td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12, fontWeight: 600,
                        color: statusColor[job.status] || '#aaa'
                      }}>
                        {job.status === 'running' && <div className="spinner" style={{ width: 12, height: 12 }} />}
                        {statusLabel[job.status] || job.status}
                      </span>
                    </td>
                    <td style={{ color: 'rgba(232,245,233,0.4)', fontSize: 12 }}>
                      {new Date(job.createdAt).toLocaleString('en-MY', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td>
                      {job.filePath && (
                        <a
                          href={job.filePath}
                          download
                          className="btn btn-ghost btn-sm"
                          style={{ textDecoration: 'none' }}
                        >
                          ↓ Download
                        </a>
                      )}
                      {job.status === 'failed' && (
                        <span style={{ fontSize: 11, color: '#ff4d4d' }} title={job.error}>
                          ⚠ {job.error?.slice(0, 40)}…
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Clients Quick Overview */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Connected Clients</h2>
        </div>
        <div style={styles.clientGrid}>
          {clients.map(c => (
            <div key={c.id} className="glass" style={styles.clientCard}>
              <div style={styles.clientCodeBadge}>{c.clientCode}</div>
              <div style={styles.clientName}>{c.name}</div>
              <div style={styles.clientMeta}>Ad Account: {c.adAccountId}</div>
              <div style={styles.clientMeta}>
                {schedules.find(s => s.clientId === c.id)
                  ? <span className="badge badge-green">Scheduled</span>
                  : <span className="badge badge-dim">Manual</span>
                }
              </div>
            </div>
          ))}
          {clients.length === 0 && !loading && (
            <div className="glass" style={{ ...styles.clientCard, opacity: 0.5 }}>
              <div style={styles.emptyIcon}>+</div>
              <div style={{ fontSize: 13 }}>Add your first client</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '32px 36px', maxWidth: 1100 },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 32
  },
  title: { fontSize: 28, fontWeight: 800, color: '#e8f5e9', letterSpacing: -0.5 },
  sub: { fontSize: 13, color: 'rgba(232,245,233,0.4)', marginTop: 4 },
  liveDot: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(50,205,50,0.08)', border: '1px solid rgba(50,205,50,0.2)',
    borderRadius: 20, padding: '6px 14px'
  },
  dot: {
    width: 8, height: 8, borderRadius: '50%', background: '#32cd32',
    animation: 'pulse-green 2s infinite'
  },
  liveText: { fontSize: 12, color: '#32cd32', fontWeight: 600 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 },
  kpiCard: { textAlign: 'center', padding: '24px 20px' },
  kpiIcon: { fontSize: 22, marginBottom: 8 },
  kpiValue: { fontSize: 36, fontWeight: 800, lineHeight: 1.1 },
  kpiLabel: { fontSize: 12, fontWeight: 700, color: 'rgba(232,245,233,0.5)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  kpiSub: { fontSize: 11, color: 'rgba(232,245,233,0.25)', marginTop: 2 },
  section: { marginBottom: 32 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: '#e8f5e9' },
  tableWrap: { overflow: 'hidden' },
  loading: { padding: 40, display: 'flex', justifyContent: 'center' },
  empty: {
    padding: 48, textAlign: 'center',
    color: 'rgba(232,245,233,0.3)', fontSize: 14
  },
  emptyIcon: { fontSize: 32, marginBottom: 12 },
  codeTag: {
    background: 'rgba(50,205,50,0.12)', color: '#32cd32',
    border: '1px solid rgba(50,205,50,0.25)',
    borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, letterSpacing: 0.5
  },
  clientGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 },
  clientCard: { padding: '20px', display: 'flex', flexDirection: 'column', gap: 6 },
  clientCodeBadge: {
    fontSize: 13, fontWeight: 800, color: '#32cd32', letterSpacing: 2,
    marginBottom: 4
  },
  clientName: { fontSize: 14, fontWeight: 600, color: '#e8f5e9' },
  clientMeta: { fontSize: 11, color: 'rgba(232,245,233,0.35)' }
};
