# Cinematic Architectural LookDev — plaza test area

## Scope and reference

This is a two-building rendering experiment around the existing central plaza. The civic building is `building-block-3-2-0-0`; the commercial building on the opposite side is `building-block-3-4-0-0`. The selection is derived from the actual `CityModel` and enabled only for seed `shadow-city-hero-01`. Their footprints, entrances, floor levels, street graph, walkable surfaces, and all simulation state remain unchanged. Other buildings retain their previous renderers.

The user-supplied cinematic city concept image is the visual target. It is an illustration, not an application screenshot. The existing city screenshot and actual Chrome captures below establish what changed in the running Three.js scene.

## Visual diagnosis and changes

The old buildings had detailed trim but their principal wall masses were solid boxes. Window planes and facade trim gave shallow visual depth. Warm windows largely glowed without lighting the adjacent masonry and pavement. At a whole-city scale, repetitive building rhythm and restrained illumination still separated the scene from the supplied concept image.

This experiment replaces the two visual shells with wall cells that leave actual window and door openings. Each opening has a 0.46 m return, recessed glass, physical frame and sill. The civic building has a deep stone portico with six columns and a continuous roof beam. The commercial building has a brick upper mass, concrete shop level, divided recessed storefront, metal canopy, and distinct roof equipment. The rear and side walls use the same opening system, avoiding blank blocks when the camera rotates. Procedural brick, stone, concrete, and roof PBR maps are shared with the existing asphalt and paving maps. The maps are reusable render assets, not new navigation or collision geometry.

Four shadowless point lights are placed at visible portico and canopy fixtures. They cast warm light on nearby walls and paving while existing cool environment and directional light keep the unlit sides readable. No light is assigned to each window. After comparing real captures, Bloom is **off by default** because it offered little visible improvement at medium zoom and a measurable render cost. `?bloom=on` remains available for the comparison. The composer now has an explicit AgX tone-mapping effect, so its Bloom on/off captures share the same color pipeline. Default AO remains off.

## Browser evidence

Google Chrome 156, Apple M4 Metal via ANGLE, 1440 × 900 CSS pixels, DPR 1, city seed `shadow-city-hero-01`, simulation seed `shadow-city-sim-01`, population 200, Tick 100. Screenshots were captured from the application and opened for visual review. The camera reset view, target, bearing, pitch, and zoom were controlled by the same browser script for matched stage comparisons. [Raw capture data](screenshots/lookdev/results.json).

The Baseline stage uses the previous building meshes and lighting within the corrected shared AgX pipeline, so these are matched-renderer comparisons rather than byte-identical screenshots of an older commit. The earlier untouched [architectural before screenshot](screenshots/architecture-before-hero-tick100-1440x900.png) remains available for historical context.

| Pass | Matched evidence | What the image shows |
| --- | --- | --- |
| A — Baseline and clay | [Unmodified facades](screenshots/lookdev/baseline-area-tick100-1440x900.png), [clay](screenshots/lookdev/clay-area-tick100-1440x900.png) | Baseline facades read mostly as box masses. The clay view exposes that large-scale massing, including the plaza, is still regular. |
| B — Lighting only | [Civic](screenshots/lookdev/lighting-civic-medium-tick100-1440x900.png), [commercial](screenshots/lookdev/lighting-commercial-medium-tick100-1440x900.png) | Portico and shop fixture lights create local wall and pavement pools without whitening the whole scene. The road itself remains substantially dark. |
| C — Geometry and materials | [Civic](screenshots/lookdev/geometry-civic-medium-tick100-1440x900.png), [commercial](screenshots/lookdev/geometry-commercial-medium-tick100-1440x900.png) | The stone portico, brick upper wall, cut openings and roof edges remain visible without Bloom. |
| D — Final | [Final area](screenshots/lookdev/final-area-tick100-1440x900.png), [civic close](screenshots/lookdev/final-civic-close-tick100-1440x900.png), [commercial close](screenshots/lookdev/final-commercial-close-tick100-1440x900.png) | The pair has materially different architectural identities and a local warm/cool hierarchy. The nearby original buildings make the test-area quality boundary clear. |
| Bloom comparison | [Off, final default](screenshots/lookdev/final-area-tick100-1440x900.png), [on](screenshots/lookdev/final-bloom-on-area-tick100-1440x900.png) | The facade and pavement layering survive with Bloom disabled; the medium view changes little when Bloom is enabled. |
| Default hero | [Before](screenshots/lookdev/baseline-hero-tick100-1440x900.png), [after](screenshots/lookdev/final-hero-tick100-1440x900.png) | The two buildings read as a modest local focus, but are too small in the full-city view to reproduce the concept image's overall richness. |

