/* =====================================================================
   Build log: the latest entry leads with a large picture, earlier entries
   are big type rows. Until the team has photos, every picture is a render
   of this same world, shot once at load into an atlas by a small post
   pipeline of its own (the film strip shoots its frames the same way):
     0  the 65/35 motor on the stand at night, smoke rolling off downwind
     1  the phone's view of the burn, the frames the thrust is read from
     2  cast grains on a board under the work light
     3  the avionics sled lifted out of its bay, macro, at blue hour
     4  the fin can at first light
   The latest entry gets its picture as a canvas that develops in under a
   scan line when it scrolls into view; phones get inline thumbnails. On
   desktop the picture of the row under the cursor follows it, drawn on
   the main canvas after the composite: it bends with the cursor's speed
   and its color channels part a little (after jesperlandberg.com).
   createBlog(ctx) -> { init(ctx2), draw(sy, dt) }
   ===================================================================== */
function createBlog(ctx) {
  const { renderer, scene, world, M, smoke, Q, WIND } = ctx;
  const root = $('#log');
  if (!root) return { init() {}, draw() {} };
  const canvasEl = renderer.domElement;
  const rowEls = $$('.lg-a', root), liEls = rowEls.map(a => a.closest('li'));
  const fig = $('.lg-fig', root), figImg = $('.lg-img', root), scanEl = $('.lg-scan', root);
  const pcap = $('.lg-pcap', root), pcapT = $('.lg-pcap-t', root), toastEl = $('.lg-toast', root);

  /* ---------- the atlas: five 3:2 pictures, two across ---------- */
  const CW = Q.low ? 720 : 960, CH = CW * 2 / 3, COLS = 2, ROWS = 3, AW = CW * COLS, AH = CH * ROWS;
  const atlas = new THREE.WebGLRenderTarget(AW, AH, { depthBuffer: false, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
  atlas.texture.colorSpace = THREE.NoColorSpace;   // display-ready sRGB from the capture's own composite
  const cellVp = i => new THREE.Vector4((i % COLS) * CW, Math.floor(i / COLS) * CH, CW, CH);
  const cellUV = (i, v) => v.set((i % COLS) / COLS, Math.floor(i / COLS) / ROWS, 1 / COLS, 1 / ROWS);

  /* ---------- posing the world for a picture ---------- */
  const NZ = new THREE.Vector3(), ND = new THREE.Vector3(), SD = new THREE.Vector3(), qt = new THREE.Quaternion();
  // the stand's nozzle, the flame axis and the side square to it (as in the static-fire shots)
  function nozzle() { M.stand.updateMatrixWorld(true); M.testMotor.tail.getWorldPosition(NZ); ND.set(0, -1, 0).applyQuaternion(M.testMotor.tail.getWorldQuaternion(qt)); SD.crossVectors(UP, ND).normalize(); }
  // th = 0 behind the nozzle looking along the flame, 90 square to it on the near side, -90 on the far side
  const aroundStand = (th, d, h) => { const c = Math.cos(th * DEG) * d, s = Math.sin(th * DEG) * d; return [NZ.x - ND.x * c + SD.x * s, h, NZ.z - ND.z * c + SD.z * s]; };
  const alongFlame = (a, h) => [NZ.x + ND.x * a, h, NZ.z + ND.z * a];
  function poseRocket(o) {
    M.rocket.position.set(0, 0, 0); M.tilt.rotation.z = 0;
    M.stack.position.y = .3 + (o.lift || 0);
    M.parts.forEach((p, i) => {
      p.g.position.copy(p.base).addScaledVector(p.dir, p.dist * (o.ex || 0));
      p.g.rotation.y = (o.spin && o.spin[i]) || 0;
      const f = (o.f && o.f[i]) || 0;
      p.subs.forEach(sb => sb.g.position.copy(sb.base).addScaledVector(sb.dir, sb.dist * f));
      p.ms.keep.value = f;
    });
    M.SCAN.uScan.value = 0; M.SCAN.uGhost.value = 0; M.tagU.uTime.value = 2.3;
    M.flame.visible = false; M.tailLight.intensity = 0; M.chute.visible = false; M.tag.visible = true;
    M.rocket.updateMatrixWorld(true);
  }
  function fire(amt, t) {
    M.tOuter.uniforms.uAmt.value = M.tInner.uniforms.uAmt.value = amt;
    M.tOuter.uniforms.uTime.value = M.tInner.uniforms.uTime.value = t;
    M.tFlame.visible = amt > .01; M.tFlame.scale.set(.9 + .25 * amt, .3 + .75 * amt, .9 + .25 * amt);
    M.fireLight.intensity = amt * SMOKE_TUNE.fireLight;
  }
  function workLight(on) {
    const wi = 2.4 * on, ud = M.work.userData;
    ud.spot.intensity = wi; ud.spot.shadow.autoUpdate = wi > .002; ud.lens.material.color.setRGB(1, .94, .84).multiplyScalar(.25 + 1.6 * wi);
  }
  // smoke lighting, set before the cloud is shaded (the stage sets it a frame late; a still has no next frame)
  function lightSmoke(time) {
    const SU = smoke.U, W = world.state, spot = M.work.userData.spot;
    SU.uP1.value.copy(NZ).addScaledVector(ND, .12);
    SU.uC1.value.setRGB(1, .52, .2).multiplyScalar(M.fireLight.intensity * SMOKE_TUNE.fireToSmoke);
    SU.uGlow.value.setRGB(1.6, .62, .2).multiplyScalar(M.tOuter.uniforms.uAmt.value * SMOKE_TUNE.fireGlow);
    spot.getWorldPosition(SU.uP2.value); SU.uC2.value.setRGB(1, .95, .87).multiplyScalar(spot.intensity * SMOKE_TUNE.workToSmoke);
    SU.uD2.value.set(0, 1.15, 0).sub(SU.uP2.value).normalize();
    const sunUp = world.sun.intensity > .01;
    SU.uKeyDir.value.copy(sunUp ? W.sunDir : W.moonDir);
    SU.uKeyCol.value.copy(sunUp ? world.sun.color : world.moon.color).multiplyScalar(sunUp ? world.sun.intensity : world.moon.intensity);
    SU.uTime.value = time;
  }
  // cast grains on a small board: two bare, one still in its paper liner, one on its side showing the core
  let props = null;
  function grains() {
    if (props) return props;
    const g = new THREE.Group(), gm = M.MATDEF.grain(), km = M.MATDEF.kraft();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: .82 });
    const ro = .019, ri = .0065, h = .066, seg = Q.low ? 32 : 64;
    const wall = new THREE.CylinderGeometry(ro, ro, h, seg, 1, true).translate(0, h / 2, 0);
    const core = new THREE.CylinderGeometry(ri, ri, h, 24, 1, true).translate(0, h / 2, 0);
    const end = new THREE.RingGeometry(ri, ro, seg, 1).rotateX(-Math.PI / 2);
    const coreM = gm.clone(); coreM.side = THREE.BackSide; coreM.color = new THREE.Color(0xcdb68a);
    const grain = (lin) => {
      const o = new THREE.Group();
      o.add(new THREE.Mesh(wall, lin ? km : gm), new THREE.Mesh(core, coreM));
      const top = new THREE.Mesh(end, gm); top.position.y = h; o.add(top);
      const bot = new THREE.Mesh(end, gm); bot.rotation.x = Math.PI; o.add(bot);
      if (lin) { const l = new THREE.Mesh(new THREE.CylinderGeometry(ro + .0011, ro + .0011, h + .006, seg, 1, true).translate(0, h / 2 - .001, 0), km); l.material = km.clone(); l.material.side = THREE.DoubleSide; o.add(l); }
      return o;
    };
    const board = new THREE.Mesh(new THREE.BoxGeometry(.34, .014, .2), wood); board.position.y = .007; g.add(board);
    const at = (o, x, z, ry) => { o.position.set(x, .014, z); o.rotation.y = ry || 0; g.add(o); return o; };
    at(grain(false), -.085, .03); at(grain(false), -.035, -.035, .3); at(grain(true), .02, .03);
    const lying = at(grain(false), .095, -.01); lying.rotation.set(0, -.5, Math.PI / 2); lying.position.y = .014 + ro; lying.position.x = .09 + h / 2 * .88;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return props = g;
  }

  /* ---------- the shots. Meters, the pad at the origin, east is -z (see 60-shots-*.js) ---------- */
  const F65 = FORMS.a;
  const peakT = F65.pts.reduce((b, p) => p[1] > b[1] ? p : b, F65.pts[0])[0];
  const SPECS = [
    // the latest entry: low beside the stand at night, from across the flame, smoke rolling off to the right
    { p: { tod: .12, work: 1, th: -100, d: 3.3, h: .3, along: .5, ty: .24, mm: 40, ap: 2, t: .85, ev: -1.3, bloom: .1, thr: 1.4 },
      shot: p => { fire(thrustAt(F65, p.t) / 96, 3.1 + p.t * 2.3); return { cam: aroundStand(p.th, p.d, p.h), tgt: alongFlame(p.along, p.ty), burn: p.t }; } },
    // the phone on its tripod, square to the motor, its exposure closed down for the flame
    { p: { tod: .12, work: 1, d: 2.4, h: .35, look: -.1, ly: .15, mm: 50, roll: .008, t: peakT + .04, ev: -2, bloom: .1, thr: 1.3, vig: .3 },
      shot: p => { fire(thrustAt(F65, p.t) / 96, 3.1 + p.t * 2.3); return { cam: [NZ.x + SD.x * p.d, p.h, NZ.z + SD.z * p.d], tgt: alongFlame(p.look, p.ly), burn: p.t }; } },
    // grains on a board behind the pad, in the work light's beam
    { p: { tod: .1, work: 1, x: -.9, z: -.3, ry: .4, cx: .42, cy: .13, cz: .34, ty: .035, mm: 70, ap: 9, ev: 0 },
      shot: p => { const g = grains(); g.position.set(p.x, 0, p.z); g.rotation.y = p.ry; scene.add(g); g.updateMatrixWorld(true); return { cam: [p.x + p.cx, p.cy, p.z + p.cz], tgt: [p.x, p.ty, p.z], after: () => scene.remove(g) }; } },
    // the avionics sled out of its bay, macro, the work light and the blue-hour sky out of focus behind
    { p: { tod: .55, work: 1, cx: .22, cy: 1.86, cz: .82, tx: 0, ty: 1.79, tz: 0, mm: 100, ap: 14, ev: 0, rocket: { ex: 1.5, lift: 2.2, f: [0, 0, 1, 0, 0] } },
      shot: p => ({ cam: [p.cx, p.cy, p.cz], tgt: [p.tx, p.ty, p.tz] }) },
    // the fin can at first light: low beside the pad, the fins against the brightening sky, the igniter lead below
    { p: { tod: .75, work: 0, cx: -.42, cy: .2, cz: .55, tx: 0, ty: .26, tz: 0, mm: 35, ap: 3, ev: 0 },
      shot: p => ({ cam: [p.cx, p.cy, p.cz], tgt: [p.tx, p.ty, p.tz] }) },
  ];
  const frameNo = Math.round(SPECS[1].p.t * F65.fps) + 1;
  const CAPS = ['The 65/35 motor on the stand, night of the test', `The phone's view, frame ${frameNo} of ${F65.pts.length} at ${F65.fps} fps`,
    'Grains cast and cut, before they go in the casing', 'The altimeter and GPS sled, out of its bay', 'The fin can at first light'];

  /* ---------- shooting: own camera, own post, the main scene with only the world in it ---------- */
  let cap = null, ready = false, fakeNow = 0;
  const camC = new THREE.PerspectiveCamera(30, 1.5, .05, 12000), tgtV = new THREE.Vector3();
  const keep = new Set();
  function shoot(i, over) {
    const s = SPECS[i], p = { ...s.p, ...(over || {}) };
    const hid = [];
    for (const o of scene.children) if (o.visible && !keep.has(o)) { o.visible = false; hid.push(o); }
    // the clock: its environment light is throttled in real time, so each still gets its own later timestamp
    world.setTime(p.tod, fakeNow += 130);
    const W = world.state;
    poseRocket(p.rocket || {}); fire(0, 0); workLight(p.work || 0); nozzle();
    const r = s.shot(p);
    camC.fov = 2 * Math.atan(12 / p.mm) / DEG; camC.aspect = 1.5;
    camC.position.fromArray(r.cam); tgtV.fromArray(r.tgt); camC.up.set(0, 1, 0); camC.lookAt(tgtV);
    if (p.roll) camC.rotateZ(p.roll);
    const dist = camC.position.distanceTo(tgtV);
    camC.near = clamp(dist * .02, .006, .2); camC.far = 12000; camC.updateProjectionMatrix(); camC.updateMatrixWorld();
    world.update(camC, 1 + i, 1);
    lightSmoke(p.t ? 3.1 + p.t * 2.3 : 1);
    smoke.begin();
    if (r.burn > 0) staticFireSmoke(smoke, F65, r.burn, NZ, ND, WIND, Q.low ? SMOKE_TUNE.fireCountLow : SMOKE_TUNE.fireCount);
    smoke.end(camC);
    cap.render(scene, camC, { exposure: W.exposure * Math.pow(2, p.ev || 0), bloom: p.bloom ?? .07, threshold: p.thr ?? 1.6, focus: p.focus ?? dist,
      aperture: Q.low ? 0 : p.ap || 0, vignette: p.vig ?? .22, grain: .016, time: 1 + i * .618, fade: 1 }, null, atlas, cellVp(i));
    hid.forEach(o => { o.visible = true; });
    if (r.after) r.after();
  }
  // the pictures are shot only once the log is within reach, one per frame after the page's own frame,
  // so they never hold up the load or stall a scroll
  let shotI = -1;
  function shootBegin() {
    cap = cap || createPost(renderer, { low: Q.low }); cap.allocate(CW, CH, 1, true);
    // only the world goes in the pictures: overlays other modules add to the scene stay out
    for (const o of [M.rocket, M.pad, M.work, M.stand, M.chute, smoke.mesh, world.stars, world.playa, world.moon, world.moon.target, world.sun, world.sun.target]) if (o) keep.add(o);
    for (const o of scene.children) if (o.isMesh && o.renderOrder === -10 && o.material && o.material.side === THREE.BackSide) keep.add(o);   // the sky dome
    shotI = 0;
  }
  function shootNext() {
    fakeNow = Math.max(fakeNow, performance.now() + 200);
    const su = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = true;
    try { shoot(shotI++); } finally { renderer.shadowMap.autoUpdate = su; restoreWorld(); }
    if (shotI < SPECS.length) return;
    develop();
    cap.allocate(2, 2, 1, true);   // free the capture buffers; the atlas keeps the pictures
    shotI = -2; ready = true;
  }
  // hand the world back to the stage (its next frame poses everything and rebuilds the sky for its own time)
  function restoreWorld() { if (world.invalidate) world.invalidate(); else world.setTime(.03, fakeNow += 130); poseRocket({}); fire(0, 0); workLight(1); smoke.begin(); smoke.end(camC); renderer.setRenderTarget(null); }
  // the pictures for the page itself: the latest entry's print and the phone thumbnails
  function develop() {
    const buf = new Uint8Array(AW * AH * 4);
    renderer.readRenderTargetPixels(atlas, 0, 0, AW, AH, buf);
    const src = document.createElement('canvas'); src.width = AW; src.height = AH;
    const g = src.getContext('2d'), id = g.createImageData(AW, AH);
    for (let y = 0; y < AH; y++) id.data.set(buf.subarray((AH - 1 - y) * AW * 4, (AH - y) * AW * 4), y * AW * 4);
    g.putImageData(id, 0, 0);
    const paint = (cv, i, w, h) => {
      cv.width = w; cv.height = h; const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high';
      c.drawImage(src, (i % COLS) * CW, AH - (Math.floor(i / COLS) + 1) * CH, CW, CH, 0, 0, w, h);
    };
    if (figImg) paint(figImg, +(fig.dataset.img || 0), CW, CH);
    rowEls.forEach(a => { const cv = $('.lg-th canvas', a); if (cv) paint(cv, +a.dataset.img, 300, 200); });
    src.width = src.height = 0;
  }

  /* ---------- the hover picture: a bent quad on the main canvas ---------- */
  const U = {
    tAtlas: { value: atlas.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uPos: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2(390, 260) },
    uVel: { value: new THREE.Vector2() }, uA: { value: 0 }, uMix: { value: 1 }, uCellA: { value: new THREE.Vector4() }, uCellB: { value: new THREE.Vector4() },
    uInset: { value: new THREE.Vector2(2 / AW, 2 / AH) }, uSplit: { value: .022 },
  };
  const pvMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: `uniform vec2 uRes; uniform vec2 uPos; uniform vec2 uSize; uniform vec2 uVel; uniform float uA; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec2 q = position.xy * uSize * mix(.9, 1., uA);                // px from the center, y up
        // dragged by the cursor: the middle of each edge trails the motion
        q.x -= sin(uv.y * 3.14159) * uVel.x * uSize.x * .13;
        q.y += sin(uv.x * 3.14159) * uVel.y * uSize.y * .13;
        vec2 p = vec2(uPos.x + q.x, uPos.y - q.y);
        gl_Position = vec4(p.x / uRes.x * 2. - 1., 1. - p.y / uRes.y * 2., 0., 1.);
      }`,
    fragmentShader: `uniform sampler2D tAtlas; uniform vec4 uCellA; uniform vec4 uCellB; uniform vec2 uInset; uniform vec2 uVel; uniform float uA; uniform float uMix; uniform float uSplit;
      varying vec2 vUv;
      vec3 pic(vec4 c, vec2 st, vec2 off){
        vec2 lo = c.xy + uInset, hi = c.xy + c.zw - uInset;
        return vec3(texture2D(tAtlas, clamp(c.xy + (st + off) * c.zw, lo, hi)).r, texture2D(tAtlas, clamp(c.xy + st * c.zw, lo, hi)).g, texture2D(tAtlas, clamp(c.xy + (st - off) * c.zw, lo, hi)).b);
      }
      void main(){
        // a shutter opening from the middle out while the picture settles from a slight zoom
        float d = abs(vUv.y - .5) * 2., aa = fwidth(vUv.y) * 2.;
        float m = 1. - smoothstep(uA - aa, uA, d);
        vec2 st = (vUv - .5) * mix(.8, 1., uA) + .5;
        // the color channels part a little along the motion
        vec2 off = vec2(uVel.x, -uVel.y) * uSplit;
        // a new picture wipes up over the last one
        float w = smoothstep(vUv.y - .12, vUv.y, uMix * 1.12);
        vec3 col = mix(pic(uCellB, st, off), pic(uCellA, st + vec2(0., (1. - uMix) * -.06), off), w);
        gl_FragColor = vec4(col, m);
      }`,
  });
  const pvQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 24, 24), pvMat); pvQuad.frustumCulled = false;
  const pvScene = new THREE.Scene(); pvScene.add(pvQuad);
  const pvCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const PV = { cur: -1, prev: -1, mix: 1, a: 0, x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, side: 1, kbd: -1, inDoc: false };
  const L = { ok: false, secT: -1, rows: [] };
  // row rectangles in page coordinates, from layout offsets (the reveal animation moves the rows)
  function measure() {
    const b = root.getBoundingClientRect(), bx = b.left, by = b.top + scrollY;
    L.rows = liEls.map((li, k) => ({ l: bx + li.offsetLeft, r: bx + li.offsetLeft + li.offsetWidth, t: by + li.offsetTop, b: by + li.offsetTop + li.offsetHeight, img: +rowEls[k].dataset.img }));
    L.ok = true; L.secT = MET.log ? MET.log.t : -1;
  }
  addEventListener('resize', () => { L.ok = false; });
  if (window.ResizeObserver) new ResizeObserver(() => { L.ok = false; }).observe(root);
  const hoverMQ = matchMedia('(hover: hover) and (pointer: fine)');
  const canHover = () => hoverMQ.matches && !isNarrow();
  addEventListener('pointermove', e => { PV.inDoc = e.pointerType !== 'touch'; }, { passive: true });
  addEventListener('mouseout', e => { if (!e.relatedTarget) PV.inDoc = false; });
  rowEls.forEach((a, k) => {
    a.addEventListener('focus', () => { PV.kbd = a.matches(':focus-visible') ? k : -1; });
    a.addEventListener('blur', () => { if (PV.kbd === k) PV.kbd = -1; });
  });

  /* ---------- entries open on the real site; in this preview, say so ---------- */
  let toastT = 0;
  root.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'); if (!a || !root.contains(a)) return;
    e.preventDefault(); e.stopPropagation();
    toastEl.textContent = 'Full entries go up when the site goes live.';
    toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2800);
  });

  /* ---------- the sheet's choreography: the print develops, rows draw in (the shared watcher types the code label) ---------- */
  const DIG = '0123456789';
  function decode(el, dur) {
    const fin = el.dataset.t ?? (el.dataset.t = el.textContent);
    if (!/\d/.test(fin)) return;
    const t0 = performance.now();
    const step = now => {
      const k = clamp((now - t0) / (dur * 1000), 0, 1); let s = '';
      for (let i = 0; i < fin.length; i++) { const c = fin[i]; s += /\d/.test(c) && (i + 1) / fin.length > k ? DIG[(Math.random() * 10) | 0] : c; }
      el.textContent = s;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function choreograph() {
    if (!G || reduce) return;
    gsap.from($$('.lg-stat > div', root), { y: 16, opacity: 0, duration: 1, ease: 'expo.out', stagger: .08, scrollTrigger: { trigger: $('.lg-head', root), start: 'top 82%', once: true } });
    // the latest entry: the print develops out of the drafting paper under a scan line
    gsap.set(figImg, { clipPath: 'inset(0% 0% 100% 0%)' });
    const tl = gsap.timeline({ paused: true });
    tl.to(figImg, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'power3.inOut' }, 0)
      .fromTo(figImg, { scale: 1.16 }, { scale: 1, duration: 2.4, ease: 'expo.out' }, 0)
      .fromTo(scanEl, { top: '0%', opacity: 1 }, { top: '100%', duration: 1.6, ease: 'power3.inOut' }, 0)
      .to(scanEl, { opacity: 0, duration: .35 }, 1.45)
      .from($$('.lg-ftext > *', root), { y: 24, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .07 }, .2)
      .add(() => $$('.lg-feat .lg-dc', root).forEach(e => decode(e, .8)), .3);
    ScrollTrigger.create({ trigger: fig, start: 'top 84%', once: true, onEnter: () => tl.play() });
    // earlier entries: each rule draws across, then its row rises into place
    liEls.forEach(li => {
      const a = $('.lg-a', li);
      gsap.set(li, { y: 28, opacity: 0 }); gsap.set(a, { '--rl': 0 });
      ScrollTrigger.create({ trigger: li, start: 'top 95%', once: true, onEnter: () => {
        gsap.to(a, { '--rl': 1, duration: 1.3, ease: 'expo.inOut' });
        gsap.to(li, { y: 0, opacity: 1, duration: 1.2, ease: 'expo.out', delay: .12 });
        $$('.lg-dc', li).forEach(e => decode(e, .7));
      } });
    });
  }

  /* ---------- per frame, after the composite ---------- */
  const sv = new THREE.Vector2();
  function draw(sy, dt) {
    if (!MET.log) return;
    if (!ready) {
      if (shotI === -3) return;
      try { if (shotI >= 0) shootNext(); else if (MET.log.t - sy < MET.vh * 2.6) shootBegin(); }
      catch (err) { console.error(err); shotI = -3; root.classList.add('lg-nopics'); }
      return;
    }
    const vh = MET.vh, top = MET.log.t - sy, near = top < vh && top + MET.log.h > 0;
    // the log is off screen (a fast fling, or the wheel with the mouse parked): no fade, just gone
    if (!near) { if (PV.a) { PV.a = 0; PV.cur = -1; pcap.style.opacity = '0'; } return; }
    // which entry the cursor (or the keyboard) is on
    let want = -1, kb = false;
    if (near && canHover()) {
      if (!L.ok || L.secT !== MET.log.t) measure();
      if (PV.inDoc) { const x = ptr.cx, y = ptr.cy + sy; for (const r of L.rows) if (x >= r.l && x < r.r && y >= r.t && y < r.b) { want = r.img; break; } }
      if (want < 0 && PV.kbd >= 0 && L.rows[PV.kbd]) { want = L.rows[PV.kbd].img; kb = true; }
    }
    if (want < 0 && PV.a <= 0) return;
    const w = clamp(innerWidth * .27, 300, 460), h = w / 1.5;
    if (want >= 0) {
      let tx, ty;
      if (kb) { const r = L.rows[PV.kbd]; tx = r.r - w / 2 - 48; ty = r.t - sy + (r.b - r.t) / 2; }
      else {
        // beside the cursor, flipping to its left near the right edge
        PV.side += ((innerWidth - ptr.cx < w + 96 ? -1 : 1) - PV.side) * (1 - Math.exp(-dt * 7));
        tx = ptr.cx + PV.side * (w / 2 + 44); ty = ptr.cy;
      }
      ty = clamp(ty, h / 2 + 16, innerHeight - h / 2 - 44);
      if (PV.a < .02) { PV.x = tx; PV.y = ty + 30; PV.vx = PV.vy = 0; }   // appears at the cursor and rises into place
      PV.tx = tx; PV.ty = ty;
      if (want !== PV.cur) {
        if (PV.a > .1 && PV.cur >= 0) { PV.prev = PV.cur; PV.mix = 0; } else { PV.prev = -1; PV.mix = 1; }
        PV.cur = want; pcapT.textContent = CAPS[want] || '';
      }
    }
    // follow, and measure how fast the picture moves
    const k = 1 - Math.exp(-dt * (reduce ? 40 : 8)), ox = PV.x, oy = PV.y;
    PV.x += (PV.tx - PV.x) * k; PV.y += (PV.ty - PV.y) * k;
    if (dt > 0) { const kv = 1 - Math.exp(-dt * 12); PV.vx += ((PV.x - ox) / dt - PV.vx) * kv; PV.vy += ((PV.y - oy) / dt - PV.vy) * kv; }
    PV.mix = Math.min(1, PV.mix + dt / .55);
    const on = want >= 0 ? 1 : 0;
    PV.a += (on - PV.a) * (1 - Math.exp(-dt * (on ? 6 : 9)));
    if (!on && PV.a < .004) { PV.a = 0; PV.cur = -1; pcap.style.opacity = '0'; return; }
    // its caption, under the picture's left edge
    pcap.style.transform = `translate3d(${(PV.x - w / 2).toFixed(1)}px,${(PV.y + h / 2 + 10).toFixed(1)}px,0)`;
    pcap.style.opacity = clamp(PV.a * 1.6 - .55, 0, 1).toFixed(3);
    // the picture
    U.uRes.value.set(canvasEl.clientWidth || innerWidth, canvasEl.clientHeight || innerHeight);
    U.uPos.value.set(PV.x, PV.y); U.uSize.value.set(w, h);
    const bend = reduce ? 0 : 1;
    U.uVel.value.set(clamp(PV.vx / 2400, -1, 1) * bend, clamp(PV.vy / 2400, -1, 1) * bend);
    U.uA.value = PV.a; U.uMix.value = PV.mix * PV.mix * (3 - 2 * PV.mix);
    cellUV(PV.cur, U.uCellA.value); cellUV(PV.prev >= 0 ? PV.prev : PV.cur, U.uCellB.value);
    renderer.setRenderTarget(null); renderer.getSize(sv); renderer.setViewport(0, 0, sv.x, sv.y);
    const ac = renderer.autoClear; renderer.autoClear = false;
    renderer.render(pvScene, pvCam);
    renderer.autoClear = ac;
  }

  const api = {
    init() { choreograph(); },
    draw,
  };
  // test-only hook (window.__TEST.hooks): reshoot a picture with other settings and read the atlas back
  if (TEST.hooks) {
    const cellPNG = (i, all) => {
      const x = all ? 0 : (i % COLS) * CW, y = all ? 0 : Math.floor(i / COLS) * CH, w = all ? AW : CW, h = all ? AH : CH, buf = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(atlas, x, y, w, h, buf);
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), id = g.createImageData(w, h);
      for (let r = 0; r < h; r++) id.data.set(buf.subarray((h - 1 - r) * w * 4, (h - r) * w * 4), r * w * 4);
      g.putImageData(id, 0, 0); return c.toDataURL('image/png');
    };
    window.__blog = {
      PV, L, SPECS, CAPS, U,
      shoot(i, over) { if (!cap) shootBegin(); cap.allocate(CW, CH, 1, true); fakeNow = Math.max(fakeNow, performance.now() + 200); shoot(i, over); restoreWorld(); develop(); return cellPNG(i); },
      cellPNG, atlasPNG: () => cellPNG(0, true),
    };
  }
  return api;
}
