// Run: npm test   (node:test, zero dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const Ledger = require('../ledger.js');
const SEED = require('../seed.js');

const clone = (o) => JSON.parse(JSON.stringify(o));
const L0 = () => Ledger.build(clone(SEED));
const P = Ledger.toPaise;
const withTx = (raw, ...txs) => ({ ...raw, transactions: [...raw.transactions, ...txs] });

test('seed: 54 existing-app entries summing to ₹92,669', () => {
  const L = L0();
  const ea = L.transactions.filter((t) => t.source === 'Existing Expense App');
  assert.equal(ea.length, 54);
  assert.equal(ea.reduce((s, t) => s + t.amount, 0), P(92669));
});

test('seed: expected ledger net', () => {
  // 92,669 existing + 7,530 manual/Legundary + 1,993.10 + 2,597 + (1,469 − 1,469)
  const t = Ledger.totals(L0());
  assert.equal(t.net, P(104789.10));
  assert.equal(t.refunds, P(1469));
  assert.equal(t.duplicates, P(15900 + 9200));
});

test('TEST 1: re-adding the ₹15,900 jacket does not increase the total', () => {
  const raw = clone(SEED); const before = Ledger.totals(Ledger.build(raw)).net;
  const candidate = { id: 'new-jacket', expenditure: 'Riding jacket + pants', amount: 15900, date: '2026-05-31', category: 'Riding Gear', source: 'Invoice' };
  const matches = Ledger.findDuplicates(Ledger.build(raw), candidate);
  assert.ok(matches.length > 0, 'should warn POSSIBLE DUPLICATE');
  assert.equal(matches[0].id, SEED.ids.JACKET);
  // user chooses "This is the same expense"
  const L = Ledger.build(withTx(raw, { ...candidate, status: 'DUPLICATE', duplicate_of: matches[0].id }));
  assert.equal(Ledger.totals(L).net, before);
  // also detected with no date at all
  assert.equal(Ledger.findDuplicates(Ledger.build(raw), { ...candidate, date: null })[0].id, SEED.ids.JACKET);
});

test('TEST 2: Route95 #5597 counts once as ₹1,993.10', () => {
  const L = L0();
  const order = L.byId.get('r95-5597');
  assert.equal(order.amount, P(1993.10));
  assert.equal(Ledger.totals(L, (t) => t.order_reference === '5597').net, P(1993.10));
  assert.equal(L.children.get('r95-5597').length, 2);
  assert.ok(L.children.get('r95-5597').every((k) => !Ledger.counts(L, k)));
});

test('TEST 3: Route95 #5693 counts once as ₹2,597', () => {
  const L = L0();
  assert.equal(Ledger.totals(L, (t) => t.order_reference === '5693').net, P(2597));
  assert.equal(L.children.get('r95-5693').reduce((s, k) => s + k.amount, 0), P(2597));
});

test('TEST 4: Route95 #5771 gross ₹1,469, refund ₹1,469, net ₹0', () => {
  const L = L0(); const t = L.byId.get('r95-5771');
  assert.equal(t.amount, P(1469));
  assert.equal(Ledger.refundTotal(L, t), P(1469));
  assert.equal(Ledger.netOf(L, t), 0);
  assert.equal(Ledger.displayStatus(L, t), 'REFUNDED');
  const s = Ledger.totals(L, (x) => x.id === 'r95-5771');
  assert.deepEqual([s.gross, s.refunds, s.net], [P(1469), P(1469), 0]);
});

test('TEST 5: original ₹1,300 mirrors and ₹2,150 replacements stay separate', () => {
  const L = L0();
  const orig = L.byId.get(SEED.ids.MIRRORS), repl = L.byId.get('m-mirrors-2');
  assert.ok(Ledger.counts(L, orig) && Ledger.counts(L, repl));
  assert.equal(repl.duplicate_of, null);
  assert.match(repl.related, new RegExp('replacement_of:' + orig.id));
});

test('TEST 6: unknown dates are never invented', () => {
  const L = L0();
  for (const id of ['ea-001', 'lg-cap0110', 'm-sliders', 'r95-5771']) assert.equal(L.byId.get(id).date, null);
  const L2 = Ledger.build(withTx(clone(SEED), { id: 'x', expenditure: 'Accessory', amount: 2500, date: '', source: 'Legundary', category: 'Accessories' }));
  assert.equal(L2.byId.get('x').date, null);
  // undated rows sort last, and are reported as undated in the monthly series rather than placed in a month
  assert.equal(Ledger.query(L2, { sort: 'newest' }).at(-1).date, null);
  assert.ok(Ledger.monthly(L2).undated >= P(2500));
});

