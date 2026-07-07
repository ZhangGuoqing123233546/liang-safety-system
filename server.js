const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const STATE_ID = 'main';
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_STATE_FILE = path.join(DATA_DIR, 'app-state.json');
const MAX_BODY_BYTES = 10 * 1024 * 1024;

let pgPool = null;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (pgPool) return pgPool;
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  return pgPool;
}

async function readState() {
  const pool = await getPool();
  if (pool) {
    const result = await pool.query('SELECT data, updated_at FROM app_state WHERE id = $1', [STATE_ID]);
    if (!result.rows.length) return { state: null, updatedAt: null, source: 'postgres' };
    return { state: result.rows[0].data, updatedAt: result.rows[0].updated_at, source: 'postgres' };
  }

  if (!fs.existsSync(LOCAL_STATE_FILE)) return { state: null, updatedAt: null, source: 'file' };
  const raw = fs.readFileSync(LOCAL_STATE_FILE, 'utf8');
  const data = JSON.parse(raw || '{}');
  return { state: data.state || null, updatedAt: data.updatedAt || null, source: 'file' };
}

async function writeState(state) {
  const payload = state && typeof state === 'object' ? state : {};
  const pool = await getPool();
  if (pool) {
    const result = await pool.query(
      `INSERT INTO app_state (id, data, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = now()
       RETURNING updated_at`,
      [STATE_ID, JSON.stringify(payload)]
    );
    return { updatedAt: result.rows[0].updated_at, source: 'postgres' };
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const updatedAt = new Date().toISOString();
  fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify({ state: payload, updatedAt }, null, 2), 'utf8');
  return { updatedAt, source: 'file' };
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml; charset=utf-8'
  }[ext] || 'application/octet-stream';
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendText(res, 403, 'Forbidden');

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (indexErr, indexData) => {
        if (indexErr) return sendText(res, 404, 'Not found');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexData);
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': pathname === '/index.html' ? 'no-cache' : 'public, max-age=60'
    });
    res.end(data);
  });
}

async function handleApi(req, res) {
  try {
    if (req.url.startsWith('/api/health') && req.method === 'GET') {
      const pool = await getPool();
      return sendJson(res, 200, { ok: true, storage: pool ? 'postgres' : 'file' });
    }

    if (req.url.startsWith('/api/state') && req.method === 'GET') {
      return sendJson(res, 200, await readState());
    }

    if (req.url.startsWith('/api/state') && (req.method === 'PUT' || req.method === 'POST')) {
      const body = await readBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const result = await writeState(parsed.state || {});
      return sendJson(res, 200, { ok: true, ...result });
    }

    return sendJson(res, 404, { error: 'API 不存在' });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: err.message || '服务器错误' });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`liang safety system listening on ${PORT}`);
});