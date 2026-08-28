# postfx-demo staging rationale

Why the gallery scene looks the way it does — deep reference for anyone re-tuning the
staging, lighting, timeline, or camera tour. Summary + rules live in
`CLAUDE.md` § "Staging rationale"; this is the full detail behind them.

## Why the gallery is built this way

The gallery is not decoration; each effect needs something specific or it silently shows
nothing. **Vignette is the load-bearing case**: it darkens the frame edge, so against a
black background it is *invisible* — an earlier version of this demo had exactly that bug.
The wall sconces exist to put light at the frame edge for the vignette to crush. Likewise
bloom needs emissive geometry (not just lights), AO needs contact/crevices, and DOF needs
props at genuinely different depths.

## Timeline

`runtime/assets/timelines/postfx-tour.timeline.json`, 90s loop, 15s/station — ONE **signal**
track (`Captions`, 6 markers) calling `postfx.showOnly` with `{effect, label}` params per
station. **`effect` is a COMMA-SEPARATED SET**, so which effects a station enables is
timeline DATA, not code: `npr,bloom` → `bloom` → `vignette` → `dof` → `ao` →
`bloom,vignette,dof,ao`. Station 1 pairs NPR with bloom deliberately — that pairing was
impossible before this workstream (NPR silently won and bloom was skipped), so it is the
demo's actual proof. The finale deliberately OMITS NPR: its grayscale fill flattens the
gallery to a grey wash and hides the other four.

A marker may also carry **per-station lighting overrides** — `ambient` (intensity),
`ambientColor` (hex), `env` (HDR/IBL intensity) — applied by `applyStationLighting()` and
auto-restored to the authored values on any station that omits them (the scene's current
authored baseline: `Ambient Light` intensity `0.55` / colour `0xFFF0E0`, `Environment`
intensity `0.7` — re-read these from the scene before tuning; they drift as the gallery
gets re-lit). Station 1 uses `ambient 1 + ambientColor white + env 1`, because the gallery
is far too dark for NPR — see the "Brightening the NPR station" note below. No activation
tracks (unlike particle-demo) — post-FX toggles are trait-field flips (`enabled`), not
`EntityAttributes.isActive`, so a signal-driven action is the right shape, not activation
spans.

## Camera tour

`runtime/cameraTour.ts` — the camera flies to each exhibit and orbits it, one exhibit per
station, so all six get shown in the 90s loop. The route is timeline DATA (`focus` =
subject GUID, `orbitRadius`, `focusY` per marker); this file is only the mechanism. The
order walks progressively deeper into the hall — lantern → horse → cat → whale → vase —
then the finale flies back out to the gothic hero. Two load-bearing details are documented
at length in the file header; the short version:

- **Euler order is XYZ, so never hand-roll yaw/pitch.** A yaw-then-pitch formula is really
  YXZ and agrees with XYZ only near `ry = 0`; past that the only XYZ solution is `rx ≈ π`,
  i.e. an UPSIDE-DOWN camera halfway round every orbit. Build a look-at matrix and decompose
  to an XYZ euler instead. (Investigating this surfaced a real engine bug — `syncLights` was
  aiming spot/directional lights with a YXZ formula while everything else used XYZ. Now
  fixed engine-side, with this scene's spot eulers migrated so their directions are
  unchanged; see `docs/todo.md` for the remaining camera-order question.)
- **DOF focus tracks the subject.** `focusDistance` is a fixed world distance, so with a
  moving camera a static value leaves the hero blurred and random midground sharp. The
  system rewrites it to the live camera→subject distance each frame; the authored value is
  only the no-tour fallback.

## Game code

`runtime/setup.ts` — one scene-scoped Manager (`postfx-demo/postfx`) owning a single
action: `postfx.showOnly` (timeline-driven, sets all 5 post-FX traits' `enabled` from the
`effect` param, updates the `Caption` `UIElement` from `label`, calls `markUIDirty()`).
Resolves the Caption entity via `findEntityByGuid` with a hardcoded scene GUID (cheaper and
more direct than a name-scan for one fixed UI element in a demo this small). Also has
headless tests: `tests/setup.test.ts` (`parseEffects` + `postfx.showOnly`, dispatched
through the real `dispatchUIAction` path) and `tests/cameraTour.test.ts`.

## Tuned defaults

Owner should re-tune live, per the engine's "human tunes visual feel" convention:

