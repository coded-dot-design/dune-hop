// The buggy's wheel-side parts in the draw order: the real buggy (src/buggy.ts) in the real diorama,
// drawn into a recording canvas, at 16 headings × 3 pitches × 3 rolls, steered and straight, under a
// chase, a table and a low hero camera from 8 sides, with the car in the middle of the picture and
// off to one side (a close camera sees an off-centre car a little from the side). Every face is told
// apart by its colour: the body (every part not on a wheel) in one, and each wheel's tyre, hub cap,
// axle stub and suspension arm in its own. Each of those must paint after every body face when its
// wheel is on the eye's side of the car and before every one when it is on the far side, and inside
// the wheel after the parts inboard of it (near) or before them (far): arm, tyre, cap, stub. The side is
// read from the drawn matrices and the camera's eye (which side of the car's centre line the eye is
// on), not from `farSide`. Two controls fail the same check: every wheel part over the body (0.2.2)
// and 0.3.0's rule (the side by the screen's forward axis, the arms on the body's layer).
import test from "node:test";
import assert from "node:assert/strict";
import { PerformanceObserver } from "node:perf_hooks";
import { diorama } from "@fzlt/core/diorama";
const { buildBuggy, wheelLayers, BODY: BODY_LAYER, NEAR, FAR } = await import("../src/buggy.ts");

// The diorama's shades of a colour (its `rgb`, levels 0..40), to tell each painted face's colour back.
const rgb = (col, b) => {
  const n = parseInt(col.slice(1), 16), f = (c) => (b <= 1 ? c * b : c + (255 - c) * (b - 1) * 0.9) | 0;
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
const KINDS = ["tyre", "cap", "axle", "arm"], OUT = [1, 2, 3, 0]; // each kind's place out from the car
// The body, then per wheel (4) per kind (4): 17 colours, every shade of each told apart.
const COLS = ["#f00000"];
for (let w = 0; w < 4; w++) for (let k = 0; k < 4; k++) COLS.push("#" + [(w * 4 + k + 1) * 14, 255 - (w * 4 + k) * 13, (w * 4 + k) % 2 ? 40 : 200].map((v) => v.toString(16).padStart(2, "0")).join(""));
const WHO = new Map();
for (let l = 0; l <= 40; l++) COLS.forEach((c, i) => { const k = rgb(c, 0.5 + (l / 40) * 0.62); assert.ok(!WHO.has(k) || WHO.get(k) === i, "colours told apart"); WHO.set(k, i); });

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
  b.root.tint = COLS[0];
  b.parts.forEach((ps, w) => { assert.equal(ps.length, KINDS.length); ps.forEach((p, k) => (p.tint = COLS[1 + w * 4 + k])); });
  b.hubs.forEach((h, i) => ((h.pos[1] = -0.34), (h.pos[0] = W[i * 2]), (h.pos[2] = W[i * 2 + 1])));
  return { d, b, fills };
}

/** [first, last] paint index per colour (body first), from the recorded fills. */
function spans(fills) {
  const S = COLS.map(() => [Infinity, -1]);
  fills.forEach((f, i) => {
    const w = WHO.get(f);
    assert.notEqual(w, undefined, `unknown fill ${f}`);
    S[w][0] = Math.min(S[w][0], i);
    S[w][1] = Math.max(S[w][1], i);
  });
  return S;
}

/** Near: the eye is on the wheel's side of the car's centre line (from the drawn matrices). */
function near(d, b, i) {
  const h = b.hubs[i], M = b.root.M, ly = h.pos[1], c = d.cam, cp = Math.cos(c.pitch);
  const ax = M[9] + M[1] * ly, ay = M[10] + M[4] * ly, az = M[11] + M[7] * ly; // the centre line at the hub's height
  const ex = c.tx + c.dist * Math.sin(c.yaw) * cp, ey = c.ty + c.dist * Math.sin(c.pitch), ez = c.tz + c.dist * Math.cos(c.yaw) * cp;
  return (h.M[9] - ax) * (ex - ax) + (h.M[10] - ay) * (ey - ay) + (h.M[11] - az) * (ez - az) > 0;
}

/** 0.3.0's rule, for the control: the side by the camera's forward axis; the arms on the body's layer. */
function rule030(d, b) {
  const c = d.cam, cp = Math.cos(c.pitch), fx = -Math.sin(c.yaw) * cp, fy = -Math.sin(c.pitch), fz = -Math.cos(c.yaw) * cp;
  b.parts.forEach((ps, i) => {
    const h = b.hubs[i], M = b.root.M, lx = h.pos[0], lz = h.pos[2];
    const far = (M[0] * lx + M[2] * lz) * fx + (M[3] * lx + M[5] * lz) * fy + (M[6] * lx + M[8] * lz) * fz > 0;
    ps.forEach((p, k) => (p.layer = KINDS[k] === "arm" ? BODY_LAYER : far ? FAR : NEAR));
  });
}

