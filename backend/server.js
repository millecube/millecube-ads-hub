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
app.use(express.json({ limit: '15mb' }));
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

// ── Password Reset Tokens ──────────────────────────────────────────────────────
const RESETS_FILE = path.join(DATA_DIR, 'password_resets.json');

async function createPasswordReset(userId, email) {
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  if (usingMongo()) {
    const db = await getDb();
    await db.collection('passwordResets').deleteMany({ userId });
    await db.collection('passwordResets').insertOne({ token, userId, email, expiresAt });
  } else {
    const resets = fs.existsSync(RESETS_FILE) ? fs.readJsonSync(RESETS_FILE) : [];
    const filtered = resets.filter(r => r.userId !== userId);
    fs.writeJsonSync(RESETS_FILE, [...filtered, { token, userId, email, expiresAt }], { spaces: 2 });
  }
  return token;
}

async function getPasswordReset(token) {
  if (usingMongo()) {
    const db = await getDb();
    return db.collection('passwordResets').findOne({ token });
  }
  const resets = fs.existsSync(RESETS_FILE) ? fs.readJsonSync(RESETS_FILE) : [];
  return resets.find(r => r.token === token) || null;
}

async function deletePasswordReset(token) {
  if (usingMongo()) {
    const db = await getDb();
    await db.collection('passwordResets').deleteOne({ token });
  } else {
    const resets = fs.existsSync(RESETS_FILE) ? fs.readJsonSync(RESETS_FILE) : [];
    fs.writeJsonSync(RESETS_FILE, resets.filter(r => r.token !== token), { spaces: 2 });
  }
}

async function ensureDefaultUser() {
  const users = await getUsers();
  if (users.length === 0) {
    const hashed = await bcrypt.hash('Admin@millecube', 10);
    await saveUsers([{ id: uuidv4(), username: 'admin', email: 'hello@millecube.com', password: hashed, role: 'admin', createdAt: new Date().toISOString() }]);
    console.log('[AUTH] Default user created — username: admin  password: Admin@millecube');
  } else {
    // Patch any existing users that are missing the role field
    let patched = false;
    const updated = users.map((u, i) => {
      if (!u.role) {
        patched = true;
        // First user (oldest) gets admin, rest get member
        return { ...u, role: i === 0 ? 'admin' : 'member' };
      }
      return u;
    });
    if (patched) {
      await saveUsers(updated);
      console.log('[AUTH] Patched users missing role field');
    }
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

// ── Site Settings — GET is public so favicon loads before login ───────────────
app.get('/api/settings/public', async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection('siteSettings').findOne({ _id: 'main' });
    res.json({ logo: doc?.logo || null });
  } catch { res.json({ logo: null }); }
});

// ── Forgot / Reset Password (public) ──────────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const users = await getUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.json({ ok: true }); // don't reveal if email exists
    const token = await createPasswordReset(user.id, email);
    const appUrl = process.env.FRONTEND_URL || 'https://millecube-ads-hub.vercel.app';
    await sendAuthEmail('reset', email, { resetUrl: `${appUrl}/reset-password?token=${token}` });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const reset = await getPasswordReset(token);
    if (!reset) return res.status(400).json({ error: 'Invalid or expired reset link' });
    if (new Date(reset.expiresAt) < new Date()) {
      await deletePasswordReset(token);
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }
    const users = await getUsers();
    const idx = users.findIndex(u => u.id === reset.userId);
    if (idx === -1) return res.status(400).json({ error: 'User not found' });
    users[idx] = { ...users[idx], password: await bcrypt.hash(password, 10), updatedAt: new Date().toISOString() };
    await saveUsers(users);
    await deletePasswordReset(token);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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

// ── User Preferences ──────────────────────────────────────────────────────────
app.get('/api/preferences', async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection('userPrefs').findOne({ userId: req.user.id });
    res.json(doc?.prefs || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/preferences', async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('userPrefs').updateOne(
      { userId: req.user.id },
      { $set: { userId: req.user.id, prefs: req.body, updatedAt: new Date() } },
      { upsert: true }
    );
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
    if (newUser.email) {
      const appUrl = process.env.FRONTEND_URL || 'https://millecube-ads-hub.vercel.app';
      sendAuthEmail('welcome', newUser.email, { username, password, loginUrl: `${appUrl}/login` }).catch(() => {});
    }
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

async function sendAuthEmail(type, to, data) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log(`[EMAIL] No RESEND_API_KEY — skipping ${type} email`); return; }
  if (!to) return;
  // Until domain is verified on Resend, all auth emails go to the admin inbox
  const effectiveTo = process.env.EMAIL_TO || 'hello@millecube.com';
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM || 'Millecube Ads Hub <onboarding@resend.dev>';
  let subject, html;

  if (type === 'welcome') {
    const { username, password, loginUrl } = data;
    subject = 'Welcome to Millecube Ads Hub';
    html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#222">
      <div style="background:#07503c;padding:24px 32px;border-radius:8px 8px 0 0">
        <h1 style="color:#32cd32;margin:0;font-size:22px">Millecube Ads Hub</h1>
        <p style="color:#aaa;margin:6px 0 0">Your account is ready</p>
      </div>
      <div style="padding:28px 32px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px">
        <h2 style="color:#07503c;margin-top:0">Welcome, ${username}!</h2>
        <p style="font-size:14px">An admin has created an account for you on Millecube Ads Hub. Here are your login details:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
          <tr style="background:#f5f5f5"><td style="padding:10px 14px;font-weight:bold;width:40%">Username</td><td style="padding:10px 14px;font-family:monospace">${username}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:bold">Password</td><td style="padding:10px 14px;font-family:monospace">${password}</td></tr>
        </table>
        <p style="margin:20px 0"><a href="${loginUrl}" style="background:#07503c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Log In Now</a></p>
        <p style="font-size:13px;color:#666">We recommend changing your password after your first login via Settings.</p>
        <p style="font-size:12px;color:#aaa;margin-top:32px;border-top:1px solid #eee;padding-top:12px">Millecube Digital &middot; Ads Hub &middot; Do not reply to this email</p>
      </div>
    </div>`;
  } else if (type === 'reset') {
    const { resetUrl } = data;
    subject = 'Reset Your Password — Millecube Ads Hub';
    html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#222">
      <div style="background:#07503c;padding:24px 32px;border-radius:8px 8px 0 0">
        <h1 style="color:#32cd32;margin:0;font-size:22px">Millecube Ads Hub</h1>
        <p style="color:#aaa;margin:6px 0 0">Password Reset Request</p>
      </div>
      <div style="padding:28px 32px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px">
        <h2 style="color:#07503c;margin-top:0">Reset Your Password</h2>
        <p style="font-size:14px">We received a request to reset the password for your account. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
        <p style="margin:20px 0"><a href="${resetUrl}" style="background:#07503c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Reset Password</a></p>
        <p style="font-size:13px;color:#666">If you did not request this, you can safely ignore this email. Your password will not change.</p>
        <p style="font-size:12px;color:#aaa;margin-top:32px;border-top:1px solid #eee;padding-top:12px">Millecube Digital &middot; Ads Hub &middot; Do not reply to this email</p>
      </div>
    </div>`;
  }

  try {
    const { data: d, error } = await resend.emails.send({ from, to: effectiveTo, subject, html });
    if (error) console.error(`[EMAIL] ${type} rejected:`, JSON.stringify(error));
    else console.log(`[EMAIL] ${type} sent OK — id: ${d.id} → ${effectiveTo}`);
  } catch (err) {
    console.error(`[EMAIL] ${type} exception:`, err.message);
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
  const job = await addJob(client.id, client.clientCode, periodLabel, 'running');

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

const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function buildCronExpression(schedule) {
  const { frequency = 'monthly', dayOfMonth = 5, dayOfWeek = 1, hour = 8, minute = 0 } = schedule;
  if (frequency === 'weekly') {
    // Run every week on the chosen day-of-week
    return `${minute} ${hour} * * ${dayOfWeek}`;
  } else if (frequency === 'biweekly') {
    // Run on dayOfMonth and dayOfMonth+14 each month (dayOfMonth capped at 14)
    const d1 = Math.min(dayOfMonth, 14);
    return `${minute} ${hour} ${d1},${d1 + 14} * *`;
  } else {
    return `${minute} ${hour} ${dayOfMonth} * *`;
  }
}

function getReportRange(frequency = 'monthly') {
  const now = new Date();
  if (frequency === 'weekly') {
    const stop  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return { dateStart: fmt(start), dateStop: fmt(stop), label: `Weekly_${fmt(start)}_to_${fmt(stop)}` };
  } else if (frequency === 'biweekly') {
    const stop  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);
    return { dateStart: fmt(start), dateStop: fmt(stop), label: `Biweekly_${fmt(start)}_to_${fmt(stop)}` };
  } else {
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay  = new Date(now.getFullYear(), now.getMonth(), 0);
    const label = firstDay.toLocaleString('en-MY', { month: 'long', year: 'numeric' }).replace(' ', '');
    return { dateStart: fmt(firstDay), dateStop: fmt(lastDay), label };
  }
}

