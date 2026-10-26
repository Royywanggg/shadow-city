# Shadow City vision

## Purpose

Shadow City is an interactive, agent-based urban simulation laboratory. Its long-term question is how individual behavior, policing strategies, reporting, and access to information change the relationship between **ground truth** and **observed reality**. It should be useful for exploratory experiments and engaging enough that people want to spend time watching the city.

The project is a model, not a claim that a simulated city predicts any real place. Later experimental results must expose their assumptions, seeds, and limits. In particular, an event occurring in the simulation and an event being reported or observed are different facts.

## Product direction

The main experience is a living, cinematic city viewed as an architectural miniature at night. Users should eventually be able to observe the city, adjust model parameters, compare strategies, and inspect how incomplete information affects decisions. Visual quality is a product requirement because the city is the primary way people will understand the system.

The first release, **v0.1**, contains only the visual city: procedural roads and blocks, varied buildings, a central public square, a nighttime scene, an isometric orthographic view, and smooth pan and zoom. It establishes a scene worth looking at before adding simulation features. Its art direction and review criteria live in `VISUAL_DIRECTION.md`.

## Architectural principles

The city has a static spatial model and separate dynamic state:

```text
seed + generation configuration
             |
             v
       CityGenerator
             |
             v
       CityModel (static)
        /           \
       v             v
   Renderer     SimulationEngine
       ^             |
       |             v
       +---- SimulationState (dynamic agents and events)
```

`CityModel` contains stable spatial facts such as districts, blocks, parcels, building descriptors, and a road network. The road network is both a graph of connected nodes and edges and the source of visible street geometry. This preserves a future movement interface without implementing pathfinding in v0.1. A shared coordinate convention and stable identifiers let rendering and simulation refer to the same places.

The `SimulationEngine` reads static city data and produces dynamic agent and event state. The renderer consumes `CityModel` and dynamic state separately. Simulation does not use mutation of the city's static geometry as its primary interface. The v0.4 observation process turns some ground-truth incidents into delayed reports. Researcher and observer read models make what happened and what is known separate data views; future strategy logic must receive only its permitted view.

The researcher has a global God View of the synthetic population. A Population Inspector can read each citizen's stable identity, current state, reproducible activity history, and true offence history at the inspected Tick. Truth, Observed, and Compare control event presentation, not researcher access to citizens. A future police observer needs its own knowledge boundary and must not inherit the researcher's population capability. Character appearance is stable per citizen and independent of offending propensity; simulation position remains authoritative when character animation is rendered.

Generation must be reproducible from a seed and configuration. The rendering layer should not make random layout decisions. Add complexity only when a milestone needs it and it improves the result.

From v0.6 onward, the default `WorldModelV2` is **derived from the original `generateCity('shadow-city-hero-01')` map**. The original 212 m core keeps its road and building IDs, plaza, skyline and architectural rendering. A connected outer ring expands the same city to 300 × 300 m; one plaza-adjacent core block becomes the two-level Galleria. Millimetre coordinates, walkable surfaces, semantic levels, portals, places, resources, and a three-dimensional navigation graph extend that city. `surfaceId` determines spatial membership; identical X/Z coordinates do not imply co-location across floors. `SimulationStateV5` holds citizens, reservations, access changes, encounters, offences, and reports separately. Earlier v2–v4 replay remains available through the explicit legacy model entry. An experiment fingerprint includes the world generator and structure, model settings, and ordered commands; a changed fingerprint is a replay error.

The Galleria, bridge, public spaces, opening times, and place attractions create **opportunities**, not scripted outcomes. Destination choice, routes, contact, offending, and reporting each have separate deterministic inputs. A reported event is a limited observation of a ground-truth event. The researcher Population Inspector keeps complete truth at the selected Tick; future police observers require their own restricted read model.

## Scope boundaries

There is no backend, authentication, cloud infrastructure, or database requirement for v0.6. Policing strategies and experiment comparison follow the multi-level world milestone in `ROADMAP.md`. Synthetic schedules, guardianship and offence parameters are not calibrated against real-world evidence and must not be interpreted as real-city causal estimates.
