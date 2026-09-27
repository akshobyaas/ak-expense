// api/ledger.js — Vercel serverless function (same pattern as the vault's api/sheets.js)
// Google Sheet is the database. Tabs: Transactions, Refunds, Meta (auto-created on import).
//
// GET    ?type=all                         → { transactions, refunds, meta }
// POST   { type:'transactions', item }     → append (server stamps created_at/updated_at)
// POST   { type:'refunds', item }          → append
// POST   { type:'import', transactions, refunds, meta, force? } → first-time seed (refuses if data exists)
// POST   { type:'upload', filename, mimeType, data } → Drive upload for invoices/screenshots
// PUT    { type:'transactions'|'meta', item } → update row by id / key
//
// There is intentionally NO delete endpoint: records are never removed, only re-statused
// (e.g. DUPLICATE) so the audit trail survives.

async function safeFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { throw new Error(`Non-JSON response (${res.status}) from ${url.split('?')[0]}: ${text.slice(0, 200)}`); }
}

const TX_COLS = ['id', 'kind', 'parent_id', 'expenditure', 'amount', 'date', 'notes', 'category', 'subcategory', 'source',
  'source_reference', 'order_reference', 'status', 'verified', 'installed', 'duplicate_of', 'related', 'odometer_km',
  'attachment_url', 'created_at', 'updated_at'];
const RF_COLS = ['id', 'transaction_id', 'amount', 'date', 'notes', 'created_at'];
const META_COLS = ['key', 'value'];
const colLetter = (n) => String.fromCharCode(64 + n); // ≤ 26 columns
const TABS = {
  transactions: { name: 'Transactions', cols: TX_COLS },
  refunds: { name: 'Refunds', cols: RF_COLS },
  meta: { name: 'Meta', cols: META_COLS },
};
const lastCol = (cfg) => colLetter(cfg.cols.length);
const toRow = (cfg, o) => cfg.cols.map((c) => (o[c] === null || o[c] === undefined ? '' : typeof o[c] === 'boolean' ? (o[c] ? 'TRUE' : 'FALSE') : String(o[c])));
const fromRow = (cfg, r) => Object.fromEntries(cfg.cols.map((c, i) => [c, r[i] ?? '']));

