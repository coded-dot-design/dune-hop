// Dune Hop online: two to four screens, one race (or one jam), over a fizlet-rooms room
// (@fzlt/core/presence: `join` for the room and its lobby, the same room server Salvo Bay and
// Battlefield Blitz use, and `presence` for lockstep). The sim is deterministic, so only inputs travel:
// each frame every seat's five inputs packed in 32 bits, sent two frames ahead; a missing input stalls
// the sim, never guesses; every 30 frames each screen's state hash is compared (a desync shows, it
// never drifts silently). The host (seat 0) picks the mode, the track, the rivals and the laps: they
// ride on the room's START to everyone as one byte. A rematch is every READY bit seen in the same
// frame, so all screens start it on the same frame. A seat that leaves (the room says LEAVE once it
// has relayed that seat's last input, so every screen saw the same last frame) is driven by the
// autopilot from the next frame on, the same on every screen: the match goes on.
import { join, hash32, presence, INPUT, LEAVE, type Transport } from "@fzlt/core/presence";
import type { Engine } from "@fzlt/core/kernel";

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

const u32 = (d: Uint8Array, i: number) => (d[i]! | (d[i + 1]! << 8) | (d[i + 2]! << 16) | (d[i + 3]! << 24)) >>> 0;

/** Lockstep for `players` seats on engine `e` (presence), where a seat that leaves doesn't stop the
 *  match: from the frame after the last input it sent (every screen got the same ones: the room
 *  relays a seat's inputs in order and its LEAVE after them), its input is `gone` (the autopilot) on
 *  every screen. `left` is the bitmask of seats that left; `lost` (presence's) has this seat's bit
 *  too when this screen's own link closed. */
export function lockstep(
  e: Engine,
  o: { transport: Transport; slot: number; players: number; input(): number; step(inputs: Uint32Array, frame: number): void; hash(): number; gone?: number; delay?: number },
) {
  const P = o.players, D = o.delay ?? 2, gone = (o.gone ?? B_GONE | B_AUTO | B_READY) >>> 0;
  // Per seat: the last input frame seen (D − 1: presence fills frames 0..D−1 itself), the frame its
  // autopilot starts (−1: still here), the next synthetic frame to feed.
  const last = new Int32Array(P).fill(D - 1), from = new Int32Array(P).fill(-1), next = new Int32Array(P), out = new Uint8Array(12);
  let left = 0, fn: ((d: Uint8Array) => void) | null = null;
  const watch = (d: Uint8Array) => {
    const s = d[1]!;
    if (d.length >= 12 && s < P && s !== o.slot) {
      if (d[0] === INPUT) last[s] = Math.max(last[s]!, u32(d, 4) | 0);
      else if (d[0] === LEAVE && from[s]! < 0) (from[s] = last[s]! + 1), (next[s] = from[s]!), (left |= 1 << s);
    }
    fn?.(d);
  };
  const t: Transport = {
    send: (d) => o.transport.send(d),
    listen: (f) => ((fn = f), o.transport.listen(f ? watch : null)),
    close: () => o.transport.close(),
  };
  const link = presence(e, { transport: t, slot: o.slot, players: P, delay: D, input: o.input, step: (_e, inputs, f) => o.step(inputs, f), hash: o.hash });
  // After presence's own step: feed each gone seat's input a few frames ahead, as if it had sent it.
  out[0] = INPUT;
  out[8] = gone & 255, out[9] = (gone >>> 8) & 255, out[10] = (gone >>> 16) & 255, out[11] = gone >>> 24;
  const feed = {
    step() {
      if (!left || !fn) return;
      const F = link.frame;
      for (let s = 0; s < P; s++) {
        if (from[s]! < 0) continue;
        out[1] = s;
        for (let f = Math.max(next[s]!, F); f < F + D * 2 + 2; f++) {
          out[4] = f & 255, out[5] = (f >>> 8) & 255, out[6] = (f >>> 16) & 255, out[7] = f >>> 24;
          fn(out);
          next[s] = f + 1;
        }
      }
    },
  };
  e.add(feed);
  return {
    link,
    /** Seats that left (their cars on the autopilot since). */
    get left() {
      return left;
    },
    /** The frame seat s's autopilot took over, or −1. */
    leftAt: (s: number) => from[s] ?? -1,
    destroy() {
      e.remove(feed);
      link.destroy();
    },
  };
}
export type Lockstep = ReturnType<typeof lockstep>;

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
