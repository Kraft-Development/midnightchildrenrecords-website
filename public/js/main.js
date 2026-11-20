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
})();
