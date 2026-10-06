/* =====================================================================
   2. sound: synthesized with WebAudio, off until asked
   createSoundEngine(ctx) builds the whole graph into any audio context, live or
   offline (t/S/render.mjs renders its test files from this same code). The page
   glue under it turns the stage's per-frame state and UI events into engine calls.
   What plays: the night on the lakebed (wind in slow gusts that whistle and make
   the chord ring in the air, sparse crickets, the work light's inverter), a warm
   chorused pad that is suspended at night and opens to a major lift at sunrise,
   glints of melody through a ping-pong echo, a few far birds at first light, the
   section moments (the drawing, the parts, the mixes, the static fire, the
   flight) and quiet UI notes from the pad's chord. One reverb, one echo, the
   ridge echo, a gentle compressor and a limiter; the output stays under -1 dBFS.
   ===================================================================== */
// <sound-engine>
function createSoundEngine(ctx, opt = {}) {
  const SR = ctx.sampleRate, RED = !!opt.reduce, t00 = ctx.currentTime;
  let seed = (opt.seed || Math.random() * 4294967295) >>> 0;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const cl = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const ss = (a, b, x) => { const u = cl((x - a) / (b - a)); return u * u * (3 - 2 * u); };
  const db = v => Math.pow(10, v / 20);
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- levels, set by measuring the offline renders in t/S ---------- */
  const LV = { pad: db(-21), harp: db(-4), wind: db(-21), whis: db(-4), hum: db(-42), crk: db(-31), tw: db(-18), bird: db(-31), ui: db(6), fx: db(-5), motor: db(-8), boom: db(-6), sys: db(5), space: db(-5) };

  /* ---------- node helpers ---------- */
  const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const BQ = (type, f, q = .707) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const PAN = (p = 0) => { if (ctx.createStereoPanner) { const s = ctx.createStereoPanner(); s.pan.value = p; return s; } const g = G(); g.pan = G().gain; return g; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
  const OSC = (w, f, t, end) => { const o = ctx.createOscillator(); if (typeof w === 'string') o.type = w; else o.setPeriodicWave(w); o.frequency.value = f; o.start(t); if (end) o.stop(end); return o; };
  const SRC = (buf, t, end, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(t, rnd() * buf.duration * .9); if (end) s.stop(end); return s; };
  // continuous params glide to a target; a target that barely moved is not sent again
  const to = (p, v, t, tc = .08) => { const o = p._t; if (o !== undefined && Math.abs(o - v) <= 1e-5 + Math.abs(v) * .004) return; p._t = v; p.setTargetAtTime(v, t, tc); };
  // one-shot envelope as one curve: raised-cosine rise, optional hold, exponential fall that lands exactly on 0
  function envCurve(a, h, d, pk, k) {
    const T = a + h + d, n = Math.max(48, Math.min(8192, Math.ceil(T * 3000))), c = new Float32Array(n), ek = Math.exp(-k);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1) * T;
      c[i] = x < a ? pk * .5 * (1 - Math.cos(Math.PI * x / a)) : x <= a + h ? pk : pk * (Math.exp(-k * (x - a - h) / d) - ek) / (1 - ek);
    }
    c[n - 1] = 0;
    return c;
  }
  const env = (p, t, a, h, d, pk, k = 5) => { try { p.setValueCurveAtTime(envCurve(a, h, d, pk, k), t, a + h + d); } catch (err) { /* overlaps a running curve: skip */ } };
  // slow fades for the pad: raised cosine (in) or quarter cosine (out), both land exactly on their end value
  const fade = (p, t, dur, from, to2) => {
    const n = 200, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = i / (n - 1); c[i] = to2 > from ? from + (to2 - from) * (.5 - .5 * Math.cos(Math.PI * u)) : to2 + (from - to2) * Math.cos(Math.PI / 2 * u); }
    c[n - 1] = to2;
    try { p.setValueCurveAtTime(c, t, dur); } catch (err) { /* already fading */ }
  };
  // sources that only run while their voice is heard, so silent voices cost nothing
  function lazy(make) {
    const v = { on: false, idle: 0, src: null };
    v.run = (t, active, dt) => {
      if (active) { v.idle = 0; if (!v.on) { v.on = true; v.src = make(t); } }
      else if (v.on && (v.idle += dt) > 2.5) { v.on = false; for (const s of v.src) { try { s.stop(t + .05); } catch (err) { /* stopped */ } } v.src = null; }
    };
    return v;
  }

  /* ---------- noise, crackle and the impulse response, made once ---------- */
  // R: the buffer's own rate; brown noise is only ever heard through low-pass filters, so it is made at 24 kHz (half the work)
  function loopBuf(secs, gen, R = SR) {
    const n = Math.floor(secs * R), X = Math.floor(.06 * R), b = ctx.createBuffer(2, n, R), raw = new Float32Array(n + X);
    for (let c = 0; c < 2; c++) {
      gen(raw, R);
      let m = 0; for (let i = 0; i < n + X; i++) m += raw[i]; m /= n + X;
      const d = b.getChannelData(c);
      for (let i = X; i < n; i++) d[i] = raw[i] - m;
      // the loop seam: the first 60 ms fade from what follows the last sample into the start
      for (let i = 0; i < X; i++) { const w = i / X * Math.PI / 2; d[i] = (raw[i] - m) * Math.sin(w) + (raw[n + i] - m) * Math.cos(w); }
      let e = 0; for (let i = 0; i < n; i++) e += d[i] * d[i];
      const k = .25 / Math.sqrt(e / n); for (let i = 0; i < n; i++) d[i] *= k;
    }
    return b;
  }
  const gWhite = r => { for (let i = 0; i < r.length; i++) r[i] = rnd() * 2 - 1; };
  const gPink = r => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = -4096; i < r.length; i++) {
      const w = rnd() * 2 - 1;
      b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
      const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362; b6 = w * .115926; if (i >= 0) r[i] = v;
    }
  };
  const gBrown = (r, R) => { const c = .02 * 48000 / R; let l = 0; for (let i = -2048; i < r.length; i++) { l = (l + c * (rnd() * 2 - 1)) / (1 + c); if (i >= 0) r[i] = l; } };   // leak corner ~150 Hz at any rate
  // burning propellant: resonant grains at random times, a few big pops among many small ones; wraps so it loops
  function crackleBuf(secs, rate, pBig) {
    const n = Math.floor(secs * SR), b = ctx.createBuffer(2, n, SR), L = b.getChannelData(0), R = b.getChannelData(1), g = new Float32Array(Math.ceil(.09 * SR));
    for (let t = rnd() * .02; (t += -Math.log(1 - rnd() * .999) / rate) < secs;) {
      const big = rnd() < pBig, amp = big ? .55 + .45 * rnd() : .1 + .32 * rnd() * rnd();
      const fc = big ? 380 + 1300 * rnd() : 800 + 2400 * Math.pow(rnd(), 1.5), q = 1 + 1.8 * rnd();
      const dec = (big ? 3.5 + 9 * rnd() : 1 + 3 * rnd()) * .001 * SR, m = Math.min(g.length, Math.floor(dec * 5));
      const w0 = 2 * Math.PI * fc / SR, r = Math.exp(-w0 / (2 * q)), c1 = 2 * r * Math.cos(w0), c2 = -r * r;
      let y1 = 0, y2 = 0, pk = 1e-9, ev = 1; const kd = Math.exp(-1 / dec);
      for (let k = 0; k < m; k++) {
        const y = (rnd() * 2 - 1) * ev * (k < 6 ? k / 6 : 1) + c1 * y1 + c2 * y2; ev *= kd;
        y2 = y1; y1 = y; g[k] = y * (k > m * .8 ? (m - k) / (m * .2) : 1); if (Math.abs(y) > pk) pk = Math.abs(y);
      }
      const p = rnd() * 1.6 - .8, gl = Math.sqrt((1 - p) / 2) * amp / pk, gr = Math.sqrt((1 + p) / 2) * amp / pk, i0 = Math.floor(t * SR);
      for (let k = 0; k < m; k++) { const j = (i0 + k) % n; L[j] += g[k] * gl; R[j] += g[k] * gr; }
    }
    let pk = 1e-9; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    for (let i = 0; i < n; i++) { L[i] *= .9 / pk; R[i] *= .9 / pk; }
    return b;
  }
  // open-air reverb: soft onset after a short gap, a tail that darkens as it dies, decorrelated left and right
  function makeIR(secs, RT) {
    const n = Math.floor(secs * SR), b = ctx.createBuffer(2, n, SR), pre = .011 * SR, ramp = .035 * SR, fd = Math.floor(.3 * SR);
    const kL = Math.exp(-6.9 / RT / SR), kB = Math.exp(-1 / .7 / SR);   // per-sample decay of the level and of the brightness
    let E = 0;
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let l1 = 0, l2 = 0, lv = 1, br = 1, a = 0, nm = 0;
      for (let i = 0; i < n; i++) {
        if (!(i & 15)) { a = 1 - Math.exp(-2 * Math.PI * (950 + 7600 * br) / SR); nm = 1 / Math.sqrt(a / (2 - a)); }   // the filter moves slowly: update it every 16 samples
        l1 += a * (rnd() * 2 - 1 - l1); l2 += a * (l1 - l2);
        const on = i < pre ? 0 : Math.min(1, (i - pre) / ramp), tail = i > n - fd ? .5 + .5 * Math.cos(Math.PI * (i - n + fd) / fd) : 1;
        d[i] = l2 * lv * on * on * tail * nm;
        E += d[i] * d[i]; lv *= kL; br *= kB;
      }
    }
    const k = 1 / Math.sqrt(E / 2);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= k; }
    return b;
  }
  const NR = Math.min(SR, 24000);
  const B = { white: loopBuf(2.7, gWhite), pink: loopBuf(5.3, gPink), brown: loopBuf(4.6, gBrown, NR), crkD: crackleBuf(3.1, 58, .06), crkS: crackleBuf(4.3, 11, .5) };
  const wave = (n, f) => { const re = new Float32Array(n + 1), im = new Float32Array(n + 1); for (let k = 1; k <= n; k++) im[k] = f(k); return ctx.createPeriodicWave(re, im); };
  const W = {
    warm: wave(18, k => (k % 2 ? 1 : .6) / Math.pow(k, 1.5)),   // soft analog pad tone
    glass: wave(4, k => [1, .2, .05, .02][k - 1]),               // high pad voices, glow
    hum: wave(6, k => [1, .5, .3, .16, .08, .05][k - 1]),        // inverter
  };
  function ceilCurve() {   // identity to -3 dBFS, then a smooth knee that never passes -1.06 dBFS (input domain +-2)
    const n = 8192, c = new Float32Array(n), T = .7, C = .885;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1) * 2 - 1) * 2, a = Math.abs(x); c[i] = Math.sign(x) * (a <= T ? a : T + (C - T) * Math.tanh((a - T) / (C - T))); }
    return c;
  }
  function satCurve() {    // the motor's grit: gentle, slightly asymmetric saturation (DC removed after it)
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(2.1 * x + .22 * x * x) / Math.tanh(2.1); }
    return c;
  }

  /* ---------- master: buses, one reverb, the ping-pong echo, the ridge echo, glue, limiter, ceiling ---------- */
  const out = G(1), onoff = G(0), duck = G(1), sum = G(db(-3));
  const mHP = BQ('highpass', 24, .6), glue = ctx.createDynamicsCompressor(), lim = ctx.createDynamicsCompressor();
  glue.threshold.value = -22; glue.knee.value = 12; glue.ratio.value = 2.2; glue.attack.value = .025; glue.release.value = .35;
  lim.threshold.value = -7; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = .0015; lim.release.value = .14;
  const pre = G(.5), ceil = ctx.createWaveShaper(); ceil.curve = ceilCurve(); ceil.oversample = 'none';
  chain(sum, mHP, glue, lim, pre, ceil, duck, onoff, out);
  const sys = G(LV.sys); sys.connect(out);   // the toggle's own chime, outside the on/off fade
  const verbIn = G(1), verb = ctx.createConvolver(); verb.normalize = false; verb.buffer = makeIR(3.1, 2.5);
  chain(verbIn, BQ('highpass', 130, .6), verb, sum);
  // the echo: melody notes come back left, right, left, a little darker each time
  const spaceIn = G(1), dA = ctx.createDelay(1.5), dB = ctx.createDelay(1.5), spRet = G(LV.space);
  dA.delayTime.value = .36; dB.delayTime.value = .36;
  chain(spaceIn, BQ('highpass', 240, .6), BQ('lowpass', 3400, .5), dA);
  chain(dA, PAN(-.7), spRet); chain(dA, G(.85), dB); chain(dB, PAN(.7), spRet); chain(dB, BQ('lowpass', 2400, .5), G(.42), dA);
  spRet.connect(sum); chain(spRet, G(.45), verbIn);
  // the ridge echo: the loud events come back off the mountains around the lakebed
  const echoIn = G(1), eLP = chain(echoIn, BQ('highpass', 160, .6), BQ('lowpass', 1300, .5));
  for (const [d, g, p] of [[.43, .3, -.55], [.79, .19, .6]]) { const dl = ctx.createDelay(1); dl.delayTime.value = d; const o = chain(eLP, dl, G(g), PAN(p)); o.connect(sum); chain(o, G(.7), verbIn); }
  const bus = (lvl, vs, es = 0, sp = 0, lp = 0) => {
    const b = G(lvl), o = lp ? chain(b, BQ('lowpass', lp, .5)) : b;
    o.connect(sum); if (vs) chain(o, G(vs), verbIn); if (es) chain(o, G(es), echoIn); if (sp) chain(o, G(sp), spaceIn); return b;
  };
  const music = bus(1, .55), amb = bus(1, .12), far = bus(1, .75), glint = bus(LV.tw, .45, 0, .6), ui = bus(LV.ui, .2, 0, 0, 3800);
  const fx = bus(LV.fx, .2), motor = bus(LV.motor, .2, .28), boom = bus(LV.boom, .38, .55);

  /* ---------- the night bed ---------- */
  // wind: low body and a soft high edge from the same noise, gusts drift across the field
  const wA = SRC(B.pink, t00), wB = SRC(B.pink, t00);
  const wLP = BQ('lowpass', 400, .5), wLow = G(0); chain(wA, wLP, wLow, amb);
  const wBP = BQ('bandpass', 1100, .55), wHigh = G(0), wPan = PAN(0); chain(wB, wBP, wHigh, wPan, amb);
  const wRBP = BQ('bandpass', 650, .7), wRush = G(0); chain(wB, wRBP, wRush, amb);   // the camera moving through the air
  // the strong gusts whistle: a narrow band that wanders with the gust, off to one side
  const whBP = BQ('bandpass', 640, 9), whBP2 = BQ('bandpass', 640, 9), whG = G(0), whPan = PAN(0);
  chain(wA, whBP, whBP2, whG, whPan, far);
  // the work light's inverter: a faint hum on A (the pad's fifth) with a little buzz
  const humG = G(0); chain(OSC(W.hum, 55, t00), BQ('lowpass', 420, .7), humG, amb);
  chain(OSC('sawtooth', 110, t00), BQ('bandpass', 1320, 4), G(.05), humG);
  // two crickets far off at the edges of the playa
  const crkBus = G(0); crkBus.connect(far);
  const crk = [[4380, -.72, .35, 1], [3940, .64, .14, 1.8]].map(([f, p, thr, rest]) => { const o = OSC('sine', f, t00), e = G(0); chain(o, e, PAN(p), crkBus); return { o, e, f, thr, rest, next: t00 + 2 + rnd() * 5 * rest, left: 2 + (rnd() * 3 | 0) }; });
  function chirp(c, T, lvl) {
    const n = rnd() < .3 ? 4 : 3, pl = .015 + rnd() * .004, gap = .032 + rnd() * .006, dur = (n - 1) * gap + pl + .002, N = Math.ceil(dur * 2000), cv = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = i / (N - 1) * dur, k = Math.floor(x / gap), u = (x - k * gap) / pl; cv[i] = k < n && u < 1 ? Math.pow(Math.sin(Math.PI * u), 2) * (k ? 1 : .6) * lvl : 0; }
    cv[N - 1] = 0;
    c.o.frequency.setValueAtTime(c.f * (.985 + rnd() * .03), T);
    try { c.e.gain.setValueCurveAtTime(cv, T, dur); } catch (err) { /* overlap */ }
  }
  // first light: a few birds far across the playa, short phrases, mostly heard as reverb
  function bird(t, pan, lvl) {
    const p = PAN(pan), lp = BQ('lowpass', 4800, .5); chain(lp, p, far); chain(p, G(.5), verbIn);
    const n = 2 + (rnd() * 3 | 0), base = 2200 + rnd() * 900, up = rnd() < .5; let tt = t;
    for (let k = 0; k < n; k++) {
      const d = .045 + rnd() * .07, f0 = base * (1 + .1 * k * (up ? 1 : -.6)) * (.96 + .08 * rnd()), f1 = f0 * (rnd() < .6 ? .8 : 1.15), end = tt + d + .03;
      const o = OSC('sine', f0, tt, end); o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f1, tt + d);
      chain(OSC('sine', 28 + rnd() * 22, tt, end), G(f0 * .02), o.frequency);
      const e = G(0); chain(o, e, lp); env(e.gain, tt, .008, 0, d, lvl * (k === n - 1 ? .75 : 1), 3);
      tt += d + .04 + rnd() * .09;
    }
  }

  /* ---------- the pad: chords that breathe in and out over a D pedal ---------- */
  // n: voicing (MIDI), s: high glass voices, m: the five notes the UI and the glints may play over it
  const PAL = [
    [ // night: suspended and dark
      { n: [38, 45, 52, 57, 62], m: [62, 64, 67, 69, 72] },   // Dsus2
      { n: [38, 46, 53, 57, 62], m: [65, 67, 69, 72, 74] },   // Bbmaj7/D
      { n: [38, 48, 52, 55, 62], m: [60, 62, 64, 67, 69] },   // C/D
      { n: [38, 45, 50, 55, 57], m: [62, 64, 67, 69, 72] },   // Dsus4
    ],
    [ // blue hour: thirds start to appear
      { n: [38, 45, 54, 57, 64], m: [62, 64, 66, 69, 71] },   // Dadd9
      { n: [38, 47, 52, 55, 57], m: [62, 64, 67, 69, 71] },   // G6/9 over D
      { n: [38, 47, 52, 55, 66], m: [62, 64, 67, 69, 71] },   // Em9 over D
      { n: [38, 45, 52, 55, 62], m: [62, 64, 67, 69, 74] },   // A7sus4 over D
    ],
    [ // sunrise and morning: the bass moves, warm major
      { n: [38, 45, 54, 61, 64], m: [62, 64, 66, 69, 71], s: [73, 76] },   // Dmaj9
      { n: [43, 50, 54, 57, 59], m: [62, 64, 66, 69, 71], s: [74, 78] },   // Gmaj9
      { n: [47, 54, 57, 62, 64], m: [62, 64, 66, 69, 71], s: [69, 74] },   // Bm11
      { n: [45, 52, 57, 59, 62], m: [61, 64, 66, 69, 71], s: [71, 76] },   // Asus4 add9
    ],
  ];
  const LIFT = { n: [38, 45, 50, 54, 57, 61, 64], m: [62, 64, 66, 69, 71], s: [69, 74, 78] };      // liftoff: Dmaj9, wide
  const LAND = { n: [43, 50, 59, 62, 66, 69], m: [62, 64, 66, 69, 71], s: [74, 81] };             // under the chute: Gmaj9, open
  const padIn = G(1), padLP = BQ('lowpass', 800, .6), padLvl = G(0), padOut = G(1);
  chain(padIn, padLP, BQ('highpass', 48, .6), padLvl, padOut, music);
  chain(OSC('sine', .047, t00), G(120), padLP.frequency);   // slow breathing of the filter
  // a slow two-voice chorus widens the pad and keeps it moving
  for (const [d, r, p] of [[.019, .11, -.85], [.027, .157, .85]]) {
    const dl = ctx.createDelay(.1); dl.delayTime.value = d; chain(OSC('sine', r, t00), G(.0026), dl.delayTime);
    chain(padOut, dl, PAN(p), G(.55), music);
  }
  // the wind rings the chord: the same air through narrow bands tuned to the chord's upper notes
  const hSrc = SRC(B.pink, t00), harpG = G(0), harp = [];
  for (let i = 0; i < 4; i++) { const b1 = BQ('bandpass', 440, 30), b2 = BQ('bandpass', 440, 30); chain(hSrc, b1, b2, PAN((i / 3 - .5) * 1.3), harpG); harp.push([b1, b2]); }
  chain(harpG, BQ('highpass', 150, .6), padOut);
  function voice(m, t, att, hold, rel, lvl, wv, pan, det) {
    const e = G(0), k = G(1), end = t + att + hold + rel;
    chain(e, k, padIn);
    // three oscillators: one in the middle, two detuned to the sides
    const os = [-1, 0, 1].map(s => { const o = OSC(wv, mf(m), t, end + .05); o.detune.value = s * det + (rnd() - .5) * 1.5; if (s) chain(o, PAN(cl(pan + s * .38, -1, 1)), e); else chain(o, G(.8), e); return o; });
    fade(e.gain, t, att, 0, lvl); fade(e.gain, t + att + hold, rel, lvl, 0);
    return { k, os, end };
  }
  const pad = { pal: -1, idx: 0, next: 0, live: [], cur: null, forced: -99 };
  function chord(t, ch, o = {}) {
    const att = o.att || 3.6 + rnd() * 1.4, len = o.len || 11 + rnd() * 4, rel = o.rel || 7, g = o.gain || 1, n = ch.n.length;
    const notes = ch.n.map((m, j) => voice(m, t, att, len - att, rel, g * (m < 45 ? .036 : m < 55 ? .026 : m < 64 ? .02 : .015), W.warm, (j / (n - 1) - .5) * .8, 5 + rnd() * 5));
    for (const m of ch.s || []) notes.push(voice(m, t + .4, att * 1.3, len - att, rel, g * .009, W.glass, rnd() * 1.4 - .7, 3));
    const c = { ch, t0: t, end: t + len, notes, dead: false };
    pad.live = pad.live.filter(x => x.end + rel + 1 > t); pad.live.push(c); pad.cur = c;
    // the air takes the new chord's upper notes, gliding over a second or two
    ch.n.slice(-4).forEach((m, i) => { for (const b of harp[i]) { b.frequency.cancelScheduledValues(t); b.frequency.setTargetAtTime(mf(m + 12), t, 1.1); } });
    return c;
  }
  function releaseAll(t, dur, keep) {
    for (const c of pad.live) {
      if (c === keep || c.dead) continue; c.dead = true;
      for (const v of c.notes) { fade(v.k.gain, t, dur, 1, 0); for (const o of v.os) { try { o.stop(Math.min(v.end + .05, t + dur + .05)); } catch (err) { /* ended */ } } }
    }
  }
  const palOf = elev => (elev < -9.5 ? 0 : elev < 0 ? 1 : 2);
  function padTick(t, elev) {
    const pal = palOf(elev);
    if (!pad.cur) { pad.pal = pal; pad.idx = 0; const c = chord(t + .05, PAL[pal][0], { att: 2.5 }); pad.next = c.end - 1.5; return; }
    if (pal !== pad.pal && t - pad.forced > 6 && t - pad.cur.t0 > 2.5) {   // the clock moved on: the new palette's home chord comes in now
      pad.pal = pal; pad.idx = 0; pad.forced = t;
      const c = chord(t + .02, PAL[pal][0], { att: 3.5 }); releaseAll(t + .02, 5, c); pad.next = c.end - 1.5; return;
    }
    if (t >= pad.next) { pad.idx = (pad.idx + 1) % PAL[pad.pal].length; const c = chord(Math.max(t + .02, pad.next), PAL[pad.pal][pad.idx]); pad.next = c.end - 1.5; }
  }
  function moment(t, ch, o) { const c = chord(t, ch, o); releaseAll(t, o.kill || 3, c); pad.idx = 0; pad.next = c.end - 1.5; pad.forced = t; }
  const mel = () => (pad.cur ? pad.cur.ch.m : PAL[0][0].m);

  /* ---------- one-shots ---------- */
  // FM bell: a soft attack that is bright for a few ms, then a pure tail
  function bell(m, t, o = {}) {
    const f = mf(m), att = o.att || .004, dec = o.dec || .4, end = t + att + (o.hold || 0) + dec + .03, p = PAN(o.pan || 0), lvl = o.lvl || .02;
    const c = OSC(o.wave || 'sine', f, t, end);
    if (o.idx) { const md = OSC('sine', f * (o.ratio || 2), t, end), mg = G(0); chain(md, mg, c.frequency); env(mg.gain, t, .001, 0, o.mdec || .05, f * o.idx, 4); }
    const e = G(0); chain(c, e, p, o.bus || ui); env(e.gain, t, att, o.hold || 0, dec, lvl, o.k || 5);
    if (o.oct) { const c2 = OSC('sine', f * 2, t, end), e2 = G(0); chain(c2, e2, p); env(e2.gain, t, att, 0, dec * .4, lvl * o.oct, 5); }
    if (o.verb) chain(p, G(o.verb), verbIn);
    if (o.space) chain(p, G(o.space), spaceIn);
  }
  // a soft wooden knock with a tiny contact noise
  function tock(t, o = {}) {
    const f = o.f || 320, lvl = o.lvl || .03, p = PAN(o.pan || 0);
    const s = OSC('sine', f, t, t + .12); s.frequency.setValueAtTime(f, t); s.frequency.exponentialRampToValueAtTime(f * .7, t + .06);
    const e = G(0); chain(s, e, p); env(e.gain, t, .0012, 0, .07, lvl, 6);
    const n = SRC(B.white, t, t + .03), ne = G(0); chain(n, BQ('bandpass', o.nf || 1400, 1.3), ne, p); env(ne.gain, t, .0004, 0, .012, lvl * (o.nz ?? .7), 5);
    p.connect(o.bus || ui); if (o.verb) chain(p, G(o.verb), verbIn);
  }
  // film gate / sprocket: a short band-limited click with a little low body
  function sTick(t, o = {}) {
    const lvl = o.lvl || .03, pt = o.pitch || 1, p = PAN(o.pan || 0);
    const n = SRC(B.white, t, t + .025), ne = G(0); chain(n, BQ('bandpass', 1250 * pt * (.94 + rnd() * .12), 1.6), ne, p); env(ne.gain, t, .0005, 0, .008, lvl, 4);
    const s = OSC('sine', 165 * pt, t, t + .045), se = G(0); chain(s, se, p); env(se.gain, t, .0012, 0, .022, lvl * .55, 5);
    p.connect(o.bus || fx);
  }
  function whoosh(t, f0, f1, dur, lvl, pan, out2, vs) {
    const n = SRC(B.pink, t, t + dur + .05), bp = BQ('bandpass', f0, 1.1), e = G(0), p = PAN(pan);
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    chain(n, bp, e, p, out2); env(e.gain, t, dur * .4, 0, dur * .6, lvl, 3); if (vs) chain(p, G(vs), verbIn);
  }
  // the beam finds the rocket: a breath of air rises and the chord's top notes bloom
  function swell(t) {
    whoosh(t, 240, 1500, 1.7, .05, -.2, fx, .6);
    const M = mel(); [0, 2, 4].forEach((j, k) => bell(M[j] + 12, t + .35 + k * .12, { lvl: .45, att: .35, dec: 2, bus: glint, pan: (k - 1) * .5, wave: W.glass }));
    st.bloom = Math.max(st.bloom, .8);
  }
  // the drawing passes: a crisp drafting sweep across the sheet, left to right, the pen's tick at the end
  function sweep(t) {
    const n = SRC(B.pink, t, t + 1.25), bp = BQ('bandpass', 800, 2.2), sh = BQ('highshelf', 3200, .7), e = G(0), p = PAN(-.6);
    sh.gain.value = -7;
    bp.frequency.setValueAtTime(800, t); bp.frequency.exponentialRampToValueAtTime(3400, t + .9);
    p.pan.setValueAtTime(-.6, t); p.pan.linearRampToValueAtTime(.6, t + 1);
    chain(n, bp, sh, e, p, fx); chain(p, G(.25), verbIn); env(e.gain, t, .4, 0, .75, .085, 4);
    sTick(t + 1.02, { lvl: .022, pitch: 1.2, pan: .55 });
  }
  // the drawing is done: the carriage seats with a latch and a note
  function latch(t) {
    sTick(t, { lvl: .045, pitch: 1.2, pan: .35 }); sTick(t + .028, { lvl: .03, pitch: .9, pan: .4 });
    tock(t + .03, { f: 210, lvl: .028, pan: .35, nz: .3, bus: fx });
    bell(mel()[0] + 12, t + .05, { lvl: .013, dec: .9, idx: .3, verb: .4, space: .3, pan: .3, bus: fx });
  }
  // the exploded view: the joints let go one by one (or seat again on the way back)
  function joints(t, open) {
    for (let i = 0; i < 4; i++) { const k = open ? i : 3 - i, pn = -.15 + k * .12; sTick(t + i * .065, { lvl: .03, pitch: 1.1 - k * .09, pan: pn }); tock(t + i * .065 + .012, { f: 190 - k * 14, lvl: .02, nz: .2, pan: pn, bus: fx }); }
    if (open) whoosh(t + .05, 600, 1400, .5, .018, 0, fx, .3);
  }
  // a part comes into focus: the lens settles and latches with two ticks and a knock, then the part's note
  function focusSound(t, i) {
    sTick(t, { lvl: .026, pitch: 1.25, pan: .2 }); sTick(t + .032, { lvl: .02, pitch: 1.05, pan: .25 });
    tock(t + .03, { f: 180, lvl: .016, nz: .2, pan: .2, bus: fx });
    bell(mel()[i < 0 ? 2 : i % 5] + 12, t + .04, { lvl: .014, dec: .7, idx: .35, wave: W.glass, verb: .3, space: .25, pan: .15 });
  }
  // range countdown through a small speaker on the playa: a pip on A, the last one held
  function beep(t, last) {
    const len = last ? .3 : .11, p = PAN(.15), e = G(0), end = t + len + .25;
    OSC('sine', 880, t, end).connect(e); chain(OSC('sine', 1760, t, end), G(.06), e); chain(OSC('sine', 440, t, end), G(.22), e);
    chain(e, BQ('lowpass', 2600, .6), p, fx); chain(p, G(.3), verbIn); chain(p, G(.25), echoIn);
    env(e.gain, t, .006, len * .6, len * .4 + .08, .08, 5);
  }
  // ignition on the pad: a broadband snap, a falling thump and a low boom the ridges throw back
  function crack(t, pan, s) {
    const p = PAN(pan * .6); p.connect(boom);
    const n = SRC(B.white, t, t + .4), ne = G(0); chain(n, BQ('highpass', 300, .6), ne, p); env(ne.gain, t, .0005, 0, .12, .42 * s, 6);
    const o = OSC('sine', 118, t, t + .9); o.frequency.setValueAtTime(118, t); o.frequency.exponentialRampToValueAtTime(34, t + .45);
    const oe = G(0); chain(o, oe, p); env(oe.gain, t, .002, .02, .6, .62 * s, 4);
    const b = SRC(B.brown, t, t + 1.6), be = G(0); chain(b, BQ('lowpass', 650, .6), be, p); env(be.gain, t, .008, .05, 1.2, .9 * s, 4);
  }
  // the static fire lights in slow motion: an igniter pop, then a deep whump
  function ignite(t, pan) {
    const p = PAN(pan); p.connect(boom);
    const n = SRC(B.white, t, t + .2), ne = G(0); chain(n, BQ('bandpass', 1500, .8), ne, p); env(ne.gain, t, .0006, 0, .06, .16, 5);
    const o = OSC('sine', 74, t, t + 1.2); o.frequency.setValueAtTime(74, t); o.frequency.exponentialRampToValueAtTime(29, t + .8);
    const oe = G(0); chain(o, oe, p); env(oe.gain, t + .03, .02, .05, .9, .5, 4);
    const b = SRC(B.brown, t, t + 1.6), be = G(0); chain(b, BQ('lowpass', 420, .6), be, p); env(be.gain, t + .02, .05, .1, 1.1, .55, 4);
  }
  // the casing ticks as it cools after burnout
  function cool(t, pan) {
    for (let i = 0, k = 4 + (rnd() * 4 | 0); i < k; i++) {
      const tt = t + .6 + Math.pow(rnd(), 1.3) * 5.5, f = 1500 + rnd() * 900, e = G(0), bg = G(.35);
      OSC('sine', f, tt, tt + .2).connect(e); chain(OSC('sine', f * 2.76, tt, tt + .2), bg, e); chain(e, PAN(cl(pan + rnd() * .2 - .1, -1, 1)), fx);
      env(e.gain, tt, .0006, 0, .07 + rnd() * .08, .006 + .01 * rnd(), 6);
    }
  }
  // apogee: the ejection charge, clean and short, then the cord and the canopy leaving the tube
  function pop(t, pan) {
    const p = PAN(pan * .5); p.connect(boom);
    const n = SRC(B.white, t, t + .15), ne = G(0); chain(n, BQ('bandpass', 1150, .9), ne, p); env(ne.gain, t, .0004, 0, .04, .3, 5);
    const o = OSC('sine', 160, t, t + .3); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(64, t + .12);
    const oe = G(0); chain(o, oe, p); env(oe.gain, t, .001, 0, .14, .32, 4);
    whoosh(t + .05, 380, 1300, .7, .05, pan, fx, .3);
  }
  function fwump(t, pan) { const n = SRC(B.pink, t, t + .8), e = G(0); chain(n, BQ('lowpass', 520, .8), e, PAN(pan * .5), fx); env(e.gain, t, .05, .02, .45, .12, 4); }
  // night glints: one to three notes of the chord's scale, like a slow music box, echoing left and right
  function glints(t, dawn) {
    const M = mel(), n = 1 + (rnd() < .55) + (rnd() < .3), dir = rnd() < .5 ? 1 : -1; let j = rnd() * 5 | 0, tt = t;
    for (let k = 0; k < n; k++) {
      bell(M[cl(j, 0, 4)] + 12, tt, dawn > .5
        ? { lvl: (.5 + .3 * rnd()) * (k ? .8 : 1), att: .006, dec: 1.2 + rnd() * .6, idx: .45, ratio: 2, mdec: .08, pan: rnd() * 1.2 - .6, bus: glint }
        : { lvl: (.5 + .3 * rnd()) * (k ? .8 : 1), att: .012, dec: 2 + rnd(), idx: .25, ratio: 3.01, mdec: .3, pan: rnd() * 1.2 - .6, bus: glint });
      j += dir * (1 + (rnd() < .3)); tt += .2 + rnd() * .14;
    }
  }

  /* ---------- section voices that run only while heard ---------- */
  // the drafting machine: pen on paper while the drawing moves, a soft slide while the parts move
  const scBP = BQ('bandpass', 1800, 1.1), scPaper = G(0), scOLP = BQ('lowpass', 420, .7), scSlide = G(0), scPan = PAN(0);
  chain(scBP, BQ('lowpass', 4200, .6), scPaper, scPan); chain(scOLP, scSlide, scPan); scPan.connect(fx);
  const scanV = lazy(t => { const n = SRC(B.pink, t), n2 = SRC(B.pink, t); n.connect(scBP); n2.connect(scOLP); return [n, n2]; });
  // the count: air and a low fifth rising under the last seconds
  const riBP = BQ('bandpass', 400, 1.6), riG = G(0), riTone = G(0), riLP = BQ('lowpass', 600, .6);
  chain(riBP, riG, fx); chain(riLP, riTone, fx); chain(riTone, G(.6), verbIn);
  const riV = lazy(t => { const n = SRC(B.pink, t), a = OSC(W.warm, mf(50), t), b = OSC(W.warm, mf(57), t); b.detune.value = 5; n.connect(riBP); a.connect(riLP); b.connect(riLP); return [n, a, b]; });
  // the motor: rumble, sub, roar through a little saturation, a touch of hiss, crackle on top
  const mRumLP = BQ('lowpass', 150, .6), mRum = G(0), mSubBP = BQ('bandpass', 46, 1.3), mSub = G(0);
  const mRoarBP = BQ('bandpass', 420, .5), mRoarLP = BQ('lowpass', 2400, .5), mRoar = G(0), mHissBP = BQ('bandpass', 2900, .6), mHiss = G(0);
  const mSum = G(1), mDrive = G(1), mShape = ctx.createWaveShaper(); mShape.curve = satCurve(); mShape.oversample = '2x';
  const mCrkD = G(0), mCrkS = G(0), mCrkLP = BQ('lowpass', 5200, .6), mAir = BQ('lowpass', 15000, .5), mPan = PAN(0), mLvl = G(0);
  chain(mRumLP, mRum, mSum); chain(mSubBP, mSub, mSum); chain(mRoarBP, mRoarLP, mRoar, mSum); chain(mHissBP, mHiss, mSum);
  chain(mSum, mDrive, mShape, BQ('highpass', 26, .7), G(.6), mAir);
  mCrkD.connect(mCrkLP); mCrkS.connect(mCrkLP); mCrkLP.connect(mAir);
  chain(mAir, mPan, mLvl, motor);
  const motV = lazy(t => {
    const b = SRC(B.brown, t), p = SRC(B.pink, t), w = SRC(B.white, t), cd = SRC(B.crkD, t), cs = SRC(B.crkS, t);
    b.connect(mRumLP); b.connect(mSubBP); p.connect(mRoarBP); w.connect(mHissBP); cd.connect(mCrkD); cs.connect(mCrkS);
    return [b, p, w, cd, cs];
  });
  // the flight: air rushing past, and the canopy's fabric fluttering under the chute
  const rBP = BQ('bandpass', 600, .8), rG = G(0), rPan = PAN(0); chain(rBP, rG, rPan, fx);
  const flBP = BQ('bandpass', 760, 1.1), flAM = G(.75), flG = G(0), flA = G(.45), flB = G(.3); chain(flBP, flAM, flG, fx); flA.connect(flAM.gain); flB.connect(flAM.gain);
  const flyV = lazy(t => { const n = SRC(B.pink, t), a = OSC('sine', 9.3, t), b = OSC('triangle', 13.7, t); n.connect(rBP); n.connect(flBP); a.connect(flA); b.connect(flB); return [n, a, b]; });

  /* ---------- per-frame state ---------- */
  const st = { init: false, bloom: 0, g: .3, gT: .3, gNext: 0, gPan: 0, twNext: 0, bdNext: 0, cq: 0, whF: 640,
    scan: 0, scanSp: 0, gi: -1, gt: -9, ex: 0, exSp: 0, fi: -1, ft: -9, beam: 0, swT: -9,
    fGen: -1, fPlay: false, fT: -1, fAct: 0, fSp: 0, frame: -1, frGen: -1, frSel: '', tickT: -9,
    ts: -9, flAct: 0, sep: 0, chute: 0, crackT: -9, beepT: -9, popT: -9, fwT: -9, lockT: -9 };
  const argmax = (a, min) => { let k = -1, v = min; if (a) for (let i = 0; i < a.length; i++) if (a[i] > v) { v = a[i]; k = i; } return k; };

  function update(P, t) {
    const dt = cl(P.dt || 1 / 60, .001, .1), elev = P.elev ?? -16, night = P.night ?? 1 - ss(-13, -3, elev), dawn = ss(-3, 4, elev);
    // bedOnly: the stage is not drawing (no WebGL, or a long stall); hold the sections' state, play only the bed
    const bed = !!P.bedOnly, sf = bed ? null : P.fire, fl = !bed && P.fl && P.fl.on ? P.fl : null;
    if (!st.init) {   // first frame (or sound just turned on): take the scene as it is, no events
      st.init = true; st.scan = P.scan || 0; st.ex = P.ex || 0; st.fi = argmax(P.focus, .5); st.gNext = t; st.twNext = t + 2.5; st.bdNext = t + 2; st.beam = P.beam || 0;
      if (sf) { st.fGen = sf.gen; st.fPlay = sf.playing; st.fT = sf.t; st.frame = sf.frame; st.frGen = sf.gen; st.frSel = sf.sel; }
      st.ts = fl ? fl.ts : -9; st.sep = fl ? fl.sep : 0; st.chute = fl ? fl.chute : 0;
    }
    to(duck.gain, P.paused ? .12 : 1, t, P.paused ? .25 : .4);

    /* the motor: the static fire and the flight share one voice; the louder one drives it */
    let mL = 0, mx = 0, mP = 0, mCut = 15000, mRate = 1, mDrv = 1, spt = 0;
    if (sf) {
      const gate = sf.gate ?? 1;   // the stand's shot is on screen (the flame is drawn only then)
      if (sf.gen !== st.fGen) { if (sf.playing && !RED && gate > .3) ignite(t + .02, sf.pan * .8); st.fGen = sf.gen; }
      if (st.fPlay && !sf.playing && sf.t >= sf.end - .06 && gate > .3) cool(t, sf.pan);   // burnout
      st.fPlay = sf.playing;
      const dT = sf.t >= 0 && st.fT >= 0 ? Math.abs(sf.t - st.fT) / dt : 0; st.fT = sf.t; st.fSp += (dT - st.fSp) * (1 - Math.exp(-dt * 10));
      st.fAct += ((sf.playing ? 1 : cl(dT / .12)) - st.fAct) * (1 - Math.exp(-dt * (sf.playing ? 20 : 9)));
      // the film strip: a soft tick for each frame that passes the gate while someone scrubs
      if (sf.frame >= 0 && st.frame >= 0 && sf.frame !== st.frame && sf.gen === st.frGen && sf.sel === st.frSel) {
        const n = Math.min(3, Math.abs(sf.frame - st.frame)), sp = Math.abs(sf.frame - st.frame) / dt;
        for (let k = 0; k < n; k++) { const tt = t + k * dt / n; if (tt - st.tickT >= .03) { sTick(tt + .01, { lvl: .05 / (1 + sp / 50) * cl(6 / Math.max(1, sf.dist || 6)) * gate, pitch: .9 + .2 * rnd(), pan: sf.pan * .7 }); st.tickT = tt; } }
      }
      st.frame = sf.frame; st.frGen = sf.gen; st.frSel = sf.sel;
      if (sf.amt > .002) {
        // playing: the burn in slow motion; scrubbing the strip: a quieter, darker tape scrub whose pitch follows the hand
        const x = Math.min(1.25, sf.amt), att = cl(4.2 / Math.max(.5, sf.dist)), scr = !sf.playing, L = Math.pow(att, .9) * st.fAct * (scr ? .3 : 1) * gate;
        if (L > mL) { mL = L; mx = x; mP = sf.pan; mCut = cl(15000 * Math.pow(att, 1.1), 700, 15000) * (scr ? .3 : 1); mRate = scr ? .5 + .5 * cl(st.fSp / .8) : .74; mDrv = 1.3 + .9 * x; spt = ss(.02, .12, x) * (1 - ss(.22, .55, x)); }
      }
    }
    let ri = 0;
    if (fl) {
      const dts = (fl.ts - st.ts) / dt;
      if (dts > 0) {   // the countdown, liftoff, apogee and the chute, scrolling forward
        // a jump (nav link, scrollbar drag) skips the transients it passed over and keeps only the music
        const hop = fl.ts - st.ts > 2.5;
        let cross = 0; for (const b of [-3, -2, -1]) if (st.ts < b && fl.ts >= b) cross = b;
        if (cross && !hop && t - st.beepT > .12) { beep(t + .01, cross === -1); st.beepT = t; }
        if (st.ts < 0 && fl.ts >= 0 && t - st.crackT > 1) {
          if (!hop) crack(t + .01, fl.pan, RED ? .5 : 1);
          if (fl.ts < 6) { moment(t + .05, LIFT, { att: 2.2, len: 10, gain: 1.15 }); st.bloom = Math.max(st.bloom, 1); }
          st.crackT = t;
        }
        if (st.sep < .05 && fl.sep >= .05 && !hop && t - st.popT > 1) { pop(t + .01, fl.pan); st.popT = t; }
        if (st.chute < .35 && fl.chute >= .35 && t - st.fwT > 1) { if (!hop) fwump(t + .01, fl.pan); moment(t + .3, LAND, { att: 4, len: 12, kill: 5 }); st.fwT = t; }
      }
      st.flAct += (cl(Math.abs(dts) / .5) - st.flAct) * (1 - Math.exp(-dt * 6));
      st.ts = fl.ts; st.sep = fl.sep; st.chute = fl.chute;
      ri = fl.ts < .5 ? ss(-3.4, -.25, fl.ts) * (1 - ss(0, .5, fl.ts)) : 0;
      const x = Math.min(1.25, (fl.F || 0) / 96);
      if (x > .002) {   // heard from the ground: farther and darker as it climbs, a hint of Doppler as it pulls away
        const r = Math.hypot(fl.h, 12), att = Math.pow(12 / r, .75), L = att * (.55 + .45 * st.flAct) * 1.1;
        if (L > mL) { mL = L; mx = x; mP = fl.pan; mCut = cl(15000 * Math.pow(12 / r, .9), 500, 15000); mRate = 1 / (1 + .5 * Math.max(0, fl.v * fl.h / r) / 343); mDrv = 1.7 + x; spt = 0; }
      }
    } else if (!bed) st.ts = -9;
    riV.run(t, ri > .002, dt);
    to(riG.gain, .06 * ri * ri * (.4 + .6 * st.flAct), t, .1); to(riBP.frequency, 260 + 1500 * ri * ri, t, .1); to(riTone.gain, .05 * ri, t, .25); to(riLP.frequency, 300 + 900 * ri, t, .2);
    motV.run(t, mL * mx > .0005, dt);
    to(mRum.gain, Math.pow(mx, .7), t, .03); to(mSub.gain, .55 * Math.pow(mx, 1.2), t, .03);
    to(mRoar.gain, .9 * Math.pow(mx, 1.1), t, .03); to(mHiss.gain, .2 * Math.pow(mx, 1.6), t, .03);
    to(mRoarLP.frequency, 900 + 2600 * mx, t, .05); to(mDrive.gain, mDrv, t, .05);
    to(mCrkD.gain, .5 * Math.pow(mx, 1.3) * (RED ? .4 : 1), t, .03); to(mCrkS.gain, .75 * spt * (RED ? .4 : 1), t, .05);
    to(mAir.frequency, mCut, t, .1); to(mPan.pan, mP, t, .12); to(mLvl.gain, mL * (RED ? .6 : 1), t, .04);
    if (motV.src) for (const s of motV.src) to(s.playbackRate, mRate, t, .1);
    const loud = cl(mL * Math.pow(mx, .8) * 1.5);
    st.cq = Math.max(st.cq * Math.exp(-dt / 6), cl(loud * 3));   // loud noise silences the crickets and birds for a while

    /* the flight's air: rushing past while fast, the canopy fluttering under the chute */
    const sp = fl ? cl(Math.abs(fl.v) / 85) : 0, fa = fl ? .6 + .4 * st.flAct : 0, near = fl ? Math.pow(cl(11 / Math.max(1, fl.camDist || 11)), 1.3) : 0;
    const rush = fl ? .09 * Math.pow(sp, 1.5) * fa * (1 - .7 * fl.chute) : 0, flut = fl ? .07 * fl.chute * (.35 + .65 * st.flAct) * near : 0;
    flyV.run(t, rush + flut > .0005, dt);
    to(rG.gain, rush, t, .08); to(rBP.frequency, 380 + 1500 * sp, t, .1); to(rPan.pan, fl ? fl.pan * .5 : 0, t, .2); to(flG.gain, flut, t, .15);

    /* the beam, the drawing, the joints, the parts */
    if (!bed) {
    const bm = P.beam || 0;
    if (bm > .5 && st.beam <= .5 && t - st.swT > 3) { swell(t + .01); st.swT = t; }
    st.beam = bm;
    const dS = ((P.scan || 0) - st.scan) / dt, s0 = st.scan; st.scan = P.scan || 0;
    st.scanSp += (Math.abs(dS) - st.scanSp) * (1 - Math.exp(-dt * 14));
    if (dS > 0 && s0 < .02 && st.scan >= .02) { if (t - st.swT > 3) { swell(t + .01); st.swT = t; } sweep(t + .05); }
    if (dS > 0 && s0 < .97 && st.scan >= .97) latch(t + .01);
    // scrubbing the drawing plays up (or down) the chord's scale, one soft glass note per tenth of the sheet
    const gi = Math.min(9, Math.floor(st.scan * 10));
    if (gi !== st.gi && st.gi >= 0 && st.scanSp > .2 && !RED && t - st.gt > .06) {
      const M = mel(); bell(M[gi % 5] + 12 * Math.floor(gi / 5), t + .005, { lvl: .4 / (1 + st.scanSp / 2.5), att: .005, dec: .9, idx: .2, mdec: .04, wave: W.glass, pan: (st.scan - .5) * 1.2, bus: glint });
      st.gt = t;
    }
    st.gi = gi;
    const dE = ((P.ex || 0) - st.ex) / dt, e0 = st.ex; st.ex = P.ex || 0;
    st.exSp += (Math.abs(dE) - st.exSp) * (1 - Math.exp(-dt * 10));
    if (e0 < .12 && st.ex >= .12) joints(t + .01, true); else if (e0 >= .12 && st.ex < .12) joints(t + .01, false);
    const fi = argmax(P.focus, .5);
    if (fi !== st.fi) { if (fi >= 0 && t - st.ft > .35) { focusSound(t + .01, fi); st.ft = t; } st.fi = fi; }
    const sv = RED ? 0 : cl(st.scanSp / 1.6), xv = RED ? 0 : cl(st.exSp / 2.4);
    scanV.run(t, sv + xv > .01, dt);
    to(scPaper.gain, .045 * Math.pow(sv, .8), t, .03); to(scSlide.gain, .05 * Math.pow(xv, .9), t, .04);
    to(scBP.frequency, 1300 + 1900 * st.scan, t, .05); to(scPan.pan, sv >= xv ? (st.scan - .5) * 1.1 : 0, t, .06);
    } else scanV.run(t, false, dt);

    /* the bed: wind and its whistle, the air ringing the chord, the inverter, crickets, birds, glints, the pad */
    if (t >= st.gNext) { st.gT = Math.pow(rnd(), 1.7); st.gNext = t + 2.5 + rnd() * 5; st.gPan = rnd() * 1.2 - .6; st.whF = 480 + rnd() * 420; }
    st.g += (st.gT - st.g) * (1 - Math.exp(-dt / 1.8));
    const g = st.g, wb = LV.wind * (.85 + .25 * dawn + .2 * cl(Math.log2(1 + (P.camY || 1) / 3), 0, 1.5)) * (fl ? 1.15 : 1);
    to(wLP.frequency, 260 + 620 * g + 200 * dawn, t, .3); to(wLow.gain, wb * (.55 + .65 * g), t, .3);
    to(wBP.frequency, 850 + 900 * g, t, .4); to(wHigh.gain, wb * .22 * g * g, t, .4); to(wPan.pan, st.gPan * g, t, 1.2);
    to(wRush.gain, fl ? 0 : wb * .5 * Math.pow(cl(((P.camSpeed || 0) - .25) / 3.5), 1.4), t, .15);
    const wf = st.whF * (1 + .25 * g); to(whBP.frequency, wf, t, .9); to(whBP2.frequency, wf, t, .9);
    to(whG.gain, wb * LV.whis * Math.pow(ss(.25, .9, g), 1.5) * (1 - loud), t, .5); to(whPan.pan, -st.gPan * .8, t, 1.5);
    to(harpG.gain, LV.harp * (.3 + .7 * g) * (.75 + .25 * night) * (1 - .8 * loud), t, .6);
    to(humG.gain, LV.hum * (P.work || 0) * (P.workProx ?? .5) * (1 - loud), t, .03);
    const cv = LV.crk * night * (1 - dawn);
    to(crkBus.gain, cv, t, .5);
    for (const c of crk) {
      if (c.next < t - 1) c.next = t;
      while (c.next < t + .3) {
        const T = Math.max(c.next, t + .02);
        if (cv > 1e-4 && st.cq < c.thr) chirp(c, T, .55 + .45 * rnd());
        if (--c.left <= 0) { c.left = 2 + (rnd() * 4 | 0); c.next = T + 4 + rnd() * 9 * c.rest; } else c.next = T + .5 + rnd() * .12;
      }
    }
    if (t >= st.bdNext) { if (dawn > .35 && st.cq < .1 && !fl) bird(t + .02, rnd() * 1.6 - .8, LV.bird * (.5 + .5 * rnd()) * dawn); st.bdNext = t + 2.2 + rnd() * 6; }
    if (t >= st.twNext) { if (loud < .05 && (night > .3 || dawn > .6)) glints(t + .02, dawn); st.twNext = t + 5 + rnd() * 7; }
    padTick(t, elev);
    st.bloom *= Math.exp(-dt / 3);
    to(padLP.frequency, 700 * Math.pow(2, .65 * ss(-14, -6, elev) + 1.1 * dawn) * (1 + st.bloom), t, .6);
    to(padLvl.gain, LV.pad * (1 + .2 * dawn) * (1 - .55 * loud), t, .5);
  }

  /* ---------- events from the page ---------- */
  function ev(name, o = {}, t = ctx.currentTime + .02) {
    const x = o.x ?? .5, M = mel(), i = Math.min(4, Math.max(0, Math.floor(x * 5))), pn = (x - .5) * .7;
    switch (name) {
      case 'hover': bell(M[i] + 12, t, { lvl: .014 * (o.gain ?? 1), att: .003, dec: .18, idx: .3, mdec: .03, verb: .2, pan: pn }); break;
      case 'press': tock(t, { f: 300, lvl: .022, pan: pn * .8 }); bell(M[i], t + .004, { lvl: .012, dec: .24, idx: .25, verb: .15, pan: pn }); break;
      case 'grab': tock(t, { f: 240, lvl: .024, nz: .4, pan: pn * .8 }); break;
      case 'confirm': {   // a propellant mix: the detent, then that mix's own three-note chord rising, warm body under it
        const k = { a: 0, b: 1, c: 2 }[o.mix] ?? 0, J = [[0, 2, 4], [1, 3, 5], [2, 4, 6]][k], nt = j => M[j % 5] + 12 * (1 + Math.floor(j / 5));
        tock(t, { f: 230, lvl: .03, nz: .35, pan: pn * .6 });
        J.forEach((j, q) => bell(nt(j), t + .012 + q * .07, { lvl: .021 - q * .003, dec: .9 + q * .3, idx: .4, verb: .3, space: .3, pan: pn + (q - 1) * .14 }));
        bell(nt(J[0]) - 24, t + .012, { lvl: .022, att: .006, dec: .8, idx: .12, pan: pn });
        break;
      }
      case 'open': whoosh(t, 500, 1400, .28, .03, pn, ui, .2); bell(M[i] + 12, t + .05, { lvl: .01, dec: .3, idx: .25, verb: .25, pan: pn }); break;
      case 'close': whoosh(t, 1400, 500, .24, .025, pn, ui, .15); break;
      case 'ok': [0, 2, 4].forEach((j, k) => bell(M[j] + 12, t + k * .07, { lvl: .015, dec: .7, idx: .35, verb: .3, space: .3, pan: (k - 1) * .2 })); break;
      case 'err': bell(M[2] + 12, t, { lvl: .014, dec: .3, idx: .3, verb: .2 }); bell(M[0] + 12, t + .09, { lvl: .013, dec: .45, idx: .3, verb: .2 }); break;
      case 'focus': if (t - st.ft > .35) { focusSound(t, argmax(o.focus, .5)); st.ft = t; } break;
      case 'lock': if (t - st.lockT > .6) { bell(M[2] + 12, t, { lvl: .01, dec: .2, idx: .5, mdec: .02, pan: .3 }); bell(M[4] + 12, t + .06, { lvl: .011, dec: .5, idx: .35, verb: .2, space: .25, pan: .35 }); st.lockT = t; } break;
    }
  }
  function setOn(on, t = ctx.currentTime + .02) {
    onoff.gain.cancelScheduledValues(t); onoff.gain.setTargetAtTime(on ? 1 : 0, t, on ? .45 : .12);
    const M = mel(), [a, b] = on ? [M[0], M[3]] : [M[3], M[0]];
    bell(a + 12, t, { lvl: on ? .05 : .035, dec: .5, idx: .35, bus: sys }); bell(b + 12, t + .09, { lvl: on ? .045 : .03, dec: on ? .9 : .5, idx: .3, bus: sys });
    if (on) st.init = false;
  }
  return { out, update, ev, setOn, buses: { music, amb, far, glint, ui, fx, motor, boom, sys }, pad, LV };
}
// </sound-engine>

