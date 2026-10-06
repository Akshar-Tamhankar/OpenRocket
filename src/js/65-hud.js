/* =====================================================================
   HUD: engineering overlays that track the rocket (hero lock-on, CG/CP marks).
   createHUD(ctx) -> { update(f) }
   The hero HUD: lock-on brackets round the rocket, the tag line, the nose tip,
   CG and CP on leaders with their stations, and a dashed link down the axis.
   It locks on during the intro (STAGE.intro.hud 0..1, with an acquisition
   sweep on STAGE.intro.scan) and fades with the hero. It also owns two small
   jobs that need the frame: drag to rotate in the hero (the camera walks
   round the pad and eases back) and --sky, which the chrome reads to stay
   legible from night to morning.
   ===================================================================== */
function createHUD(ctx) {
  const { camera, M } = ctx;
  const svg = $('#hud'), hero = $('#top');
  if (!svg || !M) return { update() {} };
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, cls, parent = svg, attrs) => {
    const e = document.createElementNS(NS, tag);
    if (cls) e.setAttribute('class', cls);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e); return e;
  };
  const set = (e, a) => { for (const k in a) e.setAttribute(k, typeof a[k] === 'number' ? a[k].toFixed(1) : a[k]); };

  /* ---------- the drawing ---------- */
  const defs = mk('defs');
  const grad = mk('linearGradient', null, defs, { id: 'hudTrail', x1: 0, y1: 0, x2: 0, y2: 1 });
  mk('stop', null, grad, { offset: 0, 'stop-color': '#EEF2F4', 'stop-opacity': 0 });
  mk('stop', null, grad, { offset: 1, 'stop-color': '#EEF2F4', 'stop-opacity': .09 });
  // the acquisition sweep: a line down the frame with a faint trail, only while the intro runs
  const sweep = mk('g', 'sweep'), trail = mk('rect', 'trail', sweep, { x: 0, width: '100%', height: 140, fill: 'url(#hudTrail)' }), sl = mk('line', 'sl', sweep, { x1: 0, x2: '100%' });
  sweep.style.display = 'none';
  const link = mk('path', 'lnk');
  const br = [0, 1, 2, 3].map(() => mk('path', 'br'));
  const ticks = mk('path', 'tk');
  const tag = mk('text', 'tag'), rng = mk('text', 'sub rng', svg, { 'text-anchor': 'end' });
  const MARKS = [
    { a: M.pNose.anchors.tip, label: 'nose_tip', sym: 'x' },
    { a: M.aCG, label: 'cg 0.95 m', sym: 'cg' },
    { a: M.aCP, label: 'cp 1.12 m', sym: 'cp' },
    { a: M.pMotor.tail, label: 'l 1.56 m', sym: 'x', dim: true },
  ].map(m => {
    const g = mk('g', 'mk' + (m.dim ? ' dim' : '')), ld = mk('line', 'ld2', g), sym = mk('g', null, g), tx = mk('text', null, g, { dy: 4 });
    tx.textContent = m.label;
    if (m.sym === 'x') sym.innerHTML = '<line class="cx" x1="-7" y1="0" x2="7" y2="0"></line><line class="cx" x1="0" y1="-7" x2="0" y2="7"></line>';
    else if (m.sym === 'cg') sym.innerHTML = '<circle class="cx" r="8"></circle><path class="fill" d="M0,0 L8,0 A8,8 0 0,1 0,8 Z M0,0 L-8,0 A8,8 0 0,1 0,-8 Z"></path>';
    else sym.innerHTML = '<circle class="cx" r="8"></circle><circle class="fill" r="2.2"></circle>';
    return { ...m, g, ld, sym, tx };
  });
  const finA = M.pBoost.finAnch || [];

  /* ---------- drag to rotate: the camera walks round the pad axis, then eases back to the shot ---------- */
  const drag = { on: false, x: 0, v: 0, yaw: 0 };
  if (hero) {
    hero.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('a,button,input,label')) return;
      drag.on = true; drag.x = e.clientX; drag.v = 0; html.classList.add('grabbing');
    });
    addEventListener('pointermove', e => {
      if (!drag.on) return;
      const dx = e.clientX - drag.x; drag.x = e.clientX;
      drag.v = -dx * .0036; drag.yaw = clamp(drag.yaw + drag.v, -.8, .8);
    });
    const up = () => { if (drag.on) { drag.on = false; html.classList.remove('grabbing'); } };
    addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('blur', up);
  }
  const qY = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);

  /* ---------- per frame ---------- */
  const v = new THREE.Vector3();
  const toScreen = o => { (o.isVector3 ? v.copy(o) : o.getWorldPosition(v)).project(camera); return [(v.x * .5 + .5) * innerWidth, (-v.y * .5 + .5) * innerHeight, v.z]; };
  let shown = -1, skyK = -1, locked = false, lockT = 0, tagTxt = '', rngTxt = '', sweepOn = false;
  return {
    update(F) {
      // how bright the sky is behind the chrome (0 night .. 1 morning)
      const sk = Math.round(sstep(.3, .84, F.c.tod) * 50) / 50;
      if (sk !== skyK) { skyK = sk; html.style.setProperty('--sky', sk); }

      const vh = MET.vh || innerHeight, heroK = 1 - sstep(.02, .5, F.sy / vh);
      // drag to rotate: inertia while released, then a slow return to the designed shot
      if (!drag.on) {
        drag.yaw = clamp(drag.yaw + drag.v, -.8, .8);
        drag.v *= Math.exp(-F.rdt * (reduce ? 60 : 5));
        drag.yaw *= Math.exp(-F.rdt * .45);
      }
      const yaw = drag.yaw * heroK;
      if (Math.abs(yaw) > 1e-4 && !F.inFlight) {
        qY.setFromAxisAngle(Y, yaw);
        camera.position.applyQuaternion(qY);           // round the pad axis (x = z = 0)
        camera.quaternion.premultiply(qY);
        camera.updateMatrixWorld();
      }

      // the HUD: locks on in the intro, leaves with the hero
      const I = F.I, hk = I.hud ?? 1, sc = I.scan ?? 1;
      const alpha = sstep(0, .22, hk) * heroK * (F.inFlight ? 0 : 1);
      const so = sc > .001 && sc < .999 && heroK > .5;
      if (so !== sweepOn) { sweepOn = so; sweep.style.display = so ? '' : 'none'; }
      if (so) {
        const y = lerp(-.04, 1.06, sc) * innerHeight;
        set(sl, { y1: y, y2: y }); set(trail, { y: y - 140 });
        sweep.style.opacity = (sstep(0, .08, sc) * (1 - sstep(.9, 1, sc))).toFixed(3);
      }
      const a3 = alpha.toFixed(3);
      if (a3 !== shown) { shown = a3; svg.style.opacity = a3; svg.style.visibility = alpha < .002 && !so ? 'hidden' : 'visible'; }
      if (alpha < .002) return;

      // the lock-on box: tip, nozzle and fin tips, closing in as the HUD locks
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const o of [MARKS[0].a, MARKS[3].a, ...finA]) { const [x, y] = toScreen(o); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const e = 1 - hk, pad = (F.mob ? 14 : 22) + e * e * 170, L = F.mob ? 14 : 18;
      x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
      set(br[0], { d: `M${x0.toFixed(1)},${(y0 + L).toFixed(1)} V${y0.toFixed(1)} H${(x0 + L).toFixed(1)}` });
      set(br[1], { d: `M${(x1 - L).toFixed(1)},${y0.toFixed(1)} H${x1.toFixed(1)} V${(y0 + L).toFixed(1)}` });
      set(br[2], { d: `M${x1.toFixed(1)},${(y1 - L).toFixed(1)} V${y1.toFixed(1)} H${(x1 - L).toFixed(1)}` });
      set(br[3], { d: `M${(x0 + L).toFixed(1)},${y1.toFixed(1)} H${x0.toFixed(1)} V${(y1 - L).toFixed(1)}` });
      // a short scale on the left edge, one tick per 10 % of the box
      let tk = ''; for (let i = 1; i < 10; i++) { const y = lerp(y0, y1, i / 10); tk += `M${x0.toFixed(1)},${y.toFixed(1)} h${i === 5 ? 9 : 5}`; }
      set(ticks, { d: tk });

      // tag line and range, above the box
      const isLocked = hk > .985;
      if (isLocked && !locked) {
        locked = true; lockT = performance.now();
        svg.classList.add('lk'); setTimeout(() => svg.classList.remove('lk'), 650);
        if (typeof blip === 'function') blip(3200, .04);
      } else if (!isLocked && hk < .5) locked = false;
      const tt = 'mk_i // on_pad // ' + (isLocked ? 'locked' : 'acquiring');
      if (tt !== tagTxt) { tagTxt = tt; tag.textContent = tt; }
      // the tag stays clear of the nav (on phones the box reaches up under it); the range sits under the box on wide screens only
      const navB = F.mob ? 96 : 76, ty = Math.max(y0 - 10, navB);
      set(tag, { x: ty > y0 - 10 ? x0 + 10 : x0, y: ty });
      if (F.mob) { if (rngTxt !== '') { rngTxt = ''; rng.textContent = ''; } }
      else {
        const rt = 'rng ' + camera.position.distanceTo(v.set(0, .8, 0)).toFixed(2) + ' m';
        if (rt !== rngTxt) { rngTxt = rt; rng.textContent = rt; }
        set(rng, { x: x1, y: y1 + 18 });
      }

      // marks on leaders to a label column right of the box; on a narrow screen the column moves inside if it would run off
      let lx = x1 + (F.mob ? 14 : 26);
      const room = innerWidth - 10 - 74;
      const flip = lx > room;
      if (flip) lx = x0 - (F.mob ? 14 : 26);
      let path = '';
      MARKS.forEach((m, i) => {
        const [x, y] = toScreen(m.a);
        m.sym.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
        m.tx.setAttribute('text-anchor', flip ? 'end' : 'start');
        set(m.tx, { x: flip ? lx - 8 : lx + 8, y });
        set(m.ld, { x1: flip ? x - 12 : x + 12, y1: y, x2: lx, y2: y });
        path += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
      });
      set(link, { d: path });
    },
  };
}
