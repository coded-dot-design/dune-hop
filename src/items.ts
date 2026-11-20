// Dune Rally's BATTLE items, headless (the race and Freestyle both carry one): item boxes on the track
// that come back a few seconds after they're taken, one item held per car, fired with the ITEM input.
// Our own four:
// - BLASTER: a short burst of three bolts straight ahead; a bolt that hits stalls the car (a jolt, half
//   its speed gone, a moment with no pull).
// - OIL SLICK: dropped behind you; the next car over it spins out.
// - ZAP MINE: left on the track, armed after a moment; anyone (you too) who rolls over it is thrown
//   into a big tumble (it always rights itself: no one is ever out).
// - SHIELD: switched on, it blocks the next hit.
// The draw is weighted by place (a little rubber band: the back of the pack gets the mines and the
// blasters, the leader more shields and oil). The AI fires its own: a bolt at a car in front, oil or a
// mine at one behind, the shield straight away.
// Deterministic and allocation-free like the sims: typed arrays, a seeded draw, + − × ÷ and square
// roots; no doubles through calls (ints only), the sim's state in `bytes` (the online hash covers it).
import type { Drive } from "@fzlt/core/drive";
import { SC as TRIG, sincos, draw } from "./math.ts";

export const IT_NONE = 0, IT_BLASTER = 1, IT_OIL = 2, IT_MINE = 3, IT_SHIELD = 4;
export const ITEM_NAMES = ["", "BLASTER", "OIL SLICK", "ZAP MINE", "SHIELD"];
/** What a hit does: a stall (a bolt), a spin-out (oil), a big tumble (a mine). */
export const H_STALL = 1, H_SPIN = 2, H_TUMBLE = 3;
/** Box slots: x, y, z, back in (0: there). Held per car: item, bolts left in the burst, burst timer,
 *  shield on (seconds left), the fire input last step, seconds held. Bolts: x, y, z, vx, vz, life,
 *  owner, on. Hazards: kind (0 none, IT_OIL, IT_MINE), x, y, z, arming (s), life (s), owner, owner-safe (s). */
export const BK = 4, HK = 6, BOK = 8, ZK = 8;
export const NBOLT = 18, NHAZ = 16;
const BOX_R = 1.35, BOX_BACK = 4.5, BURST = 3, BURST_GAP = 0.1, BOLT_V = 30, BOLT_LIFE = 0.75, BOLT_R = 1.1;
const OIL_R = 1.55, OIL_LIFE = 16, MINE_R = 1.5, MINE_ARM = 0.9, MINE_LIFE = 40, SHIELD_T = 14;

export interface ItemHost {
  /** Its ground: height under (x, z). */
  t: { height(x: number, z: number): number };
  cars: Drive[];
  /** Each drive's state (yaw 0, air 6). */
  DS: Float64Array[];
  /** Where each car is drawn: x, y, z. */
  pos: Float64Array;
  /** The play area's half size (bolts die off it). */
  HX: number;
  HZ: number;
}

