/* =====================================================================
   World: the dry lakebed. Sky from single-scattering atmosphere, moon,
   stars and the Milky Way, mountain ridges, cracked playa. One time-of-day value drives it.
   Units are meters. The pad is at the origin, east is toward -z.
   ===================================================================== */
const DEG = Math.PI / 180;
const GLSL_HASH = `
  float wh1(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  vec2 wh2(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
  float wn1(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(wh1(i), wh1(i + vec2(1, 0)), f.x), mix(wh1(i + vec2(0, 1)), wh1(i + vec2(1, 1)), f.x), f.y); }
  float wfbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * wn1(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
`;
// mountain silhouette, shared by the sky dome and the star field (angles in radians)
const GLSL_RIDGES = `
  float rn1(float x){ float i = floor(x), f = fract(x); f = f * f * (3. - 2. * f); return mix(fract(sin(i * 127.1) * 43758.5453), fract(sin((i + 1.) * 127.1) * 43758.5453), f); }
  float rfbm(float x){ float s = 0., a = .5; for (int i = 0; i < 6; i++) { s += a * rn1(x); x = x * 2.13 + 3.7; a *= .5; } return s; }
  // far range: tall and hazy. near range: low, darker. returns elevation of the skyline.
  float ridgeFar(float az){ float x = az * 9.; float h = rfbm(x) ; h = pow(h, 1.6) * 2.4 + .15; return h * ${(DEG).toFixed(6)} * (.55 + .45 * smoothstep(-1.2, 1.4, sin(az * 1.3 + .6))); }
  float ridgeNear(float az){ float x = az * 16. + 11.; float h = rfbm(x) * .9 + abs(rn1(x * 2.7) - .5) * .25; return (pow(h, 1.4) * 1.05 + .04) * ${(DEG).toFixed(6)} * (.35 + .65 * smoothstep(-1., 1., sin(az * 2.1 + 2.4))); }
`;

