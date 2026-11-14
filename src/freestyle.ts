// Dune Hop's Freestyle, headless (tests/freestyle.test.mjs plays it with no browser): one to four
// buggies loose on the park (./park.ts), no race and no clock for one; more people get a timed jam.
// Points: air (the airtime, judged on the landing like the race's air scorer: clean or sketchy), a
// transfer bonus for landing on another table, drift chains (a handbrake slide banked when it ends,
// ./handling.ts), each times the combo multiplier: every scoring move inside the combo window adds
// one to it (up to ×10); the window running out ends the combo, a crash or a sketchy landing loses
// it. A bad landing or a rollover is a tumble: the buggy rights itself and drives on (./tumble.ts); only
// a drive into the gap (or off the park) puts you back at your table's start. BATTLE puts item boxes
// on every table (./items.ts). With two or more people it is King of the Table: each has a glowing
// home pad (the centre of their own table); points scored are carried, and bank only when you get back
// onto your pad; a landing on someone else's pad steals a fifth of their banked points (carried: take
// them home); a tumble or a hit spills a quarter of what you carry. The most banked when the jam ends wins.
// Deterministic like the race: the seed, the inputs and the fixed step decide everything; a step
// allocates nothing (typed arrays only).
import { drive, type Drive } from "@fzlt/core/drive";
import { hypot } from "@fzlt/core/steer";
import { stunt, SC, CB, BEST, CLEANS, PTS, AIR, KIND, TOP, CLEAN, SKETCHY, type Stunt } from "./stunt.ts";
import { handling, D_AMT, D_ANG, D_SPD } from "./handling.ts";
import { sincos, SC as TRIG } from "./math.ts";
import { buildPark, TOP as TABLE_TOP, type Park } from "./park.ts";
import {
  K, IK, COUNT, RUN, DONE, DRIVE, CRASH, FIN, CAR_OPTS,
  PH, CT, BOOST, PP, PAIR, CRASHES, PARK, SPIN, SPINR, DPTS, DTIME, DTOTAL, HUMAN, STALL, EDGE, TLEN, KPOT, KSTEAL, KVICT,
  E_GO, E_COUNT, E_LAND, E_CRASH, E_RESPAWN, E_BOOST, E_AIR, E_BUMP, E_DONE, E_NITRO, E_DRIFT, E_DRIFT_LOST, E_SPIN,
  E_RIGHT, E_ITEM, E_FIRE, E_HIT, E_BLOCK, E_BANK, E_STEAL, E_SPILL,
} from "./race.ts";
import { tumbler, OVER, RIGHTED } from "./tumble.ts";
import { items, H_STALL, H_SPIN, H_TUMBLE } from "./items.ts";

/** Freestyle events (on top of the race's): a transfer to another table (value: the table), a combo's end (value: its size). */
export const E_XFER = 18, E_COMBO = 19;
/** Per car (on top of the race's slots): the table it is on, the one it took off from, the route
 *  point (autopilot), the combo window left, transfers, the last transfer's points. */
export const TABLE = 1, FROM = 2, WP = 3, CWIN = 5, XFERS = 7, XPTS = 14;
const COUNTDOWN = 3, BOOST_T = 0.9, BOOST_A = 12, BOOST_TOP = 15, NITRO_BURN = 0.45, WALL = 2.4, SPIN_T = 1.1;
const COMBO_T = 5, COMBO_MAX = 9, XFER_PTS = 250, FIXED = 1 / 60;
/** King of the Table: the home pad's radius, the share a steal takes, the share a spill loses, a
 *  steal's cool-down (s). */
export const HOME_R = 3.6, STEAL = 0.2, SPILL = 0.25, STEAL_T = 6;

export interface FreestyleOptions {
  /** People (1 to 4: two on a split screen, up to four online). */
  humans?: number;
  /** A timed jam, seconds (0: none; the default is 0 for one person, 180 for two). */
  jam?: number;
  /** BATTLE: item boxes on the tables (default off). */
  battle?: boolean;
  /** King of the Table: home pads, banking and steals (default: on with two people or more). */
  king?: boolean;
}

