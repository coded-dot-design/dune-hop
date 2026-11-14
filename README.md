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
drifts and it spins out. They tumble too.

**Suspension:** long travel, like a desert buggy or a trophy truck: each wheel rides its own soft,
progressive spring on a swinging arm (over half a unit of travel), so the whoops work the wheels one
by one, the body pitches and rolls on the springs, and a big landing sinks deep, rebounds once and
settles instead of slamming. Drift, contact and suspension are all `@fzlt/core/drive`'s (0.24).

**Stunts:** every landing is judged by its airtime and how far off the slope it came down. Clean
landings score and build a combo; sketchy ones score once; nose it in or roll it and you **tumble**:
a short roll, then the buggy rights itself and drives on from where it came down (you lose the combo,
never the run). Only a car that flies off the table's edge goes back to the last gate. **Drift** (Shift, or DRIFT on a phone): the handbrake steps the tail out; hold the
slide and the drift points bank when it straightens, or are lost to a hit or a crash. Clean landings
and drifts fill **NITRO**; pink **boost pads**, on straights out of the hairpins and into the
kickers, shove anyone over them.

**BATTLE** (CLEAN / BATTLE on the menu, kept on the device): item boxes on the track (four rows of
three, back a few seconds after they're taken). Drive through one to hold an item; fire it with
**ITEM** (F, E or right Ctrl; P2 in a split: right Ctrl, `.` or numpad 0; ★ on a phone's pad; a
gamepad's left bumper). Our own four: the **blaster** (a burst of three bolts ahead: a hit stalls
the car), the **oil slick** (dropped behind: the next car over it spins out), the **zap mine** (left
on the track, armed after a moment: anyone over it, you too, is thrown into a big tumble that rights
itself) and the **shield** (blocks the next hit). Hits are for fun: no health, nobody is ever out.
The draw leans a little toward the back of the pack (more mines and blasters there, more shields up
front), the rivals pick up and fire theirs too, and every hit goes off in `@fzlt/core/fx`'s blasts.

**Freestyle** (RACE / FREESTYLE on the menu): no race and no clock. Four large tables side by side
over a dark gap, each its own look and features: **Salt Flats** (a kicker line, a tabletop, whoops,
a drift ring), **The Bowl** (a deep bowl, a spine, a hip), **Dune Sea** (ridged dunes, a banked
U-turn) and **Neon Yard** (two ledges, a long rail, stair ledges, a funbox). A launch ramp on every
gap edge faces one on the other side, so a car off one lands on the other's slope; each table starts
you facing its out-ramp with a boost pad on the way (gas straight on, and you're on the next table).
Air, transfers (+250) and drift chains score, each times the combo multiplier: every scoring move
inside five seconds of the last adds one (up to ×10); a crash or a sketchy landing loses it. Drive
into the gap and the table you were on takes you back. The best score is kept on the device. Left
alone, it settles (no frames) like the menu. With BATTLE on, every table has item boxes too.

**King of the Table** (Freestyle with two or more, split or online): each player has a glowing home
pad, the centre of their own table, and starts on it. Points you score are carried (the CARRY chip)
and only count once you bring them home: they bank when you're back on your pad. Land on someone
else's pad and you steal a fifth of their banked points (carried: get them home); a tumble or a hit
spills a quarter of what you carry. The most banked when the three-minute jam ends wins.

**Two players.** *Split screen* (2 · SPLIT): a view each, side by side on a wide screen, stacked on
a tall one; P1 on W A S D, left Shift drift, Space (or Q) nitro; P2 on the arrows, right Shift drift,
Enter (or /) nitro, right Ctrl item; the first gamepad is P1, the second P2 (right trigger gas, left trigger brake,
left stick steer, A boost, B drift, left bumper item); on a touch screen each half has its own steer pad and keys.
*Online* (ONLINE): two to four phones (or screens) over a fizlet-rooms room, each with its own
view. HOST opens a room (pick 2, 3 or 4 players): the card shows the room number and the invite
code in big type, and SEND LINK opens the phone's share sheet (or copies the link): the link has the
room and the code, so it drops a friend straight into the room after the code check. JOIN takes the
room number by hand. Every player can type a name (kept on the device); the seats show in their
buggies' colours. The room starts when the host's count is in, or on START NOW with two or more; the
host's mode, track, rivals and CLEAN / BATTLE ride along (with AI rivals on, they fill the grid to six). The sim is
deterministic and only inputs travel (32 bits per seat per frame over `@fzlt/core/presence`'s rooms).
Your own buggy answers at once: each frame runs straight away with your input (a frame or so ahead)
and a guess for everyone else's (their last); when a real input turns out different, the race goes
back to that frame and runs forward again (`src/rollback.ts`), and remote buggies ease into place
instead of popping. A state hash every 30 final frames catches a desync. A race, or a three-minute
Freestyle jam for up to four (the top score wins); REMATCH on every screen starts the next on the same
frame. If someone leaves, the AI drives their buggy from the next frame on, the same on every screen,
and the match goes on; when everyone else has gone it ends. A room is as big as the room server
allows (its `MAX_PLAYERS`, at most four here).

**Controls.** ↑/W gas, ↓/S brake (reverse when stopped), ←→/AD steer, Shift drift, Space nitro; in the air gas
lifts the nose and brake dips it. P pause, V camera (chase or the whole table), M sound, R restart,
T menu, F item (BATTLE). A mouse: hold the course for gas, drag to steer. Phones: the left thumb's stick
steers and gives the gas (push up; pull down to brake); under the right thumb DRIFT is the big key in the corner, so gas and a
drift work together, with BRAKE, BOOST and (in BATTLE) ★ ITEM round it. STEERING on the pause card swaps the stick for ◀ ▶ keys,
which give no gas, so that layout brings a GAS key back to the corner with DRIFT next to it (the choice is kept on the device). The look follows the page's `<html data-theme>`.

The race is deterministic and seeded (items, boxes and hits too): the same seed and inputs give the same race, bit for bit
(the course uses only + − × ÷ and square roots): that is what makes online play work.

## As a module

```js
import { createDuneHop } from "./dist/dune-hop.mjs";
const game = createDuneHop({ host: document.querySelector("#stage") }); // the track menu
game.start("neon-edge");                       // or race at once
game.start(undefined, { mode: "free" });       // Freestyle; { players: 2 } splits the screen
game.start("ridge-run", { battle: true });     // BATTLE: item boxes on the track
createDuneHop({ host, rooms: "wss://…" });     // the fizlet-rooms server for ONLINE (?rooms= overrides)
createDuneHop({ host, attract: true, track: "neon-edge" }); // a demo lap; a tap takes the wheel
createDuneHop();                               // a layer over the whole page; Escape gives it back
```

## Size

The whole game, its Fizlet bricks (kernel, diorama, terrain, drive, input, pad, sound, fx, ui, presence)
and the Board UI styles: `dist/build.json` holds the measured gzip size of each build (`npm run
size` checks it against the budget). No runtime dependencies: `@fzlt/core` is a dev dependency,
bundled at build.

## Develop

```sh
npm ci
npm run check         # typecheck, build dist/ (committed), size
npm test              # headless: tracks, a full race on every track, Freestyle (every table-to-table
                      # jump, scoring, the gap, the jam), online sync (a desync caught; every sim
                      # restores exactly; rollback over a link with latency and jitter ends byte
                      # for byte on the no-latency run: races, BATTLE, King of the Table, 2 and 4;
                      # a leaver; no garbage from corrections), determinism,
                      # allocation; BATTLE (every item, every hit recovers, the shield, the draw,
                      # King of the Table) and no crash-out on any landing
npm run test:settle   # the menu and the hero sleep, the race never does, off screen pauses, Recall
npm run test:browser  # Chromium at 1440 and 390: keyboard, mouse, touch, pause, a full race, Freestyle,
                      # split screen, Recall; tests/battle.mjs: BATTLE (pick up and fire with keys
                      # and touch, hits, the shield, a mine's tumble) and King of the Table; then tests/online.mjs: four pages (two at 1440, two
                      # phones) race online against a stand-in room server (tests/room-server.mjs)
                      # on phone links (its latency shim): host (BATTLE on), link, join by number,
                      # names, key → screen time and no waiting at 1440 and 390, a leaver, rematch;
                      # a King of the Table jam
npm run test:net      # online on phone links, measured (60–150 ms round trips, ± 30 ms jitter, 300 ms
                      # spikes; two and four screens): key → screen, frames that waited, sim rate,
                      # frames run again; `node tests/netlag.mjs --net lockstep` measures the 0.2.x link
npm run site:build    # the site (landing + /play/) into artifacts/pages
npm run test:site     # the site at 1440 and 390, light and dark
node scripts/shots.mjs  # the hero's still poster and the share image, from the game
```

`src/tracks.ts` (the tracks as data and the course builder), `src/race.ts` (the race: cars, gates,
laps, rivals, boost), `src/tumble.ts` (the tumble that rights itself), `src/items.ts` (BATTLE), `src/park.ts` and `src/freestyle.ts` (the Freestyle park and its
session), `src/stunt.ts` (the air scorer), `src/net.ts` (online: the wire format, the room),
`src/rollback.ts` (rollback over the room: guesses, snapshots, corrections, a leaver), `src/state.ts` (a brick's whole state as bytes),
`src/game.ts` (the scene, the views, HUD and cards), `site/` (Astro: the landing page and the game page). CHROMIUM_PATH points the tests at a
Chromium of your own.

Custom domain: `pages.yml` builds with `SITE_URL=https://dunehop.domvirus.com` and `SITE_BASE=/`
(repo variables override) and writes the `CNAME` from it. Online play uses `PUBLIC_ROOMS_URL`
(default `wss://fizlet-rooms.fizlet.workers.dev`); the room server must list
`https://dunehop.domvirus.com` in its allowed origins (`ALLOWED_ORIGINS`) and allow four seats
(`MAX_PLAYERS`) for rooms of four.

## Licence

MIT © Chris Cooley / coded.design
