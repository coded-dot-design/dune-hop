// Dune Rally online, headless: the sync gate. Copies of the sim fed the same input stream (each seat's
// inputs packed to 32 bits and unpacked again, as the wire carries them) stay identical, byte for
// byte, for a whole race with rivals, a BATTLE race and a Freestyle jam, with two seats and with four;
// one wrong input shows up in the state hash (the desync check). Every sim restores exactly from its
// bytes (a wrong guess run and undone leaves no trace: the rollback's premise). Two and four screens
// on src/rollback.ts over an in-memory link with latency and jitter (messages overtake) end byte for
// byte on the run with no network at all; local frames never wait; final frames are confirmed once,
// in order; a seat that leaves mid-race (GONE: the autopilot from the frame after its last input)
// leaves the other three identical to the flag; and the corrections allocate nothing.
import test from "node:test";
import assert from "node:assert/strict";
const { createRace, DONE, E_HIT, E_FIRE } = await import("../src/race.ts");
/** A state view with something in it. */
const b0 = (v) => v.some((x) => x !== 0);
const { createFreestyle } = await import("../src/freestyle.ts");
const { TRACKS } = await import("../src/tracks.ts");
const { encode, decode, hashOf, packMode, unpackMode, rollback, cleanName, nameBits, nameChar, GONE, B_AUTO, B_READY, B_GONE, B_ITEM } = await import("../src/net.ts");
const { createEngine } = await import("@fzlt/core/kernel");
const { memory } = await import("@fzlt/core/presence");

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

/** P screens over an in-memory room link (latency ± jitter ticks, messages may overtake), each its own
 *  engine and rollback link, every seat scripted; run until every screen has `frames` final frames.
 *  Returns the screens (engine, sim, link). */
function online(make, P, frames, { latency = 0, jitter = 0, seed = 3, input = script, gone = GONE, onStep } = {}) {
  const hub = memory({ peers: P, latency, jitter, seed, cap: 4096 }), off = { hidden: false, offscreen: false, editable: false };
  const runs = Array.from({ length: P }, (_, s) => {
    const e = createEngine({ seed: 1, pause: off }), sim = make();
    const rb = rollback(e, {
      transport: hub.ends[s], slot: s, players: P, gone, bytes: sim.bytes,
      input: (f) => input(f, s),
      step: (inputs, f, live, sure) => {
        for (let p = 0; p < P; p++) decode(inputs[p], p, sim.IN, sim.AUTO);
        sim.step(1 / 60);
        sim.clear();
        onStep?.(s, f, live, sure);
      },
    });
    rb.hold = frames;
    return { e, sim, rb, hub };
  });
  for (let t = 0; t < frames * 3 && !runs.every((r) => r.rb.final === frames); t++) {
    hub.tick();
    for (const r of runs) r.e.advance(r.e.dt);
  }
  return runs;
}
/** The same race with no network: frame f runs every seat's input(f). */
function straight(make, P, frames, input = script) {
  const sim = make();
  for (let f = 0; f < frames; f++) {
    for (let p = 0; p < P; p++) decode(input(f, p), p, sim.IN, sim.AUTO);
    sim.step(1 / 60);
    sim.clear();
  }
  return sim;
}
const same = (a, b) => a.bytes.every((v, i) => Buffer.from(v).equals(Buffer.from(b.bytes[i])));

test("every sim restores exactly: a wrong guess run and undone leaves no trace (all of its state is in bytes)", () => {
  for (const [name, make, H] of [
    ["race", () => createRace(TRACKS[2], 7, { humans: 2, rivals: 3 }), 2],
    ["BATTLE race", () => createRace(TRACKS[1], 8, { humans: 4, rivals: 3, battle: true }), 4],
    ["Freestyle", () => createFreestyle(9, { humans: 2 }), 2],
    ["King of the Table", () => createFreestyle(10, { humans: 4, battle: true }), 4],
  ]) {
    const s = make(), N = 2400, step = (f, wrong) => {
      for (let p = 0; p < H; p++) decode(script(wrong ? f + 50 : f, p), p, s.IN, s.AUTO);
      s.step(1 / 60);
      s.clear();
    };
    for (let f = 0; f < N; f++) {
      if (f % 97 === 50) {
        const keep = s.bytes.map((v) => v.slice());
        for (let g = 0; g < 12; g++) step(f + g, true);
        s.bytes.forEach((v, i) => v.set(keep[i]));
      }
      step(f, false);
    }
    assert.ok(same(s, straight(make, H, N)), `${name}: byte for byte the run that never guessed wrong`);
  }
});

