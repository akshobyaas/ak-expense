/* app.js — UI for the motorcycle ownership ledger.
   All money logic lives in ledger.js; this file only renders and persists. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (p) => Ledger.formatINR(p);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (d) => { if (!d) return null; const [y, m, dd] = d.split('-'); return `${+dd} ${MONTHS[+m - 1]} ${y}`; };
  const fmtMonth = (k, short) => { const [y, m] = k.split('-'); return short ? MONTHS[+m - 1] : `${MONTHS[+m - 1]} ${y}`; };
  const compact = (p) => { const r = p / 100; return r >= 1e5 ? '₹' + (r / 1e5).toFixed(r >= 1e6 ? 0 : 1).replace(/\.0$/, '') + 'L' : r >= 1000 ? '₹' + (r / 1000).toFixed(r >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : '₹' + Math.round(r); };
  const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

  // ── icons ──
  const I = (d, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ic = {
    home: I('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>'),
    list: I('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".8"/><circle cx="3.5" cy="12" r=".8"/><circle cx="3.5" cy="18" r=".8"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>', 22),
    check: I('<path d="M4 12.5 9 17.5 20 6.5"/>'),
    shield: I('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/>'),
    chart: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
    search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 18),
    filter: I('<path d="M3 5h18M6 12h12M10 19h4"/>', 18),
    back: I('<path d="M15 18 9 12l6-6"/>', 18),
    chev: I('<path d="m9 18 6-6-6-6"/>', 16),
    info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>', 16),
    warn: I('<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.01"/>', 16),
    gauge: I('<circle cx="12" cy="13" r="8"/><path d="m12 13 4-3"/>', 18),
  };
  const logo = `<svg width="18" height="18" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="18" fill="none" stroke="#d6a45c" stroke-width="4"/><path d="M32 32 L44 23" stroke="#ecedef" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="32" r="4" fill="#ecedef"/></svg>`;

  // ── store: Google Sheet via /api/ledger when a key is set, otherwise this browser ──
  const LOCAL_KEY = 'akx.data.v1';
  const Store = {
    key: ls.get('akx.key', ''),
    get mode() { return this.key ? 'cloud' : 'local'; },
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
          const m = d.meta || {};
          if (m.reportedBaseline) this.settings.reportedBaseline = Number(m.reportedBaseline);
          if (m.countUnverified) this.settings.countUnverified = m.countUnverified === 'true';
          if (m.countNeedsReview) this.settings.countNeedsReview = m.countNeedsReview !== 'false';
          return;
        } catch (e) { this.error = e.message; }
      }
      const local = ls.get(LOCAL_KEY, null);
      this.raw = local ? { transactions: local.transactions, refunds: local.refunds } : { transactions: JSON.parse(JSON.stringify(SEED.transactions)), refunds: JSON.parse(JSON.stringify(SEED.refunds)) };
      Object.assign(this.settings, ls.get('akx.settings', {}));
      if (!local) this.saveLocal();
    },
    saveLocal() { ls.set(LOCAL_KEY, { transactions: this.raw.transactions, refunds: this.raw.refunds }); },
    stamp(o, isNew) { const now = new Date().toISOString(); if (isNew) o.created_at = now; o.updated_at = now; return o; },
    async addTx(t) {
      if (this.mode === 'cloud' && !this.error) { const d = await this.api('POST', { type: 'transactions', item: t }); this.raw.transactions.push(d.item); return d.item; }
      this.raw.transactions.push(this.stamp(t, true)); this.saveLocal(); return t;
    },
    async updateTx(t) {
      if (this.mode === 'cloud' && !this.error) { const d = await this.api('PUT', { type: 'transactions', item: t }); const i = this.raw.transactions.findIndex((x) => String(x.id) === t.id); this.raw.transactions[i] = d.item; return d.item; }
      const i = this.raw.transactions.findIndex((x) => String(x.id) === t.id);
      this.raw.transactions[i] = this.stamp(Object.assign({}, this.raw.transactions[i], t)); this.saveLocal(); return this.raw.transactions[i];
    },
    async addRefund(r) {
      if (this.mode === 'cloud' && !this.error) { const d = await this.api('POST', { type: 'refunds', item: r }); this.raw.refunds.push(d.item); return; }
      r.created_at = new Date().toISOString(); this.raw.refunds.push(r); this.saveLocal();
    },
    async setSetting(k, v) {
      this.settings[k] = v;
      if (this.mode === 'cloud' && !this.error) await this.api('PUT', { type: 'meta', item: { key: k, value: v } });
      else ls.set('akx.settings', this.settings);
    },
    async upload(file) {
      const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(file); });
      return (await this.api('POST', { type: 'upload', filename: file.name, mimeType: file.type, data })).url;
    },
  };
  const newId = (p = 'tx') => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  // ── app state ──
  let L = null;
  const state = { q: { sort: 'newest' }, chartCat: 'all', reconFilter: 'needsReview', draft: null };
  const rebuild = () => { L = Ledger.build(Store.raw, Store.settings); };

  // ── nav ──
  const NAV = [
    { r: '', label: 'Overview', icon: ic.home },
    { r: 'expenses', label: 'Expenses', icon: ic.list },
    { r: 'add', label: 'Add', icon: ic.plus, add: true },
    { r: 'reconcile', label: 'Reconcile', icon: ic.shield },
    { r: 'analytics', label: 'Insights', icon: ic.chart },
  ];
  function renderNav(route) {
    const active = (r) => (r === route || (r === 'expenses' && route === 'e')) ? 'active' : '';
    $('#tabbar').innerHTML = NAV.map((n) => n.add
      ? `<a href="#/add" class="tab-add" aria-label="Add expense">${n.icon}</a>`
      : `<a href="#/${n.r}" class="tab ${active(n.r)}">${n.icon}<span>${n.label}</span></a>`).join('');
    const rc = L ? Ledger.reconciliation(L) : null;
    $('#rail').innerHTML = `<div class="brand"><div class="brand-mark">${logo}</div><div><h1>Ledger</h1><small>Interceptor 650 · ownership</small></div></div>
      <a href="#/add" class="btn primary add">${ic.plus} Add expense</a>
      ${NAV.filter((n) => !n.add).map((n) => `<a class="nav ${active(n.r)}" href="#/${n.r}">${n.icon}<span style="flex:1">${n.label}</span>${n.r === 'reconcile' && rc && rc.needsReview ? `<span class="pill warn">${rc.needsReview}</span>` : ''}</a>`).join('')}
      <div class="spacer"></div>
      <a class="nav ${active('settings')}" href="#/settings">${ic.gear}<span>Data & settings</span></a>
      <div style="padding:10px 10px 0">${modePill()}</div>`;
  }
  function modePill() {
    if (Store.mode === 'cloud' && !Store.error) return `<span class="pill good"><span class="dot"></span>Google Sheet</span>`;
    if (Store.error) return `<span class="pill bad" title="${esc(Store.error)}"><span class="dot"></span>Sheet offline · local copy</span>`;
    return `<span class="pill"><span class="dot"></span>Saved on this device</span>`;
  }
  const topbar = (title, right = '') => `<div class="top"><div class="brand"><div class="brand-mark">${logo}</div><div><h1>${esc(title)}</h1><small>Motorcycle ledger</small></div></div><div style="display:flex;gap:8px;align-items:center">${right}<a class="iconbtn" href="#/settings" aria-label="Data and settings">${ic.gear}</a></div></div>`;

  // ── shared bits ──
  const STATUS_PILL = { CONFIRMED: ['good', 'Confirmed'], NEEDS_REVIEW: ['warn', 'Needs review'], DUPLICATE: ['info', 'Duplicate'], UNVERIFIED: ['', 'Unverified'], CANCELLED: ['bad', 'Cancelled'], REFUNDED: ['bad', 'Refunded'], 'PARTIALLY REFUNDED': ['warn', 'Part refunded'] };
  const pill = (ds) => { const [c, t] = STATUS_PILL[ds] || ['', ds]; return `<span class="pill ${c}">${t}</span>`; };
  function amountHTML(t) {
    const ds = Ledger.displayStatus(L, t);
    if (t.amount === null) return `<span class="unknown">Not provided</span>`;
    if (ds === 'DUPLICATE') return `<span class="strike">${fmt(t.amount)}</span><span class="netnote">not counted</span>`;
    if (ds === 'REFUNDED') return `<span class="strike">${fmt(t.amount)}</span><span class="netnote">Net ₹0</span>`;
    if (ds === 'PARTIALLY REFUNDED') return `${fmt(t.amount)}<span class="netnote">Net ${fmt(Ledger.netOf(L, t))}</span>`;
    if (!Ledger.counts(L, t)) return `<span class="strike">${fmt(t.amount)}</span><span class="netnote">excluded</span>`;
    return fmt(t.amount);
  }
  function rowHTML(t) {
    const ds = Ledger.displayStatus(L, t);
    const kids = L.children.get(t.id) || [];
    const notes = [t.notes === t.expenditure ? '' : t.notes, kids.length ? `${kids.length} line item${kids.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
    return `<a class="row card ${Ledger.counts(L, t) && ds !== 'REFUNDED' ? '' : 'excluded'}" href="#/e/${encodeURIComponent(t.id)}">
      <div class="name"><span class="t">${esc(t.expenditure)}</span>${ds !== 'CONFIRMED' ? pill(ds) : ''}</div>
      <div class="amt num">${amountHTML(t)}</div>
      <div class="meta"><span class="date">${t.date ? fmtDate(t.date) : '<span class="unknown">Date unknown</span>'}</span><span class="notes">${esc(notes) || '<span class="muted">—</span>'}</span></div>
    </a>`;
  }

  // ── charts (hand-built SVG, single-hue, hover tooltips) ──
  function drawBar(el, series, { height = 180 } = {}) {
    const W = el.clientWidth || 320, H = height, padL = 40, padB = 22, padT = 8;
    if (!series.length) { el.innerHTML = `<div class="empty">No dated expenses yet</div>`; return; }
    const max = Math.max(...series.map((d) => d.value), 1);
    const niceMax = niceCeil(max); const band = (W - padL) / series.length; const bw = Math.max(4, Math.min(26, band * 0.56));
    const y = (v) => padT + (H - padT - padB) * (1 - v / niceMax);
    const ticks = [0, niceMax / 2, niceMax];
    const every = Math.ceil(series.length / Math.max(1, Math.floor((W - padL) / 44)));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">`;
    ticks.forEach((t) => { s += `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(255,255,255,.06)"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end" font-size="10.5" fill="#6c727b">${compact(t)}</text>`; });
    series.forEach((d, i) => {
      const cx = padL + band * i + band / 2; const top = y(d.value); const h = H - padB - top; const r = Math.min(4, h);
      if (d.value > 0) s += `<path d="M${cx - bw / 2},${H - padB} V${top + r} q0,-${r} ${r},-${r} H${cx + bw / 2 - r} q${r},0 ${r},${r} V${H - padB} Z" fill="#d6a45c" opacity=".88"/>`;
      if (i % every === 0) s += `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="#6c727b">${fmtMonth(d.month, true)}</text>`;
      s += `<rect x="${padL + band * i}" y="${padT}" width="${band}" height="${H - padT - padB}" fill="transparent" data-i="${i}"/>`;
    });
    s += `</svg><div class="tip"></div>`;
    el.innerHTML = s;
    const tip = $('.tip', el);
    $$('rect[data-i]', el).forEach((r) => {
      const show = () => { const d = series[+r.dataset.i]; const cx = padL + band * +r.dataset.i + band / 2; tip.innerHTML = `<span class="muted">${fmtMonth(d.month)}</span><b class="num">${fmt(d.value)}</b>`; tip.style.left = Math.min(Math.max(cx, 60), W - 60) + 'px'; tip.style.top = y(d.value) + 'px'; tip.style.opacity = 1; r.previousElementSibling && 0; };
      r.addEventListener('pointerenter', show); r.addEventListener('pointerdown', show); r.addEventListener('pointerleave', () => (tip.style.opacity = 0));
    });
  }
  function drawLine(el, series, { height = 180 } = {}) {
    const W = el.clientWidth || 320, H = height, padL = 40, padB = 22, padT = 10, padR = 8;
    if (series.length < 2) { el.innerHTML = `<div class="empty">Needs at least two months of dated data</div>`; return; }
    const niceMax = niceCeil(Math.max(...series.map((d) => d.value)));
    const x = (i) => padL + (W - padL - padR) * (i / (series.length - 1)); const y = (v) => padT + (H - padT - padB) * (1 - v / niceMax);
    const pts = series.map((d, i) => [x(i), y(d.value)]);
    const every = Math.ceil(series.length / Math.max(1, Math.floor((W - padL) / 44)));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative ownership cost"><defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d6a45c" stop-opacity=".18"/><stop offset="1" stop-color="#d6a45c" stop-opacity="0"/></linearGradient></defs>`;
    [0, niceMax / 2, niceMax].forEach((t) => { s += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(255,255,255,.06)"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end" font-size="10.5" fill="#6c727b">${compact(t)}</text>`; });
    s += `<path d="M${pts.map((p) => p.join(',')).join(' L')} L${x(series.length - 1)},${H - padB} L${padL},${H - padB} Z" fill="url(#lg)"/>`;
    s += `<path d="M${pts.map((p) => p.join(',')).join(' L')}" fill="none" stroke="#d6a45c" stroke-width="2" stroke-linejoin="round"/>`;
    series.forEach((d, i) => { if (i % every === 0 || i === series.length - 1) s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="#6c727b">${fmtMonth(d.month, true)}</text>`; });
    s += `<line class="xh" y1="${padT}" y2="${H - padB}" stroke="rgba(255,255,255,.18)" opacity="0"/><circle class="dot" r="4.5" fill="#d6a45c" stroke="#13161a" stroke-width="2" opacity="0"/>`;
    s += `<rect x="${padL}" y="0" width="${W - padL}" height="${H}" fill="transparent" class="hit"/></svg><div class="tip"></div>`;
    el.innerHTML = s;
    const tip = $('.tip', el), xh = $('.xh', el), dot = $('.dot', el), hit = $('.hit', el), svg = $('svg', el);
    const move = (ev) => {
      const b = svg.getBoundingClientRect(); const px = (ev.clientX - b.left) * (W / b.width);
      const i = Math.max(0, Math.min(series.length - 1, Math.round(((px - padL) / (W - padL - padR)) * (series.length - 1))));
      const [cx, cy] = pts[i];
      xh.setAttribute('x1', cx); xh.setAttribute('x2', cx); xh.setAttribute('opacity', 1); dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('opacity', 1);
      tip.innerHTML = `<span class="muted">by end of ${fmtMonth(series[i].month)}</span><b class="num">${fmt(series[i].value)}</b>`; tip.style.left = Math.min(Math.max(cx, 70), W - 70) + 'px'; tip.style.top = cy + 'px'; tip.style.opacity = 1;
    };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { tip.style.opacity = 0; xh.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); });
  }
  function niceCeil(v) { if (v <= 0) return 100; const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  let chartJobs = [];
  const chart = (fn, series, opts) => { const id = 'c' + Math.random().toString(36).slice(2, 8); chartJobs.push(() => { const el = document.getElementById(id); if (el) fn(el, series, opts); }); return `<div class="chart" id="${id}"></div>`; };

  // ── views ──
  const GROUPS = [
    { key: 'Fuel', label: 'Fuel', cats: ['Fuel'] },
    { key: 'Maint', label: 'Maintenance', cats: ['Maintenance', 'Repairs'] },
    { key: 'Acc', label: 'Accessories', cats: ['Accessories'] },
    { key: 'Gear', label: 'Riding gear', cats: ['Riding Gear'] },
    { key: 'Mod', label: 'Modifications', cats: ['Modification'] },
    { key: 'Other', label: 'Other', cats: ['Insurance', 'Documentation', 'Other'] },
  ];
  function viewDashboard() {
    const T = Ledger.totals(L); const B = Ledger.baseline(L); const rc = Ledger.reconciliation(L);
    const avg = Ledger.averageMonthly(L); const mon = Ledger.monthly(L); const latest = Ledger.latest(L); const fuel = Ledger.fuelStats(L);
    const rupees = Math.floor(T.net / 100), paise = T.net % 100;
    const big = fmt(rupees * 100) + (paise ? `<span class="paise">.${String(paise).padStart(2, '0')}</span>` : '');
    const groupVal = (g) => g.cats.reduce((s, c) => s + (T.byCategory[c] || 0), 0);
    const tile = (label, v, sub, frac, href) => `<a class="stat card" ${href ? `href="${href}"` : ''}><div class="label">${label}</div><div class="v num">${v}</div><div class="s">${sub}</div>${frac !== null ? `<div class="bar"><i style="width:${Math.max(frac * 100, frac > 0 ? 2 : 0).toFixed(1)}%"></i></div>` : ''}</a>`;
    const countIn = (cats) => L.transactions.filter((t) => cats.includes(t.category) && Ledger.counts(L, t)).length;
    return `<div class="view">${topbar('Ledger')}
      <div class="dash-cols"><div>
        <section class="card hero">
          <div style="display:flex;justify-content:space-between;align-items:center"><span class="label">Total ownership cost</span>${modePill()}</div>
          <div class="big num">${big}</div>
          <div class="ledger-line num"><span>Gross <b>${fmt(T.gross)}</b></span><span>Refunds <b>−${fmt(T.refunds).slice(1)}</b></span><span>Duplicates excluded <b>${fmt(T.duplicates)}</b></span></div>
          ${B.gap ? `<a class="baseline" href="#/reconcile">${ic.info}<span>Your old app reports <b class="num" style="color:var(--text)">${fmt(B.reported)}</b>, but only ${fmt(B.imported)} of it is itemised here. The other <b class="num" style="color:var(--warn)">${fmt(B.gap)}</b> isn't itemised and isn't included in the total above.</span></a>` : ''}
        </section>
        <div class="grid g2 g3 section" style="margin-top:10px">
          ${GROUPS.map((g) => tile(g.label, fmt(groupVal(g)), `${countIn(g.cats)} ${countIn(g.cats) === 1 ? 'entry' : 'entries'}`, T.net ? groupVal(g) / T.net : 0, `#/expenses?category=${encodeURIComponent(g.cats.join('|'))}`)).join('')}
        </div>
        <div class="grid g2 g4" style="margin-top:10px">
          ${tile('Refunds', fmt(T.refunds), `${rc.refunded + rc.partiallyRefunded} transaction${rc.refunded + rc.partiallyRefunded === 1 ? '' : 's'}`, null, '#/expenses?refunded=yes')}
          ${tile('Expenses', String(T.count), `${rc.duplicates} duplicates kept aside`, null, '#/expenses')}
          ${tile('Avg / month', avg === null ? '—' : fmt(avg), mon.undated ? `excl. ${compact(mon.undated)} undated` : `${mon.series.length} months`, null, '#/analytics')}
          ${tile('Latest', latest ? fmt(latest.amount) : '—', latest ? `${esc(latest.expenditure)} · ${fmtDate(latest.date)}` : 'none dated', null, latest ? `#/e/${encodeURIComponent(latest.id)}` : '')}
        </div>
      </div><div>
        <section class="section" style="margin-top:0">
          <div class="section-h" style="margin-top:14px"><h2>Monthly spend</h2><a href="#/analytics">Insights ›</a></div>
          <div class="card pad">${chart(drawBar, mon.series, { height: 170 })}</div>
        </section>
        <section class="section">
          <div class="section-h"><h2>Fuel</h2><a href="#/expenses?category=Fuel">All fills ›</a></div>
          <div class="card pad grid g2" style="gap:14px">
            <div><div class="label">Avg price</div><div class="num" style="font-size:18px;font-weight:600;margin-top:4px">${fuel.avgPricePerLitre ? fmt(fuel.avgPricePerLitre) + '<span class="muted" style="font-size:13px"> /L</span>' : '—'}</div></div>
            <div><div class="label">Avg fill</div><div class="num" style="font-size:18px;font-weight:600;margin-top:4px">${fuel.avgLitresPerFill ?? '—'}<span class="muted" style="font-size:13px"> L</span></div></div>
            <div><div class="label">Total fuel</div><div class="num" style="font-size:18px;font-weight:600;margin-top:4px">${fuel.litres ?? '—'}<span class="muted" style="font-size:13px"> L · ${fuel.fills} fills</span></div></div>
            <div><div class="label">Cost / km</div><div style="font-size:12.5px;margin-top:6px" class="muted">${fuel.km ? fmt(Math.round(T.net / fuel.km)) : 'Add odometer readings to unlock'}</div></div>
          </div>
        </section>
        <section class="section">
          <div class="section-h"><h2>Reconciliation</h2><a href="#/reconcile">Open ›</a></div>
          <a class="card pad" href="#/reconcile" style="display:flex;flex-wrap:wrap;gap:8px">
            <span class="pill good">${rc.confirmed} confirmed</span><span class="pill warn">${rc.needsReview} needs review</span><span class="pill info">${rc.duplicates} duplicates</span><span class="pill bad">${rc.refunded} refunded</span>${rc.unreconciledExternal ? `<span class="pill">${rc.unreconciledExternal} unverified sources</span>` : ''}${rc.undated ? `<span class="pill">${rc.undated} undated</span>` : ''}
          </a>
        </section>
      </div></div></div>`;
  }

  function viewExpenses(params) {
    if (Object.keys(params).length) state.q = Object.assign({ sort: 'newest' }, params);
    const q = state.q; const rows = Ledger.query(L, q);
    const T = Ledger.totals(L, (t) => rows.includes(t));
    const nf = ['category', 'source', 'status', 'refunded', 'installed', 'from', 'to', 'min', 'max'].filter((k) => q[k]).length;
    return `<div class="view">${topbar('Expenses')}
      <div class="toolbar">
        <label class="search">${ic.search}<input id="q" type="search" placeholder="Search expenses, orders, notes" value="${esc(q.search || '')}" autocomplete="off"/></label>
        <button class="btn" id="filters" aria-label="Filters">${ic.filter}<span>Filter</span>${nf ? `<span class="count">${nf}</span>` : ''}</button>
      </div>
      <div class="summary-line num"><span>${rows.length} record${rows.length === 1 ? '' : 's'}${nf || q.search ? ' · filtered' : ''}</span><span>Net <b style="color:var(--text)">${fmt(T.net)}</b></span></div>
      <div class="thead label"><span>Expenditure</span><span>Amount</span><span>Date</span><span>Notes</span></div>
      <div class="rows table" id="rows">${rows.map(rowHTML).join('') || `<div class="empty">Nothing matches.</div>`}</div>
    </div>`;
  }
  function bindExpenses() {
    const q = $('#q'); let tm;
    q && q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { state.q.search = q.value; const rows = Ledger.query(L, state.q); $('#rows').innerHTML = rows.map(rowHTML).join('') || `<div class="empty">Nothing matches.</div>`; const T = Ledger.totals(L, (t) => rows.includes(t)); $('.summary-line').innerHTML = `<span>${rows.length} records${q.value ? ' · filtered' : ''}</span><span>Net <b style="color:var(--text)">${fmt(T.net)}</b></span>`; }, 120); });
    $('#filters')?.addEventListener('click', openFilters);
  }
  function openFilters() {
    const q = state.q; const opt = (arr, v) => `<option value="">Any</option>` + arr.map((a) => `<option ${a === v ? 'selected' : ''}>${esc(a)}</option>`).join('');
    const catVal = q.category && q.category.includes('|') ? q.category : q.category;
    sheet(`<h3>Filter & sort</h3><form class="form" id="ff">
      <div class="field"><span>Sort</span><div class="seg" style="width:100%">${[['newest', 'Newest'], ['oldest', 'Oldest'], ['highest', 'Highest'], ['lowest', 'Lowest']].map(([v, l]) => `<button type="button" data-sort="${v}" class="${(q.sort || 'newest') === v ? 'on' : ''}" style="flex:1">${l}</button>`).join('')}</div></div>
      <div class="two"><label class="field"><span>Category</span><select class="input" name="category"><option value="">Any</option>${Ledger.CATEGORIES.map((c) => `<option ${c === catVal ? 'selected' : ''}>${c}</option>`).join('')}${catVal && catVal.includes('|') ? `<option selected value="${esc(catVal)}">${esc(catVal.replace(/\|/g, ' + '))}</option>` : ''}</select></label>
      <label class="field"><span>Source</span><select class="input" name="source">${opt(Ledger.SOURCES, q.source)}</select></label></div>
      <div class="two"><label class="field"><span>Status</span><select class="input" name="status">${opt(['CONFIRMED', 'NEEDS_REVIEW', 'DUPLICATE', 'UNVERIFIED', 'CANCELLED', 'REFUNDED', 'PARTIALLY REFUNDED'], q.status)}</select></label>
      <label class="field"><span>Installed</span><select class="input" name="installed"><option value="">Any</option>${['yes', 'no', 'unknown'].map((v) => `<option value="${v}" ${q.installed === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></label></div>
      <label class="check"><input type="checkbox" name="refunded" value="yes" ${q.refunded === 'yes' ? 'checked' : ''}/> Only refunded</label>
      <div class="two"><label class="field"><span>From</span><input class="input" type="date" name="from" value="${esc(q.from || '')}"/></label><label class="field"><span>To</span><input class="input" type="date" name="to" value="${esc(q.to || '')}"/></label></div>
      <div class="two"><label class="field"><span>Min ₹</span><input class="input" inputmode="decimal" name="min" value="${esc(q.min || '')}"/></label><label class="field"><span>Max ₹</span><input class="input" inputmode="decimal" name="max" value="${esc(q.max || '')}"/></label></div>
      <p class="muted" style="font-size:12px;margin:0">Date filters leave out records with no date.</p>
      <div class="two"><button type="button" class="btn" id="fclear">Clear</button><button class="btn primary">Apply</button></div>
    </form>`, (root) => {
      let sort = q.sort || 'newest';
      $$('[data-sort]', root).forEach((b) => b.onclick = () => { sort = b.dataset.sort; $$('[data-sort]', root).forEach((x) => x.classList.toggle('on', x === b)); });
      $('#fclear', root).onclick = () => { state.q = { sort: 'newest', search: state.q.search }; closeSheet(); render(); };
      $('#ff', root).onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); state.q = { sort, search: state.q.search }; for (const [k, v] of fd) if (v) state.q[k] = v; closeSheet(); location.hash = '#/expenses'; render(); };
    });
  }

  function kvRow(k, v) { return `<div><dt>${k}</dt><dd>${v}</dd></div>`; }
  const unknown = (s = 'Not provided') => `<span class="unknown">${s}</span>`;
  function relatedList(t) {
    return (t.related || '').split(';').filter(Boolean).map((p) => { const [rel, id] = p.split(':'); return { rel, id }; });
  }
  const REL_LABEL = { replacement_of: 'Replacement for', see: 'Related purchase', separate_from: 'Confirmed separate from', was_duplicate_of: 'Previously marked duplicate of' };
  function linkRow(t, sub) { return t ? `<a class="linkrow" href="#/e/${encodeURIComponent(t.id)}"><div class="l"><div>${esc(t.expenditure)}</div><div class="sub">${sub || [t.source, t.date ? fmtDate(t.date) : 'date unknown'].join(' · ')}</div></div><div class="num" style="display:flex;align-items:center;gap:6px">${fmt(t.amount)}<span class="muted">${ic.chev}</span></div></a>` : ''; }

  function viewDetail(id) {
    const t = L.byId.get(id);
    if (!t) return `<div class="view"><button class="back" onclick="history.back()">${ic.back} Back</button><div class="empty">Record not found.</div></div>`;
    const ds = Ledger.displayStatus(L, t); const kids = L.children.get(t.id) || []; const parent = t.parent_id ? L.byId.get(t.parent_id) : null;
    const dupOf = t.duplicate_of ? L.byId.get(t.duplicate_of) : null; const dupsOfThis = L.transactions.filter((x) => x.duplicate_of === t.id);
    const refunds = L.refundsBy.get(t.id) || []; const rsum = Ledger.refundTotal(L, t); const counts = Ledger.counts(L, t);
    const why = t.kind === 'line_item' ? 'No — line item; its parent order carries the money' : Ledger.isDuplicate(t) ? 'No — duplicate of another record' : !counts ? `No — ${t.status === 'UNVERIFIED' ? 'unverified records are excluded (Settings)' : 'excluded by settings'}` : rsum ? `Yes — net ${fmt(Ledger.netOf(L, t))} after refunds` : 'Yes';
    const inst = t.installed === true ? 'Installed' : t.installed === false ? 'Not installed' : unknown('Unknown');
    const kidsSum = kids.reduce((s, k) => s + (k.amount || 0), 0);
    const issues = Ledger.issues(L).filter((i) => i.id === t.id);
    return `<div class="view"><button class="back" id="back">${ic.back} Back</button>
      <section class="card detail-h">
        <div style="display:flex;gap:8px;flex-wrap:wrap">${pill(ds)}${t.kind === 'line_item' ? '<span class="pill">Line item</span>' : ''}${t.verified ? '<span class="pill good">Verified</span>' : ''}</div>
        <h2>${esc(t.expenditure)}</h2>
        <div class="muted" style="font-size:13.5px">${esc([t.source, t.order_reference ? '#' + t.order_reference : ''].filter(Boolean).join(' · '))}</div>
        <div class="amount num">${amountHTML(t)}</div>
      </section>
      ${issues.map((i) => `<div class="callout ${i.level === 'error' ? 'bad' : 'warn'}" style="margin-top:10px">${ic.warn}<span>${esc(i.msg)}</span></div>`).join('')}
      ${dupOf ? `<div class="callout info" style="margin-top:10px">${ic.info}<span>This record is a duplicate of the one below. It's kept for the audit trail and <b>isn't counted</b> in totals.</span></div>` : ''}
      <div class="actions">
        <a class="btn sm" href="#/edit/${encodeURIComponent(t.id)}">Edit</a>
        ${t.kind === 'transaction' && !Ledger.isDuplicate(t) ? `<button class="btn sm" data-act="dup">Mark as duplicate</button>` : ''}
        ${Ledger.isDuplicate(t) ? `<button class="btn sm" data-act="undup">Not a duplicate</button>` : ''}
        ${t.kind === 'transaction' && !Ledger.isDuplicate(t) && rsum < (t.amount || 0) ? `<button class="btn sm" data-act="refund">Add refund</button>` : ''}
        ${['NEEDS_REVIEW', 'UNVERIFIED'].includes(t.status) ? `<button class="btn sm" data-act="confirm">Mark confirmed</button>` : ''}
        ${t.status === 'CONFIRMED' && !Ledger.isDuplicate(t) ? `<button class="btn sm ghost" data-act="review">Flag for review</button>` : ''}
        ${!t.verified ? `<button class="btn sm ghost" data-act="verify">Mark source verified</button>` : ''}
      </div>
      <div class="section-h section"><h2>Details</h2></div>
      <dl class="card kv" style="margin:0">
        ${kvRow('Amount', `<span class="num">${t.amount === null ? unknown() : fmt(t.amount)}</span>`)}
        ${kvRow('Date', t.date ? fmtDate(t.date) : unknown('Unknown — not provided'))}
        ${kvRow('Notes', t.notes ? esc(t.notes) : unknown('—'))}
        ${kvRow('Category', esc(Ledger.categoryOf(L, t)) + (t.subcategory ? ` <span class="muted">· ${esc(t.subcategory)}</span>` : ''))}
        ${kvRow('Counts in total', why)}
        ${kvRow('Refund status', rsum ? `${Ledger.refundStatus(L, t) === 'FULL' ? 'Fully refunded' : 'Partially refunded'} · <span class="num">${fmt(rsum)}</span>` : 'None')}
        ${kvRow('Installed', inst)}
        ${t.odometer_km != null ? kvRow('Odometer', `<span class="num">${t.odometer_km.toLocaleString('en-IN')} km</span>`) : ''}
        ${t.attachment_url ? kvRow('Attachment', `<a href="${esc(t.attachment_url)}" target="_blank" rel="noopener" style="color:var(--accent)">Open bill ↗</a>`) : kvRow('Attachment', unknown('None'))}
      </dl>
      <div class="section-h section"><h2>Where this came from</h2></div>
      <dl class="card kv" style="margin:0">
        ${kvRow('Source', esc(t.source))}
        ${kvRow('Source reference', t.source_reference ? esc(t.source_reference) : unknown('—'))}
        ${kvRow('Order', t.order_reference ? '#' + esc(t.order_reference) : unknown('—'))}
        ${kvRow('Recorded status', esc(t.status.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())))}
        ${kvRow('Source verified', t.verified ? 'Yes' : 'No')}
        ${kvRow('Record id', `<span class="num muted" style="font-family:var(--mono);font-size:12.5px">${esc(t.id)}</span>`)}
        ${kvRow('Added', t.created_at ? esc(new Date(t.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })) : unknown('—'))}
      </dl>
      ${parent ? `<div class="section-h section"><h2>Parent transaction</h2></div><div class="card">${linkRow(parent, `${esc(parent.source)} · order total ${fmt(parent.amount)}`)}</div>` : ''}
      ${kids.length ? `<div class="section-h section"><h2>Line items</h2><span class="muted num" style="font-size:12.5px">${fmt(kidsSum)} ${kidsSum === t.amount ? '= order total ✓' : '≠ order total'}</span></div><div class="card">${kids.map((k) => linkRow(k, esc(k.notes || 'Supporting detail — not counted separately'))).join('')}</div>` : ''}
      ${dupOf ? `<div class="section-h section"><h2>Duplicate of</h2></div><div class="card">${linkRow(dupOf)}</div>` : ''}
      ${dupsOfThis.length ? `<div class="section-h section"><h2>Other records of this same expense</h2></div><div class="card">${dupsOfThis.map((d) => linkRow(d, `${esc(d.source)} · duplicate, not counted`)).join('')}</div>` : ''}
      ${relatedList(t).length ? `<div class="section-h section"><h2>Linked records</h2></div><div class="card">${relatedList(t).map((r) => linkRow(L.byId.get(r.id), REL_LABEL[r.rel] || r.rel)).join('')}</div>` : ''}
      ${refunds.length ? `<div class="section-h section"><h2>Refunds</h2></div><div class="card">${refunds.map((r) => `<div class="linkrow" style="cursor:default"><div class="l"><div>${esc(r.notes || 'Refund')}</div><div class="sub">${r.date ? fmtDate(r.date) : 'date unknown'}</div></div><div class="num" style="color:var(--good)">−${fmt(r.amount).slice(1)}</div></div>`).join('')}</div>` : ''}
    </div>`;
  }
  function bindDetail(id) {
    $('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/expenses'));
    const t = L.byId.get(id); if (!t) return;
    const raw = () => Object.assign({}, Store.raw.transactions.find((x) => String(x.id) === id));
    const save = async (patch, msg) => { try { await Store.updateTx(Object.assign(raw(), patch, { id })); rebuild(); toast(msg); render(); } catch (e) { toast('Save failed: ' + e.message); } };
    $$('[data-act]').forEach((b) => b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'confirm') save({ status: 'CONFIRMED' }, 'Marked confirmed');
      if (a === 'review') save({ status: 'NEEDS_REVIEW' }, 'Flagged for review');
      if (a === 'verify') save({ verified: true }, 'Source marked verified');
      if (a === 'undup') save({ status: 'CONFIRMED', duplicate_of: '', related: [t.related, t.duplicate_of ? 'was_duplicate_of:' + t.duplicate_of : ''].filter(Boolean).join(';') }, 'Restored — now counted');
      if (a === 'dup') {
        const cands = Ledger.findDuplicates(L, t, { threshold: 25, limit: 8 }).filter((m) => m.id !== t.id && !L.children.get(t.id)?.some((k) => k.id === m.id));
        sheet(`<h3>Which record is this a duplicate of?</h3><p class="muted" style="margin:-6px 0 12px;font-size:13px">The chosen record stays counted. This one is kept for history but excluded from totals.</p>
          <div class="card">${cands.map((m) => { const x = L.byId.get(m.id); return `<button class="linkrow" style="width:100%;background:none;border:0;text-align:left" data-pick="${esc(x.id)}"><div class="l"><div>${esc(x.expenditure)}</div><div class="sub">${esc(x.source)} · ${x.date ? fmtDate(x.date) : 'date unknown'} · ${esc(m.reasons.join(', ') || 'weak match')}</div></div><div class="num">${fmt(x.amount)}</div></button>`; }).join('') || '<div class="empty">No likely matches found.</div>'}</div>
          <button class="btn block ghost" style="margin-top:12px" id="cx">Cancel</button>`, (root) => {
          $('#cx', root).onclick = closeSheet;
          $$('[data-pick]', root).forEach((p) => p.onclick = () => { closeSheet(); save({ status: 'DUPLICATE', duplicate_of: p.dataset.pick }, 'Linked as duplicate — excluded from total'); });
        });
      }
      if (a === 'refund') {
        const remaining = (t.amount || 0) - Ledger.refundTotal(L, t);
        sheet(`<h3>Add refund</h3><form class="form" id="rf">
          <label class="field"><span>Refund amount <em>· up to ${fmt(remaining)}</em></span><input class="input amount num" name="amount" inputmode="decimal" required value="${Ledger.fromPaise(remaining)}"/></label>
          <label class="field"><span>Date <em>· optional</em></span><input class="input" type="date" name="date"/></label>
          <label class="field"><span>Notes <em>· optional</em></span><input class="input" name="notes" placeholder="e.g. Order cancelled"/></label>
          <div class="two"><button type="button" class="btn" id="cx">Cancel</button><button class="btn primary">Save refund</button></div></form>`, (root) => {
          $('#cx', root).onclick = closeSheet;
          $('#rf', root).onsubmit = async (e) => {
            e.preventDefault(); const fd = new FormData(e.target); const amt = Ledger.toPaise(fd.get('amount'));
            if (!amt || amt <= 0 || amt > remaining) { toast(`Refund must be between ₹0.01 and ${fmt(remaining)}`); return; }
            try { await Store.addRefund({ id: newId('rf'), transaction_id: id, amount: Ledger.fromPaise(amt), date: fd.get('date') || '', notes: fd.get('notes') || '' }); rebuild(); closeSheet(); toast('Refund recorded — net updated'); render(); } catch (err) { toast('Save failed: ' + err.message); }
          };
        });
      }
    });
  }

  // ── add / edit ──
  function blankDraft() { return { expenditure: '', amount: '', date: todayISO(), notes: '', category: 'Fuel', subcategory: '', source: 'Manual', source_reference: '', order_reference: '', status: 'CONFIRMED', installed: '', odometer_km: '', parent_id: '', attachment_url: '', litres: '', fullTank: true }; }
  function viewAdd(editId) {
    const editing = editId ? L.byId.get(editId) : null;
    if (!state.draft || state.draft._for !== (editId || 'new')) {
      state.draft = editing ? Object.assign(blankDraft(), Store.raw.transactions.find((x) => String(x.id) === editId), { amount: editing.amount === null ? '' : String(Ledger.fromPaise(editing.amount)), date: editing.date || '', installed: editing.installed === null ? '' : String(editing.installed), odometer_km: editing.odometer_km ?? '', litres: '' }) : blankDraft();
      state.draft._for = editId || 'new';
    }
    const d = state.draft; const fuel = d.category === 'Fuel' && !editing;
    const orders = L.transactions.filter((t) => t.kind === 'transaction' && !Ledger.isDuplicate(t) && (t.order_reference || (L.children.get(t.id) || []).length));
    return `<div class="view form-wrap"><button class="back" id="back">${ic.back} ${editing ? 'Back' : 'Cancel'}</button>
      <h2 style="margin:0 0 16px;font-size:22px;letter-spacing:-.02em;font-weight:600">${editing ? 'Edit record' : 'Add expense'}</h2>
      ${editing ? `<div class="callout info" style="margin-bottom:14px">${ic.info}<span>You're editing the record itself. Its source and history links are kept.</span></div>` : ''}
      <form class="form" id="af" novalidate>
        <div class="field"><span>Category</span><div class="chips">${Ledger.CATEGORIES.map((c) => `<button type="button" class="chip ${d.category === c ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('')}</div></div>
        <label class="field"><span>Amount</span><input class="input amount num" name="amount" inputmode="decimal" placeholder="₹0" value="${esc(d.amount)}" autocomplete="off" ${editing ? '' : 'autofocus'}/></label>
        ${fuel ? `<div class="two"><label class="field"><span>Litres <em>· optional</em></span><input class="input num" name="litres" inputmode="decimal" placeholder="9.10" value="${esc(d.litres)}"/></label>
          <div class="field"><span>Fill</span><div class="seg" style="height:46px;align-items:center"><button type="button" data-full="1" class="${d.fullTank ? 'on' : ''}" style="flex:1">Full tank</button><button type="button" data-full="0" class="${!d.fullTank ? 'on' : ''}" style="flex:1">Partial</button></div></div></div>` : ''}
        ${fuel ? '' : `<label class="field"><span>Expenditure</span><input class="input" name="expenditure" placeholder="e.g. Chain lube, Tank bag" value="${esc(d.expenditure)}"/></label>`}
        <div class="field"><span>Date <em>· leave blank if unknown</em></span><div style="display:flex;gap:8px"><input class="input" type="date" name="date" value="${esc(d.date)}" style="flex:1"/><button type="button" class="btn" id="today">Today</button><button type="button" class="btn ghost" id="nodate">Unknown</button></div></div>
        ${fuel ? '' : `<label class="field"><span>Notes <em>· optional</em></span><input class="input" name="notes" value="${esc(d.notes)}" placeholder="Anything worth remembering"/></label>`}
        <details class="more" ${editing || d.source !== 'Manual' || d.order_reference ? 'open' : ''}><summary><span>Source, order & status</span><span class="muted">${esc(d.source)}</span></summary><div class="inner">
          <div class="two"><label class="field"><span>Source</span><select class="input" name="source">${Ledger.SOURCES.map((s) => `<option ${s === d.source ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label class="field"><span>Order number</span><input class="input" name="order_reference" value="${esc(d.order_reference)}" placeholder="#5597"/></label></div>
          <label class="field"><span>Source reference <em>· SKU, invoice no., app entry</em></span><input class="input" name="source_reference" value="${esc(d.source_reference)}"/></label>
          <div class="two"><label class="field"><span>Status</span><select class="input" name="status">${['CONFIRMED', 'NEEDS_REVIEW', 'UNVERIFIED', 'CANCELLED'].concat(editing && editing.status === 'DUPLICATE' ? ['DUPLICATE'] : []).map((s) => `<option value="${s}" ${s === d.status ? 'selected' : ''}>${STATUS_PILL[s][1]}</option>`).join('')}</select></label>
          <label class="field"><span>Installed</span><select class="input" name="installed"><option value="" ${d.installed === '' ? 'selected' : ''}>Unknown</option><option value="true" ${d.installed === 'true' ? 'selected' : ''}>Yes</option><option value="false" ${d.installed === 'false' ? 'selected' : ''}>No</option></select></label></div>
          <div class="two"><label class="field"><span>Subcategory</span><input class="input" name="subcategory" value="${esc(d.subcategory)}"/></label>
          <label class="field"><span>Odometer km <em>· optional</em></span><input class="input num" name="odometer_km" inputmode="numeric" value="${esc(d.odometer_km)}"/></label></div>
          ${!editing || editing.kind === 'line_item' ? `<label class="field"><span>Part of an order? <em>· makes this a line item, not counted separately</em></span><select class="input" name="parent_id"><option value="">No — standalone expense</option>${orders.map((o) => `<option value="${esc(o.id)}" ${o.id === d.parent_id ? 'selected' : ''}>${esc(o.expenditure)} · ${fmt(o.amount)}</option>`).join('')}</select></label>` : ''}
          <div class="field"><span>Attachment <em>· bill or screenshot</em></span>
            <input class="input" name="attachment_url" value="${esc(d.attachment_url)}" placeholder="Link to bill (Drive, etc.)"/>
            ${Store.mode === 'cloud' && !Store.error ? `<label class="btn sm" style="width:max-content">Upload file<input type="file" id="file" accept="image/*,application/pdf" hidden/></label>` : `<span class="muted" style="font-size:12px">File upload works once the Google Sheet is connected.</span>`}</div>
        </div></details>
        <div id="dupzone"></div>
        <button class="btn primary block" style="height:52px;font-size:15.5px" id="save">${editing ? 'Save changes' : 'Save expense'}</button>
      </form></div>`;
  }
  function readDraft(form) {
    const d = state.draft; const fd = new FormData(form);
    for (const [k, v] of fd) if (k in d) d[k] = typeof v === 'string' ? v.trim() : v;
    return d;
  }
  function draftToTx(d, editing) {
    const isFuel = d.category === 'Fuel' && !editing;
    const litres = parseFloat(d.litres);
    const notes = isFuel ? [Number.isFinite(litres) ? `${litres.toFixed(2)} L` : '', d.fullTank ? 'Full tank' : 'Partial fill'].filter(Boolean).join(' — ') : d.notes;
    return {
      id: editing ? editing.id : newId('tx'), kind: d.parent_id ? 'line_item' : 'transaction', parent_id: d.parent_id || '',
      expenditure: isFuel ? 'Fuel' : d.expenditure, amount: Ledger.fromPaise(Ledger.toPaise(d.amount)), date: d.date || '', notes,
      category: d.category, subcategory: d.subcategory, source: d.source, source_reference: d.source_reference,
      order_reference: String(d.order_reference || '').replace(/^#/, ''), status: d.status, verified: editing ? editing.verified : false,
      installed: d.installed === '' ? '' : d.installed === 'true', duplicate_of: editing ? (editing.duplicate_of || '') : '', related: editing ? editing.related : '',
      odometer_km: d.odometer_km, attachment_url: d.attachment_url,
    };
  }
  function bindAdd(editId) {
    const editing = editId ? L.byId.get(editId) : null; const form = $('#af');
    $('#back').onclick = () => { state.draft = null; history.length > 1 ? history.back() : (location.hash = '#/'); };
    form.addEventListener('input', () => { readDraft(form); $('#dupzone').innerHTML = ''; });
    $$('[data-cat]').forEach((b) => b.onclick = () => { readDraft(form); state.draft.category = b.dataset.cat; render(); });
    $$('[data-full]').forEach((b) => b.onclick = () => { state.draft.fullTank = b.dataset.full === '1'; $$('[data-full]').forEach((x) => x.classList.toggle('on', x === b)); });
    $('#today').onclick = () => { form.date.value = todayISO(); readDraft(form); };
    $('#nodate').onclick = () => { form.date.value = ''; readDraft(form); toast('Date left unknown — it won\'t be guessed'); };
    $('#file')?.addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; toast('Uploading…'); try { form.attachment_url.value = await Store.upload(f); readDraft(form); toast('Attached'); } catch (err) { toast('Upload failed: ' + err.message); } });
    const commit = async (tx, msg) => {
      try { if (editing) await Store.updateTx(tx); else await Store.addTx(tx); state.draft = null; rebuild(); toast(msg); location.hash = '#/e/' + encodeURIComponent(tx.id); }
      catch (e) { toast('Save failed: ' + e.message); }
    };
    form.onsubmit = async (e) => {
      e.preventDefault(); const d = readDraft(form); const tx = draftToTx(d, editing);
      if (Ledger.toPaise(d.amount) === null || Ledger.toPaise(d.amount) <= 0) { toast('Enter an amount'); form.amount.focus(); return; }
      if (!tx.expenditure) { toast('Enter what this was for'); form.expenditure?.focus(); return; }
      if (editing) return commit(tx, 'Saved');
      // Duplicate check — nothing is saved until you choose.
      const matches = Ledger.findDuplicates(L, tx).filter((m) => m.id !== tx.parent_id);
      if (!matches.length) return commit(tx, tx.kind === 'line_item' ? 'Line item added — order total unchanged' : 'Expense added');
      const m = matches[0]; const x = L.byId.get(m.id); const par = x.parent_id ? L.byId.get(x.parent_id) : null;
      $('#dupzone').innerHTML = `<div class="dup" role="alert"><h3>POSSIBLE DUPLICATE</h3>
        <div style="font-size:13.5px" class="t2">${par ? `This looks like a line item already inside <b>${esc(par.expenditure)}</b> — the order total already counts it.` : 'This looks like an expense that is already in the ledger.'} <span class="muted">(${esc(m.reasons.join(', '))})</span></div>
        <div class="match"><div style="display:flex;justify-content:space-between;gap:10px"><b>${esc(x.expenditure)}</b><b class="num">${fmt(x.amount)}</b></div><div class="muted">${esc(x.source)} · ${x.date ? fmtDate(x.date) : 'date unknown'}${x.notes ? ' · ' + esc(x.notes) : ''}</div></div>
        ${matches.length > 1 ? `<div class="muted" style="font-size:12px">${matches.length - 1} other weaker match${matches.length > 2 ? 'es' : ''} also found.</div>` : ''}
        <div class="choices">
          <button type="button" class="btn primary" data-dup="same">This is the same expense</button>
          <button type="button" class="btn" data-dup="separate">This is a separate expense</button>
          <button type="button" class="btn ghost" data-dup="ignore">Ignore warning</button>
        </div></div>`;
      $('#dupzone').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $$('[data-dup]').forEach((b) => b.onclick = () => {
        const c = b.dataset.dup;
        if (c === 'same') commit(Object.assign(tx, { status: 'DUPLICATE', duplicate_of: m.id }), 'Saved as duplicate — total unchanged');
        if (c === 'separate') commit(Object.assign(tx, { related: `separate_from:${m.id}` }), 'Saved as a separate expense');
        if (c === 'ignore') commit(tx, 'Expense added');
      });
    };
  }

  // ── reconciliation ──
  function viewReconcile() {
    const rc = Ledger.reconciliation(L); const B = Ledger.baseline(L); const T = Ledger.totals(L);
    const tx = L.transactions.filter((t) => t.kind === 'transaction');
    const lists = {
      needsReview: { label: 'Needs review', n: rc.needsReview, rows: tx.filter((t) => t.status === 'NEEDS_REVIEW'), empty: 'Nothing waiting for review.' },
      duplicates: { label: 'Duplicates', n: rc.duplicates, rows: tx.filter(Ledger.isDuplicate), empty: 'No duplicates recorded.' },
      refunded: { label: 'Refunded', n: rc.refunded + rc.partiallyRefunded, rows: tx.filter((t) => Ledger.refundStatus(L, t) !== 'NONE'), empty: 'No refunds.' },
      external: { label: 'Unverified sources', n: rc.unreconciledExternal, rows: tx.filter((t) => !Ledger.isDuplicate(t) && t.source !== 'Existing Expense App' && !t.verified), empty: 'Every external record is verified.' },
      unverified: { label: 'Unverified', n: rc.unverified, rows: tx.filter((t) => t.status === 'UNVERIFIED'), empty: 'No unverified records.' },
      undated: { label: 'Undated', n: rc.undated, rows: tx.filter((t) => !Ledger.isDuplicate(t) && !t.date), empty: 'Every record has a date.' },
      confirmed: { label: 'Confirmed', n: rc.confirmed, rows: tx.filter((t) => !Ledger.isDuplicate(t) && t.status === 'CONFIRMED' && Ledger.refundStatus(L, t) === 'NONE'), empty: '' },
    };
    const cur = lists[state.reconFilter] || lists.needsReview;
    const order = ['confirmed', 'needsReview', 'duplicates', 'refunded', 'external', 'unverified', 'undated'];
    return `<div class="view">${topbar('Reconcile')}
      <section class="card pad">
        <div class="label">Ledger</div>
        <dl class="kv" style="margin:8px -16px -16px">
          ${kvRow('Gross', `<span class="num">${fmt(T.gross)}</span>`)}
          ${kvRow('Refunds', `<span class="num">−${fmt(T.refunds).slice(1)}</span>`)}
          ${kvRow('Net total', `<b class="num">${fmt(T.net)}</b>`)}
          ${kvRow('Duplicates kept aside', `<span class="num muted">${fmt(T.duplicates)}</span> <span class="muted">· not counted</span>`)}
          ${T.excluded ? kvRow('Excluded by settings', `<span class="num muted">${fmt(T.excluded)}</span>`) : ''}
        </dl>
      </section>
      <section class="card pad section" style="margin-top:10px">
        <div class="label">Existing app baseline</div>
        <dl class="kv" style="margin:8px -16px 0">
          ${kvRow('Reported by app', `<span class="num">${fmt(B.reported)}</span>`)}
          ${kvRow('Itemised here', `<span class="num">${fmt(B.imported)}</span>`)}
          ${kvRow('Not yet itemised', `<b class="num" style="color:${B.gap ? 'var(--warn)' : 'var(--good)'}">${fmt(B.gap)}</b>`)}
        </dl>
        <p class="muted" style="font-size:12.5px;margin:12px 0 0">The gap is left as a gap on purpose. Import the older entries from your existing app and it will close by itself. The later items you added by hand (₹7,530) might overlap this gap, but that's not assumed.</p>
      </section>
      <div class="recon-grid section">${order.map((k) => `<button class="stat card ${state.reconFilter === k ? 'active' : ''}" data-rf="${k}" style="text-align:left;cursor:pointer"><div class="label">${lists[k].label}</div><div class="v num">${lists[k].n}</div></button>`).join('')}</div>
      ${rc.issues.length ? `<div class="section-h section"><h2>Integrity checks</h2></div><div class="grid">${rc.issues.map((i) => `<a class="callout ${i.level === 'error' ? 'bad' : 'warn'}" href="#/e/${encodeURIComponent(i.id)}">${ic.warn}<span><b>${esc(L.byId.get(i.id)?.expenditure || i.id)}</b> — ${esc(i.msg)}</span></a>`).join('')}</div>` : `<div class="callout section" style="margin-top:14px">${ic.check}<span>All integrity checks pass. Line items match their orders, and every refund and duplicate link is valid.</span></div>`}
      <div class="section-h section"><h2>${cur.label}</h2><span class="muted" style="font-size:12.5px">${cur.rows.length}</span></div>
      <div class="rows table">${cur.rows.map((t) => { let h = rowHTML(t); if (Ledger.isDuplicate(t) && t.duplicate_of) { const o = L.byId.get(t.duplicate_of); h = h.replace('</a>', `<div class="meta" style="grid-column:1/-1"><span class="muted">↳ duplicate of ${esc(o?.expenditure || t.duplicate_of)} (${esc(o?.source || '')})</span></div></a>`); } return h; }).join('') || `<div class="empty">${cur.empty}</div>`}</div>
    </div>`;
  }
  function bindReconcile() { $$('[data-rf]').forEach((b) => b.onclick = () => { state.reconFilter = b.dataset.rf; render(); }); }

  // ── analytics ──
  function viewAnalytics() {
    const opts = [['all', 'All'], ['Fuel', 'Fuel'], ['Maintenance|Repairs', 'Maintenance'], ['Accessories', 'Accessories'], ['Riding Gear', 'Riding gear']];
    const cats = state.chartCat === 'all' ? null : state.chartCat.split('|');
    const mon = Ledger.monthly(L, cats ? (t) => cats.includes(t.category) : null);
    const cum = Ledger.cumulative(L); const T = Ledger.totals(L);
    const total = mon.series.reduce((s, p) => s + p.value, 0);
    const byCat = GROUPS.map((g) => ({ label: g.label, v: g.cats.reduce((s, c) => s + (T.byCategory[c] || 0), 0) })).sort((a, b) => b.v - a.v);
    const maxCat = Math.max(...byCat.map((c) => c.v), 1);
    return `<div class="view">${topbar('Insights')}
      <section class="card pad">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div><div class="label">Monthly spend${cats ? ' · ' + esc(opts.find((o) => o[0] === state.chartCat)[1]) : ''}</div><div class="num" style="font-size:22px;font-weight:600;margin-top:4px">${fmt(total)}</div><div class="muted" style="font-size:12px">${mon.series.length ? `${fmtMonth(mon.series[0].month)} – ${fmtMonth(mon.series.at(-1).month)}` : ''}${mon.undated ? ` · ${fmt(mon.undated)} undated not shown` : ''}</div></div>
        </div>
        <div class="chips" style="margin-bottom:12px">${opts.map(([v, l]) => `<button class="chip ${state.chartCat === v ? 'on' : ''}" data-cc="${v}">${l}</button>`).join('')}</div>
        ${chart(drawBar, mon.series, { height: 200 })}
      </section>
      <div class="dash-cols section" style="margin-top:12px">
        <section class="card pad">
          <div class="label">Cumulative ownership cost</div><div class="muted" style="font-size:12px;margin:2px 0 12px">Dated records only${cum.undated ? ` · plus ${fmt(cum.undated)} with unknown dates` : ''}</div>
          ${chart(drawLine, cum.series, { height: 190 })}
        </section>
        <section class="card pad">
          <div class="label" style="margin-bottom:8px">Where the money went</div>
          ${byCat.map((c) => `<div class="hbar"><span class="t2">${c.label}</span><span class="track"><i style="width:${(c.v / maxCat * 100).toFixed(1)}%"></i></span><span class="num">${fmt(c.v)}</span></div>`).join('')}
          <div class="muted" style="font-size:12px;margin-top:8px">Net after refunds. Duplicates and line items aren't counted.</div>
        </section>
      </div></div>`;
  }
  function bindAnalytics() { $$('[data-cc]').forEach((b) => b.onclick = () => { state.chartCat = b.dataset.cc; render(); }); }

  // ── settings / data ──
  function viewSettings() {
    const s = Store.settings;
    return `<div class="view form-wrap"><button class="back" id="back">${ic.back} Back</button>
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-.02em">Data & settings</h2>
      <section class="card pad form">
        <div style="display:flex;justify-content:space-between;align-items:center"><div class="label">Storage</div>${modePill()}</div>
        ${Store.error ? `<div class="callout bad">${ic.warn}<span>Couldn't reach the Sheet: ${esc(Store.error)}. You're seeing this device's local copy, and edits save locally.</span></div>` : ''}
        <label class="field"><span>Vault key <em>· the VAULT_API_KEY from Vercel. Leave empty to keep data on this device only.</em></span><input class="input" id="key" type="password" value="${esc(Store.key)}" autocomplete="off"/></label>
        <div class="two"><button class="btn" id="savekey">${Store.key ? 'Update key' : 'Connect Sheet'}</button>${Store.key ? `<button class="btn ghost" id="forget">Use device only</button>` : '<span></span>'}</div>
        ${Store.mode === 'cloud' && !Store.error ? `<button class="btn" id="import">Import known history into an empty Sheet</button><span class="muted" style="font-size:12px;margin-top:-6px">Refused automatically if the Sheet already has rows, so the history can't be counted twice.</span>` : ''}
      </section>
      <section class="card pad form section">
        <div class="label">Calculation</div>
        <label class="field"><span>Existing app reported total (₹)</span><input class="input num" id="baseline" inputmode="decimal" value="${esc(s.reportedBaseline)}"/></label>
        <label class="check"><input type="checkbox" id="cu" ${s.countUnverified ? 'checked' : ''}/> Count unverified records in totals</label>
        <label class="check"><input type="checkbox" id="cr" ${s.countNeedsReview ? 'checked' : ''}/> Count "needs review" records in totals</label>
      </section>
      <section class="card pad form section">
        <div class="label">Export & backup</div>
        <div class="two"><button class="btn" id="csv">Export CSV</button><button class="btn" id="json">Export JSON</button></div>
        ${Store.mode === 'local' || Store.error ? `<label class="btn ghost">Restore from JSON backup<input type="file" id="restore" accept="application/json" hidden/></label>` : ''}
      </section>
    </div>`;
  }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function bindSettings() {
    $('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/'));
    $('#savekey').onclick = async () => { Store.key = $('#key').value.trim(); ls.set('akx.key', Store.key); await Store.load(); rebuild(); toast(Store.error ? 'Could not connect — using local copy' : Store.key ? 'Connected to Google Sheet' : 'Using this device'); render(); };
    $('#forget') && ($('#forget').onclick = async () => { Store.key = ''; ls.set('akx.key', ''); await Store.load(); rebuild(); toast('Now saving on this device'); render(); });
    $('#import') && ($('#import').onclick = () => confirmSheet('Import the known history into the Sheet?', 'This writes the transactions and refunds from this device into the Sheet. If the Sheet already has any rows, the import is refused.', async () => {
      try { const local = ls.get(LOCAL_KEY, null) || SEED; const r = await Store.api('POST', { type: 'import', transactions: local.transactions, refunds: local.refunds, meta: { reportedBaseline: Store.settings.reportedBaseline } }); await Store.load(); rebuild(); toast(`Imported ${r.imported} records`); render(); } catch (e) { toast(e.message); }
    }));
    $('#baseline').onchange = async (e) => { const v = Ledger.toPaise(e.target.value); if (v === null) { toast('Enter a number'); return; } await Store.setSetting('reportedBaseline', v / 100); rebuild(); toast('Baseline updated'); };
    $('#cu').onchange = async (e) => { await Store.setSetting('countUnverified', e.target.checked); rebuild(); toast('Updated'); };
    $('#cr').onchange = async (e) => { await Store.setSetting('countNeedsReview', e.target.checked); rebuild(); toast('Updated'); };
    const stamp = todayISO();
    $('#csv').onclick = () => download(`ledger-${stamp}.csv`, Ledger.toCSV(L), 'text/csv');
    $('#json').onclick = () => download(`ledger-${stamp}.json`, JSON.stringify({ app: 'ak-expense', version: 1, exported_at: new Date().toISOString(), settings: Store.settings, transactions: Store.raw.transactions, refunds: Store.raw.refunds }, null, 2), 'application/json');
    $('#restore')?.addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.transactions)) throw new Error('Not a ledger backup');
        confirmSheet('Replace this device\'s data?', `The backup has ${d.transactions.length} records. Export a copy of the current data first if you want to keep it.`, () => { Store.raw = { transactions: d.transactions, refunds: d.refunds || [] }; Store.saveLocal(); if (d.settings) { Object.assign(Store.settings, d.settings); ls.set('akx.settings', Store.settings); } rebuild(); toast('Restored'); render(); });
      } catch (err) { toast('Restore failed: ' + err.message); }
    });
  }

  // ── sheet / toast ──
  function sheet(html, bind) { closeSheet(); const s = document.createElement('div'); s.className = 'scrim'; s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`; s.addEventListener('click', (e) => { if (e.target === s) closeSheet(); }); document.body.appendChild(s); bind && bind(s); }
  function closeSheet() { $$('.scrim').forEach((s) => s.remove()); }
  function confirmSheet(title, body, onYes) { sheet(`<h3>${esc(title)}</h3><p class="t2" style="font-size:14px;margin:-4px 0 16px">${esc(body)}</p><div class="two"><button class="btn" id="n">Cancel</button><button class="btn primary" id="y">Continue</button></div>`, (r) => { $('#n', r).onclick = closeSheet; $('#y', r).onclick = () => { closeSheet(); onYes(); }; }); }
  let toastT; function toast(msg) { $$('.toast').forEach((t) => t.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // ── router ──
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, ''); const [path, qs] = h.split('?'); const parts = path.split('/');
    return { route: parts[0] || '', id: parts[1] ? decodeURIComponent(parts[1]) : null, params: Object.fromEntries(new URLSearchParams(qs || '')) };
  }
  let lastRoute = null;
  function render() {
    const { route, id, params } = parseHash(); chartJobs = [];
    const app = $('#app'); let html;
    switch (route) {
      case 'expenses': html = viewExpenses(params); break;
      case 'e': html = viewDetail(id); break;
      case 'add': html = viewAdd(null); break;
      case 'edit': html = viewAdd(id); break;
      case 'reconcile': html = viewReconcile(); break;
      case 'analytics': html = viewAnalytics(); break;
      case 'settings': html = viewSettings(); break;
      default: html = viewDashboard();
    }
    app.innerHTML = html; renderNav(route === 'edit' ? 'add' : route);
    const key = route + (id || '');
    if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
    ({ expenses: bindExpenses, e: () => bindDetail(id), add: () => bindAdd(null), edit: () => bindAdd(id), reconcile: bindReconcile, analytics: bindAnalytics, settings: bindSettings }[route] || (() => {}))();
    chartJobs.forEach((f) => f());
  }
  window.addEventListener('hashchange', () => { if (!/^#\/(add|edit)/.test(location.hash)) state.draft = null; closeSheet(); render(); });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (chartJobs.length) chartJobs.forEach((f) => f()); }, 150); });

  (async function boot() {
    $('#app').innerHTML = `<div class="empty">Loading ledger…</div>`;
    await Store.load(); rebuild(); render();
  })();
})();
