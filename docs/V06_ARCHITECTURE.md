# Shadow City v0.6 architecture and verification

## Migration and model boundary

The local v0.5.2 working state was preserved on `codex/v052-baseline` in commit `6e155eb` before work started on `codex/v06-multilevel`. The legacy generator, `shadow-city-hero-01` seed, v2–v4 simulation/replay path, and original screenshots remain available. The app opens the v0.6 world by default; `?world=legacy` (or `?model=v4`) opens the old app. v0.6 uses `WorldModelV2` and `SimulationStateV5`; it does not migrate a live v4 state.

```
WorldConfigV2 + world seed → generateWorldV2() → immutable WorldModelV2
                                              ↘ static instanced rendering
                     + SimulationConfigV5 → SimulationStateV5 → characters and event overlays
                                              ↘ full researcher Population Inspector
                                    truth offences → reporting → observer report view
```

All authoritative world and citizen positions use integer millimetres, with 1 world unit = 1 metre. `surfaceId` defines spatial membership; `levelId` describes the level. Stairs, ramps and escalators have their own `L0-L1` transition surfaces while occupied, then switch to the destination floor on arrival. Equal X/Z values on L0 and L1 do not imply contact or connectivity. Navigation, places, capacities, portals, connectors, collision footprints and visible building components live in `src/world/`; dynamic reservations, movements, encounters, offences and reports live in `src/simulation/`. Camera and frame rate never change authoritative movement.

## Generated world and navigation

`src/world/generation/generateWorldV2.ts` builds a 320 × 320 m city from district and parcel sub-seeds. Its visible road strips are generated from the same connected road nodes and edges exposed on `WorldModelV2`. The v0.1 generator remains untouched. A small `generateVerticalProofWorld()` fixture exercises ground routes, a west stair, east ramp and L1 bridge before the full scene is considered.

The Central Galleria has L0 and L1 corridors, a real L1 atrium opening, ground and bridge entrances, four shop/café surfaces, a stair, a one-way escalator, public slots and named retail resources. The bridge has a ground crossing alternative. Ten residential courts provide 200 distinct indoor home slots; public places use separate bounded slots. The world builder checks IDs, referenced surfaces, edge endpoints and sampled walkable segments against static blocked footprints. Portals and connector edges encode legal crossings between surfaces; the renderer's triangles are not the navigation authority. Triangle-exact collision and all facade-door alignments are not yet proven automatically.

`src/world/navigation/routeV2.ts` performs deterministic graph search with integer millisecond edge costs, personal stair/ramp/escalator and bridge preferences, previous-Tick crowd costs, access rules and stable edge-ID ties. There is no external NavMesh dependency. `entryClosed` blocks new entry, while residents already inside may use the exit direction; an occupied connector can finish before the route replans from its safe node. A route failure remains explicit and never teleports a resident home.

## Simulation, opportunity and information boundary

`src/simulation/v5Profiles.ts` gives residents deterministic schedules, needs, preferences, mobility costs and a unique home slot. Appearance still comes from the separate per-ID character identity input, and offending randomness has its own seed. Each 6-second Tick uses a seed/Tick/ID priority for contested public slots. Occupancy and reservations are dynamic simulation state. Open, compatible, reachable locations compete through activity demand, attractiveness, personal travel cost, familiarity and prior crowding; full or closed locations cause waiting or a different choice. No citizen is merged into another identity.

`movementV5.ts` advances along ordered three-dimensional polylines and records one-second positions. `opportunityV5.ts` requires actual same-surface contact with a citizen or a named place resource. An encounter episode accumulates contact hazard against one episode-specific threshold, then consumes the episode if an offence occurs. Cooldowns limit repetition; neither a bridge visit nor a particular Tick guarantees an offence. Truth offences store exact position, surface, level, place and target. Reporting is a later, separate seeded process. The observer view contains only delivered reports with rounded positions and optionally observed level/place; God View can inspect full resident and offence history in any event display mode.

`SimulationSessionV5` maintains live and inspected states separately, checkpoints every 100 Ticks, and includes world structure, generator version, model parameters and ordered commands in the experiment fingerprint. Replay rejects a different fingerprint. Access commands are effective on an explicit future Tick; adding one rebuilds the experiment with its revised history. Pausing, changing playback speed, camera movement and historical inspection do not alter the logical transition. The 32-bit fingerprint is a deterministic integrity check, not a cryptographic security hash.

