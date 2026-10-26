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

## Scope boundaries

There is no backend, authentication, cloud infrastructure, or database requirement for v0.1. Agent behavior, policing, crime reporting, and experiment comparison belong to later milestones described in `ROADMAP.md`.
