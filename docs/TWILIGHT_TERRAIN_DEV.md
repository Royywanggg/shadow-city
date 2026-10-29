# Twilight terrain development scene

## Scope and reference

`?world=dev` is an isolated terrain and road experiment derived from the 300 m integrated Shadow City. `?world=main` continues to use `heritage-extension-v6`; the original city generator, central plaza, Galleria, building asset geometry, simulation rules and world-time lighting remain on their existing paths. The dev generator has its own version and replay fingerprint. No assets or runtime dependencies were added.

The user-provided [`Twilight Isometric City Diorama.png`](references/characters/Twilight%20Isometric%20City%20Diorama.png) was inspected. It informed the rear terrace, lower left watercourse, graded roads and short bridges. The reference also has a much more organic whole-city street pattern than the current dev scene. The dev scene is an infrastructure vertical slice; its Hero composition is **not yet approved** as a visual match.

## Data flow

| Source | Dev behavior |
| --- | --- |
| `createDevOrganicLayout()` → `generateIntegratedWorld({ baseCity })` | Moves selected dev-only road nodes, blocks, parcels, entrances and street features together before rebuilding the pedestrian graph and semantic places. The injected city must have the same seed and 300 m extent. Main takes the original generation path. |
| `deriveDevRoadCorridor()` → `placeDevCorridorParcels()` | Defines three 8 m S bends on shared road nodes, then fits twelve adjacent polygonal blocks, parcels, buildings and entrances against those same centrelines. Two constrained buildings are deterministically regenerated on narrower parcels; their IDs, kinds and place semantics remain stable. The pedestrian rings and crossing curbs follow the polygon and road graph. |
| `DevTerrainV1` | Serializes a 2 m deterministic height grid, shared curved escarpment contours, a channel with explicit `fullDepthZmm`, building pads and entries, road profiles, bridge spans and culverts. `heightAtMm()` is shared by rendering and navigation. |
| `deriveDevRidgeRoad()` | Alters only the dev road graph: one terrain-constrained north road curves around a cleared ridge and enters a stable three-way junction. Its road profile, visible road and both sidewalks share the same path. |
| `generateDevWorld()` | Shifts ground and indoor nodes to the terrain, builds portal treads and bridge paths, excludes the channel and escarpment from ground navigation, and emits the versioned dev `WorldModelV2`. |
| `CityStaticScene` | Converts the authoritative terrain and road profiles into indexed ground, water, road, sidewalk and bridge meshes, plus shared/instanced landscape details and building foundations. |

The original 300 m city remains the placement base. The dev scene clears the channel and ridge test blocks to make terrain and bridge clearance possible. Other building IDs, local masses, windows and functional places remain; selected outer and approach buildings move with their blocks. The plaza and Galleria blocks, channel and ridge anchors stay fixed. This is a prototype exception to full building retention, not a new default map.

The first dev layout pass retains rectangular blocks and south-facing entrances, with shared road-node offsets of about 4 m inside the city and 5 m at the perimeter. A second pass now gives twelve blocks explicit polygon footprints beside the north-east, central-south and south-east 8 m bends. Their road ribbons, sidewalk rings, crossings and navigation use the same centreline data. The café `building-block-3-4-0-0` narrows from about 37.62 to 31.63 m, and the home `building-block-3-5-1-0` from about 18.64 to 15.23 m; all other retained building masses and windows remain unchanged. Fixed and two alternate seed tests check road clearance, connected pedestrian paths and entrance access. Whole-district organic topology still needs frontage-aware entrances and graph-driven blocks; a render-only bend would desynchronize the graph.

The ridge route fixture starts at `ped-entrance-building-block-4-0-0-0`, crosses `dev-ped:ridge-west`, and reaches the existing north-side `ped-block-3--1-3-0` through `dev-ped:ridge-northwest-link`. The route is computed with `findRouteV2` and driven tick by tick through the production `moveCitizenOneTick` function; its traced height changes by more than 1 m, reaches the target without a blocked step, and uses legal ground surfaces. This proves the movement path, not that a naturally scheduled citizen happened to choose it during the screenshot fixture.

## Repeatable review

With a local Vite server on port 5174, run `npm run visual:twilight`. The script opens Google Chrome at seed `shadow-city-hero-01`, 1440 × 900 CSS pixels, DPR 1, visual preview 18:00, and captures main/dev Hero, close views of the three curved corridors, both road bridges, the outfall, ridge road, four cardinal bearings, top-down, low-pitch, navigation and 390 × 844 narrow views. Screenshots and `report.json` are saved under ignored `.visual/twilight-dev/`. Set `SHADOW_CITY_VISUAL_TIME=16:00` and `SHADOW_CITY_VISUAL_OUTPUT=.visual/twilight-dev-afternoon` for a brighter diagnostic capture. The preview changes lighting only, not simulation time.

