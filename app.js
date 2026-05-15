// 2007 Polaris Sportsman X2/500 EFI — JSON-backed SPA
// data.json is the source of truth. Editing mutates an in-memory `state` clone;
// the user downloads it and overwrites the on-disk file when finished.

import { dataToMaintenanceMd } from './scripts/export-maintenance-md.js';
import { dataToPartsMd } from './scripts/export-parts-md.js';

// ─────────────────────────────────────────────────────────────
// State & boot
// ─────────────────────────────────────────────────────────────

let state = null;
let dirty = false;
const BACKUP_RING_KEY = 'sportsman-x2-backup';
const BACKUP_RING_MAX = 5;

async function loadData() {
  try {
    const res = await fetch('./data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    const fallback = document.getElementById('data-fallback');
    if (fallback?.textContent.trim()) {
      console.warn('data.json fetch failed; using inline fallback', err);
      return JSON.parse(fallback.textContent);
    }
    throw err;
  }
}

function mutate(fn) {
  fn(state);
  dirty = true;
  backupState();
  renderAll();
  document.getElementById('dirty-bar').classList.remove('hidden');
}

function backupState() {
  try {
    const ring = JSON.parse(localStorage.getItem(BACKUP_RING_KEY) || '[]');
    ring.unshift({ at: new Date().toISOString(), data: state });
    while (ring.length > BACKUP_RING_MAX) ring.pop();
    localStorage.setItem(BACKUP_RING_KEY, JSON.stringify(ring));
  } catch (err) {
    console.warn('autobackup failed', err);
  }
}

(async function boot() {
  try {
    state = await loadData();
    renderAll();
    bindGlobalEvents();
  } catch (err) {
    document.body.innerHTML = `<pre style="padding:24px;color:#C16B3A">Failed to load data.json — ${err.message}</pre>`;
  }
})();

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function today() { return new Date().toISOString().slice(0, 10); }

function addMonths(isoDate, months) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00').getTime();
  const b = new Date(isoB + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

function fsmHref(printedPage) {
  if (!printedPage) return '#';
  const offset = state.fsm.pdfPageOffset || 0;
  return `${encodeURI(state.fsm.filename)}#page=${printedPage + offset}`;
}

function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function downloadBlob(filename, content, type = 'application/octet-stream') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────

function renderAll() {
  renderHero();
  renderAbout();
  renderHighlights();
  renderStatus();
  renderUpcoming();
  renderHistory();
  renderParts();
  renderNotes();
  renderSchedule();
  renderPhotos();
  renderSpecs();
  renderFooter();
  renderFsmBanner();
}

function renderHero() {
  const v = state.vehicle;
  const s = state.status;
  $('#hero-badge').textContent = `AWD · Polaris · ${v.model}`;
  $('#hero-title').textContent = `${v.year} Polaris ${v.model}`;
  $('#hero-sub').textContent = `${v.displacementCc}cc 4-Stroke · ${v.transmission.split(' (')[0]} · ${v.fuelSystem} · ${v.drivetrain} · ${v.location}`;

  const stats = $('#hero-stats');
  stats.innerHTML = '';
  const cells = [
    { val: s.engineHours ?? 'TBD', lbl: 'Engine Hours', action: 'edit-status' },
    { val: s.odometerMi != null ? s.odometerMi.toLocaleString() : 'TBD', lbl: 'Odometer (mi)', action: 'edit-status' },
    { val: `${v.displacementCc}cc`, lbl: 'EFI Single' },
    { val: 'PVT', lbl: 'Polaris Auto CVT' },
    { val: 'AWD', lbl: 'On-Demand True AWD' },
    { val: 'EFI', lbl: 'Fuel Injected' }
  ];
  for (const c of cells) {
    const cell = el('div', { class: 'hero-stat' },
      el('span', { class: 'hero-val' }, c.val),
      el('span', { class: 'hero-lbl' }, c.lbl)
    );
    if (c.action) cell.addEventListener('click', () => openModal(c.action));
    stats.append(cell);
  }
}

function renderAbout() {
  const v = state.vehicle;
  const s = state.status;
  $('#about-desc').innerHTML = `A ${v.year} Polaris ${v.model} (${v.fuelSystem}, ${v.engineType}). Polaris Automatic PVT and ${v.drivetrain}. Documented service is being built up from this point forward — engine, transmission, and front-gearcase oil were all freshly changed on ${s.lastServiceDate} using Polaris OEM fluids. The factory service manual used as reference is the <a href="${encodeURI(state.fsm.filename)}">${state.fsm.label}</a>. Vehicle data, schedule, and history live in <code>data.json</code>; <a href="MAINTENANCE.md">MAINTENANCE.md</a> and <a href="PARTS%20LIST.md">PARTS LIST.md</a> are exported from it.`;
}

function renderHighlights() {
  const grid = $('#highlights-grid');
  grid.innerHTML = '';
  for (const h of state.highlights) {
    grid.append(
      el('div', { class: 'upgrade-card' },
        el('div', { class: 'row-actions' },
          el('button', { class: 'btn btn-sm btn-ghost', onClick: () => openModal('edit-highlight', { id: h.id }) }, 'Edit'),
          el('button', { class: 'btn btn-sm btn-ghost', onClick: () => deleteHighlight(h.id) }, '×')
        ),
        el('div', { class: 'upgrade-icon' }, h.icon || '◆'),
        el('h3', {}, h.title),
        el('p', {}, h.body)
      )
    );
  }
}

function renderStatus() {
  const s = state.status;
  const strip = $('#status-strip');
  strip.innerHTML = '';
  const cells = [
    { lbl: 'Engine hours', val: s.engineHours ?? 'TBD', sub: s.asOfDate ? `as of ${s.asOfDate}` : '' },
    { lbl: 'Odometer (mi)', val: s.odometerMi != null ? s.odometerMi.toLocaleString() : 'TBD', sub: s.asOfDate ? `as of ${s.asOfDate}` : '' },
    { lbl: 'Last service', val: s.lastServiceDate ?? 'TBD', sub: s.lastServiceTitle || '' },
    { lbl: 'Next due', val: nextDueLabel(), sub: 'see Upcoming below' }
  ];
  for (const c of cells) {
    strip.append(
      el('div', { class: 'status-cell' },
        el('span', { class: 'status-lbl' }, c.lbl),
        el('span', { class: 'status-val' }, c.val),
        c.sub ? el('span', { class: 'status-sub' }, c.sub) : null
      )
    );
  }
}

function nextDueLabel() {
  const upcoming = computeUpcoming();
  if (!upcoming.length) return '—';
  const top = upcoming[0];
  return top.item.label;
}

// Recommended-upcoming algorithm
function computeUpcoming() {
  const s = state.status;
  const t = today();
  const results = [];
  for (const item of state.schedule) {
    const triggers = [];
    if (item.interval.hours && s.engineHours != null) {
      const nextH = (item.lastDoneHours ?? 0) + item.interval.hours;
      triggers.push({ by: 'hours', at: nextH, overBy: s.engineHours - nextH });
    }
    if (item.interval.miles && s.odometerMi != null) {
      const nextM = (item.lastDoneMiles ?? 0) + item.interval.miles;
      triggers.push({ by: 'miles', at: nextM, overBy: s.odometerMi - nextM });
    }
    if (item.interval.months && item.lastDoneDate) {
      const nextD = addMonths(item.lastDoneDate, item.interval.months);
      triggers.push({ by: 'date', at: nextD, overBy: daysBetween(nextD, t) });
    }
    const neverDone = !item.lastDoneDate && !item.lastDoneHours && !item.lastDoneMiles;
    const intervalled = item.interval.hours || item.interval.months || item.interval.miles;
    if (!intervalled) continue; // pre-ride / daily / weekly / as-needed have no due date
    if (neverDone) {
      results.push({ item, trigger: null, severity: 'overdue', neverDone: true });
      continue;
    }
    if (!triggers.length) continue;
    const trigger = triggers.reduce((a, b) => (a.overBy > b.overBy ? a : b));
    let severity = 'upcoming';
    if (trigger.overBy >= 0) severity = 'overdue';
    else {
      // due-soon = within 10% of interval, by the dominant axis
      const intervalSize =
        trigger.by === 'hours' ? item.interval.hours
        : trigger.by === 'miles' ? item.interval.miles
        : item.interval.months * 30;
      if (Math.abs(trigger.overBy) <= intervalSize * 0.1) severity = 'due-soon';
    }
    results.push({ item, trigger, severity, neverDone: false });
  }
  results.sort((a, b) => {
    const ord = { overdue: 0, 'due-soon': 1, upcoming: 2 };
    if (ord[a.severity] !== ord[b.severity]) return ord[a.severity] - ord[b.severity];
    return (b.trigger?.overBy ?? 0) - (a.trigger?.overBy ?? 0);
  });
  return results;
}

function renderUpcoming() {
  const grid = $('#upcoming-grid');
  grid.innerHTML = '';
  const upcoming = computeUpcoming().slice(0, 12);
  if (!upcoming.length) {
    grid.append(el('p', { class: 'section-desc' }, 'No interval-based items detected. Set engine hours & odometer in Status to compute due dates.'));
    return;
  }
  for (const u of upcoming) {
    const meta = u.neverDone
      ? 'Never recorded — service & log to start the clock.'
      : u.trigger?.by === 'date'
        ? `Due ${u.trigger.at}${u.trigger.overBy >= 0 ? ` (${u.trigger.overBy} d overdue)` : ` (in ${-u.trigger.overBy} d)`}`
        : u.trigger?.by === 'hours'
          ? `Due at ${u.trigger.at}h${u.trigger.overBy >= 0 ? ` (${u.trigger.overBy.toFixed(0)}h past)` : ` (in ${(-u.trigger.overBy).toFixed(0)}h)`}`
          : `Due at ${u.trigger.at} mi${u.trigger.overBy >= 0 ? ` (${u.trigger.overBy.toFixed(0)} mi past)` : ` (in ${(-u.trigger.overBy).toFixed(0)} mi)`}`;
    grid.append(
      el('div', { class: `upcoming-card ${u.severity}` },
        el('div', { class: 'uc-title' },
          u.item.label,
          el('span', { class: 'uc-tags' },
            u.item.severeUse ? el('span', { class: 'tag severe' }, 'severe') : null,
            u.item.dealer ? el('span', { class: 'tag dealer' }, 'dealer') : null
          )
        ),
        el('div', { class: 'uc-meta' }, `${u.item.section} — ${meta}`)
      )
    );
  }
}

function renderHistory() {
  const tl = $('#history-timeline');
  tl.innerHTML = '';
  const items = [...state.serviceHistory].sort((a, b) => b.date.localeCompare(a.date));
  for (const entry of items) {
    const d = new Date(entry.date + 'T00:00:00');
    const dateLbl = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const partLine = entry.partsUsed?.length
      ? `Parts: ${entry.partsUsed.map(pid => state.parts.find(p => p.id === pid)?.description ?? pid).join('; ')}`
      : '';
    tl.append(
      el('div', { class: 'tl-item' },
        el('div', { class: 'tl-date' }, dateLbl),
        el('div', { class: 'tl-dot' }),
        el('div', { class: 'tl-content' },
          el('div', { class: 'row-actions' },
            el('button', { class: 'btn btn-sm btn-ghost', onClick: () => openModal('edit-service', { id: entry.id }) }, 'Edit'),
            el('button', { class: 'btn btn-sm btn-ghost', onClick: () => deleteHistory(entry.id) }, '×')
          ),
          el('div', { class: 'tl-shop' }, entry.title),
          el('div', { class: 'tl-miles' },
            `${entry.hours ?? 'TBD'} h · ${entry.miles != null ? entry.miles + ' mi' : 'TBD mi'}`,
            entry.fsmPage ? el('span', {}, ' · ',
              el('a', { href: fsmHref(entry.fsmPage) }, `FSM p${entry.fsmPage}`)
            ) : null
          ),
          entry.procedure?.length ? el('ul', {}, ...entry.procedure.map(p => el('li', {}, p))) : null,
          entry.notes?.length ? el('div', { style: 'margin-top:10px;font-size:0.82rem;color:var(--text-dim)' }, 'Notes: ' + entry.notes.join(' / ')) : null,
          partLine ? el('div', { style: 'margin-top:8px;font-size:0.82rem;color:var(--text-dim)' }, partLine) : null
        )
      )
    );
  }
  if (!items.length) tl.append(el('p', { class: 'section-desc' }, 'No service entries yet. Click "Add entry" above.'));
}

function renderParts() {
  const tbody = $('#parts-tbody');
  tbody.innerHTML = '';
  const sorted = [...state.parts].sort((a, b) => b.date.localeCompare(a.date));
  for (const p of sorted) {
    tbody.append(
      el('tr', {},
        el('td', {}, p.date),
        el('td', { class: 'cell-cost' }, `$${p.costUsd.toFixed(2)}`),
        el('td', { class: 'cell-pn' }, p.polarisPN || '—'),
        el('td', {}, p.vendor || ''),
        el('td', {}, p.description),
        el('td', { class: 'cell-actions' },
          el('button', { class: 'btn btn-sm btn-ghost', onClick: () => openModal('edit-part', { id: p.id }) }, 'Edit'),
          el('button', { class: 'btn btn-sm btn-ghost', onClick: () => deletePart(p.id) }, '×')
        )
      )
    );
  }
  const total = sorted.reduce((s, p) => s + (p.costUsd || 0), 0);
  $('#parts-total').textContent = `Total: $${total.toFixed(2)}`;
}

function renderNotes() {
  const ul = $('#notes-list');
  ul.innerHTML = '';
  for (const n of state.referenceNotes) {
    ul.append(
      el('li', {},
        el('div', { class: 'row-actions' },
          el('button', { class: 'btn btn-sm btn-ghost', onClick: () => openModal('edit-note', { id: n.id }) }, 'Edit'),
          el('button', { class: 'btn btn-sm btn-ghost', onClick: () => deleteNote(n.id) }, '×')
        ),
        n.text
      )
    );
  }
}

function renderSchedule() {
  const root = $('#schedule-sections');
  root.innerHTML = '';
  const sections = [];
  const bySection = new Map();
  for (const item of state.schedule) {
    if (!bySection.has(item.section)) { sections.push(item.section); bySection.set(item.section, []); }
    bySection.get(item.section).push(item);
  }
  for (const section of sections) {
    const wrap = el('div', { class: 'schedule-section' }, el('h3', {}, section));
    const list = el('ul', { class: 'schedule-list' });
    for (const item of bySection.get(section)) {
      const isDone = !!item.lastDoneDate;
      list.append(
        el('li', { class: `schedule-item${isDone ? ' done' : ''}`, onClick: (e) => {
          if (e.target.tagName === 'INPUT') return;
          toggleScheduleItem(item.id);
        } },
          el('input', { type: 'checkbox', ...(isDone ? { checked: '' } : {}), onChange: () => toggleScheduleItem(item.id) }),
          el('span', { class: 'schedule-label' },
            item.label,
            item.severeUse ? ' ' : '',
            item.severeUse ? el('span', { class: 'tag severe' }, 'severe') : null,
            item.dealer ? ' ' : '',
            item.dealer ? el('span', { class: 'tag dealer' }, 'dealer') : null
          ),
          isDone ? el('span', { class: 'schedule-done-stamp' },
            `${item.lastDoneDate}${item.lastDoneHours != null ? ` @ ${item.lastDoneHours}h` : ''}${item.lastDoneMiles != null ? ` @ ${item.lastDoneMiles}mi` : ''}`
          ) : null
        )
      );
    }
    wrap.append(list);
    root.append(wrap);
  }
}

function toggleScheduleItem(id) {
  mutate((s) => {
    const item = s.schedule.find(x => x.id === id);
    if (!item) return;
    if (item.lastDoneDate) {
      item.lastDoneDate = null;
      item.lastDoneHours = null;
      item.lastDoneMiles = null;
    } else {
      item.lastDoneDate = today();
      item.lastDoneHours = s.status.engineHours;
      item.lastDoneMiles = s.status.odometerMi;
    }
  });
}

function renderPhotos() {
  const grid = $('#gallery-grid');
  grid.innerHTML = '';
  const sorted = [...state.photos].sort((a, b) => b.date.localeCompare(a.date));
  for (const p of sorted.slice(0, 36)) {
    const isVideo = /\.mp4$/i.test(p.filename);
    const thumb = el('div', { class: 'gallery-thumb', onClick: () => openLightbox(p) },
      isVideo
        ? el('video', { src: `ATV%20PICS/${encodeURIComponent(p.filename)}`, muted: '', preload: 'metadata' })
        : el('img', { src: `ATV%20PICS/${encodeURIComponent(p.filename)}`, loading: 'lazy', alt: p.caption || p.filename }),
      isVideo ? el('span', { class: 'vid-badge' }, '▶') : null
    );
    grid.append(thumb);
  }
  $('#album-button').href = state.settings.albumUrl;
  $('#album-meta').innerHTML = `Factory service manual on file: <a href="${encodeURI(state.fsm.filename)}">${state.fsm.label}</a> · <a href="MAINTENANCE.md">MAINTENANCE.md</a> · <a href="PARTS%20LIST.md">PARTS LIST.md</a>`;
}

function renderSpecs() {
  const v = state.vehicle;
  const grid = $('#specs-grid');
  grid.innerHTML = '';
  const left = [
    ['Year', v.year], ['Make', v.make], ['Model', v.model],
    ['Model #', v.modelNumber], ['Engine', `${v.displacementCc}cc ${v.engineType}`],
    ['Cooling', v.cooling], ['Fuel system', v.fuelSystem], ['Transmission', v.transmission],
    ['Drivetrain', v.drivetrain], ['Front tire', v.frontTire], ['Rear tire', v.rearTire],
    ['Front susp.', v.frontSuspension], ['Rear susp.', v.rearSuspension], ['Brakes', v.brakeType]
  ];
  const right = [
    ['VIN', { html: `<span class="mono">${v.vin}</span>` }],
    ['Engine s/n', { html: `<span class="mono">${v.engineSerial}</span>` }],
    ['Plate (WA)', v.plate],
    ['Purchase date', v.purchaseDate],
    ['Engine hours', state.status.engineHours ?? 'TBD'],
    ['Odometer', state.status.odometerMi != null ? state.status.odometerMi.toLocaleString() : 'TBD'],
    ['Last service', `${state.status.lastServiceDate ?? 'TBD'} — ${state.status.lastServiceTitle ?? ''}`],
    ['Dry weight', `${v.dryWeightLbs} lbs / ${v.dryWeightKg} kg`],
    ['Towing', `${v.towingCapacityLbs} lbs / ${v.towingCapacityKg} kg`],
    ['Fuel cap.', `${v.fuelCapacityGal} gal / ${v.fuelCapacityL} L`],
    ['Ground clr.', `${v.groundClearanceIn} in / ${v.groundClearanceMm} mm`],
    ['Owner', v.owner],
    ['Location', v.location],
    ['Service manual', { html: `<a href="${encodeURI(state.fsm.filename)}">${state.fsm.label}</a>` }]
  ];
  grid.append(specsCol(left), specsCol(right));
}

function specsCol(rows) {
  const tbl = el('table', { class: 'specs-table' });
  for (const [k, v] of rows) {
    const td = el('td', {});
    if (v && typeof v === 'object' && v.html) td.innerHTML = v.html;
    else td.textContent = (v ?? '') + '';
    tbl.append(el('tr', {}, el('th', {}, k), td));
  }
  return el('div', { class: 'specs-col' }, tbl);
}

function renderFooter() {
  const v = state.vehicle;
  $('#footer-line').textContent = `${v.year} Polaris ${v.model} (${v.fuelSystem}) · ${v.location}`;
  $('#footer-vin').textContent = `VIN: ${v.vin}`;
}

function renderFsmBanner() {
  const banner = $('#fsm-banner');
  banner.innerHTML = '';
  if (!state.fsm.offsetVerified) {
    banner.append(el('div', { class: 'banner' },
      `FSM page offset not yet verified. Open the manual, find printed page 72, and `,
      el('a', { href: '#', onClick: (e) => { e.preventDefault(); openModal('fsm-offset'); } }, 'set the offset'),
      ` so every "FSM pNN" link in service history jumps to the right PDF page.`
    ));
  }
}

// ─────────────────────────────────────────────────────────────
// Lightbox
// ─────────────────────────────────────────────────────────────

function openLightbox(photo) {
  const lb = $('#lightbox');
  const media = $('#lb-media');
  media.innerHTML = '';
  const isVideo = /\.mp4$/i.test(photo.filename);
  if (isVideo) {
    media.append(el('video', { src: `ATV%20PICS/${encodeURIComponent(photo.filename)}`, controls: '', autoplay: '' }));
  } else {
    media.append(el('img', { src: `ATV%20PICS/${encodeURIComponent(photo.filename)}`, alt: photo.caption || photo.filename }));
  }
  $('#lb-caption').textContent = `${photo.date} — ${photo.caption || photo.filename}`;
  lb.classList.add('open');
}

function closeLightbox() {
  $('#lightbox').classList.remove('open');
  $('#lb-media').innerHTML = '';
}

// ─────────────────────────────────────────────────────────────
// Modals
// ─────────────────────────────────────────────────────────────

const modals = {
  'edit-status': {
    title: 'Edit hours / mileage',
    body: () => `
      <div class="modal-grid-2">
        <div>
          <label>Engine hours</label>
          <input type="number" step="0.1" name="engineHours" value="${state.status.engineHours ?? ''}">
        </div>
        <div>
          <label>Odometer (mi)</label>
          <input type="number" step="1" name="odometerMi" value="${state.status.odometerMi ?? ''}">
        </div>
      </div>
      <label>As of (date)</label>
      <input type="date" name="asOfDate" value="${state.status.asOfDate || today()}">
    `,
    save: (form) => {
      const fd = new FormData(form);
      const h = fd.get('engineHours');
      const m = fd.get('odometerMi');
      mutate(s => {
        s.status.engineHours = h === '' ? null : Number(h);
        s.status.odometerMi = m === '' ? null : Number(m);
        s.status.asOfDate = fd.get('asOfDate') || today();
      });
    }
  },

  'add-part': {
    title: 'Add part',
    body: () => partForm({}),
    save: (form) => savePart(form, null)
  },

  'edit-part': {
    title: 'Edit part',
    body: (ctx) => partForm(state.parts.find(p => p.id === ctx.id)),
    save: (form, ctx) => savePart(form, ctx.id)
  },

  'add-service': {
    title: 'Add service entry',
    body: () => serviceForm({}),
    save: (form) => saveService(form, null)
  },

  'edit-service': {
    title: 'Edit service entry',
    body: (ctx) => serviceForm(state.serviceHistory.find(e => e.id === ctx.id)),
    save: (form, ctx) => saveService(form, ctx.id)
  },

  'add-note': {
    title: 'Add reference note',
    body: () => `<label>Note</label><textarea name="text" required></textarea>`,
    save: (form) => {
      const text = new FormData(form).get('text').toString().trim();
      if (!text) return;
      mutate(s => s.referenceNotes.unshift({ id: genId('rn'), text }));
    }
  },

  'edit-note': {
    title: 'Edit reference note',
    body: (ctx) => {
      const n = state.referenceNotes.find(x => x.id === ctx.id);
      return `<label>Note</label><textarea name="text" required>${escapeAttr(n?.text || '')}</textarea>`;
    },
    save: (form, ctx) => {
      const text = new FormData(form).get('text').toString().trim();
      mutate(s => { const n = s.referenceNotes.find(x => x.id === ctx.id); if (n) n.text = text; });
    }
  },

  'add-highlight': {
    title: 'Add highlight card',
    body: () => highlightForm({}),
    save: (form) => saveHighlight(form, null)
  },

  'edit-highlight': {
    title: 'Edit highlight card',
    body: (ctx) => highlightForm(state.highlights.find(h => h.id === ctx.id)),
    save: (form, ctx) => saveHighlight(form, ctx.id)
  },

  'add-photo': {
    title: 'Add photo / video',
    body: () => `
      <div class="modal-note">Drop the file into the <code>ATV PICS/</code> folder on disk first, then enter its filename here.</div>
      <label>Filename (e.g. 20260513_141022.jpg)</label>
      <input name="filename" required>
      <label>Date</label>
      <input type="date" name="date" value="${today()}" required>
      <label>Caption (optional)</label>
      <input name="caption">
    `,
    save: (form) => {
      const fd = new FormData(form);
      mutate(s => s.photos.unshift({
        filename: fd.get('filename').toString().trim(),
        date: fd.get('date').toString(),
        caption: fd.get('caption')?.toString().trim() || ''
      }));
    }
  },

  'fsm-offset': {
    title: 'Set FSM PDF page offset',
    body: () => `
      <div class="modal-note">Open the FSM PDF, jump to printed page 72 (the engine oil change chapter). Note the PDF viewer's page number for that same page. The difference is the offset.</div>
      <label>Current filename</label>
      <input name="filename" value="${escapeAttr(state.fsm.filename)}">
      <div class="modal-grid-2">
        <div><label>Printed page</label><input type="number" name="printedPage" value="72"></div>
        <div><label>PDF page</label><input type="number" name="pdfPage" placeholder="e.g. 75"></div>
      </div>
    `,
    save: (form) => {
      const fd = new FormData(form);
      const filename = fd.get('filename').toString().trim();
      const printed = Number(fd.get('printedPage'));
      const pdf = Number(fd.get('pdfPage'));
      mutate(s => {
        if (filename) s.fsm.filename = filename;
        if (printed && pdf) {
          s.fsm.pdfPageOffset = pdf - printed;
          s.fsm.offsetVerified = true;
        }
      });
    }
  },

  'open-settings': {
    title: 'Settings',
    body: () => `
      <div class="modal-note">Your Anthropic API key is stored unencrypted in this browser's localStorage. Clear it if you share the device.</div>
      <label>Anthropic API key</label>
      <input type="password" name="apiKey" value="${escapeAttr(localStorage.getItem('anthropicApiKey') || '')}" placeholder="sk-ant-...">
      <label>Model</label>
      <select name="model">
        <option value="claude-opus-4-7" ${(localStorage.getItem('anthropicModel') || 'claude-opus-4-7') === 'claude-opus-4-7' ? 'selected' : ''}>claude-opus-4-7 (best)</option>
        <option value="claude-sonnet-4-6" ${localStorage.getItem('anthropicModel') === 'claude-sonnet-4-6' ? 'selected' : ''}>claude-sonnet-4-6 (faster)</option>
        <option value="claude-haiku-4-5" ${localStorage.getItem('anthropicModel') === 'claude-haiku-4-5' ? 'selected' : ''}>claude-haiku-4-5 (cheapest)</option>
      </select>
      <label>Album URL</label>
      <input name="albumUrl" value="${escapeAttr(state.settings.albumUrl || '')}">
    `,
    save: (form) => {
      const fd = new FormData(form);
      const key = fd.get('apiKey').toString().trim();
      const model = fd.get('model').toString();
      const url = fd.get('albumUrl').toString().trim();
      if (key) localStorage.setItem('anthropicApiKey', key); else localStorage.removeItem('anthropicApiKey');
      localStorage.setItem('anthropicModel', model);
      if (url !== state.settings.albumUrl) mutate(s => { s.settings.albumUrl = url; });
      updateSearchHint();
    },
    extraFooter: () => el('button', {
      type: 'button',
      class: 'btn btn-ghost',
      onClick: () => {
        localStorage.removeItem('anthropicApiKey');
        updateSearchHint();
        closeModal();
      }
    }, 'Clear API key')
  }
};

function partForm(p) {
  return `
    <div class="modal-grid-2">
      <div><label>Date</label><input type="date" name="date" value="${p?.date || today()}" required></div>
      <div><label>Cost USD</label><input type="number" step="0.01" name="costUsd" value="${p?.costUsd ?? ''}" required></div>
    </div>
    <div class="modal-grid-2">
      <div><label>Polaris P#</label><input name="polarisPN" value="${escapeAttr(p?.polarisPN || '')}"></div>
      <div><label>Vendor</label><input name="vendor" value="${escapeAttr(p?.vendor || 'Amazon')}"></div>
    </div>
    <label>Description</label>
    <input name="description" value="${escapeAttr(p?.description || '')}" required>
    <label>Category</label>
    <select name="category">
      ${['Engine','Electrical','Body','Suspension','Lubricant','Misc','Brakes','Drivetrain'].map(c => `<option ${p?.category===c?'selected':''}>${c}</option>`).join('')}
    </select>
  `;
}

function savePart(form, id) {
  const fd = new FormData(form);
  const data = {
    date: fd.get('date').toString(),
    costUsd: Number(fd.get('costUsd')),
    polarisPN: fd.get('polarisPN').toString().trim(),
    vendor: fd.get('vendor').toString().trim(),
    description: fd.get('description').toString().trim(),
    category: fd.get('category').toString()
  };
  mutate(s => {
    if (id) Object.assign(s.parts.find(p => p.id === id) || {}, data);
    else s.parts.unshift({ id: genId('pt'), ...data });
  });
}

function deletePart(id) {
  if (!confirm('Delete this part?')) return;
  mutate(s => { s.parts = s.parts.filter(p => p.id !== id); });
}

function highlightForm(h) {
  return `
    <label>Icon (single character)</label>
    <input name="icon" value="${escapeAttr(h?.icon || '◆')}" maxlength="3">
    <label>Title</label>
    <input name="title" value="${escapeAttr(h?.title || '')}" required>
    <label>Body</label>
    <textarea name="body" required>${escapeAttr(h?.body || '')}</textarea>
  `;
}

function saveHighlight(form, id) {
  const fd = new FormData(form);
  const data = {
    icon: fd.get('icon').toString().trim() || '◆',
    title: fd.get('title').toString().trim(),
    body: fd.get('body').toString().trim()
  };
  mutate(s => {
    if (id) Object.assign(s.highlights.find(h => h.id === id) || {}, data);
    else s.highlights.unshift({ id: genId('hl'), ...data });
  });
}

function deleteHighlight(id) {
  if (!confirm('Delete this highlight card?')) return;
  mutate(s => { s.highlights = s.highlights.filter(h => h.id !== id); });
}

function deleteNote(id) {
  if (!confirm('Delete this note?')) return;
  mutate(s => { s.referenceNotes = s.referenceNotes.filter(n => n.id !== id); });
}

function deleteHistory(id) {
  if (!confirm('Delete this service entry?')) return;
  mutate(s => { s.serviceHistory = s.serviceHistory.filter(e => e.id !== id); });
}

function serviceForm(entry) {
  const partsOptions = state.parts.map(p =>
    `<label><input type="checkbox" name="partsUsed" value="${p.id}" ${entry?.partsUsed?.includes(p.id) ? 'checked' : ''}> ${p.date} — ${escapeAttr(p.description)} ($${p.costUsd.toFixed(2)})</label>`
  ).join('');
  const scheduleOptions = state.schedule
    .filter(x => x.interval.hours || x.interval.months || x.interval.miles)
    .map(x => `<label><input type="checkbox" name="scheduleItemsCompleted" value="${x.id}" ${entry?.scheduleItemsCompleted?.includes(x.id) ? 'checked' : ''}> ${x.label} <span style="color:var(--text-dim)">— ${x.section}</span></label>`).join('');
  return `
    <div class="modal-grid-2">
      <div><label>Date</label><input type="date" name="date" value="${entry?.date || today()}" required></div>
      <div><label>FSM page (printed)</label><input type="number" name="fsmPage" value="${entry?.fsmPage ?? ''}"></div>
    </div>
    <div class="modal-grid-2">
      <div><label>Hours</label><input type="number" step="0.1" name="hours" value="${entry?.hours ?? ''}"></div>
      <div><label>Miles</label><input type="number" name="miles" value="${entry?.miles ?? ''}"></div>
    </div>
    <label>Title</label>
    <input name="title" value="${escapeAttr(entry?.title || '')}" required>
    <label>Category</label>
    <input name="category" value="${escapeAttr(entry?.category || '')}">
    <label>Procedure (one item per line)</label>
    <textarea name="procedure">${escapeAttr((entry?.procedure || []).join('\n'))}</textarea>
    <label>Notes (one item per line)</label>
    <textarea name="notes">${escapeAttr((entry?.notes || []).join('\n'))}</textarea>
    <label>Parts used (multi-select)</label>
    <div class="checkbox-multi">${partsOptions || '<span style="color:var(--text-dim);font-size:0.82rem">No parts yet — add some first.</span>'}</div>
    <label>Schedule items completed (these get stamped with this entry's date/hours/miles)</label>
    <div class="checkbox-multi">${scheduleOptions}</div>
  `;
}

function saveService(form, id) {
  const fd = new FormData(form);
  const hours = fd.get('hours');
  const miles = fd.get('miles');
  const fsmPage = fd.get('fsmPage');
  const partsUsed = fd.getAll('partsUsed').map(String);
  const scheduleItemsCompleted = fd.getAll('scheduleItemsCompleted').map(String);
  const data = {
    date: fd.get('date').toString(),
    hours: hours === '' ? null : Number(hours),
    miles: miles === '' ? null : Number(miles),
    title: fd.get('title').toString().trim(),
    category: fd.get('category').toString().trim(),
    fsmPage: fsmPage === '' ? null : Number(fsmPage),
    procedure: fd.get('procedure').toString().split('\n').map(s => s.trim()).filter(Boolean),
    notes: fd.get('notes').toString().split('\n').map(s => s.trim()).filter(Boolean),
    partsUsed,
    scheduleItemsCompleted
  };
  mutate(s => {
    if (id) Object.assign(s.serviceHistory.find(e => e.id === id) || {}, data);
    else s.serviceHistory.unshift({ id: genId('sh'), ...data });
    // Auto-stamp scheduled items
    for (const sid of scheduleItemsCompleted) {
      const item = s.schedule.find(x => x.id === sid);
      if (!item) continue;
      item.lastDoneDate = data.date;
      if (data.hours != null) item.lastDoneHours = data.hours;
      if (data.miles != null) item.lastDoneMiles = data.miles;
    }
    // Update last service summary
    s.status.lastServiceDate = data.date;
    s.status.lastServiceTitle = data.title;
  });
}

function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let modalCtx = null;
function openModal(name, ctx = {}) {
  const def = modals[name];
  if (!def) return;
  modalCtx = { name, ctx };
  $('#modal-title').textContent = def.title;
  $('#modal-body').innerHTML = def.body(ctx);

  const footer = $('#modal-footer');
  // Reset footer to defaults
  footer.innerHTML = '';
  if (def.extraFooter) footer.append(def.extraFooter());
  footer.append(
    el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'),
    el('button', { type: 'submit', class: 'btn', form: 'modal-form' }, 'Save')
  );

  $('#modal').showModal();
}

function closeModal() { $('#modal').close(); modalCtx = null; }

function handleModalSubmit(e) {
  e.preventDefault();
  if (!modalCtx) return;
  const def = modals[modalCtx.name];
  def.save($('#modal-form'), modalCtx.ctx);
  closeModal();
}

// ─────────────────────────────────────────────────────────────
// Exporters
// ─────────────────────────────────────────────────────────────

function downloadJson() {
  downloadBlob('data.json', JSON.stringify(state, null, 2), 'application/json');
}

function exportMaintenance() {
  downloadBlob('MAINTENANCE.md', dataToMaintenanceMd(state), 'text/markdown');
}

function exportParts() {
  downloadBlob('PARTS LIST.md', dataToPartsMd(state), 'text/markdown');
}

// ─────────────────────────────────────────────────────────────
// Claude API search
// ─────────────────────────────────────────────────────────────

const FSD_TEXT = `2007 Polaris Sportsman X2/500 EFI documentation site.
Vehicle is the user's personal ATV in Spokane, WA.
Data shape includes vehicle specs, current status (hours/miles/last service),
reference notes (torques, capacities, plug sizes), a periodic maintenance schedule
from FSM p66-68, service history (newest-first), parts purchase history, photos,
and highlights of recent additions. Recommended-upcoming maintenance is computed
from hours, miles, and calendar dates against each schedule item's interval.
When the user asks about a part, prefer Polaris OEM part numbers when known.
If web tools are available, search the preferred Polaris OEM and Partzilla
catalogs and surface assembly group, part number, description, fitment,
availability, and price. Polaris site (official OEM): https://www.polaris.com/en-us/off-road/parts/
Partzilla 2007 Sportsman X2/500 EFI catalog:
https://www.partzilla.com/catalog/polaris/atv/2007/sportsman-x2-500-efi-a07th50al-aq-au-az-tn50af-as-au
Answer in concise markdown with headings, bullets, and bold for part numbers.`;

const POLARIS_URL = 'https://www.polaris.com/en-us/off-road/parts/';
const PARTZILLA_URL = 'https://www.partzilla.com/catalog/polaris/atv/2007/sportsman-x2-500-efi-a07th50al-aq-au-az-tn50af-as-au';

// Minimal markdown -> safe HTML renderer. Handles headings, paragraphs, lists,
// bold/italic, inline + fenced code, and links. Claude output, sandboxed via escape.
function mdToHtml(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Pull fenced code blocks out first to protect their content from inline rules
  const codeBlocks = [];
  src = src.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`);
    return ` CODEBLOCK${codeBlocks.length - 1} `;
  });

  // Escape everything else
  let s = esc(src);

  // Inline transforms — order matters
  s = s.replace(/`([^`\n]+)`/g, (_, code) => `<code>${code}</code>`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) =>
    `<a href="${href}" target="_blank" rel="noopener">${label}</a>`
  );

  // Block-level — process line by line
  const lines = s.split('\n');
  const out = [];
  let inUl = false, inOl = false, paraBuf = [];
  const flushPara = () => {
    if (paraBuf.length) { out.push(`<p>${paraBuf.join(' ')}</p>`); paraBuf = []; }
  };
  const closeLists = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  for (const raw of lines) {
    if (/^ CODEBLOCK\d+ $/.test(raw)) {
      flushPara(); closeLists();
      out.push(codeBlocks[+raw.match(/\d+/)[0]]);
      continue;
    }
    const h = raw.match(/^(#{1,4})\s+(.+)$/);
    if (h) { flushPara(); closeLists(); out.push(`<h${h[1].length}>${h[2]}</h${h[1].length}>`); continue; }
    const ul = raw.match(/^\s*[-*+]\s+(.+)$/);
    if (ul) {
      flushPara();
      if (!inUl) { closeLists(); out.push('<ul>'); inUl = true; }
      out.push(`<li>${ul[1]}</li>`);
      continue;
    }
    const ol = raw.match(/^\s*\d+\.\s+(.+)$/);
    if (ol) {
      flushPara();
      if (!inOl) { closeLists(); out.push('<ol>'); inOl = true; }
      out.push(`<li>${ol[1]}</li>`);
      continue;
    }
    if (raw.match(/^\s*>\s?(.*)$/)) {
      flushPara(); closeLists();
      out.push(`<blockquote>${raw.replace(/^\s*>\s?/, '')}</blockquote>`);
      continue;
    }
    if (!raw.trim()) { flushPara(); closeLists(); continue; }
    closeLists();
    paraBuf.push(raw);
  }
  flushPara(); closeLists();
  return out.join('\n');
}

// Pull web-search citations out of Claude's response into a dedup'd list
function extractCitations(content) {
  const citations = [];
  const seen = new Set();
  for (const block of content || []) {
    if (block.type !== 'text' || !block.citations) continue;
    for (const c of block.citations) {
      const url = c.url || c.source?.url;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      citations.push({ url, title: c.title || c.cited_text?.slice(0, 80) || url });
    }
  }
  return citations;
}

async function runSearch() {
  const q = $('#search-input').value.trim();
  if (!q) return;
  const key = localStorage.getItem('anthropicApiKey');
  const result = $('#search-result');
  result.className = 'search-result';
  result.innerHTML = '';
  if (!key) {
    result.classList.add('error');
    result.textContent = 'No API key set. Click Settings above.';
    return;
  }
  result.classList.add('loading');
  result.textContent = 'Asking Claude…';

  const usePolaris = $('#search-polaris').checked;
  const usePartzilla = $('#search-partzilla').checked;
  const useWeb = usePolaris || usePartzilla;
  const model = localStorage.getItem('anthropicModel') || 'claude-opus-4-7';

  const allowedDomains = [
    usePolaris ? 'polaris.com' : null,
    usePartzilla ? 'partzilla.com' : null
  ].filter(Boolean);

  const tools = useWeb ? [
    { type: 'web_search_20250305', name: 'web_search', max_uses: 3, allowed_domains: allowedDomains },
    { type: 'web_fetch_20250910',  name: 'web_fetch',  max_uses: 3, allowed_domains: allowedDomains }
  ] : undefined;

  const sourceHints = [
    usePolaris   ? `Polaris OEM parts: ${POLARIS_URL}`     : null,
    usePartzilla ? `Partzilla catalog: ${PARTZILLA_URL}`   : null
  ].filter(Boolean).join('\n');
  const userContent = useWeb
    ? `${q}\n\n(Use web_search / web_fetch on ${allowedDomains.join(' + ')} to look up parts. Preferred sources:\n${sourceHints})`
    : q;

  try {
    const body = {
      model,
      max_tokens: 2048,
      system: [
        { type: 'text', text: FSD_TEXT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'Current data:\n' + JSON.stringify(state), cache_control: { type: 'ephemeral' } }
      ],
      messages: [{ role: 'user', content: userContent }]
    };
    if (tools) body.tools = tools;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    result.classList.remove('loading');

    if (!res.ok) {
      const txt = await res.text();
      result.classList.add('error');
      result.textContent = `HTTP ${res.status}: ${txt}`;
      return;
    }

    const json = await res.json();
    const text = (json.content || []).map(b => b.text || '').join('\n').trim();
    const citations = extractCitations(json.content);

    if (!text) {
      result.textContent = '(empty response)';
    } else {
      result.innerHTML = mdToHtml(text);
      if (citations.length) {
        const cBox = el('div', { class: 'citations' }, el('strong', {}, 'Sources:'));
        for (const c of citations) {
          cBox.append(el('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.title));
        }
        result.append(cBox);
      }
    }

    const u = json.usage || {};
    const cacheInfo = u.cache_read_input_tokens ? ` · cache hit ${u.cache_read_input_tokens}t`
                    : u.cache_creation_input_tokens ? ` · cache primed ${u.cache_creation_input_tokens}t` : '';
    const webInfo = u.server_tool_use?.web_search_requests
      ? ` · web searches ${u.server_tool_use.web_search_requests}` : '';
    $('#search-hint').textContent = `${model} · in ${u.input_tokens ?? 0}t · out ${u.output_tokens ?? 0}t${cacheInfo}${webInfo}`;
  } catch (err) {
    result.classList.remove('loading');
    result.classList.add('error');
    result.textContent = `Error: ${err.message}`;
  }
}

function updateSearchHint() {
  const has = !!localStorage.getItem('anthropicApiKey');
  $('#search-hint').textContent = has
    ? `API key set (${(localStorage.getItem('anthropicModel') || 'claude-opus-4-7')}). Search uses prompt caching.`
    : 'No API key set — open Settings to paste one.';
}

// ─────────────────────────────────────────────────────────────
// Event wiring
// ─────────────────────────────────────────────────────────────

function bindGlobalEvents() {
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    switch (action) {
      case 'edit-status':
      case 'add-part':
      case 'add-service':
      case 'add-note':
      case 'add-highlight':
      case 'add-photo':
      case 'open-settings':
        openModal(action);
        break;
      case 'download-json':       downloadJson(); break;
      case 'export-maintenance':  exportMaintenance(); break;
      case 'export-parts':        exportParts(); break;
    }
  });

  // Theme toggle — flip light/dark, persist, sync with system pref when no manual override
  $('#theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
  });
  if (window.matchMedia) {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', (e) => {
      if (localStorage.getItem('theme')) return; // user has an explicit choice; don't override
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    });
  }

  $('#modal-form').addEventListener('submit', handleModalSubmit);
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('cancel', (e) => { e.preventDefault(); closeModal(); });

  $('#search-go').addEventListener('click', runSearch);
  $('#search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

  // Restore + persist web-search source toggles
  const persistCheckbox = (id, key) => {
    const box = $(id);
    box.checked = localStorage.getItem(key) === '1';
    box.addEventListener('change', () => {
      localStorage.setItem(key, box.checked ? '1' : '0');
    });
  };
  persistCheckbox('#search-polaris',   'searchPolaris');
  persistCheckbox('#search-partzilla', 'searchPartzilla');

  $('#lb-close').addEventListener('click', closeLightbox);
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  updateSearchHint();
}
