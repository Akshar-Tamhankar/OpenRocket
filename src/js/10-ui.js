/* =====================================================================
   1. scroll, nav, menu, ruler, pause
   ===================================================================== */
let lenis = null;
if (!reduce && !TEST.noLenis && window.Lenis) {
  lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  if (G) { lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
  else { const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
}
function goTo(target, dur = 1.8) {
  const y = typeof target === 'number' ? target : docTop($(target));
  if (lenis) lenis.scrollTo(y, { duration: dur, easing: t => 1 - Math.pow(1 - t, 3) });
  else scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  const id = a.getAttribute('href'); if (id.length < 2 || !$(id)) return;
  e.preventDefault(); closeMenu(); goTo(id);
});
const menu = $('#menu'), menuBtn = $('#menuBtn');
function closeMenu() { if (!menu.hidden) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); lenis && lenis.start(); } }
menuBtn.addEventListener('click', () => { menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); lenis && lenis.stop(); $('#menuClose').focus(); });
$('#menuClose').addEventListener('click', () => { closeMenu(); menuBtn.focus(); });

// the page is a drawing set: each section is a sheet, and the ruler on the right names the one you're on
const SHEET_NAMES = { top: 'General arrangement', vehicle: 'Exploded assembly', data: 'Static test data', progress: 'Build sequence', log: 'Build log', crew: 'Crew', launch: 'Flight preview', contact: 'Launch window' };
const sheets = $$('[data-sheet]'), ruler = $('#ruler');
sheets.forEach((s, i) => {
  const b = document.createElement('button'), nm = SHEET_NAMES[s.id] || s.dataset.sheet, no = String(i + 1).padStart(2, '0');
  b.className = 'tick'; b.type = 'button';
  b.setAttribute('aria-label', `Sheet ${i + 1} of ${sheets.length}: ${nm}`);
  b.innerHTML = `<span><b>${no}</b>${nm}</span><i></i>`;
  b.addEventListener('click', () => goTo('#' + s.id));
  ruler.appendChild(b);
});
const ticks = $$('.tick', ruler);
// on entering a sheet the ruler names it ("04 Build sequence"), then settles back to its ticks
// one name at a time, and only the current sheet's: a late timer can never leave an old label behind
function sayTick(t, ms = 2800) {
  if (!t || t.getAttribute('aria-current') !== 'true') return;
  ticks.forEach(o => { if (o !== t) { clearTimeout(o._say); o.classList.remove('say'); } });
  t.classList.add('say'); clearTimeout(t._say);
  t._say = setTimeout(() => t.classList.remove('say'), ms);
}
{ const mo = new MutationObserver(ms => ms.forEach(m => { if (m.target.getAttribute('aria-current') === 'true') sayTick(m.target); }));
  ticks.forEach(t => mo.observe(t, { attributes: true, attributeFilter: ['aria-current'] })); }
$$('#menu a').forEach((a, i) => { const s = $(a.getAttribute('href')); a.dataset.no = String(s ? sheets.indexOf(s) + 1 : i + 1).padStart(2, '0'); });
// the sheet tops are read again twice a second, so a section that changed height after the first measure
// (late fonts, a pinned section, rows filled in by a module) can never leave the ruler naming a sheet you have left
setInterval(() => { if (MET.sheets && !document.hidden) MET.sheets = sheets.map(docTop); }, 500);

const pzBtn = $('#pz');
pzBtn.addEventListener('click', () => {
  state.paused = !state.paused;
  pzBtn.setAttribute('aria-pressed', String(state.paused));
  pzBtn.setAttribute('aria-label', state.paused ? 'Resume motion' : 'Pause motion');
  $('.lbl', pzBtn).textContent = state.paused ? 'Resume' : 'Pause';
  html.classList.toggle('paused', state.paused);
});

/* =====================================================================
   3. type: rolling nav links, typed code labels, decoding values
   ===================================================================== */
