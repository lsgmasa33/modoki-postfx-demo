<!-- Generated from CLAUDE.md by `npm run sync:agent-configs` — edit CLAUDE.md, not this file. -->

# postfx-demo — composable post-FX stack showcase

**A curated, publishable Modoki demo.** It ships as its own public repo, so it stays
self-contained and free of non-CC0 assets (it uses none at all — see
[ATTRIBUTION.md](ATTRIBUTION.md)). The public-facing doc is [README.md](README.md); this
file is the agent-facing one and travels with the demo.

Shows off the engine's composable WebGPU post-process stack (NPR, bloom, vignette, DOF,
GTAO) in a **night museum gallery** of photoscanned CC0 sculptures, one effect at a time
via a Director/Timeline tour, then all five composed.

## This project

- **Scene** (`runtime/assets/scenes/main.scene.json`, ~55 entities):
  - **Gallery shell** — `Floor`/`Ceiling`/`WallBack`/`WallLeft`/`WallRight`/`WallFront`,
    engine-primitive boxes (an 11 × 6.2 × 30 enclosed room, so the HDR leaks no visible
    background) using the original `gallery_floor`/`gallery_wall` materials.
  - **Six plinths + props** — Poly Haven photoscans placed receding down the hall for real
    DOF depth: `LanternBody`+`LanternGlass` (~2 units from the lens), `GothicStatue` (hero,
    ~7, the focus plane), `HorseHead`, `CatStatue`, `WhaleStatue`, `CeramicVase` (~21).
  - **Lighting** — 5 per-statue spots (`SpotGothic`…`SpotVase`), a cool `BackWash` spot on
    the far wall, 4 warm wall `Sconce*Light`s, `ChandelierBulb1` + `LanternLight`, and a
    warm `Ambient Light` (intensity `0.55`) + dim `Sun` (intensity `0.05`) + `Environment`
    (HDR at intensity `0.7`, IBL fill).
  - **Shadows — the statue spots are deliberately ANGLED, not overhead.** Each sits at
    `subject + (1.5, 3.2, 1.5)` (~56° elevation) rather than straight above. An earlier
    version aimed them near-vertically (`rx ≈ -82°`) and it read as "the engine has no
    shadows" — every shadow fell directly beneath its own statue, hidden by the statue and
    its plinth. The global gate was never off (`renderSettings.ts` defaults `shadows: true`);
    only `castShadow` per light, and the ANGLE, matter. All five spots cast at
    `shadowMapSize 1024`; the point lights (sconces/chandelier/lantern) deliberately do NOT
    — a point light needs a cube shadow map, and six chandelier bulbs would be brutal.
  - **Emissive geometry** — `ChandelierGlow*` (1-6), `LanternFlame`, `Sconce*Glow` spheres on the
    `gallery_flame` material (emissive 7×). These are what bloom actually catches; the
    lights alone would give it nothing to bite into.
  - 5 post-FX resource singletons (`NPRPostFX`/`BloomPostFX`/`VignettePostFX`/
    `DepthOfFieldPostFX`/`AmbientOcclusionPostFX`, all start `enabled:false` — the timeline
    drives them), a `Director`, and a HUD (`Title`, `Caption`). (The earlier before/after
    "Show: Off/On" toggle button + its `postfx.toggle` action were removed — the timeline
    tour is the only driver now.)

### Staging rationale — why the scene looks the way it does
The gallery is not decoration; each effect needs something specific or it silently shows
nothing (**vignette** needs the wall sconces at the frame edge to crush, **bloom** needs
emissive geometry not just lights, **AO** needs contact/crevices, **DOF** needs props at
genuinely different depths — an earlier version had an invisible vignette against a black
background). The timeline (`runtime/assets/timelines/postfx-tour.timeline.json`) drives
which effects are on per station via a comma-separated `effect` set — this is timeline
DATA, not code. Per-station lighting overrides (`ambient`/`ambientColor`/`env`) are
auto-restored on stations that omit them; re-read the scene's current authored baseline
before tuning, it drifts. **Camera tour** (`runtime/cameraTour.ts`): Euler order is XYZ —
never hand-roll yaw/pitch, build a look-at matrix and decompose instead (a related engine
bug in `syncLights` is now fixed). Tuned defaults (bloom/DOF/vignette/AO/NPR values) are
authored in the scene/timeline for the owner to re-tune live.