async function scheduleCron(schedule) {
  const { id, clientId, frequency = 'monthly', hour = 8, minute = 0 } = schedule;
  const clients = await readClients();
  const client  = clients.find(c => c.id === clientId);
  if (!client) return;

  const expr = buildCronExpression(schedule);
  if (activeCrons.has(id)) activeCrons.get(id).stop();

  const task = cron.schedule(expr, async () => {
    const { dateStart, dateStop, label } = getReportRange(frequency);
    await generateReportForClient(client, dateStart, dateStop, label);
  }, { timezone: 'Asia/Kuala_Lumpur' });

  activeCrons.set(id, task);
  console.log(`[CRON] Scheduled ${client.clientCode} | ${frequency} | cron: ${expr}`);
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

// GET — return clients visible to current user (must be before /:id)
// Admin sees all, member sees only assigned
app.get('/api/clients/assigned', async (req, res) => {
  try {
    const clients = await readClients();
    if (req.user?.role === 'admin') {
      return res.json(clients.map(c => ({ ...c, _id: undefined, accessToken: c.accessToken ? '••••••••' + c.accessToken.slice(-6) : null })));
    }
    const assigned = clients.filter(c =>
      Array.isArray(c.assignedUsers) && c.assignedUsers.includes(req.user.id)
    );
    res.json(assigned.map(c => ({ ...c, _id: undefined, accessToken: c.accessToken ? '••••••••' + c.accessToken.slice(-6) : null })));
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

const normaliseAdAccountId = (id) => {
  if (!id) return id;
  const s = String(id).trim();
  return s.startsWith('act_') ? s : `act_${s}`;
};

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
      name, accessToken, adAccountId: normaliseAdAccountId(adAccountId),
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
    if (req.body.adAccountId) req.body.adAccountId = normaliseAdAccountId(req.body.adAccountId);
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

// ── Client Assignment ─────────────────────────────────────────────────────────

// PUT — assign/unassign members to a client (admin only)
app.put('/api/clients/:id/assign', requireAdmin, async (req, res) => {
  const { userIds } = req.body;
  if (!Array.isArray(userIds)) {
    return res.status(400).json({ error: 'userIds must be an array' });
  }
  try {
    const clients = await readClients();
    const idx = clients.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Client not found' });
    clients[idx].assignedUsers = userIds;
    clients[idx].updatedAt = new Date().toISOString();
    await writeClients(clients);
    res.json(clients[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT — set budgetEditors for a client (admin only)
app.put('/api/clients/:id/budget-editors', requireAdmin, async (req, res) => {
  const { userIds } = req.body;
  if (!Array.isArray(userIds)) return res.status(400).json({ error: 'userIds must be an array' });
  try {
    const clients = await readClients();
    const idx = clients.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Client not found' });
    clients[idx].budgetEditors = userIds;
    clients[idx].updatedAt = new Date().toISOString();
    await writeClients(clients);
    res.json({ ok: true, budgetEditors: userIds });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET — return clients visible to current user
// Admin sees all, member sees only assigned
app.get('/api/clients/assigned', async (req, res) => {
  try {
    const clients = await readClients();
    if (req.user?.role === 'admin') {
      return res.json(clients);
    }
    const assigned = clients.filter(c =>
      Array.isArray(c.assignedUsers) && c.assignedUsers.includes(req.user.id)
    );
    res.json(assigned);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    const { clientId, frequency = 'monthly', dayOfMonth = 5, dayOfWeek = 1, hour = 8, minute = 0, active = true } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const clients = await readClients();
    const client = clients.find(c => c.id === clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const schedules = await readSchedules();
    const schedule = { id: uuidv4(), clientId, clientCode: client.clientCode, frequency, dayOfMonth, dayOfWeek, hour, minute, active, createdAt: new Date().toISOString() };
    await writeSchedules([...schedules, schedule]);
    if (active) scheduleCron(schedule);
    res.status(201).json(schedule);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT — update schedule
app.put('/api/schedules/:id', async (req, res) => {
  try {
    const schedules = await readSchedules();
    const idx = schedules.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Schedule not found' });
    const updated = { ...schedules[idx], ...req.body, id: schedules[idx].id, updatedAt: new Date().toISOString() };
    schedules[idx] = updated;
    await writeSchedules(schedules);
    if (activeCrons.has(updated.id)) activeCrons.get(updated.id).stop();
    if (updated.active) scheduleCron(updated);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE — remove schedule
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const schedules = await readSchedules();
    const schedule = schedules.find(s => s.id === req.params.id);
    if (schedule && activeCrons.has(schedule.id)) {
      activeCrons.get(schedule.id).stop();
      activeCrons.delete(schedule.id);
    }
    await writeSchedules(schedules.filter(s => s.id !== req.params.id));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Jobs / History ────────────────────────────────────────────────────────────

app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await readJobs();
    res.json(jobs.map(j => ({ ...j, _id: undefined })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/jobs/:id', async (req, res) => {
  try {
    if (usingMongo()) {
      const db = await getDb();
      await db.collection('jobs').deleteOne({ id: req.params.id });
    } else {
      const jobs = fileRead(FILE.jobs);
      fileWrite(FILE.jobs, jobs.filter(j => j.id !== req.params.id));
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Monitor: Helpers ──────────────────────────────────────────────────────────

function extractAction(actions, type) {
  if (!actions) return 0;
  const f = (Array.isArray(actions) ? actions : []).find(a => a.action_type === type);
  return f ? parseFloat(f.value || 0) : 0;
}

function extractCostPerAction(costArr, type) {
  if (!costArr) return 0;
  if (!type) return 0;
  const f = (Array.isArray(costArr) ? costArr : []).find(a => a.action_type === type);
  return f ? parseFloat(f.value || 0) : 0;
}

// Maps ad set optimization_goal → the Meta action type used as "Results"
function actionTypeForGoal(optimizationGoal) {
  const g = (optimizationGoal || '').toUpperCase();
  if (g === 'CONVERSATIONS' || g.includes('MESSAGING')) return 'onsite_conversion.messaging_conversation_started_7d';
  if (g === 'LEAD_GENERATION' || g.includes('LEAD')) return 'lead';
  if (g === 'VIDEO_VIEWS' || g === 'THRUPLAY') return 'video_view';
  if (g === 'LINK_CLICKS' || g === 'LANDING_PAGE_VIEWS' || g === 'OFFSITE_CONVERSIONS') return 'link_click';
  if (g === 'POST_ENGAGEMENT' || g === 'REACTIONS' || g === 'IMPRESSIONS' || g === 'REACH') return 'post_engagement';
  return null;
}

// Maps campaign objective → the Meta action type used as "Results" (fallback when no opt goal)
function actionTypeForObjective(objective) {
  const obj = (objective || '').toUpperCase();
  if (obj.includes('LEAD')) return 'lead';
  if (obj === 'MESSAGES' || obj.includes('OUTCOME_ENGAGEMENT_MESSAGING') || obj.includes('OUTCOME_TRAFFIC_MESSAGING')) return 'onsite_conversion.messaging_conversation_started_7d';
  if (obj.includes('VIDEO')) return 'video_view';
  if (obj.includes('TRAFFIC') || obj.includes('LINK_CLICK')) return 'link_click';
  if (obj.includes('POST_ENGAGEMENT') || (obj.includes('ENGAGEMENT') && !obj.includes('MESSAGING'))) return 'post_engagement';
  return 'onsite_conversion.messaging_conversation_started_7d';
}

const MONITOR_TTL_MS = 30 * 60 * 1000;
const BENCH_DEFAULTS = { ctr: 0.8, cpm: 25, cpr: 50, frequency: 3.5 };

function getTodayMYT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function getYesterdayMYT() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function getMonitorDateRange(range, dateStart, dateStop) {
  const todayMYT     = getTodayMYT();
  const yesterdayMYT = getYesterdayMYT();
  if (dateStart && dateStop) {
    return { dateStart, dateStop, rangeKey: `custom_${dateStart}_${dateStop}` };
  }
  if (range === 'today') {
    return { dateStart: todayMYT, dateStop: todayMYT, rangeKey: 'today' };
  }
  if (range === 'yesterday') {
    return { dateStart: yesterdayMYT, dateStop: yesterdayMYT, rangeKey: 'yesterday' };
  }
  if (range === 'this_month') {
    const myt   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
    const first = new Date(myt.getFullYear(), myt.getMonth(), 1);
    return {
      dateStart: first.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }),
      dateStop:  todayMYT,
      rangeKey:  'this_month'
    };
  }
  // 7d / 14d / 30d: dateStop = yesterday (exclude today's partial data)
  const days  = range === '7d' ? 7 : range === '14d' ? 14 : 30;
  const start = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
  start.setDate(start.getDate() - days); // yesterday − (days−1) = days ago
  const dateStartStr = start.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  return { dateStart: dateStartStr, dateStop: yesterdayMYT, rangeKey: range || '30d' };
}

function calcDays(dateStart, dateStop) {
  return Math.round((new Date(dateStop) - new Date(dateStart)) / 86400000) + 1;
}

function getPreviousPeriod(dateStart, dateStop) {
  const days     = calcDays(dateStart, dateStop);
  const prevEnd  = new Date(dateStart); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart= new Date(prevEnd);   prevStart.setDate(prevStart.getDate() - days + 1);
  return {
    dateStart: prevStart.toISOString().slice(0, 10),
    dateStop:  prevEnd.toISOString().slice(0, 10)
  };
}

function extractVideoAction(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return parseFloat(arr[0]?.value || 0);
}

async function getMonitorCache(clientId, rangeKey) {
  if (!usingMongo()) return null;
  try {
    const db    = await getDb();
    const entry = await db.collection('monitorCache').findOne({ clientId, rangeKey });
    if (!entry) return null;
    if (Date.now() - new Date(entry.fetchedAt).getTime() > MONITOR_TTL_MS) return null;
    return entry.data;
  } catch { return null; }
}

async function setMonitorCache(clientId, rangeKey, data) {
  if (!usingMongo()) return;
  try {
    const db = await getDb();
    await db.collection('monitorCache').updateOne(
      { clientId, rangeKey },
      { $set: { clientId, rangeKey, data, fetchedAt: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) { console.error('[CACHE] Write failed:', err.message); }
}

function calcHealthScore(metrics, clientThresholds) {
  const usingDefaults = !clientThresholds;
  const t = clientThresholds || BENCH_DEFAULTS;
  const breaches = [];
  if (metrics.ctr       !== null && metrics.ctr       <  t.ctr)       breaches.push({ metric: 'CTR',       value: metrics.ctr,       threshold: t.ctr,       direction: 'below' });
  if (metrics.cpm       !== null && metrics.cpm       >  t.cpm)       breaches.push({ metric: 'CPM',       value: metrics.cpm,       threshold: t.cpm,       direction: 'above' });
  if (metrics.cpr       !== null && metrics.cpr       >  t.cpr)       breaches.push({ metric: 'CPR',       value: metrics.cpr,       threshold: t.cpr,       direction: 'above' });
  if (metrics.frequency !== null && metrics.frequency >  t.frequency) breaches.push({ metric: 'Frequency', value: metrics.frequency, threshold: t.frequency, direction: 'above' });
  return {
    score: breaches.length === 0 ? 'green' : breaches.length === 1 ? 'yellow' : 'red',
    breaches, usingDefaults, thresholds: t
  };
}

function detectVKBranch(campaignName) {
  const n = (campaignName || '').toUpperCase();
  if (n.includes('KL')) return 'KL';
  if (n.includes('RC')) return 'RC';
  if (n.includes('CR')) return 'CR';
  return 'OTHER';
}

// ── Monitor: Meta API fetchers ────────────────────────────────────────────────

async function fetchCampaignLevel(client, dateStart, dateStop) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}/insights`, {
    params: {
      access_token: client.accessToken,
      time_range: JSON.stringify({ since: dateStart, until: dateStop }),
      level: 'campaign', limit: 500,
      fields: [
        'campaign_name','campaign_id','objective','spend','reach','impressions',
        'clicks','ctr','cpm','cpc','frequency',
        'actions','cost_per_action_type','date_start','date_stop',
        'video_p25_watched_actions','video_p50_watched_actions',
        'video_p75_watched_actions','video_p100_watched_actions',
        'video_avg_time_watched_actions'
      ].join(',')
    }
  });
  return res.data.data || [];
}

async function fetchActiveCampaignsCount(client) {
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}/campaigns`, {
      params: {
        access_token: client.accessToken,
        effective_status: JSON.stringify(['ACTIVE']),
        fields: 'id',
        limit: 500
      }
    });
    return (res.data.data || []).length;
  } catch { return 0; }
}

async function fetchAudienceBreakdowns(client, dateStart, dateStop) {
  const base = {
    access_token: client.accessToken,
    time_range: JSON.stringify({ since: dateStart, until: dateStop }),
    level: 'account', limit: 500,
    fields: 'impressions,clicks,spend,reach,ctr,cpm,cpc,actions'
  };
  const url = `https://graph.facebook.com/v19.0/${client.adAccountId}/insights`;
  const [gender, age, region, platform, device] = await Promise.all([
    axios.get(url, { params: { ...base, breakdowns: 'gender'             } }).then(r => r.data.data || []).catch(() => []),
    axios.get(url, { params: { ...base, breakdowns: 'age'                } }).then(r => r.data.data || []).catch(() => []),
    axios.get(url, { params: { ...base, breakdowns: 'region'             } }).then(r => r.data.data || []).catch(() => []),
    axios.get(url, { params: { ...base, breakdowns: 'publisher_platform' } }).then(r => r.data.data || []).catch(() => []),
    axios.get(url, { params: { ...base, breakdowns: 'impression_device'  } }).then(r => r.data.data || []).catch(() => []),
  ]);
  return { gender, age, region, platform, device };
}

async function fetchAdsetLevel(client, dateStart, dateStop) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}/insights`, {
    params: {
      access_token: client.accessToken,
      time_range: JSON.stringify({ since: dateStart, until: dateStop }),
      level: 'adset', limit: 500,
      fields: [
        'campaign_name','campaign_id','adset_name','adset_id',
        'spend','reach','impressions','clicks','ctr','cpm','cpc','frequency',
        'actions','cost_per_action_type'
      ].join(',')
    }
  });
  return res.data.data || [];
}

async function fetchAdLevel(client, dateStart, dateStop) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}/insights`, {
    params: {
      access_token: client.accessToken,
      time_range: JSON.stringify({ since: dateStart, until: dateStop }),
      level: 'ad', limit: 500,
      fields: [
        'campaign_name','campaign_id','adset_name','adset_id','ad_name','ad_id',
        'spend','reach','impressions','clicks','ctr','cpm','cpc',
        'actions','cost_per_action_type'
      ].join(',')
    }
  });
  return res.data.data || [];
}

function extractPerfMetrics(row) {
  const spend = parseFloat(row.spend || 0);
  const impressions = parseFloat(row.impressions || 0);
  const reach = parseFloat(row.reach || 0);
  const clicks = parseFloat(row.clicks || 0);
  const linkClicks = parseFloat(row.inline_link_clicks || 0);
  const waConvosStarted   = extractAction(row.actions, 'onsite_conversion.messaging_conversation_started_7d');
  const repliedMessages   = extractAction(row.actions, 'onsite_conversion.messaging_first_reply');
  const newContacts       = extractAction(row.actions, 'onsite_conversion.messaging_new_connections');
  const returningContacts = extractAction(row.actions, 'onsite_conversion.messaging_returning_connections');
  const leads             = extractAction(row.actions, 'lead');
  const postEngagement    = extractAction(row.actions, 'post_engagement');
  const videoViews        = extractAction(row.actions, 'video_view');
  return {
    spend, impressions, reach,
    frequency: reach > 0 ? impressions / reach : 0,
    clicks,
    ctr:    impressions > 0 ? clicks / impressions * 100 : 0,
    cpm:    impressions > 0 ? spend  / impressions * 1000 : 0,
    cpc:    clicks > 0      ? spend  / clicks : 0,
    linkClicks,
    ctrLink: impressions > 0 ? linkClicks / impressions * 100 : 0,
    cpcLink: linkClicks > 0  ? spend / linkClicks : 0,
    costPerMessage: repliedMessages > 0 ? spend / repliedMessages : 0,
    waConvosStarted, repliedMessages, newContacts, returningContacts,
    leads, postEngagement, videoViews,
  };
}

async function fetchPerfCampaignLevel(client, dateStart, dateStop) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}/insights`, {
    params: {
      access_token: client.accessToken,
      time_range: JSON.stringify({ since: dateStart, until: dateStop }),
      level: 'campaign', limit: 500,
      fields: ['campaign_name','campaign_id','spend','reach','impressions','clicks','ctr','cpm','cpc','frequency','inline_link_clicks','cost_per_inline_link_click','actions','cost_per_action_type','unique_actions','cost_per_unique_action_type'].join(',')
    }
  });
  return res.data.data || [];
}

async function fetchPerfAdsetLevel(client, dateStart, dateStop) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}/insights`, {
    params: {
      access_token: client.accessToken,
      time_range: JSON.stringify({ since: dateStart, until: dateStop }),
      level: 'adset', limit: 500,
      fields: ['campaign_name','campaign_id','adset_name','adset_id','spend','reach','impressions','clicks','ctr','cpm','cpc','frequency','inline_link_clicks','cost_per_inline_link_click','actions','cost_per_action_type','unique_actions','cost_per_unique_action_type'].join(',')
    }
  });
  return res.data.data || [];
}

async function fetchPerfAdLevel2(client, dateStart, dateStop) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}/insights`, {
    params: {
      access_token: client.accessToken,
      time_range: JSON.stringify({ since: dateStart, until: dateStop }),
      level: 'ad', limit: 500,
      fields: ['campaign_name','campaign_id','adset_name','adset_id','ad_name','ad_id','spend','reach','impressions','clicks','ctr','cpm','cpc','frequency','inline_link_clicks','cost_per_inline_link_click','actions','cost_per_action_type','unique_actions','cost_per_unique_action_type'].join(',')
    }
  });
  return res.data.data || [];
}

async function fetchCampaignStructure(client) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}/campaigns`, {
    params: { access_token: client.accessToken, fields: 'id,name,effective_status,daily_budget,lifetime_budget,objective', limit: 500 }
  });
  return res.data.data || [];
}

async function fetchAdsetStructure(client) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}/adsets`, {
    params: { access_token: client.accessToken, fields: 'id,name,effective_status,daily_budget,lifetime_budget,campaign_id,optimization_goal,billing_event,targeting', limit: 500 }
  });
  return res.data.data || [];
}

async function fetchAdStructure(client) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}/ads`, {
    params: { access_token: client.accessToken, fields: 'id,name,effective_status,adset_id', limit: 500 }
  });
  return res.data.data || [];
}

function buildPerfHierarchy(campIns, adsetIns, adIns, campStruct, adsetStruct, adStruct) {
  const campMap = {}; campStruct.forEach(c => { campMap[c.id] = c; });
  const adsetMap = {}; adsetStruct.forEach(a => { adsetMap[a.id] = a; });
  const adMap = {}; adStruct.forEach(a => { adMap[a.id] = a; });
  const adsetByCamp = {}; adsetIns.forEach(a => { (adsetByCamp[a.campaign_id] = adsetByCamp[a.campaign_id] || []).push(a); });
  const adByAdset = {}; adIns.forEach(a => { (adByAdset[a.adset_id] = adByAdset[a.adset_id] || []).push(a); });
  const parseBudget = s => { const n = parseFloat(s || 0); return n > 0 ? n / 100 : null; };

  return campIns.map(c => {
    const cs = campMap[c.campaign_id] || {};
    const objective = cs.objective || '';
    // ad set opt goal takes priority over campaign objective for result metric
    const resolveResults = (m, rawRow, optGoal) => {
      const actionType = actionTypeForGoal(optGoal) || actionTypeForObjective(objective);
      // Prefer cost_per_unique_action_type (counts unique people, matches Ads Manager)
      // Fall back to cost_per_action_type if unique is not available for this action type
      const costPerResult =
        extractCostPerAction(rawRow?.cost_per_unique_action_type, actionType) ||
        extractCostPerAction(rawRow?.cost_per_action_type, actionType);
      const results = costPerResult > 0 ? Math.round(m.spend / costPerResult) : 0;
      return { results, costPerResult };
    };

    const adsets = (adsetByCamp[c.campaign_id] || []).map(a => {
      const as2 = adsetMap[a.adset_id] || {};
      const optGoal = as2.optimization_goal || '';
      const aMetrics = extractPerfMetrics(a);
      const ads = (adByAdset[a.adset_id] || []).map(ad => {
        const ads2 = adMap[ad.ad_id] || {};
        const adMetrics = extractPerfMetrics(ad);
        return { id: ad.ad_id, name: ad.ad_name, status: ads2.effective_status || 'UNKNOWN', budget: null, ...adMetrics, ...resolveResults(adMetrics, ad, optGoal) };
      });
      const db = parseBudget(as2.daily_budget), lb = parseBudget(as2.lifetime_budget);
      return {
        id: a.adset_id, name: a.adset_name,
        status: as2.effective_status || 'UNKNOWN',
        optimization_goal: optGoal,
        billing_event: as2.billing_event || '',
        targeting: as2.targeting || null,
        budget: db ? { type: 'daily', amount: db } : lb ? { type: 'lifetime', amount: lb } : null,
        ...aMetrics, ...resolveResults(aMetrics, a, optGoal), ads
      };
    });
    const db = parseBudget(cs.daily_budget), lb = parseBudget(cs.lifetime_budget);
    const cMetrics = extractPerfMetrics(c);
    // For campaign row: use the most common opt goal among its ad sets as the primary result metric
    const campOptGoals = (adsetByCamp[c.campaign_id] || []).map(a => (adsetMap[a.adset_id] || {}).optimization_goal || '');
    const campPrimaryGoal = campOptGoals.length > 0 ? campOptGoals[0] : '';
    return {
      id: c.campaign_id, name: c.campaign_name,
      status: cs.effective_status || 'UNKNOWN',
      objective,
      budget: db ? { type: 'daily', amount: db } : lb ? { type: 'lifetime', amount: lb } : null,
      ...cMetrics, ...resolveResults(cMetrics, c, campPrimaryGoal), adsets
    };
  });
}

async function fetchDailyTrend(client, dateStart, dateStop) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/${client.adAccountId}/insights`, {
    params: {
      access_token: client.accessToken,
      time_range: JSON.stringify({ since: dateStart, until: dateStop }),
      level: 'account', time_increment: 1, limit: 500,
      fields: [
        'spend','reach','impressions','clicks','ctr','cpm','cpc','frequency',
        'actions','date_start'
      ].join(',')
    }
  });
  return res.data.data || [];
}

// ── Monitor: Data processor ───────────────────────────────────────────────────

function processCampaignSummary(campaigns, client) {
  const acc = campaigns.reduce((a, c) => {
    const imp = parseFloat(c.impressions || 0);
    a.spend        += parseFloat(c.spend || 0);
    a.reach        += parseFloat(c.reach || 0);
    a.impressions  += imp;
    a.clicks       += parseFloat(c.clicks || 0);
    a.freqWeighted += parseFloat(c.frequency || 0) * imp;
    a.waConvos     += extractAction(c.actions, 'onsite_conversion.messaging_first_reply');
    a.leads        += extractAction(c.actions, 'lead');
    a.engagements  += extractAction(c.actions, 'post_engagement');
    a.pageLikes    += extractAction(c.actions, 'like');
    return a;
  }, { spend:0, reach:0, impressions:0, clicks:0, freqWeighted:0, waConvos:0, leads:0, engagements:0, pageLikes:0 });

  acc.ctr       = acc.impressions > 0 ? acc.clicks / acc.impressions * 100 : 0;
  acc.cpm       = acc.impressions > 0 ? acc.spend  / acc.impressions * 1000 : 0;
  acc.cpc       = acc.clicks      > 0 ? acc.spend  / acc.clicks : 0;
  acc.frequency = acc.impressions > 0 ? acc.freqWeighted / acc.impressions : 0;

  const primaryGoal    = (client.campaignGoals || [])[0]?.goal || 'whatsapp';
  const primaryResults = primaryGoal === 'leads'           ? acc.leads
                       : primaryGoal === 'post_engagement' ? acc.engagements
                       : primaryGoal === 'page_likes'      ? acc.pageLikes
                       : acc.waConvos;
  acc.cpr            = primaryResults > 0 ? acc.spend / primaryResults : 0;
  acc.primaryResults = primaryResults;
  acc.primaryGoal    = primaryGoal;

  let branches = null;
  if (client.clientCode === 'VK') {
    const bMap = {};
    for (const c of campaigns) {
      const b = detectVKBranch(c.campaign_name);
      if (!bMap[b]) bMap[b] = { spend: 0, results: 0, impressions: 0, clicks: 0 };
      bMap[b].spend       += parseFloat(c.spend || 0);
      bMap[b].impressions += parseFloat(c.impressions || 0);
      bMap[b].clicks      += parseFloat(c.clicks || 0);
      bMap[b].results     += extractAction(c.actions, 'onsite_conversion.messaging_first_reply');
    }
    branches = bMap;
  }

  return { totals: acc, branches, campaignCount: campaigns.length };
}

function processEnrichedSummary(campaigns, client, days) {
  const acc = campaigns.reduce((a, c) => {
    const imp = parseFloat(c.impressions || 0);
    a.spend          += parseFloat(c.spend || 0);
    a.reach          += parseFloat(c.reach || 0);
    a.impressions    += imp;
    a.clicks         += parseFloat(c.clicks || 0);
    a.freqWeighted   += parseFloat(c.frequency || 0) * imp;
    // Conversions
    a.waConvos       += extractAction(c.actions, 'onsite_conversion.messaging_first_reply');
    a.leads          += extractAction(c.actions, 'lead');
    a.pageLikes      += extractAction(c.actions, 'like');
    // Engagement
    a.reactions      += extractAction(c.actions, 'post_reaction');
    a.comments       += extractAction(c.actions, 'comment');
    a.shares         += extractAction(c.actions, 'post');
    a.saves          += extractAction(c.actions, 'onsite_conversion.post_save');
    a.postEngagement += extractAction(c.actions, 'post_engagement');
    a.igFollows      += extractAction(c.actions, 'instagram_follow');
    a.pageEngagement += extractAction(c.actions, 'page_engagement');
    // Video
    const vv          = extractAction(c.actions, 'video_view');
    const avgWatch    = extractVideoAction(c.video_avg_time_watched_actions);
    a.videoViews     += vv;
    a.videoP25       += extractVideoAction(c.video_p25_watched_actions);
    a.videoP50       += extractVideoAction(c.video_p50_watched_actions);
    a.videoP75       += extractVideoAction(c.video_p75_watched_actions);
    a.videoP100      += extractVideoAction(c.video_p100_watched_actions);
    a.videoWatchW    += avgWatch * vv;
    return a;
  }, {
    spend:0, reach:0, impressions:0, clicks:0, freqWeighted:0,
    waConvos:0, leads:0, pageLikes:0,
    reactions:0, comments:0, shares:0, saves:0, postEngagement:0, igFollows:0, pageEngagement:0,
    videoViews:0, videoP25:0, videoP50:0, videoP75:0, videoP100:0, videoWatchW:0
  });

  acc.ctr           = acc.impressions > 0 ? acc.clicks / acc.impressions * 100 : 0;
  acc.cpm           = acc.impressions > 0 ? acc.spend  / acc.impressions * 1000 : 0;
  acc.cpc           = acc.clicks      > 0 ? acc.spend  / acc.clicks : 0;
  acc.frequency     = acc.impressions > 0 ? acc.freqWeighted / acc.impressions : 0;
  acc.avgDailySpend = days > 0 ? acc.spend / days : 0;
  acc.videoAvgWatch = acc.videoViews  > 0 ? acc.videoWatchW  / acc.videoViews  : 0;

  const primaryGoal    = (client.campaignGoals || [])[0]?.goal || 'whatsapp';
  const primaryResults = primaryGoal === 'leads'      ? acc.leads
                       : primaryGoal === 'page_likes' ? acc.pageLikes
                       : acc.waConvos;
  acc.cpr            = primaryResults > 0 ? acc.spend / primaryResults : 0;
  acc.primaryResults = primaryResults;
  acc.primaryGoal    = primaryGoal;

  let branches = null;
  if (client.clientCode === 'VK') {
    const bMap = {};
    for (const c of campaigns) {
      const b = detectVKBranch(c.campaign_name);
      if (!bMap[b]) bMap[b] = { spend: 0, results: 0, impressions: 0, clicks: 0 };
      bMap[b].spend       += parseFloat(c.spend || 0);
      bMap[b].impressions += parseFloat(c.impressions || 0);
      bMap[b].clicks      += parseFloat(c.clicks || 0);
      bMap[b].results     += extractAction(c.actions, 'onsite_conversion.messaging_first_reply');
    }
    branches = bMap;
  }

  return { totals: acc, branches };
}

// ── GET /api/monitor/overview ─────────────────────────────────────────────────
app.get('/api/monitor/overview', async (req, res) => {
  try {
    const { range, dateStart: ds, dateStop: de } = req.query;
    const { dateStart, dateStop, rangeKey } = getMonitorDateRange(range, ds, de);
    const todayMYT = getTodayMYT();

    const allClients     = await readClients();
    const visibleClients = req.user.role === 'admin'
      ? allClients
      : allClients.filter(c => Array.isArray(c.assignedUsers) && c.assignedUsers.includes(req.user.id));

    const cards = await Promise.all(visibleClients.map(async (client) => {
      try {
        let cached = await getMonitorCache(client.id, rangeKey);
        if (!cached) {
          const [campaigns, todayCampaigns] = await Promise.all([
            fetchCampaignLevel(client, dateStart, dateStop),
            fetchCampaignLevel(client, todayMYT, todayMYT).catch(() => [])
          ]);
          const todaySpend = todayCampaigns.reduce((s, c) => s + parseFloat(c.spend || 0), 0);
          cached = { campaigns, todaySpend, fetchedAt: new Date().toISOString() };
          await setMonitorCache(client.id, rangeKey, cached);
        }

        const { totals, branches, campaignCount } = processCampaignSummary(cached.campaigns, client);
        const health = calcHealthScore(
          { ctr: totals.ctr, cpm: totals.cpm, cpr: totals.cpr, frequency: totals.frequency },
          client.thresholds || null
        );

        return {
          id: client.id, clientCode: client.clientCode, name: client.name,
          monthlyBudget: client.monthlyBudget || null,
          todaySpend: cached.todaySpend || 0,
          totals, branches, campaignCount, health,
          dateStart, dateStop, rangeKey, cachedAt: cached.fetchedAt
        };
      } catch (err) {
        logMetaError(err, `Monitor overview ${client.clientCode}`);
        return {
          id: client.id, clientCode: client.clientCode, name: client.name,
          error: err.response?.data?.error?.message || err.message,
          health: { score: 'red', breaches: [], usingDefaults: true }
        };
      }
    }));

    res.json({ cards, dateStart, dateStop, rangeKey });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/monitor/:clientId ────────────────────────────────────────────────
app.get('/api/monitor/:clientId', async (req, res) => {
  try {
    const { range, dateStart: ds, dateStop: de } = req.query;
    const { dateStart, dateStop, rangeKey } = getMonitorDateRange(range, ds, de);
    const detailKey = `detail2_${rangeKey}`;
    const days      = calcDays(dateStart, dateStop);
    const prev      = getPreviousPeriod(dateStart, dateStop);
    const prevKey   = `detail2_prev3_${rangeKey}`; // v3: includes prevDaily

    const allClients = await readClients();
    const client     = allClients.find(c => c.id === req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (req.user.role !== 'admin') {
      if (!Array.isArray(client.assignedUsers) || !client.assignedUsers.includes(req.user.id))
        return res.status(403).json({ error: 'Access denied' });
    }

    // Current period detail
    let detail = await getMonitorCache(client.id, detailKey);
    if (!detail) {
      const [campaigns, adsets, ads, daily, activeCampaignCount] = await Promise.all([
        fetchCampaignLevel(client, dateStart, dateStop),
        fetchAdsetLevel(client, dateStart, dateStop),
        fetchAdLevel(client, dateStart, dateStop),
        fetchDailyTrend(client, dateStart, dateStop),
        fetchActiveCampaignsCount(client)
      ]);
      detail = { campaigns, adsets, ads, daily, activeCampaignCount, fetchedAt: new Date().toISOString() };
      await setMonitorCache(client.id, detailKey, detail);
    }

    // Previous period (campaigns + daily for comparison lines)
    let prevDetail = await getMonitorCache(client.id, prevKey);
    if (!prevDetail) {
      const [campaigns, prevDaily] = await Promise.all([
        fetchCampaignLevel(client, prev.dateStart, prev.dateStop),
        fetchDailyTrend(client, prev.dateStart, prev.dateStop)
      ]);
      prevDetail = { campaigns, prevDaily, fetchedAt: new Date().toISOString() };
      await setMonitorCache(client.id, prevKey, prevDetail);
    }

    const { totals, branches } = processEnrichedSummary(detail.campaigns, client, days);
    const { totals: prevTotals } = processEnrichedSummary(prevDetail.campaigns, client, days);
    const health = calcHealthScore(
      { ctr: totals.ctr, cpm: totals.cpm, cpr: totals.cpr, frequency: totals.frequency },
      client.thresholds || null
    );

    res.json({
      client: {
        id: client.id, clientCode: client.clientCode, name: client.name,
        monthlyBudget: client.monthlyBudget || null, thresholds: client.thresholds || null
      },
      totals, prevTotals, branches, health,
      activeCampaignCount: detail.activeCampaignCount || 0,
      campaigns: detail.campaigns,
      adsets: detail.adsets,
      ads: detail.ads,
      daily: detail.daily,
      prevDaily: prevDetail.prevDaily || [],
      dateStart, dateStop,
      prevDateStart: prev.dateStart, prevDateStop: prev.dateStop,
      rangeKey, cachedAt: detail.fetchedAt
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/monitor/:clientId/audience ───────────────────────────────────────
app.get('/api/monitor/:clientId/audience', async (req, res) => {
  try {
    const { range, dateStart: ds, dateStop: de } = req.query;
    const { dateStart, dateStop, rangeKey } = getMonitorDateRange(range, ds, de);
    const audienceKey = `audience_${rangeKey}`;

    const allClients = await readClients();
    const client     = allClients.find(c => c.id === req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (req.user.role !== 'admin') {
      if (!Array.isArray(client.assignedUsers) || !client.assignedUsers.includes(req.user.id))
        return res.status(403).json({ error: 'Access denied' });
    }

    let audience = await getMonitorCache(client.id, audienceKey);
    if (!audience) {
      audience = await fetchAudienceBreakdowns(client, dateStart, dateStop);
      audience.fetchedAt = new Date().toISOString();
      await setMonitorCache(client.id, audienceKey, audience);
    }

    res.json({ ...audience, dateStart, dateStop, rangeKey, cachedAt: audience.fetchedAt });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/monitor/:clientId/diagnose ──────────────────────────────────────
app.post('/api/monitor/:clientId/diagnose', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI diagnosis not configured' });

  try {
    const { range, dateStart: ds, dateStop: de, context } = req.body;
    const { dateStart, dateStop, rangeKey } = getMonitorDateRange(range, ds, de);
    const detailKey = `detail_${rangeKey}`;

    const allClients = await readClients();
    const client     = allClients.find(c => c.id === req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const detailKey2 = `detail2_${rangeKey}`;
    const days = calcDays(dateStart, dateStop);
    let detail = await getMonitorCache(client.id, detailKey2);
    if (!detail) {
      const [campaigns, adsets, ads, daily] = await Promise.all([
        fetchCampaignLevel(client, dateStart, dateStop),
        fetchAdsetLevel(client, dateStart, dateStop),
        fetchAdLevel(client, dateStart, dateStop),
        fetchDailyTrend(client, dateStart, dateStop)
      ]);
      detail = { campaigns, adsets, ads, daily, fetchedAt: new Date().toISOString() };
      await setMonitorCache(client.id, detailKey2, detail);
    }

    const { totals }   = processEnrichedSummary(detail.campaigns, client, days);
    const health       = calcHealthScore(
      { ctr: totals.ctr, cpm: totals.cpm, cpr: totals.cpr, frequency: totals.frequency },
      client.thresholds || null
    );
    const t            = client.thresholds || BENCH_DEFAULTS;
    const usingDefaults = !client.thresholds;

    const topCampaigns = [...detail.campaigns]
      .sort((a, b) => parseFloat(b.spend || 0) - parseFloat(a.spend || 0))
      .slice(0, 5)
      .map(c => `- ${c.campaign_name}: RM ${parseFloat(c.spend||0).toFixed(2)} spend, CTR ${parseFloat(c.ctr||0).toFixed(2)}%, CPM RM ${parseFloat(c.cpm||0).toFixed(2)}, Freq ${parseFloat(c.frequency||0).toFixed(2)}`)
      .join('\n');

    const prompt = `You are a Meta Ads performance analyst for Millecube Digital, a Malaysian digital marketing agency.

Client: ${client.name} (${client.clientCode})
Period: ${dateStart} to ${dateStop} (${days} days)
Thresholds: ${usingDefaults ? 'Malaysian benchmarks (defaults)' : 'Custom thresholds set by admin'}

PERFORMANCE METRICS:
- Total Spend: RM ${totals.spend.toFixed(2)} | Avg Daily: RM ${totals.avgDailySpend.toFixed(2)}
- Reach: ${Math.round(totals.reach).toLocaleString()} | Impressions: ${Math.round(totals.impressions).toLocaleString()}
- CTR: ${totals.ctr.toFixed(2)}% (floor: ${t.ctr}%) | CPM: RM ${totals.cpm.toFixed(2)} (cap: RM ${t.cpm})
- CPC: RM ${totals.cpc.toFixed(2)} | Frequency: ${totals.frequency.toFixed(2)} (cap: ${t.frequency})
- Conversations (WA): ${Math.round(totals.waConvos).toLocaleString()} | CPR: RM ${totals.cpr.toFixed(2)} (cap: RM ${t.cpr})

ENGAGEMENT:
- Post Engagement: ${Math.round(totals.postEngagement).toLocaleString()} (Reactions: ${Math.round(totals.reactions)}, Comments: ${Math.round(totals.comments)}, Shares: ${Math.round(totals.shares)}, Saves: ${Math.round(totals.saves)})
- Video Views: ${Math.round(totals.videoViews).toLocaleString()} | Avg Watch Time: ${totals.videoAvgWatch.toFixed(1)}s

HEALTH SCORE: ${health.score.toUpperCase()}
Breached: ${health.breaches.length === 0 ? 'None' : health.breaches.map(b => `${b.metric} (${b.value.toFixed(2)} vs ${b.threshold} — ${b.direction} threshold)`).join(', ')}

TOP 5 CAMPAIGNS BY SPEND:
${topCampaigns}
${context ? `\nACCOUNT MANAGER NOTES:\n${context}` : ''}

Return your analysis as a JSON array of finding objects (no markdown, raw JSON only):
[
  { "title": "short title (5 words max)", "body": "2-3 sentence finding with specific numbers", "type": "warning|positive|info" },
  ...
]
Include 4-6 findings covering: overall health, top issues (data-backed), actionable recommendations, and one positive. Use RM for currency. Write for a non-technical account manager.`;

    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey });
    const message   = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    let findings = [];
    try {
      const raw = message.content[0].text.trim();
      const jsonStr = raw.startsWith('[') ? raw : raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);
      findings = JSON.parse(jsonStr);
    } catch {
      findings = [{ title: 'AI Analysis', body: message.content[0].text, type: 'info' }];
    }
    res.json({ findings, health, dateStart, dateStop, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[DIAGNOSE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Actions CRUD ──────────────────────────────────────────────────────────────

app.get('/api/monitor/:clientId/actions', async (req, res) => {
  try {
    if (!usingMongo()) return res.json([]);
    const db      = await getDb();
    const actions = await db.collection('actions')
      .find({ clientId: req.params.clientId })
      .sort({ createdAt: -1 }).toArray();
    res.json(actions.map(a => ({ ...a, _id: undefined, replies: a.replies || [] })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/monitor/:clientId/actions', async (req, res) => {
  try {
    const { clientCode, campaignName, metric, issue, recommendation, severity } = req.body;
    if (!issue) return res.status(400).json({ error: 'issue is required' });
    const action = {
      id: uuidv4(), clientId: req.params.clientId, clientCode,
      campaignName, metric, issue, recommendation,
      severity: severity || 'minor', status: 'open',
      assignedTo: null, comment: '',
      createdBy: req.user.username,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    if (usingMongo()) {
      const db = await getDb();
      await db.collection('actions').insertOne(action);
    }
    res.status(201).json({ ...action, _id: undefined });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/monitor/actions/:actionId', async (req, res) => {
  try {
    const updates = { updatedAt: new Date().toISOString() };
    if (req.body.status     !== undefined) updates.status     = req.body.status;
    if (req.body.assignedTo !== undefined) updates.assignedTo = req.body.assignedTo;
    if (req.body.comment    !== undefined) updates.comment    = req.body.comment;
    if (!usingMongo()) return res.json({ ok: true });
    const db = await getDb();
    await db.collection('actions').updateOne({ id: req.params.actionId }, { $set: updates });
    const updated = await db.collection('actions').findOne({ id: req.params.actionId });
    res.json({ ...updated, _id: undefined });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/monitor/actions/:actionId/replies', async (req, res) => {
  try {
    const { message, attachments } = req.body;
    if (!message?.trim() && (!attachments || attachments.length === 0))
      return res.status(400).json({ error: 'Message or attachment required' });
    if (!usingMongo()) return res.status(503).json({ error: 'No database' });
    const reply = {
      replyId:     uuidv4(),
      message:     message || '',
      author:      req.user.username,
      createdAt:   new Date().toISOString(),
      attachments: (attachments || []).map(a => ({ name: a.name, type: a.type, data: a.data }))
    };
    const db = await getDb();
    const result = await db.collection('actions').updateOne(
      { id: req.params.actionId },
      { $push: { replies: reply }, $set: { updatedAt: new Date().toISOString() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Action not found' });
    res.json(reply);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Performance Table ─────────────────────────────────────────────────────────
app.get('/api/performance/table', async (req, res) => {
  try {
    const { clientIds, range, dateStart: ds, dateStop: de } = req.query;
    const { dateStart, dateStop, rangeKey } = getMonitorDateRange(range, ds, de);
    const allClients = await readClients();
    let visible = req.user.role === 'admin'
      ? allClients
      : allClients.filter(c => Array.isArray(c.assignedUsers) && c.assignedUsers.includes(req.user.id));
    if (clientIds && clientIds !== 'all') {
      const ids = clientIds.split(',');
      visible = visible.filter(c => ids.includes(c.id));
    }
    const clients = (await Promise.all(visible.map(async (client) => {
      try {
        const cacheKey = `perf_v5_${rangeKey}`;
        let cached = await getMonitorCache(client.id, cacheKey);
        if (!cached) {
          const [campIns, adsetIns, adIns, campStruct, adsetStruct, adStruct] = await Promise.all([
            fetchPerfCampaignLevel(client, dateStart, dateStop).catch(() => []),
            fetchPerfAdsetLevel(client, dateStart, dateStop).catch(() => []),
            fetchPerfAdLevel2(client, dateStart, dateStop).catch(() => []),
            fetchCampaignStructure(client).catch(() => []),
            fetchAdsetStructure(client).catch(() => []),
            fetchAdStructure(client).catch(() => []),
          ]);
          cached = { campaigns: buildPerfHierarchy(campIns, adsetIns, adIns, campStruct, adsetStruct, adStruct), fetchedAt: new Date().toISOString() };
          await setMonitorCache(client.id, cacheKey, cached);
        }
        return { clientId: client.id, clientCode: client.clientCode, clientName: client.name, campaigns: cached.campaigns || [] };
      } catch (err) {
        console.error(`[PERF] Failed for client ${client.clientCode}:`, err.message);
        return { clientId: client.id, clientCode: client.clientCode, clientName: client.name, campaigns: [], error: err.message };
      }
    }))).filter(Boolean);
    res.json({ clients, dateStart, dateStop });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/performance/toggle', async (req, res) => {
  try {
    const { clientId, objectId, status } = req.body;
    if (!clientId || !objectId || !['ACTIVE', 'PAUSED'].includes(status))
      return res.status(400).json({ error: 'clientId, objectId, status (ACTIVE|PAUSED) required' });
    const allClients = await readClients();
    const client = allClients.find(c => c.id === clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (req.user.role !== 'admin' && !(Array.isArray(client.assignedUsers) && client.assignedUsers.includes(req.user.id)))
      return res.status(403).json({ error: 'Access denied' });
    await axios.post(`https://graph.facebook.com/v19.0/${objectId}`, null, {
      params: { access_token: client.accessToken, status }
    });
    if (usingMongo()) {
      const db = await getDb();
      await db.collection('monitorCache').deleteMany({ clientId: client.id, key: /^perf_/ });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// ── Compare Monitor ───────────────────────────────────────────────────────────

function pctDelta(curr, prev) {
  if (prev === null || prev === undefined || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

const DELTA_DEFAULTS = {
  costPerResult: { good: 5,  bad: 10 },
  results:       { good: 5,  bad: 15 },
  ctr:           { good: 2,  bad: 10 },
  cpm:           { good: 5,  bad: 10 },
  frequency:     { good: 5,  bad: 15 },
};

function computeCompareHealth(curr, prev, deltaThresholds, weights) {
  const w = weights || { costPerResult: 35, results: 25, ctr: 20, cpm: 10, frequency: 10 };
  const dt = deltaThresholds || DELTA_DEFAULTS;
  const signals = [];
  let score = 0, totalWeight = 0;

  const addSig = (metric, delta, lowerIsBetter) => {
    if (delta === null || delta === undefined) return;
    const t = dt[metric] || DELTA_DEFAULTS[metric] || { good: 5, bad: 10 };
    const wt = w[metric] || 0;
    let sig;
    if (lowerIsBetter) {
      if (delta >= t.bad)       sig = 'red';
      else if (delta <= -t.good) sig = 'green';
      else if (Math.abs(delta) < 2) sig = 'grey';
      else sig = 'yellow';
    } else {
      if (delta <= -t.bad)      sig = 'red';
      else if (delta >= t.good) sig = 'green';
      else if (Math.abs(delta) < 2) sig = 'grey';
      else sig = 'yellow';
    }
    signals.push({ metric, delta, sig });
    score += (sig === 'green' ? 100 : sig === 'yellow' ? 60 : sig === 'grey' ? 70 : 20) * wt;
    totalWeight += wt;
  };

  if (curr.costPerResult > 0 && prev?.costPerResult > 0)
    addSig('costPerResult', pctDelta(curr.costPerResult, prev.costPerResult), true);
  if (prev?.results > 0)
    addSig('results', pctDelta(curr.results || 0, prev.results), false);
  if (prev?.ctr > 0)
    addSig('ctr', pctDelta(curr.ctr || 0, prev.ctr), false);
  if (prev?.cpm > 0)
    addSig('cpm', pctDelta(curr.cpm || 0, prev.cpm), true);
  if (prev?.frequency > 0)
    addSig('frequency', pctDelta(curr.frequency || 0, prev.frequency), true);

  const healthScore = totalWeight > 0 ? Math.round(score / totalWeight) : 50;
  const reds   = signals.filter(s => s.sig === 'red').length;
  const greens = signals.filter(s => s.sig === 'green').length;
  const freqRed = signals.find(s => s.metric === 'frequency' && s.sig === 'red');

  let badge = 'KEEP';
  if (reds >= 2 || healthScore < 35)          badge = 'PAUSE';
  else if (reds === 1 && freqRed)             badge = 'REFRESH';
  else if (reds === 1 || healthScore < 55)    badge = 'WATCH';
  else if (greens >= 3 && healthScore >= 75)  badge = 'SCALE';

  return { healthScore, signals, badge };
}

app.get('/api/compare', async (req, res) => {
  try {
    const { clientId, range, dateStart: ds, dateStop: de, level = 'campaign' } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const { dateStart, dateStop, rangeKey } = getMonitorDateRange(range, ds, de);
    const prev = getPreviousPeriod(dateStart, dateStop);

    const allClients = await readClients();
    const client = allClients.find(c => c.id === clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (req.user.role !== 'admin' && !(Array.isArray(client.assignedUsers) && client.assignedUsers.includes(req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const cacheKey     = `compare_v2_${level}_${rangeKey}`;
    const prevCacheKey = `compare_v2_prev_${level}_${rangeKey}`;
    const structKey    = `struct_v2_${rangeKey}`;

    let structData = await getMonitorCache(client.id, structKey);
    if (!structData) {
      const [campStruct, adsetStruct, adStruct] = await Promise.all([
        fetchCampaignStructure(client).catch(() => []),
        fetchAdsetStructure(client).catch(() => []),
        fetchAdStructure(client).catch(() => []),
      ]);
      structData = { campStruct, adsetStruct, adStruct, fetchedAt: new Date().toISOString() };
      await setMonitorCache(client.id, structKey, structData);
    }

    let currData = await getMonitorCache(client.id, cacheKey);
    if (!currData) {
      let rows = [];
      if (level === 'campaign')     rows = await fetchPerfCampaignLevel(client, dateStart, dateStop).catch(() => []);
      else if (level === 'adset')   rows = await fetchPerfAdsetLevel(client, dateStart, dateStop).catch(() => []);
      else                          rows = await fetchPerfAdLevel2(client, dateStart, dateStop).catch(() => []);
      currData = { rows, fetchedAt: new Date().toISOString() };
      await setMonitorCache(client.id, cacheKey, currData);
    }

    let prevData = await getMonitorCache(client.id, prevCacheKey);
    if (!prevData) {
      let rows = [];
      if (level === 'campaign')     rows = await fetchPerfCampaignLevel(client, prev.dateStart, prev.dateStop).catch(() => []);
      else if (level === 'adset')   rows = await fetchPerfAdsetLevel(client, prev.dateStart, prev.dateStop).catch(() => []);
      else                          rows = await fetchPerfAdLevel2(client, prev.dateStart, prev.dateStop).catch(() => []);
      prevData = { rows, fetchedAt: new Date().toISOString() };
      await setMonitorCache(client.id, prevCacheKey, prevData);
    }

    const campMap = {}, adsetMap = {}, adMapS = {};
    (structData.campStruct || []).forEach(c => { campMap[c.id] = c; });
    (structData.adsetStruct || []).forEach(a => { adsetMap[a.id] = a; });
    (structData.adStruct || []).forEach(a => { adMapS[a.id] = a; });

    const prevMap = {};
    (prevData.rows || []).forEach(r => {
      const id = level === 'campaign' ? r.campaign_id : level === 'adset' ? r.adset_id : r.ad_id;
      prevMap[id] = r;
    });

    const parseBudget = s => { const n = parseFloat(s || 0); return n > 0 ? n / 100 : null; };

    const rows = (currData.rows || []).map(r => {
      const id   = level === 'campaign' ? r.campaign_id : level === 'adset' ? r.adset_id : r.ad_id;
      const name = level === 'campaign' ? r.campaign_name : level === 'adset' ? r.adset_name : r.ad_name;

      let status = 'UNKNOWN', budget = null, objective = '', optGoal = '';
      let parentId = null, parentName = null, info = null;

      if (level === 'campaign') {
        const cs = campMap[r.campaign_id] || {};
        status = cs.effective_status || 'UNKNOWN';
        const db = parseBudget(cs.daily_budget), lb = parseBudget(cs.lifetime_budget);
        budget = db ? { type: 'daily', amount: db } : lb ? { type: 'lifetime', amount: lb } : null;
        objective = cs.objective || '';
        info = { objective: cs.objective || '' };
      } else if (level === 'adset') {
        const as = adsetMap[r.adset_id] || {};
        status = as.effective_status || 'UNKNOWN';
        const db = parseBudget(as.daily_budget), lb = parseBudget(as.lifetime_budget);
        budget = db ? { type: 'daily', amount: db } : lb ? { type: 'lifetime', amount: lb } : null;
        optGoal = as.optimization_goal || '';
        parentId = r.campaign_id;
        parentName = r.campaign_name;
        info = {
          optimization_goal: as.optimization_goal || '',
          billing_event: as.billing_event || '',
          targeting: as.targeting || null,
        };
      } else {
        const ad = adMapS[r.ad_id] || {};
        status = ad.effective_status || 'UNKNOWN';
        parentId = r.adset_id;
        parentName = r.adset_name;
        optGoal = (adsetMap[r.adset_id] || {}).optimization_goal || '';
        objective = '';
      }

      const curr = extractPerfMetrics(r);
      const actionType = actionTypeForGoal(optGoal) || actionTypeForObjective(objective);
      let results = 0, costPerResult = 0;
      if (actionType) {
        const cpa = extractCostPerAction(r.cost_per_unique_action_type, actionType) ||
                    extractCostPerAction(r.cost_per_action_type, actionType);
        results = cpa > 0 ? Math.round(curr.spend / cpa) : extractAction(r.actions, actionType);
        costPerResult = cpa || (results > 0 ? curr.spend / results : 0);
      }

      const prevRow = prevMap[id];
      let prevM = null, prevResults = 0, prevCostPerResult = 0;
      if (prevRow) {
        prevM = extractPerfMetrics(prevRow);
        if (actionType) {
          const prevCpa = extractCostPerAction(prevRow.cost_per_unique_action_type, actionType) ||
                          extractCostPerAction(prevRow.cost_per_action_type, actionType);
          prevResults = prevCpa > 0 ? Math.round(prevM.spend / prevCpa) : extractAction(prevRow.actions, actionType);
          prevCostPerResult = prevCpa || (prevResults > 0 ? prevM.spend / prevResults : 0);
        }
      }

      const deltas = prevM ? {
        spend:         pctDelta(curr.spend,        prevM.spend),
        results:       pctDelta(results,            prevResults),
        ctr:           pctDelta(curr.ctr,           prevM.ctr),
        cpm:           pctDelta(curr.cpm,           prevM.cpm),
        frequency:     pctDelta(curr.frequency,     prevM.frequency),
        costPerResult: pctDelta(costPerResult,       prevCostPerResult),
        impressions:   pctDelta(curr.impressions,   prevM.impressions),
        reach:         pctDelta(curr.reach,         prevM.reach),
      } : null;

      const { healthScore, signals, badge } = computeCompareHealth(
        { ...curr, results, costPerResult },
        prevM ? { ...prevM, results: prevResults, costPerResult: prevCostPerResult } : null,
        client.compareDeltaThresholds || null,
        client.compareWeights || null
      );

      return {
        id, name, status, budget, level, info,
        objective: objective || optGoal, parentId, parentName,
        curr: { ...curr, results, costPerResult },
        prev: prevM ? { ...prevM, results: prevResults, costPerResult: prevCostPerResult } : null,
        deltas, healthScore, signals, badge,
      };
    });

    res.json({
      rows, level, dateStart, dateStop,
      prevDateStart: prev.dateStart, prevDateStop: prev.dateStop,
      client: { id: client.id, clientCode: client.clientCode, name: client.name, compareWeights: client.compareWeights || null, compareDeltaThresholds: client.compareDeltaThresholds || null },
      cachedAt: currData.fetchedAt,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/compare/settings', async (req, res) => {
  try {
    const allClients = await readClients();
    const visible = req.user.role === 'admin'
      ? allClients
      : allClients.filter(c => Array.isArray(c.assignedUsers) && c.assignedUsers.includes(req.user.id));
    const settings = visible.map(c => ({
      id: c.id, name: c.name, clientCode: c.clientCode,
      weights: c.compareWeights || { costPerResult: 35, results: 25, ctr: 20, cpm: 10, frequency: 10 },
      deltaThresholds: c.compareDeltaThresholds || DELTA_DEFAULTS,
    }));
    res.json({ settings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/compare/settings/:clientId', requireAdmin, async (req, res) => {
  try {
    const { weights, deltaThresholds } = req.body;
    if (!weights) return res.status(400).json({ error: 'weights required' });
    const total = Object.values(weights).reduce((s, v) => s + Number(v), 0);
    if (Math.abs(total - 100) > 1) return res.status(400).json({ error: 'Weights must sum to 100' });

    const update = { compareWeights: weights };
    if (deltaThresholds) update.compareDeltaThresholds = deltaThresholds;

    if (usingMongo()) {
      const db = await getDb();
      await db.collection('clients').updateOne({ id: req.params.clientId }, { $set: update });
    } else {
      const clients = fileRead(FILE.clients);
      const idx = clients.findIndex(c => c.id === req.params.clientId);
      if (idx === -1) return res.status(404).json({ error: 'Client not found' });
      Object.assign(clients[idx], update);
      fileWrite(FILE.clients, clients);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/compare/budget', async (req, res) => {
  try {
    const { clientId, objectId, budgetType, budgetAmount } = req.body;
    if (!clientId || !objectId || !budgetType || budgetAmount === undefined)
      return res.status(400).json({ error: 'clientId, objectId, budgetType, budgetAmount required' });

    const allClients = await readClients();
    const client = allClients.find(c => c.id === clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (req.user.role !== 'admin' && !(Array.isArray(client.assignedUsers) && client.assignedUsers.includes(req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const amountCents = Math.round(parseFloat(budgetAmount) * 100);
    const params = { access_token: client.accessToken };
    if (budgetType === 'daily')    params.daily_budget    = amountCents;
    else                           params.lifetime_budget = amountCents;

    await axios.post(`https://graph.facebook.com/v19.0/${objectId}`, null, { params });

    if (usingMongo()) {
      const db = await getDb();
      await db.collection('monitorCache').deleteMany({ clientId: client.id, rangeKey: /^compare_v2_/ });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

app.get('/api/compare/ad-creative/:adId', async (req, res) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const allClients = await readClients();
    const client = allClients.find(c => c.id === clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (req.user.role !== 'admin' && !(Array.isArray(client.assignedUsers) && client.assignedUsers.includes(req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const r = await axios.get(`https://graph.facebook.com/v19.0/${req.params.adId}`, {
      params: {
        access_token: client.accessToken,
        fields: 'creative{id,name,body,title,description,call_to_action_type,image_url,thumbnail_url,object_story_spec}',
      },
    });

    const creative = r.data.creative || {};
    const spec = creative.object_story_spec || {};

    let mediaType = 'none', mediaUrl = null, thumbnailUrl = null;
    let headline    = creative.title       || null;
    let primaryText = creative.body        || null;
    let description = creative.description || null;
    let ctaButton   = creative.call_to_action_type || null;

    if (spec.video_data) {
      mediaType    = 'video';
      thumbnailUrl = spec.video_data.thumbnail_url || null;
      mediaUrl     = spec.video_data.video_id
        ? `https://www.facebook.com/video/${spec.video_data.video_id}`
        : null;
      headline    = headline    || spec.video_data.title       || null;
      primaryText = primaryText || spec.video_data.message     || null;
      description = description || spec.video_data.description || null;
      ctaButton   = ctaButton   || spec.video_data.call_to_action?.type || null;
    } else if (spec.link_data) {
      mediaType    = 'image';
      mediaUrl     = spec.link_data.picture || creative.image_url || null;
      thumbnailUrl = mediaUrl;
      headline    = headline    || spec.link_data.name        || null;
      primaryText = primaryText || spec.link_data.message     || null;
      description = description || spec.link_data.description || null;
      ctaButton   = ctaButton   || spec.link_data.call_to_action?.type || null;
    } else if (spec.template_data) {
      mediaType   = 'carousel';
      headline    = headline    || spec.template_data.name    || null;
      primaryText = primaryText || spec.template_data.message || null;
      ctaButton   = ctaButton   || spec.template_data.call_to_action?.type || null;
    } else if (creative.image_url) {
      mediaType = 'image';
      mediaUrl  = thumbnailUrl = creative.image_url;
    } else if (creative.thumbnail_url) {
      mediaType    = 'video';
      thumbnailUrl = creative.thumbnail_url;
    }

    res.json({ adId: req.params.adId, creativeName: creative.name || null, headline, primaryText, description, ctaButton, mediaType, mediaUrl, thumbnailUrl });
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// ── Budget: Helpers ───────────────────────────────────────────────────────────

function getCurrentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getBudgetMonths() {
  const now = new Date();
  const months = [];
  for (let i = -2; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function budgetMonthLabel(yyyyMM) {
  const [y, m] = yyyyMM.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleString('en-MY', { month: 'long', year: 'numeric' });
}

async function getBudgetDoc(clientId, month) {
  if (!usingMongo()) return null;
  const db  = await getDb();
  const doc = await db.collection('budgets').findOne({ clientId, month });
  return doc ? { ...doc, _id: undefined } : null;
}

async function saveBudgetDoc(doc) {
  if (!usingMongo()) return doc;
  const db = await getDb();
  const { _id, ...clean } = doc;
  await db.collection('budgets').replaceOne(
    { clientId: clean.clientId, month: clean.month },
    clean,
    { upsert: true }
  );
  return clean;
}

// ── Budget: Routes ────────────────────────────────────────────────────────────

// GET /api/budget — all visible clients + budgets for 5-month window
app.get('/api/budget', async (req, res) => {
  try {
    const allClients     = await readClients();
    const visibleClients = req.user.role === 'admin'
      ? allClients
      : allClients.filter(c => Array.isArray(c.assignedUsers) && c.assignedUsers.includes(req.user.id));

    const months       = getBudgetMonths();
    const currentMonth = getCurrentMonthStr();

    const clients = await Promise.all(visibleClients.map(async (client) => {
      let budgetMap = {};
      if (usingMongo()) {
        const db   = await getDb();
        const docs = await db.collection('budgets')
          .find({ clientId: client.id, month: { $in: months } }).toArray();
        docs.forEach(d => { budgetMap[d.month] = { ...d, _id: undefined }; });
      }
      return {
        id:            client.id,
        clientCode:    client.clientCode,
        name:          client.name,
        budgetEditors: client.budgetEditors || [],
        months:        months.map(m => ({ month: m, budget: budgetMap[m] || null }))
      };
    }));

    res.json({ clients, months, currentMonth });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/budget/:clientId — full budget history for one client
app.get('/api/budget/:clientId', async (req, res) => {
  try {
    const allClients = await readClients();
    const client     = allClients.find(c => c.id === req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (req.user.role !== 'admin') {
      if (!Array.isArray(client.assignedUsers) || !client.assignedUsers.includes(req.user.id))
        return res.status(403).json({ error: 'Access denied' });
    }

    if (!usingMongo()) return res.json({
      client:  { id: client.id, clientCode: client.clientCode, name: client.name },
      budgets: []
    });

    const db      = await getDb();
    const budgets = await db.collection('budgets')
      .find({ clientId: client.id }).sort({ month: -1 }).toArray();

    res.json({
      client:  { id: client.id, clientCode: client.clientCode, name: client.name },
      budgets: budgets.map(b => ({ ...b, _id: undefined }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/budget/:clientId/:month/confirm — admin only
app.post('/api/budget/:clientId/:month/confirm', requireAdmin, async (req, res) => {
  try {
    const { clientId, month } = req.params;
    if (!usingMongo()) return res.status(503).json({ error: 'MongoDB required' });

    const allClients = await readClients();
    const client     = allClients.find(c => c.id === clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const existing = await getBudgetDoc(clientId, month);
    if (!existing) return res.status(404).json({ error: 'No budget set for this month' });
    if (existing.confirmed) return res.json(existing);

    const now     = new Date().toISOString();
    const updated = {
      ...existing,
      confirmed: true, confirmedBy: req.user.username, confirmedAt: now,
      updatedAt: now,
      log: [...(existing.log || []), {
        action: 'confirmed', fromAmount: null, toAmount: existing.amount,
        by: req.user.username, at: now, note: req.body.note || null
      }]
    };
    await saveBudgetDoc(updated);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/budget/:clientId/:month/unconfirm — admin only
app.post('/api/budget/:clientId/:month/unconfirm', requireAdmin, async (req, res) => {
  try {
    const { clientId, month } = req.params;
    if (!usingMongo()) return res.status(503).json({ error: 'MongoDB required' });

    const allClients = await readClients();
    const client     = allClients.find(c => c.id === clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const existing = await getBudgetDoc(clientId, month);
    if (!existing) return res.status(404).json({ error: 'No budget set for this month' });

    const now     = new Date().toISOString();
    const updated = {
      ...existing,
      confirmed: false, confirmedBy: null, confirmedAt: null,
      updatedAt: now,
      log: [...(existing.log || []), {
        action: 'unconfirmed', fromAmount: null, toAmount: existing.amount,
        by: req.user.username, at: now, note: req.body.note || null
      }]
    };
    await saveBudgetDoc(updated);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/budget/:clientId/:month — create or update
app.post('/api/budget/:clientId/:month', async (req, res) => {
  try {
    const { clientId, month } = req.params;
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
    if (!usingMongo()) return res.status(503).json({ error: 'MongoDB required' });

    const allClients = await readClients();
    const client     = allClients.find(c => c.id === clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (req.user.role !== 'admin') {
      const editors = Array.isArray(client.budgetEditors) ? client.budgetEditors : [];
      if (!editors.includes(req.user.id))
        return res.status(403).json({ error: 'You do not have permission to edit this budget' });
    }

    const { amount, note } = req.body;
    if (amount === undefined || isNaN(parseFloat(amount)))
      return res.status(400).json({ error: 'amount is required and must be a number' });

    const now      = new Date().toISOString();
    const existing = await getBudgetDoc(clientId, month);

    if (!existing) {
      const doc = {
        id: uuidv4(), clientId, clientCode: client.clientCode, month,
        amount: parseFloat(amount),
        confirmed: false, confirmedBy: null, confirmedAt: null,
        createdBy: req.user.username, createdAt: now, updatedAt: now,
        log: [{ action: 'created', fromAmount: null, toAmount: parseFloat(amount), by: req.user.username, at: now, note: note || null }]
      };
      await saveBudgetDoc(doc);
      return res.status(201).json(doc);
    }

    const amountChanged = parseFloat(amount) !== existing.amount;
    const updated = {
      ...existing,
      amount: parseFloat(amount),
      updatedAt: now,
      ...(amountChanged ? { confirmed: false, confirmedBy: null, confirmedAt: null } : {}),
      log: [...(existing.log || []), {
        action: 'updated', fromAmount: existing.amount, toAmount: parseFloat(amount),
        by: req.user.username, at: now, note: note || null
      }]
    };
    await saveBudgetDoc(updated);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Budget: End-of-month reminder cron ───────────────────────────────────────
// Fires 9AM MYT on days 28–31; guard inside confirms it is the actual last day
cron.schedule('0 9 28-31 * *', async () => {
  const myt     = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
  const lastDay = new Date(myt.getFullYear(), myt.getMonth() + 1, 0).getDate();
  if (myt.getDate() !== lastDay) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log('[BUDGET CRON] No RESEND_API_KEY — skipping'); return; }

  try {
    const allClients   = await readClients();
    const currentMonth = getCurrentMonthStr();
    const nextD        = new Date(myt.getFullYear(), myt.getMonth() + 1, 1);
    const nextMonth    = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;

    const pending = [];
    for (const client of allClients) {
      for (const month of [currentMonth, nextMonth]) {
        const budget = await getBudgetDoc(client.id, month);
        if (!budget || !budget.confirmed) {
          pending.push({
            name: client.name, code: client.clientCode, month,
            amount: budget ? budget.amount : null
          });
        }
      }
    }
    if (pending.length === 0) { console.log('[BUDGET CRON] All budgets confirmed — no email'); return; }

    const rows = pending.map(r => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${r.code} — ${r.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${r.month}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${r.amount !== null ? `RM ${parseFloat(r.amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}` : 'Not set'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:${r.amount !== null ? '#cc8800' : '#cc3333'}">${r.amount !== null ? '⚠ Set, unconfirmed' : '— Not set'}</td>
      </tr>`).join('');

    const subject = `⚠️ Millecube Ads Hub — Budget confirmation needed for ${budgetMonthLabel(nextMonth)}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;color:#222">
        <div style="background:#07503c;padding:24px 32px;border-radius:8px 8px 0 0">
          <h1 style="color:#32cd32;margin:0;font-size:22px">Millecube Ads Hub</h1>
          <p style="color:#aaa;margin:6px 0 0">Budget Confirmation Reminder</p>
        </div>
        <div style="padding:28px 32px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px">
          <h2 style="color:#cc3333;margin-top:0">⚠️ Budgets pending confirmation</h2>
          <p style="color:#555">Please confirm the following client budgets before month-end:</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead><tr style="background:#f5f5f5">
              <th style="padding:8px 12px;text-align:left">Client</th>
              <th style="padding:8px 12px;text-align:left">Month</th>
              <th style="padding:8px 12px;text-align:left">Amount</th>
              <th style="padding:8px 12px;text-align:left">Status</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin-top:24px">
            <a href="https://millecube-ads-hub.vercel.app/budget" style="background:#07503c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Open Budget Manager</a>
          </p>
          <p style="font-size:12px;color:#aaa;margin-top:32px;border-top:1px solid #eee;padding-top:12px">Millecube Digital · Automated Budget Reminder · Do not reply</p>
        </div>
      </div>`;

    const resend = new Resend(apiKey);
    const to     = process.env.EMAIL_TO   || 'hello@millecube.com';
    const from   = process.env.EMAIL_FROM || 'Millecube Ads Hub <onboarding@resend.dev>';
    const { data, error } = await resend.emails.send({ from, to, subject, html });
    if (error) console.error('[BUDGET CRON] Email failed:', JSON.stringify(error));
    else console.log(`[BUDGET CRON] Sent — ${pending.length} pending — id: ${data.id}`);
  } catch (err) { console.error('[BUDGET CRON] Error:', err.message); }
}, { timezone: 'Asia/Kuala_Lumpur' });

// ── Site Settings (logo etc.) ─────────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection('siteSettings').findOne({ _id: 'main' });
    res.json({ logo: doc?.logo || null, logoName: doc?.logoName || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings/logo', requireAdmin, async (req, res) => {
  try {
    const { logo, logoName } = req.body;
    if (!logo) return res.status(400).json({ error: 'No image provided' });
    // Enforce ~10MB limit on base64 string (~13.3MB encoded)
    if (logo.length > 13_500_000) return res.status(400).json({ error: 'Image too large. Max ~10MB.' });
    const db = await getDb();
    await db.collection('siteSettings').updateOne(
      { _id: 'main' },
      { $set: { _id: 'main', logo, logoName: logoName || 'logo', updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/settings/logo', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('siteSettings').updateOne({ _id: 'main' }, { $unset: { logo: '', logoName: '' } }, { upsert: true });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🟢 Millecube Ads Hub Backend running on http://localhost:${PORT}`);
  try { await ensureDefaultUser(); } catch (e) { console.error('[AUTH] Failed to init user:', e.message); }
  try { await loadAllSchedules(); } catch (e) { console.error('[CRON] Failed to load schedules:', e.message); }
});