$$('.links a, .nav-cta').forEach(a => { const t = a.textContent; a.innerHTML = `<span class="roll"><span data-t="${t}">${t}</span></span>`; a.setAttribute('aria-label', t); });
// values (.dc) resolve out of glyph noise, left to right; code labels (.code, text in data-code) type themselves in.
// Both run once, when they first come into view. decode(el, txt) can also be called to swap a value in.
const GLYPHS = '0123456789#/<>_=+';
function decode(el, txt) {
  if (txt !== undefined) el.dataset.txt = txt;
  const T = el.dataset.txt ?? (el.dataset.txt = el.textContent);
  clearInterval(el._dc);
  if (reduce) { el.textContent = T; return; }
  let f = 0; const total = 14;
  el._dc = setInterval(() => {
    f++; const n = Math.floor(T.length * f / total);
    el.textContent = T.slice(0, n) + [...T.slice(n)].map(ch => ch === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]).join('');
    if (f >= total) { clearInterval(el._dc); el.textContent = T; }
  }, 32);
}
function typeIn(el, speed = 28) {
  const txt = el.dataset.code || ''; clearInterval(el._ty);
  if (reduce) { el.textContent = txt; return; }
  let i = 0; el.textContent = '';
  el._ty = setInterval(() => { el.textContent = txt.slice(0, ++i); if (i >= txt.length) clearInterval(el._ty); }, speed);
}
const decIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { decode(e.target); decIO.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
const typeIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { typeIn(e.target); typeIO.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
// watch a part of the page (the hero's labels wait for the intro)
function watchType(root = document) {
  $$('.code[data-code]', root).forEach(el => { if (el._tw || el.id === 'heroCode') return; el._tw = 1; typeIO.observe(el); });
  $$('.dc', root).forEach(el => { if (el._dw || el.closest('.hero')) return; el._dw = 1; decIO.observe(el); });
}
// the chemistry tiles follow the mix on the stand: its mass fractions decode in when it changes
const chemEls = $$('[data-chem]');
function showChem(btn, anim) {
  const r = ($('.ratio', btn) || btn).textContent.split('/').map(v => v.trim());
  chemEls.forEach(el => { const v = el.dataset.chem === 'ox' ? r[0] : r[1]; if (anim) decode(el, v); else { el.dataset.txt = v; el.textContent = v; } });
}
$$('.form').forEach(b => b.addEventListener('click', () => showChem(b, true)));
{ const b0 = $('.form[aria-pressed="true"]') || $('.form'); if (b0) showChem(b0, false); }

/* =====================================================================
   4. cursor: a crosshair that names what a drag will do, and magnetic buttons
   ===================================================================== */
const cursor = $('#cursor'), cLabel = $('#cursorLabel');
const ptr = { x: 0, y: 0, cx: innerWidth / 2, cy: innerHeight / 2 };
addEventListener('pointermove', e => { ptr.x = e.clientX / innerWidth * 2 - 1; ptr.y = e.clientY / innerHeight * 2 - 1; ptr.cx = e.clientX; ptr.cy = e.clientY; });
{ const st = $('#strip'); if (st && !st.dataset.cursor) st.dataset.cursor = 'Scrub the burn'; }
if (fine && G && !reduce) {
  html.classList.add('has-cursor');
  const qx = gsap.quickTo(cursor, 'x', { duration: .18, ease: 'power3' }), qy = gsap.quickTo(cursor, 'y', { duration: .18, ease: 'power3' });
  let lastT = null;
  addEventListener('pointermove', e => {
    qx(e.clientX); qy(e.clientY);
    if (!cursor._on) { cursor._on = 1; gsap.set(cursor, { x: e.clientX, y: e.clientY }); cursor.classList.add('on'); }
    const t = e.target; if (t === lastT) return; lastT = t;
    const hit = t.closest && t.closest('a,button,input,label,select,textarea');
    const zone = t.closest && t.closest('[data-cursor]');
    const lab = !hit && zone ? zone.dataset.cursor : '';
    cursor.classList.toggle('hover', !!hit);
    cursor.classList.toggle('label', !!lab);
    if (lab && cLabel.textContent !== lab) cLabel.textContent = lab;
  });
  addEventListener('pointerdown', () => cursor.classList.add('down'));
  addEventListener('pointerup', () => cursor.classList.remove('down'));
  document.addEventListener('pointerleave', () => cursor.style.opacity = 0);
  document.addEventListener('pointerenter', () => cursor.style.opacity = 1);
  // magnetic buttons: they lean toward the pointer and spring back
  $$('.btn, .replay').forEach(b => {
    const mx = gsap.quickTo(b, 'x', { duration: .6, ease: 'elastic.out(1,.5)' }), my = gsap.quickTo(b, 'y', { duration: .6, ease: 'elastic.out(1,.5)' });
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); mx((e.clientX - r.left - r.width / 2) * .28); my((e.clientY - r.top - r.height / 2) * .4); });
    b.addEventListener('pointerleave', () => { mx(0); my(0); });
  });
}

/* =====================================================================
   5. content: stages, thrust data, parts, flight sim
   ===================================================================== */
const STAGES = [
  { t: 'Design and simulation', d: 'Airframe drawn, stability checked in OpenRocket.', s: 'done', w: 'Done' },
  { t: 'Propellant tests', d: 'KNO3/sorbitol cast at 65/35, 60/40 and 70/30, thrust read frame by frame.', s: 'done', w: 'Done' },
  { t: 'Motor casing and nozzle', d: 'Casing, closures and nozzle built and pressure-tested.', s: 'active', w: 'In progress', f: .5 },
  { t: 'Static fire', d: 'Full-scale motor on the stand with a load cell.', s: 'queued', w: 'Up next' },
  { t: 'Airframe and avionics', d: 'Tubes, fins and the altimeter sled fit-checked.', s: 'queued', w: 'Queued' },
  { t: 'Recovery test', d: 'Ejection charge and parachute deployment on the ground.', s: 'queued', w: 'Queued' },
  { t: 'Launch', d: 'First flight at a club launch.', s: 'queued', w: 'Queued' },
];
const pctVal = Math.round(STAGES.reduce((a, s) => a + (s.s === 'done' ? 1 : s.s === 'active' ? s.f : 0), 0) / STAGES.length * 100);
$('#pct').textContent = pctVal; $$('.pct-text').forEach(e => e.textContent = pctVal + '%');

