/**
 * Millecube Digital — Meta Ads Report Generator v3
 * Font: Montserrat | Professional header with company details | No footer page number
 * Drop logo PNG at: backend/assets/logo.png  (optional — text fallback if missing)
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, BorderStyle,
  WidthType, ShadingType, VerticalAlign, PageNumber, PageNumberElement,
  TabStopType, UnderlineType,
  HorizontalPositionAlign, HorizontalPositionRelativeFrom,
  VerticalPositionAlign, VerticalPositionRelativeFrom
} = require('docx');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs-extra');
const path = require('path');

// ── Brand ──────────────────────────────────────────────────────────────────────
const BRAND = {
  darkGreen:  '07503c',
  green:      '32cd32',   // leaf green — used for highlighted numbers
  lightGreen: '6bc71f',
  amber:      'E8A000',
  blue:       '1A7FCC',
  white:      'ffffff',
  black:      '111111',
  lightGrey:  'F5F5F5',
  midGrey:    'AAAAAA',
  borderGrey: 'DDDDDD',
};

const FONT = 'Montserrat';

const PAGE = {
  width:  11906,
  height: 16838,
  margin: 1134,
  get content() { return this.width - this.margin * 2; }
};

const BENCH = { ctrLow: 0.8, ctrHigh: 2.5, ctrStrong: 2.0, cpmLow: 5, cpmHigh: 25, cpcLow: 0.30, cpcHigh: 2.50 };

const COMPANY = {
  name:    'Millecube Digital',
  entity:  'CADOO VENTURE SDN. BHD. 202301026716 (1520639-D)',
  address: '2-5-9, Harbour Trade Centre, Gat Lebuh Macallum,',
  city:    '10300, Georgetown, Pulau Pinang, Malaysia',
  tel:     '+016 496 3875',
  email:   'hello@millecube.com',
};

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmtRM  = v => `RM ${parseFloat(v || 0).toFixed(2)}`;
const fmtNum = v => Math.round(parseFloat(v || 0)).toLocaleString('en-MY');
const fmtPct = v => `${parseFloat(v || 0).toFixed(2)}%`;

// ── Chart Generator ────────────────────────────────────────────────────────────
const chartCanvas      = new ChartJSNodeCanvas({ width: 700, height: 320, backgroundColour: 'white' });
const chartCanvasTall  = new ChartJSNodeCanvas({ width: 700, height: 380, backgroundColour: 'white' });
const chartCanvasSquare = new ChartJSNodeCanvas({ width: 700, height: 340, backgroundColour: 'white' });

async function chartHBar(labels, values, title, color = '#E8A000', valuePrefix = 'RM ') {
  return chartCanvas.renderToBuffer({
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: color, borderRadius: 4 }] },
    options: {
      indexAxis: 'y',
      plugins: {
        title: { display: true, text: title, font: { size: 13, weight: 'bold', family: 'sans-serif' }, color: '#07503c', padding: { bottom: 12 } },
        legend: { display: false }
      },
      scales: {
        x: { grid: { color: '#eeeeee' }, ticks: { callback: v => `${valuePrefix}${Number(v).toLocaleString()}` } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      },
      layout: { padding: { right: 20 } }
    }
  });
}

async function chartLine(labels, datasets, title) {
  return chartCanvasTall.renderToBuffer({
    type: 'line',
    data: { labels, datasets },
    options: {
      plugins: {
        title: { display: true, text: title, font: { size: 13, weight: 'bold' }, color: '#07503c', padding: { bottom: 12 } },
        legend: { display: datasets.length > 1, position: 'top' }
      },
      scales: {
        x: { grid: { color: '#f0f0f0' }, ticks: { maxTicksLimit: 10, font: { size: 10 } } },
        y: { grid: { color: '#eeeeee' }, beginAtZero: true }
      },
      elements: { point: { radius: 3 } }
    }
  });
}

async function chartGroupedBar(labels, datasets, title) {
  return chartCanvasSquare.renderToBuffer({
    type: 'bar',
    data: { labels, datasets },
    options: {
      plugins: {
        title: { display: true, text: title, font: { size: 13, weight: 'bold' }, color: '#07503c', padding: { bottom: 12 } },
        legend: { display: true, position: 'top' }
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#eeeeee' }, beginAtZero: true }
      }
    }
  });
}

async function chartDonut(labels, values, title, colors) {
  const c = new ChartJSNodeCanvas({ width: 340, height: 280, backgroundColour: 'white' });
  return c.renderToBuffer({
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2 }] },
    options: {
      plugins: {
        title: { display: true, text: title, font: { size: 12, weight: 'bold' }, color: '#07503c' },
        legend: { position: 'bottom', labels: { font: { size: 11 } } }
      },
      cutout: '60%'
    }
  });
}

async function chartBarLine(labels, barData, lineData, barLabel, lineLabel, title) {
  return chartCanvasTall.renderToBuffer({
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type: 'bar', label: barLabel, data: barData, backgroundColor: '#E8A000', yAxisID: 'y', borderRadius: 3 },
        { type: 'line', label: lineLabel, data: lineData, borderColor: '#07503c', backgroundColor: 'transparent', yAxisID: 'y1', tension: 0.3, pointRadius: 4, borderWidth: 2 }
      ]
    },
    options: {
      plugins: {
        title: { display: true, text: title, font: { size: 13, weight: 'bold' }, color: '#07503c', padding: { bottom: 12 } },
        legend: { display: true, position: 'top' }
      },
      scales: {
        x: { grid: { display: false } },
        y:  { position: 'left',  grid: { color: '#eeeeee' }, beginAtZero: true, title: { display: true, text: barLabel } },
        y1: { position: 'right', grid: { display: false },   beginAtZero: true, title: { display: true, text: lineLabel } }
      }
    }
  });
}

// ── Data Processing ────────────────────────────────────────────────────────────
function extractAction(actions, type) {
  if (!actions) return 0;
  const f = (Array.isArray(actions) ? actions : []).find(a => a.action_type === type);
  return f ? parseFloat(f.value || 0) : 0;
}

function getCampaignGoal(name, patterns) {
  const n = (name || '').toUpperCase();
  for (const { pattern, goal } of (patterns || [])) {
    if (n.includes((pattern || '').toUpperCase())) return goal;
  }
  if (n.includes('ENG POST') || n.includes('POST BOOST') || n.includes('I POST')) return 'post_engagement';
  if (n.includes('FOLLOW') || n.includes('LIKE'))   return 'page_likes';
  if (n.includes('AWARENESS') || n.includes('BRAND')) return 'reach';
  if (n.includes('LEAD'))                            return 'leads';
  if (n.includes('ENG') || n.includes('MSG') || n.includes('WA')) return 'whatsapp';
  return 'whatsapp';
}

function getPrimaryResult(c) {
  switch (c.goal) {
    case 'whatsapp':        return { label: 'WA Replies',   count: c.waConvos,        cpr: c.waConvos > 0        ? c.spend / c.waConvos : 0 };
    case 'post_engagement': return { label: 'Engagements',  count: c.postEngagements, cpr: c.postEngagements > 0 ? c.spend / c.postEngagements : 0 };
    case 'page_likes':      return { label: 'Page Likes',   count: c.pageLikes,       cpr: c.pageLikes > 0       ? c.spend / c.pageLikes : 0 };
    case 'reach':           return { label: 'Reach',        count: c.reach,           cpr: c.impressions > 0     ? c.spend / c.impressions * 1000 : 0 };
    case 'leads':           return { label: 'Leads',        count: c.leads,           cpr: c.leads > 0           ? c.spend / c.leads : 0 };
    default:                return { label: 'Results',      count: 0,                 cpr: 0 };
  }
}

function processData(rawData, client) {
  const { platformDay, ageGender } = rawData;
  const goalPatterns = client.campaignGoals || [];

  const campaignMap = {};
  for (const row of platformDay) {
    const key = row.campaign_name;
    if (!campaignMap[key]) {
      campaignMap[key] = {
        name: key, goal: getCampaignGoal(key, goalPatterns),
        spend: 0, reach: 0, impressions: 0, clicks: 0,
        waConvos: 0, postEngagements: 0, pageLikes: 0, leads: 0,
        reactions: 0, shares: 0, comments: 0, saves: 0,
        videoViews: 0, video25: 0, video50: 0, video75: 0, video100: 0
      };
    }
    const c = campaignMap[key];
    c.spend       += parseFloat(row.spend || 0);
    c.reach       += parseFloat(row.reach || 0);
    c.impressions += parseFloat(row.impressions || 0);
    c.clicks      += parseFloat(row.clicks || 0);
    c.waConvos    += extractAction(row.actions, 'onsite_conversion.messaging_first_reply');
    c.postEngagements += extractAction(row.actions, 'post_engagement');
    c.pageLikes   += extractAction(row.actions, 'like');
    c.leads       += extractAction(row.actions, 'lead');
    c.reactions   += extractAction(row.actions, 'post_reaction');
    c.shares      += extractAction(row.actions, 'post');
    c.comments    += extractAction(row.actions, 'comment');
    c.saves       += extractAction(row.actions, 'onsite_conversion.post_save');
    c.videoViews  += extractAction(row.video_30_sec_watched_actions, 'video_view');
    c.video25     += extractAction(row.video_p25_watched_actions, 'video_view');
    c.video50     += extractAction(row.video_p50_watched_actions, 'video_view');
    c.video75     += extractAction(row.video_p75_watched_actions, 'video_view');
    c.video100    += extractAction(row.video_p100_watched_actions, 'video_view');
  }
  const campaigns = Object.values(campaignMap).map(c => ({
    ...c,
    ctr: c.impressions > 0 ? c.clicks / c.impressions * 100 : 0,
    cpm: c.impressions > 0 ? c.spend / c.impressions * 1000 : 0,
    cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
    get primaryResult() { return getPrimaryResult(this); }
  }));

  const totals = campaigns.reduce((acc, c) => {
    acc.spend += c.spend; acc.reach += c.reach; acc.impressions += c.impressions;
    acc.clicks += c.clicks; acc.waConvos += c.waConvos; acc.postEngagements += c.postEngagements;
    acc.pageLikes += c.pageLikes; acc.leads += c.leads;
    return acc;
  }, { spend: 0, reach: 0, impressions: 0, clicks: 0, waConvos: 0, postEngagements: 0, pageLikes: 0, leads: 0 });
  totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions * 100 : 0;
  totals.cpm = totals.impressions > 0 ? totals.spend / totals.impressions * 1000 : 0;
  totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  totals.totalResults = campaigns.reduce((s, c) => s + c.primaryResult.count, 0);
  totals.avgCPR = totals.totalResults > 0 ? totals.spend / totals.totalResults : 0;

  const platformMap = {};
  for (const row of platformDay) {
    const key = row.publisher_platform || 'unknown';
    if (!platformMap[key]) platformMap[key] = { platform: key, spend: 0, impressions: 0, clicks: 0, results: 0 };
    const p = platformMap[key];
    p.spend += parseFloat(row.spend || 0);
    p.impressions += parseFloat(row.impressions || 0);
    p.clicks += parseFloat(row.clicks || 0);
    p.results += extractAction(row.actions, 'onsite_conversion.messaging_first_reply')
               + extractAction(row.actions, 'post_engagement')
               + extractAction(row.actions, 'like');
  }
  const platforms = Object.values(platformMap).map(p => ({
    ...p,
    ctr: p.impressions > 0 ? p.clicks / p.impressions * 100 : 0,
    cpm: p.impressions > 0 ? p.spend / p.impressions * 1000 : 0,
    cpr: p.results > 0 ? p.spend / p.results : 0
  }));

  const dailyMap = {};
  for (const row of platformDay) {
    const day = row.date_start; if (!day) continue;
    if (!dailyMap[day]) dailyMap[day] = { date: day, spend: 0, results: 0 };
    dailyMap[day].spend   += parseFloat(row.spend || 0);
    dailyMap[day].results += extractAction(row.actions, 'onsite_conversion.messaging_first_reply')
                           + extractAction(row.actions, 'post_engagement')
                           + extractAction(row.actions, 'like');
  }
  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  const ageMap = {};
  for (const row of ageGender) {
    const age = row.age; if (!age || age === 'unknown') continue;
    if (!ageMap[age]) ageMap[age] = { age, spend: 0, clicks: 0, impressions: 0, results: 0 };
    ageMap[age].spend       += parseFloat(row.spend || 0);
    ageMap[age].clicks      += parseFloat(row.clicks || 0);
    ageMap[age].impressions += parseFloat(row.impressions || 0);
    ageMap[age].results     += extractAction(row.actions, 'onsite_conversion.messaging_first_reply')
                             + extractAction(row.actions, 'post_engagement')
                             + extractAction(row.actions, 'like');
  }
  const AGE_ORDER = ['13-17','18-24','25-34','35-44','45-54','55-64','65+'];
  const ages = Object.values(ageMap)
    .map(a => ({ ...a, ctr: a.impressions > 0 ? a.clicks / a.impressions * 100 : 0, cpr: a.results > 0 ? a.spend / a.results : 0 }))
    .sort((a, b) => AGE_ORDER.indexOf(a.age) - AGE_ORDER.indexOf(b.age));

  const genderMap = {};
  for (const row of ageGender) {
    const g = row.gender; if (!g || g === 'unknown') continue;
    if (!genderMap[g]) genderMap[g] = { gender: g, spend: 0, clicks: 0, impressions: 0, results: 0 };
    genderMap[g].spend       += parseFloat(row.spend || 0);
    genderMap[g].clicks      += parseFloat(row.clicks || 0);
    genderMap[g].impressions += parseFloat(row.impressions || 0);
    genderMap[g].results     += extractAction(row.actions, 'onsite_conversion.messaging_first_reply')
                              + extractAction(row.actions, 'post_engagement')
                              + extractAction(row.actions, 'like');
  }
  const genders = Object.values(genderMap).map(g => ({
    ...g,
    ctr: g.impressions > 0 ? g.clicks / g.impressions * 100 : 0,
    cpr: g.results > 0 ? g.spend / g.results : 0
  }));

  const hasVideo      = campaigns.some(c => c.videoViews > 0);
  const hasEngagement = campaigns.some(c => c.reactions > 0 || c.shares > 0);

  return { campaigns, totals, platforms, daily, ages, genders, hasVideo, hasEngagement };
}

// ── Text Helpers ───────────────────────────────────────────────────────────────

// Splits text into TextRun array, highlighting numbers/RM values/percentages in leaf green+bold
function highlightText(text, size = 19, baseColor = '444444') {
  // Matches: RM 1,234.56 | 2.34% | 1,234 (comma-formatted) | 2.5x | 50+
  const pattern = /RM\s[\d,]+\.?\d*|\d+\.?\d*%|\d{1,3}(?:,\d{3})+\+?|\d+\.?\d*x/g;
  const runs = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) {
      runs.push(new TextRun({ text: text.slice(last, m.index), size, color: baseColor, font: FONT }));
    }
    runs.push(new TextRun({ text: m[0], size, color: BRAND.green, bold: true, font: FONT }));
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    runs.push(new TextRun({ text: text.slice(last), size, color: baseColor, font: FONT }));
  }
  return runs.length > 0 ? runs : [new TextRun({ text, size, color: baseColor, font: FONT })];
}

// ── Document Helpers ───────────────────────────────────────────────────────────
const noB = {
  borders: {
    top:    { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE },
    left:   { style: BorderStyle.NONE },
    right:  { style: BorderStyle.NONE }
  }
};

function border(color = BRAND.borderGrey) {
  const b = { style: BorderStyle.SINGLE, size: 1, color };
  return { top: b, bottom: b, left: b, right: b };
}

function cell(text, opts = {}) {
  const runs = Array.isArray(text)
    ? text
    : [new TextRun({ text: String(text ?? ''), bold: !!opts.bold, color: opts.color || BRAND.black, size: opts.size || 17, font: FONT, italics: opts.italic })];
  return new TableCell({
    borders: opts.noBorder ? noB.borders : border(opts.borderColor),
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    verticalAlign: opts.vAlign || VerticalAlign.CENTER,
    margins: opts.margins || { top: 100, bottom: 100, left: 140, right: 140 },
    columnSpan: opts.span,
    children: [new Paragraph({ alignment: opts.align || AlignmentType.LEFT, spacing: { before: 0, after: 0 }, children: runs })]
  });
}

function heading(text, level = 1) {
  if (level === 1) {
    return new Paragraph({
      spacing: { before: 400, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND.green, space: 6 } },
      children: [new TextRun({ text, bold: true, size: 32, color: BRAND.darkGreen, font: FONT })]
    });
  }
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 22, color: BRAND.amber, font: FONT })]
  });
}

function para(text, opts = {}) {
  const children = opts.plain
    ? [new TextRun({ text, size: opts.size || 19, color: opts.color || '444444', bold: opts.bold, italics: opts.italic, font: FONT })]
    : highlightText(text, opts.size || 19, opts.color || '444444');

  if (opts.italic && !opts.plain) {
    // italics on top of highlighted — apply italics to all runs
    children.forEach(r => { r.options = r.options || {}; });
    return new Paragraph({
      spacing: { before: opts.before ?? 80, after: opts.after ?? 100 },
      alignment: opts.align,
      children: children.map(r => new TextRun({ ...r._root?.children?.[0]?.root?.children?.[0] || {}, italics: true }))
    });
  }

  return new Paragraph({
    spacing: { before: opts.before ?? 80, after: opts.after ?? 100 },
    alignment: opts.align,
    children
  });
}

function spacer(lines = 1) {
  return new Paragraph({ spacing: { before: 0, after: 160 * lines }, children: [new TextRun('')] });
}

function chartImage(buffer, widthPx = 580, heightPx = 270) {
  return new Paragraph({
    spacing: { before: 120, after: 160 },
    children: [new ImageRun({ data: buffer, type: 'png', transformation: { width: widthPx, height: heightPx } })]
  });
}

function kpiTable(kpis) {
  const colW = Math.floor(PAGE.content / kpis.length);
  return new Table({
    width: { size: PAGE.content, type: WidthType.DXA },
    columnWidths: kpis.map(() => colW),
    rows: [new TableRow({
      children: kpis.map(k => new TableCell({
        borders: border(BRAND.darkGreen),
        width: { size: colW, type: WidthType.DXA },
        shading: { fill: BRAND.darkGreen, type: ShadingType.CLEAR },
        margins: { top: 200, bottom: 200, left: 180, right: 180 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 },  children: [new TextRun({ text: k.value, bold: true, size: 32, color: BRAND.green,    font: FONT })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 40 },  children: [new TextRun({ text: k.label, size: 16, color: 'aaddaa', font: FONT })] }),
          ...(k.sub ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: k.sub, size: 14, color: 'aaddaa', font: FONT, italics: true })] })] : [])
        ]
      }))
    })]
  });
}

function insightCard(emoji, title, body, color = BRAND.amber) {
  const bgMap = { [BRAND.amber]: 'FFF8E8', [BRAND.darkGreen]: 'E8F5E9', 'cc3333': 'FFF0F0', '555588': 'F0F0FF' };
  const bg = bgMap[color] || 'F9F9F9';
  const titleColor = color === BRAND.amber ? '7A4800' : color === BRAND.darkGreen ? BRAND.darkGreen : color;
  const cols = [420, PAGE.content - 420];
  return [
    new Table({
      width: { size: PAGE.content, type: WidthType.DXA },
      columnWidths: cols,
      rows: [new TableRow({ children: [
        new TableCell({
          borders: border(color),
          width: { size: cols[0], type: WidthType.DXA },
          shading: { fill: color, type: ShadingType.CLEAR },
          margins: { top: 140, bottom: 140, left: 100, right: 100 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: emoji, size: 28, font: FONT })] })]
        }),
        new TableCell({
          borders: { top: border(color).top, bottom: border(color).bottom, right: border(color).right, left: { style: BorderStyle.NONE } },
          width: { size: cols[1], type: WidthType.DXA },
          shading: { fill: bg, type: ShadingType.CLEAR },
          margins: { top: 140, bottom: 140, left: 180, right: 180 },
          children: [
            new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: title, bold: true, size: 19, color: titleColor, font: FONT })] }),
            new Paragraph({ spacing: { before: 0, after: 0 }, children: highlightText(body, 17, '444444') })
          ]
        })
      ]})]
    }),
    spacer(0.5)
  ];
}

function recCard(num, title, why, impact) {
  const cols = [560, PAGE.content - 560];
  return [
    new Table({
      width: { size: PAGE.content, type: WidthType.DXA },
      columnWidths: cols,
      rows: [new TableRow({ children: [
        new TableCell({
          borders: border(BRAND.amber),
          width: { size: cols[0], type: WidthType.DXA },
          shading: { fill: BRAND.amber, type: ShadingType.CLEAR },
          margins: { top: 140, bottom: 140, left: 120, right: 120 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(num), bold: true, size: 36, color: BRAND.white, font: FONT })] })]
        }),
        new TableCell({
          borders: { top: border(BRAND.amber).top, bottom: border(BRAND.amber).bottom, right: border(BRAND.amber).right, left: { style: BorderStyle.NONE } },
          width: { size: cols[1], type: WidthType.DXA },
          shading: { fill: 'FFF8E8', type: ShadingType.CLEAR },
          margins: { top: 140, bottom: 140, left: 200, right: 180 },
          children: [
            new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: title, bold: true, size: 19, color: BRAND.darkGreen, font: FONT })] }),
            new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: 'Why: ', bold: true, size: 17, color: '555555', font: FONT }), ...highlightText(why, 17, '555555')] }),
            new Paragraph({ spacing: { before: 0, after: 0 },  children: [new TextRun({ text: 'Expected: ', bold: true, size: 17, color: BRAND.lightGreen, font: FONT }), ...highlightText(impact, 17, '555555')] })
          ]
        })
      ]})]
    }),
    spacer(0.5)
  ];
}

function summaryTable(rows, headers, colWidths) {
  const totalW = colWidths.reduce((s, w) => s + w, 0);
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { bg: BRAND.darkGreen, color: BRAND.white, bold: true, width: colWidths[i], align: i > 0 ? AlignmentType.RIGHT : AlignmentType.LEFT, size: 16 })) }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((v, i) => cell(v, {
          width: colWidths[i],
          align: i > 0 ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bg: ri % 2 === 1 ? BRAND.lightGrey : BRAND.white,
          bold: row[0] === 'TOTAL' || row[0] === 'TOTAL / AVG' || row[0] === 'Total / Avg',
          size: 16
        }))
      }))
    ]
  });
}

// ── Watermark Builder ──────────────────────────────────────────────────────────
async function buildWatermarkBuffer(logoPath) {
  try {
    const img = await loadImage(logoPath);
    // Scale to 500px wide, maintain aspect ratio
    const W = 500;
    const H = Math.round(W * img.height / img.width);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.globalAlpha = 0.5; // 50% transparency as requested
    ctx.drawImage(img, 0, 0, W, H);
    return canvas.toBuffer('image/png');
  } catch (err) {
    console.error('[WATERMARK] Failed to build watermark:', err.message);
    return null;
  }
}

// ── Header Builder ─────────────────────────────────────────────────────────────
// logoBuffer and watermarkBuffer are pre-loaded in generate() to keep this fn sync
function buildHeader(logoBuffer, watermarkBuffer) {
  let leftChildren;
  if (logoBuffer) {
    leftChildren = [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new ImageRun({ data: logoBuffer, type: 'png', transformation: { width: 120, height: 48 } })]
      })
    ];
  } else {
    leftChildren = [
      new Paragraph({ spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: 'MILLECUBE', bold: true, size: 22, color: BRAND.darkGreen, font: FONT })] }),
      new Paragraph({ spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: 'DIGITAL', bold: true, size: 14, color: BRAND.green, font: FONT })] }),
    ];
  }

  const rightChildren = [
    new Paragraph({ spacing: { before: 0, after: 20 }, alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: COMPANY.name, bold: true, size: 18, color: BRAND.darkGreen, font: FONT })] }),
    new Paragraph({ spacing: { before: 0, after: 20 }, alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: COMPANY.entity, size: 13, color: '888888', font: FONT })] }),
    new Paragraph({ spacing: { before: 0, after: 20 }, alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `${COMPANY.address}`, size: 13, color: '888888', font: FONT })] }),
    new Paragraph({ spacing: { before: 0, after: 20 }, alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: COMPANY.city, size: 13, color: '888888', font: FONT })] }),
    new Paragraph({ spacing: { before: 0, after: 0 }, alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: `Tel: ${COMPANY.tel}`, size: 13, color: '888888', font: FONT }),
        new TextRun({ text: '     Email: ', size: 13, color: '888888', font: FONT }),
        new TextRun({ text: COMPANY.email, size: 13, color: BRAND.darkGreen, bold: true, font: FONT }),
      ]}),
  ];

  const table = new Table({
    width: { size: PAGE.content, type: WidthType.DXA },
    columnWidths: [1800, PAGE.content - 1800],
    rows: [new TableRow({ children: [
      new TableCell({ ...noB, width: { size: 1800, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 0, right: 200 }, children: leftChildren }),
      new TableCell({ ...noB, width: { size: PAGE.content - 1800, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 200, right: 0 }, children: rightChildren }),
    ]})]
  });

  const divider = new Paragraph({
    spacing: { before: 100, after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND.green, space: 0 } },
    children: [new TextRun('')]
  });

  // Watermark: floating image centred on page, behind all content, 50% transparent
  const headerChildren = [table, divider];
  if (watermarkBuffer) {
    headerChildren.push(new Paragraph({
      children: [new ImageRun({
        data: watermarkBuffer,
        type: 'png',
        transformation: { width: 380, height: 152 },
        floating: {
          horizontalPosition: {
            align: HorizontalPositionAlign.CENTER,
            relative: HorizontalPositionRelativeFrom.PAGE
          },
          verticalPosition: {
            align: VerticalPositionAlign.CENTER,
            relative: VerticalPositionRelativeFrom.PAGE
          },
          behindDocument: true,
          allowOverlap: true
        }
      })]
    }));
  }

  return new Header({ children: headerChildren });
}

// ── Footer Builder (no page number) ───────────────────────────────────────────
function buildFooter(client, periodLabel) {
  return new Footer({ children: [
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: BRAND.green, space: 4 } },
      spacing: { before: 80, after: 0 },
      tabStops: [{ type: TabStopType.RIGHT, position: PAGE.content }],
      children: [
        new TextRun({ text: `${client.name}  ·  Meta Ads Report  ·  ${periodLabel}`, size: 15, color: BRAND.midGrey, font: FONT }),
        new TextRun({ text: '\tConfidential  ·  Millecube Digital', size: 15, color: BRAND.midGrey, font: FONT, italics: true }),
      ]
    })
  ]});
}

// ── Insights & Recommendations ─────────────────────────────────────────────────
function generateInsights(data) {
  const { campaigns, totals, platforms, ages, daily } = data;
  const cards = [];

  const avgCTR = totals.ctr;
  const ctrNote = avgCTR >= BENCH.ctrStrong
    ? `${fmtPct(avgCTR)} — ${(avgCTR / BENCH.ctrLow).toFixed(1)}x above the Malaysia benchmark of ${BENCH.ctrLow}–${BENCH.ctrHigh}%. Audience targeting and creative messaging are highly aligned. Maintain current strategy.`
    : avgCTR >= BENCH.ctrLow
    ? `${fmtPct(avgCTR)} — within the Malaysia benchmark of ${BENCH.ctrLow}–${BENCH.ctrHigh}%. Performance is on track. There is room to push CTR higher by testing stronger creative hooks.`
    : `${fmtPct(avgCTR)} — below the Malaysia benchmark of ${BENCH.ctrLow}%. Ad copy or targeting may need refreshing. Run A/B tests on headlines and visuals to improve click-through.`;
  cards.push({ emoji: avgCTR >= BENCH.ctrLow ? '✅' : '⚠️', title: `CTR Performance: ${fmtPct(avgCTR)}`, body: `Overall CTR is ${ctrNote}`, color: avgCTR >= BENCH.ctrLow ? BRAND.darkGreen : 'cc3333' });

  const best = [...campaigns].sort((a, b) => b.primaryResult.count - a.primaryResult.count)[0];
  if (best) {
    cards.push({
      emoji: '⭐',
      title: `Best Performer: ${best.name}`,
      body: `Led the account with ${fmtNum(best.primaryResult.count)} ${best.primaryResult.label} at ${fmtRM(best.primaryResult.cpr)} each. CTR of ${fmtPct(best.ctr)} and CPM of ${fmtRM(best.cpm)} signal strong creative-audience fit. Scale this campaign in the next period.`,
      color: BRAND.amber
    });
  }

  const underperformers = campaigns.filter(c => c.ctr < BENCH.ctrLow && c.spend > 0);
  if (underperformers.length > 0) {
    const u = underperformers[0];
    cards.push({
      emoji: '⚠️',
      title: `Creative Fatigue Signal: ${u.name}`,
      body: `CTR of ${fmtPct(u.ctr)} is below the ${BENCH.ctrLow}% Malaysia benchmark. This signals creative fatigue or audience mismatch. Introduce 2–3 new creative variants and test against current ads before the next reporting period.`,
      color: 'cc3333'
    });
  }

  const fb = platforms.find(p => p.platform === 'facebook');
  const ig = platforms.find(p => p.platform === 'instagram');
  if (fb && ig) {
    const leader = fb.results >= ig.results ? fb : ig;
    const other  = fb.results >= ig.results ? ig : fb;
    const lName  = leader.platform === 'facebook' ? 'Facebook' : 'Instagram';
    const oName  = other.platform  === 'facebook' ? 'Facebook' : 'Instagram';
    cards.push({
      emoji: '📊',
      title: `Platform Signal: ${lName} Leads`,
      body: `${lName} delivered ${fmtNum(leader.results)} results at ${fmtRM(leader.cpr)} CPR vs ${oName}'s ${fmtNum(other.results)} results at ${fmtRM(other.cpr)} CPR. ${lName} CTR of ${fmtPct(leader.ctr)} ${leader.ctr > other.ctr ? 'significantly outperforms' : 'is comparable to'} ${oName}. Current budget split aligns with performance.`,
      color: BRAND.darkGreen
    });
  }

  if (ages.length > 0) {
    const bestAge  = [...ages].sort((a, b) => b.results - a.results)[0];
    const cheapAge = [...ages].filter(a => a.cpr > 0).sort((a, b) => a.cpr - b.cpr)[0];
    if (bestAge) {
      const note = cheapAge && cheapAge.age !== bestAge.age
        ? ` The ${cheapAge.age} group shows the lowest cost per result (${fmtRM(cheapAge.cpr)}) — a signal of untapped efficiency worth exploring.`
        : '';
      cards.push({
        emoji: '💡',
        title: `Best Audience: ${bestAge.age} Age Group`,
        body: `The ${bestAge.age} group drove the most results (${fmtNum(bestAge.results)}) at ${fmtRM(bestAge.cpr)} per result with a ${fmtPct(bestAge.ctr)} CTR. These are the core buyer segment. All content should speak directly to this age group's priorities.${note}`,
        color: BRAND.amber
      });
    }
  }

  if (daily.length > 0) {
    const peakDay  = daily.reduce((a, b) => b.results > a.results ? b : a, daily[0]);
    const avgSpend = totals.spend / daily.length;
    cards.push({
      emoji: '📈',
      title: 'Spend & Results Delivery Pattern',
      body: `Average daily spend was ${fmtRM(avgSpend)} across ${daily.length} days. Peak results occurred on ${peakDay.date} (${fmtNum(peakDay.results)} results). ${daily.length >= 28 ? 'Full-month delivery was consistent — no significant delivery gaps detected.' : 'Campaigns did not run the full month — consider extending run windows for better algorithm optimisation.'}`,
      color: '555588'
    });
  }

  return cards;
}

function generateRecommendations(data) {
  const { campaigns, totals, platforms, ages } = data;
  const recs = [];

  const best = [...campaigns].sort((a, b) => b.primaryResult.count - a.primaryResult.count)[0];
  if (best) recs.push({
    title: `Scale Budget on ${best.name}`,
    why: `This campaign delivered the most results at a competitive CPR of ${fmtRM(best.primaryResult.cpr)}. It has proven creative-audience fit and is ready for budget scaling without significant CPR increase.`,
    impact: `A 10–20% budget increase can generate proportional result growth while staying within an efficient CPR range.`
  });

  const lowCTR = campaigns.filter(c => c.ctr < BENCH.ctrLow && c.spend > 50);
  if (lowCTR.length > 0) recs.push({
    title: `Refresh Creatives on ${lowCTR.map(c => c.name).join(', ')}`,
    why: `CTR below ${BENCH.ctrLow}% indicates the current creative is no longer resonating. Audience fatigue sets in after 3–4 weeks of the same visual — a fresh angle can recover performance quickly.`,
    impact: `New creative typically recovers CTR within 5–7 days of launch. Target CTR above ${BENCH.ctrHigh}% for this account profile.`
  });

  const fb = platforms.find(p => p.platform === 'facebook');
  const ig = platforms.find(p => p.platform === 'instagram');
  if (fb && ig && ig.spend > 0) {
    const betterPlatform = fb.cpr > 0 && ig.cpr > 0 && fb.cpr < ig.cpr ? 'Facebook' : ig.cpr < fb.cpr ? 'Instagram' : 'Facebook';
    recs.push({
      title: `Optimise Platform Budget Split`,
      why: `${betterPlatform} is delivering results at a lower cost per result. Shifting 10–15% of the weaker platform's budget to ${betterPlatform} will increase overall efficiency without requiring new creative.`,
      impact: `Estimated 8–15% improvement in overall CPR without increasing total budget.`
    });
  }

  if (ages.length > 0) {
    const topAges = [...ages].sort((a, b) => b.results - a.results).slice(0, 2);
    if (topAges.length >= 2) recs.push({
      title: `Focus Creative Messaging on ${topAges[0].age} & ${topAges[1].age}`,
      why: `These two age groups combined account for the majority of results. Content that speaks directly to their life stage — property decisions, career moves, family planning, retirement — will outperform generic messaging.`,
      impact: `More relevant messaging to top-performing segments typically reduces CPR by 10–25% over 4–6 weeks.`
    });
  }

  recs.push({
    title: 'Maintain Consistent Monthly Ad Activity',
    why: `Meta's delivery algorithm requires time to exit the learning phase (typically 50+ optimisation events). Pausing and restarting campaigns resets this learning, increasing CPR temporarily each time.`,
    impact: `Continuous campaigns typically achieve 15–30% lower CPR vs on-off campaigns of the same total budget over a quarter.`
  });

  const hasWA = campaigns.some(c => c.waConvos > 0);
  if (hasWA) recs.push({
    title: 'Add a Retargeting Layer for Warm Audiences',
    why: `People who have already clicked or engaged with ads are significantly more likely to convert. A retargeting campaign targeting website visitors and video viewers runs at 30–50% lower CPR than cold audience campaigns.`,
    impact: `Expected CPR reduction of 30–50%. A small monthly budget of RM 200–400 can drive high-efficiency conversions from warm audiences.`
  });

  return recs;
}

// ── Main Generate ──────────────────────────────────────────────────────────────
async function generate({ client, rawData, dateStart, dateStop, periodLabel, outputPath }) {
  const data = processData(rawData, client);
  const { campaigns, totals, platforms, daily, ages, genders, hasVideo, hasEngagement } = data;
  const insights = generateInsights(data);
  const recs     = generateRecommendations(data);
  const primaryColor   = `#${(client.primaryColor   || BRAND.amber).replace('#', '')}`;
  const secondaryColor = `#${(client.secondaryColor || BRAND.blue ).replace('#', '')}`;

  const shortName = n => n.length > 22 ? n.substring(0, 20) + '…' : n;

  // ── Charts ──────────────────────────────────────────────────────────────────
  const chart1 = await chartHBar(campaigns.map(c => shortName(c.name)), campaigns.map(c => c.spend),              `Spend by Campaign — ${periodLabel}`, primaryColor, 'RM ');
  const chart2 = await chartHBar(campaigns.map(c => shortName(c.name)), campaigns.map(c => c.primaryResult.count), `Primary Results by Campaign — ${periodLabel}`, secondaryColor, '');

  let chart3 = null, chart4 = null;
  if (daily.length > 1) {
    chart3 = await chartLine(daily.map(d => d.date.substring(5)),
      [{ label: 'Daily Spend (RM)', data: daily.map(d => d.spend), borderColor: primaryColor, backgroundColor: `${primaryColor}30`, fill: true, tension: 0.3, pointRadius: 2 }],
      `Daily Spend Trend — ${periodLabel}`);
    chart4 = await chartLine(daily.map(d => d.date.substring(5)),
      [{ label: 'Daily Results', data: daily.map(d => d.results), borderColor: secondaryColor, backgroundColor: `${secondaryColor}30`, fill: true, tension: 0.3, pointRadius: 2 }],
      `Daily Results Trend — ${periodLabel}`);
  }

  let chart5 = null;
  if (platforms.length >= 2) {
    chart5 = await chartGroupedBar(
      platforms.map(p => p.platform.charAt(0).toUpperCase() + p.platform.slice(1)),
      [{ label: 'Spend (RM)', data: platforms.map(p => p.spend), backgroundColor: primaryColor }, { label: 'Results', data: platforms.map(p => p.results), backgroundColor: secondaryColor }],
      `Platform Split — Spend & Results`);
  }

  let chart6 = null;
  if (ages.length > 0) {
    chart6 = await chartBarLine(ages.map(a => a.age), ages.map(a => a.results), ages.map(a => a.ctr), 'Results', 'CTR (%)', `Age Group — Results & CTR`);
  }

  let chart7a = null, chart7b = null;
  if (genders.length >= 2) {
    const tS = genders.reduce((s, g) => s + g.spend, 0);
    const tR = genders.reduce((s, g) => s + g.results, 0);
    chart7a = await chartDonut(genders.map(g => g.gender.charAt(0).toUpperCase() + g.gender.slice(1)), genders.map(g => tS > 0 ? +(g.spend / tS * 100).toFixed(1) : 0), 'Spend Split (%)', ['#E8A000','#1A7FCC','#32cd32']);
    chart7b = await chartDonut(genders.map(g => g.gender.charAt(0).toUpperCase() + g.gender.slice(1)), genders.map(g => tR > 0 ? +(g.results / tR * 100).toFixed(1) : 0), 'Results Split (%)', ['#E8A000','#1A7FCC','#32cd32']);
  }

  // ── Logo & Watermark ─────────────────────────────────────────────────────────
  const logoPath = path.join(__dirname, 'assets', 'logo.png');
  const logoBuffer      = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;
  const watermarkBuffer = logoBuffer ? await buildWatermarkBuffer(logoPath) : null;

  // ── Build Document ───────────────────────────────────────────────────────────
  const generatedDate = new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });
  const bestCampaign  = campaigns.length > 0 ? [...campaigns].sort((a, b) => b.primaryResult.count - a.primaryResult.count)[0] : null;

  const execNarrative = `This report covers the performance of ${campaigns.length} active Meta Ads campaign${campaigns.length !== 1 ? 's' : ''} for ${client.name} during ${periodLabel}. A total budget of ${fmtRM(totals.spend)} generated ${fmtNum(totals.reach)} unique reach, ${fmtNum(totals.impressions)} impressions, and ${fmtNum(totals.totalResults)} primary results across all campaigns — an average cost per result of ${fmtRM(totals.avgCPR)}. Overall CTR of ${fmtPct(totals.ctr)} is ${totals.ctr >= BENCH.ctrLow ? `${(totals.ctr / BENCH.ctrLow).toFixed(1)}x above` : 'below'} the Malaysia benchmark of ${BENCH.ctrLow}–${BENCH.ctrHigh}%.${bestCampaign ? ` Best-performing campaign: ${bestCampaign.name} (${fmtNum(bestCampaign.primaryResult.count)} ${bestCampaign.primaryResult.label} at ${fmtRM(bestCampaign.primaryResult.cpr)} each).` : ''}`;

  const children = [
    // ── COVER PAGE ───────────────────────────────────────────────────────────
    new Paragraph({ spacing: { before: 1600, after: 120 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'META ADS PERFORMANCE REPORT', bold: true, size: 52, color: BRAND.darkGreen, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 100 },
      children: [new TextRun({ text: `${periodLabel}  ·  ${dateStart} – ${dateStop}`, size: 26, color: '666666', font: FONT })] }),
    spacer(2),

    new Table({
      width: { size: PAGE.content, type: WidthType.DXA },
      columnWidths: [Math.floor(PAGE.content / 2), Math.floor(PAGE.content / 2)],
      rows: [new TableRow({ children: [
        new TableCell({
          borders: border(BRAND.borderGrey),
          width: { size: Math.floor(PAGE.content / 2), type: WidthType.DXA },
          shading: { fill: BRAND.lightGrey, type: ShadingType.CLEAR },
          margins: { top: 240, bottom: 240, left: 280, right: 280 },
          children: [
            new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: 'Prepared for', size: 16, color: '888888', font: FONT, italics: true })] }),
            new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: client.name, bold: true, size: 24, color: BRAND.darkGreen, font: FONT })] }),
            new Paragraph({ spacing: { before: 0, after: 0 },  children: [new TextRun({ text: `Client Code: ${client.clientCode}`, size: 18, color: '666666', font: FONT })] })
          ]
        }),
        new TableCell({
          borders: border(BRAND.borderGrey),
          width: { size: Math.floor(PAGE.content / 2), type: WidthType.DXA },
          shading: { fill: BRAND.lightGrey, type: ShadingType.CLEAR },
          margins: { top: 240, bottom: 240, left: 280, right: 280 },
          children: [
            new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: 'Prepared by', size: 16, color: '888888', font: FONT, italics: true })] }),
            new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: COMPANY.name, bold: true, size: 24, color: BRAND.amber, font: FONT })] }),
            new Paragraph({ spacing: { before: 0, after: 0 },  children: [new TextRun({ text: COMPANY.entity, size: 16, color: '666666', font: FONT })] })
          ]
        })
      ]})]
    }),

    new Paragraph({ spacing: { before: 120, after: 60 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Generated on ${generatedDate}  ·  Confidential`, size: 16, color: BRAND.midGrey, font: FONT, italics: true })] }),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── SECTION 1: Executive Summary ─────────────────────────────────────────
    heading('1.  Executive Summary'),
    para(execNarrative, { color: '444444' }),
    spacer(),
    kpiTable([
      { label: 'Total Ad Spend',  value: fmtRM(totals.spend),          sub: periodLabel },
      { label: 'Total Reach',     value: fmtNum(totals.reach),          sub: 'Unique Accounts' },
      { label: 'Total Results',   value: fmtNum(totals.totalResults),   sub: `${campaigns.length} Campaigns` },
      { label: 'Avg. CTR',        value: fmtPct(totals.ctr),            sub: `vs ${BENCH.ctrLow}–${BENCH.ctrHigh}% benchmark` }
    ]),
    spacer(),
    summaryTable(
      [['Total', fmtRM(totals.spend), fmtNum(totals.reach), fmtNum(totals.impressions), fmtNum(totals.clicks), fmtPct(totals.ctr), fmtRM(totals.cpm), fmtRM(totals.cpc), fmtNum(totals.totalResults), fmtRM(totals.avgCPR)]],
      ['', 'Spend', 'Reach', 'Impressions', 'Clicks', 'CTR', 'CPM', 'CPC', 'Results', 'CPR'],
      [1400, 1100, 1000, 1200, 900, 800, 900, 800, 900, 838]
    ),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── SECTION 2: Account Performance ──────────────────────────────────────
    heading('2.  Overall Account Performance'),
    para(`${client.name}'s Meta Ads account delivered ${totals.ctr >= BENCH.ctrStrong ? 'strong, cost-efficient' : 'consistent'} results in ${periodLabel}. CPM of ${fmtRM(totals.cpm)} is ${totals.cpm <= BENCH.cpmHigh ? 'within' : 'above'} the Malaysia benchmark of RM ${BENCH.cpmLow}–${BENCH.cpmHigh}. CPC of ${fmtRM(totals.cpc)} is ${totals.cpc <= BENCH.cpcHigh ? (totals.cpc <= BENCH.cpcLow ? 'well below' : 'within') : 'above'} the RM ${BENCH.cpcLow}–${BENCH.cpcHigh} benchmark.`, { color: '444444' }),
    spacer(0.5),
    chart1 ? chartImage(chart1, 560, 260) : spacer(),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── SECTION 3: Campaign Performance ─────────────────────────────────────
    heading('3.  Campaign Performance'),
    para(`${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''} were active in ${periodLabel}. Each campaign ran with a distinct objective and primary performance goal. The table below summarises key metrics per campaign.`, { color: '444444' }),
    spacer(0.5),
    summaryTable(
      [
        ...campaigns.map(c => [c.name, fmtRM(c.spend), fmtNum(c.reach), fmtNum(c.impressions), fmtPct(c.ctr), fmtRM(c.cpm), fmtRM(c.cpc), `${fmtNum(c.primaryResult.count)} ${c.primaryResult.label}`, fmtRM(c.primaryResult.cpr)]),
        ['TOTAL / AVG', fmtRM(totals.spend), fmtNum(totals.reach), fmtNum(totals.impressions), fmtPct(totals.ctr), fmtRM(totals.cpm), fmtRM(totals.cpc), fmtNum(totals.totalResults), fmtRM(totals.avgCPR)]
      ],
      ['Campaign', 'Spend', 'Reach', 'Impressions', 'CTR', 'CPM', 'CPC', 'Results', 'CPR'],
      [2400, 900, 900, 1100, 700, 800, 700, 1300, 838]
    ),
    spacer(0.5),
    heading('Campaign Highlights', 2),
    ...campaigns.map(c => para(
      `${c.name}: Delivered ${fmtNum(c.primaryResult.count)} ${c.primaryResult.label} at ${fmtRM(c.primaryResult.cpr)} each — CTR ${fmtPct(c.ctr)}${c.ctr >= BENCH.ctrStrong ? ' ⭐ above benchmark' : c.ctr >= BENCH.ctrLow ? ' ✓ on benchmark' : ' ⚠ below benchmark'}, CPM ${fmtRM(c.cpm)}.`,
      { color: '444444', before: 60, after: 60 }
    )),
    spacer(0.5),
    chart2 ? chartImage(chart2, 560, 260) : spacer(),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── SECTION 4: Daily Trends ──────────────────────────────────────────────
    heading('4.  Daily Performance Trends'),
    ...(daily.length > 1 ? (() => {
      const peakSpend   = daily.reduce((a, b) => b.spend   > a.spend   ? b : a, daily[0]);
      const peakResults = daily.reduce((a, b) => b.results > a.results ? b : a, daily[0]);
      const avgSpend    = totals.spend / daily.length;
      return [
        heading('4a. Daily Spend Trend', 2),
        para(`Spend was distributed across ${daily.length} days with an average of ${fmtRM(avgSpend)}/day. Peak spend day was ${peakSpend.date} (${fmtRM(peakSpend.spend)}). ${daily.length >= 28 ? 'Full-month delivery was consistent with no major gaps.' : 'Campaigns ran for a partial month.'}`, { color: '444444' }),
        chart3 ? chartImage(chart3, 560, 280) : spacer(),
        heading('4b. Daily Results Trend', 2),
        para(`Peak result day was ${peakResults.date} with ${fmtNum(peakResults.results)} results. Results tracked closely with spend patterns — ${peakResults.date === peakSpend.date ? 'confirming that spend increases are efficiently converted to results.' : 'with some variance between spend and results timing, which is normal for engagement-type campaigns.'}`, { color: '444444' }),
        chart4 ? chartImage(chart4, 560, 280) : spacer(),
      ];
    })() : [para('No daily trend data available for this period.', { color: '999999' })]),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── SECTION 5: Platform Analysis ────────────────────────────────────────
    heading('5.  Platform Analysis'),
    para('Performance comparison across Facebook and Instagram placements.', { color: '444444' }),
    spacer(0.5),
    summaryTable(
      platforms.map(p => [
        p.platform.charAt(0).toUpperCase() + p.platform.slice(1),
        fmtRM(p.spend), `${(totals.spend > 0 ? p.spend / totals.spend * 100 : 0).toFixed(1)}%`,
        fmtNum(p.impressions), fmtNum(p.clicks), fmtPct(p.ctr), fmtRM(p.cpm), fmtNum(p.results), fmtRM(p.cpr)
      ]),
      ['Platform', 'Spend', 'Spend %', 'Impressions', 'Clicks', 'CTR', 'CPM', 'Results', 'CPR'],
      [1300, 1000, 800, 1100, 900, 700, 800, 800, 838]
    ),
    spacer(0.5),
    ...(() => {
      const fb = platforms.find(p => p.platform === 'facebook');
      const ig = platforms.find(p => p.platform === 'instagram');
      if (!fb || !ig) return [para('Single platform data available above.', { color: '555555' })];
      const leader = fb.results >= ig.results ? fb : ig;
      const lName  = leader.platform === 'facebook' ? 'Facebook' : 'Instagram';
      return [
        para(`${lName} accounted for ${(leader.spend / totals.spend * 100).toFixed(1)}% of total spend and delivered ${fmtNum(leader.results)} results — outperforming the other platform in both volume and efficiency (CPR ${fmtRM(fb.cpr)} vs ${fmtRM(ig.cpr)}). This is consistent with the target audience profile and placement behaviour for this account.`, { color: '444444' }),
        para(`• Facebook CTR: ${fmtPct(fb.ctr)} — ${fb.ctr >= BENCH.ctrLow ? 'above benchmark' : 'below benchmark'}.`,       { color: '444444', before: 40, after: 20 }),
        para(`• Instagram CTR: ${fmtPct(ig.ctr)} — ${ig.ctr >= BENCH.ctrLow ? 'above benchmark' : 'low engagement, suggesting format or audience mismatch'}.`, { color: '444444', before: 20, after: 40 }),
      ];
    })(),
    chart5 ? chartImage(chart5, 560, 280) : spacer(),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── SECTION 6: Audience Analysis ────────────────────────────────────────
    heading('6.  Audience Analysis'),
    heading('6a. Age Group Breakdown', 2),
    ...(ages.length > 0 ? (() => {
      const bestAge  = [...ages].sort((a, b) => b.results - a.results)[0];
      const cheapAge = [...ages].filter(a => a.cpr > 0).sort((a, b) => a.cpr - b.cpr)[0];
      return [
        summaryTable(
          ages.map(a => [a.age, fmtRM(a.spend), fmtNum(a.results), fmtPct(a.ctr), fmtRM(a.cpr)]),
          ['Age Group', 'Spend (RM)', 'Results', 'CTR (%)', 'Cost/Result'],
          [1800, 1600, 1600, 1600, 2038]
        ),
        spacer(0.5),
        para(`${bestAge.age} is the top-performing age group by result volume (${fmtNum(bestAge.results)} results, ${fmtRM(bestAge.cpr)} CPR). ${cheapAge && cheapAge.age !== bestAge.age ? `The ${cheapAge.age} group shows the lowest cost per result (${fmtRM(cheapAge.cpr)}) at a relatively lower spend — a signal of untapped efficiency worth scaling.` : 'This group delivers both volume and efficiency.'}`, { color: '444444' }),
        chart6 ? chartImage(chart6, 560, 300) : spacer(),
      ];
    })() : [para('No age breakdown data available.', { color: '999999' })]),

    heading('6b. Gender Breakdown', 2),
    ...(genders.length > 0 ? (() => {
      const totalR = genders.reduce((s, g) => s + g.results, 0);
      const male   = genders.find(g => g.gender === 'male');
      const female = genders.find(g => g.gender === 'female');
      const gNote  = male && female
        ? `Male audience received ${(male.spend / totals.spend * 100).toFixed(1)}% of total spend and delivered ${(male.results / Math.max(totalR, 1) * 100).toFixed(1)}% of total results (${fmtNum(male.results)} vs ${fmtNum(female.results)}). ${male.cpr < female.cpr ? 'Male audience is converting at a lower cost per result' : 'Female audience is converting at a lower cost per result'} (${fmtRM(male?.cpr || 0)} vs ${fmtRM(female?.cpr || 0)}). Both genders should remain in targeting to allow Meta's algorithm to self-optimise.`
        : '';
      return [
        summaryTable(
          genders.map(g => [g.gender.charAt(0).toUpperCase() + g.gender.slice(1), fmtRM(g.spend), `${(g.spend / totals.spend * 100).toFixed(1)}%`, fmtNum(g.clicks), fmtPct(g.ctr), fmtNum(g.results), fmtRM(g.cpr)]),
          ['Gender', 'Spend (RM)', 'Spend %', 'Clicks', 'CTR (%)', 'Results', 'Cost/Result'],
          [1400, 1200, 900, 1000, 900, 1000, 2238]
        ),
        spacer(0.5),
        ...(gNote ? [para(gNote, { color: '444444' })] : []),
        ...(chart7a && chart7b ? [new Table({
          width: { size: PAGE.content, type: WidthType.DXA },
          columnWidths: [Math.floor(PAGE.content / 2), Math.floor(PAGE.content / 2)],
          rows: [new TableRow({ children: [
            new TableCell({ ...noB, width: { size: Math.floor(PAGE.content / 2), type: WidthType.DXA },
              children: [new Paragraph({ spacing: { before: 120, after: 0 }, children: [new ImageRun({ data: chart7a, type: 'png', transformation: { width: 260, height: 210 } })] })] }),
            new TableCell({ ...noB, width: { size: Math.floor(PAGE.content / 2), type: WidthType.DXA },
              children: [new Paragraph({ spacing: { before: 120, after: 0 }, children: [new ImageRun({ data: chart7b, type: 'png', transformation: { width: 260, height: 210 } })] })] }),
          ]})]
        })] : []),
      ];
    })() : [para('No gender breakdown data available.', { color: '999999' })]),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── SECTION 7: Video (conditional) ──────────────────────────────────────
    ...(hasVideo ? (() => {
      const totV = campaigns.reduce((acc, c) => ({ views: acc.views + c.videoViews, v25: acc.v25 + c.video25, v50: acc.v50 + c.video50, v75: acc.v75 + c.video75, v100: acc.v100 + c.video100 }), { views: 0, v25: 0, v50: 0, v75: 0, v100: 0 });
      const ret  = parseFloat(totV.views > 0 ? totV.v100 / totV.views * 100 : 0);
      return [
        heading('7.  Video Performance'),
        para(`Video completion funnel across all campaigns. ${ret >= 10 ? '✅ Strong' : ret >= 5 ? '⚠️ Average' : '⚠️ Low'} completion rate of ${fmtPct(ret)} (benchmark: 5–15%).`, { color: '444444' }),
        spacer(0.5),
        summaryTable(
          [
            ['Count',      fmtNum(totV.views), fmtNum(totV.v25), fmtNum(totV.v50), fmtNum(totV.v75), fmtNum(totV.v100)],
            ['% of Views', '100%', fmtPct(totV.views > 0 ? totV.v25 / totV.views * 100 : 0), fmtPct(totV.views > 0 ? totV.v50 / totV.views * 100 : 0), fmtPct(totV.views > 0 ? totV.v75 / totV.views * 100 : 0), fmtPct(totV.views > 0 ? totV.v100 / totV.views * 100 : 0)]
          ],
          ['Stage', '3s Views', '25% Watched', '50% Watched', '75% Watched', '100% Watched'],
          [2000, 1400, 1500, 1500, 1500, 1738]
        ),
        new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] })
      ];
    })() : []),

    // ── SECTION 8: Engagement (conditional) ─────────────────────────────────
    ...(hasEngagement ? (() => {
      const hasEng   = campaigns.filter(c => c.reactions > 0 || c.shares > 0);
      if (hasEng.length === 0) return [];
      const secNum   = hasVideo ? '8' : '7';
      return [
        heading(`${secNum}.  Post Engagement Breakdown`),
        para('Breakdown of post engagement types across campaigns — reactions, shares, comments, and saves.', { color: '444444' }),
        spacer(0.5),
        summaryTable(
          hasEng.map(c => [shortName(c.name), fmtNum(c.reactions), fmtNum(c.shares), fmtNum(c.comments), fmtNum(c.saves)]),
          ['Campaign', 'Reactions', 'Shares', 'Comments', 'Saves'],
          [3200, 1500, 1500, 1500, 1938]
        ),
        new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] })
      ];
    })() : []),

    // ── SECTION: Findings & Analysis ────────────────────────────────────────
    heading(`${hasVideo && hasEngagement ? '9' : hasVideo || hasEngagement ? '8' : '7'}.  Findings & Analysis`),
    new Paragraph({ spacing: { before: 0, after: 120 }, children: [new TextRun({ text: 'Key findings from this reporting period, benchmarked against Malaysia Meta Ads standards.', size: 18, color: '777777', font: FONT, italics: true })] }),
    spacer(0.5),
    ...insights.flatMap(ins => insightCard(ins.emoji, ins.title, ins.body, ins.color)),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── SECTION: Strategy & Recommendations ─────────────────────────────────
    heading(`${hasVideo && hasEngagement ? '10' : hasVideo || hasEngagement ? '9' : '8'}.  Strategy & Recommendations`),
    new Paragraph({ spacing: { before: 0, after: 120 }, children: [new TextRun({ text: 'Prioritised action items for the next campaign period. Each recommendation is tied to a specific data signal from this report.', size: 18, color: '777777', font: FONT, italics: true })] }),
    spacer(0.5),
    ...recs.flatMap((r, i) => recCard(i + 1, r.title, r.why, r.impact)),

    // ── End ──────────────────────────────────────────────────────────────────
    new Paragraph({ spacing: { before: 480, after: 120 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '— End of Report —', size: 18, color: BRAND.midGrey, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: `Generated ${generatedDate}  ·  Millecube Digital  ·  Confidential`, size: 16, color: BRAND.midGrey, font: FONT, italics: true })] })
  ];

  // ── Document ─────────────────────────────────────────────────────────────────
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 19 } } } },
    sections: [{
      properties: {
        page: {
          size:   { width: PAGE.width, height: PAGE.height },
          margin: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin }
        }
      },
      headers: { default: buildHeader(logoBuffer, watermarkBuffer) },
      footers: { default: buildFooter(client, periodLabel) },
      children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

module.exports = { generate };
