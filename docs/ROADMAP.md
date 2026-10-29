# Shadow City roadmap

This roadmap is milestone-based, not date-based. Each milestone should leave a usable, reviewable result. `VISUAL_DIRECTION.md` governs visual decisions and visual verification.

## v0.1 — Visual foundation

**Goal:** Create a city worth looking at: a full-screen, cinematic nighttime architectural miniature with an isometric orthographic camera.

**In scope:**

1. Set up the React, TypeScript, Vite, Three.js, React Three Fiber, and limited Drei application when implementation begins.
2. Define static `CityModel` data and a seeded generator. Use one consistent coordinate system and stable identifiers.
3. Generate a connected road network as abstract nodes and edges. Derive visible roads, intersections, blocks, and parcels from that network. Preserve graph information for later movement; do not implement pathfinding.
4. Generate varied building descriptors and render a central public square with a civic edge, a limited architectural vocabulary, coherent skyline, roads, sidewalks, nighttime materials, lighting, and atmosphere.
5. Provide an orthographic hero camera with smooth bounded pan and zoom, plus a clean full-screen presentation.
6. Profile and refine the scene, then inspect it in a browser against the visual gates in `VISUAL_DIRECTION.md`.

**Out of scope:** Criminal or police agents, general agent simulation, pathfinding, time controls, dashboards, experiment tools, databases, authentication, backend services, and cloud infrastructure.

**Exit criteria:**

- A fixed seed and generation configuration reproduce the same static city data. The road graph has valid node and edge references and the intended connected routes; buildings remain within buildable parcels and do not visibly overlap streets.
- The fixed `shadow-city-hero-01` scene is inspected at 1440 × 900 CSS pixels in a browser. Composition, silhouettes, lighting, atmosphere, road legibility, building variation, and camera behavior pass the gates in `VISUAL_DIRECTION.md`. Screenshots are reviewed when capture tools are available. If browser inspection is unavailable, visual acceptance remains pending.
- At least two other seeds and a narrow viewport are inspected for major layout or framing failures. Panning and zooming are tested in the browser.
- Type checking, production build, and focused tests for seeded generation and spatial invariants pass. Browser, viewport, device pixel ratio, seed, and measured rendering performance on the reference device are recorded. Performance problems affecting smooth camera interaction are resolved before release.

## v0.1.1 — Visual refinement

**Goal:** Raise the v0.1 miniature's architectural variety, city composition, street detail, and nighttime depth before simulation work begins.

**In scope:** Distinct procedural building archetypes with varied massing, roofs, frontage, and setbacks; a stronger skyline and civic square; street furniture derived from static city space; clustered window lighting and restrained warm/cool accents; fixed hero camera review. Keep the connected road graph, static `CityModel`, deterministic seed, and existing controls.

**Out of scope:** Simulation, agents, routing, backend services, and a city generator rewrite.

**Exit criteria:**

- The fixed `shadow-city-hero-01` city at 1440 × 900 is visually compared with the preserved v0.1 screenshot and the supplied reference. Save a separate v0.1.1 hero screenshot. Record observed improvements and remaining gaps honestly.
- Inspect the app in a browser after architecture/composition, materials/lighting, and environmental detail passes. Check the default and closer zoom, pan and reset, a narrow viewport, and two alternate seeds. Do not substitute a passing build for visual inspection.
- Distinct archetypes differ by footprint or massing, silhouette, facade, and roof treatment; the civic building and plaza remain legible; street details respect the city layout; night values remain readable without indiscriminate glow.
- Seeded static data and road connectivity tests, type checking, and the production build pass. Report browser diagnostics with their sampling limits.

## v0.1.2 — Focused static visual refinement

**Goal:** Make the existing building families and block composition more distinct in the fixed hero view without expanding the product or changing the road graph.

**Scope:** Vary massing, rooflines, podiums, and facade depth within the nine existing archetypes; vary parcel grouping and setbacks around the square and work districts; review local light and shadow changes in browser screenshots. Preserve the v0.1.1 screenshot and capture v0.1.2 separately.

**Review gate:** Type checking, tests, build, road connectivity, camera interaction, and browser error checks must pass. Compare both fixed-seed 1440 × 900 screenshots and record visible gains and remaining repetition. The user decides whether the art direction is accepted and whether v0.2 can begin.

## v0.2 — Simulation foundation and map camera

**Goal:** Establish a reproducible simulation clock and complete orthographic map navigation while preserving the static city and its hero composition.

