// Dune Hop's tracks: four tabletop courses of rising size and complexity, and the builder that turns
// one into terrain. A track is data: a closed centre line from a few control points (a Catmull-Rom
// loop, resampled to even steps), optional shortcut branches that leave the loop and rejoin it, an
// elevation profile along the line, and features placed by how far round the lap they sit (0..1):
// kickers, gap jumps (a kicker and a landing ramp with a hole between), whoops, banked turns (the bank
// rises on the outside of the bend, found from the curve) and boost pads. The dunes come from a seed
// on @fzlt/core/terrain; the track is carved in on its own smoothed profile and painted as a kind.
// Pure and deterministic: + − × ÷ and square roots only (./math.ts), the same course bit for bit on
// every build and in every browser (online races later).
import { terrain, type Terrain } from "@fzlt/core/terrain";
import { hypot } from "@fzlt/core/steer";

export const TRACK_W = 3.6, STEP = 0.5, EDGE = 2.2, KIND_TRACK = 1, KIND_SAND = 0;
const R = TRACK_W / 2 + EDGE;

/** [u along the lap 0..1, height, half-width in world units]. */
type Elev = [number, number, number];
/** [u, height, run-up length]. */
type Kick = [number, number, number];
/** [u, height, run-up length, gap length]. */
type Gap = [number, number, number, number];
/** [u0, u1, count, height]. */
type Whoop = [number, number, number, number];
/** [u0, u1, height]. */
type Berm = [number, number, number];

export interface BranchDef {
  /** Where it leaves and rejoins the loop (u on the main line; from < to, never across the start). */
  from: number;
  to: number;
  /** Control points between the two joins [x, z, …]. */
  via: number[];
  label: string;
  kickers?: Kick[];
  gaps?: Gap[];
  whoops?: Whoop[];
  boosts?: number[];
  elev?: Elev[];
}

export interface TrackDef {
  id: string;
  name: string;
  /** One line for the track card. */
  blurb: string;
  /** 1 (easiest) to 4. */
  tier: number;
  laps: number;
  cols: number;
  rows: number;
  cell: number;
  seed: number;
  dunes: { amp: number; scale: number; ridge: number; wind: [number, number]; stretch: number };
  /** The loop's control points [x, z, …] (closed). */
  pts: number[];
  /** Gates as u on the loop (gate 0 at 0: the start and the finish); never inside a branch's span. */
  gates: number[];
  elev?: Elev[];
  kickers?: Kick[];
  gaps?: Gap[];
  whoops?: Whoop[];
  berms?: Berm[];
  boosts?: number[];
  branches?: BranchDef[];
  /** Always night: the city's edge with its neon (whatever the page's theme). */
  city?: boolean;
}

