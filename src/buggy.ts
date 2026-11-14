// The buggy, built on @fzlt/core/diorama: a low tub with side pods and a wedge nose, a splitter, a
// cage with a light bar, a rear wing; the driver's helmet; four knobbly wheels on dished hubs.
// Draw order: the diorama sorts a car's parts by layer, then by depth. The body sits on one layer;
// each wheel's parts go on the layer above the body when the wheel is on the camera's side of the
// car (it covers the body) and on the layer below when it is on the far side (the body covers it).
// `wheelLayers` picks the side each draw from the car's rotation and the camera, so the order holds
// at any heading, pitch, roll, drift or steering angle and in every view.
import type { Diorama, DioramaObject } from "@fzlt/core/diorama";

/** The buggy's colours (`#rrggbb`). */
export interface BuggyPaint {
  chassis: string; body: string; acc: string; cage: string; hub: string; helmet: string; visor: string; lamp: string; tail: string; tyre: string;
  /** The hub's dish. */
  cap: string;
}
/** A built buggy: its root group, its tail lights, its four hubs and each hub's parts. */
export interface Buggy {
  root: DioramaObject;
  tails: DioramaObject[];
  hubs: DioramaObject[];
  /** Per wheel, its parts (tyre, dish, axle bar). */
  parts: DioramaObject[][];
}
/** The body's layer (the root is 4; what rests on it, 5); a near wheel draws on NEAR, a far one on FAR. */
export const BODY = 5, NEAR = 6, FAR = 4.5;

/** Add a buggy to `d` as `id`; `wheels` is [x, z] per wheel (front left, front right, rear left, rear right). */
export function buildBuggy(d: Diorama, id: string, c: BuggyPaint, wheels: ArrayLike<number>, tag: unknown): Buggy {
  const root = d.add({ id, shape: "group", size: [2.0, 0, 1.6], tag });
  const part = (size: number[], pos: number[], color: string, op: { shape?: "box" | "wedge" | "cyl"; emissive?: boolean; sides?: number; top?: number; rot?: number[] } = {}) =>
    d.add({ shape: op.shape || "box", size, pos, rot: op.rot, on: id, color, emissive: op.emissive, sides: op.sides, top: op.top, layer: BODY, pick: false });
  part([1.92, 0.14, 0.86], [0, -0.26, 0], c.chassis);
  part([1.04, 0.28, 0.66], [-0.16, -0.12, 0], c.body);
  // Side pods end ahead of the rear wheels and well behind the front ones; the nose and splitter
  // stay narrower than the front wheels' inner faces at full lock (no tyre ever cuts the body).
  for (const z of [-0.42, 0.42]) part([0.98, 0.22, 0.2], [-0.2, -0.12, z], c.body);
  for (const z of [-0.42, 0.42]) part([0.86, 0.06, 0.22], [-0.2, 0.1, z], c.acc);
  part([0.7, 0.24, 0.7], [0.76, -0.12, 0], c.body, { shape: "wedge" });
  part([0.3, 0.05, 0.78], [1.04, -0.28, 0], c.acc);
  // Suspension arms out to each wheel.
  for (const x of [0.8, -0.74]) for (const z of [-0.53, 0.53]) part([0.09, 0.05, x > 0 ? 0.2 : 0.26], [x, -0.27, z], c.cage);
  part([1.6, 0.04, 0.16], [0.02, 0.17, 0], c.acc);
  part([0.44, 0.32, 0.6], [-0.86, -0.08, 0], c.chassis);
  for (const z of [-0.17, 0.17]) part([0.1, 0.28, 0.1], [-1.02, -0.02, z], c.hub, { shape: "cyl", sides: 6 });
  for (const z of [-0.27, 0.27]) part([0.06, 0.32, 0.06], [-0.98, 0.18, z], c.chassis);
  part([0.34, 0.05, 0.94], [-1.02, 0.5, 0], c.acc);
  part([0.3, 0.3, 0.3], [-0.24, 0.16, 0], c.helmet, { shape: "cyl", sides: 8, top: 0.75 });
  part([0.06, 0.1, 0.24], [-0.09, 0.24, 0], c.visor);
  for (const x of [-0.56, 0.14]) for (const z of [-0.36, 0.36]) part([0.06, 0.6, 0.06], [x, 0.16, z], c.cage);
  for (const z of [-0.36, 0.36]) part([0.76, 0.06, 0.06], [-0.21, 0.76, z], c.cage);
  part([0.06, 0.06, 0.78], [-0.56, 0.76, 0], c.cage);
  part([0.06, 0.06, 0.78], [0.14, 0.76, 0], c.cage);
  part([0.12, 0.09, 0.62], [0.16, 0.8, 0], c.lamp, { emissive: true });
  for (const z of [-0.28, 0.28]) part([0.04, 0.07, 0.16], [1.1, -0.1, z], c.lamp, { emissive: true });
  const tails = [part([0.05, 0.08, 0.16], [-1.09, 0.06, -0.24], c.tail, { emissive: true }), part([0.05, 0.08, 0.16], [-1.09, 0.06, 0.24], c.tail, { emissive: true })];
  const hubs: DioramaObject[] = [], parts: DioramaObject[][] = [];
  for (let i = 0; i < 4; i++) {
    const hid = id + "h" + i, side = wheels[i * 2 + 1]! > 0 ? 1 : -1;
    const hub = d.add({ id: hid, shape: "group", size: [0.6, 0, 0.6], pos: [wheels[i * 2]!, 0, wheels[i * 2 + 1]!], on: id, layer: BODY });
    parts.push([
      d.add({ shape: "cyl", sides: 14, size: [0.74, 0.32, 0.74], pos: [0, 0, -0.16], rot: [Math.PI / 2, 0, 0], on: hid, color: c.tyre, layer: NEAR, pick: false }),
      d.add({ shape: "cyl", sides: 8, size: [0.42, 0.05, 0.42], pos: [0, 0, side > 0 ? 0.16 : -0.21], rot: [Math.PI / 2, 0, 0], on: hid, color: c.cap, layer: NEAR, pick: false }),
      d.add({ size: [0.38, 0.06, 0.06], pos: [0, -0.03, side > 0 ? 0.2 : -0.21], on: hid, color: c.chassis, layer: NEAR, pick: false }),
    ]);
    hubs.push(hub);
  }
  return { root, tails, hubs, parts };
}