function validateTx(o) {
  if (!o || !o.id) return 'id required';
  if (!o.expenditure) return 'expenditure required';
  if (o.amount === '' || o.amount === null || o.amount === undefined || !Number.isFinite(Number(o.amount))) return 'amount must be a number';
  if (o.date && !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return 'date must be YYYY-MM-DD or blank';
  return null;
}

module.exports = async function handler(req, res) {
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) ? origin : (ALLOWED_ORIGIN || 'null'));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Vault-Key');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Fail closed: personal financial data.
  const KEY = process.env.VAULT_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'Server misconfigured: VAULT_API_KEY is not set' });
  if (req.headers['x-vault-key'] !== KEY) return res.status(401).json({ error: 'Unauthorized' });

  const { GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET, GOOGLE_REFRESH_TOKEN: REFRESH_TOKEN } = process.env;
  if (!SHEET_ID || !CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return res.status(500).json({ error: 'Missing environment variables', missing: { GOOGLE_SHEET_ID: !SHEET_ID, GOOGLE_CLIENT_ID: !CLIENT_ID, GOOGLE_CLIENT_SECRET: !CLIENT_SECRET, GOOGLE_REFRESH_TOKEN: !REFRESH_TOKEN } });
  }

  try {
    const { data: tok } = await safeFetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token' }),
    });
    if (!tok.access_token) return res.status(500).json({ error: 'OAuth failed', detail: tok });
    const auth = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

    const read = async (cfg) => {
      const { data } = await safeFetch(`${base}/values/${encodeURIComponent(`${cfg.name}!A2:${lastCol(cfg)}`)}`, { headers: auth });
      if (data.error) { if (/Unable to parse range/.test(data.error.message)) return []; throw new Error(data.error.message); }
      return (data.values || []).map((r) => fromRow(cfg, r));
    };
    const append = async (cfg, rows) => {
      const { data } = await safeFetch(`${base}/values/${encodeURIComponent(`${cfg.name}!A:${lastCol(cfg)}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST', headers: auth, body: JSON.stringify({ values: rows }),
      });
      if (data.error) throw new Error(data.error.message);
    };
    const findRow = async (cfg, keyVal) => {
      const { data } = await safeFetch(`${base}/values/${encodeURIComponent(`${cfg.name}!A:A`)}`, { headers: auth });
      const i = (data.values || []).findIndex((r) => r[0] === String(keyVal));
      return i < 1 ? -1 : i + 1; // 1-based sheet row, skipping header
    };
    const ensureTabs = async () => {
      const { data } = await safeFetch(`${base}?fields=sheets.properties.title`, { headers: auth });
      const have = new Set((data.sheets || []).map((s) => s.properties.title));
      const missing = Object.values(TABS).filter((t) => !have.has(t.name));
      if (missing.length) {
        const { data: d } = await safeFetch(`${base}:batchUpdate`, { method: 'POST', headers: auth, body: JSON.stringify({ requests: missing.map((t) => ({ addSheet: { properties: { title: t.name } } })) }) });
        if (d.error) throw new Error(d.error.message);
      }
      for (const t of Object.values(TABS)) {
        await safeFetch(`${base}/values/${encodeURIComponent(`${t.name}!A1:${lastCol(t)}1`)}?valueInputOption=RAW`, { method: 'PUT', headers: auth, body: JSON.stringify({ values: [t.cols] }) });
      }
    };

    // ── GET ──
    if (req.method === 'GET') {
      const [transactions, refunds, metaRows] = await Promise.all([read(TABS.transactions), read(TABS.refunds), read(TABS.meta)]);
      const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
      return res.status(200).json({ transactions, refunds, meta });
    }

    const body = req.body || {};
    const now = new Date().toISOString();

    // ── POST ──
    if (req.method === 'POST') {
      if (body.type === 'upload') {
        const { filename, mimeType, data } = body;
        if (!data || !mimeType) return res.status(400).json({ error: 'File data and mimeType required' });
        if (!/^(image\/(png|jpe?g|webp|heic)|application\/pdf)$/.test(mimeType)) return res.status(400).json({ error: 'Only images or PDF' });
        const boundary = 'akx' + Date.now();
        const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: filename || `bill-${Date.now()}`, mimeType })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${data}\r\n--${boundary}--`;
        const { data: up } = await safeFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { Authorization: auth.Authorization, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
        if (!up.id) return res.status(500).json({ error: 'Drive upload failed', detail: up });
        // Unlike the vault's prompt images, bills are NOT made public — link opens in your own Drive session.
        return res.status(200).json({ success: true, url: `https://drive.google.com/file/d/${up.id}/view`, fileId: up.id });
      }

      if (body.type === 'import') {
        await ensureTabs();
        const existing = await read(TABS.transactions);
        if (existing.length && !body.force) return res.status(409).json({ error: `Transactions tab already has ${existing.length} rows — import refused to avoid double counting` });
        const txs = body.transactions || [];
        for (const t of txs) { const err = validateTx(t); if (err) return res.status(400).json({ error: `${t.id}: ${err}` }); }
        if (txs.length) await append(TABS.transactions, txs.map((t) => toRow(TABS.transactions, t)));
        if ((body.refunds || []).length) await append(TABS.refunds, body.refunds.map((r) => toRow(TABS.refunds, r)));
        if (body.meta) await append(TABS.meta, Object.entries(body.meta).map(([k, v]) => [k, String(v)]));
        return res.status(200).json({ success: true, imported: txs.length });
      }

      const cfg = TABS[body.type];
      if (!cfg || body.type === 'meta') return res.status(400).json({ error: 'Unknown type' });
      const item = Object.assign({}, body.item);
      if (!item.id) item.id = `${body.type === 'refunds' ? 'rf' : 'tx'}-${Date.now().toString(36)}`;
      if (body.type === 'transactions') {
        const err = validateTx(item); if (err) return res.status(400).json({ error: err });
        if (await findRow(cfg, item.id) > 0) return res.status(409).json({ error: 'id already exists' });
        item.created_at = now; item.updated_at = now;
      } else {
        if (!item.transaction_id || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) return res.status(400).json({ error: 'transaction_id and a positive amount required' });
        item.created_at = now;
      }
      await append(cfg, [toRow(cfg, item)]);
      return res.status(200).json({ success: true, item });
    }

    // ── PUT ──
    if (req.method === 'PUT') {
      const cfg = TABS[body.type];
      if (!cfg || body.type === 'refunds') return res.status(400).json({ error: 'Unknown type' });
      const item = Object.assign({}, body.item);
      if (body.type === 'meta') {
        const row = await findRow(cfg, item.key);
        if (row < 0) await append(cfg, [[item.key, String(item.value)]]);
        else await safeFetch(`${base}/values/${encodeURIComponent(`${cfg.name}!A${row}:B${row}`)}?valueInputOption=RAW`, { method: 'PUT', headers: auth, body: JSON.stringify({ values: [[item.key, String(item.value)]] }) });
        return res.status(200).json({ success: true });
      }
      const err = validateTx(item); if (err) return res.status(400).json({ error: err });
      const row = await findRow(cfg, item.id);
      if (row < 0) return res.status(404).json({ error: 'Not found' });
      // Preserve original created_at and source fields the client did not send.
      const { data: cur } = await safeFetch(`${base}/values/${encodeURIComponent(`${cfg.name}!A${row}:${lastCol(cfg)}${row}`)}`, { headers: auth });
      const prev = fromRow(cfg, (cur.values || [[]])[0]);
      const merged = Object.assign({}, prev, item, { created_at: prev.created_at || now, updated_at: now });
      const { data: up } = await safeFetch(`${base}/values/${encodeURIComponent(`${cfg.name}!A${row}:${lastCol(cfg)}${row}`)}?valueInputOption=RAW`, { method: 'PUT', headers: auth, body: JSON.stringify({ values: [toRow(cfg, merged)] }) });
      if (up.error) throw new Error(up.error.message);
      return res.status(200).json({ success: true, item: merged });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