function createWorld(renderer, scene, Q) {
  const W = {};
  const NOTUNE = {}, tune = () => (typeof TEST !== 'undefined' && TEST.fx) || NOTUNE;   // live tuning from the test harness
  const fsVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
  const fsGeo = new THREE.BufferGeometry();
  fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const fsMesh = new THREE.Mesh(fsGeo); fsMesh.frustumCulled = false;
  const fsScene = new THREE.Scene(); fsScene.add(fsMesh);
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /* ---------- the galaxy's frame on this sky: its center low in the south, the band climbing east over the zenith ---------- */
  const azEl = (az, el) => new THREE.Vector3(Math.cos(el * DEG) * Math.cos(az * DEG), Math.sin(el * DEG), -Math.cos(el * DEG) * Math.sin(az * DEG));
  // (the core stands in the dark sky beside the rocket in the hero, clear of the work light's glow)
  const GC = azEl(26, 13), GN = new THREE.Vector3().crossVectors(GC, azEl(108, 62)).normalize();
  GC.addScaledVector(GN, -GC.dot(GN)).normalize();
  const GB = new THREE.Vector3().crossVectors(GN, GC).normalize();
  const v3s = v => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;
  const BMAX = .7;
  const GLSL_GAL = `const vec3 GN = ${v3s(GN)}, GC = ${v3s(GC)}, GB = ${v3s(GB)}; const float BMAX = ${BMAX.toFixed(3)};`;

  /* ---------- atmosphere lookups, recomputed when the clock moves ----------
     viewRT: longitude x, latitude with rows packed near the horizon (for the dome, fog, ridges)
     eqRT:   plain equirect for the environment light */
  const mkRT = (w, h) => { const r = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }); r.texture.wrapS = THREE.RepeatWrapping; return r; };
  const viewRT = Q.low ? mkRT(192, 96) : mkRT(320, 192), eqRT = mkRT(128, 64);
  eqRT.texture.mapping = THREE.EquirectangularReflectionMapping;
  const atmoMat = new THREE.ShaderMaterial({
    vertexShader: fsVS, depthTest: false, depthWrite: false,
    uniforms: { uSun: { value: new THREE.Vector3(0, -1, 0) }, uMoon: { value: new THREE.Vector3(0, 1, 0) }, uMoonI: { value: .02 }, uAir: { value: new THREE.Color(.00012, .00017, .00036) }, uGlow: { value: new THREE.Color(0, 0, 0) }, uGround: { value: new THREE.Color(.42, .38, .33) }, uMode: { value: 0 } },
    fragmentShader: `
      uniform vec3 uSun; uniform vec3 uMoon; uniform float uMoonI; uniform vec3 uAir; uniform vec3 uGlow; uniform vec3 uGround; uniform float uMode; varying vec2 vUv;
      #define PI 3.14159265
      const float RP = 6371e3, RA = 6471e3, VIEW_H = 1200.;
      const vec3 KR = vec3(5.802e-6, 13.558e-6, 33.1e-6);
      // clear desert air: a light aerosol load keeps the low sun's glow tight and the sky above it layered
      const float KM = 1.6e-6, KMA = 2.0e-6;
      const vec3 KO = vec3(.650e-6, 1.881e-6, .085e-6) * 1.4;
      vec2 rsi(vec3 r0, vec3 rd, float sr){ float b = dot(rd, r0), c = dot(r0, r0) - sr * sr, d = b * b - c; if (d < 0.) return vec2(1e9, -1e9); d = sqrt(d); return vec2(-b - d, -b + d); }
      vec3 dens(float h){ return vec3(exp(-h / 8000.), exp(-h / 1200.), max(0., 1. - abs(h - 25000.) / 15000.)); }
      vec3 scatter(vec3 rd, vec3 L, float I){
        vec3 r0 = vec3(0., RP + VIEW_H, 0.);
        vec2 pa = rsi(r0, rd, RA); vec2 pg = rsi(r0, rd, RP);
        float tmax = pa.y; if (pg.x > 0.) tmax = min(tmax, pg.x);
        const int N = 30; const int M = 8; const float K = 4.;
        vec3 od = vec3(0.); vec3 sr = vec3(0.), sm = vec3(0.);
        float mu = dot(rd, L), g = .76, gg = g * g;
        float pR = 3. / (16. * PI) * (1. + mu * mu);
        float pM = 3. / (8. * PI) * ((1. - gg) * (1. + mu * mu)) / ((2. + gg) * pow(max(1e-4, 1. + gg - 2. * g * mu), 1.5));
        float t0 = 0.;
        for (int i = 0; i < N; i++) {
          float t1 = tmax * (exp(K * float(i + 1) / float(N)) - 1.) / (exp(K) - 1.), ds = t1 - t0;
          vec3 p = r0 + rd * (t0 + ds * .5); t0 = t1;
          float r = length(p), h = r - RP; vec3 d = dens(h) * ds; od += d;
          // soft planet shadow: sun height against the local horizon of this sample
          float cz = dot(p / r, L), hc = -sqrt(max(0., 1. - RP * RP / (r * r)));
          float vis = smoothstep(hc - .006, hc + .006, cz);
          if (vis <= 0.) continue;
          float lt = rsi(p, L, RA).y, ls = lt / float(M); vec3 lod = vec3(0.);
          for (int j = 0; j < M; j++) { vec3 q = p + L * (ls * (float(j) + .5)); lod += dens(max(0., length(q) - RP)) * ls; }
          vec3 att = exp(-(KR * (od.x + lod.x) + (KM + KMA) * (od.y + lod.y) + KO * (od.z + lod.z))) * vis;
          sr += d.x * att; sm += d.y * att;
        }
        return I * (pR * KR * sr + pM * KM * sm);
      }
      void main(){
        float lon = (vUv.x - .5) * 2. * PI, lat;
        if (uMode > .5) { float v = vUv.y * 2. - 1.; lat = sign(v) * v * v * PI * .5; } else lat = (vUv.y - .5) * PI;
        vec3 rd = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
        vec3 rdu = normalize(vec3(rd.x, max(rd.y, .0012), rd.z));
        vec3 col = scatter(rdu, normalize(uSun), 22.) + scatter(rdu, normalize(uMoon), 22. * uMoonI) + uAir;
        // airglow: the upper air's own faint light, brightest toward the horizon (van Rhijn), then lost in the haze at the very bottom
        float sz = 1. - rdu.y * rdu.y;
        col += uGlow * (1. / sqrt(1. - .9723 * sz)) * (.35 + .65 * smoothstep(.0, .05, rdu.y));
        // below the horizon: the ground, lit by sky, sun and moon (feeds the environment light)
        if (rd.y < 0.) { float su = clamp(uSun.y, 0., 1.);
          vec3 lit = uGround * (col * 2.4 + vec3(1., .82, .6) * su * 3.2 * .3 + uMoonI * 1.2 * clamp(uMoon.y, 0., 1.));
          col = mix(col, lit, smoothstep(0., -.06, rd.y)); }
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  W.skyTex = viewRT.texture;
  const GLSL_SKYUV = `vec2 skyUV(vec3 d){ float lat = asin(clamp(d.y, -1., 1.)); return vec2(atan(d.z, d.x) * .15915494 + .5, .5 + .5 * sign(lat) * sqrt(abs(lat) / 1.5707963)); }`;

  /* ---------- the Milky Way, baked once in galactic coordinates (l across, b up) ----------
     Brighter and thicker toward the center, mottled with star clouds, cut by the dark rift and dust filaments. */
  const mwRT = new THREE.WebGLRenderTarget(Q.low ? 1024 : 2048, Q.low ? 256 : 512, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  mwRT.texture.wrapS = THREE.RepeatWrapping;
  {
    const mat = new THREE.ShaderMaterial({ vertexShader: fsVS, depthTest: false, depthWrite: false, fragmentShader: `varying vec2 vUv;
      ${GLSL_HASH}
      ${GLSL_GAL}
      void main(){
        float l = (vUv.x - .5) * 6.2831853, b = (vUv.y - .5) * 2. * BMAX, al = abs(l);
        float core = exp(-al * al / 1.2);
        float wid = mix(.05, .11, exp(-al * al / .3));
        float disc = exp(-b * b / (wid * wid)) + .08 * exp(-b * b / (wid * wid * 5.));
        float bulge = exp(-(l * l / .03 + b * b / .014));
        // star clouds: warped noise, stretched along the plane, fine enough to read as crowded stars
        vec2 q = vec2(l * 12., b * 26.);
        vec2 wq = q + 1.6 * vec2(wfbm(q * .5 + 3.1), wfbm(q * .5 + 8.3)) - .8;
        float cl = wfbm(wq * 1.3), cl2 = wfbm(wq * 4.2 + 5.);
        float clouds = max(0., .2 + 1.25 * cl + .7 * (cl2 - .5));
        // dust: the rift just north of the plane over the inner galaxy, and thin dark filaments through the band
        float rw = .012 + .01 * cl;
        float rift = exp(-pow((b - .022 - .02 * sin(l * 2.3 + .5)) / rw, 2.)) * smoothstep(1.9, .25, al);
        float fil = smoothstep(.55, .72, wfbm(wq * 2.8 + 11.)) * exp(-b * b / (wid * wid * 1.8));
        float dust = clamp(rift * (.6 + .4 * smoothstep(.3, .7, cl2)) + fil * .7, 0., .96);
        float I = (disc * (.25 + .75 * core) * clouds + bulge * 1.2 * (.7 + .6 * cl)) * (1. - dust);
        vec3 col = mix(vec3(.7, .78, 1.), vec3(1., .88, .72), clamp(.1 + .75 * core * (1. - .4 * dust), 0., 1.));
        col = mix(col, vec3(1., .7, .5), dust * .25);
        gl_FragColor = vec4(col * I * .42, I);
      }` });
    fsMesh.material = mat; renderer.setRenderTarget(mwRT); renderer.render(fsScene, fsCam); renderer.setRenderTarget(null);
    mat.dispose();
  }

  /* ---------- sky dome: lookup + mountains + discs + milky way ---------- */
  const domeU = {
    tSky: { value: viewRT.texture }, tMW: { value: mwRT.texture }, uSun: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() }, uSunI: { value: 0 }, uMoonI: { value: 0 },
    uStars: { value: 1 }, uMW: { value: .0016 }, uSunCol: { value: new THREE.Color() }, uMtnLit: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
  };
  const domeMat = new THREE.ShaderMaterial({
    uniforms: domeU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform sampler2D tSky; uniform sampler2D tMW; uniform vec3 uSun; uniform vec3 uMoon; uniform float uSunI; uniform float uMoonI; uniform float uStars; uniform float uMW;
      uniform vec3 uSunCol; uniform vec3 uMtnLit; uniform vec3 uHaze; varying vec3 vDir;
      ${GLSL_HASH}
      ${GLSL_RIDGES}
      ${GLSL_SKYUV}
      ${GLSL_GAL}
      vec2 eq(vec3 d){ return skyUV(d); }
      vec3 milkyWay(vec3 d){
        float b = asin(clamp(dot(d, GN), -1., 1.));
        if (abs(b) > BMAX) return vec3(0.);
        float l = atan(dot(d, GB), dot(d, GC));
        return texture2D(tMW, vec2(l * .15915494 + .5, b / (2. * BMAX) + .5)).rgb;
      }
      void main(){
        vec3 d = normalize(vDir);
        float az = atan(d.z, d.x), el = asin(clamp(d.y, -1., 1.));
        vec3 sky = texture2D(tSky, eq(d)).rgb;
        // milky way, only when the sky is dark; dimmed and reddened through the long air path near the horizon
        if (uStars > .001) {
          float X = 1. / (max(d.y, 0.) + .04);
          sky += milkyWay(d) * uMW * uStars * exp(-.2 * X) * mix(vec3(1., .8, .62), vec3(1.), smoothstep(.03, .3, d.y));
        }
        // moon and sun discs; the sun with a darkened limb and the tight glow of forward scattering around it
        float md = dot(d, normalize(uMoon)); sky += vec3(1., .97, .9) * smoothstep(.999984, .999991, md) * uMoonI * 1.6 + vec3(.6, .65, .8) * pow(max(md, 0.), 900.) * uMoonI * .004;
        vec3 sdir = normalize(uSun); float sr = length(d - sdir), sx = sr / .00467;
        float limb = 1. - .55 * (1. - sqrt(max(0., 1. - sx * sx)));
        sky += uSunCol * uSunI * ((1. - smoothstep(.94, 1.06, sx)) * limb * 60. + 1.2 * exp(-sr * 300.) + .16 * exp(-sr * 45.));
        // ridges: far range hazier, near range darker; low sun warms the faces toward it
        vec3 hz = texture2D(tSky, eq(normalize(vec3(d.x, .004, d.z)))).rgb;
        float faceSun = clamp(dot(normalize(vec3(d.x, 0., d.z)), -normalize(vec3(uSun.x, 0., uSun.z))) * .5 + .5, 0., 1.);
        float rF = ridgeFar(az), rN = ridgeNear(az);
        float aaF = fwidth(el) * 1.5;
        vec3 farC = mix(hz * .62, uMtnLit, .35 * faceSun) ;
        vec3 nearC = mix(hz * .3, uMtnLit * .55, .45 * faceSun);
        float mF = smoothstep(rF + aaF, rF - aaF, el), mN = smoothstep(rN + aaF, rN - aaF, el);
        // texture on the faces
        float tex = wfbm(vec2(az * 140., el * 600.));
        farC *= .9 + .2 * tex; nearC *= .82 + .3 * tex;
        vec3 col = mix(sky, farC, mF * step(-.02, el));
        col = mix(col, nearC, mN * step(-.02, el));
        // below the horizon (past the end of the playa mesh): haze
        col = mix(col, hz, smoothstep(.0, -.004, el));
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), domeMat);
  dome.scale.setScalar(9000); dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome);

  /* ---------- stars: a magnitude-true field, crowded toward the galactic plane, hidden behind the ridges ---------- */
  {
    // field stars, plus faint stars of the band itself: their light follows the baked Milky Way, so the band reads as stars and its dust as gaps
    const nF = Q.low ? 2600 : 6400, nB = Q.low ? 6000 : 16000, n = nF + nB;
    const pos = new Float32Array(n * 3), flux = new Float32Array(n), col = new Float32Array(n * 3), sd = new Float32Array(n), band = new Float32Array(n);
    const r = rng(77), v = new THREE.Vector3();
    const gauss = () => (r() + r() + r() + r() - 2) * 1.732;
    const PAL = [[.7, .8, 1], [.86, .9, 1], [1, .97, .92], [1, .9, .76], [1, .78, .56]];
    for (let i = 0; i < n;) {
      const inBand = i >= nF;
      if (inBand || r() < .3) {
        const l = gauss() * (inBand ? .9 : 1.05), b = gauss() * (inBand ? .045 : .075) * (1 + .9 * Math.exp(-l * l / .3));
        v.copy(GC).multiplyScalar(Math.cos(b) * Math.cos(l)).addScaledVector(GB, Math.cos(b) * Math.sin(l)).addScaledVector(GN, Math.sin(b));
      } else { const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); v.set(Math.cos(a) * s, u, Math.sin(a) * s); }
      if (v.y < -.03) continue;
      pos[i * 3] = v.x * 8000; pos[i * 3 + 1] = v.y * 8000; pos[i * 3 + 2] = v.z * 8000;
      // counts grow about 2.75x per magnitude down to about 7; flux is relative to the faintest
      const m = inBand ? 7.6 - 1.4 * r() * r() : 7 + Math.log10(Math.max(1e-7, r())) / .44;
      flux[i] = Math.pow(10, -.4 * (m - 7)); band[i] = inBand ? 1 : 0;
      const t = r(), c = PAL[t < .1 ? 0 : t < .3 ? 1 : t < .68 ? 2 : t < .9 ? 3 : 4];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; sd[i] = r();
      i++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aFlux', new THREE.BufferAttribute(flux, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1)); g.setAttribute('aBand', new THREE.BufferAttribute(band, 1));
    const starMat = new THREE.ShaderMaterial({
      uniforms: { uVis: { value: 1 }, uTime: { value: 0 }, uPx: { value: 1 }, uK: { value: .0075 }, uBandK: { value: 1 }, tMW: { value: mwRT.texture } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute float aFlux; attribute vec3 aCol; attribute float aSeed; attribute float aBand; uniform float uVis; uniform float uTime; uniform float uPx; uniform float uK; uniform float uBandK; uniform sampler2D tMW; varying vec3 vC;
        ${GLSL_RIDGES}
        ${GLSL_GAL}
        void main(){ vec3 d = normalize(position); float az = atan(d.z, d.x), el = asin(d.y);
          float bandK = 1.;
          if (aBand > .5) { float gb = asin(clamp(dot(d, GN), -1., 1.)), gl = atan(dot(d, GB), dot(d, GC));
            bandK = uBandK * texture2D(tMW, vec2(gl * .15915494 + .5, gb / (2. * BMAX) + .5)).a * 1.6; }
          float hide = step(el, max(ridgeFar(az), ridgeNear(az)) + .002);
          // extinction through the air mass, reddening near the horizon
          float X = 1. / (max(d.y, 0.) + .035);
          float ext = exp(-.22 * X) * smoothstep(-.01, .03, d.y);
          // scintillation: strong low in the sky, almost none overhead
          float sc = .06 + .5 * (1. - smoothstep(.05, .6, d.y));
          float tw = 1. + sc * (.6 * sin(uTime * (7. + aSeed * 9.) + aSeed * 80.) + .4 * sin(uTime * (13. + aSeed * 7.) + aSeed * 31.));
          // a camera compresses the range: bright stars are also a little larger
          float f = pow(aFlux, .62), sz = 1.15 + .32 * log(1. + f);
          vC = aCol * mix(vec3(1., .78, .56), vec3(1.), smoothstep(.02, .3, d.y)) * f * ext * tw * uVis * (1. - hide) * uK * bandK / (sz * sz);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww;
          if (dot(vC, vec3(1.)) < 1e-6) gl_Position = vec4(2., 2., 2., 1.);
          gl_PointSize = sz * uPx * 1.6; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 q = gl_PointCoord * 2. - 1.; float r2 = dot(q, q); float a = exp(-r2 * 5.) * 3.1; if (r2 > 1.) discard; gl_FragColor = vec4(vC * a, 0.); }`,
    });
    W.stars = new THREE.Points(g, starMat); W.stars.frustumCulled = false; W.stars.renderOrder = -9; scene.add(W.stars);
    W.starMat = starMat;
  }

  /* ---------- playa: cracked mud, far-field detail for the climb, its own aerial perspective ---------- */
  const playaU = { tSky: { value: viewRT.texture }, uFogD: { value: .00042 }, uFogH: { value: 130 }, uLow: { value: Q.low ? 1 : 0 } };
  const playaMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(.62, .57, .5), roughness: .96, metalness: 0 });
  playaMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, playaU);
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vWp; uniform sampler2D tSky; uniform float uFogD; uniform float uFogH; uniform float uLow;
      ${GLSL_HASH}
      // edge distance of a Voronoi cell (IQ), plus the cell id
      vec2 vEdge(vec2 x){ vec2 n = floor(x), f = fract(x), mg, mr; float md = 8.;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)), o = wh2(n + g) * .86 + .07, r = g + o - f; float d = dot(r, r); if (d < md) { md = d; mr = r; mg = g; } }
        md = 8.;
        for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) { vec2 g = mg + vec2(float(i), float(j)), o = wh2(n + g) * .86 + .07, r = g + o - f; if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(.5 * (mr + r), normalize(r - mr))); }
        return vec2(md, wh1(n + mg)); }
      // cheaper: half the gap between the nearest two cell centers (close to the edge distance near an edge)
      float vGap(vec2 x){ vec2 n = floor(x), f = fract(x); float f1 = 8., f2 = 8.;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); float d = length(g + wh2(n + g + 31.) * .8 + .1 - f); if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d; }
        return (f2 - f1) * .5; }
      // a line of half width w at distance x, filtered over a footprint f (fades to its average when it is thinner than a pixel)
      float band(float x, float w, float f){ f = max(f, 1e-5); return clamp((w - abs(x)) / (2. * f) + .5, 0., 1.) * min(1., w / f); }
      // wheel ruts along an arc of a big circle: two wheels 1.6 m apart, a couple of passes, patchy where the crust was hard
      float ruts(float dr, float f, float ang, float a0, float a1, float arcR, float passes){
        float on = smoothstep(a0, a0 + .015, ang) * smoothstep(a1, a1 - .015, ang);
        float x = dr + (wn1(vec2(ang * arcR * .013, 1.3)) - .5) * .9;
        float m = max(band(x - .8, .12, f), band(x + .8, .12, f));
        m = max(m, passes * .65 * max(band(x - .52, .1, f), band(x + 1.08, .1, f)));
        return m * on * (.45 + .55 * wn1(vec2(ang * arcR * .04, 7.)));
      }
      ${GLSL_SKYUV}
      vec2 eqUV(vec3 d){ return skyUV(d); }
      float plH; vec3 plTint; float plRough;
      void playaSurface(){
        vec2 p = vWp.xz;
        float big = wfbm(p * .045), mid = wfbm(p * .6 + 3.1);
        // far field: broad albedo drift, damp low patches (darker, smooth, never near the site), giant desiccation polygons
        float macro = wfbm(p * .0014 + 11.3), meso = wfbm(p * .0085 + 2.7), pch = wfbm(p * .021 + 5.3);
        // seen from the air (camera well above the ground and a pixel covering more than a few cm), the ground near
        // the pad gets the same far-field character; at eye level nothing changes
        float fwP = length(fwidth(p)), lp = length(p);
        float altK = smoothstep(6., 30., cameraPosition.y) * smoothstep(.04, .25, fwP);
        float dampN = wfbm(p * .0052 + vec2(3.7, 8.1)) + (meso - .5) * .25, farP = max(smoothstep(25., 90., lp), altK);
        float nearOK = max(smoothstep(55., 140., lp), altK * smoothstep(16., 40., lp));
        float damp = smoothstep(.51, .58, dampN) * nearOK;
        // salt left where the damp ground dried back: a pale rim around each damp patch
        float rim = smoothstep(.47, .52, dampN) * (1. - smoothstep(.52, .56, dampN)) * nearOK;
        vec2 gq = p / 33. + (vec2(wn1(p * .013), wn1(p * .013 + 5.2)) - .5) * .8;
        float ge = vGap(gq), gfw = length(fwidth(gq));
        float seam = band(ge, .008, gfw) * smoothstep(.2, .42, macro + (meso - .5) * .6) * (1. - damp);
        // tire tracks: the team's way in, about 40 m east of the pad, and an older one further out
        vec2 d1 = p - vec2(0., -1440.), d2 = p - vec2(700., -1300.), d3 = p - vec2(-2600., -420.);
        float r1 = length(d1), r2 = length(d2), r3 = length(d3);
        float dr1 = r1 - 1400., dr2 = r2 - 1250., dr3 = r3 - 2470.;
        float f1 = fwidth(dr1), f2 = fwidth(dr2), f3 = fwidth(dr3);
        float trk = ruts(dr1, f1, atan(d1.y, d1.x), 1.12, 2.3, 1400., 1.);
        trk = max(trk, .7 * ruts(dr2, f2, atan(d2.y, d2.x), 1.55, 2.62, 1250., 0.));
        trk = max(trk, .55 * ruts(dr3, f3, atan(d3.y, d3.x), -.42, .35, 2470., 0.));
        vec2 w = vec2(wfbm(p * .9 + 1.7), wfbm(p * .9 + 9.2)) - .5;          // warp so cells are irregular
        vec2 a = vEdge(p / .62 + w * .9);
        float fw = length(fwidth(p / .62));
        float kc = smoothstep(.2, .46, big + (mid - .5) * .4) * (1. - damp);     // smooth and damp patches have no cracks
        float kRes = 1. - smoothstep(.05, .3, fw);                                  // cracks still resolved at this distance
        float k = kRes * kc;
        float crack = (1. - smoothstep(.006, .016 + fw * .7, a.x)) * k * (1. - .8 * trk);
        float curl = smoothstep(.0, .16, a.x);
        float fine = 0.;
        if (uLow < .5) { vec2 b = vEdge(p / .17 + 7.3 + w * 2.); float fw2 = length(fwidth(p / .17)); fine = (1. - smoothstep(.006, .02 + fw2 * .7, b.x)) * (1. - smoothstep(.04, .25, fw2)) * .45 * k * (1. - trk); }
        // each mud plate dried a little differently: the mosaic still reads after its cracks shrink below a pixel
        float kCell = 1. - smoothstep(.15, .5, fw);
        plTint = vec3(1.) * (.93 + mix(.06, .15, farP) * (a.y - .5) * kCell * kc + mix(.16, .26, altK) * (big - .5) + .07 * (mid - .5) * kRes);
        plTint *= (1. - crack * .5 - fine * .2) * (.97 + .06 * wn1(p * 38.));
        // unresolved cracks still darken the cracked ground on average (the cracks are shadowed), so from the air
        // the cracked and the smooth crust read as a patchwork
        plTint *= 1. - mix(.05, .1, farP) * kc * (1. - kRes);
        plTint *= mix(vec3(1.), vec3(.95, .97, 1.03), smoothstep(.45, .7, big));   // alkali patches
        // the far field: albedo drifts by a few tens of percent over tens to hundreds of meters (what reads from the air).
        // The pad's own patch keeps its level at eye level.
        float mA = clamp((macro - .47) * 2.6, -1., 1.), mB = clamp((meso - .47) * 2.6, -1., 1.), mC = clamp((pch - .47) * 2.6, -1., 1.);
        float mD = clamp((wfbm(p * .075 + 1.9) - .47) * 2.6, -1., 1.);
        plTint *= 1. + farP * (.2 * mA + .16 * mB + .14 * mC + .09 * mD);
        // crusts: cracked ground is a little darker on average (the cracks are shadowed), smooth patches paler
        plTint *= 1. + farP * mix(.05, -.05, kc);
        plTint *= mix(vec3(1.), vec3(1.04, 1.03, 1.), max(0., mB) * farP);          // drier, paler crust
        plTint = mix(plTint, plTint * vec3(.5, .51, .56), damp);
        plTint *= 1. + .12 * rim;
        plTint *= (1. - .3 * seam) * (1. - .4 * trk);
        plRough = mix(1., .72, damp) * (1. - .06 * trk);
        plH = (curl * .004 - crack * .01 - fine * .003) * k + (mid - .5) * .006 * (1. - .7 * damp) - seam * .012 - trk * .006;
      }
      ` + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n playaSurface(); diffuseColor.rgb *= plTint;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor *= plRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float hx = dFdx(plH), hy = dFdy(plH);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
          vec3 grad = sign(det) * (hx * r1 + hy * r2); normal = normalize(abs(det) * normal - grad); }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        { vec3 v = vWp - cameraPosition; float dist = length(v); vec3 dir = v / dist;
          vec3 hz = texture2D(tSky, eqUV(normalize(vec3(dir.x, .006, dir.z)))).rgb;
          // haze thins with height: integrate an exponential layer from the eye down to the ground
          float hc = max(cameraPosition.y, .5);
          float od = uFogD * dist * (uFogH / hc) * (1. - exp(-hc / uFogH));
          float f = 1. - exp(-od); f = mix(f, f * f * (3. - 2. * f), .5);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, hz, f * .99); }`);
  };
  playaMat.customProgramCacheKey = () => 'playa2' + (Q.low ? 'L' : 'H');
  // large enough that its edge sits past the far plane, deep in the haze. A polar grid, dense at the pad and
  // geometric outward: one 30 km quad loses interpolation precision where it crosses the near plane
  // (half the ground turned to flat haze along its diagonal)
  const playaGeo = (() => {
    const NR = Q.low ? 40 : 56, NA = Q.low ? 48 : 72, R0 = .5, R1 = 15000, pos = [0, 0, 0], nrm = [0, 1, 0], idx = [];
    for (let i = 0; i < NR; i++) {
      const r = R0 * Math.pow(R1 / R0, i / (NR - 1));
      for (let j = 0; j < NA; j++) { const a = j / NA * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); nrm.push(0, 1, 0); }
    }
    for (let j = 0; j < NA; j++) idx.push(0, 1 + (j + 1) % NA, 1 + j);
    for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NA; j++) {
      const a = 1 + i * NA + j, b = 1 + i * NA + (j + 1) % NA, c = a + NA, d = b + NA;
      idx.push(a, b, d, a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
    return g;
  })();
  const playa = new THREE.Mesh(playaGeo, playaMat);
  playa.receiveShadow = true; playa.frustumCulled = false; scene.add(playa);
  W.playa = playa; W.playaMat = playaMat;

  /* ---------- lights ---------- */
  const moon = new THREE.DirectionalLight(0xa6bfff, .3);
  const sun = new THREE.DirectionalLight(0xffffff, 0);
  for (const L of [moon, sun]) {
    L.castShadow = true; L.shadow.mapSize.set(Q.low ? 1024 : 2048, Q.low ? 1024 : 2048);
    const c = L.shadow.camera; c.left = -9; c.right = 9; c.top = 9; c.bottom = -9; c.near = 1; c.far = 80;
    L.shadow.bias = -.0004; L.shadow.normalBias = .02; L.shadow.radius = 3;
    scene.add(L, L.target);
  }
  W.moon = moon; W.sun = sun;

  /* ---------- time of day ---------- */
  // tod 0 = deep night, 1 = morning. Sun climbs from -17 to +7 degrees, rising in the east-north-east (-z, slightly -x).
  const SUN_AZ = -112 * DEG, MOON_DIR = new THREE.Vector3().setFromSphericalCoords(1, (90 - 31) * DEG, 38 * DEG);
  const sunElev = tod => lerp(-17, 7, tod) * DEG;
  // exposure in stops: a dark night held for the practicals, opening through blue hour, normal by sunrise
  const EVK = [[-17, 3.0], [-9, 3.05], [-5, 2.8], [-2, 2.0], [0, 1.25], [2, .42], [5, -.14], [8, -.3]];
  const evAt = el => { if (el <= EVK[0][0]) return EVK[0][1]; for (let i = 1; i < EVK.length; i++) if (el <= EVK[i][0]) { const [a, va] = EVK[i - 1], [b, vb] = EVK[i]; return lerp(va, vb, sstep(0, 1, (el - a) / (b - a))); } return EVK[EVK.length - 1][1]; };
  const tmpC = new THREE.Color();
  let lastKey = -1, lastEnv = -1, envAt = 0, lastTune = null;
  W.state = { sunDir: new THREE.Vector3(), moonDir: MOON_DIR.clone(), elev: 0, night: 1, exposure: 1 };
  W.setTime = (tod, now) => {
    const e = sunElev(tod), S = W.state, T = tune();
    if (T !== lastTune) { lastTune = T; lastKey = -1; lastEnv = -1e9; envAt = -1e9; }
    S.sunDir.set(Math.cos(e) * Math.cos(SUN_AZ), Math.sin(e), Math.cos(e) * Math.sin(SUN_AZ));
    S.elev = e / DEG;
    S.night = 1 - sstep(-13, -3, S.elev);
    // a thin moon: enough to model the ground and the rocket, dark enough for the Milky Way
    const moonI = (T.moonI ?? .00052) * (1 + .2 * S.night);
    const key = Math.round(tod * 900);
    if (key !== lastKey) {
      lastKey = key;
      atmoMat.uniforms.uSun.value.copy(S.sunDir); atmoMat.uniforms.uMoon.value.copy(MOON_DIR); atmoMat.uniforms.uMoonI.value = moonI;
      atmoMat.uniforms.uGlow.value.setRGB(.55, .74, .6).multiplyScalar((T.glow ?? .0003) * (.25 + .75 * S.night));
      fsMesh.material = atmoMat;
      atmoMat.uniforms.uMode.value = 1; renderer.setRenderTarget(viewRT); renderer.render(fsScene, fsCam);
      atmoMat.uniforms.uMode.value = 0; renderer.setRenderTarget(eqRT); renderer.render(fsScene, fsCam); renderer.setRenderTarget(null);
      // environment light, throttled
      if (Math.abs(key - lastEnv) >= 6 || !envRT) {
        if (now - envAt > 120 || !envRT) { envRT = pmrem.fromEquirectangular(eqRT.texture, envRT); scene.environment = envRT.texture; lastEnv = key; envAt = now; }
      }
    }
    // sun light: color from transmittance through the air mass, gone below the horizon
    const am = 1 / (Math.sin(Math.max(e, 0)) + .045);
    const tr = [Math.exp(-5.8e-6 * 8000 * am * .9), Math.exp(-13.5e-6 * 8000 * am * .9), Math.exp(-33.1e-6 * 8000 * am * .9)];
    const up = sstep(-1.2, 2.5, S.elev);
    sun.color.setRGB(tr[0], tr[1], tr[2]); sun.intensity = 3.2 * up;
    sun.position.copy(S.sunDir).multiplyScalar(40); sun.target.position.set(0, 0, 0);
    // both lights always cast: a change in the number of shadow casters recompiles every material (a freeze
    // on arrival at a new time of day), so an idle light keeps its map and simply stops updating it
    sun.shadow.autoUpdate = up > .01;
    domeU.uSunCol.value.setRGB(tr[0], tr[1], tr[2]); domeU.uSunI.value = up;
    domeU.uSun.value.copy(S.sunDir); domeU.uMoon.value.copy(MOON_DIR); domeU.uMoonI.value = 1 - sstep(-6, 2, S.elev) * .6;
    // stars and the Milky Way come out as the sky darkens past nautical twilight
    const dark = 1 - sstep(-14, -6, S.elev);
    domeU.uStars.value = dark; domeU.uMW.value = T.mw ?? .0075; W.starMat.uniforms.uBandK.value = T.band ?? 6;
    W.starMat.uniforms.uVis.value = 1 - sstep(-11, -3, S.elev); W.starMat.uniforms.uK.value = T.starK ?? .028;
    // the moon sets the night key; it fades as the sky brightens
    moon.intensity = (T.moonL ?? .054) * (1 - sstep(-6, 3, S.elev)); moon.position.copy(MOON_DIR).multiplyScalar(40); moon.shadow.autoUpdate = moon.intensity > .002 && !(up > .01 && sun.intensity > .4);
    // light on the ridge faces toward the sun at dawn
    tmpC.setRGB(tr[0], tr[1] * .8, tr[2] * .7).multiplyScalar(.004 + .05 * sstep(-8, 2, S.elev));
    domeU.uMtnLit.value.copy(tmpC);
    // haze color for the far ground sliver
    domeU.uHaze.value.setRGB(.004, .005, .008).lerp(tmpC.setRGB(.25, .2, .18), sstep(-6, 6, S.elev));
    S.exposure = Math.pow(2, evAt(S.elev) + (T.evW ?? 0) * S.night);
  };
  // after an offscreen shoot at another time of day: the next setTime rebuilds the sky and the environment at once
  W.invalidate = () => { lastKey = -1; lastEnv = -1e9; envAt = -1e9; };
  W.update = (camera, time, dprPx) => {
    dome.position.copy(camera.position); W.stars.position.copy(camera.position);
    W.starMat.uniforms.uTime.value = time; W.starMat.uniforms.uPx.value = dprPx;
  };
  W.dispose = () => { pmrem.dispose(); viewRT.dispose(); eqRT.dispose(); mwRT.dispose(); envRT && envRT.dispose(); };
  return W;
}
