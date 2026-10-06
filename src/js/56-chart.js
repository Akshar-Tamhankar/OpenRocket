/* =====================================================================
   Thrust chart for the data section (owned by the data-section work).
   Plain top-level code; runs after 10-ui.js and 55-strip.js are defined.
   v3's chart window on the v4 burn clock: all three mixes on one set of
   axes, the selected one glowing and lit up to the moment on the stand,
   its frame dots, and a crosshair on that moment. Dragging or tapping the
   chart moves the same clock as the film strip, so the readout, the strip
   and the motor follow it. A shaded band marks the span of the burn the
   film strip shows under it, so the strip reads as a magnified slice of
   this time axis. Built in CSS pixels, rebuilt when it resizes.
   ===================================================================== */
BURN_UI.chart = (() => {
  const svg = $('#chart'), win = $('#win');
  if (!svg) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const TMAX = Math.ceil(Math.max(...Object.values(FORMS).map(f => f.end)) / .25) * .25, FMAX = 140;
  let W = 0, H = 0, M = { l: 32, r: 8, t: 14, b: 20 }, cur = sel, lastT = 0, lastI = -1, els = null;
  const X = t => M.l + t / TMAX * (W - M.l - M.r), Y = F => H - M.b - F / FMAX * (H - M.t - M.b);
  const pathOf = f => 'M' + f.pts.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('L');
  function build() {
    const r = svg.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    if (W < 40 || H < 40) return false;
    const small = H < 130;
    M = { l: 32, r: 8, t: small ? 8 : 14, b: small ? 17 : 20 };
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let s = `<defs><clipPath id="chReveal"><rect id="chRevealR" x="0" y="-10" width="0" height="${H + 20}"></rect></clipPath>
      <filter id="chGlow" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="3" result="b"></feGaussianBlur><feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter></defs>`;
    const fStep = small ? 40 : 20;
    for (let F = 0; F <= FMAX; F += fStep) s += `<line class="${F ? 'cg' : 'cb'}" x1="${M.l}" x2="${W - M.r}" y1="${Y(F).toFixed(1)}" y2="${Y(F).toFixed(1)}"></line><text class="chart-ax" x="${M.l - 7}" y="${(Y(F) + 3.5).toFixed(1)}" text-anchor="end">${F}</text>`;
    const tStep = W < 360 ? .5 : .25;
    for (let t = 0; t <= TMAX + 1e-6; t += tStep) s += `<line class="cg" x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${M.t}" y2="${H - M.b}"></line><text class="chart-ax" x="${X(t).toFixed(1)}" y="${H - M.b + 13}" text-anchor="${t ? (t >= TMAX - 1e-6 ? 'end' : 'middle') : 'start'}">${t.toFixed(2)}</text>`;
    s += `<rect class="ch-span" id="chSpan" x="${M.l}" y="${M.t}" width="0" height="${H - M.t - M.b}"></rect>`;
    s += `<text class="chart-ax k" x="${M.l + 6}" y="${M.t + 10}">Thrust (N)</text><text class="chart-ax k" x="${W - M.r - 4}" y="${M.t + 10}" text-anchor="end">Time (s)</text>`;
    for (const k in FORMS) s += `<path class="series s-${k}" id="chP-${k}" d="${pathOf(FORMS[k])}"></path>`;
    // the selected mix again, lit up to the moment on the stand
    s += `<g clip-path="url(#chReveal)"><path class="series" id="chLit" filter="url(#chGlow)"></path></g><g class="ch-dots" id="chDots"></g>`;
    s += `<g class="cross" id="chCross"><line id="chX" y1="${M.t}" y2="${H - M.b}"></line><circle id="chDot" r="4.5"></circle></g>`;
    svg.innerHTML = s;
    els = { span: $('#chSpan', svg), reveal: $('#chRevealR', svg), lit: $('#chLit', svg), dots: $('#chDots', svg), cx: $('#chX', svg), dot: $('#chDot', svg), cross: $('#chCross', svg) };
    lastI = -1; select(cur, true); at(lastT, -1);
    return true;
  }
  function select(k, force) {
    if (k === cur && !force) return;
    cur = k; lastI = -1;
    if (!els) return;
    const f = FORMS[k];
    for (const j in FORMS) { const p = $('#chP-' + j, svg); p.style.opacity = j === k ? .4 : .26; p.style.strokeWidth = j === k ? 1.5 : 1.3; }
    els.lit.setAttribute('class', `series s-${k}`); els.lit.setAttribute('d', pathOf(f)); els.lit.style.strokeWidth = 2.6;
    els.dots.innerHTML = f.pts.map(p => `<circle class="dot-${k}" cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.3"></circle>`).join('');
    els.dot.setAttribute('stroke', `var(${f.col})`);
  }
  // the moment on the stand: t in seconds of burn, i the frame being read
  function at(t, i) {
    lastT = t; if (!els) return;
    const f = FORMS[cur], tc = clamp(t, 0, f.end), x = X(tc), F = thrustAt(f, tc);
    els.reveal.setAttribute('width', Math.max(0, x + .5).toFixed(1));
    els.cx.setAttribute('x1', x.toFixed(1)); els.cx.setAttribute('x2', x.toFixed(1));
    els.dot.setAttribute('cx', x.toFixed(1)); els.dot.setAttribute('cy', Y(F).toFixed(1));
    // the slice of the burn the film strip is showing
    const hf = BURN_UI.strip && BURN_UI.strip.half ? BURN_UI.strip.half() / f.fps : 0;
    if (hf > 0) { const x0 = Math.max(M.l, X(tc - hf)), x1 = Math.min(W - M.r, X(tc + hf)); els.span.setAttribute('x', x0.toFixed(1)); els.span.setAttribute('width', Math.max(0, x1 - x0).toFixed(1)); }
    if (i < 0) i = clamp(Math.round(tc * f.fps), 0, f.pts.length - 1);
    if (i !== lastI) { lastI = i; const ds = els.dots.children; for (let j = 0; j < ds.length; j++) ds[j].classList.toggle('ahead', j > i); }
  }
  // scrub: a drag holds the clock under the pointer (the strip and the motor follow), a tap eases to that frame
  const tAt = clientX => { const r = svg.getBoundingClientRect(); return clamp((clientX - r.left - M.l) / Math.max(1, r.width - M.l - M.r) * TMAX, 0, FORMS[sel].end); };
  let drag = null;
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
  });
  svg.addEventListener('pointermove', e => {
    const d = drag; if (!d || e.pointerId !== d.id) return;
    if (!d.moved) {
      const dx = e.clientX - d.x0;
      if (Math.abs(dx) < 4 || Math.abs(dx) < Math.abs(e.clientY - d.y0)) return;
      d.moved = true; try { svg.setPointerCapture(e.pointerId); } catch (err) { /* released */ }
    }
    const f = FORMS[sel], t = tAt(e.clientX);
    if (BURN_UI.strip) BURN_UI.strip.hold(t * f.fps); else holdBurn(t);
  });
  const end = (e, cancelled) => {
    const d = drag; if (!d || e.pointerId !== d.id) return; drag = null;
    const f = FORMS[sel], i = clamp(Math.round(tAt(e.clientX) * f.fps), 0, f.pts.length - 1);
    if (cancelled && !d.moved) return;
    if (BURN_UI.strip) BURN_UI.strip.glideTo(i); else holdBurn(f.pts[i][0]);
  };
  svg.addEventListener('pointerup', e => end(e, false));
  svg.addEventListener('pointercancel', e => end(e, true));
  // the glass catches the light where the pointer is, and leans a little toward it
  if (fine && win && !reduce) {
    win.addEventListener('pointermove', e => {
      const r = win.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      win.style.setProperty('--gx', (px * 100).toFixed(1) + '%'); win.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
      win.style.setProperty('--rx', ((.5 - py) * 2.4).toFixed(2) + 'deg'); win.style.setProperty('--ry', ((px - .5) * 3).toFixed(2) + 'deg');
    });
    win.addEventListener('pointerleave', () => { win.style.setProperty('--rx', '0deg'); win.style.setProperty('--ry', '0deg'); });
  }
  if (window.ResizeObserver) new ResizeObserver(() => { const r = svg.getBoundingClientRect(); if (Math.round(r.width) !== W || Math.round(r.height) !== H) build(); }).observe(svg);
  else addEventListener('resize', build);
  build();
  return { select, at, build };
})();
