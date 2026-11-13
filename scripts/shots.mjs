// The site's stills, from the game itself (dist/dune-hop.mjs) in Chromium: the hero's reduced-motion
// poster (shots/hero.jpg, 1600×900) and the share image (shots/og.jpg, 1200×630), both a moment of the
// attract lap on Neon Edge. Run after `npm run build`: node scripts/shots.mjs (CHROMIUM_PATH optional).
import { chromium } from "playwright";
import { serve, launchOptions } from "../tests/serve.mjs";
const page = `<!doctype html><html data-theme="dark"><body style="margin:0;background:#0d0b1c"><div id=h style="position:fixed;inset:0"></div><script type=module>import { createDuneHop } from "/dist/dune-hop.mjs"; window.g = createDuneHop({ host: document.getElementById("h"), attract: true, track: "neon-edge", seed: 1 });</script>`;
const s = await serve(".", { "/": page });
const b = await chromium.launch(launchOptions());
try {
  for (const [file, width, height, at] of [["hero.jpg", 1600, 900, 7.2], ["og.jpg", 1200, 630, 7.2]]) {
    const p = await b.newPage({ viewport: { width, height } });
    await p.goto(s.url + "/");
    await p.waitForFunction((at) => window.g && g.getSnapshot().elapsed >= at, at, { timeout: 60000, polling: 16 });
    // The still has no sticker on it (the page's copy says what to do).
    await p.evaluate(() => (g.engine.stop(), (document.querySelector("[data-fizlet-host]").shadowRoot.querySelector(".dh-demo").hidden = true)));
    await p.screenshot({ path: `site/public/shots/${file}`, type: "jpeg", quality: 84 });
    await p.close();
    console.log(`site/public/shots/${file}`);
  }
} finally {
  await b.close();
  await s.close();
}
