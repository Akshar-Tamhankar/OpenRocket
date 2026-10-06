/* =====================================================================
   Blueprint sheet for the vehicle section.
   One sequence: the real night scene; the x-ray drawing sweeps over it (the rocket reduced to its outlines,
   the pad and rail leave the drawing); a scan beam then wipes the frame into a cyanotype sheet with a drafting
   grid for the assembly and the exploded view; in the close ups the part in focus is solid and lit while the
   rest stays line work; before the static fire a last sweep hands the frame back to the world.
   createBlueprint(ctx) -> { update(f), between(sceneRT), tweakPost(opts, f) }
   ===================================================================== */
// scroll timeline, shared with the page UI. Drawing on screen x in [x0, x1), paper in [x0, p1), the active beam at x = beam.
function bpTimeline(sy, cscan) {
  const V = MET.veh, Dt = MET.dat, vh = MET.vh;
  const T = { x0: 0, x1: 0, p1: 0, beam: -1, cover: 0, sheet: 0 };
  if (!V || !Dt) return T;
  const ease = t => t * t * (3 - 2 * t), pv = (sy - V.t) / V.len;
  // the sheet sweeps in over the x-ray drawing between 6.5% and 15% of the section
  const sIn = ease(clamp((pv - .065) / .085, 0, 1));
  // after the motor the frame hands back to the world, left to right, before the static fire
  const E0 = Math.max(V.t + V.len * .96, Dt.t - vh * .8), E1 = Dt.t + vh * .1;
  const ex = sy > E0 ? ease(clamp((sy - E0) / Math.max(1, E1 - E0), 0, 1)) : 0;
  const late = pv > .5;
  T.x0 = ex;
  T.x1 = late ? (ex < 1 ? 1 : 0) : clamp(cscan, 0, 1);
  T.p1 = Math.min(T.x1, sIn);
  T.cover = Math.max(0, T.p1 - T.x0);
  T.sheet = sIn * (1 - ex);
  if (!late && cscan > .002 && cscan < .998) T.beam = cscan;
  else if (sIn > .002 && sIn < .998) T.beam = sIn;
  else if (ex > .002 && ex < .998) T.beam = ex;
  return T;
}

