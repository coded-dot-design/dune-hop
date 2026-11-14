// Dune Hop online, headless: the lockstep gate. Copies of the sim fed the same input stream (each
// seat's inputs packed to 32 bits and unpacked again, as the wire carries them) stay identical,
// byte for byte, for a whole race with rivals and for a Freestyle jam, with two seats and with four;
// one wrong input shows up in the state hash (the desync check); @fzlt/core/presence's syncCheck runs
// one sim per seat (two and four) as lockstep clients over its in-memory link, with latency and
// jitter that reorder messages, and compares the state after every frame; and a seat that leaves
// mid-race (net.ts lockstep: the autopilot from the frame after its last input) leaves the other
// three identical to the flag.
import test from "node:test";
import assert from "node:assert/strict";
const { createRace, DONE, E_HIT, E_FIRE } = await import("../src/race.ts");
/** A state view with something in it. */
const b0 = (v) => v.some((x) => x !== 0);
const { createFreestyle } = await import("../src/freestyle.ts");
const { TRACKS } = await import("../src/tracks.ts");
const { encode, decode, hashOf, packMode, unpackMode, lockstep, cleanName, nameBits, nameChar, B_AUTO, B_READY, B_GONE, B_ITEM } = await import("../src/net.ts");
const { createEngine } = await import("@fzlt/core/kernel");
const { memory } = await import("@fzlt/core/presence");
// (Not in the package's exports map: imported by its file.)
const { syncCheck } = await import("../node_modules/@fzlt/core/dist/presence-check.js");

/** Seat p's scripted input on frame f (its own pattern: only it would know it). */
const script = (f, p) => encode(f % 400 < 380 ? 1 : 0, f % 400 >= 380 ? 1 : 0, Math.sin(f / (37 + p * 11) + p), f % 300 < 25 ? 1 : 0, f % 220 < 45 ? 1 : 0, (f > 600 ? B_AUTO : 0) | (f % 90 < 2 ? B_ITEM : 0));

test("the wire format: inputs survive the trip, the host's pick fits in a byte", () => {
  const IN = new Float64Array(12), AUTO = new Uint8Array(2);
  decode(encode(1, 0, -1, 1, 1, B_AUTO), 1, IN, AUTO);
  assert.deepEqual(Array.from(IN.slice(6)), [1, 0, -1, 1, 1, 0]);
  assert.equal(AUTO[1], 1);
  decode(encode(0.5, 0.25, 0.3, 0, 0), 0, IN, AUTO);
  assert.ok(Math.abs(IN[0] - 0.5) < 0.04 && Math.abs(IN[1] - 0.25) < 0.04 && Math.abs(IN[2] - 0.3) < 0.01 && AUTO[0] === 0);
  assert.ok(encode(0, 0, 0, 0, 0, B_READY) & B_READY);
  for (const m of [[false, 3, 3, 1, true], [true, 0, 0, 0, false], [false, 2, 0, 7, true], [true, 1, 3, 0, false]]) assert.deepEqual(Object.values(unpackMode(packMode(...m))), m);
  decode(encode(0, 0, 0, 0, 0, B_ITEM), 0, IN, AUTO);
  assert.equal(IN[5], 1, "the ITEM key rides bit 30");
  // A seat that left drives on the autopilot; names ride one character a frame above the inputs.
  decode(encode(1, 0, 0, 0, 0, B_GONE), 1, IN, AUTO);
  assert.equal(AUTO[1], 1);
  assert.equal(cleanName("  zoë-7 the  great "), "ZO7 THE");
  const name = "MIA 2", bits = Array.from({ length: 8 }, (_, k) => encode(1, 0, 0.5, 0, 0, B_READY | nameBits(name, k)));
  assert.equal(bits.map(nameChar).join(""), name);
  decode(bits[0], 0, IN, AUTO);
  assert.equal(IN[0], 1, "the name bits leave the inputs alone");
});