export function createFreestyle(seed = 1, fo: FreestyleOptions = {}) {
  const park: Park = buildPark(), t = park.t, tables = park.tables;
  const HUM = Math.max(1, Math.min(4, fo.humans ?? 1)), NC = HUM, JAM = fo.jam ?? (HUM > 1 ? 180 : 0), KING = fo.king ?? HUM > 1, BATTLE = !!fo.battle;
  const cars: Drive[] = [];
  for (let c = 0; c < NC; c++) cars.push(drive(t, { ...CAR_OPTS, surfaces: [0.92, 1.08, 1.02, 1.1, 1.1, 0.9, 1.12], id: c }));
  const DS = cars.map((v) => new Float64Array(v.landing.buffer));
  const C = new Float64Array(NC * K);
  /** [phase, clock, countdown left, done time, seed, −, time after done, any autopilot, −]. */
  const R = new Float64Array(9);
  const IN = new Float64Array(NC * IK), AUTO = new Uint8Array(NC), ON = new Uint8Array(NC);
  const hd = handling(cars, DS);
  const pos = new Float64Array(NC * 3), rot = new Float64Array(NC * 3);
  const scs: Stunt[] = [];
  for (let c = 0; c < NC; c++) scs.push(stunt());
  const N = new Float64Array(NC * 2), ev = new Float64Array(72), DT = new Float64Array(1), AI = new Float64Array(4);
  let nev = 0;
  const emit = (type: number, car: number, val: number) => nev < 24 && ((ev[nev * 3] = type), (ev[nev * 3 + 1] = car), (ev[nev * 3 + 2] = val), nev++);
  const tb = tumbler({ C, K, ct: CT, edge: EDGE, len: TLEN, pos, rot, cars, ground: (x, z) => (park.tableAt(x, z) >= 0 ? t.height(x, z) : -30) });
  const TV = tb.TV;
  /** King of the Table: each person's home pad [x, z] (the centre of their own table). */
  const HOME = new Float64Array(NC * 2);
  for (let c = 0; c < NC; c++) (HOME[c * 2] = tables[c % 4]!.spawn[0]), (HOME[c * 2 + 1] = tables[c % 4]!.spawn[1]);
  // BATTLE: on every table a row of three boxes on the run-up to its out-ramp (past the boost pad) and
  // one behind its centre.
  const BOXP: number[] = [];
  if (BATTLE)
    for (const tbl of tables) {
      const dx = (tbl.out[2] - tbl.out[0]) / 6.4, dz = (tbl.out[3] - tbl.out[1]) / 6.4;
      for (const [x0, z0] of [[tbl.out[0] + dx * 2, tbl.out[1] + dz * 2], [tbl.cx - dx * 8, tbl.cz - dz * 8]] as const)
        for (const s of [-2, 0, 2]) BOXP.push(x0 - dz * s, z0 + dx * s);
    }
  const it = items({ t, cars, DS, pos, HX: park.HX, HZ: park.HZ }, BOXP, seed, { get: E_ITEM, fire: E_FIRE, hit: E_HIT, block: E_BLOCK });
  it.emit = emit;

  /** Car c to its table's start (more people side by side across it). */
  function place(c: number, ti: number) {
    const sp = tables[ti]!.spawn, v = cars[c]!, o = c * K;
    TRIG[2] = sp[2];
    sincos();
    const side = KING ? 0 : NC > 2 ? (c - (NC - 1) / 2) * 1.8 : NC > 1 ? (c ? 1.8 : -1.8) : 0, fx = TRIG[1]!, fz = -TRIG[0]!;
    v.reset(sp[0] - fz * side, sp[1] + fx * side, sp[2]);
    C[o + TABLE] = ti;
    C[o + FROM] = ti;
    C[o + WP] = 0;
    pos.set(v.pos, c * 3);
    rot.set(v.rot, c * 3);
  }
  function reset(newSeed = seed) {
    seed = newSeed;
    C.fill(0);
    R.fill(0);
    R[0] = JAM ? COUNT : RUN;
    R[2] = JAM ? COUNTDOWN : 0;
    R[4] = seed;
    N.fill(0);
    IN.fill(0);
    for (const s of scs) s.reset();
    hd.reset();
    tb.reset();
    it.reset(seed);
    nev = 0;
    // One person starts on the Salt Flats; more start side by side there too (a jam is one park);
    // King of the Table starts everyone on their own pad.
    for (let c = 0; c < NC; c++) (C[c * K + HUMAN] = 1), place(c, KING ? c % 4 : 0);
  }

  /** A tumble (off 1: into the gap or off the park; big 1: a mine's): nobody is ever out. */
  function crash(c: number, off: number, big = 0) {
    const o = c * K;
    C[o + PH] = CRASH;
    C[o + CRASHES] = C[o + CRASHES]! + 1;
    C[o + BOOST] = 0;
    C[o + SPIN] = 0;
    C[o + STALL] = 0;
    loseDrift(c);
    endCombo(c, true);
    spill(c);
    const tl = tables[C[o + TABLE]!]!;
    (tb.HOME[c * 2] = tl.cx), (tb.HOME[c * 2 + 1] = tl.cz);
    tb.start(c, off, big);
    emit(E_CRASH, c, off ? 1 : big ? 2 : 0);
  }
  function tumble(c: number, dt: number) {
    const o = c * K, r = tb.step(c, dt === FIXED ? FIXED : dt);
    if (r === RIGHTED) (C[o + PH] = R[0] === DONE ? FIN : DRIVE), emit(E_RIGHT, c, 0);
    else if (r === OVER) {
      C[o + PH] = R[0] === DONE ? FIN : DRIVE;
      place(c, C[o + TABLE]!);
      emit(E_RESPAWN, c, C[o + TABLE]!);
    }
  }
  /** King of the Table: a tumble or a hit spills a share of what car c carries. */
  function spill(c: number) {
    const o = c * K, lost = Math.round(C[o + KPOT]! * SPILL);
    if (!KING || lost <= 0) return;
    C[o + KPOT] = C[o + KPOT]! - lost;
    emit(E_SPILL, c, lost);
  }
  /** Points car c scored: onto the score, or (King of the Table) carried until it banks them. */
  function gain(c: number, pts: number) {
    if (KING) C[c * K + KPOT] = C[c * K + KPOT]! + pts;
    else scs[c]!.S[SC] = scs[c]!.S[SC]! + pts;
  }
  /** On its own pad: bank what it carries. On another's, just landed: steal a share of their bank. */
  function king(c: number, landed: number) {
    const o = c * K, x = pos[c * 3]!, z = pos[c * 3 + 2]!;
    if (C[o + KSTEAL]! > 0) C[o + KSTEAL] = Math.max(0, C[o + KSTEAL]! - DT[0]!);
    for (let d = 0; d < NC; d++) {
      const dx = x - HOME[d * 2]!, dz = z - HOME[d * 2 + 1]!;
      if (dx * dx + dz * dz > HOME_R * HOME_R) continue;
      if (d === c) {
        const pot = Math.round(C[o + KPOT]!);
        if (pot > 0) (scs[c]!.S[SC] = scs[c]!.S[SC]! + pot), (C[o + KPOT] = 0), emit(E_BANK, c, pot);
      } else if (landed && !(C[o + KSTEAL]! > 0)) {
        const S = scs[d]!.S, take = Math.floor(S[SC]! * STEAL);
        if (take <= 0) continue;
        S[SC] = S[SC]! - take;
        C[o + KPOT] = C[o + KPOT]! + take;
        C[o + KSTEAL] = STEAL_T;
        C[o + KVICT] = d;
        emit(E_STEAL, c, take);
      }
    }
  }
  /** BATTLE: what each hit this step does (the items decided who was hit; a shield took its own). */
  function hits() {
    for (let c = 0; c < NC; c++) {
      const k = it.HIT[c]!, o = c * K, v = cars[c]!;
      if (!k || C[o + PH] !== DRIVE) continue;
      if (k === H_TUMBLE) {
        crash(c, 0, 1);
        continue;
      }
      spill(c);
      if (k === H_SPIN) spin(c, (c + it.BY[c]!) & 1 ? 1 : -1, 1);
      else if (k === H_STALL) {
        C[o + STALL] = 0.95;
        C[o + BOOST] = 0;
        v.vel[0] = v.vel[0]! * 0.42;
        v.vel[2] = v.vel[2]! * 0.42;
        if (DS[c]![6]! === 0) v.vel[1] = v.vel[1]! + 2.4;
        loseDrift(c);
      }
    }
  }
  function loseDrift(c: number) {
    const o = c * K;
    if (C[o + DPTS]! >= 10) emit(E_DRIFT_LOST, c, Math.round(C[o + DPTS]!));
    C[o + DPTS] = C[o + DTIME] = 0;
  }
  /** The combo ends: run out (banked: the points already count) or lost (a crash, a sketchy landing). */
  function endCombo(c: number, lost: boolean) {
    const S = scs[c]!.S;
    if (S[CB]! > 0) emit(E_COMBO, c, lost ? -S[CB]! : S[CB]!);
    S[CB] = 0;
    C[c * K + CWIN] = 0;
  }
  /** A scoring move: points times the multiplier; the combo grows and its window restarts. Returns the points (in S[PTS]). */
  function score(c: number, base: number) {
    const S = scs[c]!.S, pts = Math.round(base) * (1 + S[CB]!);
    gain(c, pts);
    S[PTS] = pts;
    S[CB] = Math.min(COMBO_MAX, S[CB]! + 1);
    S[TOP] = Math.max(S[TOP]!, S[CB]!);
    C[c * K + CWIN] = COMBO_T;
  }
  function spin(c: number, dir: number, oil = 0) {
    const o = c * K;
    if (C[o + PH] !== DRIVE || (C[o + SPIN]! > 0 && !oil)) return;
    C[o + SPIN] = oil ? SPIN_T * 1.25 : SPIN_T;
    C[o + SPINR] = dir < 0 ? -7.5 : 7.5;
    C[o + BOOST] = 0;
    loseDrift(c);
    if (!oil) emit(E_SPIN, c, 0);
  }
  function onHit(a: number, b: number, tail: number) {
    const j = hd.HIT[0]!;
    for (let k = 0; k < 2; k++) {
      const c = k ? b : a, o = c * K, drifting = hd.DR[c * 4 + D_AMT]! > 0.35 || Math.abs(hd.DR[c * 4 + D_ANG]!) > 0.42;
      if ((drifting && j > 1.1) || (k && tail && j > 4.5)) spin(c, hd.DR[c * 4 + D_ANG]! >= 0 ? 1 : -1);
      else if (C[o + DPTS]! > 0 && j > 1.5) loseDrift(c);
    }
    if (j > 1.5) emit(E_BUMP, a, j);
  }

  /** The autopilot (tests, a person's AUTO): the table's route to its out-ramp, level in the air. out = [throttle, brake, steer, nitro]. */
  function pilot(c: number, out: Float64Array) {
    const o = c * K, v = cars[c]!, rt = park.route[C[o + TABLE]!]!;
    let w = C[o + WP]!;
    TRIG[2] = DS[c]![0]!;
    sincos();
    const fx = TRIG[1]!, fz = -TRIG[0]!, sp = DS[c]![8]!;
    // The next route point once this one is reached (or passed).
    for (let k = 0; k < 2 && w < 2; k++) {
      const dx = rt[w * 4]! - v.pos[0]!, dz = rt[w * 4 + 1]! - v.pos[2]!;
      if (hypot(dx, dz) < 3 || (w && dx * fx + dz * fz < 0)) w++;
    }
    C[o + WP] = w;
    const ux = rt[w * 4]! - v.pos[0]!, uz = rt[w * 4 + 1]! - v.pos[2]!, ul = hypot(ux, uz) || 1;
    const cross = (fx * uz - fz * ux) / ul, dot = (fx * ux + fz * uz) / ul, want = rt[w * 4 + 2]! * (dot < 0.8 ? 0.5 : 1);
    out[2] = dot < 0 ? (cross < 0 ? -1 : 1) : Math.max(-1, Math.min(1, cross * 3));
    const p = v.rot[2]!, rate = (p - C[o + PP]!) * 60;
    C[o + PP] = p;
    out[3] = 0;
    if (DS[c]![6]! > 0) {
      // Level it to the landing: nose a little down (the ramps fall away from the gap).
      const q = p + rate * 0.3 + (w === 2 ? 0.22 : 0);
      out[0] = q < -0.05 ? 1 : 0;
      out[1] = q > 0.05 ? 1 : 0;
    } else {
      out[0] = sp < want ? 1 : sp < want + 0.8 ? 0.3 : 0;
      out[1] = sp > want + 1.6 ? 0.7 : 0;
      if (rt[w * 4 + 3]! && N[c * 2]! > 0.2 && Math.abs(cross) < 0.1) out[3] = 1;
    }
    return out;
  }

  function input(c: number, th: number, br: number, st: number, ni: number, dr = 0, item = 0) {
    const q = c * IK;
    IN[q] = th; IN[q + 1] = br; IN[q + 2] = st; IN[q + 3] = ni; IN[q + 4] = dr; IN[q + 5] = item;
  }
  /** Advance dt; true while anything moves (a jam's clock, a car, a combo's window). */
  function step(dt: number) {
    DT[0] = dt;
    let moving = false, anyAuto = 0;
    for (let c = 0; c < NC; c++) anyAuto |= AUTO[c]!;
    R[7] = anyAuto;
    if (R[0] === COUNT) {
      const before = Math.ceil(R[2]!);
      R[2] = R[2]! - dt;
      if (Math.ceil(R[2]!) !== before && R[2]! > 0) emit(E_COUNT, 0, Math.ceil(R[2]!));
      if (R[2]! <= 0) (R[0] = RUN), (R[2] = 0), emit(E_GO, 0, 0);
      moving = true;
    } else {
      R[1] = R[1]! + dt;
      if (R[0] === DONE) R[6] = R[6]! + dt;
      else if (JAM) {
        moving = true;
        if (R[1]! >= JAM) finish();
      }
    }
    for (let c = 0; c < NC; c++) {
      const o = c * K, v = cars[c]!, q = c * IK, S = scs[c]!.S;
      if (C[o + PH] === CRASH) {
        v.set(0, 0, 0);
        tumble(c, dt);
        moving = true;
        continue;
      }
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0;
      const stopping = R[0] === DONE;
      if (stopping && C[o + PARK]! >= 1) continue;
      if (R[0] === COUNT) a0 = a1 = a2 = 0;
      else if (stopping) (a1 = DS[c]![8]! > 0.3 ? 1 : 0), (a0 = DS[c]![8]! < -0.3 ? 0.5 : 0);
      else if (AUTO[c]) pilot(c, AI), (a0 = AI[0]!), (a1 = AI[1]!), (a2 = AI[2]!), (a3 = AI[3]!);
      else (a0 = IN[q]!), (a1 = IN[q + 1]!), (a2 = IN[q + 2]!), (a3 = IN[q + 3]!), (a4 = IN[q + 4]!);
      if (C[o + SPIN]! > 0) {
        C[o + SPIN] = Math.max(0, C[o + SPIN]! - dt);
        (a0 = 0), (a1 = 0.25), (a2 = 0), (a3 = 0), (a4 = 1);
      }
      if (C[o + STALL]! > 0) (C[o + STALL] = Math.max(0, C[o + STALL]! - dt)), (a0 *= 0.15), (a3 = 0);
      v.input[0] = a0; v.input[1] = a1; v.input[2] = a2; v.input[3] = a4;
      const wasAir = DS[c]![6]!;
      if (v.step(dt === FIXED ? FIXED : dt)) moving = true;
      if (C[o + SPIN]! > 0) {
        const y = DS[c]![0]! + C[o + SPINR]! * dt;
        DS[c]![0] = y;
        v.rot[1] = y;
        C[o + SPINR] = C[o + SPINR]! * (1 - 1.6 * dt);
      } else (hd.IO[0] = a4), (hd.IO[1] = a2), (hd.IO[2] = dt), hd.drift(c);
      if (R[0] === COUNT) v.vel[0] = v.vel[2] = 0;
      // Boost: a pad's, or your nitro.
      let push = 0;
      if (C[o + BOOST]! > 0) (C[o + BOOST] = Math.max(0, C[o + BOOST]! - dt)), (push = 1);
      if (a3 && N[c * 2]! > 0 && R[0] === RUN && C[o + PH] === DRIVE) {
        N[c * 2] = Math.max(0, N[c * 2]! - NITRO_BURN * dt);
        push = 1;
        if (!N[c * 2 + 1]) (N[c * 2 + 1] = 1), emit(E_NITRO, c, 1);
      } else N[c * 2 + 1] = 0;
      if (push && DS[c]![6]! === 0 && hypot(v.vel[0]!, v.vel[2]!) < BOOST_TOP) {
        TRIG[2] = DS[c]![0]!;
        sincos();
        v.vel[0] = v.vel[0]! + TRIG[1]! * BOOST_A * dt;
        v.vel[2] = v.vel[2]! - TRIG[0]! * BOOST_A * dt;
      }
      wall(c, 0);
      wall(c, 2);
      if (stopping) {
        if (DS[c]![6]! === 0 && Math.abs(DS[c]![8]!) < 0.4) (C[o + PARK] = C[o + PARK]! + dt), C[o + PARK]! >= 0.5 && (C[o + PARK] = 1);
        else C[o + PARK] = 0;
      }
      pos.set(v.pos, c * 3);
      rot.set(v.rot, c * 3);
      const air = DS[c]![6]!, ti = park.tableAt(v.pos[0]!, v.pos[2]!);
      if (wasAir === 0 && air > 0) (C[o + FROM] = C[o + TABLE]!), emit(E_AIR, c, 0);
      if (air > 0) C[o + PAIR] = air;
      // The combo's window runs while nothing scores.
      if (C[o + CWIN]! > 0) {
        moving = true;
        C[o + CWIN] = C[o + CWIN]! - dt;
        if (C[o + CWIN]! <= 0 && !(air > 0) && !(C[o + DTIME]! > 0)) endCombo(c, false);
        else if (C[o + CWIN]! <= 0) C[o + CWIN] = 0.001;
      }
      if (v.crashed) {
        crash(c, 0);
        continue;
      }
      // Into the gap (or over the park's edge): a crash, back to the table it was on.
      if ((ti < 0 && v.pos[1]! < TABLE_TOP - 0.7) || Math.abs(v.pos[0]!) > park.HX - 0.3 || Math.abs(v.pos[2]!) > park.HZ - 0.3) {
        crash(c, 1);
        continue;
      }
      if (ti >= 0 && air === 0) {
        if (ti !== C[o + TABLE]) (C[o + TABLE] = ti), (C[o + WP] = 0);
      }
      if (R[0] === COUNT || stopping) continue;
      // A landing: the airtime judged on how far off the slope it came down; another table is a transfer.
      if (wasAir > 0 && air === 0) {
        const at = C[o + PAIR]!, err = v.landing[1]!;
        if (at >= 0.3) {
          const clean = err <= 0.2;
          S[AIR] = at;
          S[BEST] = Math.max(S[BEST]!, at);
          S[KIND] = clean ? CLEAN : SKETCHY;
          if (clean) score(c, at * 100), (S[CLEANS] = S[CLEANS]! + 1);
          else {
            const pts = Math.round(at * 50);
            endCombo(c, true);
            gain(c, pts);
            S[PTS] = pts;
          }
          N[c * 2] = Math.min(1, N[c * 2]! + (clean ? 0.14 + 0.04 * Math.min(4, S[CB]!) : 0.05));
          emit(E_LAND, c, S[KIND]!);
          if (ti >= 0 && ti !== C[o + FROM] && C[o + FROM]! >= 0) {
            const p0 = S[PTS]!;
            score(c, XFER_PTS);
            C[o + XPTS] = S[PTS]!;
            S[PTS] = p0;
            C[o + XFERS] = C[o + XFERS]! + 1;
            emit(E_XFER, c, ti);
          }
        }
      }
      driftScore(c);
      if (KING && air === 0) king(c, wasAir > 0 && C[o + PAIR]! >= 0.3 ? 1 : 0);
      if (air === 0 && park.padAt(v.pos[0]!, v.pos[2]!) >= 0) {
        if (C[o + BOOST]! < BOOST_T - 0.2) emit(E_BOOST, c, 0);
        C[o + BOOST] = BOOST_T;
      }
    }
    if (R[0] !== COUNT) {
      for (let c = 0; c < NC; c++) ON[c] = C[c * K + PH] === DRIVE ? 1 : 0;
      hd.contact(ON, onHit);
      for (let c = 0; c < NC; c++) pos.set(cars[c]!.pos, c * 3), rot.set(cars[c]!.rot, c * 3);
    }
    if (BATTLE && R[0] === RUN) {
      // The draw's rubber band: by score, lowest gets the best (alone: the middle).
      for (let c = 0; c < NC; c++) {
        let below = 0;
        for (let d = 0; d < NC; d++) if (scs[d]!.S[SC]! + C[d * K + KPOT]! > scs[c]!.S[SC]! + C[c * K + KPOT]!) below++;
        (it.ON[c] = C[c * K + PH] === DRIVE ? 1 : 0), (it.BOT[c] = AUTO[c]!), (it.BACK[c] = NC > 1 ? below / (NC - 1) : 0.5);
      }
      it.IO[0] = dt;
      if (it.step(IN, IK)) moving = true;
      hits();
    }
    return moving || !resting();
  }
  function wall(c: number, k: number) {
    const dt = DT[0]!, h = k ? park.HZ : park.HX, v = cars[c]!, x = v.pos[k]!, over = (x < 0 ? -x : x) - (h - WALL);
    if (over <= 0) return;
    const out = x < 0 ? -1 : 1, vo = v.vel[k]! * out;
    v.vel[k] = v.vel[k]! - out * over * 16 * dt - (vo > 0 ? vo * Math.min(0.9, over * 2.2 * dt * 4) : 0);
  }
  function driftScore(c: number) {
    const dt = DT[0]!, o = c * K, a = hd.DR[c * 4 + D_AMT]!, ang = Math.abs(hd.DR[c * 4 + D_ANG]!), sp = hd.DR[c * 4 + D_SPD]!;
    if (a > 0.3 && ang > 0.22 && sp > 4.5 && DS[c]![6]! === 0) {
      C[o + DPTS] = C[o + DPTS]! + ang * sp * dt * 10;
      C[o + DTIME] = C[o + DTIME]! + dt;
    } else if (C[o + DTIME]! > 0 && (a < 0.15 || ang < 0.12)) {
      const pts = Math.round(C[o + DPTS]!);
      if (pts >= 10) {
        score(c, pts);
        N[c * 2] = Math.min(1, N[c * 2]! + Math.min(0.25, pts / 400));
        C[o + DTOTAL] = C[o + DTOTAL]! + pts;
        emit(E_DRIFT, c, scs[c]!.S[PTS]!);
      }
      C[o + DPTS] = C[o + DTIME] = 0;
    }
  }
  function resting() {
    for (let c = 0; c < NC; c++) if (C[c * K + PH] === CRASH || (C[c * K + PARK]! < 1 && !cars[c]!.resting)) return false;
    return true;
  }
  /** End the jam now (its clock ran out, a surrender, a test). */
  function finish() {
    if (R[0] === DONE) return;
    for (let c = 0; c < NC; c++) if (C[c * K + PH] === DRIVE) C[c * K + PH] = FIN;
    R[0] = DONE;
    R[3] = R[1]!;
    emit(E_DONE, 0, winner() + 1);
  }
  /** The leader by score (a tie at the top: −1). */
  function winner() {
    if (NC < 2) return 0;
    let w = 0, tie = false;
    for (let c = 1; c < NC; c++) {
      const a = scs[c]!.S[SC]!, b = scs[w]!.S[SC]!;
      if (a > b) (w = c), (tie = false);
      else if (a === b) tie = true;
    }
    return tie ? -1 : w;
  }

  reset(seed);
  return {
    kind: "free" as const,
    def: park.def, park, t, HX: park.HX, HZ: park.HZ, cars, C, R, pos, rot, N, ev, IN, AUTO, DR: hd.DR, scs, sc: scs[0]!,
    count: NC,
    humans: HUM,
    /** BATTLE (the items), King of the Table (the home pads [x, z] per person, their radius). */
    battle: BATTLE, items: it, king: KING, HOME, HOME_R,
    /** The jam's length (0: none). */
    jam: JAM,
    name: (c: number) => (HUM > 1 ? "P" + (c + 1) : "YOU"),
    get n() {
      return nev;
    },
    clear: () => void (nev = 0),
    step, input, reset, finish, pilot, winner,
    /** Put car c at table ti's start (tests, a menu preview). */
    place,
    LIPS: park.LIPS, PADV: park.PADV, PAD_LEN: park.PAD_LEN, PAD_W: park.PAD_W,
    /** The whole state as bytes (the online desync check hashes it). */
    bytes: [C, R, pos, rot, TV, N, hd.DR, ...DS, ...scs.map((s) => s.S), ...it.bytes].map((a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)),
  };
}
export type Freestyle = ReturnType<typeof createFreestyle>;