const FORMS = {
  a: { fps: 24, peak: 96, burn: 1.45, rise: .11, tail: .42, prog: -.14, seed: 3, col: '--flame' },
  b: { fps: 24, peak: 61, burn: 1.62, rise: .15, tail: .50, prog: -.22, seed: 7, col: '--chalk' },
  c: { fps: 15, peak: 117, burn: 1.12, rise: .08, tail: .32, prog: .06, seed: 11, col: '--steel' },
};
function shape(f, t) {
  if (t <= 0 || t >= f.burn) return 0;
  const r = 1 - Math.pow(1 - Math.min(1, t / f.rise), 3);
  const body = 1 + f.prog * clamp((t - f.rise) / (f.burn - f.rise) - .5, -.5, .5) * 2;
  const ts = f.burn - f.tail, tl = t > ts ? Math.pow(1 - (t - ts) / f.tail, 1.6) : 1;
  return r * (body + .12 * Math.exp(-Math.pow((t - f.rise) / .05, 2))) * tl;
}
const CLASSES = [['A', 2.5], ['B', 5], ['C', 10], ['D', 20], ['E', 40], ['F', 80], ['G', 160], ['H', 320], ['I', 640]];
for (const k in FORMS) {
  const f = FORMS[k], r = rng(f.seed), dt = 1 / f.fps;
  let m = 0; for (let t = 0; t <= f.burn; t += .002) m = Math.max(m, shape(f, t));
  const pts = [], n = Math.ceil((f.burn + .1) / dt);
  for (let i = 0; i <= n; i++) { const t = i * dt; let F = shape(f, t) / m * f.peak; if (F > 0) F += (r() - .5) * f.peak * .05; pts.push([t, Math.max(0, F)]); }
  let imp = 0; for (let i = 1; i < pts.length; i++) imp += (pts[i][0] - pts[i - 1][0]) * (pts[i][1] + pts[i - 1][1]) / 2;
  const peak = Math.max(...pts.map(p => p[1])), on = pts.filter(p => p[1] > peak * .05), burn = on[on.length - 1][0] - on[0][0];
  f.pts = pts; f.end = pts[pts.length - 1][0];
  f.stats = { peak, avg: imp / burn, burn, imp, cls: (CLASSES.find(c => imp <= c[1]) || ['J'])[0], frames: pts.filter(p => p[1] > 0).length };
}
const thrustAt = (f, t) => { if (t < 0) return 0; const i = t * f.fps, i0 = Math.floor(i), fr = i - i0; if (i0 >= f.pts.length - 1) return 0; return f.pts[i0][1] * (1 - fr) + f.pts[i0 + 1][1] * fr; };

const PARTS = [
  { no: '01', name: 'Nose cone', spec: [['Shape', 'Tangent ogive, 5:1'], ['Build', 'Printed PETG, carbon wrap'], ['Tip', 'Machined aluminum'], ['Mass', '180 g']] },
  { no: '02', name: 'Payload tube', spec: [['Tube', '98 mm fiberglass, 330 mm'], ['Holds', 'Main parachute, 1.2 m'], ['Retention', '3 nylon shear pins'], ['Mass', '260 g']] },
  { no: '03', name: 'Avionics bay', spec: [['Boards', 'Altimeter and GPS sled'], ['Power', '9 V, separate per channel'], ['Arming', 'Key switch on the band'], ['Mass', '310 g']] },
  { no: '04', name: 'Fin can', spec: [['Fins', '4 carbon, through-the-wall'], ['Mount', '38 mm motor tube, 3 rings'], ['Recovery', 'Drogue on a nylon harness'], ['Mass', '420 g']] },
  { no: '05', name: 'Motor', spec: [['Propellant', 'KNSB 65/35, cast in-house'], ['Casing', '38 mm aluminum'], ['Nozzle', 'Graphite, convergent-divergent'], ['Mass', '240 g loaded']] },
];

