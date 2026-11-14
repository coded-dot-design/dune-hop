# Changelog

## 0.3.0

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
- Online: BATTLE and King of the Table for up to four, in lockstep (items, boxes and hits in the
  state hash).
- The size budget is 86,000 bytes gzip (the build: 82,549).

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
