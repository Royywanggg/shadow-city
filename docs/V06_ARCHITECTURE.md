# Shadow City v0.6 — original-map integration

## Corrected product boundary

The v0.6 default is an extension of the existing `shadow-city-hero-01` city. `generateCity()` remains unchanged, and its original 212 × 212 m roads, civic plaza, parks, building families, lighting and hero camera are the base. One building in `block-4-3`, immediately east of the plaza, gives way to a two-level Galleria. The original pedestrian network is regenerated for that single changed block and extended with portals, a ground crossing and a short skybridge. No independent replacement city is shown by default.

The earlier 320 × 320 m `district-world-v1` work is retained only at `?world=prototype`; its screenshots and experiment files are prototype records. `?world=legacy` or `?model=v4` opens the old v0.5.2 simulation on the unmodified original city. The local pre-v0.6 state remains on `codex/v052-baseline` (`6e155eb`). Neither v4 state nor its replay is migrated in place.

```text
generateCity(seed) → original CityModel → one-block Galleria adaptation
                                  ↓
                          WorldModelV2 (static)
                         /       |         \
        original city renderer   3D routes   semantic places
                         \       |         /
                         SimulationStateV5 (dynamic)
                           ↙             ↘
              researcher God View     report-only observer view
```

`src/world/generation/generateIntegratedWorld.ts` owns the adapter. The resulting `WorldModelV2` carries the retained `CityModel` as `baseCity`, the original road node/edge IDs and positions, 53 retained buildings, and an overlay describing the Galleria and connectors. `CityStaticScene` renders the original roads, facades, plaza, street furniture, lights and materials; `WorldSceneV2` adds only the new structure and dynamic markers. The renderer does not invent route positions or change the static world during simulation.

## Spatial and behavioural model

Authoritative coordinates are integer millimetres (1 world unit = 1 metre). `surfaceId` determines spatial membership. Ground, L1, indoor building places, shops and the L0–L1 connectors have distinct IDs; equal X/Z coordinates do not imply contact across floors. Original visible building doors are associated with building portals. Twenty-one home buildings supply 16 deterministic indoor slots each; the 200-person initial population occupies distinct slots. Public plaza and park slots come from the original pedestrian anchors.

The Galleria has L0/L1 corridors, an open upper atrium, two shops/cafés on each level, a stair and a one-way escalator. Its L0 entrance is connected to a new ground crossing over the existing avenue. Its L1 entrance meets the short skybridge; a plaza stair and ramp reach the bridge. Closing bridge entry still leaves the ground crossing and interior connectors available. Access commands, reservations, waiting and connector occupancy are simulation state, never static geometry mutations.

`src/world/navigation/routeV2.ts` now builds one deterministic, integer-cost shortest-path tree per citizen decision and answers all candidate destinations from it. A binary heap avoids rescanning the larger original pedestrian network for each destination. Personal access/cost parameters, previous-Tick crowding and stable edge ties remain part of route choice. On the same machine, the integrated 200-person run through Tick 100 fell from about 6.7 seconds before this route-tree change to about 0.37 seconds afterward. This measurement is a local implementation check, not a browser frame metric.

`SimulationStateV5` still owns activities, three-dimensional movement, one-second contact traces, opportunity episodes, offences and reports. A real citizen or named place resource is required for an opportunity. Bridge presence cannot create a scripted offence. Reports reveal only delivered, observed fields; the researcher Population Inspector retains full truth at the inspected Tick. Identity/appearance, activity, offending and reporting use separate deterministic inputs. Replay fingerprints include the derived world structure, source `CityModel`, simulation parameters and ordered commands; mismatches are rejected.

## Verification and evidence

The original-map integration has focused tests for exact road/plaza and retained-building preservation, one-for-one building portals, 200 distinct home slots, a ground alternative when bridge entry is closed, and repeated-seed generation. Existing v2–v4 and v5 tests remain in the suite. `scripts/v06-check.mjs` exercises the integrated scene by default; `SHADOW_CITY_SCENE=prototype` explicitly selects the archived separate-world fixture. It checks real Chrome rendering, map selection, L1 Focus, pan/zoom/pitch/reset, four bearings, replay, narrow view, alternate seed and legacy entry at 1440 × 900/DPR 1.

Compare the preserved [v0.5.2 hero](screenshots/v052-population-200-tick100-1440x900.png) with the [integrated v0.6 hero](screenshots/v06-integrated-hero-200-tick100-1440x900.png) and [plaza/Galleria close view](screenshots/v06-integrated-galleria-interior-close-tick500-1440x900.png). The [integrated hardware record](screenshots/v06-integrated-hardware-results.json) lists the renderer, interactions, frame samples and twelve captures. The older [separate-world hero](screenshots/v06-hero-200-tick100-1440x900.png) remains available solely to show the discarded approach.

The final run used headless Chrome 155 with `ANGLE (Apple, ANGLE Metal Renderer: Apple M4)` hardware WebGL, 200 residents, 1440 × 900 CSS pixels and DPR 1. It recorded 59.9 FPS, a 32.3 ms p95 frame interval, a 4.2 ms simulation Tick p95 over 400 Ticks, and a 1.14 s Tick 500 recomputation. A sampled frame had 162 draw calls, 86,657 triangles, 211 geometries and 57 textures; JS heap was about 101 MiB. GPU VRAM was unavailable. Earlier repeats recorded 33.4–33.8 ms p95 frame intervals, so the ≤33 ms reference frame target passes in the final sample but has little margin and is not consistently met. Removing Bloom reduced draw calls without improving that frame interval, so the original lighting treatment was retained. Chrome reported no page or console errors. Type checking, all 130 tests, and the production build pass; the build warns about the existing large JavaScript chunk.

The [20-pair integrated experiment](screenshots/v06-integrated-paired-experiments.json) uses 100 residents per scenario and covers Tick 0–500, or 08:00–08:50 logical time. Bridge entry ranges from 0–6 across open scenarios and is zero in every closed scenario. A separate [single-pair long sample](screenshots/v06-integrated-day-sample.json) runs 50 residents through Tick 9,000 (08:00–23:00) and records hourly activity; bridge entries are 99 open versus zero closed. These are synthetic model checks, not real-city causal estimates. One long pair cannot stand in for a 20-pair full-day distribution.

The visual review found the preserved skyline and square substantially closer to the intended miniature than the discarded separate map. The Galleria fits within a narrow original block, so its interior and entrance details remain small at hero scale; the bridge can be partly hidden by nearby buildings. Generic building interiors are semantic, navigable floor surfaces and have no bespoke room geometry yet. Triangle-exact collision and every facade-door alignment are not automatically proven. Synthetic schedules, guardianship and offence parameters are not calibrated to real observations. No police strategy, elevator dispatch, NavMesh dependency or 1,000-person acceptance is included.