const SIM = (() => {
  const f = FORMS.a, m0 = 1.41, mp = .12, A = Math.PI * .049 * .049, Cd = .55, rho = 1.225, g = 9.81, dt = .004;
  const I = f.stats.imp; let t = 0, v = 0, h = 0, imp = 0; const H = [0], V = [0], Fs = [0];
  while (t < 60) {
    const F = thrustAt(f, t); imp += F * dt; const m = m0 - mp * Math.min(1, imp / I);
    const drag = .5 * rho * Cd * A * v * Math.abs(v);
    let a = (F - drag) / m - g; if (h <= 0 && a < 0) a = 0;
    v += a * dt; h = Math.max(0, h + v * dt); t += dt; H.push(h); V.push(v); Fs.push(F);
    if (t > f.end && v <= 0) break;
  }
  const apo = { t, h };
  return {
    apo, burn: f.end,
    at(tq) {
      if (tq <= 0) return { h: 0, v: 0, F: 0 };
      if (tq <= apo.t) { const i = tq / dt, i0 = Math.floor(i), fr = i - i0, i1 = Math.min(H.length - 1, i0 + 1), j = Math.min(H.length - 1, i0); return { h: lerp(H[j], H[i1], fr), v: lerp(V[j], V[i1], fr), F: lerp(Fs[j], Fs[i1], fr) }; }
      const td = tq - apo.t;
      return { h: Math.max(0, apo.h - (td < 1 ? 3 * td * td : 3 + 6 * (td - 1))), v: -(td < 1 ? 6 * td : 6), F: 0 };
    },
  };
})();
// Scroll to flight time: the count, a slow beat for ignition and the rail, then a pace that keeps the motion on
// screen even. A monotone cubic through the keys, so the clock never stalls, runs back or jumps.
// u: count to .1, igniter .1-.13, rail .13-.185, boost to .34, coast to .64, apogee and deployment to .74, descent.
const FL_KEYS = [[0, -6], [.065, -2.6], [.1, -.5], [.13, 0], [.185, .42], [.34, SIM.burn], [.5, 3.4], [.64, SIM.apo.t], [.74, SIM.apo.t + 1.9], [1, SIM.apo.t + 7.2]];
function monoKey(K, u) {
  const n = K.length;
  if (u <= K[0][0]) return K[0][1];
  if (u >= K[n - 1][0]) return K[n - 1][1];
  let i = 0; while (u > K[i + 1][0]) i++;
  const sl = j => (K[j + 1][1] - K[j][1]) / (K[j + 1][0] - K[j][0]);
  const tan = j => { if (j <= 0) return sl(0); if (j >= n - 1) return sl(n - 2); const a = sl(j - 1), b = sl(j); return a * b <= 0 ? 0 : 2 / (1 / a + 1 / b); };
  const [u0, y0] = K[i], [u1, y1] = K[i + 1], h = u1 - u0, t = (u - u0) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * tan(i) + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * tan(i + 1);
}
const FL_IGN = -.5, FL_RAIL = .25;          // igniter fires (s), rocket clears the 2.3 m rail (s)
function flightAt(u) {
  const a = SIM.apo, b = SIM.burn, ts = monoKey(FL_KEYS, u), st = SIM.at(ts);
  const phase = ts < FL_IGN ? 'Count' : ts < 0 ? 'Ignition' : ts < FL_RAIL ? 'Liftoff' : ts < b ? 'Boost' : ts < a.t - .05 ? 'Coast' : ts < a.t + 1.6 ? 'Apogee, ejection' : 'Under the main';
  // under the main the whole train drifts with the wind at altitude, like the ejection puff (stage WIND x 2.2)
  const ea = Math.max(0, ts - a.t - .05), wd = Math.max(0, ea - .5 * (1 - Math.exp(-ea / .5))) * sstep(a.t + .3, a.t + 1.9, ts);
  return { u, ts, h: st.h, v: st.v, F: st.F, phase, dx: -1.05 * 2.2 * wd, dz: -.3 * 2.2 * wd,
    ign: ts >= FL_IGN && ts < .06 ? sstep(FL_IGN, FL_IGN + .04, ts) : 0,
    sep: sstep(a.t + .05, a.t + .45, ts), chute: sstep(a.t + .3, a.t + 1.9, ts), tip: sstep(a.t - 1.6, a.t + .4, ts) };
}
$('#flApo').textContent = `Apogee ${Math.round(SIM.apo.h)} m.`;

/* =====================================================================
   6. DOM builders: progress cards, burn playback, focus panel, crew, countdown
   ===================================================================== */
