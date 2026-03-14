/* ═══════════════════════════════════════════════════════════════════
   Studio Freya — főscript
   ═══════════════════════════════════════════════════════════════════ */

/* ─── Év a láblécben ──────────────────────────────────────────── */
document.getElementById('year').textContent = new Date().getFullYear();

/* ─── Fejléc árnyék görgetéskor ──────────────────────────────── */
const header = document.querySelector('.site-header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

/* ─── Mobil navigáció ─────────────────────────────────────────── */
const toggle   = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
toggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
});
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    toggle.setAttribute('aria-expanded', false);
    document.body.style.overflow = '';
  });
});

/* ═══════════════════════════════════════════════════════════════════
   IDŐPONTOK — a data/schedule.json fájlból töltődnek be.
   Az admin eszközzel szerkeszted, majd GitHubra tolod fel.
   ═══════════════════════════════════════════════════════════════════ */

let SZABAD  = {};
let FOGLALT = {};

// schedule.json betöltése — no-cache hogy mindig a friss verziót kapjuk
fetch('data/schedule.json', { cache: 'no-store' })
  .then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  })
  .then(data => {
    SZABAD  = data.szabad  || {};
    FOGLALT = data.foglalt || {};
    renderCalendar();
    if (st.dateStr) renderSlots();
  })
  .catch(() => {
    // Nincs elérhető fájl — üres naptár marad
  });

/* ═══════════════════════════════════════════════════════════════════
   BELSŐ LOGIKA — ezt nem kell szerkeszteni
   ═══════════════════════════════════════════════════════════════════ */

const HONAPOK = [
  'Január','Február','Március','Április','Május','Június',
  'Július','Augusztus','Szeptember','Október','November','December',
];

const st = {
  hours:   null,    // 1 vagy 2
  price:   null,    // Ft
  label:   null,    // pl. "1 óra · 10 000 Ft"
  date:    null,    // Date
  dateStr: null,    // 'ÉÉÉÉ-HH-NN'
  hour:    null,    // kezdő óra (number)
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
};

