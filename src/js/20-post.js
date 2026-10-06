/* =====================================================================
   Post: HDR scene (+ light scattered in the air, from the fx pass) > depth of field >
   bloom on true emitters + an anamorphic streak on the brightest points > AgX with a film look > grade.
   Everything past the defaults is opt-in per render, so other users of createPost (the film strip's
   phone camera) keep their own look.
   ===================================================================== */
function createPost(renderer, Q) {
  const P = { dpr: 1, w: 1, h: 1 };
  const fsVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
  const fsGeo = new THREE.BufferGeometry();
  fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const fsMesh = new THREE.Mesh(fsGeo); fsMesh.frustumCulled = false;
  const fsScene = new THREE.Scene(); fsScene.add(fsMesh);
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const SM = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: fsVS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  const pass = (mat, target) => { fsMesh.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };
  P.pass = pass; P.SM = SM;
  const RT = (w, h, o = {}) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...o });
  const LEVELS = Q.low ? 4 : 6;
  // fx pass hook (the atmosphere module): (sceneRT, scene, camera, o) -> HDR texture to add to the scene, or null
  P.fxPass = null;

  // depth of field: half-res gather (golden-angle spiral, after Dennis Gustafsson)
  // the sky (nothing written to depth) can keep a smaller blur than the exaggerated near field (uSkyCoc), so stars stay points
  const dofMat = SM(`uniform sampler2D tCol; uniform sampler2D tDepth; uniform vec2 uPx; uniform float uFocus; uniform float uAperture; uniform float uNear; uniform float uFar; uniform float uMax; uniform float uSkyCoc; varying vec2 vUv;
    float lin(float d){ return uNear * uFar / (uFar - d * (uFar - uNear)); }
    float coc(float z){ return clamp(abs(1. - uFocus / z) * uAperture, 0., uMax); }
    float cocD(float d){ float c = coc(lin(d)); return d > .9999995 ? min(c, uSkyCoc) : c; }
    void main(){
      float dc = texture2D(tDepth, vUv).r, zc = lin(dc), sc = cocD(dc);
      vec3 col = texture2D(tCol, vUv).rgb; float tot = 1.;
      float rad = 1.2;
      for (int i = 0; i < 48; i++) {
        if (rad >= uMax) break;
        float ang = float(i) * 2.39996323;
        vec2 tc = vUv + vec2(cos(ang), sin(ang)) * uPx * rad;
        vec3 s = texture2D(tCol, tc).rgb; float ds = texture2D(tDepth, tc).r, zs = lin(ds), ss = cocD(ds);
        if (zs > zc) ss = clamp(ss, 0., sc * 2.);
        float m = smoothstep(rad - .5, rad + .5, ss);
        col += mix(col / tot, s, m); tot += 1.; rad += 3.2 / rad;
      }
      gl_FragColor = vec4(col / tot, sc);
    }`, { tCol: { value: null }, tDepth: { value: null }, uPx: { value: new THREE.Vector2() }, uFocus: { value: 5 }, uAperture: { value: 0 }, uNear: { value: .05 }, uFar: { value: 12000 }, uMax: { value: 14 }, uSkyCoc: { value: 14 } });
  const brightMat = SM(`uniform sampler2D tIn; uniform sampler2D tFx; uniform float uFx; uniform vec2 uT; uniform float uTh; uniform float uExp; varying vec2 vUv;
    void main(){ vec3 c = (texture2D(tIn, vUv + uT * vec2(-.5, -.5)).rgb + texture2D(tIn, vUv + uT * vec2(.5, -.5)).rgb + texture2D(tIn, vUv + uT * vec2(-.5, .5)).rgb + texture2D(tIn, vUv + uT * vec2(.5, .5)).rgb) * .25;
      c = (c + texture2D(tFx, vUv).rgb * uFx) * uExp;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.);
      float b = max(c.r, max(c.g, c.b)); float k = clamp((b - uTh) / max(b, 1e-4), 0., 1.); gl_FragColor = vec4(min(c * k, vec3(60.)), 1.); }`,
    { tIn: { value: null }, tFx: { value: null }, uFx: { value: 0 }, uT: { value: new THREE.Vector2() }, uTh: { value: 1.6 }, uExp: { value: 1 } });
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

  /* ---------- anamorphic streak (after Keijiro's KinoStreak): only points far above white, smeared sideways ----------
     A cylindrical front element spreads a bright point into a thin horizontal line. Prefilter to half width and a
     quarter height, then a horizontal-only pyramid: each level halves the width, the way back blends toward the
     wider levels by uStretch. */
  const streakPre = SM(`uniform sampler2D tIn; uniform vec2 uT; uniform float uTh; uniform float uExp; varying vec2 vUv;
    void main(){ vec3 c = (texture2D(tIn, vUv + vec2(0., -uT.y)).rgb + texture2D(tIn, vUv + vec2(0., uT.y)).rgb) * .5 * uExp;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.);
      float b = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(min(c * clamp((b - uTh) / max(b, 1e-4), 0., 1.), vec3(200.)), 1.); }`,
    { tIn: { value: null }, uT: { value: new THREE.Vector2() }, uTh: { value: 8 }, uExp: { value: 1 } });
  const streakDown = SM(`uniform sampler2D tIn; uniform vec2 uT; varying vec2 vUv;
    void main(){ vec3 c = vec3(0.); for (int i = 0; i < 6; i++) c += texture2D(tIn, vUv + vec2(uT.x * (float(i) * 2. - 5.), 0.)).rgb; gl_FragColor = vec4(c / 6., 1.); }`,
    { tIn: { value: null }, uT: { value: new THREE.Vector2() } });
  const streakUp = SM(`uniform sampler2D tIn; uniform sampler2D tHi; uniform vec2 uT; uniform float uStretch; varying vec2 vUv;
    void main(){ float dx = uT.x * 1.5;
      vec3 lo = texture2D(tIn, vUv - vec2(dx, 0.)).rgb * .25 + texture2D(tIn, vUv).rgb * .5 + texture2D(tIn, vUv + vec2(dx, 0.)).rgb * .25;
      gl_FragColor = vec4(mix(texture2D(tHi, vUv).rgb, lo, uStretch), 1.); }`,
    { tIn: { value: null }, tHi: { value: null }, uT: { value: new THREE.Vector2() }, uStretch: { value: .78 } });

  const blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); blackTex.needsUpdate = true;
  P.blackTex = blackTex;
  const compMat = SM(`uniform sampler2D tScene; uniform sampler2D tDof; uniform sampler2D tBloom; uniform sampler2D tOver; uniform sampler2D tFx; uniform sampler2D tStreak;
    uniform float uExp; uniform float uBloom; uniform float uDof; uniform float uVig; uniform float uGrain; uniform float uTime; uniform float uFade; uniform vec2 uRes; uniform float uOver;
    uniform float uFx; uniform float uStreak; uniform vec3 uStreakTint;
    uniform vec3 uLift; uniform vec3 uGain; uniform vec2 uSplit;
    uniform float uCon; uniform float uSat; uniform vec3 uSlope; uniform vec3 uPow; uniform vec4 uShTint; uniform vec4 uHiTint; uniform float uVigPow; varying vec2 vUv;
    const mat3 S2R = mat3(vec3(.6274, .0691, .0164), vec3(.3293, .9195, .0880), vec3(.0433, .0113, .8956));
    const mat3 R2S = mat3(vec3(1.6605, -.1246, -.0182), vec3(-.5876, 1.1329, -.1006), vec3(-.0728, -.0083, 1.1187));
    vec3 agxC(vec3 x){ vec3 x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + .4298 * x2 + .1191 * x - .00232; }
    vec3 agx(vec3 c){
      const mat3 IN = mat3(vec3(.856627153315983, .137318972929847, .11189821299995), vec3(.0951212405381588, .761241990602591, .0767994186031903), vec3(.0482516061458583, .101439036467562, .811302368396859));
      const mat3 OUT = mat3(vec3(1.1271005818144368, -.1413297634984383, -.14132976349843826), vec3(-.11060664309660323, 1.157823702216272, -.11060664309660294), vec3(-.016493938717834573, -.016493938717834257, 1.2519364065950405));
      c = IN * (S2R * c); c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.49999, 0., 1.);
      // contrast in the log encoding, pivoting on mid grey: deeper blacks, the highlights still roll off in the curve
      c = clamp((c - .606) * uCon + .606, 0., 1.);
      c = agxC(c);
      // look (ASC CDL in AgX space): slope, power, saturation
      float l = dot(c, vec3(.2126, .7152, .0722));
      c = pow(max(c * uSlope, vec3(0.)), uPow);
      c = l + uSat * (c - l);
      c = OUT * c; c = pow(max(vec3(0.), c), vec3(2.2)); return clamp(R2S * c, 0., 1.); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
    float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    void main(){
      vec2 uv = vUv;
      vec3 col = texture2D(tScene, uv).rgb;
      vec4 dof = texture2D(tDof, uv);
      col = mix(col, dof.rgb, smoothstep(.6, 2.2, dof.a) * uDof);
      col += texture2D(tFx, uv).rgb * uFx;
      if (any(isnan(col)) || any(isinf(col))) col = vec3(0.);
      col = col * uExp + texture2D(tBloom, uv).rgb * uBloom + texture2D(tStreak, uv).rgb * uStreakTint * uStreak;
      col = agx(col);
      // split grade: tint the shadows and the highlights without lifting the blacks (uShTint/uHiTint .w = amount),
      // plus the older additive split (uSplit) that the film strip keeps
      float l = dot(col, vec3(.2126, .7152, .0722));
      float ws = 1. - smoothstep(0., .3, l), wh = smoothstep(.25, .9, l);
      col *= mix(vec3(1.), uShTint.rgb, ws * uShTint.w) * mix(vec3(1.), uHiTint.rgb, wh * uHiTint.w);
      col = col + uLift * (1. - smoothstep(0., .35, l)) * uSplit.x + col * uGain * smoothstep(.3, 1., l) * uSplit.y;
      vec2 d = uv - .5; d.x *= uRes.x / uRes.y;
      col *= 1. - uVig * pow(smoothstep(.35, 1.15, length(d)), uVigPow);
      col = toSRGB(clamp(col, 0., 1.));
      vec4 ov = texture2D(tOver, uv); col = mix(col, ov.rgb, ov.a * uOver);
      col += (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 513.) - .5) * uGrain;
      gl_FragColor = vec4(col * uFade, 1.);
    }`, {
    tScene: { value: null }, tDof: { value: blackTex }, tBloom: { value: blackTex }, tOver: { value: blackTex }, tFx: { value: blackTex }, tStreak: { value: blackTex },
    uExp: { value: 1 }, uBloom: { value: .06 }, uDof: { value: 0 }, uVig: { value: .16 }, uGrain: { value: .022 }, uTime: { value: 0 }, uFade: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) }, uOver: { value: 0 },
    uFx: { value: 0 }, uStreak: { value: 0 }, uStreakTint: { value: new THREE.Color(1, 1, 1) },
    uLift: { value: new THREE.Color(.35, .55, 1) }, uGain: { value: new THREE.Color(1, .7, .4) }, uSplit: { value: new THREE.Vector2(.03, .06) },
    uCon: { value: 1 }, uSat: { value: 1 }, uSlope: { value: new THREE.Vector3(1, 1, 1) }, uPow: { value: new THREE.Vector3(1, 1, 1) },
    uShTint: { value: new THREE.Vector4(1, 1, 1, 0) }, uHiTint: { value: new THREE.Vector4(1, 1, 1, 0) }, uVigPow: { value: 1 },
  });
  P.comp = compMat;
  let sceneRT = null, dofRT = null, down = [], up = [], sk = null;
  P.allocate = (w, h, dpr, offscreen) => {
    [sceneRT, dofRT, ...down, ...up].forEach(r => r && r.dispose());
    if (sk) { sk.all.forEach(r => r.dispose()); sk = null; }
    P.dpr = dpr; P.w = Math.round(w * dpr); P.h = Math.round(h * dpr);
    if (!offscreen) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); }
    const dt = new THREE.DepthTexture(P.w, P.h); dt.type = THREE.UnsignedIntType;
    sceneRT = RT(P.w, P.h, { depthBuffer: true, samples: Q.low ? 0 : 4, depthTexture: dt });
    dofRT = RT(P.w >> 1, P.h >> 1);
    down = []; up = [];
    let bw = P.w >> 1, bh = P.h >> 1;
    for (let i = 0; i < LEVELS; i++) { down.push(RT(bw, bh)); up.push(RT(bw, bh)); bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); }
    P.sceneRT = sceneRT;
  };
  // streak targets, made on first use: half width, quarter height, then the width halves per level
  function streakRTs() {
    if (sk) return sk;
    const n = Q.low ? 5 : 7, h = Math.max(1, P.h >> 2), pre = RT(P.w >> 1, h), dn = [], upl = [];
    let w = P.w >> 1;
    for (let i = 0; i < n; i++) { w = Math.max(1, w >> 1); dn.push(RT(w, h)); upl.push(RT(w, h)); }
    sk = { pre, dn, up: upl, out: RT(P.w >> 1, h), all: [pre, ...dn, ...upl] };
    sk.all.push(sk.out);
    return sk;
  }
  function renderStreak(o) {
    const S = streakRTs();
    streakPre.uniforms.tIn.value = sceneRT.texture; streakPre.uniforms.uT.value.set(1 / P.w, 1 / P.h);
    streakPre.uniforms.uTh.value = o.streakTh ?? 8; streakPre.uniforms.uExp.value = o.exposure;
    pass(streakPre, S.pre);
    let src = S.pre;
    for (const r of S.dn) { streakDown.uniforms.tIn.value = src.texture; streakDown.uniforms.uT.value.set(1 / src.width, 1 / src.height); pass(streakDown, r); src = r; }
    streakUp.uniforms.uStretch.value = o.streakStretch ?? .78;
    // back up: up[i] = mix(dn[i], up[i+1] widened, stretch); the last level starts from itself
    for (let i = S.dn.length - 2; i >= -1; i--) {
      const lo = i === S.dn.length - 2 ? S.dn[S.dn.length - 1] : S.up[i + 1], hi = i >= 0 ? S.dn[i] : S.pre, out = i >= 0 ? S.up[i] : S.out;
      streakUp.uniforms.tIn.value = lo.texture; streakUp.uniforms.tHi.value = hi.texture; streakUp.uniforms.uT.value.set(1 / lo.width, 1 / lo.height);
      pass(streakUp, out);
    }
    return S.out.texture;
  }
  const setV3 = (u, v, d) => { if (v) u.value.set(v[0], v[1], v[2]); else u.value.set(d, d, d); };
  // o: { exposure, bloom, threshold, focus, aperture, vignette, grain, fade, time, near, far,
  //      streak, streakTh, streakStretch, streakTint, look: { con, sat, slope, pow, sh: [r,g,b,amt], hi: [r,g,b,amt], split: [lift,gain], vigPow }, fxK }
  P.render = (scene, camera, o, between, outTarget, outVp) => {
    renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
    if (between) between(sceneRT);
    const fxTex = P.fxPass ? P.fxPass(sceneRT, scene, camera, o) : null;
    const fxK = fxTex ? (o.fxK ?? 1) : 0;
    let useDof = o.aperture > .05 && !Q.low;
    if (useDof) {
      const u = dofMat.uniforms; u.tCol.value = sceneRT.texture; u.tDepth.value = sceneRT.depthTexture; u.uPx.value.set(2 / P.w, 2 / P.h);
      u.uFocus.value = o.focus; u.uAperture.value = o.aperture; u.uNear.value = camera.near; u.uFar.value = camera.far; u.uMax.value = 14; u.uSkyCoc.value = o.skyCoc ?? 14;
      pass(dofMat, dofRT);
    }
    const B = brightMat.uniforms;
    B.tIn.value = sceneRT.texture; B.uT.value.set(1 / P.w, 1 / P.h); B.uTh.value = o.threshold ?? 1.6; B.uExp.value = o.exposure;
    B.tFx.value = fxTex || blackTex; B.uFx.value = fxK;
    pass(brightMat, down[0]);
    for (let i = 1; i < LEVELS; i++) { downMat.uniforms.tIn.value = down[i - 1].texture; downMat.uniforms.uT.value.set(1 / down[i - 1].width, 1 / down[i - 1].height); pass(downMat, down[i]); }
    for (let i = LEVELS - 2; i >= 0; i--) { const src = i === LEVELS - 2 ? down[LEVELS - 1] : up[i + 1]; upMat.uniforms.tIn.value = src.texture; upMat.uniforms.tAdd.value = down[i].texture; upMat.uniforms.uT.value.set(.5 / src.width, .5 / src.height); pass(upMat, up[i]); }
    const streak = o.streak || 0, stTex = streak > 0 ? renderStreak(o) : blackTex;
    const U = compMat.uniforms;
    U.tScene.value = sceneRT.texture; U.tDof.value = useDof ? dofRT.texture : blackTex; U.uDof.value = useDof ? 1 : 0; U.tBloom.value = up[0].texture;
    U.tFx.value = fxTex || blackTex; U.uFx.value = fxK;
    U.tStreak.value = stTex; U.uStreak.value = streak; setV3(U.uStreakTint, o.streakTint, 1);
    U.uExp.value = o.exposure; U.uBloom.value = o.bloom ?? .06; U.uVig.value = o.vignette ?? .16; U.uGrain.value = o.grain ?? .022; U.uTime.value = o.time || 0; U.uFade.value = o.fade ?? 1;
    const lk = o.look || {};
    U.uCon.value = lk.con ?? 1; U.uSat.value = lk.sat ?? 1; setV3(U.uSlope, lk.slope, 1); setV3(U.uPow, lk.pow, 1);
    const sh = lk.sh || [1, 1, 1, 0], hi = lk.hi || [1, 1, 1, 0], sp = lk.split || [.03, .06];
    U.uShTint.value.set(sh[0], sh[1], sh[2], sh[3]); U.uHiTint.value.set(hi[0], hi[1], hi[2], hi[3]); U.uSplit.value.set(sp[0], sp[1]); U.uVigPow.value = lk.vigPow ?? 1;
    U.uRes.value.set(P.w, P.h);
    if (outTarget && outVp) { outTarget.viewport.copy(outVp); outTarget.scissor.copy(outVp); outTarget.scissorTest = true; }
    pass(compMat, outTarget || null);
    if (outTarget && outVp) { outTarget.viewport.set(0, 0, outTarget.width, outTarget.height); outTarget.scissor.set(0, 0, outTarget.width, outTarget.height); outTarget.scissorTest = false; renderer.setRenderTarget(null); }
  };
  return P;
}
