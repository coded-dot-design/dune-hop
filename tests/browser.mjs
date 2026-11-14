// Dune Hop in Chromium (the built dist/dune-hop.mjs), at 1440 (keyboard and mouse) and 390 (touch):
// it mounts in the page's board with the track menu (every key 44 px or more) and the race drawn
// on the canvas; a track key starts the countdown, then GO; the keyboard (↑) and the mouse (hold on
// the course) drive on a desktop, the stick on a phone; P pauses (the clock holds) and
// resumes; the autopilot runs a whole race to the result card, whose time becomes the track's best
// on the menu; reduced motion still plays (no shake, the camera snaps); the attract lap runs by
// itself and a tap takes the wheel; dropped onto a page (no host) Escape gives the page back byte
// for byte and no frame runs after. Freestyle: a jump to the next table scores, and it settles when
// left alone. Two on one screen: a view each, side by side (desktop; on a touch-only phone it is held
// back behind ?split=touch: stacked, a stick each); each person's keys drive only their own car. On
// a phone the stick alone steers, gasses and brakes (touch events, a stretch of the course gate after
// gate), with no GAS key and DRIFT the big corner key: stick-up gas and a held DRIFT drift through the
// bends together; the stick is ≥ 16 px clear of the edge and the cluster at 360–430 wide; the pause
// card swaps STICK and ARROWS (GAS back in the corner, still drivable), and a 0.2.0 saved choice moves to the stick. Waits on state, never on time. (Online: tests/online.mjs.)
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
      return { status: game.getSnapshot().status, menu: !root.querySelector(".dh-menu").hidden, tracks: root.querySelectorAll(".dh-tracks button").length, canvas: r.width > 200 && r.height > 150, keys: keys.length > 4 && keys.every(Boolean), pad: !!root.querySelector(".dh-pad").offsetParent, split: !!root.querySelector("[data-seg=players] [data-v='2']") };
    });
    assert.deepEqual(m, { status: "idle", menu: true, tracks: 4, canvas: true, keys: true, pad: touch, split: !touch }, `${name}: the menu, four tracks, keys ≥ 44 px, the pad on touch only, 2 · SPLIT on desktop only`);
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
      const cdp = await ctx.newCDPSession(p);
      // The stick (the default on a phone) under the left thumb gives the gas, so no GAS key; DRIFT,
      // BRAKE and BOOST as icon keys in a cluster under the right one (DRIFT the big one, in the corner).
      const keysOf = () => p.evaluate(keysOfPad);
      const keysOfPad = () => {
        const root = document.querySelector("[data-fizlet-host]").shadowRoot, pad = root.querySelector(".bui-pad"), r = (e) => e.getBoundingClientRect(), st = pad.querySelector(".bui-stick");
        const keys = [...pad.querySelectorAll(".bui-pad-keys button")].filter((b) => b.offsetParent), kr = keys.map(r), sr = r(pad.querySelector(".bui-pad-move"));
        const hit = (a, b) => Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2) < (a.width + b.width) / 2;
        const clear = kr.every((a, i) => kr.every((b, j) => i === j || !hit(a, b)) && a.left >= sr.right && a.right <= innerWidth);
        const moves = [...pad.querySelectorAll(".bui-pad-move button")].map((b) => b.getAttribute("aria-label")), big = [...pad.querySelectorAll("button, .bui-stick")].filter((b) => b.offsetParent).every((b) => Math.min(r(b).width, r(b).height) >= 44);
        const ci = kr.findIndex((a) => kr.every((b) => a === b || (a.right >= b.right && a.bottom >= b.bottom && a.width > b.width))), sk = st && r(st);
        const room = sk ? { edge: Math.round(Math.min(sk.left, innerHeight - sk.bottom)), gap: Math.round(Math.min(...kr.map((k) => k.left)) - sk.right), size: Math.round(sk.width) } : null;
        return { moves, stick: !!st, acts: keys.map((b) => b.title), icons: keys.every((b) => b.querySelector("svg") && !b.querySelector("small") && b.getAttribute("aria-label")), corner: ci < 0 ? "" : keys[ci].title, clear, big, room, h: Math.round(r(pad).height), top: Math.round(r(pad).top), padk: root.querySelector(".dh-padk").textContent };
      };
      const stickPad = await keysOf();
      assert.deepEqual([stickPad.moves, stickPad.stick, stickPad.acts, stickPad.icons, stickPad.corner, stickPad.clear, stickPad.big, stickPad.padk], [[], true, ["Brake", "Drift, the handbrake", "Nitro boost"], true, "Drift, the handbrake", true, true, "STICK"], `${name}: the stick and the icon cluster (no GAS key, DRIFT in the corner), no overlaps, keys ≥ 44 px`);
      // The stick is thumb-sized and ≥ 16 px clear of the screen's edge and the cluster at 360–430 wide.
      for (const w of [360, 390, 430]) {
        await p.setViewportSize({ width: w, height: 844 });
        await until(p, (w) => innerWidth === w, w, `${name}: ${w} wide`);
        const k = await keysOf();
        assert.ok(k.room.size >= 115 && k.room.edge >= 16 && k.room.gap >= 16 && k.clear && k.big, `${name} at ${w}: stick ${JSON.stringify(k.room)}`);
      }
      await p.setViewportSize(viewport);
      await until(p, (w) => innerWidth === w, viewport.width, `${name}: back to ${viewport.width}`);
      // Only the stick, with real touches: partway right steers about proportionally (not full) and
      // gives no gas; push up and it drives; then it drives a stretch of the course, gate after gate,
      // steering at the racing line ahead (what a player looks at) and nothing else.
      const st = await p.evaluate(() => { const b = document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".bui-stick").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width * 0.36 }; });
      const t = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
      const frame = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r))));
      await t("touchStart", [[st.x, st.y, 3]]);
      await t("touchMove", [[st.x + st.r * 0.5, st.y, 3]]), await frame();
      await until(p, () => { const c = game.getSnapshot().cars[0]; return c.steer > 0.3 && c.steer < 0.5 && c.gas === 0; }, null, `${name}: the stick partway right: about 0.41 steer, no gas`);
      await t("touchMove", [[st.x, st.y - st.r * 0.95, 3]]), await frame();
      await until(p, () => { const c = game.getSnapshot().cars[0]; return c.gas > 0.85 && Math.abs(c.steer) < 0.05; }, null, `${name}: the stick pushed up: gas`);
      const g0 = (await snap(p)).gate;
      let laps = 0;
      for (let i = 0; i < 2400 && (await snap(p)).gate < g0 + 3; i++) {
        const s = await snap(p), fx = Math.cos(s.player.angle), fz = -Math.sin(s.player.angle), ux = s.aim.x - s.player.x, uz = s.aim.y - s.player.y, ul = Math.hypot(ux, uz) || 1;
        const cross = (fx * uz - fz * ux) / ul, dot = (fx * ux + fz * uz) / ul, steer = dot < 0 ? Math.sign(cross) : Math.max(-1, Math.min(1, cross * 3));
        await t("touchMove", [[st.x + steer * st.r * 0.9, st.y - st.r * 0.75, 3]]);
        laps = i;
      }
      const after = await snap(p);
      assert.ok(after.gate >= g0 + 3 && !after.crashed, `${name}: the stick alone drove through three gates (${g0} → ${after.gate}, ${laps} moves)`);
      await t("touchEnd", [[st.x, st.y, 3]]);
      await until(p, () => { const c = game.getSnapshot().cars[0]; return c.steer === 0 && c.gas === 0 && c.brake === 0; }, null, `${name}: let go: steer, gas and brake back to 0`);
      // Two thumbs at once: stick-up gas on the left, DRIFT held on the right, through the bends: the
      // tail steps out and drift points bank, gate after gate.
      const dk = await p.evaluate(() => { const b = document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".bui-pad button[aria-label^='Drift']").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
      const d0 = await snap(p), dg0 = d0.gate, dt0 = d0.cars[0].driftTotal;
      await t("touchStart", [[st.x, st.y, 3]]);
      await t("touchMove", [[st.x, st.y - st.r * 0.95, 3]]);
      let both = false, held = false;
      for (let i = 0; i < 2400 && ((await snap(p)).cars[0].driftTotal <= dt0 || (await snap(p)).gate < dg0 + 1); i++) {
        const s = await snap(p), fx = Math.cos(s.player.angle), fz = -Math.sin(s.player.angle), ux = s.aim.x - s.player.x, uz = s.aim.y - s.player.y, ul = Math.hypot(ux, uz) || 1;
        const cross = (fx * uz - fz * ux) / ul, dot = (fx * ux + fz * uz) / ul, steer = dot < 0 ? Math.sign(cross) : Math.max(-1, Math.min(1, cross * 3));
        // Drift into the bends (the aim off to one side), let it go on the straights.
        // (Once a drift has banked, the stick alone takes it on to the gate: the check is one drift
        // through one bend, not a drift-only lap, which a slow runner's coarse steering can stall.)
        // DRIFT goes on into a bend and stays on until the slide has scored enough to bank (10+ points,
        // on state, not on time), unless the car slows right down.
        const bend = s.cars[0].driftTotal <= dt0 && ((Math.abs(cross) > 0.25 && s.speed > 4) || (held && s.cars[0].driftPts < 15 && s.speed > 3));
        const sx = st.x + steer * st.r * 0.9, sy = st.y - st.r * 0.85;
        // CDP lifts fingers only all at once (a touchEnd), so letting go of DRIFT lifts both thumbs and
        // puts the left one straight back on the stick (a finger left out of a touchMove stays down).
        if (held && !bend) await t("touchEnd", []), await t("touchStart", [[sx, sy, 3]]);
        else await t("touchMove", bend ? [[sx, sy, 3], [dk.x, dk.y, 4]] : [[sx, sy, 3]]);
        held = bend;
        if (bend && s.cars[0].drift === 1 && s.cars[0].gas > 0.5) both = true;
      }
      const da = await snap(p);
      assert.ok(both && da.cars[0].driftTotal > dt0 && da.gate >= dg0 + 1 && !da.crashed, `${name}: stick-up gas and DRIFT held together drifted through the bends (both held: ${both}, drift ${dt0} → ${da.cars[0].driftTotal}, gates ${dg0} → ${da.gate}, crashed: ${da.crashed})`);
      await t("touchEnd", []);
      await until(p, () => { const c = game.getSnapshot().cars[0]; return c.drift === 0 && c.gas === 0; }, null, `${name}: both thumbs off: no drift, no gas`);
      // The pause card's STEERING key: STICK → ARROWS → STICK (no layout shift), remembered.
      await sh(p, () => game.pause());
      const cycle = [];
      for (let i = 0; i < 2; i++) {
        await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-padk").click());
        const k = await keysOf();
        cycle.push([k.padk, k.moves.join(" "), k.stick, k.acts.join(" / "), k.corner, k.h === stickPad.h && k.top === stickPad.top, k.clear, k.big, await p.evaluate(() => localStorage.getItem("dune-hop:steer"))]);
        if (i) break;
        // ARROWS: no gas on the arrows, so a GAS key in the corner; still drivable (GAS and ▶ held).
        await sh(p, () => game.resume());
        const ar = await p.evaluate(() => { const q = (s) => { const b = document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(s).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }; return { gas: q(".bui-pad button[aria-label^='Gas']"), right: q(".bui-pad-move button[aria-label='Right']") }; });
        const a0 = await snap(p);
        await t("touchStart", [[...ar.gas, 5], [...ar.right, 6]]);
        await until(p, (a) => { const s = game.getSnapshot(), c = s.cars[0]; return c.gas === 1 && c.steer > 0.5 && Math.hypot(s.player.x - a.x, s.player.y - a.y) > 30; }, a0.player, `${name}: ARROWS: GAS and ▶ drive and steer`);
        await t("touchEnd", []);
        await until(p, () => { const c = game.getSnapshot().cars[0]; return c.gas === 0 && c.steer === 0; }, null, `${name}: ARROWS: let go`);
        await sh(p, () => game.pause());
      }
      assert.deepEqual(cycle, [["◀ ▶ ARROWS", "Left Right", false, "Gas / Brake / Drift, the handbrake / Nitro boost", "Gas", true, true, true, "arrows"], ["STICK", "", true, "Brake / Drift, the handbrake / Nitro boost", "Drift, the handbrake", true, true, true, "stick"]], `${name}: the STEERING cycle`);
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
    await until(p, () => game.engine.paused.includes("settled"), null, `${name}: settles on the result`, 120000);
    await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-r-tracks").click());
    assert.match(await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-tracks button").textContent), /BEST \d:\d\d\.\d/, `${name}: the menu shows the best time`);
    assert.deepEqual(errs, [], `${name}: no page errors`);
    await ctx.close();
  }

  // Freestyle: the menu's FREESTYLE shows the park's four tables; START; gas straight on from the start
  // flies the out-ramp onto the next table (a transfer, points); let go and, untouched, it settles.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(server.url + "/");
    await until(p, () => window.game, null, "freestyle: mounts");
    await p.evaluate(() => document.getElementById("board").scrollIntoView({ block: "center" }));
    await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector("[data-seg=mode] [data-v=free]").click());
    const m = await sh(p, () => { const root = document.querySelector("[data-fizlet-host]").shadowRoot; return { park: root.querySelectorAll(".dh-park li").length, tracks: !!root.querySelector(".dh-tracks").offsetParent, kind: game.getSnapshot().kind }; });
    assert.deepEqual(m, { park: 4, tracks: false, kind: "free" }, "freestyle: the park in the menu and the preview");
    await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-start").click());
    const s0 = await snap(p);
    assert.deepEqual([s0.status, s0.kind, s0.table, s0.phase], ["running", "free", 0, "race"], "freestyle: no countdown, on the Salt Flats");
    await p.keyboard.down("ArrowUp");
    await until(p, () => { const s = game.getSnapshot(); return s.table === 1 && s.transfers >= 1 && s.score > 0; }, null, "freestyle: off the ramp onto THE BOWL, scored");
    await p.keyboard.up("ArrowUp");
    const head = await sh(p, () => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-lap").textContent);
    assert.match(head, /THE BOWL/, "freestyle: the HUD names the table");
    await until(p, () => game.engine.paused.includes("settled"), null, "freestyle: untouched, it settles", 120000);
    assert.ok((await snap(p)).best > 0, "freestyle: a best on this device");
    assert.deepEqual(errs, [], "freestyle: no page errors");
    await ctx.close();
  }

  // Two on one screen: 2 · SPLIT gives a view each (side by side on a wide stage); W drives only P1,
  // the arrows only P2. On a phone held upright the views stack, and each has its own touch pad.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(server.url + "/");
    await until(p, () => window.game, null, "split: mounts");
    await p.evaluate(() => document.getElementById("board").scrollIntoView({ block: "center" }));
    await sh(p, () => { const root = document.querySelector("[data-fizlet-host]").shadowRoot; root.querySelector("[data-seg=players] [data-v='2']").click(); root.querySelector(".dh-start").click(); });
    await until(p, () => game.getSnapshot().phase === "race", null, "split: GO");
    const lay = await sh(p, () => [...document.querySelector("[data-fizlet-host]").shadowRoot.querySelectorAll(".dh-view")].filter((v) => !v.hidden).map((v) => { const r = v.querySelector("canvas").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.width)]; }));
    assert.equal(lay.length, 2, "split: two views");
    assert.ok(lay[1][0] >= lay[0][1] && lay[0][2] > 300 && Math.abs(lay[0][2] - lay[1][2]) < 2, `split: side by side ${JSON.stringify(lay)}`);
    const a = (await snap(p)).cars;
    assert.equal(a.length, 2);
    await p.keyboard.down("KeyW");
    await until(p, (a) => { const c = game.getSnapshot().cars; return Math.hypot(c[0].x - a[0].x, c[0].y - a[0].y) > 40; }, a, "split: W drives P1");
    await p.keyboard.up("KeyW");
    const b = (await snap(p)).cars;
    assert.ok(Math.hypot(b[1].x - a[1].x, b[1].y - a[1].y) < 6, "split: P2 stayed put");
    await until(p, () => game.getSnapshot().cars[0].speed < 1, null, "split: P1 coasts to a stop", 20000);
    const c = (await snap(p)).cars;
    await p.keyboard.down("ArrowUp");
    await until(p, (c) => { const d = game.getSnapshot().cars; return Math.hypot(d[1].x - c[1].x, d[1].y - c[1].y) > 40; }, c, "split: ↑ drives P2");
    await p.keyboard.up("ArrowUp");
    const d = (await snap(p)).cars;
    assert.ok(Math.hypot(d[0].x - c[0].x, d[0].y - c[0].y) < 12, "split: P1 stayed (more or less) put");
    assert.deepEqual(errs, [], "split: no page errors");
    await ctx.close();
  }
  // Split on a phone is held back (2 · SPLIT hidden on touch-only devices); behind its flag
  // (?split=touch) it still works: stacked halves, each its own stick, each steering only its car.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(server.url + "/?split=touch");
    await until(p, () => window.game, null, "split phone: mounts");
    await p.evaluate(() => document.getElementById("board").scrollIntoView({ block: "center" }));
    await sh(p, () => { const root = document.querySelector("[data-fizlet-host]").shadowRoot; root.querySelector("[data-seg=players] [data-v='2']").click(); root.querySelector(".dh-start").click(); });
    await until(p, () => game.getSnapshot().phase === "race", null, "split phone: GO");
    const views = await sh(p, () => [...document.querySelector("[data-fizlet-host]").shadowRoot.querySelectorAll(".dh-view")].filter((v) => !v.hidden).map((v) => { const r = v.getBoundingClientRect(), pad = v.querySelector(".bui-pad"), q = pad.getBoundingClientRect(), g = pad.querySelector("button[aria-label^='Drift']").getBoundingClientRect(), t = pad.querySelector(".bui-stick").getBoundingClientRect(), ks = [...pad.querySelectorAll(".bui-pad-keys button")].filter((b) => b.offsetParent); return { top: r.top, bottom: r.bottom, padIn: q.top >= r.top - 1 && q.bottom <= r.bottom + 1, acts: ks.map((b) => b.title).join(" / "), corner: g.right >= Math.max(...ks.map((b) => b.getBoundingClientRect().right)) && g.bottom >= Math.max(...ks.map((b) => b.getBoundingClientRect().bottom)), st: { x: t.x + t.width / 2, y: t.y + t.height / 2, r: t.width * 0.36 }, big: g.width >= 44 && g.height >= 44 && t.height >= 44 }; }));
    assert.equal(views.length, 2, "split phone: two views");
    assert.ok(views[1].top >= views[0].bottom - 1, "split phone: stacked");
    assert.ok(views.every((v) => v.padIn && v.big && v.corner && v.acts === "Brake / Drift, the handbrake / Nitro boost"), `split phone: a stick and the same cluster in each half (no GAS, DRIFT in the corner), keys ≥ 44 px: ${views.map((v) => v.acts)}`);
    const a = (await snap(p)).cars, cdp = await ctx.newCDPSession(p), s1 = views[1].st, s0 = views[0].st;
    const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
    await touch("touchStart", [[s1.x, s1.y, 1]]);
    await touch("touchMove", [[s1.x - s1.r * 0.6, s1.y - s1.r * 0.6, 1]]);
    await until(p, () => { const c = game.getSnapshot().cars; return c[1].steer < -0.2 && c[1].gas > 0.2 && c[0].steer === 0 && c[0].gas === 0; }, null, "split phone: P2's stick steers and drives P2 only");
    await until(p, (a) => { const c = game.getSnapshot().cars; return Math.hypot(c[1].x - a[1].x, c[1].y - a[1].y) > 30; }, a, "split phone: P2 moves");
    await touch("touchEnd", [[s1.x - s1.r * 0.6, s1.y - s1.r * 0.6, 1]]);
    await until(p, () => game.getSnapshot().cars[1].steer === 0, null, "split phone: P2 lets go: 0");
    const b = (await snap(p)).cars;
    assert.ok(Math.hypot(b[0].x - a[0].x, b[0].y - a[0].y) < 6, "split phone: P1 stayed put");
    await touch("touchStart", [[s0.x, s0.y, 3]]);
    await touch("touchMove", [[s0.x + s0.r * 0.5, s0.y, 3]]);
    await until(p, () => { const c = game.getSnapshot().cars; return c[0].steer > 0.2 && c[0].steer < 0.6 && c[1].steer === 0; }, null, "split phone: P1's stick steers P1 only");
    await touch("touchEnd", [[s0.x + s0.r * 0.5, s0.y, 3]]);
    await ctx.close();
  }

  // Saved steering from 0.2.0 ("pad": "steer" or "stick"; its stick never steered) all moves to the
  // stick; a choice made in 0.2.1 ("steer": "arrows") stays.
  for (const [k, v, want] of [["pad", "steer", "stick"], ["pad", "stick", "stick"], ["steer", "arrows", "arrows"], [null, null, "stick"]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    if (k) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem("seeded")) sessionStorage.setItem("seeded", "1"), localStorage.setItem("dune-hop:" + k, v); }, [k, v]);
    const p = await ctx.newPage();
    await p.goto(server.url + "/");
    await until(p, () => window.game, null, "migration: mounts");
    const got = await sh(p, () => [!!document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".bui-stick"), document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-padk").textContent]);
    assert.deepEqual(got, [want === "stick", want === "stick" ? "STICK" : "◀ ▶ ARROWS"], `migration: saved ${k}=${v} → ${want}`);
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
  console.log("Dune Hop: menu (select, then START), countdown, keyboard, mouse, the stick alone driving through gates and the STEERING swap (stick, arrows; remembered, migrated), pause/resume, a full race to the result and a track best, Freestyle (a table-to-table jump, settles), split screen (each person's keys side by side; on a phone behind its flag, a stick each), 2 · SPLIT on desktop only, reduced motion, the attract lap and its takeover, Recall byte for byte; at 1440 and 390.");
} finally {
  await browser.close();
  await server.close();
}
