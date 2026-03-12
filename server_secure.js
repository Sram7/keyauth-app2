/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVEUR D'AUTHENTIFICATION ULTRA-SÉCURISÉ
 *  Protection maximale : HMAC-SHA256, Rate Limiting, IP Whitelist, Anti-Brute
 * ═══════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';
const SHARED_SECRET = process.env.SHARED_SECRET || 'your-ultra-secret-key-change-me';
const SYNC_SECRET = process.env.SYNC_SECRET || 'sync-secret-change-me';

// Configuration de sécurité
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requêtes par minute max
const MAX_FAILED_ATTEMPTS = 5; // 5 tentatives échouées avant ban temporaire
const BAN_DURATION = 15 * 60 * 1000; // 15 minutes de ban

// Stockage en mémoire des tentatives et bans
const requestCounts = new Map(); // IP -> { count, timestamp }
const failedAttempts = new Map(); // IP -> { count, timestamp }
const bannedIPs = new Map(); // IP -> timestamp de fin de ban

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');
const LOGS_FILE = path.join(__dirname, 'security_logs.json');

// ═══════════════════════════════════════════════════════════════════════════
//  FONCTIONS UTILITAIRES
// ═══════════════════════════════════════════════════════════════════════════

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { keys: [], sessions: [], hwid_locks: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function logSecurity(event, details) {
  try {
    let logs = [];
    if (fs.existsSync(LOGS_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    }
    logs.push({
      timestamp: new Date().toISOString(),
      event,
      ...details
    });
    // Garder seulement les 1000 derniers logs
    if (logs.length > 1000) logs = logs.slice(-1000);
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to log security event:', e);
  }
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

function nextId(arr) {
  if (arr.length === 0) return 1;
  return Math.max(...arr.map((x) => x.id)) + 1;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MIDDLEWARE DE SÉCURITÉ
// ═══════════════════════════════════════════════════════════════════════════

// Rate Limiting
function rateLimitMiddleware(req, res, next) {
  const ip = getClientIP(req);
  const now = Date.now();
  
  // Vérifier si l'IP est bannie
  if (bannedIPs.has(ip)) {
    const banEnd = bannedIPs.get(ip);
    if (now < banEnd) {
      logSecurity('banned_ip_attempt', { ip, path: req.path });
      return res.status(429).json({ 
        valid: false, 
        error: 'too_many_requests',
        message: 'IP temporarily banned. Try again later.'
      });
    } else {
      bannedIPs.delete(ip);
      failedAttempts.delete(ip);
    }
  }
  
  // Rate limiting
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { count: 1, timestamp: now });
  } else {
    const data = requestCounts.get(ip);
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      requestCounts.set(ip, { count: 1, timestamp: now });
    } else {
      data.count++;
      if (data.count > MAX_REQUESTS_PER_WINDOW) {
        logSecurity('rate_limit_exceeded', { ip, count: data.count });
        return res.status(429).json({ 
          valid: false, 
          error: 'too_many_requests',
          message: 'Rate limit exceeded. Slow down.'
        });
      }
    }
  }
  
  next();
}

// Anti-Brute Force
function recordFailedAttempt(ip) {
  const now = Date.now();
  if (!failedAttempts.has(ip)) {
    failedAttempts.set(ip, { count: 1, timestamp: now });
  } else {
    const data = failedAttempts.get(ip);
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      failedAttempts.set(ip, { count: 1, timestamp: now });
    } else {
      data.count++;
      if (data.count >= MAX_FAILED_ATTEMPTS) {
        bannedIPs.set(ip, now + BAN_DURATION);
        logSecurity('ip_banned', { ip, reason: 'too_many_failed_attempts', count: data.count });
        return true; // IP bannie
      }
    }
  }
  return false;
}