export const TRACKS: TrackDef[] = [
  {
    id: "sunset-loop", name: "Sunset Loop", tier: 1, laps: 3, cols: 84, rows: 58, cell: 0.4, seed: 20261109,
    blurb: "The first loop: two kickers, a set of whoops and one banked turn. Learn to land.",
    dunes: { amp: 2.6, scale: 7.5, ridge: 0.78, wind: [1, 0.35], stretch: 2.6 },
    pts: [12.2, 0, 11.4, -5, 7, -6.6, 0, -5.8, -7, -6.6, -11.4, -5, -12.2, 0, -11.4, 5, -7, 6.6, 0, 7.4, 7, 6.6, 11.4, 5],
    gates: [0, 0.16, 0.33, 0.5, 0.66, 0.83],
    kickers: [[0.15, 0.95, 1.5], [0.64, 1.0, 1.5]],
    whoops: [[0.78, 0.86, 4, 0.2]],
    berms: [[0.42, 0.56, 0.6]],
    boosts: [0.06],
  },
  {
    id: "ridge-run", name: "Ridge Run", tier: 2, laps: 3, cols: 108, rows: 76, cell: 0.45, seed: 7340211,
    blurb: "Up over the ridge and off the crest, a chicane, a banked hairpin and a big kicker.",
    dunes: { amp: 3.0, scale: 8, ridge: 0.82, wind: [1, -0.4], stretch: 2.8 },
    pts: [-17, -10, -6, -10.8, 6, -10, 15, -10.6, 19.6, -6.4, 19, -0.6, 13.4, 1.6, 8.4, -1.2, 3.4, 1.6, 6.6, 6.2, 13.8, 6.6, 19.6, 8.4, 18.4, 12.6, 11, 12.6, 1, 11.4, -7, 7, -12.4, 10.8, -18.6, 9.6, -20, 3, -19.8, -5],
    gates: [0, 0.12, 0.25, 0.37, 0.5, 0.62, 0.75, 0.88],
    elev: [[0.11, 1.6, 5.5], [0.82, 1.1, 5]],
    kickers: [[0.66, 1.25, 1.8]],
    whoops: [[0.9, 0.97, 5, 0.22]],
    berms: [[0.17, 0.25, 0.75], [0.53, 0.6, 0.7], [0.74, 0.8, 0.6]],
    boosts: [0.3, 0.47],
  },
  {
    id: "split-canyon", name: "Split Canyon", tier: 3, laps: 3, cols: 124, rows: 80, cell: 0.45, seed: 9917023,
    blurb: "The road splits: the long way round, or the shortcut over the canyon gap. Choose every lap.",
    dunes: { amp: 3.4, scale: 9, ridge: 0.85, wind: [0.6, 1], stretch: 3 },
    pts: [-21, -11, -9, -13, 3, -12, 13, -13.4, 21.6, -10, 23, -2, 21, 6, 22.4, 12, 15, 13.6, 7, 10.4, 0, 13, -8, 13.6, -15, 11, -22, 12.4, -23.6, 5, -21.4, -2, -23.4, -7],
    gates: [0, 0.08, 0.16, 0.64, 0.74, 0.86],
    elev: [[0.25, 1.2, 6], [0.45, 1.6, 7]],
    kickers: [[0.08, 1.05, 1.6], [0.78, 1.1, 1.6]],
    gaps: [[0.47, 1.15, 1.8, 2.6]],
    whoops: [[0.68, 0.72, 4, 0.24], [0.9, 0.95, 4, 0.2]],
    berms: [[0.3, 0.36, 0.75], [0.53, 0.58, 0.7]],
    boosts: [0.03, 0.27, 0.41, 0.57],
    branches: [
      {
        from: 0.2, to: 0.6, label: "SHORTCUT", via: [11.5, -8.6, 11.4, -2.6, 7.6, 3.4],
        whoops: [[0.12, 0.26, 4, 0.26]],
        gaps: [[0.44, 1.2, 1.8, 3.2]],
      },
    ],
  },
  {
    id: "neon-edge", name: "Neon Edge", tier: 4, laps: 3, cols: 134, rows: 88, cell: 0.45, seed: 55102077, city: true,
    blurb: "Night at the city's edge: neon towers, two chicanes, banked sweepers, a jump over the rooftop gap.",
    dunes: { amp: 3.2, scale: 8.5, ridge: 0.86, wind: [1, 0.2], stretch: 3 },
    pts: [-22, -14, -10, -15.4, 0, -13.4, 5, -15.6, 11, -13.2, 20, -14.8, 25.4, -10, 24.6, -2.4, 19.4, 0.4, 15, -3.8, 10.6, -0.8, 13.4, 4.4, 20.4, 6.4, 25, 11, 21.6, 15.4, 12, 14.6, 4, 15.6, -3, 12.4, -6.6, 6, -11, 9.4, -16.4, 15, -23.2, 14, -25.6, 6.4, -23.8, -1, -25.6, -8],
    gates: [0, 0.08, 0.16, 0.24, 0.3, 0.54, 0.62, 0.7, 0.78, 0.86, 0.93],
    elev: [[0.6, 1.5, 6], [0.92, 1.0, 5]],
    kickers: [[0.11, 1.05, 1.6], [0.665, 1.2, 1.7], [0.84, 1.1, 1.6]],
    gaps: [[0.2, 1.25, 1.8, 3]],
    whoops: [[0.3, 0.34, 4, 0.22], [0.76, 0.8, 4, 0.22]],
    berms: [[0.09, 0.14, 0.7], [0.27, 0.31, 0.75], [0.44, 0.5, 0.8], [0.68, 0.72, 0.7], [0.94, 0.99, 0.65]],
    boosts: [0.02, 0.24, 0.52, 0.88],
    branches: [
      {
        from: 0.36, to: 0.5, label: "SHORTCUT", via: [20.2, 2.6],
        kickers: [[0.25, 1.15, 1.6]],
      },
    ],
  },
];
export const trackById = (id: string) => TRACKS.find((t) => t.id === id) ?? TRACKS[0]!;

