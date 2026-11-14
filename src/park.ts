// Dune Hop's Freestyle park: four large tables side by side (two by two) over a dark gap, each its own
// look and features, linked by launch ramps: a kicker on each side of every gap, facing the other,
// so a car off one lands on the other's slope (and the other way round). The ring round the park is
// 0 → 1 → 3 → 2 → 0 (each table's out-ramp is one of its two links); every table spawns its car at its
// centre, facing the out-ramp, a boost pad on the way. One heightfield (@fzlt/core/terrain): the
// tables, their rims (soft berms on every edge but the ramp corridors), the gap dug down between them,
// then the features stamped on and the faces painted by table. Pure and deterministic like the tracks.
import { terrain, type Terrain } from "@fzlt/core/terrain";
import { atan2 } from "./math.ts";

/** Painted kinds: 0 sand, 1 ramp, 2 salt, 3 concrete, 4 the yard's plates, 5 the gap, 6 ledges. */
export const K_SAND = 0, K_RAMP = 1, K_SALT = 2, K_CONC = 3, K_YARD = 4, K_GAP = 5, K_LEDGE = 6;
/** A table's half size, the gap between tables, the cell, the table's top, the gap's floor. */
// Every edge sits on a grid line (the tables, the gap: whole cells), so each table's side is a clean
// straight drop, never a saw of half-painted triangles.
export const TX = 22.8, TZ = 19.2, GAP = 4.8, CELL = 0.6, TOP = 0.3, FLOOR = -2.2;
const RIM_W = 2.6, RIM_H = 1.25, LIP_H = 2.1, RUN = 6.4, CORR = 5;
/** Centres of the tables: x, z. */
const CX = TX + GAP / 2, CZ = TZ + GAP / 2;
export const HX = CX + TX + CELL, HZ = CZ + TZ + CELL;

export interface Table {
  name: string;
  /** One line for the menu. */
  blurb: string;
  kind: number;
  cx: number;
  cz: number;
  /** Where its car comes in (after a crash): x, z, yaw (facing the out-ramp). */
  spawn: [number, number, number];
  /** The out-ramp: its run-up start and lip [x0, z0, x1, z1], and the table it lands on. */
  out: [number, number, number, number];
  to: number;
}

/** The ring: each table's out-ramp side (unit direction from its centre) and the table it lands on. */
const RING: [number, number, number][] = [[1, 0, 1], [0, 1, 3], [0, -1, 0], [-1, 0, 2]];
const LOOKS: [string, string, number][] = [
  ["SALT FLATS", "Flat white salt: a kicker line, a tabletop, whoops and a drift ring.", K_SALT],
  ["THE BOWL", "Poured concrete: a deep bowl, a spine and a hip to launch off.", K_CONC],
  ["DUNE SEA", "Ridged dunes rolling to the rim and a banked U-turn.", K_SAND],
  ["NEON YARD", "Plates and ledges: a long rail, stair ledges and a funbox.", K_YARD],
];

