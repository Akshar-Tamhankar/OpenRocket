/* =====================================================================
   Film strip: the static-fire footage, one video frame per thrust reading,
   on a timeline ruler (a tick per frame, a time mark every 0.25 s). The chart
   window owns the thrust curve; the strip is a magnified window on its time
   axis (the chart shades the span the strip shows), with one shared playhead. Until the real footage is in, the frames are
   rendered from the scene: a phone on a small tripod beside the stand,
   with the phone's exposure closing down when the motor lights.
   The strip follows the burn clock; drag, tap, a sideways swipe or the
   arrow keys hold one frame, and the motor on the stand holds with it.
   ===================================================================== */
function createFilmStrip(renderer, post, C) {
  const el = $('#strip'), framesEl = $('#frames'), pinEl = el.closest('.pin'), winEl = $('#win'), footEl = $('.data .dfoot'), canvasEl = renderer.domElement;
  const cv = { all: $('#cvAll'), past: $('#cvP'), next: $('#cvN'), now: $('#cvNow'), pastR: $('#cvPastR'), nextR: $('#cvNextR'), g0: $('#cvG0'), fps: $('#axF'), svg: $('#curve') };
  const FW = 256, FH = 144, COLS = 8, ROWS = 6, MAXF = COLS * ROWS, SS = 2;   // atlas cell size; captures render at SS x and filter down
  const atlas = new THREE.WebGLRenderTarget(FW * COLS, FH * ROWS, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  atlas.texture.colorSpace = THREE.NoColorSpace;   // holds display-ready sRGB from the capture's own post pass
  const srgb = c => c.clone().convertLinearToSRGB();

  /* ---------- the strip: one quad per frame, in CSS pixels, drawn over the scene ---------- */
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(quad.index); geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const iA = new Float32Array(MAXF * 4), aA = new THREE.InstancedBufferAttribute(iA, 4);
  aA.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iA', aA); geo.instanceCount = 0;
  const U = {
    tAtlas: { value: atlas.texture }, uGrid: { value: new THREE.Vector2(COLS, ROWS) }, uInset: { value: new THREE.Vector2(1 / FW, 1 / FH) },
    uRes: { value: new THREE.Vector2(1, 1) }, uOrigin: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2(160, 90) },
    uSpan: { value: new THREE.Vector2(0, 1) }, uBend: { value: 0 }, uFade: { value: 0 },
    uFlame: { value: srgb(C.flame) }, uSlot: { value: new THREE.Color(.07, .075, .085) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: `attribute vec4 iA;   // x: center, px from the playhead. y: atlas cell. z: nearness to the playhead (1 on it, 0 a frame away). w: developed
      uniform vec2 uRes; uniform vec2 uOrigin; uniform vec2 uSize; uniform vec2 uSpan; uniform float uBend;
      varying vec4 vA; varying vec2 vQ; varying vec2 vHalf; varying float vX;
      void main(){
        float e = smoothstep(0., 1., iA.z);
        vec2 hs = uSize * (1. + .06 * e) * .5;
        vec2 q = position.xy * 2. * (hs + 1.5);                           // px from the frame center, y up; 1.5 px of rim for antialiasing
        float x = uOrigin.x + iA.x + q.x;
        float u = (x - uOrigin.x) / max(1., .5 * (uSpan.y - uSpan.x));     // -1..1 across the strip
        vec2 p = vec2(x, uOrigin.y - q.y - uBend * u * u);                 // the strip bows a little with speed
        vA = iA; vQ = q; vHalf = hs; vX = x;
        gl_Position = vec4(p.x / uRes.x * 2. - 1., 1. - p.y / uRes.y * 2., 0., 1.);
      }`,
    fragmentShader: `uniform sampler2D tAtlas; uniform vec2 uGrid; uniform vec2 uInset; uniform vec2 uSpan; uniform float uFade; uniform vec3 uFlame; uniform vec3 uSlot;
      varying vec4 vA; varying vec2 vQ; varying vec2 vHalf; varying float vX;
      void main(){
        float e = smoothstep(0., 1., vA.z), dev = vA.w;
        float rd = 1. - smoothstep(.42, .58, 1. - vA.z);   // the frame being read: steps at the midpoint, with the readout
        // the picture: one texel inside its atlas cell, four taps so it holds up when drawn small
        float row = floor((vA.y + .5) / uGrid.x);
        vec2 cell = vec2(vA.y - row * uGrid.x, row);
        vec2 uv = clamp(vQ / (2. * vHalf) + .5, 0., 1.);
        vec2 st = (cell + mix(uInset, 1. - uInset, uv)) / uGrid;
        vec2 dx = dFdx(st) * .25, dy = dFdy(st) * .25;
        vec3 img = (texture2D(tAtlas, st + dx + dy).rgb + texture2D(tAtlas, st - dx - dy).rgb + texture2D(tAtlas, st + dx - dy).rgb + texture2D(tAtlas, st - dx + dy).rgb) * .25;
        // a light table under the playhead: frames brighten as they pass it, the rest sit back
        vec3 col = mix(uSlot, img * mix(.62, 1., e), dev);
        // a hairline round every frame, flame round the one being read
        float d = min(vHalf.x - abs(vQ.x), vHalf.y - abs(vQ.y));
        col = mix(col, vec3(.93, .95, .96), (1. - smoothstep(0., 1., d)) * .16 * (1. - rd));
        col = mix(col, uFlame, (1. - smoothstep(1., 2., d)) * rd);
        // the strip fades out toward both ends
        float fx = (vX - uSpan.x) / max(1., uSpan.y - uSpan.x);
        float a = smoothstep(0., .13, fx) * smoothstep(1., .87, fx) * uFade * mix(.6, 1., dev) * clamp(d + .5, 0., 1.);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1;
  // under the frames: ink rising toward the bottom of the pinned view (higher on the left, behind the stats)
  // so small text keeps its contrast while the flame lights the playa; it fades out past the pin's bottom edge
  const SU2 = { uRes: U.uRes, uBox: { value: new THREE.Vector4() }, uScrim: { value: new THREE.Vector4() }, uFall: { value: 1 }, uRamp: { value: 260 } };
  const scrim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: SU2, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: `uniform vec2 uRes; uniform vec4 uBox; varying vec2 vP;
      void main(){ vec2 p = vec2(mix(uBox.x, uBox.z, position.x + .5), mix(uBox.w, uBox.y, position.y + .5)); vP = p;
        gl_Position = vec4(p.x / uRes.x * 2. - 1., 1. - p.y / uRes.y * 2., 0., 1.); }`,
    fragmentShader: `uniform vec2 uRes; uniform vec4 uScrim; uniform float uFall; uniform float uRamp; varying vec2 vP;   // uScrim: top, bottom, rise on the left, alpha
      void main(){
        float top = uScrim.x - uScrim.z * (1. - vP.x / uRes.x);
        float a = uScrim.w * smoothstep(top, top + uRamp, vP.y) * (1. - smoothstep(uScrim.y, uScrim.y + uFall, vP.y));
        gl_FragColor = vec4(.02, .027, .043, a);
      }`,
  }));
  scrim.frustumCulled = false; scrim.renderOrder = 0;
  const sc = new THREE.Scene(); sc.add(scrim, mesh);
  const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /* ---------- the footage: a phone on a small tripod, square to the motor, a couple of meters back ---------- */
  // the phone's 2x lens (about 52 mm equivalent), 2.4 m from the nozzle, tripod at shin height
  const CAP = { dist: 2.4, along: 0, h: .35, look: -.1, ly: .15, roll: .008, fov: 24, ev: 1.05, aeStops: 2.3, aeLag: .22 };
  let cap = null, ctx = null;
  const devAt = new Float64Array(MAXF).fill(-1);   // when each frame was developed (performance.now, ms); -1 = not yet
  const cam = new THREE.PerspectiveCamera(CAP.fov, FW / FH, .05, 12000);
  const nz = new THREE.Vector3(), nd = new THREE.Vector3(), side = new THREE.Vector3(), look = new THREE.Vector3(), qt = new THREE.Quaternion(), vp = new THREE.Vector4();
  // the phone's auto exposure lags the flame by a few frames, then opens back up after burnout
  function aeAt(f, i) {
    const tau = CAP.aeLag * f.fps; let s = 0, w = 0;
    for (let k = Math.max(0, i - 48); k <= i; k++) { const wk = Math.exp((k - i) / tau); s += wk * Math.min(1.25, f.pts[k][1] / 96); w += wk; }
    return s / w;
  }
  function ensureCap() {
    if (cap) return;
    cap = createPost(renderer, { low: true }); cap.allocate(FW * SS, FH * SS, 1, true);
    renderer.setRenderTarget(atlas); renderer.setClearColor(0x0d0f12, 1); renderer.clear(); renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1);
  }
  function capture(i, f) {
    ensureCap();
    const { scene, world, M, smoke, WIND } = ctx;
    const t = f.pts[i][0], amt = f.pts[i][1] / 96;
    M.tOuter.uniforms.uAmt.value = M.tInner.uniforms.uAmt.value = amt;
    M.tOuter.uniforms.uTime.value = M.tInner.uniforms.uTime.value = 3.1 + t * 2.3;
    M.tFlame.visible = amt > .01; M.tFlame.scale.set(.9 + .25 * amt, .3 + .75 * amt, .9 + .25 * amt);
    M.fireLight.intensity = amt * SMOKE_TUNE.fireLight;
    M.flame.visible = false; M.chute.visible = false;
    M.stand.updateMatrixWorld(true);
    M.testMotor.tail.getWorldPosition(nz); nd.set(0, -1, 0).applyQuaternion(M.testMotor.tail.getWorldQuaternion(qt));
    side.crossVectors(UP, nd).normalize();
    cam.position.copy(nz).addScaledVector(side, CAP.dist).addScaledVector(nd, CAP.along); cam.position.y = CAP.h;
    look.copy(nz).addScaledVector(nd, CAP.look); look.y = CAP.ly;
    cam.up.set(0, 1, 0); cam.lookAt(look); cam.rotateZ(CAP.roll); cam.updateMatrixWorld();
    world.update(cam, t, 1);
    smoke.begin(); staticFireSmoke(smoke, f, t, nz, nd, WIND, lowTier ? SMOKE_TUNE.fireCountLow : SMOKE_TUNE.fireCount); smoke.end(cam);
    const SU = smoke.U;
    SU.uP1.value.copy(nz).addScaledVector(nd, .12);
    SU.uC1.value.setRGB(1, .52, .2).multiplyScalar(M.fireLight.intensity * SMOKE_TUNE.fireToSmoke);
    SU.uGlow.value.setRGB(1.6, .62, .2).multiplyScalar(amt * SMOKE_TUNE.fireGlow);
    // shadows don't depend on the camera: reuse the maps the main view just rendered
    const su = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    cap.render(scene, cam, { exposure: world.state.exposure * CAP.ev * Math.pow(2, -CAP.aeStops * aeAt(f, i)), bloom: .1, threshold: 1.3, aperture: 0, vignette: .3, grain: .035, time: 1 + i * .618, fade: 1 },
      null, atlas, vp.set((i % COLS) * FW, Math.floor(i / COLS) * FH, FW, FH));
    renderer.shadowMap.autoUpdate = su;
  }
  // develop the frames nearest the playhead first, one per screen frame
  function develop(f, pos, budget) {
    for (let k = 0; k < budget; k++) {
      let best = -1, bd = 1e9;
      for (let i = 0; i < f.pts.length; i++) if (devAt[i] < 0) { const d = Math.abs(i - pos) + (i < pos - .5 ? .4 : 0); if (d < bd) { bd = d; best = i; } }
      if (best < 0) return;
      capture(best, f); devAt[best] = performance.now();
    }
  }

  /* ---------- layout, measured on resize; the pin's position comes from the scroll ---------- */
  const L = { ok: false, left: 0, W: 1, cx: .5, ch: 64, offF: 0, offS: 0, fH: 100, pinH: 1, fw: 160, fh: 90, ppf: 168, bend: 10 };
  function measure() {
    const pr = pinEl.getBoundingClientRect(), sr = el.getBoundingClientRect(), fr = framesEl.getBoundingClientRect();
    L.left = sr.left; L.W = sr.width; L.cx = sr.width / 2; L.pinH = pr.height;
    L.offF = fr.top - pr.top; L.fH = fr.height; L.ch = cv.svg.getBoundingClientRect().height || 64;
    L.offS = (isNarrow() ? winEl : footEl).getBoundingClientRect().top - pr.top;   // where the scrim starts: under the window on phones, under the heading's second half on desktop
    L.fh = Math.round(L.fH / 1.18); L.fw = L.fh * 16 / 9; L.ppf = Math.round(L.fw + Math.max(6, L.fw * .05));
    L.bend = L.fh * .1;
    U.uRes.value.set(canvasEl.clientWidth || innerWidth, canvasEl.clientHeight || innerHeight);
    cv.pastR.setAttribute('width', L.cx.toFixed(1)); cv.nextR.setAttribute('x', L.cx.toFixed(1)); cv.nextR.setAttribute('width', (L.W - L.cx).toFixed(1));
    cv.now.setAttribute('d', `M${(L.cx - 4.5).toFixed(1)},0h9v3.5l-4.5,4.5l-4.5,-4.5z`);
    L.ok = true; curveFor = null;
  }
  addEventListener('resize', () => { L.ok = false; });
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { L.ok = false; }); ro.observe(el); ro.observe(pinEl); }

  /* ---------- the timeline ruler: same pixel spacing as the frames, the read part in flame ---------- */
  let curveFor = null, lastTx = '';
  function buildCurve(f) {
    // two rows, like edge codes on film: time marks on top (the chart's 0.25 s grid), frame numbers under them
    const y0 = L.ch - 1.5, n = f.pts.length, step = .25, yT = Math.max(9, y0 - 13), yF = y0 - 3;
    let tk = '', tl = '';
    for (let i = 0; i < n; i++) {
      const x = i * L.ppf;
      tk += `M${x.toFixed(1)} ${y0}v-4`;
      tl += `<text class="fn" x="${(x + 4).toFixed(1)}" y="${yF.toFixed(1)}">${String(i + 1).padStart(2, '0')}</text>`;
    }
    for (let t = 0; t <= f.end + 1e-6; t += step) {
      const x = t * f.fps * L.ppf;
      tk += `M${x.toFixed(1)} ${y0}V0`;
      tl += `<text x="${(x + 4).toFixed(1)}" y="${yT.toFixed(1)}">${t.toFixed(2)} s</text>`;
    }
    const inner = `<path d="${tk}"></path>${tl}`;
    cv.past.innerHTML = inner; cv.next.innerHTML = inner;
    cv.g0.setAttribute('y1', y0); cv.g0.setAttribute('y2', y0);
    if (cv.fps) cv.fps.textContent = f.fps + ' fps';
    curveFor = f; lastTx = '';
  }

  /* ---------- motion: follow the burn clock, or hold a frame the reader picked ---------- */
  // mode: follow (the burn clock), drag (pointer), glide (easing to a picked frame), held, swap (cutting to a new clip)
  const P = { mode: 'follow', pos: 0, prev: null, vel: 0, bend: 0, hold: 0, target: 0, rate: 9, rub: 0, drag: null, gen: -1, mix: null, swap0: -1e9, wheelT: 0 };
  const nOf = () => FORMS[sel].pts.length;
  const clockPos = f => Math.min(burn.scrubT != null ? burn.scrubT : Math.max(burn.t, 0), f.end) * f.fps;   // scrubT runs past the end while the smoke drifts on
  const logicalPos = () => P.mode === 'glide' ? P.hold : clockPos(FORMS[sel]);
  function holdAt(p) { const f = FORMS[sel]; holdBurn(clamp(p, 0, f.pts.length - 1) / f.fps); }
  // ease to a frame: rate 9/s for taps and keys; a fling uses a slower rate so it leaves the hand at release speed
  function glideTo(i, rate = 9) {
    if (P.mode === 'swap') return;
    const p = logicalPos(); pauseBurn();
    P.hold = p; P.target = clamp(Math.round(i), 0, nOf() - 1); P.rate = rate; P.mode = 'glide';
    if (reduce) { P.hold = P.target; holdAt(P.hold); P.mode = 'held'; }
  }
  // pointer: a sideways drag scrubs (vertical drags stay page scrolls), a tap picks the frame under it
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    P.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: 0, moved: false, hist: [[e.timeStamp, e.clientX]] };
  });
  el.addEventListener('pointermove', e => {
    const d = P.drag; if (!d || e.pointerId !== d.id) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { P.drag = null; el.classList.remove('drag'); if (d.moved) glideTo(logicalPos()); return; }
    if (P.mode === 'swap') return;
    const dx = e.clientX - d.x0;
    if (!d.moved) {
      if (Math.abs(dx) < 5 || Math.abs(dx) < Math.abs(e.clientY - d.y0)) return;
      if (!L.ok) measure();
      d.moved = true; d.p0 = logicalPos() + dx / L.ppf; pauseBurn(); P.mode = 'drag';
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
      el.classList.add('drag');
    }
    d.hist.push([e.timeStamp, e.clientX]); while (d.hist.length > 2 && e.timeStamp - d.hist[0][0] > 110) d.hist.shift();
    const n = nOf(), raw = d.p0 - dx / L.ppf, c = clamp(raw, 0, n - 1), over = raw - c;
    P.rub = over ? Math.sign(over) * .5 * (1 - 1 / (1 + Math.abs(over))) : 0;   // a little give past either end
    holdAt(c);
  });
  function endDrag(e, cancelled) {
    const d = P.drag; if (!d || e.pointerId !== d.id) return;
    P.drag = null; el.classList.remove('drag');
    if (!d.moved) { if (!cancelled && L.ok) glideTo(logicalPos() + (e.clientX - L.left - L.cx) / L.ppf); return; }
    const h = d.hist, a = h[0], b = h[h.length - 1], dt = (b[0] - a[0]) / 1000;
    const v = dt > .008 && e.timeStamp - b[0] < 90 ? (b[1] - a[1]) / dt : 0;   // px/s at release
    const FLING = 4.5;   // 1/s: the glide starts at the release speed and settles on the nearest frame
    glideTo(clockPos(FORMS[sel]) - clamp(v, -5000, 5000) / L.ppf / FLING, FLING);
  }
  el.addEventListener('pointerup', e => endDrag(e, false));
  el.addEventListener('pointercancel', e => endDrag(e, true));
  el.addEventListener('lostpointercapture', e => endDrag(e, true));
  // keys, as on any slider
  el.addEventListener('keydown', e => {
    const n = nOf(), cur = P.mode === 'glide' ? P.target : Math.round(logicalPos());
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
    const to = step != null ? cur + step : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (to == null) return;
    e.preventDefault(); glideTo(to);
  });
  // a sideways swipe on a trackpad scrubs too; vertical wheel still scrolls the page
  el.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2 || !L.ok || P.mode === 'swap') return;
    e.preventDefault(); e.stopPropagation();
    const n = nOf(), p = clamp((P.mode === 'glide' ? P.target : logicalPos()) + e.deltaX / L.ppf, 0, n - 1);
    pauseBurn(); P.mode = 'held'; holdAt(p); P.wheelT = .16;
  }, { passive: false });

  // the chart window scrubs the same clock: a drag holds a moment (in frames), a tap eases to a frame
  BURN_UI.strip = { hold(p) { if (P.mode === 'swap') return; pauseBurn(); P.mode = 'held'; P.drag = null; holdAt(p); }, glideTo: i => glideTo(i),
    half: () => L.ok ? L.W * .4 / L.ppf : 0 };
  const sv = new THREE.Vector2();
  const api = {
    capture,
    init(c) { ctx = c; },
    draw(sy, dt) {
      if (!ctx || !MET.dat) return;
      const D = MET.dat, secTop = D.t - sy;
      if (secTop > MET.vh * 1.6 || secTop + D.h < -MET.vh * .6) return;   // far away: nothing to do
      if (!L.ok) measure();
      // the capture pipeline and the atlas are set up the first time the section comes near, never at startup
      ensureCap();

      // a restart or another mix: cut to it with a quick dip, like loading a new clip (real time, so it never drags)
      const now = performance.now();
      if (burn.gen !== P.gen || sel !== P.mix) {
        if (P.mode !== 'swap') {
          const jump = sel !== P.mix || Math.abs(P.pos - clockPos(FORMS[sel])) > .75;   // a replay from the start needs no cut
          P.swap0 = now - (P.gen === -1 ? 450 : jump && U.uFade.value > .02 && !reduce ? 0 : 120);   // first appearance: no dip
          P.mode = 'swap'; P.drag = null; P.wheelT = 0; el.classList.remove('drag');
        }
        if (now - P.swap0 >= 120) {
          P.gen = burn.gen; P.mode = burn.scrubT != null ? 'held' : 'follow'; P.rub = 0; P.prev = null; P.vel = 0;
          if (P.mix !== sel) { P.mix = sel; devAt.fill(-1); curveFor = null; }
        }
      }
      const cutting = P.mode === 'swap', st = (now - P.swap0) / 1000;
      const dip = cutting ? 1 - st / .12 : sstep(.12, .45, st);
      const f = FORMS[P.mix || sel], n = f.pts.length;   // the clip on screen (the old one until the cut)

      // where the strip sits, in frames
      if (P.mode === 'glide') {
        P.hold += (P.target - P.hold) * (1 - Math.exp(-dt * P.rate));
        if (Math.abs(P.target - P.hold) < .004) { P.hold = P.target; P.mode = 'held'; }
        holdAt(P.hold);
      }
      if (P.wheelT > 0 && (P.wheelT -= dt) <= 0 && P.mode === 'held') glideTo(logicalPos());
      if (!P.drag || !P.drag.moved) P.rub *= Math.exp(-dt * 14);
      const pos = cutting ? P.pos : logicalPos() + P.rub;

      // speed bows the strip; it settles flat when it stops
      if (P.prev != null && dt > 0) P.vel += ((pos - P.prev) / dt - P.vel) * (1 - Math.exp(-dt * 10));
      P.prev = pos; P.pos = pos;
      const bt = reduce ? 0 : clamp(-P.vel * L.ppf / 2400, -1, 1) * L.bend;
      P.bend += (bt - P.bend) * (1 - Math.exp(-dt * 7));

      // develop this clip's frames, only in the same night the test was shot in
      if (!cutting && ctx.world.state.elev < -12.3) develop(f, pos, TEST.capAll ? MAXF : 1);

      // the ruler slides under the playhead with the frames
      if (curveFor !== f) buildCurve(f);
      const tx = (L.cx - pos * L.ppf).toFixed(1);
      if (tx !== lastTx) { const tr = `translate(${tx},0)`; cv.past.setAttribute('transform', tr); cv.next.setAttribute('transform', tr); lastTx = tx; }
      const op = dip.toFixed(2); if (cv.all.style.opacity !== op) cv.all.style.opacity = op;

      // the frames
      for (let i = 0; i < n; i++) {
        const o = i * 4, dv = devAt[i] < 0 ? 0 : Math.min(1, (now - devAt[i]) / 350);
        iA[o] = (i - pos) * L.ppf; iA[o + 1] = i; iA[o + 2] = Math.max(0, 1 - Math.abs(i - pos)); iA[o + 3] = dv;
      }
      geo.instanceCount = n; aA.needsUpdate = true;
      const pinTop = Math.min(Math.max(secTop, 0), secTop + D.h - L.pinH), pinBot = pinTop + L.pinH, R = U.uRes.value;
      const narrow = isNarrow(), sTop = pinTop + L.offS - (narrow ? 40 : 90), rise = 0;
      SU2.uScrim.value.set(sTop, pinBot, rise, narrow ? .58 : .6); SU2.uFall.value = MET.vh * .3; SU2.uRamp.value = narrow ? 170 : 220;
      SU2.uBox.value.set(0, Math.max(0, sTop - rise), R.x, Math.min(R.y, pinBot + MET.vh * .3));
      U.uFade.value = dip; mesh.visible = dip > .002;
      U.uOrigin.value.set(L.left + L.cx, pinTop + L.offF + L.fH / 2);
      U.uSize.value.set(L.fw, L.fh); U.uSpan.value.set(L.left, L.left + L.W); U.uBend.value = P.bend;
      renderer.setRenderTarget(null);
      renderer.getSize(sv); renderer.setViewport(0, 0, sv.x, sv.y);
      const ac = renderer.autoClear; renderer.autoClear = false;
      renderer.render(sc, oc);
      renderer.autoClear = ac;
    },
  };
  // test-only hook (window.__TEST.hooks): drive the strip and read the atlas from Playwright
  if (TEST.hooks) window.__strip = {
    P, L, CAP, burn, FORMS, select, playBurn, holdBurn, glideTo, get sel() { return sel; }, get developed() { return Array.from(devAt.subarray(0, nOf())).filter(x => x >= 0).length; },
    recapture() { devAt.fill(-1); },
    settle() { P.vel = 0; P.bend = 0; P.prev = null; },   // a held frame after a test jump, as it looks once a glide has ended
    // where frame 0 sits in the WebGL strip vs. where reading 0 sits on the SVG curve (screen px)
    align() { const r = cv.svg.getBoundingClientRect(), m = /translate\(([-\d.]+)/.exec(cv.past.getAttribute('transform')); return { gl: +(U.uOrigin.value.x - P.pos * L.ppf).toFixed(2), svg: +(r.left + +m[1]).toFixed(2), glY: +U.uOrigin.value.y.toFixed(1), framesMid: +((framesEl.getBoundingClientRect().top + framesEl.getBoundingClientRect().bottom) / 2).toFixed(1) }; },
    nozzle() { const { M, STAND_POS } = ctx, p = new THREE.Vector3(), d = new THREE.Vector3(0, -1, 0); M.stand.updateMatrixWorld(true); M.testMotor.tail.getWorldPosition(p); d.applyQuaternion(M.testMotor.tail.getWorldQuaternion(new THREE.Quaternion())); return { p: p.toArray().map(v => +v.toFixed(3)), d: d.toArray().map(v => +v.toFixed(3)), SP: STAND_POS.toArray() }; },
    atlasPNG() {
      const w = FW * COLS, h = FH * ROWS, buf = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(atlas, 0, 0, w, h, buf);
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), id = g.createImageData(w, h);
      for (let y = 0; y < h; y++) id.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      g.putImageData(id, 0, 0); return c.toDataURL('image/png');
    },
  };
  return api;
}
