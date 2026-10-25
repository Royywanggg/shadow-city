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
