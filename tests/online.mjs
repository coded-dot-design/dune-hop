// Dune Hop online in Chromium (the built dist/dune-hop.mjs): four pages, one race, through the game's
// own menu and room card and @fzlt/core/presence's join() against a stand-in fizlet-rooms server
// (tests/room-server.mjs). Two desktops (1440) and two phones (390, touch). The host picks the track
// and one lap, presses HOST and 4; its SEND LINK (no share sheet here: the copy fallback) drops a phone
// straight into the room after the code check; a desktop types the room number and presses JOIN; the
// last phone opens the link too, and the room starts when the four are in. Everyone's name reaches
// every screen. A whole race in lockstep with all four on the autopilot (an input bit: in lockstep
// too); one phone closes mid-race: its buggy drives on (the AI) on the other three, which finish with
// no desync and agree on the places. A rematch with the three still there (the leaver's seat counts as
// ready); then two more leave, and the last screen says so, ends the match and settles. Then a room of
// three for a Freestyle jam starts early on START NOW with two in, and a leaver ends it. Every room
// card key is 44 px or more and the ticket (room, code) is big on a phone. Waits on state, never on
// time. DH_VIDEO=<dir> records each window (scripts/online-video.mjs tiles them).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { serve, launchOptions } from "./serve.mjs";
import { CODE, roomServer } from "./room-server.mjs";