The local Chrome pass used `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`. Browser screenshots were opened and compared with the reference. The main and dev fingerprints differed; the main fingerprint remained `world-v2:heritage-extension-v6:b287e2c5:sim-v5:866f757e` in the zero-population visual fixture. No browser page or console errors were reported. The fixed visual fixture has no agents and therefore does not establish populated performance.

For populated measurements run `node scripts/twilight-dev-performance.mjs`. It writes a separate ignored report at `.visual/twilight-performance/report.json`; set `SHADOW_CITY_PERF_OUTPUT` to retain another run. It measures Chrome render frames, rAF intervals, draw calls, triangles, simulation Tick timings and Tick 500 replay for 100 and 200 citizens in both main and dev. `performance.memory` is JS heap only; texture source bytes and JS heap are not GPU memory.

The latest serial Chrome 156 / Apple M4 run for `twilight-dev-v5` at 1440 × 900, DPR 1, high quality, 18:00 preview gave:

| World | Citizens | Rendered FPS (3 s) | p95 frame interval | Draw calls / triangles | Tick 100→200 p95 | Tick 500 replay |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Main | 100 | 59.1 | 16.8 ms | 211 / 223,071 | 2.9 ms | 0.96 s |
| Main | 200 | 56.8 | 33.3 ms | 213 / 224,055 | 7.1 ms | 2.63 s |
| Dev | 100 | 59.4 | 16.8 ms | 220 / 289,787 | 3.0 ms | 1.02 s |
| Dev | 200 | 58.1 | 16.8 ms | 222 / 290,747 | 7.0 ms | 2.77 s |

The prior v3 run measured main/dev 200 at 43.4/34.8 FPS, Tick p95 22.9/17.6 ms and replay 6.88/6.27 s; an earlier run reached 56.8/57.9 FPS. Both worlds vary materially between short local samples, so these results cannot isolate terrain as the cause. The v5 sample clears the 50 FPS and 33 ms dev targets, but misses the 5 ms Tick and 2 s replay targets for 200 citizens. GPU frame time and VRAM were unavailable. The populated measurements do not establish that a naturally scheduled citizen traversed a particular curved road.

## Acceptance status

| Gate | Current result |
| --- | --- |
| Main world and replay isolation | **Verified by tests and browser fingerprint:** main stays on `heritage-extension-v6`; dev uses `twilight-dev-v5`. |
| Deterministic 3D terrain and legal access | **Verified by tests:** same seed reproduces the world; grade, building pad, stair portal, bridge surface, road curb, navigation clearance and two alternative seeds are covered. |
| Road and sidewalk agreement | **Verified for three S corridors and the ridge:** moved road nodes, road meshes, polygon sidewalk rings, crossing curbs and connected navigation derive from one dev city. Browser close views still show abrupt square junction paving and lane marks through some junctions. The rest of the lattice remains rectangular. |
| Bridge and valley visual alignment | **Partially verified in Chrome:** two bridges cross the channel, large roadside rock clipping is gone, and the bright platform-edge wedge is closed. The valley still reads as several cleared rectangular blocks at Hero scale. |
| Reference-level organic Hero composition | **Open after actual Chrome review:** the three bends are visible close up but barely change the 1440 × 900 Hero. The city remains grid-dominant; the north highland is split into three pieces by inherited streets and its relief is mostly hidden by buildings. A terrain-only highland treatment was tested in Chrome and reverted because it did not improve Hero. This does not yet match the reference. |
| Camera, top-down, cardinal bearings, narrow viewport | **Browser inspected:** captures exist. A pre-existing sky sphere clipping artifact at high pitch was fixed and checked in main and dev; narrow view still makes the city small. |
| 100–200-citizen hardware GPU performance | **Measured, budget open:** latest dev 200 sample rendered 58.1 FPS with p95 frame interval 16.8 ms, Tick p95 7.0 ms and Tick 500 replay 2.77 s. Short runs vary substantially; see the separate report and avoid attributing the difference without a controlled machine-load baseline. |

## Open architecture question

The dev-only layout pass runs **before** integrated static world construction. Local polygon blocks now prove that 8 m bends can retain the static graph and most original buildings. The citywide barrier is the remaining grid-indexed block adjacency, axis-aligned parcels, south-facing entrances and whole-block river/highland clearing. All five buildings originally in the four cleared channel blocks intersect the present channel centreline; at least 23 original pedestrian edges cross its forbidden strip. They cannot safely be restored in place. A broad rear terrace requires coordinated building, road-grade and navigation recomposition; merely raising the terrain broke a real stair landing in a controlled experiment. Next implementation should add a dev spatial plan with graph-driven polygon blocks and frontage-aware entrances, then replan the river corridor and highland. Until then, do not call this a complete organic-city conversion or use the current screenshot as evidence of reference fidelity.
