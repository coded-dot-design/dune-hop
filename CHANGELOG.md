# Changelog

## 0.4.1

- The camera holds still ("it keeps zooming on him"). Your buggy is drawn the same size all race:
  the chase's look-ahead leads across the picture only, and the camera slides with the buggy along
  the line of sight instead of zooming as it speeds up, brakes, jumps and lands. A resize (the phone's
  URL bar showing or hiding, a quality step) no longer refits or snaps the camera: the scale set when
  the race begins holds (more or less of the course shows); only a width change reframes, after
  0.4 s, eased. The table view holds the same way. Measured over a whole race at 390 × 844 with the
  URL bar shown and hidden eight times: the chase scale swings 4.8% (0.4.0: 38%); at 1440 × 900,
  6.1% (0.4.0: 24%).
- No browser zoom on the play surface: a pinch on a HUD key or the pad zoomed the page (4.5× and 5×);
  now `touch-action` on the stage and `@fzlt/core/touch`'s lock (iOS's gesture events too) stop it,
  on the stage alone. `tests/camera.mjs` checks both; the README's "Camera" has the rule (#19).
- The build: 87,396 bytes gzip (+619), budget 88,000.

## 0.4.0

- Long-travel suspension, like a desert buggy or a trophy truck: each wheel rides its own soft,
  progressive spring with 0.55 of travel (was 0.3) and more rebound than compression damping, on a
  swinging arm you can see (it swings from under the tub to the hub as the spring works, on the
  arm's layer); the whoops work the wheels one by one, the body pitches and rolls on the springs (a
  lower centre of mass and lighter roll than pitch, so a slide onto a bank stays upright), and a big
  landing sinks deep, rebounds once and settles. Measured over the autopilot's races (four tracks, two
  seeds): 214 landings, 16 on the bump stop (0.3.0's springs: 193 of 205), the median landing uses
  0.91 of the travel. A tumble that rights itself drops the buggy onto its springs.
- On `@fzlt/core` 0.25.0: drift, car contact and suspension are the `drive` brick's (`src/handling.ts`
  is now a thin view of them for the race). The handbrake is the brick's: the tail swings out, the
  slide holds under 0.62 rad and a little speed comes back on the way out. Cars collide as boxes.
- Online rollback snapshots each car through the brick's own `state` (Fizlet 0.25.0: one buffer,
  `save`/`load`); `src/state.ts`, which swapped the global typed-array constructors to catch a car's
  arrays, is gone.
- Fizlet 0.24 also fixes the allocation 0.23.0's drive made with several races in one process
  (the race test: 1 to 3 young GCs over 200,000 steps).