/** BATTLE on `host`'s cars with boxes at `boxes` ([x, z, …]); `emit(type, car, value)` takes ints only. */
export function items(h: ItemHost, boxes: ArrayLike<number>, seed: number, ev: { get: number; fire: number; hit: number; block: number }) {
  const NC = h.cars.length, NB = boxes.length >> 1;
  const B = new Float64Array(NB * BK), H = new Float64Array(NC * HK), BO = new Float64Array(NBOLT * BOK), Z = new Float64Array(NHAZ * ZK);
  /** Per car, set by the sim before each step: can it be hit or pick up (1), the AI drives it (1),
   *  how far back it runs (0 the leader .. 1 last), hit this step (the kind, 0: none). */
  const ON = new Uint8Array(NC), BOT = new Uint8Array(NC), BACK = new Float64Array(NC), HIT = new Uint8Array(NC), BY = new Int8Array(NC);
  /** In: [dt]. */
  const IO = new Float64Array(1), F = new Float64Array(2);
  // The seeded draw: its state in IS, in the bytes (a rollback restores it).
  const IS = Uint32Array.of(seed), rnd = () => draw(IS);
  let emit: (type: number, car: number, val: number) => unknown = () => 0;
  function reset(s: number) {
    IS[0] = (s ^ 0x5eed17) >>> 0;
    for (let b = 0; b < NB; b++) {
      const x = boxes[b * 2]!, z = boxes[b * 2 + 1]!;
      B[b * BK] = x; B[b * BK + 1] = h.t.height(x, z) + 0.75; B[b * BK + 2] = z; B[b * BK + 3] = 0;
    }
    H.fill(0); BO.fill(0); Z.fill(0); HIT.fill(0); BY.fill(-1);
  }
  /** The heading of car c into F = (fx, fz). */
  function fwd(c: number) {
    TRIG[2] = h.DS[c]![0]!;
    sincos();
    F[0] = TRIG[1]!;
    F[1] = -TRIG[0]!;
  }
  /** A weighted draw by how far back the car runs. */
  function roll(c: number) {
    const f = BACK[c]!, wb = 30 + 14 * f, wo = 26 - 12 * f, wm = 12 + 24 * f, ws = 32 - 26 * f, r = rnd() * (wb + wo + wm + ws);
    return r < wb ? IT_BLASTER : r < wb + wo ? IT_OIL : r < wb + wo + wm ? IT_MINE : IT_SHIELD;
  }
  function drop(c: number, kind: number) {
    // The oldest free slot (or the oldest of all when full).
    let j = -1, lo = Infinity;
    for (let k = 0; k < NHAZ; k++) {
      if (!Z[k * ZK]) {
        j = k;
        break;
      }
      if (Z[k * ZK + 5]! < lo) (lo = Z[k * ZK + 5]!), (j = k);
    }
    fwd(c);
    const o = j * ZK, p = c * 3, back = kind === IT_OIL ? 2 : 1.7, x = h.pos[p]! - F[0]! * back, z = h.pos[p + 2]! - F[1]! * back;
    Z[o] = kind; Z[o + 1] = x; Z[o + 2] = h.t.height(x, z); Z[o + 3] = z;
    Z[o + 4] = kind === IT_MINE ? MINE_ARM : 0; Z[o + 5] = kind === IT_MINE ? MINE_LIFE : OIL_LIFE; Z[o + 6] = c; Z[o + 7] = 1;
  }
  function bolt(c: number) {
    let j = 0, lo = Infinity;
    for (let k = 0; k < NBOLT; k++) {
      if (!BO[k * BOK + 7]) {
        j = k;
        lo = -1;
        break;
      }
      if (BO[k * BOK + 5]! < lo) (lo = BO[k * BOK + 5]!), (j = k);
    }
    fwd(c);
    const o = j * BOK, p = c * 3, v = h.cars[c]!, fx = F[0]!, fz = F[1]!, along = v.vel[0]! * fx + v.vel[2]! * fz;
    BO[o] = h.pos[p]! + fx * 1.4; BO[o + 1] = h.pos[p + 1]! + 0.35; BO[o + 2] = h.pos[p + 2]! + fz * 1.4;
    BO[o + 3] = fx * (BOLT_V + Math.max(0, along)); BO[o + 4] = fz * (BOLT_V + Math.max(0, along));
    BO[o + 5] = BOLT_LIFE; BO[o + 6] = c; BO[o + 7] = 1;
  }
  /** Car c uses what it holds. */
  function fire(c: number) {
    const o = c * HK, it = H[o]!;
    if (!it) return;
    H[o] = 0;
    H[o + 5] = 0;
    if (it === IT_BLASTER) (H[o + 1] = BURST), (H[o + 2] = 0);
    else if (it === IT_SHIELD) H[o + 3] = SHIELD_T;
    else drop(c, it);
    emit(ev.fire, c, it);
  }
  /** Car d is hit (kind) by car `by`: the shield takes it, or it lands (HIT[d] for the sim). */
  function hit(d: number, kind: number, by: number) {
    if (HIT[d]) return;
    if (H[d * HK + 3]! > 0) {
      H[d * HK + 3] = 0;
      emit(ev.block, d, by);
      return;
    }
    HIT[d] = kind;
    BY[d] = by;
    emit(ev.hit, d, kind * 8 + (by & 7));
  }
  /** The AI's call for car c (holding item `it`, held for H[o + 5] s): fire now? */
  function want(c: number, it: number) {
    const o = c * HK;
    if (H[o + 5]! < 0.5 + (c % 3) * 0.25) return false;
    if (it === IT_SHIELD) return true;
    if (H[o + 5]! > 9) return true;
    fwd(c);
    const p = c * 3, fx = F[0]!, fz = F[1]!;
    for (let d = 0; d < NC; d++) {
      if (d === c || !ON[d]) continue;
      const dx = h.pos[d * 3]! - h.pos[p]!, dz = h.pos[d * 3 + 2]! - h.pos[p + 2]!, along = dx * fx + dz * fz, across = dx * -fz + dz * fx, a = across < 0 ? -across : across;
      if (it === IT_BLASTER && along > 2 && along < 15 && a < 1.3 + along * 0.06) return true;
      if (it !== IT_BLASTER && along < -1.5 && along > -11 && a < 2.4) return true;
    }
    return false;
  }
  /** Advance IO[0] seconds; `IN` holds the inputs (IK per car, the item input at +5). True while
   *  anything flies, arms or comes back. */
  function step(IN: Float64Array, IK: number) {
    const dt = IO[0]!;
    let moving = false;
    HIT.fill(0);
    // Boxes come back; a car through one takes an item (if its hands are free).
    for (let b = 0; b < NB; b++) {
      const o = b * BK;
      if (B[o + 3]! > 0) {
        B[o + 3] = Math.max(0, B[o + 3]! - dt);
        moving = true;
        continue;
      }
      for (let c = 0; c < NC; c++) {
        if (!ON[c] || H[c * HK]! || H[c * HK + 1]! > 0) continue;
        const dx = h.pos[c * 3]! - B[o]!, dz = h.pos[c * 3 + 2]! - B[o + 2]!, dy = h.pos[c * 3 + 1]! - B[o + 1]!;
        if (dx * dx + dz * dz > BOX_R * BOX_R || dy > 2.2 || dy < -2.2) continue;
        const it = roll(c);
        H[c * HK] = it;
        H[c * HK + 5] = 0;
        B[o + 3] = BOX_BACK;
        emit(ev.get, c, it);
        break;
      }
    }
    // Held items: a person's fire is the ITEM input's press; the AI's its own call. The burst, the shield.
    for (let c = 0; c < NC; c++) {
      const o = c * HK, f = IN[c * IK + 5]! > 0.5 ? 1 : 0, it = H[o]!;
      if (it) H[o + 5] = H[o + 5]! + dt;
      if (it && ON[c] && (BOT[c] ? want(c, it) : f && !H[o + 4])) fire(c);
      H[o + 4] = f;
      if (H[o + 1]! > 0) {
        moving = true;
        H[o + 2] = H[o + 2]! - dt;
        if (H[o + 2]! <= 0 && ON[c]) bolt(c), (H[o + 1] = H[o + 1]! - 1), (H[o + 2] = BURST_GAP);
        else if (!ON[c]) H[o + 1] = 0;
      }
      if (H[o + 3]! > 0) (H[o + 3] = Math.max(0, H[o + 3]! - dt)), (moving = true);
    }
    // Bolts fly low over the ground; the first car they reach (not the shooter) is hit.
    for (let k = 0; k < NBOLT; k++) {
      const o = k * BOK;
      if (!BO[o + 7]) continue;
      moving = true;
      const x = BO[o]! + BO[o + 3]! * dt, z = BO[o + 2]! + BO[o + 4]! * dt;
      BO[o] = x; BO[o + 2] = z;
      BO[o + 5] = BO[o + 5]! - dt;
      const g = h.t.height(x, z) + 0.45;
      BO[o + 1] = BO[o + 1]! < g ? g : BO[o + 1]! + (g - BO[o + 1]!) * Math.min(1, dt * 6);
      if (BO[o + 5]! <= 0 || x > h.HX || x < -h.HX || z > h.HZ || z < -h.HZ) {
        BO[o + 7] = 0;
        continue;
      }
      for (let d = 0; d < NC; d++) {
        if (d === BO[o + 6] || !ON[d]) continue;
        const dx = h.pos[d * 3]! - x, dz = h.pos[d * 3 + 2]! - z, dy = h.pos[d * 3 + 1]! - BO[o + 1]!;
        if (dx * dx + dz * dz < BOLT_R * BOLT_R && dy < 1.4 && dy > -1.4) {
          hit(d, H_STALL, BO[o + 6]!);
          BO[o + 7] = 0;
          break;
        }
      }
    }
    // Oil and mines: lying there until a car finds them (or their time is up).
    for (let k = 0; k < NHAZ; k++) {
      const o = k * ZK, kind = Z[o]!;
      if (!kind) continue;
      Z[o + 5] = Z[o + 5]! - dt;
      if (Z[o + 5]! <= 0) {
        Z[o] = 0;
        continue;
      }
      if (Z[o + 4]! > 0) (Z[o + 4] = Math.max(0, Z[o + 4]! - dt)), (moving = true);
      if (Z[o + 7]! > 0) {
        // The dropper is safe from its own slick until it has driven clear of it.
        const ow = Z[o + 6]!, dx = h.pos[ow * 3]! - Z[o + 1]!, dz = h.pos[ow * 3 + 2]! - Z[o + 3]!;
        if (dx * dx + dz * dz > 9) Z[o + 7] = 0;
      }
      if (kind === IT_MINE && Z[o + 4]! > 0) continue;
      const r = kind === IT_MINE ? MINE_R : OIL_R;
      for (let d = 0; d < NC; d++) {
        if (!ON[d] || HIT[d] || (kind === IT_OIL && d === Z[o + 6] && Z[o + 7]! > 0)) continue;
        const dx = h.pos[d * 3]! - Z[o + 1]!, dz = h.pos[d * 3 + 2]! - Z[o + 3]!, dy = h.pos[d * 3 + 1]! - Z[o + 2]!;
        if (dx * dx + dz * dz > r * r || dy > 1.6) continue;
        if (kind === IT_OIL && h.DS[d]![6]! > 0) continue;
        hit(d, kind === IT_MINE ? H_TUMBLE : H_SPIN, Z[o + 6]!);
        Z[o] = 0;
        break;
      }
    }
    return moving;
  }
  /** Car c's held item and shield (the HUD): [item, shield seconds]. */
  const held = (c: number) => H[c * HK]!;
  const shield = (c: number) => H[c * HK + 3]!;
  reset(seed);
  return {
    B, H, BO, Z, ON, BOT, BACK, HIT, BY, IO, NB,
    step, reset, held, shield, fire,
    set emit(f: (type: number, car: number, val: number) => unknown) {
      emit = f;
    },
    bytes: [B, H, BO, Z, IS],
  };
}
export type Items = ReturnType<typeof items>;