/* ---------- page glue ---------- */
const snd = { ctx: null, on: false, eng: null, offT: 0, lastF: 0, pc: null, hovEl: null, hovT: 0, tok: 4, tokT: 0, pv: 0, px: 0, py: 0, pt: 0, pressT: 0 };
function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  try {
    const ctx = new AC({ latencyHint: 'interactive' });
    const eng = createSoundEngine(ctx, { reduce });
    eng.out.connect(ctx.destination);
    Object.assign(snd, { ctx, eng });
    if (TEST.hooks || TEST.sound) { const an = ctx.createAnalyser(); an.fftSize = 4096; eng.out.connect(an); snd.an = an; window.__sound = snd; }
    // no stage (no WebGL, or the loop stopped): keep the bed going from the scroll position alone
    setInterval(() => {
      if (!snd.on || performance.now() - snd.lastF < 1000) return;
      const u = clamp(scrollY / Math.max(1, MET.max), 0, 1), elev = lerp(-17, 7, u);
      try { eng.update({ dt: .1, elev, night: 1 - sstep(-13, -3, elev), work: 0, bedOnly: true, paused: state.paused }, ctx.currentTime); } catch (err) { /* keep the page running */ }
    }, 100);
    return true;
  } catch (err) { return false; }
}
// iOS plays Web Audio through the ringer switch (silent mode mutes it) unless a media element is playing:
// a silent looping tag, started by the same click, moves the page to playback like a video would
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
function keepAlive(on) {
  if (!IOS) return;
  try {
    if (on && !snd.tag) {
      const n = 4410, b = new ArrayBuffer(44 + n), v = new DataView(b), w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, 44100, true); v.setUint32(28, 44100, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
      for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);   // 8-bit silence
      const a = document.createElement('audio');
      a.loop = true; a.preload = 'auto'; a.setAttribute('playsinline', ''); a.setAttribute('x-webkit-airplay', 'deny'); a.disableRemotePlayback = true;
      a.src = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
      snd.tag = a;
    }
    if (!snd.tag) return;
    if (on) { const p = snd.tag.play(); if (p) p.catch(() => {}); } else snd.tag.pause();
  } catch (err) { /* media blocked: Web Audio still plays with the ringer on */ }
}
// a context the system interrupted (a call, another app, a backgrounded tab) comes back on the next touch or key
function wake() {
  if (!snd.on || !snd.ctx) return;
  if (snd.ctx.state !== 'running') snd.ctx.resume().catch(() => {});
  if (snd.tag && snd.tag.paused) keepAlive(true);
}
['pointerdown', 'touchend', 'keydown'].forEach(t => addEventListener(t, wake, { capture: true, passive: true }));
function setSound(on) {
  if (on && !snd.ctx && !initAudio()) return;
  if (!snd.ctx) return;
  snd.on = on; clearTimeout(snd.offT);
  const c = snd.ctx;
  // iOS mutes Web Audio with the ringer switch unless the page asks for playback; the visitor asked for sound
  const ses = type => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (err) { /* not supported */ } };
  if (on) { ses('playback'); keepAlive(true); c.resume().catch(() => {}); snd.eng.setOn(true, c.currentTime + .03); }
  else { snd.eng.setOn(false, c.currentTime + .02); snd.offT = setTimeout(() => { if (!snd.on) { c.suspend().catch(() => {}); keepAlive(false); ses('auto'); } }, 1500); }
  const b = $('#snd'); if (!b) return;
  b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
  const l = $('.lbl', b); if (l) l.textContent = on ? 'Sound on' : 'Sound off';
}
// below 900px the label is not displayed, so the button carries its name itself (the same words as the label)
{ const b = $('#snd'); if (b && !b.hasAttribute('aria-label')) b.setAttribute('aria-label', 'Sound off'); }
document.addEventListener('visibilitychange', () => { if (!snd.ctx) return; if (document.hidden) { snd.ctx.suspend().catch(() => {}); keepAlive(false); } else if (snd.on) { snd.ctx.resume().catch(() => {}); keepAlive(true); } });
// other modules call this: the parts panel when it moves to the next part, the HUD when it locks on (a high f)
function blip(f) { if (snd.on && snd.eng) snd.eng.ev(f > 2500 ? 'lock' : 'focus', {}, snd.ctx.currentTime + .02); }

