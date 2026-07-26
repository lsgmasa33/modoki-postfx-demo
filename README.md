# Post-FX Demo — Modoki

![A gold-lit gothic statue on a dark museum plinth, bloom haloing its highlights, a
softly blurred cat statue on a plinth behind it, captioned "All Composed"](screenshot.png)

A showcase of the [Modoki](https://modoki-engine.com) engine's **composable WebGPU
post-process stack**: NPR stylized outlines, bloom, vignette, depth of field, and ground-
truth ambient occlusion (GTAO) — all layered on ONE scene, one effect at a time, then all
five composed together. A `Director`/Timeline tour cycles through them automatically on a
90-second loop.

## Running it

You need the **Modoki Editor** ([download](https://modoki-engine.com)). This project is
not a standalone npm app — the editor supplies the engine, the dev server, and the build
pipeline.

1. Open the editor.
2. **File → Open Project**, and pick this folder.
3. Press **Play** in the toolbar. The tour runs on a 90-second loop.

To produce a web build, use **Build → Web** in the editor.

## What's in it

A **night museum gallery**: photoscanned CC0 sculptures on plinths receding down a dim
hall, lit by per-statue spotlights, warm wall sconces, a practical chandelier, and a cool
wash on the far wall.

The staging is deliberate — each effect needs something specific to bite into, and a scene
that flatters one can hide another:

- **Bloom** needs real emissive sources in a dark frame → the chandelier, the sconces, and
  the lantern flame are emissive geometry, not just lights.
- **Vignette** needs a *lit* frame edge to fall off from. This is why the sconces sit near
  the side walls: against a black background a vignette is invisible, because darkening
  black changes nothing.
- **DOF** needs depth spread → a lantern ~2 units from the lens, the hero statue at ~7,
  and the far vase at ~21, with the focus plane on the hero.
- **AO** needs contact and crevices → sculpted photoscan detail, and statues meeting plinths
  meeting floor.
- **NPR** needs clean silhouettes → strong statue outlines against flat walls.

The camera is not locked off: it **flies to each exhibit and orbits it**, one exhibit per
station, walking progressively deeper into the hall and then back out to the hero statue
for the finale. Depth of field re-focuses on whichever exhibit is currently framed.

**6 stations**, 15s each, named by a synced caption. Each station is exactly one full 360° camera orbit of its exhibit:

| # | Effect | What it demonstrates |
|---|---|---|
| 1 | NPR + Bloom — Composed | Edge-detected outline stylization **and** HDR glow, together |
| 2 | Bloom — HDR Light Bleed | Glow off the chandelier, sconces and lantern flame |
| 3 | Vignette — Lens Falloff | Radial edge darkening |
| 4 | Depth of Field — Bokeh | Near/far blur separation, focus on the hero statue |
| 5 | Ambient Occlusion (GTAO) | Contact-shadow darkening in crevices |
| 6 | All Composed | Bloom + vignette + DOF + AO layered together |

**Station 1 is the actual point of this demo.** Before the post-FX stack existed, NPR and
bloom were *mutually exclusive* — enabling both meant NPR silently won and bloom was
skipped entirely. Station 1 is the live proof that they now compose.

Station 6 deliberately **omits NPR**: its grayscale fill flattens the gallery's lighting
and colour into a grey wash, which hides exactly what the other four effects are doing. A
station's effect set is a comma-separated list in the timeline (`"npr,bloom"`,
`"bloom,vignette,dof,ao"`), so this is a data choice, not a code branch — reorder or
recombine the stations without touching TypeScript.

## The only game code

One scene-scoped Manager (`runtime/setup.ts`) owning a single `UIAction`:
- `postfx.showOnly` — the timeline's signal-track markers call this once per station; it
  sets every post-FX trait's `enabled` field from the marker's `effect` param and updates
  the caption from its `label` param. Purely data-driven — a 7th station needs no code
  change, only a new marker.

The camera framing, the gallery layout and lighting, the station sequence, and every
effect's tuning are scene/timeline data — none of it is code.

## Concepts worth stealing

- **A composable post-FX stack, not exclusive branches.** Every `*PostFX` trait
  (`NPRPostFX`, `BloomPostFX`, `VignettePostFX`, `DepthOfFieldPostFX`,
  `AmbientOcclusionPostFX`) is an independent singleton — turn on however many you want.
- **Verify a post-FX stage by data, not eye.** Every trait's `enabled`/tunables are visible
  in scene state — confirm a station actually changed what's enabled before trusting the
  render.

## Assets

Seven photoscanned **CC0** models and one HDR environment, all from
[Poly Haven](https://polyhaven.com) (statues, chandelier, lantern, vase). The gallery
architecture itself — floor, walls, ceiling, plinths — is engine primitives with original
untextured PBR materials. Full provenance in [ATTRIBUTION.md](ATTRIBUTION.md).

## Licence

[MIT](LICENSE) — take any of this, including the scene, timeline, and game code, and use
it however you like. It is sample code; that is the point.

Note the **engine** itself is licensed separately (Apache-2.0); this licence covers only
the contents of this repository.