function createBlueprint(ctx) {
  const { renderer, scene, camera, M, C } = ctx;
  const SC = M.SCAN;
  if (!SC.uPass) return { update() {}, between: null, tweakPost() {} };
  const LAYER = 7;
  M.rocket.traverse(o => o.layers.enable(LAYER));
  let lit = false;
  // the shock cord coiled in the foot of the payload tube wraps the avionics sled as it rises: in the avionics close up
  // its outline would scribble across the board, so the drawing leaves it out there
  const cords = [];
  if (M.pPay) M.pPay.g.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'TubeGeometry') cords.push(o); });

  // the drawing has no launch rail or pad legs: they leave with the world wherever the drawing is up
  const padMats = new Set();
  M.pad.traverse(o => { if (o.isMesh && o.material) padMats.add(o.material); });
  padMats.forEach(m => {
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uScan: SC.uScan, uScan0: SC.uScan0, uRes: SC.uRes });
      sh.fragmentShader = 'uniform float uScan; uniform float uScan0; uniform vec2 uRes;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\n float sx_ = gl_FragCoord.x / uRes.x; if (sx_ >= uScan0 && sx_ < uScan) discard;');
    };
    m.customProgramCacheKey = () => 'bpPad1';
  });

  /* ---------- the sheet: cyanotype paper with a fine and a coarse drafting grid ---------- */
  // Written at the far plane, so the drawing gets a clean field (no world depth) and the depth of field treats the
  // paper like the sky: it stays legible behind the close ups and only softens a little on the macro shots.
  const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const VS = 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }';
  const PU = { uRes: { value: new THREE.Vector2(1, 1) }, uDpr: { value: 1 }, uReg: { value: new THREE.Vector2(0, 0) }, uK: { value: 1 }, uMob: { value: 0 } };
  const paperMat = new THREE.ShaderMaterial({ vertexShader: VS, uniforms: PU, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true,
    fragmentShader: `uniform vec2 uRes; uniform float uDpr; uniform vec2 uReg; uniform float uK; uniform float uMob;
      float grid(vec2 p, float s){ vec2 m = abs(fract(p / s - .5) - .5) * s; return 1. - smoothstep(0., 1., min(m.x, m.y)); }
      void main(){
        vec2 uv = gl_FragCoord.xy / uRes;
        if (uv.x < uReg.x || uv.x >= uReg.y) discard;
        vec2 px = (gl_FragCoord.xy - vec2(uRes.x * .5, uRes.y)) / uDpr;
        vec2 d = uv - .5;
        float vg = smoothstep(1.05, .25, length(d * vec2(1., 1.2)) * 1.6);
        // cyanotype: deep at the foot of the sheet, lifting toward the top
        vec3 c = vec3(.019, .038, .058) * mix(.84, 1.08, uv.y);
        float s = uMob > .5 ? 20. : 24.;
        c += vec3(.45, .66, 1.) * (grid(px, s) * .024 + grid(px, s * 5.) * .07) * (.4 + .6 * vg);
        gl_FragColor = vec4(c * uK, 1.);
        gl_FragDepth = 1.;
      }` });
  // the scan beam: a crisp hairline that just blooms, a narrow glow, a short afterglow on the side already drawn
  // and tick marks every 24 px running down it, like the read head of a plotter
  const BU = { uRes: { value: new THREE.Vector2(1, 1) }, uDpr: { value: 1 }, uX: { value: 0 }, uK: { value: 1 } };
  const beamMat = new THREE.ShaderMaterial({ vertexShader: VS, uniforms: BU, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
    fragmentShader: `uniform vec2 uRes; uniform float uDpr; uniform float uX; uniform float uK;
      void main(){
        float sx = (gl_FragCoord.x / uRes.x - uX) * uRes.x / uDpr;
        float sy = gl_FragCoord.y / uDpr;
        float back = step(sx, 0.);
        float tick = step(abs(sx + 5.), 4.) * step(fract(sy / 24.), 1. / 24.) * .55;
        float c = exp(-sx * sx / 1.1) * 2.1 + exp(-sx * sx / 90.) * .16 + exp(-sx * sx / 9000.) * .025 + back * exp(sx / 42.) * .045 + tick;
        gl_FragColor = vec4(vec3(.66, .85, 1.25) * c * uK, 1.);
      }` });
  const oCam = new THREE.Camera();
  const pScene = new THREE.Scene(), bScene = new THREE.Scene();
  const pm = new THREE.Mesh(tri, paperMat), bm = new THREE.Mesh(tri, beamMat); pm.frustumCulled = bm.frustumCulled = false;
  pScene.add(pm); bScene.add(bm);

  const st = { x0: 0, x1: 0, p1: 0, beam: -1, cover: 0, E: 1, drawing: false, f2: 0, mob: false };
  function between(rt) {
    if (!st.drawing && st.beam < 0) return;
    const ac = renderer.autoClear; renderer.autoClear = false;
    renderer.setRenderTarget(rt);
    const k = 1 / Math.max(.05, st.E), dpr = rt.width / Math.max(1, innerWidth);
    if (st.p1 > st.x0 + 1e-4) {
      PU.uRes.value.set(rt.width, rt.height); PU.uDpr.value = dpr; PU.uK.value = k; PU.uMob.value = st.mob ? 1 : 0; PU.uReg.value.set(st.x0, st.p1);
      renderer.render(pScene, oCam);
    }
    if (st.drawing) {
      if (!lit) { scene.traverse(o => { if (o.isLight) o.layers.enable(LAYER); }); lit = true; }
      // chalk line work just under the bloom threshold: crisp, a trace of glow
      SC.uInk.value.copy(C.chalk).multiplyScalar(1.45 * k);
      const sm = renderer.shadowMap.autoUpdate, lm = camera.layers.mask, bg = scene.background, tv = M.tag.visible;
      renderer.shadowMap.autoUpdate = false; camera.layers.set(LAYER); scene.background = null; M.tag.visible = tv && st.f2 > .5;
      const hideCord = st.f2 > .02; if (hideCord) cords.forEach(o => { o.visible = false; });
      SC.uPass.value = 1;
      renderer.render(scene, camera);
      SC.uPass.value = 0;
      if (hideCord) cords.forEach(o => { o.visible = true; });
      renderer.shadowMap.autoUpdate = sm; camera.layers.mask = lm; scene.background = bg; M.tag.visible = tv;
    }
    if (st.beam >= 0) {
      BU.uRes.value.set(rt.width, rt.height); BU.uDpr.value = dpr; BU.uX.value = st.beam; BU.uK.value = k;
      renderer.render(bScene, oCam);
    }
    renderer.autoClear = ac;
  }

  return {
    update(F) {
      const T = bpTimeline(F.sy, F.c.scan);
      Object.assign(st, { x0: T.x0, x1: T.x1, p1: T.p1, beam: T.beam, cover: T.cover, f2: F.c.f2, mob: F.mob });
      st.drawing = !F.inFlight && T.x1 - T.x0 > .0005;
      if (!st.drawing) { SC.uScan0.value = 0; SC.uScan.value = 0; return; }
      SC.uScan0.value = T.x0; SC.uScan.value = T.x1;
      SC.uLineW.value = F.mob ? .95 : 1.15;
      // the arming tag is real hardware: it only shows when the avionics bay itself is real
      if (F.c.f2 < .5) M.tag.visible = false;
    },
    between,
    tweakPost(o, F) {
      const cv = st.cover, c = F.c, fs = clamp(c.f0 + c.f1 + c.f2 + c.f3 + c.f4, 0, 1);
      // close ups: expose for the part in focus like a product shot; the paper and the ink are compensated (k = 1 / E)
      if (cv > 0 && fs > 0) o.exposure *= 1 + .75 * fs * cv * cv;
      st.E = o.exposure;
      if (cv > 0) {
        // no lamp haze over the paper; the paper keeps its grid through the close ups
        o.fxK = (o.fxK ?? 1) * (1 - cv);
        o.skyCoc = lerp(o.skyCoc ?? 14, clamp(o.aperture * .16, .4, 2.6), cv);
        o.vignette = lerp(o.vignette ?? .17, .22, cv);
      }
    },
  };
}
