# Asset Attribution

Every third-party asset in this project is **CC0 1.0** (public domain dedication) — no
attribution is legally required, but sources are listed here for transparency and so the
provenance stays traceable. Anything not listed below is either an engine primitive or
original work created for this project.

## Models

All models are photoscanned PBR assets from [Poly Haven](https://polyhaven.com), downloaded
as glTF at **1k** texture resolution and converted to a single self-contained `.glb`.

| Asset | Source | License |
|---|---|---|
| Gothic Statue (hero sculpture) | [Poly Haven — Gothic Statue](https://polyhaven.com/a/gothic_statue) | CC0 1.0 |
| Horse Head (bust) | [Poly Haven — Horse Head](https://polyhaven.com/a/horse_head) | CC0 1.0 |
| Bronze Whale Statue | [Poly Haven — Bronze Whale Statue](https://polyhaven.com/a/bronze_whale_statue) | CC0 1.0 |
| Concrete Cat Statue | [Poly Haven — Concrete Cat Statue](https://polyhaven.com/a/concrete_cat_statue) | CC0 1.0 |
| Antique Ceramic Vase 01 | [Poly Haven — Antique Ceramic Vase 01](https://polyhaven.com/a/antique_ceramic_vase_01) | CC0 1.0 |
| Chandelier 01 (bloom source) | [Poly Haven — Chandelier 01](https://polyhaven.com/a/Chandelier_01) | CC0 1.0 |
| Lantern 01 (foreground DOF prop) | [Poly Haven — Lantern 01](https://polyhaven.com/a/Lantern_01) | CC0 1.0 |

## Environment

| Asset | Source | License |
|---|---|---|
| "Abandoned Hall 01" HDR environment (1K, used as dim interior IBL fill only — not shown as a background) | [Poly Haven — Abandoned Hall 01](https://polyhaven.com/a/abandoned_hall_01) | CC0 1.0 |

## Original work

- The gallery architecture (floor, walls, ceiling, plinths, the chandelier's hanging rod)
  is built from **engine primitives** (`Renderable3DPrimitive` boxes and a cylinder) — not
  third-party geometry.
- The four gallery materials (`gallery_floor`, `gallery_wall`, `gallery_plinth`,
  `gallery_flame`) are original, authored for this project — untextured PBR values only.
- The scene (`runtime/assets/scenes/main.json`), the post-FX tour timeline
  (`runtime/assets/timelines/postfx-tour.timeline.json`), and the game code
  (`runtime/setup.ts`) are original work authored for this project.

## Licence

Every asset above carries a CC0 1.0 public-domain dedication at its source — no permission,
credit, or royalty is required by any upstream party. This file exists purely so the
provenance stays traceable, not to satisfy a license requirement.

Third-party licences for the **engine's own dependencies** (three.js, Rapier, PixiJS,
koota, React) are documented by the Modoki engine, not here.
