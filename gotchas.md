# postfx-demo gotchas

Detailed writeups of bugs and dead ends this demo already paid for, plus the build/signing
procedure. Summary + rules live in `CLAUDE.md` § "Gotchas"; this is the full detail.

## Rendering / assets

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
- **Never convert glTF→GLB with `gltf-pipeline --draco.*`.** That flag *enables* Draco; the
  engine's model importer cannot read `KHR_draco_mesh_compression` and fails with
  `Cannot read properties of undefined (reading 'DT_FLOAT32')` (`imported:false`). Use a
  bare `gltf-pipeline -i x.gltf -o x.glb --binary`.
- **`UIElement.fontWeight` accepts only `normal` | `bold`** — `'600'` and other numeric CSS
  weights are rejected with a validation warning and silently ignored.

## Timeline hot-reload (fixed 2026-07-26)

**Editing a `.timeline.json` on disk now reaches the running Director.**
`runtime/loaders/timelineCache.ts` keys parsed timelines by path, and used to hold one
forever: neither a file write nor **`modoki_load_scene` nor a Stop/Play cycle** cleared it
(all three were tried). The symptom was nasty because it was silent and half-working — the
OLD markers kept firing, so captions still updated and effects still toggled on schedule,
and it just looked like the new marker params were being ignored. The dev-server watcher
now invalidates the entry on a `.timeline.json` write (no scene reload, so unsaved work is
safe). If you ever suspect a stale def again, the diagnosis that worked: confirm the code is
live via `modoki_list_actions` (it reports each action's param schema), then
`modoki_dispatch_action` the SAME params by hand — if the hand-dispatch works and the
timeline doesn't, the timeline is stale, not the code.

## iOS SceneDelegate silently killed the debug bridge (fixed 2026-08-07)

**⚠️ This is the ONLY project with an iOS `SceneDelegate`, and it silently killed the debug
bridge.** `SceneDelegate.scene(willConnectTo:)` builds the window IN CODE, which overrides
`Main.storyboard`'s `customClass="MyViewController"` entirely — so while it set
`rootViewController = CAPBridgeViewController()` (the BASE class), our `MyViewController`
never ran, `GameDebugPlugin` was never registered, and the app reported
`[debug-bridge] startServer failed: "GameDebug" plugin is not implemented on ios`. Nothing
listened on port 9095, so every `device_*` MCP tool returned ECONNREFUSED **as if the app
were not running at all**. Fixed 2026-08-07 (root VC is now `MyViewController()`).

Two things made this expensive to find: it is **not** a crash and **not** a render fault —
the WebView loads and the game draws perfectly, so everything *looks* healthy; and every
other project lacks a SceneDelegate, so their bridges work and the natural conclusion ("it
works from the other clone, so this build is stale") points away from the cause. The
diagnostic that actually worked: `MyViewController` prints
`[MyViewController] GameDebugPlugin registered: …`, native prints DO reach the Xcode
console, and **that line was absent** — proof the class never ran, rather than proof of a
stale build. If a newer Capacitor iOS template starts shipping a SceneDelegate by default,
every NEW project inherits this.

## MCP / scene-authoring gotchas

- **`modoki_mutate_scene`'s `addEntity` `parentId` must be the FILE's id, which does NOT
  match the LIVE runtime id `modoki_get_scene_state` reports** for an entity added in a
  prior call this session — pass the parent's **GUID string** as `parentId` instead (it
  resolves correctly either way). Using the live numeric id orphans the children
  (re-rooted to scene root at load, with a `parentId references no entity` warning).
- **A failed/orphaned batch can be PARTIALLY successful** — in a single `addEntity` batch,
  entities whose `parentId` didn't resolve got orphaned, but SIBLING entities in the same
  batch with `parentId:0` (root) still succeeded. Cleaning up "the failed batch" by name
  after a partial failure, without checking which entities actually landed, created
  duplicates here (fixed by removing the extras by GUID). Always re-`get_scene_state` after
  a batch that reported any warnings before assuming what's actually in the scene.
- **A signal-track marker's `params` land in `ctx.params`, not `ctx.payload`** — same
  `UIActionContext` shape a button click uses, just populated differently per firing path.

## Deployed BASE_URL bug (fixed engine-side)

**A production build's `BASE_URL` is not guaranteed to end with "/"** — Vite only
normalizes a leading slash on `base`, not a trailing one. `assetUrl()` used to join
`BASE_URL + path` assuming a trailing slash, so a deploy built with e.g.
`BASE_PATH=/postfx-demo` (no trailing slash) produced `/postfx-demoassets.manifest.json` —
a silent 404 that failed the manifest fetch and dropped EVERY GUID lookup at once (every
mesh "unknown guid", full black screen). Traced live against the deployed
https://modoki-engine.com/postfx-demo/ before being fixed engine-side in `assetUrl.ts` (now
strips a trailing slash before joining, regardless of which form `BASE_URL` takes). See
`engine/packages/modoki/tests/runtime/assetUrl.test.ts` for the regression coverage.

## Build

- appId (scaffolder default) — check `project.config.json` before a real build; the
  scaffolder does not backfill `rendering`/`physics`/`content.scenes` blocks, only
  `build`/`app`. Open once in the editor to let it backfill defaults if a build fails on a
  missing config block.
- **Native iOS + Android are committed here** (same arrangement as `demos/2d-physics-demo`):
  the folders live in the private repo, and `scripts/publish-demo.sh` **drops them from the
  public snapshot**, so the published demo is still web-only. (This entry used to say
  "web-only, no `ios/`/`android/` folders, and none should be added" — that is no longer the
  rule for this demo.)
- **`build.appleTeamId` is deliberately EMPTY**, and so is the iOS `DEVELOPMENT_TEAM` (`""`).
  Signing identity is per-machine and does not belong in a demo bound for a public repo. To
  build on device, set it in **Project Settings → iOS → Signing** — it syncs into the
  pbxproj on the next open/build. ⚠️ Note an empty `appleTeamId` means *leave the pbxproj
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
  Read `renderer.backend.isWebGLBackend` to BRANCH on the actual backend, or
  `readRendererBackend(renderer)` (`runtime/core/activeRenderer.ts`) to LABEL it — the
  engine's own caps probe and profiler HUD both got this wrong until #147.