// UI: quiet notes from the pad's chord, pitched by where the element sits (left low, right high).
// All listeners are delegated and tolerate markup that changes or goes missing.
const UISEL = 'a,button,[role="button"],[role="slider"],.entry,.crew-b,.form,input,label,summary';
const near = (e, s) => (e.target && e.target.closest ? e.target.closest(s) : null);
addEventListener('pointermove', e => {
  const n = performance.now(), d = n - snd.pt;
  if (d > 0 && d < 200) snd.pv += (Math.hypot(e.clientX - snd.px, e.clientY - snd.py) / (d / 1000) - snd.pv) * .3; else snd.pv = 0;
  snd.px = e.clientX; snd.py = e.clientY; snd.pt = n;
}, { passive: true });
function uiNote(name, el, x, o = {}) {
  if (!snd.on || !snd.eng) return;
  const n = performance.now();
  if (name === 'hover') {
    // rate limit: a small bucket of notes, a gap between them, nothing for the same element twice in a row, quieter when the mouse is flying
    snd.tok = Math.min(4, snd.tok + (n - snd.tokT) / 1000 * 5); snd.tokT = n;
    if (snd.tok < 1 || n - snd.hovT < 85 || (el === snd.hovEl && n - snd.hovT < 700) || snd.pv > 3200) return;
    snd.tok -= 1; snd.hovT = n; snd.hovEl = el; o.gain = 1 / (1 + snd.pv / 1600);
  }
  try { snd.eng.ev(name, { x: clamp(x / innerWidth, 0, 1), ...o }, snd.ctx.currentTime + .015); } catch (err) { /* keep the page running */ }
}
const midX = el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
document.addEventListener('pointerover', e => {
  if (!snd.on || e.pointerType === 'touch') return;
  const el = near(e, UISEL); if (!el || el.contains(e.relatedTarget) || el.id === 'strip' || el.id === 'snd') return;
  if (el.matches('.crew-b') && el.getAttribute('aria-expanded') !== 'true' && fine) uiNote('open', el, midX(el)); else uiNote('hover', el, midX(el));
});
document.addEventListener('focusin', e => {
  const el = near(e, UISEL); let kb = false;
  try { kb = !!el && el.matches(':focus-visible'); } catch (err) { /* older browsers */ }
  if (kb) uiNote('hover', el, midX(el));
});
document.addEventListener('pointerdown', e => {
  const el = near(e, UISEL); if (!el || el.id === 'snd' || el.matches('.form,input,label')) return;
  snd.pressT = performance.now(); snd.downExp = el.getAttribute('aria-expanded');
  uiNote(el.id === 'strip' ? 'grab' : 'press', el, e.clientX);
});
document.addEventListener('click', e => {
  if (near(e, '#snd')) { setSound(!snd.on); return; }
  const el = near(e, UISEL); if (!el) return;
  if (el.matches('.form')) uiNote('confirm', el, midX(el), { mix: el.dataset.f });
  // a crew row that hover already opened only gets the press from pointerdown, not a second 'open'
  else if (el.id === 'menuBtn' || (el.matches('.crew-b') && el.getAttribute('aria-expanded') === 'true' && !(performance.now() - snd.pressT < 600 && snd.downExp === 'true'))) uiNote('open', el, midX(el));
  else if (el.id === 'menuClose') uiNote('close', el, midX(el));
  else if (!el.matches('input,label,[role="slider"]') && performance.now() - snd.pressT > 400) uiNote('press', el, midX(el));   // keyboard activation
});
document.addEventListener('submit', e => {
  const f = e.target; if (!f || !f.querySelector) return;
  const em = f.querySelector('input[type="email"],input[name="email"]'); if (!em) return;
  const b = f.querySelector('button,[type="submit"]') || f;
  uiNote(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim()) ? 'ok' : 'err', b, midX(b));
}, true);

