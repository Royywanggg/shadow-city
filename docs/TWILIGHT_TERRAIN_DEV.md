# Twilight terrain development scene

## Scope and reference

`?world=dev` is an isolated terrain and road experiment derived from the 300 m integrated Shadow City. `?world=main` continues to use `heritage-extension-v6`; the original city generator, central plaza, Galleria, building asset geometry, simulation rules and world-time lighting remain on their existing paths. The dev generator has its own version and replay fingerprint. No assets or runtime dependencies were added.

The user-provided [`Twilight Isometric City Diorama.png`](references/characters/Twilight%20Isometric%20City%20Diorama.png) was inspected. It informed the rear terrace, lower left watercourse, graded roads and short bridges. The reference also has a much more organic whole-city street pattern than the current dev scene. The dev scene is an infrastructure vertical slice; its Hero composition is **not yet approved** as a visual match.

## Data flow

| Source | Dev behavior |
| --- | --- |
| `createDevOrganicLayout()` → `generateIntegratedWorld({ baseCity })` | Moves selected dev-only road nodes, blocks, parcels, entrances and street features together before rebuilding the pedestrian graph and semantic places. The injected city must have the same seed and 300 m extent. Main takes the original generation path. |
| `deriveDevRoadCorridor()` → `placeDevCorridorParcels()` | Defines three 8 m S bends on shared road nodes, then fits twelve adjacent polygonal blocks, parcels, buildings and entrances against those same centrelines. Two constrained buildings are deterministically regenerated on narrower parcels; their IDs, kinds and place semantics remain stable. The pedestrian rings and crossing curbs follow the polygon and road graph. |
| `applyDevValleyPlan()` → `createDevValleyChannel()` | Extends a 6 m lateral river bend over 54 m between two bridges. Both flanking road centrelines, bridge nodes, nine polygon blocks, parcels, street features, terrain channel and legal pedestrian paths use one plan. The curved park surface, path and trees stay within its authoritative footprint. |
| `DevTerrainV1` | Serializes a 2 m deterministic height grid, shared curved escarpment contours, a channel with explicit `fullDepthZmm`, building pads and entries, road profiles, bridge spans and culverts. `heightAtMm()` is shared by rendering and navigation. |
| `deriveDevRidgeRoad()` | Alters only the dev road graph: one terrain-constrained north road curves around a cleared ridge and enters a stable three-way junction. Its road profile, visible road and both sidewalks share the same path. |
| `generateDevWorld()` | Shifts ground and indoor nodes to the terrain, builds portal treads and bridge paths, excludes the channel and escarpment from ground navigation, and emits the versioned dev `WorldModelV2`. |
| `CityStaticScene` | Converts the authoritative terrain and road profiles into indexed ground, water, road, sidewalk and bridge meshes, plus shared/instanced landscape details and building foundations. Curved four-way junctions derive fitted asphalt, paving, curb corners and lane-mark termination from the same road profiles. |

The original 300 m city remains the placement base. The dev scene clears the channel and ridge test blocks to make terrain and bridge clearance possible. Other building IDs, local masses, windows and functional places remain; selected outer and approach buildings move with their blocks. The plaza and Galleria blocks, channel and ridge anchors stay fixed. This is a prototype exception to full building retention, not a new default map.

The first dev layout pass retains rectangular blocks and south-facing entrances, with shared road-node offsets of about 4 m inside the city and 5 m at the perimeter. Subsequent passes give twelve corridor blocks and nine valley blocks polygon footprints beside shared curved roads. Their road ribbons, sidewalk rings, crossings and navigation use the same centreline data. The café `building-block-3-4-0-0` narrows from about 37.62 to 31.63 m, and the home `building-block-3-5-1-0` from about 18.64 to 15.23 m; other retained buildings keep their IDs, role and visual language. Fixed and two alternate seed tests check road clearance, connected pedestrian paths and entrance access. Four-face entrance and interior portal support now exists, but no dev building has been assigned a non-south entrance. The hero/lookdev asset renderers still assume south-facing entry geometry, so assigning those alternate faces requires a separate visual integration pass.

The ridge route fixture starts at `ped-entrance-building-block-4-0-0-0`, crosses `dev-ped:ridge-west`, and reaches the existing north-side `ped-block-3--1-3-0` through `dev-ped:ridge-northwest-link`. The route is computed with `findRouteV2` and driven tick by tick through the production `moveCitizenOneTick` function; its traced height changes by more than 1 m, reaches the target without a blocked step, and uses legal ground surfaces. This proves the movement path, not that a naturally scheduled citizen happened to choose it during the screenshot fixture.

## Repeatable review

With a local Vite server on port 5174, run `npm run visual:twilight`. The script opens Google Chrome at seed `shadow-city-hero-01`, 1440 × 900 CSS pixels, DPR 1, visual preview 18:00, and captures main/dev Hero, close views of the three curved corridors, both road bridges, the valley, outfall, ridge road, four cardinal bearings, top-down, low-pitch, navigation and 390 × 844 narrow views. Screenshots and `report.json` are saved under ignored `.visual/twilight-dev/`. Set `SHADOW_CITY_VISUAL_TIME=16:00` and `SHADOW_CITY_VISUAL_OUTPUT=.visual/twilight-dev-afternoon` for a brighter diagnostic capture. The preview changes lighting only, not simulation time.

