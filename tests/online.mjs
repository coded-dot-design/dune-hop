// Dune Hop online in Chromium (the built dist/dune-hop.mjs): two pages, one race, through the game's
// own menu and room card and @fzlt/core/presence's join() against a stand-in fizlet-rooms server
// (tests/room-server.mjs): the invite check, the lobby, the host's pick (track, one lap) reaching the
// guest, a whole race in lockstep with both on the autopilot (the autopilot is an input bit, so it is
// in lockstep too), both screens agreeing on the result with no desync, a rematch (both ask, both
// start on the same frame), and a player leaving: the other screen says so and the match ends.
// One screen is a desktop, the other a phone. Waits on state, never on time.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { serve, launchOptions } from "./serve.mjs";
import { CODE, roomServer } from "./room-server.mjs";

const fixture = readFileSync("tests/fixtures/page.html", "utf8");
const page = (laps) => fixture.replace("</body>", `<script type="module">import { createDuneHop } from "/dist/dune-hop.mjs"; window.game = createDuneHop({ host: document.getElementById("board"), keyboard: "page", laps: ${laps} });</script></body>`);
const site = await serve(".", { "/": page(1), "/guest": page(0) }), rooms = await roomServer();
const browser = await chromium.launch(launchOptions());
const errors = [], t0 = Date.now();
const until = (p, fn, arg, what, timeout = 30000) => p.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(() => assert.fail(`${what}: timed out`));
const snap = (p) => p.evaluate(() => game.getSnapshot());
const host = (p, s) => p.evaluate((s) => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(s)?.click(), s);
try {
  const open = async (path, vp, touch) => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${site.url}${path}?rooms=${encodeURIComponent(rooms.url)}`);
    await until(p, () => window.game, null, "mounts");
    await p.evaluate(() => document.getElementById("board").scrollIntoView({ block: "center" }));
    return p;
  };
  const A = await open("/", { width: 1280, height: 800 }, false), B = await open("/guest", { width: 390, height: 844 }, true);
  const join = async (p) => {
    await host(p, "[data-seg=players] [data-v=net]");
    await host(p, ".dh-start");
    const room = p.locator("[data-fizlet-host] .dh-roomc");
    await room.locator("input[name=code]").fill(CODE.toLowerCase());
    for (let i = 0; i < 2; i++) await room.locator("[data-room='1']").click();
    await room.locator(".dh-join").click();
  };
  // A joins first: the host. It picked Split Canyon (its laps: one); B's own pick is ignored.
  await A.evaluate(() => document.querySelector("[data-fizlet-host]").shadowRoot.querySelectorAll(".dh-tracks button")[2].click());
  await join(A);
  await until(A, () => !document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-roomc [data-for=wait]").hidden, null, "A waits in the lobby");
  await join(B);
  for (const p of [A, B]) await until(p, () => game.getSnapshot().online && game.getSnapshot().phase === "count", null, "both in the match");
  const [a0, b0] = [await snap(A), await snap(B)];
  assert.deepEqual([a0.seat, b0.seat], [0, 1], "seats: A hosts");
  assert.deepEqual([a0.track, b0.track, a0.laps, b0.laps], ["split-canyon", "split-canyon", 1, 1], "the host's track and laps on both screens");
  console.log(`✓ invite, lobby, room 2: both in the match on the host's pick (${Date.now() - t0} ms)`);

  // Both on the autopilot (an input bit: in lockstep), to the flag.
  for (const p of [A, B]) await p.evaluate(() => (game.auto = true));
  for (const p of [A, B]) await until(p, () => ["won", "gameover"].includes(game.getSnapshot().status), null, "the result card", 180000);
  const [a1, b1] = [await snap(A), await snap(B)];
  assert.deepEqual(a1.cars.map((c) => c.place), b1.cars.map((c) => c.place), "both screens agree on the places");
  assert.equal(a1.net.desync, -1, "no desync on A");
  assert.equal(b1.net.desync, -1, "no desync on B");
  assert.ok(a1.net.frame > 600 && b1.net.frame > 600, `lockstep frames: ${a1.net.frame}, ${b1.net.frame}`);
  const heads = await Promise.all([A, B].map((p) => p.evaluate(() => document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-r-head").textContent)));
  assert.equal(heads.filter((h) => h.startsWith("YOU WIN")).length, 1, `one screen says YOU WIN: ${heads.join(" / ")}`);
  console.log(`✓ a whole race in lockstep: ${heads.join(" / ")}; places agree; no desync (${a1.net.frame} frames, ${Date.now() - t0} ms)`);

  // Rematch: both ask; a new race starts on both screens.
  await host(A, ".dh-r-again");
  await until(A, () => /WAITING/.test(document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-r-again").textContent), null, "A waits for B");
  await host(B, ".dh-r-again");
  for (const p of [A, B]) await until(p, () => game.getSnapshot().status === "running" && game.getSnapshot().phase !== "done" && game.getSnapshot().elapsed < 5, null, "the rematch starts");
  console.log("✓ rematch: both asked, a new race on both screens");

  // B leaves: A hears it, and the match ends cleanly.
  await B.close();
  await until(A, () => /left the match/.test(document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-gone-say").textContent), null, "A hears that B left", 20000);
  const s = await snap(A);
  assert.equal(s.online, false, "the match is over");
  await until(A, () => game.engine.paused.includes("settled"), null, "and A settles");
  console.log("✓ a player leaves: the other screen says so, the match ends, the page settles");
  assert.deepEqual(errors, [], "no page errors");
  console.log(`Dune Hop online: green in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
  await browser.close();
  rooms.close();
  await site.close();
}