for (const [name, make, H] of [
  ["a race (two people, three rivals)", () => createRace(TRACKS[2], 77, { humans: 2, rivals: 3, laps: 1 }), 2],
  ["a Freestyle jam", () => createFreestyle(77, { humans: 2, jam: 60 }), 2],
  ["a race (four people, two rivals)", () => createRace(TRACKS[1], 78, { humans: 4, rivals: 3, laps: 1 }), 4],
  ["a four-way Freestyle jam", () => createFreestyle(78, { humans: 4, jam: 60 }), 4],
  ["a BATTLE race (two people, three rivals: items, hits)", () => createRace(TRACKS[2], 79, { humans: 2, rivals: 3, laps: 1, battle: true }), 2],
  ["a BATTLE race (four people, two rivals: items, hits)", () => createRace(TRACKS[1], 80, { humans: 4, rivals: 2, laps: 1, battle: true }), 4],
  ["a King of the Table BATTLE jam (four)", () => createFreestyle(81, { humans: 4, jam: 60, battle: true }), 4],
])
  test(`${H} screens, one input stream: ${name} stays identical; one wrong input shows in the hash`, () => {
    const sims = Array.from({ length: H }, make), c = make(), a = sims[0];
    assert.equal(a.humans, H);
    if (a.kind === "race") assert.equal(a.count, Math.min(6, H + 3), "the rivals fill the grid up to six");
    let first = -1, fx = 0;
    for (let f = 0; f < 60 * 150 && a.R[0] !== DONE; f++) {
      for (const [s, bad] of [...sims.map((s) => [s, 0]), [c, 1]]) {
        for (let p = 0; p < H; p++) decode(bad && f === 560 && p === 1 ? script(f, p) ^ 0xff00 : script(f, p), p, s.IN, s.AUTO);
        s.step(1 / 60);
        if (s === a) for (let k = 0; k < s.n; k++) if (s.ev[k * 3] === E_HIT || s.ev[k * 3] === E_FIRE) fx++;
        s.clear();
      }
      if (f % 30 === 29) {
        for (const b of sims) assert.equal(hashOf(b.bytes), hashOf(a.bytes), `frame ${f}: the same state`);
        if (first < 0 && hashOf(a.bytes) !== hashOf(c.bytes)) first = f;
      }
    }
    assert.ok(first >= 560 && first < 620, `the wrong input was caught by the hash check at frame ${first}`);
    if (a.kind === "race") assert.equal(a.R[0], DONE, "the race finished");
    if (a.battle) assert.ok(fx > 4 && a.items.bytes.every((v) => b0(v)), `items fired and hit in step on every screen (${fx})`);
    // Byte for byte, every view of the state.
    for (const b of sims) b.bytes.forEach((v, i) => assert.ok(Buffer.from(v).equals(Buffer.from(a.bytes[i])), `byte view ${i} identical`));
  });

test("lockstep over a link with latency and jitter (presence syncCheck): race and Freestyle, two and four seats", () => {
  for (const [name, make, P] of [
    ["race", () => createRace(TRACKS[0], 9, { humans: 2, rivals: 3 }), 2],
    ["freestyle", () => createFreestyle(9, { humans: 2 }), 2],
    ["race ×4", () => createRace(TRACKS[0], 9, { humans: 4, rivals: 3 }), 4],
    ["freestyle ×4", () => createFreestyle(9, { humans: 4 }), 4],
  ])
    for (const [latency, jitter] of [[0, 0], [3, 2]]) {
      const setup = (e, slot) => {
        const sim = make();
        let f = 0;
        // The state as syncCheck reads it after each frame: the hash of every byte of it (one 4-byte view).
        const state = new Uint8Array(4), dv = new DataView(state.buffer);
        return {
          input: () => script(f++, slot),
          step: (_e, inputs) => {
            for (let p = 0; p < P; p++) decode(inputs[p], p, sim.IN, sim.AUTO);
            sim.step(1 / 60);
            sim.clear();
            dv.setUint32(0, hashOf(sim.bytes));
          },
          state,
        };
      };
      const r = syncCheck(setup, { players: P, frames: 900, seed: 3, latency, jitter });
      assert.ok(r.ok, `${name}, latency ${latency} ± ${jitter}: ${JSON.stringify(r)}`);
    }
});

