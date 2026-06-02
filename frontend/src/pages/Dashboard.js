import React, { useEffect, useState, useMemo } from 'react';
import { clientsAPI, jobsAPI, schedulesAPI, settingsAPI } from '../utils/api';

const statusColor = { done: '#32cd32', running: '#f5a623', failed: '#ff4d4d' };
const statusLabel = { done: 'Done', running: 'Running', failed: 'Failed' };

export default function Dashboard() {
  const [clients, setClients]     = useState([]);
  const [jobs, setJobs]           = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [logo, setLogo]           = useState(null);

  useEffect(() => {
    Promise.all([clientsAPI.list(), jobsAPI.list({ limit: 20 }), schedulesAPI.list(), settingsAPI.get().catch(() => ({}))])
      .then(([c, j, s, settings]) => { setClients(c); setJobs(j); setSchedules(s); if (settings?.logo) setLogo(settings.logo); })
      .finally(() => setLoading(false));

    // Poll jobs every 8s for live status
    const interval = setInterval(() =>
      jobsAPI.list({ limit: 20 }).then(setJobs), 8000
    );
    return () => clearInterval(interval);
  }, []);

  const [selectedClientId, setSelectedClientId] = useState('');

  // Auto-select first client once loaded
  useEffect(() => {
    if (clients.length > 0 && !selectedClientId) setSelectedClientId(clients[0].id);
  }, [clients]);

  const selectedClient = useMemo(() => clients.find(c => c.id === selectedClientId) || null, [clients, selectedClientId]);
  const clientSchedule = useMemo(() => schedules.find(s => s.clientId === selectedClientId) || null, [schedules, selectedClientId]);
  const clientJobs     = useMemo(() => jobs.filter(j => j.clientCode === selectedClient?.clientCode), [jobs, selectedClient]);

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
    <div style={styles.page} className="page-wrap fade-up">
      <div style={styles.header} className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {logo && (
            <img src={logo} alt="logo" style={{ maxHeight: 48, maxWidth: 140, objectFit: 'contain', borderRadius: 6 }} />
          )}
          <div>
            <h1 style={styles.title}>Dashboard</h1>
            <p style={styles.sub}>Meta Ads performance hub — Millecube Digital</p>
          </div>
        </div>
        <div style={styles.liveDot}>
          <div style={styles.dot} />
          <span style={styles.liveText}>Live</span>
        </div>
      </div>

      {/* KPI Row */}
      <div style={styles.kpiGrid} className="kpi-grid">
        {kpis.map(k => (
          <div key={k.label} className="glass stat-card" style={styles.kpiCard}>
            <div style={{ ...styles.kpiIcon, color: k.danger ? '#ff4d4d' : '#32cd32' }}>{k.icon}</div>
            <div className="kpi-val" style={{ ...styles.kpiValue, color: k.danger ? 'var(--danger)' : 'var(--text-primary)' }}>{loading ? '—' : k.value}</div>
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
        <div className="glass table-scroll-wrap" style={styles.tableWrap}>
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
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{job.period}</td>
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
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {new Date(job.createdAt).toLocaleString('en-MY', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td>
                      {job.driveUrl ? (
                        <a href={job.driveUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                          ↓ Download
                        </a>
                      ) : job.status === 'failed' ? (
                        <span style={{ fontSize: 11, color: '#ff4d4d' }} title={job.error}>
                          ⚠ {job.error?.slice(0, 40)}…
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Client Quick View */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Client Overview</h2>
          <span className="badge badge-dim">{clients.length} clients</span>
        </div>

        {/* Dropdown */}
        <select
          className="form-input"
          value={selectedClientId}
          onChange={e => setSelectedClientId(e.target.value)}
          style={{ maxWidth: 320, marginBottom: 16, fontSize: 13 }}
        >
          {clients.length === 0
            ? <option value="">No clients yet</option>
            : clients.map(c => (
                <option key={c.id} value={c.id}>{c.clientCode} — {c.name}</option>
              ))
          }
        </select>

        {/* Selected client detail card */}
        {selectedClient && (
          <div className="glass" style={styles.clientDetail}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={styles.clientCodeBadge}>{selectedClient.clientCode}</span>
              <span style={styles.clientName}>{selectedClient.name}</span>
              {clientSchedule
                ? <span className="badge badge-green">Auto Scheduled</span>
                : <span className="badge badge-dim">Manual Only</span>
              }
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Ad Account</span>
                <span style={styles.detailValue}>{selectedClient.adAccountId || '—'}</span>
              </div>
              {clientSchedule && (
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Schedule</span>
                  <span style={styles.detailValue}>{clientSchedule.frequency} · {clientSchedule.dayOfMonth ? `Day ${clientSchedule.dayOfMonth}` : clientSchedule.dayOfWeek || '—'}</span>
                </div>
              )}
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Recent Jobs</span>
                <span style={styles.detailValue}>{clientJobs.length > 0 ? `${clientJobs.filter(j => j.status === 'done').length} done` : 'None yet'}</span>
              </div>
              {clientJobs[0] && (
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Last Report</span>
                  <span style={styles.detailValue}>{clientJobs[0].period}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '32px 36px', maxWidth: 1100 },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 12, marginBottom: 28
  },
  title: { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 },
  sub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
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
  kpiLabel: { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  kpiSub: { fontSize: 11, color: 'var(--text-dim)', marginTop: 2 },
  section: { marginBottom: 32 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  tableWrap: { overflowX: 'auto' },
  loading: { padding: 40, display: 'flex', justifyContent: 'center' },
  empty: {
    padding: 48, textAlign: 'center',
    color: 'var(--text-dim)', fontSize: 14
  },
  emptyIcon: { fontSize: 32, marginBottom: 12 },
  codeTag: {
    background: 'rgba(50,205,50,0.12)', color: '#32cd32',
    border: '1px solid rgba(50,205,50,0.25)',
    borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, letterSpacing: 0.5
  },
  clientDetail: { padding: '20px 24px' },
  clientCodeBadge: {
    fontSize: 13, fontWeight: 800, color: '#32cd32', letterSpacing: 2,
    background: 'rgba(50,205,50,0.1)', border: '1px solid rgba(50,205,50,0.25)',
    borderRadius: 6, padding: '2px 10px',
  },
  clientName: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' },
  detailRow: { display: 'flex', flexDirection: 'column', gap: 3 },
  detailLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 },
  detailValue: { fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 },
};
