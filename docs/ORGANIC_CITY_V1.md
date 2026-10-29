# Organic City v1 — terrain and road infrastructure experiment

## Scope and visual reference

`?world=organic` selects a separately fingerprinted 300 × 300 m experiment with seed `shadow-city-organic-01`. The existing integrated city remains the default and its `shadow-city-hero-01` generator remains unchanged. The visual reference inspected for this work was `docs/references/characters/Coastal Isometric Road Network Map.png`: its broad road bends, terrain transitions and irregular blocks informed the direction. The implementation does not attempt to reproduce the image exactly.

This is an infrastructure slice, not a replacement of the building library, crime model or world clock. A direct visual comparison with the supplied image shows that the scene **does not yet match the reference's terrain and road composition**. It has not passed the visual or performance acceptance gates.

## Architecture before and after

| Concern | Integrated baseline | Organic experiment |
| --- | --- | --- |
| Terrain | Flat ground | Deterministic 61 × 61 continuous height field, bilinear sampling, hill/valley masks, protected Galleria plateau |
| Roads | 180 regular-grid road edges | 13 demand nodes and 21 hierarchical, cost-scored curved corridors; stable IDs and explicit 3D centerlines |
| Rendered roads | Existing grid meshes | Indexed `BufferGeometry` for asphalt, shoulders and junctions; PBR asphalt maps; instances for lane marks, viaduct supports and existing street-furniture assets |
| Navigation | Original pedestrian graph | Navigation edges are built from the same road centerlines, with offset walk paths and per-segment millimetre positions |
| Buildings | 110 buildings in original placements | 80 unchanged source assets/IDs placed with foundation elevations; original interior surface, entry, slot, Place and resource IDs are relocated with them |
| Galleria and blue overpass | Existing functional landmark | Original multi-level surfaces, portals, connectors, boxes and overpass data remain pinned; an organic road access joins the landmark |
| Simulation and replay | `SimulationStateV5` | Same engine and six-second Tick; terrain and road structure enter the world fingerprint. No crime decision code was changed. |

The road topology connects regional destinations directly. A bounded set of 3D corridor candidates is scored by path length, slope, curvature and building obstacles before the preferred curve is selected. This is not a general graph-search road planner or a full parcel generator. Ordinary road mesh edges sample the authoritative terrain independently to avoid cross-slope penetration. The viaduct uses its own elevated `surfaceId`, deck and two explicit ramp connectors; there is no implicit X/Z bridge-to-ground junction.

The organic scene derives terrain-height streetlights, trees, benches and planters from its road hierarchy and park footprint, using the existing instanced furniture renderer. Streetlight bulbs are emissive; this experiment does not add real-time point lights or change the shared lighting model.

Building placement and rendering are separate. `BuildingPlacementV1` stores a source `buildingId`, site ID, horizontal transform and foundation height. The renderer reuses the source building masses, windows, roofs and materials. Original interior polygons, entry and slot nodes are translated as a group; the ground approach is recomputed around blocked footprints. Galleria surfaces and the existing skybridge are copied from the baseline world. About 30 original buildings are **not yet placed** in this scene, so full source-city retention is an open item.

## Browser evidence

Captured with Google Chrome 156.0.8078.48, ANGLE Metal on Apple M4, 1440 × 900 CSS pixels, DPR 1, visual preview 21:00, simulation Tick 100 unless noted. These are real Chrome screenshots in the local ignored `.visual/` directory:

| View | File |
| --- | --- |
| Original city | `.visual/organic-before-integrated-1440x900.png` |
| Organic hero | `.visual/organic-hero-1440x900.png` |
| Road network from above | `.visual/organic-top-road-network-1440x900.png` |
| Junction close view | `.visual/organic-junction-close-1440x900.png` |
| Hill road at low pitch | `.visual/organic-hill-low-pitch-1440x900.png` |
| Viaduct | `.visual/organic-viaduct-close-1440x900.png` |
| Galleria and original overpass | `.visual/organic-galleria-close-1440x900.png` |
| Existing building assets on terrain | `.visual/organic-existing-buildings-on-hill-1440x900.png` |
| Navigation/height/slope | `.visual/organic-navigation-debug-1440x900.png`, `.visual/organic-terrain-height-debug-1440x900.png`, `.visual/organic-terrain-slope-debug-1440x900.png` |
| Computed route agent | `.visual/organic-agent-on-computed-route-1440x900.png` |

The script also captures bearings 0°, 90°, 180° and 270° and a 200-agent view. All output and raw measurements are in `.visual/organic-browser.json`. Reproduce with a local Vite server at port 5187 and `npm run visual:organic`; set `SHADOW_CITY_URL` to use another local port. Chrome visual inspection found the key mismatch: the reference is organized around visible ridges, valleys, contour roads, loops and long viaducts, while this scene is still a mostly flat square platform with a 13-node hand-authored ring and short bent links. Daylight comparison is recorded in `.visual/organic-reference-day-1440x900.png` and `.visual/organic-reference-top-1440x900.png`. The city is also sparse in the centre, and some curb endings remain abrupt. These are acceptance failures, not polish-only issues.

## Measured performance and route evidence

One matched Chrome run, 200 residents, fixed viewport/DPR/seed, measured the following. Frame intervals are short active-frame samples, **not GPU frame time**; memory figures exposed by the renderer are estimated source/buffer sizes, **not VRAM**.