⚠️ **`DepthOfFieldPostFX.focalLength` is NOT the edge of a sharp band** — size it several
times the subject's half-depth (rule of thumb: **3–4×**), not the half-depth itself, or the
subject stays soft everywhere but its dead centre. **AO strength has no headroom above
`intensity: 1`** — the only remaining knob past that is `radius`. **Editing a post-FX TSL
file force-reloads the editor by itself** (fixed 2026-07-26) — a hot patch otherwise leaves
the OLD shader graph running; check `get_editor_state.staleGameCode` if a result looks
impossible.

**Full reference: [staging.md](./staging.md).**

## The quality tier can delete this demo's entire subject (#241)

⚠️ **On the `low` tier this project's own config masks out ALL FIVE effects the tour exists to
show.** `Scene3D` masks the PostFXRequest through `getActiveTierOverrides()`, so on a weak phone
the camera still flies station to station and the caption still reads "Bloom", "Depth of Field",
"GTAO" over a frame where none of them is running. Silent, and indistinguishable from a broken
build.

`runtime/setup.ts` subscribes to **`onQualityTierChange`** and annotates the caption with whatever
the tier is suppressing — "Bloom  (bloom is off at the 'low' quality tier)". It is the repo's
worked example of that seam, so keep it working: which effects are affordable is the ENGINE's
call, what the demo SAYS about it is the game's; it re-renders on tier CHANGE (calibration can
demote mid-tour); the subscription is dropped in `unregisterGameSystems` (never let it outlive a
scene reload); and it annotates only what the CURRENT station asked for.

## Gotchas (cost real time building this)

- **⚠️ `Light.targetX/targetY/targetZ` DO NOTHING.** `syncLights` derives a spot/directional
  light's aim *only* from its Euler **rotation** (local −Z into world space) — no renderer
  code reads the target fields, however correct they look in the Inspector or scene state.
  **Aim spots by setting `rx`/`ry`**: for a desired unit direction `d`, `rx = asin(d.y)` and
  `ry = atan2(-d.x, -d.z)`.
- **Poly Haven GLBs can be Z-up and/or wildly off-scale** — re-measure `worldAABB` after
  rotating to fix it (rotation moves the baked-in geometry offset).
- **Never convert glTF→GLB with `gltf-pipeline --draco.*`** — the engine's model importer
  cannot read `KHR_draco_mesh_compression` and fails with `imported:false`. Use a bare
  `gltf-pipeline -i x.gltf -o x.glb --binary`.
- **`UIElement.fontWeight` accepts only `normal` | `bold`** — numeric CSS weights like
  `'600'` are rejected with a validation warning and silently ignored.
- **`modoki_mutate_scene`'s `addEntity` `parentId` must be the FILE's id, which does NOT
  match the LIVE runtime id** for an entity added in a prior call this session — pass the
  parent's **GUID string** instead. A failed/orphaned batch can be PARTIALLY successful, so
  always re-`get_scene_state` after any batch that reported warnings before assuming what
  actually landed.
- **A signal-track marker's `params` land in `ctx.params`, not `ctx.payload`** — same
  `UIActionContext` shape a button click uses, just populated differently per firing path.
- **⚠️ This is the ONLY project with an iOS `SceneDelegate`** — a newer Capacitor iOS
  template starting to ship one by default would silently kill the debug bridge in every
  NEW project (fixed here 2026-08-07; root cause + diagnosis in `gotchas.md`).

**Full reference — including the timeline hot-reload fix, the deployed BASE_URL bug, and
the build/signing procedure: [gotchas.md](./gotchas.md).**

## Identity & build

- **Native iOS + Android are committed here** (same arrangement as `demos/2d-physics-demo`):
  the folders live in the private repo, and `scripts/publish-demo.sh` **drops them from the
  public snapshot**, so the published demo is still web-only.
- **`build.appleTeamId` is deliberately EMPTY**, and so is the iOS `DEVELOPMENT_TEAM`
  (`""`) — signing identity is per-machine and does not belong in a demo bound for a public
  repo. ⚠️ Clearing the config alone does NOT scrub an id already written into the native
  project (`project-config.ts` leaves the pbxproj alone when `appleTeamId` is empty) —
  scrub both.
