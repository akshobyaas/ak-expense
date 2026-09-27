// ledger.js — pure reconciliation engine (no DOM, no network).
// Shared by the browser UI and the Node test suite. All money math is done in
// integer paise to avoid floating-point drift (₹1,993.10 → 199310).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ledger = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CATEGORIES = ['Fuel', 'Maintenance', 'Repairs', 'Accessories', 'Riding Gear', 'Modification', 'Insurance', 'Documentation', 'Other'];
  const SOURCES = ['Existing Expense App', 'Manual', 'Route95', 'Legundary', 'Invoice', 'Screenshot', 'Other'];
  // Stored reconciliation statuses (audit doc §11). REFUNDED / PARTIALLY_REFUNDED are *derived*
  // from the Refunds tab, never typed by hand, so the refund amount is the single source of truth.
  //   CONFIRMED_INCLUDED — confirmed, and already part of the existing app's reported baseline
  //   CONFIRMED_NEW      — confirmed, and NOT part of that baseline
  //   NEEDS_REVIEW       — real, but not yet reconciled (e.g. may already sit inside the baseline)
  //   UNKNOWN            — unverified information
  //   DUPLICATE          — another record of a purchase that is already counted
  //   CANCELLED          — order cancelled (net comes from its refunds)
  const STATUSES = ['CONFIRMED_INCLUDED', 'CONFIRMED_NEW', 'NEEDS_REVIEW', 'UNKNOWN', 'DUPLICATE', 'CANCELLED'];
  const CONFIRMED = new Set(['CONFIRMED_INCLUDED', 'CONFIRMED_NEW']);
  // NET_TOTAL counts confirmed records only (audit doc §17); pending ones are reported beside it.
  const DEFAULT_SETTINGS = { countUnverified: false, countNeedsReview: false, reportedBaseline: 101167 };
  const EXISTING_APP = 'Existing Expense App';
  // Older rows used CONFIRMED / UNVERIFIED — map them so nothing silently changes meaning.
  function normStatus(status, source) {
    if (STATUSES.includes(status)) return status;
    if (status === 'CONFIRMED' || !status) return source === EXISTING_APP ? 'CONFIRMED_INCLUDED' : 'CONFIRMED_NEW';
    if (status === 'UNVERIFIED') return 'UNKNOWN';
    return 'UNKNOWN';
  }

  // ── money ──
  function toPaise(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[₹,\s]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  const fromPaise = (p) => (p === null ? null : p / 100);
  function formatINR(paise, { sign = false } = {}) {
    if (paise === null || paise === undefined) return '—';
    const neg = paise < 0; const abs = Math.abs(paise);
    const rupees = Math.floor(abs / 100); const ps = abs % 100;
    const s = String(rupees);
    // Indian grouping: last 3 digits, then pairs → 1,01,167
    const last3 = s.slice(-3); const rest = s.slice(0, -3);
    const grouped = (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
    return (neg ? '−' : (sign && paise > 0 ? '+' : '')) + '₹' + grouped + (ps ? '.' + String(ps).padStart(2, '0') : '');
  }

  // ── normalisation ──
  const bool = (v) => v === true || v === 'TRUE' || v === 'true' || v === 'yes' || v === 'Yes' ? true
    : (v === false || v === 'FALSE' || v === 'false' || v === 'no' || v === 'No' ? false : null);
  function normTx(t) {
    return {
      id: String(t.id),
      kind: t.kind === 'line_item' ? 'line_item' : 'transaction',
      parent_id: t.parent_id || null,
      expenditure: t.expenditure || '',
      amount: toPaise(t.amount), // paise
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : null, // never invented
      notes: t.notes || '',
      category: t.category || 'Other',
      subcategory: t.subcategory || '',
      source: t.source || 'Manual',
      source_reference: t.source_reference || '',
      order_reference: t.order_reference ? String(t.order_reference).replace(/^#/, '') : '',
      status: normStatus(t.status, t.source || 'Manual'),
      quantity: t.quantity === '' || t.quantity == null ? null : Number(t.quantity),
      listed_amount: toPaise(t.listed_amount),
      verified: bool(t.verified) === true,
      installed: bool(t.installed), // true / false / null (unknown)
      duplicate_of: t.duplicate_of || null,
      related: t.related || '', // "replacement_of:ea-036;see:ea-050"
      odometer_km: t.odometer_km === '' || t.odometer_km == null ? null : Number(t.odometer_km),
      attachment_url: t.attachment_url || '',
      created_at: t.created_at || '',
      updated_at: t.updated_at || '',
    };
  }
  function normRefund(r) {
    return { id: String(r.id), transaction_id: String(r.transaction_id), amount: toPaise(r.amount), date: r.date || null, notes: r.notes || '', created_at: r.created_at || '' };
  }
  function build(raw, settings) {
    const transactions = (raw.transactions || []).map(normTx);
    const refunds = (raw.refunds || []).map(normRefund);
    const byId = new Map(transactions.map((t) => [t.id, t]));
    const refundsBy = new Map();
    for (const r of refunds) { if (!refundsBy.has(r.transaction_id)) refundsBy.set(r.transaction_id, []); refundsBy.get(r.transaction_id).push(r); }
    const children = new Map();
    for (const t of transactions) if (t.kind === 'line_item' && t.parent_id) { if (!children.has(t.parent_id)) children.set(t.parent_id, []); children.get(t.parent_id).push(t); }
    return { transactions, refunds, byId, refundsBy, children, settings: Object.assign({}, DEFAULT_SETTINGS, settings || {}) };
  }

  // ── per-transaction ──
  const refundTotal = (L, t) => (L.refundsBy.get(t.id) || []).reduce((s, r) => s + (r.amount || 0), 0);
  function refundStatus(L, t) {
    const r = refundTotal(L, t);
    if (!r) return 'NONE';
    return r >= (t.amount || 0) ? 'FULL' : 'PARTIAL';
  }
  function isDuplicate(t) { return t.status === 'DUPLICATE' || !!t.duplicate_of; }
  // Does this record contribute to NET_TOTAL? Line items never do: the parent order is the money.
  function counts(L, t) {
    if (t.kind !== 'transaction') return false;
    if (isDuplicate(t)) return false;
    if (t.amount === null) return false;
    if (t.status === 'UNKNOWN' && !L.settings.countUnverified) return false;
    if (t.status === 'NEEDS_REVIEW' && !L.settings.countNeedsReview) return false;
    return true; // CONFIRMED_INCLUDED, CONFIRMED_NEW, CANCELLED (net after refunds)
  }
  function netOf(L, t) { return Math.max(0, (t.amount || 0) - refundTotal(L, t)); }
  function displayStatus(L, t) {
    if (isDuplicate(t)) return 'DUPLICATE';
    const rs = refundStatus(L, t);
    if (rs === 'FULL') return 'REFUNDED';
    if (rs === 'PARTIAL') return 'PARTIALLY REFUNDED';
    return t.status;
  }
  // Effective category for a line item falls back to its parent.
  function categoryOf(L, t) { return t.category || (t.parent_id && L.byId.get(t.parent_id)?.category) || 'Other'; }

  // ── totals ──
  function totals(L, filterFn) {
    let gross = 0, refunds = 0, duplicates = 0, n = 0, excludedUnverified = 0, pending = 0, unknown = 0;
    const byCategory = {}; CATEGORIES.forEach((c) => (byCategory[c] = 0));
    for (const t of L.transactions) {
      if (filterFn && !filterFn(t)) continue;
      if (t.kind !== 'transaction') continue;
      if (isDuplicate(t)) { duplicates += t.amount || 0; continue; }
      if (!counts(L, t)) {
        const v = Math.max(0, (t.amount || 0) - refundTotal(L, t));
        excludedUnverified += v;
        if (t.status === 'NEEDS_REVIEW') pending += v; else if (t.status === 'UNKNOWN') unknown += v;
        continue;
      }
      const r = Math.min(refundTotal(L, t), t.amount || 0);
      gross += t.amount; refunds += r; n++;
      byCategory[t.category] = (byCategory[t.category] || 0) + (t.amount - r);
    }
    // pending = NEEDS_REVIEW amounts kept OUT of net; unknown = UNKNOWN amounts kept out of net.
    return { gross, refunds, duplicates, excluded: excludedUnverified, pending, unknown, net: gross - refunds, count: n, byCategory };
  }

  // What is itemised inside the existing app's reported total vs the total it reports.
  // Itemised = the app's own entries + anything reconciled as CONFIRMED_INCLUDED (found to sit inside it).
  const inBaseline = (t) => t.kind === 'transaction' && !isDuplicate(t) && (t.source === EXISTING_APP || t.status === 'CONFIRMED_INCLUDED');
  function baseline(L) {
    const imported = L.transactions.filter(inBaseline).reduce((s, t) => s + (t.amount || 0), 0);
    const reported = toPaise(L.settings.reportedBaseline);
    return { reported, imported, gap: reported === null ? null : reported - imported };
  }

  // ── time series (only dated, counted transactions; undated are reported separately) ──
  function monthly(L, filterFn) {
    const m = {}; let undated = 0;
    for (const t of L.transactions) {
      if (!counts(L, t) || (filterFn && !filterFn(t))) continue;
      const v = netOf(L, t);
      if (!t.date) { undated += v; continue; }
      const k = t.date.slice(0, 7); m[k] = (m[k] || 0) + v;
    }
    const keys = Object.keys(m).sort();
    if (!keys.length) return { series: [], undated };
    // fill gaps so empty months show as zero instead of being skipped
    const out = []; let [y, mo] = keys[0].split('-').map(Number);
    const [ey, emo] = keys[keys.length - 1].split('-').map(Number);
    while (y < ey || (y === ey && mo <= emo)) { const k = `${y}-${String(mo).padStart(2, '0')}`; out.push({ month: k, value: m[k] || 0 }); mo++; if (mo > 12) { mo = 1; y++; } }
    return { series: out, undated };
  }
  function cumulative(L) {
    const { series, undated } = monthly(L); let run = 0;
    return { series: series.map((p) => ({ month: p.month, value: (run += p.value) })), undated };
  }
  function averageMonthly(L) {
    const { series } = monthly(L);
    if (!series.length) return null;
    const dated = series.reduce((s, p) => s + p.value, 0);
    return Math.round(dated / series.length);
  }

  // Fuel stats — litres parsed from notes ("8.20 L"). Only computed where data exists.
  function litresOf(t) { const m = /(\d+(?:\.\d+)?)\s*L\b/i.exec(t.notes || ''); return m ? parseFloat(m[1]) : null; }
  function fuelStats(L) {
    const fuel = L.transactions.filter((t) => counts(L, t) && t.category === 'Fuel');
    const withL = fuel.filter((t) => litresOf(t));
    const litres = withL.reduce((s, t) => s + litresOf(t), 0);
    const paid = withL.reduce((s, t) => s + netOf(L, t), 0);
    const odo = L.transactions.filter((t) => t.odometer_km != null && t.date && !isDuplicate(t)).sort((a, b) => a.date.localeCompare(b.date));
    const km = odo.length >= 2 ? odo[odo.length - 1].odometer_km - odo[0].odometer_km : null;
    return {
      fills: fuel.length, fillsWithLitres: withL.length,
      litres: withL.length ? Math.round(litres * 100) / 100 : null,
      avgPricePerLitre: litres ? Math.round(paid / litres) : null, // paise per litre
      avgLitresPerFill: withL.length ? Math.round((litres / withL.length) * 100) / 100 : null,
      km, // null until ≥2 odometer readings exist — never fabricated
    };
  }

  // ── duplicate detection ──
  const STOP = new Set(['the', 'and', 'for', 'with', 'of', 'a', 'an', '+', '&', 'full', 'tank', 'rear', 'view']);
  function tokens(s) { return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9. ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/s$/, ''))); }
  function jaccard(a, b) { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); }
  const dayDiff = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

  // Returns scored candidate matches (highest first). Never mutates anything.
  function findDuplicates(L, candidate, { threshold = 55, limit = 5 } = {}) {
    const c = normTx(Object.assign({ id: '__candidate__' }, candidate));
    const ctok = tokens(c.expenditure + ' ' + c.notes);
    const out = [];
    for (const t of L.transactions) {
      if (t.id === c.id) continue;
      let score = 0; const why = [];
      if (c.amount !== null && t.amount !== null) {
        if (c.amount === t.amount) { score += 50; why.push('same amount'); }
        else if (Math.abs(c.amount - t.amount) <= Math.max(100, t.amount * 0.01)) { score += 25; why.push('amount within 1%'); }
      }
      if (c.order_reference && c.order_reference === t.order_reference) { score += 45; why.push(`same order #${t.order_reference}`); }
      if (c.date && t.date) {
        const d = dayDiff(c.date, t.date);
        if (d === 0) { score += 25; why.push('same date'); } else if (d <= 3) { score += 10; why.push('date within 3 days'); } else if (d > 30) score -= 20;
      }
      const sim = jaccard(ctok, tokens(t.expenditure + ' ' + t.notes));
      if (sim > 0) { score += Math.round(sim * 40); if (sim >= 0.3) why.push('similar name'); }
      if (c.source && c.source === t.source && c.source !== 'Manual') { score += 5; }
      // Fuel fills repeat the same price constantly; demand more than amount alone.
      if (t.category === 'Fuel' && c.category === 'Fuel' && !(c.date && t.date && c.date === t.date)) score -= 25;
      if (score >= threshold) out.push({ id: t.id, score, reasons: why, isLineItem: t.kind === 'line_item', parent_id: t.parent_id });
    }
    // A match on a record that is itself a duplicate resolves to its canonical original,
    // so a new duplicate is always linked to the real transaction, never to a chain.
    const canonical = (id) => { let t = L.byId.get(id), guard = 0; while (t && t.duplicate_of && L.byId.has(t.duplicate_of) && guard++ < 10) t = L.byId.get(t.duplicate_of); return t ? t.id : id; };
    const best = new Map();
    for (const m of out.sort((a, b) => b.score - a.score)) {
      const cid = canonical(m.id);
      if (cid !== m.id) m.reasons = m.reasons.concat(`also matches an existing duplicate record of it`);
      if (!best.has(cid)) best.set(cid, Object.assign({}, m, { id: cid, matched_id: m.id }));
    }
    return [...best.values()].slice(0, limit);
  }

  // ── integrity checks → reconciliation queue ──
  function issues(L) {
    const out = [];
    for (const t of L.transactions) {
      if (t.duplicate_of && !L.byId.has(t.duplicate_of)) out.push({ id: t.id, level: 'error', msg: `duplicate_of points to missing record ${t.duplicate_of}` });
      if (t.duplicate_of === t.id) out.push({ id: t.id, level: 'error', msg: 'record is marked duplicate of itself' });
      if (t.kind === 'line_item' && t.parent_id && !L.byId.has(t.parent_id)) out.push({ id: t.id, level: 'error', msg: `line item parent ${t.parent_id} missing` });
      if (t.amount === null) out.push({ id: t.id, level: 'warn', msg: 'amount not provided' });
      const r = refundTotal(L, t);
      if (r > (t.amount || 0)) out.push({ id: t.id, level: 'error', msg: `refunds (${formatINR(r)}) exceed amount (${formatINR(t.amount)})` });
      if (t.status === 'CANCELLED' && refundStatus(L, t) !== 'FULL') out.push({ id: t.id, level: 'warn', msg: 'cancelled but not fully refunded — still counts toward total' });
    }
    const B = baseline(L);
    if (B.gap !== null && B.gap < 0) out.push({ id: '__baseline__', level: 'error', msg: `records marked as inside the old app total add up to ${formatINR(-B.gap)} more than the ₹ total it reports — one of them is probably new, not included` });
    for (const [pid, kids] of L.children) {
      const p = L.byId.get(pid); if (!p || p.amount === null) continue;
      const sum = kids.reduce((s, k) => s + (k.amount || 0), 0);
      if (kids.every((k) => k.amount !== null) && sum !== p.amount) out.push({ id: pid, level: 'warn', msg: `line items total ${formatINR(sum)} ≠ order total ${formatINR(p.amount)}` });
    }
    return out;
  }

  function reconciliation(L) {
    const tx = L.transactions.filter((t) => t.kind === 'transaction');
    const c = (f) => tx.filter(f).length;
    return {
      confirmed: c((t) => !isDuplicate(t) && CONFIRMED.has(t.status) && refundStatus(L, t) === 'NONE'),
      confirmedIncluded: c((t) => !isDuplicate(t) && t.status === 'CONFIRMED_INCLUDED' && refundStatus(L, t) === 'NONE'),
      confirmedNew: c((t) => !isDuplicate(t) && t.status === 'CONFIRMED_NEW' && refundStatus(L, t) === 'NONE'),
      needsReview: c((t) => t.status === 'NEEDS_REVIEW'),
      duplicates: c(isDuplicate),
      refunded: c((t) => refundStatus(L, t) === 'FULL'),
      partiallyRefunded: c((t) => refundStatus(L, t) === 'PARTIAL'),
      unverified: c((t) => t.status === 'UNKNOWN'),
      unreconciledExternal: c((t) => !isDuplicate(t) && t.source !== 'Existing Expense App' && !t.verified),
      undated: c((t) => !isDuplicate(t) && !t.date),
      lineItems: L.transactions.length - tx.length,
      issues: issues(L),
    };
  }

  // ── filtering / sorting for the list ──
  function query(L, q = {}) {
    const s = (q.search || '').toLowerCase().trim();
    let rows = L.transactions.filter((t) => t.kind === (q.kind || 'transaction'));
    // Duplicates are kept for audit but hidden from the list unless asked for.
    if (!q.showDuplicates && q.status !== 'DUPLICATE') rows = rows.filter((t) => !isDuplicate(t));
    if (s) rows = rows.filter((t) => {
      const kids = (L.children.get(t.id) || []).map((k) => k.expenditure).join(' ');
      return [t.expenditure, t.notes, t.source, t.source_reference, t.order_reference, t.category, kids].join(' ').toLowerCase().includes(s);
    });
    if (q.category) { const cats = String(q.category).split('|'); rows = rows.filter((t) => cats.includes(t.category)); }
    if (q.source) rows = rows.filter((t) => t.source === q.source);
    if (q.status) rows = rows.filter((t) => displayStatus(L, t) === q.status);
    if (q.refunded === 'yes') rows = rows.filter((t) => refundStatus(L, t) !== 'NONE');
    if (q.installed === 'yes') rows = rows.filter((t) => t.installed === true);
    if (q.installed === 'no') rows = rows.filter((t) => t.installed === false);
    if (q.installed === 'unknown') rows = rows.filter((t) => t.installed === null);
    if (q.from) rows = rows.filter((t) => t.date && t.date >= q.from);
    if (q.to) rows = rows.filter((t) => t.date && t.date <= q.to);
    const min = toPaise(q.min), max = toPaise(q.max);
    if (min !== null) rows = rows.filter((t) => (t.amount || 0) >= min);
    if (max !== null) rows = rows.filter((t) => (t.amount || 0) <= max);
    const sort = q.sort || 'newest';
    // Undated records always sort last for date sorts — they are not given a pretend date.
    const dcmp = (a, b, dir) => (!a.date && !b.date ? 0 : !a.date ? 1 : !b.date ? -1 : dir * a.date.localeCompare(b.date));
    const idx = new Map(L.transactions.map((t, i) => [t.id, i]));
    rows.sort((a, b) => sort === 'oldest' ? dcmp(a, b, 1) || idx.get(b.id) - idx.get(a.id)
      : sort === 'highest' ? (b.amount || 0) - (a.amount || 0)
      : sort === 'lowest' ? (a.amount || 0) - (b.amount || 0)
      : dcmp(a, b, -1) || idx.get(a.id) - idx.get(b.id));
    return rows;
  }

  function latest(L) { return query(L, { sort: 'newest' }).find((t) => counts(L, t) && t.date) || null; }

  // ── export ──
  const CSV_COLS = ['id', 'kind', 'parent_id', 'expenditure', 'amount', 'refunded', 'net', 'counts_in_total', 'display_status', 'date', 'notes', 'category', 'subcategory', 'source', 'source_reference', 'order_reference', 'status', 'verified', 'installed', 'quantity', 'listed_amount', 'duplicate_of', 'related', 'odometer_km', 'attachment_url', 'created_at', 'updated_at'];
  function toCSV(L) {
    const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [CSV_COLS.join(',')];
    for (const t of L.transactions) {
      const row = Object.assign({}, t, {
        amount: fromPaise(t.amount), listed_amount: fromPaise(t.listed_amount), refunded: fromPaise(refundTotal(L, t)), net: t.kind === 'transaction' ? fromPaise(netOf(L, t)) : '',
        counts_in_total: counts(L, t), display_status: displayStatus(L, t), installed: t.installed === null ? '' : t.installed,
      });
      lines.push(CSV_COLS.map((k) => esc(row[k])).join(','));
    }
    return lines.join('\n');
  }

  return {
    CATEGORIES, SOURCES, STATUSES, CONFIRMED, EXISTING_APP, DEFAULT_SETTINGS, normStatus, inBaseline,
    toPaise, fromPaise, formatINR, normTx, build, refundTotal, refundStatus, isDuplicate, counts, netOf,
    displayStatus, categoryOf, totals, baseline, monthly, cumulative, averageMonthly, litresOf, fuelStats,
    findDuplicates, issues, reconciliation, query, latest, toCSV,
  };
});
