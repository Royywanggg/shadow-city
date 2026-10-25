# Shadow City roadmap

This roadmap is milestone-based, not date-based. Each milestone should leave a usable, reviewable result. `VISUAL_DIRECTION.md` governs visual decisions and visual verification.

## v0.1 — Visual foundation

**Goal:** Create a city worth looking at: a full-screen, cinematic nighttime architectural miniature with an isometric orthographic camera.

**In scope:**

1. Set up the React, TypeScript, Vite, Three.js, React Three Fiber, and limited Drei application when implementation begins.
2. Define static `CityModel` data and a seeded generator. Use one consistent coordinate system and stable identifiers.
3. Generate a connected road network as abstract nodes and edges. Derive visible roads, intersections, blocks, and parcels from that network. Preserve graph information for later movement; do not implement pathfinding.
4. Generate varied building descriptors and render a limited architectural vocabulary, coherent skyline, roads, sidewalks, nighttime materials, lighting, and atmosphere.
5. Provide an orthographic hero camera with smooth bounded pan and zoom, plus a clean full-screen presentation.
6. Profile and refine the scene, then inspect it in a browser against the visual gates in `VISUAL_DIRECTION.md`.

**Out of scope:** Criminal or police agents, general agent simulation, pathfinding, time controls, dashboards, experiment tools, databases, authentication, backend services, and cloud infrastructure.

**Exit criteria:**

- A fixed seed and generation configuration reproduce the same static city data. The road graph has valid node and edge references and the intended connected routes; buildings remain within buildable parcels and do not visibly overlap streets.
- The fixed `shadow-city-hero-01` scene is inspected at 1440 × 900 CSS pixels in a browser. Composition, silhouettes, lighting, atmosphere, road legibility, building variation, and camera behavior pass the gates in `VISUAL_DIRECTION.md`. Screenshots are reviewed when capture tools are available. If browser inspection is unavailable, visual acceptance remains pending.
- At least two other seeds and a narrow viewport are inspected for major layout or framing failures. Panning and zooming are tested in the browser.
- Type checking, production build, and focused tests for seeded generation and spatial invariants pass. Browser, viewport, device pixel ratio, seed, and measured rendering performance on the reference device are recorded. Performance problems affecting smooth camera interaction are resolved before release.

## v0.2 — Deterministic simulation foundation

**Goal:** Introduce a simulation loop without changing the static city contract.

**In scope:** A deterministic clock, simulation state snapshots or equivalent replayable state, a minimal event log, and run/pause/restart controls. `SimulationEngine` reads `CityModel` and emits dynamic state consumed separately by the renderer.

**Exit criteria:** The same seed, configuration, and inputs produce the same state sequence; replay and reset work; static city data remains unchanged; dynamic rendering is visibly isolated from city generation.

## v0.3 — Urban agents and movement

**Goal:** Make the city behave as a place before introducing crime or policing.

**In scope:** Basic agent schedules, destinations, movement on the road graph, and visible agent state. Add routing here, with documented assumptions about travel and access.

**Exit criteria:** Agents move on valid connected routes, runs remain reproducible, and the renderer can display many agents without compromising the city view or interaction quality.

## v0.4 — Ground truth and observation

**Goal:** Establish the core scientific distinction between events and knowledge of events.

**In scope:** Ground-truth event records, a separate reporting/observation process, and explicit data views for truth versus observed information. Document the reporting assumptions.

**Exit criteria:** Every observed record can be traced to a defined process; missing or delayed reports are represented without changing ground truth; experiments can compare truth and observation reproducibly.

## v0.5 — Policing strategies

**Goal:** Compare strategies under transparent model assumptions.

**In scope:** Configurable police behavior and allocation policies, strategy inputs, and outcome measures that do not confuse reported activity with underlying events.

**Exit criteria:** Strategies can run against the same seeded scenario; parameters and assumptions are visible; outputs distinguish ground truth from observations.

## v0.6 — Experiment comparison

**Goal:** Make repeated experiments understandable and shareable.

**In scope:** Scenario configuration, side-by-side comparisons, summary metrics, and exportable run data. Add persistence only if a concrete workflow needs it.

**Exit criteria:** Users can reproduce, compare, and export runs with their seeds, parameters, and model version; visualizations state which data is truth and which is observed.

## v1.0 — Research-ready release

**Goal:** Deliver a stable public tool with clear scientific and engineering limits.

**In scope:** Model documentation, validation against stated assumptions, accessibility, performance, reproducibility, contribution guidance, and a stable experiment workflow.

**Exit criteria:** Representative scenarios are reproducible, limitations are documented, the core experience passes accessibility and browser checks, and contributors have a clear path to extend the model without coupling simulation to rendering.
