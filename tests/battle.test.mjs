// Dune Hop BATTLE and the tumble, headless: no landing ever ends a run (every tumble comes down on its
// wheels where it landed; only a car over the table's edge goes back to its gate); boxes give items
// and come back; every hit type (a bolt's stall, oil's spin-out, a mine's big tumble) recovers; a
// shield blocks one; the AI picks up and fires; the same seed and inputs give the same battle (items
// and hits in the hash); King of the Table banks on your pad and steals from another's; a battle step
// allocates (almost) nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { PerformanceObserver } from "node:perf_hooks";
const { TRACKS } = await import("../src/tracks.ts");
const RC = await import("../src/race.ts");
const { createRace, K, RUN, DONE, DRIVE, CRASH, PH, STALL, SPIN, KPOT, E_CRASH, E_RIGHT, E_RESPAWN, E_ITEM, E_FIRE, E_HIT, E_BLOCK, E_BANK, E_STEAL } = RC;
const { createFreestyle } = await import("../src/freestyle.ts");
const { IT_BLASTER, IT_OIL, IT_MINE, IT_SHIELD, H_STALL, H_SPIN, H_TUMBLE, HK, ZK } = await import("../src/items.ts");
const { hashOf } = await import("../src/net.ts");

/** Step s n times (until(s) stops it early); the events as [type, car, value, frame]. */
function run(s, n, each, until) {
  const ev = [];
  for (let f = 0; f < n; f++) {
    each?.(s, f);
    s.step(1 / 60);
    for (let k = 0; k < s.n; k++) ev.push([s.ev[k * 3], s.ev[k * 3 + 1], s.ev[k * 3 + 2], f]);
    s.clear();
    if (until?.(s, ev)) break;
  }
  return ev;
}
const toGo = (s) => run(s, 60 * 4, (s) => (s.AUTO[0] = 1), (s) => s.R[0] === RUN && s.R[1] > 0.5);

test("no crash-out: on every track, nose-down and nose-up landings on every jump, every tumble rights itself where it came down", () => {
  let tumbles = 0;
  for (const def of TRACKS) {
    const r = createRace(def, 21, { rivals: 3 });
    const out = new Float64Array(4);
    // The autopilot drives; in the air the person slams the nose down or up (a seeded mix), every jump.
    const ev = run(r, 60 * 150, (r, f) => {
      r.pilot(0, out);
      const air = r.cars[0].air > 0, way = ((f / 97) | 0) % 3;
      r.input(0, air ? (way === 1 ? 1 : 0) : out[0], air ? (way === 0 ? 1 : 0) : out[1], out[2], 0, 0);
      r.AUTO[0] = 0;
    }, (r) => r.R[0] === DONE);
    const mine = ev.filter((e) => e[1] === 0);
    for (let i = 0; i < mine.length; i++) {
      const e = mine[i];
      if (e[0] !== E_CRASH) continue;
      const next = mine.slice(i + 1).find((x) => x[0] === E_RIGHT || x[0] === E_RESPAWN);
      assert.ok(next && next[3] - e[3] < 60 * 3.2, `${def.id}: the tumble at frame ${e[3]} ended within 3.2 s`);
      if (e[2] === 0) assert.equal(next[0], E_RIGHT, `${def.id}: a bad landing comes down on its wheels, never back at a gate`);
      tumbles++;
    }
  }
  assert.ok(tumbles >= 8, `bad landings tried: ${tumbles}`);
});

test("the edge: a car flung over the table's edge goes back to the track (the only reset)", () => {
  const r = createRace(TRACKS[0], 4);
  toGo(r);
  const v = r.cars[0];
  v.reset(r.tr.HX - 1.2, 0, 0);
  v.vel[0] = 30; v.vel[1] = 6;
  const ev = run(r, 60 * 3, (r) => r.input(0, 1, 0, 0, 0, 0));
  const c = ev.find((e) => e[0] === E_CRASH && e[1] === 0), back = ev.find((e) => e[0] === E_RESPAWN && e[1] === 0);
  assert.ok(c && c[2] === 1, "over the edge");
  assert.ok(back, "back at its gate");
  assert.ok(Math.abs(r.pos[0]) < r.tr.HX - 2, "on the table again");
});

/** A battle race with car 1 parked in front of car 0 on a straight. */
function duel(seed = 5) {
  const r = createRace(TRACKS[1], seed, { battle: true, humans: 2, rivals: 1 });
  toGo(r);
  for (let c = 0; c < r.count; c++) r.AUTO[c] = 0;
  const m = r.tr.main, i = (Math.round(m.n * 0.3) + 0) % m.n, tx = m.T[i * 2], tz = m.T[i * 2 + 1];
  const yaw = Math.atan2(-tz, tx);
  r.cars[0].reset(m.P[i * 2], m.P[i * 2 + 1], yaw);
  r.cars[1].reset(m.P[i * 2] + tx * 8, m.P[i * 2 + 1] + tz * 8, yaw);
  r.cars[2].reset(m.P[i * 2] - tx * 30, m.P[i * 2 + 1] - tz * 30, yaw);
  for (let b = 0; b < r.items.NB; b++) r.items.B[b * 4 + 3] = 99;
  run(r, 20, (r) => { r.input(0, 0, 0, 0, 0, 0); r.input(1, 0, 0, 0, 0, 0); });
  return r;
}
/** Hold car `c` still (a person with no inputs), car 0's inputs as given. */
const hold = (r, a0 = [0, 0, 0, 0, 0, 0]) => r.input(0, ...a0);

