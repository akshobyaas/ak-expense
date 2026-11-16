/* app.js — Ixora, a simple expense tracker for one Hunter 350.
   All money logic lives in ledger.js; this file only renders and saves. */
(function () {
  'use strict';
  const BIKE = { name: 'Ixora', model: 'Hunter 350', colour: 'London Red', owner: 'Akshobya A S', initials: 'AS' };

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
  const pin = svg('<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>');
  // Bookkeeping remarks from the audit stay in the Sheet but aren't shown in the app.
  const HIDDEN_NOTE = /^(Reconciled |Needs reconciliation|₹1 looks like a placeholder|Unitemised part of|invoice not attached)/;
  const cleanNotes = (n) => String(n || '').split(' · ').filter((p) => !HIDDEN_NOTE.test(p)).join(' · ');
  const readable = (n) => cleanNotes(n).replace(/\s+[—·]\s+/g, ', ').replace(/\bFull Tank\b|\bFull tank\b/g, 'full tank').replace(/\bPartial\b/g, 'partial fill');
  const hiddenNotes = (n) => String(n || '').split(' · ').filter((p) => HIDDEN_NOTE.test(p));

  // Categories as people say them. Maintenance + Repairs read as one thing: "Service".
  const GROUPS = [
    { label: 'Fuel', cats: ['Fuel'] },
    { label: 'Service', cats: ['Maintenance', 'Repairs'] },
    { label: 'Accessories', cats: ['Accessories'] },
    { label: 'Riding gear', cats: ['Riding Gear'] },
    { label: 'Mods', cats: ['Modification'] },
    { label: 'Other', cats: ['Insurance', 'Documentation', 'Other'] },
  ];
  // What the add form offers (one category per tag).
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
  // The total on Home is set on odometer drums: rupees on dark wells, paise inverted like the tenths drum.
  function odometer(p) {
    const reel = (d) => `<span class="drum"><span class="reel" data-d="${d}">${'0123456789'.split('').map((n) => `<span>${n}</span>`).join('')}</span></span>`;
    const groups = fmt(Math.floor(p / 100) * 100).replace('₹', '').split(',');
    const ps = p % 100;
    return `<span class="odo" role="img" aria-label="${fmt(p)}"><span class="cur" aria-hidden="true">₹</span>${groups.map((g) => `<span class="grp" aria-hidden="true">${[...g].map(reel).join('')}</span>`).join('')}${ps ? `<span class="pt" aria-hidden="true">.</span><span class="grp frac" aria-hidden="true">${[...String(ps).padStart(2, '0')].map(reel).join('')}</span>` : ''}</span>`;
  }
  // Drums roll up from zero the first time Home opens; after that they just sit at the value.
  let rolled = false;
  function setOdometer() {
    const reels = $$('.odo .reel'); if (!reels.length) return;
    const go = () => reels.forEach((r, i) => { r.style.transitionDelay = `${i * 70}ms`; r.style.setProperty('--d', r.dataset.d); });
    if (rolled) { go(); return; }
    rolled = true; $('.odo').classList.add('roll');
    requestAnimationFrame(() => requestAnimationFrame(go));
  }
  function dateBlock(d) {
    if (!d) return `<span class="dt none" aria-label="No date"><b>–</b><small>no date</small></span>`;
    const [y, m, dd] = d.split('-');
    return `<span class="dt"><b class="num">${+dd}</b><small>${MONTHS[+m - 1]}${y !== todayISO().slice(0, 4) ? ' ’' + y.slice(2) : ''}</small></span>`;
  }
  function item(t) {
    const kids = L.children.get(t.id) || [];
    const note = t.notes === t.expenditure ? '' : readable(t.notes).split(' · ')[0];
    const sub = [kids.length ? `${kids.length} items` : note, t.place ? t.place.split(',')[0] : ''].filter(Boolean).join(', ');
    const off = !Ledger.counts(L, t) || Ledger.displayStatus(L, t) === 'REFUNDED';
    return `<a class="row ${off ? 'off' : ''}" href="#/e/${encodeURIComponent(t.id)}">
      ${dateBlock(t.date)}
      <span style="min-width:0"><div class="name">${esc(t.expenditure)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</span>
      <span class="amt">${amountCell(t)}</span></a>`;
  }
  function groupedList(rows, searching) {
    if (!rows.length) return `<div class="empty">${searching ? 'Nothing matches that search.' : 'No expenses here yet. Use Add to log one.'}</div>`;
    const groups = new Map();
    for (const t of rows) { const k = t.date ? t.date.slice(0, 7) : 'none'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
    return [...groups].map(([k, ts]) => {
      const sum = ts.reduce((s, t) => s + (Ledger.counts(L, t) ? Ledger.netOf(L, t) : 0), 0);
      return `<div class="month"><span>${k === 'none' ? 'No date' : monthName(k)}</span><span class="num">${fmt(sum)}</span></div><div class="list">${ts.map(item).join('')}</div>`;
    }).join('');
  }
  const head = (title, sub) => `<div class="head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div><a class="avatar" href="#/more" aria-label="More">${BIKE.initials}</a></div>`;
  const backBtn = () => `<button class="back" id="back">${ic.back} Back</button>`;

  // ── charts (single accent, hover/tap tooltips) ──
  const ACC = '#efebe3', GRID = 'rgba(239,235,227,.08)', AX = '#7b7c78';
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
    s += `<line class="xh" y1="${padT}" y2="${H - padB}" stroke="rgba(255,255,255,.2)" opacity="0"/><circle class="dot" r="4.5" fill="${ACC}" stroke="#1e2125" stroke-width="2" opacity="0"/><rect class="hit" x="${padL}" y="0" width="${W - padL}" height="${H}" fill="transparent"/></svg><div class="tip"></div>`;
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
    const cats = GROUPS.map((g) => ({ ...g, v: g.cats.reduce((s, c) => s + (T.byCategory[c] || 0), 0), n: L.transactions.filter((t) => g.cats.includes(t.category) && Ledger.counts(L, t)).length })).filter((g) => g.v > 0).sort((a, b) => b.v - a.v);
    const max = Math.max(...cats.map((c) => c.v), 1);
    const recent = Ledger.query(L, { sort: 'newest' }).filter((t) => t.date).slice(0, 5);
    const needs = [];
    if (T.pending) needs.push(`<b class="num">${fmt(T.pending)}</b> isn't counted yet`);
    if (B.gap) needs.push(`<b class="num">${fmt(B.gap)}</b> from your old app isn't listed`);
    if (rc.issues.length) needs.push(`${rc.issues.length} thing${rc.issues.length === 1 ? '' : 's'} look off`);
    return `<div class="view">${head(BIKE.name, `${BIKE.model}, ${BIKE.colour}`)}
      <section class="tank">
        <p class="lead">${esc(BIKE.name)} has cost you</p>
        ${odometer(T.net)}
        <p class="after">${first ? `Since ${monthName(first.month)}. ` : ''}${thisMonth ? `<b class="num">${fmt(thisMonth)}</b> so far this month.` : 'Nothing logged yet this month.'}</p>
        ${needs.length ? `<a class="attention" href="#/check">${needs.join('; ')}. Tap to check.</a>` : ''}
      </section>
      <h2 class="sec">Where the money went</h2>
      ${cats.map((c) => `<a class="cat" href="#/expenses?cat=${encodeURIComponent(c.label)}" aria-label="${esc(c.label)}: ${fmt(c.v)}, ${Math.round((c.v / T.net) * 100)} percent"><span class="cn">${c.label}<small>${Math.round((c.v / T.net) * 100)}%</small></span><span class="num">${fmt(c.v)}</span><span class="gauge" style="--f:${(c.v / T.net).toFixed(4)}"><i></i></span></a>`).join('') || `<div class="empty">No expenses yet. Use Add to log your first one.</div>`}
      ${fuel.avgPricePerLitre ? `<p class="prose"><b class="num">${fuel.fills}</b> fills so far, <b class="num">${fuel.litres} L</b> of petrol at about <b class="num">${fmt(fuel.avgPricePerLitre)}</b> a litre, roughly <b class="num">${fuel.avgLitresPerFill} L</b> each time.</p>` : ''}
      <h2 class="sec">Latest <a href="#/expenses">All expenses</a></h2>
      <div class="list">${recent.map(item).join('') || '<div class="empty">Nothing logged yet.</div>'}</div>
    </div>`;
  }

  // ── Expenses ──
  const filtered = () => { const g = GROUPS.find((x) => x.label === state.cat); return Ledger.query(L, { search: state.q, category: g ? g.cats.join('|') : '', sort: 'newest' }); };
  // "Fuel, 38 entries   ₹31,319" — the total always matches what's on screen.
  function listSummary(rows) {
    const total = rows.reduce((s, t) => s + (Ledger.counts(L, t) ? Ledger.netOf(L, t) : 0), 0);
    const cat = state.cat === 'all' ? '' : state.cat;
    const label = state.q ? `“${state.q}”${cat ? ' in ' + cat : ''}` : cat || 'All';
    return `<span>${esc(label)}, ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}</span><b class="num">${fmt(total)}</b>`;
  }
  function viewExpenses(params) {
    if (params.cat) state.cat = params.cat;
    const rows = filtered();
    return `<div class="view">${head('Expenses')}
      <div class="summary" id="sum">${listSummary(rows)}</div>
      <label class="search">${ic.search}<input id="q" type="search" placeholder="Search by name, place or note" aria-label="Search expenses" value="${esc(state.q)}" autocomplete="off"/></label>
      <div class="tags" role="group" aria-label="Category">${['all', ...GROUPS.map((x) => x.label)].map((c) => `<button class="tag ${state.cat === c ? 'on' : ''}" aria-pressed="${state.cat === c}" data-cat="${esc(c)}">${c === 'all' ? 'All' : esc(c)}</button>`).join('')}</div>
      <div id="rows">${groupedList(rows, !!state.q)}</div>
    </div>`;
  }
  function bindExpenses() {
    const q = $('#q'); let tm;
    q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { state.q = q.value.trim(); const rows = filtered(); $('#rows').innerHTML = groupedList(rows, !!state.q); $('#sum').innerHTML = listSummary(rows); }, 120); });
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
      <h1 class="d-name">${esc(t.expenditure)}</h1>
      <div class="d-meta">${esc(cat)}, ${t.date ? longDate(t.date) : 'no date'}</div>
      <div class="d-amt">${money(t.amount)}</div>
      ${Ledger.litresOf(t) && t.category === 'Fuel' ? `<div class="d-line"><span><b class="num">${Ledger.litresOf(t)} L</b>${/full tank/i.test(t.notes) ? ', full tank,' : /partial/i.test(t.notes) ? ', partial fill,' : ''} at <b class="num">${fmt(Math.round(t.amount / Ledger.litresOf(t)))}</b> a litre</span></div>` : ''}
      ${t.place ? `<div class="d-line">${pin}<span>${esc(t.place)}</span></div>` : ''}
      ${refunded ? `<div class="d-line"><span>Refunded ${fmt(refunded)}, so it counts as <b>${fmt(Ledger.netOf(L, t))}</b></span></div>` : ''}
      ${ds === 'DUPLICATE' ? `<div class="d-line"><span>A second record of something already logged, so it isn't counted.</span></div>` : ''}
      ${pending ? `<div class="notice" style="margin-top:16px"><p>This one <b>isn't counted</b> in your total yet.</p><button class="btn sm red" data-act="count">Count it</button></div>` : ''}
      ${cleanNotes(t.notes) && t.notes !== t.expenditure && !(t.category === 'Fuel' && Ledger.litresOf(t)) ? `<p class="d-notes">${esc(readable(t.notes))}</p>` : ''}
      ${parent ? `<h2 class="sec">Part of</h2><div class="list">${item(parent)}</div>` : ''}
      ${kids.length ? `<h2 class="sec">In this order</h2><div class="list">${kids.map((k) => `<a class="row" style="grid-template-columns:minmax(0,1fr) auto" href="#/e/${encodeURIComponent(k.id)}"><span style="min-width:0"><div class="name">${esc(k.expenditure)}</div>${k.notes ? `<div class="sub">${esc(readable(k.notes))}</div>` : ''}</span><span class="amt">${fmt(k.amount)}</span></a>`).join('')}</div>` : ''}
      <div class="d-actions">
        <a class="btn block" href="#/edit/${encodeURIComponent(t.id)}">Edit expense</a>
        <button class="btn quiet block" data-act="delete">Delete expense</button>
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
        <div class="pair"><button class="btn" id="n">Keep it</button><button class="btn red" id="y">Delete expense</button></div>`, (root) => {
        $('#n', root).onclick = closeSheet;
        $('#y', root).onclick = async () => {
          $('#y', root).disabled = true;
          try { await Store.deleteTx(id); rebuild(); closeSheet(); toast('Deleted'); location.hash = '#/expenses'; } catch (e) { closeSheet(); toast('Couldn\'t delete: ' + e.message); }
        };
      });
    };
  }

  // ── Add / edit ──
  function blank() { return { amount: '', category: 'Fuel', expenditure: '', date: todayISO(), notes: '', litres: '', full: true, place: '' }; }
  // Fuel stops you've used before, most-used first (so the usual one is one tap away).
  function knownPlaces() {
    const n = new Map();
    for (const t of L.transactions) if (t.place && t.category === 'Fuel') n.set(t.place, (n.get(t.place) || 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).map(([p, c]) => ({ place: p, count: c }));
  }
  function viewAdd(editId) {
    const editing = editId ? L.byId.get(editId) : null;
    if (!state.draft || state.draft._for !== (editId || 'new')) {
      state.draft = editing ? { amount: editing.amount === null ? '' : String(Ledger.fromPaise(editing.amount)), category: editing.category, expenditure: editing.expenditure, date: editing.date || '', notes: cleanNotes(editing.notes), litres: '', full: true, place: editing.place || '' } : blank();
      state.draft._for = editId || 'new';
    }
    const d = state.draft; const fuel = d.category === 'Fuel' && !editing;
    return `<div class="view">${backBtn()}
      <form class="form" id="f" novalidate>
        <label class="amount-in"><span>₹</span><input name="amount" inputmode="decimal" placeholder="0" value="${esc(d.amount)}" autocomplete="off" aria-label="Amount" ${editing ? '' : 'autofocus'}/></label>
        <div class="tags" role="group" aria-label="Category">${ADD_CATS.map(([v, l]) => { const on = d.category === v || (v === 'Repairs' && d.category === 'Maintenance'); return `<button type="button" class="tag ${on ? 'on' : ''}" aria-pressed="${on}" data-c="${v}">${l}</button>`; }).join('')}</div>
        ${fuel ? `<div class="pair"><label class="field"><span>Litres</span><input class="input num" name="litres" inputmode="decimal" placeholder="Optional" value="${esc(d.litres)}"/></label>
          <div class="field"><span>Fill</span><div class="seg"><button type="button" data-full="1" class="${d.full ? 'on' : ''}">Full</button><button type="button" data-full="0" class="${d.full ? '' : 'on'}">Partial</button></div></div></div>`
        : `<label class="field"><span>What was it?</span><input class="input" name="expenditure" placeholder="e.g. Chain lube" value="${esc(d.expenditure)}"/></label>`}
        <label class="field"><span>Date <button type="button" class="linkbtn" id="nodate">${d.date ? "Don't know" : 'Use today'}</button></span><input class="input" type="date" name="date" value="${esc(d.date)}"/></label>
        ${d.category === 'Fuel' ? `<div class="field"><span>Place</span><input class="input" name="place" list="places" placeholder="e.g. Koorgally, Mysuru" value="${esc(d.place)}" autocomplete="off"/>
          <datalist id="places">${knownPlaces().map((x) => `<option value="${esc(x.place)}">`).join('')}</datalist>
          ${knownPlaces().length ? `<div class="tags" style="margin-top:4px">${knownPlaces().slice(0, 4).map((x) => `<button type="button" class="tag" data-place="${esc(x.place)}">${esc(x.place)}</button>`).join('')}</div>` : ''}</div>` : ''}
        ${fuel ? '' : `<label class="field"><span>Note</span><input class="input" name="notes" placeholder="Optional" value="${esc(d.notes)}"/></label>`}
        <div id="dup"></div>
        <button class="btn red block" id="save">${editing ? 'Save changes' : 'Add expense'}</button>
      </form></div>`;
  }
  function readForm(f) { const d = state.draft; for (const [k, v] of new FormData(f)) if (k in d) d[k] = String(v).trim(); return d; }
  function bindAdd(editId) {
    const editing = editId ? L.byId.get(editId) : null; const f = $('#f');
    $('#back').onclick = () => { state.draft = null; goBack(); };
    f.addEventListener('input', () => { readForm(f); $('#dup').innerHTML = ''; });
    $$('[data-c]').forEach((b) => b.onclick = () => { readForm(f); state.draft.category = b.dataset.c; render(); });
    $$('[data-place]').forEach((b) => b.onclick = () => { f.place.value = b.dataset.place; readForm(f); $$('[data-place]').forEach((x) => x.classList.toggle('on', x === b)); });
    $$('[data-full]').forEach((b) => b.onclick = () => { state.draft.full = b.dataset.full === '1'; $$('[data-full]').forEach((x) => x.classList.toggle('on', x === b)); });
    $('#nodate').onclick = () => { f.date.value = f.date.value ? '' : todayISO(); readForm(f); $('#nodate').textContent = f.date.value ? "Don't know" : 'Use today'; };
    const save = async (tx) => {
      try { if (editing) await Store.updateTx(tx); else await Store.addTx(tx); state.draft = null; rebuild(); toast(editing ? 'Changes saved' : 'Expense added'); location.hash = editing ? '#/e/' + encodeURIComponent(tx.id) : '#/'; }
      catch (e) { toast('Couldn\'t save: ' + e.message); }
    };
    f.onsubmit = (e) => {
      e.preventDefault(); const d = readForm(f); const p = Ledger.toPaise(d.amount);
      if (!p || p <= 0) { toast('Enter how much you paid'); f.amount.focus(); return; }
      const isFuel = d.category === 'Fuel' && !editing; const litres = parseFloat(d.litres);
      const base = editing ? Object.assign({}, Store.raw.transactions.find((x) => String(x.id) === editId)) : { id: newId(), kind: 'transaction', source: 'Manual', status: 'CONFIRMED_NEW', verified: false };
      const tx = Object.assign(base, {
        amount: Ledger.fromPaise(p), category: d.category, date: d.date || '',
        expenditure: isFuel ? 'Fuel' : d.expenditure,
        place: d.category === 'Fuel' ? (d.place || '') : (base.place || ''),
        // hidden bookkeeping remarks are carried over on edit, never silently dropped
        notes: isFuel ? [Number.isFinite(litres) ? `${litres.toFixed(2)} L` : '', d.full ? 'Full tank' : 'Partial'].filter(Boolean).join(' — ') : [d.notes, ...(editing ? hiddenNotes(editing.notes) : [])].filter(Boolean).join(' · '),
      });
      if (!tx.expenditure) { toast('Add what it was for'); f.expenditure?.focus(); return; }
      if (editing) return save(tx);
      // Don't let the same thing be logged twice by accident.
      const m = Ledger.findDuplicates(L, tx)[0];
      if (!m) return save(tx);
      const x = L.byId.get(m.id);
      $('#dup').innerHTML = `<div class="notice"><p>You may have logged this already: <b>${esc(x.expenditure)}, ${fmt(x.amount)}</b>${x.date ? ` on ${shortDate(x.date)}` : ''}.</p><div class="pair"><button type="button" class="btn sm" id="skip">It's the same one</button><button type="button" class="btn sm red" id="anyway">Add anyway</button></div></div>`;
      $('#skip').onclick = () => { state.draft = null; toast('Not added, it was already logged'); location.hash = '#/e/' + encodeURIComponent(x.id); };
      $('#anyway').onclick = () => save(tx);
    };
  }

  // ── Stats ──
  function viewStats() {
    const g = GROUPS.find((x) => x.label === state.statCat);
    const mon = Ledger.monthly(L, g ? (t) => g.cats.includes(t.category) : null);
    const avg = mon.series.length ? Math.round(mon.series.reduce((s, p) => s + p.value, 0) / mon.series.length) : 0;
    const cum = Ledger.cumulative(L);
    const inCat = L.transactions.filter((t) => Ledger.counts(L, t) && (!g || g.cats.includes(t.category)));
    const tot = inCat.reduce((s, t) => s + Ledger.netOf(L, t), 0), n = inCat.length;
    const fuel = Ledger.fuelStats(L);
    return `<div class="view">${head('Stats', BIKE.name)}
      <div class="tags" role="group" aria-label="Category">${['all', ...GROUPS.map((x) => x.label)].map((c) => `<button class="tag ${state.statCat === c ? 'on' : ''}" aria-pressed="${state.statCat === c}" data-s="${esc(c)}">${c === 'all' ? 'Everything' : esc(c)}</button>`).join('')}</div>
      <p class="prose" style="margin-top:18px">${g ? esc(g.label) + ' costs' : 'Ixora costs'} about</p>
      <div class="big">${money(Math.round(avg / 100) * 100)}</div>
      <p class="prose" style="margin-top:0">a month, <b class="num">${fmt(tot)}</b> over ${n} ${n === 1 ? 'entry' : 'entries'} so far.</p>
      ${chart(drawBar, mon.series)}
      ${mon.undated ? `<p class="prose" style="font-size:14px">${fmt(mon.undated)} has no date, so it isn't in the chart.</p>` : ''}
      ${g && g.label === 'Fuel' && fuel.fills ? `<div style="margin-top:18px"><div class="kv"><span>Fills</span><span class="num">${fuel.fills}</span></div><div class="kv"><span>Petrol</span><span class="num">${fuel.litres} L</span></div><div class="kv"><span>Average price</span><span class="num">${fmt(fuel.avgPricePerLitre)}/L</span></div><div class="kv"><span>Average fill</span><span class="num">${fuel.avgLitresPerFill} L</span></div>${knownPlaces().slice(0, 3).map((x, i) => `<div class="kv"><span>${i ? '' : 'Where you fill up'}</span><span>${esc(x.place)} <span class="dim num">${x.count}×</span></span></div>`).join('')}</div>` : ''}
      <h2 class="sec">Running total <span class="num fog" style="font-weight:500;font-size:17px">${cum.series.length ? fmt(cum.series.at(-1).value) : ''}</span></h2>
      ${cum.undated ? `<p class="prose" style="font-size:14px;margin-top:0">Plus ${fmt(cum.undated)} with no date.</p>` : ''}
      ${chart(drawLine, cum.series)}
    </div>`;
  }
  function bindStats() { $$('[data-s]').forEach((b) => b.onclick = () => { state.statCat = b.dataset.s; render(); }); }

  // ── More ──
  function viewMore() {
    const rc = Ledger.reconciliation(L), T = Ledger.totals(L), B = Ledger.baseline(L);
    const ok = !rc.issues.length && !T.pending && !B.gap;
    return `<div class="view">${backBtn()}
      <h1 class="d-name">${esc(BIKE.owner)}</h1>
      <div class="d-meta">Rides ${esc(BIKE.name)}, a ${esc(BIKE.colour)} ${esc(BIKE.model)}</div>
      <h2 class="sec">Saving</h2>
      <div class="kv"><span>Expenses are saved to</span><span>${Store.live ? 'your Google Sheet' : Store.error ? '<span class="warn">this phone (Sheet unreachable)</span>' : 'this phone only'}</span></div>
      <div class="field" style="margin-top:12px"><span>Vault key</span><input class="input" id="key" type="password" value="${esc(Store.key)}" autocomplete="off"/></div>
      <button class="btn sm block" id="savekey" style="margin-top:10px">${Store.key ? 'Update key' : 'Connect to Sheet'}</button>
      <h2 class="sec">Your data</h2>
      <div class="pair"><button class="btn sm" id="csv">Download CSV</button><button class="btn sm" id="json">Download backup</button></div>
      <a class="row" href="#/check" style="grid-template-columns:minmax(0,1fr) auto;margin-top:10px"><span><div class="name">Check the numbers</div><div class="sub">Totals, duplicates, anything not counted</div></span><span class="${ok ? 'ok' : 'warn'}">${ok ? 'All adds up' : 'Needs a look'}</span></a>
    </div>`;
  }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function bindMore() {
    $('#back').onclick = goBack;
    $('#savekey').onclick = async () => { Store.key = $('#key').value.trim(); ls.set('akx.key', Store.key); await Store.load(); rebuild(); toast(Store.error ? 'Couldn\'t reach the Sheet. Check the key.' : Store.key ? 'Connected to your Sheet' : 'Saving on this phone'); render(); };
    const day = todayISO();
    $('#csv').onclick = () => download(`ixora-expenses-${day}.csv`, Ledger.toCSV(L), 'text/csv');
    $('#json').onclick = () => download(`ixora-backup-${day}.json`, JSON.stringify({ app: 'ixora', exported_at: new Date().toISOString(), transactions: Store.raw.transactions, refunds: Store.raw.refunds }, null, 2), 'application/json');
  }

  // ── Check data (only needed when something's off) ──
  function viewCheck() {
    const T = Ledger.totals(L), B = Ledger.baseline(L), rc = Ledger.reconciliation(L);
    const pending = L.transactions.filter((t) => t.kind === 'transaction' && ['NEEDS_REVIEW', 'UNKNOWN'].includes(t.status));
    const dups = L.transactions.filter((t) => t.kind === 'transaction' && Ledger.isDuplicate(t));
    return `<div class="view">${backBtn()}<h1 class="d-name" style="margin-bottom:12px">Check the numbers</h1>
      <div>
        <div class="kv"><span>Total</span><span class="num">${fmt(T.net)}</span></div>
        <div class="kv"><span>Old app said</span><span class="num">${fmt(B.reported)}</span></div>
        <div class="kv"><span>Old app entries listed here</span><span class="num">${fmt(B.imported)}</span></div>
        ${B.gap ? `<div class="kv"><span>Missing from old app</span><span class="num" style="color:var(--warn)">${fmt(B.gap)}</span></div>` : ''}
        ${T.refunds ? `<div class="kv"><span>Refunds</span><span class="num">${fmt(T.refunds)}</span></div>` : ''}
      </div>
      ${rc.issues.length ? `<h2 class="sec">Looks off</h2>${rc.issues.map((i) => `<p class="prose">${esc(L.byId.get(i.id)?.expenditure || 'Old app total')}: ${esc(i.msg)}</p>`).join('')}` : `<p class="prose">Everything adds up.</p>`}
      ${pending.length ? `<h2 class="sec">Not counted yet</h2><div class="list">${pending.map(item).join('')}</div>` : ''}
      ${dups.length ? `<h2 class="sec">Duplicates</h2><p class="prose" style="margin-top:0">Second records of things already logged. They stay out of the total.</p><div class="list">${dups.map(item).join('')}</div>` : ''}
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
    $('#nav').innerHTML = `<a class="${on('')}" href="#/"${on('') ? ' aria-current="page"' : ''}>Home</a><a class="${on('expenses')}" href="#/expenses"${on('expenses') ? ' aria-current="page"' : ''}>Expenses</a><a class="${on('stats')}" href="#/stats"${on('stats') ? ' aria-current="page"' : ''}>Stats</a><a class="add" href="#/add">${ic.plus}Add</a>`;
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
    if (route === '') setOdometer();
  }
  window.addEventListener('hashchange', () => { if (!/^#\/(add|edit)/.test(location.hash)) state.draft = null; closeSheet(); render(); });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => chartJobs.forEach((f) => f()), 150); });

  (async function boot() {
    $('#app').innerHTML = `<div class="empty">Loading…</div>`;
    await Store.load(); rebuild(); render();
  })();
})();