**In scope:** A pure fixed-tick transition over read-only `CityModel`; separate simulation seed and explicit serializable RNG state; typed diagnostic commands and events with stable ordering; scheduled actions; live state, event and command history; replay from tick zero and read-only time inspection. A browser scheduler provides Play, Pause, Single-Step, Reset Simulation, and 1×/2×/4× speed. The camera adds bounded bearing and pitch, pan and zoom, compass, keyboard and touch fallbacks, North-up, and full Reset View. Camera and playback controls are separate, compact overlays.

**Out of scope:** Agents, crime, policing, pathfinding, dashboards, backend services, databases, workers, and speculative dynamic city effects. Diagnostic events must be named as diagnostics and must not imply those systems exist.

**Exit criteria:**

- The same static city, simulation config and seed, engine version, and ordered command history produce identical state and event sequences for a tested JavaScript environment. Replay at a target tick reconstructs state and events; time inspection does not overwrite the live run. Speed changes alter scheduling only. Pause, one-tick Step, and Reset have exact semantics, and hidden-tab or long-gap behavior does not silently skip logical ticks.
- Tests cover seed and command determinism, event order and IDs, scheduled actions, replay, static-city immutability, scheduler frame patterns and catch-up limits, and camera angle conventions and limits. Type checking and production build pass.
- The orthographic camera can rotate through 360° about its current target. Bearing 0° points north-up with X east and negative Z north. North-up preserves target, pitch, and zoom; Reset View restores the initial full pose. Camera motion and Reset Simulation do not change each other's state.
- The fixed `shadow-city-hero-01` city at 1440 × 900 is inspected in a browser against the preserved v0.1.2 screenshot. Capture the hero view and cardinal bearings, check pan/zoom/pitch/reset and a narrow viewport, and record browser, DPR, screenshots, errors, and representative rendering diagnostics. If browser inspection is unavailable, visual acceptance remains pending.

## v0.3 — Urban agents and movement

**Goal:** Make the city visibly alive with reproducible citizen activity and movement before introducing crime or policing.

**In scope:** A static pedestrian network derived from the existing road, block, parcel, and entrance layout; deterministic route planning; configurable citizen population; a clearly labeled synthetic activity state machine; fixed-tick movement and meaningful trip events; independent instanced agent rendering, route-aware visual interpolation, and a compact selected-agent inspector. Preserve the existing city, camera, playback, replay, and static/dynamic data boundary.

**Out of scope:** Criminal or police agents, crowd collision avoidance, traffic, realistic economic behavior, backend services, and databases.

**Exit criteria:**

- Shared static entrance and crossing data align rendered geometry with pedestrian graph connections. Every eligible home and destination is accessible; route edges are contiguous and avoid building interiors. Unreachable destinations return an explicit failure rather than a teleport.
- The same city, versioned config, simulation seed, and ordered command history reproduce the same population, agent state at each tick, trip events, and replay result. Agent movement depends only on fixed logical ticks; Pause, Step, 1×/2×/4×, Reset, and historical inspection retain their exact semantics. Static `CityModel` and camera state remain independent.
- A fixed `shadow-city-hero-01` run at 1440 × 900 is inspected in a browser at defined simulation ticks. Agents are legible at hero and close views, remain on valid walking surfaces at cardinal camera bearings, and can be selected. Narrow layout and 100-agent playback are inspected. Preserve v0.2 screenshots and save separate v0.3 evidence with browser, DPR, seeds, population, tick, and performance sampling method.
- Focused spatial, routing, movement, behavior, determinism, replay, rendering-interpolation, and integration tests pass, along with type checking and production build. Report 100-agent simulation tick cost separately from frame time, FPS, draw calls, and triangles on a named rendering environment; do not treat software rendering as a hardware GPU benchmark.

## v0.4 — Ground truth and observation

**Goal:** Make information asymmetry measurable: preserve what happened, model whether and when it is reported, and expose only available reports to an observer.

**In scope:** A versioned synthetic incident process driven by fixed-tick citizen presence, time, and static districts; a separate deterministic reporting probability and delay model; private report-to-incident provenance; GroundTruthView and ObservedWorldView read models; fixed observation scenarios for counterfactual comparison; concise Ground Truth, Observed, and Comparison layers in the existing city scene. Keep v0.3 citizen movement, camera, and replay behavior.

**Out of scope:** Police agents and strategies, investigation, arrests, offender decision-making, real-world crime prediction, backend services, and database persistence.

