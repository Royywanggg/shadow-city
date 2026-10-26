# v0.5.1 population and character architecture

This document records the v0.5.1 design. [v0.5.2](V052_ARCHITECTURE.md) adds independent activity occupancy and real simulation-backed jogging; its spatial and animation rules supersede the corresponding v0.5.1 limitations below.

## Data boundaries

```text
CityModel (static anchors and pedestrian graph)
       |
       v
SimulationSession -- immutable state at the selected Tick --+--> AgentLayer position and activity
       |                                                     |
       +-- citizen events and true offences -----------------+--> PopulationResearchPort
       |                                                     |          |
       +-- restricted delivered reports --> ObserverPort     |          +--> Population Sidebar
                                                             |          +--> selected 3D portrait
Appearance seed + stable citizen ID --> IdentityCatalog -----+--> character preset and palette
```

`PopulationResearchPort` is a researcher capability. It joins every citizen's static movement profile, deterministic synthetic identity, authoritative state, complete tick-bounded citizen event history, and true offence history. It does not call or widen `ObserverPort`. Truth, Observed, and Compare select event layers; the researcher sidebar remains available in each mode. A future police observer needs a separate read capability rather than access to this port.

The identity catalogue is keyed by stable citizen ID and separate identity and appearance seeds. It does not read offending propensity, camera state, render time, or replay mode. An appearance references a verified precomposed model plus an optional verified clothing-only color pair. Unsupported independent outfit, hairstyle, and accessory choices are `null`. The current catalogue has ten model presets and at most 109 model/color combinations; identities remain distinct even when assets are shared.

The simulation remains authoritative for position, activity, route, and Tick. `AgentLayer` interpolates only for display and chooses a Far instanced sprite baked from its character preset, Medium mesh baked from the model's Idle pose, or Close skinned character according to projected size, selection, and a bounded pool. Capacity assignment favors incumbent tiers to prevent small projection changes from repeatedly swapping models. The selected agent gets priority for Close. The imported clips are Idle, Walk, and Run; citizens use Idle/Walk from real activity, with clip weights blended across activity transitions. Character clip time derives from displayed playback ticks at 10 ticks per real second; the six seconds of simulated city time represented by each Tick must not drive the clip mixer directly. Run is a development preview until the simulation models jogging. Horizontal animation root motion is removed. A selected-only portrait samples animation between logical ticks while playback runs, so city occlusion cannot prevent individual visual inspection or make its motion update only at tick rate.

## Replay and scale

The sidebar's full list is virtualized. Population views are cached by immutable state reference; citizen events and offences are incrementally indexed by ID, then cut off at the inspected Tick. Replay changes the inspected state without changing static identity or the live run. The main renderer caps full skeletal characters at ten and Medium characters at 24; the remaining visible residents use shared Far geometry. This prevents draw-call and mixer counts from scaling directly with the total population.

The current simulation configuration still caps population at 200. The 1,000-ID tests validate deterministic identity and bounded LOD assignment, **not** a 1,000-citizen simulation or 1,000 distinct visible outfits. A future 1,000-citizen milestone must add destination capacity and individual legal stopping positions so co-located residents need not be represented by one exterior figure; profile and event-storage scale tests; 1,000-citizen fixed-Tick replay; a larger verified modular appearance catalogue; and browser frame-time measurements on named hardware GPUs. Changing only the numeric population cap would not satisfy that milestone.

## Verification evidence

See [the screenshot record](screenshots/README.md) and `v051-results.json` for the fixed seeds, Chrome/SwiftShader browser session, Tick 100/500 screenshots, map and sidebar interactions, character portrait and Inspect views, and performance sampling limits. [The asset record](CHARACTER_ASSETS.md) contains exact source and output hashes and CC0 evidence for the included Quaternius files.
