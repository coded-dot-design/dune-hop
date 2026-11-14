// The camera holds still (Chromium, the built dist/dune-hop.mjs): a whole autopilot race at 390 × 844
// (touch) with the mobile URL bar shown and hidden over and over (height-only viewport resizes), and
// one at 1440 × 900 with a window resize; every frame's camera is read (game.camera(): distance and
// `scale`, px per world unit at your buggy). The chase framing stays within ±4% (8% in all) of the
// framing at the start of the race, in both views (chase and table), and a double-tap or a pinch on
// the stage never zooms the page (visualViewport.scale stays 1). Waits on state, never on time.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serve, launchOptions } from "./serve.mjs";

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Camera</title>
<style>html,body{margin:0;height:100%}#board{position:relative;width:100%;height:100vh}</style></head>
<body><div id="board"></div><script type="module">import { createDuneHop } from "/dist/dune-hop.mjs"; window.game = createDuneHop({ host: document.getElementById("board"), keyboard: "page", seed: 7 });
// Every drawn frame's camera, from the race's GO on.
window.cams = []; const tick = () => { const s = game.getSnapshot(); if (s.phase === "race" && s.status === "running") cams.push(game.camera()); requestAnimationFrame(tick); }; requestAnimationFrame(tick);</script></body></html>`;
const server = await serve(".", { "/": page });
const browser = await chromium.launch(launchOptions());
const until = (p, fn, arg, what, timeout = 60000) => p.waitForFunction(fn, arg, { timeout, polling: 50 }).catch(() => assert.fail(`${what}: timed out`));
const OUT = process.env.CAM_OUT;
const BOUND = 0.04;
const ALL = [
  // name, viewport, touch, the resizes (each [w, h]) played through the race, view switch
  ["phone", { width: 390, height: 844 }, true, [[390, 744], [390, 844], [390, 764], [390, 844], [390, 744], [390, 844], [390, 790], [390, 844]]],
  ["desktop", { width: 1440, height: 900 }, false, [[1440, 820], [1440, 900], [1400, 900], [1440, 900]]],
];
const RUNS = ALL.filter((r) => !process.env.CAM_ONLY || r[0] === process.env.CAM_ONLY);
const report = {};
try {
  for (const [name, viewport, touch, sizes] of RUNS) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(server.url + "/");
    await until(p, () => window.game, null, `${name}: mounts`);
    await p.evaluate(() => (game.auto = true, game.start("sunset-loop")));
    await until(p, () => game.getSnapshot().phase === "race", null, `${name}: GO`);
    // Laps run; the viewport changes at gates (the URL bar shows and hides as the page scrolls).
    for (const [i, [w, h]] of sizes.entries()) {
      const at = await p.evaluate(() => { const s = game.getSnapshot(); return s.lap * 100 + s.gate; });
      await until(p, (a) => { const s = game.getSnapshot(); return s.lap * 100 + s.gate > a || s.phase === "done"; }, at, `${name}: a gate after resize ${i}`);
      await p.setViewportSize({ width: w, height: h });
      // Halfway, a look at the whole table (V) and back.
      if (i === 2) await p.keyboard.press("KeyV");
      if (i === 4) await p.keyboard.press("KeyV");
    }
    await until(p, () => game.getSnapshot().phase === "done", null, `${name}: the race ends`, 240000);
    const cams = await p.evaluate(() => cams);
    // Each view's frames from 2.5 s after it began (GO, a switch with V: the camera's ease from the
    // other view), so what is left is the framing while it drives.
    const chase = [], table = [];
    for (let i = 0, since = 0; i < cams.length; i++) {
      since = i && cams[i].view !== cams[i - 1].view ? 0 : since + 1;
      if (since >= 150) (cams[i].view === "chase" ? chase : table).push(cams[i]);
    }
    for (const c of table) c.frame = c.focal / c.dist;
    const range = (a, k) => { let lo = Infinity, hi = -Infinity; for (const c of a) (lo = Math.min(lo, c[k])), (hi = Math.max(hi, c[k])); return { lo, hi, swing: hi / lo - 1 }; };
    report[name] = { frames: cams.length, chase: { scale: range(chase, "scale"), dist: range(chase, "dist"), focal: range(chase, "focal"), h: range(chase, "h") }, table: { frame: range(table, "frame"), focal: range(table, "focal") } };
    if (OUT) report[name].series = cams.map((c) => [c.view === "chase" ? 1 : 0, +c.scale.toFixed(3), +c.dist.toFixed(3), +c.focal.toFixed(1), c.h]);
    if (!OUT) {
      const s = report[name].chase;
      const mid = Math.sqrt(s.scale.lo * s.scale.hi);
      assert.ok(s.scale.hi / mid - 1 <= BOUND && 1 - s.scale.lo / mid <= BOUND, `${name}: the chase scale holds within ±${BOUND * 100}% (${s.scale.lo.toFixed(2)}–${s.scale.hi.toFixed(2)} px/unit)`);
      assert.ok(s.focal.swing < 0.001, `${name}: no refit on a resize: focal ${s.focal.lo.toFixed(1)}–${s.focal.hi.toFixed(1)}`);
      const t = report[name].table;
      assert.ok(table.length > 30 && t.frame.swing < 0.001 && t.focal.swing < 0.001, `${name}: the table view holds its framing through a resize (${t.frame.lo.toFixed(2)}–${t.frame.hi.toFixed(2)} px/unit)`);
    }
    // A double-tap and a pinch on the stage: the page never zooms.
    if (touch) {
      // The course, a HUD key (the view key) and the pad's gap between the stick and the keys.
      const spots = await p.evaluate(() => {
        const root = document.querySelector("[data-fizlet-host]").shadowRoot, b = document.getElementById("board").getBoundingClientRect();
        const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
        const pad = root.querySelector(".dh-pad").getBoundingClientRect();
        return { course: { x: b.left + b.width / 2, y: b.top + b.height * 0.3 }, key: mid([...root.querySelectorAll(".dh-key")].find((k) => k.offsetParent)), pad: { x: pad.left + pad.width / 2, y: pad.top + 8 } };
      });
      const cdp = await ctx.newCDPSession(p);
      const frames = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      report[name].zoom = {};
      for (const [where, { x, y }] of Object.entries(spots)) {
        for (let n = 0; n < 2; n++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        }
        await frames();
        const tap = await p.evaluate(() => visualViewport.scale);
        // A pinch: two fingers down 16 px apart, spread to 220.
        const two = (type, d) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: d == null ? [] : [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }] });
        await two("touchStart", 8);
        for (let d = 14; d <= 110; d += 6) await two("touchMove", d);
        await two("touchEnd");
        await frames();
        report[name].zoom[where] = { doubleTap: tap, pinch: await p.evaluate(() => visualViewport.scale) };
        if (!OUT) assert.deepEqual(report[name].zoom[where], { doubleTap: 1, pinch: 1 }, `${name}: a double-tap and a pinch on the ${where} do not zoom the page`);
        // (A zoomed page, when measuring the old build: back to 1 for the next spot.)
        if (report[name].zoom[where].pinch !== 1) await cdp.send("Emulation.resetPageScaleFactor");
      }
    }
    assert.deepEqual(errs, [], `${name}: no page errors`);
    await ctx.close();
    const r = report[name], pc = (x) => (x * 100).toFixed(1) + "%";
    console.log(`ok ${name}: ${r.frames} frames, canvas ${r.chase.h.lo}–${r.chase.h.hi} px tall; chase scale ${r.chase.scale.lo.toFixed(1)}–${r.chase.scale.hi.toFixed(1)} px/unit (${pc(r.chase.scale.swing)}), focal ${pc(r.chase.focal.swing)}; table ${pc(r.table.frame.swing)}${r.zoom ? "; zoom " + JSON.stringify(r.zoom) : ""}`);
  }
  if (OUT) (await import("node:fs")).writeFileSync(OUT, JSON.stringify(report));
} finally {
  await browser.close();
  await server.close();
}
