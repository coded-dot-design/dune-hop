// Dune Hop's race, headless (tests/race.test.mjs plays it with no browser): N buggies on one track,
// each @fzlt/core/drive on the track's terrain. Cars 0..humans−1 are people (inputs per car in `IN`,
// or the autopilot per car in `AUTO`); the rest are rivals driven by a waypoint AI (look ahead along
// the line, steer at it, hold the speed the line allows, level the nose in the air; a seeded pace and,
// each lap, a seeded pick of the shortcut; it sees the other cars: it brakes behind one it can't
// pass, steps out round it, and RUST leans on anyone in reach). A handbrake drift on each person's
// car scores drift points; a hit while drifting spins you out (./handling.ts). A countdown, then laps
// through the gates in order; a landing too far off the slope or a rollover is a tumble (./tumble.ts):
// a short roll, and the buggy rights itself and drives on from where it came down; only a drive off
// the table puts it back in at the last gate; soft walls at the table's edge turn a car back before
// it goes over. BATTLE (`battle`) puts item boxes on the track (./items.ts): a bolt stalls you, oil
// spins you out, a mine throws you into a big tumble, a shield blocks one; never out, no health. Boost pads kick anyone who drives over them; clean landings and banked
// drifts fill NITRO (the air scorer is ./stunt.ts). The race ends when every person has taken the
// line on the last lap (`finish()` ends it at once); the others run to the line, then everyone
// coasts to a stop so the page can settle.
// Deterministic: the seed, the inputs and the fixed step decide everything (./math.ts, no Math.random,
// no builtin trig), and a step allocates nothing (typed arrays only).
import { drive, type Drive } from "@fzlt/core/drive";
import { hypot } from "@fzlt/core/steer";
import { seeded } from "@fzlt/core/kernel";
import { buildTrack, TRACK_W, type Track, type TrackDef } from "./tracks.ts";
import { stunt, BUMP, CLEAN, CB, type Stunt } from "./stunt.ts";
import { handling, D_AMT, D_ANG, D_SPD } from "./handling.ts";
import { atan2, sincos, SC as TRIG } from "./math.ts";
import { tumbler, OVER, RIGHTED } from "./tumble.ts";
import { items, H_STALL, H_SPIN, H_TUMBLE } from "./items.ts";

export const CARS = 4, MAX_CARS = 6, COUNT = 0, RUN = 1, DONE = 2;
/** Car phases. */
export const DRIVE = 0, CRASH = 1, FIN = 2;
/** Events (type, car, value): read and cleared each step. */
export const E_GO = 1, E_GATE = 2, E_LAP = 3, E_LAND = 4, E_CRASH = 5, E_RESPAWN = 6, E_FINISH = 7, E_BOOST = 8, E_AIR = 9, E_COUNT = 10, E_WRONG = 11, E_BUMP = 12, E_DONE = 13, E_NITRO = 14, E_DRIFT = 15, E_DRIFT_LOST = 16, E_SPIN = 17;
/** BATTLE and the tumble: back on its wheels (no respawn), an item taken (value: the item), fired
 *  (value: the item), a hit (value: kind × 8 + by), a shield's block (value: by); King of the Table
 *  (Freestyle): points banked, stolen (value: points; C[KVICT] whose), spilled. */
export const E_RIGHT = 20, E_ITEM = 21, E_FIRE = 22, E_HIT = 23, E_BLOCK = 24, E_BANK = 25, E_STEAL = 26, E_SPILL = 27;
const EV_ITEMS = { get: E_ITEM, fire: E_FIRE, hit: E_HIT, block: E_BLOCK };
/** The rivals: a pace, and how they treat other cars (0 steps round them, 1 leans on them). */
export const RIVALS = [
  { name: "VOLT", pace: 0.97, agg: 0 },
  { name: "MIRAGE", pace: 0.94, agg: 0.4 },
  { name: "RUST", pace: 0.9, agg: 1 },
  { name: "DUNE", pace: 0.92, agg: 0.2 },
  { name: "ECHO", pace: 0.88, agg: 0.6 },
];
const COUNTDOWN = 3, BOOST_T = 0.9, BOOST_A = 12, BOOST_TOP = 15, NITRO_BURN = 0.45, SAND_DRAG = 0.55;
/** The soft wall: this far in from the table's edge it starts to push a car back. */
const WALL = 3.2, SPIN_T = 1.1;
// Per car state (Float64Array, K slots each).
export const K = 40;
const FIXED = 1 / 60;
export const PH = 0, NEXT = 1, LAST = 2, LAP = 3, PI_ = 4, IDX = 5, U = 6, PROG = 7, DIST = 8, FT = 9, CT = 10, BOOST = 11, PP = 12, LAPT = 13, BEST = 14, WRONG = 15, PLACE = 16, PAIR = 17, SHORT = 18, PACE = 19, OFF = 20, CRASHES = 21, RACED = 22, PARK = 23;
/** Spin-out time left, its rate; the AI's lateral offset; drift points pending, drift seconds, total drift points; aggression; a person. */
export const SPIN = 24, SPINR = 25, OFFS = 26, DPTS = 27, DTIME = 28, DTOTAL = 29, AGG = 30, HUMAN = 31;
/** A stall left (a bolt's hit); the tumble: over the edge (1), its length; King of the Table: points
 *  carried (unbanked), a steal's cool-down, the last one robbed. */