test("rollback over a link with latency and jitter: two and four screens end byte for byte on the no-latency run (race, BATTLE, Freestyle)", () => {
  for (const [name, make, P] of [
    ["race", () => createRace(TRACKS[0], 9, { humans: 2, rivals: 3 }), 2],
    ["race ×4", () => createRace(TRACKS[0], 9, { humans: 4, rivals: 3 }), 4],
    ["BATTLE ×2", () => createRace(TRACKS[2], 10, { humans: 2, rivals: 3, battle: true }), 2],
    ["BATTLE ×4", () => createRace(TRACKS[1], 11, { humans: 4, rivals: 2, battle: true }), 4],
    ["freestyle", () => createFreestyle(9, { humans: 2 }), 2],
    ["King of the Table ×4", () => createFreestyle(12, { humans: 4, battle: true }), 4],
  ]) {
    const N = 1500, want = straight(make, P, N);
    for (const [latency, jitter, seed] of [[0, 0, 1], [4, 3, 2], [9, 7, 3], [18, 14, 4]]) {
      const runs = online(make, P, N, { latency, jitter, seed });
      for (const r of runs) {
        assert.equal(r.rb.final, N, `${name} ${latency}±${jitter}: seat finished`);
        assert.equal(r.rb.desync, -1, `${name} ${latency}±${jitter}: no desync`);
        assert.ok(same(r.sim, want), `${name}, latency ${latency} ± ${jitter} ticks: byte for byte the no-latency run`);
      }
      if (latency) assert.ok(runs.every((r) => r.rb.corrections > 0), `${name} ${latency}±${jitter}: corrections ran (${runs.map((r) => r.rb.corrections)})`);
      for (const r of runs) r.e.destroy();
    }
  }
});

test("rollback: local input shows at once (the frame runs on a guess), every final frame is confirmed once, in order", () => {
  const P = 2, make = () => createRace(TRACKS[0], 5, { humans: P, rivals: 3, battle: true }), runs = [], seen = [[], []];
  const hub = memory({ peers: P, latency: 8, jitter: 4, seed: 9 }), off = { hidden: false, offscreen: false, editable: false };
  for (let s = 0; s < P; s++) {
    const e = createEngine({ seed: 1, pause: off }), sim = make();
    const rb = rollback(e, { transport: hub.ends[s], slot: s, players: P, gone: GONE, bytes: sim.bytes, input: (f) => script(f, s), confirm: (_i, f) => seen[s].push(f), step: (inputs) => {
      for (let p = 0; p < P; p++) decode(inputs[p], p, sim.IN, sim.AUTO);
      sim.step(1 / 60);
      sim.clear();
    } });
    runs.push({ e, rb });
  }
  let ahead = 0;
  for (let t = 0; t < 900; t++) {
    hub.tick();
    for (const r of runs) r.e.advance(r.e.dt);
    if (t > 60) ahead = Math.max(ahead, runs[0].rb.frame - runs[0].rb.final);
  }
  // No waiting: every engine step ran a frame (8 ticks each way, 16 a round trip, yet no stall).
  for (const r of runs) assert.ok(r.rb.stalls === 0 && r.rb.frame >= 890, `ran every step: frame ${r.rb.frame}, stalls ${r.rb.stalls}`);
  assert.ok(ahead >= 6, `frames ran ahead of the final ones on guesses: ${ahead}`);
  for (const s of seen) assert.deepEqual(s, Array.from({ length: s.length }, (_, i) => i), "final frames confirmed once each, in order");
  assert.ok(runs.every((r) => r.rb.delay >= 1 && r.rb.delay <= 3), "the input delay stays 1..3 frames");
  for (const r of runs) r.e.destroy();
});