/** True when the point (lx, lz) across the car (its own frame, at any height) is farther from `d`'s
 *  camera than the car's centre line: the body stands between it and the camera. Uses the root's
 *  `rot` as set this frame (y, then x, then z, as the diorama applies it); allocates nothing. */
export function farSide(d: Diorama, root: DioramaObject, lx: number, lz: number) {
  const r = root.rot, cx = Math.cos(r[0]!), sx = Math.sin(r[0]!), cy = Math.cos(r[1]!), sy = Math.sin(r[1]!), cz = Math.cos(r[2]!), sz = Math.sin(r[2]!);
  // R·(lx, 0, lz) with R = Ry·Rx·Rz.
  const x1 = cz * lx, y1 = sz * lx, y2 = cx * y1 - sx * lz, z2 = sx * y1 + cx * lz, wx = cy * x1 + sy * z2, wz = -sy * x1 + cy * z2;
  const cam = d.cam, cp = Math.cos(cam.pitch);
  // The camera's forward: (−sin yaw · cos pitch, −sin pitch, −cos yaw · cos pitch).
  return -wx * Math.sin(cam.yaw) * cp - y2 * Math.sin(cam.pitch) - wz * Math.cos(cam.yaw) * cp > 0;
}

/** Put each wheel's parts over the body (near side) or under it (far side) for this draw. */
export function wheelLayers(d: Diorama, b: Buggy) {
  for (let i = 0; i < 4; i++) {
    const h = b.hubs[i]!, ps = b.parts[i]!, l = farSide(d, b.root, h.pos[0]!, h.pos[2]!) ? FAR : NEAR;
    for (let j = 0; j < ps.length; j++) ps[j]!.layer = l;
  }
}