## Visual implementation

`MultiLevelApp` is the default entry. Its researcher sidebar can browse all residents, search/filter, select from either map or list, inspect profile/activity/history, and Focus or Follow across floors. The orthographic camera preserves target elevation. Scene controls expose floor filtering, Galleria roof cutaway, navigation overlay, bridge and mall access commands, replay, and Truth/Observed/Compare layers. Building and street geometry share instanced meshes by material class. Characters use the existing Quaternius character system at close range and lower-cost representations at distance; simulation position remains authoritative.

The fixed hero uses `shadow-city-multilevel-01` and a 1440 × 900 CSS pixel, DPR 1 viewport. `scripts/v06-check.mjs` checks map selection, cross-floor focus, replay, access command, cardinal camera bearings, narrow layout, alternate seed and legacy entry, and captures actual browser images. The visual review found the bridge and upper Galleria readable at close focus, but the 320 m hero is visibly sparser than the v0.5.2 miniature, the mall roof mass is broad, and distant people are very small. These are remaining art issues, not hidden by a passing performance number. See `docs/VISUAL_DIRECTION.md` for the review criteria.

## Verification record — 2026-10-26

Preserved before/after evidence: [v0.5.2 hero](screenshots/v052-population-200-tick100-1440x900.png), [v0.6 hero at Tick 100](screenshots/v06-hero-200-tick100-1440x900.png), [v0.6 hero at Tick 500](screenshots/v06-hero-200-tick500-1440x900.png), and [Galleria L1 close view](screenshots/v06-galleria-interior-close-tick500-1440x900.png). The [hardware result record](screenshots/v06-hardware-results.json) lists all twelve browser captures, renderer diagnostics and checks; the [paired experiment record](screenshots/v06-paired-experiments.json) contains all twenty seed pairs and parameters. A separate [one-pair 08:00–23:00 sample](screenshots/v06-day-sample.json) records hourly results with 50 residents.

- Browser: headless Google Chrome 155 on macOS, WebGL renderer `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`; hardware WebGL was requested and the reported renderer was not SwiftShader. Viewport 1440 × 900, DPR 1, 200 residents, fixed world seed above. The script found no browser console/page errors.
- Measured on this machine: average 59.9 FPS over a roughly 3.5-second Play sample; p95 frame interval 31.1 ms; 400 measured simulation Ticks had p95 4.7 ms; Tick 500 replay from zero took 1.14 s. A sampled frame reported 36 draw calls, 67,892 triangles, 139 geometries and 36 textures. The final JS heap snapshot was about 100 MiB and varied across runs. GPU VRAM was unavailable and JS heap is not a substitute. Mouse zoom/pan, 50° pitch, Reset View, and four cardinal bearings were exercised in Chrome.
- The 20-pair synthetic bridge experiment is stored in `screenshots/v06-paired-experiments.json`. It uses 100 residents and 500 Ticks per scenario. Bridge-entry counts were 8–16 with the bridge open and exactly zero with its entry closed; median visits were 534 versus 533, median encounters 685 versus 712, and median offences 1 in both scenarios. The 500-Tick horizon spans only 08:00–08:50, so it samples morning conditions and cannot establish full-day or evening patterns. It is a model sensitivity check, not a real-city causal estimate.
- One additional seed pair ran for 9,000 Ticks (08:00–23:00) with 50 residents. Its hourly file contains morning and evening occupancy, visit, encounter and offence counts. It is a long-horizon stability sample, not a 20-pair day-level distribution.
- Unit and integration tests cover distinct surfaces at equal X/Z, continuous vertical movement, portal closure and occupied connector completion, indoor evacuation, individual home/public occupancy, no-target/no-contact outcomes, reporting isolation, checkpoint replay and fingerprint mismatch. `npm run typecheck`, `npm test`, and `npm run build` form the final local gate.

The synthetic schedule, guardianship, opportunity hazard and reporting parameters are not calibrated to observed human activity or real crime data. v0.6 does not include police policy, elevator scheduling, a production NavMesh, 1,000-person acceptance or a claim of causal effects outside this model. Visual and hardware measurements are specific to the recorded machine and scene.
