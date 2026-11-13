// Dune Hop's race, headless (tests/race.test.mjs plays it with no browser): four buggies on one
// track, each @fzlt/core/drive on the track's terrain. Car 0 is yours; 1..3 are rivals driven by a
// waypoint AI (look ahead along the line, steer at it, hold the speed the line allows, level the nose
// in the air; a seeded pace and, each lap, a seeded pick of the shortcut). A countdown, then laps
// through the gates in order; a landing too far off the slope, a rollover or a drive off the table
// crashes: a short tumble, then back in at the last gate. Boost pads kick anyone who drives over them;
// your clean landings fill NITRO (the air scorer is ./stunt.ts). Cars bump each other. The race ends
// when you take the line on the last lap (`finish()` ends it at once); the others run to the line, then
// everyone coasts to a stop so the page can settle.
// Deterministic: the seed, the inputs and the fixed step decide everything (./math.ts, no Math.random,
// no builtin trig), and a step allocates nothing (typed arrays only).
import { drive, type Drive } from "@fzlt/core/drive";
import { hypot } from "@fzlt/core/steer";
import { seeded } from "@fzlt/core/kernel";
import { buildTrack, TRACK_W, type Track, type TrackDef } from "./tracks.ts";
import { stunt, BUMP, CLEAN, CB } from "./stunt.ts";
import { atan2, sincos, SC as TRIG } from "./math.ts";

export const CARS = 4, COUNT = 0, RUN = 1, DONE = 2;
/** Car phases. */
export const DRIVE = 0, CRASH = 1, FIN = 2;
/** Events (type, car, value): read and cleared each step. */
export const E_GO = 1, E_GATE = 2, E_LAP = 3, E_LAND = 4, E_CRASH = 5, E_RESPAWN = 6, E_FINISH = 7, E_BOOST = 8, E_AIR = 9, E_COUNT = 10, E_WRONG = 11, E_BUMP = 12, E_DONE = 13, E_NITRO = 14;
export const RIVALS = [
  { name: "VOLT", pace: 0.97 },
  { name: "MIRAGE", pace: 0.94 },
  { name: "RUST", pace: 0.9 },
];
const TUMBLE = 1.3, COUNTDOWN = 3, BOOST_T = 1.1, BOOST_A = 15, BOOST_TOP = 16.5, NITRO_BURN = 0.45, SAND_DRAG = 0.55, RAD = 0.82;
// Per car state (Float64Array, K slots each).
const K = 24, FIXED = 1 / 60;
export const PH = 0, NEXT = 1, LAST = 2, LAP = 3, PI_ = 4, IDX = 5, U = 6, PROG = 7, DIST = 8, FT = 9, CT = 10, BOOST = 11, PP = 12, LAPT = 13, BEST = 14, WRONG = 15, PLACE = 16, PAIR = 17, SHORT = 18, PACE = 19, OFF = 20, CRASHES = 21, RACED = 22, PARK = 23;

const CAR_OPTS = {
  kind: "car" as const, wheels: [0.8, -0.64, 0.8, 0.64, -0.74, -0.64, -0.74, 0.64], radius: 0.36, rest: 0.34, travel: 0.3,
  accel: 9, top: 12, grip: 1.08, steer: 0.62, steerFall: 13, airPitch: 6, crashPitch: 0.72, crashRoll: 1.05, hz: 2.1, damping: 0.7,
  surfaces: [0.92, 1.08, 1.08],
};