/** A path: points, unit tangents, arc length, the carved height and the AI's top speed per point. */
export interface Path {
  n: number;
  closed: boolean;
  /** [x, z] per point. */
  P: Float64Array;
  /** Unit tangent [tx, tz] per point. */
  T: Float64Array;
  /** Arc length at each point. */
  S: Float64Array;
  len: number;
  /** Carved height per point. */
  H: Float64Array;
  /** Top speed the AI takes here (curvature, braking ahead). */
  V: Float64Array;
  /** Branches only: the loop's point it leaves at and rejoins at. */
  from: number;
  to: number;
  label: string;
}

/** Catmull-Rom through control points (closed, or open with end tangents), resampled to STEP. */
function spline(cp: ArrayLike<number>, closed: boolean, pre?: number[], post?: number[]) {
  const m = cp.length / 2, raw: number[] = [], SUB = 48;
  const at = (i: number, k: 0 | 1) => {
    if (closed) return cp[(((i % m) + m) % m) * 2 + k]!;
    if (i < 0) return pre![k]!;
    if (i >= m) return post![k]!;
    return cp[i * 2 + k]!;
  };
  const segs = closed ? m : m - 1;
  for (let i = 0; i < segs; i++)
    for (let s = 0; s < SUB; s++) {
      const t = s / SUB, t2 = t * t, t3 = t2 * t;
      for (const k of [0, 1] as const) {
        const p0 = at(i - 1, k), p1 = at(i, k), p2 = at(i + 1, k), p3 = at(i + 2, k);
        raw.push(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
      }
    }
  if (!closed) raw.push(cp[(m - 1) * 2]!, cp[(m - 1) * 2 + 1]!);
  // Resample by arc length.
  const q = raw.length / 2, L = new Float64Array(q + 1);
  const nxt = (i: number) => (closed ? (i + 1) % q : Math.min(q - 1, i + 1));
  for (let i = 0; i < (closed ? q : q - 1); i++) L[i + 1] = L[i]! + hypot(raw[nxt(i) * 2]! - raw[i * 2]!, raw[nxt(i) * 2 + 1]! - raw[i * 2 + 1]!);
  const total = L[closed ? q : q - 1]!, n = Math.max(4, Math.round(total / STEP)) + (closed ? 0 : 1), out = new Float64Array(n * 2);
  for (let k = 0, i = 0; k < n; k++) {
    const want = closed ? (k / n) * total : (k / (n - 1)) * total;
    while (i < q - 1 && L[i + 1]! < want) i++;
    const u = (want - L[i]!) / (L[i + 1]! - L[i]! || 1), j = nxt(i);
    out[k * 2] = raw[i * 2]! + (raw[j * 2]! - raw[i * 2]!) * u;
    out[k * 2 + 1] = raw[i * 2 + 1]! + (raw[j * 2 + 1]! - raw[i * 2 + 1]!) * u;
  }
  return out;
}

function makePath(P: Float64Array, closed: boolean): Path {
  const n = P.length / 2, T = new Float64Array(n * 2), S = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = closed ? (i - 1 + n) % n : Math.max(0, i - 1), b = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    const dx = P[b * 2]! - P[a * 2]!, dz = P[b * 2 + 1]! - P[a * 2 + 1]!, l = hypot(dx, dz) || 1;
    T[i * 2] = dx / l;
    T[i * 2 + 1] = dz / l;
    if (i) S[i] = S[i - 1]! + hypot(P[i * 2]! - P[i * 2 - 2]!, P[i * 2 + 1]! - P[i * 2 - 1]!);
  }
  const len = closed ? S[n - 1]! + hypot(P[0]! - P[(n - 1) * 2]!, P[1]! - P[(n - 1) * 2 + 1]!) : S[n - 1]!;
  return { n, closed, P, T, S, len, H: new Float64Array(n), V: new Float64Array(n), from: -1, to: -1, label: "" };
}

