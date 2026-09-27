// Regenerates the JSON datasets in data/ from data/seed.js.
//   node scripts/build-data.js
// data/seed.json                → full first-time import for an EMPTY sheet   (mode: import)
// data/audit-2026-09-27.json    → field patches that bring an already-imported sheet
//                                 in line with Bike_Expense_Audit_Context.md (mode: upsert)
const fs = require('fs');
const path = require('path');
const SEED = require('../data/seed.js');
const out = (f, o) => { fs.writeFileSync(path.join(__dirname, '..', 'data', f), JSON.stringify(o, null, 2) + '\n'); console.log('wrote data/' + f); };

out('seed.json', { mode: 'import', source: 'Bike_Expense_Audit_Context.md', transactions: SEED.transactions, refunds: SEED.refunds, meta: { reportedBaseline: 101167 } });

// Only reconciliation fields are patched. Amounts, dates and names are left exactly as they are in the sheet.
// ea-005 (the ₹1 entry) is skipped on purpose: its status in the sheet was changed after import and
// only you can say whether that was deliberate.
const FIELDS = ['status', 'notes', 'source_reference', 'quantity', 'listed_amount'];
const SKIP = new Set(['ea-005']);
const NEW = new Set(['hrz-invoice']);
out('audit-2026-09-27.json', {
  mode: 'upsert',
  description: 'Apply audit statuses (CONFIRMED_INCLUDED / NEEDS_REVIEW), tracking numbers, listed prices, warranty note; add the HRZ invoice',
  // Records not yet in the sheet (the HRZ invoice) are sent whole so they can be appended.
  transactions: SEED.transactions.filter((t) => !SKIP.has(t.id)).map((t) => NEW.has(t.id) ? t : Object.fromEntries([['id', t.id], ...FIELDS.filter((k) => t[k] !== undefined).map((k) => [k, t[k] === null ? '' : t[k]])])),
  refunds: [],
});
