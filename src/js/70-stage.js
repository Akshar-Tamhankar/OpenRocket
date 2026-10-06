/* =====================================================================
   Stage: one location, one camera. Scroll picks the shot and the clock.
   ===================================================================== */
const canvas = $('#gl');
const lowTier = !!TEST.lowTier || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }); } catch (err) { renderer = null; }
if (!renderer || !renderer.capabilities.isWebGL2) { html.classList.add('no-gl'); renderer = null; }
else html.classList.add('gl');
const STAGE = { frame: null, measure: null, intro: { fade: 0, light: 0, push: 1 }, ready: false };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

async function buildStage(progress) {
  const C = {};
  for (const n of ['chalk', 'flame', 'ember', 'haze']) C[n] = new THREE.Color(cssVar('--' + n));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 1);
  const Q = { low: lowTier };
  const MAXDPR = lowTier ? 1 : 1.5;
  let dpr = TEST.fixedDpr ? 1 : Math.min(devicePixelRatio || 1, MAXDPR);
  const post = createPost(renderer, Q);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, .05, 12000);
  const world = createWorld(renderer, scene, Q);
  progress('sky', .25); await nextFrame();
  const M = buildModel({ C, lowTier });
  progress('model', .5); await nextFrame();
  scene.add(M.rocket, M.pad, M.work, M.stand, M.chute);

  /* ---------- site layout (meters). East is -z, the pad is the origin. ---------- */
  const STAND_POS = new THREE.Vector3(-3.6, .047, -2.4);
  M.work.position.set(1.75, 0, 1.85); M.work.rotation.y = -.75; M.work.updateMatrixWorld(true);
  M.work.aim(new THREE.Vector3(0, 1.15, 0));
  M.stand.position.copy(STAND_POS); M.stand.rotation.y = .45;
  const WIND = new THREE.Vector3(-1.05, 0, -.3);
  const smoke = createSmoke(lowTier ? 360 : 720, world.skyTex); scene.add(smoke.mesh);
  const strip = createFilmStrip(renderer, post, C);
  // modules with their own owners: atmosphere fx, blueprint sheet, rocket HUD, build log previews
  const fx = createFX({ renderer, scene, camera, world, M, post, smoke, Q, C, STAND_POS, WIND });
  const bp = createBlueprint({ renderer, scene, camera, world, M, post, Q, C });
  const hud = createHUD({ renderer, scene, camera, world, M, Q, C });
  const blog = createBlog({ renderer, scene, camera, world, M, post, smoke, Q, C, STAND_POS, WIND });
  const cards = createCards({ renderer, scene, camera, world, M, post, Q, C });

  /* ---------- shots: camera, lens, focus, framing anchor, and the scene state ---------- */
  // an: where the target sits on screen (NDC, desktop). man: same on phones. ap: aperture (0 = everything sharp).
  const D = { cx: 0, cy: 1, cz: 5, tx: 0, ty: 1, tz: 0, mm: 35, ap: 0, ax: 0, ay: 0, tod: .04, ex: 0, lift: 0, scan: 0, f0: 0, f1: 0, f2: 0, f3: 0, f4: 0,
    work: 1, fire: 0, call: 0, roll: 0, drift: 1, ghost: 0 };
  const S = {};
  const shot = (o) => ({ ...D, ...o });
  shotsA(S, shot, D);
  shotsData(S, shot, D, STAND_POS);
  shotsB(S, shot, D, STAND_POS);
  const partPose = i => shot({ ...S.vehEx, ...S.PT[i], tx: 0, tz: 0, call: 0, ['f' + i]: 1, max: 0, tod: .08 + i * .006 });
  const pose = n => { const p = S[n]; if (!isNarrow()) return p; return { ...p, ax: p.max ?? 0, ay: p.may ?? .3 }; };

  let KEYS = [[0, 'hero']], FLIGHT0 = 1e9, FLIGHT1 = 1e9 + 1;
  STAGE.measure = () => {
    const vh = MET.vh, V = MET.veh, Dt = MET.dat, Pg = MET.pro, Lg = MET.log, Cr = MET.crew, L = MET.lau;
    KEYS = [[0, 'hero'], [vh * .6, 'heroB'], [V.t, 'vehIn'], [V.t + V.len * .14, 'vehIn'], [V.t + V.len * .26, 'vehEx'], [V.t + V.len * .32, 'vehEx']];
    for (let i = 0; i < 5; i++) { const s0 = V.t + V.len * (.36 + i * .12); S['p' + i] = partPose(i); KEYS.push([s0 + V.len * .03, 'p' + i], [s0 + V.len * .1, 'p' + i]); }
    KEYS.push([Dt.t - vh * .15, 'stand'], [Dt.t + Math.max(vh * .4, Dt.len), 'standB'],
      [Pg.t, 'site'], [Pg.t + Pg.len, 'siteB'], [Lg.t - vh * .15, 'walk'], [Lg.t + Lg.h - vh * .5, 'walkB'], [Cr.t - vh * .05, 'crew'], [Cr.t + Cr.h - vh * .6, 'crewB'], [L.t, 'padIn'], [L.t + vh * .92, 'pad']);
    for (let i = 1; i < KEYS.length; i++) KEYS[i][0] = Math.max(KEYS[i][0], KEYS[i - 1][0] + 1);
    FLIGHT0 = L.t + vh; FLIGHT1 = L.t + L.len;
  };
  const ease = t => reduce ? (t < .5 ? 0 : 1) : t * t * (3 - 2 * t);
  const flightPose = (base, sy) => flightCam(base, FL, sy);
  function sample(sy) {
    if (sy >= FLIGHT0) return flightPose(pose('pad'), sy);
    if (sy <= KEYS[0][0]) return { ...pose(KEYS[0][1]) };
    for (let i = 0; i < KEYS.length - 1; i++) {
      const [a, na] = KEYS[i], [b, nb] = KEYS[i + 1];
      if (sy <= b) {
        const t = clamp((sy - a) / (b - a), 0, 1), A = pose(na), B = pose(nb), o = {};
        for (const k in D) o[k] = A[k] + (B[k] - A[k]) * (k === 'scan' ? t : ease(t));
        o.beam = na === 'heroB' && nb === 'vehIn' && t > .005 && t < .995 ? 1 : 0;
        return o;
      }
    }
    return { ...pose(KEYS[KEYS.length - 1][1]) };
  }

  /* ---------- overlays: the drawing's balloons on leaders, its center line and the length dimension ---------- */
  // Balloons stack in a column left of the rocket (clear of the copy), each leader ends in a ringed dot on the part's axis.
  // The column is kept between the nav and the foot of the frame (and above the parts list where they would meet).
  const coEls = $$('.co'), coWrap = $('#callouts'), dims = $('#dims'), tbBox = $('#vTb');
  const coAnchors = [M.pNose.anchors.a, M.pPay.anchors.a, M.pAv.anchors.a, M.pBoost.anchors.a, M.pMotor.anchors.a];
  const v3 = new THREE.Vector3(), v3w = new THREE.Vector3(), camRight = new THREE.Vector3();
  const toScreen = o => { (o.isVector3 ? v3.copy(o) : o.getWorldPosition(v3)).project(camera); return [(v3.x * .5 + .5) * innerWidth, (-v3.y * .5 + .5) * innerHeight, v3.z]; };
  const dEl = { a: $('#dExtA'), b: $('#dExtB'), l: $('#dLine'), aa: $('#dArrA'), ab: $('#dArrB'), t: $('#dText') };
  const setL = (el, x1, y1, x2, y2) => { el.setAttribute('x1', x1.toFixed(1)); el.setAttribute('y1', y1.toFixed(1)); el.setAttribute('x2', x2.toFixed(1)); el.setAttribute('y2', y2.toFixed(1)); };
  const tipA = M.pNose.anchors.tip;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const coSvg = document.createElementNS(SVGNS, 'svg'); coSvg.setAttribute('class', 'co-lines'); coWrap.prepend(coSvg);
  const svgEl = (tag, cls) => { const e = document.createElementNS(SVGNS, tag); e.setAttribute('class', cls); coSvg.appendChild(e); return e; };
  const cAxis = svgEl('line', 'axis'), coLd = coEls.map(() => svgEl('path', 'ld')), coRing = coEls.map(() => svgEl('circle', 'ring')), coPt = coEls.map(() => svgEl('circle', 'pt'));
  coPt.forEach(p => p.setAttribute('r', '3')); coRing.forEach(p => p.setAttribute('r', '7'));
  const RK = .21 * K;                                   // airframe radius in meters
  function overlays(c) {
    let vis = clamp(c.call * 2.2 - 1.2, 0, 1);
    // balloons and dimensions wait until the drawing's leading edge has crossed the rocket
    if (vis > .001 && c.scan < .999) { const rx = toScreen(v3w.set(0, .8, 0))[0] / innerWidth; vis *= sstep(rx - .02, rx + .12, c.scan); }
    coWrap.style.opacity = vis.toFixed(3); dims.style.opacity = (vis * clamp(1 - c.ex * 1.6, 0, 1)).toFixed(3);
    if (vis <= .001) return;
    const mob = isNarrow();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    // anchors on the rocket axis at each part's station
    const it = coAnchors.map((a, i) => {
      const wy = a.getWorldPosition(v3w).y;
      const [x, y] = toScreen(v3w.set(0, wy, 0)), [xr] = toScreen(v3w.addScaledVector(camRight, RK * 1.2));
      return { i, x, y, r: Math.abs(xr - x) };
    });
    const col = Math.max(...it.map(o => o.x + o.r)) + (mob ? 26 : 56);
    const gap = mob ? 34 : 40, srt = [...it].sort((a, b) => a.y - b.y), n = srt.length;
    let top = mob ? 92 : 104, bot = innerHeight - (mob ? 48 : 40);
    if (tbBox && +tbBox.style.opacity > .05) { const br = tbBox.getBoundingClientRect(); if (br.width && col + 190 > br.left) bot = Math.min(bot, br.top - 26); }
    srt.forEach((o, k) => { o.ly = Math.max(o.y, k ? srt[k - 1].ly + gap : top); });
    for (let k = n - 1; k >= 0; k--) srt[k].ly = Math.min(srt[k].ly, bot - (n - 1 - k) * gap);
    it.forEach(o => {
      coEls[o.i].style.transform = `translate(${col.toFixed(1)}px,${o.ly.toFixed(1)}px) translate(0,-50%)`;
      const kx = col - (mob ? 12 : 20);
      coLd[o.i].setAttribute('d', `M${(col - 2).toFixed(1)},${o.ly.toFixed(1)} H${kx.toFixed(1)} L${(o.x + 7).toFixed(1)},${o.y.toFixed(1)}`);
      coPt[o.i].setAttribute('cx', o.x.toFixed(1)); coPt[o.i].setAttribute('cy', o.y.toFixed(1));
      coRing[o.i].setAttribute('cx', o.x.toFixed(1)); coRing[o.i].setAttribute('cy', o.y.toFixed(1));
    });
    // center line through the whole stack, a little past both ends
    const tipY = tipA.getWorldPosition(v3w).y, tailY = M.pMotor.tail.getWorldPosition(v3w).y;
    const [ux, uy] = toScreen(v3w.set(0, tipY + .07, 0)), [lx, ly] = toScreen(v3w.set(0, tailY - .07, 0));
    setL(cAxis, ux, uy, lx, ly);
    // overall length, dimensioned on the left (the balloons hold the right)
    if (c.ex < .62) {
      const [ax, ay] = toScreen(v3w.set(0, tipY, 0)), [bx, by] = toScreen(v3w.set(0, tailY, 0));
      const rr = Math.max(...it.map(o => o.r)), xx = Math.min(ax, bx) - rr - (mob ? 34 : 64), m = (ay + by) / 2;
      setL(dEl.a, ax - 12, ay, xx - 8, ay); setL(dEl.b, bx - rr - 6, by, xx - 8, by); setL(dEl.l, xx, ay + 1, xx, by - 1);
      dEl.aa.setAttribute('d', `M${xx.toFixed(1)},${ay.toFixed(1)} l-3.5,11 h7 z`); dEl.ab.setAttribute('d', `M${xx.toFixed(1)},${by.toFixed(1)} l-3.5,-11 h7 z`);
      dEl.t.setAttribute('x', (xx - 26).toFixed(1)); dEl.t.setAttribute('y', m.toFixed(1));
      dEl.t.setAttribute('transform', `rotate(-90 ${(xx - 26).toFixed(1)} ${m.toFixed(1)})`); dEl.t.textContent = '1,560 mm';
    }
  }

  /* ---------- the frame ---------- */
  const cur = { ...pose('hero') };
  let last = null, time = 0, frames = 0, ftAcc = 0, fireAfter = 0, wasPlaying = false;
  const tgt = new THREE.Vector3(), camP = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), nz = new THREE.Vector3(), ndir = new THREE.Vector3();
  const qTmp = new THREE.Quaternion();
  function resize() { camera.aspect = innerWidth / innerHeight; post.allocate(innerWidth, innerHeight, dpr); }
  addEventListener('resize', resize); resize();
  const nozzleOff = .095 * K;   // nozzle exit above the root before liftoff
  const flightPath = (t, out) => out.set(0, SIM.at(t).h + nozzleOff + .02, 0);
  // the tracking box: the broadcast's lock on the rocket, so it is never lost when a lens is wide
  const fBox = $('#fBox'), fBoxT = $('#fBoxT'), bxA = new THREE.Vector3();
  let fBoxO = -1, fBoxS = '';
  function flBox(F) {
    let o = 0, x = 0, y = 0, w = 0, h = 0;
    if (F.inFlight && STAGE.flCam && STAGE.flCam !== 'pad' && fBox) {
      const r = M.rocket.position, [xa, ya, za] = toScreen(bxA.set(r.x, r.y + 1.62, r.z)), [xb, yb] = toScreen(bxA.set(r.x, r.y - .05, r.z));
      x = (xa + xb) / 2; y = (ya + yb) / 2; h = Math.max(22, Math.abs(yb - ya) + 14); w = Math.max(22, h * .62);
      o = za < 1 ? (1 - sstep(70, 120, h)) * clamp(+fh.el.style.opacity || 0, 0, 1) : 0;
    }
    if (Math.abs(o - fBoxO) > .004 || o > .004) {
      fBoxO = o; fBox.style.opacity = o.toFixed(3);
      if (o > .004) { fBox.style.transform = `translate(${(x - w / 2).toFixed(1)}px,${(y - h / 2).toFixed(1)}px)`; fBox.style.width = w.toFixed(1) + 'px'; fBox.style.height = h.toFixed(1) + 'px';
        const s = Math.round(F.flight.h) + ' m'; if (s !== fBoxS) { fBoxS = s; fBoxT.textContent = s; } }
    }
  }

  STAGE.frame = (now, sy) => {
    if (last === null) last = now;
    const rdt = clamp((now - last) / 1000, 0, .05); last = now;
    const dt = state.paused ? 0 : rdt; time += dt;
    const tgtPose = sample(sy);
    const k = (reduce || TEST.noDamp) ? 1 : 1 - Math.exp(-rdt * 5.5);
    for (const p in D) { cur[p] += (tgtPose[p] - cur[p]) * (p === 'tod' ? Math.min(1, k * 1.4) : k); if (!Number.isFinite(cur[p])) cur[p] = tgtPose[p]; }
    const c = cur, I = STAGE.intro, mob = isNarrow();
    const inFlight = sy >= FLIGHT0;

    // clock
    world.setTime(clamp(c.tod, 0, 1), now);
    const W = world.state;

    // rocket: explode, focus, drawing view
    const s = M.stack;
    s.position.y = .3 + c.lift;
    M.stack.updateMatrixWorld(true);
    M.parts.forEach((p, i) => {
      const f = c['f' + i];
      p.g.position.copy(p.base).addScaledVector(p.dir, p.dist * c.ex);
      if (i === 0) p.g.position.y += (FL.sep || 0) * (inFlight ? 1.4 : 0);
      if (f > .001 && !reduce) p.spin += dt * .32 * f;
      else { const snap = Math.round(p.spin / (Math.PI * 2)) * Math.PI * 2; p.spin += (snap - p.spin) * (1 - Math.exp(-rdt * 3)); }
      p.g.rotation.y = p.spin;
      p.subs.forEach(sb => sb.g.position.copy(sb.base).addScaledVector(sb.dir, sb.dist * f));
      p.ms.keep.value = f;
    });
    M.SCAN.uScan.value = c.scan; M.SCAN.uGhost.value = c.ghost; M.SCAN.uRes.value.set(post.w, post.h);
    M.tag.visible = !inFlight || FL.ts < -.6; M.tagU.uTime.value = time;

    // flight: pose, flame and the recovery train all follow the flight clock (flightAt, flightTrain)
    const fs = inFlight ? FL : { h: 0, F: 0, ts: -9, tip: 0, chute: 0, sep: 0, ign: 0, dx: 0, dz: 0 };
    const TR = inFlight ? flightTrain(fs) : null;
    // the flight cameras cut: on a change of camera the shot jumps instead of easing through the world
    if (inFlight && tgtPose.cam && STAGE.flCam && tgtPose.cam !== STAGE.flCam) for (const p in D) cur[p] = tgtPose[p];
    STAGE.flCam = inFlight ? tgtPose.cam : null;
    if (inFlight) flLens(c.mm);                                   // the live lens on the HUD's camera bug
    if (sy > FLIGHT0 - MET.vh * .25) M.tag.visible = false;       // pulled while the title flies through
    // tip about the middle of the airframe, so the rocket keeps its place on screen
    const th = TR ? TR.th : 0;
    M.tilt.rotation.z = th;
    M.rocket.position.set(fs.dx + Math.sin(th) * TRAIN.cg, fs.h + (1 - Math.cos(th)) * TRAIN.cg, fs.dz);
    const flick = reduce ? 1 : 1 + Math.sin(time * 53) * .05 + Math.sin(time * 31) * .04;
    // the igniter sputters at the nozzle for half a second, then the motor comes up with its thrust
    const ig = fs.ign * (.15 + .07 * Math.sin(time * 41) + .05 * Math.sin(time * 97 + 1)) * (1 - sstep(-.04, .05, fs.ts));
    const amt = Math.max(ig, fs.F > 0 ? clamp(.45 + fs.F / 110, 0, 1.3) * sstep(0, 8, fs.F) : 0);
    M.outerMat.uniforms.uAmt.value = M.innerMat.uniforms.uAmt.value = amt;
    M.outerMat.uniforms.uTime.value = M.innerMat.uniforms.uTime.value = time;
    M.flame.visible = amt > .01; M.flame.scale.set(.9 + .25 * amt, flick * (.35 + .7 * amt), .9 + .25 * amt);
    M.tailLight.intensity = amt * SMOKE_TUNE.tailLight * flick;
    // recovery: the nose leaves on its cord, the main streams out of the payload tube and opens above the airframe
    const te = TR ? TR.te : -1;
    M.pNose.g.rotation.z = 0;
    M.chute.visible = te > 0 && TR.ext > .002;
    if (!M.cord) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 12), 3));
      M.cord = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x3a3029 })); M.cord.frustumCulled = false; M.cord.visible = false; scene.add(M.cord);
    }
    M.cord.visible = te > 0;
    if (te > 0) {
      const V = M.cordV || (M.cordV = [0, 1, 2, 3].map(() => new THREE.Vector3())), [mouth, conf, hang, nb] = V;
      M.rocket.updateMatrixWorld(true);
      M.pPay.g.localToWorld(mouth.set(0, 1, 0));                                   // mouth of the payload tube
      conf.copy(mouth); conf.y += TRAIN.cord * TR.ext;                               // end of the shock cord
      if (M.chute.visible) {
        M.chute.scale.set(TR.sx, TR.sy, TR.sx);
        M.chute.position.set(conf.x, conf.y + TRAIN.lines * TR.sy, conf.z);
        M.chute.rotation.z = Math.sin(time * .8) * .05 * TR.open; M.chute.rotation.x = Math.sin(time * .6 + 1) * .04 * TR.open;
      }
      // the nose: thrown up the axis by the charge, then it falls back to hang tip down on its leash under the main
      const pn = M.pNose, f = sstep(0, 1, TR.flip);
      hang.set(conf.x + .16, conf.y - .34, conf.z + .05); M.stack.worldToLocal(hang);
      pn.g.position.copy(pn.base); pn.g.position.y += TR.nose * 1.1 / K; pn.g.position.lerp(hang, f);
      pn.g.rotation.z = f * (Math.PI - th) + Math.sin(TR.flip * Math.PI) * .9;
      pn.g.updateMatrixWorld(true); pn.g.getWorldPosition(nb);
      // the cord: tube mouth up to the end of the cord, then down the leash to the nose, a little slack in both
      const P = M.cord.geometry.attributes.position, seg = (a, b, i0, n, sag) => { for (let i = 0; i < n; i++) { const t = i / (n - 1), s = Math.sin(t * Math.PI) * sag; P.setXYZ(i0 + i, lerp(a.x, b.x, t) + s * .6, lerp(a.y, b.y, t) - s, lerp(a.z, b.z, t) + s * .3); } };
      seg(mouth, conf, 0, 7, .12 * (1 - TR.open * .7)); seg(conf, nb, 6, 6, .04);
      P.needsUpdate = true;
    }

    // work light: switched on by the intro, off once the sun is up
    const workI = 2.4 * c.work * I.light;
    M.work.userData.spot.intensity = workI; M.work.userData.spot.shadow.autoUpdate = workI > .002;
    M.work.userData.lens.material.color.setRGB(1, .94, .84).multiplyScalar(.25 + 1.6 * workI);

    // static fire: the chart and film strip drive one burn time
    const fsel = FORMS[sel];
    if (burn.playing) { fireAfter = 0; wasPlaying = true; } else if (burn.t >= 0) fireAfter += dt;
    const tb = burn.scrubT != null ? burn.scrubT : (burn.t >= 0 ? Math.min(burn.t, fsel.end) + (burn.playing ? 0 : fireAfter) : -1);
    const tThr = burn.scrubT != null ? burn.scrubT : burn.playing ? burn.t : -1;
    const fAmt = tThr >= 0 ? thrustAt(fsel, tThr) / 96 : 0;
    const fireVis = c.fire > .02;
    M.tOuter.uniforms.uAmt.value = M.tInner.uniforms.uAmt.value = fAmt;
    M.tOuter.uniforms.uTime.value = M.tInner.uniforms.uTime.value = time;
    M.tFlame.visible = fAmt > .01; M.tFlame.scale.set(.9 + .25 * fAmt, flick * (.3 + .75 * fAmt), .9 + .25 * fAmt);
    M.fireLight.intensity = fAmt * SMOKE_TUNE.fireLight * flick;

    // smoke from both sources
    smoke.begin();
    M.stand.updateMatrixWorld(true);
    M.testMotor.tail.getWorldPosition(nz); ndir.set(0, -1, 0).applyQuaternion(M.testMotor.tail.getWorldQuaternion(qTmp));
    if (tb >= 0 && (fireVis || sy < FLIGHT0)) staticFireSmoke(smoke, fsel, tb, nz, ndir, WIND, lowTier ? SMOKE_TUNE.fireCountLow : SMOKE_TUNE.fireCount);
    if (inFlight && fs.ts > 0) flightSmoke(smoke, fs.ts, SIM.burn, flightPath, WIND, lowTier ? SMOKE_TUNE.trailCountLow : SMOKE_TUNE.trailCount);

    // camera: lens, framing anchor (lens shift), handheld drift, pointer parallax
    const portrait = camera.aspect < .9;
    let vf = 2 * Math.atan(12 / c.mm);
    if (portrait) vf = 2 * Math.atan(Math.tan(vf / 2) * Math.sqrt(1.5 / Math.max(.4, camera.aspect)));
    camera.fov = vf * 180 / Math.PI;
    tgt.set(c.tx, c.ty, c.tz); camP.set(c.cx, c.cy, c.cz);
    const dist = camP.distanceTo(tgt);
    const dr = reduce ? 0 : c.drift * (1 + amt * 3);
    tgt.x += (Math.sin(time * .53) * .6 + Math.sin(time * 1.37 + 1) * .25) * .0022 * dist * dr;
    tgt.y += (Math.sin(time * .41 + 2) * .6 + Math.sin(time * 1.13) * .25) * .0018 * dist * dr;
    ptr.sx = (ptr.sx || 0) + (ptr.x - (ptr.sx || 0)) * (1 - Math.exp(-rdt * 2.5)); ptr.sy = (ptr.sy || 0) + (ptr.y - (ptr.sy || 0)) * (1 - Math.exp(-rdt * 2.5));
    camera.position.copy(camP);
    camera.lookAt(tgt);
    if (fine && !reduce) { camera.translateX(ptr.sx * .035 * dist); camera.translateY(-ptr.sy * .02 * dist); camera.lookAt(tgt); }
    if (I.push > 0) camera.translateZ(I.push * dist * .18);
    camera.near = Math.max(.02, Math.min(.2, dist * .02)); camera.far = 12000;
    const W0 = innerWidth, H0 = innerHeight;
    camera.setViewOffset(W0, H0, -c.ax * W0 / 2, c.ay * H0 / 2, W0, H0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    world.update(camera, time, dpr);

    // smoke lighting
    smoke.end(camera);
    const SU = smoke.U;
    if (tb >= 0 && sy < FLIGHT0) { SU.uP1.value.copy(nz).addScaledVector(ndir, .12); SU.uC1.value.setRGB(1, .52, .2).multiplyScalar(M.fireLight.intensity * SMOKE_TUNE.fireToSmoke); SU.uGlow.value.setRGB(1.6, .62, .2).multiplyScalar(fAmt * SMOKE_TUNE.fireGlow); }
    else { M.pMotor.tail.getWorldPosition(SU.uP1.value); SU.uC1.value.setRGB(1, .55, .24).multiplyScalar(M.tailLight.intensity * SMOKE_TUNE.tailToSmoke); SU.uGlow.value.setRGB(1.6, .7, .3).multiplyScalar(amt * SMOKE_TUNE.tailGlow); }
    M.work.userData.spot.getWorldPosition(SU.uP2.value); SU.uC2.value.setRGB(1, .95, .87).multiplyScalar(workI * SMOKE_TUNE.workToSmoke);
    SU.uD2.value.set(0, 1.15, 0).sub(SU.uP2.value).normalize();
    const sunUp = world.sun.intensity > .01;
    SU.uKeyDir.value.copy(sunUp ? W.sunDir : W.moonDir);
    SU.uKeyCol.value.copy(sunUp ? world.sun.color : world.moon.color).multiplyScalar(sunUp ? world.sun.intensity : world.moon.intensity);
    SU.uTime.value = time;

    // per-frame state shared with the fx, blueprint, hud and sound modules
    const F = { c, I, time, dt, rdt, sy, inFlight, flight: fs, amt, fAmt, tb, workI, W, dist, mob, beam: tgtPose.beam || 0, FLIGHT0, FLIGHT1, camera };
    fx.update(F); bp.update(F); hud.update(F);
    overlays(c); flBox(F);

    // render
    const focus = dist;
    const ap = lowTier ? 0 : c.ap;
    const PO = { exposure: W.exposure * (1 - .25 * c.scan * (1 - c.f0 - c.f1 - c.f2 - c.f3 - c.f4)), bloom: .05 + amt * .03, threshold: 1.7, focus, aperture: ap, vignette: .17, grain: .022, time, fade: I.fade };
    fx.tweakPost(PO, F); bp.tweakPost(PO, F);
    post.render(scene, camera, PO, bp.between);
    strip.draw(sy, rdt);
    blog.draw(sy, rdt);
    cards.draw(sy, rdt);

    // sound follows what is on screen
    soundFrame({ ...F, fire: c.fire, tod: c.tod, scan: c.scan, work: c.work * I.light, vel: lenis ? lenis.velocity : 0, focus: [c.f0, c.f1, c.f2, c.f3, c.f4] });

    // keep it smooth on slower machines
    frames++; ftAcc += rdt;
    if (frames === 90) { const avg = ftAcc / frames; frames = 0; ftAcc = 0; if (avg > .026 && dpr > .75 && !TEST.fixedDpr) { dpr = Math.max(.75, dpr - .25); resize(); } }
  };
  STAGE.capture = strip.capture;
  progress('compiling', .85); await nextFrame();
  world.setTime(.03, performance.now());
  renderer.compile(scene, camera);
  strip.init({ scene, camera, world, M, smoke, STAND_POS, WIND });
  fx.init(); blog.init({ scene, camera, world, M, smoke, STAND_POS, WIND }); cards.init();
  STAGE.ready = true;
  progress('ready', 1);
}
