import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { clientsAPI, performanceAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const DEFAULT_COLS = [
  { key: 'toggle',            label: 'On/Off',          width: 70  },
  { key: 'status',            label: 'Status',          width: 95  },
  { key: 'budget',            label: 'Budget',          width: 130 },
  { key: 'spend',             label: 'Spend',           width: 105 },
  { key: 'impressions',       label: 'Impressions',     width: 110 },
  { key: 'reach',             label: 'Reach',           width: 100 },
  { key: 'frequency',         label: 'Freq',            width: 75  },
  { key: 'cpm',               label: 'CPM',             width: 90  },
  { key: 'linkClicks',        label: 'Link Clicks',     width: 105 },
  { key: 'ctrLink',           label: 'CTR (Link)',      width: 100 },
  { key: 'cpcLink',           label: 'CPC (Link)',      width: 100 },
  { key: 'clicks',            label: 'Clicks (All)',    width: 100 },
  { key: 'ctr',               label: 'CTR (All)',       width: 95  },
  { key: 'cpc',               label: 'CPC (All)',       width: 95  },
  { key: 'costPerMessage',    label: 'Cost/Msg',        width: 100 },
  { key: 'waConvosStarted',   label: 'Convos Started',  width: 130 },
  { key: 'repliedMessages',   label: 'Replied Msgs',    width: 120 },
  { key: 'newContacts',       label: 'New Contacts',    width: 120 },
  { key: 'returningContacts', label: 'Return Contacts', width: 130 },
];

const DEFAULT_COL_ORDER = DEFAULT_COLS.map(c => c.key);

function fmtNum(n) {
  const v = parseFloat(n || 0);
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return Math.round(v).toLocaleString();
}
function fmtRM(n) { return `RM ${parseFloat(n || 0).toFixed(2)}`; }
function fmtPct(n) { return `${parseFloat(n || 0).toFixed(2)}%`; }

function ToggleSwitch({ active, loading, onChange }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); if (!loading) onChange(!active); }}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: active ? '#32cd32' : 'rgba(255,255,255,0.15)',
        cursor: loading ? 'wait' : 'pointer',
        position: 'relative', transition: 'background 0.2s',
        flexShrink: 0, opacity: loading ? 0.5 : 1, display: 'inline-block',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: active ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
  );
}

function StatusBadge({ status }) {
  const color = status === 'ACTIVE' ? '#32cd32' : status === 'PAUSED' ? 'rgba(255,255,255,0.3)' : '#ff6b6b';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: `${color}22`, color, border: `1px solid ${color}44`, whiteSpace: 'nowrap',
    }}>{status}</span>
  );
}

function ColorNum({ value, fmt, low, high, higherBetter }) {
  const v = parseFloat(value || 0);
  let color = 'rgba(232,245,233,0.7)';
  if (v > 0) {
    if (higherBetter) {
      color = v >= high ? '#32cd32' : v >= low ? '#f0c040' : '#ff6b6b';
    } else {
      color = v <= low ? '#32cd32' : v <= high ? '#f0c040' : '#ff6b6b';
    }
  }
  return <span style={{ color, fontWeight: 600 }}>{fmt ? fmt(v) : v}</span>;
}

function updateRowStatus(data, clientId, objectId, newStatus) {
  if (!data) return data;
  return {
    ...data,
    clients: data.clients.map(c => {
      if (c.clientId !== clientId) return c;
      return {
        ...c,
        campaigns: c.campaigns.map(camp => {
          if (camp.id === objectId) return { ...camp, status: newStatus };
          return {
            ...camp,
            adsets: camp.adsets.map(adset => {
              if (adset.id === objectId) return { ...adset, status: newStatus };
              return { ...adset, ads: adset.ads.map(ad => ad.id === objectId ? { ...ad, status: newStatus } : ad) };
            }),
          };
        }),
      };
    }),
  };
}