const segs = $('#segs'), track = $('#track');
STAGES.forEach((s, i) => {
  const seg = document.createElement('div');
  seg.className = 'seg ' + s.s; seg.style.setProperty('--f', s.s === 'done' ? 1 : s.s === 'active' ? s.f : 0); seg.innerHTML = '<i></i>';
  segs.appendChild(seg);
  // each card: a window with the stage's part (rendered by 67-cards.js: a render when done, part built in the shop, a drawing until then)
  const li = document.createElement('li'), no = String(i + 1).padStart(2, '0');
  li.className = 'stage ' + s.s;
  const vt = s.s === 'done' ? 'Render' : s.s === 'active' ? `In the shop <b>${Math.round(s.f * 100)}%</b>` : 'Drawing';
  li.innerHTML = `<div class="view" aria-hidden="true"><span class="vt">${vt}</span><span class="vf">fig. ${no}</span></div>`
    + `<div class="txt"><div class="row"><span class="no"><span class="sr">Stage </span>${no}<span class="sr"> of ${STAGES.length}</span></span><span class="status"><i></i><span class="dc">${s.w}</span></span></div>`
    + `<h3>${s.t}</h3><p>${s.d}</p><span class="when">Target: [month]</span></div>`;
  track.appendChild(li);
});
// the build as a climb over the cards: a node per stage, solid up to where the shop is now
const traj = $('#traj'); let trajDone = null;
function buildTraj() {
  if (!traj) return;
  const cards = $$('.stage', track);
  if (!cards.length) { traj.innerHTML = ''; trajDone = null; return; }
  const W = track.scrollWidth, H = traj.clientHeight || 56, n = cards.length;
  traj.setAttribute('width', W); traj.setAttribute('viewBox', `0 0 ${W} ${H}`); traj.style.width = W + 'px';
  const pts = cards.map((c, i) => [c.offsetLeft + 12, H - 8 - Math.pow(i / (n - 1), 1.5) * (H - 22)]);
  const path = p => p.map((q, i) => { if (!i) return `M${q[0]},${q[1]}`; const a = p[i - 1], mx = (a[0] + q[0]) / 2; return `C${mx},${a[1]} ${mx},${q[1]} ${q[0]},${q[1]}`; }).join('');
  const ai = STAGES.findIndex(s => s.s === 'active'), f = ai >= 0 ? STAGES[ai].f : 0, k = ai >= 0 && ai < n - 1 ? ai : -1;
  const mid = k >= 0 ? [lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f * f * (3 - 2 * f))] : pts[Math.max(0, ai)];
  let s = `<path class="tr-all" d="${path(pts)}"></path><path class="tr-done" d="${path(k >= 0 ? [...pts.slice(0, k + 1), mid] : pts.slice(0, Math.max(1, ai + 1)))}"></path>`;
  pts.forEach((p, i) => { s += `<circle class="nd ${STAGES[i].s}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5"></circle><text class="nl" x="${(p[0] - 4).toFixed(1)}" y="${(p[1] - 11).toFixed(1)}">${String(i + 1).padStart(2, '0')}</text>`; });
  s += `<circle class="pulse" cx="${mid[0].toFixed(1)}" cy="${mid[1].toFixed(1)}" r="5"></circle><circle class="nd now" cx="${mid[0].toFixed(1)}" cy="${mid[1].toFixed(1)}" r="3.5"></circle><text class="nw" x="${mid[0].toFixed(1)}" y="${(mid[1] - 12).toFixed(1)}">now ${pctVal}%</text>`;
  traj.innerHTML = s;
  trajDone = $('.tr-done', traj); trajDone._len = trajDone.getTotalLength(); trajDone.style.strokeDasharray = trajDone._len;
}

// burn playback: one clock shared by the chart window, the readout, the film strip and the motor on the stand.
// burn.t runs while the burn plays (in slow motion, so the strip can be read); burn.scrubT holds
// one moment when someone drags, taps or steps the strip or the chart, and carries the smoke on after burnout.
// burn.gen counts restarts. BURN_UI holds the chart's and the strip's hooks (56-chart.js, 55-strip.js fill them in).
let sel = 'a';
const BURN_UI = { chart: null, strip: null };
const stripEl = $('#strip'), readEls = Object.fromEntries($$('#read [data-r]').map(e => [e.dataset.r, e]));
const statEls = Object.fromEntries($$('[data-k]').map(e => [e.dataset.k, e]));
const fmt = { peak: v => v.toFixed(0), avg: v => v.toFixed(0), burn: v => v.toFixed(2), imp: v => v.toFixed(0), frames: v => v.toFixed(0) };
const shown = { peak: 0, avg: 0, burn: 0, imp: 0, frames: 0 };
function setStats(animate) {
  const s = FORMS[sel].stats; statEls.cls.textContent = s.cls;
  if (G && animate && !reduce) gsap.to(shown, { ...Object.fromEntries(Object.keys(fmt).map(k => [k, s[k]])), duration: 1, ease: 'power3.out', onUpdate: () => { for (const k in fmt) statEls[k].textContent = fmt[k](shown[k]); } });
  else for (const k in fmt) { shown[k] = s[k]; statEls[k].textContent = fmt[k](s[k]); }
}
const burn = { t: -1, playing: false, scrubT: null, raf: 0, last: null, speed: .25, gen: 0, ramp: 0 };
// the readout shows the frame under the playhead: its number, its timestamp and the thrust read from it;
// the chart's crosshair follows the clock itself, between frames too
let readKey = '';
function setPlayhead(t) {
  const f = FORMS[sel], n = f.pts.length, i = clamp(Math.round(t * f.fps), 0, n - 1), key = sel + i;
  if (BURN_UI.chart) BURN_UI.chart.at(t, i);
  if (key === readKey) return; readKey = key;
  const [ti, F] = f.pts[i];
  readEls.i.textContent = String(i + 1).padStart(2, '0'); readEls.n.textContent = n;
  readEls.t.textContent = ti.toFixed(3); readEls.f.textContent = F.toFixed(1);
  stripEl.setAttribute('aria-valuenow', i + 1); stripEl.setAttribute('aria-valuemax', n);
  stripEl.setAttribute('aria-valuetext', `Frame ${i + 1} of ${n}, ${ti.toFixed(3)} seconds, ${F.toFixed(1)} newtons`);
}
function playLoop(now) {
  if (burn.last === null) burn.last = now;
  const dt = clamp((now - burn.last) / 1000, 0, .05); burn.last = now;
  const f = FORMS[sel];
  if (burn.playing) {
    if (!state.paused) burn.t += dt * burn.speed;
    setPlayhead(Math.min(burn.t, f.end));
    if (burn.t >= f.end) { burn.playing = false; burn.t = burn.scrubT = f.end; burn.ramp = 0; }
  } else if (!state.paused) {
    // after burnout the smoke drifts on (scrubT past the last frame), easing from slow motion back to real time
    burn.ramp += dt;
    burn.scrubT += dt * lerp(burn.speed, 1, sstep(0, 1.6, burn.ramp));
    if (burn.scrubT > f.end + 40) return;
  }
  burn.raf = requestAnimationFrame(playLoop);
}
function pauseBurn() { cancelAnimationFrame(burn.raf); burn.playing = false; }
function holdBurn(t) { pauseBurn(); burn.scrubT = burn.t = t; setPlayhead(t); }
function playBurn() {
  pauseBurn(); burn.gen++;
  burn.scrubT = null; burn.t = 0; burn.last = null;
  // reduced motion: no playback, the stand holds the frame with the most thrust
  if (reduce) { const f = FORMS[sel], pk = f.pts.reduce((b, p, i) => p[1] > f.pts[b][1] ? i : b, 0); holdBurn(pk / f.fps); return; }
  burn.playing = true; setPlayhead(0);
  burn.raf = requestAnimationFrame(playLoop);
}
function select(k, play = true) {
  sel = k;
  $$('.form').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === k ? 'true' : 'false'));
  // the chemistry tiles' share bars follow the mix (the numbers decode in 10-ui's showChem)
  const r = ($(`.form[data-f="${k}"] .ratio`) || {}).textContent;
  if (r) { const [ox, fu] = r.split('/'); const ch = $('.data .chem'); if (ch) { ch.style.setProperty('--ox', ox.trim() + '%'); ch.style.setProperty('--fu', fu.trim() + '%'); } }
  if (BURN_UI.chart) BURN_UI.chart.select(k);
  setStats(play); setPlayhead(0);
  if (play) playBurn();
}
$$('.form').forEach(b => b.addEventListener('click', () => select(b.dataset.f)));
$('#replay').addEventListener('click', playBurn);
select('a', false);


