// Dune Hop's settle guard (Chromium, dist/dune-hop.mjs): on the track menu the engine sleeps (no
// frames, no audio before a gesture); mid-race, with nobody touching anything, it never sleeps (the
// rivals race and the clock keeps pace with the wall clock); scrolled off screen it pauses; the
// attract lap ends after one lap and the hero sleeps; after Recall no frame runs. Waits on state.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { serve, launchOptions } from "./serve.mjs";

const fixture = readFileSync("tests/fixtures/page.html", "utf8").replace("<p>After it.</p>", '<p>After it.</p><div style="height:3000px"></div>');
const withGame = (o) => fixture.replace("</body>", `<script>const A = window.AudioContext; window.AudioContext = class extends A { constructor(...a) { super(...a); window.audio = (window.audio || 0) + 1; } };</script><script type="module">import { createDuneHop } from "/dist/dune-hop.mjs"; window.game = createDuneHop({ host: document.getElementById("board"), seed: 4, ...${JSON.stringify(o)} });</script></body>`);
const server = await serve(".", { "/": withGame({}), "/attract": withGame({ attract: true, track: "sunset-loop" }) });
const browser = await chromium.launch(launchOptions());
const until = (p, fn, arg, what, timeout = 30000) => p.waitForFunction(fn, arg, { timeout, polling: 50 }).catch(() => assert.fail(`${what}: timed out`));
const frames = (p, n = 12) => p.evaluate(async (n) => { const a = game.engine.stats().frames; for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); return game.engine.stats().frames - a; }, n);

try {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(server.url + "/");
  await until(p, () => window.game, null, "mounts");
  await until(p, () => game.engine.paused.includes("settled"), null, "the menu settles");
  assert.equal(await frames(p), 0, "menu: no frames");
  assert.equal(await p.evaluate(() => window.audio || 0), 0, "no audio before a gesture");
  await p.evaluate(() => game.start("ridge-run"));
  await until(p, () => game.getSnapshot().phase === "race", null, "the race starts");
  const a = await p.evaluate(() => ({ t: game.getSnapshot().elapsed, w: performance.now() }));
  await until(p, (a) => performance.now() - a.w > 2000, a, "two seconds pass");
  const b = await p.evaluate(() => ({ t: game.getSnapshot().elapsed, w: performance.now(), paused: game.engine.paused.slice() }));
  const rate = (b.t - a.t) / ((b.w - a.w) / 1000);
  assert.ok(rate > 0.3, `mid-race the clock keeps pace with nobody touching anything: ${rate.toFixed(2)}×`);
  assert.deepEqual(b.paused, [], "never asleep mid-race");
  await p.evaluate(() => scrollTo(0, 3000));
  await until(p, () => game.engine.paused.includes("offscreen"), null, "off screen it pauses");
  assert.equal(await frames(p), 0, "off screen: no frames");
  await p.evaluate(() => (scrollTo(0, 0), game.destroy()));
  assert.equal(await frames(p), 0, "after Recall: no frames");
  await p.close();

  const q = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await q.goto(server.url + "/attract");
  await until(q, () => window.game && game.getSnapshot().mode === "demo" && game.getSnapshot().speed > 3, null, "the attract lap drives");
  await until(q, () => game.engine.paused.includes("settled"), null, "after its lap the hero settles", 90000);
  assert.equal(await frames(q), 0, "the hero sleeps");
  await q.close();
  console.log("Dune Hop: settle guard green (the menu and the hero sleep, the race never does, off screen pauses, quiet after Recall).");
} finally {
  await browser.close();
  await server.close();
}