function pad(n)      { return String(n).padStart(2, '0'); }
function toDateStr(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fmtHour(h, len) {
  return `${pad(h)}:00 – ${pad(h + len)}:00`;
}
function fmtDateHU(d) {
  return d.toLocaleDateString('hu-HU', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

/* ── Szabad órák egy napra + időtartamra ──────────────────────── */
function getSzabadOrak(dateStr, hours) {
  const szabad  = (SZABAD[dateStr]  || []).slice().sort((a,b)=>a-b);
  const foglalt = (FOGLALT[dateStr] || []);

  if (hours === 1) {
    return szabad.map(h => ({
      hour:   h,
      taken:  foglalt.includes(h),
    }));
  }

  // 2 órás: csak akkor szabad, ha h és h+1 is szerepel SZABAD-ban,
  // és egyik sem foglalt
  return szabad
    .filter(h => szabad.includes(h + 1))
    .map(h => ({
      hour:  h,
      taken: foglalt.includes(h) || foglalt.includes(h + 1),
    }));
}

/* ── Van-e a napnak bármilyen szabad (nem foglalt) időpontja? ─── */
function hasAvail(dateStr, hours) {
  return getSzabadOrak(dateStr, hours).some(s => !s.taken);
}

/* ═══════════════════════════════════════════════════════════════════
   IDŐTARTAM VÁLASZTÓ
   ═══════════════════════════════════════════════════════════════════ */
document.querySelectorAll('.bk-dur-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.bk-dur-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    st.hours = Number(btn.dataset.hours);
    st.price = Number(btn.dataset.price);
    st.label = btn.dataset.label;
    // időpont törlése, naptár és lista frissítése
    st.hour = null;
    hideForms();
    renderCalendar();
    if (st.dateStr) renderSlots();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   NAPTÁR
   ═══════════════════════════════════════════════════════════════════ */
function renderCalendar() {
  const { calYear: yr, calMonth: mo } = st;
  document.getElementById('cal-month-label').textContent = `${HONAPOK[mo]} ${yr}`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const today    = new Date(); today.setHours(0,0,0,0);
  const firstDay = new Date(yr, mo, 1);
  const lastDay  = new Date(yr, mo + 1, 0);

  let offset = firstDay.getDay() - 1;
  if (offset < 0) offset = 6;

  for (let i = 0; i < offset; i++) {
    const el = document.createElement('div');
    el.className = 'bk-cal-day bk-cal-day--empty';
    grid.appendChild(el);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date    = new Date(yr, mo, d);
    const dateStr = toDateStr(date);
    const isPast  = date < today;
    const isSun   = date.getDay() === 0;

    const el       = document.createElement('div');
    const numSpan  = document.createElement('span');
    numSpan.className = 'bk-day-num';
    numSpan.textContent = d;
    el.appendChild(numSpan);

    el.className = 'bk-cal-day';

    if (date.getTime() === today.getTime()) el.classList.add('bk-cal-day--today');

    if (isPast || isSun) {
      el.classList.add(isPast ? 'bk-cal-day--past' : 'bk-cal-day--off');
    } else {
      // Van-e elérhető időpont ezen a napon?
      const hours    = st.hours || 1;
      const hasSlots = hasAvail(dateStr, hours);

      if (hasSlots) {
        el.classList.add('bk-cal-day--avail');

        // Zöld pont
        const dot = document.createElement('span');
        dot.className = 'bk-day-dot';
        el.appendChild(dot);

        el.addEventListener('click', () => {
          document.querySelectorAll('.bk-cal-day--selected')
            .forEach(x => x.classList.remove('bk-cal-day--selected'));
          el.classList.add('bk-cal-day--selected');
          st.date    = date;
          st.dateStr = dateStr;
          st.hour    = null;
          hideForms();
          renderSlots();
        });
      } else {
        el.classList.add('bk-cal-day--off');
      }
    }

    if (st.dateStr === dateStr) el.classList.add('bk-cal-day--selected');
    grid.appendChild(el);
  }
}

document.getElementById('cal-prev').addEventListener('click', () => {
  st.calMonth--;
  if (st.calMonth < 0) { st.calMonth = 11; st.calYear--; }
  renderCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
  st.calMonth++;
  if (st.calMonth > 11) { st.calMonth = 0; st.calYear++; }
  renderCalendar();
});

/* ═══════════════════════════════════════════════════════════════════
   IDŐPONTOK
   ═══════════════════════════════════════════════════════════════════ */
function renderSlots() {
  const container = document.getElementById('time-slots');
  const header    = document.getElementById('slots-header');
  container.innerHTML = '';

  if (!st.dateStr) {
    header.innerHTML = '<span class="bk-slots-title">Válassz napot a naptárból</span>';
    container.innerHTML = `
      <div class="bk-slots-placeholder">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>Kattints egy zöld pontos napra<br>az elérhető időpontok megtekintéséhez</p>
      </div>`;
    return;
  }

  const hours = st.hours || 1;
  header.innerHTML = `<span class="bk-slots-title">${fmtDateHU(st.date)}</span>`;

  const slots = getSzabadOrak(st.dateStr, hours);

  if (slots.length === 0) {
    container.innerHTML = '<p class="bk-no-slots">Erre a napra nincs elérhető időpont.</p>';
    return;
  }

  slots.forEach(({ hour, taken }) => {
    const el = document.createElement('div');
    el.className = `bk-slot bk-slot--${taken ? 'taken' : 'free'}`;
    if (!taken && st.hour === hour) el.classList.add('bk-slot--selected');

    el.innerHTML = `
      <span class="bk-slot-dot"></span>
      <span class="bk-slot-time">${fmtHour(hour, hours)}</span>
      <span class="bk-slot-label">${taken ? 'Foglalt' : 'Szabad'}</span>
    `;

    if (!taken) {
      el.addEventListener('click', () => {
        document.querySelectorAll('.bk-slot--selected')
          .forEach(s => s.classList.remove('bk-slot--selected'));
        el.classList.add('bk-slot--selected');
        st.hour = hour;
        showFormPanel();
      });
    }

    container.appendChild(el);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   FORM PANEL
   ═══════════════════════════════════════════════════════════════════ */
function showFormPanel() {
  const hours = st.hours || 1;

  // Rejtett mezők
  document.getElementById('hidden-duration').value = `${hours} óra`;
  document.getElementById('hidden-price').value    = `${st.price ? st.price.toLocaleString('hu-HU') + ' Ft' : ''}`;
  document.getElementById('hidden-date').value     = st.dateStr ?? '';
  document.getElementById('hidden-time').value     = st.hour !== null ? `${pad(st.hour)}:00` : '';

  // Badge
  const badge = document.getElementById('bk-selection-badge');
  const timeLabel = st.hour !== null ? fmtHour(st.hour, hours) : '—';
  const dateLabel = st.date
    ? st.date.toLocaleDateString('hu-HU', { month: 'long', day: 'numeric', weekday: 'short' })
    : '—';
  const priceLabel = st.price ? st.price.toLocaleString('hu-HU') + ' Ft' : '';

  badge.innerHTML = `
    <strong>${hours} óra</strong>
    <span class="bk-badge-sep"></span>
    ${dateLabel}
    <span class="bk-badge-sep"></span>
    ${timeLabel}
    <span class="bk-badge-sep"></span>
    <strong>${priceLabel}</strong>
  `;

  const panel = document.getElementById('bk-form-panel');
  panel.hidden = false;
  setTimeout(() => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}

function hideForms() {
  document.getElementById('bk-form-panel').hidden = true;
}

/* Módosítás gomb */
document.getElementById('bk-change-btn').addEventListener('click', () => {
  st.hour = null;
  document.querySelectorAll('.bk-slot--selected')
    .forEach(s => s.classList.remove('bk-slot--selected'));
  hideForms();
  document.getElementById('foglalas').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ═══════════════════════════════════════════════════════════════════
   KÜLDÉS
   ═══════════════════════════════════════════════════════════════════ */
const bookingForm = document.getElementById('booking-form');

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!st.hours)        { alert('Kérlek válassz időtartamot!'); return; }
  if (!st.dateStr)      { alert('Kérlek válassz dátumot!');     return; }
  if (st.hour === null) { alert('Kérlek válassz időpontot!');   return; }

  const btn = document.getElementById('booking-submit');
  btn.disabled  = true;
  btn.textContent = 'Küldés…';

  try {
    const action = bookingForm.getAttribute('action');

    if (action.includes('YOUR_FORM_ID')) {
      // Formspree ID még nincs beállítva – szimuláció
      await new Promise(r => setTimeout(r, 900));
      showSuccess();
      return;
    }

    const res = await fetch(action, {
      method:  'POST',
      body:    new FormData(bookingForm),
      headers: { Accept: 'application/json' },
    });

    if (res.ok) {
      showSuccess();
    } else {
      throw new Error();
    }
  } catch {
    alert('Hiba történt a küldés során. Kérlek próbáld újra, vagy hívj minket!');
    btn.disabled  = false;
    btn.textContent = 'Foglalás elküldése';
  }
});

function showSuccess() {
  document.querySelector('.bk-duration-bar').hidden  = true;
  document.querySelector('.bk-main').hidden          = true;
  document.getElementById('bk-form-panel').hidden    = true;
  document.getElementById('booking-success').hidden  = false;
}

document.getElementById('booking-reset').addEventListener('click', () => {
  Object.assign(st, { hours: null, price: null, label: null,
                      date: null, dateStr: null, hour: null });

  document.querySelector('.bk-duration-bar').hidden  = false;
  document.querySelector('.bk-main').hidden          = false;
  document.getElementById('booking-success').hidden  = true;

  document.querySelectorAll('.bk-dur-btn').forEach(b => b.classList.remove('active'));
  bookingForm.reset();

  const btn = document.getElementById('booking-submit');
  btn.disabled  = false;
  btn.textContent = 'Foglalás elküldése';

  renderCalendar();
  renderSlots();
  hideForms();

  document.getElementById('foglalas').scrollIntoView({ behavior: 'smooth' });
});

/* ─── Inicializálás ───────────────────────────────────────────── */
renderCalendar();
renderSlots();
