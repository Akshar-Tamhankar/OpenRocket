/* =====================================================================
   FX: atmosphere with a physical cause.
   - The work light's beam: playa dust hangs in the air, so the LED flood scatters off it. Each pixel
     the cone covers marches its view ray through the cone (equi-angular samples around the lamp, so
     the bright part near the lamp is sampled where it matters), stops at the scene depth, and reads
     the light's own shadow map, so the rocket and the tripod cut dark shafts into the beam.
   - Dust motes: a few thousand specks drifting on the breeze. They are lit only by the work light,
     so they show inside the beam and nowhere else; out of focus they open into soft discs.
   - The look: contrast, color separation and the lens streak, keyed to the time of day.
   Both render into one half-res HDR target that the post adds to the scene before exposure.
   createFX(ctx) -> { init(), update(F), tweakPost(opts, F) }
   ===================================================================== */
function createFX(ctx) {
  const { renderer, scene, camera, world, M, post, smoke, Q, WIND } = ctx;
  const spot = M.work.userData.spot;
  const low = !!Q.low;
  const tune = () => (TEST && TEST.fx) || {};

  /* ---------- the lamp: a warm white LED (about 4500 K), so the practical reads warm against the moon ---------- */
  const LED = new THREE.Color(1, .78, .58).multiplyScalar(1.25);   // linear; a bright practical against a dark night
  const LENS = new THREE.Color(1, .86, .7);

  /* ---------- dust density: a small tileable noise volume, carried by the wind ---------- */
  const NS = 32, ND = new Uint8Array(NS * NS * NS);
  {
    const r = rng(311), acc = new Float32Array(NS * NS * NS);
    for (const [Pd, amp] of [[4, .55], [8, .3], [16, .15]]) {
      const lat = new Float32Array(Pd * Pd * Pd); for (let i = 0; i < lat.length; i++) lat[i] = r();
      for (let z = 0; z < NS; z++) for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
        const gx = x / NS * Pd, gy = y / NS * Pd, gz = z / NS * Pd, x0 = gx | 0, y0 = gy | 0, z0 = gz | 0;
        let fx = gx - x0, fy = gy - y0, fz = gz - z0; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
        const x1 = (x0 + 1) % Pd, y1 = (y0 + 1) % Pd, z1 = (z0 + 1) % Pd, L = (a, b, c) => lat[a + b * Pd + c * Pd * Pd];
        const v = lerp(lerp(lerp(L(x0, y0, z0), L(x1, y0, z0), fx), lerp(L(x0, y1, z0), L(x1, y1, z0), fx), fy),
          lerp(lerp(L(x0, y0, z1), L(x1, y0, z1), fx), lerp(L(x0, y1, z1), L(x1, y1, z1), fx), fy), fz);
        acc[x + y * NS + z * NS * NS] += v * amp;
      }
    }
    for (let i = 0; i < acc.length; i++) ND[i] = Math.max(0, Math.min(255, acc[i] * 255));
  }
  const tNoise = new THREE.Data3DTexture(ND, NS, NS, NS);
  tNoise.format = THREE.RedFormat; tNoise.type = THREE.UnsignedByteType; tNoise.minFilter = tNoise.magFilter = THREE.LinearFilter;
  tNoise.wrapS = tNoise.wrapT = tNoise.wrapR = THREE.RepeatWrapping; tNoise.unpackAlignment = 1; tNoise.needsUpdate = true;
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;

  // shared by the beam and the motes
  const U = {
    tDepth: { value: null }, tShadow: { value: white }, tNoise: { value: tNoise },
    uShadowM: { value: new THREE.Matrix4() }, uShadowBias: { value: -.0008 },
    uApex: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector3(0, -1, 0) },
    uCosO: { value: Math.cos(spot.angle) }, uCosI: { value: Math.cos(spot.angle * (1 - spot.penumbra)) }, uCos2: { value: Math.cos(spot.angle) ** 2 }, uLen: { value: 14 },
    uCol: { value: new THREE.Color() }, uDens: { value: .02 }, uNoiseAmt: { value: .55 }, uG: { value: new THREE.Vector3(.72, .12, .55) }, uR0: { value: .14 },
    uNear: { value: .1 }, uFar: { value: 12000 }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uWind: { value: new THREE.Vector3() },
    // motes
    uBox: { value: new THREE.Matrix4() }, uDrift: { value: new THREE.Vector3() }, uFocus: { value: 4 }, uAp: { value: 0 }, uMoteK: { value: 1 }, uPxA: { value: 1 }, uMoteMax: { value: 5 },
  };
  // the lamp and the dust's phase function: all the mote vertex stage needs (no samplers there, so it compiles fast)
  const GLSL_FXPHASE = `
    uniform vec3 uApex; uniform vec3 uAxis; uniform float uCosO; uniform float uCosI; uniform vec3 uCol; uniform float uR0; uniform float uTime; uniform vec3 uG;
    // Henyey-Greenstein; dust is a strong forward scatterer with a broad side lobe
    float hg(float c, float g){ float g2 = g * g; return (1. - g2) / (12.566371 * pow(max(1e-4, 1. + g2 - 2. * g * c), 1.5)); }
    float phaseDust(float c){ return mix(hg(c, uG.y), hg(c, uG.x), uG.z); }
  `;
  const GLSL_FXCOMMON = GLSL_FXPHASE + `
    uniform sampler2D tDepth; uniform sampler2D tShadow; uniform mat4 uShadowM; uniform float uShadowBias;
    uniform float uNear; uniform float uFar; uniform vec2 uRes;
    #include <packing>
    float shadowAt(vec3 p){
      vec4 sc = uShadowM * vec4(p, 1.); sc.xyz /= sc.w;
      if (sc.x <= 0. || sc.x >= 1. || sc.y <= 0. || sc.y >= 1. || sc.z >= 1.) return 1.;
      return step(sc.z + uShadowBias, unpackRGBAToDepth(texture2D(tShadow, sc.xy)));
    }
    float sceneDist(vec2 suv, vec3 rdView){ float vz = perspectiveDepthToViewZ(texture2D(tDepth, suv).r, uNear, uFar); return vz / min(rdView.z, -1e-4); }
  `;

  /* ---------- the beam ---------- */
  const STEPS = low ? 10 : 18;
  const beamMat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `precision highp sampler3D;
      uniform sampler3D tNoise; uniform float uCos2; uniform float uLen; uniform float uDens; uniform float uNoiseAmt; uniform vec3 uWind;
      varying vec3 vW;
      ${GLSL_FXCOMMON}
      // where the view ray enters the finite cone (apex uApex, axis uAxis); t1 is where it leaves (this back face)
      float enterCone(vec3 ro, vec3 rd, float t1){
        vec3 co = ro - uApex; float vd = dot(rd, uAxis), cd = dot(co, uAxis), k = uCos2;
        float c = cd * cd - k * dot(co, co);
        if (cd >= 0. && cd <= uLen && c >= 0.) return 0.;
        float a = vd * vd - k, b = 2. * (vd * cd - k * dot(rd, co)), best = t1;
        float disc = b * b - 4. * a * c;
        if (disc >= 0. && abs(a) > 1e-6) {
          float s = sqrt(disc), r1 = (-b - s) / (2. * a), r2 = (-b + s) / (2. * a), ax;
          ax = cd + r1 * vd; if (r1 >= 0. && r1 < best && ax >= -1e-3 && ax <= uLen + 1e-3) best = r1;
          ax = cd + r2 * vd; if (r2 >= 0. && r2 < best && ax >= -1e-3 && ax <= uLen + 1e-3) best = r2;
        }
        if (abs(vd) > 1e-6) { float tc = (uLen - cd) / vd; vec3 q = co + rd * tc; if (tc >= 0. && tc < best && uLen * uLen >= k * dot(q, q) * .999) best = tc; }
        return best;
      }
      float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
      void main(){
        vec3 ro = cameraPosition, rd = normalize(vW - ro);
        float t1 = length(vW - ro);
        vec2 suv = gl_FragCoord.xy / uRes;
        t1 = min(t1, sceneDist(suv, (viewMatrix * vec4(rd, 0.)).xyz));
        float t0 = enterCone(ro, rd, t1);
        if (t1 - t0 < 1e-3) { gl_FragColor = vec4(0.); return; }
        // equi-angular sampling about the lamp: the 1 / d^2 falloff cancels against the sample density
        float D0 = dot(uApex - ro, rd), D = sqrt(max(0., dot(uApex - ro, uApex - ro) - D0 * D0) + uR0 * uR0);
        float thA = atan((t0 - D0) / D), thB = atan((t1 - D0) / D);
        float j = ign(gl_FragCoord.xy), acc = 0.;
        for (int i = 0; i < ${STEPS}; i++) {
          float t = D0 + D * tan(mix(thA, thB, (float(i) + j) / ${STEPS}.));
          vec3 p = ro + rd * t, l = p - uApex; vec3 ld = normalize(l);
          float sp = smoothstep(uCosO, uCosI, dot(ld, uAxis));
          if (sp <= 0.) continue;
          // dust is thicker near the ground and comes in slow, wind-blown wisps
          float n = texture(tNoise, p * .31 + uWind * uTime).r * .65 + texture(tNoise, p * .83 - uWind * uTime * 1.6).r * .35;
          float dens = mix(1., n * 2.1, uNoiseAmt) * (1. + 1.4 * exp(-max(p.y, 0.) / .6));
          acc += sp * shadowAt(p) * phaseDust(dot(ld, -rd)) * dens;
        }
        gl_FragColor = vec4(uCol * (uDens * acc * (thB - thA) / (D * ${STEPS}.)), 1.);
      }`,
  });
  const coneGeo = new THREE.ConeGeometry(1, 1, 48, 1, false); coneGeo.translate(0, -.5, 0); coneGeo.rotateX(-Math.PI / 2);   // apex at 0, base at z = 1
  const cone = new THREE.Mesh(coneGeo, beamMat); cone.frustumCulled = false;

  /* ---------- dust motes ---------- */
  const NM = low ? 900 : 2600;
  const mg = new THREE.BufferGeometry();
  {
    const r = rng(907), pos = new Float32Array(NM * 3), sd = new Float32Array(NM * 4);
    for (let i = 0; i < NM; i++) { pos[i * 3] = r(); pos[i * 3 + 1] = r(); pos[i * 3 + 2] = r(); for (let k = 0; k < 4; k++) sd[i * 4 + k] = r(); }
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  }
  const moteMat = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    vertexShader: `attribute vec4 aSeed; uniform mat4 uBox; uniform vec3 uDrift; uniform float uFocus; uniform float uAp; uniform float uMoteK; uniform float uPxA; uniform float uMoteMax;
      varying vec3 vC; varying float vS; varying vec3 vP; varying float vZ;
      ${GLSL_FXPHASE}
      // no texture reads up here: vertex-stage fetches cost seconds of shader compile on software GL,
      // so the depth and shadow tests run per fragment instead
      void main(){
        // drift on the breeze with a slow private wander, wrapped inside a box around the beam
        float ts = uTime * (.55 + .9 * aSeed.w);
        vec3 u = position + uDrift * ts + .035 * vec3(sin(uTime * .23 + aSeed.x * 40.), sin(uTime * .17 + aSeed.y * 40.) + .4 * sin(uTime * .61 + aSeed.z * 9.), sin(uTime * .19 + aSeed.z * 40.));
        u = fract(u);
        vec3 p = (uBox * vec4(u, 1.)).xyz;
        float edge = smoothstep(0., .06, u.x) * smoothstep(1., .94, u.x) * smoothstep(0., .06, u.y) * smoothstep(1., .94, u.y) * smoothstep(0., .1, u.z) * smoothstep(1., .9, u.z);
        vec3 l = p - uApex; float dl2 = dot(l, l); vec3 ld = l * inversesqrt(dl2);
        float sp = smoothstep(uCosO, uCosI, dot(ld, uAxis)) * edge * step(.01, p.y);
        vec4 mv = viewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        vC = vec3(0.); vS = 1.; gl_PointSize = 1.; vP = p; vZ = mv.z;
        if (sp <= 0. || -mv.z < .25) { gl_Position = vec4(2., 2., 2., 1.); return; }
        vec3 v = cameraPosition - p; float dc2 = dot(v, v);
        // a flake turning in the air flashes now and then
        float glint = .18 + .82 * pow(.5 + .5 * sin(uTime * (1.3 + 2.6 * aSeed.x) + aSeed.y * 60.), 5.);
        float E = sp / (dl2 + uR0 * uR0);
        float flux = uMoteK * E * phaseDust(dot(ld, normalize(v))) * glint * (.4 + .6 * aSeed.z) / (dc2 * uPxA);
        // out of focus: the same light spread over a disc the size of the circle of confusion
        float coc = clamp(abs(1. - uFocus / -mv.z) * uAp, 0., 14.);
        float s = max(1.3, coc * 2.);
        vS = s; gl_PointSize = s;
        vC = uCol * min(flux / (s * s), uMoteMax);
      }`,
    fragmentShader: `varying vec3 vC; varying float vS; varying vec3 vP; varying float vZ;
      ${GLSL_FXCOMMON}
      void main(){ vec2 q = gl_PointCoord * 2. - 1.; float r = length(q);
        // small: a soft speck; large: a flat disc with a slightly brighter rim, like a real lens
        float a = vS < 2.5 ? exp(-r * r * 2.6) * 1.4 : smoothstep(1., .82, r) * (.85 + .25 * smoothstep(.5, .95, r));
        if (a < .004 || dot(vC, vec3(1.)) <= 0.) discard;
        // behind the rocket or the ground, or in the shadow they cast into the beam
        float zs = perspectiveDepthToViewZ(texture2D(tDepth, gl_FragCoord.xy / uRes).r, uNear, uFar);
        if (vZ < zs - .02) discard;
        gl_FragColor = vec4(vC * a * shadowAt(vP), 1.); }`,
  });
  const motes = new THREE.Points(mg, moteMat); motes.frustumCulled = false;
  const fxScene = new THREE.Scene(); fxScene.add(cone, motes);
  fxScene.matrixWorldAutoUpdate = true;

  /* ---------- per frame ---------- */
  let rt = null, on = false;
  const apex = new THREE.Vector3(), tgt = new THREE.Vector3(), axis = new THREE.Vector3(), ex = new THREE.Vector3(), ey = new THREE.Vector3(), tmp = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1), clr = new THREE.Color(), mBox = new THREE.Matrix4(), mS = new THREE.Matrix4(), mT = new THREE.Matrix4();
  const BOX = { half: 2.7, z0: .12, z1: 5.6 };
  const st = { focus: 4, ap: 0, scan: 0, workI: 0 }, camDir = new THREE.Vector3();
  function place() {
    spot.updateMatrixWorld(true); spot.target.updateMatrixWorld(true);
    spot.getWorldPosition(apex); spot.target.getWorldPosition(tgt);
    axis.subVectors(tgt, apex).normalize();
    const L = U.uLen.value, R = L * Math.tan(spot.angle) * 1.03;
    cone.position.copy(apex); cone.quaternion.setFromUnitVectors(Z, axis); cone.scale.set(R, R, L);
    U.uApex.value.copy(apex); U.uAxis.value.copy(axis);
    U.uCosO.value = Math.cos(spot.angle); U.uCosI.value = Math.cos(spot.angle * (1 - spot.penumbra)); U.uCos2.value = Math.cos(spot.angle) ** 2;
    // mote box in the lamp's frame: across the beam and along it
    ex.crossVectors(axis, UP); if (ex.lengthSq() < 1e-6) ex.set(1, 0, 0); ex.normalize(); ey.crossVectors(ex, axis).normalize();
    const B = BOX, w = B.half * 2, len = B.z1 - B.z0;
    mBox.makeBasis(ex, ey, axis).setPosition(apex);
    mT.makeTranslation(-B.half, -B.half, B.z0); mS.makeScale(w, w, len);
    U.uBox.value.copy(mBox).multiply(mT).multiply(mS);
    // the breeze in box units (a slow drift, a little slower than the smoke's wind)
    tmp.copy(WIND).multiplyScalar(.16);
    U.uDrift.value.set(tmp.dot(ex) / w, tmp.dot(ey) / w + .006, tmp.dot(axis) / len);
    U.uWind.value.copy(WIND).multiplyScalar(-.035);
  }
  function fxPass(sceneRT, scn, cam, o) {
    if (scn !== scene || !on) return null;
    const div = low ? 3 : 2, w = Math.max(1, Math.round(post.w / div)), h = Math.max(1, Math.round(post.h / div));
    if (!rt || rt.width !== w || rt.height !== h) { rt && rt.dispose(); rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); }
    U.tDepth.value = sceneRT.depthTexture; U.uRes.value.set(w, h); U.uNear.value = cam.near; U.uFar.value = cam.far;
    const sm = spot.shadow && spot.shadow.map;
    U.tShadow.value = sm ? sm.texture : white; U.uShadowM.value.copy(spot.shadow.matrix); U.uShadowBias.value = spot.shadow.bias - .0004;
    // motes: focus and aperture as the depth of field sees them (its circle of confusion is in half-res pixels, like this target)
    U.uFocus.value = o.focus || st.focus; U.uAp.value = (o.aperture > .05 && !low) ? o.aperture : 0;
    const fovY = cam.fov * DEG, pxa = 2 * Math.tan(fovY / 2) / h; U.uPxA.value = pxa * pxa * 1e4;
    renderer.getClearColor(clr); const ka = renderer.getClearAlpha();
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false);
    renderer.render(fxScene, cam);
    renderer.setClearColor(clr, ka);
    return rt.texture;
  }
  post.fxPass = fxPass;

  return {
    init() {},
    update(F) {
      const T = tune();
      st.workI = F.workI; st.scan = F.c.scan;
      // the stage drives the lamp's level; the color is this lamp's own
      spot.color.copy(LED);
      M.work.userData.lens.material.color.copy(LENS).multiplyScalar(.25 + 1.6 * F.workI);
      if (smoke && smoke.U) smoke.U.uC2.value.copy(LED).multiplyScalar(F.workI * SMOKE_TUNE.workToSmoke);
      on = spot.intensity > .002 && (T.beam ?? 1) > 0;
      if (!on) return;
      place();
      U.uCol.value.copy(spot.color).multiplyScalar(spot.intensity);
      // the drawing (x-ray) needs a clean field: the beam steps back while it is up
      U.uDens.value = (T.dens ?? .04) * (1 - .55 * F.c.scan);
      U.uNoiseAmt.value = T.noise ?? .42;
      U.uMoteK.value = (T.mote ?? 1) * (1 - .6 * F.c.scan);
      U.uTime.value = F.time;
    },
    tweakPost(o, F) {
      const T = tune(), W = F.W, el = W.elev, night = W.night;
      o.fxK = on ? 1 : 0;
      // a camera high up and looking down meters on the sunlit playa that fills its frame, not on the sky: it opens up,
      // and its white balance is set by that pale ground, not by the sunrise behind it
      const cam = F.camera; let down = 0;
      if (cam) {
        // how far the top of the frame sits below the horizon: a drone at 150 m barely tilting down still sees only ground
        cam.getWorldDirection(camDir);
        const topEl = Math.asin(clamp(camDir.y, -1, 1)) + cam.fov * DEG * .5;
        down = Math.max(sstep(.2, .55, -camDir.y), sstep(4 * DEG, -2 * DEG, topEl)) * sstep(8, 40, cam.position.y) * (1 - night);
      }
      // the grade follows the light: cool night shadows against the warm practical, a rich dawn, a clean morning
      const dawn = sstep(-9, -2, el) * (1 - sstep(4, 10, el));
      const day = sstep(1, 7, el);
      o.look = {
        con: T.con ?? lerp(1.12, 1.25, night) + .05 * dawn,
        sat: T.sat ?? (1.06 + .1 * night + .28 * dawn * (1 - .6 * down) - .04 * day),
        slope: [1 - .07 * down, 1 - .01 * down, 1 + .1 * down], pow: [1, 1, 1],
        sh: T.sh ?? [lerp(.97, .84, night), lerp(1, .97, night), lerp(1.04, 1.24, night), lerp(.35, .85, night)],
        hi: T.hi ?? [1.07 - .05 * down, 1, lerp(lerp(.9, .84, dawn), .97, down), lerp(.35, .55, night) + .2 * dawn],
        split: [0, 0], vigPow: 1.25,
      };
      o.vignette = Math.max(o.vignette ?? .17, lerp(.2, .36, night) * (1 - .4 * F.c.scan));
      // stars at infinity through a real 28-50 mm lens blur by a few pixels at most
      o.skyCoc = T.skyCoc ?? .9;
      // a cinema lens: the brightest points draw a faint horizontal line
      o.streak = T.streak ?? lerp(.07, .12, night) * (F.mob ? .75 : 1); o.streakTh = T.streakTh ?? 8; o.streakStretch = .8;
      o.streakTint = [.62, .8, 1.15];
      o.exposure *= Math.pow(2, .8 * down);
      if (T.ev != null) o.exposure *= Math.pow(2, T.ev);
    },
  };
}
