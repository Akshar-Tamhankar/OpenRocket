import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

/* =====================================================================
   0. basics
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const TEST = window.__TEST || {};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const G = !!(window.gsap && window.ScrollTrigger);
if (G) { gsap.registerPlugin(ScrollTrigger); gsap.ticker.lagSmoothing(0); }
const isMobile = () => innerWidth < 760;
const isNarrow = () => innerWidth < 900;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const cssVar = n => getComputedStyle(html).getPropertyValue(n).trim();
function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const docTop = el => el.getBoundingClientRect().top + scrollY;
const state = { paused: false, vel: 0 };
const MET = { vh: innerHeight, dist: 0, max: 1 };

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

const sheets = $$('[data-sheet]'), ruler = $('#ruler');
sheets.forEach((s, i) => {
  const b = document.createElement('button');
  b.className = 'tick'; b.type = 'button';
  b.setAttribute('aria-label', `Sheet ${i + 1}: ${s.dataset.sheet}`);
  b.innerHTML = `<span>${String(i + 1).padStart(2, '0')} ${s.dataset.sheet}</span><i></i>`;
  b.addEventListener('click', () => goTo('#' + s.id));
  ruler.appendChild(b);
});
const ticks = $$('.tick', ruler);

const pzBtn = $('#pz');
pzBtn.addEventListener('click', () => {
  state.paused = !state.paused;
  pzBtn.setAttribute('aria-pressed', String(state.paused));
  pzBtn.setAttribute('aria-label', state.paused ? 'Resume motion' : 'Pause motion');
  $('.lbl', pzBtn).textContent = state.paused ? 'Resume' : 'Pause';
  html.classList.toggle('paused', state.paused);
});

/* =====================================================================
   2. sound: synthesized, off until asked
   ===================================================================== */
const snd = { ctx: null, on: false };
function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
  const rumble = ctx.createGain(); rumble.gain.value = 0;
  noise.connect(lp).connect(rumble).connect(master);
  const wn = ctx.createBuffer(1, len, ctx.sampleRate), wd = wn.getChannelData(0); for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
  const white = ctx.createBufferSource(); white.buffer = wn; white.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = .7;
  const hiss = ctx.createGain(); hiss.gain.value = 0;
  white.connect(bp).connect(hiss).connect(master);
  const drone = ctx.createGain(); drone.gain.value = .05;
  const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 520;
  drone.connect(dl).connect(master);
  [55, 82.41, 110.6].forEach((f, i) => { const o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i - 1) * 7; const g = ctx.createGain(); g.gain.value = i === 2 ? .2 : .5; o.connect(g).connect(drone); o.start(); });
  noise.start(); white.start();
  Object.assign(snd, { ctx, master, rumble, hiss });
}
function setSound(on) {
  if (on && !snd.ctx) initAudio();
  if (!snd.ctx) return;
  snd.on = on; snd.ctx.resume();
  snd.master.gain.setTargetAtTime(on ? .9 : 0, snd.ctx.currentTime, .35);
  $('#snd').setAttribute('aria-pressed', on ? 'true' : 'false');
  $('#snd .lbl').textContent = on ? 'Sound on' : 'Sound off';
}
$('#snd').addEventListener('click', () => setSound(!snd.on));
function blip(f = 2400, v = .035) {
  if (!snd.on) return;
  const c = snd.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
  o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .6, t + .05);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + .07);
  o.connect(g).connect(snd.master); o.start(t); o.stop(t + .08);
}
document.addEventListener('pointerover', e => { const t = e.target.closest('a,button'); if (t && !t.contains(e.relatedTarget)) blip(); });

/* =====================================================================
   3. type: rolling links, decoding labels, typed code labels
   ===================================================================== */
$$('.links a, .nav-cta').forEach(a => { const t = a.textContent; a.innerHTML = `<span class="roll"><span data-t="${t}">${t}</span></span>`; a.setAttribute('aria-label', t); });
const GLYPHS = '0123456789#/<>_=+';
function decode(el, txt) {
  if (txt !== undefined) el.dataset.txt = txt;
  const T = el.dataset.txt ?? (el.dataset.txt = el.textContent);
  if (reduce) { el.textContent = T; return; }
  let f = 0; const total = 14;
  clearInterval(el._dc);
  el._dc = setInterval(() => {
    f++; const n = Math.floor(T.length * f / total);
    el.textContent = T.slice(0, n) + [...T.slice(n)].map(ch => ch === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]).join('');
    if (f >= total) { clearInterval(el._dc); el.textContent = T; }
  }, 32);
}
const decIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { decode(e.target); decIO.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
function typeIn(el, speed = 28) {
  const txt = el.dataset.code || ''; clearInterval(el._ty);
  if (reduce) { el.textContent = txt; return; }
  let i = 0; el.textContent = '';
  el._ty = setInterval(() => { el.textContent = txt.slice(0, ++i); if (i >= txt.length) clearInterval(el._ty); }, speed);
}
const typeIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { typeIn(e.target); typeIO.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
$$('.code').forEach(el => { if (el.id === 'heroCode') return; typeIO.observe(el); });

/* =====================================================================
   4. cursor + magnetic buttons
   ===================================================================== */
const cursor = $('#cursor'), cLabel = $('#cursorLabel');
const ptr = { x: 0, y: 0, cx: innerWidth / 2, cy: innerHeight / 2, px: -1, py: -1, moved: false, dx: 0, dy: 0 };
addEventListener('pointermove', e => {
  ptr.x = e.clientX / innerWidth * 2 - 1; ptr.y = e.clientY / innerHeight * 2 - 1;
  if (ptr.px >= 0) { ptr.dx += e.clientX - ptr.px; ptr.dy += e.clientY - ptr.py; }
  ptr.px = e.clientX; ptr.py = e.clientY; ptr.cx = e.clientX; ptr.cy = e.clientY; ptr.moved = true;
});
if (fine && G && !reduce) {
  html.classList.add('has-cursor');
  const qx = gsap.quickTo(cursor, 'x', { duration: .18, ease: 'power3' }), qy = gsap.quickTo(cursor, 'y', { duration: .18, ease: 'power3' });
  addEventListener('pointermove', e => {
    qx(e.clientX); qy(e.clientY);
    const hit = e.target.closest && e.target.closest('a,button,input,label');
    const zone = e.target.closest && e.target.closest('[data-cursor]');
    cursor.classList.toggle('hover', !!hit);
    const lab = !hit && zone ? zone.dataset.cursor : '';
    cursor.classList.toggle('label', !!lab);
    if (lab && cLabel.textContent !== lab) cLabel.textContent = lab;
  });
  document.addEventListener('pointerleave', () => cursor.style.opacity = 0);
  document.addEventListener('pointerenter', () => cursor.style.opacity = 1);
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
function flightAt(u) {
  const a = SIM.apo, b = SIM.burn;
  let ts;
  if (u < .06) ts = -1 + u / .06;
  else if (u < .34) ts = (u - .06) / .28 * b;
  else if (u < .74) ts = b + (u - .34) / .4 * (a.t - b);
  else ts = a.t + (u - .74) / .26 * 7;
  const st = SIM.at(ts);
  const phase = ts < 0 ? 'On the pad' : ts < b ? 'Boost' : ts < a.t - .05 ? 'Coast' : ts < a.t + 1.4 ? 'Apogee, ejection' : 'Under the main';
  return { u, ts, h: st.h, v: st.v, F: st.F, phase, sep: sstep(a.t, a.t + .5, ts), chute: sstep(a.t + .35, a.t + 2.2, ts), tip: sstep(a.t + .2, a.t + 2.8, ts) };
}
$('#flApo').textContent = `Apogee ${Math.round(SIM.apo.h)} m.`;

/* =====================================================================
   6. DOM builders: cards, chart, focus panel, crew, log, countdown
   ===================================================================== */
const segs = $('#segs'), track = $('#track'), traj = $('#traj');
STAGES.forEach((s, i) => {
  const seg = document.createElement('div');
  seg.className = 'seg ' + s.s; seg.style.setProperty('--f', s.s === 'done' ? 1 : s.s === 'active' ? s.f : 0); seg.innerHTML = '<i></i>';
  segs.appendChild(seg);
  const li = document.createElement('li');
  li.className = 'stage ' + s.s;
  li.innerHTML = `<div class="view" data-v="${i}"><span class="vt">${s.s === 'queued' ? 'Drawing' : s.s === 'active' ? 'In the shop' : 'Render'}</span></div><div class="txt"><div class="row"><span class="no">${String(i + 1).padStart(2, '0')}</span><span class="status"><i></i><span class="dc">${s.w}</span></span></div><h3>${s.t}</h3><p>${s.d}</p><span class="when">Target: [month]</span></div>`;
  track.appendChild(li);
});
const views = $$('.stage .view', track);
let trajDone = null;
function buildTraj() {
  const cards = $$('.stage', track);
  if (!cards.length || isNarrow()) { traj.innerHTML = ''; trajDone = null; return; }
  const W = track.scrollWidth, H = 86;
  traj.setAttribute('width', W); traj.setAttribute('height', H); traj.setAttribute('viewBox', `0 0 ${W} ${H}`); traj.style.width = W + 'px';
  const pts = cards.map((c, i) => [c.offsetLeft + 8, 72 - Math.pow(i / (cards.length - 1), 1.6) * 60]);
  const path = p => p.map((q, i) => { if (!i) return `M${q[0]},${q[1]}`; const a = p[i - 1], mx = (a[0] + q[0]) / 2; return `C${mx},${a[1]} ${mx},${q[1]} ${q[0]},${q[1]}`; }).join('');
  const ai = STAGES.findIndex(s => s.s === 'active');
  const mid = [lerp(pts[ai][0], pts[ai + 1][0], STAGES[ai].f), lerp(pts[ai][1], pts[ai + 1][1], STAGES[ai].f * .9)];
  let s = `<path class="tr-all" d="${path(pts)}"></path><path class="tr-done" id="trDone" d="${path([...pts.slice(0, ai + 1), mid])}"></path>`;
  pts.forEach((p, i) => { s += `<circle class="nd ${STAGES[i].s}" cx="${p[0]}" cy="${p[1]}" r="5"></circle>`; });
  s += `<circle class="pulse" cx="${mid[0]}" cy="${mid[1]}" r="5"></circle><circle class="nd active" cx="${mid[0]}" cy="${mid[1]}" r="3.5"></circle>`;
  traj.innerHTML = s;
  trajDone = $('#trDone'); trajDone._len = trajDone.getTotalLength();
  trajDone.style.strokeDasharray = trajDone._len;
}

// chart
const W = 760, H = 330, M = { l: 46, r: 14, t: 16, b: 34 }, TMAX = 1.9, FMAX = 140;
const X = t => M.l + t / TMAX * (W - M.l - M.r), Y = F => H - M.b - F / FMAX * (H - M.t - M.b);
const svg = $('#chart');
let sh = `<defs><clipPath id="reveal"><rect id="revealR" x="0" y="0" width="${W}" height="${H}"></rect></clipPath>
  <filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3" result="b"></feGaussianBlur><feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter></defs>`;
for (let F = 0; F <= FMAX; F += 20) sh += `<line class="${F ? 'cg' : 'cb'}" x1="${M.l}" x2="${W - M.r}" y1="${Y(F)}" y2="${Y(F)}"></line><text class="chart-ax" x="${M.l - 8}" y="${Y(F) + 3.5}" text-anchor="end">${F}</text>`;
for (let t = 0; t <= TMAX + 1e-6; t += .25) sh += `<line class="cg" x1="${X(t)}" x2="${X(t)}" y1="${M.t}" y2="${H - M.b}"></line><text class="chart-ax" x="${X(t)}" y="${H - M.b + 17}" text-anchor="middle">${t.toFixed(2)}</text>`;
sh += `<text class="chart-ax" x="${M.l + 6}" y="${M.t + 10}" style="fill:var(--chalk)">Thrust (N)</text><text class="chart-ax" x="${W - M.r}" y="${H - 3}" text-anchor="end" style="fill:var(--chalk)">Time (s)</text>`;
for (const k of ['b', 'c', 'a']) sh += `<path class="series s-${k}" id="p-${k}" d="M${FORMS[k].pts.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('L')}"></path>`;
for (const k in FORMS) sh += `<g id="dots-${k}">${FORMS[k].pts.map(p => `<circle class="dot-${k}" cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.4"></circle>`).join('')}</g>`;
sh += `<g class="cross" id="cross" style="display:none"><line id="cx" y1="${M.t}" y2="${H - M.b}"></line><circle id="cdot" r="5" fill="none" stroke-width="2"></circle></g>`;
svg.innerHTML = sh;
let sel = 'a';
const revealR = $('#revealR'), cross = $('#cross'), read = $('#read');
const statEls = Object.fromEntries($$('[data-k]').map(e => [e.dataset.k, e]));
const fmt = { peak: v => v.toFixed(0), avg: v => v.toFixed(0), burn: v => v.toFixed(2), imp: v => v.toFixed(0), frames: v => v.toFixed(0) };
const shown = { peak: 0, avg: 0, burn: 0, imp: 0, frames: 0 };
function setStats(animate) {
  const s = FORMS[sel].stats; statEls.cls.textContent = s.cls;
  if (G && animate && !reduce) gsap.to(shown, { ...Object.fromEntries(Object.keys(fmt).map(k => [k, s[k]])), duration: 1, ease: 'power3.out', onUpdate: () => { for (const k in fmt) statEls[k].textContent = fmt[k](shown[k]); } });
  else for (const k in fmt) { shown[k] = s[k]; statEls[k].textContent = fmt[k](s[k]); }
}
const burn = { t: -1, playing: false, scrubT: null, raf: 0, last: null, speed: .55 };
function setPlayhead(t, show = true) {
  const f = FORMS[sel], F = thrustAt(f, t), i = clamp(Math.round(t * f.fps), 0, f.pts.length - 1);
  cross.style.display = show ? '' : 'none';
  $('#cx').setAttribute('x1', X(t)); $('#cx').setAttribute('x2', X(t));
  $('#cdot').setAttribute('cx', X(t)); $('#cdot').setAttribute('cy', Y(F));
  read.innerHTML = `<span>Time <b>${t.toFixed(3)} s</b></span><span>Thrust <b>${F.toFixed(1)} N</b></span><span>Frame <b>${i + 1} of ${f.pts.length}</b></span>`;
}
function playLoop(now) {
  if (burn.last === null) burn.last = now;
  const dt = clamp((now - burn.last) / 1000, 0, .05); burn.last = now;
  if (!state.paused) burn.t += dt * burn.speed;
  const f = FORMS[sel];
  revealR.setAttribute('width', X(Math.min(burn.t, f.end)));
  if (burn.scrubT == null) setPlayhead(Math.min(burn.t, f.end));
  if (burn.t >= f.end) { burn.playing = false; revealR.setAttribute('width', W); if (burn.scrubT == null) cross.style.display = 'none'; return; }
  burn.raf = requestAnimationFrame(playLoop);
}
function playBurn() {
  cancelAnimationFrame(burn.raf);
  burn.t = 0; burn.playing = true; burn.last = null;
  if (reduce) { burn.playing = false; revealR.setAttribute('width', W); return; }
  revealR.setAttribute('width', M.l);
  burn.raf = requestAnimationFrame(playLoop);
}
function burnDrive() {
  const f = FORMS[sel];
  const t = burn.scrubT != null ? burn.scrubT : burn.playing ? burn.t : -1;
  return t < 0 ? 0 : thrustAt(f, t) / 120;
}
function select(k, play = true) {
  sel = k;
  $$('.form').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === k ? 'true' : 'false'));
  for (const j in FORMS) {
    const p = $('#p-' + j), d = $('#dots-' + j);
    p.style.opacity = j === k ? 1 : .3; p.style.strokeWidth = j === k ? 2.6 : 1.4;
    d.style.display = j === k ? '' : 'none';
    if (j === k) { p.setAttribute('clip-path', 'url(#reveal)'); d.setAttribute('clip-path', 'url(#reveal)'); p.setAttribute('filter', 'url(#glow)'); }
    else { p.removeAttribute('clip-path'); d.removeAttribute('clip-path'); p.removeAttribute('filter'); }
  }
  svg.appendChild($('#p-' + k)); svg.appendChild($('#dots-' + k)); svg.appendChild(cross);
  $('#cdot').setAttribute('stroke', `var(${FORMS[k].col})`);
  setStats(play);
  if (play) playBurn();
}
$$('.form').forEach(b => b.addEventListener('click', () => select(b.dataset.f)));
$('#replay').addEventListener('click', playBurn);
select('a', false);
function scrubAt(clientX) {
  const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = 0;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  const f = FORMS[sel], i = clamp(Math.round(((p.x - M.l) / (W - M.l - M.r)) * TMAX * f.fps), 0, f.pts.length - 1);
  burn.scrubT = f.pts[i][0];
  revealR.setAttribute('width', W);
  setPlayhead(burn.scrubT);
}
svg.addEventListener('pointermove', e => scrubAt(e.clientX));
svg.addEventListener('pointerdown', e => scrubAt(e.clientX));
svg.addEventListener('pointerleave', () => { burn.scrubT = null; if (!burn.playing) cross.style.display = 'none'; });
const win = $('#win');
if (fine) {
  win.addEventListener('pointermove', e => {
    const r = win.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    win.style.setProperty('--ry', ((px - .5) * 4).toFixed(2) + 'deg'); win.style.setProperty('--rx', ((.5 - py) * 3).toFixed(2) + 'deg');
    win.style.setProperty('--gx', (px * 100).toFixed(1) + '%'); win.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
  });
  win.addEventListener('pointerleave', () => { win.style.setProperty('--rx', '0deg'); win.style.setProperty('--ry', '0deg'); });
}

// vehicle focus panel
const fEls = { panel: $('#focus'), intro: $('#vIntro'), step: $('#fStep'), no: $('#fNo'), name: $('#fName'), spec: $('#fSpec'), pips: $$('#focus .pips i'), rows: $$('#bom tbody tr') };
let focusIdx = -2;
function updateFocus(i) {
  if (i === focusIdx) return; focusIdx = i;
  fEls.rows.forEach((r, j) => r.classList.toggle('on', j === i));
  if (i < 0) return;
  const p = PARTS[i];
  fEls.step.textContent = `Part ${i + 1} of 5`; fEls.no.textContent = p.no; fEls.name.textContent = p.name;
  fEls.spec.innerHTML = p.spec.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $$('dd', fEls.spec).forEach(dd => decode(dd, dd.textContent));
  fEls.pips.forEach((q, j) => q.classList.toggle('on', j <= i));
  if (G && !reduce) gsap.fromTo([fEls.no, fEls.name], { yPercent: 50, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .7, ease: 'expo.out', stagger: .06 });
  blip(1500, .05);
}

// crew accordion (CoMinVi-style open/close)
const crewItems = $$('#crewAcc li');
function openCrew(li) {
  crewItems.forEach(x => { const on = x === li; x.classList.toggle('open', on); $('.crew-b', x).setAttribute('aria-expanded', String(on)); $('.oc', x).textContent = on ? 'Close' : 'Open'; });
}
crewItems.forEach(li => { $('.crew-b', li).addEventListener('click', () => openCrew(li)); if (fine) li.addEventListener('pointerenter', () => openCrew(li)); });

// log previews: rendered thumbnails shown through the WebGL composite
const peek = { i: -1, on: false, a: 0, x: 0, y: 0, vx: 0, vy: 0 };
const peekc = $('#peekc');
if (fine) {
  $$('.entry').forEach(a => {
    a.addEventListener('pointerenter', () => { peek.i = +a.dataset.peek; peek.on = true; peekc.textContent = a.dataset.cap; peekc.classList.add('on'); });
    a.addEventListener('pointerleave', () => { peek.on = false; peekc.classList.remove('on'); });
  });
}

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
const skewEls = $$('.skew');
const fly = $('#fly'), flyO = $('#flyO'), flIntro = $('#flIntro'), flEnd = $('#flEnd');
const fh = { el: $('#fhud'), t: $('#fT'), alt: $('#fAlt'), vel: $('#fVel'), ph: $('#fPh'), bar: $('#fBar') };
let FL = flightAt(0), lastSkew = 0;
function measureLayout() {
  MET.vh = innerHeight;
  const prog = $('#progress');
  if (!isNarrow()) {
    const wrap = $('.track-wrap');
    MET.dist = Math.max(0, track.scrollWidth - wrap.clientWidth);
    prog.style.setProperty('--ph', Math.round(innerHeight * 1.5 + MET.dist) + 'px');
  } else { MET.dist = 0; prog.style.removeProperty('--ph'); }
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
  if (bomW) { const bo = isNarrow() ? 1 - fo : 1; bomW.style.opacity = bo.toFixed(3); bomW.style.visibility = bo < .01 ? 'hidden' : 'visible'; }
  navAuto(sy);
  if (MET.sheets) { const mid = sy + vh * .5; let si = 0; MET.sheets.forEach((t, j) => { if (mid >= t) si = j; });
    if (si !== curSheet) { curSheet = si; ticks.forEach((t, j) => t.setAttribute('aria-current', j === si ? 'true' : 'false')); } }
  updateFocus(pv < .36 ? -1 : Math.min(4, Math.floor((pv - .36) / .12)));
  // progress: horizontal track
  if (!isNarrow()) {
    const P = MET.pro, pp = clamp((sy - P.t) / P.len, 0, 1);
    track.style.transform = `translate3d(${(-MET.dist * pp).toFixed(1)}px,0,0)`;
    traj.style.transform = track.style.transform;
    if (trajDone) trajDone.style.strokeDashoffset = (trajDone._len * (1 - clamp(pp * 3, 0, 1))).toFixed(1);
  }
  // launch: fly through the "o", then the flight
  const L = MET.lau, lu = (sy - L.t) / vh;
  const fz = clamp(lu / .82, 0, 1);
  fly.style.transform = `translate(-50%,-50%) scale(${(1 + Math.pow(fz, 2.7) * 140).toFixed(3)})`;
  fly.style.opacity = (1 - sstep(.74, .88, lu)).toFixed(3);
  fly.style.visibility = lu > .95 || lu < -1.2 ? 'hidden' : 'visible';
  flIntro.style.opacity = (sstep(.9, 1.05, lu) * (1 - sstep(1.7, 2.1, lu))).toFixed(3);
  const f0 = L.t + vh, f1 = L.t + L.len;
  FL = flightAt(clamp((sy - f0) / (f1 - f0), 0, 1));
  const hudOn = sstep(.95, 1.15, lu) * (1 - sstep(MET.foot.t - vh * 1.1, MET.foot.t - vh * .6, sy));
  fh.el.style.opacity = hudOn.toFixed(3);
  if (hudOn > .01) {
    fh.t.textContent = (FL.ts < 0 ? 'T–' : 'T+') + Math.abs(FL.ts).toFixed(2).padStart(5, '0');
    fh.alt.textContent = Math.round(FL.h) + ' m'; fh.vel.textContent = Math.round(FL.v) + ' m/s'; fh.ph.textContent = FL.phase;
    fh.bar.style.setProperty('--a', (FL.h / SIM.apo.h).toFixed(3));
  }
  const endOn = FL.u > .84 && sy < f1 + vh * .3;
  flEnd.style.opacity = endOn ? 1 : 0; flEnd.classList.toggle('on', endOn);
  // velocity skew on long lists
  const v = lenis ? lenis.velocity : 0; state.vel += (v - state.vel) * .12;
  const sk = clamp(-state.vel * .05, -3, 3);
  if (Math.abs(sk - lastSkew) > .01) { lastSkew = sk; skewEls.forEach(el => el.style.transform = `skewY(${sk.toFixed(2)}deg)`); }
  // peek caption
  if (fine) { peek.x += (ptr.cx - peek.x) * .14; peek.y += (ptr.cy - peek.y) * .14; peekc.style.transform = `translate(${(peek.x + 32).toFixed(1)}px,${(peek.y + 128).toFixed(1)}px)`; }
}
if (G && !reduce) {
  $$('main .h2, footer .h2').forEach(h => { if (h.closest('#flIntro') || h.closest('#flEnd')) return; gsap.from($$('.ln > span', h), { yPercent: 115, rotate: 2, ease: 'none', stagger: .12, scrollTrigger: { trigger: h.closest('.sheet') === h.closest('.vehicle,.data,.launch') ? h.closest('.sheet') : h, start: 'top 92%', end: 'top 58%', scrub: .6 } }); });
  gsap.from($$('span', wm), { yPercent: 105, ease: 'none', stagger: .04, scrollTrigger: { trigger: wm, start: 'top bottom', end: 'bottom 85%', scrub: .6 } });
  gsap.set($$('.seg i'), { scaleX: 0 });
  ScrollTrigger.create({ trigger: '#segs', start: 'top 90%', once: true, onEnter: () => {
    gsap.to($$('.seg i'), { scaleX: (i, el) => +getComputedStyle(el.parentElement).getPropertyValue('--f'), duration: .8, ease: 'power3.out', stagger: .09 });
    const o = { v: 0 }; gsap.to(o, { v: pctVal, duration: 1.4, ease: 'power3.out', onUpdate: () => $('#pct').textContent = Math.round(o.v) });
  } });
}
if (G) ScrollTrigger.create({ trigger: '#data', start: () => isNarrow() ? 'top 40%' : 'top -10%', end: 'bottom 60%', onEnter: () => { setStats(true); playBurn(); }, onEnterBack: playBurn });
else setStats(false);
$$('.dc').forEach(el => { if (!el.closest('.hero')) decIO.observe(el); });

/* =====================================================================
   8. the stage
   ===================================================================== */
const canvas = $('#gl');
const lowTier = !!TEST.lowTier || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }); } catch (err) { renderer = null; }
if (!renderer || !renderer.capabilities.isWebGL2) { html.classList.add('no-gl'); renderer = null; }
else html.classList.add('gl');
const STAGE = { frame: null, measure: null, intro: { fade: 0, print: 0, cone: 0, hud: 0, push: 1 } };
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