export function buildPark(seed = 20261114) {
  const cols = Math.round((HX * 2) / CELL), rows = Math.round((HZ * 2) / CELL);
  const t: Terrain = terrain({ cols, rows, cell: CELL });
  const tables: Table[] = LOOKS.map(([name, blurb, kind], i) => {
    const cx = i & 1 ? CX : -CX, cz = i & 2 ? CZ : -CZ, [dx, dz, to] = RING[i]!, h = dx ? TX : TZ;
    const lx = cx + dx * (h - 0.3), lz = cz + dz * (h - 0.3);
    return { name, blurb, kind, cx, cz, spawn: [cx, cz, atan2(-dz, dx)], out: [lx - dx * RUN, lz - dz * RUN, lx, lz], to };
  });
  /** The table under (x, z) (with `pad` of slack), or −1 (the gap, or off the park). */
  const tableAt = (x: number, z: number, pad = 0) => {
    const i = (x > 0 ? 1 : 0) | (z > 0 ? 2 : 0), tb = tables[i]!;
    return Math.abs(x - tb.cx) < TX + pad && Math.abs(z - tb.cz) < TZ + pad ? i : -1;
  };
  // Every link lip: the middle of each table's two inner edges (the gap sides), and its inward direction.
  const links: number[] = [];
  for (const tb of tables) {
    const sx = tb.cx > 0 ? -1 : 1, sz = tb.cz > 0 ? -1 : 1;
    links.push(tb.cx + sx * (TX - 0.3), tb.cz, -sx, 0, tb.cx, tb.cz + sz * (TZ - 0.3), 0, -sz);
  }
  /** In a ramp corridor (no rim there): near a link lip. */
  const corridor = (x: number, z: number) => {
    for (let k = 0; k < links.length; k += 4) {
      const dx = x - links[k]!, dz = z - links[k + 1]!, ix = links[k + 2]!, iz = links[k + 3]!;
      const into = dx * ix + dz * iz, across = -dx * iz + dz * ix;
      if (into > -1 && into < RIM_W + 1 && across > -CORR && across < CORR) return true;
    }
    return false;
  };
  const sm = (e: number) => (e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e));

  // ---- the dunes (only the Dune Sea keeps them at full height), the tables, rims and the gap ----
  t.noise({ seed, amp: 2.4, scale: 9, octaves: 3, ridge: 0.84, wind: [1, 0.4], stretch: 2.8 });
  t.shape((x, z, h) => {
    // A vertex on a table's edge belongs to the table: the drop is the gap's first cell.
    const i = tableAt(x, z, 0.01);
    if (i < 0) return FLOOR;
    const tb = tables[i]!, u = x - tb.cx, w = z - tb.cz, d = Math.min(TX - Math.abs(u), TZ - Math.abs(w));
    // The lanes through the centre (where the ramps line up) stay flat; the quadrants get the dunes.
    const lane = sm((Math.min(Math.abs(u), Math.abs(w)) - 4) / 4), inner = sm((d - RIM_W) / 3);
    let y = TOP + (i === 2 ? h * lane * inner : h * 0.06);
    if (d < RIM_W && !corridor(x, z)) {
      const r = 1 - d / RIM_W;
      y += RIM_H * sm(r * 1.6) * (d < 0.4 ? d / 0.4 : 1);
    }
    return y;
  });

  // ---- features (table-local helpers) ----
  const at = (i: number, u: number, w: number) => [tables[i]!.cx + u, tables[i]!.cz + w];
  /** Jump lips for the scene: [x0, z0, x1, z1] across each kicker's top. */
  const lips: number[] = [];
  const kick = (i: number, u0: number, w0: number, u1: number, w1: number, h: number, width: number, back = 0.6) => {
    const a = at(i, u0, w0), b = at(i, u1, w1);
    t.ramp(a, b, { width, height: h, back, edge: 0.6 });
    const dx = b[0]! - a[0]!, dz = b[1]! - a[1]!, l = Math.sqrt(dx * dx + dz * dz) || 1, nx = (-dz / l) * (width / 2 - 0.2), nz = (dx / l) * (width / 2 - 0.2);
    lips.push(b[0]! - nx, b[1]! - nz, b[0]! + nx, b[1]! + nz);
  };
  /** A box raised `h` (a ledge, a rail, a funbox top) with a one-cell soft edge; painted later. */
  const boxes: number[] = [];
  const box = (i: number, u: number, w: number, hu: number, hw: number, h: number) => {
    const [x, z] = at(i, u, w);
    boxes.push(x!, z!, hu, hw, h);
    t.shape((px, pz, y) => {
      const ex = hu + CELL - Math.abs(px - x!), ez = hw + CELL - Math.abs(pz - z!);
      return ex > 0 && ez > 0 ? y + h * Math.min(1, ex / CELL, ez / CELL) : y;
    });
  };
  // The links: a kicker on every gap edge rising to its lip (both directions use the same pair).
  for (let k = 0; k < links.length; k += 4) {
    const i = tableAt(links[k]!, links[k + 1]!), u = links[k]! - tables[i]!.cx, w = links[k + 1]! - tables[i]!.cz, ix = links[k + 2]!, iz = links[k + 3]!;
    kick(i, u + ix * RUN, w + iz * RUN, u, w, LIP_H, CORR + 1, 0.5);
  }
  // 0 SALT FLATS: a kicker line, a tabletop, whoops, a drift ring (painted).
  kick(0, -19, -12, -16.5, -12, 0.8, 4.4);
  kick(0, -14, -12, -11.5, -12, 1.05, 4.4);
  kick(0, -9, -12, -6.4, -12, 1.35, 4.4);
  kick(0, -18, 11, -14.5, 11, 1.2, 5, 0.01);
  box(0, -11, 11, 3.4, 2.5, 1.2);
  t.ramp(at(0, -4.5, 11), at(0, -7.6, 11), { width: 5, height: 1.2, back: 0.01, edge: 0.6 });
  t.whoops(at(0, 7, -15), at(0, 19, -15), { width: 4.2, height: 0.28, count: 6, edge: 0.6 });
  // 1 THE BOWL: a deep bowl, a spine (two ramps back to back) and a hip in the corner.
  {
    const [bx, bz] = at(1, 12, -10);
    t.shape((x, z, y) => {
      const d = Math.sqrt((x - bx!) * (x - bx!) + (z - bz!) * (z - bz!)), R = 7.2;
      if (d >= R + 1.6) return y;
      if (d >= R) return y + 0.45 * sm((R + 1.6 - d) / 1.6);
      const q = d / R;
      return y - 2.1 * (1 - q * q * q) + 0.45;
    });
  }
  kick(1, -16, 9, -12, 9, 1.4, 6, 4);
  kick(1, 13, 13, 16.5, 9.5, 1.5, 5, 0.6);
  kick(1, -16, -12, -13, -14.5, 1.1, 5, 0.6);
  // 2 DUNE SEA: the dunes (above), a banked U-turn and whoops.
  t.berm([...at(2, -17, 6), ...at(2, -12, 15), ...at(2, -6, 6)], { width: 5, height: 1.1, edge: 1, side: -1 });
  t.whoops(at(2, 7, -15), at(2, 19, -15), { width: 4.4, height: 0.32, count: 5, edge: 0.7 });
  kick(2, 8, 10, 11, 10, 1.15, 4.6);
  // 3 NEON YARD: two ledges, a long rail with its kick, stair ledges, a funbox.
  box(3, -13, -11, 6, 0.9, 0.5);
  box(3, -13, -14.5, 6, 0.9, 0.5);
  kick(3, -19.5, 11, -17.5, 11, 0.55, 1.8, 0.01);
  box(3, -10, 11, 7.2, 0.5, 0.55);
  box(3, 9, -13, 2.4, 3.6, 0.3);
  box(3, 13, -13, 1.6, 3.6, 0.6);
  box(3, 16.5, -13, 1.9, 3.6, 0.9);
  box(3, 12, 12, 2.2, 2.2, 1.1);
  for (const [du, dw] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    t.ramp(at(3, 12 + du * 5.4, 12 + dw * 5.4), at(3, 12 + du * 2.4, 12 + dw * 2.4), { width: 4.4, height: 1.1, back: 0.01, edge: 0.5 });

  // ---- boost pads on the lanes: before every out-ramp, and one on each table's way in ----
  /** Pads: [x, z, tx, tz] (centre and the direction it pushes). */
  const pads: number[] = [];
  for (const tb of tables) {
    const dx = (tb.out[2] - tb.out[0]) / RUN, dz = (tb.out[3] - tb.out[1]) / RUN;
    pads.push(tb.out[0] - dx * 4.5, tb.out[1] - dz * 4.5, dx, dz);
  }
  const PAD_LEN = 3.2, PAD_W = 2.3;
  const PADV = Float64Array.from(pads);
  /** The pad under (x, z), or −1. */
  function padAt(x: number, z: number) {
    for (let k = 0; k < PADV.length; k += 4) {
      const dx = x - PADV[k]!, dz = z - PADV[k + 1]!, tx = PADV[k + 2]!, tz = PADV[k + 3]!;
      const along = dx * tx + dz * tz, across = -dx * tz + dz * tx;
      if (along > -PAD_LEN / 2 && along < PAD_LEN / 2 && across > -PAD_W && across < PAD_W) return k >> 2;
    }
    return -1;
  }

  // ---- paint: the gap, each table's kind, the ramps, the ledge tops (the salt's drift ring is drawn) ----
  /** The Salt Flats' drift ring: x, z, radius. */
  const ring = [...at(0, 11, 9), 5.7];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols * 2; i++) {
      const x = t.x0 + ((i >> 1) + (i & 1 ? 1 : 2) / 3) * CELL, z = t.z0 + (j + (i & 1 ? 2 : 1) / 3) * CELL, k = tableAt(x, z);
      let kind = k < 0 ? K_GAP : tables[k]!.kind;
      if (k >= 0) {
        for (let b = 0; b < boxes.length; b += 5) if (Math.abs(x - boxes[b]!) < boxes[b + 2]! && Math.abs(z - boxes[b + 1]!) < boxes[b + 3]!) kind = k === 3 ? K_LEDGE : K_RAMP;
        for (let l = 0; l < links.length; l += 4) {
          const dx = x - links[l]!, dz = z - links[l + 1]!, ix = links[l + 2]!, iz = links[l + 3]!, into = dx * ix + dz * iz, across = -dx * iz + dz * ix;
          if (into > -0.5 && into < RUN + 0.2 && across > -CORR / 2 - 0.4 && across < CORR / 2 + 0.4) kind = K_RAMP;
        }
      }
      t.kind[j * cols * 2 + i] = kind;
    }

  /** Autopilot route per table: [x, z, speed, nitro] to the centre, then down the lane, over the ramp. */
  const route = tables.map((tb) => {
    const dx = (tb.out[2] - tb.out[0]) / RUN, dz = (tb.out[3] - tb.out[1]) / RUN;
    return Float64Array.from([tb.cx, tb.cz, 8, 0, tb.out[0] - dx * 7, tb.out[1] - dz * 7, 15, 1, tb.out[2] + dx * 6, tb.out[3] + dz * 6, 15, 1]);
  });

  return { def: { id: "freestyle", name: "Freestyle", seed, cols, rows, cell: CELL, city: false }, t, HX, HZ, tables, tableAt, PADV, PAD_LEN, PAD_W, padAt, LIPS: Float64Array.from(lips), BOXES: Float64Array.from(boxes), route, ring };
}
export type Park = ReturnType<typeof buildPark>;
