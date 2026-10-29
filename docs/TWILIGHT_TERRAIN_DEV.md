# Twilight terrain development scene

## Scope and reference

`?world=dev` is an isolated terrain and road experiment derived from the 300 m integrated Shadow City. `?world=main` continues to use `heritage-extension-v6`; the original city generator, central plaza, Galleria, building asset geometry, simulation rules and world-time lighting remain on their existing paths. The dev generator has its own version and replay fingerprint. No assets or runtime dependencies were added.

The user-provided [`Twilight Isometric City Diorama.png`](references/characters/Twilight%20Isometric%20City%20Diorama.png) was inspected. It informed the rear terrace, lower left watercourse, graded roads and short bridges. The reference also has a much more organic whole-city street pattern than the current dev scene. The dev scene is an infrastructure vertical slice; its Hero composition is **not yet approved** as a visual match.

## Data flow

| Source | Dev behavior |
| --- | --- |
| `createDevOrganicLayout()` → `generateIntegratedWorld({ baseCity })` | Moves selected dev-only road nodes, blocks, parcels, entrances and street features together before rebuilding the pedestrian graph and semantic places. The injected city must have the same seed and 300 m extent. Main takes the original generation path. |
| `DevTerrainV1` | Serializes a 2 m deterministic height grid, shared curved escarpment contours, a channel with explicit `fullDepthZmm`, building pads and entries, road profiles, bridge spans and culverts. `heightAtMm()` is shared by rendering and navigation. |
| `deriveDevRidgeRoad()` | Alters only the dev road graph: one terrain-constrained north road curves around a cleared ridge and enters a stable three-way junction. Its road profile, visible road and both sidewalks share the same path. |
| `generateDevWorld()` | Shifts ground and indoor nodes to the terrain, builds portal treads and bridge paths, excludes the channel and escarpment from ground navigation, and emits the versioned dev `WorldModelV2`. |
| `CityStaticScene` | Converts the authoritative terrain and road profiles into indexed ground, water, road, sidewalk and bridge meshes, plus shared/instanced landscape details and building foundations. |

The original 300 m city remains the placement base. The dev scene clears the channel and ridge test blocks to make terrain and bridge clearance possible. Other building IDs, local masses, windows and functional places remain; selected outer and approach buildings move with their blocks. The plaza and Galleria blocks, channel and ridge anchors stay fixed. This is a prototype exception to full building retention, not a new default map.

The dev layout retains the rectangular `CityBlock` and south-facing entrance model. Shared road-node offsets reach about 4 m inside the city and 5 m at the perimeter. Every derived block sidewalk ring has at least 0.25 m to its road curb; building footprints have at least 0.3 m beyond half the adjacent road width; all retained entrances are reachable. A 1.5× internal offset failed parcel or stair-landing checks on fixed and alternate seeds. Larger 8–12 m district curves need a different block/parcel placement model; increasing a render-only bend would desynchronize the graph.

The ridge route fixture starts at `ped-entrance-building-block-4-0-0-0`, crosses `dev-ped:ridge-west`, and reaches the existing north-side `ped-block-3--1-3-0` through `dev-ped:ridge-northwest-link`. The route is computed with `findRouteV2` and driven tick by tick through the production `moveCitizenOneTick` function; its traced height changes by more than 1 m, reaches the target without a blocked step, and uses legal ground surfaces. This proves the movement path, not that a naturally scheduled citizen happened to choose it during the screenshot fixture.

## Repeatable review

With a local Vite server on port 5174, run `npm run visual:twilight`. The script opens Google Chrome at seed `shadow-city-hero-01`, 1440 × 900 CSS pixels, DPR 1, visual preview 18:00, and captures main/dev Hero, both road bridges, the outfall, ridge road, four cardinal bearings, top-down, low-pitch, navigation and 390 × 844 narrow views. Screenshots and `report.json` are saved under ignored `.visual/twilight-dev/`. Set `SHADOW_CITY_VISUAL_TIME=16:00` and `SHADOW_CITY_VISUAL_OUTPUT=.visual/twilight-dev-afternoon` for a brighter diagnostic capture. The preview changes lighting only, not simulation time.

