// Deterministic trig for the race: + − × ÷ and square roots only, so two browsers replaying the same
// inputs agree bit for bit (the builtins may differ in the last bit). Good to ~1e-7 rad, plenty for
// steering and headings. Lengths use @fzlt/core/steer's exact `hypot`.
const PI = 3.141592653589793, TAU = 6.283185307179586, HALF = 1.5707963267948966;

/** Wrap an angle to [−π, π]. */
export function wrap(a: number) {
  return a - TAU * Math.floor((a + PI) / TAU);
}
/** sin(a), from an odd polynomial on [−π/2, π/2]. */
export function sin(a: number) {
  let x = wrap(a);
  if (x > HALF) x = PI - x;
  else if (x < -HALF) x = -PI - x;
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 / 6227020800))))));
}
/** cos(a). */
export const cos = (a: number) => sin(a + HALF);
/** atan(x) for |x| ≤ 1: a minimax polynomial in x². */
function atan1(x: number) {
  const z = x * x;
  return x * (0.99997726 + z * (-0.33262347 + z * (0.19354346 + z * (-0.11643287 + z * (0.05265332 + z * -0.0117212)))));
}
/** atan2(y, x). */
export function atan2(y: number, x: number) {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x), ay = Math.abs(y);
  let r = ax >= ay ? atan1(ay / ax) : HALF - atan1(ax / ay);
  if (x < 0) r = PI - r;
  return y < 0 ? -r : r;
}
/** SC = [sin a, cos a] for a = SC[2]: in and out through the array (a double passed to, or returned
 *  from, a call that isn't inlined is boxed: an allocation every step). */
export const SC = new Float64Array(3);
export function sincos() {
  for (let k = 0; k < 2; k++) {
    let x = SC[2]! + k * HALF;
    x -= TAU * Math.floor((x + PI) / TAU);
    if (x > HALF) x = PI - x;
    else if (x < -HALF) x = -PI - x;
    const x2 = x * x;
    SC[k] = x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 / 6227020800))))));
  }
}
export { PI, TAU };
/** A seeded draw in [0, 1) whose state is S[0]: keep S in the sim's bytes, so a rollback (src/rollback.ts)
 *  restores it with the rest. The same sequence as @fzlt/core/kernel's `seeded`. */
export const draw = (S: Uint32Array) => ((S[0] = Math.imul(S[0]!, 1664525) + 1013904223), S[0]! / 4294967296);
