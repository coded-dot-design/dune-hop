// The buggy's wheels in the draw order: the real buggy (src/buggy.ts) in the real diorama, drawn into
// a recording canvas, at 16 headings × 3 pitches × 3 rolls, steered and straight, under a chase, a
// table and a low hero camera from 8 sides. Every face is told apart by its colour (the body in one,
// each wheel in its own), and each wheel must paint after every body face when it is on the camera's
// side of the car and before every one when it is on the far side; which side is read from the
// diorama's own projection of the drawn matrices, not from `farSide`. Without `wheelLayers` the same
// check fails (the far wheels painted over the body, the bug in 0.2.2), so the test can see it.
import test from "node:test";
import assert from "node:assert/strict";
import { diorama } from "@fzlt/core/diorama";
const { buildBuggy, wheelLayers, NEAR } = await import("../src/buggy.ts");

// The diorama's shades of a colour (its `rgb`, levels 0..40), to tell each painted face's colour back.
const rgb = (col, b) => {
  const n = parseInt(col.slice(1), 16), f = (c) => (b <= 1 ? c * b : c + (255 - c) * (b - 1) * 0.9) | 0;
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
const BODY = "#f00000", WHEEL = ["#00f000", "#0000f0", "#f0f000", "#00f0f0"];
const WHO = new Map();
for (let l = 0; l <= 40; l++) {
  WHO.set(rgb(BODY, 0.5 + (l / 40) * 0.62), -1);
  WHEEL.forEach((c, w) => WHO.set(rgb(c, 0.5 + (l / 40) * 0.62), w));
}

function scene() {
  const fills = [];
  const ctx = new Proxy({ fill() { fills.push(this.fillStyle); } }, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => ((t[k] = v), true),
  });
  const canvas = { getContext: () => ctx, width: 0, height: 0, clientWidth: 800, clientHeight: 600 };
  const d = diorama(canvas, { maxFaces: 4000 });
  d.resize(800, 600, 1);
  const c = { chassis: "#1d1c28", body: "#eef0ff", acc: "#22e6ff", cage: "#b9bdd8", hub: "#8d92b4", helmet: "#ff4fa8", visor: "#0a0c16", lamp: "#fff7d6", tail: "#ff2e88", tyre: "#111118", cap: "#8d92b4" };
  const W = [0.8, -0.78, 0.8, 0.78, -0.74, -0.76, -0.74, 0.76];
  const b = buildBuggy(d, "car0", c, W, { car: 0 });
  b.root.tint = BODY;
  b.parts.forEach((ps, w) => ps.forEach((p) => (p.tint = WHEEL[w])));
  b.hubs.forEach((h, i) => ((h.pos[1] = -0.34), (h.pos[0] = W[i * 2]), (h.pos[2] = W[i * 2 + 1])));
  return { d, b, fills };
}

/** Each wheel's [first, last] paint index and the body's, from the recorded fills. */
function spans(fills) {
  const S = [[Infinity, -1], [Infinity, -1], [Infinity, -1], [Infinity, -1], [Infinity, -1]];
  fills.forEach((f, i) => {
    const w = WHO.get(f);
    assert.notEqual(w, undefined, `unknown fill ${f}`);
    const s = S[w + 1];
    s[0] = Math.min(s[0], i);
    s[1] = Math.max(s[1], i);
  });
  return S;
}

const P = new Float64Array(3);
/** Near: the hub's centre is nearer the camera than the car's centre line at the hub's height. */
function near(d, b, i) {
  const h = b.hubs[i], M = b.root.M, ly = h.pos[1];
  d.project(h.M[9], h.M[10], h.M[11], P);
  const zh = P[2];
  d.project(M[9] + M[1] * ly, M[10] + M[4] * ly, M[11] + M[7] * ly, P);
  return zh < P[2];
}

const CAMS = [
  { name: "chase", pitch: 0.55, dist: 13 },
  { name: "table", pitch: 0.82, dist: 34 },
  { name: "hero", pitch: 0.2, dist: 9 },
];

function sweep(fix) {
  const { d, b, fills } = scene();
  let checked = 0, wrong = 0;
  const bad = [];
  for (const cam of CAMS)
    for (let cy = 0; cy < 8; cy++)
      for (let h = 0; h < 16; h++)
        for (const pitch of [-0.25, 0, 0.25])
          for (const roll of [-0.3, 0, 0.3])
            for (const steer of [0, 0.45]) {
              Object.assign(d.cam, { yaw: (cy / 8) * Math.PI * 2 + 0.1, pitch: cam.pitch, dist: cam.dist, tx: 0, ty: 0.3, tz: 0, ox: 0, oy: 0 });
              b.root.rot[0] = roll; b.root.rot[1] = (h / 16) * Math.PI * 2; b.root.rot[2] = pitch;
              b.hubs[0].rot[1] = b.hubs[1].rot[1] = -steer;
              if (fix) wheelLayers(d, b);
              else b.parts.forEach((ps) => ps.forEach((p) => (p.layer = NEAR)));
              d.draw(); // the matrices for `near` (this draw's) and its paint order
              fills.length = 0;
              d.draw();
              const S = spans(fills), body = S[0];
              for (let i = 0; i < 4; i++) {
                const s = S[i + 1];
                if (s[1] < 0 || body[1] < 0) continue;
                checked++;
                const ok = near(d, b, i) ? s[0] > body[1] : s[1] < body[0];
                if (!ok) (wrong++), bad.length < 3 && bad.push(`${cam.name} cam ${cy} heading ${h} pitch ${pitch} roll ${roll} steer ${steer} wheel ${i}`);
              }
            }
  return { checked, wrong, bad };
}

test("near wheels paint over the body, far wheels under it, at every heading, pitch, roll and view", () => {
  const r = sweep(true);
  assert.ok(r.checked > 10000, `checked ${r.checked}`);
  assert.equal(r.wrong, 0, r.bad.join("; "));
});

test("the check sees the old order (every wheel over the body) as wrong", () => {
  const r = sweep(false);
  assert.ok(r.wrong > r.checked / 4, `wrong ${r.wrong} of ${r.checked}`);
});

test("wheelLayers allocates nothing", () => {
  const { d, b } = scene();
  for (let i = 0; i < 1000; i++) (b.root.rot[1] = i * 0.01), wheelLayers(d, b);
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 200000; i++) (b.root.rot[1] = i * 0.001), (d.cam.yaw = i * 0.0007), wheelLayers(d, b);
  assert.ok(process.memoryUsage().heapUsed - before < 256 * 1024, "heap grew");
});
