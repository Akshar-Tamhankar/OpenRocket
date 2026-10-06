/* =====================================================================
   Shots A: hero, vehicle intro, exploded view, part close ups.
   Each shot: camera (cx,cy,cz), target (tx,ty,tz), lens mm, aperture ap,
   framing anchor (ax,ay) desktop and (max,may) phones, plus scene state.
   Light on the pad comes from the tripod work light at (1.75, 0, 1.85) aimed
   at the rocket, and the moon from the same quarter, 31 degrees up.
   ===================================================================== */
function shotsA(S, shot, D) {
  // A shot that needs its own camera on phones (not just another crop) reads these fields live, so a resize re-frames it.
  const onPhone = (s, o) => { for (const k in o) { const d = s[k], m = o[k]; Object.defineProperty(s, k, { get: () => isNarrow() ? m : d, enumerable: true, configurable: true }); } return s; };

  // Hero: 28 mm, low on the north side of the pad. The work light stands behind the rocket to the right,
  // a practical in frame: the rocket is edge lit and its shadow runs across the playa toward the lens.
  // Phones step in closer so the rocket holds the top half above the copy.
  S.hero   = onPhone(shot({ cx: -3.47, cy: .35, cz: .96, tx: 0, ty: .8, tz: 0, mm: 28, ap: 2.5, ax: .2, ay: -.1, max: -.05, may: .5, tod: .03 }),
    { cx: -3.12, cy: .33, cz: .86, may: .45 });
  // as the copy leaves, the camera starts to crane up and back toward the drawing view
  S.heroB  = onPhone(shot({ cx: -3.92, cy: .5, cz: 1.31, tx: 0, ty: .8, tz: 0, mm: 28, ap: 2.5, ax: .2, ay: -.1, max: -.05, may: .5, tod: .05 }),
    { cx: -3.45, cy: .5, cz: 1.2 });
  // Vehicle intro: back to 50 mm, almost side on like a drawing, the lens dropped below the nozzle so the horizon runs
  // under the whole rocket and the drawing stands against the sky. The x-ray draws on over the real scene.
  S.vehIn  = onPhone(shot({ cx: -4.96, cy: .1, cz: 2.14, tx: 0, ty: 1.06, tz: 0, mm: 50, ap: 1.2, ax: .22, ay: .02, max: 0, may: .26, tod: .06, scan: 1, call: 1, ghost: .25 }),
    { cy: .07, ty: 1.12 });
  // Exploded: the stack rides up the rail and the parts separate with clear gaps; the camera cranes up to hold all of it.
  S.vehEx  = shot({ ...S.vehIn, cx: -7.05, cy: 1.35, cz: 3.35, ty: 1.4, ay: .01, ex: 1.5, lift: 2.1, tod: .07 });
  // Part close ups, merged over vehEx (target x/z are 0, the part's own axis). The stack first settles so the nose
  // sits in the work light, then keeps opening up and riding up the rail as the camera works down to the motor.
  // The part in focus fills in with material from its middle out; the rest of the stack stays drawn in chalk.
  S.PT = [
    // nose: 85 mm, high three quarter from above, lifted clear of the payload, carbon weave catching the work light
    { cx: -1.25, cy: 2.84, cz: 2.17, ty: 2.06, mm: 85, ap: 9, ax: .3, ay: -.02, may: .3, ghost: 0, ex: .9, lift: 1.35 },
    // payload: 65 mm, level and side on, the horizon behind, while the chute bag slides out of the tube
    { cx: -.3, cy: 1.66, cz: 1.72, ty: 1.66, mm: 65, ap: 8, ax: .28, ay: 0, may: .3, ghost: 0, ex: 1.2, lift: 1.75 },
    // avionics: 100 mm macro on the sled as it rises out of the bay, very shallow focus
    { cx: .22, cy: 1.86, cz: .82, ty: 1.76, mm: 100, ap: 20, ax: .26, ay: 0, may: .3, ghost: 0, ex: 1.5, lift: 2.2 },
    // fin can: 24 mm, low and close past a fin, looking up the airframe into the night sky
    { cx: -.31, cy: .58, cz: .54, ty: 1.31, mm: 24, ap: 5, ax: .24, ay: .02, may: .3, ghost: 0, ex: 1.5, lift: 3 },
    // motor: 30 mm at the base looking up past the nozzle as the motor drops out; the casing climbs the frame
    // toward the fin can, which stays drawn in chalk above it
    // (phones: the portrait frame is taller, so a longer lens keeps the motor large above the panel)
    onPhone({ cx: -.7, cy: .45, cz: .55, ty: 1.15, mm: 30, ap: 7, ax: .26, ay: .07, may: .34, ghost: 0, ex: 1.5, lift: 4.6 }, { mm: 35, may: .4 }),
  ];
}