- Device ids (`iosDeviceId` / `iosDevicectlId`) live in the gitignored `project.user.json`
  and are never committed.
- Build/run: open in the Modoki Editor (**File → Open Project**), then **Build → Web**, or
  `MODOKI_PROJECT=demos/postfx-demo npm run build -- --target web` from the repo root.
- **The stack is NOT WebGPU-only — it runs on WebGL2 too, minus FXAA.** `createRenderer`
  ALWAYS constructs a `WebGPURenderer`, which falls back to a WebGL2 backend internally; the
  post-FX gate (`isWebGPURenderer === true`) stays true on that fallback, so the whole stack
  still builds and renders — only FXAA is dropped (raw-WGSL, can't compile on WebGL2).
  Don't infer the backend from `isWebGPU` (it names the renderer CLASS, not the API in use)
  — read `renderer.backend.isWebGLBackend` or use `readRendererBackend()`.

**Full build/signing procedure and the WebGPU-fallback investigation: [gotchas.md](./gotchas.md).**

---

This is a **Modoki** game project. Modoki is a Claude-friendly game engine: you,
Claude, author the game — scene data, game logic (TypeScript), and asset wiring —
while the human directs and reviews. The visual editor is for the things agents are
bad at (pixel-level layout, final polish).

You were wired to this project by **AI → Connect Claude Code** in the editor, which wrote
an `.mcp.json` for it (the AI panel shows exactly where). When the desktop editor has this
project open, it exposes the tools below. **Prefer them over screenshots** — they read and
mutate the *live* running engine, so they prove your edits actually took effect.

**If you are Cursor, Codex CLI, or Antigravity CLI reading this as `AGENTS.md`:** there is no
"Connect" flow for you yet — only Claude Code gets one wired automatically. If MCP tools
below aren't available, either they were never configured for this project, or (Codex CLI
specifically) this directory hasn't been trusted yet — Codex silently skips a project-scoped
`.codex/config.toml`'s MCP servers until the human answers its trust prompt. Tell the human
if tools seem to be missing rather than assuming they don't exist; don't guess at scene state
from source alone (see the section below).

## The engine's own source is on this machine — read it when you need to

This project depends on `@modoki/engine`, but not as an installed npm package: the running
**Modoki Editor** app serves it to your project live, from its own install. That means the
engine's actual TypeScript source (rendering, ECS, physics, everything under
`engine/packages/modoki/src/`) is sitting on disk, unpacked and readable, inside the editor
app you have installed — not hidden inside a compiled bundle. **Don't guess the path** — call
`modoki_identity`; its `repoRoot` field IS this path (the monorepo root in dev, or
`<resourcesPath>/app.asar.unpacked` when `packaged` is true), and it's authoritative for
*this* running editor rather than an assumed install location.

