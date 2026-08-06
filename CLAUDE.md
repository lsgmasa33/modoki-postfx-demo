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
    the far wall, 4 warm wall `Sconce*Light`s, `ChandelierLight` + `LanternLight`, and a
    very low `Ambient Light`/`Sun` + `Environment` (HDR at intensity 0.1, IBL fill only).
  - **Shadows — the statue spots are deliberately ANGLED, not overhead.** Each sits at
    `subject + (1.5, 3.2, 1.5)` (~56° elevation) rather than straight above. An earlier
    version aimed them near-vertically (`rx ≈ -82°`) and it read as "the engine has no
    shadows" — every shadow fell directly beneath its own statue, hidden by the statue and
    its plinth. The global gate was never off (`renderSettings.ts` defaults `shadows: true`);
    only `castShadow` per light, and the ANGLE, matter. All five spots cast at
    `shadowMapSize 1024`; the point lights (sconces/chandelier/lantern) deliberately do NOT
    — a point light needs a cube shadow map, and six chandelier bulbs would be brutal.
  - **Emissive geometry** — `ChandelierGlow`, `LanternFlame`, `Sconce*Glow` spheres on the
    `gallery_flame` material (emissive 7×). These are what bloom actually catches; the
    lights alone would give it nothing to bite into.
  - 5 post-FX resource singletons (`NPRPostFX`/`BloomPostFX`/`VignettePostFX`/
    `DepthOfFieldPostFX`/`AmbientOcclusionPostFX`, all start `enabled:false` — the timeline
    drives them), a `Director`, and a HUD (`Title`, `Caption`). (The earlier before/after
    "Show: Off/On" toggle button + its `postfx.toggle` action were removed — the timeline
    tour is the only driver now.)

### Staging rationale — why the scene looks the way it does
The gallery is not decoration; each effect needs something specific or it silently shows
nothing. **Vignette is the load-bearing case**: it darkens the frame edge, so against a
black background it is *invisible* — an earlier version of this demo had exactly that bug.
The wall sconces exist to put light at the frame edge for the vignette to crush. Likewise
bloom needs emissive geometry (not just lights), AO needs contact/crevices, and DOF needs
props at genuinely different depths.
- **Timeline** (`runtime/assets/timelines/postfx-tour.timeline.json`, 90s loop,
  15s/station) — ONE **signal** track (`Captions`, 6 markers) calling `postfx.showOnly`
  with `{effect, label}` params per station. **`effect` is a COMMA-SEPARATED SET**, so
  which effects a station enables is timeline DATA, not code: `npr,bloom` → `bloom` →
  `vignette` → `dof` → `ao` → `bloom,vignette,dof,ao`. Station 1 pairs NPR with bloom
  deliberately — that pairing was impossible before this workstream (NPR silently won and
  bloom was skipped), so it is the demo's actual proof. The finale deliberately OMITS NPR:
  its grayscale fill flattens the gallery to a grey wash and hides the other four.
  A marker may also carry **per-station lighting overrides** — `ambient` (intensity),
  `ambientColor` (hex), `env` (HDR/IBL intensity) — applied by `applyStationLighting()` and
  auto-restored to the authored values on any station that omits them (verified live: other
  stations read back `ambient 0.06 / 0x2A345C`, `env 0.1`). Station 1 uses
  `ambient 1 + ambientColor white + env 1`, because the gallery is far too dark for NPR —
  see the lighting-levers note under Tuned defaults. No
  activation tracks (unlike particle-demo) — post-FX toggles are trait-field flips
  (`enabled`), not `EntityAttributes.isActive`, so a signal-driven action is the right
  shape, not activation spans.
- **Camera tour** (`runtime/cameraTour.ts`) — the camera flies to each exhibit and orbits
  it, one exhibit per station, so all six get shown in the 90s loop. The route is timeline
  DATA (`focus` = subject GUID, `orbitRadius`, `focusY` per marker); this file is only the
  mechanism. The order walks progressively deeper into the hall — lantern → horse → cat →
  whale → vase — then the finale flies back out to the gothic hero. Two load-bearing
  details are documented at length in the file header; the short version:
  - **Euler order is XYZ, so never hand-roll yaw/pitch.** A yaw-then-pitch formula is
    really YXZ and agrees with XYZ only near `ry = 0`; past that the only XYZ solution is
    `rx ≈ π`, i.e. an UPSIDE-DOWN camera halfway round every orbit. Build a look-at matrix
    and decompose to an XYZ euler instead. (Investigating this surfaced a real engine bug —
    `syncLights` was aiming spot/directional lights with a YXZ formula while everything else
    used XYZ. Now fixed engine-side, with this scene's spot eulers migrated so their
    directions are unchanged; see `docs/todo.md` for the remaining camera-order question.)
  - **DOF focus tracks the subject.** `focusDistance` is a fixed world distance, so with a
    moving camera a static value leaves the hero blurred and random midground sharp. The
    system rewrites it to the live camera→subject distance each frame; the authored value
    is only the no-tour fallback.
