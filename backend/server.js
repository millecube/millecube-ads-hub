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
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'millecube-hub-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Paths ─────────────────────────────────────────────────────────────────────
const DATA_DIR    = path.join(__dirname, '../data');
const REPORTS_DIR = path.join(__dirname, '../reports');
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(REPORTS_DIR);

// ── Storage: MongoDB if MONGODB_URI set and reachable, otherwise local JSON ────
let _db = null;
let _mongoFailed = false;
const USE_MONGO = !!process.env.MONGODB_URI;

// Returns true only when MongoDB is configured AND connected successfully
function usingMongo() { return USE_MONGO && !_mongoFailed; }

async function getDb() {
  if (_db) return _db;
  try {
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    _db = client.db('millecube');
    console.log('[DB] Connected to MongoDB Atlas');
    return _db;
  } catch (err) {
    _mongoFailed = true;
    console.error('[DB] MongoDB connection failed — falling back to file storage:', err.message);
    throw err;
  }
}

// File-based fallback helpers
const FILE = {
  clients:   path.join(DATA_DIR, 'clients.json'),
  schedules: path.join(DATA_DIR, 'schedules.json'),
  jobs:      path.join(DATA_DIR, 'jobs.json'),
  user:      path.join(DATA_DIR, 'user.json'),
};
Object.values(FILE).filter(f => f !== FILE.user).forEach(f => { if (!fs.existsSync(f)) fs.writeJsonSync(f, []); });
const fileRead  = f => fs.readJsonSync(f);
const fileWrite = (f, d) => fs.writeJsonSync(f, d, { spaces: 2 });

async function readClients() {
  if (!usingMongo()) return fileRead(FILE.clients);
  const db = await getDb();
  return db.collection('clients').find({}).toArray();
}
async function writeClients(data) {
  if (!usingMongo()) return fileWrite(FILE.clients, data);
  const db = await getDb();
  await db.collection('clients').deleteMany({});
  if (data.length > 0) await db.collection('clients').insertMany(data);
}
async function readSchedules() {
  if (!usingMongo()) return fileRead(FILE.schedules);
  const db = await getDb();
  return db.collection('schedules').find({}).toArray();
}
async function writeSchedules(data) {
  if (!usingMongo()) return fileWrite(FILE.schedules, data);
  const db = await getDb();
  await db.collection('schedules').deleteMany({});
  if (data.length > 0) await db.collection('schedules').insertMany(data);
}
async function readJobs() {
  if (!usingMongo()) return fileRead(FILE.jobs);
  const db = await getDb();
  return db.collection('jobs').find({}).sort({ createdAt: -1 }).toArray();
}
async function writeJobs(data) {
  if (!usingMongo()) return fileWrite(FILE.jobs, data);
  const db = await getDb();
  await db.collection('jobs').deleteMany({});
  if (data.length > 0) await db.collection('jobs').insertMany(data);
}

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use('/reports', express.static(REPORTS_DIR));

// ── Auth Helpers (multi-user) ──────────────────────────────────────────────────
const USERS_FILE = path.join(DATA_DIR, 'users.json');

async function getUsers() {
  if (usingMongo()) {
    try { const db = await getDb(); return db.collection('users').find({}).toArray(); } catch {}
  }
  if (!fs.existsSync(USERS_FILE)) return [];
  return fs.readJsonSync(USERS_FILE);
}

async function getUserByUsername(username) {
  const users = await getUsers();
  return users.find(u => u.username === username) || null;
}

async function saveUsers(users) {
  const clean = users.map(({ _id, ...u }) => u);
  if (usingMongo()) {
    try {
      const db = await getDb();
      await db.collection('users').deleteMany({});
      if (clean.length) await db.collection('users').insertMany(clean);
      return;
    } catch {}
  }
  fs.writeJsonSync(USERS_FILE, clean, { spaces: 2 });
}

