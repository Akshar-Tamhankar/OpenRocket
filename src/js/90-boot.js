/* =====================================================================
   9. loader, loop, intro
   ===================================================================== */
// The loader is the count: T-10 down to zero as the stage really builds, with the ignition
// sequence logged line by line. Then the count lifts, the ignition flash, the night comes up,
// a sweep goes down the frame, the work light stutters on, the HUD locks onto the rocket,
// and the headline rises.
const loader = $('#loader'), ldN = $('#ldN'), ldBar = $('#ldBar'), ldLog = $('#ldLog'), ldPct = $('#ldPct'), flash = $('#flash');
const ldState = { p: 0, shown: 0, t0: performance.now() };
Object.assign(STAGE.intro, { hud: 0, scan: 0 });
const LD_NAMES = { sky: 'sky and playa', model: 'vehicle mk_i', compiling: 'shaders', ready: 'range' };
function logLine(name, res = 'ok', cls = '') {
  if (!ldLog) return;
  const t = ((performance.now() - ldState.t0) / 1000).toFixed(2).padStart(5, '0');
  const row = document.createElement('div');
  row.className = 'll' + (cls ? ' ' + cls : '');
  row.textContent = `[${t}] ${name} ${'.'.repeat(Math.max(2, 20 - name.length))} ${res}`;
  ldLog.appendChild(row);
  while (ldLog.childElementCount > 7) ldLog.firstElementChild.remove();
}
function progress(label, p) { ldState.p = Math.max(ldState.p, p); logLine(LD_NAMES[label] || label.replace(/ /g, '_'), label === 'ready' ? 'clear' : 'ok'); }
logLine('boot');
let loopErr = 0;
function loop(now) {
  requestAnimationFrame(loop);
  try {
    if (MET.veh) ui(scrollY);
    if (STAGE.frame) STAGE.frame(now, scrollY);
  } catch (err) { if (loopErr++ < 3) console.error(err); }
  // loader countdown follows real progress (by time, so a slow frame can't leave it behind the log)
  if (loader.isConnected) {
    const ldt = Math.min(.25, Math.max(0, (now - (ldState.last ?? now)) / 1000)); ldState.last = now;
    ldState.shown += (ldState.p - ldState.shown) * (1 - Math.exp(-ldt * 4.5));
    if (ldState.p - ldState.shown < .004) ldState.shown = ldState.p;
    const n = Math.max(0, Math.ceil(10 - ldState.shown * 10 - .001));
    if (ldN.textContent !== String(n)) ldN.textContent = String(n);
    ldBar.style.transform = `scaleX(${ldState.shown.toFixed(3)})`;
    const pc = String(Math.round(ldState.shown * 100)).padStart(3, '0') + '%';
    if (ldPct && ldPct.textContent !== pc) ldPct.textContent = pc;
  }
}
// n painted frames; a slow first frame (shader compiles) is spent here, not inside the intro
const frames = n => new Promise(r => { const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
function finishIntro() {
  loader.remove();
  if (TEST.skipIntro || reduce || !G) return runIntro();
  frames(2).then(runIntro);
}
function runIntro() {
  const it = STAGE.intro;
  const hc = $('#heroCode');
  if (hc) setTimeout(() => typeIn(hc, 34), TEST.skipIntro || reduce || !G ? 0 : 1500);
  $$('.hero .dc').forEach((el, i) => setTimeout(() => decode(el), (TEST.skipIntro || reduce || !G ? 0 : 2200) + i * 110));
  // once the HUD has locked, the ruler names the first sheet
  setTimeout(() => sayTick(ticks.find(t => t.getAttribute('aria-current') === 'true'), 3400), TEST.skipIntro || reduce || !G ? 0 : 2900);
  if (!G || reduce || TEST.skipIntro) { Object.assign(it, { fade: 1, light: 1, push: 0, hud: 1, scan: 1 }); return; }
  gsap.timeline()
    // ignition: a hard flash as the count lifts, the night comes up behind it
    .fromTo(flash, { opacity: .7 }, { opacity: 0, duration: 1.15, ease: 'power2.out' }, 0)
    .to(it, { fade: 1, duration: 1.6, ease: 'power2.inOut' }, 0)
    .to(it, { push: 0, duration: 4.2, ease: 'expo.out' }, 0)
    // the HUD sweeps the frame for the rocket
    .to(it, { scan: 1, duration: 1.5, ease: 'power2.inOut' }, .3)
    // the work light stutters on and finds it; the camera's exposure catches the last kick
    .to(it, { keyframes: [{ light: .55, duration: .05 }, { light: 0, duration: .12 }, { light: .3, duration: .04 }, { light: .02, duration: .22 }, { light: .8, duration: .05 }, { light: .5, duration: .08 }, { light: 1, duration: .5, ease: 'power2.out' }] }, .9)
    .fromTo(flash, { opacity: .14 }, { opacity: 0, duration: .55, ease: 'power2.out', immediateRender: false }, 1.38)
    // and locks on
    .to(it, { hud: 1, duration: 1.5, ease: 'expo.out' }, 1.25)
    .from('.hero h1 .ln > span', { yPercent: 115, rotate: 2, duration: 1.5, ease: 'expo.out', stagger: .12 }, 1.55)
    .from(['.hero .lede', '.hero .cta', '.hero .readout', '.hero .cue', '.hero .tb', '.nav', '.ruler'], { opacity: 0, y: 14, duration: 1.2, ease: 'power3.out', stagger: .07, clearProps: 'transform' }, 1.95);
}
// the go: the visitor enters with sound or without. The click is also what lets the browser start audio,
// so the soundscape is there from the first frame of the intro
function gate() {
  const g = $('#ldGo'), bS = $('#ldSnd'), bQ = $('#ldQuiet');
  if (!g || !bS || !bQ) return Promise.resolve(false);
  logLine('go_no_go', 'hold');
  loader.removeAttribute('aria-hidden'); loader.classList.add('gating');
  html.classList.add('gated'); if (lenis) lenis.stop();
  g.hidden = false; void g.offsetWidth; g.classList.add('on');
  setTimeout(() => { try { bS.focus({ preventScroll: true }); } catch (err) { /* old browser */ } }, 80);
  return new Promise(res => {
    const go = s => { bS.disabled = bQ.disabled = true; html.classList.remove('gated'); if (lenis) lenis.start(); loader.setAttribute('aria-hidden', 'true'); res(s); };
    bS.addEventListener('click', () => { setSound(true); go(true); }, { once: true });
    bQ.addEventListener('click', () => go(false), { once: true });
  });
}
async function boot() {
  // the CSS fallback lifts the loader by itself if the script never runs; from here the script does it
  loader.style.animation = 'none';
  const fontsReady = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2500))]);
  measureLayout();
  watchType();
  requestAnimationFrame(loop);
  await fontsReady;
  logLine('type');
  logLine('webgl2', renderer ? 'ok' : 'fallback');
  measureLayout();
  if (renderer) { try { await buildStage(progress); } catch (err) { console.error(err); html.classList.add('no-gl'); STAGE.frame = null; } }
  else progress('no_webgl_fallback', 1);
  measureLayout();
  if (G) ScrollTrigger.refresh();
  if (TEST.skipIntro || reduce || !G) { ldState.p = 1; finishIntro(); return; }
  // let the count reach zero (at most a couple of seconds), hold on it for a beat while the first
  // frames of the dark scene render under it, then lift it
  { const t0 = performance.now(); while (ldState.shown < 1 && performance.now() - t0 < 2500) await frames(1); }
  await Promise.all([frames(3), new Promise(r => setTimeout(r, 450))]);
  await gate();
  logLine('ignition', 'go', 'go');
  await new Promise(r => setTimeout(r, 380));
  gsap.to(loader, { clipPath: 'inset(0 0 100% 0)', duration: .9, ease: 'expo.inOut', onComplete: finishIntro });
}
addEventListener('resize', () => { clearTimeout(boot._r); boot._r = setTimeout(() => { measureLayout(); if (G) ScrollTrigger.refresh(); }, 150); });
// a section that changes height after the first measure (late fonts, a module filling in its rows) moves every
// sheet under it: measure again, so the ruler never keeps naming a sheet the reader has already left
if (window.ResizeObserver) {
  let lastH = 0;
  new ResizeObserver(() => {
    const h = document.body.offsetHeight; if (!MET.sheets || Math.abs(h - lastH) < 2) return;
    clearTimeout(boot._h); boot._h = setTimeout(() => { measureLayout(); if (G) ScrollTrigger.refresh(); lastH = document.body.offsetHeight; }, 250);
  }).observe(document.body);
}
boot();