**Exit criteria:**

- The same city, world config, seed, and command log reproduce identical citizen states and ground-truth incidents under reporting-only scenario changes. A higher reporting probability with the same sampling seed yields a superset of privately linked reported incident IDs. Reports and delivery delays are deterministic logical-tick outcomes.
- Incidents remain in ground truth when not reported. Pending reports appear only after their availability tick. Observer read models and UI expose no hidden incident ID, true-only position/type, pending count, future report, or internal provenance; the researcher can inspect complete truth and outcomes.
- Tick 500 Replay, historical inspection, Reset, Pause, Step, speed, and camera isolation preserve the same incident, report, and citizen facts. Tests cover zero/one reporting probability, delay boundaries, counterfactual invariance, information isolation, event ordering, spatial legality, and zero-denominator metrics. Type checking and production build pass.
- At `shadow-city-hero-01`, 1440 × 900 CSS pixels and DPR 1, inspect browser screenshots at Tick 0, 100, and 500 for all three modes, a close marker view, cardinal bearings, and a narrow viewport. Use documented synthetic scenario parameters that produce real events; do not insert presentation-only incidents. Record browser errors, tick/replay cost, event growth, draw calls, triangles, FPS/frame-time samples, and software-versus-hardware rendering limits.

## v0.5A — Offender behaviour foundation

**Goal:** Replace anonymous synthetic incident trials in a new, versioned model with explicit agent decisions while preserving v0.4 as a separate legacy model.

**In scope:** Stable per-citizen behavioural profiles, tunable minor/serious propensity association, legal pedestrian opportunity snapshots, one mutually exclusive No Offence/Minor/Serious decision per eligible agent and Tick, private offender attribution, distinct offence and incident IDs, isolated RNG streams, reporting integration, and exact replay. Profiles are synthetic research parameters, not labels displayed on citizens or estimates from real crime data.

**Exit criteria:** No opportunity produces no offence; generated locations coincide with legal post-movement citizen positions; every offender-driven incident links to exactly one attributed offence and one truth event; changing only reporting leaves citizen and ground-truth histories unchanged; Tick 500 Replay and Reset reproduce all state; v0.4 legacy runs remain identical; focused tests, type checking, and production build pass.

## v0.5B — Investigative information readiness

**Goal:** Make observer knowledge and researcher truth separately inspectable without implying that a named suspect is a proven offender.

**In scope:** Unknown or evidence-backed named suspect leads, a small explicitly synthetic witness/identity-observation process, safe observer read models, researcher-only offence history and behavioural profiles, descriptive minor/serious overlap metrics, and grounded incident symbols in the cinematic city. Keep existing camera, playback, and three observation views.

**Exit criteria:** No public view, tooltip, agent selection, or development fixture exposes hidden offender identity or future evidence; named leads have a visible source and availability Tick and may be inaccurate; zero-denominator and reporting-bias cases are handled explicitly. Browser review at the fixed hero seed and 1440 × 900 covers Tick 0/100/500, views, close markers, cardinal bearings, narrow layout, replay, and 100 citizens; record performance and visual limitations. Legacy v0.4 browser regression, tests, type checking, and build pass.

## v0.5.1A — God View Population Explorer

**Goal:** Let a researcher inspect every synthetic citizen at the current or replayed Tick without changing the restricted observer model or event visualization modes.

**In scope:** A researcher-only population read capability joining static citizen profiles, deterministic synthetic identity, authoritative current state, complete tick-bounded citizen events, and true offence history. Add a collapsible, resizable left Population Sidebar with full-population browsing, ID/name search, filters for implemented fields, Profile/Activity/History tabs, map/list selection, selected-agent highlight, and camera Focus/optional Follow. Keep Truth, Observed, and Compare as event layers; do not clear researcher selection when changing them. A missing occupation remains missing rather than becoming invented UI content.

**Exit criteria:** Every citizen, including indoor and visually grouped citizens, can be found. Search, filters, history, and inspector data agree with the selected replay Tick and update on Return Live. Identity and appearance assignments reproduce from separate versioned seeds and do not depend on camera, FPS, replay, or offending propensity. Focus and Follow preserve bearing and pitch, and keep any zoom adjustment within camera bounds; direct map manipulation and Reset cancel Follow, while discrete bearing/pitch controls can orbit a followed citizen. Existing observer-port isolation, replay, camera controls, tests, type checking, and build pass. Inspect a fixed-seed 1440 × 900 browser view, close focus, and a narrow viewport, recording screenshot and browser evidence.

