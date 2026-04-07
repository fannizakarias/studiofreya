/* ═══════════════════════════════════════════════════════════════════
   Studio Freya — főscript
   ═══════════════════════════════════════════════════════════════════ */

/* ─── Év a láblécben ──────────────────────────────────────────── */
document.getElementById('year').textContent = new Date().getFullYear();

/* ─── Fejléc árnyék görgetéskor ──────────────────────────────── */
const header = document.querySelector('.site-header');
const hero   = document.querySelector('.hero');
let scrollThreshold = hero ? hero.offsetHeight * 0.85 : window.innerHeight * 0.85;
window.addEventListener('resize', () => {
  scrollThreshold = hero ? hero.offsetHeight * 0.85 : window.innerHeight * 0.85;
}, { passive: true });
window.addEventListener('scroll', () => {
  if (!navLinks.classList.contains('open')) {
    header.classList.toggle('scrolled', window.scrollY > scrollThreshold);
  }
}, { passive: true });

/* ─── Mobil navigáció ─────────────────────────────────────────── */
const toggle   = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
toggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
  if (open) {
    header.classList.add('scrolled');
  } else {
    header.classList.toggle('scrolled', window.scrollY > scrollThreshold);
  }
});
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    toggle.setAttribute('aria-expanded', false);
    header.classList.toggle('scrolled', window.scrollY > scrollThreshold);
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
    jumpToEarliestAvailable();
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

// 0=V, 1=H, 2=K, 3=Sze, 4=Cs, 5=P, 6=Szo
const ALLOWED_DAYS = new Set([0, 1, 3, 5, 6]); // V, H, Sze, P, Szo
const FANNI_DAYS   = new Set([0, 6]);            // V, Szo
const MIN_HOUR = 8;
const MAX_HOUR = 18;

const st = {
  withFanni: false,
  hours:   null,
  price:   null,
  label:   null,
  desc:    null,    // csomag leírás (Fanni módban)
  date:    null,
  dateStr: null,
  hour:    null,
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
};

function jumpToEarliestAvailable() {
  const today   = new Date(); today.setHours(0,0,0,0);
  const daySet  = st.withFanni ? FANNI_DAYS : ALLOWED_DAYS;
  const hours   = st.hours || 1;

  const earliest = Object.keys(SZABAD)
    .map(ds => new Date(ds))
    .filter(d => d >= today && daySet.has(d.getDay()) && hasAvail(toDateStr(d), hours))
    .sort((a, b) => a - b)[0];

  if (earliest) {
    st.calYear  = earliest.getFullYear();
    st.calMonth = earliest.getMonth();
  }
}

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

/* ── Stúdió ár számítás ───────────────────────────────────────── */
function calcStudioPrice(hours) {
  return 10000 + (hours - 1) * 8000;
}

/* ── Szabad órák egy napra + időtartamra ──────────────────────── */
function getSzabadOrak(dateStr, hours) {
  const szabad  = (SZABAD[dateStr]  || [])
    .filter(h => h >= MIN_HOUR && h + hours <= MAX_HOUR)
    .slice().sort((a,b) => a-b);
  const foglalt = (FOGLALT[dateStr] || []);

  return szabad
    .filter(h => {
      for (let i = 0; i < hours; i++) {
        if (!szabad.includes(h + i)) return false;
      }
      return true;
    })
    .map(h => ({
      hour:  h,
      taken: Array.from({length: hours}, (_, i) => h + i).some(hh => foglalt.includes(hh)),
    }));
}

/* ── Van-e a napnak bármilyen szabad (nem foglalt) időpontja? ─── */
function hasAvail(dateStr, hours) {
  return getSzabadOrak(dateStr, hours).some(s => !s.taken);
}

/* ═══════════════════════════════════════════════════════════════════
   MÓDVÁLASZTÓ (stúdió / Fanni)
   ═══════════════════════════════════════════════════════════════════ */
