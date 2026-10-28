# Place–Agent interaction: Central Galleria vertical slice

## Scope and inherited systems

The integrated `shadow-city-hero-01` world already contained Central Galleria, two floors, a ground entrance, a skybridge portal, a ramp, an escalator, a public atrium, one retail place and one café on each floor. The navigation graph, daily habit utility, activity history, same-surface encounter pipeline, offender decisions, life state, scene state, replay and Event Explorer were present. This slice extends those systems; it does not generate a new city or replace the simulation engine. Detailed rooms, goods, ownership, staff service and a building asset overhaul are outside this slice.

| Audit question | Repository finding before this slice |
| --- | --- |
| Git and Round 3/4 | The starting worktree was clean on `main`; life, persistent scene and Event Explorer modules were present on that branch. No other branch was assumed merged. |
| Geometry versus navigation | Galleria geometry was assembled from world boxes and architectural skin. Legal L0/L1 surfaces, shop portals, a ground entrance and a bridge connection were already represented in the graph. The rendered interior remained schematic. |
| Place data and occupancy | `SemanticPlace` already carried activities, hours, capacity and slot nodes; citizen state carried reservations. There was no explicit, inspectable runtime occupancy snapshot, and capacity could be bypassed when available slot count exceeded declared capacity. |
| Decision and arrival | Daily habits already produced need-driven candidate utilities and timed `atDestination` stays. Arrival and finish were logged, but explicit activity start/interruption and a building-level God View were missing. |
| Indoor contact and offences | The encounter pipeline already required compatible spatial contact, and offence truth already held 3D surface/place identity. Indoor contact was possible but less visible than street contact. Earlier road-heavy outcomes are consistent with more outdoor movement and contact opportunities; the audit does not establish a single deterministic cause. |
| Information and replay | `ObserverPort` used a separate allowlist and Tick replay was fingerprinted. Place runtime needed to join the same authoritative v5 state and fingerprinted opt-in config. |

## Four separate authorities

| Concern | Authoritative data | Consumer |
| --- | --- | --- |
| Visual geometry | `WorldModelV2.boxes`, existing city meshes and Three.js components | Renderer only |
| Legal movement | `WalkableSurface`, navigation nodes/edges, explicit portals and access modes | v5 movement and routing |
| Static function | `SemanticPlace` with stable ID, `buildingId`, optional `floorId`, surfaces, slot nodes, activities, opening hours, capacity and attractiveness | Habit decision and place validation |
| Dynamic function | `SimulationStateV5.placeRuntime` (`place-v1`) derived from current citizens, intentions and access state | God View Place Inspector and replay |

`SemanticPlace` is the existing place definition. Each Galleria shop and café is associated with the existing `central-galleria` building identity and one floor. A mall parent place covers the public L0/L1 surfaces. The shop/café surfaces have separate portals and three distinct slot nodes each. The geometry is a visible approximation; mesh triangles do not grant access. Validation rejects missing spatial references, duplicate slots, invalid capacities, missing activities and schedules, floor mismatch and unknown building identity.

`placeRuntime` is enabled only when the versioned `placeInteraction` configuration is present. It records physical occupants, slot reservations, waiting agents, active habit intention IDs, opening state and free slots. A resident physically standing on a slot keeps it occupied even if an activity reservation ends or a severe injury interrupts the activity. A corpse or incapacitated resident cannot be silently replaced by another person at the same coordinates. Runtime derivation rejects duplicate assignments and over-capacity state. Place runtime is not sent through `ObserverPort`.

## Decision and Tick order

1. Apply effective-Tick access commands and compute current opening/accessibility for the habit decision. The habit calendar advances 30 calendar seconds per Tick; movement/contact still use six physical seconds per Tick, as documented in `DAILY_HABITS_ARCHITECTURE.md`.
2. Residents due for a decision form an activity intention from their existing needs/obligations. The existing utility evaluates compatible, open, reachable places using need, preference, learned value, prior experience, route time, crowd and deterministic variation. Capacity filters full places before selection. No resident, destination, encounter or offence is prescribed.
3. Reserve a deterministic free slot, plan a legal graph route and emit `TripStarted`. Routes traverse the actual ground or bridge portal and interior edges. Closed entrances reject new entry; an occupant can leave by the existing one-way egress rule. A blocked route replans or produces `TripFailed`/waiting, without teleporting.
4. Position and `surfaceId` move along the route's three-dimensional millimetre paths. `DestinationReached` and `ActivityStarted` occur at the assigned node; `atDestination`, `nextDecisionTick` and habit intention/history represent progress. `ActivityFinished` or `ActivityInterrupted` ends the activity. Closure and serious life outcomes interrupt; cancelled routes release future reservations while physical occupancy remains authoritative.
5. The existing encounter pipeline sees post-movement traces on compatible surfaces, evaluates directed attention and interaction willingness, and then passes eligible contact to the offender model. Ground truth retains real `position`, `surfaceId`, `levelId` and `placeId`; reports are a later restricted projection. A café visit enables contact; it never guarantees conversation or crime. There is no new mall-specific crime multiplier or duplicate incident generator.
6. Life/scene/report stages finish; the final state receives its place runtime snapshot. Tick replay recomputes the same snapshot from the same world, model configuration and command fingerprint. Rendering and animation never determine this state.

## Researcher interface

The existing God View has a Place Inspector for Central Galleria. Selecting the building or one of its places shows its actual floors, portals, access mode, activity tags, capacity, occupancy, free slots, visitors and current activity timing, plus recorded activity, encounter, truth offence, report and scene counts. Person and offence links open the existing Population and Event explorers. Focus, floor isolation and roof cutaway use the existing camera/scene controls. The interface labels the interior as navigation and floor visualization because detailed room geometry is not modeled. Truth remains researcher-only; event mode does not restrict God View.

## Scientific and compatibility boundaries

- `place-v1` is an opt-in v5 model parameter and part of the replay fingerprint. Legacy v2–v4 and v5 configurations without it retain their prior path.
- Existing `retailStock` resources can support the already defined generic place-resource opportunity. They do not constitute inventory or ownership; no shoplifting claim is made.
- Social contact requires a legal shared surface and spatial proximity; different floors are not merged by X/Z. Nearby residents can also decline social interaction.
- Synthetic needs, propensity, attention, schedules and criminal decisions are model assumptions, not estimates of real urban behaviour.
- The slice stops at one mall. Other pre-existing static places remain present; the new Place Inspector does not claim citywide functional interiors.