## v0.5.1B — Character system proof of concept

**Goal:** Replace the closest simplified pedestrians with a small set of licensed, rigged characters while keeping individual identity separate from reusable rendering resources and preparing for a future 1,000-citizen run.

**In scope:** Verify the exact license and contents of acquired character and animation packages; normalize compatible models to a documented rig and asset manifest; create 5–10 distinct stable appearance combinations. Use far/medium/close representation with a bounded close-range skinned-character pool and shared lower-detail resources. Provide a selected-only 3D portrait so a researcher can inspect an individual even when a city building occludes their world avatar; an explicit Inspect 3D camera action gives close spatial context. Map simulation activity to idle/walk; demonstrate jog in an isolated preview until the simulation has a real jog state. Keep simulation position authoritative and strip or neutralize clip root motion. Preserve per-agent selection across levels of detail.

**Exit criteria:** The same agent keeps its appearance and identity through playback, Pause/Resume, 1×/2×/4×, Tick 100/500 inspection, bearing/pitch changes, and LOD transitions. Every selected citizen can be inspected in the portrait even when city geometry occludes the map view. Record package URL, version, acquisition date, applicable license, and hashes; do not commit raw assets with unresolved redistribution rights. Browser screenshots at the fixed seeds and 1440 × 900 show a visible improvement at close range without overwhelming the city. Report draw calls, triangles, frame times, visible population, and full-rig count on a named renderer, plus tests, type checking, and build results. A 1,000-person synthetic fixture may measure catalog, list, and renderer scaling but must not be presented as an actual 1,000-citizen simulation; raise the simulation cap only with independent behavior, event, spatial-capacity, and replay tests.

## v0.5.2 — Population spatial fidelity and character behaviour

**Goal:** Give concurrent public activities separate legal positions, maintain identity through character representations, and make movement animation follow authoritative state for 100–200 citizens.

**In scope:** Deterministic activity slots derived from pedestrian anchors at plazas, parks, public entrances, and sidewalks; per-slot capacity, nearby alternatives, and explicit waiting when full. Preserve every citizen in the world renderer. Store route heading and a synthetic walk/jog choice in simulation state; use state for turning, arrival, and clip blending. Keep the researcher Population Inspector independent of event layers and observer restrictions. Check character resource bounds and named hardware-GPU browser behavior.

**Out of scope:** Crowd collision avoidance, 1,000-citizen simulation acceptance, policing strategies, backend services, and an asset-system replacement.

**Exit criteria:** With fixed city and simulation seeds, 200 citizens remain distinct at Tick 0/100/500 and replay. Every occupied slot is unique, reachable, and on a legal pedestrian surface; several citizens can occupy one site at separate slots. Capacity exhaustion produces a visible waiting state or event. No outdoor citizen is silently omitted by LOD. Selection, Focus, Follow, portrait, event-mode changes, bearing/pitch, Pause/Step, and replay still work. Report fixed-view and narrow screenshots, the renderer and frame sampling method, instance and GPU resource counts, simulation tick cost, tests, type checking, and build results. State remaining close-view and moving-crowd limitations explicitly.

## v0.6 — Multi-level urban world and emergent opportunities

**Goal:** Grow the existing `shadow-city-hero-01` map from 212 × 212 m to a connected 300 × 300 m city. Preserve the original core's roads, central plaza, building IDs, skyline and architectural vocabulary; add outer districts and replace only one east-of-plaza core block with the Galleria. Connect all new streets, entrances and multi-level routes to the same pedestrian network. Let visits, encounters, and offences follow explicit spatial and behavioural rules rather than a prescribed bridge itinerary or scripted crime location. The v0.5.2 simulation remains accessible through `?world=legacy`; the discarded separate 320 m scene is available only as `?world=prototype` for comparison.

The v0.6 implementation is split into reviewable gates:

