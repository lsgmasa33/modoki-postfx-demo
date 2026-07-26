/** Post-Process Demo — game-specific systems.
 *
 *  One UIAction, owned by one scene-scoped Manager:
 *   - `postfx.showOnly` — driven by the Director's PostFX Tour timeline
 *     (runtime/assets/timelines/postfx-tour.timeline.json), a signal track
 *     whose markers name which effect is "now showing" + its caption text.
 */

import {
  registerManager, unregisterManager, type ManagerDef, type UIActionContext,
  findEntityByGuid,
  NPRPostFX, BloomPostFX, VignettePostFX, DepthOfFieldPostFX, AmbientOcclusionPostFX,
  UIElement, markUIDirty,
} from '@modoki/engine/runtime';
import { Light, Environment } from '@modoki/engine/three';
import { registerCameraTour, unregisterCameraTour, setTourStop } from './cameraTour';

type PostFXEffect = 'npr' | 'bloom' | 'vignette' | 'dof' | 'ao';

/** A station's `effect` param is a COMMA-SEPARATED SET, so which effects a station
 *  turns on is timeline data rather than code — e.g. `"npr"`, `"bloom,vignette"`, or
 *  `"bloom,vignette,dof,ao"`. Two convenience tokens are kept: `"all"` (every effect)
 *  and `"none"`. Deliberately NOT a hardcoded "all means five" branch: the finale
 *  intentionally omits NPR, whose grayscale fill flattens the gallery's lighting and
 *  colour into a grey wash and hides what the other four effects are doing. */
const ALL_EFFECTS: PostFXEffect[] = ['npr', 'bloom', 'vignette', 'dof', 'ao'];

function parseEffects(spec: string): Set<PostFXEffect> {
  const trimmed = spec.trim();
  if (trimmed === 'all') return new Set(ALL_EFFECTS);
  if (trimmed === '' || trimmed === 'none') return new Set();
  return new Set(
    trimmed.split(',').map((s) => s.trim()).filter((s): s is PostFXEffect =>
      (ALL_EFFECTS as string[]).includes(s)),
  );
}

// Scene-authored GUIDs (main.json) — the caption label.
const CAPTION_GUID = 'c10a1955-bc5f-4ae1-a08b-13abcbb053a8';
const AMBIENT_LIGHT_GUID = '10f5719d-95c2-4b2d-909e-34d30a4a1486';
const ENVIRONMENT_GUID = '6bdfab72-8dad-40d7-8127-6974dcf56612';

/** Per-station lighting overrides a marker may carry. All optional; anything omitted
 *  falls back to the value authored in the scene. */
interface StationLighting {
  ambient?: number;      // Ambient Light intensity
  ambientColor?: number; // Ambient Light colour (hex)
  env?: number;          // Environment (HDR/IBL) intensity
}

/** The gallery's authored lighting, captured live on the first `showOnly` call rather
 *  than hardcoded — so re-lighting the scene in the editor can't leave a stale constant
 *  here to fight with (the "don't shadow a scene value with a code constant" rule). Reset
 *  on (un)register so a scene reload re-captures. Note this only ever mutates the LIVE
 *  world, never the scene file, so the authored values always survive. */
let baseLighting: { ambIntensity: number; ambColor: number; envIntensity: number } | null = null;

/** Apply a station's lighting overrides, restoring the authored values for anything the
 *  marker omits. This exists for the NPR station: the gallery is deliberately dark, and
 *  NPR draws DARK outlines onto the fill — on near-black surfaces a dark line has nothing
 *  to contrast against, so the stylization reads as "barely on".
 *
 *  Three levers, and they are NOT interchangeable — all measured live on this scene:
 *  - `ambientColor` is the one that actually unlocks ambient. The authored ambient is
 *    `0x2A345C`, a dark desaturated blue whose brightest channel is only 0.36, so it
 *    multiplies everything down: raising intensity 0.06 → 0.9 → 3.0 barely moved the
 *    frame. The NPR station overrides the colour to WHITE.
 *  - `env` (HDR intensity) is DIRECTIONAL where ambient is flat and shadeless, so it
 *    brightens while preserving gradients across surfaces — which is exactly what NPR's
 *    normal-based edge detection needs. Ambient alone brightens but flattens.
 *  - `grayscaleLift`/`grayscaleGamma` (on NPRPostFX, not here) raise blacks globally and
 *    tend toward flat grey paper. Safe to push — they only affect the NPR station — but
 *    they throw away form, so prefer the two lighting levers first. */
function applyStationLighting(world: UIActionContext['world'], want: StationLighting): void {
  const amb = findEntityByGuid(AMBIENT_LIGHT_GUID, world);
  const env = findEntityByGuid(ENVIRONMENT_GUID, world);
  const light = amb?.get(Light);
  const environment = env?.get(Environment);
  if (baseLighting === null) {
    if (!light || !environment) return; // scene not ready — don't capture a partial base
    baseLighting = {
      ambIntensity: light.intensity,
      ambColor: light.color,
      envIntensity: environment.intensity,
    };
  }

  if (amb && light) {
    const intensity = want.ambient ?? baseLighting.ambIntensity;
    const color = want.ambientColor ?? baseLighting.ambColor;
    if (light.intensity !== intensity || light.color !== color) {
      amb.set(Light, { ...light, intensity, color });
    }
  }
  if (env && environment) {
    const intensity = want.env ?? baseLighting.envIntensity;
    if (environment.intensity !== intensity) {
      env.set(Environment, { ...environment, intensity });
    }
  }
}

