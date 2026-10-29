# Twilight terrain development scene

## Scope and reference

`?world=dev` is an isolated terrain and road experiment derived from the 300 m integrated Shadow City. `?world=main` continues to use `heritage-extension-v6`; the original city generator, central plaza, Galleria, building asset geometry, simulation rules and world-time lighting remain on their existing paths. The dev generator has its own version and replay fingerprint. No assets or runtime dependencies were added.

The user-provided [`Twilight Isometric City Diorama.png`](references/characters/Twilight%20Isometric%20City%20Diorama.png) was inspected. It informed the rear terrace, lower left watercourse, graded roads and short bridges. The reference also has a much more organic whole-city street pattern than the current dev scene. The dev scene is an infrastructure vertical slice; its Hero composition is **not yet approved** as a visual match.

## Data flow

| Source | Dev behavior |
| --- | --- |
| `generateIntegratedWorld()` | Supplies the original city, Galleria, places and legacy compatible semantics. Main does not call the dev generator. |
| `DevTerrainV1` | Serializes a 2 m deterministic height grid, river control points, building pads and entries, road profile paths, bridge spans, culverts and non-walkable escarpment. `heightAtMm()` is shared by rendering and navigation. |
| `deriveDevRidgeRoad()` | Alters only the dev road graph: one terrain-constrained north road curves around a cleared ridge and enters a stable three-way junction. Its road profile, visible road and both sidewalks share the same path. |
| `generateDevWorld()` | Shifts ground and indoor nodes to the terrain, builds portal treads and bridge paths, excludes the channel and escarpment from ground navigation, and emits the versioned dev `WorldModelV2`. |
| `CityStaticScene` | Converts the authoritative terrain and road profiles into indexed ground, water, road, sidewalk and bridge meshes, plus shared/instanced landscape details and building foundations. |

The original 300 m city remains the placement base. The dev scene clears only the channel and ridge test blocks to make the terrain and bridge clearance physically possible. Retained building IDs, meshes and functional places are unchanged. This is a deliberate prototype exception to full building retention, not a new default map.

The ridge route fixture starts at `ped-entrance-building-block-4-0-0-0`, crosses `dev-ped:ridge-west`, and reaches the existing north-side `ped-block-3--1-3-0` through `dev-ped:ridge-northwest-link`. The route is computed with `findRouteV2` and driven tick by tick through the production `moveCitizenOneTick` function; its traced height changes by more than 1 m, reaches the target without a blocked step, and uses legal ground surfaces. This proves the movement path, not that a naturally scheduled citizen happened to choose it during the screenshot fixture.

## Repeatable review

With a local Vite server on port 5174, run `npm run visual:twilight`. The script opens Google Chrome at seed `shadow-city-hero-01`, 1440 × 900 CSS pixels, DPR 1, visual preview 18:00, and captures main/dev Hero, both road bridges, the ridge road, four cardinal bearings, top-down, low-pitch, navigation and 390 × 844 narrow views. Screenshots and `report.json` are saved under ignored `.visual/twilight-dev/`. Set `SHADOW_CITY_VISUAL_TIME=16:00` and `SHADOW_CITY_VISUAL_OUTPUT=.visual/twilight-dev-afternoon` for a brighter diagnostic capture. The preview changes lighting only, not simulation time.

The local Chrome pass used `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`. Browser screenshots were opened and compared with the reference. The main and dev fingerprints differed; the main fingerprint remained `world-v2:heritage-extension-v6:b287e2c5:sim-v5:866f757e` in the zero-population visual fixture. No browser page or console errors were reported. The fixed visual fixture has no agents and therefore does not establish populated performance.

For populated measurements run `node scripts/twilight-dev-performance.mjs`. It writes a separate ignored report at `.visual/twilight-performance/report.json`. It measures Chrome render frames, rAF intervals, draw calls, triangles, simulation Tick timings and Tick 500 replay for 100 and 200 citizens in both main and dev. `performance.memory` is JS heap only; texture source bytes and JS heap are not GPU memory.

The serial Chrome 156 / Apple M4 run at 1440 × 900, DPR 1, high quality, 18:00 preview gave:

| World | Citizens | Rendered FPS (3 s) | p95 frame interval | Draw calls / triangles | Tick 100→200 p95 | Tick 500 replay |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Main | 100 | 59.4 | 16.8 ms | 211 / 223,071 | 4.3 ms | 1.01 s |
| Main | 200 | 56.8 | 33.3 ms | 213 / 224,055 | 6.8 ms | 2.68 s |
| Dev | 100 | 58.6 | 16.8 ms | 219 / 288,211 | 4.0 ms | 1.08 s |
| Dev | 200 | 57.9 | 16.8 ms | 221 / 289,171 | 7.2 ms | 2.91 s |

The dev 200-citizen Tick and replay still exceed the existing 5 ms / 2 s reference gates. These are single, short local samples; they do not isolate GPU frame time, texture VRAM or variance across devices. The populated screenshots were not used to assert that a particular citizen traversed the new ridge route.

## Acceptance status

| Gate | Current result |
| --- | --- |
| Main world and replay isolation | **Verified by tests and browser fingerprint:** main stays on `heritage-extension-v6`; dev uses `twilight-dev-v2`. |
| Deterministic 3D terrain and legal access | **Verified by tests:** same seed reproduces the world; grade, building pad, stair portal, bridge surface, navigation clearance and alternative seeds are covered. |
| Road and sidewalk agreement | **Verified for the ridge slice:** a real three-way road junction and two-sided walkway use one path and connect to the existing network. Other inherited streets remain grid based. |
| Bridge and valley visual alignment | **Partially verified:** two road bridges cross the channel and no longer have large rocks on their road surfaces. The channel and bridge banks still read as a sequence of emptied square blocks at Hero scale. |
| Reference-level organic Hero composition | **Open:** repeated right-angle blocks dominate the current 1440 × 900 Hero view. The north terrace and new curve are legible in close views but too subtle behind buildings in the full view. |
| Camera, top-down, cardinal bearings, narrow viewport | **Browser inspected:** captures exist. A pre-existing sky sphere clipping artifact at high pitch was fixed and checked in main and dev; narrow view still makes the city small. |
| 100–200-citizen hardware GPU performance | **Measured, budget open:** dev 200 rendered about 57.9 FPS, but Tick p95 was 7.2 ms and Tick 500 replay was 2.91 s. See the separate report. |

## Open architecture question

Making the whole Hero street network non-orthogonal while retaining the existing building identities and Galleria requires a dev-only city layout pass **before** integrated static world construction. The current pedestrian generator assumes rectangular blocks, south-facing entrances and grid edge IDs; post-hoc visual road warping would break crossings and building access. A citywide re-layout needs a graph-driven pedestrian network and static-semantic rebuild. Until then, do not call this a complete organic-city conversion or use the current screenshot as evidence of reference fidelity.
