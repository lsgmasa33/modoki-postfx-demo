/** Headless verification of the postfx-demo manager (runtime/setup.ts).
 *
 *  Two layers, matching the sling test convention:
 *   - Pure `parseEffects` — the comma-separated effect-set parser (`"npr,bloom"`,
 *     `"all"`, `"none"`, an unknown token) — deterministic, no ECS.
 *   - Integration through the real `dispatchUIAction` path: the manager's own
 *     `actions` map is registered with `createTestWorld({ actions })` (see the
 *     `__testing` header comment in setup.ts for why this — not registerManager
 *     itself — is the harness entry point), then dispatched exactly like a
 *     timeline marker would. */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createTestWorld, type TestWorld, dispatchUIAction,
  EntityAttributes, UIElement, findEntityByGuid,
  NPRPostFX, BloomPostFX, VignettePostFX, DepthOfFieldPostFX, AmbientOcclusionPostFX,
} from '@modoki/engine/runtime';
import { Light, Environment } from '@modoki/engine/three';
import { __testing } from '../runtime/setup';

const T = __testing;

const CAPTION_GUID = 'c10a1955-bc5f-4ae1-a08b-13abcbb053a8';
const AMBIENT_LIGHT_GUID = '10f5719d-95c2-4b2d-909e-34d30a4a1486';
const ENVIRONMENT_GUID = '6bdfab72-8dad-40d7-8127-6974dcf56612';

describe('parseEffects (pure)', () => {
  it('parses a comma-separated set, trimming whitespace', () => {
    expect([...T.parseEffects('npr, bloom')].sort()).toEqual(['bloom', 'npr']);
  });
  it('"all" means every known effect', () => {
    expect([...T.parseEffects('all')].sort()).toEqual(['ao', 'bloom', 'dof', 'npr', 'vignette']);
  });
  it('"none" and "" both mean the empty set', () => {
    expect(T.parseEffects('none').size).toBe(0);
    expect(T.parseEffects('').size).toBe(0);
  });
  it('drops unknown tokens rather than throwing', () => {
    expect([...T.parseEffects('bloom,glitter')]).toEqual(['bloom']);
  });
});

describe('postfx.showOnly (integration)', () => {
  let w: TestWorld;

  function buildWorld(): TestWorld {
    w = createTestWorld({ actions: T.actions });
    T.resetBaseLighting();
    w.spawn(NPRPostFX({ enabled: false }));
    w.spawn(BloomPostFX({ enabled: false }));
    w.spawn(VignettePostFX({ enabled: false }));
    w.spawn(DepthOfFieldPostFX({ enabled: false }));
    w.spawn(AmbientOcclusionPostFX({ enabled: false }));
    w.spawn(EntityAttributes({ name: 'Caption', guid: CAPTION_GUID }), UIElement({ text: '' }));
    w.spawn(EntityAttributes({ name: 'Ambient Light', guid: AMBIENT_LIGHT_GUID }), Light({ intensity: 0.06, color: 0x2a345c }));
    w.spawn(EntityAttributes({ name: 'Environment', guid: ENVIRONMENT_GUID }), Environment({ intensity: 0.1 }));
    return w;
  }

  afterEach(() => {
    T.resetBaseLighting();
    w?.dispose();
  });

  it('enables exactly the requested effects and sets the caption', () => {
    buildWorld();
    dispatchUIAction('postfx.showOnly', { params: { effect: 'npr,bloom', label: 'Station 1' } });
    expect(w.world.queryFirst(NPRPostFX)!.get(NPRPostFX)!.enabled).toBe(true);
    expect(w.world.queryFirst(BloomPostFX)!.get(BloomPostFX)!.enabled).toBe(true);
    expect(w.world.queryFirst(VignettePostFX)!.get(VignettePostFX)!.enabled).toBe(false);
    expect(w.world.queryFirst(DepthOfFieldPostFX)!.get(DepthOfFieldPostFX)!.enabled).toBe(false);
    expect(w.world.queryFirst(AmbientOcclusionPostFX)!.get(AmbientOcclusionPostFX)!.enabled).toBe(false);
    const caption = findEntityByGuid(CAPTION_GUID, w.world)!;
    expect(caption.get(UIElement)!.text).toBe('Station 1');
  });

  it('switching stations turns the previous set off', () => {
    buildWorld();
    dispatchUIAction('postfx.showOnly', { params: { effect: 'npr,bloom', label: 'Station 1' } });
    dispatchUIAction('postfx.showOnly', { params: { effect: 'vignette', label: 'Station 3' } });
    expect(w.world.queryFirst(NPRPostFX)!.get(NPRPostFX)!.enabled).toBe(false);
    expect(w.world.queryFirst(BloomPostFX)!.get(BloomPostFX)!.enabled).toBe(false);
    expect(w.world.queryFirst(VignettePostFX)!.get(VignettePostFX)!.enabled).toBe(true);
  });

  it('applies per-station lighting overrides and restores the authored values when a later station omits them', () => {
    buildWorld();
    dispatchUIAction('postfx.showOnly', { params: { effect: 'npr', label: 'NPR', ambient: 1, ambientColor: 0xffffff, env: 1 } });
    const ambEntity = findEntityByGuid(AMBIENT_LIGHT_GUID, w.world)!;
    const envEntity = findEntityByGuid(ENVIRONMENT_GUID, w.world)!;
    expect(ambEntity.get(Light)!.intensity).toBe(1);
    expect(ambEntity.get(Light)!.color).toBe(0xffffff);
    expect(envEntity.get(Environment)!.intensity).toBe(1);

    // A later station's marker omits ambient/ambientColor/env — must restore the
    // FIRST-CAPTURED authored values (0.06 / 0x2a345c / 0.1), not stay at the override.
    dispatchUIAction('postfx.showOnly', { params: { effect: 'bloom', label: 'Bloom' } });
    expect(ambEntity.get(Light)!.intensity).toBe(0.06);
    expect(ambEntity.get(Light)!.color).toBe(0x2a345c);
    expect(envEntity.get(Environment)!.intensity).toBeCloseTo(0.1, 6);
  });
});