| Gate | Deliverable | Exit evidence |
| --- | --- | --- |
| **A — Static world and proof** | Versioned `WorldModelV2` derived from the original `CityModel`, a connected 300 m outer ring, semantic building places, and an independent L0/L1 bridge fixture. | Original core roads, plaza and retained building IDs match the v0.5.2 map; outer road and pedestrian graphs connect to that core; same X/Z on distinct surfaces is not conflated; 3D stair/ramp routes are continuous; the old city generator's golden data is unchanged. |
| **B — Accessible Galleria** | Upper and lower walkable floors, corridors, indoor retail/cafés, portals, atrium, stairs, ramp, escalator and ground alternative. | Every generated node and surface edge is legal; closed entries reject new arrivals, occupied connectors can finish, and indoor residents can exit. Browser near views check slab/rail/door alignment. |
| **C — Activity and routes** | `SimulationStateV5`, deterministic profile needs and location utility, bounded activity slots, personal integer-cost routes, dynamic access commands, waiting, and safe-node replanning. | 200 identities stay separate, reservations do not overlap, route and command histories replay, and Tick 0/100/500 and long-range states agree. |
| **D — Spatial opportunity** | Second-resolution same-surface encounters, real citizen or named place-resource targets, episode hazard/cooldowns, truth incidents and separate reports. | Zero opportunity gives zero offence; different floors do not co-occupy; an episode produces at most one offence; changing reporting only preserves citizen and truth trajectories; observer reports expose only observed fields. |
| **E — God View and visual review** | Expanded original-map default scene with v5 simulation, legacy model entry, floor filter, cutaway, surface pick, route/nav overlays, cross-floor camera focus/follow, and character LOD. | Before/after 1440 × 900 DPR 1 screenshots show the original city still recognizable within its new districts; bridge and Galleria close views, cardinal bearings, narrow view, selection and replay are inspected in a real browser; hardware GPU performance is measured against the limits below. Any missed performance gate remains open. |

**Reference performance target:** 200 citizens on Chrome hardware GPU at 1440 × 900, DPR 1: average ≥50 FPS, p95 frame interval ≤33 ms, simulation Tick p95 ≤5 ms, and deterministic Tick 500 recomputation ≤2 seconds. Record renderer, draw calls, triangles, geometry/texture counts, and available JS memory separately. These are machine-specific review targets, not cross-device guarantees.

**Current expanded-world status:** The 300 m city, blue open-air overpass with two navigable exterior stairs, upper Galleria connection, camera interactions and retained ground crossing have browser screenshot evidence. The reusable overpass has a transverse guard at its free end. Its Galleria-side stair and footpad sit at least 0.5 m beyond the vehicle curb on a paved forecourt formed by locally recessing the mall facade; L0/L1 floors, roof, portal and interior routes follow the same outline. A rotated second-road fixture checks reuse without adding another bridge to the default city. The 200-citizen simulation Tick and Tick 500 recomputation exceed the reference limits, so the performance part of Gate E remains open; close-view bridge detailing must still be judged against the user-provided photograph. See `V06_ARCHITECTURE.md`.

**Out of scope:** police investigation, SSP/HSP, elevator dispatch, a production NavMesh, a 1,000-citizen acceptance claim, empirical calibration, backend services, and database persistence. The bridge, Galleria, operating hours and place attractiveness may change outcomes through reproducible interventions; no route or offence is guaranteed by config. See `V06_ARCHITECTURE.md` for data flow, evidence and remaining limits. If visual or hardware inspection is unavailable, leave the relevant gate pending.

## v0.6.1 — Encounter, social relationships and subjective knowledge

**Goal:** Let residents encounter one another through legal space and time, sometimes interact, and retain bounded subjective knowledge. Connect contact to a separate offender decision and witness/reporting path without giving the observer research-only truth.

| Gate | Deliverable | Exit evidence |
| --- | --- | --- |
| **A — Spatial contact** | Surface-keyed spatial index, explicit portal contact, deterministic social episode lifecycle. | Cross-floor, blocked-polygon, connector, pair-order, hysteresis and repeated-episode tests. |
| **B — Perception and interaction** | Directed attention, bilateral greeting and stationary conversation with real Tick cost. | Near does not imply noticed or interaction; no moving conversation or teleport; one initial and at most one settled decision per episode; closure interruption and speed/replay parity. |
| **C — Relationship and memory** | Directed familiarity/recognition/identity beliefs, bounded owner-local memory and knowledge, subjective risk. | Passing never grants a name; conversation may exchange a name; source and confidence preserved; Tick 100/500 replay and capacity tests. |
| **D — Crime and witness** | Explicit exclusive encounter-aware mode, second-level opportunity/attempt/truth event, five-stage witness perception, delayed subjective reports. | Zero opportunity can yield zero offence; multiple reports are one truth event; offence-second spatial eligibility; observer allowlist; old v5 and v2–v4 regression. |
| **E — Researcher God View** | Relationship, encounter, memory and timeline inspection, real seek, selected encounter visualization. | UI reads simulation state and decision traces; all event modes retain God View; actual browser captures include a natural encounter and active interaction. |
| **F — Scientific and performance review** | Reproducible positive/negative fixtures, metric denominators, 100–200-resident CPU/browser samples, assumptions and limitations. | Typecheck, full tests, production build, Tick 500 replay, real Chrome screenshots and measured frame/render counters; unmeasured GPU limits stay open. |

