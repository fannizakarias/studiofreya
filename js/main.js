/* ─── Év a láblécben ─────────────────────────────────────────────── */
document.getElementById('year').textContent = new Date().getFullYear();

/* ─── Fejléc árnyék görgetéskor ─────────────────────────────────── */
const header = document.querySelector('.site-header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

/* ─── Mobil navigáció ────────────────────────────────────────────── */
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
   IDŐPONTFOGLALÓ MODUL
   ═══════════════════════════════════════════════════════════════════

   FOGLALT időpontok szerkesztése: add hozzá a dátumokat és az
   adott napon foglalt órákat az alábbi objektumhoz.
   Formátum: 'ÉÉÉÉ-HH-NN': [kezdőóra, kezdőóra, ...]
   Példa: '2026-04-10': [9, 11, 14]
   ─────────────────────────────────────────────────────────────────*/
const FOGLALT = {
  // '2026-03-20': [10, 14],
  // '2026-03-25': [9, 10, 11, 13],
};

// Nyitvatartás: 9–17 óra, 1 órás intervallumok (utolsó kezdés: 16:00)
const NYITAS  = 9;
const ZARAS   = 17;

// Magyar hónapnevek
const HONAPOK = [
  'Január','Február','Március','Április','Május','Június',
  'Július','Augusztus','Szeptember','Október','November','December',
];

/* ── Állapot ────────────────────────────────────────────────────── */
const st = {
  service:  null,
  date:     null,   // Date
  dateStr:  null,   // 'ÉÉÉÉ-HH-NN'
  hour:     null,   // number (9–16)
  calYear:  new Date().getFullYear(),
  calMonth: new Date().getMonth(),
};

/* ── Segédfüggvények ────────────────────────────────────────────── */
function pad(n) { return String(n).padStart(2, '0'); }

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatHour(h) {
  return `${pad(h)}:00 – ${pad(h + 1)}:00`;
}

function formatDateHU(d) {
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

/* ══════════════════════════════════════════════════════════════════
   SZOLGÁLTATÁS
   ══════════════════════════════════════════════════════════════════ */
document.querySelectorAll('.bk-svc-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.bk-svc-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    st.service = btn.dataset.value;
    updateBadge();
  });
});

/* ══════════════════════════════════════════════════════════════════
   NAPTÁR
   ══════════════════════════════════════════════════════════════════ */