// called every frame by the stage with what is on screen
const sv3 = new THREE.Vector3(), sw3 = new THREE.Vector3();
const SND_STAND = new THREE.Vector3(-3.84, .3, -2.28), SND_WORK = new THREE.Vector3(1.75, 1.5, 1.85), SND_RKT = new THREE.Vector3();
function panOf(p, cam) {   // where a source sits left to right on screen (behind the camera: hard to its side)
  sv3.copy(p).applyMatrix4(cam.matrixWorldInverse);
  if (sv3.z < -.05) return clamp(sw3.copy(p).project(cam).x * .6, -.75, .75);
  return clamp(sv3.x / Math.max(.001, Math.hypot(sv3.x, sv3.z)), -1, 1) * .75;
}
function soundFrame(F) {
  if (!snd.on || !snd.eng || !F || !F.camera) return;
  snd.lastF = performance.now();
  try {
    const cam = F.camera, cp = cam.position, fs = (typeof FORMS !== 'undefined' && FORMS[sel]) || { end: 1.5, fps: 24 }, c = F.c || {}, rdt = Math.max(F.rdt || .016, .001), W = F.W || {};
    const camSpeed = snd.pc ? cp.distanceTo(snd.pc) / rdt : 0; (snd.pc || (snd.pc = new THREE.Vector3())).copy(cp);
    const tThr = burn.scrubT != null ? burn.scrubT : burn.playing ? burn.t : -1;
    const frame = !burn.playing && burn.scrubT != null && burn.scrubT <= fs.end + 1e-6 ? Math.round(burn.scrubT * fs.fps) : -1;
    const wd = cp.distanceTo(SND_WORK), fl = F.flight;
    const P = {
      dt: rdt, tod: c.tod, elev: W.elev, night: W.night, work: F.work, workProx: 1 / (1 + wd * wd / 16), camSpeed, camY: cp.y,
      scan: c.scan, ex: c.ex, focus: F.focus, beam: F.beam, paused: state.paused,
      fire: { amt: F.fAmt || 0, gate: clamp((c.fire ?? 1) * 1.5, 0, 1), t: tThr, playing: burn.playing, frame, gen: burn.gen, sel, end: fs.end, pan: panOf(SND_STAND, cam), dist: cp.distanceTo(SND_STAND) },
      fl: F.inFlight && fl ? { on: true, ts: fl.ts, h: fl.h, v: fl.v, F: fl.F, sep: fl.sep, chute: fl.chute, pan: panOf(SND_RKT.set(fl.dx || 0, fl.h + .8, fl.dz || 0), cam), camDist: cp.distanceTo(SND_RKT) } : null,
    };
    snd.eng.update(P, snd.ctx.currentTime);
  } catch (err) { if (!snd.err) { snd.err = 1; console.error(err); } }
}