The `twilight-dev-v6` Chrome 156 / Apple M4 pass used `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`. Its 18:00 screenshots and report are in ignored `.visual/twilight-district-valley-v4/`. Browser screenshots were opened and compared with the reference. The main fingerprint remained `world-v2:heritage-extension-v6:b287e2c5:sim-v5:866f757e`; dev was `world-v2:twilight-dev-v6:870804e2:sim-v5:866f757e` in the zero-population fixture. No browser page or console errors were reported. A 16:00 north-terrace experiment was also inspected in `.visual/twilight-highland-experiment/` and reverted because the Hero still read as separate mounds. The fixed visual fixtures have no agents and do not establish populated performance.

For populated measurements run `node scripts/twilight-dev-performance.mjs`. It writes a separate ignored report at `.visual/twilight-performance/report.json`; set `SHADOW_CITY_PERF_OUTPUT` to retain another run. It measures Chrome render frames, rAF intervals, draw calls, triangles, simulation Tick timings and Tick 500 replay for 100 and 200 citizens in both main and dev. `performance.memory` is JS heap only; texture source bytes and JS heap are not GPU memory.

Two serial Chrome 156 / Apple M4 runs for `twilight-dev-v6` at 1440 × 900, DPR 1, high quality, 18:00 preview gave the following first/repeat ranges. Reports are in ignored `.visual/twilight-performance/v6-valley-report.json` and `v6-valley-repeat.json`.

| World | Citizens | Rendered FPS (3 s) | p95 frame interval | Draw calls / triangles | Tick 100→200 p95 | Tick 500 replay |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Main | 100 | 39.5 / 40.3 | 83.3 / 83.3 ms | 211 / 223,071 | 7.4 / 8.9 ms | 2.64 / 3.23 s |
| Main | 200 | 38.9 / 38.8 | 100 / 100 ms | 213 / 224,055 | 33.1 / 21.9 ms | 5.70 / 6.26 s |
| Dev | 100 | 37.5 / 36.9 | 83.3 / 83.4 ms | 217 / 289,533 | 9.3 / 9.9 ms | 2.25 / 2.32 s |
| Dev | 200 | 37.1 / 35.6 | 116.6 / 116.6 ms | 220 / 290,605 | 24.8 / 16.9 ms | 5.64 / 5.73 s |

The previous v5 run measured main/dev 200 at 59.5/58.0 FPS with p95 frame interval 16.7/16.8 ms. Both worlds slowed substantially in the two v6 runs even though the main fingerprint and main draw counts remained unchanged. These observations do not isolate a terrain regression from machine load, browser pacing or simulation cost. **The 200-citizen frame, Tick and replay targets remain open.** GPU frame time and VRAM were unavailable. The populated measurements do not establish that a naturally scheduled citizen traversed a particular curved road.

## Acceptance status

| Gate | Current result |
| --- | --- |
| Main world and replay isolation | **Verified by tests and browser fingerprint:** main stays on `heritage-extension-v6`; dev uses `twilight-dev-v6`. |
| Deterministic 3D terrain and legal access | **Verified by tests:** same seed reproduces the world; grade, building pad, stair portal, bridge surface, road curb, navigation clearance and two alternative seeds are covered. |
| Road and sidewalk agreement | **Verified for three S corridors, the ridge and paired valley roads:** moved road nodes, road meshes, polygon sidewalk rings, crossing curbs and connected navigation derive from one dev city. Curved four-way junctions close the asphalt, paving and curb corners, and lane marks stop before the intersection; fixed Chrome close views were inspected. Other unmodified junctions remain on their legacy geometry. The rest of the lattice remains rectangular. |
| Bridge and valley visual alignment | **Partially verified in Chrome:** a 6 m lateral river bend now spans 54 m and both bridge nodes, flanking roads and parcel boundaries move with it. Two bridges cross the channel without the earlier bank fold. The polygon park no longer paints a rectangle over its curved boundary. Close views still show a deep, regular basin; the Hero valley remains small relative to the reference. |
| Reference-level organic Hero composition | **Open after actual Chrome review:** local bends are visible close up but the 1440 × 900 Hero is still grid-dominant. The north highland remains split by inherited streets and partly hidden by buildings. A second terrain-only treatment passed clearance tests but still looked like separate mounds in Chrome, so it was reverted. This does not yet match the reference. |
| Camera, top-down, cardinal bearings, narrow viewport | **Browser inspected:** captures exist. A pre-existing sky sphere clipping artifact at high pitch was fixed and checked in main and dev; narrow view still makes the city small. |
| 100–200-citizen hardware GPU performance | **Measured twice, budget open:** dev 200 rendered 37.1 / 35.6 FPS; Tick p95 was 24.8 / 16.9 ms and Tick 500 replay 5.64 / 5.73 s. Main slowed in the same sessions. Use the paired reports; do not attribute the whole difference to dev terrain without a controlled baseline. |

## Open architecture question

The dev-only layout pass runs **before** integrated static world construction. Local polygon blocks and the paired river corridor prove that curved roads can retain the static graph and most original buildings. Four-face pedestrian access and interior portals now exist, but asset renderers and dev placement do not yet exercise non-south entrances. The wider barriers are the inherited rectangular lattice, axis-aligned parcels, south-facing asset entry visuals and whole-block highland clearing. All five buildings originally in the four cleared channel blocks intersect the channel centreline; at least 23 old pedestrian edges cross its forbidden strip. A broad rear terrace needs coordinated road grade, building frontage and navigation recomposition. A tunnel would require explicit traversable road surfaces under nonwalkable terrain; merely raising the ground broke a stair landing in an earlier experiment. Until a citywide spatial redesign passes the Hero review, do not call this a complete organic-city conversion or use the current screenshot as evidence of reference fidelity.
