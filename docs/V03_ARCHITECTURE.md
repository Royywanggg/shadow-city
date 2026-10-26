# v0.3 living city architecture

This document records the synthetic citizen prototype. `VISION.md`, `VISUAL_DIRECTION.md`, and `ROADMAP.md` remain the product and art direction sources of truth. The behaviors below are reproducible demonstration rules, not empirically validated human activity.

## Data flow and ownership

```text
city seed -> CityGenerator -> CityModel (read-only roads, blocks, buildings, entrances, pedestrian graph)
                            |                                      |
                            v                                      v
                       CityScene                         SimulationEnvironment
                                                        (navigation index, profiles)
                                                                  |
simulation seed + versioned config + ordered commands -> pure fixed-tick transition
                                                                  |
                                                   SimulationStateV2 + typed events
                                                                  |
                                         AgentLayer, inspector, playback and replay

CameraController -> CameraRig (independent view state)
```

`CityModel` owns spatial facts. The existing connected road centerline graph remains intact; the new pedestrian graph represents sidewalks, explicit crossings, building entrances, plaza, and park access. Building door positions in static data are shared by rendered doors and pedestrian anchors. Neither simulation nor rendering changes these static facts. `SimulationEnvironment` builds read-only lookup maps and citizen profiles once per run. `SimulationSession` owns the current and prior authoritative states, event and command histories, and an optional inspected replay state. React components consume those snapshots; they do not choose destinations or advance logical movement.

## Pedestrian network and route planning

The pedestrian graph is generated from blocks, parcel boundaries, public spaces, road connections, and entrances. Its nodes have stable IDs, world X/Z, surface height, and kind. Edges have stable IDs, endpoints, real length, integer millimetre cost, kind, and a road edge reference for crossings. Building, plaza, and park anchors identify valid trip endpoints. Each crossing has a corresponding visible road marking. Edges enter buildings only at a defined doorstep; routes do not use road centerlines or cut across building footprints.

`createNavigationIndex` validates duplicate IDs, missing endpoints, nonpositive lengths and costs, then sorts adjacency by edge ID. `findRoute` uses Dijkstra with integer costs. Its priority queue orders equal costs by node ID; equal-cost predecessor ties choose the lower predecessor node ID, then edge ID. It returns an ordered contiguous `RouteStep[]`, total metric length and cost, or a typed unreachable result. Graph generation tests check connected anchors and spatial constraints across the hero and alternate seeds. Pathfinding stays in the simulation domain, never in a render frame.

## Population, behavior, and movement

The default v2 config uses 80 citizens, `shadow-city-sim-01`, six logical seconds per tick, and `synthetic-v1` behavior. `populationSize` accepts 0–200; the app exposes `?population=100` as a review fixture. Agent IDs are zero-padded and stable (`citizen-0000`, etc.). A profile holds home anchor, speed, first departure tick, and home/visit dwell durations. The dynamic state holds activity, world position, current and destination anchors, route, current edge and progress, next decision tick, trip and event ordinals, and a serializable behavior RNG state. Profiles and initial state are generated in ID order. Every profile and behavior RNG stream derives from simulation seed plus citizen ID, so adding the next citizen does not change an existing citizen's trajectory or event ID.

The state machine is `atHome -> planningTrip -> travelling -> atDestination -> returningHome -> atHome`. A planning citizen selects one of the public anchors and obtains a legal route. If none exists, it stays put, emits `TripFailed`, and retries after a fixed delay. A travelling citizen advances by `profile.speedUnitsPerLogicalSecond * config.logicalSecondsPerTick`. The movement function consumes edge remainder, traverses as many subsequent edges as the budget allows, clamps floating-point tolerances, and snaps to the final anchor on arrival. Dwell durations and next departure times are integer ticks. Every fourth initial citizen is placed partway along a valid route as a declared synthetic initial condition so the city is alive at Tick 0; that placement is not retroactively recorded as a trip event.

`TripStarted`, `DestinationReached`, `ActivityStarted`, `ActivityFinished`, and `TripFailed` mark changes in citizen activity. They are ordered by tick, diagnostic actions first, then stable citizen order and per-citizen event order. An event ID includes the run fingerprint, citizen ID, and the citizen's event ordinal; adding one citizen cannot renumber another's IDs. Per-tick positions remain in state and do not generate persistent events. The v0.2 diagnostic command and event path remains available and separately typed.

## Playback, replay, and presentation

One engine transition advances one fixed integer tick. The browser scheduler's 1×/2×/4× choice changes wall-time scheduling only. Pause makes no transitions; Step makes exactly one; Reset creates the same initial population and clears histories. Time inspection recomputes the v2 state and events from Tick 0 without overwriting live state. The environment fingerprint detects an incompatible city or config in a restored state. Reproducibility assumes the same static city, engine version, config, seed, ordered commands, and tested JavaScript environment; cross-runtime bitwise identity has not been established.

`AgentLayer` uses shared instanced meshes for lightweight body and head forms plus a subdued ground accent for moving citizens. It reads the current state and previous live state. During continuous playback, it interpolates distance along the **route polyline**, so turning at an intersection follows legal edges. The interpolation alpha changes only presentation, never simulation state or agent decisions. Pause, Step, inspection, and Reset render the authoritative state directly. Selection lives in a separate presentation controller; the route line and inspector reflect the selected citizen but never change its activity. Camera navigation acts only on the view state.

## Boundaries and review

This prototype has no traffic rules, collisions, crowd avoidance, work economy, crime, policing, database, or backend. Public trips go to a plaza or park and back home. The timing and speeds are illustrative parameters, not observed urban data. A main-thread engine and instanced meshes are adequate for this population until measured interaction says otherwise. Report fixed-seed browser screenshots and simulation tick cost separately from renderer draw calls, triangles, frame time, and FPS; headless SwiftShader measurements are software-renderer diagnostics rather than hardware GPU performance.