document.querySelectorAll('.bk-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.bk-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    st.withFanni = btn.dataset.mode === 'fanni';

    document.getElementById('bk-duration-bar').hidden = st.withFanni;
    document.getElementById('bk-packages').hidden     = !st.withFanni;
    document.getElementById('bk-pkg-note').hidden     = !st.withFanni;

    // Szelekció nullázása
    Object.assign(st, { hours: null, price: null, label: null, desc: null,
                        date: null, dateStr: null, hour: null });
    document.querySelectorAll('.bk-pkg-btn').forEach(b => b.classList.remove('active'));
    hideForms();
    updateFeltetelek();
    jumpToEarliestAvailable();
    renderCalendar();
    renderSlots();
  });
});


/* ═══════════════════════════════════════════════════════════════════
   CSOMAG VÁLASZTÓ (Fanni módban)
   ═══════════════════════════════════════════════════════════════════ */
document.querySelectorAll('.bk-pkg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.bk-pkg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    st.hours = Number(btn.dataset.hours);
    st.price = Number(btn.dataset.price);
    st.label = btn.dataset.label;
    st.desc  = btn.dataset.desc || null;
    st.hour  = null;
    hideForms();
    updatePriceDisplay();
    renderCalendar();
    if (st.dateStr) renderSlots();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   NAPTÁR
   ═══════════════════════════════════════════════════════════════════ */
function renderCalendar() {
  const { calYear: yr, calMonth: mo } = st;
  document.getElementById('cal-month-label').textContent = `${yr} ${HONAPOK[mo]}`;

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
    const isPast   = date < today;
    const daySet   = st.withFanni ? FANNI_DAYS : ALLOWED_DAYS;
    const isAllowed = daySet.has(date.getDay());

    const el       = document.createElement('div');
    const numSpan  = document.createElement('span');
    numSpan.className = 'bk-day-num';
    numSpan.textContent = d;
    el.appendChild(numSpan);

    el.className = 'bk-cal-day';

    if (date.getTime() === today.getTime()) el.classList.add('bk-cal-day--today');

    if (isPast || !isAllowed) {
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
const SLOT_PLACEHOLDER = `
  <div class="bk-slots-placeholder">
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    <p>Kattints egy zöld pontos napra<br>az elérhető időpontok megtekintéséhez</p>
  </div>`;

function renderSlots() {
  const container = document.getElementById('time-slots');
  const header    = document.getElementById('slots-header');
  container.innerHTML = '';

  if (!st.dateStr) {
    header.innerHTML = '<span class="bk-slots-title">Válassz napot a naptárból</span>';
    container.innerHTML = SLOT_PLACEHOLDER;
    return;
  }

  header.innerHTML = `<span class="bk-slots-title">${fmtDateHU(st.date)}</span>`;

  if (st.withFanni) {
    if (!st.hours) {
      container.innerHTML = '<p class="bk-no-slots">Válassz csomagot a foglalás elején!</p>';
      return;
    }
    renderSlotsFanni(container);
  } else {
    renderSlotsStudio(container);
  }
}

/* ── Stúdió: egyéni 1 órás slotok, többes kijelölés ──────────── */
function renderSlotsStudio(container) {
  const slots = getSzabadOrak(st.dateStr, 1);

  if (slots.length === 0) {
    container.innerHTML = '<p class="bk-no-slots">Erre a napra nincs elérhető időpont.</p>';
    return;
  }

  slots.forEach(({ hour, taken }) => {
    const inRange  = st.hour !== null && hour >= st.hour && hour < st.hour + (st.hours || 0);
    const isExtend = !taken && st.hour !== null && hour === st.hour + (st.hours || 0)
                     && slots.some(s => s.hour === hour && !s.taken);

    const el = document.createElement('div');
    if (taken)         el.className = 'bk-slot bk-slot--taken';
    else if (inRange)  el.className = 'bk-slot bk-slot--selected';
    else if (isExtend) el.className = 'bk-slot bk-slot--free bk-slot--extend';
    else               el.className = 'bk-slot bk-slot--free';

    const labelText = taken ? 'Foglalt'
      : inRange   ? 'Kiválasztva'
      : isExtend  ? '+ bővítés'
      : 'Szabad';

    el.innerHTML = `
      <span class="bk-slot-dot"></span>
      <span class="bk-slot-time">${pad(hour)}:00 – ${pad(hour + 1)}:00</span>
      <span class="bk-slot-label">${labelText}</span>
    `;

    if (!taken) {
      el.addEventListener('click', () => {
        if (isExtend) {
          st.hours = (st.hours || 0) + 1;
        } else if (inRange) {
          if (st.hours <= 1) {
            // egyetlen kijelölt: töröl
            st.hour = null; st.hours = null; st.price = null; st.label = null;
          } else if (hour === st.hour + st.hours - 1) {
            // utolsó: csökkent
            st.hours--;
          } else if (hour === st.hour) {
            // első: előrébb lép
            st.hour++; st.hours--;
          } else {
            // közép: új kijelölés innen
            st.hour = hour; st.hours = 1;
          }
        } else {
          // új kijelölés
          st.hour = hour; st.hours = 1;
        }

        if (st.hour !== null) {
          st.price = calcStudioPrice(st.hours);
          st.label = `${st.hours} óra · ${st.price.toLocaleString('hu-HU')} Ft`;
        }

        renderSlots();
        updatePriceDisplay();
        if (st.hour !== null) showFormPanel();
        else hideForms();
      });
    }

    container.appendChild(el);
  });
}

/* ── Fanni: fix időtartam, egyszerű kijelölés ─────────────────── */
function renderSlotsFanni(container) {
  const slots = getSzabadOrak(st.dateStr, st.hours);

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
      <span class="bk-slot-time">${fmtHour(hour, st.hours)}</span>
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
  document.getElementById('hidden-duration').value = st.label || `${hours} óra`;
  document.getElementById('hidden-price').value    = st.price ? st.price.toLocaleString('hu-HU') + ' Ft' : '';
  document.getElementById('hidden-date').value     = st.dateStr ?? '';
  document.getElementById('hidden-time').value     = st.hour !== null ? `${pad(st.hour)}:00` : '';

  // Badge
  const badge = document.getElementById('bk-selection-badge');
  const timeLabel  = st.hour !== null ? fmtHour(st.hour, hours) : '—';
  const dateLabel = st.date
    ? st.date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
    : '—';

  badge.innerHTML = `
    ${dateLabel}
    <span class="bk-badge-sep"></span>
    ${timeLabel}
  `;

  const panel = document.getElementById('bk-form-panel');
  panel.hidden = false;
  updatePriceDisplay();
}

function hideForms() {
  document.getElementById('bk-form-panel').hidden = true;
  document.getElementById('bk-price-display').hidden = true;
}

function updatePriceDisplay() {
  const display = document.getElementById('bk-price-display');
  if (!st.price) { display.hidden = true; return; }
  display.hidden = false;

  const labelEl  = document.getElementById('bk-price-label');
  const amountEl = document.getElementById('bk-price-amount');

  if (st.withFanni && st.label) {
    // Fanni mód: "2. csomag" + leírás
    labelEl.innerHTML = `<strong>${st.label}</strong>${st.desc ? `<br><span>${st.desc}</span>` : ''}`;
  } else {
    // Stúdió mód: "X óra"
    labelEl.innerHTML = `<strong>${st.hours} óra</strong>`;
  }
  amountEl.textContent = st.price.toLocaleString('hu-HU') + ' Ft';
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

  if (!st.hours)        { alert(st.withFanni ? 'Kérlek válassz csomagot!' : 'Kérlek válassz időtartamot!'); return; }
  if (!st.dateStr)      { alert('Kérlek válassz dátumot!');     return; }
  if (st.hour === null) { alert('Kérlek válassz időpontot!');   return; }

  const btn = document.getElementById('booking-submit');
  btn.disabled  = true;
  btn.textContent = 'Küldés…';

  // Azonnali helyi frissítés (email és GitHub eredményétől függetlenül)
  if (!FOGLALT[st.dateStr]) FOGLALT[st.dateStr] = [];
  const bookedHours = st.hours === 2 ? [st.hour, st.hour + 1] : [st.hour];
  bookedHours.forEach(h => {
    if (!FOGLALT[st.dateStr].includes(h)) FOGLALT[st.dateStr].push(h);
  });

  // Email küldése (nem blokkoló — ha sikertelen, a foglalás akkor is elmegy)
  fetch('https://api.web3forms.com/submit', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      access_key: '9498e55b-f041-44fb-9f4a-b44b5019e0f6',
      subject:    `Új foglalás – ${st.dateStr} ${pad(st.hour)}:00`,
      from_name:  document.getElementById('b-nev').value,
      nev:        document.getElementById('b-nev').value,
      email:      document.getElementById('b-email').value,
      telefon:    document.getElementById('b-telefon').value,
      szemelyek:  document.getElementById('b-szemelyek').value,
      megjegyzes: document.getElementById('b-megjegyzes').value,
      idotartam:  `${st.hours} óra`,
      ar:         st.price ? st.price.toLocaleString('hu-HU') + ' Ft' : '',
      datum:      st.dateStr,
      idopont:    `${pad(st.hour)}:00 – ${pad(st.hour + st.hours)}:00`,
    }),
  }).catch(() => {});

  showSuccess();
});