test("BATTLE: a blaster's bolts stall the car in front; it recovers and drives on", () => {
  const r = duel();
  r.items.H[0 * HK] = IT_BLASTER;
  let f0 = 0;
  const ev = run(r, 60 * 4, (r, f) => hold(r, [0, 0, 0, 0, 0, f === 2 ? 1 : 0]));
  const fire = ev.find((e) => e[0] === E_FIRE && e[1] === 0), hit = ev.find((e) => e[0] === E_HIT && e[1] === 1);
  assert.ok(fire && fire[2] === IT_BLASTER, "fired the blaster");
  assert.ok(hit && hit[2] >> 3 === H_STALL && (hit[2] & 7) === 0, "a bolt stalled car 1 (by car 0)");
  assert.equal(r.C[1 * K + STALL], 0, "the stall wore off");
  assert.equal(r.C[1 * K + PH], DRIVE, "driving again");
  f0 = r.pos[3];
  r.AUTO[1] = 1;
  run(r, 60 * 2);
  assert.ok(Math.hypot(r.pos[3] - f0, r.pos[5]) > 0, "and away");
});

test("BATTLE: oil behind spins out the car following; a mine throws it into a big tumble it rights; both recover", () => {
  for (const [item, kind] of [[IT_OIL, H_SPIN], [IT_MINE, H_TUMBLE]]) {
    const r = duel(8);
    // Car 1 drops it (it is in front), car 0 drives into it.
    r.items.H[1 * HK] = item;
    const ev = run(r, 60 * 6, (r, f) => (r.input(1, 0, 0, 0, 0, 0, f === 1 ? 1 : 0), hold(r, [f > 70 ? 0.6 : 0, 0, 0, 0, 0, 0])));
    const hit = ev.find((e) => e[0] === E_HIT && e[1] === 0);
    assert.ok(hit && hit[2] >> 3 === kind, `item ${item}: hit car 0 with kind ${kind}`);
    if (kind === H_TUMBLE) {
      assert.ok(ev.some((e) => e[0] === E_CRASH && e[1] === 0 && e[2] === 2), "a mine's big tumble");
      assert.ok(ev.some((e) => e[0] === E_RIGHT && e[1] === 0), "back on its wheels");
      assert.ok(!ev.some((e) => e[0] === E_RESPAWN && e[1] === 0), "never put back at a gate");
    } else assert.ok(ev.some((e) => e[1] === 0 && e[0] === E_HIT) && r.C[SPIN] === 0, "the spin wore off");
    assert.equal(r.C[PH], DRIVE, "driving again");
  }
});

test("BATTLE: a shield blocks one hit, then it's gone", () => {
  const r = duel(9);
  r.items.H[1 * HK] = IT_SHIELD;
  run(r, 5, (r, f) => r.input(1, 0, 0, 0, 0, 0, f === 1 ? 1 : 0));
  assert.ok(r.items.shield(1) > 0, "shield on");
  r.items.H[0] = IT_BLASTER;
  const ev = run(r, 60 * 2, (r, f) => hold(r, [0, 0, 0, 0, 0, f === 1 ? 1 : 0]));
  assert.ok(ev.some((e) => e[0] === E_BLOCK && e[1] === 1), "the first bolt was blocked");
  assert.equal(r.items.shield(1), 0, "the shield is used up");
  assert.ok(ev.some((e) => e[0] === E_HIT && e[1] === 1), "the next bolt landed");
});

test("BATTLE: boxes give items and come back; the AI takes and fires them; the back of the pack draws better", () => {
  const r = createRace(TRACKS[2], 31, { battle: true, rivals: 5 });
  r.AUTO[0] = 1;
  const ev = run(r, 60 * 200, null, (r) => r.R[0] === DONE);
  const got = ev.filter((e) => e[0] === E_ITEM), fired = ev.filter((e) => e[0] === E_FIRE), hits = ev.filter((e) => e[0] === E_HIT);
  assert.ok(got.length > 20, `items taken: ${got.length}`);
  assert.ok(new Set(got.map((e) => e[1])).size >= 4, "by most of the field");
  assert.ok(fired.length >= got.length * 0.6, `the AI fires what it takes (${fired.length} of ${got.length})`);
  assert.ok(new Set(fired.map((e) => e[2])).size === 4, "all four items seen");
  assert.ok(hits.length > 3, `hits: ${hits.length}`);
  // The weighting: many draws for a leader and for last place.
  const it = r.items, tally = (back) => {
    const n = [0, 0, 0, 0, 0];
    it.reset(3);
    for (let k = 0; k < 4000; k++) {
      it.BACK[0] = back; it.ON[0] = 1; it.H.fill(0);
      it.B[3] = 0; it.B[0] = r.pos[0]; it.B[1] = r.pos[1]; it.B[2] = r.pos[2];
      for (let c = 1; c < r.count; c++) it.ON[c] = 0;
      it.IO[0] = 1 / 60;
      it.step(r.IN, 6);
      n[it.H[0]]++;
    }
    return n;
  };
  const lead = tally(0), last = tally(1);
  assert.ok(last[IT_MINE] > lead[IT_MINE] * 1.6 && lead[IT_SHIELD] > last[IT_SHIELD] * 2, `rubber band: lead ${lead}, last ${last}`);
});

