# Shadow City contributor instructions

Shadow City is an open-source urban simulation laboratory. Its first milestone is a visually compelling, navigable 3D city. Read `docs/VISION.md`, `docs/VISUAL_DIRECTION.md`, and `docs/ROADMAP.md` before changing product scope or visual direction.

- Keep procedural generation, static city data, rendering, and future simulation logic separate. The renderer and future simulation consume `CityModel`; future dynamic agent and event state reaches the renderer through a separate simulation interface. Simulation must not primarily mutate static city geometry.
- Keep the researcher Population Inspector independent of Truth/Observed/Compare event layers and restricted ObserverPorts. Show only real simulation data, and derive identity and appearance from deterministic per-agent inputs that do not encode offending propensity.
- Generate roads as a connected abstract node-and-edge graph and derive their visible geometry from the same source. Preserve stable identifiers and deterministic output for a given seed and configuration. Pathfinding is outside v0.1.
- Keep the v0.6 `WorldModelV2` and `SimulationStateV5` versioned and separate from legacy replay. Store authoritative positions in integer millimetres; use `surfaceId` for spatial membership and explicit portals for cross-level movement. Include world structure, model parameters and commands in replay fingerprints.
- Build v0.6 on the original `shadow-city-hero-01` CityModel. Preserve its roads, plaza, and building language; add multi-level places through a derived world overlay. Treat the separate 320 m scene as a prototype, not the default product map.
- Prioritize visual coherence and measured rendering performance over feature count. Follow `docs/VISUAL_DIRECTION.md` for art direction and visual review gates.
- Keep v0.1 limited to the procedural city, orthographic camera, nighttime presentation, and pan/zoom interaction. Do not add agents, policing, dashboards, databases, authentication, or cloud services in this milestone.
- Write code comments in English. Prefer small, direct modules and tests that check meaningful behavior or invariants.
- Verify changes in a browser when visual behavior is involved. Record the seed, viewport, browser, and screenshot evidence used. Never claim visual inspection unless a browser was actually used; mark the gate pending when it cannot be performed.