function showSuccess() {
  document.querySelector('.bk-mode-bar').hidden      = true;
  document.querySelector('.bk-duration-bar').hidden  = true;
  document.getElementById('bk-packages').hidden      = true;
  document.getElementById('bk-pkg-note').hidden      = true;
  document.querySelector('.bk-main').hidden          = true;
  document.getElementById('bk-form-panel').hidden    = true;
  document.getElementById('booking-success').hidden  = false;
}

document.getElementById('booking-reset').addEventListener('click', () => {
  Object.assign(st, { withFanni: false, hours: null, price: null, label: null,
                      date: null, dateStr: null, hour: null });

  document.querySelectorAll('.bk-mode-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.getElementById('bk-duration-bar').hidden = false;
  document.getElementById('bk-packages').hidden     = true;
  document.querySelector('.bk-mode-bar').hidden      = false;
  document.querySelector('.bk-duration-bar').hidden  = false;
  document.querySelector('.bk-main').hidden          = false;
  document.getElementById('booking-success').hidden  = true;

  document.querySelectorAll('.bk-pkg-btn').forEach(b => b.classList.remove('active'));
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

/* ─── Fanni portfólió szűrő ──────────────────────────────────── */
document.querySelectorAll('[data-fanni-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-fanni-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const filter = btn.dataset.fanniFilter;
    document.querySelectorAll('.fanni-gallery-item').forEach(item => {
      item.hidden = item.dataset.fcat !== filter;
    });
  });
});

