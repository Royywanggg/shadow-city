# v0.5.2 population spatial fidelity and character behaviour

## Technical review and cause

In v0.5.1, several citizens could target the same plaza or park anchor. Their authoritative `CitizenState.position` therefore converged on one point. `AgentLayer` then kept one stationary representative per anchor and omitted the others from the world view. This was both a simulation-space capacity problem and a rendering omission; changing only avatar offsets would have left the underlying state inconsistent. Character identity already came from a separate deterministic catalogue, but distant instances had no individual clothing tint. Playback also selected Walk for every moving citizen and could reset heading to zero after stopping.

## Static sites, dynamic occupancy

`CityModel.pedestrian` now supplies plaza, park, public-building entrance, and street-sidewalk anchors. `createActivitySlots` derives one slot at each qualifying pedestrian node, excludes slots closer than 0.9 world units, and groups them into site IDs. Slots remain static and are never mutated by the simulation. An activity destination first seeks a free slot at its desired site, then the closest free alternative. Each citizen reserves one slot for travel and occupancy. If no slot is free, the citizen remains at home as `waitingForSpace`, retries later, and records `TripDeferred` on first deferral. A slot is released on departure. Stable agent order and fixed seeds determine ties, reservations, and positions; a replay uses the same transition. `stepCitizenSimulation` rejects duplicate, unknown, or spatially inconsistent slot assignments on input.

Street slots are alternative capacity on existing sidewalk nodes, not points in the road carriageway. Public-building slots use pedestrian door or adjacent sidewalk nodes outside the building footprint. All outdoor citizens are rendered independently. Animation and LOD consume the simulated position; they do not create new destinations or move the authoritative agent. Moving citizens can still pass through one another on shared route edges because this milestone does not include local collision avoidance.

## Identity and motion

The existing appearance seed and per-agent catalogue still determine model, clothing palette, and portrait independently of offender propensity and frame timing. The world Far sprite now receives a stable clothing-derived tint; Medium and Close retain their catalogued appearance. The selected portrait and world character use the same preset and primary clothing colour. Far and Close are different representations, so a visible detail change remains possible at an LOD boundary.

The new `jogPreference` uses a dedicated deterministic per-agent hash, leaving existing movement-profile random draws intact. A trip's `movementMode` and route heading live in `CitizenState`. Jog changes fixed-tick distance by a declared 1.45 factor; animation reads that state and uses Run only for actual jog trips. The visual pose blends heading near pedestrian-graph corners, and it retains the last route heading at arrival. Walk and Run clip rate follows the citizen's configured speed within a bounded range. Idle phase and rate vary from stable appearance data. The mixer never drives simulation position. Pause, Step, replay, and speed controls retain simulation-tick authority.

## Researcher interface and scale boundary

The God View sidebar exposes the real waiting state, assigned slot, movement mode, and deferred-trip event. Its map/list selection, portrait, Focus/Follow, and tick-bound history still use `PopulationResearchPort`; event-layer changes do not restrict it through `ObserverPort`. The existing ten rigged character presets, shared Far resources, and bounded Medium/Close pools remain. The engine version changes to `0.5.2-synthetic-v2-occupancy`, so recorded runs should state this version rather than assume old v0.5.1 state compatibility.

The 200-citizen checks establish legal independent stopping positions and resource counts for this fixture. They do not establish collision-free movement, 1,000-citizen simulation support, or unique mesh assets for every resident. The existing large production bundle and dense UI overlays remain separate scale and presentation concerns.

## Verification

The focused occupancy tests cover legal separated slots, shared sites with independent residents, 200-citizen Tick 0/100/500 invariants, a forced full-capacity site, and duplicate-slot rejection. Camera/character/interpolation and existing simulation tests pass with the full suite. [The screenshot record](screenshots/README.md) identifies the Chrome hardware renderer, seeds, viewports, actual captures, replay/selection checks, and measured limits. `scripts/v052-check.mjs` reproduces that browser check with `SHADOW_CITY_WEBGL=hardware npm run visual:v052` against a local Vite server.