This is an opt-in, fingerprinted `EncounterScenarioV1` extension to v5; old configs retain the legacy incident pipeline. Synthetic rules are research assumptions, not predictions about people or real cities. See `V061_ENCOUNTER_ARCHITECTURE.md` for the tick phases and model boundaries. **Status:** functional gates A–F have code, test and real Chrome evidence in `V061_VERIFICATION.md`. The 200-citizen hardware Chrome and replay performance targets remain open; this milestone is not performance-complete.

## v0.6.2 — Daily habits and adaptive routines

**Goal:** Give each resident a deterministic but individual routine whose actual activity decisions respond to needs, obligations, learned preference, directed social experience and legal place access. Preserve the integrated v5 world, Encounter, offending, replay and character rendering boundaries.

| Gate | Deliverable | Exit evidence |
| --- | --- | --- |
| **A — Calendar and individual profiles** | Versioned calendar, independent per-agent habit seed, appropriate home/work obligations and variable activity windows. | Day rollover, Reset, fixed Tick, separate seed and multi-day replay tests; no real-time clock input. |
| **B — Decisions and adaptation** | One current intention, feasible-place utility with stored candidate terms, real activity history, previous-Tick feedback and learned strengths/valence. | Closure/capacity/route tests, actual before/after change records, paired habit-weight and place-closure runs, no scripted demonstration event. |
| **C — Encounter and God View** | Existing social interaction and memory feed relevant later decisions; Routine/Today/Decisions/Habits researcher tabs read state and traces. | No social reward without an actual interaction, ObserverPort remains isolated, past-Tick inspector and Chrome captures show actual decision/history. |
| **D — Scientific and performance review** | 100–200-citizen CPU/Chrome samples, continuous multi-day run, replay equality, screenshots and requirement matrix. | Record p50/p95 Tick/frame values, route/scheduling/replanning cost, history growth, legal slots/surfaces and waiting streaks; missed prior performance targets remain open. |

`HabitScenarioConfigV1` is optional in the engine and fingerprinted. The integrated app enables it by default; `?habits=off` retains the prior v5 decision path. The calendar runs at 30 seconds per Tick for scheduling while existing physical movement/contact remains 6 seconds per Tick, an explicit modelling approximation. See `DAILY_HABITS_ARCHITECTURE.md` and `DAILY_HABITS_VERIFICATION.md` for the formula, evidence, traceability and limits. Full sitting/gesture animation, school places, empirical calibration and a bounded research-history archive are not included in this milestone.

## v0.6.3 — Injury, mortality and persistent life state

**Goal:** Let qualifying real offences produce reproducible synthetic injury and possible death, with persistent life state, behavior consequences, scene discovery and researcher history. This extends the existing v5 Tick pipeline; it does not introduce a second simulation engine.

| Gate | Exit evidence | Current status |
| --- | --- | --- |
| A — Life core | Typed alive/deceased and functional status, runtime invariants, stable injury/death records. | Implemented and unit tested. |
| B — Outcomes | Explicit physical-assault eligibility, independent keyed injury/fatal draws, actual victim attribution and replay. | Implemented; default scenario can have zero deaths. |
| C — Consequences | Incapacitation, reduced speed, activity/social interruption, recovery, irreversible death and retained history. | Implemented; longer-term adaptation after learned death remains future work. |
| D — Information and scene | Spatially anchored scene, same-surface discovery, separate delayed report allowlist, no automatic knowledge broadcast. | Implemented foundation; official notification/hearsay deferred. |
| E — God View and character | Life history, event seek/focus and state-driven portrayal. | Functional UI; authored collapse/death/standing animation and indoor occlusion quality remain open. |
| F — Scientific and performance acceptance | Deterministic vertical slices, regression, Chrome screenshots, Tick/frame/memory measurements and traceability. | Evidence in `LIFE_STATE_VERIFICATION.md`; full visual quality acceptance remains open. |