test("four seats, one leaves mid-race: its car drives on (the autopilot), the other three stay identical to the flag", () => {
  const P = 4, GONE_AT = 700, hub = memory({ peers: P, latency: 3, jitter: 2, seed: 5 }), off = { hidden: false, offscreen: false, editable: false };
  const L = [], runs = [];
  // Everyone on the autopilot after a scripted start (so the race ends); the leaver scripted until it goes.
  const input = (f, s) => script(f, s) | (f > 400 ? B_AUTO : 0);
  for (let s = 0; s < P; s++) {
    // Each end wrapped, so the test can play the room's LEAVE into the screens that stay.
    const end = hub.ends[s], t = { send: (d) => end.send(d), listen: (f) => ((L[s] = f), end.listen(f)), close: () => end.close() };
    const e = createEngine({ seed: 1, pause: off }), sim = createRace(TRACKS[1], 41, { humans: P, rivals: 3, laps: 1 });
    const rb = rollback(e, {
      transport: t, slot: s, players: P, gone: GONE, bytes: sim.bytes, input: (f) => input(f, s),
      step: (inputs) => {
        for (let p = 0; p < P; p++) decode(inputs[p], p, sim.IN, sim.AUTO);
        sim.step(1 / 60);
        sim.clear();
      },
    });
    runs.push({ e, sim, rb });
  }
  let told = false, quiet = 0;
  for (let t = 0; t < 60 * 200 && runs[0].sim.R[0] !== DONE; t++) {
    hub.tick();
    for (let s = 0; s < P; s++) {
      const r = runs[s];
      if (s === 3 && r.rb.frame >= GONE_AT) continue; // seat 3 closed the tab
      r.e.advance(r.e.dt);
    }
    // Once its last messages are through the link (latency + jitter), the room says LEAVE.
    if (runs[3].rb.frame >= GONE_AT && !told && ++quiet > 8) {
      told = true;
      runs[3].rb.destroy();
      for (let s = 0; s < 3; s++) L[s](Uint8Array.of(4, 3, P, 0, 0, 0, 0, 0, 0, 0, 0, 0));
    }
  }
  const [a, b, c] = runs;
  assert.ok(told, "seat 3 left");
  for (const r of [a, b, c]) assert.equal(r.rb.left, 1 << 3, "the others know seat 3 left");
  assert.ok(a.rb.leftAt(3) > GONE_AT && a.rb.leftAt(3) === b.rb.leftAt(3) && b.rb.leftAt(3) === c.rb.leftAt(3), `the autopilot took over on the same frame everywhere: ${[a, b, c].map((r) => r.rb.leftAt(3))}`);
  assert.equal(a.sim.R[0], DONE, "the race reached the flag");
  // The three stop on one frame; once it is final on all three, every byte matches.
  const at = Math.max(a.rb.frame, b.rb.frame, c.rb.frame) + 2;
  for (const r of [a, b, c]) r.rb.hold = at;
  for (let t = 0; t < 600 && ![a, b, c].every((r) => r.rb.final === at); t++) {
    hub.tick();
    for (const r of [a, b, c]) r.e.advance(r.e.dt);
  }
  for (const r of [b, c]) assert.ok(r.rb.final === at && same(r.sim, a.sim), "every byte identical");
  assert.ok(a.sim.fin[3] > 0, "the leaver's buggy (the autopilot) crossed the line too");
  assert.deepEqual([a, b, c].map((r) => r.rb.desync), [-1, -1, -1], "no desync");
  for (const r of runs) r.e.destroy();
});

// Four screens in one process (four engines, four races of six buggies, one in-memory link with latency
// and jitter, every seat's steer changing every frame so guesses miss and frames run again): the
// rollback layer (snapshots, corrections, decode, the hash every 30 frames) adds no garbage of its own;
// the bar is the drives' (see tests/race.test.mjs): measured 2 to 4 young GCs over 40,000 ticks.
test("four seats with rollback allocate (almost) nothing (20,000 ticks × 4 screens, corrections every few frames)", async () => {
  const P = 4, hub = memory({ peers: P, latency: 5, jitter: 3, seed: 2 }), off = { hidden: false, offscreen: false, editable: false }, runs = [];
  for (let s = 0; s < P; s++) {
    const e = createEngine({ seed: 1, pause: off }), sim = createRace(TRACKS[0], 3, { humans: P, rivals: 3 });
    const rb = rollback(e, {
      transport: hub.ends[s], slot: s, players: P, gone: GONE, bytes: sim.bytes, input: (f) => script(f, s) | B_AUTO,
      step: (inp) => {
        for (let p = 0; p < P; p++) decode(inp[p], p, sim.IN, sim.AUTO);
        sim.step(1 / 60);
        sim.clear();
        if (sim.R[0] === DONE && sim.R[6] > 25) sim.reset(3);
      },
    });
    runs.push({ e, rb });
  }
  const tick = () => (hub.tick(), runs.forEach((r) => r.e.advance(r.e.dt)));
  for (let i = 0; i < 6000; i++) tick();
  let minor = 0;
  const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.detail?.kind === 1 || e.kind === 1) minor++; });
  globalThis.gc?.();
  const c0 = runs.map((r) => r.rb.resims);
  obs.observe({ entryTypes: ["gc"] });
  for (let i = 0; i < 20000; i++) tick();
  await new Promise((ok) => setTimeout(ok, 50));
  obs.disconnect();
  const resims = runs.map((r, i) => r.rb.resims - c0[i]);
  console.log(`Dune Rally online: ${minor} young GCs over 20,000 ticks of four screens with rollback (${resims.join(" / ")} frames run again).`);
  assert.ok(runs.every((r) => r.rb.desync < 0 && r.rb.final > 25000), "no desync");
  assert.ok(resims.every((n) => n > 20000), `corrections ran: ${resims}`);
  assert.ok(minor <= 8, `young GCs: ${minor}`);
  for (const r of runs) r.e.destroy();
});