- Bloom `strength 0.85 / radius 0.65 / threshold 0.6`
- DOF `focusDistance 7.2` (no-tour fallback; the camera tour tracks it live) `/
  focalLength 4 / bokehScale 3.5`
- Vignette `intensity 1 / smoothness 0.8`
- AO `radius 0.1 / intensity 1`
- NPR `grayscaleLift 0 / grayscaleGamma 1.15`

### AO strength has no headroom above `intensity: 1`

The stage lerps `mix(1, aoTex.r, intensity)`, so 1 is *full raw GTAO* and the only
remaining knob is `radius`. A smaller radius reads DARKER here (tight contact occlusion at
crevices/plinth bases) because a large radius spreads samples across open gallery floor and
averages the occlusion away — hence `0.5 → 0.1`. If 0.1 still looks weak, the fix is
engine-side (a power/exponent on the occlusion term), not a scene value.

### Keep the bloom threshold high (≥0.6)

NPR's grayscale fill is inherently bright, so a low threshold catches nearly the whole
frame once NPR and bloom are both on and blows the "All Composed" finale into a white void.

### Brightening the NPR station — three levers, NOT interchangeable

Measured live on this scene; this cost several iterations — re-verify against the CURRENT
authored lighting before reusing these, they drift as the gallery gets re-lit; see the
current baseline numbers in the marker-overrides note above.

1. **`ambientColor` is a lever in its own right, not just `ambient` intensity.** A
   dark/desaturated ambient colour caps how far raising `ambient` intensity alone can
   brighten the frame — the colour multiplies everything down regardless of intensity.
   Overriding it to **white** for the NPR station removes that ceiling.
2. **`env` (Environment/HDR intensity) is directional**, where ambient is flat and
   shadeless. It brightens while preserving gradients across surfaces, which is what NPR's
   normal-based edge detection needs — this was the lever that made the station read as
   ink-on-paper.
3. **`grayscaleLift`/`grayscaleGamma`** raise blacks globally toward flat grey paper. Safe
   to push — being NPR's own fill params they affect ONLY this station — but they discard
   form, so reach for the two lighting levers first.

### Editing a post-FX TSL file now force-reloads the editor by itself (fixed 2026-07-26)

TSL nodes bake into compiled pipelines, so a hot patch leaves the OLD shader graph running.
While chasing the DOF bug below, three separate "the fix didn't work" conclusions were all
just the previous graph still live — `hmrUpdates` was climbing in `get_editor_state` the
whole time. The dev server now matches `runtime/rendering/postfx/**` + `npr/**` by path and
reloads the renderer for you (`isShaderGraphFile` → `modoki:shader-code-changed`; the old
per-file `import.meta.hot.invalidate()` was silently swallowed by Scene3D.tsx's Fast
Refresh boundary). If the editor has UNSAVED scene edits you get a 5s countdown banner
first. The manual `modoki_dispatch_action engine.reload` is no longer needed — but if you
ever measure a shader result that looks impossible, check
`get_editor_state.staleGameCode` (set when someone cancelled that banner) before believing
it.

### `DepthOfFieldPostFX.focalLength` is NOT the edge of a sharp band

Size it several times the subject's half-depth. Three computes
`CoC = smoothstep(0, focalLength, |(-viewZ) - focusDistance|)` (`DepthOfFieldNode.js`), and
smoothstep ramps from **zero** — so `focalLength` is the distance at which blur reaches its
MAXIMUM, and only the thin slice at `|signedDist| ≈ 0` is genuinely sharp. Setting it to the
subject's half-depth (the intuitive reading of the docstring, *"how far an object can be
from the focal plane before it goes completely out-of-focus"*) leaves the SUBJECT visibly
soft everywhere but its centre — the exact symptom that got reported here twice, worst on
the deepest subject (the gothic statue, ±0.84). At `2.2` the whale (±0.57) reads
`smoothstep(0.26) ≈ 0.16` and the gothic `smoothstep(0.38) ≈ 0.30`: both crisp, while walls
4–10 units out clamp to full blur. Rule of thumb: **focalLength ≈ 3–4×** the subject's
half-depth, then push `bokehScale` for the amount of background blur.

### Why it was dark at all: NPR draws DARK outlines

On near-black surfaces a dark line has nothing to contrast against, so the stylization
reads as "barely on". If the lines look weak, brighten the *fill*; `lineStrength` is
usually the wrong knob.