export function createRace(def: TrackDef, seed = 1) {
  const tr: Track = buildTrack(def), t = tr.t, main = tr.main, NG = tr.GATE.length, LAPS = def.laps;
  const cars: Drive[] = [];
  for (let c = 0; c < CARS; c++) cars.push(drive(t, { ...CAR_OPTS, top: c ? 12 * (0.985 + RIVALS[c - 1]!.pace * 0.02) : 12, id: c }));
  // Each drive's state, read straight from its Float64Array (the one `landing` is a view into): yaw 0,
  // air 6, speed 8. Its getters return fresh numbers, and with four cars (four sets of getters) the
  // optimiser can't inline them, so every read would allocate; the arrays never do.
  const DS = cars.map((v) => new Float64Array(v.landing.buffer));
  const C = new Float64Array(CARS * K);
  /** Race: [phase, clock (from GO), countdown left, done time, seed, finish order count, time after done, autopilot on]. */
  const R = new Float64Array(8);
  /** Per car: where the body is drawn and how it is turned (the drive's, or the tumble's). */
  const pos = new Float64Array(CARS * 3), rot = new Float64Array(CARS * 3), TV = new Float64Array(CARS * 6);
  /** The finish order: car ids. */
  const order = new Int32Array(CARS);
  /** Standings now (car ids, first to last). */
  const rank = new Int32Array(CARS);
  /** Each car's finish time (0: not yet). */
  const fin = new Float64Array(CARS);
  const sc = stunt({ minAir: 0.3, clean: 0.2, perSec: 100 });
  /** Your nitro, 0..1. */
  const N = new Float64Array(2);
  const ev = new Float64Array(48);
  let nev = 0, rnd = seeded(seed);
  const emit = (type: number, car: number, val: number) => nev < 16 && ((ev[nev * 3] = type), (ev[nev * 3 + 1] = car), (ev[nev * 3 + 2] = val), nev++);
  const GX = new Float64Array(CARS * 2);

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
    sc.reset();
    nev = 0;
    // The grid: two by two behind the line; you start at the back.
    const g0 = main.n - 1;
    const slots = [[3.2, -0.95], [3.2, 0.95], [6.6, -0.95], [6.6, 0.95]];
    for (let c = 0; c < CARS; c++) {
      const s = slots[c === 0 ? 3 : c - 1]!, o = c * K;
      place(c, g0, s[0]!, s[1]!);
      GX[c * 2] = cars[c]!.pos[0]!;
      GX[c * 2 + 1] = cars[c]!.pos[2]!;
      C[o + NEXT] = 1;
      C[o + IDX] = (g0 - Math.round(s[0]! / 0.5) + main.n) % main.n;
      C[o + PACE] = c ? RIVALS[c - 1]!.pace * (0.985 + rnd() * 0.03) : 1;
      C[o + SHORT] = c ? (rnd() < 0.5 ? 1 : 0) : 1;
      rank[c] = c;
    }
    for (let c = 0; c < CARS; c++) locate(c);
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
  function crash(c: number, off: boolean) {
    const o = c * K, v = cars[c]!;
    C[o + PH] = CRASH;
    C[o + CT] = 0;
    C[o + CRASHES] = C[o + CRASHES]! + 1;
    C[o + BOOST] = 0;
    if (!c) sc.crash();
    pos.set(v.pos, c * 3);
    rot.set(v.rot, c * 3);
    const T = c * 6;
    TV[T] = v.vel[0]! * 0.7; TV[T + 1] = Math.max(3, v.vel[1]! + 4); TV[T + 2] = v.vel[2]! * 0.7;
    TV[T + 3] = 7 + Math.abs(DS[c]![8]!) * 0.3; TV[T + 4] = 2.2; TV[T + 5] = (v.rot[2]! < 0 ? -1 : 1) * 5;
    emit(E_CRASH, c, off ? 1 : 0);
  }
  /** The tumble: thrown up, spinning, bouncing on the sand (or off the table's edge, down). */
  function tumble(c: number, dt: number) {
    const o = c * K, T = c * 6, p = c * 3;
    C[o + CT] = C[o + CT]! + dt;
    TV[T + 1] = TV[T + 1]! - 20 * dt;
    for (let k = 0; k < 3; k++) (pos[p + k] = pos[p + k]! + TV[T + k]! * dt), (rot[p + k] = rot[p + k]! + TV[T + 3 + k]! * dt);
    const inside = Math.abs(pos[p]!) < tr.HX && Math.abs(pos[p + 2]!) < tr.HZ, g = inside ? t.height(pos[p]!, pos[p + 2]!) + 0.4 : -30;
    if (pos[p + 1]! < g) {
      pos[p + 1] = g;
      TV[T + 1] = Math.abs(TV[T + 1]!) * 0.38;
      TV[T] = TV[T]! * 0.6; TV[T + 2] = TV[T + 2]! * 0.6;
      TV[T + 3] = TV[T + 3]! * 0.55; TV[T + 4] = TV[T + 4]! * 0.5; TV[T + 5] = TV[T + 5]! * 0.55;
    }
    if (C[o + CT]! >= TUMBLE) {
      C[o + PH] = C[o + FT]! > 0 ? FIN : DRIVE;
      const g = tr.GATE[C[o + LAST]! % NG]!;
      place(c, g, 1.6, 0);
      locate(c);
      emit(E_RESPAWN, c, C[o + LAST]!);
    }
  }

  /** The AI (and your autopilot): out = [throttle, brake, steer, nitro]. */
  function pilot(c: number, out: Float64Array) {
    const o = c * K, v = cars[c]!;
    let pi = C[o + PI_]!, i = C[o + IDX]!;
    // Look ahead along the planned route (the shortcut when this lap's plan says so).
    const sp = DS[c]![8]!, look = 3.2 + Math.max(0, sp) * 0.34;
    let want = 99;
    const steps = Math.ceil(look / 0.5), slow = Math.ceil((2 + Math.max(0, sp) * 0.7) / 0.5);
    let tx = 0, tz = 0;
    for (let k = 0; k <= Math.max(steps, slow); k++) {
      const p = tr.paths[pi]!;
      if (k <= slow) want = Math.min(want, p.V[i]!);
      if (k === steps) (tx = p.P[i * 2]!), (tz = p.P[i * 2 + 1]!);
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
    const fx = TRIG[1]!, fz = -TRIG[0]!, ux = tx - v.pos[0]!, uz = tz - v.pos[2]!, ul = hypot(ux, uz) || 1;
    const cross = (fx * uz - fz * ux) / ul, dot = (fx * ux + fz * uz) / ul;
    want *= C[o + PACE]!;
    // Racing a person: a little rubber band (a rival well behind pushes, one well ahead eases off).
    if (c && !R[7]) want *= 1 + Math.max(-0.06, Math.min(0.07, (C[RACED]! - C[o + RACED]!) / 50));
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
      if (!c && N[0]! > 0.3 && want > 11 && Math.abs(cross) < 0.12) out[3] = 1;
    }
    return out;
  }

  const AI = new Float64Array(4);
  /** Advance dt. Your inputs: throttle 0..1, brake 0..1, steer −1..1, nitro 0/1 (`auto`: the autopilot
   *  drives you). Returns true while anything moves. */
  function step(dt: number, th: number, br: number, st: number, ni: number, auto = false) {
    let moving = false;
    R[7] = auto ? 1 : 0;
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
    for (let c = 0; c < CARS; c++) {
      const o = c * K, v = cars[c]!;
      if (C[o + PH] === CRASH) {
        v.set(0, 0, 0);
        tumble(c, dt);
        moving = true;
        continue;
      }
      // Inputs: held at the line in the countdown; the AI; you; coasting to a stop after the line.
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      // Past the line: a cool-down at half pace, then (once your race is over) a stop.
      const cool = C[o + PH] === FIN, stopping = R[0] === DONE && (R[6]! > 20 || (cool && R[6]! > 3) || (!c && cool));
      if (stopping && C[o + PARK]! >= 1) continue;
      if (R[0] === COUNT) a0 = a1 = a2 = 0;
      else if (stopping) (a1 = DS[c]![8]! > 0.3 ? 1 : 0), (a0 = DS[c]![8]! < -0.3 ? 0.5 : 0), (a2 = 0);
      else if (cool) pilot(c, AI), (a0 = AI[0]! * 0.45), (a1 = AI[1]!), (a2 = AI[2]!);
      else if (c || auto) pilot(c, AI), (a0 = AI[0]!), (a1 = AI[1]!), (a2 = AI[2]!), (a3 = AI[3]!);
      else (a0 = th), (a1 = br), (a2 = st), (a3 = ni);
      v.input[0] = a0; v.input[1] = a1; v.input[2] = a2; v.input[3] = 0;
      const wasAir = DS[c]![6]!;
      // The fixed step as a constant: a double passed to a call that isn't inlined is boxed (allocated).
      if (v.step(dt === FIXED ? FIXED : dt)) moving = true;
      // On the grid: held where it was placed (no creeping down a slope before the lights).
      if (R[0] === COUNT) (v.pos[0] = GX[c * 2]!), (v.pos[2] = GX[c * 2 + 1]!), (v.vel[0] = v.vel[2] = 0);
      // Boost (a pad's, or your nitro): a push along the heading, up to a higher top speed.
      let push = 0;
      if (C[o + BOOST]! > 0) (C[o + BOOST] = Math.max(0, C[o + BOOST]! - dt)), (push = 1);
      if (!c && a3 && N[0]! > 0 && R[0] === RUN && C[o + PH] === DRIVE) {
        N[0] = Math.max(0, N[0]! - NITRO_BURN * dt);
        push = 1;
        if (!N[1]) (N[1] = 1), emit(E_NITRO, 0, 1);
      } else if (!c) N[1] = 0;
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
      // A landing: yours is judged by the scorer (the drive already crashed it when it was too far off).
      if (wasAir > 0 && DS[c]![6]! === 0 && !v.crashed && !c) {
        const k = sc.land(C[o + PAIR]!, v.landing[1]!);
        if (k !== BUMP) {
          N[0] = Math.min(1, N[0]! + (k === CLEAN ? 0.1 + 0.05 * Math.min(4, sc.S[CB]!) : 0.04));
          emit(E_LAND, 0, k);
        }
      }
      if (v.crashed) {
        crash(c, false);
        continue;
      }
      if (Math.abs(v.pos[0]!) > tr.HX - 0.25 || Math.abs(v.pos[2]!) > tr.HZ - 0.25) {
        crash(c, true);
        continue;
      }
      locate(c);
      // A pad under the wheels.
      tr.NQ[0] = v.pos[0]!;
      tr.NQ[1] = v.pos[2]!;
      if (DS[c]![6]! === 0 && tr.padQ() >= 0) {
        if (C[o + BOOST]! < BOOST_T - 0.2) emit(E_BOOST, c, 0);
        C[o + BOOST] = BOOST_T;
      }
      // Wrong way (yours): heading back along the line for a second.
      if (!c) {
        const p = tr.paths[C[o + PI_]!]!, i = C[o + IDX]!, along = v.vel[0]! * p.T[i * 2]! + v.vel[2]! * p.T[i * 2 + 1]!;
        const was = C[o + WRONG]!;
        C[o + WRONG] = along < -1.5 ? was + dt : 0;
        if (was < 1 && C[o + WRONG]! >= 1) emit(E_WRONG, 0, 0);
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
          if (c) C[o + SHORT] = rnd() < 0.55 ? 1 : 0;
          if (C[o + NEXT]! > NG * LAPS) {
            C[o + PH] = FIN;
            C[o + FT] = R[1]!;
            fin[c] = R[1]!;
            order[R[5]!] = c;
            R[5] = R[5]! + 1;
            emit(E_FINISH, c, R[5]!);
            if (!c && R[0] === RUN) (R[0] = DONE), (R[3] = R[1]!), emit(E_DONE, 0, R[5]!);
          } else emit(E_LAP, c, C[o + LAP]!);
        } else emit(E_GATE, c, g);
        locate(c);
      }
    }
    if (R[0] !== COUNT) bump(dt);
    ranks();
    return moving || R[0] !== DONE || !resting();
  }
  /** Cars bump: pushed apart, the closing speed taken out (a little bounce). */
  function bump(dt: number) {
    for (let a = 0; a < CARS; a++)
      for (let b = a + 1; b < CARS; b++) {
        if (C[a * K + PH] !== DRIVE || C[b * K + PH] !== DRIVE) continue;
        const A = cars[a]!, B = cars[b]!, dx = B.pos[0]! - A.pos[0]!, dz = B.pos[2]! - A.pos[2]!, dy = B.pos[1]! - A.pos[1]!, d = hypot(dx, dz);
        if (d >= RAD * 2 || d < 1e-6 || dy > 0.9 || dy < -0.9) continue;
        const nx = dx / d, nz = dz / d, push = (RAD * 2 - d) / 2;
        A.pos[0] = A.pos[0]! - nx * push; A.pos[2] = A.pos[2]! - nz * push;
        B.pos[0] = B.pos[0]! + nx * push; B.pos[2] = B.pos[2]! + nz * push;
        const rv = (B.vel[0]! - A.vel[0]!) * nx + (B.vel[2]! - A.vel[2]!) * nz;
        if (rv < 0) {
          const j = -rv * 0.65;
          A.vel[0] = A.vel[0]! - nx * j; A.vel[2] = A.vel[2]! - nz * j;
          B.vel[0] = B.vel[0]! + nx * j; B.vel[2] = B.vel[2]! + nz * j;
          if (j > 1.5 && (a === 0 || b === 0)) emit(E_BUMP, a === 0 ? b : a, j);
        }
        pos.set(A.pos, a * 3);
        pos.set(B.pos, b * 3);
        void dt;
      }
  }
  /** Standings: finished cars by order, then by distance raced (an insertion sort: no allocation). */
  function ranks() {
    for (let k = 0; k < CARS; k++) rank[k] = k;
    for (let k = 1; k < CARS; k++) {
      const c = rank[k]!;
      let j = k - 1;
      while (j >= 0 && ahead(c, rank[j]!)) (rank[j + 1] = rank[j]!), j--;
      rank[j + 1] = c;
    }
    for (let k = 0; k < CARS; k++) C[rank[k]! * K + PLACE] = k + 1;
  }
  function ahead(a: number, b: number) {
    const fa = fin[a]!, fb = fin[b]!;
    if (fa && fb) return fa < fb;
    if (fa || fb) return !!fa;
    return C[a * K + DIST]! > C[b * K + DIST]!;
  }
  function resting() {
    for (let c = 0; c < CARS; c++) if (C[c * K + PH] === CRASH || (C[c * K + PARK]! < 1 && !cars[c]!.resting)) return false;
    return true;
  }
  /** End the race now (a surrender, a test): the standings as they are. */
  function finish() {
    if (R[0] === DONE) return;
    for (let c = 0; c < CARS; c++) {
      const r = rank[c]!;
      if (!fin[r]) fin[r] = R[1]! + 0.001 * (c + 1);
      C[r * K + FT] = fin[r]!;
      if (C[r * K + PH] === DRIVE) C[r * K + PH] = FIN;
      order[c] = r;
    }
    R[5] = CARS;
    R[0] = DONE;
    R[3] = R[1]!;
    R[6] = 99;
    emit(E_DONE, 0, C[PLACE]!);
  }

  reset(seed);
  return {
    def, tr, t, cars, C, R, pos, rot, rank, order, fin, sc, N, ev,
    get n() {
      return nev;
    },
    clear: () => void (nev = 0),
    step, reset, finish, pilot,
    /** Seconds of tumble before a respawn. */
    tumble: TUMBLE,
    laps: LAPS,
    gates: NG,
  };
}
export type Race = ReturnType<typeof createRace>;
