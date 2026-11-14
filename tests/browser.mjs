// Dune Hop in Chromium (the built dist/dune-hop.mjs), at 1440 (keyboard and mouse) and 390 (touch):
// it mounts in the page's board with the track menu (every key 44 px or more) and the race drawn
// on the canvas; a track key starts the countdown, then GO; the keyboard (↑) and the mouse (hold on
// the course) drive on a desktop, the pad's GAS key on a phone; P pauses (the clock holds) and
// resumes; the autopilot runs a whole race to the result card, whose time becomes the track's best
// on the menu; reduced motion still plays (no shake, the camera snaps); the attract lap runs by
// itself and a tap takes the wheel; dropped onto a page (no host) Escape gives the page back byte
// for byte and no frame runs after. Waits on state, never on time.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { serve, launchOptions } from "./serve.mjs";

const fixture = readFileSync("tests/fixtures/page.html", "utf8");
const withGame = (opts) => fixture.replace("</body>", `<script type="module">import { createDuneHop } from "/dist/dune-hop.mjs"; window.game = createDuneHop({ host: document.getElementById("board"), keyboard: "page", seed: 7, ...${JSON.stringify(opts)} });</script></body>`);
const server = await serve(".", { "/": withGame({}), "/attract": withGame({ attract: true, track: "neon-edge" }), "/plain": fixture });
const browser = await chromium.launch(launchOptions());
const snap = (p) => p.evaluate(() => game.getSnapshot());
const until = (p, fn, arg, what, timeout = 20000) => p.waitForFunction(fn, arg, { timeout, polling: 50 }).catch(() => assert.fail(`${what}: timed out`));
const sh = (p, fn) => p.evaluate(fn);
const VIEWS = [["desktop", { width: 1440, height: 900 }, false], ["phone", { width: 390, height: 844 }, true]];

