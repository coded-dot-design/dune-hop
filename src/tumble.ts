// Dune Hop's tumble, shared by the race and Freestyle: no one ever crashes out. A bad landing, a
// rollover or a mine throws the buggy into a short roll (up, spinning, bouncing on the ground); for
// the last part of it the body rights itself, and it comes down on its wheels where it is, still
// rolling the way it was going. Only a buggy that leaves the table (over the edge, into a gap) goes
// back to the track: the sim puts it at its last gate (or its table's start).
// State per car in the sim's C (four slots it names) and TV (six: velocity, spin rates); the body's
// pose in the sim's pos and rot. Deterministic, + − × ÷ only; a step allocates nothing.
import type { Drive } from "@fzlt/core/drive";

const TAU = 6.283185307179586;
/** How long a tumble lasts: off the table (then the respawn), a roll, a mine's big one. */
export const T_EDGE = 1.3, T_ROLL = 1.05, T_BIG = 1.6;
/** What `step` says: still going, back on its wheels here, gone over the edge (respawn). */
export const ROLLING = 0, RIGHTED = 1, OVER = 2;

export function tumbler(o: {
  C: Float64Array; K: number;
  /** C slots: time in the tumble, over the edge (1), its length. */
  ct: number; edge: number; len: number;
  pos: Float64Array; rot: Float64Array; cars: Drive[];
  /** The ground's height under (x, z), or −30 off the table. */
  ground(x: number, z: number): number;
}) {
  const { C, K, pos, rot, cars, ground } = o, n = cars.length, TV = new Float64Array(n * 6);
  /** Per car [x, z]: where it heads if it comes down somewhere too steep to drive (the sim sets it:
   *  the track's line, the table's centre). */
  const HOME = new Float64Array(n * 2);
  /** Too steep to sit on at (x, z)? (a rim, a berm, a kicker's face) */
  const steep = (x: number, z: number) => {
    const a = ground(x + 0.7, z) - ground(x - 0.7, z), b = ground(x, z + 0.7) - ground(x, z - 0.7);
    return a * a + b * b > 0.85;
  };
  /** Car c goes into a tumble: over the edge (off 1), a roll (0), or a mine's big one (big 1). */
  function start(c: number, off: number, big: number) {
    const q = c * K, v = cars[c]!, T = c * 6, s = v.rot[2]! < 0 ? -1 : 1;
    C[q + o.ct] = 0;
    C[q + o.edge] = off;
    pos.set(v.pos, c * 3);
    rot.set(v.rot, c * 3);
    if (off) {
      TV[T] = v.vel[0]! * 0.7; TV[T + 1] = Math.max(3, v.vel[1]! + 4); TV[T + 2] = v.vel[2]! * 0.7;
      TV[T + 3] = 7 + Math.abs(v.vel[0]! + v.vel[2]!) * 0.15; TV[T + 4] = 2.2; TV[T + 5] = s * 5;
      C[q + o.len] = T_EDGE;
    } else {
      // A roll: a hop, the way it was going; a mine throws it high and spins it hard.
      const up = big ? 7.2 : 2.8;
      TV[T] = v.vel[0]! * (big ? 0.5 : 0.8); TV[T + 1] = Math.max(up, v.vel[1]! * 0.4 + up); TV[T + 2] = v.vel[2]! * (big ? 0.5 : 0.8);
      TV[T + 3] = (big ? 9.5 : 6.2) * s; TV[T + 4] = big ? 3.4 : 1.1 * s; TV[T + 5] = (big ? 4.4 : 2.4) * s;
      C[q + o.len] = big ? T_BIG : T_ROLL;
    }
  }
  /** Advance car c's tumble by dt. */
  function step(c: number, dt: number) {
    const q = c * K, T = c * 6, p = c * 3, len = C[q + o.len]!, edge = C[q + o.edge]!;
    const t = (C[q + o.ct] = C[q + o.ct]! + dt);
    TV[T + 1] = TV[T + 1]! - 20 * dt;
    for (let k = 0; k < 3; k++) (pos[p + k] = pos[p + k]! + TV[T + k]! * dt), (rot[p + k] = rot[p + k]! + TV[T + 3 + k]! * dt);
    const g = ground(pos[p]!, pos[p + 2]!) + 0.4;
    if (pos[p + 1]! < g) {
      pos[p + 1] = g;
      TV[T + 1] = Math.abs(TV[T + 1]!) * 0.38;
      TV[T] = TV[T]! * 0.7; TV[T + 2] = TV[T + 2]! * 0.7;
      TV[T + 3] = TV[T + 3]! * 0.55; TV[T + 4] = TV[T + 4]! * 0.5; TV[T + 5] = TV[T + 5]! * 0.55;
    }
    // Righting itself: roll and pitch ease to the nearest upright, the spin dies away.
    if (!edge && t > len * 0.5) {
      const k = Math.min(1, dt * 9);
      for (let a = 0; a < 3; a += 2) {
        const r = rot[p + a]!, up = TAU * Math.floor(r / TAU + 0.5);
        rot[p + a] = r + (up - r) * k;
        TV[T + 3 + a] = TV[T + 3 + a]! * (1 - k);
      }
      TV[T + 4] = TV[T + 4]! * (1 - k * 0.5);
    }
    if (t < len) return ROLLING;
    if (edge || g < -20) return OVER;
    // Back on its wheels once it's near the ground (or it has gone on long enough).
    if (pos[p + 1]! - g > 0.7 && t < len + 1.5) return ROLLING;
    // Somewhere it can sit: off a steep face, a step at a time toward its home point.
    for (let k = 0; k < 24 && steep(pos[p]!, pos[p + 2]!); k++) {
      const dx = HOME[c * 2]! - pos[p]!, dz = HOME[c * 2 + 1]! - pos[p + 2]!, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.6) break;
      pos[p] = pos[p]! + (dx / d) * 0.6;
      pos[p + 2] = pos[p + 2]! + (dz / d) * 0.6;
    }
    const v = cars[c]!;
    v.reset(pos[p]!, pos[p + 2]!, rot[p + 1]!);
    v.vel[0] = TV[T]! * 0.8;
    v.vel[2] = TV[T + 2]! * 0.8;
    pos.set(v.pos, p);
    rot.set(v.rot, p);
    return RIGHTED;
  }
  return { TV, HOME, start, step, reset: () => TV.fill(0) };
}
export type Tumbler = ReturnType<typeof tumbler>;
