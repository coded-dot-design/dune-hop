// Dune Rally's handling on @fzlt/core/drive (0.24): the brick does the handbrake drift (the drift input,
// `input[3]`: the rear lets go, the tail swings out, the slide is held and caught) and the contact
// (`touch`: box hulls pushed apart, bounced along the normal); this file keeps the race's view of them.
// The race calls `drift(c)` after each car's step and `contact(on, onHit)` once per step.
// - drift: DR per car: [amount (the handbrake, eased; 0 in the air), slide (the sine of the slide
//   angle, signed: + the tail out to the left of travel), ground speed]. The race scores drift points from it.
// - contact: every pair of cars that `on` marks, in order (the same on every screen), through the brick's
//   `touch`; each hit is reported to `onHit(a, b, tail)` (the impulse in HIT[0]; `tail` 1 when it landed
//   on b's tail) so the race can spin out a drifting car.
// Deterministic and allocation-free: typed arrays, + − × ÷ and square roots (./math.ts).
import { touch, touchHit, type Drive, type TouchOptions } from "@fzlt/core/drive";
import { hypot } from "@fzlt/core/steer";
import { SC as TRIG, sincos } from "./math.ts";

/** Per car in DR: amount (0..1, eased), slide (the sine of the slide angle, signed), ground speed. */
export const D_AMT = 0, D_ANG = 1, D_SPD = 2, DK = 4;

export function handling(cars: Drive[], DS: Float64Array[]) {
  const n = cars.length, DR = new Float64Array(n * DK), H = new Float64Array(2);
  /** In: [drift amount, steer, dt] for `drift(c)`; out: the last hit's impulse for `onHit`. Doubles go
   *  through these arrays, never through calls (a double passed to a call that isn't inlined is boxed). */
  const IO = new Float64Array(3), HIT = new Float64Array(1), AB = new Int32Array(2);
  let report: (a: number, b: number, tail: number) => void = () => {};
  /** Heading of car c into H = (fx, fz). */
  function head(c: number) {
    TRIG[2] = DS[c]![0]!;
    sincos();
    H[0] = TRIG[1]!;
    H[1] = -TRIG[0]!;
  }
  /** After car c's step, with IO = [amount 0..1 (the handbrake), steer −1..1, dt]. */
  function drift(c: number) {
    const amount = IO[0]!, dt = IO[2]!, v = cars[c]!, o = c * DK, ground = DS[c]![6]! === 0;
    const a = DR[o + D_AMT]! + ((ground ? amount : 0) - DR[o + D_AMT]!) * Math.min(1, dt * 9);
    DR[o + D_AMT] = a < 0.002 ? 0 : a;
    head(c);
    const fx = H[0]!, fz = H[1]!, vx = v.vel[0]!, vz = v.vel[2]!, sp = hypot(vx, vz);
    const along = vx * fx + vz * fz, across = vx * -fz + vz * fx;
    DR[o + D_ANG] = sp > 1 ? (across / sp) * (along >= 0 ? 1 : -1) : 0;
    DR[o + D_SPD] = sp;
  }
  /** The brick's contact callback: which of b's ends was hit (the contact point behind b's centre: its tail). */
  const opts: TouchOptions = {
    bounce: 0.36,
    height: 0.9,
    onHit: () => {
      const b = AB[1]!, B = cars[b]!;
      head(b);
      HIT[0] = touchHit[0]!;
      report(AB[0]!, b, (touchHit[4]! - B.pos[0]!) * H[0]! + (touchHit[5]! - B.pos[2]!) * H[1]! < 0 ? 1 : 0);
    },
  };
  /** Push overlapping cars apart (only those `on[c]` is 1 for); onHit(a, b, tail) with the impulse in HIT[0]. */
  function contact(on: Uint8Array, onHit: (a: number, b: number, tail: number) => void) {
    report = onHit;
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        if (!on[a] || !on[b]) continue;
        AB[0] = a; AB[1] = b;
        touch(cars[a]!, cars[b]!, opts);
      }
  }
  return { DR, IO, HIT, drift, contact, reset: () => DR.fill(0) };
}
export type Handling = ReturnType<typeof handling>;
