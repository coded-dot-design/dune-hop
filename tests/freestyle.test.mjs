// Dune Hop's Freestyle, headless: the park builds the same every time; from every table's start,
// straight on with the gas the car flies its out-ramp and lands on the next table (a transfer); the
// autopilot rides the whole ring; clean landings build the combo multiplier; a handbrake slide banks
// drift points; the gap swallows a car and its table takes it back; two people get a timed jam with a
// winner; alone and untouched it settles; the same seed and inputs give the same session; and a step
// allocates (almost) nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { PerformanceObserver } from "node:perf_hooks";
const { buildPark } = await import("../src/park.ts");
const { createFreestyle, E_XFER, XFERS } = await import("../src/freestyle.ts");
const { E_LAND, E_CRASH, E_RESPAWN, E_DRIFT, E_DONE, DONE } = await import("../src/race.ts");
const { hashOf } = await import("../src/net.ts");

const run = (f, steps, each) => {
  const ev = [];
  for (let i = 0; i < steps; i++) {
    each?.(f, i);
    f.step(1 / 60);
    for (let k = 0; k < f.n; k++) ev.push([f.ev[k * 3], f.ev[k * 3 + 1], f.ev[k * 3 + 2]]);
    f.clear();
  }
  return ev;
};

test("the park: the same every build, four tables, each its own look, a ring of ramps", () => {
  const a = buildPark(), b = buildPark();
  assert.deepEqual(Array.from(a.t.h), Array.from(b.t.h), "same heights, bit for bit");
  assert.deepEqual(Array.from(a.t.kind), Array.from(b.t.kind), "same paint");
  assert.equal(a.tables.length, 4);
  assert.equal(new Set(a.tables.map((t) => t.kind)).size, 4, "four looks");
  assert.deepEqual(a.tables.map((t) => t.to).sort(), [0, 1, 2, 3], "the out-ramps make one ring");
  for (const t of a.tables) assert.equal(a.tableAt(t.spawn[0], t.spawn[1]), a.tables.indexOf(t), "each start is on its table");
  assert.ok(a.LIPS.length / 4 >= 8 + 8, `jump lips (8 link ramps and the tables' kickers): ${a.LIPS.length / 4}`);
  assert.equal(a.tableAt(0, 0), -1, "the gap between them");
});

test("from every table's start, gas straight on: off the out-ramp and onto the next table", () => {
  const f = createFreestyle(1);
  for (let ti = 0; ti < 4; ti++) {
    f.reset(1);
    f.place(0, ti);
    let xfer = -1, landed = false;
    run(f, 60 * 8, (f) => f.input(0, xfer < 0 ? 1 : 0, 0, 0, 0, 0)).forEach((e) => {
      if (e[0] === E_XFER && xfer < 0) xfer = e[2];
      if (e[0] === E_LAND) landed = true;
    });
    assert.equal(xfer, f.park.tables[ti].to, `table ${ti} → ${f.park.tables[ti].to}`);
    assert.ok(landed, "a scored landing");
  }
});

test("the autopilot rides the ring: four transfers, clean landings build the multiplier", () => {
  const f = createFreestyle(2);
  f.AUTO[0] = 1;
  const ev = run(f, 60 * 25);
  const seen = new Set(ev.filter((e) => e[0] === E_XFER).map((e) => e[2]));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3], "every table");
  assert.ok(f.C[XFERS] >= 4, `transfers: ${f.C[XFERS]}`);
  assert.ok(f.scs[0].S[7] >= 2, `the combo reached ×${1 + f.scs[0].S[7]}`);
  assert.ok(f.scs[0].S[0] > 4 * 250, `score: ${f.scs[0].S[0]}`);
  assert.equal(ev.filter((e) => e[0] === E_CRASH).length, 0, "no crashes");
});

test("drift: a handbrake slide on the salt banks points times the multiplier", () => {
  const f = createFreestyle(3);
  const ev = run(f, 60 * 6, (f, i) => f.input(0, 1, 0, i > 90 ? 1 : 0, 0, i > 90 && i < 200 ? 1 : 0));
  const d = ev.find((e) => e[0] === E_DRIFT);
  assert.ok(d && d[2] >= 10, `drift banked: ${d?.[2]}`);
  assert.ok(f.scs[0].S[0] >= d[2], "onto the score");
});

test("the gap: a car over it falls, crashes and comes back on its table", () => {
  const f = createFreestyle(4);
  run(f, 30);
  f.cars[0].reset(0, -20, 0);
  const ev = run(f, 60 * 3);
  const crash = ev.find((e) => e[0] === E_CRASH), back = ev.find((e) => e[0] === E_RESPAWN);
  assert.ok(crash && crash[2] === 1, "into the gap");
  assert.ok(back, "back on");
  assert.equal(back[2], 0, "on the table it was on");
  assert.equal(f.park.tableAt(f.pos[0], f.pos[2]), 0);
});

test("two people: a timed jam, both score, a winner; then everyone stops", () => {
  const f = createFreestyle(5, { humans: 2, jam: 20 });
  assert.equal(f.count, 2);
  f.AUTO[0] = 1;
  const ev = run(f, 60 * 30, (f) => f.input(1, 1, 0, 0.4, 0, 0));
  assert.equal(f.R[0], DONE);
  const done = ev.find((e) => e[0] === E_DONE);
  assert.ok(done, "the jam ends");
  assert.equal(f.winner(), 0, "the autopilot out-scored a car going round in circles");
  assert.ok(f.scs[0].S[0] > f.scs[1].S[0]);
  let still = 0;
  for (let i = 0; i < 600 && f.step(1 / 60); i++) still = i;
  assert.ok(still < 599, "parked after the jam");
});

test("alone and untouched it settles (the page can sleep)", () => {
  const f = createFreestyle(6);
  let i = 0;
  for (; i < 600 && f.step(1 / 60); i++) f.clear();
  assert.ok(i < 120, `settled after ${i} steps`);
  run(f, 60 * 3, (f) => f.input(0, 1, 0, 0.5, 0, 0));
  f.input(0, 0, 0, 0, 0, 0);
  for (i = 0; i < 1200 && f.step(1 / 60); i++) f.clear();
  assert.ok(i < 1200, `settled again after ${i} steps`);
});

test("deterministic: the same seed and inputs, the same session", () => {
  const a = createFreestyle(7, { humans: 2 }), b = createFreestyle(7, { humans: 2 });
  for (const f of [a, b]) run(f, 60 * 40, (f, i) => (f.input(0, 1, 0, Math.sin(i / 40), i % 300 < 20 ? 1 : 0, i % 200 < 40 ? 1 : 0), f.input(1, 1, 0, Math.cos(i / 55), 0, 0)));
  assert.equal(hashOf(a.bytes), hashOf(b.bytes), "the same state, byte for byte");
  assert.ok(a.scs[0].S[0] > 0, "and it went somewhere");
});

test("a freestyle step allocates (almost) nothing (100,000 steps)", async () => {
  const f = createFreestyle(8);
  f.AUTO[0] = 1;
  let minor = 0;
  const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.detail?.kind === 1 || e.kind === 1) minor++; });
  for (let i = 0; i < 20000; i++) f.step(1 / 60), f.clear();
  globalThis.gc?.();
  obs.observe({ entryTypes: ["gc"] });
  for (let i = 0; i < 100000; i++) f.step(1 / 60), f.clear();
  await new Promise((ok) => setTimeout(ok, 50));
  obs.disconnect();
  console.log(`Dune Hop Freestyle: ${minor} young GCs over 100,000 steps.`);
  assert.ok(minor <= 6, `young GCs: ${minor}`);
});