/* ─── "Csomagot foglalok" gomb ────────────────────────────────── */
document.getElementById('btn-with-fotos-pkg')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('foglalas').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => {
    document.querySelectorAll('.bk-mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === 'fanni');
    });
    st.withFanni = true;
    Object.assign(st, { hours: null, price: null, label: null,
                        date: null, dateStr: null, hour: null });
    document.getElementById('bk-duration-bar').hidden = true;
    document.getElementById('bk-packages').hidden     = false;
    document.querySelectorAll('.bk-pkg-btn').forEach(b => b.classList.remove('active'));
    hideForms();
    renderCalendar();
    renderSlots();
  }, 600);
});

/* ─── Adatkezelési tájékoztató modál ─────────────────────────── */
const privacyModal   = document.getElementById('privacy-modal');
const openPrivacyBtn = document.getElementById('open-privacy');
const closePrivacyBtn = document.getElementById('close-privacy');

function openPrivacyModal(e) {
  e && e.preventDefault();
  privacyModal.hidden = false;
  document.body.style.overflow = 'hidden';
  closePrivacyBtn.focus();
}

function closePrivacyModal() {
  privacyModal.hidden = true;
  document.body.style.overflow = '';
  openPrivacyBtn.focus();
}

openPrivacyBtn.addEventListener('click', openPrivacyModal);
closePrivacyBtn.addEventListener('click', closePrivacyModal);
document.getElementById('open-privacy-footer')?.addEventListener('click', openPrivacyModal);

privacyModal.addEventListener('click', (e) => {
  if (e.target === privacyModal) closePrivacyModal();
});