// Vérification HMAC-SHA256
function verifyHMAC(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expected = hmac.digest('base64');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ═══════════════════════════════════════════════════════════════════════════
//  API D'AUTHENTIFICATION (LOADER C++)
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/validate', rateLimitMiddleware, (req, res) => {
  const ip = getClientIP(req);
  const { key, hwid, timestamp, nonce, signature } = req.body || {};
  
  // Validation des paramètres
  if (!key || !hwid || !timestamp || !nonce || !signature) {
    recordFailedAttempt(ip);
    logSecurity('validation_failed', { ip, reason: 'missing_parameters' });
    return res.json({ valid: false, error: 'invalid_request' });
  }
  
  // Vérification du timestamp (max 5 minutes de différence)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp);
  if (Math.abs(now - ts) > 300) {
    recordFailedAttempt(ip);
    logSecurity('validation_failed', { ip, reason: 'timestamp_expired', diff: Math.abs(now - ts) });
    return res.json({ valid: false, error: 'timestamp_expired' });
  }
  
  // Vérification HMAC
  const payload = `${key}|${hwid}|${timestamp}|${nonce}`;
  if (!verifyHMAC(payload, signature, SHARED_SECRET)) {
    recordFailedAttempt(ip);
    logSecurity('validation_failed', { ip, reason: 'invalid_signature', key: key.substring(0, 8) + '...' });
    return res.json({ valid: false, error: 'invalid_signature' });
  }
  
  // Vérification de la clé
  const data = loadData();
  const keyData = data.keys.find((k) => k.key_text === key.trim() && !k.revoked);
  
  if (!keyData) {
    const banned = recordFailedAttempt(ip);
    logSecurity('validation_failed', { ip, reason: 'invalid_key', key: key.substring(0, 8) + '...', banned });
    return res.json({ valid: false, error: 'invalid_key' });
  }
  
  // Vérification de l'expiration
  const nowISO = new Date().toISOString();
  if (keyData.expires_at && keyData.expires_at < nowISO) {
    logSecurity('validation_failed', { ip, reason: 'key_expired', key: key.substring(0, 8) + '...' });
    return res.json({ valid: false, error: 'key_expired' });
  }
  
  // HWID Lock (optionnel - une clé = un HWID)
  if (keyData.last_use_hwid && keyData.last_use_hwid !== hwid) {
    logSecurity('hwid_mismatch', { 
      ip, 
      key: key.substring(0, 8) + '...', 
      expected_hwid: keyData.last_use_hwid.substring(0, 16) + '...',
      provided_hwid: hwid.substring(0, 16) + '...'
    });
    return res.json({ valid: false, error: 'hwid_mismatch' });
  }
  
  // Mise à jour des données d'utilisation
  keyData.last_used_at = nowISO;
  keyData.use_count = (keyData.use_count || 0) + 1;
  keyData.last_use_hwid = hwid;
  keyData.last_use_ip = ip;
  
  saveData(data);
  
  // Reset failed attempts on success
  failedAttempts.delete(ip);
  
  logSecurity('validation_success', { 
    ip, 
    key: key.substring(0, 8) + '...', 
    hwid: hwid.substring(0, 16) + '...',
    product: keyData.product
  });
  
  return res.json({ 
    valid: true, 
    product: keyData.product || 'BO7 External',
    expires_at: keyData.expires_at || null
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API ADMIN (PANEL)
// ═══════════════════════════════════════════════════════════════════════════

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.body?.token;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const data = loadData();
  if (!data.sessions.some((s) => s.token === token)) {
    return res.status(401).json({ error: 'invalid_token' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const { user, password } = req.body || {};
  const ip = getClientIP(req);
  
  if (user !== ADMIN_USER || password !== ADMIN_PASS) {
    recordFailedAttempt(ip);
    logSecurity('admin_login_failed', { ip, user });
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  
  const token = crypto.randomBytes(32).toString('hex');
  const data = loadData();
  if (!data.sessions) data.sessions = [];
  data.sessions.push({ token, created_at: new Date().toISOString(), ip });
  saveData(data);
  
  failedAttempts.delete(ip);
  logSecurity('admin_login_success', { ip, user });
  
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
  const { key, count = 1, product = 'BO7 External', expires_at, note } = req.body || {};
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
      product: product || 'BO7 External',
      created_at: new Date().toISOString(),
      expires_at: expires_at || null,
      revoked: 0,
      note: note || null,
      last_used_at: null,
      use_count: 0,
      last_use_hwid: null,
      last_use_ip: null
    });
    existing.add(k);
    keysCreated.push(k);
  }
  saveData(data);
  logSecurity('keys_created', { count: keysCreated.length, product });
  res.json({ created: keysCreated.length, keys: keysCreated, errors: [] });
});

app.delete('/api/keys/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid_id' });
  const data = loadData();
  const len = data.keys.length;
  data.keys = data.keys.filter((k) => k.id !== id);
  saveData(data);
  logSecurity('key_deleted', { id });
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
  logSecurity('key_revoked', { id, revoked: row.revoked });
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
  logSecurity('key_updated', { id });
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

// Sync des clés (pour compatibilité avec l'ancien système)
app.post('/api/sync-keys', (req, res) => {
  if (!SYNC_SECRET) return res.status(500).json({ ok: false, error: 'SYNC_SECRET non configuré' });
  const { secret, keys: rawKeys } = req.body || {};
  if ((secret || '') !== SYNC_SECRET) {
    logSecurity('sync_failed', { reason: 'invalid_secret' });
    return res.status(401).json({ ok: false, error: 'secret_invalide' });
  }
  const keysArray = Array.isArray(rawKeys) ? rawKeys : [];
  const data = loadData();
  let nextIdVal = 1;
  data.keys = keysArray.map((k) => {
    const id = k.id && Number.isInteger(k.id) ? k.id : nextIdVal++;
    if (nextIdVal <= id) nextIdVal = id + 1;
    return {
      id,
      key_text: (k.key_text || k.key || '').trim() || String(id),
      product: k.product || 'BO7 External',
      created_at: k.created_at || new Date().toISOString(),
      expires_at: k.expires_at || null,
      revoked: k.revoked ? 1 : 0,
      note: k.note || null,
      last_used_at: k.last_used_at || null,
      use_count: k.use_count || 0,
      last_use_hwid: k.last_use_hwid || null,
      last_use_ip: k.last_use_ip || null
    };
  });
  saveData(data);
  logSecurity('keys_synced', { count: data.keys.length });
  return res.json({ ok: true, count: data.keys.length });
});

// Logs de sécurité (admin only)
app.get('/api/security-logs', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(LOGS_FILE)) {
      return res.json({ logs: [] });
    }
    const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    // Retourner les 100 derniers logs
    res.json({ logs: logs.slice(-100).reverse() });
  } catch (e) {
    res.status(500).json({ error: 'failed_to_load_logs' });
  }
});

