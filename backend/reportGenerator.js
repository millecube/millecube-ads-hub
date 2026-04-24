/**
 * Millecube Digital — Meta Ads Report Generator
 * Produces a professional Word (.docx) report from Meta Ads Manager API data
 * Brand: #07503c headers | #32cd32 accents | #6bc71f secondary
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, HeadingLevel, BorderStyle,
  WidthType, ShadingType, VerticalAlign, LevelFormat, PageNumber,
  TabStopType, TabStopPosition
} = require('docx');
const fs = require('fs-extra');
const path = require('path');

// ── Millecube Brand ────────────────────────────────────────────────────────────
const BRAND = {
  darkGreen:  '07503c',
  green:      '32cd32',
  lightGreen: '6bc71f',
  white:      'ffffff',
  black:      '000000',
  lightGrey:  'F2F4F3',
  midGrey:    'CCCCCC'
};

const PAGE = {
  width:  11906,  // A4
  height: 16838,
  margin: 1134,   // ~0.79 inch
  get content() { return this.width - (this.margin * 2); } // 9638
};

// ── Utilities ──────────────────────────────────────────────────────────────────
function fmtRM(v)   { return `RM ${parseFloat(v || 0).toFixed(2)}`; }
function fmtNum(v)  { return parseFloat(v || 0).toLocaleString('en-MY'); }
function fmtPct(v)  { return `${parseFloat(v || 0).toFixed(2)}%`; }

function extractAction(actions, actionType) {
  if (!actions) return 0;
  const found = actions.find(a => a.action_type === actionType);
  return found ? parseFloat(found.value || 0) : 0;
}

function extractCostPerAction(costArr, actionType) {
  if (!costArr) return 0;
  const found = costArr.find(a => a.action_type === actionType);
  return found ? parseFloat(found.value || 0) : 0;
}

function getCampaignGoal(campaignName, goalPatterns) {
  const name = (campaignName || '').toUpperCase();
  for (const { pattern, goal } of (goalPatterns || [])) {
    if (name.includes(pattern.toUpperCase())) return goal;
  }
  // Defaults
  if (name.includes('ENG POST') || name.includes('POST BOOST')) return 'post_engagement';
  if (name.includes('AWARENESS') || name.includes('BRAND'))     return 'reach';
  if (name.includes('LEAD'))                                    return 'leads';
  return 'whatsapp'; // default
}

function getPrimaryMetric(row, goal) {
  const actions = row.actions || [];
  const spend   = parseFloat(row.spend || 0);
  switch (goal) {
    case 'whatsapp':
      return {
        label:   'WA Conversations',
        count:   extractAction(actions, 'onsite_conversion.messaging_first_reply'),
        costPer: spend / Math.max(extractAction(actions, 'onsite_conversion.messaging_first_reply'), 1)
      };
    case 'post_engagement':
      return {
        label:   'Post Engagements',
        count:   extractAction(actions, 'post_engagement'),
        costPer: spend / Math.max(extractAction(actions, 'post_engagement'), 1)
      };
    case 'reach':
      return {
        label:   'Reach',
        count:   parseFloat(row.reach || 0),
        costPer: spend / Math.max(parseFloat(row.impressions || 1), 1) * 1000 // CPM
      };
    case 'leads':
      return {
        label:   'Leads',
        count:   extractAction(actions, 'lead'),
        costPer: spend / Math.max(extractAction(actions, 'lead'), 1)
      };
    default:
      return { label: 'Results', count: 0, costPer: 0 };
  }
}

// ── Data Processing ────────────────────────────────────────────────────────────
function processData(rawData, client) {
  const { platformDay, ageGender } = rawData;
  const goalPatterns = client.campaignGoals || [];

  // Campaign summary
  const campaignMap = {};
  for (const row of platformDay) {
    const key = row.campaign_name;
    if (!campaignMap[key]) {
      campaignMap[key] = {
        name: key,
        objective: row.objective,
        goal: getCampaignGoal(key, goalPatterns),
        spend: 0, reach: 0, impressions: 0, clicks: 0,
        waConvos: 0, postEngagements: 0, leads: 0,
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
    c.leads       += extractAction(row.actions, 'lead');
    c.videoViews  += extractAction(row.video_30_sec_watched_actions, 'video_view');
    c.video25     += extractAction(row.video_p25_watched_actions, 'video_view');
    c.video50     += extractAction(row.video_p50_watched_actions, 'video_view');
    c.video75     += extractAction(row.video_p75_watched_actions, 'video_view');
    c.video100    += extractAction(row.video_p100_watched_actions, 'video_view');
  }
  const campaigns = Object.values(campaignMap).map(c => ({
    ...c,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions * 100) : 0,
    cpm: c.impressions > 0 ? (c.spend / c.impressions * 1000) : 0,
    cpc: c.clicks > 0 ? (c.spend / c.clicks) : 0,
    primaryMetric: getPrimaryMetric(c, c.goal)
  }));

  // Overall totals
  const totals = campaigns.reduce((acc, c) => {
    acc.spend       += c.spend;
    acc.reach       += c.reach;
    acc.impressions += c.impressions;
    acc.clicks      += c.clicks;
    acc.waConvos    += c.waConvos;
    acc.postEngagements += c.postEngagements;
    return acc;
  }, { spend: 0, reach: 0, impressions: 0, clicks: 0, waConvos: 0, postEngagements: 0 });
  totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions * 100) : 0;
  totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions * 1000) : 0;
  totals.cpc = totals.clicks > 0 ? (totals.spend / totals.clicks) : 0;
  totals.avgCostPerConvo = totals.waConvos > 0 ? (totals.spend / totals.waConvos) : 0;

  // Platform breakdown
  const platformMap = {};
  for (const row of platformDay) {
    const key = row.publisher_platform || 'unknown';
    if (!platformMap[key]) platformMap[key] = { platform: key, spend: 0, impressions: 0, clicks: 0, waConvos: 0 };
    const p = platformMap[key];
    p.spend += parseFloat(row.spend || 0);
    p.impressions += parseFloat(row.impressions || 0);
    p.clicks += parseFloat(row.clicks || 0);
    p.waConvos += extractAction(row.actions, 'onsite_conversion.messaging_first_reply');
  }
  const platforms = Object.values(platformMap).map(p => ({
    ...p,
    ctr: p.impressions > 0 ? p.clicks / p.impressions * 100 : 0,
    cpm: p.impressions > 0 ? p.spend / p.impressions * 1000 : 0
  }));

  // Daily trend
  const dailyMap = {};
  for (const row of platformDay) {
    const day = row.date_start;
    if (!day) continue;
    if (!dailyMap[day]) dailyMap[day] = { date: day, spend: 0, waConvos: 0 };
    dailyMap[day].spend += parseFloat(row.spend || 0);
    dailyMap[day].waConvos += extractAction(row.actions, 'onsite_conversion.messaging_first_reply');
  }
  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // Age breakdown
  const ageMap = {};
  for (const row of ageGender) {
    const age = row.age;
    if (!ageMap[age]) ageMap[age] = { age, spend: 0, clicks: 0, impressions: 0, waConvos: 0 };
    ageMap[age].spend += parseFloat(row.spend || 0);
    ageMap[age].clicks += parseFloat(row.clicks || 0);
    ageMap[age].impressions += parseFloat(row.impressions || 0);
    ageMap[age].waConvos += extractAction(row.actions, 'onsite_conversion.messaging_first_reply');
  }
  const ages = Object.values(ageMap).map(a => ({
    ...a,
    ctr: a.impressions > 0 ? a.clicks / a.impressions * 100 : 0,
    costPerConvo: a.waConvos > 0 ? a.spend / a.waConvos : 0
  }));

  // Gender breakdown
  const genderMap = {};
  for (const row of ageGender) {
    const g = row.gender;
    if (!genderMap[g]) genderMap[g] = { gender: g, spend: 0, clicks: 0, impressions: 0, waConvos: 0 };
    genderMap[g].spend += parseFloat(row.spend || 0);
    genderMap[g].clicks += parseFloat(row.clicks || 0);
    genderMap[g].impressions += parseFloat(row.impressions || 0);
    genderMap[g].waConvos += extractAction(row.actions, 'onsite_conversion.messaging_first_reply');
  }
  const genders = Object.values(genderMap).map(g => ({
    ...g,
    ctr: g.impressions > 0 ? g.clicks / g.impressions * 100 : 0,
    costPerConvo: g.waConvos > 0 ? g.spend / g.waConvos : 0
  }));

  // Video data
  const hasVideo = campaigns.some(c => c.videoViews > 0);

  return { campaigns, totals, platforms, daily, ages, genders, hasVideo };
}

// ── Word Document Builder ──────────────────────────────────────────────────────
function border(color = BRAND.midGrey) {
  const b = { style: BorderStyle.SINGLE, size: 1, color };
  return { top: b, bottom: b, left: b, right: b };
}

function cell(text, opts = {}) {
  return new TableCell({
    borders: border(opts.borderColor),
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({
        text: String(text ?? ''),
        bold: !!opts.bold,
        color: opts.color || BRAND.black,
        size: opts.size || 18,
        font: 'Calibri'
      })]
    })]
  });
}

function heading(text, level = 1) {
  const sizes = { 1: 32, 2: 26, 3: 22 };
  return new Paragraph({
    spacing: { before: level === 1 ? 360 : 240, after: 120 },
    border: level === 1 ? {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND.green, space: 4 }
    } : undefined,
    children: [new TextRun({
      text,
      bold: true,
      size: sizes[level] || 22,
      color: BRAND.darkGreen,
      font: 'Calibri'
    })]
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    alignment: opts.align,
    children: [new TextRun({
      text,
      size: opts.size || 18,
      color: opts.color || BRAND.black,
      bold: opts.bold,
      italics: opts.italic,
      font: 'Calibri'
    })]
  });
}

function kpiTable(kpis) {
  const colW = Math.floor(PAGE.content / kpis.length);
  return new Table({
    width: { size: PAGE.content, type: WidthType.DXA },
    columnWidths: kpis.map(() => colW),
    rows: [
      new TableRow({
        children: kpis.map(k => new TableCell({
          borders: border(BRAND.darkGreen),
          width: { size: colW, type: WidthType.DXA },
          shading: { fill: BRAND.darkGreen, type: ShadingType.CLEAR },
          margins: { top: 180, bottom: 180, left: 160, right: 160 },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: k.value, bold: true, size: 32, color: BRAND.green, font: 'Calibri' })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: k.label, size: 16, color: 'cceecc', font: 'Calibri' })] })
          ]
        }))
      })
    ]
  });
}

function campaignTable(campaigns) {
  const cols = [3200, 1200, 1200, 1000, 800, 900, 900, 1400];
  const headers = ['Campaign', 'Spend', 'Impressions', 'Clicks', 'CTR', 'CPM', 'CPC', 'Primary Result'];
  return new Table({
    width: { size: PAGE.content, type: WidthType.DXA },
    columnWidths: cols,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { bg: BRAND.darkGreen, color: BRAND.white, bold: true, width: cols[i], align: i > 0 ? AlignmentType.RIGHT : AlignmentType.LEFT }))
      }),
      ...campaigns.map((c, rowIdx) => new TableRow({
        children: [
          cell(c.name, { width: cols[0], bg: rowIdx % 2 === 1 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtRM(c.spend), { width: cols[1], align: AlignmentType.RIGHT, bg: rowIdx % 2 === 1 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtNum(c.impressions), { width: cols[2], align: AlignmentType.RIGHT, bg: rowIdx % 2 === 1 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtNum(c.clicks), { width: cols[3], align: AlignmentType.RIGHT, bg: rowIdx % 2 === 1 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtPct(c.ctr), { width: cols[4], align: AlignmentType.RIGHT, bg: rowIdx % 2 === 1 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtRM(c.cpm), { width: cols[5], align: AlignmentType.RIGHT, bg: rowIdx % 2 === 1 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtRM(c.cpc), { width: cols[6], align: AlignmentType.RIGHT, bg: rowIdx % 2 === 1 ? 'E8F5E9' : 'ffffff' }),
          cell(
            `${fmtNum(c.primaryMetric.count)} ${c.primaryMetric.label.split(' ')[0]}\n@ ${fmtRM(c.primaryMetric.costPer)}/ea`,
            { width: cols[7], align: AlignmentType.RIGHT, bg: rowIdx % 2 === 1 ? 'E8F5E9' : 'ffffff' }
          )
        ]
      }))
    ]
  });
}

function platformTable(platforms) {
  const cols = [2400, 1400, 1500, 1200, 900, 1200, 1000];
  const headers = ['Platform', 'Spend', 'Impressions', 'Clicks', 'CTR', 'CPM', 'WA Convos'];
  return new Table({
    width: { size: PAGE.content, type: WidthType.DXA },
    columnWidths: cols,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { bg: BRAND.darkGreen, color: BRAND.white, bold: true, width: cols[i] })) }),
      ...platforms.map((p, idx) => new TableRow({
        children: [
          cell(p.platform.charAt(0).toUpperCase() + p.platform.slice(1), { width: cols[0], bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtRM(p.spend), { width: cols[1], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtNum(p.impressions), { width: cols[2], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtNum(p.clicks), { width: cols[3], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtPct(p.ctr), { width: cols[4], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtRM(p.cpm), { width: cols[5], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtNum(p.waConvos), { width: cols[6], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' })
        ]
      }))
    ]
  });
}

function audienceTable(rows, type) {
  const cols = type === 'age'
    ? [2000, 1400, 1500, 1200, 900, 1500, 1100]
    : [2000, 1400, 1500, 1200, 900, 1500, 1100];
  const headers = [type === 'age' ? 'Age Band' : 'Gender', 'Spend', 'Impressions', 'Clicks', 'CTR', 'WA Convos', 'Cost/Conv'];
  return new Table({
    width: { size: PAGE.content, type: WidthType.DXA },
    columnWidths: cols,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { bg: BRAND.darkGreen, color: BRAND.white, bold: true, width: cols[i] })) }),
      ...rows.map((r, idx) => new TableRow({
        children: [
          cell(type === 'age' ? r.age : r.gender, { width: cols[0], bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtRM(r.spend), { width: cols[1], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtNum(r.impressions), { width: cols[2], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtNum(r.clicks), { width: cols[3], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtPct(r.ctr), { width: cols[4], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtNum(r.waConvos), { width: cols[5], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' }),
          cell(fmtRM(r.costPerConvo), { width: cols[6], align: AlignmentType.RIGHT, bg: idx % 2 ? 'E8F5E9' : 'ffffff' })
        ]
      }))
    ]
  });
}

function insightCard(title, body) {
  return [
    new Paragraph({
      spacing: { before: 160, after: 40 },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: BRAND.green, space: 8 } },
      indent: { left: 200 },
      children: [new TextRun({ text: `▸  ${title}`, bold: true, size: 20, color: BRAND.darkGreen, font: 'Calibri' })]
    }),
    new Paragraph({
      indent: { left: 400 },
      spacing: { before: 0, after: 100 },
      children: [new TextRun({ text: body, size: 18, color: '333333', font: 'Calibri' })]
    })
  ];
}

function recCard(num, what, why, impact) {
  return [
    new Paragraph({
      spacing: { before: 160, after: 40 },
      children: [new TextRun({ text: `${num}. ${what}`, bold: true, size: 20, color: BRAND.darkGreen, font: 'Calibri' })]
    }),
    new Paragraph({
      indent: { left: 400 },
      spacing: { before: 0, after: 40 },
      children: [new TextRun({ text: `Why: ${why}`, size: 18, color: '555555', font: 'Calibri' })]
    }),
    new Paragraph({
      indent: { left: 400 },
      spacing: { before: 0, after: 100 },
      children: [new TextRun({ text: `Expected impact: ${impact}`, size: 18, color: BRAND.lightGreen, font: 'Calibri' })]
    })
  ];
}

// ── Generate Insights ──────────────────────────────────────────────────────────
function generateInsights(data, client) {
  const { campaigns, totals, ages, genders } = data;
  const insights = [];

  // Top performer
  const sorted = [...campaigns].sort((a, b) => {
    const aM = a.primaryMetric.count; const bM = b.primaryMetric.count;
    return bM - aM;
  });
  if (sorted[0]) {
    insights.push({
      title: `Top Performer: ${sorted[0].name}`,
      body: `Generated ${fmtNum(sorted[0].primaryMetric.count)} ${sorted[0].primaryMetric.label} at ${fmtRM(sorted[0].primaryMetric.costPer)} each — the strongest result driver this period.`
    });
  }

  // CTR benchmark
  const benchmarkCTR = 0.8;
  const strongCTR = campaigns.filter(c => c.ctr >= 2.0);
  if (strongCTR.length > 0) {
    insights.push({
      title: 'Strong Click-Through Rate',
      body: `${strongCTR.length} campaign(s) achieved CTR above 2.0% (Malaysia benchmark: 0.8–2.5%). ${strongCTR[0].name} led at ${fmtPct(strongCTR[0].ctr)} — a signal that creative and targeting are well-aligned.`
    });
  }

  // Audience signal
  const bestAge = [...ages].sort((a, b) => b.waConvos - a.waConvos)[0];
  if (bestAge && bestAge.waConvos > 0) {
    insights.push({
      title: `Strongest Audience Segment: ${bestAge.age}`,
      body: `The ${bestAge.age} age group generated the most WA conversations (${fmtNum(bestAge.waConvos)}) at ${fmtRM(bestAge.costPerConvo)} per conversation — confirm this segment for future scaling.`
    });
  }

  // Gender signal
  const bestGender = [...genders].sort((a, b) => b.waConvos - a.waConvos)[0];
  if (bestGender) {
    insights.push({
      title: `Gender Performance Signal`,
      body: `${bestGender.gender === 'female' ? 'Female' : 'Male'} audience drove more WA conversations (${fmtNum(bestGender.waConvos)}) this period. ${fmtRM(bestGender.costPerConvo)} per conversation vs ${fmtRM(genders.find(g => g.gender !== bestGender.gender)?.costPerConvo || 0)} for the opposing gender.`
    });
  }

  return insights;
}

function generateRecommendations(data) {
  const { campaigns, totals, platforms } = data;
  const recs = [];

  const topCampaign = [...campaigns].sort((a, b) => b.primaryMetric.count - a.primaryMetric.count)[0];
  if (topCampaign) {
    recs.push({
      what: `Scale budget on ${topCampaign.name}`,
      why: `This campaign has the strongest result volume at competitive cost`,
      impact: 'More conversions without increasing CPConv'
    });
  }

  const highCPM = campaigns.filter(c => c.cpm > 25);
  if (highCPM.length > 0) {
    recs.push({
      what: 'Refresh creatives in high-CPM campaigns',
      why: `${highCPM.map(c => c.name).join(', ')} show CPM above RM25 — a typical creative fatigue signal`,
      impact: 'Lower CPM, improved delivery efficiency'
    });
  }

  const lowCTR = campaigns.filter(c => c.ctr < 0.8 && c.spend > 0);
  if (lowCTR.length > 0) {
    recs.push({
      what: 'A/B test ad copy on underperforming campaigns',
      why: `${lowCTR.map(c => c.name).join(', ')} CTR below 0.8% Malaysia benchmark`,
      impact: 'Improved click-through leads to lower CPC and better funnel efficiency'
    });
  }

  const fbPlatform = platforms.find(p => p.platform === 'facebook');
  const igPlatform = platforms.find(p => p.platform === 'instagram');
  if (fbPlatform && igPlatform) {
    const betterPlatform = fbPlatform.waConvos >= igPlatform.waConvos ? 'Facebook' : 'Instagram';
    recs.push({
      what: `Shift more budget toward ${betterPlatform}`,
      why: `${betterPlatform} is generating more WA conversations relative to spend`,
      impact: 'Higher overall result volume within same budget envelope'
    });
  }

  recs.push({
    what: 'Continue monthly retargeting campaigns',
    why: 'Warm audiences consistently convert at lower cost than cold traffic',
    impact: 'Reduce overall CPConv by 15–30% when retargeting budget is sustained'
  });

  return recs;
}

// ── Main Generate Function ─────────────────────────────────────────────────────
async function generate({ client, rawData, dateStart, dateStop, periodLabel, outputPath }) {
  const data = processData(rawData, client);
  const { campaigns, totals, platforms, daily, ages, genders, hasVideo } = data;
  const insights = generateInsights(data, client);
  const recs = generateRecommendations(data);

  const now = new Date();
  const generatedDate = now.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });

  const children = [
    // ── Cover ──────────────────────────────────────────────────────────────────
    new Paragraph({
      spacing: { before: 1440, after: 480 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: client.name, bold: true, size: 52, color: BRAND.darkGreen, font: 'Calibri' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      children: [new TextRun({ text: 'Meta Ads Performance Report', size: 36, color: BRAND.green, font: 'Calibri' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 100 },
      children: [new TextRun({ text: periodLabel, size: 26, color: '555555', font: 'Calibri' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 100 },
      children: [new TextRun({ text: `Reporting period: ${dateStart} – ${dateStop}`, size: 20, color: '777777', font: 'Calibri' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: `Client Code: ${client.clientCode}`, size: 20, bold: true, color: BRAND.darkGreen, font: 'Calibri' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: `Prepared by Millecube Digital  ·  Generated ${generatedDate}`, size: 18, color: '999999', font: 'Calibri' })]
    }),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── S1: Executive Summary ──────────────────────────────────────────────────
    heading('01  |  Executive Summary'),
    para('This report summarises Meta Ads performance for the selected reporting period. All figures are in Malaysian Ringgit (RM) unless otherwise stated.', { color: '555555', italic: true }),
    new Paragraph({ spacing: { before: 200, after: 200 }, children: [new TextRun('')] }),
    kpiTable([
      { label: 'Total Spend', value: fmtRM(totals.spend) },
      { label: 'WA Conversations', value: fmtNum(totals.waConvos) },
      { label: 'Avg CTR', value: fmtPct(totals.ctr) },
      { label: 'Avg Cost / Conv', value: fmtRM(totals.avgCostPerConvo) }
    ]),
    new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun('')] }),
    para(`Total ad spend of ${fmtRM(totals.spend)} generated ${fmtNum(totals.waConvos)} WhatsApp conversations across all campaigns. The overall CTR of ${fmtPct(totals.ctr)} is ${totals.ctr >= 0.8 ? 'within' : 'below'} the Malaysia benchmark range of 0.8–2.5%, with an average CPM of ${fmtRM(totals.cpm)} and CPC of ${fmtRM(totals.cpc)}.`),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── S2: Overall Account Performance ───────────────────────────────────────
    heading('02  |  Overall Account Performance'),
    new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun('', { size: 18 })] }),
    new Table({
      width: { size: PAGE.content, type: WidthType.DXA },
      columnWidths: [2200, 1200, 1500, 1200, 900, 900, 900, 838],
      rows: [
        new TableRow({ tableHeader: true, children: ['Metric','Spend','Impressions','Reach','Clicks','CTR','CPM','CPC'].map((h,i) => cell(h, { bg: BRAND.darkGreen, color: BRAND.white, bold: true, width: [2200,1200,1500,1200,900,900,900,838][i] })) }),
        new TableRow({ children: [
          cell('Totals', { width: 2200, bold: true }),
          cell(fmtRM(totals.spend), { width: 1200, align: AlignmentType.RIGHT }),
          cell(fmtNum(totals.impressions), { width: 1500, align: AlignmentType.RIGHT }),
          cell(fmtNum(totals.reach), { width: 1200, align: AlignmentType.RIGHT }),
          cell(fmtNum(totals.clicks), { width: 900, align: AlignmentType.RIGHT }),
          cell(fmtPct(totals.ctr), { width: 900, align: AlignmentType.RIGHT }),
          cell(fmtRM(totals.cpm), { width: 900, align: AlignmentType.RIGHT }),
          cell(fmtRM(totals.cpc), { width: 838, align: AlignmentType.RIGHT })
        ]})
      ]
    }),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── S3: Campaign Performance ───────────────────────────────────────────────
    heading('03  |  Campaign Performance'),
    para('All active campaigns for the reporting period. Best performer per metric highlighted in table.'),
    new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun('')] }),
    campaignTable(campaigns),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── S4: Daily Trends ───────────────────────────────────────────────────────
    heading('04  |  Daily Performance Trends'),
    para('Spend and WA conversation volume by day. Note any peaks aligned to creative launches, budget adjustments, or seasonal events.'),
    new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun('')] }),
    ...(daily.length > 0 ? [
      heading('Daily Spend Summary', 2),
      new Table({
        width: { size: PAGE.content, type: WidthType.DXA },
        columnWidths: [2000, 1500, 1500, 1500, 1500, 1638],
        rows: [
          new TableRow({ tableHeader: true, children: ['Date Range','Peak Spend Day','Lowest Spend Day','Peak Convos Day','Avg Daily Spend','Avg Daily Convos'].map((h,i) => cell(h, { bg: BRAND.darkGreen, color: BRAND.white, bold: true, width: [2000,1500,1500,1500,1500,1638][i] })) }),
          new TableRow({ children: [
            cell(`${daily[0]?.date} – ${daily[daily.length-1]?.date}`, { width: 2000 }),
            cell(daily.reduce((a, b) => b.spend > a.spend ? b : a, daily[0])?.date || '-', { width: 1500, align: AlignmentType.CENTER }),
            cell(daily.reduce((a, b) => b.spend < a.spend ? b : a, daily[0])?.date || '-', { width: 1500, align: AlignmentType.CENTER }),
            cell(daily.reduce((a, b) => b.waConvos > a.waConvos ? b : a, daily[0])?.date || '-', { width: 1500, align: AlignmentType.CENTER }),
            cell(fmtRM(totals.spend / daily.length), { width: 1500, align: AlignmentType.RIGHT }),
            cell(fmtNum(totals.waConvos / daily.length), { width: 1638, align: AlignmentType.RIGHT })
          ]})
        ]
      })
    ] : [para('No daily data available for this period.', { color: '999999' })]),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── S5: Platform Analysis ──────────────────────────────────────────────────
    heading('05  |  Platform Analysis'),
    para('Performance comparison across Facebook and Instagram placements.'),
    new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun('')] }),
    platformTable(platforms),
    new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun('')] }),
    ...(platforms.length >= 2 ? (() => {
      const fb = platforms.find(p => p.platform === 'facebook');
      const ig = platforms.find(p => p.platform === 'instagram');
      if (!fb || !ig) return [para('Platform data available above.', { color: '555555' })];
      const leader = fb.waConvos >= ig.waConvos ? 'Facebook' : 'Instagram';
      return [para(`${leader} is driving more WA conversations this period. ${fb.spend > ig.spend ? 'Facebook' : 'Instagram'} received more of the budget — consider shifting allocation toward the higher-converting platform if CPConv allows.`, { color: '444444' })];
    })() : []),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── S6: Audience Analysis ──────────────────────────────────────────────────
    heading('06  |  Audience Analysis'),
    heading('6a — Age Breakdown', 2),
    audienceTable(ages, 'age'),
    new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun('')] }),
    heading('6b — Gender Breakdown', 2),
    audienceTable(genders, 'gender'),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── S7: Video Performance (conditional) ───────────────────────────────────
    ...(hasVideo ? [
      heading('07  |  Video Performance'),
      para('Video completion funnel across all campaigns with video content.'),
      new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun('')] }),
      (() => {
        const totV = campaigns.reduce((acc, c) => ({
          views: acc.views + c.videoViews, v25: acc.v25 + c.video25,
          v50: acc.v50 + c.video50, v75: acc.v75 + c.video75, v100: acc.v100 + c.video100
        }), { views: 0, v25: 0, v50: 0, v75: 0, v100: 0 });
        const cols = [2500, 1500, 1500, 1500, 1500, 1138];
        return new Table({
          width: { size: PAGE.content, type: WidthType.DXA },
          columnWidths: cols,
          rows: [
            new TableRow({ tableHeader: true, children: ['Stage','Views','25% Watched','50% Watched','75% Watched','100% Watched'].map((h,i) => cell(h, { bg: BRAND.darkGreen, color: BRAND.white, bold: true, width: cols[i] })) }),
            new TableRow({ children: [
              cell('Count', { width: cols[0], bold: true }),
              cell(fmtNum(totV.views), { width: cols[1], align: AlignmentType.RIGHT }),
              cell(fmtNum(totV.v25), { width: cols[2], align: AlignmentType.RIGHT }),
              cell(fmtNum(totV.v50), { width: cols[3], align: AlignmentType.RIGHT }),
              cell(fmtNum(totV.v75), { width: cols[4], align: AlignmentType.RIGHT }),
              cell(fmtNum(totV.v100), { width: cols[5], align: AlignmentType.RIGHT })
            ]}),
            new TableRow({ children: [
              cell('% of Views', { width: cols[0], bold: true }),
              cell('100%', { width: cols[1], align: AlignmentType.RIGHT }),
              cell(fmtPct(totV.views > 0 ? totV.v25 / totV.views * 100 : 0), { width: cols[2], align: AlignmentType.RIGHT }),
              cell(fmtPct(totV.views > 0 ? totV.v50 / totV.views * 100 : 0), { width: cols[3], align: AlignmentType.RIGHT }),
              cell(fmtPct(totV.views > 0 ? totV.v75 / totV.views * 100 : 0), { width: cols[4], align: AlignmentType.RIGHT }),
              cell(fmtPct(totV.views > 0 ? totV.v100 / totV.views * 100 : 0), { width: cols[5], align: AlignmentType.RIGHT })
            ]})
          ]
        });
      })(),
      new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] })
    ] : []),

    // ── S8: Analysis & Insights ────────────────────────────────────────────────
    heading('08  |  Analysis & Insights'),
    para('Key findings from this reporting period, benchmarked against Malaysia Meta Ads standards.'),
    new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun('')] }),
    ...insights.flatMap(ins => insightCard(ins.title, ins.body)),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }),

    // ── S9: Recommendations ───────────────────────────────────────────────────
    heading('09  |  Recommendations'),
    para('Prioritised action items for the next campaign period, each tied to data signals from this report.'),
    new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun('')] }),
    ...recs.flatMap((r, i) => recCard(i + 1, r.what, r.why, r.impact)),
    new Paragraph({ spacing: { before: 360, after: 120 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: '— End of Report —', size: 18, color: BRAND.midGrey, font: 'Calibri' })
    ]})
  ];

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Calibri', size: 18 } } }
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE.width, height: PAGE.height },
          margin: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin }
        }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND.green, space: 4 } },
            spacing: { after: 100 },
            children: [
              new TextRun({ text: `${client.clientCode} — ${client.name}  ·  Meta Ads Report  ·  ${periodLabel}`, size: 16, color: BRAND.darkGreen, font: 'Calibri' }),
              new TextRun({ text: '\t\tPrepared by Millecube Digital  ·  Confidential', size: 16, color: BRAND.midGrey, font: 'Calibri' })
            ],
            tabStops: [
              { type: TabStopType.RIGHT, position: PAGE.content }
            ]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: BRAND.green, space: 4 } },
            spacing: { before: 100 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${client.clientCode} — ${client.name}  ·  ${periodLabel}  ·  Millecube Digital  ·  Page `, size: 16, color: BRAND.midGrey, font: 'Calibri' }),
              new PageNumber(),
              new TextRun({ text: '  ·  CONFIDENTIAL', size: 16, color: BRAND.midGrey, font: 'Calibri' })
            ]
          })]
        })
      },
      children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

module.exports = { generate };
