# v0.2 simulation and camera architecture

This document records the v0.2 implementation contract. `VISION.md` and `VISUAL_DIRECTION.md` continue to govern product scope and visual decisions.

## Data flow and ownership

```text
city seed + generation config -> CityGenerator -> CityModel (static)
                                              |             |
                                              v             v
                                        CityScene       SimulationSession
                                                          |
domain command log -> pure stepSimulation(CityModel, config, state, commands)
                                                          |
                                             SimulationState + SimulationEvent[]
                                                          |
                                                PlaybackController -> compact UI
```

`CityModel` is a read-only argument to simulation transitions. The simulation keeps its own dynamic state and never changes roads, parcels, buildings, or the road graph. `CityScene` remains the static scene; no v0.2 diagnostic event is rendered as a fictional agent or city incident. A future dynamic scene can subscribe to simulation state separately from `CityScene`.

`SimulationSession` owns the live state, accepted command log, event history, and an optional inspected replay state. Its cached `getSnapshot` plus `subscribe` interface feeds `useSyncExternalStore` in the controls. `PlaybackController` owns wall-time playback state. Camera state belongs to `CameraController`, which has an independent external-store interface. The root app constructs each controller once for the current city. Simulation ticks do not set React state in the app or re-render the static Canvas.

## Fixed logical time and reproducibility

One transition always advances exactly one integer tick. The immutable v1 config sets `logicalSecondsPerTick` to 6 by default; this is a provisional scenario unit, not wall time or a browser frame delta. At 1× the scheduler requests 10 ticks per wall second, with 2× and 4× changing only that request rate. It uses a `requestAnimationFrame` accumulator, executes at most eight transitions in one callback, and suspends visibly after a gap over 1000 ms, a hidden tab, or debt over 20 ticks. Suspension leaves the current logical tick intact. Play resumes from that tick with a fresh wall-time anchor. Step pauses and advances one tick. Reset Simulation restores the initial simulation state and clears its histories; it leaves the camera alone.

The pure `stepSimulation(city, config, state, commandsForTick)` returns a new state and ordered events. It receives neither `Date.now()` nor `Math.random()`. A serializable uint32 PRNG stream named `diagnostic` is seeded separately from the city seed (`shadow-city-sim-01` by default). Future behavior domains should receive named streams so an extra random draw in one domain does not perturb another. Reproducibility requires the same static `CityModel`, config, simulation seed, engine/RNG implementation, and ordered accepted commands in the tested JavaScript environment. Cross-browser bit-level identity is not claimed without a separate compatibility test.

The only v0.2 domain command is `ScheduleDiagnosticProbe`. Accepted envelopes carry a stable ID, effective tick, priority, and submission sequence. The default effective tick is the next tick. Commands sort by ascending priority then submission sequence; scheduled actions sort by due tick, priority, then insertion sequence. A due action advances the diagnostic RNG and emits a `DiagnosticProbeSampled` event with a stable tick and sequence ID. This validates the command, scheduling, event, and replay pipeline without inventing agents or crimes. Invalid admission throws before the log changes. Play, Pause, Step, and Speed are playback controls and never enter the domain command log.

Replay reconstructs from tick zero with the accepted commands and the same pure transition. Inspecting a past tick stores a separate reconstructed state and events; it does not rewind or branch the live run. Domain commands and live advancement are blocked during inspection. Return Live restores the live view. Histories have explicit caps (50,000 ticks, 5,000 commands, 10,000 events, 5,000 pending actions); the scheduler pauses with an error instead of silently discarding facts. Snapshot acceleration is deferred until measured replay cost warrants it.

## Camera navigation

The city uses Y up, X east, and negative Z north. Bearing is normalized to `[0, 360)`: 0° is north-up and 90° is east-up. With `offset = camera.position - controls.target`, `bearing = normalize(-atan2(offset.x, offset.z) × 180 / π)`. Pitch is the angle from overhead, `atan2(hypot(offset.x, offset.z), offset.y) × 180 / π`, bounded to 25°–65°. The initial orthographic hero pose remains `[188, 168, 188]` looking at the origin, bearing 315°, pitch about 58°, and relative zoom 1. Zoom remains within 0.72–2.8× and the target within ±66 units in X/Z.

`MapControls` handles left-drag pan, right-drag or Shift+left rotation, wheel zoom, one-finger pan, and two-finger pinch/pan. Visible ±15° controls provide bearing on touch devices; Q/E rotate and R restores the full view when focus is outside form controls. Compass click sets only bearing to north-up. Full Reset View restores target, bearing, pitch, and zoom. Discrete bearing controls apply exact angles; direct drag retains damping. Resizing preserves target, bearing, pitch, and relative zoom. The camera never rotates the city model or changes the simulation state.

## Boundaries and next measurements

The main-thread engine is sufficient for the current diagnostic workload. A Worker becomes useful only after representative agent populations make transitions visibly interfere with camera interaction. Interpolated dynamic rendering, snapshots, routing, agent streams, and scenario parameters belong to later milestones. Headless SwiftShader frame intervals are useful regression signals but do not establish hardware FPS targets; record the environment and sample count with every performance result.