The [0°](screenshots/lookdev/final-commercial-bearing-0-tick100-1440x900.png), [90°](screenshots/lookdev/final-commercial-bearing-90-tick100-1440x900.png), [180°](screenshots/lookdev/final-commercial-bearing-180-tick100-1440x900.png), and [270°](screenshots/lookdev/final-commercial-bearing-270-tick100-1440x900.png) captures show window depth and material continuity on all four sides. The 0° and 90° views are partly occluded by existing neighboring buildings; these shots therefore do not establish an unobstructed architectural view from every direction. No obvious lighting seam was visible on the exposed surfaces.

## Performance and validation

The script samples 2.5 seconds of `requestAnimationFrame` intervals while the 200-person simulation plays, after the Tick 100 still captures. FPS and frame intervals are end-to-end presentation measurements, not GPU frame time. Draw calls and triangles come from Three.js `renderer.info`. Geometry and texture **counts** include renderer/composer resources. CPU geometry and instance buffer sizes and an approximate texture-source byte total are reported in the JSON; the latter is neither actual GPU allocation nor VRAM. Although Chrome exposed a WebGL timer-query extension, this run did not collect GPU timer-query results.

The full visual run and two reordered repeats give the following measurements. [Full visual run](screenshots/lookdev/results.json), [repeat with shadows first](screenshots/lookdev/order-check-results.json), [repeat with Final first](screenshots/lookdev/order-check-2-results.json).

| Stage | Full-run FPS / p95 | Three-run median FPS / p95 | Draw calls | Triangles |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 60.5 / 25.1 ms | — | 301 | 274,329 |
| Final, Bloom off | 56.5 / 36.3 ms | 58.3 / 34.8 ms | 316 | 312,945 |
| Final, Bloom on | 43.8 / 56.7 ms | 57.2 / 36.0 ms | 332 | 312,961 |
| Final, post off | 59.2 / 28.3 ms | — | 315 | 312,944 |
| Final, shadows off | 36.5 / 55.4 ms | 59.2 / 30.7 ms | 210 | 223,359 |

The shadows-off full-run number is an obvious run-order outlier: both reordered runs measured about 59–60 FPS. Shadow removal eliminates 106 draw calls and about 89,600 triangles; the observed FPS change in the two repeated runs is small. Bloom adds 16 calls and 15–16 Three.js texture resources; it consistently reduces FPS in the repeated runs, although the magnitude varies sharply. Because the Final p95 interval is 31.5–36.3 ms across three runs, the earlier local 33 ms target is **not reliably met**.

Baseline versus Final increased visible triangles by 38,616 (14%) and draw calls by 15. The measured CPU-side geometry attribute buffers went from 404,852 to 421,796 bytes, instance buffers from 1,379,116 to 1,496,820 bytes, and discovered texture source bytes stayed around 5.75 MB because the new PBR maps reuse the existing texture cache. These are source and buffer estimates; GPU texture memory and VRAM were not measured.

The shadow-off and post-off variants are diagnostic ablations, not recommended visual defaults. The [post-off capture](screenshots/lookdev/final-no-post-area-tick100-1440x900.png) is darker than the composer capture even though both request AgX. The exact output parity between those paths remains unresolved; post-off frame time must not be interpreted as a pure post-processing cost. Bloom on/off uses the **same composer and tone-mapping path**, making that visual comparison valid. A short sequential run can vary with Chrome scheduling and simulation work; the comparisons are local evidence, not a cross-device guarantee. TypeScript, all 135 existing tests, and the production build passed. The build retained its large-chunk warning.

## Acceptance and art review

The two trial buildings now have true facade recesses, distinct PBR surfaces, visible column and roof shadows, and local warm architectural pools. These gains are strongest at medium and close zoom. The full hero view still lacks the concept image's dense skyline rhythm, richer roof and street assets, broader warm light hierarchy, and refined photographic composition. The street roadbed remains dark relative to the illuminated entrances. Some cardinal views are occluded by adjacent buildings.

This proves that the cut-wall and fixture-light method is useful for selected focal buildings. A citywide rollout is **not yet justified**: the visual gain becomes small at hero distance, and the final scene is still far from the concept image. The next art review should decide whether this architectural language and the restrained lighting are acceptable before any broader asset or district work. No push or deployment is part of this experiment.
