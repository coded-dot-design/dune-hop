// Dune Hop online, headless: the lockstep gate. Two copies of the sim fed the same input stream (each
// seat's inputs packed to 32 bits and unpacked again, as the wire carries them) stay identical,
// byte for byte, for a whole race with rivals and for a Freestyle jam; one wrong input shows up in the
// state hash (the desync check); and @fzlt/core/presence's syncCheck runs one sim per seat as
// lockstep clients over its in-memory link, with latency and jitter that reorder messages, and
// compares the state after every frame.
import test from "node:test";
import assert from "node:assert/strict";
const { createRace, DONE } = await import("../src/race.ts");
const { createFreestyle } = await import("../src/freestyle.ts");
const { TRACKS } = await import("../src/tracks.ts");
const { encode, decode, hashOf, packMode, unpackMode, B_AUTO, B_READY } = await import("../src/net.ts");
// (Not in the package's exports map: imported by its file.)
const { syncCheck } = await import("../node_modules/@fzlt/core/dist/presence-check.js");

/** Seat p's scripted input on frame f (its own pattern: only it would know it). */
const script = (f, p) => encode(f % 400 < 380 ? 1 : 0, f % 400 >= 380 ? 1 : 0, Math.sin(f / (37 + p * 11) + p), f % 300 < 25 ? 1 : 0, f % 220 < 45 ? 1 : 0, f > 600 ? B_AUTO : 0);

test("the wire format: inputs survive the trip, the host's pick fits in a byte", () => {
  const IN = new Float64Array(10), AUTO = new Uint8Array(2);
  decode(encode(1, 0, -1, 1, 1, B_AUTO), 1, IN, AUTO);
  assert.deepEqual(Array.from(IN.slice(5)), [1, 0, -1, 1, 1]);
  assert.equal(AUTO[1], 1);
  decode(encode(0.5, 0.25, 0.3, 0, 0), 0, IN, AUTO);
  assert.ok(Math.abs(IN[0] - 0.5) < 0.04 && Math.abs(IN[1] - 0.25) < 0.04 && Math.abs(IN[2] - 0.3) < 0.01 && AUTO[0] === 0);
  assert.ok(encode(0, 0, 0, 0, 0, B_READY) & B_READY);
  for (const m of [[false, 3, 3, 1], [true, 0, 0, 0], [false, 2, 0, 7]]) assert.deepEqual(Object.values(unpackMode(packMode(...m))), m);
});

for (const [name, make] of [
  ["a race (two people, three rivals)", () => createRace(TRACKS[2], 77, { humans: 2, rivals: 3, laps: 1 })],
  ["a Freestyle jam", () => createFreestyle(77, { humans: 2, jam: 60 })],
])
  test(`two screens, one input stream: ${name} stays identical; one wrong input shows in the hash`, () => {
    const a = make(), b = make(), c = make();
    let first = -1;
    for (let f = 0; f < 60 * 150 && a.R[0] !== DONE; f++) {
      for (const [s, bad] of [[a, 0], [b, 0], [c, 1]]) {
        for (let p = 0; p < 2; p++) decode(bad && f === 500 && p === 1 ? script(f, p) ^ 0xff00 : script(f, p), p, s.IN, s.AUTO);
        s.step(1 / 60);
        s.clear();
      }
      if (f % 30 === 29) {
        assert.equal(hashOf(a.bytes), hashOf(b.bytes), `frame ${f}: the same state`);
        if (first < 0 && hashOf(a.bytes) !== hashOf(c.bytes)) first = f;
      }
    }
    assert.ok(first >= 500 && first < 560, `the wrong input was caught by the hash check at frame ${first}`);
    if (a.kind === "race") assert.equal(a.R[0], DONE, "the race finished");
  });

test("lockstep over a link with latency and jitter (presence syncCheck): race and Freestyle", () => {
  for (const [name, make] of [["race", () => createRace(TRACKS[0], 9, { humans: 2, rivals: 3 })], ["freestyle", () => createFreestyle(9, { humans: 2 })]])
    for (const [latency, jitter] of [[0, 0], [3, 2]]) {
      const setup = (e, slot) => {
        const sim = make();
        let f = 0;
        // The state as syncCheck reads it after each frame: the hash of every byte of it (one 4-byte view).
        const state = new Uint8Array(4), dv = new DataView(state.buffer);
        return {
          input: () => script(f++, slot),
          step: (_e, inputs) => {
            for (let p = 0; p < 2; p++) decode(inputs[p], p, sim.IN, sim.AUTO);
            sim.step(1 / 60);
            sim.clear();
            dv.setUint32(0, hashOf(sim.bytes));
          },
          state,
        };
      };
      const r = syncCheck(setup, { players: 2, frames: 900, seed: 3, latency, jitter });
      assert.ok(r.ok, `${name}, latency ${latency} ± ${jitter}: ${JSON.stringify(r)}`);
    }
});