try {
  for (const [name, viewport, touch] of VIEWS) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(server.url + "/");
    await until(p, () => window.game, null, `${name}: mounts`);
    await p.evaluate(() => document.getElementById("board").scrollIntoView({ block: "center" }));
    const m = await sh(p, () => {
      const root = document.querySelector("[data-fizlet-host]").shadowRoot, cv = root.querySelector("canvas"), r = cv.getBoundingClientRect();
      const keys = [...root.querySelectorAll(".dh-key, .dh-tracks button, .bui-pad button")].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect()).map((k) => Math.min(k.width, k.height) >= 44);
      return { status: game.getSnapshot().status, menu: !root.querySelector(".dh-menu").hidden, tracks: root.querySelectorAll(".dh-tracks button").length, canvas: r.width > 200 && r.height > 150, keys: keys.length > 4 && keys.every(Boolean), pad: !!root.querySelector(".dh-pad").offsetParent };
    });
    assert.deepEqual(m, { status: "idle", menu: true, tracks: 4, canvas: true, keys: true, pad: touch }, `${name}: the menu, four tracks, keys ≥ 44 px, the pad on touch only`);
    // A track key only selects (the preview changes); START races it: the countdown, then GO.
    await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelectorAll(".dh-tracks button")[1].click());
    const picked = await sh(p, () => { const root = document.querySelector("[data-fizlet-host]").shadowRoot; return { status: game.getSnapshot().status, track: game.track, pressed: root.querySelectorAll(".dh-tracks button[aria-pressed=true]").length }; });
    assert.deepEqual(picked, { status: "idle", track: "ridge-run", pressed: 1 }, `${name}: a track key selects, no race yet`);
    await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelectorAll(".dh-tracks button")[0].click());
    await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-start").click());
    assert.equal((await snap(p)).phase, "count", `${name}: START: the countdown`);
    await until(p, () => game.getSnapshot().phase === "race", null, `${name}: GO`);
    const s0 = await snap(p);
    if (!touch) {
      await p.keyboard.down("ArrowUp");
      await until(p, (a) => { const s = game.getSnapshot(); return Math.hypot(s.player.x - a.x, s.player.y - a.y) > 30; }, s0.player, `${name}: ↑ drives`);
      await p.keyboard.up("ArrowUp");
      // The mouse: hold on the course for gas.
      await until(p, () => game.getSnapshot().speed < 1.5, null, `${name}: coasts`, 15000).catch(() => {});
      const sp0 = (await snap(p)).speed;
      await p.mouse.move(viewport.width / 2, viewport.height / 2);
      await p.mouse.down();
      await until(p, (a) => game.getSnapshot().speed > a + 2, sp0, `${name}: holding the mouse drives`);
      await p.mouse.up();
    } else {
      const gas = await p.evaluate(() => { const b = document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".bui-pad button[aria-label^='Gas']").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: gas.x, y: gas.y, id: 1 }] });
      await until(p, (a) => { const s = game.getSnapshot(); return Math.hypot(s.player.x - a.x, s.player.y - a.y) > 30; }, s0.player, `${name}: the pad's GAS drives`);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      // The steer pad (the default on a phone): left and right keys only, the four keys on the right.
      const keysOf = () => p.evaluate(() => {
        const root = document.querySelector("[data-fizlet-host]").shadowRoot, pad = root.querySelector(".bui-pad"), r = (e) => e.getBoundingClientRect();
        const moves = [...pad.querySelectorAll(".bui-pad-move button")].map((b) => b.getAttribute("aria-label")), big = [...pad.querySelectorAll("button, .bui-stick")].every((b) => Math.min(r(b).width, r(b).height) >= 44);
        return { moves, stick: !!pad.querySelector(".bui-stick"), acts: [...pad.querySelectorAll(".bui-pad-keys button small")].map((b) => b.textContent), big, h: Math.round(r(pad).height), top: Math.round(r(pad).top) };
      });
      const steerPad = await keysOf();
      assert.deepEqual([steerPad.moves, steerPad.stick, steerPad.acts, steerPad.big], [["Left", "Right"], false, ["GAS", "BRAKE", "DRIFT", "BOOST"], true], `${name}: the steer pad (◀ ▶) and GAS · BRAKE · DRIFT · BOOST, keys ≥ 44 px`);
      const right = await p.evaluate(() => { const b = document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".bui-pad-move button[aria-label=Right]").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
      const y0 = (await snap(p)).player.angle;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: gas.x, y: gas.y, id: 1 }, { x: right.x, y: right.y, id: 2 }] });
      await until(p, (a) => Math.abs(game.getSnapshot().player.angle - a) > 0.3, y0, `${name}: GAS + ▶ on the steer pad turns the buggy`);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      // The pause card's STEERING key swaps to the stick (no layout shift), remembered on the device.
      await sh(p, () => game.pause());
      await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-padk").click());
      const stickPad = await keysOf();
      assert.deepEqual([stickPad.moves, stickPad.stick, stickPad.acts, stickPad.big], [[], true, ["GAS", "BRAKE", "DRIFT", "BOOST"], true], `${name}: the stick layout`);
      assert.deepEqual([stickPad.h, stickPad.top], [steerPad.h, steerPad.top], `${name}: swapping layouts shifts nothing`);
      assert.equal(await p.evaluate(() => localStorage.getItem("dune-hop:pad")), "stick", `${name}: the choice is remembered`);
      await sh(p, () => game.resume());
    }
    const s1 = await snap(p);
    assert.ok(Math.hypot(s1.player.x - s0.player.x, s1.player.y - s0.player.y) > 20, `${name}: the buggy moved`);
    assert.equal(s1.view, "chase", `${name}: the chase view`);
    // Pause: the clock holds; resume.
    await p.keyboard.press("KeyP");
    await until(p, () => game.getSnapshot().status === "paused", null, `${name}: P pauses`);
    const t0 = (await snap(p)).elapsed;
    await until(p, () => game.engine.paused.includes("settled"), null, `${name}: paused, it sleeps`);
    assert.equal((await snap(p)).elapsed, t0, `${name}: the clock held`);
    await p.keyboard.press("KeyP");
    await until(p, (t) => game.getSnapshot().status === "running" && game.getSnapshot().elapsed > t, t0, `${name}: P resumes`);
    // The autopilot runs the race to the flag: the result card, a track best on the menu.
    await p.evaluate(() => (game.auto = true));
    await until(p, () => game.getSnapshot().status === "won" || game.getSnapshot().status === "gameover", null, `${name}: the result card`, 120000);
    const card = await sh(p, () => { const r = document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-result"); return { head: r.querySelector(".dh-r-head").textContent, time: r.querySelector(".dh-r-time").textContent, rows: r.querySelectorAll(".dh-results li").length }; });
    assert.match(card.head, /YOU WIN|FINISH · \d(ST|ND|RD|TH)/, `${name}: the result: ${card.head}`);
    assert.match(card.time, /^\d:\d\d\.\d · TRACK BEST$/, `${name}: the time is the track's best: ${card.time}`);
    assert.equal(card.rows, 4, `${name}: four on the standings`);
    await until(p, () => game.engine.paused.includes("settled"), null, `${name}: settles on the result`, 40000);
    await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-r-tracks").click());
    assert.match(await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-tracks button").textContent), /BEST \d:\d\d\.\d/, `${name}: the menu shows the best time`);
    assert.deepEqual(errs, [], `${name}: no page errors`);
    await ctx.close();
  }

  // Reduced motion: it still plays.
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    await p.goto(server.url + "/");
    await until(p, () => window.game, null, "reduced: mounts");
    await p.evaluate(() => (document.getElementById("board").scrollIntoView({ block: "center" }), game.start("ridge-run"), (game.auto = true)));
    await until(p, () => game.getSnapshot().elapsed > 2, null, "reduced motion: plays");
    await ctx.close();
  }

  // The attract lap: drives itself in the chase view; a tap takes the wheel.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(server.url + "/attract");
    await until(p, () => window.game, null, "attract: mounts");
    await p.evaluate(() => document.getElementById("board").scrollIntoView({ block: "center" }));
    await until(p, () => { const s = game.getSnapshot(); return s.mode === "demo" && s.speed > 4 && s.view === "chase"; }, null, "attract: the demo lap drives itself");
    const box = await p.locator("#board").boundingBox();
    await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await until(p, () => game.getSnapshot().mode === "race" && !game.auto, null, "attract: a tap takes the wheel");
    await ctx.close();
  }

  // Dropped onto a page (no host): a layer over it; Escape gives the page back byte for byte.
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(server.url + "/plain");
    const before = await p.evaluate(() => document.documentElement.outerHTML);
    await p.evaluate(async () => { const { createDuneHop } = await import("/dist/dune-hop.mjs"); window.game = createDuneHop({ seed: 2 }); game.start(); });
    await until(p, () => game.getSnapshot().phase === "race", null, "drop-in: races");
    await p.keyboard.down("ArrowUp");
    await until(p, () => game.getSnapshot().speed > 2, null, "drop-in: the page's keys drive it");
    await p.keyboard.up("ArrowUp");
    await p.keyboard.press("Escape");
    await until(p, () => !document.querySelector("[data-fizlet-host]"), null, "drop-in: Escape closes it");
    const after = await p.evaluate(() => document.documentElement.outerHTML);
    assert.equal(after, before, "drop-in: Recall gives the page back byte for byte");
    const f0 = await p.evaluate(() => game.engine.stats().frames);
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    assert.equal(await p.evaluate(() => game.engine.stats().frames), f0, "drop-in: no frames after Recall");
    await ctx.close();
  }
  console.log("Dune Hop: menu (select, then START), countdown, keyboard, mouse, both touch layouts (steer pad and stick, remembered), pause/resume, a full race to the result and a track best, reduced motion, the attract lap and its takeover, Recall byte for byte; at 1440 and 390.");
} finally {
  await browser.close();
  await server.close();
}
