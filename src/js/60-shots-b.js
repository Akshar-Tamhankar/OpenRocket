/* =====================================================================
   Shots B: progress, build log, crew and the pad, then the flight camera.
   One continuous move: a wide establishing shot of the site at blue hour,
   down to the ground and a slow dolly toward the pad, low under the rocket
   as the east brightens, then round to the pad camera for sunrise.
   Bearings are degrees around the pad (0 = +x south, 90 = +z west); the sun rises at -112.
   ===================================================================== */
function orbitCam(brg, dist, y, t) {
  const a = brg * Math.PI / 180;
  return { cx: t.x + Math.cos(a) * dist, cy: y, cz: t.z + Math.sin(a) * dist, tx: t.x, ty: t.y, tz: t.z };
}
function shotsB(S, shot, D, SP) {
  const SITE = { x: -1.1, y: .55, z: -.9 }, PAD = { x: 0, y: .95, z: 0 }, RKT = { x: 0, y: 1.22, z: 0 };
  // progress: high and wide from the west-south-west, the test stand, pad and work light against the east glow
  S.site   = shot({ ...orbitCam(70, 17, 2.9, SITE), mm: 40, ap: 0, ax: .2, ay: -.1, max: .05, may: 0, tod: .42 });
  S.siteB  = shot({ ...orbitCam(74, 13.5, 2.25, SITE), mm: 38, ap: 0, ax: .24, ay: -.08, max: .05, may: 0, tod: .5 });
  // build log: down on the playa, a slow dolly toward the pad; the work light slides out of frame on the right
  S.walk   = shot({ ...orbitCam(78, 10.5, 1.05, PAD), mm: 40, ap: 1.6, ax: .36, ay: -.02, max: 0, may: .3, tod: .56 });
  S.walkB  = shot({ ...orbitCam(77, 6.6, .78, PAD), mm: 36, ap: 2, ax: .38, ay: -.02, max: 0, may: .3, tod: .62 });
  // crew: low behind the rocket, looking up at it against the brightening horizon
  S.crew   = shot({ ...orbitCam(72, 3.5, .3, RKT), mm: 26, ap: 0, ax: .42, ay: .02, max: 0, may: .38, tod: .67, work: 0 });
  S.crewB  = shot({ ...orbitCam(70, 3.15, .26, { ...RKT, y: 1.3 }), mm: 25, ap: 0, ax: .42, ay: .02, max: 0, may: .38, tod: .72, work: 0 });
  // launch: the pad camera, low and to the side, the low sun from the front left
  S.padIn  = shot({ ...orbitCam(96, 9.5, 1.0, { x: 0, y: 1.25, z: 0 }), mm: 30, ap: 0, ax: .18, ay: -.06, max: .2, may: .02, tod: .77, work: 0 });
  S.pad    = shot({ ...orbitCam(112, 5.6, .55, { x: 0, y: 1.2, z: 0 }), mm: 28, ap: 0, ax: .24, ay: -.04, max: 0, may: -.06, tod: .8, work: 0 });
}

/* =====================================================================
   The flight, cut like a launch broadcast: named cameras, one smooth move inside each shot and hard cuts
   between them (the stage skips its damping on a cut). Everything is a pure function of flight time ts,
   so scrubbing either way gives the same picture.
     1 Pad      low beside the rail: the count, the igniter, liftoff; the rocket leaves the top of the frame
     2 Tracker  a long lens on a tripod 150 m out, the sun rising beside the pad: it starts tight on the
                rocket leaving the rail and zooms out as it climbs, so the pad, the ground and the mountains
                stay at the foot of the frame and the whole trail stays in
     3 Drone    hovering high east of the pad, above apogee, looking down: the rocket climbs at it out of its
                trail with the pad and the playa below, a push in for ejection and the main, then it backs
                off so the train, the trail and the pad share the frame again
   ===================================================================== */
