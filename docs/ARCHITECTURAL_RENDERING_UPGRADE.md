# Architectural rendering upgrade — plaza proof of concept

## Scope and visual direction

This pass upgrades eight buildings around the original central plaza, the Galleria exterior, shared street surfaces, and the nighttime render pipeline. The user-supplied 2026-10-26 concept image guided the desired density, warm windows, layered roofs, and miniature composition. It is a visual target, not a screenshot of the running application. `VISUAL_DIRECTION.md` remains the art-direction source of truth.

`CityModel` and `WorldModelV2` still own footprints, roads, places, portals, and walkable space. The new architecture is decorative rendering generated from stable building IDs and world boxes. No simulation, navigation, encounter, replay, or God View behavior changed.

## Implemented pipeline

- Plaza-adjacent buildings gain facade bays, frames and lintels, layered cornices, varied rooflines, vents, entrances, storefront divisions, and two small CC0 Kenney commercial modules. The module source and original license are in [`public/architecture/kenney-commercial-v21/SOURCE.md`](../public/architecture/kenney-commercial-v21/SOURCE.md).
- Shared procedural color, normal, and roughness textures add restrained grain to concrete, brick, asphalt, pavement, and roofs. World-size UV tiling avoids stretching a texture over an entire tall facade. Reused materials and instanced detail keep the upgrade bounded.
- The night pipeline uses explicit sRGB output, AgX tone mapping, cool environment and directional moonlight, soft shadows, selective warm plaza lighting, natural window emission, and restrained bloom. Three local warm lights cast no shadows. The optional `?ao=on` pass is off by default after measurement.
- The Galleria receives exterior window rhythm and roof equipment derived from its existing boxes; this skin does not define its entrances or collision. Hidden diagnostic switches are `?lighting=day`, `?post=off`, `?quality=low`, `?shadows=off`, `?tone=aces`, and `?cameraDiagnostic=street`. Normal camera pitch limits remain unchanged.

## Browser evidence and visual judgement

Both versions were captured in **Google Chrome 155**, WebGL renderer **ANGLE Metal on Apple M4**, at city seed `shadow-city-hero-01`, 200 citizens, Tick 100, 1440 × 900 CSS pixels, DPR 1. The before build was isolated from the clean parent commit and captured using the same camera, target, and script. Screenshots were opened and visually reviewed, not merely generated.

| View | Before | After | Judgement |
| --- | --- | --- | --- |
| Default hero, sidebar collapsed | [before](screenshots/architecture-before-hero-tick100-1440x900.png) | [after](screenshots/architecture-after-hero-tick100-1440x900.png) | Plaza-adjacent facades are richer, but the wider city still reads much like the prior stylized model at this scale. The concept image's citywide density and glow are not achieved. |
| Same commercial building close view | [before](screenshots/architecture-before-close-tick100-1440x900.png) | [after](screenshots/architecture-after-close-tick100-1440x900.png) | Clear gain in facade depth, material grain, roof fittings, entrance and storefront rhythm. Some neighboring, unmodified buildings make the quality boundary visible. |
| Street diagnostic | — | [after](screenshots/architecture-after-street-diagnostic-tick100-1440x900.png) | Taller foreground buildings occlude the chosen target. A designed street-level camera pose and more complete neighboring facades remain open. |
| Bridge side, roof cutaway | — | [after](screenshots/architecture-after-bridge-cutaway-tick100-1440x900.png) | New surrounding textures and Galleria skin render with the blue bridge; this view shows no new obvious portal obstruction, but cannot rule out every close-angle collision. |
| Galleria upper floor cutaway | — | [after](screenshots/architecture-after-galleria-cutaway-tick500-1440x900.png) | Upper floor and roof-hidden view render without a browser error. The Galleria remains simpler than the upgraded plaza buildings. |

Additional actual captures, including all cardinal bearings, day diagnostic, post on/off, low/high quality, and AO on, are in the local `.visual/architecture-upgrade/` run output. The diagnostic daylight is not a production day cycle.

## Performance and validation

The matched run is a single-machine, short browser sample while the simulation plays. RAF frame intervals measure overall presentation, not GPU frame time. [Raw before](screenshots/architecture-before-results.json) and [raw after](screenshots/architecture-after-results.json) contain the sampled method and counts.

| Metric | Before | After default |
| --- | ---: | ---: |
| Average RAF FPS | 59.63 | 57.65 |
| RAF frame interval p95 | 30.3 ms | 31.2 ms |
| Draw calls | 278 | 317 |
| Triangles | 174,517 | 274,345 |
| Three.js texture count | 31 | 54 |

The upgraded default meets the local 50 FPS / 33 ms frame-interval targets **in this one fixed-camera run**. `?post=off` sampled 60.43 FPS / 25.8 ms p95. Optional `?ao=on` sampled 46.02 FPS / 59.4 ms p95, so AO remains disabled. Some later diagnostic variants showed large run-order variation; they should not be used to rank tone mapping or exposure without independent repeat runs. GPU frame time, texture memory bytes, and VRAM were not measured; JS heap and texture-object count do not substitute for these.

The broader [v0.6 Chrome regression](screenshots/architecture-regression-results.json) checked bridge open/closed, roof cutaway, upper-floor selection, camera bearings, replay, narrow layout, alternate seed, and legacy entry, with no page errors. It exited **failed** at the pre-existing hardware performance gate: 51.42 FPS average, 48 ms RAF interval p95, simulation Tick p95 24.1 ms, and Tick 500 replay 3.45 s. This differs from the focused fixed-camera result because the regression plays through more camera, simulation, and asset states; the two short runs are not directly comparable as a rendering-only A/B. The original v0.6 Tick and replay limits remain open, and the frame-interval limit is also missed in this broader run.

Type checking, all 135 tests, and the production build passed. The build retains its existing large-chunk warning.

## Remaining visual work

The Hero District is a proof of concept, not a citywide asset conversion. The far hero view still lacks the supplied image's extensive warm-window hierarchy, material variety, close-packed silhouette detail, and intentional per-block composition. The street-level diagnostic is occluded. Asset diversity is deliberately limited to two small licensed modules; the full Quaternius Downtown package was not bundled because its free download was rate-limited during this pass. Further work should extend a validated architectural grammar across surrounding blocks, tune the hero framing at 1440 × 900, and remeasure on hardware after each expansion.
