// Dune Hop BATTLE and King of the Table in Chromium (the built dist/dune-hop.mjs), at 1440 (keyboard)
// and 390 (touch): the menu's CLEAN / BATTLE (remembered across a reload); boxes on the track; driving
// through one gives an item (the HUD chip names it); F (or the pad's ★ key) fires it: a blaster's bolt
// stalls the rival in front, oil dropped behind spins out the rival that runs over it, a shield blocks
// the rival's bolt; the hits go off in fx blasts; a tumble rights itself. King of the Table (two on one
// screen): a landing on the other player's home pad steals a fifth of their bank. Waits on state.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { serve, launchOptions } from "./serve.mjs";

const fixture = readFileSync("tests/fixtures/page.html", "utf8");
const withGame = (opts) => fixture.replace("</body>", `<script type="module">import { createDuneHop } from "/dist/dune-hop.mjs"; window.game = createDuneHop({ host: document.getElementById("board"), keyboard: "page", seed: 7, ...${JSON.stringify(opts)} });</script></body>`);
const server = await serve(".", { "/": withGame({}) });
const browser = await chromium.launch(launchOptions());
const snap = (p) => p.evaluate(() => game.getSnapshot());
const until = (p, fn, arg, what, timeout = 20000) => p.waitForFunction(fn, arg, { timeout, polling: 50 }).catch(() => assert.fail(`${what}: timed out`));
const sh = (p, fn, a) => p.evaluate(fn, a);
/** In the page: the game's shadow root. */
const ROOT = () => (window.root = () => document.querySelector("[data-fizlet-host]").shadowRoot);
const VIEWS = [["desktop", { width: 1440, height: 900 }, false], ["phone", { width: 390, height: 844 }, true]];
/** Put car c `ahead` units in front of car 0 (negative: behind), facing the same way, parked. */
const park = (p, c, ahead) => sh(p, ([c, ahead]) => {
  const r = game.race, y = r.cars[0].yaw, tx = Math.cos(y), tz = -Math.sin(y), v = r.cars[c];
  v.reset(r.pos[0] + tx * ahead, r.pos[2] + tz * ahead, y);
}, [c, ahead]);

