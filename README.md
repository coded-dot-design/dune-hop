# Dune Hop

**Fly the dunes.** An off-road racer on a tabletop: four tracks, three rivals, every jump scored; a
Freestyle park of four tables to jump between; two players on one screen or online. Neon contour
dunes at night, a hot sunset by day.

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

**Freestyle** (RACE / FREESTYLE on the menu): no race and no clock. Four large tables side by side
over a dark gap, each its own look and features: **Salt Flats** (a kicker line, a tabletop, whoops,
a drift ring), **The Bowl** (a deep bowl, a spine, a hip), **Dune Sea** (ridged dunes, a banked
U-turn) and **Neon Yard** (two ledges, a long rail, stair ledges, a funbox). A launch ramp on every
gap edge faces one on the other side, so a car off one lands on the other's slope; each table starts
you facing its out-ramp with a boost pad on the way (gas straight on, and you're on the next table).
Air, transfers (+250) and drift chains score, each times the combo multiplier: every scoring move
inside five seconds of the last adds one (up to ×10); a crash or a sketchy landing loses it. Drive
into the gap and the table you were on takes you back. The best score is kept on the device. Left
alone, it settles (no frames) like the menu.

**Two players.** *Split screen* (2 · SPLIT): a view each, side by side on a wide screen, stacked on
a tall one; P1 on W A S D, left Shift drift, Space (or Q) nitro; P2 on the arrows, right Shift drift,
Enter (or /) nitro; the first gamepad is P1, the second P2 (right trigger gas, left trigger brake,
left stick steer, A boost, B drift); on a touch screen each half has its own steer pad and keys.
*Online* (ONLINE): two screens over a fizlet-rooms room, the same invite code and room on both
(SEND LINK copies a link with them); whoever joins first picks the mode, track and rivals. The sim
runs in lockstep on both screens and only inputs travel (`@fzlt/core/presence`: 32 bits per seat per
frame, sent two frames ahead; a state hash every 30 frames catches a desync). Both race, or a
three-minute Freestyle jam (the higher score wins); REMATCH on both starts the next on the same
frame; if one leaves, the other screen says so and the match ends. Rivals are optional in a
two-player race (3 RIVALS / NO RIVALS).

**Controls.** ↑/W gas, ↓/S brake (reverse when stopped), ←→/AD steer, Shift drift, Space nitro; in the air gas
lifts the nose and brake dips it. P pause, V camera (chase or the whole table), M sound, R restart,
T menu. A mouse: hold the course for gas, drag to steer. Phones: GAS, BRAKE, DRIFT and BOOST under
the right thumb; the left thumb steers on a ◀ ▶ pad or a stick (STEERING on the pause card; the
choice is kept on the device). The look follows the page's `<html data-theme>`.

The race is deterministic and seeded: the same seed and inputs give the same race, bit for bit
(the course uses only + − × ÷ and square roots): that is what makes online play work.

## As a module

```js
import { createDuneHop } from "./dist/dune-hop.mjs";
const game = createDuneHop({ host: document.querySelector("#stage") }); // the track menu
game.start("neon-edge");                       // or race at once
game.start(undefined, { mode: "free" });       // Freestyle; { players: 2 } splits the screen
createDuneHop({ host, rooms: "wss://…" });     // the fizlet-rooms server for ONLINE (?rooms= overrides)
createDuneHop({ host, attract: true, track: "neon-edge" }); // a demo lap; a tap takes the wheel
createDuneHop();                               // a layer over the whole page; Escape gives it back
```

## Size

The whole game, its Fizlet bricks (kernel, diorama, terrain, drive, input, pad, sound, ui, presence)
and the Board UI styles: `dist/build.json` holds the measured gzip size of each build (`npm run
size` checks it against the budget). No runtime dependencies: `@fzlt/core` is a dev dependency,
bundled at build.

## Develop

```sh
npm ci
npm run check         # typecheck, build dist/ (committed), size
npm test              # headless: tracks, a full race on every track, Freestyle (every table-to-table
                      # jump, scoring, the gap, the jam), lockstep sync (presence syncCheck, a desync
                      # caught), determinism, allocation
npm run test:settle   # the menu and the hero sleep, the race never does, off screen pauses, Recall
npm run test:browser  # Chromium at 1440 and 390: keyboard, mouse, touch, pause, a full race, Freestyle,
                      # split screen, Recall; then tests/online.mjs: two pages race online against a
                      # stand-in room server (tests/room-server.mjs)
npm run site:build    # the site (landing + /play/) into artifacts/pages
npm run test:site     # the site at 1440 and 390, light and dark
node scripts/shots.mjs  # the hero's still poster and the share image, from the game
```

`src/tracks.ts` (the tracks as data and the course builder), `src/race.ts` (the race: cars, gates,
laps, rivals, boost, crashes), `src/park.ts` and `src/freestyle.ts` (the Freestyle park and its
session), `src/stunt.ts` (the air scorer), `src/net.ts` (online: the wire format, the room),
`src/game.ts` (the scene, the views, HUD and cards), `site/` (Astro: the landing page and the game page). CHROMIUM_PATH points the tests at a
Chromium of your own.

Custom domain: `pages.yml` builds with `SITE_URL=https://dunehop.domvirus.com` and `SITE_BASE=/`
(repo variables override) and writes the `CNAME` from it. Online play uses `PUBLIC_ROOMS_URL`
(default `wss://fizlet-rooms.fizlet.workers.dev`); the room server must list
`https://dunehop.domvirus.com` in its allowed origins.

## Licence

MIT © Chris Cooley / coded.design
