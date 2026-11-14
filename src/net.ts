// Dune Hop online: two screens, one race (or one jam), over a fizlet-rooms room (@fzlt/core/presence:
// `join` for the room and its lobby, the same room server Salvo Bay and Battlefield Blitz use, and
// `presence` for lockstep). The sim is deterministic, so only inputs travel: each frame every seat's
// five inputs packed in 32 bits, sent two frames ahead; a missing input stalls the sim, never guesses;
// every 30 frames each screen's state hash is compared (a desync shows, it never drifts silently).
// The host (seat 0) picks the mode, the track, the rivals and the laps: they ride on the room's START
// to the guest as one byte. A rematch is two READY bits seen in the same frame, so both screens start
// it on the same frame; a seat that leaves (the room says LEAVE) ends the match on the other screen.
import { join, hash32 } from "@fzlt/core/presence";

/** Input bits: throttle 0..15 (bits 0–3), brake 0..15 (4–7), steer 1..255 (8–15, 128 straight),
 *  nitro (16), drift 0..15 (17–20), the autopilot (21), ready for a rematch (22). */
export const B_NITRO = 1 << 16, B_AUTO = 1 << 21, B_READY = 1 << 22;
const q4 = (v: number) => Math.max(0, Math.min(15, Math.round(v * 15)));

/** Pack one seat's inputs (throttle, brake, steer, nitro, drift; and the flags) into 32 bits. */
export function encode(th: number, br: number, st: number, ni: number, dr: number, flags = 0) {
  const s = Math.max(1, Math.min(255, Math.round(st * 127) + 128));
  return (q4(th) | (q4(br) << 4) | (s << 8) | (ni ? B_NITRO : 0) | (q4(dr) << 17) | flags) >>> 0;
}
/** Unpack seat c's bits into IN (5 per car) and AUTO: every screen decodes the same bits the same way. */
export function decode(bits: number, c: number, IN: Float64Array, AUTO: Uint8Array) {
  const q = c * 5;
  IN[q] = (bits & 15) / 15;
  IN[q + 1] = ((bits >>> 4) & 15) / 15;
  IN[q + 2] = (((bits >>> 8) & 255) - 128) / 127;
  IN[q + 3] = bits & B_NITRO ? 1 : 0;
  IN[q + 4] = ((bits >>> 17) & 15) / 15;
  AUTO[c] = bits & B_AUTO ? 1 : 0;
}

/** The host's pick as one byte: freestyle (bit 0), the track (1–2), rivals (3–4), laps (5–7, 0: the track's). */
export const packMode = (free: boolean, track: number, rivals: number, laps: number) => (free ? 1 : 0) | ((track & 3) << 1) | ((rivals & 3) << 3) | ((laps & 7) << 5);
export const unpackMode = (m: number) => ({ free: !!(m & 1), track: (m >> 1) & 3, rivals: (m >> 3) & 3, laps: (m >> 5) & 7 });

/** A hash of the sim's state (its byte views), for presence's desync check. */
export function hashOf(bytes: Uint8Array[]) {
  let h = 2166136261;
  for (const b of bytes) h = hash32(b, h);
  return h >>> 0;
}

/** Join room `room` on a fizlet-rooms server (`url`: wss://…) with an invite code: resolves once both
 *  seats are in, with the transport, your seat, the shared seed and the host's pick. `lobby` hears
 *  who is in while you wait. */
export async function joinRoom(url: string, room: number, code: string, mode: number, signal?: AbortSignal, lobby?: (seat: number, seated: number) => void) {
  let asked = false;
  const s = await join(`${url}/room/${room}?players=2`, signal, ["fizlet-rooms", "invite." + code], {
    lobby(start, seat, seated) {
      lobby?.(seat, seated);
      // The host asks the room to start once two are in; its pick rides along to the guest.
      if (seat === 0 && !asked) (asked = true), start(2, mode & 255);
    },
  });
  return s;
}
