// Backend data entry for the live app — no frontend import workflow needed.
//
//   node scripts/push.mjs data/audit-2026-09-27.json            → preview only (nothing written)
//   node scripts/push.mjs data/audit-2026-09-27.json --apply    → write to the Google Sheet
//
// Reads VAULT_API_KEY (and optional APP_URL) from .env.local. The file's "mode" decides the call:
//   import → first-time load of an EMPTY sheet (the API refuses if rows already exist)
//   upsert → new ids appended, existing ids merged field-by-field; nothing is ever deleted
import fs from 'node:fs';

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('usage: node scripts/push.mjs <data.json> [--apply]'); process.exit(1); }
const env = Object.fromEntries((fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '')
  .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const KEY = process.env.VAULT_API_KEY || env.VAULT_API_KEY;
const URL_ = (process.env.APP_URL || env.APP_URL || 'https://expense8849.vercel.app').replace(/\/$/, '');
if (!KEY) { console.error('VAULT_API_KEY not found in .env.local'); process.exit(1); }

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const mode = data.mode || 'upsert';
const txs = data.transactions || [], rfs = data.refunds || [];
const call = async (method, body, qs = '') => {
  const r = await fetch(URL_ + '/api/ledger' + qs, { method, headers: { 'Content-Type': 'application/json', 'X-Vault-Key': KEY }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status} ${j.error || ''} ${(j.errors || []).join('; ')}`); return j;
};

const live = await call('GET', null, '?type=all');
const have = new Set(live.transactions.map((t) => t.id));
const updates = txs.filter((t) => have.has(t.id)), adds = txs.filter((t) => !have.has(t.id));
console.log(`${URL_} — sheet has ${live.transactions.length} transactions, ${live.refunds.length} refunds`);
console.log(`${file} (${mode}): ${adds.length} to add, ${updates.length} to update, ${rfs.length} refund rows`);
if (mode === 'import' && live.transactions.length) { console.error('Sheet is not empty — import refused. Use an upsert file instead.'); process.exit(1); }
const changed = updates.map((p) => { const cur = live.transactions.find((t) => t.id === p.id); const diff = Object.keys(p).filter((k) => k !== 'id' && String(cur[k] ?? '') !== String(p[k] ?? '')); return diff.length ? `  ${p.id}: ${diff.map((k) => `${k} "${cur[k] ?? ''}" → "${p[k]}"`).join(', ')}` : null; }).filter(Boolean);
if (changed.length) console.log('Field changes:\n' + changed.join('\n'));
if (!flags.includes('--apply')) { console.log('\nPreview only. Re-run with --apply to write.'); process.exit(0); }
const res = mode === 'import' ? await call('POST', { type: 'import', transactions: txs, refunds: rfs, meta: data.meta }) : await call('POST', { type: 'upsert', transactions: txs, refunds: rfs });
console.log('Done:', JSON.stringify(res));
