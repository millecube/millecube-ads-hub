/**
 * Millecube Digital — Meta Ads Report Hub
 * Backend Server (Express + Node.js)
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Paths ─────────────────────────────────────────────────────────────────────
const DATA_DIR   = path.join(__dirname, '../data');
const REPORTS_DIR = path.join(__dirname, '../reports');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');
const JOBS_FILE  = path.join(DATA_DIR, 'jobs.json');

// ── Init data files ────────────────────────────────────────────────────────────
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(REPORTS_DIR);
if (!fs.existsSync(CLIENTS_FILE))   fs.writeJsonSync(CLIENTS_FILE, []);
if (!fs.existsSync(SCHEDULES_FILE)) fs.writeJsonSync(SCHEDULES_FILE, []);
if (!fs.existsSync(JOBS_FILE))      fs.writeJsonSync(JOBS_FILE, []);

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use('/reports', express.static(REPORTS_DIR));

// ── Helpers ────────────────────────────────────────────────────────────────────
const readClients   = () => fs.readJsonSync(CLIENTS_FILE);
const writeClients  = (data) => fs.writeJsonSync(CLIENTS_FILE, data, { spaces: 2 });
const readSchedules = () => fs.readJsonSync(SCHEDULES_FILE);
const writeSchedules = (data) => fs.writeJsonSync(SCHEDULES_FILE, data, { spaces: 2 });
const readJobs      = () => fs.readJsonSync(JOBS_FILE);
const writeJobs     = (data) => fs.writeJsonSync(JOBS_FILE, data, { spaces: 2 });

function addJob(clientId, clientCode, period, status, filePath = null, error = null) {
  const jobs = readJobs();
  const job = {
    id: uuidv4(),
    clientId,
    clientCode,
    period,
    status,        // 'running' | 'done' | 'failed'
    filePath,
    driveUrl: null,
    error,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.unshift(job);
  writeJobs(jobs.slice(0, 200)); // Keep last 200
  return job;
}

function updateJob(id, updates) {
  const jobs = readJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx !== -1) {
    jobs[idx] = { ...jobs[idx], ...updates, updatedAt: new Date().toISOString() };
    writeJobs(jobs);
  }
}

// ── Meta API Helper ────────────────────────────────────────────────────────────
const axios = require('axios');

async function fetchMetaInsights(client, dateStart, dateStop) {
  const { accessToken, adAccountId } = client;
  const baseUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights`;

  const commonParams = {
    access_token: accessToken,
    time_range: JSON.stringify({ since: dateStart, until: dateStop }),
    level: 'campaign',
    limit: 500
  };

  // Platform/Day breakdown
  const platformDayRes = await axios.get(baseUrl, {
    params: {
      ...commonParams,
      fields: [
        'campaign_name','objective','spend','reach','impressions',
        'clicks','ctr','cpm','cpc','actions','cost_per_action_type',
        'video_p25_watched_actions','video_p50_watched_actions',
        'video_p75_watched_actions','video_p100_watched_actions',
        'video_30_sec_watched_actions','post_engagement',
        'date_start','date_stop'
      ].join(','),
      breakdowns: 'publisher_platform',
      time_increment: 1
    }
  });

  // Age/Gender breakdown
  const ageGenderRes = await axios.get(baseUrl, {
    params: {
      ...commonParams,
      fields: [
        'campaign_name','spend','impressions','clicks','ctr',
        'actions','cost_per_action_type'
      ].join(','),
      breakdowns: 'age,gender'
    }
  });

  return {
    platformDay: platformDayRes.data.data || [],
    ageGender: ageGenderRes.data.data || []
  };
}

function logMetaError(err, label) {
  if (err.response) {
    console.error(`[META ERROR] ${label}:`, JSON.stringify(err.response.data));
  } else {
    console.error(`[META ERROR] ${label}:`, err.message);
  }
}

// ── Email Notifications (via Resend — no email password needed) ────────────────
const { Resend } = require('resend');

async function sendReportEmail(client, periodLabel, status, fileName, driveUrl, error) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // not configured — skip silently

  const resend  = new Resend(apiKey);
  const to      = process.env.EMAIL_TO || 'hello@millecube.com';
  // Use verified sender domain if set, otherwise Resend's default test sender
  const from    = process.env.EMAIL_FROM || 'Millecube Ads Hub <onboarding@resend.dev>';

  const subject = status === 'done'
    ? `Report Ready — ${client.clientCode} · ${periodLabel}`
    : `Report Failed — ${client.clientCode} · ${periodLabel}`;

  const driveBtn = driveUrl
    ? `<p style="margin:20px 0"><a href="${driveUrl}" style="background:#07503c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Open in Google Drive</a></p>`
    : '';

  const html = status === 'done' ? `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#222">
      <div style="background:#07503c;padding:24px 32px;border-radius:8px 8px 0 0">
        <h1 style="color:#32cd32;margin:0;font-size:22px">Millecube Ads Hub</h1>
        <p style="color:#aaa;margin:6px 0 0">Automated Report Notification</p>
      </div>
      <div style="padding:28px 32px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px">
        <h2 style="color:#07503c;margin-top:0">&#x2705; Report Successfully Generated</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:bold;width:40%">Client</td><td style="padding:8px 12px">${client.name} (${client.clientCode})</td></tr>
          <tr><td style="padding:8px 12px;font-weight:bold">Period</td><td style="padding:8px 12px">${periodLabel}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:bold">File Name</td><td style="padding:8px 12px;font-family:monospace">${fileName}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:bold">Status</td><td style="padding:8px 12px"><span style="color:#32cd32;font-weight:bold">Done</span></td></tr>
        </table>
        ${driveBtn}
        <p style="font-size:12px;color:#aaa;margin-top:32px;border-top:1px solid #eee;padding-top:12px">Millecube Digital &middot; Automated Report System &middot; Do not reply to this email</p>
      </div>
    </div>` : `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#222">
      <div style="background:#07503c;padding:24px 32px;border-radius:8px 8px 0 0">
        <h1 style="color:#32cd32;margin:0;font-size:22px">Millecube Ads Hub</h1>
        <p style="color:#aaa;margin:6px 0 0">Automated Report Notification</p>
      </div>
      <div style="padding:28px 32px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px">
        <h2 style="color:#cc3333;margin-top:0">&#x274C; Report Generation Failed</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:bold;width:40%">Client</td><td style="padding:8px 12px">${client.name} (${client.clientCode})</td></tr>
          <tr><td style="padding:8px 12px;font-weight:bold">Period</td><td style="padding:8px 12px">${periodLabel}</td></tr>
          <tr style="background:#fff3f3"><td style="padding:8px 12px;font-weight:bold">Error</td><td style="padding:8px 12px;color:#cc3333">${error}</td></tr>
        </table>
        <p style="font-size:12px;color:#aaa;margin-top:32px;border-top:1px solid #eee;padding-top:12px">Millecube Digital &middot; Automated Report System &middot; Do not reply to this email</p>
      </div>
    </div>`;

  console.log(`[EMAIL] Attempting → to: ${to}, from: ${from}, subject: ${subject}`);
  try {
    const { data, error } = await resend.emails.send({ from, to, subject, html });
    if (error) {
      console.error('[EMAIL] Resend rejected:', JSON.stringify(error));
    } else {
      console.log(`[EMAIL] Sent OK — id: ${data.id}`);
    }
  } catch (err) {
    console.error('[EMAIL] Exception:', err.message);
  }
}

// ── Google Drive Upload ────────────────────────────────────────────────────────
const { google } = require('googleapis');

async function uploadToDrive(filePath, fileName, clientCode) {
  const keyJson  = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!keyJson || !folderId) return null; // not configured — skip silently

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(keyJson),
      // 'drive' scope required — 'drive.file' only covers files the bot itself created,
      // not folders shared with it by the account owner
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    const drive = google.drive({ version: 'v3', auth });

    // Find existing client subfolder — only create if not found
    let targetFolderId;
    const search = await drive.files.list({
      q: `name='${clientCode}' and mimeType='application/vnd.google-apps.folder' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id,name)',
      spaces: 'drive'
    });

    if (search.data.files.length > 0) {
      targetFolderId = search.data.files[0].id;
      console.log(`[DRIVE] Using existing folder: ${clientCode} (${targetFolderId})`);
    } else {
      const created = await drive.files.create({
        requestBody: { name: clientCode, mimeType: 'application/vnd.google-apps.folder', parents: [folderId] },
        fields: 'id'
      });
      targetFolderId = created.data.id;
      console.log(`[DRIVE] Created new folder: ${clientCode} (${targetFolderId})`);
    }

    // Upload file as Buffer — more reliable than stream on cloud servers
    const fileBuffer = fs.readFileSync(filePath);
    const { Readable } = require('stream');
    const uploaded = await drive.files.create({
      requestBody: { name: fileName, parents: [targetFolderId] },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: Readable.from(fileBuffer)
      },
      fields: 'id,webViewLink'
    });

    // Anyone with link can view
    await drive.permissions.create({
      fileId: uploaded.data.id,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    console.log(`[DRIVE] Uploaded ${fileName} → ${uploaded.data.webViewLink}`);
    return uploaded.data.webViewLink;
  } catch (err) {
    console.error('[DRIVE] Upload failed:', err.message, err.stack);
    return null;
  }
}

// ── Report Generator ───────────────────────────────────────────────────────────
const reportGenerator = require('./reportGenerator');

async function generateReportForClient(client, dateStart, dateStop, periodLabel) {
  const job = addJob(client.id, client.clientCode, periodLabel, 'running');

  try {
    console.log(`[REPORT] Generating for ${client.clientCode} | ${periodLabel}`);

    // Fetch from Meta API
    const rawData = await fetchMetaInsights(client, dateStart, dateStop);

    // Generate report
    const fileName = `${client.clientCode}-${client.name.replace(/\s+/g,'-')}-Meta-Ads-Report-${periodLabel}.docx`;
    const clientDir = path.join(REPORTS_DIR, client.clientCode);
    fs.ensureDirSync(clientDir);
    const filePath = path.join(clientDir, fileName);

    await reportGenerator.generate({
      client,
      rawData,
      dateStart,
      dateStop,
      periodLabel,
      outputPath: filePath
    });

    // Upload to Google Drive (non-blocking — failure won't break the report)
    const driveUrl = await uploadToDrive(filePath, fileName, client.clientCode);

    updateJob(job.id, { status: 'done', filePath: `/reports/${client.clientCode}/${fileName}`, driveUrl });
    console.log(`[REPORT] Done: ${fileName}`);

    // Send email notification
    await sendReportEmail(client, periodLabel, 'done', fileName, driveUrl, null);

    return { success: true, filePath, driveUrl };

  } catch (err) {
    logMetaError(err, `Report for ${client.clientCode}`);
    updateJob(job.id, { status: 'failed', error: err.message });
    await sendReportEmail(client, periodLabel, 'failed', null, null, err.message);
    return { success: false, error: err.message };
  }
}

// ── Active cron jobs map ───────────────────────────────────────────────────────
const activeCrons = new Map();

function buildCronExpression(dayOfMonth) {
  // Run at 08:00 AM on the specified day of month
  return `0 8 ${dayOfMonth} * *`;
}

function getLastMonthRange() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDay  = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt = (d) => d.toISOString().split('T')[0];
  const label = firstDay.toLocaleString('en-MY', { month: 'long', year: 'numeric' }).replace(' ', '');
  return { dateStart: fmt(firstDay), dateStop: fmt(lastDay), label };
}

function scheduleCron(schedule) {
  const { id, clientId, dayOfMonth } = schedule;
  const clients = readClients();
  const client  = clients.find(c => c.id === clientId);
  if (!client) return;

  const expr = buildCronExpression(dayOfMonth);
  if (activeCrons.has(id)) {
    activeCrons.get(id).stop();
  }

  const task = cron.schedule(expr, async () => {
    const { dateStart, dateStop, label } = getLastMonthRange();
    await generateReportForClient(client, dateStart, dateStop, label);
  }, { timezone: 'Asia/Kuala_Lumpur' });

  activeCrons.set(id, task);
  console.log(`[CRON] Scheduled ${client.clientCode} on day ${dayOfMonth} of each month`);
}

function loadAllSchedules() {
  const schedules = readSchedules();
  schedules.filter(s => s.active).forEach(scheduleCron);
}

// ──────────────────────────────────────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────────────────────────────────────

// ── Clients ───────────────────────────────────────────────────────────────────

// GET all clients
app.get('/api/clients', (req, res) => {
  const clients = readClients().map(c => ({
    ...c,
    accessToken: c.accessToken ? '••••••••' + c.accessToken.slice(-6) : null
  }));
  res.json(clients);
});

// GET single client
app.get('/api/clients/:id', (req, res) => {
  const clients = readClients();
  const client = clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json({ ...client, accessToken: '••••••••' + client.accessToken.slice(-6) });
});

// POST — add new client
app.post('/api/clients', (req, res) => {
  const { clientCode, name, accessToken, adAccountId, campaignGoals, branches, primaryColor, secondaryColor } = req.body;
  if (!clientCode || !name || !accessToken || !adAccountId) {
    return res.status(400).json({ error: 'clientCode, name, accessToken, adAccountId are required' });
  }
  const clients = readClients();
  if (clients.find(c => c.clientCode === clientCode)) {
    return res.status(400).json({ error: `Client code "${clientCode}" already exists` });
  }
  const client = {
    id: uuidv4(),
    clientCode: clientCode.toUpperCase(),
    name,
    accessToken,
    adAccountId,
    campaignGoals: campaignGoals || [],  // [{ pattern, goal }]
    branches: branches || [],            // [{ code, label, color }]
    primaryColor: primaryColor || '#E8A000',
    secondaryColor: secondaryColor || '#1A7FCC',
    createdAt: new Date().toISOString()
  };
  clients.push(client);
  writeClients(clients);
  res.status(201).json({ ...client, accessToken: '••••••••' + accessToken.slice(-6) });
});

// PUT — update client
app.put('/api/clients/:id', (req, res) => {
  const clients = readClients();
  const idx = clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Client not found' });
  const updated = { ...clients[idx], ...req.body, id: clients[idx].id, updatedAt: new Date().toISOString() };
  clients[idx] = updated;
  writeClients(clients);
  res.json({ ...updated, accessToken: '••••••••' + updated.accessToken.slice(-6) });
});

// DELETE — remove client
app.delete('/api/clients/:id', (req, res) => {
  let clients = readClients();
  clients = clients.filter(c => c.id !== req.params.id);
  writeClients(clients);
  res.json({ ok: true });
});

// POST — verify Meta API credentials
app.post('/api/clients/:id/verify', async (req, res) => {
  const clients = readClients();
  const client = clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  try {
    const response = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}`, {
      params: { access_token: client.accessToken, fields: 'name,account_status,currency' }
    });
    res.json({ ok: true, account: response.data });
  } catch (err) {
    res.json({ ok: false, error: err.response?.data?.error?.message || err.message });
  }
});

// ── Report Generation ─────────────────────────────────────────────────────────

// POST — generate report manually
app.post('/api/reports/generate', async (req, res) => {
  const { clientId, dateStart, dateStop, periodLabel } = req.body;
  if (!clientId || !dateStart || !dateStop) {
    return res.status(400).json({ error: 'clientId, dateStart, dateStop required' });
  }

  const clients = readClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const label = periodLabel || `${dateStart}_to_${dateStop}`;

  // Respond immediately, process in background
  res.json({ ok: true, message: 'Report generation started', clientCode: client.clientCode, period: label });

  generateReportForClient(client, dateStart, dateStop, label);
});

// ── Schedules ─────────────────────────────────────────────────────────────────

// GET all schedules
app.get('/api/schedules', (req, res) => {
  res.json(readSchedules());
});

// POST — create schedule
app.post('/api/schedules', (req, res) => {
  const { clientId, dayOfMonth, active = true } = req.body;
  if (!clientId || !dayOfMonth) {
    return res.status(400).json({ error: 'clientId and dayOfMonth required' });
  }

  const schedules = readSchedules();
  const existing = schedules.find(s => s.clientId === clientId);
  if (existing) return res.status(400).json({ error: 'Schedule already exists for this client. Update it instead.' });

  const clients = readClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const schedule = { id: uuidv4(), clientId, clientCode: client.clientCode, dayOfMonth, active, createdAt: new Date().toISOString() };
  schedules.push(schedule);
  writeSchedules(schedules);

  if (active) scheduleCron(schedule);

  res.status(201).json(schedule);
});

// PUT — update schedule
app.put('/api/schedules/:id', (req, res) => {
  const schedules = readSchedules();
  const idx = schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Schedule not found' });

  const updated = { ...schedules[idx], ...req.body, id: schedules[idx].id, updatedAt: new Date().toISOString() };
  schedules[idx] = updated;
  writeSchedules(schedules);

  // Re-apply cron
  if (activeCrons.has(updated.id)) activeCrons.get(updated.id).stop();
  if (updated.active) scheduleCron(updated);

  res.json(updated);
});

// DELETE — remove schedule
app.delete('/api/schedules/:id', (req, res) => {
  let schedules = readSchedules();
  const schedule = schedules.find(s => s.id === req.params.id);
  if (schedule && activeCrons.has(schedule.id)) {
    activeCrons.get(schedule.id).stop();
    activeCrons.delete(schedule.id);
  }
  schedules = schedules.filter(s => s.id !== req.params.id);
  writeSchedules(schedules);
  res.json({ ok: true });
});

// ── Jobs / History ────────────────────────────────────────────────────────────

app.get('/api/jobs', (req, res) => {
  const { clientId, limit = 50 } = req.query;
  let jobs = readJobs();
  if (clientId) jobs = jobs.filter(j => j.clientId === clientId);
  res.json(jobs.slice(0, parseInt(limit)));
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🟢 Millecube Ads Hub Backend running on http://localhost:${PORT}`);
  loadAllSchedules();
});