export const STALL = 32, EDGE = 33, TLEN = 34, KPOT = 35, KSTEAL = 36, KVICT = 37, STUCK = 38;
/** Inputs per car in IN (IK slots): throttle, brake, steer, nitro, drift, item. */
export const IK = 6;
/** A stall: seconds, the speed kept. */
const STALL_T = 0.95, STALL_KEEP = 0.42;

export const CAR_OPTS = {
  kind: "car" as const, wheels: [0.8, -0.78, 0.8, 0.78, -0.74, -0.76, -0.74, 0.76], radius: 0.36, rest: 0.34, travel: 0.3,
  accel: 9, top: 12, grip: 1.08, drift: 0.2, steer: 0.62, steerFall: 13, airPitch: 6, crashPitch: 0.72, crashRoll: 1.05, hz: 2.1, damping: 0.7,
  surfaces: [0.92, 1.08, 1.08],
};

export interface RaceOptions {
  /** People (cars 0..humans−1; default 1, at most 4: two on a split screen, up to four online). */
  humans?: number;
  /** AI rivals after them (default 3). */
  rivals?: number;
  /** Laps (default the track's). */
  laps?: number;
  /** BATTLE: item boxes on the track (default off: CLEAN). */
  battle?: boolean;
}

export function createRace(def: TrackDef, seed = 1, ro: RaceOptions = {}) {
  const tr: Track = buildTrack(def), t = tr.t, main = tr.main, NG = tr.GATE.length, LAPS = Math.max(1, ro.laps || def.laps);
  const HUM = Math.max(1, Math.min(4, ro.humans ?? 1)), NC = Math.min(MAX_CARS, HUM + Math.max(0, ro.rivals ?? 3));
  /** Rival profile of car c (people: none). */
  const rival = (c: number) => RIVALS[(c - HUM) % RIVALS.length]!;
  const cars: Drive[] = [];
  for (let c = 0; c < NC; c++) cars.push(drive(t, { ...CAR_OPTS, top: c >= HUM ? 12 * (0.985 + rival(c).pace * 0.02) : 12, id: c }));
  // Each drive's state, read straight from its Float64Array (the one `landing` is a view into): yaw 0,
  // air 6, speed 8. Its getters return fresh numbers, and with four cars (four sets of getters) the
  // optimiser can't inline them, so every read would allocate; the arrays never do.
  const DS = cars.map((v) => new Float64Array(v.landing.buffer));
  const C = new Float64Array(NC * K);
  /** Race: [phase, clock (from GO), countdown left, done time, seed, finish order count, time after done, any autopilot, the people's best distance raced]. */
  const R = new Float64Array(9);
  /** Inputs per car (IK each) and the autopilot per car (rivals always). */
  const IN = new Float64Array(NC * IK), AUTO = new Uint8Array(NC), ON = new Uint8Array(NC);
  const hd = handling(cars, DS);
  /** Per car: where the body is drawn and how it is turned (the drive's, or the tumble's). */
  const pos = new Float64Array(NC * 3), rot = new Float64Array(NC * 3);
  /** The finish order: car ids. */
  const order = new Int32Array(NC);
  /** Standings now (car ids, first to last). */
  const rank = new Int32Array(NC);
  /** Each car's finish time (0: not yet). */
  const fin = new Float64Array(NC);
  /** The air scorer, per person. */
  const scs: Stunt[] = [];
  for (let c = 0; c < HUM; c++) scs.push(stunt({ minAir: 0.3, clean: 0.2, perSec: 100 }));
  const sc = scs[0]!;
  /** Nitro per car: [0..1, burning]. */
  const N = new Float64Array(NC * 2);
  const ev = new Float64Array(72);
  let nev = 0, rnd = seeded(seed);
  const emit = (type: number, car: number, val: number) => nev < 24 && ((ev[nev * 3] = type), (ev[nev * 3 + 1] = car), (ev[nev * 3 + 2] = val), nev++);
  const GX = new Float64Array(NC * 2);
  const tb = tumbler({ C, K, ct: CT, edge: EDGE, len: TLEN, pos, rot, cars, ground: (x, z) => (Math.abs(x) < tr.HX && Math.abs(z) < tr.HZ ? t.height(x, z) : -30) });
  const TV = tb.TV;
  // BATTLE: four rows of three boxes across the road, clear of the kickers, the pads and the line.
  const BATTLE = !!ro.battle, BOXP: number[] = [];
  if (BATTLE) {
    const clash = (i: number) => {
      const d = (j: number) => Math.min(Math.abs(i - j), main.n - Math.abs(i - j));
      for (let k = 0; k < tr.ramps.length; k += 4) if (!tr.ramps[k] && d(((tr.ramps[k + 2]! % main.n) + main.n) % main.n) < 22) return true;
      for (let k = 0; k < tr.PADS.length; k += 2) if (!tr.PADS[k] && d(tr.PADS[k + 1]!) < 14) return true;
      return d(tr.GATE[0]!) < 16;
    };
    for (const f of [0.17, 0.41, 0.64, 0.86]) {
      let i = Math.round(main.n * f) % main.n;
      for (let k = 0; k < 16 && clash(i); k++) i = (i + 5) % main.n;
      for (const s of [-1.8, 0, 1.8]) BOXP.push(main.P[i * 2]! - main.T[i * 2 + 1]! * s, main.P[i * 2 + 1]! + main.T[i * 2]! * s);
    }
  }
  const it = items({ t, cars, DS, pos, HX: tr.HX, HZ: tr.HZ }, BOXP, seed, EV_ITEMS);
  it.emit = emit;

  /** Place car c `back` units behind main index i, `side` across, facing along the line. */
  function place(c: number, i: number, back: number, side: number) {
    const tx = main.T[i * 2]!, tz = main.T[i * 2 + 1]!, v = cars[c]!;
    const x = main.P[i * 2]! - tx * back - tz * side, z = main.P[i * 2 + 1]! - tz * back + tx * side;
    v.reset(x, z, atan2(-tz, tx));
    const o = c * K;
    C[o + PI_] = 0;
    C[o + IDX] = i;
    pos.set(v.pos, c * 3);
    rot.set(v.rot, c * 3);
  }
  function reset(newSeed = seed) {
    seed = newSeed;
    rnd = seeded(seed);
    C.fill(0);
    R.fill(0);
    R[2] = COUNTDOWN;
    R[4] = seed;
    fin.fill(0);
    order.fill(-1);
    N.fill(0);
    IN.fill(0);
    for (const s of scs) s.reset();
    hd.reset();
    tb.reset();
    it.reset(seed);
    nev = 0;
    // The grid: two by two behind the line; the rivals in front, the people at the back. Each row sits
    // on the line where it is (not straight back from the start), so a third row stays on the road
    // even where the start follows a bend.
    const g0 = main.n - 1, w = TRACK_W * 0.27;
    for (let c = 0; c < NC; c++) {
      const slot = c >= HUM ? c - HUM : NC - HUM + c, o = c * K, s = [3.4 + (slot >> 1) * 3.6, slot & 1 ? w : -w];
      place(c, (g0 - Math.round(s[0]! / 0.5) + main.n) % main.n, 0, s[1]!);
      GX[c * 2] = cars[c]!.pos[0]!;
      GX[c * 2 + 1] = cars[c]!.pos[2]!;
      C[o + NEXT] = 1;
      C[o + IDX] = (g0 - Math.round(s[0]! / 0.5) + main.n) % main.n;
      C[o + HUMAN] = c < HUM ? 1 : 0;
      C[o + PACE] = c >= HUM ? rival(c).pace * (0.985 + rnd() * 0.03) : 1;
      C[o + AGG] = c >= HUM ? rival(c).agg : 0;
      C[o + SHORT] = c >= HUM ? (rnd() < 0.5 ? 1 : 0) : 1;
      rank[c] = c;
    }
    for (let c = 0; c < NC; c++) locate(c);
    ranks();
  }

  /** Where car c is on the track: nearest path point (kept when it is far off), progress, off the track. */
  function locate(c: number) {
    const o = c * K, v = cars[c]!;
    tr.NQ[0] = v.pos[0]!;
    tr.NQ[1] = v.pos[2]!;
    const NR = tr.nearQ();
    if (NR[0]! < Infinity && follows(C[o + PI_]!, C[o + IDX]!, NR[1]!, NR[2]!)) {
      C[o + PI_] = NR[1]!;
      C[o + IDX] = NR[2]!;
      C[o + U] = NR[3]!;
    }
    C[o + OFF] = NR[0]! > TRACK_W / 2 + 0.3 ? 1 : 0;
    {
      // Progress round the loop (a branch maps onto the span it skips); inline: no doubles passed to calls.
      const p = tr.paths[C[o + PI_]!]!, i = C[o + IDX]!, j = (i + 1) % p.n, sp = p.S[i]! + (p.closed && j === 0 ? p.len - p.S[i]! : p.S[j]! - p.S[i]!) * C[o + U]!;
      C[o + PROG] = C[o + PI_] ? main.S[p.from]! + (main.S[p.to]! - main.S[p.from]!) * (sp / (p.len || 1)) : sp;
    }
    // Distance raced: gates passed, then how far past the last one (the loop's length wraps).
    const gl = main.S[tr.GATE[C[o + LAST]! % NG]!]!;
    let past = C[o + PROG]! - gl;
    past -= main.len * Math.floor(past / main.len + 0.5);
    C[o + DIST] = (C[o + NEXT]! - 1) * 10000 + Math.max(-50, past);
    // Units raced from the line (continuous; behind the line at the start is negative).
    const pr = C[o + PROG]!;
    C[o + RACED] = C[o + LAP]! * main.len + (C[o + NEXT] === 1 && pr > main.len / 2 ? pr - main.len : pr);
  }

  /** Within 24 points of each other along path p (round the loop). */
  function near(p: number, a: number, b: number) {
    const n = tr.paths[p]!.n;
    let x = a - b;
    if (tr.paths[p]!.closed) x -= n * Math.floor(x / n + 0.5);
    return x > -24 && x < 24;
  }
  /** Does the nearest point (pj, j) follow on from (pi, i)? Where two stretches of track pass close,
   *  a car out wide must not snap to the other one: a jump along the line is taken only near the line. */
  function follows(pi: number, i: number, pj: number, j: number) {
    if (tr.NR[0]! < 0.9) return true;
    if (pi === pj) return near(pi, i, j);
    const bi = pj ? pj : pi, br = tr.paths[bi]!;
    // Onto a branch from the loop near where it leaves; back onto the loop near where it rejoins.
    if (pj) return (near(0, i, br.from) && j < 24) || (near(0, i, br.to) && j > br.n - 24);
    return (i < 24 && near(0, j, br.from)) || (i > br.n - 24 && near(0, j, br.to));
  }
  /** A tumble (off 1: over the table's edge; big 1: a mine's): nobody is ever out. */
  function crash(c: number, off: number, big = 0) {
    const o = c * K;
    C[o + PH] = CRASH;
    C[o + CRASHES] = C[o + CRASHES]! + 1;
    C[o + BOOST] = 0;
    C[o + STALL] = 0;
    if (c < HUM) scs[c]!.crash();
    C[o + SPIN] = 0;
    loseDrift(c);
    const i = C[o + PI_]!, pa = tr.paths[i]!, j = C[o + IDX]!;
    (tb.HOME[c * 2] = pa.P[j * 2]!), (tb.HOME[c * 2 + 1] = pa.P[j * 2 + 1]!);
    tb.start(c, off, big);
    emit(E_CRASH, c, off ? 1 : big ? 2 : 0);
  }
  /** The tumble: it rights itself where it came down; over the edge, back in at the last gate. */
  function tumble(c: number, dt: number) {
    const o = c * K, r = tb.step(c, dt === FIXED ? FIXED : dt);
    if (r === RIGHTED) {
      C[o + PH] = C[o + FT]! > 0 ? FIN : DRIVE;
      locate(c);
      emit(E_RIGHT, c, 0);
    } else if (r === OVER) {
      C[o + PH] = C[o + FT]! > 0 ? FIN : DRIVE;
      const g = tr.GATE[C[o + LAST]! % NG]!;
      place(c, g, 1.6, 0);
      locate(c);
      emit(E_RESPAWN, c, C[o + LAST]!);
    }
  }

  /** A drift's points are gone (a crash, a spin, a hit). */
  function loseDrift(c: number) {
    const o = c * K;
    if (C[o + DPTS]! >= 10) emit(E_DRIFT_LOST, c, Math.round(C[o + DPTS]!));
    C[o + DPTS] = C[o + DTIME] = 0;
  }
  /** Spun out by a hit: a second or so of spinning on loose tyres, then back to it. */
  function spin(c: number, dir: number, oil = 0) {
    const o = c * K;
    if (C[o + PH] !== DRIVE || (C[o + SPIN]! > 0 && !oil)) return;
    C[o + SPIN] = oil ? SPIN_T * 1.25 : SPIN_T;
    C[o + SPINR] = dir < 0 ? -7.5 : 7.5;
    C[o + BOOST] = 0;
    loseDrift(c);
    if (!oil) emit(E_SPIN, c, 0);
  }
  /** BATTLE: what each hit this step does (the items brick decided who was hit, a shield took its own). */
  function hits() {
    for (let c = 0; c < NC; c++) {
      const k = it.HIT[c]!, o = c * K, v = cars[c]!;
      if (!k || C[o + PH] !== DRIVE) continue;
      if (k === H_TUMBLE) crash(c, 0, 1);
      else if (k === H_SPIN) spin(c, (c + it.BY[c]!) & 1 ? 1 : -1, 1);
      else if (k === H_STALL) {
        C[o + STALL] = STALL_T;
        C[o + BOOST] = 0;
        v.vel[0] = v.vel[0]! * STALL_KEEP;
        v.vel[2] = v.vel[2]! * STALL_KEEP;
        if (DS[c]![6]! === 0) v.vel[1] = v.vel[1]! + 2.4;
        loseDrift(c);
      }
    }
  }
  /** A contact (handling.ts): a drifting car that is hit spins out; so does one hit hard on its tail. */
  function onHit(a: number, b: number, tail: number) {
    const j = hd.HIT[0]!;
    for (let k = 0; k < 2; k++) {
      const c = k ? b : a, o = c * K, drifting = hd.DR[c * 4 + D_AMT]! > 0.35 || Math.abs(hd.DR[c * 4 + D_ANG]!) > 0.42;
      if ((drifting && j > 1.1) || (k && tail && j > 4.5)) spin(c, hd.DR[c * 4 + D_ANG]! >= 0 ? 1 : -1);
      else if (C[o + DPTS]! > 0 && j > 1.5) loseDrift(c);
    }
    if (j > 1.5 && (a < HUM || b < HUM)) emit(E_BUMP, a < HUM ? b : a, j);
  }

  /** The AI (and a person's autopilot): out = [throttle, brake, steer, nitro]. It follows the planned
   *  route and watches the cars ahead: brakes behind one it can't pass, steps round it, or (RUST)
   *  leans into it. */
  function pilot(c: number, out: Float64Array) {
    const o = c * K, v = cars[c]!;
    let pi = C[o + PI_]!, i = C[o + IDX]!;
    // Look ahead along the planned route (the shortcut when this lap's plan says so).
    const sp = DS[c]![8]!, look = 3.4 + Math.max(0, sp) * 0.36;
    let want = 99;
    const steps = Math.ceil(look / 0.5), slow = Math.ceil((2 + Math.max(0, sp) * 0.7) / 0.5);
    let tx = 0, tz = 0, nx = 0, nz = 0;
    for (let k = 0; k <= Math.max(steps, slow); k++) {
      const p = tr.paths[pi]!;
      if (k <= slow) want = Math.min(want, p.V[i]!);
      if (k === steps) (tx = p.P[i * 2]!), (tz = p.P[i * 2 + 1]!), (nx = -p.T[i * 2 + 1]!), (nz = p.T[i * 2]!);
      // Next point on the route.
      if (pi === 0) {
        let took = false;
        for (let b = 1; b < tr.paths.length; b++)
          if (C[o + SHORT]! && i === tr.paths[b]!.from) {
            pi = b;
            i = 1;
            took = true;
            break;
          }
        if (!took) i = (i + 1) % main.n;
      } else if (i + 1 >= tr.paths[pi]!.n) (i = tr.paths[pi]!.to), (pi = 0);
      else i++;
    }
    TRIG[2] = DS[c]![0]!;
    sincos();
    const fx = TRIG[1]!, fz = -TRIG[0]!;
    // The other cars: the nearest one ahead in reach decides the line.
    let off = 0, near = 99;
    for (let d = 0; d < NC; d++) {
      if (d === c || C[d * K + PH] !== DRIVE) continue;
      const dx = CP[d * 4]! - v.pos[0]!, dz = CP[d * 4 + 1]! - v.pos[2]!, along = dx * fx + dz * fz, across = dx * -fz + dz * fx;
      if (along < 0.5 || along > 9 || across > 3.4 || across < -3.4 || along > near) continue;
      near = along;
      const dv = CP[d * 4 + 2]! * fx + CP[d * 4 + 3]! * fz;
      const attack = C[o + AGG]! >= 1 || (C[o + AGG]! > 0 && (hd.DR[d * 4 + D_AMT]! > 0.3 || C[d * K + HUMAN]! > 0) && C[o + AGG]! * 9 > along);
      if (attack && along < 7) off = Math.max(-2.2, Math.min(2.2, across));
      else {
        off = across >= 0 ? across - 2.2 : across + 2.2;
        if (along < 3.4 && across < 1.5 && across > -1.5 && dv < sp) want = Math.min(want, Math.max(3, dv - 0.4));
      }
    }
    const lim = TRACK_W / 2 - 1.1;
    C[o + OFFS] = C[o + OFFS]! + (Math.max(-lim, Math.min(lim, off)) - C[o + OFFS]!) * 0.06;
    tx += nx * C[o + OFFS]!;
    tz += nz * C[o + OFFS]!;
    const ux = tx - v.pos[0]!, uz = tz - v.pos[2]!, ul = hypot(ux, uz) || 1;
    const cross = (fx * uz - fz * ux) / ul, dot = (fx * ux + fz * uz) / ul;
    want *= C[o + PACE]!;
    // Racing people: a little rubber band (a rival well behind pushes, one well ahead eases off).
    if (c >= HUM && !R[7]) want *= 1 + Math.max(-0.06, Math.min(0.07, (R[8]! - C[o + RACED]!) / 50));
    out[2] = dot < 0 ? (cross < 0 ? -1 : 1) : Math.max(-1, Math.min(1, cross * 3));
    const p = v.rot[2]!, rate = (p - C[o + PP]!) * 60;
    C[o + PP] = p;
    out[3] = 0;
    if (DS[c]![6]! > 0) {
      // Level it: pitch and its rate (nose up +): brake tips the nose down, throttle lifts it.
      const q = p + rate * 0.3;
      out[0] = q < -0.05 ? 1 : 0;
      out[1] = q > 0.05 ? 1 : 0;
    } else {
      out[0] = sp < want ? 1 : sp < want + 0.8 ? 0.3 : 0;
      out[1] = sp > want + 1.6 ? 0.7 : 0;
      if (c < HUM && N[c * 2]! > 0.3 && want > 11 && Math.abs(cross) < 0.12) out[3] = 1;
      // Stuck (nose in a berm, against a wall): back out, wheel the other way, then go again.
      const st = C[o + STUCK]!;
      if (st > 1.4) (out[0] = 0), (out[1] = 1), (out[2] = -out[2]! || 1), (C[o + STUCK] = st > 2.6 ? 0 : st + FIXED);
      else C[o + STUCK] = out[0]! > 0.5 && sp < 0.8 && sp > -0.8 ? st + FIXED : 0;
    }
    return out;
  }

  const AI = new Float64Array(4), DT = new Float64Array(1);
  /** Every car's [x, z, vx, vz] as the step began: what the AI sees of the others (typed reads only). */
  const CP = new Float64Array(NC * 4);
  /** Set person c's inputs (or write IN directly): throttle 0..1, brake 0..1, steer −1..1, nitro 0/1, drift 0..1, item 0/1. */
  function input(c: number, th: number, br: number, st: number, ni: number, dr = 0, item = 0) {
    const q = c * IK;
    IN[q] = th; IN[q + 1] = br; IN[q + 2] = st; IN[q + 3] = ni; IN[q + 4] = dr; IN[q + 5] = item;
  }
  /** Advance dt: people drive from IN (or the autopilot when AUTO[c]); the rivals from the AI.
   *  Returns true while anything moves. */
  function step(dt: number) {
    DT[0] = dt;
    for (let c = 0; c < NC; c++) (CP[c * 4] = pos[c * 3]!), (CP[c * 4 + 1] = pos[c * 3 + 2]!), (CP[c * 4 + 2] = cars[c]!.vel[0]!), (CP[c * 4 + 3] = cars[c]!.vel[2]!);
    let moving = false, anyAuto = 0;
    for (let c = 0; c < HUM; c++) anyAuto |= AUTO[c]!;
    R[7] = anyAuto;
    R[8] = -1e9;
    for (let c = 0; c < HUM; c++) R[8] = Math.max(R[8]!, C[c * K + RACED]!);
    if (R[0] === COUNT) {
      const before = Math.ceil(R[2]!);
      R[2] = R[2]! - dt;
      if (Math.ceil(R[2]!) !== before && R[2]! > 0) emit(E_COUNT, 0, Math.ceil(R[2]!));
      if (R[2]! <= 0) (R[0] = RUN), (R[2] = 0), emit(E_GO, 0, 0);
      moving = true;
    } else {
      R[1] = R[1]! + dt;
      if (R[0] === DONE) R[6] = R[6]! + dt;
    }
    for (let c = 0; c < NC; c++) {
      const o = c * K, v = cars[c]!, you = c < HUM, q = c * IK;
      if (C[o + PH] === CRASH) {
        v.set(0, 0, 0);
        tumble(c, dt);
        moving = true;
        continue;
      }
      // Inputs: held at the line in the countdown; the AI; a person; coasting to a stop after the line.
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0;
      // Past the line: a cool-down at half pace, then (once the people's race is over) a stop.
      const cool = C[o + PH] === FIN, stopping = R[0] === DONE && (R[6]! > 20 || (cool && R[6]! > 3) || (you && cool));
      if (stopping && C[o + PARK]! >= 1) continue;
      if (R[0] === COUNT) a0 = a1 = a2 = 0;
      else if (stopping) (a1 = DS[c]![8]! > 0.3 ? 1 : 0), (a0 = DS[c]![8]! < -0.3 ? 0.5 : 0), (a2 = 0);
      else if (cool) pilot(c, AI), (a0 = AI[0]! * 0.45), (a1 = AI[1]!), (a2 = AI[2]!);
      else if (!you || AUTO[c]) pilot(c, AI), (a0 = AI[0]!), (a1 = AI[1]!), (a2 = AI[2]!), (a3 = AI[3]!);
      else (a0 = IN[q]!), (a1 = IN[q + 1]!), (a2 = IN[q + 2]!), (a3 = IN[q + 3]!), (a4 = IN[q + 4]!);
      // Spun out: no say for a moment, loose tyres, the body turning.
      if (C[o + SPIN]! > 0) {
        C[o + SPIN] = Math.max(0, C[o + SPIN]! - dt);
        (a0 = 0), (a1 = 0.25), (a2 = 0), (a3 = 0), (a4 = 1);
      }
      // Stalled by a bolt: a moment with almost no pull and no nitro.
      if (C[o + STALL]! > 0) (C[o + STALL] = Math.max(0, C[o + STALL]! - dt)), (a0 *= 0.15), (a3 = 0);
      v.input[0] = a0; v.input[1] = a1; v.input[2] = a2; v.input[3] = a4;
      const wasAir = DS[c]![6]!;
      // The fixed step as a constant: a double passed to a call that isn't inlined is boxed (allocated).
      if (v.step(dt === FIXED ? FIXED : dt)) moving = true;
      if (C[o + SPIN]! > 0) {
        const y = DS[c]![0]! + C[o + SPINR]! * dt;
        DS[c]![0] = y;
        v.rot[1] = y;
        C[o + SPINR] = C[o + SPINR]! * (1 - 1.6 * dt);
      } else (hd.IO[0] = a4), (hd.IO[1] = a2), (hd.IO[2] = dt), hd.drift(c);
      // On the grid: held where it was placed (no creeping down a slope before the lights).
      if (R[0] === COUNT) (v.pos[0] = GX[c * 2]!), (v.pos[2] = GX[c * 2 + 1]!), (v.vel[0] = v.vel[2] = 0);
      // Boost (a pad's, or your nitro): a push along the heading, up to a higher top speed.
      let push = 0;
      if (C[o + BOOST]! > 0) (C[o + BOOST] = Math.max(0, C[o + BOOST]! - dt)), (push = 1);
      if (you && a3 && N[c * 2]! > 0 && R[0] === RUN && C[o + PH] === DRIVE) {
        N[c * 2] = Math.max(0, N[c * 2]! - NITRO_BURN * dt);
        push = 1;
        if (!N[c * 2 + 1]) (N[c * 2 + 1] = 1), emit(E_NITRO, c, 1);
      } else if (you) N[c * 2 + 1] = 0;
      if (push && DS[c]![6]! === 0 && hypot(v.vel[0]!, v.vel[2]!) < BOOST_TOP) {
        TRIG[2] = DS[c]![0]!;
        sincos();
        const fx = TRIG[1]!, fz = -TRIG[0]!;
        v.vel[0] = v.vel[0]! + fx * BOOST_A * dt;
        v.vel[2] = v.vel[2]! + fz * BOOST_A * dt;
      }
      // Off the track, the sand drags.
      if (C[o + OFF] && DS[c]![6]! === 0) {
        const k = 1 - SAND_DRAG * dt;
        v.vel[0] = v.vel[0]! * k;
        v.vel[2] = v.vel[2]! * k;
      }
      // The soft wall: near the table's edge a car is turned back (on the ground or in the air).
      wall(c, 0);
      wall(c, 2);
      // Stopped after the race: parked (no more steps, so the page can settle).
      if (stopping) {
        if (DS[c]![6]! === 0 && Math.abs(DS[c]![8]!) < 0.4) (C[o + PARK] = C[o + PARK]! + dt), C[o + PARK]! >= 0.5 && (C[o + PARK] = 1);
        else C[o + PARK] = 0;
      }
      pos.set(v.pos, c * 3);
      rot.set(v.rot, c * 3);
      if (wasAir === 0 && DS[c]![6]! > 0) emit(E_AIR, c, 0);
      if (DS[c]![6]! > 0) C[o + PAIR] = DS[c]![6]!;
      if (R[0] === COUNT) continue;
      // A landing: a person's is judged by the scorer (the drive already crashed it when it was too far off).
      if (wasAir > 0 && DS[c]![6]! === 0 && !v.crashed && you) {
        const s = scs[c]!, k = s.land(C[o + PAIR]!, v.landing[1]!);
        if (k !== BUMP) {
          N[c * 2] = Math.min(1, N[c * 2]! + (k === CLEAN ? 0.1 + 0.05 * Math.min(4, s.S[CB]!) : 0.04));
          emit(E_LAND, c, k);
        }
      }
      if (v.crashed) {
        crash(c, 0);
        continue;
      }
      if (Math.abs(v.pos[0]!) > tr.HX - 0.25 || Math.abs(v.pos[2]!) > tr.HZ - 0.25) {
        crash(c, 1);
        continue;
      }
      locate(c);
      if (you) driftScore(c);
      // A pad under the wheels.
      tr.NQ[0] = v.pos[0]!;
      tr.NQ[1] = v.pos[2]!;
      if (DS[c]![6]! === 0 && tr.padQ() >= 0) {
        if (C[o + BOOST]! < BOOST_T - 0.2) emit(E_BOOST, c, 0);
        C[o + BOOST] = BOOST_T;
      }
      // Wrong way (a person's): heading back along the line for a second.
      if (you) {
        const p = tr.paths[C[o + PI_]!]!, i = C[o + IDX]!, along = v.vel[0]! * p.T[i * 2]! + v.vel[2]! * p.T[i * 2 + 1]!;
        const was = C[o + WRONG]!;
        C[o + WRONG] = along < -1.5 ? was + dt : 0;
        if (was < 1 && C[o + WRONG]! >= 1) emit(E_WRONG, c, 0);
      }
      // The next gate: through it when within reach of its centre.
      const g = C[o + NEXT]! % NG, gi = tr.GATE[g]!;
      if (!fin[c] && hypot(v.pos[0]! - main.P[gi * 2]!, v.pos[2]! - main.P[gi * 2 + 1]!) < TRACK_W * 0.8) {
        C[o + LAST] = g;
        C[o + NEXT] = C[o + NEXT]! + 1;
        if (g === 0) {
          const lt = R[1]! - C[o + LAPT]!;
          C[o + LAPT] = R[1]!;
          C[o + BEST] = C[o + BEST]! ? Math.min(C[o + BEST]!, lt) : lt;
          C[o + LAP] = C[o + LAP]! + 1;
          // This lap's route (the rivals): the shortcut or the long way, seeded.
          if (!you) C[o + SHORT] = rnd() < 0.55 ? 1 : 0;
          if (C[o + NEXT]! > NG * LAPS) {
            C[o + PH] = FIN;
            C[o + FT] = R[1]!;
            fin[c] = R[1]!;
            order[R[5]!] = c;
            R[5] = R[5]! + 1;
            emit(E_FINISH, c, R[5]!);
            if (you && R[0] === RUN && peopleDone()) (R[0] = DONE), (R[3] = R[1]!), emit(E_DONE, 0, C[PLACE]!);
          } else emit(E_LAP, c, C[o + LAP]!);
        } else emit(E_GATE, c, g);
        locate(c);
      }
    }
    if (R[0] !== COUNT) {
      for (let c = 0; c < NC; c++) ON[c] = C[c * K + PH] === DRIVE ? 1 : 0;
      hd.contact(ON, onHit);
      for (let c = 0; c < NC; c++) pos.set(cars[c]!.pos, c * 3), rot.set(cars[c]!.rot, c * 3);
    }
    if (BATTLE && R[0] === RUN) {
      for (let c = 0; c < NC; c++) (it.ON[c] = C[c * K + PH] === DRIVE ? 1 : 0), (it.BOT[c] = c >= HUM || AUTO[c] ? 1 : 0), (it.BACK[c] = NC > 1 ? (C[c * K + PLACE]! - 1) / (NC - 1) : 0);
      it.IO[0] = dt;
      if (it.step(IN, IK)) moving = true;
      hits();
    }
    ranks();
    if (R[0] === DONE && nev) for (let k = 0; k < nev; k++) if (ev[k * 3] === E_DONE) ev[k * 3 + 2] = C[PLACE]!;
    return moving || R[0] !== DONE || !resting();
  }
  function peopleDone() {
    for (let c = 0; c < HUM; c++) if (!fin[c]) return false;
    return true;
  }
  /** Axis k (0: x, 2: z) of car c against the table's edge (dt from DT: no doubles through calls). */
  function wall(c: number, k: number) {
    const dt = DT[0]!, h = k ? tr.HZ : tr.HX, v = cars[c]!, x = v.pos[k]!, over = (x < 0 ? -x : x) - (h - WALL);
    if (over <= 0) return;
    const out = x < 0 ? -1 : 1, vo = v.vel[k]! * out;
    v.vel[k] = v.vel[k]! - out * over * 16 * dt - (vo > 0 ? vo * Math.min(0.9, over * 2.2 * dt * 4) : 0);
  }
  /** Drift points (a person's): the slide's angle × speed while the handbrake is held on the ground,
   *  banked when the slide ends; lost on a crash, a spin or a hit. */
  function driftScore(c: number) {
    const dt = DT[0]!, o = c * K, a = hd.DR[c * 4 + D_AMT]!, ang = Math.abs(hd.DR[c * 4 + D_ANG]!), sp = hd.DR[c * 4 + D_SPD]!;
    if (a > 0.3 && ang > 0.22 && sp > 4.5 && DS[c]![6]! === 0) {
      C[o + DPTS] = C[o + DPTS]! + ang * sp * dt * (C[o + OFF] ? 5 : 10);
      C[o + DTIME] = C[o + DTIME]! + dt;
    } else if (C[o + DTIME]! > 0 && (a < 0.15 || ang < 0.12)) {
      const pts = Math.round(C[o + DPTS]!);
      if (pts >= 10) {
        scs[c]!.add(pts);
        N[c * 2] = Math.min(1, N[c * 2]! + Math.min(0.25, pts / 400));
        C[o + DTOTAL] = C[o + DTOTAL]! + pts;
        emit(E_DRIFT, c, pts);
      }
      C[o + DPTS] = C[o + DTIME] = 0;
    }
  }
  /** Standings: finished cars by order, then by distance raced (an insertion sort: no allocation). */
  function ranks() {
    for (let k = 0; k < NC; k++) rank[k] = k;
    for (let k = 1; k < NC; k++) {
      const c = rank[k]!;
      let j = k - 1;
      while (j >= 0 && ahead(c, rank[j]!)) (rank[j + 1] = rank[j]!), j--;
      rank[j + 1] = c;
    }
    for (let k = 0; k < NC; k++) C[rank[k]! * K + PLACE] = k + 1;
  }
  function ahead(a: number, b: number) {
    const fa = fin[a]!, fb = fin[b]!;
    if (fa && fb) return fa < fb;
    if (fa || fb) return !!fa;
    return C[a * K + DIST]! > C[b * K + DIST]!;
  }
  function resting() {
    for (let c = 0; c < NC; c++) if (C[c * K + PH] === CRASH || (C[c * K + PARK]! < 1 && !cars[c]!.resting)) return false;
    return true;
  }
  /** End the race now (a surrender, a test): the standings as they are. */
  function finish() {
    if (R[0] === DONE) return;
    for (let c = 0; c < NC; c++) {
      const r = rank[c]!;
      if (!fin[r]) fin[r] = R[1]! + 0.001 * (c + 1);
      C[r * K + FT] = fin[r]!;
      if (C[r * K + PH] === DRIVE) C[r * K + PH] = FIN;
      order[c] = r;
    }
    R[5] = NC;
    R[0] = DONE;
    R[3] = R[1]!;
    R[6] = 99;
    emit(E_DONE, 0, C[PLACE]!);
  }

  reset(seed);
  // For the scene: every jump lip [x0, z0, x1, z1] and every boost pad [x, z, tx, tz].
  const lips: number[] = [], pads: number[] = [], half = TRACK_W / 2 - 0.15;
  for (let k = 0; k < tr.ramps.length; k += 4) {
    const p = tr.paths[tr.ramps[k]!]!, i = ((tr.ramps[k + 2]! % p.n) + p.n) % p.n, x = p.P[i * 2]!, z = p.P[i * 2 + 1]!, nx = -p.T[i * 2 + 1]! * half, nz = p.T[i * 2]! * half;
    lips.push(x - nx, z - nz, x + nx, z + nz);
  }
  for (let k = 0; k < tr.PADS.length; k += 2) {
    const p = tr.paths[tr.PADS[k]!]!, i = tr.PADS[k + 1]!;
    pads.push(p.P[i * 2]!, p.P[i * 2 + 1]!, p.T[i * 2]!, p.T[i * 2 + 1]!);
  }
  return {
    kind: "race" as const,
    HX: tr.HX, HZ: tr.HZ, LIPS: Float64Array.from(lips), PADV: Float64Array.from(pads), PAD_LEN: tr.PAD_LEN, PAD_W: tr.PAD_W,
    /** The whole state as bytes (the online desync check hashes it). */
    bytes: [C, R, pos, rot, TV, N, fin, order, hd.DR, ...DS, ...scs.map((s) => s.S), ...it.bytes].map((a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)),
    /** BATTLE: the items (boxes, held, bolts, hazards), or none on. */
    battle: BATTLE, items: it,
    def, tr, t, cars, C, R, pos, rot, rank, order, fin, sc, scs, N, ev, IN, AUTO, DR: hd.DR,
    /** Cars in the race, and how many are people (cars 0..humans−1). */
    count: NC,
    humans: HUM,
    /** Car c's name (people: "YOU", or "P1", "P2" with two). */
    name: (c: number) => (c < HUM ? (HUM > 1 ? "P" + (c + 1) : "YOU") : rival(c).name),
    get n() {
      return nev;
    },
    clear: () => void (nev = 0),
    step, input, reset, finish, pilot,
    /** Seconds of tumble over the edge before a respawn. */
    tumble: 1.3,
    laps: LAPS,
    gates: NG,
  };
}
export type Race = ReturnType<typeof createRace>;