/* ─── ÁSZF modál ──────────────────────────────────────────────── */
function makeModal(overlayId, closeId, openIds) {
  const overlay  = document.getElementById(overlayId);
  const closeBtn = document.getElementById(closeId);
  const open  = () => { overlay.hidden = false; document.body.style.overflow = 'hidden'; closeBtn.focus(); };
  const close = () => { overlay.hidden = true;  document.body.style.overflow = ''; };
  openIds.forEach(id => document.getElementById(id)?.addEventListener('click', open));
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return close;
}

const closeAszf       = makeModal('aszf-modal',       'close-aszf',       ['open-aszf']);
const closeFootozas   = makeModal('fotozas-modal',    'close-fotozas',    ['open-fotozas']);
const closeImpresszum = makeModal('impresszum-modal', 'close-impresszum', ['open-impresszum']);

/* ── Feltételek checkbox — módtól függő ──────────────────────── */
function updateFeltetelek() {
  const btn  = document.getElementById('open-feltetelek-form');
  const cb   = document.getElementById('b-feltetelek');
  if (st.withFanni) {
    btn.textContent = 'Fotózási feltételeket';
    btn.onclick = (e) => { e.preventDefault(); document.getElementById('fotozas-modal').hidden = false; document.body.style.overflow = 'hidden'; };
  } else {
    btn.textContent = 'Bérlési feltételeket';
    btn.onclick = (e) => { e.preventDefault(); document.getElementById('aszf-modal').hidden = false; document.body.style.overflow = 'hidden'; };
  }
  cb.checked = false;
}
updateFeltetelek();

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!privacyModal.hidden)                               closePrivacyModal();
  if (!document.getElementById('aszf-modal').hidden)        closeAszf();
  if (!document.getElementById('fotozas-modal').hidden)     closeFootozas();
  if (!document.getElementById('impresszum-modal').hidden)  closeImpresszum();
  if (!document.getElementById('studio-lightbox').hidden)   lbClose();
});

/* ─── "Fotóst is kérek" gomb → Fanni módra vált ──────────────── */
document.getElementById('btn-with-fotos')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('foglalas').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => {
    document.querySelectorAll('.bk-mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === 'fanni');
    });
    st.withFanni = true;
    Object.assign(st, { hours: null, price: null, label: null,
                        date: null, dateStr: null, hour: null });
    document.getElementById('bk-duration-bar').hidden = true;
    document.getElementById('bk-packages').hidden     = false;
    document.querySelectorAll('.bk-pkg-btn').forEach(b => b.classList.remove('active'));
    hideForms();
    renderCalendar();
    renderSlots();
  }, 600);
});

/* ═══════════════════════════════════════════════════════════════════
   STUDIO LIGHTBOX
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  const lb       = document.getElementById('studio-lightbox');
  const lbImg    = document.getElementById('studio-lb-img');
  const backdrop = document.getElementById('studio-lb-backdrop');

  const imgs = Array.from(document.querySelectorAll('.studio-img img'));
  let current = 0;

  function lbOpen(idx) {
    current = idx;
    lbImg.src = imgs[idx].src;
    lbImg.alt = imgs[idx].alt;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('studio-lb-prev').hidden = imgs.length <= 1;
    document.getElementById('studio-lb-next').hidden = imgs.length <= 1;
  }

  window.lbClose = function () {
    lb.hidden = true;
    document.body.style.overflow = '';
    lbImg.src = '';
  };

  function lbStep(dir) {
    current = (current + dir + imgs.length) % imgs.length;
    lbImg.src = imgs[current].src;
    lbImg.alt = imgs[current].alt;
  }

  imgs.forEach((img, i) => img.addEventListener('click', () => lbOpen(i)));

  document.getElementById('studio-lb-close').addEventListener('click', lbClose);
  backdrop.addEventListener('click', lbClose);
  document.getElementById('studio-lb-prev').addEventListener('click', () => lbStep(-1));
  document.getElementById('studio-lb-next').addEventListener('click', () => lbStep(1));

  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'ArrowLeft')  lbStep(-1);
    if (e.key === 'ArrowRight') lbStep(1);
  });
})();
