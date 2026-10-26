# Shadow City v0.6 — original-map expansion and multi-level integration

## Corrected product boundary

The v0.6 default is an expansion of the existing `shadow-city-hero-01` city. `generateCity()` remains unchanged. Its original 212 × 212 m roads, civic plaza, parks, building families and lighting form the center of a **connected 300 × 300 m map**. The added outer ring extends the same road and pedestrian graphs with deterministic block seeds and smaller parcels. One building in the original `block-4-3`, immediately east of the plaza, gives way to a two-level Galleria. The pedestrian network is rederived across the combined city and connected to portals, a ground crossing and a short skybridge. No independent replacement city is shown by default.

The earlier 320 × 320 m `district-world-v1` work is retained only at `?world=prototype`; its screenshots and experiment files are prototype records. `?world=legacy` or `?model=v4` opens the old v0.5.2 simulation on the unmodified original city. The local pre-v0.6 state remains on `codex/v052-baseline` (`6e155eb`). Neither v4 state nor its replay is migrated in place.

```text
generateCity(seed) → original CityModel → connected outer ring → Galleria adaptation
                                  ↓
                          WorldModelV2 (static)
                         /       |         \
        original city renderer   3D routes   semantic places
                         \       |         /
                         SimulationStateV5 (dynamic)
                           ↙             ↘
              researcher God View     report-only observer view
```

`src/world/generation/expandOriginalCity.ts` appends the outer roads, blocks and buildings without regenerating the old core. `src/world/generation/generateIntegratedWorld.ts` adapts the combined `CityModel` into `WorldModelV2`, retaining every original road node/edge and 53 original buildings outside the Galleria block. The derived `baseCity` contains both old and new districts; `CityStaticScene` uses the established roads, facades, plaza, street furniture, lights and materials. `WorldSceneV2` adds the Galleria and dynamic markers. The renderer does not invent route positions or change the static world during simulation.

## Spatial and behavioural model

Authoritative coordinates are integer millimetres (1 world unit = 1 metre). `surfaceId` determines spatial membership. Ground, L1, indoor building places, shops and the L0–L1 connectors have distinct IDs; equal X/Z coordinates do not imply contact across floors. Original and expanded visible building doors are associated with building portals. Home buildings supply 16 deterministic indoor slots each; the 200-person initial population occupies distinct slots. Public plaza and park slots come from the pedestrian anchors.

The Galleria has L0/L1 corridors, an open upper atrium, two shops/cafés on each level, a stair and a one-way escalator. Its L0 entrance is connected to a new ground crossing over the existing avenue. Its L1 entrance meets the short skybridge; a plaza stair and ramp reach a shared circular landing. The bridge deck, stair and ramp meshes are swept directly along their authoritative three-dimensional navigation paths; the deck overlaps the upper floor at the portal. A glazed canopy and an open west facade reveal the entrance. These curves use Three.js geometry already in the project, so no navigation or rendering dependency was added. Closing bridge entry still leaves the ground crossing and interior connectors available. Access commands, reservations, waiting and connector occupancy are simulation state, never static geometry mutations.

`src/world/navigation/routeV2.ts` builds one deterministic, integer-cost shortest-path tree per citizen decision. A binary heap avoids rescanning the network for each destination, and destination scores read costs without reconstructing every candidate route. Returning home can stop the search at the home slot. Personal access/cost parameters, previous-Tick crowding and stable edge ties remain part of route choice. The larger map costs more to replay than the earlier 212 m overlay despite these optimizations.

`SimulationStateV5` still owns activities, three-dimensional movement, one-second contact traces, opportunity episodes, offences and reports. A real citizen or named place resource is required for an opportunity. Bridge presence cannot create a scripted offence. Reports reveal only delivered, observed fields; the researcher Population Inspector retains full truth at the inspected Tick. Identity/appearance, activity, offending and reporting use separate deterministic inputs. Replay fingerprints include the derived world structure, source `CityModel`, simulation parameters and ordered commands; mismatches are rejected.

## Verification and evidence

The expanded integration has focused tests for exact original road/plaza and retained-building preservation, a 300 m extent, one-for-one building portals, 200 distinct home slots, bridge landing continuity, a ground alternative when bridge entry is closed, and repeated-seed generation. Existing v2–v4 and v5 tests remain in the suite. `scripts/v06-check.mjs` exercises the expanded scene by default; `SHADOW_CITY_SCENE=prototype` selects the archived separate-world fixture. It checks real Chrome rendering, map selection, L1 Focus, pan/zoom/pitch/reset, four bearings, replay, narrow view, alternate seed and legacy entry at 1440 × 900/DPR 1. It now captures a dedicated bridge close view.

Compare the preserved [v0.5.2 hero](screenshots/v052-population-200-tick100-1440x900.png) with the [expanded 300 m hero](screenshots/v06-expanded-hero-200-tick100-1440x900.png), [bridge close view](screenshots/v06-expanded-bridge-close-tick100-1440x900.png) and [upper Galleria cutaway](screenshots/v06-expanded-galleria-interior-close-tick500-1440x900.png). The [expanded hardware record](screenshots/v06-expanded-hardware-results.json) records the renderer, interactions, frame samples and screenshot set. The earlier [212 m integrated hero](screenshots/v06-integrated-hero-200-tick100-1440x900.png) and [separate-world hero](screenshots/v06-hero-200-tick100-1440x900.png) remain archived for comparison.

Hardware Chrome 155 with `ANGLE (Apple, ANGLE Metal Renderer: Apple M4)` was used at 1440 × 900 CSS pixels, DPR 1 and 200 residents. The full visual run recorded 60.3 FPS, a 31.4 ms frame p95, a 21.6 ms simulation Tick p95 over Tick 100–500 and 2.50 s to recompute Tick 500. A sampled frame had 227 draw calls, 164,953 triangles, 244 geometries and 53 textures; JS heap was about 186 MiB. A separate, less busy browser timing sample measured a 9.6 ms Tick p95 and 2.45 s recomputation. The FPS and frame targets pass in that full run; the ≤5 ms Tick and ≤2 s replay targets **remain open**. The visual check exited nonzero solely because of this performance gate; map selection, L1 Focus, camera, replay, narrow layout, second seed and legacy entry completed with no page or console errors. GPU VRAM is unavailable and is not equated with JS heap. Type checking, all 131 tests and the production build pass; the build retains a large JavaScript chunk warning.

The earlier [20-pair integrated experiment](screenshots/v06-integrated-paired-experiments.json) and [single-pair long sample](screenshots/v06-integrated-day-sample.json) describe the **prior 212 m overlay**, not this expanded world. They remain archived and should not be cited as intervention results for `heritage-extension-v2`. Any new paired comparison must be rerun with the new world fingerprint. Synthetic model differences are not real-city causal estimates.

The visual review found that the recognizable core now sits within a larger connected city; the outer split parcels avoid the first revision's oversized perimeter blocks. The bridge's shared landing and continuous path geometry visibly connect to the upper Galleria, while the open west facade and canopy reveal the entrance. The hero view remains rectilinear at city scale, and bridge visibility still depends on camera bearing. Generic building interiors are semantic, navigable floor surfaces and have no bespoke room geometry yet. Triangle-exact collision and every facade-door alignment are not automatically proven. Synthetic schedules, guardianship and offence parameters are not calibrated to real observations. No police strategy, elevator dispatch, NavMesh dependency or 1,000-person acceptance is included.