/** The built course: terrain, paths (0 the loop, then branches), gates, pads, and the nearest-segment query. */
export function buildTrack(def: TrackDef) {
  const t: Terrain = terrain({ cols: def.cols, rows: def.rows, cell: def.cell });
  const HX = (def.cols * def.cell) / 2, HZ = (def.rows * def.cell) / 2;
  const d = def.dunes;
  t.noise({ seed: def.seed, amp: d.amp, scale: d.scale, octaves: 3, ridge: d.ridge, wind: d.wind, stretch: d.stretch });
  // Down to the plinth at the edges (the course is a slab of sand on a table).
  t.shape((x, z, h) => {
    const ex = Math.min(1, (HX - Math.abs(x)) / 2.4), ez = Math.min(1, (HZ - Math.abs(z)) / 2.4), e = Math.max(0, Math.min(ex, ez));
    return h * e * e * (3 - 2 * e);
  });

  // ---- the paths ----
  const main = makePath(spline(def.pts, true), true);
  const paths: Path[] = [main];
  const iAt = (p: Path, u: number) => {
    const want = (((u % 1) + 1) % 1) * p.len;
    let best = 0;
    for (let i = 0; i < p.n; i++) if (Math.abs(p.S[i]! - want) < Math.abs(p.S[best]! - want)) best = i;
    return best;
  };
  for (const b of def.branches ?? []) {
    const f = iAt(main, b.from), g = iAt(main, b.to), m = main.P;
    const f0 = (f - 3 + main.n) % main.n, g1 = (g + 3) % main.n;
    const cp = [m[f * 2]!, m[f * 2 + 1]!, ...b.via, m[g * 2]!, m[g * 2 + 1]!];
    const p = makePath(spline(cp, false, [m[f0 * 2]!, m[f0 * 2 + 1]!], [m[g1 * 2]!, m[g1 * 2 + 1]!]), false);
    p.from = f;
    p.to = g;
    p.label = b.label;
    paths.push(p);
  }

  // ---- heights along each path: the dunes under it smoothed and lowered, plus the elevation ----
  const bump = (s: number, at: number, w: number, len: number, closed: boolean) => {
    let dd = s - at;
    if (closed) dd -= len * Math.floor(dd / len + 0.5);
    const q = dd / w;
    return q > -1 && q < 1 ? (1 - q * q) * (1 - q * q) : 0;
  };
  for (let pi = 0; pi < paths.length; pi++) {
    const p = paths[pi]!, raw = new Float64Array(p.n);
    for (let i = 0; i < p.n; i++) raw[i] = t.height(p.P[i * 2]!, p.P[i * 2 + 1]!);
    const elev = pi === 0 ? def.elev ?? [] : def.branches![pi - 1]!.elev ?? [];
    for (let i = 0; i < p.n; i++) {
      let m = 0, c = 0;
      for (let k = -12; k <= 12; k++) {
        const j = p.closed ? (((i + k) % p.n) + p.n) % p.n : i + k;
        if (j < 0 || j >= p.n) continue;
        (m += raw[j]!), c++;
      }
      let y = 0.25 + (m / c) * 0.45;
      for (const [u, h, w] of elev) y += h * bump(p.S[i]!, u * p.len, w, p.len, p.closed);
      p.H[i] = y;
    }
    if (pi) {
      // Pin a branch's ends to the loop's heights where it joins (a linear correction along it).
      const d0 = main.H[p.from]! - p.H[0]!, d1 = main.H[p.to]! - p.H[p.n - 1]!;
      for (let i = 0; i < p.n; i++) p.H[i] = p.H[i]! + d0 + (d1 - d0) * (p.S[i]! / (p.len || 1));
    }
  }

  // ---- the segment grid: every path segment bucketed by the cells its reach (R) touches ----
  const G = 4, GX = Math.ceil((HX * 2) / G) + 1, GZ = Math.ceil((HZ * 2) / G) + 1;
  const segs: number[] = []; // path, index
  for (let pi = 0; pi < paths.length; pi++) {
    const p = paths[pi]!;
    for (let i = 0; i < (p.closed ? p.n : p.n - 1); i++) segs.push(pi, i);
  }
  const NS = segs.length / 2, SEG = Int32Array.from(segs), cnt = new Int32Array(GX * GZ + 1);
  const cellsOf = (s: number, fn: (c: number) => void) => {
    const p = paths[SEG[s * 2]!]!, i = SEG[s * 2 + 1]!, j = (i + 1) % p.n;
    const x0 = Math.min(p.P[i * 2]!, p.P[j * 2]!) - R, x1 = Math.max(p.P[i * 2]!, p.P[j * 2]!) + R;
    const z0 = Math.min(p.P[i * 2 + 1]!, p.P[j * 2 + 1]!) - R, z1 = Math.max(p.P[i * 2 + 1]!, p.P[j * 2 + 1]!) + R;
    for (let gz = Math.max(0, Math.floor((z0 + HZ) / G)); gz <= Math.min(GZ - 1, Math.floor((z1 + HZ) / G)); gz++)
      for (let gx = Math.max(0, Math.floor((x0 + HX) / G)); gx <= Math.min(GX - 1, Math.floor((x1 + HX) / G)); gx++) fn(gz * GX + gx);
  };
  for (let s = 0; s < NS; s++) cellsOf(s, (c) => cnt[c + 1]!++);
  for (let c = 0; c < GX * GZ; c++) cnt[c + 1]! += cnt[c]!;
  const fill = cnt.slice(0, GX * GZ), LIST = new Int32Array(cnt[GX * GZ]!);
  for (let s = 0; s < NS; s++) cellsOf(s, (c) => (LIST[fill[c]!++] = s));

  /** NR = [distance, path, index, t along the segment, side (+1 right of travel)]; within R, else distance Infinity.
   *  `nearQ()` reads the point from NQ = [x, z]: the race calls it every step, and doubles passed to a
   *  call that isn't inlined are boxed (an allocation); `near(x, z)` is the friendly form. */
  const NR = new Float64Array(5), NQ = new Float64Array(2);
  function near(x: number, z: number) {
    NQ[0] = x;
    NQ[1] = z;
    return nearQ();
  }
  function nearQ() {
    const x = NQ[0]!, z = NQ[1]!;
    NR[0] = Infinity;
    const gx = Math.floor((x + HX) / G), gz = Math.floor((z + HZ) / G);
    if (gx < 0 || gz < 0 || gx >= GX || gz >= GZ) return NR;
    const c = gz * GX + gx;
    for (let k = cnt[c]!; k < cnt[c + 1]!; k++) {
      const s = LIST[k]!, p = paths[SEG[s * 2]!]!, i = SEG[s * 2 + 1]!, j = (i + 1) % p.n;
      const ax = p.P[i * 2]!, az = p.P[i * 2 + 1]!, dx = p.P[j * 2]! - ax, dz = p.P[j * 2 + 1]! - az, l2 = dx * dx + dz * dz || 1;
      const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2)), px = x - ax - dx * u, pz = z - az - dz * u, dd = hypot(px, pz);
      // A tie between a branch and the loop (at a join) goes to the loop.
      if (dd < NR[0]! - 1e-9) (NR[0] = dd), (NR[1] = SEG[s * 2]!), (NR[2] = i), (NR[3] = u), (NR[4] = dx * pz - dz * px >= 0 ? 1 : -1);
    }
    return NR;
  }
  const heightAt = (pi: number, i: number, u: number) => {
    const p = paths[pi]!, j = (i + 1) % p.n;
    return p.H[i]! + (p.H[j]! - p.H[i]!) * u;
  };

  // ---- carve: the track's profile, blended into the sand either side ----
  const half = TRACK_W / 2;
  t.shape((x, z, h) => {
    near(x, z);
    const dd = NR[0]!;
    if (dd >= half + EDGE) return h;
    const y = heightAt(NR[1]!, NR[2]!, NR[3]!), u = dd <= half ? 0 : (dd - half) / EDGE, w = 1 - u * u * (3 - 2 * u);
    return h + (y - h) * w;
  });

  // ---- features ----
  const pts = (p: Path, i: number) => [p.P[(((i % p.n) + p.n) % p.n) * 2]!, p.P[(((i % p.n) + p.n) % p.n) * 2 + 1]!];
  const idx = (p: Path, u: number) => (p.closed ? iAt(p, u) : Math.round(u * (p.n - 1)));
  const span = (len: number) => Math.max(2, Math.round(len / STEP));
  /** Kickers and gaps as [path, start index, end index, height] (the scene paints their lips). */
  const ramps: number[] = [];
  const kick = (p: Path, pi: number, [u, h, len]: Kick) => {
    const i = idx(p, u), k = span(len);
    t.ramp(pts(p, i), pts(p, i + k), { width: TRACK_W - 0.4, height: h, back: 0.6, edge: 0.6 });
    ramps.push(pi, i, i + k, h);
  };
  const gap = (p: Path, pi: number, [u, h, len, g]: Gap) => {
    const i = idx(p, u), k = span(len), m = span(g), e = i + k + m;
    t.ramp(pts(p, i), pts(p, i + k), { width: TRACK_W - 0.4, height: h, back: 0.3, edge: 0.6 });
    // The hole between: dug down; then the landing, a long ramp falling away from the gap.
    t.ramp(pts(p, i + k + 1), pts(p, e - 1), { width: TRACK_W + 0.6, height: -0.9, back: 0.4, edge: 0.8 });
    t.ramp(pts(p, e + span(3.6)), pts(p, e), { width: TRACK_W - 0.4, height: h * 0.82, back: 0.5, edge: 0.6 });
    ramps.push(pi, i, i + k, h);
  };
  const whoop = (p: Path, [u0, u1, n, h]: Whoop) => t.whoops(pts(p, idx(p, u0)), pts(p, idx(p, u1)), { width: TRACK_W, height: h, count: n, edge: 0.8 });
  const featuresOf = (p: Path, pi: number, f: { kickers?: Kick[]; gaps?: Gap[]; whoops?: Whoop[] }) => {
    for (const k of f.kickers ?? []) kick(p, pi, k);
    for (const g of f.gaps ?? []) gap(p, pi, g);
    for (const w of f.whoops ?? []) whoop(p, w);
  };
  featuresOf(main, 0, def);
  (def.branches ?? []).forEach((b, k) => featuresOf(paths[k + 1]!, k + 1, b));
  // Banked turns: the bank rises on the outside of the bend (found from the turn over the span), faded
  // in and out along it and blended into the sand past the shoulder (no lump at either end).
  for (const [u0, u1, h] of def.berms ?? []) {
    const a = idx(main, u0), n = ((idx(main, u1) - a + main.n) % main.n) + 1, b = (a + n - 1) % main.n;
    const turn = main.T[a * 2]! * main.T[b * 2 + 1]! - main.T[a * 2 + 1]! * main.T[b * 2]! > 0 ? 1 : -1, fade = Math.min(8, n / 3), wide = half + 0.6;
    t.shape((x, z, y) => {
      near(x, z);
      if (NR[1] !== 0 || NR[0]! >= wide + 1.4) return y;
      const k = (NR[2]! - a + main.n) % main.n;
      if (k >= n) return y;
      const along = Math.min(1, k / fade, (n - 1 - k) / fade), lat = (-turn * NR[4]! * NR[0]!) / wide;
      const q = Math.max(0, Math.min(1, (1 + lat) / 2)), e = NR[0]! <= wide ? 1 : 1 - (NR[0]! - wide) / 1.4;
      return y + h * q * q * along * along * (3 - 2 * along) * e * e * (3 - 2 * e);
    });
  }

  // ---- boost pads: [path, index] ----
  const pads: number[] = [];
  for (const u of def.boosts ?? []) pads.push(0, idx(main, u));
  (def.branches ?? []).forEach((b, k) => b.boosts?.forEach((u) => pads.push(k + 1, idx(paths[k + 1]!, u))));
  const PADS = Int32Array.from(pads), PAD_LEN = 2;
  /** The pad under NQ = [x, z], or −1. */
  function padQ() {
    const x = NQ[0]!, z = NQ[1]!;
    for (let k = 0; k < PADS.length; k += 2) {
      const p = paths[PADS[k]!]!, i = PADS[k + 1]!, dx = x - p.P[i * 2]!, dz = z - p.P[i * 2 + 1]!;
      const along = dx * p.T[i * 2]! + dz * p.T[i * 2 + 1]!, across = -dx * p.T[i * 2 + 1]! + dz * p.T[i * 2]!;
      if (along > -PAD_LEN / 2 && along < PAD_LEN / 2 && across > -1.2 && across < 1.2) return k >> 1;
    }
    return -1;
  }

  // ---- paint the faces: track, boost pads ----
  for (let j = 0; j < def.rows; j++)
    for (let i = 0; i < def.cols * 2; i++) {
      const x = t.x0 + ((i >> 1) + (i & 1 ? 1 : 2) / 3) * def.cell, z = t.z0 + (j + (i & 1 ? 2 : 1) / 3) * def.cell;
      t.kind[j * def.cols * 2 + i] = (near(x, z), NR[0]! <= half) ? KIND_TRACK : KIND_SAND;
    }

  // ---- the AI's top speed per point: the curve (sideways grip), then braking room before each bend ----
  for (const p of paths) {
    for (let i = 0; i < p.n; i++) {
      const a = p.closed ? (i - 4 + p.n) % p.n : Math.max(0, i - 4), b = p.closed ? (i + 4) % p.n : Math.min(p.n - 1, i + 4);
      const c = Math.abs(p.T[a * 2]! * p.T[b * 2 + 1]! - p.T[a * 2 + 1]! * p.T[b * 2]!), k = c / (8 * STEP) + 1e-6;
      p.V[i] = Math.max(4.6, Math.min(12.4, Math.sqrt(9 / k)));
      // Over a crest, slow enough to stay on the ground (the drop past it is no jump to land).
      if (i >= 4 && i < p.n - 4 || p.closed) {
        const hb = p.H[p.closed ? (i - 4 + p.n) % p.n : i - 4]!, ha = p.H[p.closed ? (i + 4) % p.n : i + 4]!, curve = -(hb - 2 * p.H[i]! + ha) / 4;
        if (curve > 0.01) p.V[i] = Math.min(p.V[i]!, Math.max(7.5, Math.sqrt(19 / curve)));
      }
    }
    for (let pass = 0; pass < 2; pass++)
      for (let k = p.n - 1; k >= 0; k--) {
        const j = p.closed ? (k + 1) % p.n : Math.min(p.n - 1, k + 1);
        p.V[k] = Math.min(p.V[k]!, Math.sqrt(p.V[j]! * p.V[j]! + 2 * 13 * STEP));
      }
  }
  // Kickers and gaps: a steady run-up, so the landing is clean.
  for (let k = 0; k < ramps.length; k += 4) {
    const p = paths[ramps[k]!]!;
    for (let i = ramps[k + 1]! - 6; i <= ramps[k + 2]!; i++) {
      const j = p.closed ? ((i % p.n) + p.n) % p.n : Math.max(0, Math.min(p.n - 1, i));
      p.V[j] = Math.min(p.V[j]!, 10.6 + ramps[k + 3]! * 0.6);
    }
  }

  // ---- gates on the loop ----
  const GATE = Int32Array.from(def.gates.map((u) => iAt(main, u)));

  return { def, t, HX, HZ, paths, main, near, nearQ, NQ, NR, heightAt, GATE, PADS, PAD_LEN, padQ, ramps: Int32Array.from(ramps) };
}
export type Track = ReturnType<typeof buildTrack>;

/** The loop's progress (arc length 0..len) of a point on any path (a branch maps onto the span it
 *  skips), written to out[k] (not returned: a returned double that isn't inlined allocates). */
export function progressOf(tr: Track, pi: number, i: number, u: number, out: Float64Array, k: number) {
  const p = tr.paths[pi]!, j = (i + 1) % p.n, s = p.S[i]! + (p.closed && j === 0 ? p.len - p.S[i]! : p.S[j]! - p.S[i]!) * u;
  if (!pi) return void (out[k] = s);
  const m = tr.main, a = m.S[p.from]!, b = m.S[p.to]!;
  out[k] = a + (b - a) * (s / (p.len || 1));
}
