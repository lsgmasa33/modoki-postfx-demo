/** Camera tour — flies the game camera between the gallery's exhibits and orbits
 *  each one, driven entirely by the PostFX Tour timeline.
 *
 *  A station's marker names its subject (`focus`, an entity GUID) plus the framing
 *  (`orbitRadius`, `focusY`); `setTourStop` is called from `postfx.showOnly`, and this
 *  system does the per-frame motion. So the route, the pacing and the framing are all
 *  timeline DATA — this file is only the mechanism.
 *
 *  Two things here are load-bearing and easy to get wrong:
 *
 *  1. **Euler order is XYZ, and a naive yaw/pitch breaks halfway round the orbit.**
 *     The engine applies a Transform's euler with `rotation.set(rx, ry, rz)` and three's
 *     DEFAULT order (`scene3DSync.ts` — no order override), i.e. XYZ. Under XYZ, `ry`
 *     alone cannot express a full 360° yaw: solving `rx`/`ry` from the look direction
 *     puts `cos(ry) >= 0`, so once the camera swings past the subject the only solution
 *     is `rx ≈ π` — an UPSIDE-DOWN camera. (A yaw-then-pitch formula is really YXZ, and it
 *     agrees with XYZ only near `ry = 0` — exactly the trap that hid a real engine bug in
 *     `syncLights`, since found and fixed.) So build a proper look-at matrix and decompose
 *     it to an XYZ euler; never hand-roll the angles.
 *
 *  2. **DOF focus MUST track the subject.** `DepthOfFieldPostFX.focusDistance` is a fixed
 *     world distance. With a moving camera the subject's distance changes every frame, so
 *     a static value would leave the hero blurred and some empty midground sharp — the DOF
 *     station would look broken rather than shallow. This system rewrites `focusDistance`
 *     to the live camera→subject distance each frame; the authored value is just the
 *     no-tour fallback. */

import * as THREE from 'three';
import type { World } from 'koota';
import {
  registerSystem, unregisterSystem, SYSTEM_PRIORITY, getSimDelta, onWorldSwap,
  findEntityByGuid, getWorldTransform3D, Transform, DepthOfFieldPostFX,
} from '@modoki/engine/runtime';

/** Scene-authored `Main Camera`. */
const CAMERA_GUID = '39971d1f-4f5e-4155-99e2-f025d2d69d92';

/** Seconds to fly from the previous pose into the new subject's orbit. */
const TRAVEL_TIME = 1.8;
/** Orbit rate (rad/s), sized so each station completes exactly ONE full revolution:
 *  `ORBIT_SPEED = 2π / stationSeconds`. With the timeline's 15s stations that is
 *  2π/15 ≈ 0.419 (24°/s).
 *
 *  A full 360° is deliberate, not just for looks: as the camera comes round, DIFFERENT
 *  objects pass behind the subject at different depths (plinths, the far vase, the lit
 *  sconces, the back wall). That is what makes the depth-of-field station legible — a
 *  static or partial orbit keeps the same background the whole time, so there is nothing
 *  to see the focus separate FROM. **If the station length in the timeline changes, change
 *  this too or the revolution stops lining up with the station.** */
const ORBIT_SPEED = (Math.PI * 2) / 15;
/** Eye sits this far above the look-at point, for a slight downward gallery angle. */
const EYE_LIFT = 0.5;
/** Set false to stop the tour driving `DepthOfFieldPostFX.focusDistance`, so the value in
 *  the Inspector/scene is authoritative and can be swept by hand — the way to tune DOF,
 *  since with this on the field is rewritten every frame and an Inspector edit looks dead. */
const TRACK_FOCUS = true;

interface TourStop {
  /** Entity GUID of the exhibit to orbit. */
  guid: string;
  /** Orbit radius in world units. */
  radius: number;
  /** World Y to look at (the subject's visual centre — NOT its transform origin, which
   *  on an imported photoscan is often nowhere near the middle). */
  focusY: number;
}

let stop: TourStop | null = null;
let angle = 0;
let travel = 1; // 0..1 fly-in progress; 1 = settled into the orbit
let haveFrom = false;
let unsubSwap: (() => void) | null = null;

