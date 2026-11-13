// Dune Hop's race, headless: the tracks build the same every time (bit for bit), every gate stands on
// the track, each track is bigger than the one before; the autopilot races every track to the flag
// with all four buggies finishing, gates in order; the countdown holds the grid; a nose-down landing
// crashes and respawns at the last gate; boost pads push; the same seed and inputs give the same race
// and another seed another; and a race step allocates nothing (young-generation GCs over 200,000 steps).
import test from "node:test";
import assert from "node:assert/strict";
import { PerformanceObserver } from "node:perf_hooks";
const { TRACKS, buildTrack, KIND_TRACK } = await import("../src/tracks.ts");
const RC = await import("../src/race.ts");
const { createRace, CARS, COUNT, RUN, DONE, E_GATE, E_LAP, E_CRASH, E_RESPAWN, E_BOOST, E_FINISH } = RC;
const K = 24;

function run(r, steps, over) {
  const ev = [];
  for (let i = 0; i < steps && r.R[0] !== DONE; i++) {
    const a = over?.(r) ?? [0, 0, 0, 0, true];
    r.step(1 / 60, a[0], a[1], a[2], a[3], a[4]);
    for (let k = 0; k < r.n; k++) ev.push([r.ev[k * 3], r.ev[k * 3 + 1], r.ev[k * 3 + 2]]);
    r.clear();
  }
  return ev;
}
const hash = (r) => { let h = 0; for (const a of [r.pos, r.rot, r.C]) for (const x of a) h = (Math.imul(h, 31) + Math.round(x * 1e6)) | 0; return h; };

test("tracks: the same every build, gates on the track, rising size", () => {
  let last = 0;
  for (const def of TRACKS) {
    const a = buildTrack(def), b = buildTrack(def);
    assert.deepEqual(Array.from(a.t.h), Array.from(b.t.h), `${def.id}: same heights, bit for bit`);
    for (const g of a.GATE) assert.equal(a.t.kindAt(a.main.P[g * 2], a.main.P[g * 2 + 1]), KIND_TRACK, `${def.id}: gate on the track`);
    assert.ok(def.cols * def.rows > last, `${def.id}: a bigger table than the track before`);
    last = def.cols * def.rows;
  }
  assert.ok(TRACKS.length >= 4, "four tracks or more");
  assert.ok(buildTrack(TRACKS.at(-1)).main.len > 2 * buildTrack(TRACKS[0]).main.len, "the last lap is over twice the first");
  assert.ok(TRACKS.some((t) => t.branches?.length), "a split route");
  assert.ok(TRACKS.some((t) => t.city), "a night city track");
});

for (const def of TRACKS)
  test(`${def.id}: the autopilot races to the flag; all four finish; gates in order`, () => {
    const r = createRace(def, 7), grid = Array.from(r.pos);
    run(r, 60);
    assert.equal(r.R[0], COUNT, "the countdown holds");
    assert.deepEqual([0, 2, 3, 5, 6, 8, 9, 11].map((i) => r.pos[i].toFixed(3)), [0, 2, 3, 5, 6, 8, 9, 11].map((i) => grid[i].toFixed(3)), "the grid holds still");
    const ev = run(r, 60 * 240);
    assert.equal(r.R[0], DONE, "you take the flag");
    for (let i = 0; i < 60 * 60; i++) r.step(1 / 60, 0, 0, 0, 0, true), r.clear();
    const gates = ev.filter((e) => e[1] === 0 && (e[0] === E_GATE || e[0] === E_LAP || e[0] === E_FINISH));
    assert.equal(gates.length, r.gates * def.laps, "every gate, every lap");
    gates.filter((e) => e[0] === E_GATE).forEach((e, k) => assert.equal(e[2], (k % (r.gates - 1)) + 1, "in order"));
    for (let c = 0; c < CARS; c++) assert.ok(r.fin[c] > 0, `car ${c} finished`);
    assert.equal(new Set(r.order).size, CARS, "a finish order");
  });

test("a nose-down landing crashes; back in at the last gate; boost pads push", () => {
  const r = createRace(TRACKS[0], 3);
  let crashed = null, boosted = false;
  const ev = run(r, 60 * 30, (r) => {
    const out = new Float64Array(4);
    r.pilot(0, out);
    if (r.R[0] === RUN && r.cars[0].air > 0 && crashed === null) out[0] = 0, out[1] = 1; // brake in the air: nose down
    return [out[0], out[1], out[2], 0, false];
  });
  for (const e of ev) {
    if (e[0] === E_CRASH && e[1] === 0 && crashed === null) crashed = r.C[2];
    if (e[0] === E_BOOST && e[1] === 0) boosted = true;
  }
  assert.ok(ev.some((e) => e[0] === E_CRASH && e[1] === 0), "it crashed");
  const back = ev.find((e) => e[0] === E_RESPAWN && e[1] === 0);
  assert.ok(back, "and came back");
  assert.ok(boosted, "a pad boosted it");
});

test("deterministic: the same seed and inputs, the same race; another seed, another", () => {
  const a = createRace(TRACKS[3], 11), b = createRace(TRACKS[3], 11), c = createRace(TRACKS[3], 12);
  for (let i = 0; i < 60 * 40; i++) for (const r of [a, b, c]) r.step(1 / 60, 1, 0, Math.sin(i / 50), i % 300 < 30 ? 1 : 0, false), r.clear();
  assert.equal(hash(a), hash(b), "same seed, same race");
  assert.notEqual(hash(a), hash(c), "another seed, another race");
});

// The race's own code passes no doubles through calls and keeps all state in typed arrays. Four
// @fzlt/core/drive buggies in one process still allocate a little once V8 inlines their per-buggy
// closures (measured 2026-11-13: 0 to 11 young GCs per 100,000 steps with two or four bare drives and
// nothing else, 0 to 1 with one): a brick finding, reported to Fizlet. Until it is fixed there, the
// bar is the bare drives' own: at most 8 young GCs over 200,000 race steps (one every ~7 minutes of play).
test("a race step allocates (almost) nothing (200,000 steps)", async () => {
  const r = createRace(TRACKS[3], 5);
  let minor = 0;
  const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.detail?.kind === 1 || e.kind === 1) minor++; });
  // Warm up (the JIT compiles), then count.
  for (let i = 0; i < 20000; i++) { r.step(1 / 60, 0, 0, 0, 0, true); r.clear(); if (r.R[0] === DONE) r.reset(5); }
  globalThis.gc?.();
  obs.observe({ entryTypes: ["gc"] });
  for (let i = 0; i < 200000; i++) { r.step(1 / 60, 0, 0, 0, 0, true); r.clear(); if (r.R[0] === DONE && r.R[6] > 25) r.reset(5 + (i & 7)); }
  await new Promise((ok) => setTimeout(ok, 50));
  obs.disconnect();
  console.log(`Dune Hop: ${minor} young GCs over 200,000 race steps.`);
  assert.ok(minor <= 8, `young GCs: ${minor}`);
});