try {
  for (const [name, viewport, touch] of VIEWS) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(ROOT);
    const p = await ctx.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(server.url + "/");
    await until(p, () => window.game, null, `${name}: mounts`);
    await p.evaluate(() => document.getElementById("board").scrollIntoView({ block: "center" }));
    // The menu: CLEAN / BATTLE, remembered.
    await sh(p, () => root().querySelector("[data-seg=set] [data-v=battle]").click(), null);
    await p.reload();
    await until(p, () => window.game, null, `${name}: mounts again`);
    await p.evaluate(() => document.getElementById("board").scrollIntoView({ block: "center" }));
    const set = await sh(p, () => [root().querySelector("[data-seg=set] [data-v=battle]").getAttribute("aria-pressed"), game.race.battle, game.race.items.NB]);
    assert.deepEqual(set, ["true", true, 12], `${name}: BATTLE is remembered, twelve boxes on the preview`);
    await sh(p, () => root().querySelector(".dh-start").click());
    await until(p, () => game.getSnapshot().phase === "race", null, `${name}: GO`);
    // Cars 2 and 3 sit this one out (marked finished: no items, no hits), car 1 is the target.
    await sh(p, () => { for (let c = 2; c < game.race.count; c++) game.race.C[c * 40] = 2; });
    // A box: drive through one (moved under the car), the chip names the item.
    await sh(p, () => { const B = game.race.items.B; game.race.cars[0].reset(B[0], B[2], game.race.rot[1]); });
    await until(p, () => game.getSnapshot().battle.held[0] > 0, null, `${name}: a box gives an item`);
    const chip = await sh(p, () => { const c = root().querySelector(".dh-item"); return [!c.hidden, c.classList.contains("dh-has"), c.textContent]; });
    assert.ok(chip[0] && chip[1] && /BLASTER|OIL SLICK|ZAP MINE|SHIELD/.test(chip[2]), `${name}: the item chip: ${chip[2]}`);
    const box0 = await sh(p, () => game.race.items.B[3]);
    assert.ok(box0 > 0, `${name}: the box is gone for now`);
    // Fire: F on a keyboard, the pad's ★ key on a phone.
    let cdp = null;
    const star = touch ? await sh(p, () => { const b = root().querySelector(".bui-pad button[aria-label^='Use item']"), r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, vis: !!b.offsetParent }; }) : null;
    if (touch) {
      assert.ok(star.vis && star.w >= 44 && star.h >= 44, `${name}: the ★ item key on the pad, 44 px or more`);
      cdp = await ctx.newCDPSession(p);
    }
    /** Hold the item key (F, or a finger on ★) until the game says it fired, then let go. */
    const fire = async () => {
      const n = (await snap(p)).battle.seen.fire;
      if (!touch) await p.keyboard.down("KeyF");
      else await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: star.x, y: star.y, id: 7 }] });
      await until(p, (n) => game.getSnapshot().battle.seen.fire > n, n, `${name}: the item key fires`);
      if (!touch) await p.keyboard.up("KeyF");
      else await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    const f0 = (await snap(p)).battle.seen.fire;
    await fire();
    await until(p, (f0) => game.getSnapshot().battle.seen.fire > f0, f0, `${name}: fired what it held`);
    // A blaster: car 1 parked in front is stalled by a bolt (a blast goes off).
    await park(p, 1, 9);
    await sh(p, () => (game.race.items.H[0] = 1));
    const h0 = (await snap(p)).battle.seen.hit;
    await fire();
    await until(p, (h0) => { const b = game.getSnapshot().battle; return b.seen.hit > h0 && b.stall[1]; }, h0, `${name}: the bolt stalls the rival in front`);
    if (!(await p.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))) assert.ok((await snap(p)).battle.fx[0] > 0, `${name}: the hit blows up (fx)`);
    // Oil: dropped behind, the rival that runs over it spins out.
    await sh(p, () => (game.race.items.H[0] = 2));
    await fire();
    await until(p, () => game.race.items.Z.some((x, i) => i % 8 === 0 && x === 2), null, `${name}: a slick on the track`);
    await sh(p, () => { const Z = game.race.items.Z; for (let k = 0; k < 16; k++) if (Z[k * 8] === 2) game.race.cars[1].reset(Z[k * 8 + 1], Z[k * 8 + 3], game.race.rot[4]); });
    await until(p, () => game.getSnapshot().battle.spin[1], null, `${name}: the rival over the oil spins out`);
    // A shield: on, it blocks the rival's bolt from behind; then it's gone.
    await sh(p, () => (game.race.items.H[0] = 4));
    await fire();
    await until(p, () => game.getSnapshot().battle.shield[0], null, `${name}: SHIELD ON`);
    const b0 = (await snap(p)).battle.seen.block;
    // Car 1 right behind, holding a blaster it has had for a while: the AI fires at once.
    await sh(p, () => {
      const r = game.race, y = r.cars[0].yaw;
      r.cars[1].reset(r.pos[0] - Math.cos(y) * 7, r.pos[2] + Math.sin(y) * 7, y);
      r.pos[3] = r.cars[1].pos[0]; r.pos[5] = r.cars[1].pos[2];
      r.items.H[6] = 1; r.items.H[11] = 3;
    });
    await until(p, (b0) => { const b = game.getSnapshot().battle; return b.seen.block > b0 && !b.shield[0]; }, b0, `${name}: the shield blocks the rival's bolt, then it's gone`);
    // A zap mine under you: a big tumble that rights itself, never back at a gate.
    await sh(p, () => { const Z = game.race.items.Z; Z[0] = 3; Z[1] = game.race.pos[0]; Z[2] = game.race.pos[1] - 0.4; Z[3] = game.race.pos[2]; Z[4] = 0; Z[5] = 9; Z[6] = 1; Z[7] = 0; });
    await until(p, () => game.getSnapshot().crashed, null, `${name}: the mine throws you`);
    await until(p, () => !game.getSnapshot().crashed, null, `${name}: back on your wheels`, 8000);
    const toast = await sh(p, () => root().querySelector(".dh-toast").textContent);
    assert.match(toast, /BACK ON YOUR WHEELS|ZAPPED/, `${name}: said so: ${toast}`);
    assert.deepEqual(errs, [], `${name}: no page errors`);
    await ctx.close();
  }

  // King of the Table, two on one screen (the phone behind ?split=touch): each starts on their own pad;
  // P1 drops onto P2's pad and steals a fifth of P2's bank; P1 carries it (the CARRY chip).
  for (const [name, viewport, touch] of VIEWS) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(ROOT);
    const p = await ctx.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(server.url + (touch ? "/?split=touch" : "/"));
    await until(p, () => window.game, null, `king ${name}: mounts`);
    await p.evaluate(() => document.getElementById("board").scrollIntoView({ block: "center" }));
    await sh(p, () => { const r = root(); r.querySelector("[data-seg=mode] [data-v=free]").click(); r.querySelector("[data-seg=players] [data-v='2']").click(); r.querySelector(".dh-start").click(); });
    await until(p, () => game.getSnapshot().phase === "race" && game.getSnapshot().king, null, `king ${name}: the jam is on`);
    const s0 = await snap(p);
    assert.deepEqual([s0.cars[0].table, s0.cars[1].table], [0, 1], `king ${name}: each on their own table`);
    await sh(p, () => { const f = game.race; f.scs[1].S[0] = 1000; f.cars[0].reset(f.HOME[2] + 0.8, f.HOME[3], 0); f.cars[0].pos[1] += 3.5; });
    await until(p, () => game.getSnapshot().king.seen.steal > 0, null, `king ${name}: a landing on P2's pad steals`);
    const k = (await snap(p)).king;
    assert.equal(k.banked[1], 800, `king ${name}: a fifth of P2's bank`);
    assert.ok(k.carry[0] >= 200, `king ${name}: P1 carries it home`);
    const carry = await sh(p, () => { const c = root().querySelector(".dh-view .dh-carry"); return [!c.hidden, c.textContent]; });
    assert.ok(carry[0] && /CARRY/.test(carry[1]), `king ${name}: the CARRY chip: ${carry[1]}`);
    // Back on its own pad, it banks.
    await sh(p, () => { const f = game.race; f.cars[0].reset(f.HOME[0], f.HOME[1], 0); });
    await until(p, () => game.getSnapshot().king.seen.bank > 0 && game.getSnapshot().king.carry[0] === 0, null, `king ${name}: home, banked`);
    assert.deepEqual(errs, [], `king ${name}: no page errors`);
    await ctx.close();
  }
  console.log("Dune Hop BATTLE: CLEAN / BATTLE remembered, a box gives an item, F and the pad's ★ fire it, a bolt stalls and oil spins a rival, a shield blocks one, a mine's tumble rights itself; King of the Table steals and banks; at 1440 and 390.");
} finally {
  await browser.close();
  await server.close();
}