const fixture = readFileSync("tests/fixtures/page.html", "utf8");
const page = (laps) => fixture.replace("</body>", `<script type="module">import { createDuneHop } from "/dist/dune-hop.mjs"; window.game = createDuneHop({ host: document.getElementById("board"), keyboard: "page", laps: ${laps} });</script></body>`);
const site = await serve(".", { "/": page(1), "/guest": page(0) }), rooms = await roomServer({ max: 4 });
const browser = await chromium.launch(launchOptions());
const errors = [], t0 = Date.now(), VIDEO = process.env.DH_VIDEO;
const until = (p, fn, arg, what, timeout = 30000) => p.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(() => assert.fail(`${what}: timed out`));
const snap = (p) => p.evaluate(() => game.getSnapshot());
const sr = "document.querySelector('[data-fizlet-host]').shadowRoot";
const click = (p, s) => p.evaluate(([sr, s]) => eval(sr).querySelector(s)?.click(), [sr, s]);
const text = (p, s) => p.evaluate(([sr, s]) => eval(sr).querySelector(s)?.textContent ?? "", [sr, s]);
const ms = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
try {
  const open = async (path, vp, touch, name, saved = "") => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, ...(VIDEO ? { recordVideo: { dir: VIDEO, size: vp.width > 500 ? { width: 720, height: 450 } : { width: 390, height: 844 } } } : {}) });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
    // A name kept on the device from an earlier visit (a link joins with it, no typing).
    if (saved) await ctx.addInitScript((n) => localStorage.setItem("dune-hop:name", n), saved);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    await p.goto(path.startsWith("http") ? path : `${site.url}${path}${path.includes("?") ? "&" : "?"}rooms=${encodeURIComponent(rooms.url)}`);
    await until(p, () => window.game, null, `${name} mounts`);
    await p.evaluate(() => document.getElementById("board").scrollIntoView({ block: "center" }));
    return p;
  };
  /** The room card's first step: ONLINE, NEXT, a name and the code. */
  const toRoom = async (p, name) => {
    await click(p, "[data-seg=players] [data-v=net]");
    await click(p, ".dh-start");
    const room = p.locator("[data-fizlet-host] .dh-roomc");
    await room.locator("input[name=who]").fill(name.toLowerCase());
    await room.locator("input[name=code]").fill(CODE.toLowerCase());
    return room;
  };
  const A = await open("/", { width: 1440, height: 900 }, false, "A");
  // A hosts: Split Canyon (its laps: one), HOST, four players.
  await A.evaluate((sr) => eval(sr).querySelectorAll(".dh-tracks button")[2].click(), sr);
  const ra = await toRoom(A, "Ana");
  await ra.locator(".dh-host").click();
  await until(A, (sr) => !eval(sr).querySelector(".dh-roomc [data-for=host]").hidden, sr, "A picks the size");
  await ra.locator("[data-size='4']").click();
  await until(A, (sr) => /Waiting for 3 more/.test(eval(sr).querySelector(".dh-wait-say").textContent), sr, "A waits in its room");
  const room = Number(await text(A, ".dh-t-room"));
  assert.equal(await text(A, ".dh-t-code"), CODE, "the ticket shows the code");
  assert.equal(await A.evaluate((sr) => eval(sr).querySelectorAll(".dh-seats li").length, sr), 4, "four seats in the lobby");
  // SEND LINK: no share sheet in this browser, so the link is copied.
  await click(A, ".dh-share");
  await until(A, (sr) => eval(sr).querySelector(".dh-share").textContent === "LINK COPIED", sr, "the link is copied");
  const link = await A.evaluate(() => navigator.clipboard.readText());
  assert.match(link, new RegExp(`[?&]room=${room}(&|$)`), `the link has the room: ${link}`);
  assert.match(link, /[?&]code=DUNE-TEST-CODE/, "and the code");
  console.log(`✓ A hosts room ${room} (four seats), the ticket shows the room and code, SEND LINK copies ${link.replace(/^https?:\/\/[^/]+/, "")} (${ms()})`);

  // B (a phone) opens the link: straight into the room after the code check, no taps.
  const B = await open(link.replace(/^https?:\/\/[^/]+\//, `${site.url}/`), { width: 390, height: 844 }, true, "B", "Bo");
  await until(A, (sr) => /Waiting for 2 more/.test(eval(sr).querySelector(".dh-wait-say").textContent), sr, "B is in (by the link)");
  const phone = await B.evaluate((sr) => {
    const r = eval(sr), t = r.querySelector(".dh-t-room").getBoundingClientRect(), keys = [...r.querySelectorAll(".dh-roomc button")].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect());
    return { room: parseFloat(getComputedStyle(r.querySelector(".dh-t-room")).fontSize), code: parseFloat(getComputedStyle(r.querySelector(".dh-t-code")).fontSize), fits: t.right <= innerWidth, keys: keys.length > 1 && keys.every((k) => Math.min(k.width, k.height) >= 44), say: r.querySelector(".dh-wait-say").textContent };
  }, sr);
  assert.ok(phone.room >= 32 && phone.code >= 18 && phone.fits && phone.keys, `the ticket reads at 390 and every key is ≥ 44 px: ${JSON.stringify(phone)}`);
  console.log(`✓ B (390) followed the link straight in: "${phone.say}" (room ${phone.room} px, code ${phone.code} px) (${ms()})`);

  // C (a desktop) joins by hand: JOIN, the room number with + and −, JOIN ROOM.
  const C = await open("/guest", { width: 1440, height: 900 }, false, "C");
  const rc = await toRoom(C, "Cy");
  await rc.locator(".dh-joink").click();
  await until(C, (sr) => !eval(sr).querySelector(".dh-roomc [data-for=join]").hidden, sr, "C picks the room");
  const at = Number(await text(C, "output[name=roomShow]"));
  for (let i = 0; i < (room - at + 16) % 16; i++) await rc.locator("[data-room='1']").click();
  assert.equal(Number(await text(C, "output[name=roomShow]")), room);
  await rc.locator(".dh-join").click();
  await until(A, (sr) => /Waiting for 1 more/.test(eval(sr).querySelector(".dh-wait-say").textContent), sr, "C is in");
  // D (a phone) opens the link with a name already on the device; the room is full: it starts.
  const D = await open(link.replace(/^https?:\/\/[^/]+\//, `${site.url}/`), { width: 390, height: 844 }, true, "D");
  const all = [A, B, C, D];
  for (const p of all) await until(p, () => game.getSnapshot().online && game.getSnapshot().phase === "count", null, "all four in the match");
  const s0 = await Promise.all(all.map(snap));
  assert.deepEqual(s0.map((s) => s.seat), [0, 1, 2, 3], "seats in arrival order: A hosts");
  assert.deepEqual(s0.map((s) => [s.track, s.laps, s.players]), Array(4).fill(["split-canyon", 1, 4]), "the host's track and laps, four people, on every screen");
  await Promise.all(all.map((p) => until(p, () => game.getSnapshot().net.names[2] === "CY", null, "the names arrive")));
  const names = await Promise.all(all.map(async (p) => (await snap(p)).net.names));
  for (const n of names) assert.deepEqual(n, names[0], "every screen has the same names");
  assert.deepEqual(names[0], ["ANA", "BO", "CY", ""], `typed (A, C), kept on the device (B), none (D: P4): ${names[0]}`);
  assert.equal(await text(C, ".dh-who"), "CY", "each screen's chip says whose buggy it is");
  console.log(`✓ room ${room} full: four in the match on the host's pick, names ${names[0].map((n, i) => n || "P" + (i + 1)).join(" / ")} on every screen (${ms()})`);

  // All four on the autopilot; D closes its tab once the race is on.
  for (const p of all) await p.evaluate(() => (game.auto = true));
  await until(A, () => game.getSnapshot().phase === "race" && game.getSnapshot().elapsed > 6, null, "the race is on", 60000);
  const leftAt = (await snap(A)).net.frame;
  await D.context().close();
  const stay = [A, B, C];
  await Promise.all(stay.map((p) => until(p, () => game.getSnapshot().net?.left === 8, null, "D's seat left: the AI drives it")));
  await until(A, (sr) => /P4 · AI/.test(eval(sr).querySelector(".dh-board").textContent), sr, "the board says the leaver's buggy is the AI's");
  console.log(`✓ D left mid-race (frame ~${leftAt}): the AI drives its buggy on the other three (${ms()})`);
  await Promise.all(stay.map((p) => until(p, () => ["won", "gameover"].includes(game.getSnapshot().status), null, "the result card", 180000)));
  const s1 = await Promise.all(stay.map(snap));
  for (const s of s1) assert.deepEqual(s.cars.map((c) => c.place), s1[0].cars.map((c) => c.place), "every screen agrees on the places");
  assert.deepEqual(s1.map((s) => s.net.desync), [-1, -1, -1], "no desync");
  assert.ok(s1.every((s) => s.net.frame > 600), `lockstep frames: ${s1.map((s) => s.net.frame)}`);
  const heads = await Promise.all(stay.map((p) => text(p, ".dh-r-head")));
  const winners = heads.map((h, i) => (h.startsWith("YOU WIN") ? names[0][i] || "P" + (i + 1) : h.replace(/ WINS.*$/, "")));
  assert.ok(winners.every((w) => w === winners[0]), `one winner on every screen: ${heads.join(" / ")}`);
  console.log(`✓ the race finished in lockstep: ${heads.join(" / ")}; places ${s1[0].cars.map((c) => c.place).join(",")} agree; no desync (${s1[0].net.frame} frames, ${ms()})`);

  // Rematch: the three ask (the leaver's seat counts as ready); a new race starts on all three.
  for (const p of stay) await click(p, ".dh-r-again");
  await Promise.all(stay.map((p) => until(p, () => game.getSnapshot().status === "running" && game.getSnapshot().phase !== "done" && game.getSnapshot().elapsed < 5, null, "the rematch starts")));
  const s2 = await Promise.all(stay.map(snap));
  assert.ok(s2.every((s) => s.net.left === 8 && s.players === 4), "the rematch keeps D's buggy, on the AI");
  console.log(`✓ rematch: the three asked, a new race on all three (${ms()})`);

  // B and C leave: A is alone, says so, the match ends and the page settles.
  await B.context().close();
  await until(A, () => game.getSnapshot().net?.left === 10, null, "A hears B left");
  assert.equal((await snap(A)).online, true, "with C still there the match goes on");
  await C.context().close();
  await until(A, (sr) => /Everyone else left/.test(eval(sr).querySelector(".dh-gone-say").textContent), sr, "A hears everyone left", 20000);
  assert.equal((await snap(A)).online, false, "the match is over");
  await until(A, () => game.engine.paused.includes("settled"), null, "and A settles");
  console.log("✓ the others leave one by one: the match goes on until A is alone, then ends; the page settles");

  // A room of three that starts early: E hosts a Freestyle jam for three, F (a phone) follows the
  // link, E presses START NOW: a jam for two. F leaves: E is alone, the match ends.
  await A.context().close();
  const E = await open("/", { width: 1440, height: 900 }, false, "E");
  await click(E, "[data-seg=mode] [data-v=free]");
  const re = await toRoom(E, "Eve");
  await re.locator(".dh-host").click();
  await re.locator("[data-size='3']").click();
  await until(E, (sr) => /Waiting for 2 more/.test(eval(sr).querySelector(".dh-wait-say").textContent), sr, "E waits for two");
  assert.equal(await E.evaluate((sr) => eval(sr).querySelectorAll(".dh-seats li").length, sr), 3, "three seats");
  await click(E, ".dh-share");
  await until(E, (sr) => eval(sr).querySelector(".dh-share").textContent === "LINK COPIED", sr, "the link is copied");
  const link2 = await E.evaluate(() => navigator.clipboard.readText());
  const F = await open(link2.replace(/^https?:\/\/[^/]+\//, `${site.url}/`), { width: 390, height: 844 }, true, "F");
  await until(E, (sr) => !eval(sr).querySelector(".dh-go").hidden, sr, "START NOW shows with two in");
  await click(E, ".dh-go");
  for (const p of [E, F]) await until(p, () => game.getSnapshot().online && game.getSnapshot().kind === "free", null, "a Freestyle jam for two");
  assert.deepEqual((await Promise.all([E, F].map(snap))).map((s) => [s.seat, s.players]), [[0, 2], [1, 2]], "START NOW: the two seats taken");
  await F.context().close();
  await until(E, (sr) => /left the match/.test(eval(sr).querySelector(".dh-gone-say").textContent), sr, "E hears F left", 20000);
  console.log("✓ a room of three started early (START NOW): a Freestyle jam for two; one leaves, the other is told");
  assert.deepEqual(errors, [], "no page errors");
  console.log(`Dune Hop online (four players): green in ${ms()}`);
} finally {
  await browser.close();
  rooms.close();
  await site.close();
}
