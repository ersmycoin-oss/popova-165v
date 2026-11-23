(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  // Header state
  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Count-up numbers
  const format = (value, decimals) => {
    const [int, frac] = value.toFixed(decimals).split('.');
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (frac ? `,${frac}` : '');
  };

  const countUp = (el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = Number(el.dataset.decimals || 0);
    if (reduced) return;
    const start = performance.now();
    const duration = 1400;
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      el.textContent = format(target * (1 - Math.pow(1 - t, 3)), decimals);
      if (t < 1) requestAnimationFrame(tick);
    };
    el.textContent = format(0, decimals);
    requestAnimationFrame(tick);
  };

  // Reveal on scroll with stagger inside each batch
  const revealed = (el) => {
    el.classList.add('is-in');
    el.querySelectorAll('[data-count]').forEach(countUp);
  };
  const targets = document.querySelectorAll('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries
        .filter((e) => e.isIntersecting)
        .forEach((e, i) => {
          e.target.style.setProperty('--i', Math.min(i, 6));
          revealed(e.target);
          io.unobserve(e.target);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    targets.forEach((el) => io.observe(el));
  }

  // Active nav link
  const links = [...document.querySelectorAll('nav a')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    const navIo = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${e.target.id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => navIo.observe(s));
  }

  // Parallax on the full-width band
  const band = document.querySelector('.band');
  if (band && !reduced) {
    let queued = false;
    const update = () => {
      queued = false;
      const r = band.getBoundingClientRect();
      const p = 1 - (r.top + r.height) / (innerHeight + r.height);
      band.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
    };
    addEventListener('scroll', () => {
      if (!queued) { queued = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  // Animated accordions
  document.querySelectorAll('details').forEach((details) => {
    const summary = details.querySelector('summary');
    const body = details.querySelector('.details-body');
    summary.addEventListener('click', (event) => {
      if (reduced || !body.animate) return;
      event.preventDefault();
      if (details.open) {
        const anim = body.animate([{ height: `${body.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.2,.75,.25,1)' });
        details.classList.add('is-closing');
        anim.onfinish = () => { details.open = false; details.classList.remove('is-closing'); };
      } else {
        details.open = true;
        body.animate([{ height: '0px', opacity: 0 }, { height: `${body.offsetHeight}px`, opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.75,.25,1)' });
      }
    });
  });

  // Mobile call dock: shown after the hero, hidden near the contact block
  const dock = document.querySelector('.dock');
  const hero = document.querySelector('.hero');
  const contact = document.querySelector('#contact');
  if (dock && hero && contact && 'IntersectionObserver' in window) {
    const seen = { hero: true, contact: false };
    const sync = () => {
      const show = !seen.hero && !seen.contact && !root.classList.contains('lb-open');
      dock.classList.toggle('is-visible', show);
      dock.inert = !show;
    };
    new IntersectionObserver((entries) => {
      entries.forEach((e) => { seen[e.target === hero ? 'hero' : 'contact'] = e.isIntersecting; });
      sync();
    }).observe(hero);
    new IntersectionObserver((entries) => {
      entries.forEach((e) => { seen.contact = e.isIntersecting; });
      sync();
    }).observe(contact);
  }

  // Lightbox
  const dialog = document.querySelector('.lightbox');
  const items = [...document.querySelectorAll('.ph[data-full]')];
  if (!dialog || !items.length || typeof dialog.showModal !== 'function') return;

  const img = dialog.querySelector('.lb-stage img');
  const caption = dialog.querySelector('.lb-caption');
  const counter = dialog.querySelector('.lb-count');
  const stage = dialog.querySelector('.lb-stage');
  let index = 0;
  let opener = null;

  const preload = (i) => { new Image().src = items[(i + items.length) % items.length].dataset.full; };

  const render = () => {
    const item = items[index];
    const thumb = item.querySelector('img');
    img.src = item.dataset.full;
    img.alt = thumb.alt;
    caption.textContent = thumb.alt;
    counter.textContent = `${index + 1} / ${items.length}`;
    preload(index + 1);
    preload(index - 1);
  };

  const go = (step) => {
    index = (index + step + items.length) % items.length;
    if (reduced) { render(); return; }
    dialog.style.setProperty('--dir', step);
    dialog.classList.add('is-switching');
    setTimeout(() => {
      render();
      const shown = () => dialog.classList.remove('is-switching');
      img.decode ? img.decode().then(shown, shown) : shown();
    }, 180);
  };

  const open = (i, trigger) => {
    index = i;
    opener = trigger;
    render();
    dialog.showModal();
    root.classList.add('lb-open');
    root.style.overflow = 'hidden';
    requestAnimationFrame(() => dialog.classList.add('is-open'));
  };

  const close = () => {
    dialog.classList.remove('is-open');
    const done = () => {
      dialog.close();
      root.classList.remove('lb-open');
      root.style.overflow = '';
      opener?.focus({ preventScroll: true });
    };
    reduced ? done() : setTimeout(done, 300);
  };

  items.forEach((item, i) => item.addEventListener('click', () => open(i, item)));
  dialog.querySelector('.lb-close').addEventListener('click', close);
  dialog.querySelector('.lb-prev').addEventListener('click', () => go(-1));
  dialog.querySelector('.lb-next').addEventListener('click', () => go(1));
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') go(1);
    if (event.key === 'ArrowLeft') go(-1);
  });
  let startX = null;
  let startY = null;
  let swiped = false;
  stage.addEventListener('click', (event) => {
    if (swiped) { swiped = false; return; }
    if (event.target === stage) close();
  });
  stage.addEventListener('pointerdown', (event) => { startX = event.clientX; startY = event.clientY; });
  stage.addEventListener('pointerup', (event) => {
    if (startX === null) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    startX = null;
    swiped = Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy);
    if (swiped) go(dx < 0 ? 1 : -1);
  });
})();