async function buildStage(progress) {
  const C = {};
  for (const n of ['night', 'cyanotype', 'chalk', 'flame', 'ember', 'steel']) C[n] = new THREE.Color(cssVar('--' + n));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  const MAXDPR = lowTier ? 1 : 1.5;
  let dpr = Math.min(devicePixelRatio || 1, MAXDPR);
  const LEVELS = lowTier ? 4 : 5;
  const RT = (w, h, o = {}) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType, depthBuffer: false, ...o });

  /* ---------- fullscreen passes ---------- */
  const fsVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
  const fsGeo = new THREE.BufferGeometry();
  fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const fsMesh = new THREE.Mesh(fsGeo); fsMesh.frustumCulled = false;
  const fsScene = new THREE.Scene(); fsScene.add(fsMesh);
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const addBlend = m => { m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; return m; };
  const SM = (fs, uniforms, vs = fsVS) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  function pass(mat, target) { fsMesh.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); }

  const brightMat = SM(`uniform sampler2D tIn; uniform vec2 uT; uniform float uTh; varying vec2 vUv;
    void main(){ vec3 c = (texture2D(tIn, vUv + uT * vec2(-.5, -.5)).rgb + texture2D(tIn, vUv + uT * vec2(.5, -.5)).rgb + texture2D(tIn, vUv + uT * vec2(-.5, .5)).rgb + texture2D(tIn, vUv + uT * vec2(.5, .5)).rgb) * .25;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.);
      float b = max(c.r, max(c.g, c.b)); float k = clamp((b - uTh) / max(b, 1e-4), 0., 1.); gl_FragColor = vec4(min(c * k, vec3(30.)), 1.); }`,
    { tIn: { value: null }, uT: { value: new THREE.Vector2() }, uTh: { value: .9 } });
  const downMat = SM(`uniform sampler2D tIn; uniform vec2 uT; varying vec2 vUv;
    void main(){ vec3 s = texture2D(tIn, vUv).rgb * 4.; s += texture2D(tIn, vUv - uT).rgb; s += texture2D(tIn, vUv + uT).rgb;
      s += texture2D(tIn, vUv + vec2(uT.x, -uT.y)).rgb; s += texture2D(tIn, vUv - vec2(uT.x, -uT.y)).rgb; gl_FragColor = vec4(s / 8., 1.); }`,
    { tIn: { value: null }, uT: { value: new THREE.Vector2() } });
  const upMat = SM(`uniform sampler2D tIn; uniform sampler2D tAdd; uniform vec2 uT; varying vec2 vUv;
    void main(){ vec3 s = texture2D(tIn, vUv + vec2(-uT.x * 2., 0.)).rgb + texture2D(tIn, vUv + vec2(-uT.x, uT.y)).rgb * 2. + texture2D(tIn, vUv + vec2(0., uT.y * 2.)).rgb
      + texture2D(tIn, vUv + vec2(uT.x, uT.y)).rgb * 2. + texture2D(tIn, vUv + vec2(uT.x * 2., 0.)).rgb + texture2D(tIn, vUv + vec2(uT.x, -uT.y)).rgb * 2.
      + texture2D(tIn, vUv + vec2(0., -uT.y * 2.)).rgb + texture2D(tIn, vUv + vec2(-uT.x, -uT.y)).rgb * 2.;
      gl_FragColor = vec4(s / 12. + texture2D(tAdd, vUv).rgb, 1.); }`,
    { tIn: { value: null }, tAdd: { value: null }, uT: { value: new THREE.Vector2() } });
  const blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); blackTex.needsUpdate = true;
  const compMat = SM(`uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tStreak; uniform sampler2D tDye; uniform sampler2D tPeek;
    uniform vec2 uRes; uniform float uDpr; uniform float uTime;
    uniform vec3 uNight; uniform vec3 uPaper; uniform vec3 uChalk; uniform vec3 uEmber; uniform vec3 uSteel;
    uniform float uScan; uniform float uPaperVis; uniform float uBeam; uniform float uWarm; uniform float uDawn; uniform float uAlt;
    uniform vec2 uGlow; uniform vec2 uLamp; uniform vec2 uSpot;
    uniform float uBloom; uniform float uRays; uniform float uStreak; uniform float uSmoke; uniform float uScroll; uniform float uFade; uniform float uCA;
    uniform vec4 uPeek; uniform float uPeekA; uniform vec2 uPeekV;
    varying vec2 vUv;
    vec3 RRT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){ const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
      const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
      c *= 1.0 / 0.6; c = I * c; c = RRT(c); c = O * c; return clamp(c, 0., 1.); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float gridLine(vec2 p, float s){ vec2 m = abs(fract(p / s - .5) - .5) * s; return 1. - smoothstep(0., 1., min(m.x, m.y)); }
    void main(){
      vec2 uv = vUv; vec2 d = uv - .5; float r2 = dot(d, d);
      vec2 off = d * r2 * uCA;
      vec4 s = texture2D(tScene, uv);
      vec3 hdr = vec3(texture2D(tScene, uv + off).r, s.g, texture2D(tScene, uv - off).b);
      vec3 bloom = texture2D(tBloom, uv).rgb;
      if (any(isnan(hdr)) || any(isinf(hdr))) hdr = vec3(0.); if (any(isnan(bloom))) bloom = vec3(0.); if (isnan(s.a)) s.a = 0.;
      float aspect = uRes.x / uRes.y;
      // sky and ground
      vec3 bg = uNight * mix(.8, 1.15, uv.y);
      float hz = -.05 - uAlt * .55;
      float ty = clamp((uv.y - hz) / 1.05, 0., 1.);
      vec3 dawn = mix(uEmber * .95, uSteel * .38, smoothstep(0., .42, ty));
      dawn = mix(dawn, uNight * 1.25 + uSteel * .1, smoothstep(.38, 1., ty) * (1. - uAlt * .35));
      bg = mix(bg, dawn, uDawn);
      vec2 px = gl_FragCoord.xy / uDpr; px.y += uScroll;
      float inBp = smoothstep(uScan + .0008, uScan - .0008, uv.x) * uPaperVis;
      float mask = smoothstep(1.05, .25, length(d * vec2(1., 1.2)) * 1.6);
      vec3 paper = uPaper * mix(.85, 1.1, uv.y) + uChalk * (gridLine(px, 24.) * .06 + gridLine(px, 120.) * .14) * mask;
      bg = mix(bg, paper, inBp);
      vec2 gd = (uv - uGlow) * vec2(aspect, 1.);
      bg += uEmber * uWarm * exp(-dot(gd, gd) * 7.) * .16;
      // god rays from the lamp, gathered from the bloom buffer
      vec3 rays = vec3(0.);
      if (uRays > .001) { vec2 dir = (uv - uLamp) / 26.; vec2 p = uv; float w = 1.; for (int i = 0; i < 26; i++) { p -= dir; rays += texture2D(tBloom, clamp(p, 0., 1.)).rgb * w; w *= .94; } rays *= uRays * .09; }
      vec3 col = bg * (1. - clamp(s.a, 0., 1.)) + aces(hdr);
      col += bloom * uBloom + rays;
      // anamorphic streak
      if (uStreak > .001) { vec3 st = vec3(0.); for (int i = 1; i <= 12; i++) { float o = float(i) * .011, w = 1. - float(i) / 13.; st += (texture2D(tStreak, uv + vec2(o, 0.)).rgb + texture2D(tStreak, uv - vec2(o, 0.)).rgb) * w; } col += st * vec3(.45, .65, 1.) * uStreak * .03; }
      // smoke: fluid dye lit by the spotlight, the flame and the dawn
      vec4 dye = texture2D(tDye, uv);
      float dA = clamp(dye.a, 0., 1.) * uSmoke;
      vec2 sp = (uv - uSpot) * vec2(aspect, 1.);
      vec3 light = vec3(.26, .29, .36) + uEmber * 2.4 * uWarm * exp(-dot(gd, gd) * 5.) + vec3(1., .93, .82) * 1.2 * uRays * exp(-dot(sp, sp) * 3.) + (uEmber * .7 + uSteel * .25) * uDawn * .9;
      col = col * (1. - dA * .8) + max(dye.rgb, 0.) * light * uSmoke;
      // log preview (rendered thumbnail, bent by cursor speed)
      if (uPeekA > .001) {
        vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
        vec2 lp = (fc - uPeek.xy) / uPeek.zw;
        lp.x -= sin(lp.y * 3.14159) * uPeekV.x * .16; lp.y -= sin(lp.x * 3.14159) * uPeekV.y * .16;
        if (lp.x > 0. && lp.x < 1. && lp.y > 0. && lp.y < 1.) {
          float rv = length((lp - .5) * vec2(uPeek.z / uPeek.w, 1.));
          float m = smoothstep(uPeekA * .98, uPeekA * .98 - .01, rv);
          vec2 q = vec2(lp.x, 1. - lp.y); float sh = uPeekV.x * .02;
          vec3 pc = vec3(texture2D(tPeek, q + vec2(sh, 0.)).r, texture2D(tPeek, q).g, texture2D(tPeek, q - vec2(sh, 0.)).b);
          col = mix(col, aces(pc), m);
        }
      }
      // scan beam
      float sx = (uv.x - uScan) * uRes.x / uDpr;
      col += vec3(.65, .85, 1.25) * (exp(-sx * sx / 18.) * 1.4 + exp(-sx * sx / 5000.) * .22) * uBeam;
      // lens
      col *= 1. - smoothstep(.25, 1.25, length(d * vec2(1., .9)) * 1.35) * .6;
      col = toSRGB(clamp(col, 0., 1.));
      col += (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.) - .5) * .045;
      gl_FragColor = vec4(col * uFade, 1.);
    }`, {
    tScene: { value: null }, tBloom: { value: null }, tStreak: { value: null }, tDye: { value: blackTex }, tPeek: { value: blackTex },
    uRes: { value: new THREE.Vector2() }, uDpr: { value: 1 }, uTime: { value: 0 },
    uNight: { value: C.night }, uPaper: { value: C.cyanotype }, uChalk: { value: C.chalk }, uEmber: { value: C.ember }, uSteel: { value: C.steel },
    uScan: { value: 0 }, uPaperVis: { value: 0 }, uBeam: { value: 0 }, uWarm: { value: 0 }, uDawn: { value: 0 }, uAlt: { value: 0 },
    uGlow: { value: new THREE.Vector2(.7, .3) }, uLamp: { value: new THREE.Vector2(.8, 1.4) }, uSpot: { value: new THREE.Vector2(.8, .1) },
    uBloom: { value: .5 }, uRays: { value: 0 }, uStreak: { value: 0 }, uSmoke: { value: 0 }, uScroll: { value: 0 }, uFade: { value: 0 }, uCA: { value: .009 },
    uPeek: { value: new THREE.Vector4(0, 0, 320, 240) }, uPeekA: { value: 0 }, uPeekV: { value: new THREE.Vector2() },
  });

  /* ---------- fluid smoke (Navier-Stokes, screen space) ---------- */
  const fluid = (!lowTier && !reduce) ? (() => {
    const SIMR = 128, DYER = 512, ITER = 18;
    const vsF = `uniform vec2 texelSize; varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
      void main(){ vUv = uv; vL = vUv - vec2(texelSize.x, 0.); vR = vUv + vec2(texelSize.x, 0.); vT = vUv + vec2(0., texelSize.y); vB = vUv - vec2(0., texelSize.y); gl_Position = vec4(position.xy, 0., 1.); }`;
    const hd = 'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;\n';
    const FM = (fs, u) => SM(hd + fs, { texelSize: { value: new THREE.Vector2() }, ...u }, vsF);
    const splatM = FM(`uniform sampler2D uTarget; uniform float aspectRatio; uniform vec4 color; uniform vec2 point; uniform float radius;
      void main(){ vec2 p = vUv - point; p.x *= aspectRatio; gl_FragColor = texture2D(uTarget, vUv) + exp(-dot(p, p) / radius) * color; }`,
      { uTarget: { value: null }, aspectRatio: { value: 1 }, color: { value: new THREE.Vector4() }, point: { value: new THREE.Vector2() }, radius: { value: .001 } });
    const advM = FM(`uniform sampler2D uVelocity; uniform sampler2D uSource; uniform float dt; uniform float dissipation; uniform vec2 velTexel; uniform vec2 shift;
      void main(){ vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * velTexel - shift; gl_FragColor = texture2D(uSource, coord) / (1. + dissipation * dt); }`,
      { uVelocity: { value: null }, uSource: { value: null }, dt: { value: .016 }, dissipation: { value: 1 }, velTexel: { value: new THREE.Vector2() }, shift: { value: new THREE.Vector2() } });
    const divM = FM(`uniform sampler2D uVelocity; void main(){ float L = texture2D(uVelocity, vL).x; float R = texture2D(uVelocity, vR).x; float T = texture2D(uVelocity, vT).y; float B = texture2D(uVelocity, vB).y; vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.) L = -C.x; if (vR.x > 1.) R = -C.x; if (vT.y > 1.) T = -C.y; if (vB.y < 0.) B = -C.y; gl_FragColor = vec4(.5 * (R - L + T - B), 0., 0., 1.); }`, { uVelocity: { value: null } });
    const curlM = FM(`uniform sampler2D uVelocity; void main(){ float L = texture2D(uVelocity, vL).y; float R = texture2D(uVelocity, vR).y; float T = texture2D(uVelocity, vT).x; float B = texture2D(uVelocity, vB).x; gl_FragColor = vec4(.5 * (R - L - T + B), 0., 0., 1.); }`, { uVelocity: { value: null } });
    const vortM = FM(`uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
      void main(){ float L = texture2D(uCurl, vL).x; float R = texture2D(uCurl, vR).x; float T = texture2D(uCurl, vT).x; float B = texture2D(uCurl, vB).x; float C = texture2D(uCurl, vUv).x;
        vec2 force = .5 * vec2(abs(T) - abs(B), abs(R) - abs(L)); force /= length(force) + .0001; force *= curl * C; force.y *= -1.;
        vec2 v = texture2D(uVelocity, vUv).xy + force * dt; gl_FragColor = vec4(clamp(v, -1000., 1000.), 0., 1.); }`,
      { uVelocity: { value: null }, uCurl: { value: null }, curl: { value: 22 }, dt: { value: .016 } });
    const presM = FM(`uniform sampler2D uPressure; uniform sampler2D uDivergence; void main(){ float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x; float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x; float dv = texture2D(uDivergence, vUv).x; gl_FragColor = vec4((L + R + B + T - dv) * .25, 0., 0., 1.); }`, { uPressure: { value: null }, uDivergence: { value: null } });
    const gradM = FM(`uniform sampler2D uPressure; uniform sampler2D uVelocity; void main(){ float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x; float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x; gl_FragColor = vec4(texture2D(uVelocity, vUv).xy - vec2(R - L, T - B), 0., 1.); }`, { uPressure: { value: null }, uVelocity: { value: null } });
    const clrM = FM(`uniform sampler2D uTexture; uniform float value; void main(){ gl_FragColor = value * texture2D(uTexture, vUv); }`, { uTexture: { value: null }, value: { value: .8 } });
    const fRT = (w, h) => RT(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    const dbl = (w, h) => ({ read: fRT(w, h), write: fRT(w, h), swap() { const t = this.read; this.read = this.write; this.write = t; } });
    const F = { vel: null, dye: null, prs: null, div: null, curl: null, sw: 1, sh: 1, dw: 1, dh: 1 };
    const dims = res => { const a = innerWidth / innerHeight; return a > 1 ? [Math.round(res * a), res] : [res, Math.round(res / a)]; };
    function clear(rt) { renderer.setRenderTarget(rt); renderer.clear(); }
    F.alloc = () => {
      [F.vel, F.dye, F.prs].forEach(d => d && (d.read.dispose(), d.write.dispose())); [F.div, F.curl].forEach(r => r && r.dispose());
      [F.sw, F.sh] = dims(SIMR); [F.dw, F.dh] = dims(DYER);
      F.vel = dbl(F.sw, F.sh); F.dye = dbl(F.dw, F.dh); F.prs = dbl(F.sw, F.sh); F.div = fRT(F.sw, F.sh); F.curl = fRT(F.sw, F.sh);
      [F.vel.read, F.vel.write, F.dye.read, F.dye.write, F.prs.read, F.prs.write, F.div, F.curl].forEach(clear);
    };
    const st = new THREE.Vector2();
    F.splat = (x, y, vx, vy, r, g, b, a, rad) => {
      st.set(1 / F.sw, 1 / F.sh);
      const u = splatM.uniforms; u.texelSize.value.copy(st); u.aspectRatio.value = innerWidth / innerHeight; u.point.value.set(x, y); u.radius.value = rad;
      u.uTarget.value = F.vel.read.texture; u.color.value.set(vx, vy, 0, 0); pass(splatM, F.vel.write); F.vel.swap();
      u.uTarget.value = F.dye.read.texture; u.color.value.set(r, g, b, a); pass(splatM, F.dye.write); F.dye.swap();
    };
    F.step = (dt, shiftY) => {
      st.set(1 / F.sw, 1 / F.sh);
      curlM.uniforms.texelSize.value.copy(st); curlM.uniforms.uVelocity.value = F.vel.read.texture; pass(curlM, F.curl);
      vortM.uniforms.texelSize.value.copy(st); vortM.uniforms.uVelocity.value = F.vel.read.texture; vortM.uniforms.uCurl.value = F.curl.texture; vortM.uniforms.dt.value = dt; pass(vortM, F.vel.write); F.vel.swap();
      divM.uniforms.texelSize.value.copy(st); divM.uniforms.uVelocity.value = F.vel.read.texture; pass(divM, F.div);
      clrM.uniforms.texelSize.value.copy(st); clrM.uniforms.uTexture.value = F.prs.read.texture; pass(clrM, F.prs.write); F.prs.swap();
      presM.uniforms.texelSize.value.copy(st); presM.uniforms.uDivergence.value = F.div.texture;
      for (let i = 0; i < ITER; i++) { presM.uniforms.uPressure.value = F.prs.read.texture; pass(presM, F.prs.write); F.prs.swap(); }
      gradM.uniforms.texelSize.value.copy(st); gradM.uniforms.uPressure.value = F.prs.read.texture; gradM.uniforms.uVelocity.value = F.vel.read.texture; pass(gradM, F.vel.write); F.vel.swap();
      const A = advM.uniforms; A.texelSize.value.copy(st); A.velTexel.value.copy(st); A.dt.value = dt; A.shift.value.set(0, shiftY);
      A.uVelocity.value = F.vel.read.texture; A.uSource.value = F.vel.read.texture; A.dissipation.value = .25; pass(advM, F.vel.write); F.vel.swap();
      A.uVelocity.value = F.vel.read.texture; A.uSource.value = F.dye.read.texture; A.dissipation.value = .55; pass(advM, F.dye.write); F.dye.swap();
    };
    return F;
  })() : null;

  let sceneRT, reflRT, down = [], up = [];
  function allocate() {
    [sceneRT, reflRT, ...down, ...up].forEach(r => r && r.dispose());
    renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    sceneRT = RT(w, h, { depthBuffer: true, samples: lowTier ? 0 : 4 });
    reflRT = RT(w >> 1, h >> 1, { depthBuffer: true });
    down = []; up = [];
    let bw = w >> 1, bh = h >> 1;
    for (let i = 0; i < LEVELS; i++) { down.push(RT(bw, bh)); up.push(RT(bw, bh)); bw >>= 1; bh >>= 1; }
    if (fluid) fluid.alloc();
  }
  progress('render targets', .12);
  await nextFrame();

  /* ---------- procedural textures ---------- */
  const canvasTex = (w, h, draw, o = {}) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    draw(x, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.anisotropy = 8;
    if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
    t.redraw = () => { draw(x, w, h); t.needsUpdate = true; };
    return t;
  };
  const TEX = {};
  {
    // 2x2 twill carbon weave: albedo + normal from a height field
    const N = 256, TOW = 16, hgt = new Float32Array(N * N);
    const alb = document.createElement('canvas'); alb.width = alb.height = N; const ax = alb.getContext('2d'); const ai = ax.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x / TOW) | 0, v = (y / TOW) | 0, fx = (x % TOW) / TOW, fy = (y % TOW) / TOW;
      const hz = ((((u - v) % 4) + 4) % 4) < 2;
      const prof = hz ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
      const fib = hz ? Math.sin(y * 2.4 + u * 5.1) : Math.sin(x * 2.4 + v * 5.1);
      hgt[y * N + x] = .8 * Math.pow(prof, .55) + .05 * fib;
      const b = (hz ? 30 : 19) + 9 * prof + 3 * fib, i = (y * N + x) * 4;
      ai.data[i] = b * .92; ai.data[i + 1] = b * .96; ai.data[i + 2] = b * 1.08; ai.data[i + 3] = 255;
    }
    ax.putImageData(ai, 0, 0);
    const nor = document.createElement('canvas'); nor.width = nor.height = N; const nx = nor.getContext('2d'); const ni = nx.createImageData(N, N);
    const Hh = (x, y) => hgt[((y + N) % N) * N + ((x + N) % N)];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (Hh(x - 1, y) - Hh(x + 1, y)) * 2.2, dy = (Hh(x, y - 1) - Hh(x, y + 1)) * 2.2, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      ni.data[i] = (dx / l * .5 + .5) * 255; ni.data[i + 1] = (-dy / l * .5 + .5) * 255; ni.data[i + 2] = (1 / l * .5 + .5) * 255; ni.data[i + 3] = 255;
    }
    nx.putImageData(ni, 0, 0);
    const mk = (cv, rep, lin) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.colorSpace = lin ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    TEX.cfA = mk(alb, [2.4, 2.4]); TEX.cfN = mk(nor, [2.4, 2.4], true);
    TEX.cnA = mk(alb, [9, 5]); TEX.cnN = mk(nor, [9, 5], true);
  }
  TEX.rough = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = 'rgb(225,225,225)'; x.fillRect(0, 0, w, h); const r = rng(5);
    for (let i = 0; i < 900; i++) { const v = 190 + r() * 65 | 0; x.fillStyle = `rgba(${v},${v},${v},.18)`; x.beginPath(); x.arc(r() * w, r() * h, 2 + r() * 10, 0, 7); x.fill(); }
  }, { linear: true, repeat: [3, 6] });
  const liv = (x, w, h) => {
    x.fillStyle = '#E8ECEE'; x.fillRect(0, 0, w, h);
    const yf = v => (1 - v / 2.3) * h;  // booster station (0..2.3) to canvas y
    x.fillStyle = '#10151F';
    const r0 = yf(.86), r1 = yf(.45), r2 = yf(0);
    x.fillRect(0, r0, w * .25, r1 - r0); x.fillRect(w * .5, r0, w * .25, r1 - r0);
    x.fillRect(w * .25, r1, w * .25, r2 - r1); x.fillRect(w * .75, r1, w * .25, r2 - r1);
    x.fillStyle = '#E8622C'; x.fillRect(0, 26, w, 12); x.fillRect(0, r0 - 18, w, 6);
    x.fillStyle = '#10151F';
    for (let y = yf(2.2); y < yf(1.0); y += 20) x.fillRect(w * .5 - 18, y, ((y | 0) % 100 < 20) ? 36 : 18, 3);
    const name = (cx) => { x.save(); x.translate(cx + 44, yf(.95)); x.rotate(-Math.PI / 2); x.font = '800 104px Archivo, Arial, sans-serif'; if ('fontStretch' in x) x.fontStretch = 'expanded'; x.fillText('UNTITLED', 0, 0); x.restore(); };
    name(0); name(w);
    x.save(); x.translate(w * .75 + 10, yf(1.05)); x.rotate(-Math.PI / 2); x.font = '400 26px B612, Arial, sans-serif'; if ('fontStretch' in x) x.fontStretch = 'normal'; x.fillText('MK I   UR-001   REV P0', 0, 0); x.restore();
    x.fillStyle = '#F6F8F9'; x.strokeStyle = '#E8622C'; x.lineWidth = 4;
    const bx = w * .25 - 92, by = yf(1.6); x.fillRect(bx, by, 184, 96); x.strokeRect(bx, by, 184, 96);
    x.fillStyle = '#10151F'; x.font = '700 20px B612, Arial, sans-serif'; x.fillText('CAUTION', bx + 14, by + 30); x.font = '400 16px B612, Arial, sans-serif'; x.fillText('ROCKET MOTOR', bx + 14, by + 56); x.fillText('KEEP CLEAR', bx + 14, by + 78);
    x.beginPath(); x.arc(w * .5, yf(2.1), 9, 0, 7); x.fill();
  };
  TEX.livery = canvasTex(1024, 1792, liv);
  TEX.payliv = canvasTex(1024, 768, (x, w, h) => {
    x.fillStyle = '#E8ECEE'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#E8622C'; x.fillRect(0, h - 22, w, 10);
    x.fillStyle = '#10151F';
    const mk1 = cx => { x.font = '800 150px Archivo, Arial, sans-serif'; if ('fontStretch' in x) x.fontStretch = 'expanded'; x.textAlign = 'center'; x.fillText('MK I', cx, h * .58); x.textAlign = 'left'; };
    mk1(0); mk1(w);
    for (const u of [.1, .43, .77]) { x.beginPath(); x.arc(u * w, h - 48, 7, 0, 7); x.fill(); }
    x.beginPath(); x.arc(w * .5, h * .2, 9, 0, 7); x.fill();
    x.font = '400 22px B612, Arial, sans-serif'; if ('fontStretch' in x) x.fontStretch = 'normal'; x.fillText('MAIN CHUTE BAY', w * .5 - 90, h * .34);
  });
  TEX.band = canvasTex(1024, 128, (x, w, h) => {
    x.fillStyle = '#2B3038'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * .04})`; x.fillRect(0, Math.random() * h, w, 1); }
    x.fillStyle = '#E8622C'; x.fillRect(0, h / 2 - 3, w, 6);
    for (let i = 0; i < 6; i++) { const cx = (i + .5) / 6 * w + 40; x.fillStyle = '#9aa0a8'; x.beginPath(); x.arc(cx, h * .25, 8, 0, 7); x.fill(); x.fillStyle = '#2B3038'; x.fillRect(cx - 5, h * .25 - 1, 10, 2); }
    x.fillStyle = '#EEF2F4'; x.font = '700 22px B612, Arial, sans-serif'; x.fillText('ARM', 34, h * .82); x.fillText('ARM', w - 64 + 30, h * .82);
  });
  TEX.pcb = canvasTex(512, 1024, (x, w, h) => {
    x.fillStyle = '#0B0F14'; x.fillRect(0, 0, w, h);
    const r = rng(21); x.strokeStyle = '#C9A24A'; x.lineWidth = 3; x.lineCap = 'square';
    for (let i = 0; i < 70; i++) { let px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { if (r() < .5) px += (r() - .5) * 260; else py += (r() - .5) * 260; x.lineTo(px, py); } x.stroke(); }
    x.fillStyle = '#C9A24A'; for (let i = 0; i < 120; i++) x.fillRect(r() * w, r() * h, 8, 8);
    x.fillStyle = '#EEF2F4'; x.font = '400 22px B612, Arial, sans-serif'; x.fillText('UNTITLED ROCKETRY  AV-1', 28, h - 40); x.fillText('REV P0', 28, h - 14);
  });
  TEX.batt = canvasTex(256, 512, (x, w, h) => { x.fillStyle = '#1C2A44'; x.fillRect(0, 0, w, h); x.fillStyle = '#E8622C'; x.fillRect(0, h * .72, w, 28); x.fillStyle = '#EEF2F4'; x.font = '800 120px Archivo, Arial, sans-serif'; x.fillText('9V', 30, h * .5); });
  TEX.tag = canvasTex(64, 512, (x, w, h) => { x.fillStyle = '#C8102E'; x.fillRect(0, 0, w, h); x.save(); x.translate(w * .68, h - 16); x.rotate(-Math.PI / 2); x.fillStyle = '#FFFFFF'; x.font = '700 30px Archivo, Arial, sans-serif'; x.fillText('REMOVE BEFORE FLIGHT', 0, 0); x.restore(); });
  TEX.gores = canvasTex(512, 64, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#EEF2F4' : '#E8622C'; x.fillRect(i * w / 8, 0, w / 8 + 1, h); } });
  if (document.fonts) document.fonts.ready.then(() => [TEX.livery, TEX.payliv, TEX.band, TEX.pcb, TEX.batt, TEX.tag].forEach(t => t.redraw()));
  progress('textures', .3);
  await nextFrame();

  /* ---------- scene, environment, lights ---------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, .1, 400);
  let envTex;
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(14, 14, 14), new THREE.MeshBasicMaterial({ color: 0x080c18, side: THREE.BackSide })));
    const panel = (w, h, hex, k, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.rotation.set(...rot); s.add(m); };
    panel(10, 1.2, 0xffffff, 4, [0, 6.9, 0], [Math.PI / 2, 0, 0]);
    panel(1.2, 9, 0xffe4bf, 3, [-6.9, 0, 2], [0, Math.PI / 2, 0]);
    panel(.7, 9, 0x9cc8ff, 1.5, [6.9, .5, -2.5], [0, -Math.PI / 2, 0]);
    panel(.35, 9, 0xffffff, 1.8, [6.9, .5, 2.2], [0, -Math.PI / 2, 0]);
    panel(6, .5, 0xffffff, 1.4, [0, -1, 6.9], [0, 0, 0]);
    envTex = pm.fromScene(s, .04).texture; pm.dispose();
  }
  scene.environment = envTex;
  const world = new THREE.Group(); scene.add(world);
  const key = new THREE.DirectionalLight(0xfff0dc, 1.1); key.position.set(-4, 6, 6);
  const rim = new THREE.DirectionalLight(0x9cc8ff, 1.2); rim.position.set(6, 2, -5);
  const focusLight = new THREE.DirectionalLight(0xffffff, 0); focusLight.position.set(-3, 5, 9);
  scene.add(key, rim, focusLight, new THREE.AmbientLight(0x1b2740, .35));

  /* ---------- shader upgrades: blueprint scan, per-part keep, 3D-print reveal ---------- */
  const SCAN = { uScan: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uPrint: { value: 99 }, uMirror: { value: 0 }, uFloorY: { value: 0 } };
  const NOISE = `float ur_h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
    float ur_n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(mix(ur_h(i), ur_h(i + vec3(1,0,0)), f.x), mix(ur_h(i + vec3(0,1,0)), ur_h(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(ur_h(i + vec3(0,0,1)), ur_h(i + vec3(1,0,1)), f.x), mix(ur_h(i + vec3(0,1,1)), ur_h(i + vec3(1,1,1)), f.x), f.y), f.z); }\n`;
  function upgrade(m, keep, lines) {
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uScan: SCAN.uScan, uRes: SCAN.uRes, uPrint: SCAN.uPrint, uMirror: SCAN.uMirror, uFloorY: SCAN.uFloorY, uKeep: keep });
      sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      const head = 'uniform float uScan; uniform vec2 uRes; uniform float uPrint; uniform float uMirror; uniform float uFloorY; uniform float uKeep; varying vec3 vWp;\n' + NOISE;
      const common = `float wy_ = uMirror > .5 ? 2.0 * uFloorY - vWp.y : vWp.y;
        float pn_ = ur_n(vWp * 14.0) * .06;
        float sx_ = gl_FragCoord.x / uRes.x;
        float kn_ = ur_n(vWp * 9.0 + 3.1);
        bool bp_ = sx_ < uScan && kn_ >= uKeep;`;
      sh.fragmentShader = head + sh.fragmentShader.replace('#include <dithering_fragment>', lines
        ? `#include <dithering_fragment>
           ${common}
           bool gh_ = wy_ > uPrint + pn_ && uPrint < 50.;
           if (!bp_ && !gh_) discard;
           if (!bp_) gl_FragColor.a *= .32;`
        : `#include <dithering_fragment>
           ${common}
           if (wy_ > uPrint + pn_) discard;
           float band_ = 1.0 - smoothstep(0.0, .03, uPrint + pn_ - wy_);
           gl_FragColor.rgb += vec3(2.6, 1.1, .3) * band_ * 4.0 * step(uPrint, 50.0);
           if (bp_) gl_FragColor = vec4(0.0);
           else {
             gl_FragColor.rgb += vec3(.6, .85, 1.3) * 6.0 * (1.0 - smoothstep(0.0, 0.004, sx_ - uScan)) * step(0.0001, uScan) * step(uScan, 0.9999);
             if (sx_ < uScan) gl_FragColor.rgb += vec3(.6, .85, 1.3) * 3.0 * (1.0 - smoothstep(0.0, .05, abs(kn_ - uKeep))) * step(.01, uKeep) * step(uKeep, .99);
           }`);
    };
    m.customProgramCacheKey = () => lines ? 'urL' : 'urS';
  }
  const R = .21;
  const MATDEF = {
    paint: () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .3, roughnessMap: TEX.rough, clearcoat: .85, clearcoatRoughness: .22, vertexColors: true }),
    livery: () => new THREE.MeshPhysicalMaterial({ map: TEX.livery, roughness: .3, roughnessMap: TEX.rough, clearcoat: .85, clearcoatRoughness: .22, vertexColors: true }),
    payliv: () => new THREE.MeshPhysicalMaterial({ map: TEX.payliv, roughness: .3, roughnessMap: TEX.rough, clearcoat: .85, clearcoatRoughness: .22, vertexColors: true }),
    carbonFin: () => new THREE.MeshPhysicalMaterial({ map: TEX.cfA, normalMap: TEX.cfN, normalScale: new THREE.Vector2(.5, .5), roughness: .36, roughnessMap: TEX.rough, metalness: .2, clearcoat: 1, clearcoatRoughness: .16, vertexColors: true }),
    carbonNose: () => new THREE.MeshPhysicalMaterial({ map: TEX.cnA, normalMap: TEX.cnN, normalScale: new THREE.Vector2(.45, .45), roughness: .36, roughnessMap: TEX.rough, metalness: .2, clearcoat: 1, clearcoatRoughness: .16, vertexColors: true }),
    epoxy: () => new THREE.MeshPhysicalMaterial({ color: 0x161a21, roughness: .3, clearcoat: 1, clearcoatRoughness: .1, side: THREE.DoubleSide }),
    alu: () => new THREE.MeshPhysicalMaterial({ color: 0xcfd3d8, roughness: .24, metalness: 1 }),
    aluAniso: () => new THREE.MeshPhysicalMaterial({ color: 0xd2d6dc, roughness: .3, metalness: 1, anisotropy: .8, anisotropyRotation: Math.PI / 2 }),
    anod: () => new THREE.MeshPhysicalMaterial({ color: 0xE8622C, roughness: .28, metalness: .85, clearcoat: .3 }),
    graphite: () => new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: .6, metalness: .55 }),
    nozzle: () => new THREE.MeshStandardMaterial({ color: 0x1e2127, roughness: .62, metalness: .4, side: THREE.DoubleSide }),
    band: () => new THREE.MeshStandardMaterial({ map: TEX.band, roughness: .38, metalness: .65 }),
    black: () => new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: .42, metalness: .1 }),
    inner: () => new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: .8, side: THREE.BackSide }),
    g10: () => new THREE.MeshStandardMaterial({ color: 0x4b4d3e, roughness: .55, metalness: .05 }),
    kraft: () => new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: .8 }),
    fabric: () => new THREE.MeshPhysicalMaterial({ color: 0xE8622C, roughness: .9, sheen: 1, sheenRoughness: .45, sheenColor: new THREE.Color(0xffc0a0) }),
    fabricDark: () => new THREE.MeshPhysicalMaterial({ color: 0x3a6fa0, roughness: .9, sheen: 1, sheenRoughness: .45, sheenColor: new THREE.Color(0xbfe0ff) }),
    cord: () => new THREE.MeshPhysicalMaterial({ color: 0xFFB547, roughness: .85, sheen: .7, sheenColor: new THREE.Color(0xfff2c8) }),
    pcb: () => new THREE.MeshStandardMaterial({ map: TEX.pcb, roughness: .4, metalness: .35 }),
    chip: () => new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: .35, metalness: .2 }),
    batt: () => new THREE.MeshStandardMaterial({ map: TEX.batt, roughness: .5 }),
    grain: () => new THREE.MeshPhysicalMaterial({ color: 0xEAD9B5, roughness: .55, clearcoat: .3, sheen: .4, sheenColor: new THREE.Color(0xfff4d8) }),
    gores: () => new THREE.MeshPhysicalMaterial({ map: TEX.gores, roughness: .85, sheen: .8, sheenRoughness: .5, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide }),
    lines: () => new THREE.LineBasicMaterial({ color: C.chalk.clone().multiplyScalar(1.5), transparent: true, depthWrite: false }),
  };
  function matSet(up) {
    const keep = { value: 0 }, cache = {}, all = [];
    const get = n => {
      if (!up && n === 'lines') return null;
      if (!cache[n]) {
        const m = MATDEF[n]();
        if (!m.isLineBasicMaterial) { m.polygonOffset = true; m.polygonOffsetFactor = 2; m.polygonOffsetUnits = 4; }
        if (up) upgrade(m, keep, m.isLineBasicMaterial);
        cache[n] = m; all.push(m);
      }
      return cache[n];
    };
    return { get, keep, all };
  }

  /* ---------- geometry helpers ---------- */
  const lathe = (fn, n, segs) => { const pts = []; for (let i = 0; i <= n; i++) pts.push(fn(i / n)); return new THREE.LatheGeometry(pts, segs); };
  const cyl = (r, h, y0, segs, open = true, hs = 1, rt = r) => { const g = new THREE.CylinderGeometry(rt, r, h, segs, hs, open); g.translate(0, y0 + h / 2, 0); return g; };
  const seg = lo => lo ? 16 : 96;
  function withAO(geo, fn) { const p = geo.attributes.position, n = p.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const v = fn ? fn(p.getX(i), p.getY(i), p.getZ(i)) : 1; a[i * 3] = a[i * 3 + 1] = a[i * 3 + 2] = v; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; }
  function mesh(g, geo, mat, pos, rot) { const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); g.add(m); return m; }
  function edges(g, geo, L, ang = 1, pos, rot) { if (!L) return null; const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, ang), L); if (pos) l.position.set(...pos); if (rot) l.rotation.set(...rot); l.scale.set(1.012, 1.002, 1.012); g.add(l); return l; }
  class Helix extends THREE.Curve { constructor(r, y0, y1, turns) { super(); this.r = r; this.y0 = y0; this.y1 = y1; this.turns = turns; } getPoint(t, o = new THREE.Vector3()) { const a = t * this.turns * Math.PI * 2; return o.set(Math.cos(a) * this.r, lerp(this.y0, this.y1, t), Math.sin(a) * this.r); } }
  const coilGeo = (r, tr, y0, y1, turns, lo) => new THREE.TubeGeometry(new Helix(r, y0, y1, turns), lo ? 60 : 220, tr, lo ? 4 : 8, false);
  const ringGeo = (ri, ro, y0, h, lo) => new THREE.LatheGeometry([new THREE.Vector2(ri, y0), new THREE.Vector2(ro, y0), new THREE.Vector2(ro, y0 + h), new THREE.Vector2(ri, y0 + h), new THREE.Vector2(ri, y0)], lo ? 16 : 64);
  const FIN_TH = [1, 3, 5, 7].map(k => k * Math.PI / 4);
  function finAO(x, y, z) {
    const th = Math.atan2(x, z); let dm = 9;
    for (const a of FIN_TH) dm = Math.min(dm, Math.abs(((th - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
    const inFin = sstep(.01, .08, y) * (1 - sstep(.82, .9, y));
    return 1 - .55 * Math.exp(-Math.pow(dm * R / .03, 2)) * inFin;
  }
  function finGeo() {
    const s = new THREE.Shape();
    s.moveTo(0, .06); s.lineTo(.40, .10); s.lineTo(.40, .48); s.lineTo(0, .84); s.lineTo(0, .78); s.lineTo(-.112, .78); s.lineTo(-.112, .12); s.lineTo(0, .12); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: .02, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 3, curveSegments: 1 });
    geo.translate(0, 0, -.01);
    return withAO(geo, x => x < -.004 ? .45 : 1 - .42 * Math.exp(-x / .028));
  }
  function filletGeo(side) {
    const N = 28, S = 6, th = .016, rf = .026, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, y = lerp(.075, .825, t), r = rf * Math.pow(Math.sin(Math.PI * t), .35);
      for (let j = 0; j <= S; j++) {
        const a = Math.PI + (Math.PI / 2) * (j / S);
        let x = r + r * Math.cos(a); const z = side * (th + r + r * Math.sin(a));
        x += (Math.sqrt(Math.max(0, R * R - z * z)) - R) * (1 - j / S);
        pos.push(R + x, y, z);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) { const a = i * (S + 1) + j, b = a + S + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }

  /* ---------- part builders (shared by the hero rocket, card scenes and thumbnails) ---------- */
  function buildNose(get, L, lo) {
    const g = new THREE.Group();
    const NL = 1.5, rho = (R * R + NL * NL) / (2 * R), TT = .965;
    const og = t => { const h = t * TT * NL, x = NL - h; return new THREE.Vector2(Math.max(.0004, Math.sqrt(Math.max(0, rho * rho - (NL - x) ** 2)) + R - rho), h); };
    mesh(g, withAO(lathe(og, lo ? 12 : 64, seg(lo)), (x, y) => 1 - .35 * Math.exp(-y / .025)), get('carbonNose'));
    edges(g, lathe(og, 10, 16), L);
    const rt = og(1).x;
    mesh(g, new THREE.ConeGeometry(rt, NL * (1 - TT), 32).translate(0, NL * TT + NL * (1 - TT) / 2, 0), get('alu'));
    mesh(g, cyl(R * .955, .26, -.26, seg(lo)), get('black'));
    edges(g, cyl(R * .955, .26, -.26, 16), L);
    return { g, anchors: { tip: new THREE.Vector3(0, NL, 0), a: new THREE.Vector3(R * .55, .55, 0) } };
  }
  function buildPayload(get, L, lo) {
    const g = new THREE.Group();
    mesh(g, withAO(cyl(R, 1, 0, seg(lo), true, 8), (x, y) => 1 - .3 * Math.exp(-y / .02) - .3 * Math.exp(-(1 - y) / .02)), get('payliv'));
    edges(g, cyl(R, 1, 0, 16), L);
    mesh(g, cyl(R * .975, 1, 0, seg(lo)), get('inner'));
    const sub = new THREE.Group(); g.add(sub);
    mesh(sub, new THREE.CapsuleGeometry(.165, .32, 8, lo ? 12 : 32).translate(0, .55, 0), get('fabric'));
    edges(sub, new THREE.CapsuleGeometry(.165, .32, 2, 12).translate(0, .55, 0), L, 20);
    mesh(sub, coilGeo(.12, .012, .08, .3, 4.5, lo), get('cord'));
    return { g, subs: [{ g: sub, dir: DOWN, dist: .85 }], anchors: { a: new THREE.Vector3(0, .5, R) } };
  }
  function buildAvbay(get, L, lo) {
    const g = new THREE.Group();
    mesh(g, cyl(R * 1.004, .12, 0, seg(lo), false), get('band')); edges(g, cyl(R * 1.004, .12, 0, 16, false), L);
    mesh(g, cyl(R * .965, .62, -.25, seg(lo), true), get('g10')); edges(g, cyl(R * .965, .62, -.25, 16, true), L);
    for (const [y, s] of [[-.268, -1], [.37, 1]]) {
      mesh(g, cyl(R * .965, .018, y, lo ? 16 : 64, false), get('g10'));
      const ub = new THREE.TorusGeometry(.035, .006, 8, 24, Math.PI); if (s < 0) ub.rotateZ(Math.PI); ub.translate(0, s > 0 ? y + .018 : y, 0);
      mesh(g, ub, get('alu'));
    }
    mesh(g, new THREE.CylinderGeometry(.017, .017, .012, 24).rotateX(Math.PI / 2).translate(0, .06, R + .005), get('black'));
    mesh(g, new THREE.BoxGeometry(.006, .022, .012).translate(0, .06, R + .015), get('alu'));
    for (const x of [-.155, .155]) mesh(g, cyl(.008, .64, -.27, 12).translate(x, 0, 0), get('alu'));
    const sled = new THREE.Group(); g.add(sled);
    mesh(sled, new THREE.BoxGeometry(.27, .5, .012).translate(0, .06, 0), get('pcb'));
    edges(sled, new THREE.BoxGeometry(.27, .5, .012).translate(0, .06, 0), L, 20);
    for (const [x, y, w, h] of [[-.05, .2, .09, .07], [.065, .21, .07, .05], [0, .06, .15, .05], [-.08, -.05, .05, .04]]) mesh(sled, new THREE.BoxGeometry(w, h, .012).translate(x, y + .06, .012), get('chip'));
    mesh(sled, new THREE.BoxGeometry(.1, .15, .045).translate(.055, -.06, .03), get('batt'));
    return { g, subs: [{ g: sled, dir: UP, dist: .62 }], anchors: { a: new THREE.Vector3(0, .06, R) } };
  }
  function buildBooster(get, L, lo) {
    const g = new THREE.Group();
    mesh(g, withAO(cyl(R, 2.3, 0, lo ? 16 : 128, true, lo ? 1 : 48), (x, y, z) => finAO(x, y, z) * (1 - .3 * Math.exp(-(2.3 - y) / .02))), get('livery'));
    edges(g, cyl(R, 2.3, 0, 16), L);
    mesh(g, cyl(R * .975, 2.3, 0, seg(lo)), get('inner'));
    const fin = finGeo(), finE = new THREE.EdgesGeometry(fin, 30), fa = lo ? null : filletGeo(1), fb = lo ? null : filletGeo(-1);
    const finAnch = [];
    for (let k = 0; k < 4; k++) {
      const h = new THREE.Group(); h.rotation.y = (2 * k + 1) * Math.PI / 4 - Math.PI / 2; g.add(h);
      mesh(h, fin, get('carbonFin'), [R, 0, 0]);
      if (L) { const l = new THREE.LineSegments(finE, L); l.position.set(R, 0, 0); h.add(l); }
      if (fa) { mesh(h, fa, get('epoxy')); mesh(h, fb, get('epoxy')); }
      const a = new THREE.Object3D(); a.position.set(R + .4, .3, 0); h.add(a); finAnch.push(a);
    }
    for (const y of [.45, 1.95]) {
      mesh(g, new THREE.CylinderGeometry(.02, .02, .022, 20).rotateZ(Math.PI / 2).translate(R + .011, y, 0), get('black'));
      mesh(g, new THREE.CylinderGeometry(.03, .03, .008, 24).rotateZ(Math.PI / 2).translate(R + .024, y, 0), get('black'));
    }
    mesh(g, cyl(.098, 1.64, -.02, lo ? 12 : 48), get('kraft')); edges(g, cyl(.098, 1.64, -.02, 12), L);
    for (const y of [.02, .9, 1.58]) mesh(g, ringGeo(.098, R * .97, y, .02, lo), get('g10'));
    mesh(g, cyl(.112, .05, -.04, 48, false), get('alu'));
    const sub = new THREE.Group(); g.add(sub);
    mesh(sub, new THREE.CapsuleGeometry(.155, .22, 8, lo ? 12 : 32).translate(0, 1.86, 0), get('fabricDark'));
    mesh(sub, coilGeo(.11, .011, 2.02, 2.22, 3.5, lo), get('cord'));
    return { g, subs: [{ g: sub, dir: UP, dist: .75 }], anchors: { a: new THREE.Vector3(0, 1.55, R) }, finAnch };
  }
  function buildMotor(get, L, lo) {
    const g = new THREE.Group();
    mesh(g, cyl(.085, 1.55, 0, seg(lo), true), get('aluAniso')); edges(g, cyl(.085, 1.55, 0, 12), L);
    const fwd = new THREE.Group(); g.add(fwd);
    mesh(fwd, cyl(.088, .07, 1.55, lo ? 16 : 48, false), get('anod')); mesh(fwd, cyl(.032, .02, 1.62, 6, false), get('alu'));
    edges(fwd, cyl(.088, .07, 1.55, 12, false), L);
    const aft = new THREE.Group(); g.add(aft);
    mesh(aft, cyl(.088, .05, -.05, lo ? 16 : 48, false), get('anod')); edges(aft, cyl(.088, .05, -.05, 12, false), L);
    const noz = t => { const y = -.045 - t * .16, th = .42; const r = t < th ? .07 - .038 * (t / th) : .032 + .05 * Math.pow((t - th) / (1 - th), .8); return new THREE.Vector2(r, y); };
    mesh(aft, lathe(noz, 24, lo ? 12 : 48), get('nozzle')); edges(aft, lathe(noz, 5, 12), L);
    mesh(g, cyl(.0875, .006, .012, 32, true), get('black'));
    const tail = new THREE.Object3D(); tail.position.set(0, -.205, 0); aft.add(tail);
    return { g, subs: [{ g: fwd, dir: UP, dist: .2 }, { g: aft, dir: DOWN, dist: .28 }], anchors: { a: new THREE.Vector3(0, .55, .085) }, aft, tail };
  }
  const PARTDEF = [
    { k: 'nose', y: 3.42, dir: UP, dist: 1.1, build: buildNose, center: 4.17 },
    { k: 'pay', y: 2.42, dir: UP, dist: .65, build: buildPayload, center: 2.92 },
    { k: 'av', y: 2.30, dir: UP, dist: .32, build: buildAvbay, center: 2.36 },
    { k: 'boost', y: 0, dir: UP, dist: 0, build: buildBooster, center: 1.15 },
    { k: 'motor', y: 0, dir: DOWN, dist: 1.4, build: buildMotor, center: .75 },
  ];
  const STACK_Y = -2.46;
  const rest = (fy, s) => fy + 2.74 * s;
  progress('model', .45);
  await nextFrame();

  /* ---------- hero rocket ---------- */
  const pivot = new THREE.Group(); pivot.rotation.order = 'YXZ';
  const spinner = new THREE.Group(), stack = new THREE.Group(); stack.position.y = STACK_Y;
  pivot.add(spinner); spinner.add(stack); world.add(pivot);
  const parts = PARTDEF.map(d => {
    const ms = matSet(true), b = d.build(ms.get, ms.get('lines'), false);
    b.g.position.y = d.y; stack.add(b.g);
    const anchors = {}; for (const k in b.anchors || {}) { const o = new THREE.Object3D(); o.position.copy(b.anchors[k]); b.g.add(o); anchors[k] = o; }
    return { ...d, ...b, anchors, ms, base: new THREE.Vector3(0, d.y, 0), spin: 0, subs: (b.subs || []).map(s => ({ ...s, base: s.g.position.clone() })) };
  });
  const [pNose, pPay, pAv, pBoost, pMotor] = parts;
  const sAnchor = (y) => { const o = new THREE.Object3D(); o.position.set(0, y, 0); stack.add(o); return o; };
  const UPM = 5.12 / 1.56;
  const aCG = sAnchor(4.92 - .95 * UPM), aCP = sAnchor(4.92 - 1.12 * UPM);
  const tagU = { uTime: { value: 0 } };
  const tagGeo = new THREE.PlaneGeometry(.042, .5, 1, 24); tagGeo.translate(0, -.25, 0);
  const tagMat = new THREE.MeshStandardMaterial({ map: TEX.tag, roughness: .85, side: THREE.DoubleSide, transparent: true });
  tagMat.onBeforeCompile = sh => { sh.uniforms.uTime = tagU.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float k_ = -position.y / .5; transformed.z += (sin(uTime * 2.1 + k_ * 3.) * .03 + .045) * k_ * k_; transformed.x += sin(uTime * 1.3 + k_ * 2.) * .025 * k_;`); };
  const tag = new THREE.Mesh(tagGeo, tagMat); tag.position.set(0, .05, R + .022); pAv.g.add(tag);
  // plume
  const flameVS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
  const flameFS = `uniform float uTime; uniform float uAmt; uniform float uGain; uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uEdge;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    void main(){
      float v = vUv.y; float facing = dot(vN, vN) > 1e-8 ? abs(dot(normalize(vN), normalize(vV))) : 0.;
      float n = n2(vec2(vUv.x * 7., v * 7. - uTime * 9.)) * .6 + n2(vec2(vUv.x * 15., v * 19. - uTime * 17.)) * .4;
      float body = pow(facing, 1.4) * smoothstep(1.0, .08, v + (n - .5) * .35);
      float diamonds = smoothstep(.6, 1., sin(v * 46. - 1.2 - uTime * 2.)) * smoothstep(.42, .04, v);
      float b = clamp(body + diamonds * .45 * facing, 0., 1.4);
      vec3 col = mix(uEdge, uMid, smoothstep(0., .55, b)); col = mix(col, uCore, smoothstep(.55, 1.05, b));
      float a = b * uAmt * uGain; gl_FragColor = vec4(col * a, a * .15);
    }`;
  const plume = (len, rmax) => lathe(t => new THREE.Vector2((.06 + (rmax - .06) * Math.min(1, t / .35)) * Math.pow(1 - t, .7) + .0005, -t * len), 32, 40);
  const fMat = (gain, core, mid, edge) => new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uGain: { value: gain }, uCore: { value: core }, uMid: { value: mid }, uEdge: { value: edge } },
    vertexShader: flameVS, fragmentShader: flameFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const outerMat = fMat(1.6, new THREE.Color(1.6, 1.25, .8), C.flame.clone().multiplyScalar(1.2), C.ember.clone().multiplyScalar(.6));
  const innerMat = fMat(3.2, new THREE.Color(2.4, 2.2, 1.9), new THREE.Color(1.8, 1.4, .8), C.flame.clone());
  const flame = new THREE.Group();
  flame.add(new THREE.Mesh(plume(2.4, .2), outerMat), new THREE.Mesh(plume(1.2, .09), innerMat));
  pMotor.tail.add(flame);
  const tailLight = new THREE.PointLight(0xffa040, 0, 7, 1.4); tailLight.position.set(0, -.5, 0); pMotor.tail.add(tailLight);

  /* ---------- launch pad: floor, plate, rail, spotlight, dust, igniter ---------- */
  const padSet = new THREE.Group(); world.add(padSet);
  const padMats = [];
  const pmk = p => { const m = new THREE.MeshStandardMaterial({ ...p, transparent: true }); padMats.push(m); return m; };
  mesh(padSet, cyl(.6, .06, 0, 64, false, 1, .56), pmk({ color: 0x1f242c, roughness: .35, metalness: .9 }));
  mesh(padSet, cyl(.16, .012, .06, 32, false), pmk({ color: 0x3a3f47, roughness: .5, metalness: .6 }));
  const railShape = new THREE.Shape(); { const s = .025, sl = .006, sd = .008;
    [[-s, -s], [-sl, -s], [-sl, -s + sd], [sl, -s + sd], [sl, -s], [s, -s], [s, -sl], [s - sd, -sl], [s - sd, sl], [s, sl], [s, s], [sl, s], [sl, s - sd], [-sl, s - sd], [-sl, s], [-s, s], [-s, sl], [-s + sd, sl], [-s + sd, -sl], [-s, -sl]]
      .forEach(([x, y], i) => i ? railShape.lineTo(x, y) : railShape.moveTo(x, y)); railShape.closePath(); }
  const railGeo = new THREE.ExtrudeGeometry(railShape, { depth: 7.4, bevelEnabled: false }); railGeo.rotateX(-Math.PI / 2);
  mesh(padSet, railGeo, pmk({ color: 0x101317, roughness: .8, metalness: .25 }), [R + .037, .06, 0]);
  mesh(padSet, new THREE.BoxGeometry(.2, .3, .2).translate(R + .037, .21, 0), pmk({ color: 0x2a2f37, roughness: .4, metalness: .8 }));
  { const sm = pmk({ color: 0x2a2f37, roughness: .4, metalness: .8 });
    for (const [dx, dz] of [[.9, .5], [.9, -.55], [-.1, -.8]]) {
      const from = new THREE.Vector3(R + .037 + dx, 0, dz), dir = new THREE.Vector3(R + .037, 1.4, 0).sub(from), len = dir.length();
      const geo = new THREE.CylinderGeometry(.012, .012, len, 8); geo.translate(0, len / 2, 0);
      const m = mesh(padSet, geo, sm); m.position.copy(from); m.quaternion.setFromUnitVectors(UP, dir.normalize());
    } }
  for (const [col, o] of [[0xC8102E, .008], [0x111111, -.008]]) {
    const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(o, .1, 0), new THREE.Vector3(o + .03, .085, .04), new THREE.Vector3(.16, .075, .2 + o), new THREE.Vector3(.42, .066, .34 + o)]);
    mesh(padSet, new THREE.TubeGeometry(cv, 24, .0045, 6, false), pmk({ color: col, roughness: .5 }));
  }
  const spot = new THREE.SpotLight(0xfff1de, 0, 18, .34, .65, 1.1); spot.position.set(0, 9.5, .6); spot.target.position.set(0, 0, 0); padSet.add(spot, spot.target);
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vP;
      void main(){ vH = position.y / 10.; vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vP;
      void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float edge = pow(f, 2.6);
        float hgt = smoothstep(0., .22, vH) * (.3 + .7 * vH);
        float ang = atan(vP.z, vP.x); float streak = .7 + .3 * sin(ang * 9. + vH * 4. + uTime * .25) * sin(ang * 4.1 - uTime * .17);
        float a = edge * hgt * streak * uI * .28; gl_FragColor = vec4(vec3(1.0, .92, .8) * a, a * .1); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const coneGeo = new THREE.CylinderGeometry(.16, 2.5, 10, 72, 1, true); coneGeo.translate(0, 5, 0);
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.position.z = .3; padSet.add(cone);
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(.2, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7.4, 6.4), transparent: true }));
  lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 9.95, .3); padSet.add(lamp);
  const DN = lowTier ? 260 : 600, dpos = new Float32Array(DN * 3), dseed = new Float32Array(DN), drr = rng(9);
  for (let i = 0; i < DN; i++) { const y = drr() * 8, rad = Math.sqrt(drr()) * (2.5 - y * .2), a = drr() * 6.283; dpos[i * 3] = Math.cos(a) * rad; dpos[i * 3 + 1] = y; dpos[i * 3 + 2] = Math.sin(a) * rad + .3; dseed[i] = drr(); }
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dGeo.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uI: { value: 0 }, uScale: { value: 400 } },
    vertexShader: `attribute float aSeed; uniform float uTime; uniform float uScale; varying float vA;
      void main(){ vec3 p = position; float t = uTime * (.04 + aSeed * .06);
        p.y = mod(p.y + t * 3., 8.); p.x += sin(uTime * .3 + aSeed * 40.) * .18; p.z += cos(uTime * .25 + aSeed * 31.) * .18;
        float coneR = mix(2.5, .16, p.y / 10.); float inside = smoothstep(coneR, coneR * .4, length(p.xz - vec2(0., .3)));
        vA = inside * (.55 + .45 * sin(uTime * (1. + aSeed * 2.) + aSeed * 60.)) * smoothstep(0., .6, p.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_PointSize = (1. + aSeed * 2.4 + step(.97, aSeed) * 8.) * uScale * .011 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI; varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d) * vA * uI * 1.6; gl_FragColor = vec4(vec3(1., .93, .82) * a, a * .2); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dGeo, dustMat); dust.frustumCulled = false; padSet.add(dust);
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uRefl: { value: blackTex }, uRes: { value: new THREE.Vector2(1, 1) }, uVis: { value: 0 }, uPool: { value: 1 }, uScale: { value: 1 }, uTint: { value: new THREE.Color(1, .93, .82) }, uGlow: { value: 0 }, uDawn: { value: 0 }, uDawnCol: { value: C.ember.clone() } },
    vertexShader: `varying vec2 vL; void main(){ vL = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform sampler2D uRefl; uniform vec2 uRes; uniform float uVis; uniform float uPool; uniform float uScale; uniform vec3 uTint; uniform float uGlow; uniform float uDawn; uniform vec3 uDawnCol; varying vec2 vL;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      void main(){
        vec2 q = vL / uScale; float d = length(q - vec2(0., -.3));
        float fade = smoothstep(9., 1.2, d);
        vec2 suv = gl_FragCoord.xy / uRes; float j = (h(gl_FragCoord.xy) - .5) * .004;
        vec3 refl = (texture2D(uRefl, suv + vec2(j, .002)).rgb + texture2D(uRefl, suv + vec2(-j, .006)).rgb + texture2D(uRefl, suv + vec2(.003, .011)).rgb) / 3.;
        float pool = exp(-d * d * .28) * uPool;
        float shadow = 1. - .8 * exp(-pow(length(q), 2.) * 5.);
        vec2 g = abs(fract(q * 1.25 - .5) - .5) / fwidth(q * 1.25); float line = 1. - min(min(g.x, g.y), 1.);
        vec3 col = uTint * (pool * .55 + .015) * shadow + refl * (.42 + pool * .25) + vec3(.8, .9, 1.) * line * .05 * smoothstep(7., 2., d)
          + vec3(1., .45, .15) * uGlow * exp(-d * d * .5) * .9 + uDawnCol * uDawn * .05 * smoothstep(8., 0., d);
        float a = fade * uVis; gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, premultipliedAlpha: true,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat); floor.rotation.x = -Math.PI / 2; scene.add(floor);

  /* ---------- static test stand ---------- */
  const stand = new THREE.Group(); world.add(stand);
  const standMats = [];
  const smk = p => { const m = new THREE.MeshStandardMaterial({ ...p, transparent: true }); standMats.push(m); return m; };
  const sGraph = smk({ color: 0x23272e, roughness: .5, metalness: .7 }), sAlu = smk({ color: 0xb8bdc4, roughness: .3, metalness: 1 }), sEmb = smk({ color: 0xE8622C, roughness: .4, metalness: .5 });
  mesh(stand, new THREE.BoxGeometry(2.1, .05, .62).translate(.1, -.13, 0), sGraph);
  for (const z of [-.2, .2]) mesh(stand, new THREE.BoxGeometry(2.1, .03, .04).translate(.1, -.09, z), sAlu);
  for (const x of [-.45, .55]) {
    const t = new THREE.TorusGeometry(.105, .014, 8, 32, Math.PI); t.rotateY(Math.PI / 2); mesh(stand, t.translate(x, .1, 0), sAlu);
    for (const z of [-.105, .105]) mesh(stand, new THREE.BoxGeometry(.04, .22, .03).translate(x, -.01, z), sGraph);
  }
  mesh(stand, new THREE.BoxGeometry(.05, .4, .36).translate(1.08, .08, 0), sGraph);
  mesh(stand, new THREE.BoxGeometry(.1, .06, .06).translate(.98, .1, 0), sEmb);
  mesh(stand, new THREE.BoxGeometry(.14, .34, .3).translate(1.18, .06, 0), sGraph);
  { const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(.98, .07, .03), new THREE.Vector3(1.05, -.06, .3), new THREE.Vector3(1.5, -.1, .6), new THREE.Vector3(2.2, -.12, .9)]); mesh(stand, new THREE.TubeGeometry(cv, 30, .008, 6, false), smk({ color: 0x111317, roughness: .6 })); }
  const standMount = new THREE.Object3D(); standMount.position.set(-.68, .1, 0); standMount.rotation.z = -Math.PI / 2; stand.add(standMount);

  /* ---------- light ribbons: the three thrust curves drawn in space ---------- */
  const ribbons = new THREE.Group(); world.add(ribbons);
  const ribVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
  const ribFS = `uniform vec3 uColor; uniform float uHead; uniform float uOn; uniform float uVis; uniform float uTime; varying vec2 vUv;
    void main(){ float x = vUv.x; float behind = step(x, uHead); float tail = exp(-(uHead - x) * 7.) * behind;
      float head = exp(-pow((x - uHead) * 70., 2.)); float flow = .55 + .45 * sin(x * 90. - uTime * 7.);
      float a = (.3 * behind * flow + tail * 1.1 + head * 4.) * uVis * mix(.35, 1., uOn); gl_FragColor = vec4(uColor * a, 0.); }`;
  const ribMats = {};
  for (const k of ['a', 'b', 'c']) {
    const f = FORMS[k], pts = [];
    for (let i = 0; i < f.pts.length; i += 1) { const [t, F] = f.pts[i]; pts.push(new THREE.Vector3(-9.5 + t / TMAX * 19, F / FMAX * 5.2, Math.sin(t * 2.6 + k.charCodeAt(0)) * .6)); }
    pts.push(new THREE.Vector3(10, 0, 0));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const col = k === 'a' ? C.flame.clone().multiplyScalar(2.2) : k === 'b' ? C.chalk.clone().multiplyScalar(1.4) : C.steel.clone().multiplyScalar(1.8);
    const m = new THREE.ShaderMaterial({ uniforms: { uColor: { value: col }, uHead: { value: 1 }, uOn: { value: k === 'a' ? 1 : 0 }, uVis: { value: 0 }, uTime: { value: 0 } }, vertexShader: ribVS, fragmentShader: ribFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    addBlend(m); ribMats[k] = m; ribbons.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 360, .018, 6, false), m));
  }

  /* ---------- embers ---------- */
  const EN = lowTier ? 160 : 380, eSeed = new Float32Array(EN), eRand = new Float32Array(EN * 3), er = rng(31);
  for (let i = 0; i < EN; i++) { eSeed[i] = er(); eRand[i * 3] = er() * 2 - 1; eRand[i * 3 + 1] = er(); eRand[i * 3 + 2] = er() * 2 - 1; }
  const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EN * 3), 3)); eGeo.setAttribute('aSeed', new THREE.BufferAttribute(eSeed, 1)); eGeo.setAttribute('aRand', new THREE.BufferAttribute(eRand, 3));
  const emberMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uScale: { value: 400 }, uOrigin: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(-1, 0, 0) } },
    vertexShader: `attribute float aSeed; attribute vec3 aRand; uniform float uTime; uniform float uAmt; uniform float uScale; uniform vec3 uOrigin; uniform vec3 uDir; varying float vA;
      void main(){ float life = fract(uTime * (.35 + aSeed * .5) + aSeed * 13.7);
        vec3 side = normalize(cross(uDir, vec3(0., 0., 1.)) + vec3(.0001));
        vec3 p = uOrigin + uDir * (life * (2.2 + aSeed * 3.2)) + side * aRand.x * (.15 + life * 1.1) + vec3(0., 1., 0.) * life * life * (.5 + aRand.y * 1.2) + vec3(0., 0., 1.) * aRand.z * life * .8;
        vA = (1. - life) * smoothstep(0., .06, life) * uAmt * (.35 + aSeed);
        vec4 mv = viewMatrix * vec4(p, 1.); gl_PointSize = (1.2 + aSeed * 2.4) * uScale * .011 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d) * vA; gl_FragColor = vec4(mix(vec3(2.6, 1.2, .35), vec3(3.2, 2.6, 1.7), vA) * a * .8, 0.); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  addBlend(emberMat);
  const embers = new THREE.Points(eGeo, emberMat); embers.frustumCulled = false; scene.add(embers);

  /* ---------- 3D smoke trail (ascent) ---------- */
  const SMN = lowTier ? 180 : 360;
  const sPos = new Float32Array(SMN * 3), sVel = new Float32Array(SMN * 3), sAge = new Float32Array(SMN), sLife = new Float32Array(SMN), sSize = new Float32Array(SMN), sSeed = new Float32Array(SMN);
  sAge.fill(1); { const r = rng(77); for (let i = 0; i < SMN; i++) sSeed[i] = r(); }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); sGeo.setAttribute('aAge', new THREE.BufferAttribute(sAge, 1)); sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1)); sGeo.setAttribute('aSeed', new THREE.BufferAttribute(sSeed, 1));
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { uVis: { value: 1 }, uScale: { value: 400 }, uHot: { value: new THREE.Color(.9, .42, .16) }, uCool: { value: new THREE.Color(.13, .15, .19) }, uLight: { value: 1 } },
    vertexShader: `attribute float aAge; attribute float aSize; attribute float aSeed; uniform float uScale; varying float vAge; varying float vSeed;
      void main(){ vAge = aAge; vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = aAge >= 1. ? 0. : aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uHot; uniform vec3 uCool; uniform float uLight; uniform float uVis; varying float vAge; varying float vSeed;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){ vec2 p = gl_PointCoord - .5; float d = length(p) * 2.;
        float n = n2(p * 4. + vSeed * 17.) * .6 + n2(p * 9. - vSeed * 11.) * .4;
        float a = smoothstep(1., .15, d + (n - .5) * .5) * pow(1. - vAge, 1.4) * smoothstep(0., .06, vAge) * .5 * uVis;
        vec3 c = mix(uHot, uCool * uLight, smoothstep(.0, .18, vAge)); gl_FragColor = vec4(c * a, a); }`,
    transparent: true, depthWrite: false, premultipliedAlpha: true,
  });
  const smoke = new THREE.Points(sGeo, smokeMat); smoke.frustumCulled = false; world.add(smoke);
  let sHead = 0, sAcc = 0;

  /* ---------- clouds and parachute (flight) ---------- */
  const clouds = new THREE.Group(); scene.add(clouds);
  const cloudMats = [];
  { const r = rng(55);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.ShaderMaterial({ uniforms: { uVis: { value: 0 }, uSeed: { value: r() * 10 }, uSun: { value: new THREE.Color(1.25, .82, .62) }, uShade: { value: new THREE.Color(.2, .25, .36) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: `uniform float uVis; uniform float uSeed; uniform vec3 uSun; uniform vec3 uShade; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
          float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
          void main(){ vec2 p = vUv - .5; float r = length(p * vec2(1., 1.7)); float base = smoothstep(.5, .08, r);
            float f = fbm(vUv * 3.4 + uSeed * 9.); float dens = smoothstep(.32, .72, f * base * 1.7);
            float lit = clamp(.5 + (fbm(vUv * 3.4 + uSeed * 9. + vec2(-.05, .07)) - f) * 4., 0., 1.);
            vec3 col = mix(uShade, uSun, lit * (.55 + vUv.y * .55)); float a = dens * uVis * .9; gl_FragColor = vec4(col * a, a); }`,
        transparent: true, depthWrite: false, premultipliedAlpha: true });
      cloudMats.push(m);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
      s.userData.base = new THREE.Vector3(-14 + r() * 30, 7 + i * 1.9 + r() * 2, -10 + r() * 11); s.scale.set(7 + r() * 10, 3.2 + r() * 3.4, 1);
      clouds.add(s);
    } }
  const chuteMs = matSet(false);
  const chute = new THREE.Group(); world.add(chute);
  { const prof = t => { const a = t * 1.32; return new THREE.Vector2(Math.sin(a) * 1.15 + .001, Math.cos(a) * .75); };
    mesh(chute, lathe(prof, 24, 64), chuteMs.get('gores'));
    const rimP = prof(1), pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; pts.push(Math.sin(a) * rimP.x, rimP.y, Math.cos(a) * rimP.x, 0, -2.3, 0); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    chute.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(.8, .84, .9) }))); }
  chute.visible = false;

  /* ---------- stars ---------- */
  const starGeo = new THREE.BufferGeometry(); { const n = lowTier ? 400 : 900, sp = new Float32Array(n * 3), r = rng(42);
    for (let i = 0; i < n; i++) { sp[i * 3] = (r() - .5) * 60; sp[i * 3 + 1] = (r() - .5) * 70; sp[i * 3 + 2] = -14 - r() * 30; }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3)); }
  const starMat = new THREE.PointsMaterial({ color: C.chalk, size: 1.4, sizeAttenuation: false, transparent: true, opacity: .55, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat); scene.add(stars);
  progress('scene', .6);
  await nextFrame();

  /* ---------- card scenes (build sequence) and thumbnails (log) ---------- */
  const plain = matSet(false);
  const wireMat = new THREE.LineBasicMaterial({ color: C.chalk.clone().multiplyScalar(1.3), transparent: true, opacity: .9 });
  const glowWire = new THREE.LineBasicMaterial({ color: C.flame.clone().multiplyScalar(2.2) });
  function toWire(group, mat) {
    const meshes = []; group.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 12), mat); l.position.copy(m.position); l.rotation.copy(m.rotation); l.scale.copy(m.scale); m.parent.add(l); m.parent.remove(m); }
    return group;
  }
  function fullRocket(get, lo) { const g = new THREE.Group(); for (const d of PARTDEF) { const b = d.build(get, null, lo); b.g.position.y = d.y; g.add(b.g); } g.position.y = STACK_Y; const w = new THREE.Group(); w.add(g); return w; }
  function grains() {
    const g = new THREE.Group();
    [[-.75, .62, 1], [0, .74, .92], [.75, .5, 1.08]].forEach(([x, h, s]) => {
      const pr = [new THREE.Vector2(.12, 0), new THREE.Vector2(.36, 0), new THREE.Vector2(.36, h), new THREE.Vector2(.12, h), new THREE.Vector2(.12, 0)];
      const m = mesh(g, new THREE.LatheGeometry(pr, 64), plain.get('grain'), [x, -h / 2, 0]); m.scale.setScalar(s);
    });
    return g;
  }
  function motorGroup(get, L) { const b = buildMotor(get, L, false); b.subs.forEach(s => s.g.position.addScaledVector(s.dir, s.dist * .7)); const w = new THREE.Group(); b.g.position.y = -.75; w.add(b.g); return { w, b }; }
  const MINI = [
    () => { const w = fullRocket(plain.get, false); w.scale.setScalar(.48); w.rotation.z = -1.25; return w; },
    () => { const g = grains(); g.rotation.x = .35; return g; },
    () => { const { w } = motorGroup(plain.get, null); const lw = motorGroup(() => null, null).w; toWire(lw, glowWire); lw.scale.setScalar(1.02); const g = new THREE.Group(); g.add(w, lw); g.rotation.z = -1.3; g.scale.setScalar(1.25); return g; },
    () => { const g = new THREE.Group(); const st = stand.clone(true); st.traverse(o => { if (o.isMesh) o.material = plain.get('graphite'); }); g.add(st); const { w } = motorGroup(plain.get, null); w.rotation.z = -Math.PI / 2; w.position.set(.08, .1, 0); g.add(w); toWire(g, wireMat); g.scale.setScalar(1.2); return g; },
    () => { const b = buildAvbay(plain.get, null, true); b.subs[0].g.position.y += .45; const g = new THREE.Group(); b.g.position.y = -.25; g.add(b.g); toWire(g, wireMat); g.scale.setScalar(2.4); return g; },
    () => { const g = chute.clone(true); g.visible = true; g.children[0].material = plain.get('graphite'); toWire(g, wireMat); g.scale.setScalar(.8); g.position.y = .6; return g; },
    () => { const g = fullRocket(plain.get, true); toWire(g, wireMat); g.scale.setScalar(.5); return g; },
  ];
  const minis = MINI.map(fn => {
    const sc = new THREE.Scene(); sc.environment = envTex;
    const k = new THREE.DirectionalLight(0xfff0dc, 1.6); k.position.set(-3, 4, 5);
    const r = new THREE.DirectionalLight(0x9cc8ff, 2.2); r.position.set(4, 1, -3);
    sc.add(k, r, new THREE.AmbientLight(0x223044, .4));
    const obj = fn(); sc.add(obj);
    const cam = new THREE.PerspectiveCamera(28, 1.6, .1, 50); cam.position.set(0, 0, 6.2);
    return { sc, cam, obj, spin: Math.random() * 6 };
  });
  // log thumbnails, rendered once from the same model
  const thumbs = [];
  function makeThumbs() {
    const shots = [
      () => { const g = grains(); g.rotation.set(.45, .3, 0); return { g, cam: [0, .4, 4.6] }; },
      () => { const { w } = motorGroup(plain.get, null); w.rotation.z = -Math.PI / 2; const f = flame.clone(true); f.children.forEach(m => { m.material = m.material.clone(); m.material.uniforms.uAmt.value = 1; m.material.uniforms.uTime.value = 3; }); const g = new THREE.Group(); g.add(w); const t = new THREE.Group(); t.add(f); t.rotation.z = -Math.PI / 2; t.position.set(-.95, 0, 0); g.add(t); return { g, cam: [-.4, .25, 3.2] }; },
      () => { const b = buildBooster(plain.get, null, false); const g = new THREE.Group(); b.g.position.y = -.5; g.add(b.g); g.rotation.set(.15, .5, .1); return { g, cam: [.1, -.3, 2.6] }; },
      () => { const b = buildAvbay(plain.get, null, false); b.subs[0].g.position.y += .5; const g = new THREE.Group(); b.g.position.y = -.35; g.add(b.g); g.rotation.set(.1, -.35, 0); return { g, cam: [0, .1, 1.5] }; },
    ];
    for (const shot of shots) {
      const sc = new THREE.Scene(); sc.environment = envTex;
      const k = new THREE.DirectionalLight(0xfff0dc, 2); k.position.set(-3, 4, 5); const r = new THREE.DirectionalLight(0x9cc8ff, 3); r.position.set(4, 1, -3);
      sc.add(k, r, new THREE.AmbientLight(0x223044, .5));
      const { g, cam: cp } = shot(); sc.add(g);
      const cam = new THREE.PerspectiveCamera(30, 4 / 3, .05, 50); cam.position.set(...cp); cam.lookAt(0, 0, 0);
      const rt = RT(640, 480, { depthBuffer: true, samples: lowTier ? 0 : 4 });
      renderer.setClearColor(C.cyanotype.clone().multiplyScalar(.28), 1); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam);
      thumbs.push(rt);
    }
    renderer.setClearColor(0x000000, 0); renderer.setRenderTarget(null);
  }
  progress('cards', .72);
  await nextFrame();

  /* ---------- poses: the scroll choreography ---------- */
  const PI2 = Math.PI / 2;
  const D = { x: 0, y: 0, s: 1, rx: 0, ry: 0, rz: 0, spin: 0, ex: 0, scan: 0, paper: 0, beam: 0, flame: 0, bd: 0, warm: 0, dawn: 0, alt: 0, call: 0,
    fov: 30, camX: 0, camY: 0, lookY: 0, floor: 0, fy: -3, px: 0, ps: 1, cone: 0, dust: 0, rays: 0, shake: 0, orbit: 0, hud: 0, tag: 0,
    f0: 0, f1: 0, f2: 0, f3: 0, f4: 0, body: 1, mot: 1, mw: 0, mkeep: 0, stand: 0, ribbons: 0, embers: 0, cards: 0, lift: 0, chute: 0, sep: 0, clouds: 0, smoke: 0, streak: 0, tip: 0 };
  const P = {}, PM = {};
  P.hero = { ...D, x: 2.4, y: rest(-2.95, .95), s: .95, camY: -1.1, lookY: 1.0, floor: 1, fy: -2.95, px: 2.4, ps: .95, cone: 1, dust: 1, rays: 1, orbit: 1, hud: 1, tag: 1, smoke: 1, streak: .35 };
  P.veh0 = { ...D, x: .9, y: .15, s: .78, rz: -PI2, ry: .3, fy: -4.6, px: 2.4, ps: .95 };
  P.vehA = { ...P.veh0, scan: 1, paper: 1, fov: 13, call: 1, ry: .18 };
  P.vehB = { ...P.vehA, ex: 1, s: .6 };
  P.stand = { ...D, body: 0, mot: 1, mw: 1, mkeep: 1, stand: 1, x: 1.2, y: 0, s: .9, rz: -PI2, camY: .15, lookY: -.15, bd: 1, flame: 1, warm: 1, ribbons: 1, embers: 1, smoke: 1, streak: 1 };
  P.cards = { ...D, body: 0, mot: 0, cards: 1 };
  P.ambient = { ...D, body: 0, mot: 0 };
  P.pad = { ...D, x: 3.4, y: rest(-2.6, .8), s: .8, floor: 1, fy: -2.6, px: 3.4, ps: .8, cone: .6, dust: .5, rays: .5, dawn: 1, camY: -.8, lookY: .95, orbit: .4, tag: 1, smoke: 1, streak: .35 };
  PM.hero = { x: 0, y: rest(.6, .47), s: .47, fy: .6, px: 0, ps: .47, camY: 1.5, lookY: -1.41 };
  PM.veh0 = { x: 0, y: .35, s: .44, px: 0 }; PM.vehA = { x: 0, y: .35, s: .44, px: 0 }; PM.vehB = { x: 0, y: .35, s: .3, px: 0 };
  PM.stand = { x: 0, y: 1.6, s: .55 };
  PM.pad = { x: .75, y: rest(1, .42), s: .42, fy: 1, px: .75, ps: .42, camY: 1.9, lookY: 1.24, trail: 1.3 };
  function focusPose(i, mob) {
    const d = PARTDEF[i], s = mob ? .52 : .6, ex = .6, FX = mob ? 0 : 1.55;
    const rel = d.center + d.dist * ex * d.dir.y + STACK_Y;
    return { ...P.vehB, ...(mob ? PM.vehB : {}), ex, s, call: 0, fov: 20, ['f' + i]: 1, x: FX - rel * s, y: mob ? .65 : .15 };
  }
  const pose = n => {
    const mob = isMobile();
    if (n[0] === 'f' && n.length === 2) return focusPose(+n[1], mob);
    return mob && PM[n] ? { ...P[n], ...PM[n] } : P[n];
  };
  let KEYS = [[0, 'hero']], FLIGHT0 = 1e9, FLIGHT1 = 1e9 + 1;
  STAGE.measure = () => {
    const vh = MET.vh, V = MET.veh, Dt = MET.dat, Pg = MET.pro, L = MET.lau;
    KEYS = [[0, 'hero'], [V.t, 'veh0'], [V.t + V.len * .14, 'vehA'], [V.t + V.len * .2, 'vehA'], [V.t + V.len * .28, 'vehB'], [V.t + V.len * .33, 'vehB']];
    for (let i = 0; i < 5; i++) { const s0 = V.t + V.len * (.36 + i * .12); KEYS.push([s0 + V.len * .03, 'f' + i], [s0 + V.len * .1, 'f' + i]); }
    KEYS.push([V.t + V.len, 'f4'], [Dt.t + vh * .1, 'stand'], [Dt.t + Math.max(vh * .2, Dt.len), 'stand'], [Pg.t, 'cards'], [Pg.t + Pg.len, 'cards'],
      [MET.log.t, 'ambient'], [L.t - vh * .2, 'ambient'], [L.t + vh * .3, 'pad']);
    for (let i = 1; i < KEYS.length; i++) KEYS[i][0] = Math.max(KEYS[i][0], KEYS[i - 1][0] + 1);
    FLIGHT0 = L.t + vh; FLIGHT1 = L.t + L.len;
  };
  const ease = t => reduce ? (t < .5 ? 0 : 1) : t * t * (3 - 2 * t);
  function flightPose(base) {
    const F = FL, o = { ...base }, KY = 30 / SIM.apo.h;
    o.lift = F.h * KY;
    o.flame = F.F > .5 ? clamp(.45 + F.F / 110, .45, 1.35) : 0;
    o.shake = o.flame * (1 - sstep(2, 10, o.lift));
    o.camY = base.camY + o.lift - sstep(0, 4, o.lift) * (base.trail || 1.8);
    o.lookY = base.lookY + sstep(0, 4, o.lift) * .4;
    o.floor = 1 - sstep(3, 9, o.lift);
    o.cone = base.cone * (1 - sstep(0, 2, o.lift)); o.dust = base.dust * (1 - sstep(0, 2, o.lift)); o.rays = base.rays * (1 - sstep(0, 2, o.lift));
    o.tag = sstep(-.3, -.6, F.ts); o.orbit = 0;
    o.clouds = sstep(3, 7, o.lift); o.alt = clamp(o.lift / 30, 0, 1);
    o.sep = F.sep; o.chute = F.chute; o.tip = F.tip;
    o.rz = -F.tip * PI2 * .88; o.x = base.x - F.tip * .5;
    o.warm = o.flame * .7; o.streak = .35 + o.flame * .65;
    return o;
  }
  function sample(sy) {
    if (sy >= FLIGHT0) {
      const o = flightPose(pose('pad'));
      // phones: the footer fills the screen, so pan the sky up and away as it arrives
      if (MET.foot) { const fk = sstep(MET.foot.t - MET.vh, MET.foot.t - MET.vh * .15, sy);
        if (isMobile()) o.camY -= fk * 6.5; else { o.camY -= fk * 1.25; o.x += fk * .9; }
        o.clouds *= 1 - fk * .7; }
      return o;
    }
    if (sy <= KEYS[0][0]) return { ...pose(KEYS[0][1]) };
    for (let i = 0; i < KEYS.length - 1; i++) {
      const [a, na] = KEYS[i], [b, nb] = KEYS[i + 1];
      if (sy <= b) {
        const t = clamp((sy - a) / (b - a), 0, 1), A = pose(na), B = pose(nb), o = {};
        for (const k in D) o[k] = A[k] + (B[k] - A[k]) * (k === 'scan' ? t : ease(t));
        o.beam = ((na === 'veh0' && nb === 'vehA') || (na === 'f4' && nb === 'stand')) && t > .005 && t < .995 ? 1 : 0;
        return o;
      }
    }
    return { ...pose(KEYS[KEYS.length - 1][1]) };
  }

  /* ---------- overlays: callouts, dimension line, hero HUD ---------- */
  const coEls = $$('.co'), coWrap = $('#callouts'), dims = $('#dims'), hud = $('#hud');
  const coAnchors = [pNose.anchors.a, pPay.anchors.a, pAv.anchors.a, pBoost.anchors.a, pMotor.anchors.a];
  const v3 = new THREE.Vector3();
  const toScreen = o => { (o.isVector3 ? v3.copy(o) : o.getWorldPosition(v3)).project(camera); return [(v3.x * .5 + .5) * innerWidth, (-v3.y * .5 + .5) * innerHeight, v3.z]; };
  const dEl = { a: $('#dExtA'), b: $('#dExtB'), l: $('#dLine'), aa: $('#dArrA'), ab: $('#dArrB'), t: $('#dText') };
  const setL = (el, x1, y1, x2, y2) => { el.setAttribute('x1', x1); el.setAttribute('y1', y1); el.setAttribute('x2', x2); el.setAttribute('y2', y2); };
  const tipA = pNose.anchors.tip;
  function overlays(c) {
    const vis = clamp(c.call * 2.2 - 1.2, 0, 1);
    coWrap.style.opacity = vis; dims.style.opacity = vis * (clamp(1 - c.ex * 1.6, 0, 1) + clamp(c.ex * 2 - 1, 0, 1));
    if (vis > .001) {
      coAnchors.forEach((a, i) => { const [x, y] = toScreen(a), below = coEls[i].classList.contains('below');
        coEls[i].style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,${below ? '-3px' : 'calc(-100% + 3px)'})`; });
      const [ax, ay] = toScreen(tipA), [bx, by] = toScreen(pMotor.tail), yy = Math.max(ay, by) + (isMobile() ? 80 : 150), sg = ax > bx ? 1 : -1;
      setL(dEl.a, ax, ay + 10, ax, yy + 8); setL(dEl.b, bx, by + 10, bx, yy + 8); setL(dEl.l, bx, yy, ax, yy);
      dEl.aa.setAttribute('d', `M${ax},${yy} l${-10 * sg},-4 M${ax},${yy} l${-10 * sg},4`); dEl.ab.setAttribute('d', `M${bx},${yy} l${10 * sg},-4 M${bx},${yy} l${10 * sg},4`);
      dEl.t.setAttribute('x', (ax + bx) / 2); dEl.t.setAttribute('y', yy - 8);
      dEl.t.textContent = c.ex > .5 ? 'Exploded view, not to scale' : 'Overall length 1,560 mm';
    }
  }
  const HM = $('#hMarks'), NS = 'http://www.w3.org/2000/svg';
  const marks = [
    { a: tipA, label: 'nose_tip', sym: 'x' },
    { a: aCG, label: 'cg  0.95 m', sym: 'cg' },
    { a: aCP, label: 'cp  1.12 m', sym: 'cp' },
    { a: pMotor.tail, label: '', sym: 'x' },
  ].map(m => {
    const g = document.createElementNS(NS, 'g'), ld = document.createElementNS(NS, 'line'), tx = document.createElementNS(NS, 'text'), sym = document.createElementNS(NS, 'g');
    ld.setAttribute('class', 'ld2'); tx.textContent = m.label; tx.setAttribute('dy', '4');
    if (m.sym === 'x') sym.innerHTML = '<line class="cx" x1="-7" y1="0" x2="7" y2="0"></line><line class="cx" x1="0" y1="-7" x2="0" y2="7"></line>';
    else if (m.sym === 'cg') sym.innerHTML = '<circle class="cx" r="8"></circle><path class="fill" d="M0,0 L8,0 A8,8 0 0,1 0,8 Z M0,0 L-8,0 A8,8 0 0,1 0,-8 Z"></path>';
    else sym.innerHTML = '<circle class="cx" r="8"></circle><circle class="fill" r="2.2"></circle>';
    g.append(ld, sym, tx); HM.appendChild(g); return { ...m, g, ld, tx, sym };
  });
  const hb = [0, 1, 2, 3].map(i => $('#hb' + i)), hTag = $('#hTag'), hLink = $('#hLink');
  const tmpA = new THREE.Vector3();
  function hudUpdate(c, alpha) {
    hud.style.opacity = alpha.toFixed(3);
    if (alpha < .01) return;
    const pts = [toScreen(tipA), toScreen(pMotor.tail), ...pBoost.finAnch.map(a => toScreen(a))];
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const pad = 22 + (1 - STAGE.intro.hud) * 160, L = 18;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    hb[0].setAttribute('d', `M${x0},${y0 + L} V${y0} H${x0 + L}`); hb[1].setAttribute('d', `M${x1 - L},${y0} H${x1} V${y0 + L}`);
    hb[2].setAttribute('d', `M${x1},${y1 - L} V${y1} H${x1 - L}`); hb[3].setAttribute('d', `M${x0 + L},${y1} H${x0} V${y1 - L}`);
    hTag.setAttribute('x', x0); hTag.setAttribute('y', y0 - 10);
    const lx = x1 + 26; let path = '';
    marks.forEach((m, i) => {
      const [x, y] = toScreen(m.a);
      m.sym.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      m.tx.setAttribute('x', lx + 8); m.tx.setAttribute('y', y.toFixed(1));
      setL(m.ld, x + 12, y, lx, y);
      path += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    });
    hLink.setAttribute('d', path);
  }

  /* ---------- interaction: drag to rotate, pointer parallax ---------- */
  const drag = { on: false, x: 0, v: 0, yaw: 0 };
  const heroEl = $('#top');
  heroEl.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.target.closest('a,button')) return; drag.on = true; drag.x = e.clientX; drag.v = 0; });
  addEventListener('pointermove', e => { if (drag.on) { const dx = e.clientX - drag.x; drag.x = e.clientX; drag.v = dx * .006; drag.yaw += drag.v; } });
  addEventListener('pointerup', () => drag.on = false);

  /* ---------- the frame ---------- */
  const cur = { ...pose('hero') };
  const mA = new THREE.Matrix4(), mInv = new THREE.Matrix4(), pA = new THREE.Vector3(), pB = new THREE.Vector3(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), sA = new THREE.Vector3(), sB = new THREE.Vector3();
  const wOff = new THREE.Vector3(), qTmp = new THREE.Quaternion(), dTmp = new THREE.Vector3(), tmpV = new THREE.Vector3();
  let last = null, time = 0, spin = 0, frames = 0, ftAcc = 0, yawDrift = 0, flameSm = 0, camYPrev = 0, fogT = 0;
  const STAND = () => isMobile() ? [.2, 1.25, 0, .62] : [3.15, -.7, 0, 1.45];
  const BASE = 12;
  function resize() { camera.aspect = innerWidth / innerHeight; allocate(); }
  addEventListener('resize', () => { resize(); });
  resize();

  function emitSmoke(dt, amt) {
    if (amt < .08) return;
    sAcc += dt * amt * (lowTier ? 60 : 120);
    pMotor.tail.getWorldPosition(tmpV); dTmp.set(0, -1, 0).applyQuaternion(pMotor.tail.getWorldQuaternion(qTmp));
    while (sAcc > 1) {
      sAcc -= 1; const i = sHead; sHead = (sHead + 1) % SMN; const r = Math.random;
      sPos[i * 3] = tmpV.x + (r() - .5) * .06; sPos[i * 3 + 1] = tmpV.y + (r() - .5) * .06; sPos[i * 3 + 2] = tmpV.z + (r() - .5) * .06;
      const sp = 3 + r() * 2;
      sVel[i * 3] = dTmp.x * sp + (r() - .5) * .8; sVel[i * 3 + 1] = dTmp.y * sp + (r() - .5) * .8; sVel[i * 3 + 2] = dTmp.z * sp + (r() - .5) * .8;
      sAge[i] = 0; sLife[i] = 2.4 + r() * 2; sSize[i] = .25;
    }
  }
  function stepSmoke(dt, floorY, padX, hasFloor) {
    const dr = Math.exp(-2.4 * dt);
    for (let i = 0; i < SMN; i++) {
      if (sAge[i] >= 1) continue;
      sAge[i] = Math.min(1, sAge[i] + dt / sLife[i]);
      sVel[i * 3] *= dr; sVel[i * 3 + 1] = sVel[i * 3 + 1] * dr + .3 * dt; sVel[i * 3 + 2] *= dr;
      sPos[i * 3] += sVel[i * 3] * dt; sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt; sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt;
      if (hasFloor && sPos[i * 3 + 1] < floorY + .2) {
        sPos[i * 3 + 1] = floorY + .2; sVel[i * 3 + 1] = Math.abs(sVel[i * 3 + 1]) * .15;
        const dx = (sPos[i * 3] - padX) || .01, dz = sPos[i * 3 + 2] || .01, l = Math.hypot(dx, dz);
        sVel[i * 3] += dx / l * 15 * dt; sVel[i * 3 + 2] += dz / l * 15 * dt;
      }
      sSize[i] = .25 + Math.pow(sAge[i], .6) * (2.4 + sSeed[i] * 1.2);
    }
    sGeo.attributes.position.needsUpdate = sGeo.attributes.aAge.needsUpdate = sGeo.attributes.aSize.needsUpdate = true;
  }
  const scr = (wv) => { wv.project(camera); return [wv.x * .5 + .5, wv.y * .5 + .5]; };

  STAGE.frame = (now, sy) => {
    if (last === null) last = now;
    const rdt = clamp((now - last) / 1000, 0, .05); last = now;
    const dt = state.paused ? 0 : rdt; time += dt;
    const tgt = sample(sy);
    const k = (reduce || TEST.noDamp) ? 1 : 1 - Math.exp(-rdt * 6.5);
    for (const p in D) { cur[p] += (tgt[p] - cur[p]) * k; if (!Number.isFinite(cur[p])) cur[p] = tgt[p]; }
    const c = cur, I = STAGE.intro, mob = isMobile();

    // drive: burn playback in the static fire, pose value elsewhere
    const drive = burnDrive();
    flameSm = clamp(flameSm + ((c.bd > .5 ? drive * 1.35 : 1) - flameSm) * (1 - Math.exp(-rdt * 18)), 0, 2);
    const amt = c.flame * (c.bd > .01 ? lerp(1, flameSm, c.bd) : 1);

    // pointer, drag, idle drift
    ptr.sx = (ptr.sx || 0) + (ptr.x - (ptr.sx || 0)) * (1 - Math.exp(-rdt * 3)); ptr.sy = (ptr.sy || 0) + (ptr.y - (ptr.sy || 0)) * (1 - Math.exp(-rdt * 3));
    if (!drag.on) { drag.yaw += drag.v; drag.v *= Math.pow(.92, rdt * 60); }
    yawDrift += dt * .12;
    const orbitYaw = c.orbit * (Math.sin(yawDrift) * .22 + ptr.sx * .25 + drag.yaw);

    // rocket
    pivot.position.set(c.x, c.y + c.lift, 0); pivot.scale.setScalar(c.s); pivot.rotation.set(c.rx, c.ry + orbitYaw, c.rz);
    if (c.spin > .1 && !reduce) spin += dt * .35 * c.spin;
    else { const unit = c.floor > .3 ? Math.PI * 2 : PI2, snap = Math.round(spin / unit) * unit; spin += (snap - spin) * (1 - Math.exp(-rdt * 4)); }
    spinner.rotation.y = spin;
    pivot.updateMatrixWorld(true);
    stack.getWorldQuaternion(qTmp).invert();
    parts.forEach((p, i) => {
      const f = c['f' + i];
      p.g.position.copy(p.base).addScaledVector(p.dir, p.dist * c.ex);
      if (i === 0) p.g.position.y += c.sep * .9;
      if (f > .001) { wOff.set(0, .3, 1.5).multiplyScalar(f).applyQuaternion(qTmp).divideScalar(c.s); p.g.position.add(wOff); }
      if (f > .001) p.spin += dt * .45 * f;
      else { const snap = Math.round(p.spin / (Math.PI * 2)) * Math.PI * 2; p.spin += (snap - p.spin) * (1 - Math.exp(-rdt * 3)); }
      p.g.rotation.y = p.spin;
      p.g.scale.setScalar(1 + .75 * f); p.g.rotation.x = f * .28;
      p.ms.all.forEach(m => { if (m.envMapIntensity !== undefined) m.envMapIntensity = 1 + 1.4 * f; });
      p.subs.forEach(s => s.g.position.copy(s.base).addScaledVector(s.dir, s.dist * f));
      p.ms.keep.value = i === 4 ? Math.max(f, c.mkeep) : f;
      const vis = i === 4 ? c.mot : c.body;
      p.g.visible = vis > .01;
      p.ms.all.forEach(m => { if (m.isLineBasicMaterial) m.opacity = vis; else { m.opacity = vis; m.transparent = vis < .999; } });
    });
    focusLight.intensity = 3.2 * (c.f0 + c.f1 + c.f2 + c.f3 + c.f4) + 1.6 * c.mkeep;
    tag.visible = c.tag > .02 && c.scan < .02; tagMat.opacity = c.tag; tagU.uTime.value = time;
    // motor transfer to the test stand
    const [sx0, sy0, sz0, ss] = STAND();
    stand.position.set(sx0, sy0, sz0); stand.scale.setScalar(ss); stand.visible = c.stand > .01;
    standMats.forEach(m => m.opacity = c.stand);
    pMotor.g.matrixAutoUpdate = true; pMotor.g.updateMatrix();
    if (c.mw > .001) {
      stack.updateMatrixWorld(true); standMount.updateWorldMatrix(true, false);
      mA.multiplyMatrices(stack.matrixWorld, pMotor.g.matrix); mA.decompose(pA, qA, sA);
      standMount.matrixWorld.decompose(pB, qB, sB);
      const e = c.mw * c.mw * (3 - 2 * c.mw);
      pA.lerp(pB, e); qA.slerp(qB, e); sA.lerp(sB, e);
      mA.compose(pA, qA, sA); mInv.copy(stack.matrixWorld).invert();
      pMotor.g.matrixAutoUpdate = false; pMotor.g.matrix.multiplyMatrices(mInv, mA);
    }
    // pad set and floor
    const floorVis = clamp(c.floor, 0, 1);
    padSet.visible = floorVis > .01; padSet.position.set(c.px, c.fy, 0); padSet.scale.setScalar(c.ps); padSet.rotation.y = c.ry + orbitYaw;
    padMats.forEach(m => { m.opacity = floorVis; });
    floor.visible = floorVis > .01; floor.position.set(c.px, c.fy, 0);
    floorMat.uniforms.uVis.value = floorVis; floorMat.uniforms.uScale.value = c.ps; floorMat.uniforms.uPool.value = c.cone * I.cone; floorMat.uniforms.uDawn.value = c.dawn;
    floorMat.uniforms.uGlow.value = amt * (c.floor > .5 ? 1 : 0);
    const coneI = c.cone * I.cone * floorVis;
    coneMat.uniforms.uI.value = coneI; spot.intensity = 90 * coneI; lamp.material.opacity = coneI * (mob ? 1 - c.dawn : 1);
    dustMat.uniforms.uI.value = c.dust * I.cone * floorVis;
    // 3D print reveal
    SCAN.uPrint.value = I.print < .999 ? c.fy + lerp(-.1, 5.2 * c.s + .25, I.print) : 99;
    SCAN.uScan.value = c.scan; SCAN.uFloorY.value = c.fy;

    // plume
    const t = time, flick = reduce ? 1 : 1 + Math.sin(t * 50) * .05 + Math.sin(t * 31) * .04;
    outerMat.uniforms.uAmt.value = innerMat.uniforms.uAmt.value = clamp(amt, 0, 1.3);
    outerMat.uniforms.uTime.value = innerMat.uniforms.uTime.value = t;
    flame.visible = amt > .01; flame.scale.set(.9 + .25 * amt, flick * (.3 + .75 * amt), .9 + .25 * amt);
    tailLight.intensity = amt * 9 * flick;
    // ribbons, embers
    ribbons.visible = c.ribbons > .01; ribbons.position.set(mob ? 0 : -.4, mob ? 1.2 : -3.1, -4.2); ribbons.scale.setScalar(mob ? .45 : 1);
    for (const kk in ribMats) { const u = ribMats[kk].uniforms; u.uVis.value = c.ribbons; u.uTime.value = t; u.uOn.value = kk === sel ? 1 : 0; u.uHead.value = kk === sel && burn.playing ? clamp(burn.t / TMAX, 0, 1) : 1; }
    pMotor.tail.updateWorldMatrix(true, false);
    pMotor.tail.getWorldPosition(emberMat.uniforms.uOrigin.value);
    emberMat.uniforms.uDir.value.set(0, -1, 0).applyQuaternion(pMotor.tail.getWorldQuaternion(qTmp));
    emberMat.uniforms.uAmt.value = c.embers * amt; emberMat.uniforms.uTime.value = t; embers.visible = c.embers * amt > .01;
    // smoke trail (flight)
    const inFlight = sy >= FLIGHT0;
    if (!reduce) { if (inFlight) emitSmoke(dt, amt); stepSmoke(dt, c.fy, c.px, floorVis > .3); }
    smokeMat.uniforms.uLight.value = 1 + amt * .8; smokeMat.uniforms.uVis.value = inFlight ? 1 : clamp(c.floor, 0, 1);
    // clouds, chute
    clouds.visible = c.clouds > .01;
    cloudMats.forEach(m => m.uniforms.uVis.value = c.clouds);
    // parachute above the payload once deployed
    chute.visible = c.chute > .01;
    if (chute.visible) {
      pPay.g.updateWorldMatrix(true, false); pPay.g.localToWorld(tmpV.set(0, 1, 0));
      const cs = c.s * (.15 + .85 * Math.min(1.1, c.chute * (1 + .1 * Math.sin(c.chute * 9)))) * 1.25;
      chute.position.set(tmpV.x, tmpV.y + 2.3 * cs, tmpV.z); chute.scale.setScalar(cs);
      chute.rotation.z = Math.sin(time * .8) * .06 * c.chute; chute.rotation.x = Math.sin(time * .6) * .05 * c.chute;
    }

    // camera: dolly zoom keeps framing while the field of view changes
    const baseFov = camera.aspect < .8 ? 38 : 30, fov = c.fov * baseFov / 30;
    const dist = BASE * Math.tan(baseFov * Math.PI / 360) / Math.tan(fov * Math.PI / 360) * (1 + I.push * .28);
    const shake = reduce ? 0 : c.shake * amt * .035, par = dist / BASE;
    camera.fov = fov;
    camera.position.set(c.camX + ptr.sx * .35 * par + (Math.random() - .5) * shake * par, c.camY - ptr.sy * .2 * par + (Math.random() - .5) * shake * par, dist);
    camera.lookAt(c.camX * .9, c.camY + c.lookY, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    clouds.children.forEach(s => { s.position.copy(s.userData.base); s.position.y += c.fy + 2.6; s.quaternion.copy(camera.quaternion); });
    const pxScale = renderer.domElement.height / (2 * Math.tan(fov * Math.PI / 360));
    smokeMat.uniforms.uScale.value = pxScale; dustMat.uniforms.uScale.value = pxScale; emberMat.uniforms.uScale.value = pxScale;
    dustMat.uniforms.uTime.value = coneMat.uniforms.uTime.value = t;
    stars.position.y = sy / Math.max(1, MET.max) * 14 - c.lift * .4; starMat.opacity = .55 * (1 - c.paper) * (1 - c.dawn * .6);

    overlays(c);
    hudUpdate(c, c.hud * I.hud * (1 - sstep(.05, .4, sy / MET.vh)));

    // fluid: cursor stirs, exhaust and ground fog feed it
    if (fluid && !state.paused) {
      const fdt = Math.min(rdt, 1 / 40);
      if (ptr.moved && (Math.abs(ptr.dx) + Math.abs(ptr.dy)) > 0) {
        const x = ptr.cx / innerWidth, y = 1 - ptr.cy / innerHeight, dye = c.smoke * .05;
        fluid.splat(x, y, ptr.dx * 9, -ptr.dy * 9, dye * .55, dye * .58, dye * .64, dye, .0016);
        ptr.dx = ptr.dy = 0; ptr.moved = false;
      }
      if (amt > .06 && (c.bd > .5 || inFlight)) {
        pMotor.tail.getWorldPosition(tmpV); const [nx, ny] = scr(tmpV.clone());
        dTmp.set(0, -1, 0).applyQuaternion(pMotor.tail.getWorldQuaternion(qTmp)).multiplyScalar(.8).add(pMotor.tail.getWorldPosition(new THREE.Vector3()));
        const [ex, ey] = scr(dTmp); let vx = ex - nx, vy = ey - ny; const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
        const sp = 900 * amt, d = .32 * amt;
        fluid.splat(nx + vx * .03, ny + vy * .03, vx * sp, vy * sp, d * .62, d * .6, d * .58, d, .0011);
        if (inFlight && c.lift < 3) {
          pA.set(c.px, c.fy + .1, 0); const [gx, gy] = scr(pA);
          for (const sgn of [-1, 1]) fluid.splat(gx + sgn * .02, gy + .01, sgn * 2200 * amt, 60, .4 * amt, .39 * amt, .38 * amt, .5 * amt, .004);
        }
      }
      fogT += rdt;
      if (c.floor * c.smoke > .3 && fogT > .12) {
        fogT = 0; const a = Math.random() * Math.PI * 2, r = (.8 + Math.random() * 2.4) * c.ps;
        pA.set(c.px + Math.cos(a) * r, c.fy + .06, Math.sin(a) * r * .5); const [gx, gy] = scr(pA);
        fluid.splat(gx, gy, (Math.random() - .5) * 120, 8, .03, .032, .036, .05, .006);
      }
      const camDy = camera.position.y - camYPrev; camYPrev = camera.position.y;
      const visH = 2 * dist * Math.tan(fov * Math.PI / 360);
      fluid.step(fdt, inFlight ? -camDy / visH : 0);
    }

    // reflection pass (mirror the world about the floor)
    if (floorVis > .01 && !lowTier) {
      const ev = embers.visible; floor.visible = false; stars.visible = false; embers.visible = false; clouds.visible = false;
      world.scale.y = -1; world.position.y = 2 * c.fy; world.updateMatrixWorld(true);
      SCAN.uRes.value.set(reflRT.width, reflRT.height); SCAN.uMirror.value = 1;
      renderer.setRenderTarget(reflRT); renderer.clear(); renderer.render(scene, camera);
      world.scale.y = 1; world.position.y = 0; world.updateMatrixWorld(true);
      floor.visible = true; stars.visible = true; embers.visible = ev; clouds.visible = c.clouds > .01; SCAN.uMirror.value = 0;
      floorMat.uniforms.uRefl.value = reflRT.texture; floorMat.uniforms.uRes.value.set(sceneRT.width, sceneRT.height);
    }
    // main pass
    SCAN.uRes.value.set(sceneRT.width, sceneRT.height);
    renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
    // card scenes, each drawn into its card's glass window
    if (c.cards > .02) {
      for (let i = 0; i < minis.length; i++) {
        const r = views[i].getBoundingClientRect();
        if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight || r.width < 4) continue;
        const m = minis[i];
        m.spin += dt * (STAGES[i].s === 'active' ? .6 : .3);
        m.obj.rotation.y = m.spin; m.cam.aspect = r.width / r.height; m.cam.updateProjectionMatrix();
        const x = Math.round(r.left * dpr), y = Math.round((innerHeight - r.bottom) * dpr), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
        sceneRT.viewport.set(x, y, w, h); sceneRT.scissor.set(x, y, w, h); sceneRT.scissorTest = true;
        renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(m.sc, m.cam);
      }
      sceneRT.viewport.set(0, 0, sceneRT.width, sceneRT.height); sceneRT.scissor.set(0, 0, sceneRT.width, sceneRT.height); sceneRT.scissorTest = false;
    }
    // bloom
    brightMat.uniforms.tIn.value = sceneRT.texture; brightMat.uniforms.uT.value.set(1 / sceneRT.width, 1 / sceneRT.height); pass(brightMat, down[0]);
    for (let i = 1; i < LEVELS; i++) { downMat.uniforms.tIn.value = down[i - 1].texture; downMat.uniforms.uT.value.set(1 / down[i - 1].width, 1 / down[i - 1].height); pass(downMat, down[i]); }
    for (let i = LEVELS - 2; i >= 0; i--) { const src = i === LEVELS - 2 ? down[LEVELS - 1] : up[i + 1]; upMat.uniforms.tIn.value = src.texture; upMat.uniforms.tAdd.value = down[i].texture; upMat.uniforms.uT.value.set(.5 / src.width, .5 / src.height); pass(upMat, up[i]); }
    // composite
    const U = compMat.uniforms;
    U.tScene.value = sceneRT.texture; U.tBloom.value = up[0].texture; U.tStreak.value = up[Math.min(2, LEVELS - 2)].texture; U.tDye.value = fluid ? fluid.dye.read.texture : blackTex;
    U.uRes.value.set(sceneRT.width, sceneRT.height); U.uDpr.value = dpr; U.uTime.value = t;
    U.uScan.value = c.scan; U.uPaperVis.value = c.paper; U.uBeam.value = c.beam * Math.max(c.paper, .0) * (c.scan > .002 && c.scan < .998 ? 1 : 0);
    U.uWarm.value = c.warm * amt; U.uDawn.value = c.dawn; U.uAlt.value = c.alt; U.uScroll.value = sy * .08; U.uFade.value = I.fade;
    U.uBloom.value = .55 * (1 + amt * .25); U.uRays.value = c.rays * I.cone * floorVis; U.uStreak.value = c.streak * (.4 + amt * .6);
    U.uSmoke.value = fluid ? clamp(Math.max(c.smoke, inFlight ? 1 : 0), 0, 1) : 0;
    if (amt > .01) { const [gx, gy] = toScreen(pMotor.tail); U.uGlow.value.set(gx / innerWidth, 1 - gy / innerHeight); }
    if (floorVis > .01) { lamp.getWorldPosition(tmpV); const [lx, ly] = scr(tmpV); U.uLamp.value.set(lx, ly); pA.set(c.px, c.fy, 0); const [qx, qy] = scr(pA); U.uSpot.value.set(qx, qy + .06); }
    // log preview
    peek.a += ((peek.on && peek.i >= 0 ? 1 : 0) - peek.a) * (1 - Math.exp(-rdt * 9));
    if (peek.a > .002 && thumbs[peek.i]) {
      peek.vx += ((ptr.cx - (peek.lx ?? ptr.cx)) * .04 - peek.vx) * .2; peek.vy += ((ptr.cy - (peek.ly ?? ptr.cy)) * .04 - peek.vy) * .2; peek.lx = ptr.cx; peek.ly = ptr.cy;
      U.tPeek.value = thumbs[peek.i].texture; U.uPeek.value.set(peek.x + 28, peek.y - 120, 320, 240); U.uPeekA.value = peek.a; U.uPeekV.value.set(clamp(peek.vx, -1, 1), clamp(peek.vy, -1, 1));
    } else U.uPeekA.value = 0;
    renderer.setRenderTarget(null); pass(compMat, null);

    // sound follows the plume
    if (snd.on) { const ct = snd.ctx.currentTime; snd.rumble.gain.setTargetAtTime(amt * 1.3, ct, .05); snd.hiss.gain.setTargetAtTime(amt * .06 + c.beam * .02, ct, .05); }

    // keep it smooth on slower machines
    frames++; ftAcc += rdt;
    if (frames === 90) { const avg = ftAcc / frames; frames = 0; ftAcc = 0; if (avg > .024 && dpr > .75 && !TEST.fixedDpr) { dpr = Math.max(.75, dpr - .25); allocate(); } }
  };
  progress('compiling shaders', .85);
  await nextFrame();
  renderer.compile(scene, camera);
  minis.forEach(m => renderer.compile(m.sc, m.cam));
  makeThumbs();
  progress('ready', 1);
}

