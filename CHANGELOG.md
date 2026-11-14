# Changelog

## Unreleased

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
