// Dune Rally online: two to four screens, one race (or one jam), over a fizlet-rooms room
// (@fzlt/core/presence's `join` for the room and its lobby, the same room server Salvo Bay and
// Battlefield Blitz use). The sim is deterministic, so only inputs travel: each frame every seat's
// inputs packed in 32 bits. ./rollback.ts runs each frame at once with this screen's own input (1 to 3
// frames ahead) and a guess for the others' (their last); a real input that differs takes the sim
// back to that frame and runs it again, so the screens end on the same state while everyone's own
// buggy answers at once. Every 30 final frames each screen's state hash is compared (a desync shows,
// it never drifts silently). The host (seat 0) picks the mode, the track, the rivals and the laps:
// they ride on the room's START to everyone as one byte. A rematch is every READY bit in the same
// final frame, so all screens start it on the same frame. A seat that leaves (the room says LEAVE
// once it has relayed that seat's last input, so every screen saw the same last frame) plays GONE
// (the autopilot) from the next frame on, the same on every screen: the match goes on.
import { join, hash32 } from "@fzlt/core/presence";

/** Input bits: throttle 0..15 (bits 0–3), brake 0..15 (4–7), steer 1..255 (8–15, 128 straight),
 *  nitro (16), drift 0..15 (17–20), the autopilot (21), ready for a rematch (22), the seat left (23),
 *  one character of the player's name (24–29, the first frames only), the ITEM key (30). */
export const B_NITRO = 1 << 16, B_AUTO = 1 << 21, B_READY = 1 << 22, B_GONE = 1 << 23, B_ITEM = 1 << 30;
/** At most this many seats in a room, and this many name characters. */
export const SEATS = 4, NAME = 8;
const q4 = (v: number) => Math.max(0, Math.min(15, Math.round(v * 15)));

/** Pack one seat's inputs (throttle, brake, steer, nitro, drift; and the flags) into 32 bits. */
export function encode(th: number, br: number, st: number, ni: number, dr: number, flags = 0) {
  const s = Math.max(1, Math.min(255, Math.round(st * 127) + 128));
  return (q4(th) | (q4(br) << 4) | (s << 8) | (ni ? B_NITRO : 0) | (q4(dr) << 17) | flags) >>> 0;
}
/** Unpack seat c's bits into IN (6 per car: the sims' IK) and AUTO: every screen decodes the same bits
 *  the same way. A seat that left drives on the autopilot. */
export function decode(bits: number, c: number, IN: Float64Array, AUTO: Uint8Array) {
  const q = c * 6;
  IN[q] = (bits & 15) / 15;
  IN[q + 1] = ((bits >>> 4) & 15) / 15;
  IN[q + 2] = (((bits >>> 8) & 255) - 128) / 127;
  IN[q + 3] = bits & B_NITRO ? 1 : 0;
  IN[q + 4] = ((bits >>> 17) & 15) / 15;
  IN[q + 5] = bits & B_ITEM ? 1 : 0;
  AUTO[c] = bits & (B_AUTO | B_GONE) ? 1 : 0;
}

/** The host's pick as one byte: freestyle (bit 0), the track (1–2), rivals (3: none or three), BATTLE
 *  (4), laps (5–7, 0: the track's). */
export const packMode = (free: boolean, track: number, rivals: number, laps: number, battle = false) => (free ? 1 : 0) | ((track & 3) << 1) | (rivals ? 8 : 0) | (battle ? 16 : 0) | ((laps & 7) << 5);
export const unpackMode = (m: number) => ({ free: !!(m & 1), track: (m >> 1) & 3, rivals: m & 8 ? 3 : 0, laps: (m >> 5) & 7, battle: !!(m & 16) });

// Names: A–Z, 0–9 and a space, six bits a character (0 ends the name), one character a frame.
const ABC = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";
/** A name as the room card keeps it: upper case, letters, digits and spaces, at most NAME characters. */
export const cleanName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, "").replace(/\s+/g, " ").trim().slice(0, NAME).trim();
/** Character k of `name` as input bits (0 past the end). */
export const nameBits = (name: string, k: number) => {
  const i = k < name.length ? ABC.indexOf(name[k]!, 1) : 0;
  return (i > 0 ? i : 0) << 24;
};
/** The name character in `bits` ("" for none). */
export const nameChar = (bits: number) => {
  const i = (bits >>> 24) & 63;
  return i > 0 && i < ABC.length ? ABC[i]! : "";
};

/** A hash of the sim's state (its byte views), for presence's desync check. */
export function hashOf(bytes: Uint8Array[]) {
  let h = 2166136261;
  for (const b of bytes) h = hash32(b, h);
  return h >>> 0;
}

/** A seat that left plays these bits from the frame after its last input (every screen the same):
 *  the autopilot, ready for a rematch. */
export const GONE = (B_GONE | B_AUTO | B_READY) >>> 0;
export { rollback, type Rollback } from "./rollback.ts";

/** The room: `url` (wss://…), room `room`, `size` seats (every screen asks the same size: the room
 *  refuses a different one), an invite code. `want` seats start it (the host's ask: 0 waits for the
 *  host's `go`), `mode` is the host's pick. Resolves on the start with the transport, your seat, the
 *  seat count, the shared seed and the host's pick. `lobby` hears who is in while you wait; its
 *  `go()` (the host's) starts with the seats taken. */
export function joinRoom(
  url: string,
  room: number,
  size: number,
  code: string,
  o: { want: number; mode: number; signal?: AbortSignal; lobby?: (seat: number, seated: number, size: number, go: () => void) => void },
) {
  let asked = 0;
  return join(`${url}/room/${room}?players=${size}`, o.signal, ["fizlet-rooms", "invite." + code], {
    lobby(start, seat, seated, n) {
      // The host asks once for its count (the room starts by itself when that many are in).
      if (seat === 0 && asked !== o.want && o.want > 1) (asked = o.want), start(o.want, o.mode & 255);
      o.lobby?.(seat, seated, n, () => seat === 0 && seated > 1 && start(0, o.mode & 255));
    },
  });
}