const CAMS = [
  { name: "chase", pitch: 0.55, dist: 13 },
  { name: "close chase", pitch: 0.5, dist: 6 },
  { name: "table", pitch: 0.82, dist: 34 },
  { name: "hero", pitch: 0.2, dist: 7 },
];
// Where the car sits: under the camera's target, or off to one side of it (the chase's lead and
// sway, the hero's car right of centre, any car but the one followed).
const AT = [[0, 0], [2.6, -1.8]];

function sweep(mode, step = 1) {
  const { d, b, fills } = scene();
  let checked = 0, wrong = 0;
  const bad = [];
  for (const cam of CAMS)
    for (const [ax, az] of AT)
      for (let cy = 0; cy < 8; cy++)
        for (let h = 0; h < 16; h += step)
          for (const pitch of [-0.25, 0, 0.25])
            for (const roll of [-0.3, 0, 0.3])
              for (const steer of [0, 0.45]) {
                Object.assign(d.cam, { yaw: (cy / 8) * Math.PI * 2 + 0.1, pitch: cam.pitch, dist: cam.dist, tx: 0, ty: 0.3, tz: 0, ox: 0, oy: 0 });
                b.root.pos[0] = ax; b.root.pos[2] = az;
                b.root.rot[0] = roll; b.root.rot[1] = (h / 16) * Math.PI * 2; b.root.rot[2] = pitch;
                b.hubs[0].rot[1] = b.hubs[1].rot[1] = -steer;
                d.draw(); // the matrices for `near` and the control (this pose's)
                if (mode === "fix") wheelLayers(d, b);
                else if (mode === "0.3.0") rule030(d, b);
                else b.parts.forEach((ps) => ps.forEach((p) => (p.layer = NEAR)));
                fills.length = 0;
                d.draw();
                const S = spans(fills), body = S[0];
                if (body[1] < 0) continue;
                for (let i = 0; i < 4; i++) {
                  const n = near(d, b, i);
                  for (let k = 0; k < KINDS.length; k++) {
                    const s = S[1 + i * 4 + k];
                    if (s[1] < 0) continue; // every face of it turned away
                    checked++;
                    // Against the body, and inside the wheel (out from the car: arm, tyre, cap, stub): on the
                    // near side each part paints after the ones inboard of it, on the far side before them.
                    let ok = n ? s[0] > body[1] : s[1] < body[0];
                    for (let j = 0; j < 4 && ok; j++) {
                      const t = S[1 + i * 4 + j];
                      if (t[1] >= 0 && OUT[j] < OUT[k]) ok = n ? s[0] > t[1] : s[1] < t[0];
                    }
                    if (ok) continue;
                    wrong++;
                    if (bad.length < 3) bad.push(`${cam.name} at ${ax},${az} cam ${cy} heading ${h} pitch ${pitch} roll ${roll} steer ${steer}: wheel ${i}'s ${KINDS[k]} (${n ? "near" : "far"})`);
                  }
                }
              }
  return { checked, wrong, bad };
}

test("every wheel part (tyre, hub cap, axle stub, arm) paints over the body on the near side, under it on the far side, in order inside the wheel", () => {
  const r = sweep("fix");
  assert.ok(r.checked > 50000, `checked ${r.checked}`);
  assert.equal(r.wrong, 0, `${r.wrong} of ${r.checked}: ${r.bad.join("; ")}`);
});

test("the check sees the old orders as wrong: every wheel part over the body (0.2.2), and 0.3.0's rule", () => {
  const all = sweep("none", 4), r030 = sweep("0.3.0", 2);
  assert.ok(all.wrong > all.checked / 4, `0.2.2: wrong ${all.wrong} of ${all.checked}`);
  assert.ok(r030.wrong > 0, `0.3.0: wrong ${r030.wrong} of ${r030.checked}`);
  console.log(`wheels: 0.2.2 order wrong ${all.wrong} of ${all.checked}; 0.3.0 rule wrong ${r030.wrong} of ${r030.checked}: ${r030.bad.join("; ")}`);
});

test("wheelLayers allocates nothing (young GCs over 1,000,000 calls)", async () => {
  const { d, b } = scene();
  const R = b.root.rot;
  for (let i = 0; i < 20000; i++) (R[1] = i * 0.01), wheelLayers(d, b);
  let minor = 0;
  const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.detail?.kind === 1 || e.kind === 1) minor++; });
  globalThis.gc?.();
  obs.observe({ entryTypes: ["gc"] });
  for (let i = 0; i < 1000000; i++) (R[1] = i * 0.001), (R[0] = (i & 15) * 0.02), wheelLayers(d, b);
  await new Promise((ok) => setTimeout(ok, 50));
  obs.disconnect();
  assert.equal(minor, 0, `young GCs: ${minor}`);
});