/* =====================================================================
   9. loader, loop, intro
   ===================================================================== */
const loader = $('#loader'), ldN = $('#ldN'), ldBar = $('#ldBar'), ldLog = $('#ldLog'), ldPct = $('#ldPct'), flash = $('#flash');
const ldState = { p: 0, shown: 0 };
function progress(label, p) {
  ldState.p = p;
  ldLog.textContent += (ldLog.textContent ? '\n' : '') + label.replace(/ /g, '_') + '  ok';
}
let loopErr = 0;
function loop(now) {
  requestAnimationFrame(loop);
  try {
    if (MET.veh) ui(scrollY);
    if (STAGE.frame) STAGE.frame(now, scrollY);
  } catch (err) { if (loopErr++ < 3) console.error(err); }
  // loader countdown follows real progress
  if (loader.isConnected) {
    ldState.shown += (ldState.p - ldState.shown) * .08;
    const n = Math.max(0, Math.ceil(10 - ldState.shown * 10));
    if (ldN.textContent !== String(n)) ldN.textContent = String(n);
    ldBar.style.transform = `scaleX(${ldState.shown.toFixed(3)})`; ldPct.textContent = String(Math.round(ldState.shown * 100)).padStart(3, '0') + '%';
  }
}
function finishIntro() {
  const it = STAGE.intro;
  loader.remove();
  typeIn($('#heroCode'), 34);
  $$('.hero .dc').forEach((el, i) => setTimeout(() => decode(el), 900 + i * 90));
  if (!G || reduce || TEST.skipIntro) { Object.assign(it, { fade: 1, print: 1, cone: 1, hud: 1, push: 0 }); return; }
  gsap.timeline()
    .fromTo(flash, { opacity: .85 }, { opacity: 0, duration: 1.1, ease: 'power2.out' }, 0)
    .to(it, { fade: 1, duration: .5, ease: 'power2.out' }, 0)
    .to(it, { push: 0, duration: 3.4, ease: 'expo.out' }, 0)
    .to(it, { print: 1, duration: 2.4, ease: 'power2.inOut' }, .25)
    .to(it, { keyframes: [{ cone: .8, duration: .06 }, { cone: .05, duration: .09 }, { cone: .6, duration: .05 }, { cone: .1, duration: .14 }, { cone: 1, duration: .35, ease: 'power2.out' }] }, .45)
    .to(it, { hud: 1, duration: 1.2, ease: 'expo.out' }, 1.6)
    .from('.hero h1 .ln > span', { yPercent: 115, rotate: 3, duration: 1.4, ease: 'expo.out', stagger: .12 }, .9)
    .from(['.hero .lede', '.hero .cta', '.hero .readout', '.hero .cue', '.nav'], { opacity: 0, y: 16, duration: 1.1, ease: 'power3.out', stagger: .07 }, 1.3);
}
async function boot() {
  const fontsReady = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2500))]);
  measureLayout();
  requestAnimationFrame(loop);
  await fontsReady;
  measureLayout();
  if (renderer) { try { await buildStage(progress); } catch (err) { console.error(err); html.classList.add('no-gl'); STAGE.frame = null; } }
  else progress('no_webgl_fallback', 1);
  measureLayout();
  if (G) ScrollTrigger.refresh();
  if (TEST.skipIntro || reduce || !G) { ldState.p = 1; finishIntro(); return; }
  await new Promise(r => setTimeout(r, 700));
  gsap.to(loader, { clipPath: 'inset(0 0 100% 0)', duration: .9, ease: 'expo.inOut', onComplete: finishIntro });
}
addEventListener('resize', () => { clearTimeout(boot._r); boot._r = setTimeout(() => { measureLayout(); if (G) ScrollTrigger.refresh(); }, 150); });
boot();
