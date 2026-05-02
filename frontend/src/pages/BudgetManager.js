import React, { useEffect, useState, useCallback, useRef } from 'react';
import { budgetAPI } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../context/AuthContext';

const fmtRM = (v) => `RM ${parseFloat(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function monthLabel(yyyyMM) {
  const [y, m] = yyyyMM.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleString('en-MY', { month: 'short', year: 'numeric' });
}

function shiftMonths(base, offset) {
  // base = 'YYYY-MM', offset = integer months
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getWindowMonths(center) {
  return [-2, -1, 0, 1, 2].map(i => shiftMonths(center, i));
}

function getCurrentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ budget }) {
  if (!budget) return <span style={sb.notSet}>— Not Set</span>;
  if (budget.confirmed) return <span style={sb.confirmed}>✓ Confirmed</span>;
  return <span style={sb.set}>⚠ Set</span>;
}

const sb = {
  confirmed: { fontSize: 10, fontWeight: 700, color: '#32cd32', background: 'rgba(50,205,50,0.1)', border: '1px solid rgba(50,205,50,0.25)', borderRadius: 8, padding: '2px 7px', whiteSpace: 'nowrap' },
  set:       { fontSize: 10, fontWeight: 700, color: '#f5a623', background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 8, padding: '2px 7px', whiteSpace: 'nowrap' },
  notSet:    { fontSize: 10, fontWeight: 700, color: 'rgba(232,245,233,0.25)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '2px 7px', whiteSpace: 'nowrap' },
};

// ── Cell Popover ──────────────────────────────────────────────────────────────
function CellPopover({ client, month, budget, canEdit, isAdmin, onSave, onConfirm, onUnconfirm, onClose }) {
  const [amount,   setAmount]   = useState(budget ? String(budget.amount) : '');
  const [note,     setNote]     = useState('');
  const [confirm,  setConfirm]  = useState(budget ? budget.confirmed : false);
  const [saving,   setSaving]   = useState(false);
  const [actioning,setActioning]= useState(false);
  const toast = useToast();

  const handleSave = async (e) => {
    e.preventDefault();
    if (!amount || isNaN(parseFloat(amount))) return toast('Enter a valid amount.', 'error');
    setSaving(true);
    try {
      const saved = await onSave(client.id, month, { amount: parseFloat(amount), note: note || undefined });
      // Confirm immediately if checkbox is ticked
      if (confirm && !saved.confirmed) await onConfirm(client.id, month);
      toast('Budget saved.', 'success');
      onClose();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to save.', 'error');
    } finally { setSaving(false); }
  };

  const handleConfirm = async () => {
    setActioning(true);
    try {
      await onConfirm(client.id, month);
      toast('Budget confirmed.', 'success');
      onClose();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to confirm.', 'error');
    } finally { setActioning(false); }
  };

  const handleUnconfirm = async () => {
    setActioning(true);
    try {
      await onUnconfirm(client.id, month);
      toast('Budget unconfirmed.', 'success');
      onClose();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to unconfirm.', 'error');
    } finally { setActioning(false); }
  };

  const logEntries = (budget?.log || []).slice(-5).reverse();

  return (
    <div style={po.wrap}>
      <div style={po.header}>
        <div>
          <span style={po.clientCode}>{client.clientCode}</span>
          <span style={po.month}>{monthLabel(month)}</span>
        </div>
        <button onClick={onClose} style={po.close}>✕</button>
      </div>

      {canEdit ? (
        <form onSubmit={handleSave} style={po.form}>
          <div style={po.fieldRow}>
            <div style={{ flex: 1 }}>
              <label style={po.label}>Amount (RM)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="100"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 3000"
                required
                autoFocus
              />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={po.label}>Note (optional)</label>
            <input
              className="form-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Reason for change…"
            />
          </div>
          {isAdmin && (
            <label style={po.checkRow}>
              <input
                type="checkbox"
                checked={confirm}
                onChange={e => setConfirm(e.target.checked)}
                style={{ marginRight: 7, accentColor: '#32cd32' }}
              />
              <span style={{ fontSize: 12, color: 'rgba(232,245,233,0.7)' }}>Mark as confirmed</span>
            </label>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </form>
      ) : (
        <div style={po.readOnly}>
          <div style={po.readAmount}>{budget ? fmtRM(budget.amount) : '—'}</div>
          <StatusBadge budget={budget} />
          {isAdmin && budget && !budget.confirmed && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={handleConfirm} disabled={actioning}>
              {actioning ? 'Confirming…' : '✓ Confirm'}
            </button>
          )}
        </div>
      )}

      {/* Admin confirm/unconfirm buttons when budget exists and user has edit */}
      {isAdmin && budget && canEdit && budget.confirmed && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 0, marginBottom: 12, fontSize: 11 }} onClick={handleUnconfirm} disabled={actioning}>
          {actioning ? '…' : 'Unconfirm'}
        </button>
      )}
      {isAdmin && budget && canEdit && !budget.confirmed && budget.amount !== undefined && (
        <button className="btn btn-primary btn-sm" style={{ marginTop: 0, marginBottom: 12 }} onClick={handleConfirm} disabled={actioning}>
          {actioning ? 'Confirming…' : '✓ Confirm Budget'}
        </button>
      )}

      {/* Change log */}
      {logEntries.length > 0 && (
        <div style={po.log}>
          <div style={po.logTitle}>Change Log</div>
          {logEntries.map((entry, i) => (
            <div key={i} style={po.logEntry}>
              <span style={po.logAction}>{entry.action}</span>
              {entry.fromAmount !== null && (
                <span style={po.logDetail}> {fmtRM(entry.fromAmount)} → {fmtRM(entry.toAmount)}</span>
              )}
              {entry.fromAmount === null && entry.toAmount !== null && (
                <span style={po.logDetail}> {fmtRM(entry.toAmount)}</span>
              )}
              <span style={po.logBy}> · {entry.by}</span>
              <span style={po.logAt}> · {new Date(entry.at).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              {entry.note && <div style={po.logNote}>{entry.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const po = {
  wrap:       { background: 'var(--card-bg, #0a1f16)', border: '1px solid rgba(50,205,50,0.2)', borderRadius: 10, padding: '16px 18px', minWidth: 280, maxWidth: 340 },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  clientCode: { fontSize: 11, fontWeight: 800, color: '#32cd32', letterSpacing: 2, marginRight: 8 },
  month:      { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' },
  close:      { background: 'none', border: 'none', color: 'rgba(232,245,233,0.4)', cursor: 'pointer', fontSize: 13, padding: 2 },
  form:       {},
  fieldRow:   { display: 'flex', gap: 10, marginBottom: 10 },
  label:      { display: 'block', fontSize: 10, fontWeight: 600, color: 'rgba(232,245,233,0.5)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.8 },
  checkRow:   { display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: 2 },
  readOnly:   { textAlign: 'center', padding: '8px 0 12px' },
  readAmount: { fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 },
  log:        { marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 },
  logTitle:   { fontSize: 10, fontWeight: 700, color: 'rgba(232,245,233,0.4)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  logEntry:   { fontSize: 11, color: 'rgba(232,245,233,0.6)', marginBottom: 6, lineHeight: 1.5 },
  logAction:  { fontWeight: 700, color: '#32cd32', textTransform: 'capitalize' },
  logDetail:  { color: 'rgba(232,245,233,0.7)' },
  logBy:      { color: 'rgba(232,245,233,0.45)' },
  logAt:      { color: 'rgba(232,245,233,0.3)' },
  logNote:    { fontStyle: 'italic', color: 'rgba(232,245,233,0.4)', marginTop: 2, paddingLeft: 4 },
};

// ── Budget Cell ───────────────────────────────────────────────────────────────
function BudgetCell({ client, month, budget, currentMonth, canEdit, isAdmin, onSave, onConfirm, onUnconfirm, open, onToggle }) {
  const isCurrent = month === currentMonth;
  const isEmpty   = !budget;
  const cellRef   = useRef(null);

  return (
    <td
      ref={cellRef}
      style={{
        ...cell.td,
        cursor: canEdit || isAdmin ? 'pointer' : 'default',
        background: open ? 'rgba(50,205,50,0.08)' : isCurrent ? 'rgba(50,205,50,0.04)' : 'transparent',
      }}
      onClick={() => (canEdit || isAdmin) && onToggle()}
    >
      <div style={cell.amount}>
        {isEmpty
          ? <span style={{ color: 'rgba(232,245,233,0.2)', fontSize: 13 }}>—</span>
          : <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtRM(budget.amount)}</span>
        }
      </div>
      <div style={{ marginTop: 4 }}>
        <StatusBadge budget={budget} />
      </div>
    </td>
  );
}

const cell = {
  td:     { padding: '10px 12px', textAlign: 'center', borderRight: '1px solid rgba(50,205,50,0.08)', verticalAlign: 'top', minWidth: 140, position: 'relative', transition: 'background 0.15s' },
  amount: { marginBottom: 3 },
};

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV(clients, months) {
  const header = ['Client', 'Code', ...months.map(m => `${m} Amount`, m => `${m} Status`)].flat();
  // Build proper header
  const cols = ['Client', 'Code'];
  months.forEach(m => { cols.push(`${m} Amount`); cols.push(`${m} Status`); });

  const rows = clients.map(client => {
    const row = [client.name, client.clientCode];
    client.months.forEach(({ budget }) => {
      row.push(budget ? budget.amount : '');
      row.push(budget ? (budget.confirmed ? 'Confirmed' : 'Set') : 'Not Set');
    });
    return row;
  });

  const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `budget-${new Date().toISOString().slice(0, 7)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BudgetManager() {
  const toast  = useToast();
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';

  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [centerMonth, setCenterMonth] = useState(getCurrentMonthStr());
  // openCell = { clientId, month } | null
  const [openCell,    setOpenCell]    = useState(null);

  const currentMonth = getCurrentMonthStr();
  const months       = getWindowMonths(centerMonth);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await budgetAPI.overview()); }
    catch (err) { toast(err.response?.data?.error || 'Failed to load budgets.', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (clientId, month, body) => {
    const saved = await budgetAPI.upsert(clientId, month, body);
    await load();
    return saved;
  };

  const handleConfirm = async (clientId, month) => {
    await budgetAPI.confirm(clientId, month);
    await load();
  };

  const handleUnconfirm = async (clientId, month) => {
    await budgetAPI.unconfirm(clientId, month);
    await load();
  };

  const toggleCell = (clientId, month) => {
    setOpenCell(prev =>
      prev && prev.clientId === clientId && prev.month === month ? null : { clientId, month }
    );
  };

  // Get budget for a given client + month from loaded data
  const getBudget = (client, month) => {
    const found = client.months.find(m => m.month === month);
    return found ? found.budget : null;
  };

  const canEditCell = (client) => {
    if (isAdmin) return true;
    return Array.isArray(client.budgetEditors) && client.budgetEditors.includes(user?.id);
  };

  return (
    <div style={pg.page} className="fade-up">
      {/* Header */}
      <div style={pg.header}>
        <div>
          <h1 style={pg.title}>Budget Manager</h1>
          <p style={pg.sub}>Monthly ad spend budgets across all clients</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCSV(data?.clients || [], months)}>
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* Month navigation */}
      <div style={pg.navBar}>
        <button className="btn btn-ghost btn-sm" onClick={() => setCenterMonth(m => shiftMonths(m, -1))}>← Prev</button>
        <span style={pg.navLabel}>
          {monthLabel(months[0])} — {monthLabel(months[4])}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setCenterMonth(m => shiftMonths(m, 1))}>Next →</button>
        {centerMonth !== currentMonth && (
          <button className="btn btn-ghost btn-sm" onClick={() => setCenterMonth(currentMonth)} style={{ marginLeft: 8, color: '#32cd32' }}>
            Today
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center' }}><div className="spinner" /></div>
      ) : (
        <div className="glass" style={pg.tableWrap}>
          <div style={{ overflowX: 'auto' }}>
            <table style={pg.table}>
              <thead>
                <tr style={pg.thead}>
                  <th style={pg.thClient}>Client</th>
                  {months.map(m => (
                    <th key={m} style={{
                      ...pg.th,
                      borderLeft: m === currentMonth ? '2px solid #32cd32' : '1px solid rgba(50,205,50,0.1)',
                      color: m === currentMonth ? '#32cd32' : 'rgba(232,245,233,0.6)',
                    }}>
                      {monthLabel(m)}
                      {m === currentMonth && <div style={pg.currentDot} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.clients || []).map(client => {
                  const openRow = openCell?.clientId === client.id;
                  return (
                    <React.Fragment key={client.id}>
                      <tr style={pg.tr}>
                        <td style={pg.tdClient}>
                          <div style={pg.clientCode}>{client.clientCode}</div>
                          <div style={pg.clientName}>{client.name}</div>
                        </td>
                        {months.map(m => {
                          const budget  = getBudget(client, m);
                          const isOpen  = openCell?.clientId === client.id && openCell?.month === m;
                          const canEdit = canEditCell(client);
                          return (
                            <BudgetCell
                              key={m}
                              client={client}
                              month={m}
                              budget={budget}
                              currentMonth={currentMonth}
                              canEdit={canEdit}
                              isAdmin={isAdmin}
                              onSave={handleSave}
                              onConfirm={handleConfirm}
                              onUnconfirm={handleUnconfirm}
                              open={isOpen}
                              onToggle={() => toggleCell(client.id, m)}
                            />
                          );
                        })}
                      </tr>
                      {/* Inline popover row */}
                      {openRow && openCell && (
                        <tr>
                          <td />
                          {months.map(m => {
                            if (m !== openCell.month) return <td key={m} />;
                            const budget  = getBudget(client, m);
                            const canEdit = canEditCell(client);
                            return (
                              <td key={m} style={{ padding: '0 0 12px', verticalAlign: 'top' }}>
                                <CellPopover
                                  client={client}
                                  month={m}
                                  budget={budget}
                                  canEdit={canEdit}
                                  isAdmin={isAdmin}
                                  onSave={handleSave}
                                  onConfirm={handleConfirm}
                                  onUnconfirm={handleUnconfirm}
                                  onClose={() => setOpenCell(null)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {(data?.clients || []).length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'rgba(232,245,233,0.3)', padding: 48 }}>
                      No clients found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={pg.legend}>
        <span style={{ ...sb.confirmed, fontSize: 11 }}>✓ Confirmed</span>
        <span style={{ ...sb.set,       fontSize: 11 }}>⚠ Set, unconfirmed</span>
        <span style={{ ...sb.notSet,    fontSize: 11 }}>— Not set</span>
        <span style={{ fontSize: 11, color: 'rgba(232,245,233,0.3)', marginLeft: 8 }}>Click any cell to edit</span>
      </div>
    </div>
  );
}

const pg = {
  page:       { padding: '32px 36px', maxWidth: 1200 },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 16 },
  title:      { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 },
  sub:        { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  navBar:     { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  navLabel:   { fontSize: 13, color: 'rgba(232,245,233,0.5)', minWidth: 200, textAlign: 'center' },
  tableWrap:  { padding: 0, borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  table:      { width: '100%', borderCollapse: 'collapse' },
  thead:      { background: 'rgba(7,80,60,0.4)' },
  th:         { padding: '14px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, position: 'relative', minWidth: 140 },
  thClient:   { padding: '14px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'rgba(232,245,233,0.6)', minWidth: 160, borderRight: '1px solid rgba(50,205,50,0.1)' },
  currentDot: { position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#32cd32' },
  tr:         { borderBottom: '1px solid rgba(50,205,50,0.07)', transition: 'background 0.15s' },
  tdClient:   { padding: '14px 16px', borderRight: '1px solid rgba(50,205,50,0.1)', verticalAlign: 'middle' },
  clientCode: { fontSize: 10, fontWeight: 800, color: '#32cd32', letterSpacing: 2, marginBottom: 3 },
  clientName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  legend:     { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
};
