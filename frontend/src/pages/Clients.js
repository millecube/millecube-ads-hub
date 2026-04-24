import React, { useEffect, useState } from 'react';
import { clientsAPI } from '../utils/api';
import { useToast } from '../hooks/useToast';

const GOAL_OPTIONS = [
  { value: 'whatsapp',       label: 'WhatsApp Conversations' },
  { value: 'post_engagement',label: 'Post Engagements' },
  { value: 'reach',          label: 'Reach / Awareness' },
  { value: 'leads',          label: 'Lead Form Submissions' },
];

const DEFAULT_PATTERNS = [
  { pattern: 'SALES I WA',    goal: 'whatsapp' },
  { pattern: 'I ENGAGEMENT',  goal: 'whatsapp' },
  { pattern: 'I ENG 2',       goal: 'whatsapp' },
  { pattern: 'ENG MSG',       goal: 'whatsapp' },
  { pattern: 'ENG POST',      goal: 'post_engagement' },
  { pattern: 'POST BOOST',    goal: 'post_engagement' },
  { pattern: 'AWARENESS',     goal: 'reach' },
  { pattern: 'LEAD',          goal: 'leads' },
];

function ClientModal({ client, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!client;

  const [form, setForm] = useState({
    clientCode:     client?.clientCode    || '',
    name:           client?.name          || '',
    accessToken:    '',
    adAccountId:    client?.adAccountId   || '',
    primaryColor:   client?.primaryColor  || '#E8A000',
    secondaryColor: client?.secondaryColor|| '#1A7FCC',
    campaignGoals:  client?.campaignGoals || [...DEFAULT_PATTERNS],
  });

  const [saving,   setSaving]   = useState(false);
  const [verifying,setVerifying]= useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const updatePattern = (i, key, val) => {
    const goals = [...form.campaignGoals];
    goals[i] = { ...goals[i], [key]: val };
    set('campaignGoals', goals);
  };
  const addPattern    = () => set('campaignGoals', [...form.campaignGoals, { pattern: '', goal: 'whatsapp' }]);
  const removePattern = (i) => set('campaignGoals', form.campaignGoals.filter((_, idx) => idx !== i));

  const verify = async () => {
    if (!client?.id) return toast('Save the client first, then verify.', 'error');
    setVerifying(true); setVerifyResult(null);
    const res = await clientsAPI.verify(client.id);
    setVerifyResult(res);
    setVerifying(false);
    if (res.ok) toast(`Connected: ${res.account?.name}`, 'success');
    else        toast(res.error, 'error');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.clientCode || !form.name || !form.adAccountId) {
      return toast('Client Code, Name and Ad Account ID are required.', 'error');
    }
    if (!isEdit && !form.accessToken) {
      return toast('Access Token is required for new clients.', 'error');
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (isEdit && !form.accessToken) delete payload.accessToken; // keep existing
      const saved = isEdit
        ? await clientsAPI.update(client.id, payload)
        : await clientsAPI.create(payload);
      toast(isEdit ? 'Client updated.' : 'Client added!', 'success');
      onSaved(saved);
    } catch (err) {
      toast(err.response?.data?.error || 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box glass" style={ms.box}>
        <div style={ms.modalHeader}>
          <h2 style={ms.modalTitle}>{isEdit ? 'Edit Client' : 'Onboard New Client'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={submit}>
          {/* Basic Info */}
          <div style={ms.section}>
            <div style={ms.sectionLabel}>Client Info</div>
            <div style={ms.row2}>
              <div className="form-group">
                <label className="form-label">Client Code *</label>
                <input className="form-input" placeholder="e.g. VF, PF, MJ"
                  value={form.clientCode} onChange={e => set('clientCode', e.target.value.toUpperCase())}
                  disabled={isEdit} maxLength={10} />
                <span style={ms.hint}>Short unique code. Prefix for all report files.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Client Name *</label>
                <input className="form-input" placeholder="e.g. Viking Fitness"
                  value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Meta API */}
          <div style={ms.section}>
            <div style={ms.sectionLabel}>Meta API Credentials</div>
            <div className="form-group">
              <label className="form-label">Ad Account ID *</label>
              <input className="form-input" placeholder="act_123456789012345"
                value={form.adAccountId} onChange={e => set('adAccountId', e.target.value)} />
              <span style={ms.hint}>Found in Meta Business Manager → Ad Accounts</span>
            </div>
            <div className="form-group">
              <label className="form-label">
                Access Token {isEdit && <span style={{ color: 'rgba(232,245,233,0.4)' }}>(leave blank to keep existing)</span>}
              </label>
              <input className="form-input" type="password"
                placeholder={isEdit ? '••••••• (unchanged)' : 'EAAxxxxxxxxxxxxxxxx...'}
                value={form.accessToken} onChange={e => set('accessToken', e.target.value)} />
              <span style={ms.hint}>
                Get from: Meta for Developers → Tools → Graph API Explorer → Generate Token
              </span>
            </div>
            {isEdit && (
              <div style={{ marginBottom: 16 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={verify} disabled={verifying}>
                  {verifying ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Verifying…</> : '⚡ Verify Connection'}
                </button>
                {verifyResult && (
                  <span style={{ marginLeft: 12, fontSize: 12,
                    color: verifyResult.ok ? '#32cd32' : '#ff4d4d' }}>
                    {verifyResult.ok ? `✓ ${verifyResult.account?.name} (${verifyResult.account?.currency})` : `✕ ${verifyResult.error}`}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Chart Colours */}
          <div style={ms.section}>
            <div style={ms.sectionLabel}>Report Chart Colours</div>
            <div style={ms.row2}>
              <div className="form-group">
                <label className="form-label">Primary Colour</label>
                <div style={ms.colorRow}>
                  <input type="color" value={form.primaryColor} onChange={e => set('primaryColor', e.target.value)} style={ms.colorPicker} />
                  <input className="form-input" value={form.primaryColor} onChange={e => set('primaryColor', e.target.value)} style={{ flex: 1 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Secondary Colour (multi-branch)</label>
                <div style={ms.colorRow}>
                  <input type="color" value={form.secondaryColor} onChange={e => set('secondaryColor', e.target.value)} style={ms.colorPicker} />
                  <input className="form-input" value={form.secondaryColor} onChange={e => set('secondaryColor', e.target.value)} style={{ flex: 1 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Campaign Goals */}
          <div style={ms.section}>
            <div style={{ ...ms.sectionLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Campaign Goal Patterns
              <button type="button" className="btn btn-ghost btn-sm" onClick={addPattern}>+ Add Pattern</button>
            </div>
            <span style={{ ...ms.hint, display: 'block', marginBottom: 12 }}>
              Map campaign name patterns to performance goals. Claude Code uses these to select the correct primary metric.
            </span>
            {form.campaignGoals.map((pg, i) => (
              <div key={i} style={ms.patternRow}>
                <input className="form-input" placeholder="Campaign name contains…"
                  value={pg.pattern} onChange={e => updatePattern(i, 'pattern', e.target.value)}
                  style={{ flex: 1 }} />
                <select className="form-input" value={pg.goal} onChange={e => updatePattern(i, 'goal', e.target.value)}
                  style={{ width: 210 }}>
                  {GOAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removePattern(i)}>✕</button>
              </div>
            ))}
          </div>

          <div style={ms.actions}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : (isEdit ? 'Save Changes' : 'Add Client')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Clients() {
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null); // null | 'new' | clientObj

  const load = () => clientsAPI.list().then(setClients).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove client "${name}"? This cannot be undone.`)) return;
    await clientsAPI.delete(id);
    toast('Client removed.', 'success');
    load();
  };

  const onSaved = () => { setModal(null); load(); };

  return (
    <div style={s.page} className="fade-up">
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Clients</h1>
          <p style={s.sub}>Onboard and manage Meta Ads accounts</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>+ Onboard Client</button>
      </div>

      <div className="glass" style={s.tableWrap}>
        {loading ? (
          <div style={s.loading}><div className="spinner" /></div>
        ) : clients.length === 0 ? (
          <div style={s.empty}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>◉</div>
            <div style={{ marginBottom: 16 }}>No clients yet. Add your first Meta Ads account.</div>
            <button className="btn btn-primary" onClick={() => setModal('new')}>+ Onboard First Client</button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Client Name</th>
                <th>Ad Account</th>
                <th>Access Token</th>
                <th>Goal Patterns</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id}>
                  <td><span style={s.codeTag}>{c.clientCode}</span></td>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(232,245,233,0.5)' }}>{c.adAccountId}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(232,245,233,0.35)' }}>{c.accessToken}</td>
                  <td>
                    <span className="badge badge-dim">{c.campaignGoals?.length || 0} rules</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setModal(c)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id, c.name)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info box */}
      <div className="glass" style={s.infoBox}>
        <div style={s.infoTitle}>⚡ How to get your Meta Access Token</div>
        <ol style={s.infoList}>
          <li>Go to <strong>developers.facebook.com</strong> → Tools → Graph API Explorer</li>
          <li>Select your <strong>Meta App</strong> from the dropdown</li>
          <li>Click <strong>Generate Access Token</strong> and grant permissions: <code>ads_read</code>, <code>ads_management</code>, <code>read_insights</code></li>
          <li>For long-lived tokens, exchange via the Token Debugger or use a System User token from Business Manager</li>
          <li>Your Ad Account ID is found in <strong>Business Manager → Ad Accounts</strong> (format: <code>act_XXXXXXXXX</code>)</li>
        </ol>
      </div>

      {modal && (
        <ClientModal
          client={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

const s = {
  page: { padding: '32px 36px', maxWidth: 1100 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 },
  title: { fontSize: 28, fontWeight: 800, color: '#e8f5e9', letterSpacing: -0.5 },
  sub: { fontSize: 13, color: 'rgba(232,245,233,0.4)', marginTop: 4 },
  tableWrap: { overflow: 'hidden', marginBottom: 24 },
  loading: { padding: 48, display: 'flex', justifyContent: 'center' },
  empty: { padding: 60, textAlign: 'center', color: 'rgba(232,245,233,0.35)', fontSize: 14 },
  codeTag: {
    background: 'rgba(50,205,50,0.12)', color: '#32cd32',
    border: '1px solid rgba(50,205,50,0.25)',
    borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, letterSpacing: 1
  },
  infoBox: { padding: '20px 24px' },
  infoTitle: { fontSize: 13, fontWeight: 700, color: '#32cd32', marginBottom: 12 },
  infoList: { paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, color: 'rgba(232,245,233,0.6)', fontSize: 13, lineHeight: 1.6 },
};

const ms = {
  box: { maxWidth: 680, width: '100%' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 800, color: '#e8f5e9' },
  section: { marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid rgba(50,205,50,0.1)' },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#32cd32', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  hint: { fontSize: 11, color: 'rgba(232,245,233,0.3)', marginTop: 4 },
  patternRow: { display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' },
  colorRow: { display: 'flex', gap: 10, alignItems: 'center' },
  colorPicker: { width: 44, height: 38, padding: 2, borderRadius: 6, border: '1px solid rgba(50,205,50,0.2)', background: 'transparent', cursor: 'pointer' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 4 },
};