export default function PerformanceTable() {
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientList, setClientList] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [clientDropOpen, setClientDropOpen] = useState(false);

  const [range, setRange] = useState('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');
  const [toggling, setToggling] = useState(new Set());

  const [colOrder, setColOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('perf_col_order')) || DEFAULT_COL_ORDER; } catch { return DEFAULT_COL_ORDER; }
  });
  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem('perf_col_widths')) || {}; } catch { return {}; }
  });

  const dragColRef = useRef(null);
  const dragOverColRef = useRef(null);
  const resizingRef = useRef(null);

  // Load clients on mount
  useEffect(() => {
    (async () => {
      try {
        const list = user?.role === 'admin' ? await clientsAPI.list() : await clientsAPI.getAssigned();
        setClientList(list);
        setSelectedClients(list.map(c => c.id));
      } catch {}
    })();
  }, [user]);

  // Fetch data when filters change
  const fetchData = useCallback(async () => {
    if (selectedClients.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const params = { clientIds: selectedClients.join(',') };
      if (range !== 'custom') {
        params.range = range;
      } else if (customStart && customEnd) {
        params.dateStart = customStart;
        params.dateStop = customEnd;
      } else { setLoading(false); return; }
      const result = await performanceAPI.table(params);
      setData(result);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [range, customStart, customEnd, selectedClients]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Column reorder drag
  const handleDragStart = useCallback((key) => { dragColRef.current = key; }, []);
  const handleDragOver = useCallback((e, key) => { e.preventDefault(); dragOverColRef.current = key; }, []);
  const handleDrop = useCallback(() => {
    const from = dragColRef.current;
    const to = dragOverColRef.current;
    if (!from || !to || from === to) return;
    setColOrder(prev => {
      const next = [...prev];
      const fi = next.indexOf(from);
      const ti = next.indexOf(to);
      next.splice(fi, 1);
      next.splice(ti, 0, from);
      localStorage.setItem('perf_col_order', JSON.stringify(next));
      return next;
    });
    dragColRef.current = null;
    dragOverColRef.current = null;
  }, []);

  // Column resize
  const startResize = useCallback((e, key, currentWidth) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth: currentWidth };
    const onMove = (ev) => {
      if (!resizingRef.current) return;
      const newW = Math.max(60, resizingRef.current.startWidth + (ev.clientX - resizingRef.current.startX));
      setColWidths(prev => {
        const next = { ...prev, [resizingRef.current.key]: newW };
        localStorage.setItem('perf_col_widths', JSON.stringify(next));
        return next;
      });
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Toggle on/off
  const handleToggle = useCallback(async (row, newActive) => {
    if (!newActive && row.level === 0) {
      if (!window.confirm(`Pause campaign "${row.name}"?\n\nThis will pause all ad sets and ads under it.`)) return;
    }
    setToggling(s => new Set(s).add(row.id));
    setData(prev => updateRowStatus(prev, row._clientId, row.id, newActive ? 'ACTIVE' : 'PAUSED'));
    try {
      await performanceAPI.toggle({ clientId: row._clientId, objectId: row.id, status: newActive ? 'ACTIVE' : 'PAUSED' });
    } catch (err) {
      setData(prev => updateRowStatus(prev, row._clientId, row.id, newActive ? 'PAUSED' : 'ACTIVE'));
      alert(err.response?.data?.error || 'Toggle failed. Check if your token has ads_management permission.');
    } finally {
      setToggling(s => { const n = new Set(s); n.delete(row.id); return n; });
    }
  }, []);

  // Expand/collapse
  const toggleExpand = useCallback((key) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // Sort
  const handleSort = useCallback((col) => {
    setSortCol(prev => {
      if (prev === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return col; }
      setSortDir('desc'); return col;
    });
  }, []);

  // Flatten hierarchy for rendering
  const flatRows = useMemo(() => {
    if (!data) return [];
    const rows = [];
    const sq = search.toLowerCase();
    data.clients.forEach(c => {
      c.campaigns.forEach(camp => {
        if (statusFilter !== 'all' && camp.status.toLowerCase() !== statusFilter) return;
        if (sq && !camp.name.toLowerCase().includes(sq)) return;
        const campKey = `c_${camp.id}`;
        rows.push({ ...camp, _rowKey: campKey, _clientId: c.clientId, _clientCode: c.clientCode, _clientName: c.clientName, level: 0 });
        if (expanded.has(campKey)) {
          camp.adsets.forEach(adset => {
            if (statusFilter !== 'all' && adset.status.toLowerCase() !== statusFilter) return;
            const adsetKey = `a_${adset.id}`;
            rows.push({ ...adset, _rowKey: adsetKey, _clientId: c.clientId, _clientCode: c.clientCode, level: 1 });
            if (expanded.has(adsetKey)) {
              adset.ads.forEach(ad => {
                if (statusFilter !== 'all' && ad.status.toLowerCase() !== statusFilter) return;
                rows.push({ ...ad, _rowKey: `ad_${ad.id}`, _clientId: c.clientId, _clientCode: c.clientCode, level: 2 });
              });
            }
          });
        }
      });
    });
    if (sortCol) {
      rows.sort((a, b) => {
        const av = a[sortCol] ?? 0;
        const bv = b[sortCol] ?? 0;
        if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === 'asc' ? av - bv : bv - av;
      });
    }
    return rows;
  }, [data, expanded, statusFilter, search, sortCol, sortDir]);

  // Summary totals (campaign level only)
  const totals = useMemo(() => {
    const t = { spend: 0, impressions: 0, reach: 0, linkClicks: 0, waConvosStarted: 0 };
    if (!data) return t;
    data.clients.forEach(c => c.campaigns.forEach(camp => {
      t.spend += camp.spend;
      t.impressions += camp.impressions;
      t.reach += camp.reach;
      t.linkClicks += camp.linkClicks;
      t.waConvosStarted += camp.waConvosStarted;
    }));
    return t;
  }, [data]);

  // Render cell value
  const renderCell = useCallback((colKey, row) => {
    switch (colKey) {
      case 'toggle':
        return <ToggleSwitch active={row.status === 'ACTIVE'} loading={toggling.has(row.id)} onChange={v => handleToggle(row, v)} />;
      case 'status':
        return <StatusBadge status={row.status} />;
      case 'budget':
        return row.budget ? `${fmtRM(row.budget.amount)} /${row.budget.type === 'daily' ? 'day' : 'total'}` : '—';
      case 'spend':
        return fmtRM(row.spend);
      case 'impressions':
        return fmtNum(row.impressions);
      case 'reach':
        return fmtNum(row.reach);
      case 'frequency':
        return <span style={{ color: row.frequency > 3 ? '#f0c040' : 'inherit' }}>{parseFloat(row.frequency || 0).toFixed(2)}</span>;
      case 'cpm':
        return <ColorNum value={row.cpm} fmt={fmtRM} low={8} high={15} higherBetter={false} />;
      case 'linkClicks':
        return fmtNum(row.linkClicks);
      case 'ctrLink':
        return <ColorNum value={row.ctrLink} fmt={fmtPct} low={1} high={2} higherBetter={true} />;
      case 'cpcLink':
        return row.cpcLink > 0 ? fmtRM(row.cpcLink) : '—';
      case 'clicks':
        return fmtNum(row.clicks);
      case 'ctr':
        return fmtPct(row.ctr);
      case 'cpc':
        return row.cpc > 0 ? fmtRM(row.cpc) : '—';
      case 'costPerMessage':
        return row.costPerMessage > 0 ? fmtRM(row.costPerMessage) : '—';
      case 'waConvosStarted':
        return fmtNum(row.waConvosStarted);
      case 'repliedMessages':
        return fmtNum(row.repliedMessages);
      case 'newContacts':
        return fmtNum(row.newContacts);
      case 'returningContacts':
        return fmtNum(row.returningContacts);
      default:
        return '—';
    }
  }, [toggling, handleToggle]);

  const RANGES = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7d', label: '7D' },
    { key: '14d', label: '14D' },
    { key: '30d', label: '30D' },
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'custom', label: 'Custom' },
  ];

  const allSelected = selectedClients.length === clientList.length;
  const colDefs = DEFAULT_COLS.reduce((m, c) => { m[c.key] = c; return m; }, {});

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Montserrat, sans-serif', margin: 0 }}>Performance</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Campaign &#x2192; Ad Set &#x2192; Ad breakdown across all clients</p>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        {/* Client selector */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setClientDropOpen(v => !v)}
            style={{ ...st.filterBtn, minWidth: 140 }}
          >
            {allSelected ? 'All Clients' : `${selectedClients.length} Client${selectedClients.length !== 1 ? 's' : ''}`} &#9662;
          </button>
          {clientDropOpen && (
            <div style={st.dropdown}>
              <div style={st.dropItem} onClick={() => {
                setSelectedClients(allSelected ? [] : clientList.map(c => c.id));
              }}>
                <input type="checkbox" checked={allSelected} readOnly style={{ marginRight: 8 }} />
                All Clients
              </div>
              {clientList.map(c => (
                <div key={c.id} style={st.dropItem} onClick={() => {
                  setSelectedClients(prev =>
                    prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                  );
                }}>
                  <input type="checkbox" checked={selectedClients.includes(c.id)} readOnly style={{ marginRight: 8 }} />
                  {c.clientCode} &#8212; {c.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Date range */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              style={{ ...st.rangeBtn, ...(range === r.key ? st.rangeBtnActive : {}) }}>
              {r.label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="form-input" style={{ padding: '6px 10px', fontSize: 12 }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>to</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="form-input" style={{ padding: '6px 10px', fontSize: 12 }} />
          </div>
        )}

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', 'active', 'paused'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ ...st.rangeBtn, ...(statusFilter === s ? st.rangeBtnActive : {}) }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search campaigns&#x2026;" className="form-input"
          style={{ padding: '7px 12px', fontSize: 12, width: 180 }}
        />

        {/* Refresh */}
        <button onClick={fetchData} style={st.filterBtn} disabled={loading}>
          {loading ? '&#x2026;' : '&#x21BB; Refresh'}
        </button>
      </div>

      {/* Click outside to close client dropdown */}
      {clientDropOpen && <div onClick={() => setClientDropOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />}

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Total Spend',     value: fmtRM(totals.spend) },
          { label: 'Impressions',     value: fmtNum(totals.impressions) },
          { label: 'Reach',           value: fmtNum(totals.reach) },
          { label: 'Link Clicks',     value: fmtNum(totals.linkClicks) },
          { label: 'Convos Started',  value: fmtNum(totals.waConvosStarted) },
        ].map(s => (
          <div key={s.label} className="glass" style={st.summaryCard}>
            <div style={st.summaryVal}>{s.value}</div>
            <div style={st.summaryLbl}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && <div style={st.errorBox}>{error}</div>}

      {/* Loading */}
      {loading && !data && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div className="spinner" />
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>Loading performance data&#x2026;</div>
        </div>
      )}

      {/* Table */}
      {data && !loading && (
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(50,205,50,0.12)' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', minWidth: '100%' }}>
              <thead>
                <tr style={{ background: '#03140e' }}>
                  {/* Frozen name header */}
                  <th style={{ ...st.thFrozen, width: 280, minWidth: 280 }}>
                    <span style={st.thLabel}>Name / Campaign</span>
                  </th>
                  {/* Draggable metric headers */}
                  {colOrder.map(key => {
                    const col = colDefs[key];
                    if (!col) return null;
                    const w = colWidths[key] || col.width;
                    return (
                      <th key={key}
                        draggable
                        onDragStart={() => handleDragStart(key)}
                        onDragOver={e => handleDragOver(e, key)}
                        onDrop={handleDrop}
                        onClick={() => key !== 'toggle' && handleSort(key)}
                        style={{ ...st.th, width: w, minWidth: w, cursor: key === 'toggle' ? 'default' : 'pointer', position: 'relative', userSelect: 'none' }}
                      >
                        <span style={st.thLabel}>
                          {col.label}
                          {sortCol === key && <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        </span>
                        {/* Resize handle */}
                        <div
                          onMouseDown={e => startResize(e, key, w)}
                          onClick={e => e.stopPropagation()}
                          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 2 }}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {flatRows.length === 0 && (
                  <tr>
                    <td colSpan={colOrder.length + 1} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                      No campaigns found for the selected filters.
                    </td>
                  </tr>
                )}
                {flatRows.map((row, i) => (
                  <tr key={row._rowKey}
                    style={{
                      background: i % 2 === 0 ? 'transparent' : 'rgba(50,205,50,0.015)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(50,205,50,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(50,205,50,0.015)'}
                  >
                    {/* Frozen name cell */}
                    <td style={{ ...st.tdFrozen, borderBottom: '1px solid rgba(50,205,50,0.07)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: row.level * 18, minWidth: 0 }}>
                        {row.level < 2
                          ? <button
                              onClick={() => toggleExpand(row._rowKey)}
                              style={{ background: 'none', border: 'none', color: '#32cd32', cursor: 'pointer', fontSize: 9, padding: '2px 4px', flexShrink: 0, lineHeight: 1 }}
                            >
                              {expanded.has(row._rowKey) ? '▼' : '►'}
                            </button>
                          : <span style={{ width: 22, display: 'inline-block', flexShrink: 0 }} />
                        }
                        {row.level === 0 && (
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3, background: 'rgba(50,205,50,0.15)', color: '#32cd32', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            {row._clientCode}
                          </span>
                        )}
                        <span style={{
                          fontSize: 12, fontWeight: row.level === 0 ? 600 : row.level === 1 ? 500 : 400,
                          color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                          opacity: row.level === 2 ? 0.75 : 1,
                        }}>{row.name}</span>
                        {row.level === 0 && row.spend > 0 && row.waConvosStarted === 0 && row.repliedMessages === 0 && (
                          <span title="Spending but no results" style={{ flexShrink: 0 }}>&#x1F534;</span>
                        )}
                        {row.level === 0 && row.frequency > 3 && (
                          <span title="High frequency" style={{ flexShrink: 0 }}>&#x1F7E1;</span>
                        )}
                      </div>
                    </td>
                    {/* Metric cells */}
                    {colOrder.map(key => (
                      <td key={key} style={{ ...st.td, borderBottom: '1px solid rgba(50,205,50,0.07)' }}>
                        {renderCell(key, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Date range footer */}
      {data && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, textAlign: 'right' }}>
          {data.dateStart} &#x2192; {data.dateStop}
        </div>
      )}
    </div>
  );
}

const st = {
  filterBtn: {
    padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(50,205,50,0.2)',
    background: 'rgba(50,205,50,0.06)', color: 'var(--text-primary)',
    fontSize: 12, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  rangeBtn: {
    padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(50,205,50,0.15)',
    background: 'none', color: 'rgba(232,245,233,0.5)', fontSize: 11, cursor: 'pointer', fontWeight: 600,
  },
  rangeBtnActive: {
    background: 'rgba(50,205,50,0.15)', color: '#32cd32', border: '1px solid rgba(50,205,50,0.35)',
  },
  dropdown: {
    position: 'absolute', top: '110%', left: 0, zIndex: 100,
    background: '#0a1f15', border: '1px solid rgba(50,205,50,0.2)', borderRadius: 10,
    minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '6px 0',
  },
  dropItem: {
    padding: '9px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)',
    display: 'flex', alignItems: 'center',
    transition: 'background 0.15s',
  },
  summaryCard: {
    padding: '14px 16px', borderRadius: 10, textAlign: 'center',
  },
  summaryVal: { fontSize: 18, fontWeight: 800, color: '#32cd32', fontFamily: 'Montserrat, sans-serif' },
  summaryLbl: { fontSize: 10, color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 },
  errorBox: {
    background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.3)', borderRadius: 8,
    padding: '12px 16px', fontSize: 13, color: '#ff6b6b', marginBottom: 14,
  },
  thFrozen: {
    position: 'sticky', left: 0, zIndex: 5, background: '#03140e',
    padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid rgba(50,205,50,0.2)',
    borderRight: '1px solid rgba(50,205,50,0.12)',
  },
  th: {
    padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid rgba(50,205,50,0.2)',
    borderRight: '1px solid rgba(50,205,50,0.05)', background: '#03140e',
    whiteSpace: 'nowrap',
  },
  thLabel: {
    fontSize: 11, fontWeight: 700, color: 'rgba(232,245,233,0.5)',
    textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Montserrat, sans-serif',
  },
  tdFrozen: {
    position: 'sticky', left: 0, zIndex: 3, background: '#0a1f15',
    padding: '10px 12px', borderRight: '1px solid rgba(50,205,50,0.12)',
    maxWidth: 280, minWidth: 280,
  },
  td: {
    padding: '9px 10px', fontSize: 12, color: 'var(--text-primary)',
    textAlign: 'right', whiteSpace: 'nowrap',
  },
};
