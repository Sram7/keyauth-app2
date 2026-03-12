/**
 * Serveur d'authentification + panel admin
 * Stockage JSON (aucune compilation, pas de Python requis)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'Sramtwo';
const ADMIN_PASS = process.env.ADMIN_PASS || 'fh839ZHF3hefuiehfezF83';
const SYNC_SECRET = process.env.SYNC_SECRET || '';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { keys: [], sessions: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function nextId(arr) {
  if (arr.length === 0) return 1;
  return Math.max(...arr.map((x) => x.id)) + 1;
}

// --- Sync des clés depuis le panel (bouton « Sync serveur ») ---
app.post('/api/sync-keys', (req, res) => {
  if (!SYNC_SECRET) return res.status(500).json({ ok: false, error: 'SYNC_SECRET non configuré' });
  const { secret, keys: rawKeys } = req.body || {};
  if ((secret || '') !== SYNC_SECRET) return res.status(401).json({ ok: false, error: 'secret_invalide' });
  const keysArray = Array.isArray(rawKeys) ? rawKeys : [];
  const data = loadData();
  let nextIdVal = 1;
  data.keys = keysArray.map((k) => {
    const id = k.id && Number.isInteger(k.id) ? k.id : nextIdVal++;
    if (nextIdVal <= id) nextIdVal = id + 1;
    return {
      id,
      key_text: (k.key_text || k.key || '').trim() || String(id),
      product: k.product || 'External Cheat',
      created_at: k.created_at || new Date().toISOString(),
      expires_at: k.expires_at || null,
      revoked: k.revoked ? 1 : 0,
      note: k.note || null,
      last_used_at: k.last_used_at || null,
      use_count: k.use_count || 0,
      last_use_hwid: k.last_use_hwid || null,
      last_use_ip: k.last_use_ip || null,
      last_use_discord_id: k.last_use_discord_id || null
    };
  });
  saveData(data);
  return res.json({ ok: true, count: data.keys.length });
});

// --- Validation (client C++) — enregistre HWID, IP, Discord ID à chaque connexion ---
app.post('/api/validate', (req, res) => {
  const { key, hwid, discord_id } = req.body || {};
  const keyStr = (key || '').trim();
  if (!keyStr) return res.json({ valid: false, error: 'key_required' });
  const data = loadData();
  const row = data.keys.find((k) => k.key_text === keyStr && !k.revoked);
  if (!row) return res.json({ valid: false, error: 'invalid_key' });
  const now = new Date().toISOString();
  if (row.expires_at && row.expires_at < now) return res.json({ valid: false, error: 'expired' });
  row.last_used_at = now;
  row.use_count = (row.use_count || 0) + 1;
  row.last_use_hwid = (hwid && typeof hwid === 'string') ? hwid.trim() : null;
  row.last_use_ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || null;
  row.last_use_discord_id = (discord_id && typeof discord_id === 'string') ? discord_id.trim() : null;
  saveData(data);
  return res.json({ valid: true, product: 'External Cheat' });
});

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.body?.token;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const data = loadData();
  if (!data.sessions.some((s) => s.token === token)) return res.status(401).json({ error: 'invalid_token' });
  next();
}

app.post('/api/login', (req, res) => {
  const { user, password } = req.body || {};
  if (user !== ADMIN_USER || password !== ADMIN_PASS) return res.status(401).json({ error: 'invalid_credentials' });
  const token = require('crypto').randomBytes(32).toString('hex');
  const data = loadData();
  if (!data.sessions) data.sessions = [];
  data.sessions.push({ token });
  saveData(data);
  res.json({ token, user: ADMIN_USER });
});

app.get('/api/keys', requireAdmin, (req, res) => {
  const data = loadData();
  const keys = (data.keys || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ keys });
});

function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) {
    if (i) s += '-';
    for (let j = 0; j < 4; j++) s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

app.post('/api/keys', requireAdmin, (req, res) => {
  const { key, count = 1, product = 'External Cheat', expires_at, note } = req.body || {};
  const data = loadData();
  if (!data.keys) data.keys = [];
  const keysCreated = [];
  const toCreate = count === 1 && key ? [key.trim()] : [];
  if (count > 1 && count <= 100) for (let i = 0; i < count; i++) toCreate.push(generateKey());
  else if (key) toCreate.push(key.trim());
  if (toCreate.length === 0) return res.status(400).json({ error: 'provide key or count (1-100)' });
  const existing = new Set(data.keys.map((k) => k.key_text));
  for (const k of toCreate) {
    if (!k || existing.has(k)) continue;
    const id = nextId(data.keys);
    data.keys.push({
      id,
      key_text: k,
      product: product || 'External Cheat',
      created_at: new Date().toISOString(),
      expires_at: expires_at || null,
      revoked: 0,
      note: note || null,
      last_used_at: null,
      use_count: 0,
      last_use_hwid: null,
      last_use_ip: null,
      last_use_discord_id: null
    });
    existing.add(k);
    keysCreated.push(k);
  }
  saveData(data);
  res.json({ created: keysCreated.length, keys: keysCreated, errors: [] });
});

app.delete('/api/keys/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid_id' });
  const data = loadData();
  const len = data.keys.length;
  data.keys = data.keys.filter((k) => k.id !== id);
  saveData(data);
  res.json({ deleted: len - data.keys.length });
});

app.patch('/api/keys/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { revoked } = req.body || {};
  if (isNaN(id)) return res.status(400).json({ error: 'invalid_id' });
  const data = loadData();
  const row = data.keys.find((k) => k.id === id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  row.revoked = revoked ? 1 : 0;
  saveData(data);
  res.json({ ok: true });
});

app.put('/api/keys/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { note, expires_at, product } = req.body || {};
  if (isNaN(id)) return res.status(400).json({ error: 'invalid_id' });
  const data = loadData();
  const row = data.keys.find((k) => k.id === id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (note !== undefined) row.note = note;
  if (expires_at !== undefined) row.expires_at = expires_at || null;
  if (product !== undefined) row.product = product;
  saveData(data);
  res.json({ ok: true });
});

app.get('/api/stats', requireAdmin, (req, res) => {
  const data = loadData();
  const keys = data.keys || [];
  const now = new Date().toISOString();
  const active = keys.filter((k) => !k.revoked).length;
  const expired = keys.filter((k) => k.expires_at && k.expires_at < now).length;
  res.json({
    total: keys.length,
    active,
    revoked: keys.length - active,
    expired
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Auth server: http://localhost:' + PORT);
  console.log('Admin: ' + ADMIN_USER + ' / (voir .env pour ADMIN_PASS)');
});