See `LIFE_STATE_ARCHITECTURE.md` for mechanisms and assumptions and `LIFE_STATE_VERIFICATION.md` for the requirement matrix. This work does not change the pending v0.6 200-citizen performance gate or authorize policing features.

## v0.6.4 — Persistent scenes and event reconstruction

**Goal:** Preserve the visible aftermath of emergent harm as versioned spatial state and let researchers reconstruct real event histories through the existing deterministic replay system.

| Phase | Boundary | Exit evidence |
| --- | --- | --- |
| A — Spatial provenance | Scene anchors link legal millimetre coordinates, surface, level, place and optional building or Galleria reference to a real injury or death. | Stable IDs, source invariants, cross-floor and no-duplicate tests. |
| B — Lifecycle | Death aftermath persists; incapacitation aftermath resolves after mobility returns. Old life-only experiments retain their original path. | Before/during/after tests and legacy replay regression. |
| C — Discovery and information | Nearby legal movement and attention can produce local discovery; completed conversation can transmit a limited hearsay claim; delayed reports use an ObserverPort allowlist. | No truth leakage, multi-level visibility, deduplication and report-availability tests. |
| D — God View | Event Explorer reads real event and scene records, supports filters, focus, involved agents, encounter links and observer comparison. | Browser inspection of a naturally generated event at a fixed seed; no fabricated narrative. |
| E — Reconstruction and visual review | Replay controls, bounded selected-agent trails, event markers and scene-discovery indicators. | Tick-accurate life, knowledge and scene state; Chrome 1440 × 900 screenshots and named renderer measurements. |
| F — Full regression | Typecheck, tests, production build, browser and performance review. | Record open visual and performance gaps honestly; do not present a synthetic result as a real-city prediction. |

See `SCENE_ARCHITECTURE.md` and `SCENE_VERIFICATION.md`. The work does not add police investigations, forensic evidence, emergency response or new crime mechanics.

## v0.6.5 — Functional Central Galleria vertical slice

**Goal:** Make one existing building an active environment for need-driven visits, legal indoor activity, capacity, encounters and emergent opportunities. Keep the original integrated city and existing v5 engine. Stop at Central Galleria; citywide functional interiors require a separate review.

| Phase | Exit criterion | Status |
| --- | --- | --- |
| A — Audit | Identify inherited navigation, places, habits, encounters, truth and replay; preserve a clean starting worktree. | Documented in `PLACE_AGENT_ARCHITECTURE.md`. |
| B — Place model | Versioned static building/floor references and dynamic, replayable opening, occupancy, reservations, active intentions and capacity invariants. | Implemented and unit tested. |
| C — Mall access | Both floors, ground and bridge portals, interior retail/café slots and legal return routes. | Existing world reused; focused route tests and browser cutaway evidence. Detailed rooms remain schematic. |
| D — Activity | Compatible need selects a reachable, open place; arrival starts a timed activity; completion, closure and severe harm interrupt correctly. | Implemented with deterministic natural-visit and fixture tests. |
| E — Contact and opportunity | Indoor contact retains surface/floor/place; proximity does not require conversation or crime; offender decision remains shared across spaces. | Existing encounter/offender engine reused; natural L1 café case and cross-floor regressions. No inventory or shoplifting model. |
| F — God View | Place Inspector shows real building, place, visitors, activities and event links; researcher truth stays separate from observer reports. | Browser reviewed at 1440 × 900; interior art and some compact-layout work remain open. |
| G — Verification | Paired open/closed/access scenarios, Tick 500 replay, full regression, Chrome screenshots and measured performance with explicit limitations. | See `PLACE_AGENT_VERIFICATION.md` and `PLACE_AGENT_TRACEABILITY.md`. The reference 5 ms Tick and 2 s replay gates remain open. |

`place-v1` is an opt-in, fingerprinted `SimulationStateV5` extension. The integrated app enables it; old experiments and legacy replay retain their original code path. This release does not introduce a new generator, economic system, service staff, shoplifting, police or citywide indoor rollout.

## v0.6.6 — Typed interaction, crime and causal simulation

**Goal:** Give emergent person-targeted offences explicit opportunities, stochastic attempts, concrete consequences and explainable histories under one new-scenario clock.