const postfxManager: ManagerDef = {
  name: 'postfx-demo/postfx',
  scope: 'scene',

  actions: {
    // Declared `params` schema (not just a bare handler): the Timeline Editor's marker
    // inspector renders a TYPED FORM per param when an action declares one, and falls
    // back to a raw JSON text box when it doesn't (ItemInspector.tsx). Declaring it is
    // what makes this tour hand-tunable — `ambientColor` becomes a colour swatch rather
    // than the decimal 16777215, and the numbers get steppers.
    'postfx.showOnly': {
      params: {
        effect: {
          type: 'string',
          tooltip: 'Comma-separated effect set for this station: npr, bloom, vignette, dof, ao. Also accepts "all" / "none".',
        },
        label: { type: 'string', tooltip: 'Caption text shown at the bottom of the frame for this station.' },
        ambient: {
          type: 'number', step: 0.05, min: 0,
          tooltip: 'Ambient Light intensity for this station. Omit to keep the scene-authored value (0.06).',
        },
        ambientColor: {
          type: 'color',
          tooltip: 'Ambient Light colour. The authored 0x2A345C is very dark, so raising intensity alone barely brightens — set this to white for the NPR station.',
        },
        env: {
          type: 'number', step: 0.05, min: 0,
          tooltip: 'Environment (HDR/IBL) intensity. Directional, so it brightens while keeping surface gradients — the best lever for making NPR outlines read. Authored value is 0.1.',
        },
        focus: {
          type: 'string',
          tooltip: 'Entity GUID of the exhibit the camera flies to and orbits for this station. Omit to leave the camera where it is.',
        },
        orbitRadius: {
          type: 'number', step: 0.1, min: 0.2,
          tooltip: 'Orbit radius in world units. Keep it wide enough that the lit walls/sconces stay in frame — the Vignette station needs light at the frame EDGE to darken.',
        },
        focusY: {
          type: 'number', step: 0.05,
          tooltip: "World Y the camera looks at — the subject's visual centre, NOT its transform origin (an imported photoscan's origin is often nowhere near its middle).",
        },
      },
      handler: ({ world, params }: UIActionContext) => {
        const wanted = parseEffects((params?.effect as string) ?? 'none');
        const label = (params?.label as string) ?? '';
        const want = (kind: PostFXEffect) => wanted.has(kind);

        applyStationLighting(world, {
          ambient: params?.ambient as number | undefined,
          ambientColor: params?.ambientColor as number | undefined,
          env: params?.env as number | undefined,
        });

        const focus = params?.focus as string | undefined;
        if (focus) {
          setTourStop(
            world,
            focus,
            (params?.orbitRadius as number | undefined) ?? 2.5,
            (params?.focusY as number | undefined) ?? 1.2,
          );
        }

        const npr = world.queryFirst(NPRPostFX);
        const bloom = world.queryFirst(BloomPostFX);
        const vignette = world.queryFirst(VignettePostFX);
        const dof = world.queryFirst(DepthOfFieldPostFX);
        const ao = world.queryFirst(AmbientOcclusionPostFX);
        if (npr) npr.set(NPRPostFX, { ...npr.get(NPRPostFX)!, enabled: want('npr') });
        if (bloom) bloom.set(BloomPostFX, { ...bloom.get(BloomPostFX)!, enabled: want('bloom') });
        if (vignette) vignette.set(VignettePostFX, { ...vignette.get(VignettePostFX)!, enabled: want('vignette') });
        if (dof) dof.set(DepthOfFieldPostFX, { ...dof.get(DepthOfFieldPostFX)!, enabled: want('dof') });
        if (ao) ao.set(AmbientOcclusionPostFX, { ...ao.get(AmbientOcclusionPostFX)!, enabled: want('ao') });

        const caption = findEntityByGuid(CAPTION_GUID, world);
        const el = caption?.get(UIElement);
        if (caption && el && el.text !== label) {
          caption.set(UIElement, { ...el, text: label });
          markUIDirty();
        }
      },
    },
  },
};

export function registerGameSystems(): void {
  baseLighting = null; // re-capture from the freshly-loaded scene
  registerManager(postfxManager);
  registerCameraTour();
}

export function unregisterGameSystems(): void {
  baseLighting = null;
  unregisterCameraTour();
  unregisterManager(postfxManager.name);
}

// ─────────────── Test surface (headless verification only) ───────────────
// Exposes the manager's own `actions` map so a test can register it directly with
// `createTestWorld({ actions: __testing.actions })` and dispatch through the REAL
// `dispatchUIAction` path — registerManager's scope:'scene' activation gates on the
// SceneManager's activeScenePath, which createTestWorld never sets, so going through
// registerManager itself isn't an option here.
export const __testing = {
  parseEffects,
  actions: postfxManager.actions,
  resetBaseLighting: (): void => { baseLighting = null; },
};
