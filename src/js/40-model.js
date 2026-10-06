/* =====================================================================
   Model: the rocket (kept from v3), launch pad, work light, test stand, chute.
   Built in model units (MU) and placed in the world at K meters per MU.
   ===================================================================== */
const K = 0.305;
function buildModel(ctx) {
  const { C, lowTier } = ctx;
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
  const SCAN = { uScan: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uGhost: { value: .0 } };
  // The drawing (owned by the blueprint module, 62-blueprint.js) covers screen x in [uScan0, uScan).
  // The scene render (uPass 0) draws the real rocket outside it and leaves the drawing's area to the world;
  // the drawing's own pass (uPass 1) draws only the part in focus there, which fills in with material from where
  // it faces the camera out to its outline (uKeep 0..1). The line work itself is drawn by the blueprint module.
  function upgrade(m, keep, lines) {
    if (!SCAN.uPass) Object.assign(SCAN, { uScan0: { value: 0 }, uPass: { value: 0 }, uInk: { value: new THREE.Color(.3, .3, .3) }, uLineW: { value: 1.1 } });
    // the drawing pass writes line pixels with partial coverage (MSAA), so the outlines stay smooth without blending
    if (!lines) m.alphaToCoverage = true;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uScan: SCAN.uScan, uScan0: SCAN.uScan0, uPass: SCAN.uPass, uRes: SCAN.uRes, uGhost: SCAN.uGhost, uKeep: keep, uInk: SCAN.uInk, uLineW: SCAN.uLineW });
      sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      const head = 'uniform float uScan; uniform float uScan0; uniform float uPass; uniform vec2 uRes; uniform float uGhost; uniform float uKeep; uniform vec3 uInk; uniform float uLineW; varying vec3 vWp;\n';
      const common = `float sx_ = gl_FragCoord.x / uRes.x;
        bool dr_ = sx_ >= uScan0 && sx_ < uScan;`;
      sh.fragmentShader = head + sh.fragmentShader.replace('#include <dithering_fragment>', lines
        // station rings and creases: smooth circles and straight edges, drawn in the drawing's pass only
        ? `#include <dithering_fragment>
           ${common}
           if (uPass < .5 || !dr_ || uKeep > .995) discard;
           gl_FragColor = vec4(uInk, .8 * (1. - uKeep));`
        // surfaces: the real material outside the drawing; inside it, the part in focus fills in from where it faces
        // the camera out to its outline, everything else is reduced to its own silhouette (smooth, from the normals)
        : `#include <dithering_fragment>
           ${common}
           if (uPass < .5) { if (dr_) discard; }
           else {
             if (!dr_) discard;
             float e_ = abs(dot(normalize(vNormal), normalize(vViewPosition)));
             float kt_ = uKeep * 1.06 - .03;
             if (1. - e_ > kt_) {
               float w_ = max(fwidth(e_), 1e-4);
               float a_ = 1. - smoothstep(w_ * uLineW, w_ * (uLineW + 1.3), e_);
               if (a_ < .02) discard;
               gl_FragColor = vec4(uInk, a_);
             } else {
               gl_FragColor.a = 1.;
               // a thin bright seam where material meets the drawing while it fills in
               gl_FragColor.rgb += uInk * .5 * (1. - smoothstep(0., .035, kt_ - (1. - e_))) * step(.01, uKeep) * step(uKeep, .99);
             }
           }`);
    };
    m.customProgramCacheKey = () => lines ? 'urL3' : 'urS3';
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
    // chalk at about 2x white after the night exposure: crisp, with only a trace of bloom
    lines: () => new THREE.LineBasicMaterial({ color: C.chalk.clone().multiplyScalar(.3), transparent: true, depthWrite: false, toneMapped: false }),
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
  // drawing lines: a hidden 1 px stand-in that keeps the place and the source shape. The blueprint module turns each
  // source into weighted line work: smooth station rings, outlines that follow the camera, creases.
  function edges(g, geo, L, ang = 1, pos, rot) {
    if (!L) return null;
    const t = geo.type, P = geo.parameters || {};
    let eg = null;
    if (t === 'CapsuleGeometry') return null;                       // soft goods: the surface draws its own outline
    if (t === 'CylinderGeometry' || t === 'LatheGeometry') {
      // bodies of revolution: smooth station rings at the ends and at real creases of the profile, no facets, no meridians
      geo.computeBoundingBox(); const bb = geo.boundingBox, ox = (bb.min.x + bb.max.x) / 2, oz = (bb.min.z + bb.max.z) / 2;
      const pr = t === 'LatheGeometry' ? P.points.map(p => [p.x, p.y]) : [[P.radiusBottom, bb.min.y], [P.radiusTop, bb.max.y]];
      const st = [];
      pr.forEach((p, i) => {
        let keep = i === 0 || i === pr.length - 1;
        if (!keep) { const a = pr[i - 1], b = pr[i + 1], d1x = p[0] - a[0], d1y = p[1] - a[1], d2x = b[0] - p[0], d2y = b[1] - p[1];
          keep = (d1x * d2x + d1y * d2y) / (Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y) + 1e-9) < Math.cos(25 * Math.PI / 180); }
        if (keep && p[0] > .006 && !st.some(q => Math.abs(q[0] - p[0]) < 1e-4 && Math.abs(q[1] - p[1]) < 1e-4)) st.push(p);
      });
      const N = 160, v = [];
      st.forEach(([r, y]) => { r *= 1.006; for (let k = 0; k < N; k++) { const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2; v.push(ox + Math.cos(a0) * r, y, oz + Math.sin(a0) * r, ox + Math.cos(a1) * r, y, oz + Math.sin(a1) * r); } });
      if (!v.length) return null;
      eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    } else eg = new THREE.EdgesGeometry(geo, Math.max(ang, 8));
    const l = new THREE.LineSegments(eg, L); if (pos) l.position.set(...pos); if (rot) l.rotation.set(...rot); l.userData.src = geo; g.add(l); return l;
  }
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

  // ---- plume (flame) ----
  // A KNSB flame is short, orange-yellow and hottest at the nozzle, with a ragged, flickering edge.
  // It is drawn as a glowing volume: every pixel of a bounding cylinder marches through it.
  // Object space: the nozzle exit at y = 0, the flame along -y; uRe = exit radius, uLen and uR = the cylinder.
  const flameVS = `varying vec3 vO; varying vec3 vC; varying vec3 vS;
    void main(){ vO = position; vC = (inverse(modelMatrix) * vec4(cameraPosition, 1.)).xyz;
      vS = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
  const flameFS = `uniform float uTime; uniform float uAmt; uniform float uGain; uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uEdge; uniform float uLen; uniform float uR; uniform float uRe; uniform float uBody;
    varying vec3 vO; varying vec3 vC; varying vec3 vS;
    float h3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
    void main(){
      vec3 ro = vO, rd = normalize(vO - vC);
      // leave the cylinder through its side or an end
      float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz), c = dot(ro.xz, ro.xz) - uR * uR, disc = b * b - a * c;
      float t1 = a > 1e-6 && disc > 0. ? (-b + sqrt(disc)) / a : 1e3;
      if (rd.y > 1e-5) t1 = min(t1, -ro.y / rd.y); else if (rd.y < -1e-5) t1 = min(t1, (-uLen - ro.y) / rd.y);
      t1 = clamp(t1, 0., 2. * uR + uLen);
      const int N = 14; float dt = t1 / float(N), wl = length(rd * vS) * dt;
      float jit = h3(vec3(gl_FragCoord.xy, fract(uTime * 7.)));
      vec3 col = vec3(0.);
      for (int i = 0; i < N; i++) {
        vec3 p = ro + rd * (dt * (float(i) + jit));
        float ax = -p.y / uLen;
        if (ax < 0. || ax > 1.) continue;
        float rr = length(p.xz);
        // eddies carried downstream, changing as they go
        vec3 q = vec3(p.x / uRe, (p.y + uTime * uLen * 7.) / uRe * .4, p.z / uRe);
        float n = n3(q * .75 + vec3(0., 0., uTime * 2.3)) * .6 + n3(q * 2.2 + 5.1) * .4;
        // leaves the nozzle at the exit radius, swells, then breaks into tongues toward the tip
        float rag = mix(.75, 1.15, smoothstep(.15, .7, ax));
        float R = uRe * (1. + 1.25 * smoothstep(0., .22, ax)) * pow(max(0., 1. - ax), .55) * (1. - rag * .5 + rag * n);
        float body = smoothstep(R, 0., rr) * smoothstep(1., .15 + .7 * n, ax);
        // the hot core right out of the nozzle
        float ck = max(0., 1. - ax / .42), core = smoothstep(uRe * (.2 + .75 * ck), 0., rr) * ck;
        // temperature sets the color; light rises steeply with it
        float tp = clamp(core * .95 + body * (.7 - .5 * ax) * (.35 + n), 0., 1.);
        float t2 = tp * tp, e = .55 * uBody * tp + 3. * t2 * t2;
        vec3 cc = mix(uEdge, uMid, smoothstep(.12, .5, tp)); cc = mix(cc, uCore, smoothstep(.55, .95, tp));
        col += cc * e * wl;
      }
      gl_FragColor = vec4(col * uAmt * uGain, 0.);
    }`;
  const plume = (len, rmax) => new THREE.CylinderGeometry(rmax, rmax, len, 28, 1, false).translate(0, -len / 2, 0);
  const fMat = (gain, core, mid, edge, len = 1.5, rmax = .22, re = .082, body = 1) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uGain: { value: gain }, uCore: { value: core }, uMid: { value: mid }, uEdge: { value: edge }, uLen: { value: len }, uR: { value: rmax }, uRe: { value: re }, uBody: { value: body } },
    vertexShader: flameVS, fragmentShader: flameFS, transparent: true, depthWrite: false, side: THREE.FrontSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
  // flight: read against a sunrise sky, so it carries more gain than the night stand flame
  const outerMat = fMat(100, new THREE.Color(1, .8, .5), new THREE.Color(1, .36, .06), new THREE.Color(.8, .14, .02), 1.6, .22, .082, 3.2);
  const innerMat = outerMat;

  const shadowAll = (g, cast = true, recv = true) => g.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = recv; } });

  /* ---------- the flight rocket: root sits on the pad, model units inside ---------- */
  const rocket = new THREE.Group();                 // world meters; y is lift
  const rocketS = new THREE.Group(); rocketS.scale.setScalar(K); rocket.add(rocketS);
  const tilt = new THREE.Group(); rocketS.add(tilt);      // flight attitude (tip over at apogee)
  const stack = new THREE.Group(); stack.position.y = .3; tilt.add(stack);
  const parts = PARTDEF.map(d => {
    const ms = matSet(true), b = d.build(ms.get, ms.get('lines'), false);
    b.g.position.y = d.y; stack.add(b.g);
    const anchors = {}; for (const k in b.anchors || {}) { const o = new THREE.Object3D(); o.position.copy(b.anchors[k]); b.g.add(o); anchors[k] = o; }
    return { ...d, ...b, anchors, ms, base: new THREE.Vector3(0, d.y, 0), spin: 0, subs: (b.subs || []).map(s => ({ ...s, base: s.g.position.clone() })) };
  });
  shadowAll(stack);
  stack.traverse(o => { if (o.isLineSegments) { o.castShadow = false; } });
  const [pNose, pPay, pAv, pBoost, pMotor] = parts;
  const sAnchor = y => { const o = new THREE.Object3D(); o.position.set(0, y, 0); stack.add(o); return o; };
  const UPM = 5.12 / 1.56;
  const aCG = sAnchor(4.92 - .95 * UPM), aCP = sAnchor(4.92 - 1.12 * UPM), aMid = sAnchor(2.4);
  // remove-before-flight tag on the arming band
  const tagU = { uTime: { value: 0 } };
  const tagGeo = new THREE.PlaneGeometry(.042, .5, 1, 24); tagGeo.translate(0, -.25, 0);
  const tagMat = new THREE.MeshStandardMaterial({ map: TEX.tag, roughness: .85, side: THREE.DoubleSide });
  tagMat.onBeforeCompile = sh => { sh.uniforms.uTime = tagU.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float k_ = -position.y / .5; transformed.z += (sin(uTime * 2.1 + k_ * 3.) * .03 + .045) * k_ * k_; transformed.x += sin(uTime * 1.3 + k_ * 2.) * .025 * k_;`); };
  const tag = new THREE.Mesh(tagGeo, tagMat); tag.position.set(0, .05, R + .022); tag.castShadow = true; pAv.g.add(tag);
  // flight plume
  const flame = new THREE.Group();
  flame.add(Object.assign(new THREE.Mesh(plume(1.6, .22), outerMat), { renderOrder: 6 }));
  pMotor.tail.add(flame);
  const tailLight = new THREE.PointLight(0xff8a3a, 0, 9, 2); tailLight.position.set(0, -.6, 0); pMotor.tail.add(tailLight);

  /* ---------- launch pad: plate, blast deflector, 1515 rail, legs, igniter leads ---------- */
  const pad = new THREE.Group(); const padS = new THREE.Group(); padS.scale.setScalar(K); pad.add(padS);
  const pm = p => new THREE.MeshStandardMaterial(p);
  mesh(padS, cyl(.6, .06, 0, 64, false, 1, .56), pm({ color: 0x1f242c, roughness: .55, metalness: .8 }));
  mesh(padS, cyl(.16, .012, .06, 32, false), pm({ color: 0x3a3f47, roughness: .6, metalness: .6 }));
  const railShape = new THREE.Shape(); { const s = .025, sl = .006, sd = .008;
    [[-s, -s], [-sl, -s], [-sl, -s + sd], [sl, -s + sd], [sl, -s], [s, -s], [s, -sl], [s - sd, -sl], [s - sd, sl], [s, sl], [s, s], [sl, s], [sl, s - sd], [-sl, s - sd], [-sl, s], [-s, s], [-s, sl], [-s + sd, sl], [-s + sd, -sl], [-s, -sl]]
      .forEach(([x, y], i) => i ? railShape.lineTo(x, y) : railShape.moveTo(x, y)); railShape.closePath(); }
  const railGeo = new THREE.ExtrudeGeometry(railShape, { depth: 7.4, bevelEnabled: false }); railGeo.rotateX(-Math.PI / 2);
  mesh(padS, railGeo, pm({ color: 0x15181d, roughness: .5, metalness: .65 }), [R + .037, .06, 0]);
  mesh(padS, new THREE.BoxGeometry(.2, .3, .2).translate(R + .037, .21, 0), pm({ color: 0x2a2f37, roughness: .45, metalness: .8 }));
  { const sm = pm({ color: 0x2a2f37, roughness: .45, metalness: .8 });
    for (const [dx, dz] of [[1.6, .9], [1.6, -1.0], [-.3, -1.5]]) {
      const from = new THREE.Vector3(R + .037 + dx, 0, dz), dir = new THREE.Vector3(R + .037, 2.4, 0).sub(from), len = dir.length();
      const geo = new THREE.CylinderGeometry(.016, .016, len, 8); geo.translate(0, len / 2, 0);
      const m = mesh(padS, geo, sm); m.position.copy(from); m.quaternion.setFromUnitVectors(UP, dir.normalize());
      mesh(padS, new THREE.CylinderGeometry(.05, .06, .02, 12).translate(from.x, .01, from.z), sm);
    } }
  // igniter leads run off to the launch controller box
  for (const [col, o] of [[0xC8102E, .01], [0x111111, -.01]]) {
    const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(o, .32, 0), new THREE.Vector3(o + .04, .2, .06), new THREE.Vector3(.22, .03, .4 + o), new THREE.Vector3(1.2, .012, 1.4 + o), new THREE.Vector3(3.4, .012, 3.6 + o), new THREE.Vector3(6.5, .012, 5.2 + o)]);
    mesh(padS, new THREE.TubeGeometry(cv, 80, .006, 6, false), pm({ color: col, roughness: .55 }));
  }
  shadowAll(pad);

  /* ---------- LED work light on a tripod, aimed at the rocket ---------- */
  const work = new THREE.Group();
  {
    const dark = pm({ color: 0x17191d, roughness: .5, metalness: .6 }), alu = pm({ color: 0x9aa0a8, roughness: .35, metalness: .9 });
    const H = 1.85;
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + .4, foot = new THREE.Vector3(Math.cos(a) * .55, 0, Math.sin(a) * .55), top = new THREE.Vector3(0, .62, 0);
      const dir = top.clone().sub(foot), len = dir.length(), g = new THREE.CylinderGeometry(.011, .013, len, 8); g.translate(0, len / 2, 0);
      const m = new THREE.Mesh(g, dark); m.position.copy(foot); m.quaternion.setFromUnitVectors(UP, dir.normalize()); work.add(m);
      const f = new THREE.Mesh(new THREE.CylinderGeometry(.02, .024, .02, 10), dark); f.position.copy(foot).add(new THREE.Vector3(0, .01, 0)); work.add(f);
    }
    const pole = new THREE.Mesh(cyl(.017, H - .62, .62, 12, false), alu); work.add(pole);
    const head = new THREE.Group(); head.position.set(0, H, 0); work.add(head);
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(.17, .01, 6, 24, Math.PI), dark); yoke.rotation.z = Math.PI; head.add(yoke);
    const body = new THREE.Group(); head.add(body);
    body.add(new THREE.Mesh(new THREE.BoxGeometry(.3, .22, .05), dark));
    for (let i = -5; i <= 5; i++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(.004, .2, .03), dark); fin.position.set(i * .026, 0, -.04); body.add(fin); }
    const ledTex = canvasTex(256, 176, (x, w, h) => {
      x.fillStyle = '#1a1a18'; x.fillRect(0, 0, w, h);
      const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * .7); g.addColorStop(0, 'rgba(255,248,236,.55)'); g.addColorStop(1, 'rgba(255,248,236,.12)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let j = 0; j < 5; j++) for (let i = 0; i < 8; i++) { const cx = 20 + i * 31, cy = 22 + j * 33, r = x.createRadialGradient(cx, cy, 0, cx, cy, 13); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,246,228,.9)'); r.addColorStop(1, 'rgba(255,246,228,0)'); x.fillStyle = r; x.beginPath(); x.arc(cx, cy, 13, 0, 7); x.fill(); }
    });
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(.26, .18), new THREE.MeshBasicMaterial({ map: ledTex, color: new THREE.Color(1, .94, .84) })); lens.position.z = .0255; body.add(lens);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(.3, .22, .004), alu); bezel.position.z = .024; bezel.scale.set(1, 1, 1); body.add(bezel); bezel.visible = false;
    // a warm white LED flood (about 4500 K); its beam through the dust is drawn by the fx module
    const spot = new THREE.SpotLight(0xffe5c9, 0, 40, 27 * DEG, .34, 2); spot.position.set(0, 0, .04); body.add(spot);
    spot.castShadow = true; spot.shadow.mapSize.set(lowTier ? 512 : 1024, lowTier ? 512 : 1024); spot.shadow.bias = -.0006; spot.shadow.normalBias = .01; spot.shadow.camera.near = .3; spot.shadow.camera.far = 25;
    const tgt = new THREE.Object3D(); work.add(tgt); spot.target = tgt;
    // cable to a battery box
    const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .7, 0), new THREE.Vector3(.05, .3, .05), new THREE.Vector3(.25, .01, .2), new THREE.Vector3(.8, .01, .5), new THREE.Vector3(1.1, .01, .9)]);
    work.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 40, .006, 5, false), dark));
    const box = new THREE.Mesh(new THREE.BoxGeometry(.32, .22, .2), pm({ color: 0x2a3a4f, roughness: .6, metalness: .2 })); box.position.set(1.15, .11, 1.0); box.rotation.y = .5; work.add(box);
    work.userData = { head, body, spot, tgt, lens };
    work.aim = (target) => {
      tgt.position.copy(work.worldToLocal(target.clone()));
      const hp = new THREE.Vector3(); head.getWorldPosition(hp); const l = work.worldToLocal(target.clone()).sub(head.position);
      head.rotation.y = Math.atan2(l.x, l.z); head.updateMatrixWorld(true); body.lookAt(target);
    };
  }
  shadowAll(work); work.userData.lens.castShadow = false;

  /* ---------- static test stand, with its own motor, flame and light ---------- */
  const stand = new THREE.Group(); const standS = new THREE.Group(); standS.scale.setScalar(K); stand.add(standS);
  {
    const sm = p => new THREE.MeshStandardMaterial(p);
    const sGraph = sm({ color: 0x23272e, roughness: .55, metalness: .7 }), sAlu = sm({ color: 0xb8bdc4, roughness: .3, metalness: 1 }), sEmb = sm({ color: 0xE8622C, roughness: .45, metalness: .5 });
    const wood = sm({ color: 0x8a6a48, roughness: .85 });
    mesh(standS, new THREE.BoxGeometry(2.6, .09, .9).translate(.1, -.2, 0), wood);
    mesh(standS, new THREE.BoxGeometry(2.1, .05, .62).translate(.1, -.13, 0), sGraph);
    for (const z of [-.2, .2]) mesh(standS, new THREE.BoxGeometry(2.1, .03, .04).translate(.1, -.09, z), sAlu);
    for (const x of [-.45, .55]) {
      const t = new THREE.TorusGeometry(.105, .014, 8, 32, Math.PI); t.rotateY(Math.PI / 2); mesh(standS, t.translate(x, .1, 0), sAlu);
      for (const z of [-.105, .105]) mesh(standS, new THREE.BoxGeometry(.04, .22, .03).translate(x, -.01, z), sGraph);
    }
    mesh(standS, new THREE.BoxGeometry(.05, .4, .36).translate(1.08, .08, 0), sGraph);
    mesh(standS, new THREE.BoxGeometry(.1, .06, .06).translate(.98, .1, 0), sEmb);
    mesh(standS, new THREE.BoxGeometry(.14, .34, .3).translate(1.18, .06, 0), sGraph);
    const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(.98, .07, .03), new THREE.Vector3(1.05, -.06, .3), new THREE.Vector3(1.5, -.2, .6), new THREE.Vector3(2.6, -.24, 1.4), new THREE.Vector3(5, -.24, 2.4)]);
    mesh(standS, new THREE.TubeGeometry(cv, 40, .008, 6, false), sm({ color: 0x111317, roughness: .6 }));
  }
  const tms = matSet(false);
  const testMotor = buildMotor(tms.get, null, false);
  testMotor.g.position.set(-.68 + .75, .1, 0); testMotor.g.rotation.z = -Math.PI / 2; testMotor.g.position.x = -.68; standS.add(testMotor.g);
  const tOuter = fMat(60, new THREE.Color(1, .8, .5), new THREE.Color(1, .36, .06), new THREE.Color(.8, .14, .02), 1.5, .22, .082, 1.5);
  const tInner = tOuter;
  const tFlame = new THREE.Group(); tFlame.add(Object.assign(new THREE.Mesh(plume(1.5, .22), tOuter), { renderOrder: 6 })); testMotor.tail.add(tFlame);
  const fireLight = new THREE.PointLight(0xff8a3a, 0, 14, 2); fireLight.position.set(0, -.5, 0); testMotor.tail.add(fireLight);
  shadowAll(stand); tFlame.traverse(o => { o.castShadow = false; o.receiveShadow = false; });

  /* ---------- main parachute ---------- */
  const chuteMs = matSet(false);
  const chute = new THREE.Group(); const chuteS = new THREE.Group(); chuteS.scale.setScalar(K * 1.6); chute.add(chuteS);
  { const prof = t => { const a = t * 1.32; return new THREE.Vector2(Math.sin(a) * 1.15 + .001, Math.cos(a) * .75); };
    const canopy = mesh(chuteS, lathe(prof, 24, 64), chuteMs.get('gores')); canopy.castShadow = true;
    const rimP = prof(1), pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; pts.push(Math.sin(a) * rimP.x, rimP.y, Math.cos(a) * rimP.x, 0, -2.3, 0); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    chuteS.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(.55, .57, .6) }))); }
  chute.visible = false;

  return { TEX, SCAN, upgrade, MATDEF, matSet, lathe, cyl, seg, withAO, mesh, edges, ringGeo, coilGeo, buildNose, buildPayload, buildAvbay, buildBooster, buildMotor, PARTDEF, STACK_Y, R,
    plume, fMat, outerMat, innerMat, flame, tailLight,
    rocket, rocketS, tilt, stack, parts, pNose, pPay, pAv, pBoost, pMotor, aCG, aCP, aMid, tag, tagU, tagMat,
    pad, work, stand, testMotor, tFlame, tOuter, tInner, fireLight, chute };
}