// vehicle focus panel
const fEls = { panel: $('#focus'), intro: $('#vIntro'), step: $('#fStep'), no: $('#fNo'), code: $('#vCode'), tb: $('#vTb'), name: $('#fName'), spec: $('#fSpec'), pips: $$('#focus .pips i'), rows: $$('#bom tbody tr') };
let focusIdx = -2;
function updateFocus(i) {
  if (i === focusIdx) return; focusIdx = i;
  fEls.rows.forEach((r, j) => r.classList.toggle('on', j === i));
  // the sheet's code label names the item on the bench and types itself in again (v3's labels)
  if (fEls.code) { const t = i < 0 ? '// 02_exploded_assembly' : `// 02.${i + 1}_${PARTS[i].name.toLowerCase().replace(/ /g, '_')}`;
    if (fEls.code.dataset.code !== t) { fEls.code.dataset.code = t; if (fEls.code._tw) typeIn(fEls.code, 18); } }
  if (i < 0) return;
  const p = PARTS[i];
  fEls.step.textContent = `Part ${i + 1} of 5`; fEls.name.textContent = p.name; if (fEls.no) fEls.no.textContent = p.no;
  fEls.spec.innerHTML = p.spec.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  fEls.pips.forEach((q, j) => q.classList.toggle('on', j <= i));
  blip(1500, .05);
}

// crew accordion (CoMinVi-style open/close)
const crewItems = $$('#crewAcc li');
function openCrew(li) {
  crewItems.forEach(x => { const on = x === li; x.classList.toggle('open', on); $('.crew-b', x).setAttribute('aria-expanded', String(on)); $('.oc', x).textContent = on ? 'Close' : 'Open'; });
}
crewItems.forEach(li => { $('.crew-b', li).addEventListener('click', () => openCrew(li)); if (fine) li.addEventListener('pointerenter', () => openCrew(li)); });