function renderCalendar() {
  const { calYear: yr, calMonth: mo } = st;

  document.getElementById('cal-month-label').textContent = `${HONAPOK[mo]} ${yr}`;

  const grid    = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const firstDay = new Date(yr, mo, 1);
  const lastDay  = new Date(yr, mo + 1, 0);

  // Hétfőtől számított eltolás
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

    const el = document.createElement('div');
    el.className = 'bk-cal-day';
    el.textContent = d;

    if (isPast || isSun) {
      el.classList.add('bk-cal-day--off');
    } else {
      if (date.getTime() === today.getTime()) el.classList.add('bk-cal-day--today');
      if (st.dateStr === dateStr)              el.classList.add('bk-cal-day--selected');

      el.addEventListener('click', () => {
        document.querySelectorAll('.bk-cal-day--selected')
          .forEach(x => x.classList.remove('bk-cal-day--selected'));
        el.classList.add('bk-cal-day--selected');

        st.date    = date;
        st.dateStr = dateStr;
        st.hour    = null;

        renderSlots();
        hideForms();
      });
    }

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

/* ══════════════════════════════════════════════════════════════════
   IDŐPONTOK
   ══════════════════════════════════════════════════════════════════ */
function renderSlots() {
  const header    = document.getElementById('slots-header');
  const container = document.getElementById('time-slots');
  container.innerHTML = '';

  if (!st.dateStr) {
    header.innerHTML = '<span class="bk-slots-title">Válassz napot a naptárból</span>';
    container.innerHTML = `
      <div class="bk-slots-placeholder">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>Kattints egy napra<br>az elérhető időpontok megtekintéséhez</p>
      </div>`;
    return;
  }

  header.innerHTML = `<span class="bk-slots-title">${formatDateHU(st.date)}</span>`;

  const foglaltOrak = FOGLALT[st.dateStr] || [];

  for (let h = NYITAS; h < ZARAS; h++) {
    const isTaken = foglaltOrak.includes(h);

    const el = document.createElement('div');
    el.className = `bk-slot bk-slot--${isTaken ? 'taken' : 'free'}`;
    if (!isTaken && st.hour === h) el.classList.add('bk-slot--selected');

    el.innerHTML = `
      <span class="bk-slot-dot"></span>
      <span class="bk-slot-time">${formatHour(h)}</span>
      <span class="bk-slot-label">${isTaken ? 'Foglalt' : 'Szabad'}</span>
    `;

    if (!isTaken) {
      el.addEventListener('click', () => {
        document.querySelectorAll('.bk-slot--selected')
          .forEach(s => s.classList.remove('bk-slot--selected'));
        el.classList.add('bk-slot--selected');
        st.hour = h;
        showFormPanel();
      });
    }

    container.appendChild(el);
  }
}

/* ══════════════════════════════════════════════════════════════════
   FORM PANEL
   ══════════════════════════════════════════════════════════════════ */
function showFormPanel() {
  updateBadge();
  document.getElementById('hidden-service').value = st.service ?? '';
  document.getElementById('hidden-date').value    = st.dateStr ?? '';
  document.getElementById('hidden-time').value    = st.hour !== null ? `${pad(st.hour)}:00` : '';

  const panel = document.getElementById('bk-form-panel');
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideForms() {
  document.getElementById('bk-form-panel').hidden = true;
}

function updateBadge() {
  const badge = document.getElementById('bk-selection-badge');
  if (!badge) return;

  const svc  = st.service  ? `<strong>${st.service}</strong>` : '–';
  const dat  = st.dateStr  ? st.date.toLocaleDateString('hu-HU', { month: 'long', day: 'numeric' }) : '–';
  const time = st.hour !== null ? `${pad(st.hour)}:00 – ${pad(st.hour + 1)}:00` : '–';

  badge.innerHTML = `${svc} &nbsp;·&nbsp; ${dat} &nbsp;·&nbsp; ${time}`;
}

// "Módosítás" gomb: form elrejtése, időpont nullázása
document.getElementById('bk-change-btn').addEventListener('click', () => {
  st.hour = null;
  document.querySelectorAll('.bk-slot--selected')
    .forEach(s => s.classList.remove('bk-slot--selected'));
  hideForms();
  document.getElementById('foglalas').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ══════════════════════════════════════════════════════════════════
   KÜLDÉS
   ══════════════════════════════════════════════════════════════════ */
const bookingForm = document.getElementById('booking-form');

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!st.service)         { alert('Kérlek válassz szolgáltatást!'); return; }
  if (!st.dateStr)         { alert('Kérlek válassz dátumot!'); return; }
  if (st.hour === null)    { alert('Kérlek válassz időpontot!'); return; }

  const submitBtn = document.getElementById('booking-submit');
  submitBtn.disabled  = true;
  submitBtn.textContent = 'Küldés…';

  try {
    const action = bookingForm.getAttribute('action');

    if (action.includes('YOUR_FORM_ID')) {
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
    alert('Hiba történt. Kérlek próbáld újra, vagy írj nekünk e-mailt!');
    submitBtn.disabled  = false;
    submitBtn.textContent = 'Foglalás elküldése';
  }
});

function showSuccess() {
  document.querySelector('.bk-main').hidden         = true;
  document.querySelector('.bk-service-bar').hidden  = true;
  document.getElementById('bk-form-panel').hidden   = true;
  document.getElementById('booking-success').hidden = false;
}

document.getElementById('booking-reset').addEventListener('click', () => {
  // Állapot reset
  Object.assign(st, { service: null, date: null, dateStr: null, hour: null });

  document.querySelector('.bk-main').hidden         = false;
  document.querySelector('.bk-service-bar').hidden  = false;
  document.getElementById('booking-success').hidden = true;

  document.querySelectorAll('.bk-svc-btn').forEach(b => b.classList.remove('active'));
  bookingForm.reset();

  const submitBtn = document.getElementById('booking-submit');
  submitBtn.disabled  = false;
  submitBtn.textContent = 'Foglalás elküldése';

  renderCalendar();
  renderSlots();
  hideForms();

  document.getElementById('foglalas').scrollIntoView({ behavior: 'smooth' });
});

/* ── Inicializálás ──────────────────────────────────────────────── */
renderCalendar();
renderSlots();
