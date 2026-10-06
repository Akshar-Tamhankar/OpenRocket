/* knobs the stage reads: light that reaches the smoke, flame glow, light intensities, particle counts
   (fireLight and tailLight also light the ground; fireToSmoke and tailToSmoke scale the share that reaches the smoke) */
const SMOKE_TUNE = { fireToSmoke: .24, fireGlow: .9, tailToSmoke: .25, tailGlow: .35, workToSmoke: 1, fireLight: .8, tailLight: 9, fireCount: 170, fireCountLow: 110, trailCount: 340, trailCountLow: 190,
  // read only in this file: smoke albedo, cloud density (static fire, trail), sky light, how hard the cloud shadows itself,
  // glow of fresh exhaust, size of the flame as a light (m), how much each puff shows its own relief
  albedo: .92, fireDens: 1, trailDens: 1, sky: 1.35, kappa: .45, glow: .12, fireR: .3, self: .6 };

/* =====================================================================
   Smoke. KNSB exhaust is mostly potassium carbonate: dense, white, lit by
   whatever is near it. Each particle is a puff sprite baked once at load
   from a small density volume and lit from six directions, so a puff has
   a lit side, a shadow side and a bright rim when the light is behind it.
   Each frame the puffs are also splatted into a coarse density grid, light
   from the flame, the work light, the moon or sun and the open sky is
   carried through it, and the result goes to a small 3D texture that every
   pixel of every puff reads, so the cloud shadows itself smoothly.
   State is a pure function of time: a scrubbed burn or a scrolled flight
   always looks the same at the same t.
   ===================================================================== */