// countdown + signup + wordmark + flight replay
const LAUNCH = new Date('2027-05-15T10:00:00-04:00'); // placeholder date
const cu = Object.fromEntries($$('#count [data-u]').map(e => [e.dataset.u, e]));
function tick() {
  let s = Math.max(0, Math.floor((LAUNCH - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
  const v = { d: String(d).padStart(3, '0'), h: String(h).padStart(2, '0'), m: String(m).padStart(2, '0'), s: String(s).padStart(2, '0') };
  for (const k in v) if (cu[k].textContent !== v[k]) { cu[k].textContent = v[k]; if (G && !reduce) gsap.fromTo(cu[k], { yPercent: 70, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .5, ease: 'expo.out' }); }
}
tick(); setInterval(tick, 1000);
$('#signup').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#email').value.trim();
  $('#msg').textContent = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Enter an email address like name@example.com.' : "This preview doesn't save emails yet. Signups open when the site goes live.";
});
const wm = $('#wordmark'); wm.innerHTML = [...wm.textContent].map(c => `<span>${c === ' ' ? '&nbsp;' : c}</span>`).join('');
$('#replayFlight').addEventListener('click', () => goTo(0, 7));

/* =====================================================================
   7. layout metrics + DOM choreography
   ===================================================================== */
const fly = $('#fly'), flyO = $('#flyO'), flIntro = $('#flIntro'), flEnd = $('#flEnd');
// the live lens on the camera bug: set by the stage every frame (ui() only runs on scroll)
function flLens(mm) { const t = Math.round(mm) + ' mm'; if (t !== fh.mm) { fh.mm = t; fh.cMm.textContent = t; } }
const fh = { el: $('#fhud'), t: $('#fT'), alt: $('#fAlt'), vel: $('#fVel'), thr: $('#fThr'), ph: $('#fPh'), bar: $('#fBar'), cam: $('#fCam'), cNo: $('#fCamNo'), cNm: $('#fCamNm'), cMm: $('#fCamMm'), cur: null, mm: '' };
// the end card's numbers come from the same simulation the HUD reads
$('#flStats').innerHTML = [['Burnout', `T+${SIM.burn.toFixed(2)} s, ${Math.round(SIM.at(SIM.burn).v)} m/s`], ['Apogee', `T+${SIM.apo.t.toFixed(2)} s`], ['Main open', `T+${(SIM.apo.t + 1.95).toFixed(2)} s`]]
  .map(([k, v]) => `<div class="r"><span>${k}</span><b>${v}</b></div>`).join('');
let FL = flightAt(0);
function measureLayout() {
  MET.vh = innerHeight;
  // progress: the pinned section is as long as the horizontal track needs (phones too)
  const prog = $('#progress'), wrap = $('.track-wrap');
  MET.dist = Math.max(0, track.scrollWidth - wrap.clientWidth);
  prog.style.setProperty('--ph', Math.round(innerHeight * (isNarrow() ? 1.25 : 1.5) + MET.dist * (isNarrow() ? .85 : 1)) + 'px');
  const S = id => { const el = $(id); const t = docTop(el); return { t, h: el.offsetHeight, len: Math.max(1, el.offsetHeight - innerHeight) }; };
  Object.assign(MET, { max: Math.max(1, html.scrollHeight - innerHeight), veh: S('#vehicle'), dat: S('#data'), pro: S('#progress'), log: S('#log'), crew: S('#crew'), lau: S('#launch'), foot: S('#contact') });
  MET.sheets = sheets.map(docTop);
  fly.style.transform = 'translate(-50%,-50%)';
  const fr = fly.getBoundingClientRect(), or = flyO.getBoundingClientRect();
  fly.style.setProperty('--ox', (or.left - fr.left + or.width / 2).toFixed(1) + 'px');
  fly.style.setProperty('--oy', (or.top - fr.top + or.height * .6).toFixed(1) + 'px');
  buildTraj();
  if (STAGE.measure) STAGE.measure();
}
const navEl = $('.nav'), bomW = $('#bomW'); let navY = 0, navHid = false, navAcc = 0, curSheet = -1;
function navAuto(sy) {
  const d = sy - navY; navY = sy;
  if (d) navAcc = Math.sign(d) === Math.sign(navAcc) ? navAcc + d : d;
  let hide = navHid;
  if (sy < MET.vh * .6 || !menu.hidden || navAcc < -60) hide = false; else if (navAcc > 60) hide = true;
  if (hide !== navHid) { navHid = hide; navEl.classList.toggle('hide', hide); }
}
function ui(sy) {
  const vh = MET.vh;
  // vehicle: intro, then the part-by-part panel
  const V = MET.veh, pv = (sy - V.t) / V.len;
  fEls.intro.style.opacity = (1 - sstep(.3, .35, pv)).toFixed(3);
  const fo = sstep(.36, .39, pv) * (1 - sstep(.985, 1, pv));
  fEls.panel.style.opacity = fo.toFixed(3);
  // the sheet's code label and title block come with the paper
  { const sh = bpTimeline(sy, 1).sheet.toFixed(3); if (fEls.code) fEls.code.style.opacity = sh; if (fEls.tb) fEls.tb.style.opacity = sh; }
  if (bomW) { const bo = isNarrow() || MET.vh < 700 ? 1 - sstep(.36, .39, pv) : 1; bomW.style.opacity = bo.toFixed(3); bomW.style.visibility = bo < .01 ? 'hidden' : 'visible'; }
  navAuto(sy);
  if (MET.sheets) { const mid = sy + vh * .5; let si = 0; MET.sheets.forEach((t, j) => { if (mid >= t) si = j; });
    if (si !== curSheet) { curSheet = si; ticks.forEach((t, j) => t.setAttribute('aria-current', j === si ? 'true' : 'false')); } }
  updateFocus(pv < .36 ? -1 : Math.min(4, Math.floor((pv - .36) / .12)));
  // each part's numeral, name and spec rise in as its close up starts and clear before the next (scrubbed with the scroll)
  if (fo > .001) { const u = (pv - .36) / .12, k = clamp(Math.floor(u), 0, 4), fr = clamp(u - k, 0, 1), out = k < 4 ? sstep(.955, .997, fr) : 0;
    [fEls.no, fEls.name, fEls.spec].forEach((el, j) => { if (!el) return; const a = sstep(j * .008, .035 + j * .008, fr) * (1 - out);
      el.style.opacity = a.toFixed(3); el.style.transform = reduce ? '' : `translateY(${((1 - a) * 16).toFixed(1)}px)`; }); }
  // progress: horizontal track
  { const P = MET.pro, pp = sstep(0, 1, clamp((sy - P.t) / P.len, 0, 1) * 1.08 - .04);
    track.style.transform = `translate3d(${(-MET.dist * pp).toFixed(1)}px,0,0)`;
    if (traj) traj.style.transform = track.style.transform;
    if (trajDone) { const d = (trajDone._len * (1 - sstep(-.25, .3, (sy - P.t) / Math.max(1, P.len)))).toFixed(1); if (trajDone._d !== d) { trajDone._d = d; trajDone.style.strokeDashoffset = d; } } }
  // launch: fly through the "o", then the flight
  const L = MET.lau, lu = (sy - L.t) / vh;
  const fz = clamp(lu / .82, 0, 1);
  fly.style.transform = `translate(-50%,-50%) scale(${(1 + Math.pow(fz, 2.7) * 140).toFixed(3)})`;
  fly.style.opacity = (1 - sstep(.74, .88, lu)).toFixed(3);
  fly.style.visibility = lu > .95 || lu < -1.2 ? 'hidden' : 'visible';
  const f0 = L.t + vh, f1 = L.t + L.len, ur = (sy - f0) / (f1 - f0);
  FL = flightAt(clamp(ur, 0, 1));
  // staged so they never share the screen: the intro holds the count, hands over to the HUD before the
  // igniter, and the HUD hands over to the end card once the main is open and the drone has pulled back
  const footOut = 1 - sstep(MET.foot.t - vh * 1.1, MET.foot.t - vh * .6, sy);
  flIntro.style.opacity = (sstep(.88, 1, lu) * (1 - sstep(.022, .042, ur))).toFixed(3);
  const hudOn = sstep(.046, .062, ur) * (1 - sstep(.885, .905, ur)) * footOut;
  fh.el.style.opacity = hudOn.toFixed(3);
  fh.el.style.visibility = hudOn > .002 ? 'visible' : 'hidden';
  if (hudOn > .002) {
    fh.t.textContent = (FL.ts < 0 ? 'T–' : 'T+') + Math.abs(FL.ts).toFixed(2).padStart(5, '0');
    fh.alt.textContent = Math.round(FL.h) + ' m'; fh.vel.textContent = Math.round(FL.v) + ' m/s'; fh.thr.textContent = Math.round(FL.F) + ' N'; fh.ph.textContent = FL.phase;
    fh.bar.style.setProperty('--a', (FL.h / SIM.apo.h).toFixed(3));
    // the live camera and its lens; a cut flashes the bug
    const sh = flightShot(FL.ts);
    if (sh !== fh.cur) {
      if (fh.cur) { fh.cam.classList.add('cut'); clearTimeout(fh._ct); fh._ct = setTimeout(() => fh.cam.classList.remove('cut'), 260); }
      fh.cur = sh; fh.cNo.textContent = 'Cam ' + sh.no; fh.cNm.textContent = sh.name;
    }
  }
  const endO = sstep(.905, .93, ur) * (1 - sstep(f1 + vh * .15, f1 + vh * .5, sy));
  flEnd.style.opacity = endO.toFixed(3); flEnd.style.visibility = endO > .002 ? 'visible' : 'hidden'; flEnd.classList.toggle('on', endO > .5);
}
if (G && !reduce) {
  $$('main .h2, footer .h2').forEach(h => { if (h.closest('#flIntro') || h.closest('#flEnd')) return; gsap.from($$('.ln > span', h), { yPercent: 115, rotate: 2, ease: 'none', stagger: .12, scrollTrigger: { trigger: h.closest('.sheet') === h.closest('.vehicle,.data,.launch') ? h.closest('.sheet') : h, start: 'top 92%', end: 'top 58%', scrub: .6 } }); });
  gsap.from($$('span', wm), { yPercent: 105, ease: 'none', stagger: .04, scrollTrigger: { trigger: wm, start: 'top bottom', end: 'bottom bottom', scrub: .6 } });
  gsap.set($$('.seg i'), { scaleX: 0 });
  ScrollTrigger.create({ trigger: '#segs', start: 'top 90%', once: true, onEnter: () => {
    gsap.to($$('.seg i'), { scaleX: (i, el) => +getComputedStyle(el.parentElement).getPropertyValue('--f'), duration: .8, ease: 'power3.out', stagger: .09 });
    const o = { v: 0 }; gsap.to(o, { v: pctVal, duration: 1.4, ease: 'power3.out', onUpdate: () => $('#pct').textContent = Math.round(o.v) });
  } });
}
if (G) ScrollTrigger.create({ trigger: '#data', start: () => isNarrow() ? 'top 40%' : 'top 10%', end: 'bottom 60%', onEnter: () => { setStats(true); playBurn(); }, onEnterBack: playBurn });
else setStats(false);