test('TEST 7: duplicates remain visible but do not count', () => {
  const L = L0(); const d = L.byId.get('m-jacket');
  assert.ok(d);
  assert.equal(Ledger.counts(L, d), false);
  assert.ok(Ledger.query(L, { search: 'jacket' }).some((t) => t.id === 'm-jacket'));
  assert.equal(Ledger.displayStatus(L, d), 'DUPLICATE');
});

test('TEST 8: partial refund ₹500 on ₹2,000 → net ₹1,500', () => {
  const raw = withTx(clone(SEED), { id: 'p', expenditure: 'Test', amount: 2000, date: '2026-09-20', category: 'Other' });
  raw.refunds.push({ id: 'rp', transaction_id: 'p', amount: 500 });
  const L = Ledger.build(raw); const t = L.byId.get('p');
  assert.equal(Ledger.netOf(L, t), P(1500));
  assert.equal(Ledger.displayStatus(L, t), 'PARTIALLY REFUNDED');
  assert.equal(Ledger.totals(L).net - Ledger.totals(L0()).net, P(1500));
});

test('TEST 9: a parent order with line items never double counts', () => {
  const raw = clone(SEED);
  const base = Ledger.totals(Ledger.build(raw)).net;
  raw.transactions.push(
    { id: 'o', expenditure: 'Order #1', amount: 1000, date: '2026-09-21', category: 'Accessories', order_reference: '1' },
    { id: 'o1', kind: 'line_item', parent_id: 'o', expenditure: 'A', amount: 600 },
    { id: 'o2', kind: 'line_item', parent_id: 'o', expenditure: 'B', amount: 400 });
  assert.equal(Ledger.totals(Ledger.build(raw)).net - base, P(1000));
});

test('TEST 10: the ₹1,01,167 baseline is not reconstructed from incomplete records', () => {
  const L = L0(); const b = Ledger.baseline(L);
  assert.equal(b.reported, P(101167));
  assert.equal(b.imported, P(92669));
  assert.equal(b.gap, P(8498)); // shown as an explicit gap, never back-filled
  assert.ok(!L.transactions.some((t) => t.amount === P(8498)));
});

test('duplicate detection does not flag routine fuel fills of equal price on other days', () => {
  const L = L0();
  const m = Ledger.findDuplicates(L, { expenditure: 'Fuel', amount: 908, date: '2026-09-27', notes: '8.2 L', category: 'Fuel' });
  assert.equal(m.length, 0);
});

test('integrity: line items reconcile to their orders; no errors in seed', () => {
  const errs = Ledger.issues(L0());
  assert.deepEqual(errs.filter((e) => e.level === 'error'), []);
  assert.ok(!errs.some((e) => /line items total/.test(e.msg)));
});

test('unverified records are excluded unless configured', () => {
  const raw = withTx(clone(SEED), { id: 'u', expenditure: 'Maybe', amount: 700, status: 'UNVERIFIED', date: '2026-09-01' });
  const base = Ledger.totals(L0()).net;
  assert.equal(Ledger.totals(Ledger.build(raw)).net, base);
  assert.equal(Ledger.totals(Ledger.build(raw, { countUnverified: true })).net, base + P(700));
});

test('reconciliation counts are derived', () => {
  const r = Ledger.reconciliation(L0());
  assert.equal(r.duplicates, 2);
  assert.equal(r.refunded, 1);
  assert.equal(r.needsReview, 1);
});

test('formatINR uses Indian grouping', () => {
  assert.equal(Ledger.formatINR(P(101167)), '₹1,01,167');
  assert.equal(Ledger.formatINR(P(1993.1)), '₹1,993.10');
  assert.equal(Ledger.formatINR(P(10478910.5)), '₹1,04,78,910.50');
});

test('fuel stats only from real data; no odometer → no km metrics', () => {
  const f = Ledger.fuelStats(L0());
  assert.equal(f.fills, 38);
  assert.equal(f.km, null);
  assert.ok(f.avgPricePerLitre > 9000 && f.avgPricePerLitre < 12000);
});