async function ensureDefaultUser() {
  const users = await getUsers();
  if (users.length === 0) {
    const hashed = await bcrypt.hash('Admin@millecube', 10);
    await saveUsers([{ id: uuidv4(), username: 'admin', email: 'hello@millecube.com', password: hashed, role: 'admin', createdAt: new Date().toISOString() }]);
    console.log('[AUTH] Default user created — username: admin  password: Admin@millecube');
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Auth Routes (public) ───────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Health (public — used by UptimeRobot) ─────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── Protect all remaining /api routes ─────────────────────────────────────────
app.use('/api', authMiddleware);

app.get('/api/auth/me', async (req, res) => {
  try {
    const user = await getUserByUsername(req.user.username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, username: user.username, email: user.email, role: user.role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/auth/profile', async (req, res) => {
  try {
    const { username, email } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });
    const users = await getUsers();
    const idx = users.findIndex(u => u.username === req.user.username);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    // Check username conflict (if changing username)
    if (username !== req.user.username && users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    users[idx] = { ...users[idx], username, email, updatedAt: new Date().toISOString() };
    await saveUsers(users);
    const token = jwt.sign({ id: users[idx].id, username, role: users[idx].role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    res.json({ ok: true, token, user: { id: users[idx].id, username, email, role: users[idx].role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/auth/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const users = await getUsers();
    const idx = users.findIndex(u => u.username === req.user.username);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    const match = await bcrypt.compare(currentPassword, users[idx].password);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });
    users[idx] = { ...users[idx], password: await bcrypt.hash(newPassword, 10), updatedAt: new Date().toISOString() };
    await saveUsers(users);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Team User Management (admin only) ─────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

app.get('/api/auth/users', requireAdmin, async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role, createdAt: u.createdAt })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/users', requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const users = await getUsers();
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Username already exists' });
    const newUser = {
      id: uuidv4(), username, email: email || '',
      password: await bcrypt.hash(password, 10),
      role: role === 'admin' ? 'admin' : 'member',
      createdAt: new Date().toISOString()
    };
    await saveUsers([...users, newUser]);
    res.json({ ok: true, user: { id: newUser.id, username, email: newUser.email, role: newUser.role, createdAt: newUser.createdAt } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/auth/users/:id', requireAdmin, async (req, res) => {
  try {
    const users = await getUsers();
    const target = users.find(u => u.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.username === req.user.username) return res.status(400).json({ error: 'Cannot delete your own account' });
    await saveUsers(users.filter(u => u.id !== req.params.id));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function addJob(clientId, clientCode, period, status, filePath = null, error = null) {
  const job = {
    id: uuidv4(), clientId, clientCode, period, status,
    filePath, driveUrl: null, error,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (usingMongo()) {
    const db = await getDb();
    await db.collection('jobs').insertOne(job);
    const all = await db.collection('jobs').find({}).sort({ createdAt: 1 }).toArray();
    if (all.length > 200) {
      const toDelete = all.slice(0, all.length - 200).map(j => j.id);
      await db.collection('jobs').deleteMany({ id: { $in: toDelete } });
    }
  } else {
    const jobs = fileRead(FILE.jobs);
    jobs.unshift(job);
    fileWrite(FILE.jobs, jobs.slice(0, 200));
  }
  return job;
}

async function updateJob(id, updates) {
  if (usingMongo()) {
    const db = await getDb();
    await db.collection('jobs').updateOne(
      { id },
      { $set: { ...updates, updatedAt: new Date().toISOString() } }
    );
  } else {
    const jobs = fileRead(FILE.jobs);
    const idx = jobs.findIndex(j => j.id === id);
    if (idx !== -1) {
      jobs[idx] = { ...jobs[idx], ...updates, updatedAt: new Date().toISOString() };
      fileWrite(FILE.jobs, jobs);
    }
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
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const folderId     = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!clientId || !clientSecret || !refreshToken || !folderId) return null;

  try {
    // OAuth2 uses YOUR real Google account — files use your Drive storage quota (15GB free)
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'https://oauth2.googleapis.com/token');
    oauth2.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: 'v3', auth: oauth2 });

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
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const label = firstDay.toLocaleString('en-MY', { month: 'long', year: 'numeric' }).replace(' ', '');
  return { dateStart: fmt(firstDay), dateStop: fmt(lastDay), label };
}

async function scheduleCron(schedule) {
  const { id, clientId, dayOfMonth } = schedule;
  const clients = await readClients();
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

async function loadAllSchedules() {
  const schedules = await readSchedules();
  schedules.filter(s => s.active).forEach(scheduleCron);
}

// ──────────────────────────────────────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────────────────────────────────────

// ── Clients ───────────────────────────────────────────────────────────────────

// GET all clients
app.get('/api/clients', async (req, res) => {
  try {
    const clients = (await readClients()).map(c => ({
      ...c, _id: undefined,
      accessToken: c.accessToken ? '••••••••' + c.accessToken.slice(-6) : null
    }));
    res.json(clients);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single client
app.get('/api/clients/:id', async (req, res) => {
  try {
    const clients = await readClients();
    const client = clients.find(c => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ ...client, _id: undefined, accessToken: '••••••••' + client.accessToken.slice(-6) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST — add new client
app.post('/api/clients', async (req, res) => {
  try {
    const { clientCode, name, accessToken, adAccountId, campaignGoals, branches, primaryColor, secondaryColor } = req.body;
    if (!clientCode || !name || !accessToken || !adAccountId) {
      return res.status(400).json({ error: 'clientCode, name, accessToken, adAccountId are required' });
    }
    const clients = await readClients();
    if (clients.find(c => c.clientCode === clientCode.toUpperCase())) {
      return res.status(400).json({ error: `Client code "${clientCode}" already exists` });
    }
    const client = {
      id: uuidv4(),
      clientCode: clientCode.toUpperCase(),
      name, accessToken, adAccountId,
      campaignGoals: campaignGoals || [],
      branches: branches || [],
      primaryColor: primaryColor || '#E8A000',
      secondaryColor: secondaryColor || '#1A7FCC',
      createdAt: new Date().toISOString()
    };
    const db = await getDb();
    await db.collection('clients').insertOne(client);
    res.status(201).json({ ...client, _id: undefined, accessToken: '••••••••' + accessToken.slice(-6) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT — update client
app.put('/api/clients/:id', async (req, res) => {
  try {
    const db = await getDb();
    const existing = await db.collection('clients').findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    const updated = { ...existing, ...req.body, id: existing.id, updatedAt: new Date().toISOString() };
    delete updated._id;
    await db.collection('clients').replaceOne({ id: req.params.id }, updated);
    res.json({ ...updated, accessToken: '••••••••' + updated.accessToken.slice(-6) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE — remove client
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('clients').deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST — verify Meta API credentials
app.post('/api/clients/:id/verify', async (req, res) => {
  try {
    const db = await getDb();
    const client = await db.collection('clients').findOne({ id: req.params.id });
    if (!client) return res.status(404).json({ error: 'Client not found' });
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
  try {
    const { clientId, dateStart, dateStop, periodLabel } = req.body;
    if (!clientId || !dateStart || !dateStop) {
      return res.status(400).json({ error: 'clientId, dateStart, dateStop required' });
    }
    const db = await getDb();
    const client = await db.collection('clients').findOne({ id: clientId });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const label = periodLabel || `${dateStart}_to_${dateStop}`;
    res.json({ ok: true, message: 'Report generation started', clientCode: client.clientCode, period: label });
    generateReportForClient(client, dateStart, dateStop, label);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Schedules ─────────────────────────────────────────────────────────────────

// GET all schedules
app.get('/api/schedules', async (req, res) => {
  try {
    const schedules = (await readSchedules()).map(s => ({ ...s, _id: undefined }));
    res.json(schedules);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST — create schedule
app.post('/api/schedules', async (req, res) => {
  try {
    const { clientId, dayOfMonth, active = true } = req.body;
    if (!clientId || !dayOfMonth) {
      return res.status(400).json({ error: 'clientId and dayOfMonth required' });
    }
    const db = await getDb();
    const existing = await db.collection('schedules').findOne({ clientId });
    if (existing) return res.status(400).json({ error: 'Schedule already exists for this client. Update it instead.' });
    const client = await db.collection('clients').findOne({ id: clientId });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const schedule = { id: uuidv4(), clientId, clientCode: client.clientCode, dayOfMonth, active, createdAt: new Date().toISOString() };
    await db.collection('schedules').insertOne(schedule);
    if (active) scheduleCron(schedule);
    res.status(201).json({ ...schedule, _id: undefined });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT — update schedule
app.put('/api/schedules/:id', async (req, res) => {
  try {
    const db = await getDb();
    const existing = await db.collection('schedules').findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    const updated = { ...existing, ...req.body, id: existing.id, updatedAt: new Date().toISOString() };
    delete updated._id;
    await db.collection('schedules').replaceOne({ id: req.params.id }, updated);
    if (activeCrons.has(updated.id)) activeCrons.get(updated.id).stop();
    if (updated.active) scheduleCron(updated);
    res.json({ ...updated, _id: undefined });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE — remove schedule
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const db = await getDb();
    const schedule = await db.collection('schedules').findOne({ id: req.params.id });
    if (schedule && activeCrons.has(schedule.id)) {
      activeCrons.get(schedule.id).stop();
      activeCrons.delete(schedule.id);
    }
    await db.collection('schedules').deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Jobs / History ────────────────────────────────────────────────────────────

app.get('/api/jobs', async (req, res) => {
  try {
    const { clientId, limit = 200 } = req.query;
    const db = await getDb();
    const query = clientId ? { clientId } : {};
    const jobs = await db.collection('jobs').find(query).sort({ createdAt: -1 }).limit(parseInt(limit)).toArray();
    res.json(jobs.map(j => ({ ...j, _id: undefined })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🟢 Millecube Ads Hub Backend running on http://localhost:${PORT}`);
  try { await ensureDefaultUser(); } catch (e) { console.error('[AUTH] Failed to init user:', e.message); }
  try { await loadAllSchedules(); } catch (e) { console.error('[CRON] Failed to load schedules:', e.message); }
});
