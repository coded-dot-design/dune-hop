// The built site (artifacts/pages, `npm run site:build` first) in Chromium, at 1440 and 390, dark and
// light: the landing page's hero is the game's attract lap (drawn, driving, the HUD hidden), with the
// title, the hook and a PLAY link to /play/; the four sections (how to play, the tracks, features,
// built on Fizlet with the measured size, by Chris Cooley); no sideways scroll. Reduced motion: the
// still poster, no game. /play/ mounts the game with the track menu; /play/?track=neon-edge races it.
// SHOTS=<dir> saves a screenshot of each.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { serve, launchOptions } from "./serve.mjs";

const BASE = (process.env.SITE_BASE || "/").replace(/\/$/, "");
// The not-found page (site/src/pages/404.astro): 404.html at the root, noindex, a key home.
{ const nf = readFileSync("artifacts/pages/404.html", "utf8"); assert.ok(/<meta name="robots" content="noindex/.test(nf) && nf.includes(`href="${BASE}/"`), "404.html is noindex and links home"); }
const server = await serve("artifacts/pages", {}, BASE);
const browser = await chromium.launch(launchOptions());
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const until = (p, fn, arg, what, timeout = 20000) => p.waitForFunction(fn, arg, { timeout, polling: 50 }).catch(() => assert.fail(`${what}: timed out`));
const gz = JSON.parse(readFileSync("dist/build.json", "utf8")).gzip["dune-hop.mjs"];

try {
  for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]])
    for (const theme of ["dark", "light"]) {
      const at = `${w} ${theme}`;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
      await ctx.addInitScript((t) => localStorage.setItem("dom-virus:theme", t), theme);
      const p = await ctx.newPage(), errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(`${server.url}${BASE}/`);
      await until(p, () => window.hero && hero.getSnapshot().mode === "demo" && hero.getSnapshot().speed > 3, null, `${at}: the hero's demo lap drives`);
      const m = await p.evaluate(() => {
        const host = document.querySelector("#dh-hero [data-fizlet-host]"), root = host.shadowRoot, cv = root.querySelector("canvas"), px = cv.getContext("2d").getImageData(cv.width >> 1, cv.height >> 1, 1, 1).data;
        const play = document.querySelector(".start-key");
        return {
          theme: document.documentElement.dataset.theme,
          drawn: px[3] === 255,
          hud: root.querySelector(".dh-head").hidden && root.querySelector(".dh-keys").hidden,
          h1: document.querySelector("h1").textContent.trim(),
          play: play.getAttribute("href"),
          playSize: Math.min(play.getBoundingClientRect().width, play.getBoundingClientRect().height) >= 44,
          sections: ["how", "tracks", "features", "fizlet"].every((id) => document.getElementById(id)),
          tracks: document.querySelectorAll("#tracks li").length,
          size: document.getElementById("fizlet").textContent.replace(/\s+/g, " "),
          by: /by Chris Cooley/i.test(document.body.textContent),
          sideways: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.equal(m.theme, theme, `${at}: the theme`);
      assert.ok(m.drawn && m.hud, `${at}: the hero draws the race, no HUD over the copy`);
      assert.equal(m.h1, "Dune Rally.Fly the dunes.", `${at}: the title and hook`);
      assert.match(m.play, /\/play\/$/, `${at}: PLAY links to /play/`);
      assert.ok(m.playSize && m.sections && m.tracks === 4 && m.by, `${at}: PLAY ≥ 44 px, four sections, four tracks, by Chris Cooley`);
      assert.ok(m.size.includes(`${gz.toLocaleString("en-US")} bytes gzip`), `${at}: the measured size (${gz} B)`);
      assert.equal(m.sideways, false, `${at}: no sideways scroll`);
      if (SHOTS) {
        await p.screenshot({ path: `${SHOTS}/landing-${w}-${theme}.png` });
        // (A full-page shot under phone emulation drops the touch media queries for the rest of the context.)
        if (!touch) await p.screenshot({ path: `${SHOTS}/landing-${w}-${theme}-full.png`, fullPage: true });
        else for (const id of ["how", "tracks", "fizlet"]) await p.evaluate((id) => document.getElementById(id).scrollIntoView(), id), await p.screenshot({ path: `${SHOTS}/landing-${w}-${theme}-${id}.png` });
      }
      // /play/: the game with its track menu.
      await p.goto(`${server.url}${BASE}/play/`);
      await until(p, () => window.game && game.getSnapshot().status === "idle", null, `${at}: /play/ mounts with the menu`);
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/play-menu-${w}-${theme}.png` });
      await p.goto(`${server.url}${BASE}/play/?track=neon-edge`);
      await until(p, () => window.game && game.getSnapshot().track === "neon-edge" && game.getSnapshot().phase === "race", null, `${at}: ?track= races that track`);
      const pad = await p.evaluate(() => ({ coarse: matchMedia("(pointer: coarse)").matches, pad: !!document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-pad").offsetParent }));
      assert.equal(pad.pad, touch, `${at}: the pad on touch only (${JSON.stringify(pad)})`);
      if (SHOTS) {
        await p.evaluate(() => (game.auto = true));
        await until(p, () => game.getSnapshot().elapsed > 6, null, `${at}: racing`);
        await p.screenshot({ path: `${SHOTS}/play-race-${w}-${theme}.png` });
      }
      assert.deepEqual(errs, [], `${at}: no page errors`);
      await ctx.close();
    }
  // Reduced motion: the still poster; no game loads.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(`${server.url}${BASE}/`);
  await until(p, () => document.querySelector(".dh-poster img")?.complete, null, "reduced motion: the poster");
  assert.deepEqual(await p.evaluate(() => ({ poster: !document.querySelector(".dh-poster").hidden, game: !!document.querySelector("[data-fizlet-host]") })), { poster: true, game: false }, "reduced motion: a still poster, no game");
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/landing-reduced-motion.png` });
  await ctx.close();
  console.log("Dune Rally site: the hero races (attract lap), the title, PLAY to /play/, four sections, the measured size, no sideways scroll, /play/ and ?track=, the reduced-motion poster; 1440 and 390, dark and light.");
} finally {
  await browser.close();
  await server.close();
}
