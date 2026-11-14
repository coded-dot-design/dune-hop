// Dune Hop's handling extras on top of @fzlt/core/drive: a handbrake drift and car-to-car contact.
// A stand-in, shaped like the drift and contact a Fizlet PR is adding to the `drive` brick: the race
// calls `drift(c)` after each car's step and `contact(on, onHit)` once per step; when
// the brick ships both, these two calls switch to it and this file goes.
// - drift: the brick's own drift input lowers the tyres' sideways grip (`input[3]`); here the tail
//   steps out (a yaw kick into the turn while it is held), the handbrake scrubs a little speed, and
//   the slide angle is capped so it never swaps ends. DR per car: [amount, slide angle (rad), …].
// - contact: each buggy is two circles along its heading (nose and tail); overlapping cars are pushed
//   apart, the closing speed bounces back, and an off-centre hit turns the car it lands on. Each hit
//   is reported to `onHit(a, b, tail)` (the impulse in HIT[0]; `tail` 1 when it landed on b's tail)
//   so the race can spin out a drifting car.
// Deterministic and allocation-free: typed arrays, + − × ÷ and square roots (./math.ts).
import type { Drive } from "@fzlt/core/drive";
import { hypot } from "@fzlt/core/steer";
import { SC as TRIG, sincos } from "./math.ts";

/** Per car in DR: amount (0..1, eased), slide (the sine of the slide angle, signed), ground speed. */
export const D_AMT = 0, D_ANG = 1, D_SPD = 2, DK = 4;
const KICK = 1.7, SCRUB = 0.03, MAX_ANG = 0.62, OFS = 0.62, RCAR = 0.66;

export function handling(cars: Drive[], DS: Float64Array[]) {
  const n = cars.length, DR = new Float64Array(n * DK), H = new Float64Array(8);
  /** In: [drift amount, steer, dt] for `drift(c)`; out: the last hit's impulse for `onHit`. Doubles go
   *  through these arrays, never through calls (a double passed to a call that isn't inlined is boxed). */
  const IO = new Float64Array(3), HIT = new Float64Array(1);
  /** Heading of car c into H[0], H[1] = (fx, fz). */
  function head(c: number) {
    TRIG[2] = DS[c]![0]!;
    sincos();
    H[0] = TRIG[1]!;
    H[1] = -TRIG[0]!;
  }
  /** After car c's step, with IO = [amount 0..1 (the handbrake), steer −1..1, dt]. */
  function drift(c: number) {
    const amount = IO[0]!, steer = IO[1]!, dt = IO[2]!, v = cars[c]!, S = DS[c]!, o = c * DK, ground = S[6]! === 0;
    const a = DR[o + D_AMT]! + ((ground ? amount : 0) - DR[o + D_AMT]!) * Math.min(1, dt * 9);
    DR[o + D_AMT] = a < 0.002 ? 0 : a;
    head(c);
    const fx = H[0]!, fz = H[1]!, vx = v.vel[0]!, vz = v.vel[2]!, sp = hypot(vx, vz);
    // The slide angle: velocity against the heading (+: the tail out to the left of travel).
    const along = vx * fx + vz * fz, across = vx * -fz + vz * fx;
    DR[o + D_ANG] = sp > 1 ? (across / sp) * (along >= 0 ? 1 : -1) : 0;
    DR[o + D_SPD] = sp;
    if (!ground || DR[o + D_AMT]! < 0.05 || along < 2.5) return;
    const k = DR[o + D_AMT]!, pace = Math.min(1, along / 10);
    // The tail steps out into the turn; the slide angle is held under MAX_ANG (sin of it).
    let yaw = S[0]! - steer * KICK * k * (0.35 + 0.65 * pace) * dt;
    const ang = DR[o + D_ANG]!;
    // (Turning right, the velocity falls to the left of the nose: the angle goes negative.)
    if ((ang < -MAX_ANG * 0.8 && steer > 0) || (ang > MAX_ANG * 0.8 && steer < 0)) yaw += steer * KICK * k * dt;
    S[0] = yaw;
    v.rot[1] = yaw;
    // The handbrake scrubs speed.
    const f = 1 - SCRUB * k * dt;
    v.vel[0] = vx * f;
    v.vel[2] = vz * f;
  }
  /** Push overlapping cars apart (only those `on[c]` is 1 for); onHit(a, b, tail) with the impulse in HIT[0]. */
  function contact(on: Uint8Array, onHit: (a: number, b: number, tail: number) => void) {
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        if (!on[a] || !on[b]) continue;
        const A = cars[a]!, B = cars[b]!, dy = B.pos[1]! - A.pos[1]!;
        if (dy > 0.9 || dy < -0.9) continue;
        if (hypot(B.pos[0]! - A.pos[0]!, B.pos[2]! - A.pos[2]!) > OFS * 2 + RCAR * 2) continue;
        // The deepest overlap of the two circles each (nose +OFS, tail −OFS along the heading).
        head(a);
        const ax = H[0]!, az = H[1]!;
        head(b);
        const bx = H[0]!, bz = H[1]!;
        let best = 0, nx = 0, nz = 0, ia = 0, ib = 0;
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 2; j++) {
            const sa = i ? -OFS : OFS, sb = j ? -OFS : OFS;
            const dx = B.pos[0]! + bx * sb - A.pos[0]! - ax * sa, dz = B.pos[2]! + bz * sb - A.pos[2]! - az * sa, d = hypot(dx, dz), pen = RCAR * 2 - d;
            if (pen > best && d > 1e-6) (best = pen), (nx = dx / d), (nz = dz / d), (ia = i), (ib = j);
          }
        if (best <= 0) continue;
        const push = best / 2;
        A.pos[0] = A.pos[0]! - nx * push; A.pos[2] = A.pos[2]! - nz * push;
        B.pos[0] = B.pos[0]! + nx * push; B.pos[2] = B.pos[2]! + nz * push;
        const rv = (B.vel[0]! - A.vel[0]!) * nx + (B.vel[2]! - A.vel[2]!) * nz;
        if (rv >= 0) continue;
        const j = -rv * 0.68;
        A.vel[0] = A.vel[0]! - nx * j; A.vel[2] = A.vel[2]! - nz * j;
        B.vel[0] = B.vel[0]! + nx * j; B.vel[2] = B.vel[2]! + nz * j;
        // An off-centre hit turns each car: the push across its heading times its lever (nose or tail).
        const la = ia ? -OFS : OFS, lb = ib ? -OFS : OFS;
        const ta = (-nx * -az + -nz * ax) * la, tb = (nx * -bz + nz * bx) * lb;
        DS[a]![0] = DS[a]![0]! - ta * j * 0.05;
        DS[b]![0] = DS[b]![0]! - tb * j * 0.05;
        A.rot[1] = DS[a]![0]!;
        B.rot[1] = DS[b]![0]!;
        HIT[0] = j;
        onHit(a, b, ib);
      }
  }
  return { DR, IO, HIT, drift, contact, reset: () => DR.fill(0) };
}
export type Handling = ReturnType<typeof handling>;