const FCAMS = [{ t: -1e9, id: 'pad', no: 1, name: 'Pad' }, { t: .42, id: 'trk', no: 2, name: 'Tracker' }, { t: 2.9, id: 'drn', no: 3, name: 'Drone' }];
function flightShot(ts) { let i = 0; while (i < FCAMS.length - 1 && ts >= FCAMS[i + 1].t) i++; return FCAMS[i]; }
const brg = (b, d, y) => [Math.cos(b * DEG) * d, y, Math.sin(b * DEG) * d];
function aim(o, p, t) { o.cx = p[0]; o.cy = p[1]; o.cz = p[2]; o.tx = t[0]; o.ty = t[1]; o.tz = t[2]; }
// the vertical half angle of view the stage will use for a lens (portrait screens open it up, as in 70-stage)
function halfV(mm) { const a = innerWidth / Math.max(1, MET.vh || innerHeight); let h = Math.atan(12 / mm); if (a < .9) h = Math.atan(Math.tan(h) * Math.sqrt(1.5 / Math.max(.4, a))); return h; }
// elevation to aim at so a point at elevation e lands at screen height y (NDC) with the framing anchor ay
const aimFor = (e, y, ay, half) => e - Math.atan((y - ay) * Math.tan(half));
const smax = (a, b, k) => (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
// point the camera at p along bearing (from the camera) az and elevation el, d meters out
function look(o, p, az, el, d) { o.cx = p[0]; o.cy = p[1]; o.cz = p[2]; o.tx = p[0] + Math.cos(az) * Math.cos(el) * d; o.ty = p[1] + Math.sin(el) * d; o.tz = p[2] + Math.sin(az) * Math.cos(el) * d; }
// portrait screens open the vertical view up (as in 70-stage): tan(half) = 12 / mm * kP
const portK = () => { const a = innerWidth / Math.max(1, MET.vh || innerHeight); return a < .9 ? Math.sqrt(1.5 / Math.max(.4, a)) : 1; };
/* Two-point framing, the way an operator works a zoom: the rocket (elevation a) at screen height ya and the
   ground under it (elevation b, below a) at yb, with the lens kept inside [mmLo, mmHi]. At the long end the
   ground holds its place and the rocket climbs the frame; at the wide end the rocket holds and the ground
   goes. Continuous everywhere, so the move never jumps. Returns the aim elevation and the lens. */
function fit2(a, b, ya, yb, mmLo, mmHi) {
  const kP = portK(), T0 = 12 * kP / mmHi, T1 = 12 * kP / mmLo;
  const g = T => Math.tan(b - (a - Math.atan(ya * T))) / T - yb;
  let T;
  if (g(T0) >= 0) return { el: b - Math.atan(yb * T0), mm: mmHi };
  if (g(T1) <= 0) return { el: a - Math.atan(ya * T1), mm: mmLo };
  let lo = T0, hi = T1;
  for (let i = 0; i < 26; i++) { T = (lo + hi) / 2; if (g(T) < 0) lo = T; else hi = T; }
  T = (lo + hi) / 2;
  return { el: a - Math.atan(ya * T), mm: 12 * kP / T };
}

/* The recovery train after apogee, shared by the stage (which poses it) and the cameras (which frame it).
   te: time since the ejection charge. The nose leaves on its cord, the main streams out of the payload tube
   and opens, and the airframe swings under it until it hangs nose end up, so it never flips on screen. */
const TRAIN = { cg: .66, cord: 1.25, lines: 1.12 };
function flightTrain(F) {
  const te = F.ts - SIM.apo.t - .05;
  const arc = -.12 * F.tip;                                    // the rocket noses over a little as it slows
  if (te <= 0) return { te, th: arc, ext: 0, open: 0, sx: 0, sy: 0, nose: 0, flip: 0 };
  const free = arc - .42 * sstep(0, 1.5, te);                   // falling free, it tips while the main streams out
  const hang = -.05 + .16 * Math.sin(2.1 * (te - 1.5)) * Math.exp(-Math.max(0, te - 1.5) / 2.2);
  const ext = sstep(.2, 1.1, te), open = sstep(.85, 1.9, te);
  return { te, th: lerp(free, hang, sstep(1.1, 2.3, te)), ext, open,
    sx: lerp(.1, 1, open) * (1 + .07 * Math.sin(open * 7.5) * (1 - open * .6)), sy: lerp(.35, 1, ext) * (1 + .12 * (1 - open) * ext),
    nose: 1 - Math.exp(-te / .16), flip: sstep(.35, 1.7, te) };
}

function flightCam(base, F, sy) {
  const o = { ...base }, mob = isNarrow(), ts = F.ts, A = SIM.apo, sh = flightShot(ts);
  o.ap = 0; o.work = 0; o.drift = 1; o.cam = sh.id; o.camNo = sh.no; o.camName = sh.name;
  o.tod = lerp(base.tod, .95, sstep(-2, A.t + 7, ts));
  const cy = F.h + TRAIN.cg;                                    // the rocket's middle
  if (sh.id === 'pad') {
    // a slow push in through the count; from the igniter on it holds, and only tilts a little as the rocket
    // leaves the rail, so it climbs out of the top of the frame over its own flame and the pad cloud
    const k = sstep(-6, FL_IGN, ts);
    aim(o, brg(lerp(112, 110.5, k), lerp(5.6, 4.85, k), lerp(.55, .5, k)), [0, lerp(1.2, 1.12, k) + Math.min(F.h, 4) * .28, 0]);
    o.mm = lerp(28, 27, k);
    o.ax = mob ? 0 : .24; o.ay = mob ? -.06 : -.04;
  } else if (sh.id === 'trk') {
    // tight on the rocket as it clears the rail, the pad and the mountains compressed behind it; once it
    // nears the top third the operator zooms out to keep the ground, the pad cloud and the whole trail in,
    // so the climb reads against the horizon and the rocket keeps moving up the frame
    // 220 m out, so the zoom can hold the pad, the playa and the mountains under the whole trail up to the
    // cut; through the coast the gap between the trail and the rocket reads against the ground
    const P = brg(73, 220, 1.7), az = Math.atan2(-P[2], -P[0]), dh = Math.hypot(P[0], P[2]);
    const fr = fit2(Math.atan2(cy + .5 - P[1], dh), Math.atan2(-.6 - P[1], dh), mob ? .5 : .56, mob ? -.4 : -.7, 30, 135);
    o.mm = fr.mm; o.ax = mob ? 0 : .14; o.ay = 0;
    look(o, P, az, fr.el, dh); o.drift = .55;
  } else {
    // hovering east of the pad at apogee height, the sun behind it: the rocket climbs at it, slowing, and the
    // lens follows it in, so it goes over the top side on, against the horizon; it holds while the nose
    // comes off and the main opens, then climbs and backs off so the train, the trail and the pad share the frame
    // it opens wide and farther out, the rocket climbing at it out of its trail with the pad below, then
    // flies in and pushes the lens in as the rocket slows for apogee
    const kA = sstep(FCAMS[2].t, A.t - .4, ts), kUp = sstep(A.t + 2.2, A.t + 6.8, ts);
    const T = flightTrain(F), kIn = sstep(FCAMS[2].t + .15, A.t - .7, ts) * (1 - sstep(A.t + 2.4, A.t + 5.4, ts));
    const bd = lerp(287, 280, sstep(FCAMS[2].t, A.t + 7, ts)) * DEG, R = lerp(lerp(168, 80, kA), 92, kUp), Hc = lerp(lerp(176, 158, kA), 214, kUp);
    const P = [Math.cos(bd) * R + F.dx * .5, Hc, Math.sin(bd) * R + F.dz * .5];
    const ty = cy + .9 * T.ext, dx = F.dx - P[0], dz = F.dz - P[2], dh = Math.hypot(dx, dz);
    const eR = Math.atan2(ty - Hc, dh), eP = Math.atan2(-Hc, Math.hypot(P[0], P[2]));
    // wide (the opening and the descent): the rocket or the train high in the frame, the trail and the pad near its foot
    const w = fit2(eR, eP, mob ? .5 : .42, mob ? -.38 : -.72, 26, 120);   // phones: the pad sits above the HUD
    // tight: the rocket rising up the frame and the lens creeping in as it slows, then the train held
    // a little above the middle while it opens
    const kc = sstep(FCAMS[2].t, A.t - .2, ts), mmT = lerp(58, 100, kc) * (mob ? .8 : 1);
    const elT = eR - Math.atan(lerp(mob ? -.05 : -.14, mob ? .16 : .1, kc) * 12 * portK() / mmT);
    o.mm = Math.exp(lerp(Math.log(w.mm), Math.log(mmT), kIn));
    o.ax = mob ? 0 : .16; o.ay = 0;
    look(o, P, Math.atan2(dz, dx), lerp(w.el, elT, kIn), dh);
    o.drift = .45;
  }
  // the footer: the drone lets the rocket go, backs off and climbs, and turns toward the sun over the playa
  if (MET.foot) {
    const fk = sstep(MET.foot.t - MET.vh * 1.02, MET.foot.t - MET.vh * .05, sy);
    if (fk > 0) {
      const dx = o.tx - o.cx, dy = o.ty - o.cy, dz = o.tz - o.cz, r0 = Math.hypot(dx, dy, dz);
      const yaw0 = Math.atan2(dz, dx), pitch0 = Math.asin(clamp(dy / r0, -1, 1));
      const hb = Math.atan2(o.cz, o.cx), hd = Math.hypot(o.cx, o.cz) + 24 * fk;
      o.cx = Math.cos(hb) * hd; o.cz = Math.sin(hb) * hd; o.cy += 18 * fk;
      const yaw = lerp(yaw0, (mob ? -136 : -134) * DEG, fk), pitch = lerp(pitch0, (mob ? 9 : 4) * DEG, fk), r = lerp(r0, 40, fk);
      o.tx = o.cx + Math.cos(pitch) * Math.cos(yaw) * r; o.tz = o.cz + Math.cos(pitch) * Math.sin(yaw) * r; o.ty = o.cy + Math.sin(pitch) * r;
      o.mm = lerp(o.mm, mob ? 30 : 34, fk); o.ax = lerp(o.ax, 0, fk); o.ay = lerp(o.ay, mob ? 0 : -.25, fk);
      o.tod = lerp(o.tod, 1, fk);
    }
  }
  return o;
}
