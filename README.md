# Dune Hop

**Fly the dunes.** An off-road racer on a tabletop: four tracks, three rivals, every jump scored.
Neon contour dunes at night, a hot sunset by day.

By [Chris Cooley](https://coded.design/) · built on [Fizlet](https://github.com/coded-dot-design/fizlet) · MIT

- **Play:** https://dunehop.domvirus.com/play/
- **About:** https://dunehop.domvirus.com/

Dune Hop began as gallery piece #098 in Fizlet's Daily, a one-track tabletop run, and was picked to
grow into a full game.

## The game

**Four tracks**, each a bigger table than the last: **Sunset Loop** (two kickers, whoops, a banked
turn), **Ridge Run** (over a ridge and off the crest, a chicane, a banked hairpin, a big kicker),
**Split Canyon** (the long way round, or the shortcut over the canyon gap) and **Neon Edge** (always
night, at the city's edge: towers, chicanes, banked sweepers, a shortcut with a jump). Three laps
each, gates in order, on wide roads; a sand rim round each table turns you back before you go over.
Pick a track (the preview shows it), then START. Your best time per track is kept on this device.

**Rivals:** VOLT, MIRAGE and RUST drive the same terrain on the same physics (`@fzlt/core/drive`)
with a waypoint pilot: they look ahead along the line, brake for the bends, level the nose in the
air, and pick the shortcut or the long way each lap. They see the other cars: they brake behind one
they can't pass and step round it, and RUST leans on anyone in reach. Cars collide; hit a car while it
drifts and it spins out. They crash too.

**Stunts:** every landing is judged by its airtime and how far off the slope it came down. Clean
landings score and build a combo; sketchy ones score once; nose it in or roll it and you tumble back
to the last gate. **Drift** (Shift, or DRIFT on a phone): the handbrake steps the tail out; hold the
slide and the drift points bank when it straightens, or are lost to a hit or a crash. Clean landings
and drifts fill **NITRO**; pink **boost pads**, on straights out of the hairpins and into the
kickers, shove anyone over them.

**Controls.** ↑/W gas, ↓/S brake (reverse when stopped), ←→/AD steer, Shift drift, Space nitro; in the air gas
lifts the nose and brake dips it. P pause, V camera (chase or the whole table), M sound, R restart,
T tracks. A mouse: hold the course for gas, drag to steer. Phones: GAS, BRAKE, DRIFT and BOOST under
the right thumb; the left thumb steers on a ◀ ▶ pad or a stick (STEERING on the pause card; the
choice is kept on the device). The look follows the page's `<html data-theme>`.

The race is deterministic and seeded: the same seed and inputs give the same race, bit for bit
(the course uses only + − × ÷ and square roots), so online races can come later.

## As a module

```js
import { createDuneHop } from "./dist/dune-hop.mjs";
const game = createDuneHop({ host: document.querySelector("#stage") }); // the track menu
game.start("neon-edge");                       // or race at once
createDuneHop({ host, attract: true, track: "neon-edge" }); // a demo lap; a tap takes the wheel
createDuneHop();                               // a layer over the whole page; Escape gives it back
```

## Size

The whole game, its Fizlet bricks (kernel, diorama, terrain, drive, input, pad, sound, ui) and the
Board UI styles: **51,371 bytes gzip** (`dist/dune-hop.mjs`, measured at build; `npm run size`). No
runtime dependencies: `@fzlt/core` is a dev dependency, bundled at build.

## Develop

```sh
npm ci
npm run check         # typecheck, build dist/ (committed), size
npm test              # the race headless: tracks, a full race on every track, determinism, allocation
npm run test:settle   # the menu and the hero sleep, the race never does, off screen pauses, Recall
npm run test:browser  # Chromium at 1440 and 390: keyboard, mouse, touch, pause, a full race, Recall
npm run site:build    # the site (landing + /play/) into artifacts/pages
npm run test:site     # the site at 1440 and 390, light and dark
node scripts/shots.mjs  # the hero's still poster and the share image, from the game
```

`src/tracks.ts` (the tracks as data and the course builder), `src/race.ts` (the race: cars, gates,
laps, rivals, boost, crashes), `src/stunt.ts` (the air scorer), `src/game.ts` (the scene, HUD and
cards), `site/` (Astro: the landing page and the game page). CHROMIUM_PATH points the tests at a
Chromium of your own.

Custom domain: `pages.yml` builds with `SITE_URL=https://dunehop.domvirus.com` and `SITE_BASE=/`
(repo variables override) and writes the `CNAME` from it.

## Licence

MIT © Chris Cooley / coded.design
