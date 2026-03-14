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
   ═══════════════════════════════════════════════════════════════════ */

// ── Foglalt időpontok (YYYY-MM-DD → ['HH:MM', ...]) ──────────────
// Ide vehetitek fel a már foglalt időpontokat, vagy dinamikusan
// tölthetitek be egy API-ból.
const FOGLALT = {
  // Példa: '2026-03-20': ['10:00', '14:00'],
};

// ── Elérhető időpontok (minden munkanapon) ────────────────────────
const IDOPONTOK = [
  '09:00', '10:00', '11:00',
  '13:00', '14:00', '15:00', '16:00',
];

// ── Állapot ───────────────────────────────────────────────────────
const state = {
  service:  null,   // kiválasztott szolgáltatás
  date:     null,   // kiválasztott dátum (Date objektum)
  dateStr:  null,   // 'YYYY-MM-DD'
  time:     null,   // 'HH:MM'
  calYear:  null,
  calMonth: null,
};

// ── Magyar hónapnevek ─────────────────────────────────────────────
const HONAPOK = [
  'Január','Február','Március','Április','Május','Június',
  'Július','Augusztus','Szeptember','Október','November','December',
];

/* ── Naptár ────────────────────────────────────────────────────── */
function initCalendar() {
  const now = new Date();
  state.calYear  = now.getFullYear();
  state.calMonth = now.getMonth();
  renderCalendar();
}

function renderCalendar() {
  const { calYear: yr, calMonth: mo } = state;
  document.getElementById('cal-month-label').textContent =
    `${HONAPOK[mo]} ${yr}`;

  const grid  = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const today     = new Date();
  today.setHours(0, 0, 0, 0);
  const firstDay  = new Date(yr, mo, 1);
  const lastDay   = new Date(yr, mo + 1, 0);

  // Hétfőtől számított eltolás (0=H … 6=V)
  let offset = firstDay.getDay() - 1;
  if (offset < 0) offset = 6;

  // Üres cellák a hónap eleje előtt
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day cal-day--empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date    = new Date(yr, mo, d);
    const dateStr = toDateStr(date);
    const isToday = date.getTime() === today.getTime();
    const isPast  = date < today;
    const isSun   = date.getDay() === 0; // vasárnap zárva

    const el = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = d;

    if (isPast || isSun) {
      el.classList.add('cal-day--disabled');
    } else {
      if (isToday) el.classList.add('cal-day--today');
      if (state.dateStr === dateStr) el.classList.add('cal-day--selected');

      el.addEventListener('click', () => selectDate(date, dateStr, el));
    }

    grid.appendChild(el);
  }
}

function selectDate(date, dateStr, el) {
  state.date    = date;
  state.dateStr = dateStr;
  state.time    = null; // időpont nullázása dátumváltáskor

  // Vizuális frissítés
  document.querySelectorAll('.cal-day--selected')
    .forEach(d => d.classList.remove('cal-day--selected'));
  el.classList.add('cal-day--selected');

  renderTimeSlots();
  updateSummary();
}

document.getElementById('cal-prev').addEventListener('click', () => {
  state.calMonth--;
  if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
  renderCalendar();
});

document.getElementById('cal-next').addEventListener('click', () => {
  state.calMonth++;
  if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  renderCalendar();
});

/* ── Időpontok ─────────────────────────────────────────────────── */
function renderTimeSlots() {
  const container = document.getElementById('time-slots');
  container.innerHTML = '';

  if (!state.dateStr) {
    container.innerHTML = '<p class="time-slots-empty">Előbb válassz dátumot.</p>';
    return;
  }

  const foglalt = FOGLALT[state.dateStr] || [];

  IDOPONTOK.forEach(t => {
    const el = document.createElement('div');
    el.className = 'time-slot';
    el.textContent = t;

    if (foglalt.includes(t)) {
      el.classList.add('time-slot--taken');
      el.title = 'Foglalt';
    } else {
      if (state.time === t) el.classList.add('time-slot--selected');
      el.addEventListener('click', () => selectTime(t, el));
    }

    container.appendChild(el);
  });
}

function selectTime(t, el) {
  state.time = t;
  document.querySelectorAll('.time-slot--selected')
    .forEach(s => s.classList.remove('time-slot--selected'));
  el.classList.add('time-slot--selected');
  updateSummary();
}

/* ── Összefoglaló ──────────────────────────────────────────────── */
function updateSummary() {
  const summary = document.getElementById('booking-summary');

  if (!state.service && !state.dateStr && !state.time) {
    summary.classList.remove('visible');
    return;
  }

  const dateLabel = state.date
    ? state.date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  summary.innerHTML = `
    <strong>Foglalás összefoglalója</strong><br>
    Szolgáltatás: ${state.service ?? '—'}<br>
    Dátum: ${dateLabel}<br>
    Időpont: ${state.time ?? '—'}
  `;
  summary.classList.add('visible');

  // Rejtett mezők feltöltése
  document.getElementById('hidden-service').value = state.service ?? '';
  document.getElementById('hidden-date').value    = state.dateStr ?? '';
  document.getElementById('hidden-time').value    = state.time    ?? '';
}

/* ── Szolgáltatás kiválasztása ─────────────────────────────────── */
document.querySelectorAll('input[name="service"]').forEach(radio => {
  radio.addEventListener('change', () => {
    state.service = radio.value;
    updateSummary();
  });
});

/* ── Foglalás elküldése ────────────────────────────────────────── */
const bookingForm = document.getElementById('booking-form');

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!state.service) { alert('Kérlek válassz szolgáltatást!'); return; }
  if (!state.dateStr) { alert('Kérlek válassz dátumot!'); return; }
  if (!state.time)    { alert('Kérlek válassz időpontot!'); return; }

  const submitBtn = document.getElementById('booking-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Küldés...';

  try {
    const formData = new FormData(bookingForm);
    const action   = bookingForm.getAttribute('action');

    // Ha még nincs Formspree ID beállítva, csak szimuláljuk a küldést
    if (action.includes('YOUR_FORM_ID')) {
      await new Promise(r => setTimeout(r, 800)); // szimuláció
      showSuccess();
      return;
    }

    const res = await fetch(action, {
      method: 'POST',
      body: formData,
      headers: { 'Accept': 'application/json' },
    });

    if (res.ok) {
      showSuccess();
    } else {
      throw new Error('Hiba a küldés során.');
    }
  } catch {
    alert('Hiba történt a foglalás elküldésekor. Kérlek próbáld újra, vagy vedd fel velünk a kapcsolatot!');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Foglalás elküldése';
  }
});

function showSuccess() {
  document.querySelector('.booking-widget').querySelectorAll('.booking-step')
    .forEach(s => s.style.display = 'none');
  document.getElementById('booking-success').hidden = false;
}

document.getElementById('booking-reset').addEventListener('click', () => {
  // Állapot visszaállítása
  state.service = state.date = state.dateStr = state.time = null;

  document.querySelectorAll('input[name="service"]')
    .forEach(r => r.checked = false);

  document.querySelectorAll('.booking-step')
    .forEach(s => s.style.display = '');
  document.getElementById('booking-success').hidden = true;

  bookingForm.reset();
  document.getElementById('booking-summary').classList.remove('visible');

  const submitBtn = document.getElementById('booking-submit');
  submitBtn.disabled = false;
  submitBtn.textContent = 'Foglalás elküldése';

  renderCalendar();
  renderTimeSlots();
  window.scrollTo({ top: document.getElementById('foglalas').offsetTop - 80, behavior: 'smooth' });
});

/* ── Inicializálás ─────────────────────────────────────────────── */
initCalendar();
renderTimeSlots();
