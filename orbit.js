(() => {
  const hero = document.querySelector('.hero-orbit');
  if (!hero) return;

  const scene = hero.querySelector('.orbit-scene');
  const canvas = hero.querySelector('.orbit-canvas');
  const context = canvas.getContext('2d', { alpha: false });
  const controls = hero.querySelector('.orbit-controls');
  const toggle = hero.querySelector('.orbit-toggle');
  const range = hero.querySelector('.orbit-range');
  const caption = hero.querySelector('.orbit-caption');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const constrained = connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '');
  const small = matchMedia('(max-width: 850px)').matches || constrained;
  let playing = !reducedMotion.matches && !constrained;
  let canPrefetch = !constrained;
  let frames = [];
  let index = 0;
  let elapsed = 0;
  let pendingSeek = 0;
  let animation = 0;
  let previousTime = 0;
  let onScreen = false;
  let drag;
  let autoStarted = false;
  let width;
  let height;

  const wrap = position => (position + frames.length) % frames.length;

  function updatePlaybackLabel() {
    hero.classList.toggle('is-paused', !playing);
    const label = playing ? 'Приостановить фотообзор' : 'Запустить фотообзор';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }

  function updateViewLabel() {
    const text = frames[index].caption;
    caption.textContent = text;
    range.value = String(index);
    range.setAttribute('aria-valuetext', text);
    range.style.setProperty('--orbit-progress', `${index / (frames.length - 1) * 100}%`);
  }

  function draw() {
    const frame = frames[index];
    if (!frame?.image?.naturalWidth || !width || !height) return;

    const { image, duration, focusX, focusY } = frame;
    const progress = Math.min(elapsed / duration, 1);
    const still = reducedMotion.matches;
    // A single real photograph at every instant. Match cuts preserve edges
    // where the source cameras leave a gap in their coverage.
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) *
      (still ? 1 : 1.018 + progress * 0.022);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const drift = still ? 0 : width * (0.006 - 0.012 * progress);
    const left = Math.max(width - drawWidth, Math.min(0, width / 2 - drawWidth * focusX + drift));
    const top = Math.max(height - drawHeight, Math.min(0, height / 2 - drawHeight * focusY));
    context.drawImage(image, left, top, drawWidth, drawHeight);
  }

  function resize() {
    const bounds = scene.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function load(frame) {
    if (frame.promise) return frame.promise;
    frame.promise = (async () => {
      const image = new Image();
      image.src = small ? frame.small : frame.src;
      try {
        await image.decode();
        frame.image = image;
      } catch {
        frame.failed = true;
      }
    })();
    return frame.promise;
  }

  async function preload() {
    if (!canPrefetch || preload.started) return;
    preload.started = true;
    let next = 0;
    async function worker() {
      while (next < frames.length) await load(frames[next++]);
    }
    await Promise.all([worker(), worker()]);
  }

  function nextAvailable(start, direction) {
    for (let step = 1; step < frames.length; step++) {
      const candidate = wrap(start + step * direction);
      if (!frames[candidate].failed) return candidate;
    }
    return start;
  }

  function show(candidate) {
    index = candidate;
    elapsed = 0;
    updateViewLabel();
    draw();
  }

  function tick(time) {
    animation = 0;
    if (!playing || !onScreen || document.hidden) return;

    const delta = previousTime ? Math.min(time - previousTime, 100) : 0;
    previousTime = time;
    const current = frames[index];
    const candidate = nextAvailable(index, 1);
    elapsed = Math.min(elapsed + delta, current.duration);
    if (candidate !== index) {
      const upcoming = frames[candidate];
      if (elapsed === current.duration && upcoming.image) {
        show(candidate);
      } else {
        if (!upcoming.image) load(upcoming);
        if (!reducedMotion.matches) draw();
      }
    } else {
      playing = false;
      updatePlaybackLabel();
      return;
    }
    animation = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    if (animation) cancelAnimationFrame(animation);
    animation = 0;
    previousTime = 0;
    updatePlaybackLabel();
    if (frames.length && playing && onScreen && !document.hidden) {
      animation = requestAnimationFrame(tick);
    }
  }

  async function start() {
    pendingSeek++;
    playing = true;
    canPrefetch = true;
    updatePlaybackLabel();
    const neighbor = load(frames[nextAvailable(index, 1)]);
    preload();
    await neighbor;
    if (!playing) return;
    syncPlayback();
  }

  async function seek(candidate, direction) {
    playing = false;
    syncPlayback();
    const request = ++pendingSeek;
    while (candidate !== index) {
      const frame = frames[candidate];
      await load(frame);
      if (request !== pendingSeek) return;
      if (frame.image) {
        show(candidate);
        return;
      }
      candidate = nextAvailable(candidate, direction);
    }
    updateViewLabel();
  }

  async function initialize() {
    if (!context) return;
    try {
      const response = await fetch('assets/orbit/frames.json');
      if (!response.ok) return;
      const manifest = await response.json();
      if (manifest.length < 2) return;
      // Load the matching poster URL as a stable image, including after responsive
      // picture sources change. The browser reuses the poster request on a match.
      await load(manifest[0]);
      let first = 0;
      while (!manifest[first].image) {
        if (constrained || ++first === manifest.length) return;
        await load(manifest[first]);
      }
      frames = manifest;
      index = first;
    } catch {
      return;
    }

    range.max = String(frames.length - 1);
    range.disabled = false;
    controls.hidden = false;
    hero.classList.add('is-ready');
    resize();
    updateViewLabel();
    updatePlaybackLabel();

    new ResizeObserver(resize).observe(scene);
    new IntersectionObserver(([entry]) => {
      onScreen = entry.intersectionRatio >= 0.12;
      if (onScreen && playing && !autoStarted) {
        autoStarted = true;
        start();
      } else {
        syncPlayback();
      }
    }, { threshold: 0.12 }).observe(hero);
  }

  toggle.addEventListener('click', () => {
    if (playing) {
      playing = false;
      syncPlayback();
    } else {
      start();
    }
  });

  range.addEventListener('input', () => {
    const target = Number(range.value);
    seek(target, target >= index ? 1 : -1);
  });

  range.addEventListener('keydown', event => {
    const direction = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    seek(nextAvailable(index, direction), direction);
  });

  scene.addEventListener('pointerdown', event => {
    if (!frames.length || !event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: index, step: 0, active: false };
    scene.setPointerCapture(event.pointerId);
  });

  scene.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active && (Math.abs(dx) < 9 || Math.abs(dx) <= Math.abs(dy))) return;
    if (!drag.active) {
      drag.active = true;
      drag.start = index;
      playing = false;
      syncPlayback();
      scene.classList.add('is-dragging');
    }
    const step = Math.round(-dx / Math.max(35, width / frames.length));
    if (step === drag.step) return;
    const direction = step > drag.step ? 1 : -1;
    drag.step = step;
    const target = (drag.start + step % frames.length + frames.length) % frames.length;
    seek(target, direction);
  });

  function finishDrag() {
    drag = undefined;
    scene.classList.remove('is-dragging');
  }
  scene.addEventListener('pointerup', finishDrag);
  scene.addEventListener('pointercancel', finishDrag);
  scene.addEventListener('lostpointercapture', finishDrag);
  document.addEventListener('visibilitychange', syncPlayback);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) playing = false;
    draw();
    syncPlayback();
  });
  initialize();
})();