// six-way lit puffs: A = light from +x, +y, +z (front), optical depth; B = light from -x, -y, -z (back), hot core
function* bakePuffs(N, cols, rows, seed, outA, outB, TAU, info) {
  const V = cols * rows, W = N * cols, NN = N * N, N3 = NN * N;
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const crd = new Float32Array(N); for (let i = 0; i < N; i++) crd[i] = (i + .5) / N * 2 - 1;
  // one tileable noise volume, shared by all variants at different offsets
  const noise = new Float32Array(N3), lat = new Float32Array(16 * 16 * 16);
  for (const [P, amp] of [[4, .5], [8, .3], [16, .2]]) {
    for (let i = 0; i < P * P * P; i++) lat[i] = rnd();
    for (let z = 0; z < N; z++) { const gz = z / N * P, zi = gz | 0; let fz = gz - zi; fz = fz * fz * (3 - 2 * fz); const z0 = zi * P * P, z1 = ((zi + 1) % P) * P * P;
      for (let y = 0; y < N; y++) { const gy = y / N * P, yi = gy | 0; let fy = gy - yi; fy = fy * fy * (3 - 2 * fy); const y0 = yi * P, y1 = ((yi + 1) % P) * P;
        let o = y * N + z * NN;
        for (let x = 0; x < N; x++, o++) { const gx = x / N * P, x0 = gx | 0; let fx = gx - x0; fx = fx * fx * (3 - 2 * fx); const x1 = (x0 + 1) % P;
          const a = lat[x0 + y0 + z0], b = lat[x1 + y0 + z0], c = lat[x0 + y1 + z0], d = lat[x1 + y1 + z0];
          const e = lat[x0 + y0 + z1], f = lat[x1 + y0 + z1], g = lat[x0 + y1 + z1], h = lat[x1 + y1 + z1];
          const ab = a + (b - a) * fx, cd = c + (d - c) * fx, ef = e + (f - e) * fx, gh = g + (h - g) * fx;
          const p = ab + (cd - ab) * fy, q = ef + (gh - ef) * fy;
          noise[o] += (p + (q - p) * fz) * amp; } } }
  }
  yield;
  const wrap = new Int32Array(N * 3); for (let i = 0; i < N * 3; i++) wrap[i] = i % N;
  const rho = new Float32Array(N3), al = new Float32Array(N3), T = new Float32Array(N3), acc = new Float32Array(NN * 8), fill = new Float32Array(NN * 8);
  const SIG = 6, dz = 2 / N, KL = .9;
  const LUTN = 2048, LUTM = 24, lut = new Float32Array(LUTN + 2), LS = LUTN / LUTM;
  // light that gets through, with a little extra for multiple scattering in a white cloud
  for (let i = 0; i <= LUTN + 1; i++) { const t = i / LS; lut[i] = (Math.exp(-t) + .3 * Math.exp(-.3 * t) + .12 * Math.exp(-.1 * t)) / 1.42; }
  let tauSum = 0;
  for (let v = 0; v < V; v++) {
    rho.fill(0);
    const splat = (cx, cy, cz, R, w) => {
      const iR2 = 1 / (R * R);
      const xl = Math.max(0, Math.floor((cx - R + 1) / 2 * N)), xh = Math.min(N - 1, Math.ceil((cx + R + 1) / 2 * N));
      const yl = Math.max(0, Math.floor((cy - R + 1) / 2 * N)), yh = Math.min(N - 1, Math.ceil((cy + R + 1) / 2 * N));
      const zl = Math.max(0, Math.floor((cz - R + 1) / 2 * N)), zh = Math.min(N - 1, Math.ceil((cz + R + 1) / 2 * N));
      for (let z = zl; z <= zh; z++) { const pz = crd[z] - cz; for (let y = yl; y <= yh; y++) { const py = crd[y] - cy, r2 = pz * pz + py * py; let i = xl + y * N + z * NN;
        for (let x = xl; x <= xh; x++, i++) { const px = crd[x] - cx, d2 = (px * px + r2) * iR2; if (d2 < 1) { const f = 1 - d2; rho[i] += f * f * w; } } } }
    };
    const ru = () => { let x, y, z, l; do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < .01); return [x, y, z, Math.sqrt(l)]; };
    // a few big lobes for the body, smaller billows on its surface
    const KB = 5 + (rnd() * 4 | 0);
    for (let k = 0; k < KB; k++) { const [x, y, z] = ru(); splat(x * .3, y * .28, z * .3, .38 + .16 * rnd(), .9); }
    const KS = 18 + (rnd() * 10 | 0);
    for (let k = 0; k < KS; k++) { const [x, y, z, l] = ru(); const rr = .48 + .14 * rnd(); splat(x / l * rr, y / l * rr * .92, z / l * rr, .14 + .16 * rnd(), .7 + .4 * rnd()); }
    // warp the lobes with low-frequency noise so they lose the sphere shape, then erode the edge
    const ox = rnd() * N | 0, oy = rnd() * N | 0, oz = rnd() * N | 0, WA = .2 * N;
    T.set(rho);
    for (let z = 0; z < N; z++) { const pz = crd[z]; for (let y = 0; y < N; y++) { const py = crd[y], r2 = pz * pz + py * py; let i = y * N + z * NN;
      for (let x = 0; x < N; x++, i++) {
        const wx = noise[wrap[x + ox] + wrap[y + oy] * N + wrap[z + oz] * NN] - .5, wy = noise[wrap[x + oy] + wrap[y + oz] * N + wrap[z + ox] * NN] - .5, wz = noise[wrap[x + oz] + wrap[y + ox] * N + wrap[z + oy] * NN] - .5;
        let sx = x + wx * WA, sy = y + wy * WA, sz = z + wz * WA;
        sx = sx < 0 ? 0 : sx > N - 1.001 ? N - 1.001 : sx; sy = sy < 0 ? 0 : sy > N - 1.001 ? N - 1.001 : sy; sz = sz < 0 ? 0 : sz > N - 1.001 ? N - 1.001 : sz;
        const x0 = sx | 0, y0 = sy | 0, z0 = sz | 0, fx = sx - x0, fy = sy - y0, fz = sz - z0, j = x0 + y0 * N + z0 * NN;
        const c00 = T[j] + (T[j + 1] - T[j]) * fx, c10 = T[j + N] + (T[j + N + 1] - T[j + N]) * fx, c01 = T[j + NN] + (T[j + NN + 1] - T[j + NN]) * fx, c11 = T[j + NN + N] + (T[j + NN + N + 1] - T[j + NN + N]) * fx;
        const c0 = c00 + (c10 - c00) * fy, c1 = c01 + (c11 - c01) * fy, r0 = c0 + (c1 - c0) * fz;
        if (r0 <= 0) { rho[i] = 0; al[i] = 0; continue; }
        const n = noise[wrap[(x * 2 + 0) % N + ox] + wrap[(y * 2 + 5) % N + oy] * N + wrap[(z * 2 + 9) % N + oz] * NN] * .6 + noise[wrap[x + oz] + wrap[y + ox] * N + wrap[z + oy] * NN] * .4;
        const b = r0 * 1.15 < 1 ? r0 * 1.15 : 1, t = .06 + .7 * n * n;
        let d = b > t ? (b - t) / (1 - t) : 0;
        const r = Math.sqrt(crd[x] * crd[x] + r2); if (r > .82) d *= Math.max(0, (.98 - r) / .16);
        rho[i] = d; al[i] = d > 0 ? 1 - Math.exp(-SIG * d * dz) : 0; } } }
    // light from each of the six directions, then what the camera (at +z) sees of it
    acc.fill(0);
    for (let di = 0; di < 6; di++) {
      const ax = di === 0 ? 1 : di === 3 ? -1 : 0, ay = di === 1 ? 1 : di === 4 ? -1 : 0, az = di === 2 ? 1 : di === 5 ? -1 : 0;
      const st = ax ? 1 : ay ? N : NN, pos = ax + ay + az > 0, kstep = pos ? -st : st, us = ax ? N : 1, ws = az ? N : NN;
      for (let u = 0; u < N; u++) for (let w2 = 0; w2 < N; w2++) {
        let i = u * us + w2 * ws + (pos ? (N - 1) * st : 0), tau = 0;
        for (let k = 0; k < N; k++, i += kstep) { const r0 = rho[i]; if (r0 > 0) { const dt = SIG * KL * r0 * dz; T[i] = lut[((tau + dt * .5) * LS) | 0]; tau += dt; if (tau > LUTM) tau = LUTM; } }
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let Tv = 1, L0 = 0, i = x + y * N + (N - 1) * NN;
        for (let z = N - 1; z >= 0; z--, i -= NN) { const a = al[i]; if (a > 0) { L0 += Tv * a * T[i]; Tv *= 1 - a; } }
        const p = (y * N + x) * 8; acc[p + di] = L0; if (di === 0) acc[p + 6] = 1 - Tv;
      }
    }
    // hot core: how much of what is seen lies near the middle of the puff
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let Tv = 1, c = 0, i = x + y * N + (N - 1) * NN; const r2 = crd[x] * crd[x] + crd[y] * crd[y];
      for (let z = N - 1; z >= 0; z--, i -= NN) { const a = al[i]; if (a > 0) { const rr = Math.sqrt(r2 + crd[z] * crd[z]); if (rr < .75) c += Tv * a * (1 - rr / .75); Tv *= 1 - a; } }
      acc[(y * N + x) * 8 + 7] = c;
    }
    // normalize by coverage, then pad the light maps outward so mipmaps don't darken the edges
    for (let p = 0; p < NN; p++) { const o = p * 8, a = acc[o + 6]; if (a > .002) { for (let c = 0; c < 6; c++) acc[o + c] /= a; acc[o + 7] /= a; } else { for (let c = 0; c < 6; c++) acc[o + c] = -1; acc[o + 7] = 0; } }
    for (let it = 0; it < 6; it++) {
      fill.set(acc);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const o = (y * N + x) * 8; if (acc[o] >= 0) continue;
        let n = 0; const sum = [0, 0, 0, 0, 0, 0];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue; const q = (yy * N + xx) * 8; if (acc[q] < 0) continue; n++; for (let c = 0; c < 6; c++) sum[c] += acc[q + c]; }
        if (n) for (let c = 0; c < 6; c++) fill[o + c] = sum[c] / n;
      }
      acc.set(fill);
    }
    const cx0 = (v % cols) * N, cy0 = Math.floor(v / cols) * N;
    const q8 = x => x <= 0 ? 0 : x >= 1 ? 255 : x * 255 + .5;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const p = (y * N + x) * 8, o = ((cy0 + y) * W + cx0 + x) * 4, a = acc[p + 6], tau = a < .9999 ? -Math.log(1 - a) : 9.2;
      tauSum += tau;
      outA[o] = q8(acc[p]); outA[o + 1] = q8(acc[p + 1]); outA[o + 2] = q8(acc[p + 2]); outA[o + 3] = q8(tau / TAU);
      outB[o] = q8(acc[p + 3]); outB[o + 1] = q8(acc[p + 4]); outB[o + 2] = q8(acc[p + 5]); outB[o + 3] = q8(acc[p + 7]);
    }
    info.tauMean = tauSum / ((v + 1) * NN);
    yield;
  }
}
const PUFF = { N: 64, C: 4, R: 2, TAU: 10, A: null, B: null, ready: false, tauMean: 2.2 };
function puffTextures() {
  if (PUFF.A) return PUFF;
  const W = PUFF.N * PUFF.C, H = PUFF.N * PUFF.R;
  const mk = () => { const t = new THREE.DataTexture(new Uint8Array(W * H * 4), W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t; };
  PUFF.A = mk(); PUFF.B = mk();
  { // fine tiling noise that erodes the thin edges of each puff
    const n = 64, d = new Uint8Array(n * n * 4), f = new Float32Array(n * n); let s = 4242; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (const [P, a] of [[4, .45], [8, .3], [16, .17], [32, .08]]) {
      const g = Array.from({ length: P * P }, rnd);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const gx = x / n * P, gy = y / n * P, x0 = gx | 0, y0 = gy | 0; let fx = gx - x0, fy = gy - y0; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        const x1 = (x0 + 1) % P, y1 = (y0 + 1) % P, v0 = g[x0 + y0 * P] + (g[x1 + y0 * P] - g[x0 + y0 * P]) * fx, v1 = g[x0 + y1 * P] + (g[x1 + y1 * P] - g[x0 + y1 * P]) * fx;
        f[x + y * n] += (v0 + (v1 - v0) * fy) * a;
      }
    }
    for (let i = 0; i < n * n; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = d[i * 4 + 3] = Math.max(0, Math.min(255, f[i] * 255));
    const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    PUFF.D = t;
  }
  // baked in slices between frames so loading never stalls
  const job = bakePuffs(PUFF.N, PUFF.C, PUFF.R, 9001, PUFF.A.image.data, PUFF.B.image.data, PUFF.TAU, PUFF);
  const done = () => { PUFF.ready = true; PUFF.A.needsUpdate = PUFF.B.needsUpdate = true; };
  const step = () => { if (PUFF.ready) return; if (job.next().done) done(); else setTimeout(step, 0); };
  // if smoke is needed before the slices are through, finish the bake right away
  PUFF.finish = () => { if (PUFF.ready) return; while (!job.next().done); done(); };
  setTimeout(step, 0);
  return PUFF;
}

function createSmoke(maxN, skyTex) {
  const P = puffTextures();
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const mkA = () => { const a = new THREE.InstancedBufferAttribute(new Float32Array(maxN * 4), 4); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const aPos = mkA(), aData = mkA(), aStr = mkA();
  geo.setAttribute('iPos', aPos); geo.setAttribute('iData', aData); geo.setAttribute('iStr', aStr); geo.instanceCount = 0;
  // light that reaches each point of the cloud through the cloud itself: r fire, g work light, b moon or sun, a open sky
  const TX = 32, TY = 32, TZ = 32, TCAP = 6400;
  const tLit = new THREE.Data3DTexture(new Uint8Array(TX * TY * TZ * 4).fill(255), TX, TY, TZ);
  tLit.format = THREE.RGBAFormat; tLit.type = THREE.UnsignedByteType; tLit.minFilter = tLit.magFilter = THREE.LinearFilter; tLit.unpackAlignment = 1; tLit.needsUpdate = true;
  const U = {
    tSky: { value: skyTex }, tA: { value: P.A }, tB: { value: P.B }, tN: { value: P.D }, uTau: { value: P.TAU }, tLit: { value: tLit }, uDetail: { value: .7 },
    uGO: { value: new THREE.Vector3() }, uGI: { value: new THREE.Vector3(1, 1, 1) }, uGMin: { value: new THREE.Vector3() }, uGMax: { value: new THREE.Vector3(1, 1, 1) },
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) }, uKeyCol: { value: new THREE.Color(0, 0, 0) },
    uP1: { value: new THREE.Vector3() }, uC1: { value: new THREE.Color(0, 0, 0) }, uP2: { value: new THREE.Vector3() }, uC2: { value: new THREE.Color(0, 0, 0) }, uD2: { value: new THREE.Vector3(0, -1, 0) },
    uGlow: { value: new THREE.Color(0, 0, 0) }, uTime: { value: 0 }, uAmbK: { value: 1 },
    uFA: { value: new THREE.Vector3() }, uFB: { value: new THREE.Vector3() }, uFireR2: { value: .03 }, uAlb: { value: .92 }, uGlowK: { value: .1 }, uSelf: { value: .6 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `attribute vec4 iPos; attribute vec4 iData; attribute vec4 iStr;
      uniform sampler2D tSky; uniform vec3 uKeyDir; uniform vec3 uFA; uniform vec3 uFB; uniform vec3 uP2;
      varying vec4 vUv; varying vec3 vW; varying vec4 vWL; varying vec4 vD; varying vec3 vLF; varying vec3 vLW; varying vec3 vLK; varying vec3 vUpL;
      varying vec3 vSkyU; varying vec3 vSkyH; varying vec3 vSkyG;
      vec2 skyUV(vec3 d){ float lat = asin(clamp(d.y, -1., 1.)); return vec2(atan(d.z, d.x) * .15915494 + .5, .5 + .5 * sign(lat) * sqrt(abs(lat) / 1.5707963)); }
      vec3 sky(vec3 d){ return texture2D(tSky, skyUV(normalize(d))).rgb; }
      void main(){
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]), F = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
        float ca = cos(iData.w), sa = sin(iData.w), sz = iPos.w;
        vec3 ax = R * ca + U * sa, ay = U * ca - R * sa;
        vec3 off = (ax * position.x + ay * position.y) * sz;
        // stretch along a world vector (young trail puffs fill the gap to the next one)
        vec3 st = iStr.xyz - F * dot(iStr.xyz, F); float sl = length(st);
        if (sl > 1e-4) { vec3 sd = st / sl; off += sd * dot(off, sd) * (sl / sz); }
        vec3 w = iPos.xyz + off; vW = w;
        // where this point of the puff reads the cloud's light: a little toward the camera, on the visible side
        vWL = vec4(w + F * (.18 * sz), iStr.w);
        // one of eight baked puffs, maybe mirrored
        float v = floor(fract(iData.y * 7.31) * 8.), mir = step(.5, fract(iData.y * 13.7));
        vec2 u = uv; u.x = mix(u.x, 1. - u.x, mir);
        vUv = vec4((vec2(mod(v, 4.), floor(v * .25)) + (u - .5) * .985 + .5) / vec2(4., 2.), uv * 1.6 + fract(iData.y * vec2(3.17, 5.31)) * 8.);
        vec3 bx = ax * (1. - 2. * mir);
        // lights in the puff's frame: x right, y up, z toward the camera
        vec3 fd = uFB - uFA; float ft = clamp(dot(w - uFA, fd) / max(dot(fd, fd), 1e-6), 0., 1.);
        vec3 lf = uFA + fd * ft - w; vLF = vec3(dot(lf, bx), dot(lf, ay), dot(lf, F));
        vec3 lw = uP2 - w; vLW = vec3(dot(lw, bx), dot(lw, ay), dot(lw, F));
        vLK = vec3(dot(uKeyDir, bx), dot(uKeyDir, ay), dot(uKeyDir, F));
        vUpL = vec3(bx.y, ay.y, F.y);
        vec4 mv = viewMatrix * vec4(w, 1.);
        vD = vec4(iData.x, iData.z, sz, -mv.z);
        // sky light from overhead, from the horizon away from the key light, and from the ground
        vec2 kh = normalize(uKeyDir.xz + vec2(1e-4, 0.));
        vSkyU = (sky(vec3(kh.x * .5, .87, kh.y * .5)) + sky(vec3(-kh.x * .5, .87, -kh.y * .5)) + sky(vec3(-kh.y * .5, .87, kh.x * .5))) / 3.;
        vSkyH = (sky(vec3(-kh.x, .12, -kh.y)) * 2. + sky(vec3(-kh.y, .12, kh.x)) + sky(vec3(kh.y, .12, -kh.x)) + sky(vec3(kh.x, .12, kh.y))) / 5.;
        vSkyG = sky(vec3(.2, -1., .1));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `precision highp sampler3D;
      uniform sampler2D tA; uniform sampler2D tB; uniform sampler2D tN; uniform float uDetail; uniform float uTime; uniform sampler3D tLit; uniform vec3 uGO; uniform vec3 uGI; uniform vec3 uGMin; uniform vec3 uGMax;
      uniform float uTau; uniform vec3 uKeyCol; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uD2; uniform vec3 uP2; uniform vec3 uGlow;
      uniform float uFireR2; uniform float uAlb; uniform float uGlowK; uniform float uAmbK; uniform float uSelf;
      varying vec4 vUv; varying vec3 vW; varying vec4 vWL; varying vec4 vD; varying vec3 vLF; varying vec3 vLW; varying vec3 vLK; varying vec3 vUpL;
      varying vec3 vSkyU; varying vec3 vSkyH; varying vec3 vSkyG;
      float six(vec3 l, vec4 A, vec4 B){ vec3 w = l * l; return w.x * (l.x > 0. ? A.r : B.r) + w.y * (l.y > 0. ? A.g : B.g) + w.z * (l.z > 0. ? A.b : B.b); }
      // scattering toward the camera: mostly even in a dense cloud, forward at thin edges
      float ph(float mu){ const float g = .55; float h = (1. - g * g) / pow(1. + g * g - 2. * g * mu, 1.5); return 1. + (h - 1.) * (mu > 0. ? .3 : .12); }
      void main(){
        vec4 A = texture2D(tA, vUv.xy), B = texture2D(tB, vUv.xy);
        // finer turbulence than the baked puff holds: it eats into the thin parts, slowly changing
        float dn = texture2D(tN, vUv.zw + vec2(uTime * .011, -uTime * .007)).r - .5;
        float dens = vD.x, tau = A.a * uTau * dens;
        tau *= max(0., 1. + uDetail * dn * 2.2 * (1. - smoothstep(.4, 2.5, tau)));
        float alpha = 1. - exp(-tau);
        alpha *= smoothstep(0., .16 * vD.z + .02, vW.y) * smoothstep(.08, .08 + .6 * vD.z, vD.w);
        if (alpha < .003) discard;
        vec4 T = texture(tLit, clamp((vWL.xyz - uGO) * uGI, uGMin, uGMax));
        // the puff's own relief; the cloud-scale shadow comes from T
        float th = uSelf * vWL.w, m6 = (A.r + A.g + A.b + B.r + B.g + B.b) / 6.;
        // the flame: an extended source, so its light falls off softly near it
        float d2 = dot(vLF, vLF); vec3 l = vLF * inversesqrt(max(d2, 1e-8));
        vec3 col = uC1 * (mix(m6, six(l, A, B), th) * ph(-l.z) * T.r / (d2 + uFireR2));
        // the work light: a spot
        vec3 lw = uP2 - vW; float dw2 = max(dot(lw, lw), .05); float cone = smoothstep(.891, .952, dot(-lw * inversesqrt(dw2), uD2));
        l = normalize(vLW); col += uC2 * (mix(m6, six(l, A, B), th) * ph(-l.z) * cone * T.g / dw2);
        // moon or sun
        l = normalize(vLK); col += uKeyCol * (mix(m6, six(l, A, B), th) * ph(-l.z) * T.b);
        col *= uAlb * .3183;
        // sky and ground light
        vec3 up = normalize(vUpL); float mU = six(up, A, B), mG = six(-up, A, B);
        col += uAlb / 6. * uAmbK * T.a * (vSkyU * mU + vSkyG * mG + vSkyH * (m6 * 6. - mU - mG));
        // exhaust still glowing where it leaves the flame
        col += uGlow * (uGlowK * vD.y * B.a);
        gl_FragColor = vec4(col * alpha, alpha);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5;
  const ST = 12, buf = new Float32Array(maxN * ST), order = new Int32Array(maxN), depth = new Float32Array(maxN);
  let n = 0, fireSet = false;
  // coarse density grid over the cloud (cells may be longer on one axis for a tall trail)
  const dg = new Float32Array(TCAP), tg = new Float32Array(TCAP * 4), G = { n: [1, 1, 1], cs: [1, 1, 1], o: [0, 0, 0] };
  const dist = new Float32Array(TCAP), bucket = new Int32Array(TCAP), cnt = new Int32Array(4097), sorted = new Int32Array(TCAP);
  const tri = (arr, ch, nc, gx, gy, gz) => {   // trilinear read at cell coordinates (cell centers at integers)
    const [nx, ny, nz] = G.n;
    gx = Math.min(Math.max(gx, 0), nx - 1.001); gy = Math.min(Math.max(gy, 0), ny - 1.001); gz = Math.min(Math.max(gz, 0), nz - 1.001);
    const ix = gx | 0, iy = gy | 0, iz = gz | 0, fx = gx - ix, fy = gy - iy, fz = gz - iz, sy = nx * nc, sz = nx * ny * nc, i = (ix + iy * nx + iz * nx * ny) * nc + ch;
    const a = arr[i] + (arr[i + nc] - arr[i]) * fx, b = arr[i + sy] + (arr[i + sy + nc] - arr[i + sy]) * fx;
    const c = arr[i + sz] + (arr[i + sz + nc] - arr[i + sz]) * fx, d = arr[i + sz + sy] + (arr[i + sz + sy + nc] - arr[i + sz + sy]) * fx;
    const e = a + (b - a) * fy, f = c + (d - c) * fy; return e + (f - e) * fz;
  };
  // light from a direction: sweep layer by layer from the side it comes from
  function sweep(dx, dy, dz, ch, K) {
    const nn = G.n, cs = G.cs, sd = [1, nn[0], nn[0] * nn[1]], c = [dx / cs[0], dy / cs[1], dz / cs[2]];
    const ab = c.map(Math.abs), a = ab[0] >= ab[1] && ab[0] >= ab[2] ? 0 : ab[1] >= ab[2] ? 1 : 2, b = (a + 1) % 3, e = (a + 2) % 3;
    const ds = 1 / ab[a], ob = c[b] * ds, oe = c[e] * ds, dir = c[a] > 0 ? 1 : -1, first = dir > 0 ? nn[a] - 1 : 0;
    for (let k = 0; k < nn[a]; k++) {
      const la = first - dir * k, lu = la + dir, inU = lu >= 0 && lu < nn[a];
      for (let ib = 0; ib < nn[b]; ib++) for (let ie = 0; ie < nn[e]; ie++) {
        const idx = la * sd[a] + ib * sd[b] + ie * sd[e];
        let Tu = 1;
        if (inU) {
          const fb = ib + ob, fe = ie + oe;
          if (fb >= 0 && fb <= nn[b] - 1 && fe >= 0 && fe <= nn[e] - 1) {
            const b0 = Math.min(nn[b] - 2, fb | 0), e0 = Math.min(nn[e] - 2, fe | 0), wb = fb - b0, we = fe - e0, j = lu * sd[a] + b0 * sd[b] + e0 * sd[e];
            const t00 = tg[j * 4 + ch], t10 = tg[(j + sd[b]) * 4 + ch], t01 = tg[(j + sd[e]) * 4 + ch], t11 = tg[(j + sd[b] + sd[e]) * 4 + ch];
            Tu = (t00 + (t10 - t00) * wb) * (1 - we) + (t01 + (t11 - t01) * wb) * we;
          }
        }
        tg[idx * 4 + ch] = Tu * Math.exp(-K * dg[idx] * ds);
      }
    }
  }
  // light from a point inside or near the cloud: cells in order of distance, each reads the one step closer
  function radial(px, py, pz, ch, K) {
    const [nx, ny, nz] = G.n, [cx, cy, cz] = G.cs, [ox, oy, oz] = G.o, N = nx * ny * nz, step = Math.max(cx, cy, cz);
    let dmax = 0;
    for (let iz = 0, i = 0; iz < nz; iz++) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++, i++) {
      const d = Math.hypot(ox + (ix + .5) * cx - px, oy + (iy + .5) * cy - py, oz + (iz + .5) * cz - pz); dist[i] = d; if (d > dmax) dmax = d; }
    const bs = 4096 / (dmax + 1e-6); cnt.fill(0);
    for (let i = 0; i < N; i++) { bucket[i] = Math.min(4095, dist[i] * bs | 0); cnt[bucket[i] + 1]++; }
    for (let k = 1; k <= 4096; k++) cnt[k] += cnt[k - 1];
    for (let i = 0; i < N; i++) sorted[cnt[bucket[i]]++] = i;
    for (let k = 0; k < N; k++) {
      const i = sorted[k], d = dist[i];
      if (d <= step) { tg[i * 4 + ch] = Math.exp(-K * dg[i] * d); continue; }
      const ix = i % nx, iy = (i / nx | 0) % ny, iz = i / (nx * ny) | 0, s = step / d;
      // one step toward the light, in cell coordinates
      const gx = ix + (px - (ox + (ix + .5) * cx)) * s / cx, gy = iy + (py - (oy + (iy + .5) * cy)) * s / cy, gz = iz + (pz - (oz + (iz + .5) * cz)) * s / cz;
      tg[i * 4 + ch] = tri(tg, ch, 4, gx, gy, gz) * Math.exp(-K * dg[i] * step);
    }
  }
  function shade() {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let i = 0; i < n; i++) { const o = i * ST, r = buf[o + 3] * .5; x0 = Math.min(x0, buf[o] - r); x1 = Math.max(x1, buf[o] + r); y0 = Math.min(y0, buf[o + 1] - r); y1 = Math.max(y1, buf[o + 1] + r); z0 = Math.min(z0, buf[o + 2] - r); z1 = Math.max(z1, buf[o + 2] + r); }
    const ex = x1 - x0, ey = y1 - y0, ez = z1 - z0;
    let c0 = Math.max(.03, Math.cbrt(ex * ey * ez / (TCAP * .7))), nx, ny, nz;
    for (let it = 0; it < 40; it++) { nx = Math.min(TX, Math.max(4, Math.ceil(ex / c0) + 2)); ny = Math.min(TY, Math.max(4, Math.ceil(ey / c0) + 2)); nz = Math.min(TZ, Math.max(4, Math.ceil(ez / c0) + 2)); if (nx * ny * nz <= TCAP) break; c0 *= 1.08; }
    const cx = Math.max(ex / (nx - 2), .02), cy = Math.max(ey / (ny - 2), .02), cz = Math.max(ez / (nz - 2), .02);
    G.n = [nx, ny, nz]; G.cs = [cx, cy, cz]; G.o = [x0 - cx, y0 - cy, z0 - cz];
    const N = nx * ny * nz, [ox, oy, oz] = G.o;
    dg.fill(0, 0, N);
    const cv = 1 / (cx * cy * cz), tm = P.tauMean;
    for (let i = 0; i < n; i++) {
      const o = i * ST, px = buf[o], py = buf[o + 1], pz = buf[o + 2], sz = buf[o + 3], m = tm * buf[o + 4] * sz * sz;
      const rx = Math.max(sz * .4, cx * .9), ry = Math.max(sz * .4, cy * .9), rz = Math.max(sz * .4, cz * .9);
      const ax = Math.max(0, Math.floor((px - rx - ox) / cx)), bx = Math.min(nx - 1, Math.floor((px + rx - ox) / cx));
      const ay = Math.max(0, Math.floor((py - ry - oy) / cy)), by = Math.min(ny - 1, Math.floor((py + ry - oy) / cy));
      const az = Math.max(0, Math.floor((pz - rz - oz) / cz)), bz = Math.min(nz - 1, Math.floor((pz + rz - oz) / cz));
      let sw = 0;
      for (let pass = 0; pass < 2; pass++) {
        const k = pass ? m * cv / Math.max(sw, 1e-6) : 0;
        for (let gz = az; gz <= bz; gz++) { const dz = (oz + (gz + .5) * cz - pz) / rz; for (let gy = ay; gy <= by; gy++) { const dy = (oy + (gy + .5) * cy - py) / ry, r2 = dz * dz + dy * dy; let gi = ax + gy * nx + gz * nx * ny;
          for (let gx = ax; gx <= bx; gx++, gi++) { const dx = (ox + (gx + .5) * cx - px) / rx, q = 1 - dx * dx - r2; if (q > 0) { if (pass) dg[gi] += q * q * k; else sw += q * q; } } } }
        if (sw === 0) break;
      }
    }
    // how much a puff shades itself: its relief scaled by how thick the cloud is around it
    for (let i = 0; i < n; i++) { const o = i * ST, sg = tri(dg, 0, 1, (buf[o] - ox) / cx - .5, (buf[o + 1] - oy) / cy - .5, (buf[o + 2] - oz) / cz - .5); buf[o + 11] *= 1 - Math.exp(-sg * buf[o + 3] * 1.2); }
    const K = SMOKE_TUNE.kappa, fa = U.uFA.value, fb = U.uFB.value, p2 = U.uP2.value, kd = U.uKeyDir.value;
    tg.fill(1, 0, N * 4);
    if (fireSet) radial((fa.x + fb.x) * .5, (fa.y + fb.y) * .5, (fa.z + fb.z) * .5, 0, K);
    if (U.uC2.value.r > 0) { const dx = p2.x - (x0 + x1) * .5, dy = p2.y - (y0 + y1) * .5, dz = p2.z - (z0 + z1) * .5, d = Math.hypot(dx, dy, dz) + 1e-6; sweep(dx / d, dy / d, dz / d, 1, K); }
    if (kd.lengthSq() > .5) sweep(kd.x, kd.y, kd.z, 2, K);
    sweep(0, 1, 0, 3, K * .6);
    // upload into the corner of the 3D texture
    const img = tLit.image.data;
    for (let iz = 0, i = 0; iz < nz; iz++) for (let iy = 0; iy < ny; iy++) { let o = (iy * TX + iz * TX * TY) * 4; for (let ix = 0; ix < nx; ix++, i++, o += 4) {
      img[o] = tg[i * 4] * 255 + .5; img[o + 1] = tg[i * 4 + 1] * 255 + .5; img[o + 2] = tg[i * 4 + 2] * 255 + .5; img[o + 3] = tg[i * 4 + 3] * 255 + .5; } }
    tLit.needsUpdate = true;
    U.uGO.value.set(ox, oy, oz); U.uGI.value.set(1 / (cx * TX), 1 / (cy * TY), 1 / (cz * TZ));
    U.uGMin.value.set(.5 / TX, .5 / TY, .5 / TZ); U.uGMax.value.set((nx - .5) / TX, (ny - .5) / TY, (nz - .5) / TZ);
  }
  const S = {
    mesh, U, puff: P,
    begin() { n = 0; fireSet = false; },
    // size in meters, dens scales the baked puff's optical depth, heat 0..1 for exhaust still glowing, roll = sprite angle, (sx, sy, sz) = stretch
    add(x, y, z, size, dens, seed, heat, roll, sx, sy, sz, relief) {
      if (n >= maxN || dens < .002 || size <= 0) return; const o = n * ST;
      buf[o] = x; buf[o + 1] = y; buf[o + 2] = z; buf[o + 3] = size; buf[o + 4] = dens; buf[o + 5] = seed; buf[o + 6] = heat || 0; buf[o + 7] = roll ?? seed * 6.2832;
      buf[o + 8] = sx || 0; buf[o + 9] = sy || 0; buf[o + 10] = sz || 0; buf[o + 11] = relief ?? 1; n++;
    },
    // the flame as a light: a segment from the nozzle along the exhaust
    fire(nozzle, dir, len) { fireSet = true; U.uFA.value.copy(nozzle).addScaledVector(dir, .04); U.uFB.value.copy(nozzle).addScaledVector(dir, Math.max(.05, len)); },
    end(camera) {
      if (!fireSet) { U.uFA.value.copy(U.uP1.value); U.uFB.value.copy(U.uP1.value); }
      U.uAlb.value = SMOKE_TUNE.albedo; U.uAmbK.value = SMOKE_TUNE.sky; U.uGlowK.value = SMOKE_TUNE.glow; U.uFireR2.value = SMOKE_TUNE.fireR * SMOKE_TUNE.fireR; U.uSelf.value = SMOKE_TUNE.self;
      if (n && !P.ready) P.finish();
      if (n) shade();
      // back to front
      const m = camera.matrixWorldInverse.elements;
      for (let i = 0; i < n; i++) { const o = i * ST; depth[i] = m[2] * buf[o] + m[6] * buf[o + 1] + m[10] * buf[o + 2] + m[14]; order[i] = i; }
      const idx = Array.from(order.subarray(0, n)).sort((a, b) => depth[a] - depth[b]);
      const ap = aPos.array, ad = aData.array, as = aStr.array;
      for (let k = 0; k < n; k++) {
        const i = idx[k], o = i * ST, q = k * 4;
        ap[q] = buf[o]; ap[q + 1] = buf[o + 1]; ap[q + 2] = buf[o + 2]; ap[q + 3] = buf[o + 3];
        ad[q] = buf[o + 4]; ad[q + 1] = buf[o + 5]; ad[q + 2] = buf[o + 6]; ad[q + 3] = buf[o + 7];
        as[q] = buf[o + 8]; as[q + 1] = buf[o + 9]; as[q + 2] = buf[o + 10]; as[q + 3] = buf[o + 11];
      }
      geo.instanceCount = n;
      for (const a of [aPos, aData, aStr]) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); }
      mesh.visible = n > 0;
    },
  };
  return S;
}