test("four seats, one leaves mid-race: its car drives on (the autopilot), the other three stay identical to the flag", () => {
  const P = 4, GONE_AT = 700, hub = memory({ peers: P, latency: 3, jitter: 2, seed: 5 }), off = { hidden: false, offscreen: false, editable: false };
  const L = [], runs = [], H = new Map();
  for (let s = 0; s < P; s++) {
    // Each end wrapped, so the test can play the room's LEAVE into the screens that stay.
    const end = hub.ends[s], t = { send: (d) => end.send(d), listen: (f) => ((L[s] = f), end.listen(f)), close: () => end.close() };
    const e = createEngine({ seed: 1, pause: off }), sim = createRace(TRACKS[1], 41, { humans: P, rivals: 3, laps: 1 });
    let f = 0;
    const ls = lockstep(e, {
      transport: t, slot: s, players: P,
      // Everyone on the autopilot after a scripted start (so the race ends); the leaver scripted until it goes.
      input: () => script(f++, s) | (f > 400 ? B_AUTO : 0),
      step: (inputs, fr) => {
        for (let p = 0; p < P; p++) decode(inputs[p], p, sim.IN, sim.AUTO);
        sim.step(1 / 60);
        sim.clear();
        if (s < 3) {
          const h = hashOf(sim.bytes), k = H.get(fr);
          if (k === undefined) H.set(fr, h);
          else assert.equal(h, k, `frame ${fr}: seat ${s} agrees`);
        }
      },
      hash: () => hashOf(sim.bytes),
    });
    runs.push({ e, sim, ls });
  }
  let told = false, quiet = 0;
  for (let t = 0; t < 60 * 200 && runs[0].sim.R[0] !== DONE; t++) {
    hub.tick();
    for (let s = 0; s < P; s++) {
      const r = runs[s];
      if (s === 3 && r.ls.link.frame >= GONE_AT) continue; // seat 3 closed the tab
      r.e.advance(r.e.dt);
    }
    // Once its last messages are through the link (latency + jitter), the room says LEAVE.
    if (runs[3].ls.link.frame >= GONE_AT && !told && ++quiet > 8) {
      told = true;
      runs[3].ls.destroy();
      for (let s = 0; s < 3; s++) L[s](Uint8Array.of(4, 3, P, 0, 0, 0, 0, 0, 0, 0, 0, 0));
    }
  }
  const [a, b, c] = runs;
  assert.ok(told, "seat 3 left");
  for (const r of [a, b, c]) assert.equal(r.ls.left, 1 << 3, "the others know seat 3 left");
  assert.ok(a.ls.leftAt(3) > GONE_AT && a.ls.leftAt(3) === b.ls.leftAt(3) && b.ls.leftAt(3) === c.ls.leftAt(3), `the autopilot took over on the same frame everywhere: ${[a, b, c].map((r) => r.ls.leftAt(3))}`);
  assert.equal(a.sim.R[0], DONE, "the race reached the flag");
  // The screens that stay run the same frames; let the slower ones catch up, then compare every byte.
  for (let t = 0; t < 600 && !(a.ls.link.frame === b.ls.link.frame && b.ls.link.frame === c.ls.link.frame); t++) {
    hub.tick();
    for (const r of [b, c]) if (r.ls.link.frame < a.ls.link.frame) r.e.advance(r.e.dt);
  }
  for (const r of [b, c]) r.sim.bytes.forEach((v, i) => assert.ok(Buffer.from(v).equals(Buffer.from(a.sim.bytes[i])), `byte view ${i} identical`));
  assert.ok(a.sim.fin[3] > 0, "the leaver's buggy (the autopilot) crossed the line too");
  assert.deepEqual([a, b, c].map((r) => r.ls.link.desync), [-1, -1, -1], "no desync");
  assert.ok(H.size > GONE_AT + 300, `frames compared: ${H.size}`);
  for (const r of runs) r.e.destroy();
});

// Four screens in one process (four engines, four races of six buggies, one in-memory link): the
// lockstep layer (presence, the leaver feed, decode, the hash every 30 frames) adds no garbage of its
// own; the bar is the drives' (see tests/race.test.mjs): measured 2 to 4 young GCs over 40,000 ticks.
test("four seats in lockstep allocate (almost) nothing (40,000 ticks × 4 screens)", async () => {
  const P = 4, hub = memory({ peers: P }), off = { hidden: false, offscreen: false, editable: false }, runs = [];
  for (let s = 0; s < P; s++) {
    const e = createEngine({ seed: 1, pause: off }), sim = createRace(TRACKS[0], 3, { humans: P, rivals: 3 });
    const ls = lockstep(e, {
      transport: hub.ends[s], slot: s, players: P, input: () => B_AUTO,
      step: (inp) => {
        for (let p = 0; p < P; p++) decode(inp[p], p, sim.IN, sim.AUTO);
        sim.step(1 / 60);
        sim.clear();
        if (sim.R[0] === DONE && sim.R[6] > 25) sim.reset(3);
      },
      hash: () => hashOf(sim.bytes),
    });
    runs.push({ e, ls });
  }
  const tick = () => (hub.tick(), runs.forEach((r) => r.e.advance(r.e.dt)));
  for (let i = 0; i < 10000; i++) tick();
  let minor = 0;
  const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.detail?.kind === 1 || e.kind === 1) minor++; });
  globalThis.gc?.();
  obs.observe({ entryTypes: ["gc"] });
  for (let i = 0; i < 40000; i++) tick();
  await new Promise((ok) => setTimeout(ok, 50));
  obs.disconnect();
  console.log(`Dune Hop online: ${minor} young GCs over 40,000 ticks of four screens in lockstep.`);
  assert.ok(runs.every((r) => r.ls.link.desync < 0 && r.ls.link.frame > 39000), "in lockstep, no desync");
  assert.ok(minor <= 8, `young GCs: ${minor}`);
  for (const r of runs) r.e.destroy();
});