The local Chrome pass used `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`. Browser screenshots were opened and compared with the reference. The main and dev fingerprints differed; the main fingerprint remained `world-v2:heritage-extension-v6:b287e2c5:sim-v5:866f757e` in the zero-population visual fixture. No browser page or console errors were reported. The fixed visual fixture has no agents and therefore does not establish populated performance.

For populated measurements run `node scripts/twilight-dev-performance.mjs`. It writes a separate ignored report at `.visual/twilight-performance/report.json`; set `SHADOW_CITY_PERF_OUTPUT` to retain another run. It measures Chrome render frames, rAF intervals, draw calls, triangles, simulation Tick timings and Tick 500 replay for 100 and 200 citizens in both main and dev. `performance.memory` is JS heap only; texture source bytes and JS heap are not GPU memory.

The latest serial Chrome 156 / Apple M4 run at 1440 × 900, DPR 1, high quality, 18:00 preview gave:

| World | Citizens | Rendered FPS (3 s) | p95 frame interval | Draw calls / triangles | Tick 100→200 p95 | Tick 500 replay |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Main | 100 | 45.2 | 83.3 ms | 211 / 223,071 | 8.4 ms | 2.22 s |
| Main | 200 | 43.4 | 83.3 ms | 213 / 224,055 | 22.9 ms | 6.88 s |
| Dev | 100 | 36.2 | 99.9 ms | 220 / 294,397 | 9.3 ms | 2.53 s |
| Dev | 200 | 34.8 | 116.7 ms | 222 / 295,357 | 17.6 ms | 6.27 s |

An earlier local run on the same machine reported 56.8 FPS for main 200 and 57.9 FPS for dev 200, with Tick p95 6.8/7.2 ms and Tick 500 replay 2.68/2.91 s. A first late run measured main/dev 200 at 39.3/33.9 FPS, Tick p95 14.2/18.5 ms and replay 5.83/6.88 s; the table shows a repeat with similar degraded frame pacing. Both worlds slowed substantially, so the difference is not evidence that the new terrain alone caused the change. Every run misses at least the 200-citizen Tick and replay reference gates. These short samples do not isolate GPU frame time, texture VRAM, machine contention or variance across devices. The populated screenshots were not used to assert that a particular citizen traversed the new ridge route.

## Acceptance status

| Gate | Current result |
| --- | --- |
| Main world and replay isolation | **Verified by tests and browser fingerprint:** main stays on `heritage-extension-v6`; dev uses `twilight-dev-v3`. |
| Deterministic 3D terrain and legal access | **Verified by tests:** same seed reproduces the world; grade, building pad, stair portal, bridge surface, road curb, navigation clearance and two alternative seeds are covered. |
| Road and sidewalk agreement | **Verified for selected approaches and the ridge:** moved road nodes, road meshes, sidewalk crossing curbs and connected navigation derive from one dev city. The rest of the lattice remains rectangular. |
| Bridge and valley visual alignment | **Partially verified in Chrome:** two bridges cross the channel, large roadside rock clipping is gone, and the bright platform-edge wedge is closed. The valley still reads as several cleared rectangular blocks at Hero scale. |
| Reference-level organic Hero composition | **Open after actual Chrome review:** the city remains grid-dominant; the north highland is split into three pieces by inherited streets and its relief is mostly hidden by buildings. This does not yet match the reference. |
| Camera, top-down, cardinal bearings, narrow viewport | **Browser inspected:** captures exist. A pre-existing sky sphere clipping artifact at high pitch was fixed and checked in main and dev; narrow view still makes the city small. |
| 100–200-citizen hardware GPU performance | **Measured, budget open:** latest dev 200 sample rendered 34.8 FPS, Tick p95 17.6 ms and Tick 500 replay 6.27 s; a prior sample was faster for both main and dev. See the separate report and avoid attributing the difference without a controlled machine-load baseline. |

## Open architecture question

The dev-only layout pass now runs **before** integrated static world construction and the pedestrian crossing curbs use the actual road direction. The remaining citywide barrier is the rectangular block/parcel model, south-facing entrances and grid edge IDs. Meaningfully curving whole districts while retaining every original building requires polygonal or otherwise flexible parcels, frontage-aware entrances, a graph-driven pedestrian network and a static-semantic rebuild. A broad continuous rear terrace also needs buildings, road grades and navigation to be recomposed across more than the three cleared test blocks. Until then, do not call this a complete organic-city conversion or use the current screenshot as evidence of reference fidelity.