// a stable pseudo-random per particle
const prand = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const smokeSS = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// emission times spread by thrust, so every particle carries the same mass of exhaust
function smokeEmission(f, count) {
  const key = '_em' + count; if (f[key]) return f[key];
  const end = f.end ?? f.pts[f.pts.length - 1][0], M = 480, cum = new Float64Array(M + 1);
  for (let i = 1; i <= M; i++) cum[i] = cum[i - 1] + thrustAt(f, end * (i - .5) / M);
  const tot = cum[M] || 1, t0 = new Float32Array(count), k = new Float32Array(count), peak = f.stats.peak;
  for (let j = 0, i = 0; j < count; j++) {
    const tgt = Math.min(.9999, (j + .5 + (prand(j, 1) - .5) * .7) / count) * tot;
    while (i < M - 1 && cum[i + 1] < tgt) i++;
    t0[j] = end * (i + (tgt - cum[i]) / Math.max(1e-9, cum[i + 1] - cum[i])) / M;
    k[j] = Math.min(1.2, thrustAt(f, t0[j]) / peak);
  }
  return f[key] = { t0, k };
}

/* Static fire. The nozzle points along dir (world), wind drifts the cloud.
   tb: seconds since ignition (keeps running after burnout so the cloud drifts). */
const _sfA = new THREE.Vector3(), _sfB = new THREE.Vector3();
function staticFireSmoke(S, f, tb, nozzle, dir, wind, count) {
  if (tb <= 0) return;
  const fAmt = thrustAt(f, tb) / 96;
  if (S.fire && fAmt > .005) S.fire(nozzle, dir, .1 + .3 * Math.min(1, fAmt));
  const E = smokeEmission(f, count), D = dir, dn = SMOKE_TUNE.fireDens;
  const e1 = _sfA.set(D.z, 0, -D.x).normalize(), e2 = _sfB.crossVectors(e1, D).normalize();
  if (e2.y < 0) e2.negate();
  for (let j = 0; j < count; j++) {
    const t0 = E.t0[j]; if (t0 > tb) break;
    const age = tb - t0, k = E.k[j];
    if (age > 150) continue;
    const p1 = prand(j, 2), p2 = prand(j, 3), p3 = prand(j, 4), p4 = prand(j, 5), p5 = prand(j, 6), p6 = prand(j, 7), p7 = prand(j, 8), p8 = prand(j, 9);
    // the jet: thrown out along the axis and slowed by the air, inside a spreading cone
    const L = .7 + 2.4 * k * (.75 + .5 * p1), tj = .2 + .12 * p2;
    const s = L * (1 - Math.exp(-age / tj)), rj = .025 + .2 * s;
    const ang = p3 * 6.2832, rr = Math.sqrt(p4), ca = Math.cos(ang) * rr, sa = Math.sin(ang) * rr;
    // then the cloud: turbulent growth, the head curling over, a slow buoyant rise
    const g = Math.sqrt(Math.max(0, age - .12)), dif = .3 * g * (.45 + .75 * p5);
    const ux = prand(j, 10) * 2 - 1, uy = prand(j, 11) * 2 - 1, uz = prand(j, 12) * 2 - 1;
    const roll = .2 * Math.min(1, age / .8) * (.3 + .7 * p6), ph = age * (.6 + .5 * p7) + p8 * 6.2832, cr = Math.cos(ph) * roll, sr = Math.sin(ph) * roll;
    const ra = Math.max(0, age - .3), rise = ra * (.05 + .08 * p5) + .55 * (1 - Math.exp(-ra / 1.8)) * (.2 + 1.1 * p6 * p6);
    let x = nozzle.x + D.x * (s + cr) + (e1.x * ca + e2.x * sa * .6) * rj + ux * dif;
    let y = nozzle.y + D.y * (s + cr) + (e1.y * ca + e2.y * sa * .6) * rj + uy * dif * .5 + sr * .8 + rise;
    let z = nozzle.z + D.z * (s + cr) + (e1.z * ca + e2.z * sa * .6) * rj + uz * dif;
    // the wind takes over once the jet has stalled, slower near the ground
    const wd = Math.max(0, age - .7 * (1 - Math.exp(-age / .7))), hf = .55 + .45 * Math.min(1, Math.max(0, y) / 1.6);
    x += wind.x * wd * hf; y += wind.y * wd; z += wind.z * wd * hf;
    const size = .08 + 1.7 * rj + .3 * g + .025 * age;
    y = Math.max(y, size * .3);
    // optical depth: fades in at the flame tip, thins as the puff grows (its mass is fixed), clears very slowly
    const fin = smokeSS(.12, .55, s), dens = dn * fin * Math.min(.85, (.5 / size) * (.5 / size)) * (.75 + .5 * p1) * Math.exp(-age / 50);
    const heat = Math.exp(-age / .14) * Math.min(1, k * 1.2) * fin;
    // fast smoke is a streak, slow smoke a billow
    const vj = (L - s) / tj * Math.exp(-age / .9), sk = .035 * vj;
    S.add(x, y, z, size, dens, prand(j, 13), heat, prand(j, 14) * 6.2832 + (prand(j, 15) - .5) * age * .35, D.x * sk, D.y * sk, D.z * sk, smokeSS(.15, 1.1, age));
  }
}