**Reach for this when the MCP tools and this file's docs aren't enough** — e.g. a trait
behaves unexpectedly and you need to see its actual system logic, not just its current
data. Prefer the verification loop below for "what is the game doing right now"; reach into
the engine source for "why does the engine behave this way." (There's also a public,
Apache-2.0 mirror of this source — search GitHub for `modoki-engine` — if you'd rather work
from a separate clone than the installed app's copy.)

## Observe the running game — don't infer it from source

The files in this project (`game.ts`, `setup.ts`, the scene JSON) tell you what the game is
*designed* to do. They do **NOT** tell you what it's *actually doing right now* — where an
entity is this frame, which scene is loaded, what the human just changed, whether an event
fired. Any claim about live state that you got by **reading files is a guess.**

Before you answer "did it work / what's happening / why does it look wrong," ask yourself:
*am I inferring this, or did I observe it?* If inferring → call a tool
(`modoki_get_scene_state` / `modoki_journal` / `modoki_editor_journal`) and **cite what it
returned.** "Did you check?" should never be a question the human has to ask you.

## The verification loop (do this every time)

1. **Read** the live world with `modoki_get_scene_state` before changing anything.
2. **Mutate** with `modoki_mutate_scene` (or `modoki_set_transform` / entity ops).
3. **Verify the data** with `modoki_get_scene_state` again — exact, cheap,
   deterministic. *This is your primary check* (use a tolerance for floats, not `===`).
4. **Verify pixels** with `modoki_render_scene` / `modoki_capture_viewport` only when you
   genuinely need to see the render (catches "numbers right, renders black/NaN").

## Tools

**Author & inspect (the core loop)**
- `modoki_get_scene_state` — dump the LIVE ECS world (entities, traits) as JSON. Called
  bare it's a cheap index (names + trait names); target with `trait=`/`name=`/`where=` for
  values. Address entities by `guid` — ids churn on hot-reload.
- `modoki_mutate_scene` — validated `setTrait`/`removeTrait`/`addEntity`/`removeEntity`;
  writes the scene file atomically, the editor hot-reloads. Never hand-write scene JSON.
- `modoki_set_transform` — one-call place/rotate/scale (prefab-instance aware).
- `modoki_validate_scene`, `modoki_list_traits`, `modoki_list_assets` — the schema you can
  set + the project's assets (every asset ref MUST be a GUID from here).
- `modoki_create_entity` / `duplicate` / `delete` / `reparent` / `prefab` — undoable, like
  the Hierarchy menus. `modoki_load_scene` / `new_scene` / `save_all` / `list_scenes`.

**Test it like a human (Enact — trusted input)**
- `modoki_play_control` — play / stop / pause / resume / step the game.
- `modoki_tap` / `drag` / `hover` / `scroll` / `press_key` / `type_text` — real trusted
  input; aim with a CSS `selector` or page `x,y`. `modoki_handles` + `tap_handle` /
  `drag_handle` drive the DOM-less Canvas2D/SVG editors (bones, keyframes, collider verts).

**Verify by DATA, not vibes (Percept)**
- `modoki_journal` — the game's tick-stamped semantic events (match / score / win / …);
  assert on these instead of screenshots. `modoki_diagnose` flags likely problems (NaN
  transforms, broken asset refs, orphaned entities) in one call.
- `modoki_editor_journal` / `modoki_watch` — what the **human just did** in the editor
  (selected / moved / edited) and a live watch on chosen entities/traits. Reach for these
  *before* guessing why the scene differs from what you expected. `modoki_get_editor_state`
  dumps the whole editor UI state in one call.

**Drop into the live renderer (CDP / chrome-devtools)** — when the data isn't enough:
read React/Three state via `evaluate_script`, validate WGSL, or grab the TRUE framebuffer
with `take_screenshot`/`Page.captureScreenshot` (unlike `capture_viewport`, it doesn't
force a render, so it exposes render-on-demand / stale-frame bugs). The `chrome-devtools`
MCP is wired to THIS editor's renderer only when you enabled **Renderer debugging (CDP)**
in the AI panel.

## Rules

- **Asset references are GUIDs, never literal paths.** Any `mesh` / `material` / `texture`
  / `imageSrc` / `source` field takes a GUID from `modoki_list_assets`. (Exceptions:
  `http(s)://` / `data:` URLs, the primitive sprite keywords `circle` / `square` / `triangle`
  (plus `collider`). `UIElement.fontFamily` is a font GUID too since #231 —
  a CSS family name goes in `UIElement.systemFont`.)
- **Scenes are the source of truth.** Persist via `modoki_mutate_scene`, not imperative
  setup, for anything that should survive a reload.
- **Keep changes incremental.** One mechanic at a time; verify with
  `modoki_get_scene_state` before moving on.

## Layout

```
Post-Process Demo/
├── game.ts                              # exports `game: GameDefinition` (entry point)
├── project.config.json                  # app id/name, default game, build settings
├── package.json                         # this project's own npm root
└── runtime/                             # your game code + assets
    ├── config.ts                        # GameConfig (points at the starting scene)
    ├── setup.ts                         # register your ECS systems here
    └── assets/                          # asset root → served at /assets/...
        ├── scenes/main.scene.json             # the starting scene (edit via modoki_mutate_scene)
        └── models/  textures/  materials/  prefabs/   # drop assets here
```

The starting scene's URL is `/assets/scenes/main.scene.json` — pass that as `path` to
`modoki_mutate_scene` / `modoki_validate_scene`.

Start by inspecting the current scene with `modoki_get_scene_state`, then ask the human
what game to build.