// IP Whitelist pour le panel admin
const ADMIN_WHITELIST = ['86.204.68.57'];

function isAdminIP(req) {
  const ip = getClientIP(req);
  return ADMIN_WHITELIST.includes(ip);
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  if (!isAdminIP(req)) {
    logSecurity('admin_access_denied', { ip: getClientIP(req), reason: 'ip_not_whitelisted' });
    return res.status(403).send('Access Denied');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Nettoyage périodique des données en mémoire (toutes les 5 minutes)
setInterval(() => {
  const now = Date.now();
  // Nettoyer les compteurs de requêtes expirés
  for (const [ip, data] of requestCounts.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW * 2) {
      requestCounts.delete(ip);
    }
  }
  // Nettoyer les tentatives échouées expirées
  for (const [ip, data] of failedAttempts.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW * 2) {
      failedAttempts.delete(ip);
    }
  }
  // Nettoyer les bans expirés
  for (const [ip, banEnd] of bannedIPs.entries()) {
    if (now > banEnd) {
      bannedIPs.delete(ip);
    }
  }
}, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🛡️  SERVEUR D\'AUTHENTIFICATION ULTRA-SÉCURISÉ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  URL: http://localhost:' + PORT);
  console.log('  Admin: ' + ADMIN_USER);
  console.log('  HMAC-SHA256: ✅ Activé');
  console.log('  Rate Limiting: ✅ ' + MAX_REQUESTS_PER_WINDOW + ' req/min');
  console.log('  Anti-Brute Force: ✅ ' + MAX_FAILED_ATTEMPTS + ' tentatives max');
  console.log('  HWID Lock: ✅ Activé');
  console.log('═══════════════════════════════════════════════════════════════');
});
