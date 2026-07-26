/** Headless verification of the postfx-demo camera tour (runtime/cameraTour.ts).
 *
 *  Two layers, matching the sling test convention:
 *   - Pure `easeInOut` — deterministic, no ECS.
 *   - Integration through the real turn loop: `setTourStop` + the per-frame system,
 *     asserting on the camera's Transform and on `DepthOfFieldPostFX.focusDistance`
 *     tracking the live camera→subject distance (file header note 2 — this is the
 *     load-bearing behaviour that keeps the DOF station legible while the camera orbits). */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createTestWorld, type TestWorld,
  EntityAttributes, Transform, DepthOfFieldPostFX, findEntityByGuid,
} from '@modoki/engine/runtime';
import { __testing } from '../runtime/cameraTour';

const T = __testing;

const CAMERA_GUID = '39971d1f-4f5e-4155-99e2-f025d2d69d92';
const SUBJECT_GUID = 'aaaaaaaa-0000-0000-0000-000000000001';

describe('cameraTour — easeInOut (pure)', () => {
  it('starts at 0, ends at 1, and is monotonic', () => {
    expect(T.easeInOut(0)).toBeCloseTo(0, 6);
    expect(T.easeInOut(1)).toBeCloseTo(1, 6);
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = T.easeInOut(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('is symmetric around the midpoint (ease-in mirrors ease-out)', () => {
    expect(T.easeInOut(0.25)).toBeCloseTo(1 - T.easeInOut(0.75), 6);
  });
});

describe('cameraTour — orbit + DOF tracking (integration)', () => {
  let w: TestWorld;

  afterEach(() => {
    T.reset();
    w?.dispose();
  });

  function buildWorld(): TestWorld {
    w = createTestWorld({ systems: [{ name: 'postfx-demo/cameraTour', fn: T.cameraTourSystem }] });
    w.spawn(
      EntityAttributes({ name: 'Main Camera', guid: CAMERA_GUID }),
      Transform({ x: 0, y: 0, z: 0 }),
    );
    w.spawn(
      EntityAttributes({ name: 'Subject', guid: SUBJECT_GUID }),
      Transform({ x: 5, y: 1, z: 0 }),
    );
    w.spawn(DepthOfFieldPostFX({ enabled: true, focusDistance: 999, focalLength: 4, bokehScale: 3.5 }));
    return w;
  }

  it('does nothing before setTourStop is called (no subject targeted yet)', () => {
    buildWorld();
    w.step(5);
    const tf = findEntityByGuid(CAMERA_GUID, w.world)!.get(Transform)!;
    expect(tf.x).toBe(0);
    expect(tf.y).toBe(0);
    expect(tf.z).toBe(0);
  });

  it('orbits the subject at the configured radius, looking at focusY', () => {
    buildWorld();
    T.setTourStop(w.world, SUBJECT_GUID, 3, 1.2);
    // Settle past the fly-in (TRAVEL_TIME 1.8s) so the eye sits exactly on the orbit circle.
    w.step(200); // 200 * 1/60s ≈ 3.3s
    const tf = findEntityByGuid(CAMERA_GUID, w.world)!.get(Transform)!;
    const dx = tf.x - 5; // subject at x=5
    const dz = tf.z - 0;
    const horizontalRadius = Math.sqrt(dx * dx + dz * dz);
    expect(horizontalRadius).toBeCloseTo(3, 6);
    expect(tf.y).toBeCloseTo(1.2 + 0.5, 6); // focusY + EYE_LIFT
  });

  it('rewrites DepthOfFieldPostFX.focusDistance to the live camera→subject distance', () => {
    buildWorld();
    T.setTourStop(w.world, SUBJECT_GUID, 3, 1.2);
    w.step(200);
    const dof = w.world.queryFirst(DepthOfFieldPostFX)!.get(DepthOfFieldPostFX)!;
    // At radius 3 with EYE_LIFT 0.5 above the look-at point, eye→look distance is
    // sqrt(3^2 + 0.5^2) once settled. The system only rewrites focusDistance past a
    // 0.01 hysteresis (by design — see cameraTour.ts), so allow that much slack rather
    // than asserting bit-exact convergence.
    expect(Math.abs(dof.focusDistance - Math.sqrt(3 * 3 + 0.5 * 0.5))).toBeLessThan(0.01);
  });

  it('leaves the camera alone for an unknown guid (no fly-to-origin)', () => {
    buildWorld();
    T.setTourStop(w.world, 'not-a-real-guid', 3, 1.2);
    w.step(10);
    const tf = findEntityByGuid(CAMERA_GUID, w.world)!.get(Transform)!;
    expect(tf.x).toBe(0);
    expect(tf.y).toBe(0);
    expect(tf.z).toBe(0);
  });
});