test("BATTLE is deterministic: the same seed and inputs, the same items, hits and race; another seed, another", () => {
  const mk = (s) => createRace(TRACKS[3], s, { battle: true, humans: 2, rivals: 2 });
  const a = mk(41), b = mk(41), c = mk(42);
  let hits = 0;
  for (let f = 0; f < 60 * 60; f++)
    for (const r of [a, b, c]) {
      r.input(0, 1, 0, Math.sin(f / 40), 0, 0, f % 120 < 2 ? 1 : 0);
      r.AUTO[1] = 1;
      r.step(1 / 60);
      for (let k = 0; k < r.n; k++) if (r === a && r.ev[k * 3] === E_HIT) hits++;
      r.clear();
    }
  assert.equal(hashOf(a.bytes), hashOf(b.bytes), "same seed, same battle");
  assert.notEqual(hashOf(a.bytes), hashOf(c.bytes), "another seed, another");
  assert.ok(hits > 0, `hits: ${hits}`);
});

test("King of the Table: points are carried and bank on your own pad; a landing on another's pad steals a fifth", () => {
  const f = createFreestyle(12, { humans: 2, jam: 120 });
  assert.ok(f.king, "on with two people");
  run(f, 60 * 4, null, (f) => f.R[0] === RUN && f.R[1] > 0.3);
  // Car 0 carries 500 and drives onto its pad (it starts on it).
  f.C[KPOT] = 500;
  let ev = run(f, 10, (f) => f.input(0, 0, 0, 0, 0, 0));
  const bank = ev.find((e) => e[0] === E_BANK && e[1] === 0);
  assert.ok(bank && bank[2] === 500 && f.scs[0].S[0] === 500 && f.C[KPOT] === 0, "banked on the pad");
  // Car 1 drops onto car 0's pad from the air: a fifth of car 0's 500 is car 1's (carried).
  f.cars[1].reset(f.HOME[0] + 1, f.HOME[1], 0);
  f.cars[1].pos[1] += 3.5;
  ev = run(f, 90, (f) => f.input(1, 0, 0, 0, 0, 0));
  const steal = ev.find((e) => e[0] === E_STEAL && e[1] === 1);
  assert.ok(steal && steal[2] === 100, `stole ${steal?.[2]}`);
  assert.equal(f.scs[0].S[0], 400, "taken from car 0's bank");
  assert.ok(f.C[K + KPOT] >= 100, "car 1 carries it (and its landing): it banks on its own pad");
  f.finish();
  assert.equal(f.winner(), 0, "the most banked wins");
});

test("Freestyle BATTLE: items on the tables, for a jam of four", () => {
  const f = createFreestyle(13, { humans: 4, jam: 90, battle: true });
  for (let c = 0; c < 4; c++) f.AUTO[c] = 1;
  const ev = run(f, 60 * 95);
  assert.ok(ev.filter((e) => e[0] === E_ITEM).length > 4, "items taken");
  assert.ok(ev.some((e) => e[0] === E_FIRE), "and fired");
  assert.equal(f.R[0], DONE);
});

test("a battle race step allocates (almost) nothing (100,000 steps, six cars firing)", async () => {
  const r = createRace(TRACKS[3], 5, { battle: true, rivals: 5 });
  r.AUTO[0] = 1;
  let minor = 0;
  const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.detail?.kind === 1 || e.kind === 1) minor++; });
  for (let i = 0; i < 20000; i++) { r.step(1 / 60); r.clear(); if (r.R[0] === DONE) r.reset(5); }
  globalThis.gc?.();
  obs.observe({ entryTypes: ["gc"] });
  for (let i = 0; i < 100000; i++) { r.step(1 / 60); r.clear(); if (r.R[0] === DONE && r.R[6] > 25) r.reset(5 + (i & 7)); }
  await new Promise((ok) => setTimeout(ok, 50));
  obs.disconnect();
  console.log(`Dune Hop BATTLE: ${minor} young GCs over 100,000 race steps.`);
  assert.ok(minor <= 8, `young GCs: ${minor}`);
});
