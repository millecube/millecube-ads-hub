import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { clientsAPI, performanceAPI, prefsAPI } from '../utils/api';
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
  { key: 'results',           label: 'Results',         width: 100 },
  { key: 'costPerResult',     label: 'Cost/Result',     width: 110 },
];

const DEFAULT_COL_ORDER = DEFAULT_COLS.map(c => c.key);

const saveAllColOrder = (order) => localStorage.setItem('perf_all_col_order', JSON.stringify(order));
const saveVisibleCols = (set) => localStorage.setItem('perf_visible_cols', JSON.stringify([...set]));

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

function InfoPopup({ row, onClose }) {
  if (!row) return null;
  const items = [];
  if (row.level === 0) {
    items.push(['Objective', row.objective || '—']);
  } else if (row.level === 1) {
    items.push(['Optimization Goal', row.optimization_goal || '—']);
    items.push(['Billing Event', row.billing_event || '—']);
    if (row.budget) items.push(['Budget', `RM ${row.budget.amount?.toFixed(2)} /${row.budget.type === 'daily' ? 'day' : 'total'}`]);
    if (row.targeting) {
      const t = row.targeting;
      if (t.age_min || t.age_max) items.push(['Age', `${t.age_min || 18}–${t.age_max || 65}`]);
      if (t.genders?.length) items.push(['Gender', t.genders.map(g => g === 1 ? 'Male' : 'Female').join(', ')]);
      const locs = [...(t.geo_locations?.cities?.map(x => x.name) || []), ...(t.geo_locations?.regions?.map(x => x.name) || []), ...(t.geo_locations?.countries?.map(x => x.name) || [])];
      if (locs.length > 0) items.push(['Locations', locs.join(', ')]);
      const interests = t.flexible_spec?.flatMap(g => g.interests?.map(i => i.name) || []) || [];
      if (interests.length > 0) items.push(['Interests', interests.join(', ')]);
    }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', top: 8, right: 8,
        background: '#03140e', border: '1px solid rgba(50,205,50,0.25)', borderRadius: 10,
        padding: '14px 16px', minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 201,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#32cd32', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          {row.level === 0 ? 'Campaign Info' : 'Ad Set Info'}
        </div>
        {items.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: 'rgba(232,245,233,0.5)', flexShrink: 0 }}>{k}</span>
            <span style={{ color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
          </div>
        ))}
        <button onClick={onClose} style={{ marginTop: 8, background: 'none', border: 'none', color: 'rgba(232,245,233,0.4)', cursor: 'pointer', fontSize: 11 }}>Close</button>
      </div>
    </div>
  );
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
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const [infoPopup, setInfoPopup] = useState(null);

  const [range, setRange] = useState('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');
  const [toggling, setToggling] = useState(new Set());

  // allColOrder = full ordered list of all columns (visible + hidden)
  const [allColOrder, setAllColOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('perf_all_col_order'));
      if (saved) {
        const missing = DEFAULT_COL_ORDER.filter(k => !saved.includes(k));
        return missing.length ? [...saved, ...missing] : saved;
      }
      // migrate from old key
      const old = JSON.parse(localStorage.getItem('perf_col_order'));
      if (old) {
        const missing = DEFAULT_COL_ORDER.filter(k => !old.includes(k));
        return missing.length ? [...old, ...missing] : old;
      }
      return DEFAULT_COL_ORDER;
    } catch { return DEFAULT_COL_ORDER; }
  });
  // visibleCols = Set of column keys currently shown in the table
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('perf_visible_cols'));
      if (saved) return new Set(saved);
      const old = JSON.parse(localStorage.getItem('perf_col_order'));
      if (old) return new Set(old);
      return new Set(DEFAULT_COL_ORDER);
    } catch { return new Set(DEFAULT_COL_ORDER); }
  });
  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem('perf_col_widths')) || {}; } catch { return {}; }
  });

  // Saved column views
  const [savedViews, setSavedViews] = useState(() => {
    try { return JSON.parse(localStorage.getItem('perf_saved_views')) || []; } catch { return []; }
  });
  const [colPanelOpen, setColPanelOpen] = useState(false);
  const [panelDragIdx, setPanelDragIdx] = useState(null);
  const [panelDragOverIdx, setPanelDragOverIdx] = useState(null);

  // Derived: visible columns in order (used for table rendering)
  const colOrder = allColOrder.filter(k => visibleCols.has(k));

  const dragColRef = useRef(null);
  const dragOverColRef = useRef(null);
  const resizingRef = useRef(null);

  // Load clients + column preferences on mount
  useEffect(() => {
    (async () => {
      try {
        const [list, prefs] = await Promise.all([
          user?.role === 'admin' ? clientsAPI.list() : clientsAPI.getAssigned(),
          prefsAPI.get().catch(() => ({})),
        ]);
        setClientList(list);
        setSelectedClient(list[0]?.id || null);
        // Apply saved column prefs from server (overrides localStorage)
        if (prefs.perfColumns) {
          const { allColOrder: sOrder, visibleCols: sVis, savedViews: sViews } = prefs.perfColumns;
          if (sOrder?.length) {
            const merged = sOrder.filter(k => DEFAULT_COL_ORDER.includes(k));
            const missing = DEFAULT_COL_ORDER.filter(k => !merged.includes(k));
            const final = missing.length ? [...merged, ...missing] : merged;
            setAllColOrder(final);
            saveAllColOrder(final);
          }
          if (sVis?.length) {
            const vis = new Set(sVis.filter(k => DEFAULT_COL_ORDER.includes(k)));
            setVisibleCols(vis);
            saveVisibleCols(vis);
          }
          if (sViews) {
            setSavedViews(sViews);
            localStorage.setItem('perf_saved_views', JSON.stringify(sViews));
          }
        }
      } catch {}
    })();
  }, [user]);

  // Debounced save column prefs to server whenever they change
  const savePrefsTimerRef = useRef(null);
  useEffect(() => {
    if (savePrefsTimerRef.current) clearTimeout(savePrefsTimerRef.current);
    savePrefsTimerRef.current = setTimeout(() => {
      prefsAPI.save({ perfColumns: { allColOrder, visibleCols: [...visibleCols], savedViews } }).catch(() => {});
    }, 1500);
    return () => clearTimeout(savePrefsTimerRef.current);
  }, [allColOrder, visibleCols, savedViews]);

  // Fetch data when filters change
  const fetchData = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);
    setError('');
    try {
      const params = {};
      params.clientIds = selectedClient;
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
  }, [range, customStart, customEnd, selectedClient]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Column reorder drag
  const handleDragStart = useCallback((key) => { dragColRef.current = key; }, []);
  const handleDragOver = useCallback((e, key) => { e.preventDefault(); dragOverColRef.current = key; }, []);
  const handleDrop = useCallback(() => {
    const from = dragColRef.current;
    const to = dragOverColRef.current;
    if (!from || !to || from === to) return;
    setAllColOrder(prev => {
      const next = [...prev];
      const fi = next.indexOf(from);
      const ti = next.indexOf(to);
      next.splice(fi, 1);
      next.splice(ti, 0, from);
      localStorage.setItem('perf_all_col_order', JSON.stringify(next));
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

  // Column panel handlers
  const toggleColVisible = useCallback((key) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      saveVisibleCols(next);
      return next;
    });
  }, []);

  const handlePanelDragStart = useCallback((idx) => setPanelDragIdx(idx), []);
  const handlePanelDragOver = useCallback((e, idx) => { e.preventDefault(); setPanelDragOverIdx(idx); }, []);
  const handlePanelDrop = useCallback(() => {
    if (panelDragIdx == null || panelDragOverIdx == null || panelDragIdx === panelDragOverIdx) return;
    setAllColOrder(prev => {
      const next = [...prev];
      const [removed] = next.splice(panelDragIdx, 1);
      next.splice(panelDragOverIdx, 0, removed);
      saveAllColOrder(next);
      return next;
    });
    setPanelDragIdx(null);
    setPanelDragOverIdx(null);
  }, [panelDragIdx, panelDragOverIdx]);

  const saveView = useCallback((name) => {
    const view = { name, allColOrder, visibleCols: [...visibleCols] };
    setSavedViews(prev => {
      const idx = prev.findIndex(v => v.name === name);
      const next = idx >= 0 ? [...prev.slice(0, idx), view, ...prev.slice(idx + 1)] : [...prev, view];
      localStorage.setItem('perf_saved_views', JSON.stringify(next));
      return next;
    });
  }, [allColOrder, visibleCols]);

  const loadView = useCallback((name) => {
    if (name === '__default__') {
      setAllColOrder(DEFAULT_COL_ORDER);
      setVisibleCols(new Set(DEFAULT_COL_ORDER));
      saveAllColOrder(DEFAULT_COL_ORDER);
      saveVisibleCols(new Set(DEFAULT_COL_ORDER));
      return;
    }
    const view = savedViews.find(v => v.name === name);
    if (!view) return;
    const ord = view.allColOrder;
    const vis = new Set(view.visibleCols);
    setAllColOrder(ord);
    setVisibleCols(vis);
    saveAllColOrder(ord);
    saveVisibleCols(vis);
  }, [savedViews]);

  const deleteView = useCallback((name) => {
    setSavedViews(prev => {
      const next = prev.filter(v => v.name !== name);
      localStorage.setItem('perf_saved_views', JSON.stringify(next));
      return next;
    });
  }, []);

  // Flatten hierarchy for rendering with hierarchical sorting
  const flatRows = useMemo(() => {
    if (!data) return [];
    const rows = [];
    const sq = search.toLowerCase();

    const sortArr = (arr) => {
      if (!sortCol) return arr;
      return [...arr].sort((a, b) => {
        const av = a[sortCol] ?? (typeof a[sortCol] === 'string' ? '' : 0);
        const bv = b[sortCol] ?? (typeof b[sortCol] === 'string' ? '' : 0);
        if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === 'asc' ? av - bv : bv - av;
      });
    };

    const clientData = data.clients[0];
    if (!clientData) return [];

    const campaigns = sortArr(clientData.campaigns.filter(camp => {
      if (statusFilter !== 'all' && camp.status.toLowerCase() !== statusFilter) return false;
      if (sq && !camp.name.toLowerCase().includes(sq)) return false;
      return true;
    }));

    campaigns.forEach(camp => {
      const campKey = `c_${camp.id}`;
      rows.push({ ...camp, _rowKey: campKey, _clientId: clientData.clientId, _clientCode: clientData.clientCode, _clientName: clientData.clientName, level: 0 });
      if (expanded.has(campKey)) {
        const activeAdsets = sortArr(camp.adsets.filter(a => a.status === 'ACTIVE' || a.status === 'ENABLED'));
        const inactiveAdsets = sortArr(camp.adsets.filter(a => a.status !== 'ACTIVE' && a.status !== 'ENABLED'));

        activeAdsets.forEach(adset => {
          const adsetKey = `a_${adset.id}`;
          rows.push({ ...adset, _rowKey: adsetKey, _clientId: clientData.clientId, _clientCode: clientData.clientCode, level: 1 });
          if (expanded.has(adsetKey)) {
            const activeAds = sortArr(adset.ads.filter(ad => ad.status === 'ACTIVE' || ad.status === 'ENABLED'));
            const inactiveAds = sortArr(adset.ads.filter(ad => ad.status !== 'ACTIVE' && ad.status !== 'ENABLED'));
            activeAds.forEach(ad => {
              rows.push({ ...ad, _rowKey: `ad_${ad.id}`, _clientId: clientData.clientId, _clientCode: clientData.clientCode, level: 2 });
            });
            if (inactiveAds.length > 0) {
              const inactKey = `inact_ads_${adset.id}`;
              rows.push({ _rowKey: inactKey, _type: 'inactive_group', name: `Paused / Inactive (${inactiveAds.length})`, level: 2, _children: inactiveAds, _clientId: clientData.clientId, _clientCode: clientData.clientCode });
              if (expanded.has(inactKey)) {
                inactiveAds.forEach(ad => {
                  rows.push({ ...ad, _rowKey: `ad_${ad.id}`, _clientId: clientData.clientId, _clientCode: clientData.clientCode, level: 2, _dimmed: true });
                });
              }
            }
          }
        });

        if (inactiveAdsets.length > 0) {
          const inactKey = `inact_adsets_${camp.id}`;
          rows.push({ _rowKey: inactKey, _type: 'inactive_group', name: `Paused / Inactive (${inactiveAdsets.length})`, level: 1, _children: inactiveAdsets, _clientId: clientData.clientId, _clientCode: clientData.clientCode });
          if (expanded.has(inactKey)) {
            inactiveAdsets.forEach(adset => {
              const adsetKey = `a_${adset.id}`;
              rows.push({ ...adset, _rowKey: adsetKey, _clientId: clientData.clientId, _clientCode: clientData.clientCode, level: 1, _dimmed: true });
              if (expanded.has(adsetKey)) {
                adset.ads.forEach(ad => {
                  rows.push({ ...ad, _rowKey: `ad_${ad.id}`, _clientId: clientData.clientId, _clientCode: clientData.clientCode, level: 2, _dimmed: true });
                });
              }
            });
          }
        }
      }
    });
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
      case 'results':
        return fmtNum(row.results || 0);
      case 'costPerResult':
        return (row.costPerResult || 0) > 0 ? fmtRM(row.costPerResult) : '—';
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

  const colDefs = DEFAULT_COLS.reduce((m, c) => { m[c.key] = c; return m; }, {});
  const selectedClientName = clientList.find(c => c.id === selectedClient)?.clientCode || 'Select Client';

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Montserrat, sans-serif', margin: 0 }}>Performance</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Campaign &#x2192; Ad Set &#x2192; Ad breakdown across all clients</p>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        {/* Client selector — single select */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setClientDropOpen(v => !v)}
            style={{ ...st.filterBtn, minWidth: 140 }}
          >
            {selectedClientName} &#9662;
          </button>
          {clientDropOpen && (
            <div style={st.dropdown}>
              {clientList.map(c => (
                <div key={c.id} style={{ ...st.dropItem, background: c.id === selectedClient ? 'rgba(50,205,50,0.1)' : 'transparent', color: c.id === selectedClient ? '#32cd32' : 'var(--text-primary)' }} onClick={() => {
                  setSelectedClient(c.id);
                  setClientDropOpen(false);
                }}>
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

        {/* Columns */}
        <button onClick={() => setColPanelOpen(v => !v)} style={{ ...st.filterBtn, background: colPanelOpen ? 'rgba(50,205,50,0.15)' : 'rgba(50,205,50,0.06)' }}>
          ⚙ Columns
        </button>

        {/* Refresh */}
        <button onClick={fetchData} style={st.filterBtn} disabled={loading}>
          {loading ? '...' : '↻ Refresh'}
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
                <tr style={{ background: 'var(--card-bg, #03140e)' }}>
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
                        onClick={() => key !== 'toggle' && key !== 'status' && handleSort(key)}
                        style={{ ...st.th, width: w, minWidth: w, cursor: (key === 'toggle' || key === 'status') ? 'default' : 'pointer', position: 'relative', userSelect: 'none' }}
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
                {flatRows.map((row, i) => {
                  // Inactive group row
                  if (row._type === 'inactive_group') {
                    return (
                      <tr key={row._rowKey} onClick={() => toggleExpand(row._rowKey)} style={{ cursor: 'pointer' }}>
                        <td style={{ ...st.tdFrozen, borderBottom: '1px solid rgba(50,205,50,0.07)', opacity: 0.6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: row.level * 18 }}>
                            <button style={{ background: 'none', border: 'none', color: 'rgba(232,245,233,0.4)', cursor: 'pointer', fontSize: 9, padding: '2px 4px', flexShrink: 0 }}>
                              {expanded.has(row._rowKey) ? '▼' : '▶'}
                            </button>
                            <span style={{ fontSize: 11, color: 'rgba(232,245,233,0.4)', fontStyle: 'italic' }}>&#9646; {row.name}</span>
                          </div>
                        </td>
                        {colOrder.map(key => <td key={key} style={{ ...st.td, borderBottom: '1px solid rgba(50,205,50,0.07)', opacity: 0.3 }} />)}
                      </tr>
                    );
                  }

                  // Normal row
                  return (
                    <tr key={row._rowKey}
                      style={{
                        background: i % 2 === 0 ? 'transparent' : 'rgba(50,205,50,0.015)',
                        transition: 'background 0.15s',
                        opacity: row._dimmed ? 0.55 : 1,
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
                          {(row.level === 0 || row.level === 1) && (row.objective || row.optimization_goal) && (
                            <button
                              onClick={e => { e.stopPropagation(); setInfoPopup(row); }}
                              style={{ background: 'none', border: 'none', color: 'rgba(50,205,50,0.5)', cursor: 'pointer', fontSize: 11, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
                              title="View settings"
                            >&#x24D8;</button>
                          )}
                          {row.level === 0 && row.spend > 0 && (row.results == null || row.results === 0) && (
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
                  );
                })}
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

      {infoPopup && <InfoPopup row={infoPopup} onClose={() => setInfoPopup(null)} />}

      {/* Column customiser panel */}
      {colPanelOpen && (
        <div onClick={() => setColPanelOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 290,
            background: 'var(--card-bg, #0a1f15)', borderLeft: '1px solid rgba(50,205,50,0.2)',
            display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)', zIndex: 301,
          }}>
            {/* Panel header */}
            <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(50,205,50,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Montserrat' }}>Customise Columns</span>
              <button onClick={() => setColPanelOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>&#x2715;</button>
            </div>

            {/* Saved views */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(50,205,50,0.08)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Saved Views</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => loadView('__default__')} style={{ ...st.rangeBtn, fontSize: 10, padding: '4px 10px' }}>Default</button>
                {savedViews.map(v => (
                  <div key={v.name} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <button onClick={() => loadView(v.name)} style={{ ...st.rangeBtn, fontSize: 10, padding: '4px 10px' }}>{v.name}</button>
                    <button onClick={() => deleteView(v.name)} style={{ background: 'none', border: 'none', color: 'rgba(255,100,100,0.5)', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}>&#x2715;</button>
                  </div>
                ))}
                <button onClick={() => {
                  const name = window.prompt('Save current view as:');
                  if (name?.trim()) saveView(name.trim());
                }} style={{ ...st.rangeBtn, fontSize: 10, padding: '4px 10px', color: '#32cd32', borderColor: 'rgba(50,205,50,0.35)' }}>
                  + Save View
                </button>
              </div>
            </div>

            {/* Column list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>
                Columns — drag to reorder
              </div>
              {allColOrder.map((key, idx) => {
                const col = colDefs[key];
                if (!col) return null;
                const isVisible = visibleCols.has(key);
                const isDragTarget = panelDragOverIdx === idx;
                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={() => handlePanelDragStart(idx)}
                    onDragOver={e => handlePanelDragOver(e, idx)}
                    onDrop={handlePanelDrop}
                    onDragEnd={() => { setPanelDragIdx(null); setPanelDragOverIdx(null); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px',
                      borderRadius: 6, marginBottom: 2, cursor: 'grab',
                      background: isDragTarget ? 'rgba(50,205,50,0.1)' : 'transparent',
                      border: isDragTarget ? '1px solid rgba(50,205,50,0.25)' : '1px solid transparent',
                      opacity: isVisible ? 1 : 0.45,
                      transition: 'background 0.1s',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', fontSize: 13, userSelect: 'none', lineHeight: 1 }}>&#x2630;</span>
                    <div
                      onClick={() => toggleColVisible(key)}
                      style={{
                        width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${isVisible ? '#32cd32' : 'rgba(50,205,50,0.3)'}`,
                        background: isVisible ? '#32cd32' : 'transparent', cursor: 'pointer', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                      }}
                    >
                      {isVisible && <span style={{ fontSize: 9, color: '#03140e', fontWeight: 900, lineHeight: 1 }}>&#x2713;</span>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, userSelect: 'none' }}>{col.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Reset footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(50,205,50,0.08)' }}>
              <button
                onClick={() => { setAllColOrder(DEFAULT_COL_ORDER); setVisibleCols(new Set(DEFAULT_COL_ORDER)); saveAllColOrder(DEFAULT_COL_ORDER); saveVisibleCols(new Set(DEFAULT_COL_ORDER)); }}
                style={{ ...st.filterBtn, width: '100%', fontSize: 11, textAlign: 'center' }}
              >
                Reset to Default
              </button>
            </div>
          </div>
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
    background: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontWeight: 600,
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
    position: 'sticky', left: 0, zIndex: 5, background: 'var(--card-bg, #03140e)',
    padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid rgba(50,205,50,0.2)',
    borderRight: '1px solid rgba(50,205,50,0.12)',
  },
  th: {
    padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid rgba(50,205,50,0.2)',
    borderRight: '1px solid rgba(50,205,50,0.05)', background: 'var(--card-bg, #03140e)',
    whiteSpace: 'nowrap',
  },
  thLabel: {
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Montserrat, sans-serif',
  },
  tdFrozen: {
    position: 'sticky', left: 0, zIndex: 3, background: 'var(--bg)',
    padding: '10px 12px', borderRight: '1px solid rgba(50,205,50,0.12)',
    maxWidth: 280, minWidth: 280, color: 'var(--text-primary)',
  },
  td: {
    padding: '9px 10px', fontSize: 12, color: 'var(--text-primary)',
    textAlign: 'right', whiteSpace: 'nowrap',
  },
};