**Implemented:** A fingerprinted six-second integrated scenario; seeded portable items and possession transfer; person-targeted theft and physical assault; type-specific cumulative hazard; bounded recent negative episode summaries; victim self-check knowledge; existing witness/report/life/scene integration; God View causal inspection; paired-seed experiment tooling. Legacy generic offences remain on their explicit older path. See `SIMULATION_CLOCK.md`, `CRIME_OPPORTUNITY_AND_HAZARD.md`, `TYPED_CRIME_ACTIONS.md`, `CAUSAL_EVENT_LEDGER.md`, `KNOWLEDGE_AND_REPORTING.md` and `CRIME_SIMULATION_VERIFICATION.md`.

**Open gates:** The 200-resident Tick p95 and Tick-500 replay still exceed 5 ms / 2 s. A durable searchable episode archive and isolated long-run memory measurement remain future work. Synthetic hazard parameters are not externally calibrated; paired outputs are exploratory and cannot justify real-city policing claims.

## v0.6.7 — Unified world clock and dynamic day–night lighting

**Goal:** Drive a continuous 24-hour visual lighting cycle from the integrated v5 six-second World Clock while preserving the existing night scene and historical replay semantics.

**Implemented:** Pure cyclic lighting keyframes; directional sun and moon, gradient sky and fog, consistent window/street emissions, visual-only development scrub, and a static-architecture shadow cache that refreshes on time or cutaway changes. The old `lighting=night|day` diagnostic remains available. See `DAY_NIGHT_VERIFICATION.md`.

**Exit evidence and open gate:** Seven fixed-view Chrome/Apple M4 captures, preview/replay/camera checks, tests and build pass. The 200-resident p95 frame and simulation Tick targets remain above the reference limits, so performance acceptance is still open. Historical 30-second `habit-v1` experiments retain their versioned clock semantics and are excluded from the integrated six-second lighting path.

## Experimental workstream — Twilight terrain and roads

`?world=dev` is a versioned, isolated terrain and road experiment on the integrated 300 m city. The current slice supplies continuous height data, graded roads, a lower channel with two road bridges and two culverts, protected building pads and stairs, and one three-way ridge diversion. Three 8 m S corridors share road centrelines with twelve polygon blocks, fitted buildings, crossings and pedestrian navigation. A 54 m river bend now shares its plan with both flanking roads, bridge nodes and nine polygon blocks. Curved four-way junctions have fitted paving, curb corners and lane-mark ends; polygon park surfaces fit their actual footprint. Four-face entrance and portal support exists, but current dev buildings still use south entrances. Main and legacy scenarios remain separate.

The infrastructure tests and real Chrome screenshots are recorded in [`TWILIGHT_TERRAIN_DEV.md`](TWILIGHT_TERRAIN_DEV.md). **The visual and 200-citizen performance exit gates remain open:** the full Hero view still reads mostly as a Manhattan grid and does not yet carry the reference image's strong terrace/valley composition. Two latest hardware Chrome dev-200 samples measured about 36–37 FPS, and both missed Tick and replay targets; the unchanged main world also slowed in those sessions. Further citywide deformation requires a broader graph-driven district plan, non-south entry visuals for asset buildings, and a coherent highland route and terrain surface. Do not ship this experiment as the default world before those spatial and visual gates pass.

## v0.7 — Policing strategy design and implementation

**Goal:** Compare explicit police decision strategies under transparent model assumptions.

**In scope:** Configurable investigative actions and costs, lawful observation inputs, attribution decisions, and carefully defined SSP, hotspot, and baseline comparisons. Policy interventions may change later ground truth; share initial conditions and exogenous random samples without forcing outcomes to be identical.

**Exit criteria:** Strategies consume only permitted knowledge, use reproducible decisions, and report detection and cost metrics only when corresponding mechanisms exist.

## v0.8 — Experiment comparison

**Goal:** Make repeated experiments understandable and shareable.

**In scope:** Scenario configuration, side-by-side comparisons, summary metrics, and exportable run data. Add persistence only if a concrete workflow needs it.

**Exit criteria:** Users can reproduce, compare, and export runs with their seeds, parameters, and model version; visualizations state which data is truth and which is observed.

## v1.0 — Research-ready release

**Goal:** Deliver a stable public tool with clear scientific and engineering limits.

**In scope:** Model documentation, validation against stated assumptions, accessibility, performance, reproducibility, contribution guidance, and a stable experiment workflow.

**Exit criteria:** Representative scenarios are reproducible, limitations are documented, the core experience passes accessibility and browser checks, and contributors have a clear path to extend the model without coupling simulation to rendering.