- The size budget is 88,000 bytes gzip (the build: 86,777; +1,973 over main for the brick's suspension, contact and the arms).
- The rest of each wheel now sits behind the body on the far side too: the hub caps, the axle stubs
  and the suspension arms (0.3.0 fixed the tyres only; the arms sat on the body's layer and the caps
  could float over a side pod). One rule: everything on a wheel goes over the body on the near side
  and under it on the far side, in order out from the car (arm, tyre, cap, stub); every other part
  is on the body's layer. The side is now read along the ray from the camera's eye to the car, so a
  car off the middle of the picture (the chase's lead, a rival, the hero's car right of centre) gets
  it right too. The test checks every wheel part at 16 headings × 3 pitches × 3 rolls under four
  cameras, the car centred and off to one side.

## 0.3.0

- Online is smooth on phones. 0.2.2 made every frame wait for every player's input, sent only two
  frames ahead, so on a phone's network (a 100 ms round trip) the race stalled almost every frame and
  ran in slow motion. Now your own buggy answers at once: each frame runs straight away with your
  input and a guess for everyone else's, and when a real input turns out different the race goes
  back to that frame and runs forward again (rollback), the same on every screen. Remote buggies ease
  into place instead of popping. Measured on a stand-in room server with phone links (60–150 ms round
  trips, ± 30 ms jitter, 300 ms spikes): the race at 60 frames a second instead of 9 to 13, no
  waiting instead of about 3,000 stalled frames a minute, your key to the screen in 17 ms (p50)
  instead of 133 to 183 ms. Leavers (the AI drives on), REMATCH and the desync check work as before.
- No more crashing out. A bad landing, a flip or a rollover is a short tumble: the buggy rights
  itself and drives on from where it came down. Only flying off the table's edge (or into
  Freestyle's gap) puts you back at your gate or table. Every mode.
- BATTLE (CLEAN / BATTLE on the menu, remembered; the host's pick online): item boxes on the track
  and on every Freestyle table. Drive through one to hold an item; ITEM fires it (F, E or right Ctrl;
  P2 in a split: right Ctrl, `.` or numpad 0; the ★ key on a phone; a gamepad's left bumper).
  Blaster (three bolts: a hit stalls the car), oil slick (dropped behind: the next car spins out),
  zap mine (armed after a moment: a big tumble that rights itself), shield (blocks one hit). No
  health, nobody is ever out. The back of the pack draws better; the rivals pick up and fire theirs
  too. Hits go off in Fizlet's fx blasts, with sound.
- King of the Table (Freestyle with two or more, split or online): a glowing home pad each. Points
  are carried and bank only on your pad; landing on someone else's pad steals a fifth of their bank;
  a tumble or a hit spills a quarter of what you carry. The most banked when the jam ends wins.
- Online: BATTLE and King of the Table for up to four (items, boxes and hits in the state hash).
- Phones: gas and drift at once. The stick gives the gas (push up), so the separate GAS key is gone;
  DRIFT is now the big key in the corner under the right thumb, ★ ITEM takes DRIFT's old place, and
  BRAKE and BOOST stay. The stick is a little bigger (120 px at 390 wide, 16 px clear of the edge).
  STEERING → ARROWS (no gas on the arrows) keeps a GAS key in the corner with DRIFT next to it.
- The buggies' far-side wheels no longer draw over the body. Every wheel sat on the layer above the
  body, so a far tyre could cover the cage or the seat (worst when turning or drifting). Now each
  draw puts a wheel over the body when it is on the camera's side of the car and under it when it
  is on the far side, for every buggy (rivals too) in every view; a test checks the paint order at
  16 headings × 3 pitches × 3 rolls under three cameras.
- The size budget is 86,000 bytes gzip (the build: 84,686).

## 0.2.2

- Online for up to four phones, a view each. ONLINE opens a room card made for a phone: your name,
  the invite code, and two big keys, HOST and JOIN. HOST asks how many (2, 3 or 4) and opens a room;
  the card shows the room number and the code in big type, the seats in their buggies' colours,
  SEND LINK (the share sheet, or a copied link) and START NOW once two or more are in. The link drops
  a friend straight into the room after the code check; JOIN takes the room number by hand.
- Everyone's name shows on every screen: the standings, the tags over the buggies, the result card.
- Race (with AI rivals on, they fill the grid to six) or a Freestyle jam for up to four.
- Someone leaves mid-race: the AI drives their buggy on, the same on every screen, and the match
  goes on; REMATCH with whoever is still there. It ends when everyone else has gone.
- The size budget is 76,000 bytes gzip (the build: 73,535).

## 0.2.1

- Phones: the stick now drives. In 0.2.0 the touch stick moved on screen but the game never read it
  (the steering read the arrow keys only), so the car sat still. Now the stick is the default: left
  and right steer (analog, with the stick's dead zone), push up for gas and pull down to brake, both
  analog; the GAS and BRAKE keys still work alongside it (the stronger of the two wins).
- Phones: GAS, BRAKE, DRIFT and BOOST are icon keys (each named, with a tooltip) in a cluster in the
  bottom-right corner, GAS the big one in the corner and the other three round it, every key 44 px
  or more.
- The pause card's STEERING key swaps STICK and ◀ ▶ ARROWS (left and right keys). Every choice saved
  by 0.2.0 moves to the stick.
- 2 · SPLIT is offered on desktops (keyboards, gamepads) only for now; on a touch-only phone the menu
  has 1 PLAYER and ONLINE.

## 0.2.0

- Freestyle (RACE / FREESTYLE on the menu): no race, no clock; four large tables side by side
  (Salt Flats, The Bowl, Dune Sea, Neon Yard), each its own look and features, linked by launch
  ramps across the gaps. Air, transfers and drift chains score times a combo multiplier; the best
  score is kept on the device; left alone it settles.
- Two players on one screen: split screen (side by side, or stacked on a tall screen), W A S D +
  left Shift + Space for P1, the arrows + right Shift + Enter for P2, two gamepads, a touch pad in
  each half. Race (rivals optional) or a three-minute Freestyle jam.
- Online, two screens: invite code and room (fizlet-rooms, the same server and lobby as Salvo Bay),
  the host's pick reaches the guest, lockstep on the inputs (`@fzlt/core/presence`) with a state
  hash check, rematch, and a leaver ends the match on the other screen.
- Drift: Shift (or DRIFT on a phone) is a handbrake slide; hold it for drift points, banked when the
  slide ends, lost to a hit or a crash; drifts fill NITRO too. (A local stand-in, `src/handling.ts`,
  until Fizlet's `drive` brick ships drift and car contact.)
- Car contact: cars collide on their nose and tail, an off-centre hit turns them, and a car hit while
  it drifts spins out. The rivals see the other cars: they brake behind one they can't pass, step
  round it, and RUST leans on anyone in reach.
- Bigger tracks: every course 1.65× larger on a table sized to fit it, the road 50% wider (5.4), a
  sand rim and a soft wall round every table (full nitro at the edge no longer goes over).
- Boost pads moved onto straights out of the hairpins and into the kickers, larger and outlined;
  boost tuned (top 15, was 16.5). Split Canyon's gap moved out of the hairpin onto the straight.
- Track select only selects (the preview shows it); START races.
- Phones: a ◀ ▶ steer pad (the default) or the stick for the left thumb, GAS · BRAKE · DRIFT · BOOST
  for the right; switch on the pause card, kept on the device.
- The buggy: a wider front track, a slimmer nose and splitter, shorter side pods and suspension arms,
  so the front tyres never cut the body at full lock.
- The road's edge: a shoulder under the neon line hides the painted faces' saw-tooth; banked turns
  fade in and out over twice the length.
- The race is N cars with inputs per car (`IN`, `AUTO`) and up to two people (`createRace(def, seed,
  { humans, rivals })`), still seeded and bit-for-bit deterministic, ready for split screen and online play.

## 0.1.0

- First release as a full game, grown from Fizlet gallery piece #098 (Dune Hop, a one-track
  tabletop run). Four tracks of rising size: Sunset Loop, Ridge Run, Split Canyon (a shortcut over
  a canyon gap) and Neon Edge (night at the city's edge). Three laps against three AI rivals (VOLT,
  MIRAGE, RUST) on @fzlt/core/drive with a waypoint pilot; position, laps, best lap, standings and
  a minimap. Kickers, gap jumps, whoops, crests and banked turns; the air scorer and combos; boost
  pads; NITRO filled by clean landings. Track select with a best time per track. A seeded,
  deterministic race. Light (sunset) and dark (neon night) themes; Board UI HUD; touch pad.
- The site (`site/`): a landing page whose hero is an attract lap of Neon Edge (tap to take the
  wheel; a still poster under reduced motion) and the game at `/play/`.