| Measure | Integrated baseline | Organic v1 |
| --- | ---: | ---: |
| Static world generation | 91.7 ms | 234.4 ms |
| Navigation index construction | 4.9 ms | 1.9 ms |
| 100-agent draw calls / triangles | 211 / 223,071 | 205 / 124,190 |
| 200-agent draw calls / triangles | 211 / 223,831 | 206 / 124,918 |
| 200-agent Tick p95 (30 Ticks) | 15.7 ms | 30.5 ms |
| Tick 500 replay, 200 residents | 5.80 s | 5.85 s |
| 200-agent sampled active-frame p95 | 19.8 ms, 83 samples | 27.5 ms, 16 samples |

Tick and replay measurements varied substantially across successive Chrome runs (organic Tick p95 6.4–44.1 ms; replay 2.54–6.22 s). Static organic generation varied from 115–271 ms. The short intervals and loading/GC interference do not justify a stable FPS claim. A separate DevTools CPU sampling run over 200 Ticks recorded baseline Tick p95 26.7 ms and organic 15.6 ms **with profiling overhead**. In both cases the largest sample groups were `querySpatialCandidates`, `hashSeed`, social encounter lifecycle and typed crime processing. This does not prove an organic-only bottleneck. The 5 ms Tick and 2 s replay targets remain open. GPU frame time and true texture/VRAM usage were not available from this run.

The browser recorded a real `SimulationStateV5.citizens[].route` for `citizen-0020` at Tick 100: source `building:building-block-0-7-0-0`, curved road edges `walk:organic:road:05`, `:18`, `:10`, then workplace `building:building-block-6-0-0-0`. The planned route spans 6,221 mm of elevation. `SimulationSessionV5.inspectTick` reconstructed the same citizen's actual positions from Tick 100 to 180; the observed movement/arrival span was 1,003 mm and ended on the destination's preserved interior surface. This is state evidence, not a camera animation or scripted route.

## Acceptance matrix

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Existing asset geometry, materials and IDs | **PARTIALLY VERIFIED** | Unchanged for 80 placed buildings; 30 source buildings are absent from the experiment. |
| Existing Place/interior/Galleria/overpass identity | **VERIFIED** for placed assets | ID/function/slot preservation and connected Galleria tests; original city remains default. |
| Continuous hill, valley and flatter centre | **VERIFIED** for fixed seed | Terrain data tests, height/slope debug views and browser captures. |
| Hierarchical curved 3D roads | **VERIFIED** for fixed seed | 21 connected road edges, curved paths, maximum non-bridge road and viaduct ramp sample grades ≤12%. |
| General terrain-aware road planning and arbitrary-seed grade guarantee | **PARTIALLY VERIFIED** | Cost-scored candidate corridors; no full spatial route search or all-seed grade proof. |
| T/Y junctions and selected roundabout | **PARTIALLY VERIFIED** | Connected junction discs exist; no authored roundabout and some shoulder endings need finishing. |
| Viaduct and separate bridge surface | **VERIFIED** | Elevated deck, supports, explicit ramp graph, no automatic bridge-ground edge. |
| Terrain/road contact | **PARTIALLY VERIFIED** | Road mesh edges sample terrain; no complete cut/fill, embankment or clearance audit. |
| Building foundations and safe access | **PARTIALLY VERIFIED** | Placed-building/road overlap and surface-path checks pass; all-angle art review is incomplete. |
| Agent movement on curved/graded route | **VERIFIED** for sampled route | Browser route and deterministic position trace; generic all-route clearance remains unproved. |
| Deterministic generation, old replay and crime/God View regression | **VERIFIED** by automated tests | Versioned world fingerprint, old scenario test suite and new replay test. |
| Terrain LOD/chunking and full generation knobs | **NOT IMPLEMENTED** | One indexed mesh; the scene exposes a seed, while terrain step and road-planning values are code-level parameters rather than validated UI controls. |
| Full visual quality relative to supplied reference | **NOT IMPLEMENTED** | Direct daylight comparison fails on landform structure, contour-following roads, loops, long viaduct composition and non-square landscape boundary. |
| 200-agent performance target and hardware GPU timing | **BLOCKED** | Tick/replay above targets; Metal renderer identified, GPU frame time unavailable. |

## Reproduction and next work

`npm run typecheck`, `npm test`, and `npm run build` are the required regression commands. `node scripts/organic-profile.mjs` collects an optional Chrome CPU sample; the profile adds overhead and must not be treated as a frame-time benchmark. Keep PNGs ignored by Git, and do not replace the baseline or push this experiment before separate review.

Next passes must begin with a terrain-first composition: retain the Galleria as a flat protected core, design readable ridges and a valley outside it, then plan long arterials and local loops along contours with a viaduct crossing the valley. Roadbed grading, junction geometry, building placement and route tests should follow that spatial skeleton. The current 13-node perimeter-ring topology and small sine-bend candidate family should not be scaled up as the final generator. After that, finish curb geometry and frontage density, account for the remaining source buildings, expose validated generation controls, and run longer isolated performance tests with GPU timing where supported. The reference image is a direction for landscape and road composition; it does not license a claim of equivalent visual quality.
