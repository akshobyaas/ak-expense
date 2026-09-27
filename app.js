/* app.js — Ixora, a simple expense tracker for one Hunter 350.
   All money logic lives in ledger.js; this file only renders and saves. */
(function () {
  'use strict';
  const BIKE = { name: 'Ixora', model: 'Hunter 350', owner: 'Akshobya A S', initials: 'AS' };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (p) => Ledger.formatINR(p);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const shortDate = (d) => { if (!d) return null; const [y, m, dd] = d.split('-'); const t = todayISO(); if (d === t) return 'Today'; return `${+dd} ${MONTHS[+m - 1]}${y !== t.slice(0, 4) ? ' ' + y : ''}`; };
  const longDate = (d) => { if (!d) return null; const [y, m, dd] = d.split('-'); return `${+dd} ${LONG[+m - 1]} ${y}`; };
  const monthName = (k, short) => { const [y, m] = k.split('-'); return short ? MONTHS[+m - 1] : `${LONG[+m - 1]} ${y}`; };
  const compact = (p) => { const r = p / 100; return r >= 1e5 ? '₹' + (r / 1e5).toFixed(1).replace(/\.0$/, '') + 'L' : r >= 1000 ? '₹' + Math.round(r / 1000) + 'k' : '₹' + Math.round(r); };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const newId = () => `tx-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  // ── icons ──
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ic = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    back: svg('<path d="M15 18 9 12l6-6"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.01"/>'),
  };
  const CAT_ICON = {
    Fuel: svg('<path d="M4 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14M3 20h12M4 11h10"/><path d="M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>'),
    Maintenance: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.6-.6-.6-2.6Z"/>'),
    Repairs: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.6-.6-.6-2.6Z"/>'),
    Accessories: svg('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'),
    'Riding Gear': svg('<path d="M4 15a8 8 0 0 1 16-1v2a2 2 0 0 1-2 2H9"/><path d="M4 15h7l2-4h7"/>'),
    Modification: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'),
    Insurance: svg('<path d="M12 3 5 6v5c0 4.5 3 8.3 7 9.5 4-1.2 7-5 7-9.5V6Z"/>'),
    Documentation: svg('<path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>'),
    Other: svg('<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>'),
  };
  const iconFor = (c) => CAT_ICON[c] || CAT_ICON.Other;
  // Bookkeeping remarks from the audit stay in the Sheet but aren't shown in the app.
  const HIDDEN_NOTE = /^(Reconciled |Needs reconciliation|₹1 looks like a placeholder|Unitemised part of|invoice not attached)/;
  const cleanNotes = (n) => String(n || '').split(' · ').filter((p) => !HIDDEN_NOTE.test(p)).join(' · ');
  const hiddenNotes = (n) => String(n || '').split(' · ').filter((p) => HIDDEN_NOTE.test(p));

  // Categories as people say them. Maintenance + Repairs read as one thing: "Service".
  const GROUPS = [
    { label: 'Fuel', cats: ['Fuel'], icon: 'Fuel' },
    { label: 'Service', cats: ['Maintenance', 'Repairs'], icon: 'Repairs' },
    { label: 'Accessories', cats: ['Accessories'], icon: 'Accessories' },
    { label: 'Riding gear', cats: ['Riding Gear'], icon: 'Riding Gear' },
    { label: 'Mods', cats: ['Modification'], icon: 'Modification' },
    { label: 'Other', cats: ['Insurance', 'Documentation', 'Other'], icon: 'Other' },
  ];
  // What the add form offers (one category per chip).
  const ADD_CATS = [['Fuel', 'Fuel'], ['Repairs', 'Service'], ['Accessories', 'Accessories'], ['Riding Gear', 'Riding gear'], ['Modification', 'Mods'], ['Insurance', 'Insurance'], ['Other', 'Other']];

  // ── storage: your Google Sheet (via /api/ledger) when a key is set, otherwise this device ──
  const LOCAL_KEY = 'akx.data.v1';
  const Store = {
    key: ls.get('akx.key', ''),
    get mode() { return this.key ? 'cloud' : 'local'; },
    get live() { return this.mode === 'cloud' && !this.error; },
    raw: { transactions: [], refunds: [] },
    settings: Object.assign({}, Ledger.DEFAULT_SETTINGS),
    error: null,
    async api(method, body, qs = '') {
      const res = await fetch('/api/ledger' + qs, { method, headers: { 'Content-Type': 'application/json', 'X-Vault-Key': this.key }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    },
    async load() {
      this.error = null;
      if (this.mode === 'cloud') {
        try {
          const d = await this.api('GET', null, '?type=all');
          this.raw = { transactions: d.transactions, refunds: d.refunds };
          if (d.meta && d.meta.reportedBaseline) this.settings.reportedBaseline = Number(d.meta.reportedBaseline);
          return;
        } catch (e) { this.error = e.message; }
      }
      const local = ls.get(LOCAL_KEY, null);
      this.raw = local ? { transactions: local.transactions, refunds: local.refunds } : { transactions: [], refunds: [] };
    },
    saveLocal() { ls.set(LOCAL_KEY, { transactions: this.raw.transactions, refunds: this.raw.refunds }); },
    async addTx(t) {
      if (this.live) { const d = await this.api('POST', { type: 'transactions', item: t }); this.raw.transactions.push(d.item); return d.item; }
      const now = new Date().toISOString(); Object.assign(t, { created_at: now, updated_at: now });
      this.raw.transactions.push(t); this.saveLocal(); return t;
    },
    async updateTx(t) {
      const i = this.raw.transactions.findIndex((x) => String(x.id) === t.id);
      if (this.live) { const d = await this.api('PUT', { type: 'transactions', item: t }); this.raw.transactions[i] = d.item; return d.item; }
      this.raw.transactions[i] = Object.assign({}, this.raw.transactions[i], t, { updated_at: new Date().toISOString() }); this.saveLocal(); return this.raw.transactions[i];
    },
    async deleteTx(id) {
      const gone = Ledger.deletionSet(L, id);
      if (this.live) await this.api('DELETE', null, '?id=' + encodeURIComponent(id));
      this.raw.transactions = this.raw.transactions.filter((t) => !gone.has(String(t.id)));
      this.raw.refunds = this.raw.refunds.filter((r) => !gone.has(String(r.transaction_id)));
      if (!this.live) this.saveLocal();
    },
  };

  let L = null;
  const state = { q: '', cat: 'all', statCat: 'all', draft: null };
  const rebuild = () => { L = Ledger.build(Store.raw, Store.settings); };

  // ── pieces ──
  const groupOf = (t) => GROUPS.find((g) => g.cats.includes(Ledger.categoryOf(L, t))) || GROUPS[5];
  function money(p, cls = '') {
    const r = Math.floor(Math.abs(p) / 100), ps = Math.abs(p) % 100;
    return `<span class="num ${cls}">${fmt(r * 100 * Math.sign(p || 1))}${ps ? `<small>.${String(ps).padStart(2, '0')}</small>` : ''}</span>`;
  }
  function amountCell(t) {
    const ds = Ledger.displayStatus(L, t);
    if (ds === 'REFUNDED') return `<span class="strike">${fmt(t.amount)}</span><small>refunded</small>`;
    if (ds === 'PARTIALLY REFUNDED') return `${fmt(Ledger.netOf(L, t))}<small>after refund</small>`;
    if (ds === 'DUPLICATE') return `<span class="strike">${fmt(t.amount)}</span><small>duplicate</small>`;
    if (!Ledger.counts(L, t)) return `${fmt(t.amount)}<small>not counted</small>`;
    return fmt(t.amount);
  }
  function item(t) {
    const kids = L.children.get(t.id) || [];
    const note = t.notes === t.expenditure ? '' : cleanNotes(t.notes).split(' · ')[0];
    const sub = [t.date ? shortDate(t.date) : 'No date', kids.length ? `${kids.length} items` : note].filter(Boolean).join(' · ');
    const off = !Ledger.counts(L, t) || Ledger.displayStatus(L, t) === 'REFUNDED';
    return `<a class="item ${off ? 'off' : ''}" href="#/e/${encodeURIComponent(t.id)}">
      <span class="ico">${iconFor(Ledger.categoryOf(L, t))}</span>
      <span style="min-width:0"><div class="name">${esc(t.expenditure)}</div><div class="sub">${esc(sub)}</div></span>
      <span class="amt num">${amountCell(t)}</span></a>`;
  }
  function groupedList(rows) {
    if (!rows.length) return `<div class="empty">Nothing here yet.</div>`;
    const groups = new Map();
    for (const t of rows) { const k = t.date ? t.date.slice(0, 7) : 'none'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
    return [...groups].map(([k, ts]) => {
      const sum = ts.reduce((s, t) => s + (Ledger.counts(L, t) ? Ledger.netOf(L, t) : 0), 0);
      return `<div class="group"><span>${k === 'none' ? 'Date not known' : monthName(k)}</span><span class="num">${fmt(sum)}</span></div><div class="list">${ts.map(item).join('')}</div>`;
    }).join('');
  }
  const head = (title, sub) => `<div class="head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div><a class="avatar" href="#/more" aria-label="More">${BIKE.initials}</a></div>`;
  const backBtn = () => `<button class="back" id="back">${ic.back} Back</button>`;

  // ── charts (single accent, hover/tap tooltips) ──
  const ACC = '#ff6a3d', GRID = 'rgba(255,255,255,.06)', AX = '#7c7a75';
  function niceCeil(v) { if (v <= 0) return 100; const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  function drawBar(el, series) {
    const W = el.clientWidth || 320, H = 170, padL = 34, padB = 22, padT = 6;
    if (!series.length) { el.innerHTML = `<div class="empty">No dated expenses yet</div>`; return; }
    const top = niceCeil(Math.max(...series.map((d) => d.value), 1)); const band = (W - padL) / series.length; const bw = Math.max(4, Math.min(22, band * 0.5));
    const y = (v) => padT + (H - padT - padB) * (1 - v / top);
    const every = Math.ceil(series.length / Math.max(1, Math.floor((W - padL) / 40)));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending by month">`;
    [0, top / 2, top].forEach((t) => { s += `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="${AX}">${compact(t)}</text>`; });
    series.forEach((d, i) => {
      const cx = padL + band * i + band / 2, t = y(d.value), h = H - padB - t, r = Math.min(4, h);
      if (d.value > 0) s += `<path d="M${cx - bw / 2},${H - padB} V${t + r} q0,-${r} ${r},-${r} H${cx + bw / 2 - r} q${r},0 ${r},${r} V${H - padB} Z" fill="${ACC}"/>`;
      if (i % every === 0) s += `<text x="${cx}" y="${H - 5}" text-anchor="middle" font-size="11" fill="${AX}">${monthName(d.month, true)}</text>`;
      s += `<rect x="${padL + band * i}" y="0" width="${band}" height="${H - padB}" fill="transparent" data-i="${i}"/>`;
    });
    el.innerHTML = s + `</svg><div class="tip"></div>`;
    const tip = $('.tip', el);
    $$('rect[data-i]', el).forEach((r) => {
      const show = () => { const i = +r.dataset.i, d = series[i]; tip.innerHTML = `<span class="muted">${monthName(d.month)}</span><b class="num">${fmt(d.value)}</b>`; tip.style.left = Math.min(Math.max(padL + band * i + band / 2, 60), W - 60) + 'px'; tip.style.top = y(d.value) + 'px'; tip.style.opacity = 1; };
      r.addEventListener('pointerenter', show); r.addEventListener('pointerdown', show); r.addEventListener('pointerleave', () => (tip.style.opacity = 0));
    });
  }
  function drawLine(el, series) {
    const W = el.clientWidth || 320, H = 160, padL = 34, padB = 22, padT = 8, padR = 6;
    if (series.length < 2) { el.innerHTML = `<div class="empty">Needs two months of data</div>`; return; }
    const top = niceCeil(Math.max(...series.map((d) => d.value)));
    const x = (i) => padL + (W - padL - padR) * (i / (series.length - 1)), y = (v) => padT + (H - padT - padB) * (1 - v / top);
    const pts = series.map((d, i) => [x(i), y(d.value)]);
    const every = Math.ceil(series.length / Math.max(1, Math.floor((W - padL) / 40)));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Running total">`;
    [0, top / 2, top].forEach((t) => { s += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="${AX}">${compact(t)}</text>`; });
    s += `<path d="M${pts.map((p) => p.join(',')).join(' L')}" fill="none" stroke="${ACC}" stroke-width="2" stroke-linejoin="round"/>`;
    series.forEach((d, i) => { if (i % every === 0 || i === series.length - 1) s += `<text x="${x(i)}" y="${H - 5}" text-anchor="middle" font-size="11" fill="${AX}">${monthName(d.month, true)}</text>`; });
    s += `<line class="xh" y1="${padT}" y2="${H - padB}" stroke="rgba(255,255,255,.2)" opacity="0"/><circle class="dot" r="4.5" fill="${ACC}" stroke="#0d0d0d" stroke-width="2" opacity="0"/><rect class="hit" x="${padL}" y="0" width="${W - padL}" height="${H}" fill="transparent"/></svg><div class="tip"></div>`;
    el.innerHTML = s;
    const tip = $('.tip', el), xh = $('.xh', el), dot = $('.dot', el), svgEl = $('svg', el);
    const move = (ev) => {
      const b = svgEl.getBoundingClientRect(); const px = (ev.clientX - b.left) * (W / b.width);
      const i = Math.max(0, Math.min(series.length - 1, Math.round(((px - padL) / (W - padL - padR)) * (series.length - 1)))); const [cx, cy] = pts[i];
      xh.setAttribute('x1', cx); xh.setAttribute('x2', cx); xh.setAttribute('opacity', 1); dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('opacity', 1);
      tip.innerHTML = `<span class="muted">by end of ${monthName(series[i].month)}</span><b class="num">${fmt(series[i].value)}</b>`; tip.style.left = Math.min(Math.max(cx, 70), W - 70) + 'px'; tip.style.top = cy + 'px'; tip.style.opacity = 1;
    };
    const hit = $('.hit', el); hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { tip.style.opacity = 0; xh.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); });
  }
  let chartJobs = [];
  const chart = (fn, series) => { const id = 'c' + Math.random().toString(36).slice(2, 8); chartJobs.push(() => { const el = document.getElementById(id); if (el) fn(el, series); }); return `<div class="chart" id="${id}"></div>`; };

  // ── Home ──
  function viewHome() {
    const T = Ledger.totals(L), B = Ledger.baseline(L), rc = Ledger.reconciliation(L), mon = Ledger.monthly(L), fuel = Ledger.fuelStats(L);
    const thisMonth = (mon.series.find((p) => p.month === todayISO().slice(0, 7)) || { value: 0 }).value;
    const first = mon.series[0];
    const cats = GROUPS.map((g) => ({ ...g, v: g.cats.reduce((s, c) => s + (T.byCategory[c] || 0), 0) })).filter((g) => g.v > 0).sort((a, b) => b.v - a.v);
    const max = Math.max(...cats.map((c) => c.v), 1);
    const recent = Ledger.query(L, { sort: 'newest' }).filter((t) => t.date).slice(0, 5);
    const needs = [];
    if (T.pending) needs.push(`<b class="num">${fmt(T.pending)}</b> isn't counted yet`);
    if (B.gap) needs.push(`<b class="num">${fmt(B.gap)}</b> from your old app isn't listed`);
    if (rc.issues.length) needs.push(`${rc.issues.length} thing${rc.issues.length === 1 ? '' : 's'} look off`);
    return `<div class="view">${head(BIKE.name, BIKE.model)}
      <section class="hero">
        <div class="k">${esc(BIKE.name)} has cost you</div>
        <div class="big">${money(T.net)}</div>
        <div class="sub">${first ? `since ${monthName(first.month)} · ` : ''}<b class="num">${fmt(thisMonth)}</b> this month</div>
        ${needs.length ? `<a class="note" href="#/check">${ic.alert.replace('<svg', '<svg width="18" height="18" style="flex:none;color:var(--warn)"')}<span>${needs.join(' · ')}. Tap to sort it out.</span></a>` : ''}
      </section>
      <h2 class="sec">Where it went</h2>
      ${cats.map((c) => `<a class="cat" href="#/expenses?cat=${encodeURIComponent(c.label)}"><span class="ico">${iconFor(c.icon)}</span><span><span>${c.label}</span><span class="pct num">${Math.round((c.v / T.net) * 100)}%</span><div class="bar"><i style="width:${((c.v / max) * 100).toFixed(1)}%"></i></div></span><span class="num">${fmt(c.v)}</span></a>`).join('') || `<div class="empty">Tap + to log your first expense.</div>`}
      ${fuel.avgPricePerLitre ? `<p class="sentence">Petrol has averaged <b class="num">${fmt(fuel.avgPricePerLitre)}/L</b>, about <b class="num">${fuel.avgLitresPerFill} L</b> a fill.</p>` : ''}
      <h2 class="sec">Recent <a href="#/expenses">See all</a></h2>
      <div class="list">${recent.map(item).join('') || '<div class="empty">Nothing yet.</div>'}</div>
    </div>`;
  }

  // ── Expenses ──
  function viewExpenses(params) {
    if (params.cat) state.cat = params.cat;
    const g = GROUPS.find((x) => x.label === state.cat);
    const rows = Ledger.query(L, { search: state.q, category: g ? g.cats.join('|') : '', sort: 'newest' });
    return `<div class="view">${head('Expenses', `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`)}
      <label class="search">${ic.search.replace('<svg', '<svg width="18" height="18"')}<input id="q" type="search" placeholder="Search" value="${esc(state.q)}" autocomplete="off"/></label>
      <div class="chips">${['all', ...GROUPS.map((x) => x.label)].map((c) => `<button class="chip ${state.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${c === 'all' ? 'All' : esc(c)}</button>`).join('')}</div>
      <div id="rows">${groupedList(rows)}</div>
    </div>`;
  }
  function bindExpenses() {
    const q = $('#q'); let tm;
    q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { state.q = q.value; const g = GROUPS.find((x) => x.label === state.cat); $('#rows').innerHTML = groupedList(Ledger.query(L, { search: state.q, category: g ? g.cats.join('|') : '', sort: 'newest' })); }, 120); });
    $$('[data-cat]').forEach((b) => b.onclick = () => { state.cat = b.dataset.cat; if (location.hash !== '#/expenses') location.hash = '#/expenses'; else render(); });
  }

  // ── One expense ──
  function viewDetail(id) {
    const t = L.byId.get(id);
    if (!t) return `<div class="view">${backBtn()}<div class="empty">This expense doesn't exist any more.</div></div>`;
    const kids = L.children.get(t.id) || []; const parent = t.parent_id ? L.byId.get(t.parent_id) : null;
    const refunded = Ledger.refundTotal(L, t); const ds = Ledger.displayStatus(L, t);
    const cat = groupOf(t).label;
    const pending = t.kind === 'transaction' && ['NEEDS_REVIEW', 'UNKNOWN'].includes(t.status);
    return `<div class="view">${backBtn()}
      <div class="d-top"><span class="ico">${iconFor(Ledger.categoryOf(L, t))}</span><div><h1 class="d-name">${esc(t.expenditure)}</h1><div class="d-meta">${esc(cat)} · ${t.date ? longDate(t.date) : 'date not known'}</div></div></div>
      <div class="d-amt">${money(t.amount)}</div>
      ${refunded ? `<div class="t2">Refunded ${fmt(refunded)} — counts as <b style="color:var(--text)">${fmt(Ledger.netOf(L, t))}</b></div>` : ''}
      ${ds === 'DUPLICATE' ? `<div class="t2">A second record of something already logged, so it isn't counted.</div>` : ''}
      ${pending ? `<div class="warn-card" style="margin-top:14px"><p>This one <b>isn't counted</b> in your total yet.</p><button class="btn sm primary" data-act="count">Count it</button></div>` : ''}
      ${cleanNotes(t.notes) && t.notes !== t.expenditure ? `<p class="d-notes">${esc(cleanNotes(t.notes))}</p>` : ''}
      ${parent ? `<h2 class="sec">Part of</h2><div class="list">${item(parent)}</div>` : ''}
      ${kids.length ? `<h2 class="sec">In this order</h2><div class="list">${kids.map((k) => `<a class="item" href="#/e/${encodeURIComponent(k.id)}"><span class="ico">${iconFor(Ledger.categoryOf(L, k))}</span><span style="min-width:0"><div class="name">${esc(k.expenditure)}</div>${k.notes ? `<div class="sub">${esc(k.notes)}</div>` : ''}</span><span class="amt num">${fmt(k.amount)}</span></a>`).join('')}</div>` : ''}
      <div class="d-actions">
        <a class="btn block" href="#/edit/${encodeURIComponent(t.id)}">Edit</a>
        <button class="btn danger block" data-act="delete">Delete</button>
      </div>
    </div>`;
  }
  function bindDetail(id) {
    $('#back').onclick = goBack;
    const t = L.byId.get(id); if (!t) return;
    $('[data-act="count"]')?.addEventListener('click', async () => {
      try { await Store.updateTx(Object.assign({}, Store.raw.transactions.find((x) => String(x.id) === id), { id, status: 'CONFIRMED_NEW' })); rebuild(); toast('Counted'); render(); } catch (e) { toast('Couldn\'t save: ' + e.message); }
    });
    $('[data-act="delete"]').onclick = () => {
      const gone = Ledger.deletionSet(L, id); const extra = gone.size - 1;
      sheet(`<h3>Delete ${esc(t.expenditure)}?</h3><p>${fmt(t.amount)} will be removed for good${extra ? `, along with ${extra} linked item${extra === 1 ? '' : 's'}` : ''}. This can't be undone.</p>
        <div class="row2"><button class="btn" id="n">Keep it</button><button class="btn primary" id="y" style="background:var(--bad)">Delete</button></div>`, (root) => {
        $('#n', root).onclick = closeSheet;
        $('#y', root).onclick = async () => {
          $('#y', root).disabled = true;
          try { await Store.deleteTx(id); rebuild(); closeSheet(); toast('Deleted'); location.hash = '#/expenses'; } catch (e) { closeSheet(); toast('Couldn\'t delete: ' + e.message); }
        };
      });
    };
  }

  // ── Add / edit ──
  function blank() { return { amount: '', category: 'Fuel', expenditure: '', date: todayISO(), notes: '', litres: '', full: true }; }
  function viewAdd(editId) {
    const editing = editId ? L.byId.get(editId) : null;
    if (!state.draft || state.draft._for !== (editId || 'new')) {
      state.draft = editing ? { amount: editing.amount === null ? '' : String(Ledger.fromPaise(editing.amount)), category: editing.category, expenditure: editing.expenditure, date: editing.date || '', notes: cleanNotes(editing.notes), litres: '', full: true } : blank();
      state.draft._for = editId || 'new';
    }
    const d = state.draft; const fuel = d.category === 'Fuel' && !editing;
    return `<div class="view">${backBtn()}
      <form class="form" id="f" novalidate>
        <label class="amount-in"><span>₹</span><input name="amount" inputmode="decimal" placeholder="0" value="${esc(d.amount)}" autocomplete="off" aria-label="Amount" ${editing ? '' : 'autofocus'}/></label>
        <div class="chips">${ADD_CATS.map(([v, l]) => `<button type="button" class="chip ${d.category === v || (v === 'Repairs' && d.category === 'Maintenance') ? 'on' : ''}" data-c="${v}">${l}</button>`).join('')}</div>
        ${fuel ? `<div class="row2"><label class="field"><span>Litres</span><input class="input num" name="litres" inputmode="decimal" placeholder="Optional" value="${esc(d.litres)}"/></label>
          <div class="field"><span>Fill</span><div class="seg"><button type="button" data-full="1" class="${d.full ? 'on' : ''}">Full</button><button type="button" data-full="0" class="${d.full ? '' : 'on'}">Partial</button></div></div></div>`
        : `<label class="field"><span>What was it?</span><input class="input" name="expenditure" placeholder="e.g. Chain lube" value="${esc(d.expenditure)}"/></label>`}
        <label class="field"><span>Date <button type="button" class="linkbtn" id="nodate">${d.date ? "Don't know" : 'Use today'}</button></span><input class="input" type="date" name="date" value="${esc(d.date)}"/></label>
        ${fuel ? '' : `<label class="field"><span>Note</span><input class="input" name="notes" placeholder="Optional" value="${esc(d.notes)}"/></label>`}
        <div id="dup"></div>
        <button class="btn primary block" id="save">${editing ? 'Save' : 'Add expense'}</button>
      </form></div>`;
  }
  function readForm(f) { const d = state.draft; for (const [k, v] of new FormData(f)) if (k in d) d[k] = String(v).trim(); return d; }
  function bindAdd(editId) {
    const editing = editId ? L.byId.get(editId) : null; const f = $('#f');
    $('#back').onclick = () => { state.draft = null; goBack(); };
    f.addEventListener('input', () => { readForm(f); $('#dup').innerHTML = ''; });
    $$('[data-c]').forEach((b) => b.onclick = () => { readForm(f); state.draft.category = b.dataset.c; render(); });
    $$('[data-full]').forEach((b) => b.onclick = () => { state.draft.full = b.dataset.full === '1'; $$('[data-full]').forEach((x) => x.classList.toggle('on', x === b)); });
    $('#nodate').onclick = () => { f.date.value = f.date.value ? '' : todayISO(); readForm(f); $('#nodate').textContent = f.date.value ? "Don't know" : 'Use today'; };
    const save = async (tx) => {
      try { if (editing) await Store.updateTx(tx); else await Store.addTx(tx); state.draft = null; rebuild(); toast(editing ? 'Saved' : 'Added'); location.hash = editing ? '#/e/' + encodeURIComponent(tx.id) : '#/'; }
      catch (e) { toast('Couldn\'t save: ' + e.message); }
    };
    f.onsubmit = (e) => {
      e.preventDefault(); const d = readForm(f); const p = Ledger.toPaise(d.amount);
      if (!p || p <= 0) { toast('Enter the amount'); f.amount.focus(); return; }
      const isFuel = d.category === 'Fuel' && !editing; const litres = parseFloat(d.litres);
      const base = editing ? Object.assign({}, Store.raw.transactions.find((x) => String(x.id) === editId)) : { id: newId(), kind: 'transaction', source: 'Manual', status: 'CONFIRMED_NEW', verified: false };
      const tx = Object.assign(base, {
        amount: Ledger.fromPaise(p), category: d.category, date: d.date || '',
        expenditure: isFuel ? 'Fuel' : d.expenditure,
        // hidden bookkeeping remarks are carried over on edit, never silently dropped
        notes: isFuel ? [Number.isFinite(litres) ? `${litres.toFixed(2)} L` : '', d.full ? 'Full tank' : 'Partial'].filter(Boolean).join(' — ') : [d.notes, ...(editing ? hiddenNotes(editing.notes) : [])].filter(Boolean).join(' · '),
      });
      if (!tx.expenditure) { toast('Say what it was'); f.expenditure?.focus(); return; }
      if (editing) return save(tx);
      // Don't let the same thing be logged twice by accident.
      const m = Ledger.findDuplicates(L, tx)[0];
      if (!m) return save(tx);
      const x = L.byId.get(m.id);
      $('#dup').innerHTML = `<div class="warn-card"><p>Looks like you already logged this: <b>${esc(x.expenditure)} · ${fmt(x.amount)}</b>${x.date ? ` on ${shortDate(x.date)}` : ''}.</p><div class="row2"><button type="button" class="btn sm" id="skip">It's the same</button><button type="button" class="btn sm primary" id="anyway">Add anyway</button></div></div>`;
      $('#skip').onclick = () => { state.draft = null; toast('Not added — already there'); location.hash = '#/e/' + encodeURIComponent(x.id); };
      $('#anyway').onclick = () => save(tx);
    };
  }

  // ── Stats ──
  function viewStats() {
    const g = GROUPS.find((x) => x.label === state.statCat);
    const mon = Ledger.monthly(L, g ? (t) => g.cats.includes(t.category) : null);
    const avg = mon.series.length ? Math.round(mon.series.reduce((s, p) => s + p.value, 0) / mon.series.length) : 0;
    const cum = Ledger.cumulative(L);
    return `<div class="view">${head('Stats', BIKE.name)}
      <div class="hero"><div class="k">${g ? esc(g.label) + ' — about' : 'About'}</div><div class="big" style="font-size:44px">${money(Math.round(avg / 100) * 100)}</div><div class="sub">a month on average</div></div>
      <div class="chips" style="margin-top:22px">${['all', ...GROUPS.map((x) => x.label)].map((c) => `<button class="chip ${state.statCat === c ? 'on' : ''}" data-s="${esc(c)}">${c === 'all' ? 'All' : esc(c)}</button>`).join('')}</div>
      ${chart(drawBar, mon.series)}
      ${mon.undated ? `<p class="sentence" style="font-size:13.5px">${fmt(mon.undated)} has no date, so it isn't in the chart.</p>` : ''}
      <h2 class="sec">Running total</h2>
      ${chart(drawLine, cum.series)}
    </div>`;
  }
  function bindStats() { $$('[data-s]').forEach((b) => b.onclick = () => { state.statCat = b.dataset.s; render(); }); }

  // ── More ──
  function viewMore() {
    const rc = Ledger.reconciliation(L), T = Ledger.totals(L), B = Ledger.baseline(L);
    const ok = !rc.issues.length && !T.pending && !B.gap;
    return `<div class="view">${backBtn()}
      <div class="d-top"><span class="avatar" style="width:52px;height:52px;font-size:16px">${BIKE.initials}</span><div><h1 class="d-name">${esc(BIKE.owner)}</h1><div class="d-meta">${esc(BIKE.name)} · ${esc(BIKE.model)}</div></div></div>
      <h2 class="sec">Sync</h2>
      <div class="card">
        <div class="kv"><span>Saving to</span><span>${Store.live ? 'Google Sheet' : Store.error ? '<span class="pill bad">Sheet offline — this device</span>' : 'This device only'}</span></div>
        <div style="padding:6px 0 14px;display:grid;gap:10px"><input class="input" id="key" type="password" placeholder="Vault key" value="${esc(Store.key)}" autocomplete="off" style="background:var(--raise-2)"/>
        <button class="btn sm" id="savekey">${Store.key ? 'Update key' : 'Connect'}</button></div>
      </div>
      <h2 class="sec">Your data</h2>
      <div class="row2"><button class="btn sm" id="csv">Export CSV</button><button class="btn sm" id="json">Export JSON</button></div>
      <a class="item" href="#/check" style="margin-top:14px;grid-template-columns:minmax(0,1fr) auto"><span><div class="name">Check data</div><div class="sub">Totals, duplicates, anything uncounted</div></span><span class="pill ${ok ? 'good' : 'warn'}">${ok ? 'All good' : 'Needs a look'}</span></a>
    </div>`;
  }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function bindMore() {
    $('#back').onclick = goBack;
    $('#savekey').onclick = async () => { Store.key = $('#key').value.trim(); ls.set('akx.key', Store.key); await Store.load(); rebuild(); toast(Store.error ? 'Couldn\'t reach the Sheet' : Store.key ? 'Connected' : 'Saving on this device'); render(); };
    const day = todayISO();
    $('#csv').onclick = () => download(`ixora-expenses-${day}.csv`, Ledger.toCSV(L), 'text/csv');
    $('#json').onclick = () => download(`ixora-backup-${day}.json`, JSON.stringify({ app: 'ixora', exported_at: new Date().toISOString(), transactions: Store.raw.transactions, refunds: Store.raw.refunds }, null, 2), 'application/json');
  }

  // ── Check data (only needed when something's off) ──
  function viewCheck() {
    const T = Ledger.totals(L), B = Ledger.baseline(L), rc = Ledger.reconciliation(L);
    const pending = L.transactions.filter((t) => t.kind === 'transaction' && ['NEEDS_REVIEW', 'UNKNOWN'].includes(t.status));
    const dups = L.transactions.filter((t) => t.kind === 'transaction' && Ledger.isDuplicate(t));
    return `<div class="view">${backBtn()}<h1 class="d-name" style="margin-bottom:18px">Check data</h1>
      <div class="card">
        <div class="kv"><span>Total</span><span class="num">${fmt(T.net)}</span></div>
        <div class="kv"><span>Old app said</span><span class="num">${fmt(B.reported)}</span></div>
        <div class="kv"><span>Old app entries listed here</span><span class="num">${fmt(B.imported)}</span></div>
        ${B.gap ? `<div class="kv"><span>Missing from old app</span><span class="num" style="color:var(--warn)">${fmt(B.gap)}</span></div>` : ''}
        ${T.refunds ? `<div class="kv"><span>Refunds</span><span class="num">${fmt(T.refunds)}</span></div>` : ''}
      </div>
      ${rc.issues.length ? `<h2 class="sec">Looks off</h2>${rc.issues.map((i) => `<p class="sentence">• ${esc(L.byId.get(i.id)?.expenditure || 'Old app total')}: ${esc(i.msg)}</p>`).join('')}` : `<p class="sentence">Everything adds up. ✓</p>`}
      ${pending.length ? `<h2 class="sec">Not counted yet</h2><div class="list">${pending.map(item).join('')}</div>` : ''}
      ${dups.length ? `<h2 class="sec">Duplicates <span class="muted" style="font-weight:400;font-size:13px">kept out of the total</span></h2><div class="list">${dups.map(item).join('')}</div>` : ''}
    </div>`;
  }

  // ── sheet / toast ──
  function sheet(html, bind) { closeSheet(); const s = document.createElement('div'); s.className = 'scrim'; s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`; s.addEventListener('click', (e) => { if (e.target === s) closeSheet(); }); document.body.appendChild(s); bind && bind(s); }
  function closeSheet() { $$('.scrim').forEach((s) => s.remove()); }
  let toastT; function toast(msg) { $$('.toast').forEach((t) => t.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2400); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  const goBack = () => (history.length > 1 ? history.back() : (location.hash = '#/'));

  // ── nav + router ──
  function renderNav(route) {
    const on = (r) => (r === route || (r === 'expenses' && route === 'e') ? 'on' : '');
    $('#nav').innerHTML = `<a class="${on('')}" href="#/">Home</a><a class="${on('expenses')}" href="#/expenses">Expenses</a><a class="${on('stats')}" href="#/stats">Stats</a><a class="add" href="#/add" aria-label="Add expense">${ic.plus}</a>`;
    $('#nav').style.display = route === 'add' || route === 'edit' ? 'none' : '';
  }
  function parse() { const h = location.hash.replace(/^#\/?/, ''); const [p, qs] = h.split('?'); const [route, id] = p.split('/'); return { route: route || '', id: id ? decodeURIComponent(id) : null, params: Object.fromEntries(new URLSearchParams(qs || '')) }; }
  let last = null;
  function render() {
    const { route, id, params } = parse(); chartJobs = [];
    const views = { '': viewHome, expenses: () => viewExpenses(params), e: () => viewDetail(id), add: () => viewAdd(null), edit: () => viewAdd(id), stats: viewStats, more: viewMore, check: viewCheck };
    $('#app').innerHTML = (views[route] || viewHome)();
    renderNav(route);
    if (route + id !== last) { window.scrollTo(0, 0); last = route + id; }
    ({ expenses: bindExpenses, e: () => bindDetail(id), add: () => bindAdd(null), edit: () => bindAdd(id), stats: bindStats, more: bindMore, check: () => ($('#back').onclick = goBack) }[route] || (() => {}))();
    chartJobs.forEach((f) => f());
  }
  window.addEventListener('hashchange', () => { if (!/^#\/(add|edit)/.test(location.hash)) state.draft = null; closeSheet(); render(); });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => chartJobs.forEach((f) => f()), 150); });

  (async function boot() {
    $('#app').innerHTML = `<div class="empty">Loading…</div>`;
    await Store.load(); rebuild(); render();
  })();
})();
