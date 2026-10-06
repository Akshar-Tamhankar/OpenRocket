/* =====================================================================
   Progress cards: small live renders inside the stage cards.
   createCards(ctx) -> { init(), draw(sy, dt) }
   Each card's window shows its stage's object, drawn into the card's box in the
   main canvas after the final composite (like the film strip). Finished stages
   are rendered solid in a small studio; the stage in the shop is part built
   (solid up to its progress, the rest still glowing lines, a hot line at the
   cut); the rest are still drawings on a cyanotype sheet. One small HDR target
   is shared by all cards: render it, resolve it, then tone map it into the
   card's window with a soft glow taken from its mips. Nothing is built at
   startup: see work() below.
   ===================================================================== */
function createCards(ctx) {
  const { renderer, M, C } = ctx;
  const api = { init() {}, draw() {} };
  if (!renderer || !M) return api;
  const canvasEl = renderer.domElement;
  let items = [], rt = null, ready = false;

  /* ---------- light: a dim studio, a warm key box overhead left, a cool strip behind right ---------- */
  function studioEnv() {
    const sc = new THREE.Scene();
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(5, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `varying vec3 vD; void main(){ vec3 d = normalize(vD);
        vec3 c = mix(vec3(.01, .012, .016), vec3(.06, .065, .08), smoothstep(-.4, .9, d.y));
        c += vec3(3.4, 3.1, 2.7) * smoothstep(.8, .9, dot(d, normalize(vec3(-.55, .7, .5))));
        c += vec3(.5, .8, 1.5) * smoothstep(.9, .96, dot(d, normalize(vec3(.8, .1, -.55))));
        c += vec3(1.4, .7, .3) * .25 * smoothstep(.6, 1., -d.y);
        gl_FragColor = vec4(c, 1.); }`,
    })));
    const pm = new THREE.PMREMGenerator(renderer);
    const t = pm.fromScene(sc, .03).texture; pm.dispose();
    return t;
  }
  let env = null;

  /* ---------- line materials: chalk for drawings, hot flame for the part in the shop ---------- */
  const wireMat = new THREE.LineBasicMaterial({ color: new THREE.Color(.78, .85, .95), transparent: true, opacity: .92, depthWrite: false });
  const pathMat = new THREE.LineBasicMaterial({ color: new THREE.Color(.78, .85, .95), transparent: true, opacity: .42, depthWrite: false });
  const glowMat = new THREE.LineBasicMaterial({ color: C.flame.clone().multiplyScalar(2.4), transparent: true, opacity: .95, depthWrite: false });
  const hotMat = new THREE.MeshBasicMaterial({ color: C.flame.clone().multiplyScalar(9) });
  function strip(g) {
    const rm = []; g.traverse(o => { if (o.isLight || (o.isMesh && o.material && o.material.isShaderMaterial)) rm.push(o); });
    rm.forEach(o => o.parent && o.parent.remove(o)); return g;
  }
  // a part as its drawing: creases and outlines only
  function toWire(g, mat, ang = 16) {
    strip(g);
    const ms = [], ls = []; g.traverse(o => { if (o.isMesh) ms.push(o); else if (o.isLineSegments) ls.push(o); });
    for (const m of ms) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, ang), mat);
      l.position.copy(m.position); l.quaternion.copy(m.quaternion); l.scale.copy(m.scale);
      m.parent.add(l); m.parent.remove(m);
    }
    ls.forEach(l => { l.material = mat; });
    return g;
  }

  /* ---------- the objects, in model units, centred near the origin ---------- */
  const rocketOf = (get, lo) => { const g = new THREE.Group(); for (const d of M.PARTDEF) { const b = d.build(get, null, lo); b.g.position.y = d.y; g.add(b.g); } g.position.y = M.STACK_Y; const w = new THREE.Group(); w.add(g); return w; };
  const grainsOf = get => {
    const g = new THREE.Group();
    [[-.82, .62, 1], [0, .74, .92], [.82, .5, 1.08]].forEach(([x, h, s]) => {
      const pr = [[.12, 0], [.36, 0], [.36, h], [.12, h], [.12, 0]].map(p => new THREE.Vector2(p[0], p[1]));
      const m = new THREE.Mesh(new THREE.LatheGeometry(pr, 64), get('grain')); m.position.set(x, -h * s / 2, 0); m.scale.setScalar(s); g.add(m);
    });
    return g;
  };
  const motorOf = (get, ex) => { const b = M.buildMotor(get, null, false); b.subs.forEach(s => s.g.position.addScaledVector(s.dir, s.dist * ex)); b.g.position.y = -.72; const w = new THREE.Group(); w.add(b.g); return w; };
  const standOf = () => { const s = strip(M.stand.clone(true)); s.position.set(-.1 * K, 0, 0); s.rotation.set(0, 0, 0); const w = new THREE.Group(); w.add(s); w.scale.setScalar(1 / K); s.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); } }); return w; };
  const bayOf = get => { const b = M.buildAvbay(get, null, false); b.subs[0].g.position.y += .5; b.g.position.y = -.3; const w = new THREE.Group(); w.add(b.g); return w; };
  const chuteSolid = () => { const c = strip(M.chute.clone(true)); c.visible = true; c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.traverse(o => { if (o.material) o.material = o.material.clone(); }); const w = new THREE.Group(); c.scale.setScalar(1 / (K * 1.6)); c.position.y = 1; w.add(c); return w; };
  // the main chute as a drawing: gore seams, vent, band and skirt, the shroud lines to the confluence and the riser
  function chuteLines(mat) {
    const prof = t => { const a = t * 1.32; return [Math.sin(a) * 1.15 + .001, Math.cos(a) * .75]; };
    const at = (t, th) => { const [r, y] = prof(t); return [Math.sin(th) * r, y, Math.cos(th) * r]; };
    const P = [], push = (a, b) => P.push(a[0], a[1], a[2], b[0], b[1], b[2]), GO = 12, TAU = Math.PI * 2;
    for (let i = 0; i < GO; i++) { const th = i / GO * TAU; for (let j = 0; j < 14; j++) push(at(.08 + .92 * j / 14, th), at(.08 + .92 * (j + 1) / 14, th)); }
    for (const t of [.08, .52, 1]) for (let i = 0; i < 64; i++) push(at(t, i / 64 * TAU), at(t, (i + 1) / 64 * TAU));
    for (let i = 0; i < GO; i++) push(at(1, i / GO * TAU), [0, -2.2, 0]);
    push([0, -2.2, 0], [0, -2.95, 0]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const l = new THREE.LineSegments(geo, mat); l.position.y = 1;
    const w = new THREE.Group(); w.add(l); return w;
  }
  // stage by stage: the rocket, the grains, the motor, the stand, the avionics sled, the chute, the whole rocket on its climb
  // tilt: roll of the part on screen. spin: 'own' turns it on its own axis, 'turn' on a turntable. el: camera elevation.
  const DEFS = [
    { solid: g => rocketOf(g, false), wire: m => toWire(rocketOf(scratch, false), m), tilt: -1.2, spin: 'own', el: .16, zoom: 1.12 },
    { solid: g => grainsOf(g), wire: m => toWire(grainsOf(scratch), m, 30), tilt: 0, lean: .3, spin: 'turn', el: .34, zoom: 1.05 },
    { solid: g => motorOf(g, .5), wire: m => toWire(motorOf(scratch, .5), m), tilt: -1.36, spin: 'own', el: .18, zoom: 1.08 },
    { solid: () => standOf(), wire: m => toWire(standOf(), m), tilt: 0, spin: 'turn', el: .36, zoom: 1.04 },
    { solid: g => bayOf(g), wire: m => toWire(bayOf(scratch), m), tilt: -Math.PI / 2, spin: 'own', el: .18, zoom: 1.08 },
    { solid: () => chuteSolid(), wire: m => chuteLines(m), tilt: Math.PI / 2, spin: 'own', el: .2, zoom: 1.08 },
    { solid: g => rocketOf(g, false), wire: m => toWire(rocketOf(scratch, false), m), tilt: -.98, spin: 'own', el: .14, zoom: 1.04, path: true },
  ];
  let scratch = null;

  // dashes along the climb: vertical off the pad, pitching over into the rocket's line
  function flightPath(tilt, half) {
    const dir = new THREE.Vector2(-Math.sin(tilt), Math.cos(tilt)), tail = dir.clone().multiplyScalar(-half);
    const P0 = tail.clone().add(new THREE.Vector2(-1.1, -3.6)), P1 = tail.clone().addScaledVector(dir, -1.7), P = [];
    const at = t => new THREE.Vector2().addScaledVector(P0, (1 - t) * (1 - t)).addScaledVector(P1, 2 * (1 - t) * t).addScaledVector(tail, t * t);
    const N = 46; for (let i = 0; i < N; i += 2) { const a = at(i / N), b = at((i + 1.1) / N); P.push(a.x, a.y, 0, b.x, b.y, 0); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const l = new THREE.LineSegments(geo, pathMat); l.position.z = -.4;
    return l;
  }

  function makeItem(def, st, view, i) {
    const sc = new THREE.Scene(), outer = new THREE.Group(), spin = new THREE.Group();
    outer.rotation.z = def.tilt; if (def.lean) outer.rotation.x = def.lean;
    outer.add(spin); sc.add(outer);
    const kind = st.s === 'done' ? 0 : st.s === 'active' ? 1 : 2;
    let clip = null;
    if (kind === 2) spin.add(def.wire(wireMat));
    else {
      sc.environment = env; sc.environmentIntensity = .85;
      const key = new THREE.DirectionalLight(0xfff0dc, kind === 1 ? 1.6 : 2.4); key.position.set(-3, 4, 5);
      const rim = new THREE.DirectionalLight(0x9cc8ff, 2.2); rim.position.set(4, 1.5, -3);
      sc.add(key, rim);
      if (kind === 1) { const warm = new THREE.DirectionalLight(0xff9a50, 1.4); warm.position.set(0, -3, 2.5); sc.add(warm); }
      if (kind === 0) spin.add(def.solid(mats.get));
      else {
        // part built: solid up to the stage's progress along its axis, the rest still glowing lines
        const ms = M.matSet(false), solid = def.solid(ms.get), bb = new THREE.Box3().setFromObject(solid);
        const yc = lerp(bb.min.y, bb.max.y, clamp(st.f ?? .5, 0, 1));
        clip = { local: new THREE.Plane(new THREE.Vector3(0, -1, 0), yc), plane: new THREE.Plane() };
        ms.all.forEach(m => { m.clippingPlanes = [clip.plane]; m.clipShadows = false; });
        const r = Math.max(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z) * 1.1;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * .045, 8, 72), hotMat); ring.rotation.x = Math.PI / 2; ring.position.y = yc;
        spin.add(solid, def.wire(glowMat), ring);
        clip.ring = ring;
      }
    }
    // the space the part sweeps through as it turns, for framing
    const box = new THREE.Box3(), tmp = new THREE.Box3();
    for (let k = 0; k < 12; k++) { spin.rotation.y = k / 12 * Math.PI * 2; outer.updateMatrixWorld(true); box.union(tmp.setFromObject(spin)); }
    spin.rotation.y = 0;
    if (def.path) {
      const half = (box.max.y - box.min.y) * .5 / Math.max(.3, Math.cos(def.tilt)) * .96;
      const p = flightPath(def.tilt, Math.min(half, 2.6)); sc.add(p);
      p.updateMatrixWorld(true); tmp.setFromObject(p); tmp.min.x = lerp(tmp.min.x, tmp.max.x, .55); box.union(tmp);
    }
    const cam = new THREE.PerspectiveCamera(24, 2, .05, 100);
    return { sc, outer, spin, cam, box, kind, clip, view, el: def.el, zoom: def.zoom || 1, speed: def.spin === 'turn' ? .22 : kind === 1 ? .5 : .3, ang: i * 1.3, a: 0, aspect: 0, f: st.f };
  }
  // frame the swept box: exact for its corners at this aspect, a little tighter by the card's zoom
  const fv = new THREE.Vector3(), fc = new THREE.Vector3(), fd = new THREE.Vector3(), fx = new THREE.Vector3(1, 0, 0), fy = new THREE.Vector3();
  function fit(it, aspect) {
    const { cam, box } = it; cam.aspect = aspect;
    box.getCenter(fc);
    fd.set(0, Math.sin(it.el), Math.cos(it.el)); fy.set(0, Math.cos(it.el), -Math.sin(it.el));
    const tV = Math.tan(cam.fov * Math.PI / 360) * it.zoom, tH = tV * aspect;
    let d = 0;
    for (let i = 0; i < 8; i++) {
      fv.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(fc);
      const z = fv.dot(fd); d = Math.max(d, z + Math.abs(fv.dot(fx)) / tH, z + Math.abs(fv.dot(fy)) / tV);
    }
    d *= 1.04;
    cam.position.copy(fc).addScaledVector(fd, d); cam.lookAt(fc);
    cam.near = Math.max(.02, d * .2); cam.far = d * 3; cam.updateProjectionMatrix();
    it.aspect = aspect;
  }

  /* ---------- the card window: glass and grid, then the render, tone mapped like the scene ---------- */
  const fsGeo = new THREE.BufferGeometry();
  fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const U = { tMini: { value: null }, uPx: { value: new THREE.Vector2(1, 1) }, uDpr: { value: 1 }, uKind: { value: 0 }, uFade: { value: 0 }, uExp: { value: 1 }, uGlow: { value: 0 }, uTime: { value: 0 } };
  const blitMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `uniform sampler2D tMini; uniform vec2 uPx; uniform float uDpr; uniform float uKind; uniform float uFade; uniform float uExp; uniform float uGlow; uniform float uTime; varying vec2 vUv;
      const mat3 S2R = mat3(vec3(.6274, .0691, .0164), vec3(.3293, .9195, .0880), vec3(.0433, .0113, .8956));
      const mat3 R2S = mat3(vec3(1.6605, -.1246, -.0182), vec3(-.5876, 1.1329, -.1006), vec3(-.0728, -.0083, 1.1187));
      vec3 agxC(vec3 x){ vec3 x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + .4298 * x2 + .1191 * x - .00232; }
      vec3 agx(vec3 c){
        const mat3 IN = mat3(vec3(.856627153315983, .137318972929847, .11189821299995), vec3(.0951212405381588, .761241990602591, .0767994186031903), vec3(.0482516061458583, .101439036467562, .811302368396859));
        const mat3 OUT = mat3(vec3(1.1271005818144368, -.1413297634984383, -.14132976349843826), vec3(-.11060664309660323, 1.157823702216272, -.11060664309660294), vec3(-.016493938717834573, -.016493938717834257, 1.2519364065950405));
        c = IN * (S2R * c); c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.49999, 0., 1.);
        c = OUT * agxC(c); c = pow(max(vec3(0.), c), vec3(2.2)); return clamp(R2S * c, 0., 1.); }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
      float grid(vec2 p, float s){ vec2 g = abs(fract(p / s + .5) - .5) * s; return 1. - smoothstep(.0, uDpr * 1.1, min(g.x, g.y)); }
      void main(){
        vec2 uv = vUv, p = uv * uPx - vec2(.5);
        float mn = grid(p, 12. * uDpr), mj = grid(p, 60. * uDpr);
        float vig = smoothstep(1.3, .15, length((uv - .5) * vec2(1.1, 1.7)));
        vec3 bg;
        if (uKind > 1.5) {
          // a drawing: cyanotype sheet with its grid
          bg = mix(vec3(.028, .055, .1), vec3(.07, .14, .24), vig) + vec3(.6, .74, .92) * (mn * .055 + mj * .1);
        } else if (uKind > .5) {
          // in the shop: dark bench, warm light from below
          bg = mix(vec3(.016, .018, .024), vec3(.05, .048, .05), vig) + vec3(1., .5, .18) * .2 * smoothstep(.8, 0., length((uv - vec2(.5, -.08)) * vec2(.8, 1.9)));
          bg += vec3(.6, .7, .85) * mn * .028;
        } else {
          // a render: dark studio sweep
          bg = mix(vec3(.014, .016, .022), vec3(.08, .085, .1), vig * smoothstep(-.3, 1., uv.y)) + vec3(.6, .7, .85) * mn * .022;
        }
        vec4 o = texture2D(tMini, uv);
        vec3 c = o.rgb / max(o.a, 1e-4);
        vec3 obj = toSRGB(agx(c * uExp));
        vec3 halo = textureLod(tMini, uv, 1.5).rgb * .35 + textureLod(tMini, uv, 2.5).rgb * .4 + textureLod(tMini, uv, 3.5).rgb * .45;
        vec3 hs = toSRGB(agx(halo * uExp)) * uGlow;
        vec3 col = mix(bg, obj, clamp(o.a, 0., 1.));
        col = 1. - (1. - col) * (1. - hs);
        gl_FragColor = vec4(col, max(.9, o.a) * uFade);
      }`,
  });
  const blit = new THREE.Mesh(fsGeo, blitMat); blit.frustumCulled = false;
  const bScene = new THREE.Scene(); bScene.add(blit);
  const bCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const makeRT = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  let mats = null;

  // Nothing is built at startup or in the background. The studio, the materials and the seven card scenes
  // are made only once the section is about two screens away, one small job per frame. Shaders compile
  // off the main thread where the browser can (compileAsync), and a card is drawn only once its scene is
  // ready, so a slow compile never stalls the page: until then its window shows the card's own glass.
  let views = [], jobs = null, broken = false, pending = 0;
  const cam0 = new THREE.PerspectiveCamera(24, 2, .05, 100); cam0.position.set(0, 0, 8);
  // compile against a bound target: cards render into a linear HDR target, and a compile against the canvas
  // (sRGB output) would leave every program to be built again, on the main thread, at the card's first draw
  let rt0 = null;
  const par = !!renderer.compileAsync && renderer.extensions.has('KHR_parallel_shader_compile');
  function compileFor(sc, cam, toTarget, then) {
    if (toTarget) { rt0 = rt0 || new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }); renderer.setRenderTarget(rt0); }
    try {
      if (par) { pending = 1; renderer.compileAsync(sc, cam).then(then, then); }
      else { renderer.compile(sc, cam); then(); }
    } finally { renderer.setRenderTarget(null); }
  }
  function makeJobs() {
    const J = [() => { env = studioEnv(); }, () => { mats = M.matSet(false); scratch = M.matSet(false).get; },
      () => compileFor(bScene, bCam, false, () => { pending = 0; })];
    STAGES.forEach((st, i) => {
      if (!views[i] || !DEFS[i]) return;
      let it = null;
      J.push(() => { it = makeItem(DEFS[i], st, views[i], i); });
      J.push(() => {
        if (!it) return;
        renderer.localClippingEnabled = !!it.clip;
        try { compileFor(it.sc, cam0, true, () => { pending = 0; items.push(it); }); }
        finally { renderer.localClippingEnabled = false; }
      });
    });
    return J;
  }
  function work(n) {
    if (!jobs) jobs = makeJobs();
    try { while (n-- > 0 && jobs.length && !pending) jobs.shift()(); }
    catch (err) { console.error(err); broken = true; }
    if (!jobs.length && !pending) ready = true;
  }
  api.init = () => { views = $$('#track .stage .view'); };

  const nil = { right: 0, left: 0, top: 0, bottom: 0, width: 0, height: 0 };
  api.draw = (sy, dt) => {
    if (broken || !MET.pro || !views.length) return;
    const P = MET.pro, top = P.t - sy;
    // build only near the section: one job a frame on the way in, a few once the cards are on screen
    if (!ready && top < MET.vh * 2.2 && top + P.h > -MET.vh) work(top < MET.vh ? 4 : 1);
    if (!items.length) return;
    if (top > MET.vh * 1.02 || top + P.h < 0) return;
    const cw = canvasEl.clientWidth || innerWidth, ch = canvasEl.clientHeight || innerHeight;
    const pr = renderer.getPixelRatio(), kx = canvasEl.width / cw, ky = canvasEl.height / ch;
    const step = state.paused ? 0 : dt;
    U.uTime.value += step;
    let drew = false;
    const ac = renderer.autoClear;
    for (const it of items) {
      const r = it.view.isConnected ? it.view.getBoundingClientRect() : nil;
      if (r.width < 8 || r.height < 8 || r.right <= 0 || r.left >= cw || r.bottom <= 0 || r.top >= ch) continue;
      const w = Math.round(r.width * kx), h = Math.round(r.height * ky);
      if (!rt || rt.width !== w || rt.height !== h) { if (rt) rt.dispose(); rt = makeRT(w, h); }
      if (Math.abs(it.aspect - w / h) > 1e-3) fit(it, w / h);
      // a card's window develops in once its scene is ready (its shaders were compiled ahead, so the first frame is quick)
      it.a = reduce ? 1 : Math.min(1, it.a + Math.min(.05, Math.max(dt, .016)) * 2.4);
      if (!reduce) it.ang += step * it.speed;
      it.spin.rotation.y = it.ang;
      if (it.clip) {
        it.spin.updateMatrixWorld(true);
        it.clip.plane.copy(it.clip.local).applyMatrix4(it.spin.matrixWorld);
        it.clip.ring.material.color.copy(C.flame).multiplyScalar(7 + 2.5 * Math.sin(U.uTime.value * 3.1));
      }
      // render the part
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = true;
      renderer.localClippingEnabled = !!it.clip;
      renderer.render(it.sc, it.cam);
      renderer.localClippingEnabled = false;
      // then the window, into the card's box on the canvas
      renderer.setRenderTarget(null);
      const x = r.left * kx / pr, y = (ch - r.bottom) * ky / pr, ww = w / pr, hh = h / pr;
      renderer.setViewport(x, y, ww, hh); renderer.setScissor(x, y, ww, hh); renderer.setScissorTest(true);
      U.tMini.value = rt.texture; U.uPx.value.set(w, h); U.uDpr.value = kx; U.uKind.value = it.kind;
      U.uFade.value = it.a; U.uGlow.value = it.kind === 1 ? 1 : .18; U.uExp.value = it.kind === 2 ? 1.15 : 1;
      renderer.autoClear = false;
      renderer.render(bScene, bCam);
      drew = true;
    }
    renderer.autoClear = ac;
    if (drew) {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, canvasEl.width / pr, canvasEl.height / pr);
      renderer.setClearColor(0x000000, 1);
    }
  };
  if (TEST.hooks) window.__cards = { get items() { return items; }, fit };
  return api;
}
