/* Midnight Children Records: site behaviour. No inline scripts (CSP: script-src 'self'). */
(() => {
  'use strict';

  // Header: solid background after scroll
  const header = document.querySelector('[data-header]');
  const onScroll = () => header && header.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile nav
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  const setNav = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
  };
  if (toggle && nav) {
    toggle.addEventListener('click', () => setNav(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });
  }

  // Release catalogue filters (artist, year). Without JS every release is simply listed.
  const form = document.querySelector('[data-filters]');
  const list = document.querySelector('[data-filter-list]');
  if (form && list) {
    const items = [...list.querySelectorAll('.release')];
    const count = form.querySelector('[data-filter-count]');
    const empty = document.querySelector('[data-filter-empty]');
    const params = new URLSearchParams(location.search);
    for (const name of ['artist', 'year']) {
      const v = params.get(name);
      if (v && [...form.elements[name].options].some((o) => o.value === v)) form.elements[name].value = v;
    }
    const apply = () => {
      const artist = form.elements.artist.value;
      const year = form.elements.year.value;
      let shown = 0;
      for (const li of items) {
        const ok = (!artist || li.dataset.artists.split(' ').includes(artist)) && (!year || li.dataset.year === year);
        li.hidden = !ok; if (ok) shown++;
      }
      count.textContent = `${shown} of ${items.length} releases`;
      if (empty) empty.hidden = shown > 0;
      const q = new URLSearchParams();
      if (artist) q.set('artist', artist);
      if (year) q.set('year', year);
      history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
    };
    form.hidden = false;
    form.addEventListener('change', apply);
    form.addEventListener('submit', (e) => e.preventDefault());
    apply();
  }

  // Countdown to the next event (start time is in SAST in data-start, e.g. 2026-12-05T21:00:00+02:00).
  document.querySelectorAll('[data-countdown]').forEach((box) => {
    const start = Date.parse(box.dataset.start || '');
    if (Number.isNaN(start)) return;
    const out = (k) => box.querySelector(`[data-cd="${k}"]`);
    const text = box.querySelector('[data-cd-text]');
    const pad = (n) => String(n).padStart(2, '0');
    let timer = 0;
    const tick = () => {
      const left = start - Date.now();
      if (left <= 0) {
        box.classList.add('is-live');
        ['d', 'h', 'm', 's'].forEach((k) => { const el = out(k); if (el) el.textContent = '00'; });
        if (text) text.textContent = 'Happening now';
        clearInterval(timer);
        return;
      }
      const d = Math.floor(left / 86400e3), h = Math.floor(left / 3600e3) % 24, m = Math.floor(left / 60e3) % 60, s = Math.floor(left / 1e3) % 60;
      out('d').textContent = pad(d); out('h').textContent = pad(h); out('m').textContent = pad(m); out('s').textContent = pad(s);
    };
    tick();
    timer = setInterval(tick, 1000);
  });

  // Events calendar: one month at a time with previous / next. Without JS all months are listed.
  const cal = document.querySelector('[data-calendar]');
  if (cal) {
    const months = [...cal.querySelectorAll('[data-cal-month]')];
    const navBox = document.querySelector('[data-cal-nav]');
    const prev = document.querySelector('[data-cal-prev]');
    const next = document.querySelector('[data-cal-next]');
    const now = new Date();
    const todayIso = new Date(now.getTime() + 2 * 3600e3).toISOString().slice(0, 10); // SAST
    cal.querySelectorAll(`[data-cal-date="${todayIso}"]`).forEach((td) => { td.classList.add('cal-day--today'); td.setAttribute('aria-current', 'date'); });
    cal.querySelectorAll('[data-cal-date]').forEach((td) => { if (td.dataset.calDate < todayIso) td.classList.add('cal-day--past'); });
    // Open on the month of the next event; otherwise on this month.
    const nextDay = [...cal.querySelectorAll('.cal-day--event[data-cal-date]')].map((td) => td.dataset.calDate).find((d) => d >= todayIso);
    const startMonth = (nextDay || todayIso).slice(0, 7);
    let i = months.findIndex((m) => m.dataset.calMonth === startMonth);
    if (i < 0) i = Math.max(0, months.findIndex((m) => m.dataset.calMonth === todayIso.slice(0, 7)));
    const show = () => {
      months.forEach((m, j) => { m.hidden = j !== i; });
      prev.disabled = i === 0; next.disabled = i === months.length - 1;
    };
    if (months.length > 1) {
      cal.classList.add('is-paged');
      navBox.hidden = false;
      prev.addEventListener('click', () => { if (i > 0) { i--; show(); } });
      next.addEventListener('click', () => { if (i < months.length - 1) { i++; show(); } });
      show();
    }
  }

  // Booking form: preselect from links like /contact/?topic=booking&artist=timo-odv, and show booking fields only for bookings.
  const contact = document.querySelector('[data-contact-form]');
  if (contact) {
    const q = new URLSearchParams(location.search);
    const set = (name, v) => { const el = contact.elements[name]; if (v && el && [...el.options].some((o) => o.value === v)) el.value = v; };
    set('topic', q.get('topic')); set('artist', q.get('artist'));
    const toggle = () => {
      const booking = ['booking', 'showcase'].includes(contact.elements.topic.value);
      contact.querySelectorAll('[data-booking-only]').forEach((el) => { el.hidden = !booking; });
    };
    contact.elements.topic.addEventListener('change', toggle);
    toggle();
  }
})();