const fromEye = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _look = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Point the tour at a new exhibit. Called by `postfx.showOnly` when a marker carries a
 *  `focus` param; a marker without one leaves the camera wherever it is. */
export function setTourStop(world: World, guid: string, radius: number, focusY: number): void {
  const target = findEntityByGuid(guid, world);
  if (!target) return; // unknown guid — leave the camera alone rather than fly to the origin

  const cam = findEntityByGuid(CAMERA_GUID, world);
  const tf = cam?.get(Transform);

  // Copy out of getWorldTransform3D's SHARED return object immediately — it is reused
  // by the next call, so holding the reference would alias.
  const w = getWorldTransform3D(target.id(), world);
  const tx = w.x, tz = w.z;

  if (tf) {
    fromEye.set(tf.x, tf.y, tf.z);
    haveFrom = true;
    // Start the orbit at the angle the camera ALREADY sits at relative to the new
    // subject, so the fly-in is a short arc instead of swinging the long way round.
    angle = Math.atan2(tf.z - tz, tf.x - tx);
  }

  stop = { guid, radius, focusY };
  travel = 0;
}

function cameraTourSystem(world: World): void {
  if (!stop) return;
  const cam = findEntityByGuid(CAMERA_GUID, world);
  const tf = cam?.get(Transform);
  const target = findEntityByGuid(stop.guid, world);
  if (!cam || !tf || !target) return;

  const dt = getSimDelta(world); // gameplay time — 0 when not playing
  angle += ORBIT_SPEED * dt;
  if (travel < 1) travel = Math.min(1, travel + dt / TRAVEL_TIME);

  const w = getWorldTransform3D(target.id(), world);
  const cx = w.x, cz = w.z; // copy out of the shared object before anything else reads it
  _look.set(cx, stop.focusY, cz);

  _eye.set(
    cx + Math.cos(angle) * stop.radius,
    stop.focusY + EYE_LIFT,
    cz + Math.sin(angle) * stop.radius,
  );
  if (haveFrom && travel < 1) _eye.lerpVectors(fromEye, _eye, easeInOut(travel));

  // See note 1 in the file header — look-at matrix → quaternion → XYZ euler.
  _m.lookAt(_eye, _look, UP);
  _q.setFromRotationMatrix(_m);
  _e.setFromQuaternion(_q, 'XYZ');

  cam.set(Transform, {
    ...tf,
    x: _eye.x, y: _eye.y, z: _eye.z,
    rx: _e.x, ry: _e.y, rz: _e.z,
  });

  // See note 2 — keep the focus plane on the subject. Flip TRACK_FOCUS off to sweep
  // `focusDistance` by hand: while this runs it rewrites the field every frame, so an
  // Inspector edit is stomped on the next tick and the control looks dead.
  if (TRACK_FOCUS) {
    const dofEnt = world.queryFirst(DepthOfFieldPostFX);
    const dof = dofEnt?.get(DepthOfFieldPostFX);
    if (dofEnt && dof) {
      const dist = _eye.distanceTo(_look);
      if (Math.abs(dof.focusDistance - dist) > 0.01) {
        dofEnt.set(DepthOfFieldPostFX, { ...dof, focusDistance: dist });
      }
    }
  }
}

export function registerCameraTour(): void {
  registerSystem('postfx-demo/cameraTour', cameraTourSystem, SYSTEM_PRIORITY.GAME);
  unsubSwap = onWorldSwap(() => { stop = null; travel = 1; haveFrom = false; angle = 0; });
}

export function unregisterCameraTour(): void {
  unregisterSystem('postfx-demo/cameraTour');
  unsubSwap?.();
  unsubSwap = null;
  stop = null;
  travel = 1;
  haveFrom = false;
  angle = 0;
}

// ─────────────── Test surface (headless verification only) ───────────────
export const __testing = {
  cameraTourSystem,
  setTourStop,
  easeInOut,
  reset: (): void => { stop = null; travel = 1; haveFrom = false; angle = 0; },
};
