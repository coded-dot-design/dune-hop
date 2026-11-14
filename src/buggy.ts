// The buggy, built on @fzlt/core/diorama: a low tub with side pods and a wedge nose, a splitter, a
// cage with a light bar, a rear wing; the driver's helmet; four knobbly wheels on dished hubs.
// Draw order: the diorama sorts a car's parts by layer, then by depth. The body sits on one layer;
// everything that belongs to a wheel (tyre, hub cap, axle stub and the suspension arm reaching out
// to it) goes on the layer above the body when the wheel is on the camera's side of the car (it
// covers the body) and on the layer below when it is on the far side (the body covers it). Every
// other part sits on the body's layer. `wheelLayers` picks the side each draw from the car's
// position and rotation and the camera's eye (the ray to the car, not the screen's axis: a car off
// the middle of the picture is seen from the side a little), so the order holds at any heading,
// pitch, roll, drift or steering angle, anywhere on screen, in every view.
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
  /** Per wheel, its parts (tyre, hub cap, axle stub, suspension arm). */
  parts: DioramaObject[][];
  /** Per wheel, the suspension arm's pivot under the tub: `poseArm` swings it down to the hub. */
  arms: DioramaObject[];
}
/** Suspension arms (long travel): the pivot under the tub (height, distance in from the centre line), the arm's length. */
export const ARM_Y = -0.27, ARM_IN = 0.28, ARM_L = 0.36;
/** The body's layer (the root is 4; what rests on it, 5); a near wheel's tyre draws on NEAR, a far one's on FAR. */
export const BODY = 5, NEAR = 6, FAR = 4.5;
/** Per wheel part (tyre, hub cap, axle stub, arm), its layer on the near side and on the far side. Near:
 *  body, then the arm (inboard), the tyre, the cap and the stub on its outer face. Far: the stub and
 *  cap (on the face turned away), the tyre, the arm, then the body over them all. */
const LN = [NEAR, NEAR + 0.2, NEAR + 0.3, BODY + 0.5], LF = [FAR, FAR - 0.2, FAR - 0.3, BODY - 0.25];

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
  const hubs: DioramaObject[] = [], parts: DioramaObject[][] = [], arms: DioramaObject[] = [];
  for (let i = 0; i < 4; i++) {
    const hid = id + "h" + i, side = wheels[i * 2 + 1]! > 0 ? 1 : -1;
    const hub = d.add({ id: hid, shape: "group", size: [0.6, 0, 0.6], pos: [wheels[i * 2]!, 0, wheels[i * 2 + 1]!], on: id, layer: BODY });
    parts.push([
      d.add({ shape: "cyl", sides: 14, size: [0.74, 0.32, 0.74], pos: [0, 0, -0.16], rot: [Math.PI / 2, 0, 0], on: hid, color: c.tyre, layer: NEAR, pick: false }),
      d.add({ shape: "cyl", sides: 8, size: [0.42, 0.05, 0.42], pos: [0, 0, side > 0 ? 0.16 : -0.21], rot: [Math.PI / 2, 0, 0], on: hid, color: c.cap, layer: NEAR, pick: false }),
      d.add({ size: [0.38, 0.06, 0.06], pos: [0, -0.03, side > 0 ? 0.2 : -0.21], on: hid, color: c.chassis, layer: NEAR, pick: false }),
    ]);
    // The suspension arm (on the car: it does not steer), from a pivot under the tub out to the hub; it
    // swings with the wheel's travel (`poseArm`) and takes the arm's layer (parts' last).
    const aid = id + "a" + i, arm = d.add({ id: aid, shape: "group", size: [0.2, 0, 0.2], pos: [wheels[i * 2]!, ARM_Y, side * ARM_IN], on: id, layer: BODY });
    parts[i]!.push(d.add({ size: [0.16, 0.05, ARM_L], pos: [0, 0, side * ARM_L * 0.5], on: aid, color: c.cage, layer: NEAR, pick: false }));
    arms.push(arm);
    hubs.push(hub);
  }
  return { root, tails, hubs, parts, arms };
}

/** True when the hub's place (its `pos` x, z) across the car (its own frame, at any height) is on the far side of
 *  the car's centre line as seen from `d`'s camera eye: the body stands between it and the eye.
 *  Uses the root's `pos` and `rot` as set this frame (y, then x, then z, as the diorama applies it);
 *  allocates nothing (objects in, a boolean out: a double passed to a call that is not inlined is boxed). */
export function farSide(d: Diorama, root: DioramaObject, hub: DioramaObject) {
  const lx = hub.pos[0]!, lz = hub.pos[2]!, r = root.rot, cx = Math.cos(r[0]!), sx = Math.sin(r[0]!), cy = Math.cos(r[1]!), sy = Math.sin(r[1]!), cz = Math.cos(r[2]!), sz = Math.sin(r[2]!);
  // R·(lx, 0, lz) with R = Ry·Rx·Rz.
  const x1 = cz * lx, y1 = sz * lx, y2 = cx * y1 - sx * lz, z2 = sx * y1 + cx * lz, wx = cy * x1 + sy * z2, wz = -sy * x1 + cy * z2;
  // The ray from the eye (the diorama's orbit: target + dist · (sin yaw · cos pitch, sin pitch, cos yaw · cos pitch)) to the car.
  const cam = d.cam, cp = Math.cos(cam.pitch), p = root.pos;
  const rx = p[0]! - cam.tx - cam.dist * Math.sin(cam.yaw) * cp, ry = p[1]! - cam.ty - cam.dist * Math.sin(cam.pitch), rz = p[2]! - cam.tz - cam.dist * Math.cos(cam.yaw) * cp;
  return wx * rx + y2 * ry + wz * rz > 0;
}

/** Put each wheel's parts (tyre, cap, axle stub, arm) over the body (near side) or under it (far side) for this draw. */
export function wheelLayers(d: Diorama, b: Buggy) {
  for (let i = 0; i < 4; i++) {
    const ps = b.parts[i]!, L = farSide(d, b.root, b.hubs[i]!) ? LF : LN;
    for (let j = 0; j < ps.length; j++) ps[j]!.layer = L[j]!;
  }
}

/** Swing wheel i's arm from its pivot down to its hub (set the hub's `pos` first): an angle about the
 *  car's length. Objects in, nothing out (allocates nothing). */
export function poseArm(b: Buggy, i: number) {
  const h = b.hubs[i]!, side = h.pos[2]! > 0 ? 1 : -1;
  b.arms[i]!.rot[0] = side * Math.atan2(h.pos[1]! - ARM_Y, Math.abs(h.pos[2]!) - ARM_IN);
}
