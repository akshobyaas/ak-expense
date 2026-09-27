// Builds data/reconcile-2026-09-27.json from a snapshot of the live sheet (sheet.json exported from the Sheet).
//   node scripts/build-reconcile.js path/to/sheet.json
// Decision recorded (27 Sep 2026, on your instruction to reconcile everything):
//   The old app's ₹1,01,167 is fully itemised — 54 visible entries (₹92,669) + the HRZ invoice (₹8,498).
//   So nothing else can sit inside it, and no combination of the pending items equals ₹8,498.
//   → every NEEDS_REVIEW record (and its line items) becomes CONFIRMED_NEW.
// Also normalises the one legacy "CONFIRMED" status (ea-005, ₹1) to CONFIRMED_INCLUDED — same meaning.
const fs = require('fs'); const path = require('path');
const sheet = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OLD = ' · Needs reconciliation — may already be inside the ₹1,01,167 baseline';
const OLD2 = 'Needs reconciliation — may already be inside the ₹1,01,167 baseline';
const NOTE = 'Reconciled 27 Sep 2026 as new: old app total fully itemised (visible entries + HRZ invoice)';
const patches = [];
for (const t of sheet.transactions) {
  if (t.status === 'NEEDS_REVIEW' && t.id !== 'ea-005') {
    let notes = t.notes || '';
    notes = notes.includes(OLD) ? notes.replace(OLD, ' · ' + NOTE) : notes === OLD2 ? NOTE : notes.includes(OLD2) ? notes.replace(OLD2, NOTE) : (t.kind === 'transaction' ? [notes, NOTE].filter(Boolean).join(' · ') : notes);
    patches.push({ id: t.id, status: 'CONFIRMED_NEW', notes });
  }
  if (t.status === 'CONFIRMED') patches.push({ id: t.id, status: t.source === 'Existing Expense App' ? 'CONFIRMED_INCLUDED' : 'CONFIRMED_NEW', source_reference: t.id === 'ea-005' ? 'Existing app entry #5' : t.source_reference });
}
const out = { mode: 'upsert', description: 'Reconcile all pending records as CONFIRMED_NEW; normalise legacy CONFIRMED status', transactions: patches, refunds: [] };
fs.writeFileSync(path.join(__dirname, '..', 'data', 'reconcile-2026-09-27.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote data/reconcile-2026-09-27.json with', patches.length, 'patches');
