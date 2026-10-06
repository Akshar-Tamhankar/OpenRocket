/* =====================================================================
   Shots for the static fire (data section). SP is the test stand position.
   Ground level, a three-quarter view from behind the load cell: the flame
   points left and away, and the wind carries the smoke off into the dark
   (away and a little right), so the cloud never drifts over the text.
   Desktop: the stand sits right of the text column, above the film reel.
   Phones: the stand sits in the band between the heading and the chart window,
   on a wider lens so the plume and the smoke still fit a narrow screen.
   Positions come from the nozzle (SP + N) and the flame axis A:
   camera = nozzle - A * d * cos(th) + side * d * sin(th).
   ===================================================================== */
function shotsData(S, shot, D, SP) {
  // a shot with a second camera for the stacked layout (under 900 px, the same breakpoint as the CSS).
  // The values are read live, so a rotation or a resize across the breakpoint picks them up.
  const both = (desk, phone) => {
    const s = shot(desk), d = { ...D, ...desk }, ph = { ax: desk.max, ay: desk.may, ...phone };
    for (const k in ph) Object.defineProperty(s, k, { get: () => (isNarrow() ? ph : d)[k], enumerable: true, configurable: true });
    return s;
  };
  const N = [-.243, .03, .117], A = [-.9, 0, .435], SIDE = [.435, 0, .9];
  const cam = (th, d, h) => { const c = Math.cos(th * DEG) * d, s = Math.sin(th * DEG) * d; return { cx: SP.x + N[0] - A[0] * c + SIDE[0] * s, cy: h, cz: SP.z + N[2] - A[2] * c + SIDE[2] * s }; };
  const aim = (along, h) => ({ tx: SP.x + N[0] + A[0] * along, ty: h, tz: SP.z + N[2] + A[2] * along });
  S.stand = both(
    { ...cam(22, 4.2, .3), ...aim(.1, .2), mm: 56, ap: 2.2, ax: .36, ay: .2, max: .12, may: .36, tod: .12, work: 1, fire: 1 },
    { ...cam(28, 3.9, .42), ...aim(.25, .26), mm: 34 });
  S.standB = both(
    { ...cam(16, 4.0, .38), ...aim(.1, .21), mm: 56, ap: 2.2, ax: .36, ay: .2, max: .12, may: .36, tod: .16, work: 1, fire: 1 },
    { ...cam(36, 3.5, .46), ...aim(.25, .27), mm: 34 });
}