/* Flight trail: particles left along the climb during the burn, plus the pad cloud.
   ts: flight seconds since ignition. path(t) gives the nozzle position at time t. */
const _flA = new THREE.Vector3(), _flB = new THREE.Vector3(), _flC = new THREE.Vector3();
function flightSmoke(S, ts, burnEnd, path, wind, count) {
  if (ts <= 0) return;
  const v = _flA, vn = _flB, dt = burnEnd / count, dn = SMOKE_TUNE.trailDens;
  if (S.fire && ts < burnEnd) { path(ts, _flC); S.fire(_flC, DOWN, .45); }
  for (let j = 0; j < count; j++) {
    const t0 = (j + .5 + (prand(j, 11) - .5) * .7) * dt;
    if (t0 > ts) break;
    const age = ts - t0;
    path(t0, v); path(t0 + dt, vn);
    const p1 = prand(j, 12), p2 = prand(j, 13), p3 = prand(j, 14), p4 = prand(j, 15), p5 = prand(j, 16);
    // while the nozzle is low the jet hits the pad and spreads over the ground
    const g = Math.pow(Math.max(0, 1 - v.y / 2.6), 1.4);
    const ang = p1 * 6.2832, reach = .9 + 2.4 * p2 * p2, rg = g * reach * (1 - Math.exp(-age / .35)) + g * .3 * Math.sqrt(age);
    // in the air the exhaust stops a little below the nozzle, then the column widens and drifts
    const sink = (1 - g) * .5 * (1 - Math.exp(-age / .1));
    const dif = (.03 + .07 * p3) * Math.sqrt(age), ux = prand(j, 17) * 2 - 1, uy = prand(j, 18) * 2 - 1, uz = prand(j, 19) * 2 - 1;
    // big eddies: neighbouring puffs move together, so the column meanders and swells as it ages
    const eg = Math.min(1, age / 2.5) * (.25 + .12 * Math.sqrt(age)) * (1 - g), ph = t0 * 6.1;
    let x = v.x + Math.cos(ang) * rg + ux * dif + eg * (Math.sin(ph + 1.3) + .6 * Math.sin(ph * 2.3 + 4.1));
    let z = v.z + Math.sin(ang) * rg + uz * dif + eg * (Math.sin(ph * .8 + 2.6) + .6 * Math.sin(ph * 1.9 + .7));
    const swell = 1 + .28 * Math.sin(t0 * 9.7 + 2.2) * Math.min(1, age);
    const size = (.25 + .55 * (1 - Math.exp(-age / .3)) + .34 * Math.pow(age, .7)) * swell + g * (.4 + .35 * Math.pow(age, .6));
    let y = v.y - sink + uy * dif * .6;
    // the pad cloud sits on the ground and billows up, highest near the middle where the jet came down
    const dome = (.15 + .85 * p4 * p4) * (1.25 - Math.min(1, rg / 3)) * Math.pow(age, .55) * .55;
    y = y * (1 - g) + g * (size * .34 + dome);
    const wd = Math.max(0, age - .5 * (1 - Math.exp(-age / .5))), wf = 1 + Math.max(0, y) / 45;
    x += wind.x * wd * wf; y += wind.y * wd; z += wind.z * wd * wf;
    y = Math.max(y, size * .3);
    // young puffs stretch along the climb so the column has no gaps
    const sk = (1 - g) * 2.2 * Math.exp(-age / .8);
    const dens = dn * Math.min(1.3, (.46 / size) * (.46 / size)) * (1 + g * .5) * (.8 + .4 * p5) * Math.exp(-age / 80) * smokeSS(.006, .05, age);
    const heat = Math.exp(-age / .06);
    S.add(x, y, z, size, dens, prand(j, 20), heat, p3 * 6.2832 + (p4 - .5) * age * .25, (vn.x - v.x) * sk, (vn.y - v.y) * sk, (vn.z - v.z) * sk, .85 + .15 * Math.max(g, smokeSS(.2, 2.5, age)));
  }
  // the ejection charge at apogee: a puff of powder smoke where the nose comes off, left to drift
  let apo = path._apo;
  if (!apo) { let best = -1, bt = 0; for (let t = burnEnd; t < burnEnd + 30; t += .02) { path(t, v); if (v.y > best) { best = v.y; bt = t; } else if (v.y < best - 1) break; } apo = path._apo = { t: bt, y: best }; }
  const ea = ts - apo.t - .05;
  if (ea > 0) {
    path(apo.t, v);
    for (let j = 0; j < 14; j++) {
      const p1 = prand(j, 41), p2 = prand(j, 42), p3 = prand(j, 43), ang = p1 * 6.2832, el = (p2 - .5) * 2.2;
      const r = (.25 + .6 * p3) * (1 - Math.exp(-ea / .18)) + .12 * Math.sqrt(ea), wd = Math.max(0, ea - .5 * (1 - Math.exp(-ea / .5))), wf = Math.min(2.2, 1 + apo.y / 45);
      const x = v.x + Math.cos(ang) * Math.cos(el) * r + wind.x * wd * wf, y = v.y + 1.1 + Math.sin(el) * r * .7 - .05 * ea, z = v.z + Math.sin(ang) * Math.cos(el) * r + wind.z * wd * wf;
      const size = .25 + .7 * (1 - Math.exp(-ea / .25)) + .22 * Math.pow(ea, .7);
      S.add(x, y, z, size, .55 * Math.min(1.5, (.5 / size) * (.5 / size)) * Math.exp(-ea / 14) * smokeSS(0, .04, ea), prand(j, 44), 0, p1 * 6.2832 + (p2 - .5) * ea * .3);
    }
  }
}
