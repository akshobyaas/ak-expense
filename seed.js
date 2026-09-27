// seed.js — the known history, transcribed exactly as provided.
// Rules followed: no invented dates, prices, vendors or mileage. Unknown = null/''.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SEED = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const IMPORTED_AT = '2026-09-27T00:00:00.000Z';
  const EA = 'Existing Expense App';

  // [category, amount, notes, date|null] — exactly as visible in the existing app, newest first.
  const existing = [
    ['Fuel', 908, '8.20 L — Full Tank', null], // date not shown in the source
    ['Fuel', 847, '7.65 L', '2026-09-17'],
    ['Fuel', 1095, '9.89 L', '2026-09-16'],
    ['Repairs', 1683, 'Full Service Done: Yes', '2026-09-06'],
    ['Repairs', 1, 'Full Service Done: No', '2026-09-06'],
    ['Fuel', 753, '6.76 L', '2026-09-06'],
    ['Fuel', 910, '8.22 L', '2026-09-04'],
    ['Fuel', 853, '7.70 L', '2026-08-27'],
    ['Fuel', 940, '8.53 L', '2026-08-20'],
    ['Fuel', 1025, '9.09 L', '2026-08-13'],
    ['Fuel', 998, '9.07 L', '2026-08-03'],
    ['Fuel', 945, '8.53 L', '2026-07-31'],
    ['Fuel', 751, '6.75 L', '2026-07-21'],
    ['Fuel', 1045, '9.44 L', '2026-07-14'],
    ['Fuel', 489, '4.42 L', '2026-07-07'],
    ['Fuel', 1094, '9.88 L', '2026-07-02'],
    ['Fuel', 1029, '8.89 L', '2026-06-17'],
    ['Fuel', 840, '7.24 L', '2026-06-11'],
    ['Fuel', 1046, '9.04 L', '2026-06-09'],
    ['Fuel', 971, '8.36 L', '2026-05-31'],
    ['Riding Gear', 15900, 'Adventure/Touring Jacket + Adventure/Touring Pants', '2026-05-31'],
    ['Fuel', 396, '3.42 L', '2026-05-30'],
    ['Fuel', 1106, '9.56 L', '2026-05-26'],
    ['Repairs', 250, 'Wash, polish, lube', '2026-05-16'],
    ['Fuel', 877, '7.90 L', '2026-05-15'],
    ['Fuel', 902, '8.37 L', '2026-05-13'],
    ['Riding Gear', 7400, 'Leather Riding Gloves + Rain Gloves', '2026-05-08'],
    ['Fuel', 852, '7.91 L', '2026-05-08'],
    ['Repairs', 472, 'Full Service Done: Yes', '2026-05-02'],
    ['Fuel', 895, '8.31 L', '2026-05-02'],
    ['Fuel', 964, '8.95 L', '2026-04-26'],
    ['Fuel', 512, '4.75 L', '2026-04-19'],
    ['Fuel', 810, '7.44 L', '2026-04-19'],
    ['Fuel', 168, '1.56 L', '2026-04-17'],
    ['Fuel', 1113, '10.33 L', '2026-04-15'],
    ['Accessories', 1300, 'Rear View Mirror Left + Rear View Mirror Right', '2026-04-04'],
    ['Fuel', 856, '7.95 L', '2026-04-04'],
    ['Repairs', 1120, 'Full Service Done: No', '2026-04-03'],
    ['Fuel', 880, '8.17 L', '2026-03-28'],
    ['Repairs', 1000, 'Full Service Done: No', '2026-03-27'],
    ['Fuel', 574, '5.59 L', '2026-03-21'],
    ['Fuel', 552, '5.30 L', '2026-03-21'],
    ['Fuel', 176, '1.71 L', '2026-03-17'],
    ['Accessories', 450, 'Rear Master Cylinder Protector', '2026-03-15'],
    ['Fuel', 947, '9.22 L', '2026-03-14'],
    ['Repairs', 791, 'Full Service Done: No', '2026-03-14'],
    ['Fuel', 740, '7.20 L', '2026-03-08'],
    ['Repairs', 901, 'Full Service Done: No', '2026-03-05'],
    ['Riding Gear', 3700, 'Bluetooth Intercom', '2026-03-03'],
    ['Accessories', 9192, 'Auxiliary Lights + Helmet Lock + Phone Mount', '2026-03-03'],
    ['Riding Gear', 7990, 'Full-Face Helmet', '2026-03-03'],
    ['Accessories', 9200, 'Bash Plate + Crash Guard + Top Rack', '2026-03-03'],
    ['Fuel', 754, '7.34 L', '2026-03-02'],
    ['Fuel', 706, '6.87 L', '2026-02-27'],
  ];

  // Short display names; the existing app's own text stays in notes untouched.
  function nameFor(cat, notes) {
    if (cat === 'Fuel') return 'Fuel';
    if (/^Full Service Done: Yes/.test(notes)) return 'Full service';
    if (/^Full Service Done: No/.test(notes)) return 'Service / repair';
    return notes;
  }

  const transactions = []; const refunds = [];
  const tx = (o) => transactions.push(Object.assign({
    kind: 'transaction', parent_id: '', notes: '', subcategory: '', source_reference: '', order_reference: '',
    status: 'CONFIRMED', verified: false, installed: null, duplicate_of: '', related: '', odometer_km: '',
    attachment_url: '', created_at: IMPORTED_AT, updated_at: IMPORTED_AT,
  }, o));

  existing.forEach(([category, amount, notes, date], i) => {
    const id = 'ea-' + String(i + 1).padStart(3, '0');
    const o = { id, expenditure: nameFor(category, notes), amount, date, notes, category, source: EA, source_reference: 'Existing app entry', verified: true };
    if (amount === 1) { o.status = 'NEEDS_REVIEW'; o.notes = notes + ' · ₹1 looks like a placeholder — confirm or correct'; }
    tx(o);
  });
  const EA_ID = (amount, text) => transactions.find((t) => t.source === EA && t.amount === amount && (!text || t.notes.includes(text))).id;
  const JACKET = EA_ID(15900), MIRRORS = EA_ID(1300), AUX = EA_ID(9192), BASH = EA_ID(9200);

  // ── Manually identified later ──
  tx({ id: 'm-screen-guard', expenditure: 'Meter console screen guard', amount: 800, date: null, notes: '₹600 + ₹200', category: 'Accessories', source: 'Manual' });
  transactions.push(
    { id: 'm-screen-guard-1', kind: 'line_item', parent_id: 'm-screen-guard', expenditure: 'Screen guard — part 1', amount: 600, date: null, notes: 'Component of ₹800 total', category: 'Accessories', source: 'Manual', status: 'CONFIRMED', created_at: IMPORTED_AT, updated_at: IMPORTED_AT },
    { id: 'm-screen-guard-2', kind: 'line_item', parent_id: 'm-screen-guard', expenditure: 'Screen guard — part 2', amount: 200, date: null, notes: 'Component of ₹800 total', category: 'Accessories', source: 'Manual', status: 'CONFIRMED', created_at: IMPORTED_AT, updated_at: IMPORTED_AT });
  tx({ id: 'm-visor', expenditure: 'Dark visor — Brutale Corsa', amount: 1000, date: null, category: 'Riding Gear', source: 'Manual' });
  tx({ id: 'm-socks', expenditure: 'Raida socks', amount: 300, date: null, category: 'Riding Gear', source: 'Manual' });
  tx({ id: 'm-mirrors-2', expenditure: 'Replacement mirrors', amount: 2150, date: null, notes: 'Old mirrors broke — separate later purchase', category: 'Accessories', subcategory: 'Replacement', source: 'Manual', related: 'replacement_of:' + MIRRORS });
  tx({ id: 'm-sliders', expenditure: 'Sliders', amount: 1690, date: null, category: 'Accessories', source: 'Manual' });
  tx({ id: 'm-bungee', expenditure: 'Bungee cords', amount: 1000, date: null, notes: '4 pieces', category: 'Accessories', source: 'Manual' });
  // Mentioned again manually — same purchase as the existing-app entry. Kept for audit, excluded from totals.
  tx({ id: 'm-jacket', expenditure: 'Riding jacket + pants', amount: 15900, date: null, notes: 'Manual mention of the same purchase', category: 'Riding Gear', source: 'Manual', status: 'DUPLICATE', duplicate_of: JACKET });

  // ── Legundary ──
  tx({ id: 'lg-cap0110', expenditure: 'Interceptor rear brake fluid cap SS', amount: 590, date: null, notes: 'SKU CAP0110', category: 'Modification', source: 'Legundary', source_reference: 'SKU CAP0110', installed: true });
  tx({ id: 'lg-bash', expenditure: 'Bash Plate + Crash Guard + Top Rack', amount: 9200, date: null, notes: 'Legundary record of the purchase already in the existing app', category: 'Accessories', source: 'Legundary', status: 'DUPLICATE', duplicate_of: BASH });

  // ── Route95 — the order total is the transaction; products are line items ──
  tx({ id: 'r95-5597', expenditure: 'Route95 order #5597', amount: 1993.10, date: '2026-07-24', notes: 'WELCOME5 · saved ₹104.90 · free shipping · DTDC', category: 'Accessories', source: 'Route95', order_reference: '5597', verified: true, related: 'see:' + AUX });
  transactions.push(
    { id: 'r95-5597-1', kind: 'line_item', parent_id: 'r95-5597', expenditure: 'Vibration Dampener for Twist & Go Phone Mount', amount: 854.05, date: '2026-07-24', notes: 'Listed ₹899 · WELCOME5', category: 'Accessories', source: 'Route95', order_reference: '5597', status: 'CONFIRMED', verified: true, created_at: IMPORTED_AT, updated_at: IMPORTED_AT },
    { id: 'r95-5597-2', kind: 'line_item', parent_id: 'r95-5597', expenditure: 'Handlebar Phone Mount & Universal Adapter for Twist & Go Phone Mount', amount: 1139.05, date: '2026-07-24', notes: 'Listed ₹1,199 · WELCOME5', category: 'Accessories', source: 'Route95', order_reference: '5597', status: 'CONFIRMED', verified: true, created_at: IMPORTED_AT, updated_at: IMPORTED_AT });
  tx({ id: 'r95-5693', expenditure: 'Route95 order #5693', amount: 2597, date: '2026-08-04', notes: 'Free shipping', category: 'Accessories', source: 'Route95', order_reference: '5693', verified: true });
  [['Double Socket Arm – B Size Short', 899], ['Universal Adapter Pack for Twist & Go Phone Mount', 499], ['Twist n Go Phone Mount with 1" B Size Ball', 1199]].forEach(([n, a], i) =>
    transactions.push({ id: 'r95-5693-' + (i + 1), kind: 'line_item', parent_id: 'r95-5693', expenditure: n, amount: a, date: '2026-08-04', notes: '', category: 'Accessories', source: 'Route95', order_reference: '5693', status: 'CONFIRMED', verified: true, created_at: IMPORTED_AT, updated_at: IMPORTED_AT }));
  tx({ id: 'r95-5771', expenditure: 'Route95 order #5771', amount: 1469, date: null, notes: 'Cancelled — full refund', category: 'Accessories', source: 'Route95', order_reference: '5771', status: 'CANCELLED', verified: true });
  refunds.push({ id: 'rf-5771', transaction_id: 'r95-5771', amount: 1469, date: null, notes: 'Full refund on cancellation', created_at: IMPORTED_AT });

  return { transactions, refunds, ids: { JACKET, MIRRORS, AUX, BASH } };
});