- **Game code** (`runtime/setup.ts`) — one scene-scoped Manager (`postfx-demo/postfx`)
  owning a single action: `postfx.showOnly` (timeline-driven, sets all 5 post-FX traits'
  `enabled` from the `effect` param, updates the `Caption` `UIElement` from `label`, calls
  `markUIDirty()`). Resolves the Caption entity via `findEntityByGuid` with a hardcoded
  scene GUID (cheaper and more direct than a name-scan for one fixed UI element in a demo
  this small). Also has headless tests: `tests/setup.test.ts` (`parseEffects` +
  `postfx.showOnly`, dispatched through the real `dispatchUIAction` path) and
  `tests/cameraTour.test.ts`.
- **Tuned defaults** (owner should re-tune live, per the engine's "human tunes visual
  feel" convention): Bloom `strength 0.85 / radius 0.65 / threshold 0.6`; DOF
  `focusDistance 7.2` (no-tour fallback; the camera tour tracks it live) `/ focalLength 4 /
  bokehScale 3.5`; Vignette
  `intensity 1 / smoothness 0.8`; AO `radius 0.1 / intensity 1`; NPR
  `grayscaleLift 0.08 / grayscaleGamma 0.85`.
  - **AO strength has no headroom above `intensity: 1`** — the stage lerps
    `mix(1, aoTex.r, intensity)`, so 1 is *full raw GTAO* and the only remaining knob is
    `radius`. A smaller radius reads DARKER here (tight contact occlusion at crevices/plinth
    bases) because a large radius spreads samples across open gallery floor and averages the
    occlusion away — hence `0.5 → 0.1`. If 0.1 still looks weak, the fix is engine-side (a
    power/exponent on the occlusion term), not a scene value.
  - Keep the bloom **threshold high (≥0.6)**: NPR's grayscale fill is inherently bright, so
    a low threshold catches nearly the whole frame once NPR and bloom are both on and blows
    the "All Composed" finale into a white void.
  - **Brightening the NPR station — three levers, NOT interchangeable** (all measured live
    on this scene; this cost several iterations):
    1. **`ambientColor` is what actually unlocks ambient.** The authored ambient is
       `0x2A345C`, a dark desaturated blue whose brightest channel is only 0.36, so it
       scales *everything* down — raising intensity `0.06 → 0.9 → 3.0` barely moved the
       frame. It only worked once the colour was overridden to **white**.
    2. **`env` (Environment/HDR intensity) is directional**, where ambient is flat and
       shadeless. It brightens while preserving gradients across surfaces, which is what
       NPR's normal-based edge detection needs. `env: 1` (up from the authored `0.1`) was
       the change that finally made the station read as ink-on-paper.
    3. **`grayscaleLift`/`grayscaleGamma`** raise blacks globally toward flat grey paper.
       Safe to push — being NPR's own fill params they affect ONLY this station, so the
       earlier worry about them washing out the gallery was wrong — but they discard form,
       so reach for the two lighting levers first.
  - **Editing a post-FX TSL file now force-reloads the editor by itself (fixed 2026-07-26).**
    TSL nodes bake into compiled pipelines, so a hot patch leaves the OLD shader graph running.
    While chasing the DOF bug below, three separate "the fix didn't work" conclusions were all
    just the previous graph still live — `hmrUpdates` was climbing in `get_editor_state` the
    whole time. The dev server now matches `runtime/rendering/postfx/**` + `npr/**` by path and
    reloads the renderer for you (`isShaderGraphFile` → `modoki:shader-code-changed`; the old
    per-file `import.meta.hot.invalidate()` was silently swallowed by Scene3D.tsx's Fast Refresh
    boundary). If the editor has UNSAVED scene edits you get a 5s countdown banner first. The
    manual `modoki_dispatch_action engine.reload` is no longer needed — but if you ever measure
    a shader result that looks impossible, check `get_editor_state.staleGameCode` (set when
    someone cancelled that banner) before believing it.
  - **⚠️ `DepthOfFieldPostFX.focalLength` is NOT the edge of a sharp band — size it several
    times the subject's half-depth.** three computes
    `CoC = smoothstep(0, focalLength, |(-viewZ) - focusDistance|)`
    (`DepthOfFieldNode.js`), and smoothstep ramps from **zero** — so `focalLength` is the
    distance at which blur reaches its MAXIMUM, and only the thin slice at
    `|signedDist| ≈ 0` is genuinely sharp. Setting it to the subject's half-depth (the
    intuitive reading of the docstring, *"how far an object can be from the focal plane
    before it goes completely out-of-focus"*) leaves the SUBJECT visibly soft everywhere
    but its centre — the exact symptom that got reported here twice, worst on the deepest
    subject (the gothic statue, ±0.84). At `2.2` the whale (±0.57) reads
    `smoothstep(0.26) ≈ 0.16` and the gothic `smoothstep(0.38) ≈ 0.30`: both crisp, while
    walls 4–10 units out clamp to full blur. Rule of thumb: **focalLength ≈ 3–4×**
    the subject's half-depth, then push `bokehScale` for the amount of background blur.
  - **Why it was dark at all: NPR draws DARK outlines.** On near-black surfaces a dark
    line has nothing to contrast against, so the stylization reads as "barely on". If the
    lines look weak, brighten the *fill*; `lineStrength` is usually the wrong knob.

## Gotchas (cost real time building this)

- **⚠️ `Light.targetX/targetY/targetZ` DO NOTHING.** The fields exist on the trait
  (`three/traits/Light.ts`) and are shown in the Inspector under a "Target" group
  (`registerTraits.ts`), but **no renderer code reads them**. `syncLights`
  (`runtime/rendering/scene3DSync.ts`, the `SpotLight`/`DirectionalLight` branch) derives a
  light's aim *only* from its Euler **rotation**, projecting local −Z into world space. A
  spot with rotation `(0,0,0)` fires horizontally down −Z no matter what its target fields
  say. This cost an hour here: five spots were authored with correct `targetX/Y/Z`, appeared
  correct in scene state, and lit nothing — a spot at intensity **4000** produced no visible
  change. **Aim spots by setting `rx`/`ry`**: for a desired unit direction `d`,
  `rx = asin(d.y)` and `ry = atan2(-d.x, -d.z)`.
- **Poly Haven GLBs can be Z-up and/or wildly off-scale.** `Chandelier_01` imported ~100×
  too large with a ~40-unit Z offset baked in (scale `0.011035` to get a 0.9 m fixture), and
  was Z-up, so it rendered lying on its side. The fix is `rx = +π/2` — note **+**, not −:
  −π/2 also lays the disc horizontal but leaves the fixture upside down (shades pointing
  down, finial up), which is easy to miss in a dark scene. Always re-measure `worldAABB`
  after rotating: rotation moves the baked-in geometry offset, so position must be
  recomputed from the new centre.
- **Never convert glTF→GLB with `gltf-pipeline --draco.*`.** That flag *enables* Draco;
  the engine's model importer cannot read `KHR_draco_mesh_compression` and fails with
  `Cannot read properties of undefined (reading 'DT_FLOAT32')` (`imported:false`). Use a
  bare `gltf-pipeline -i x.gltf -o x.glb --binary`.
- **`UIElement.fontWeight` accepts only `normal` | `bold`** — `'600'` and other numeric CSS
  weights are rejected with a validation warning and silently ignored.
- **Editing a `.timeline.json` on disk now reaches the running Director (fixed 2026-07-26).**
  `runtime/loaders/timelineCache.ts` keys parsed timelines by path, and used to hold one
  forever: neither a file write nor **`modoki_load_scene` nor a Stop/Play cycle** cleared it
  (all three were tried). The symptom was nasty because it was silent and half-working — the
  OLD markers kept firing, so captions still updated and effects still toggled on schedule, and
  it just looked like the new marker params were being ignored. The dev-server watcher now
  invalidates the entry on a `.timeline.json` write (no scene reload, so unsaved work is safe).
  If you ever suspect a stale def again, the diagnosis that worked: confirm the code is live via
  `modoki_list_actions` (it reports each action's param schema), then `modoki_dispatch_action`
  the SAME params by hand — if the hand-dispatch works and the timeline doesn't, the timeline is
  stale, not the code.

- **`modoki_mutate_scene`'s `addEntity` `parentId` must be the FILE's id, which does NOT
  match the LIVE runtime id `modoki_get_scene_state` reports** for an entity added in a
  prior call this session — pass the parent's **GUID string** as `parentId` instead (it
  resolves correctly either way). Using the live numeric id orphans the children
  (re-rooted to scene root at load, with a `parentId references no entity` warning).
- **A failed/orphaned batch can be PARTIALLY successful** — in a single `addEntity` batch,
  entities whose `parentId` didn't resolve got orphaned, but SIBLING entities in the same
  batch with `parentId:0` (root) still succeeded. Cleaning up "the failed batch" by name
  after a partial failure, without checking which entities actually landed, created
  duplicates here (fixed by removing the extras by GUID). Always re-`get_scene_state`
  after a batch that reported any warnings before assuming what's actually in the scene.
- **A signal-track marker's `params` land in `ctx.params`, not `ctx.payload`** — same
  `UIActionContext` shape a button click uses, just populated differently per firing path.
- **A production build's `BASE_URL` is not guaranteed to end with "/"** — Vite only
  normalizes a leading slash on `base`, not a trailing one. `assetUrl()` used to join
  `BASE_URL + path` assuming a trailing slash, so a deploy built with e.g.
  `BASE_PATH=/postfx-demo` (no trailing slash) produced `/postfx-demoassets.manifest.json`
  — a silent 404 that failed the manifest fetch and dropped EVERY GUID lookup at once
  (every mesh "unknown guid", full black screen). Traced live against the deployed
  https://modoki-engine.com/postfx-demo/ before being fixed engine-side in `assetUrl.ts`
  (now strips a trailing slash before joining, regardless of which form `BASE_URL` takes).
  See `engine/packages/modoki/tests/runtime/assetUrl.test.ts` for the regression coverage.

## Identity & build

- appId (scaffolder default) — check `project.config.json` before a real build; the
  scaffolder does not backfill `rendering`/`physics`/`content.scenes` blocks, only
  `build`/`app`. Open once in the editor to let it backfill defaults if a build fails on a
  missing config block.
- **Native iOS + Android are committed here** (same arrangement as `demos/2d-physics-demo`):
  the folders live in the private repo, and `scripts/publish-demo.sh` **drops them from the
  public snapshot**, so the published demo is still web-only. (This entry used to say
  "web-only, no `ios/`/`android/` folders, and none should be added" — that is no longer the
  rule for this demo.)
- **`build.appleTeamId` is deliberately EMPTY**, and so is the iOS `DEVELOPMENT_TEAM`
  (`""`). Signing identity is per-machine and does not belong in a demo bound for a public
  repo. To build on device, set it in **Project Settings → iOS → Signing** — it syncs into
  the pbxproj on the next open/build. ⚠️ Note an empty `appleTeamId` means *leave the pbxproj
  alone* (`project-config.ts`), so clearing the config alone does NOT scrub an id already
  written into the native project — scrub both.
- Device ids (`iosDeviceId` / `iosDevicectlId`) live in the gitignored `project.user.json`
  and are never committed. See `docs/build.md` § "iOS Device" for which of the two is
  required and why a pre-iOS-17 device needs none.
- Build/run: open in the Modoki Editor (**File → Open Project**), then **Build → Web**, or
  `MODOKI_PROJECT=demos/postfx-demo npm run build -- --target web` from the repo root.
- **The stack is NOT WebGPU-only — it runs on WebGL2 too, minus FXAA.** (This entry used to
  claim every effect was skipped without WebGPU. That was wrong, and an iPhone 8 on iOS
  16.7 — a device with no WebGPU at all — visibly showing the post-FX is what caught it.)
  `createRenderer` (`runtime/rendering/scene3DSync.ts`) ALWAYS constructs a
  `WebGPURenderer`; `preferWebGPU` is vestigial (`void preferWebGPU`), and three falls back
  to a **WebGL2 backend inside that same class**. The post-FX gate is
  `isWebGPURenderer === true` (`Scene3D.tsx`), which stays true on that fallback — so the
  whole stack builds and renders. The ONE stage dropped is **FXAA**
  (`planFxaaEnabled` → false when `isWebGLBackend`, `postfx/stackPlan.ts`), because it's a
  raw-WGSL `wgslFn` the WebGL backend's GLSL parser can't compile.
  Don't infer a backend from `isWebGPU`: it names the renderer CLASS, not the API in use.
  Read `renderer.backend.isWebGLBackend` for the actual backend.

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
  `http(s)://` / `data:` URLs, the primitive sprite keywords `circle` / `square` /
  `triangle`, and `UIElement.fontFamily`.)
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
