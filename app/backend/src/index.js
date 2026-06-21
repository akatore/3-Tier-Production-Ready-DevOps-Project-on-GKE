'use strict';

const express = require('express');
const pino = require('pino')();
const pinoHttp = require('pino-http')({ logger: pino });
const client = require('prom-client');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(pinoHttp);

const PORT = process.env.PORT || 8080;

// ---------------------------------------------------------------------------
// Prometheus metrics
// ---------------------------------------------------------------------------
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});
register.registerMetric(httpRequestDuration);

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.path, status_code: res.statusCode });
  });
  next();
});

// ---------------------------------------------------------------------------
// Database (data tier)
// ---------------------------------------------------------------------------
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'changeme',
  database: process.env.DB_NAME || 'appdb',
  max: 10,
  idleTimeoutMillis: 30000,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));

app.get('/readyz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not-ready', error: err.message });
  }
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/api/messages', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, body, created_at FROM messages ORDER BY id DESC LIMIT 50'
  );
  res.json(rows);
});

app.post('/api/messages', async (req, res) => {
  const body = (req.body && req.body.body) || '';
  if (!body.trim()) return res.status(400).json({ error: 'body is required' });
  const { rows } = await pool.query(
    'INSERT INTO messages (body) VALUES ($1) RETURNING id, body, created_at',
    [body]
  );
  res.status(201).json(rows[0]);
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function start() {
  let attempts = 0;
  while (attempts < 10) {
    try {
      await initDb();
      break;
    } catch (err) {
      attempts += 1;
      pino.warn(`DB not ready (attempt ${attempts}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const server = app.listen(PORT, () => pino.info(`backend listening on :${PORT}`));

  const shutdown = (signal) => {
    pino.info(`${signal} received, shutting down`);
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) start();

module.exports = app;
