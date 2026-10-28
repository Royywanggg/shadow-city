# Persistent scenes and event reconstruction (Round 4)

## Boundary and Tick order

Round 4 is an opt-in `SceneScenarioConfigV1` extension of `SimulationStateV5`. The integrated city enables it with life state; `?scene=off` keeps the Round 3 path. V5 records without the scene config still create and discover `LifeStateV1.scenes` as before. The config is part of the V5 fingerprint, so old and new replays cannot be silently mixed.

Each Tick still uses the existing movement, encounter, offending and life-outcome pipeline. After harm is resolved, the Scene stage creates persistent spatial evidence, resolves transient incapacitation evidence, queries eligible discoverers, records local observations, schedules reports and transmits limited second-hand claims after completed conversations. The Scene stage does not move residents, change navigation, choose offenders or create outcomes. No scene is added for a nonphysical offence or an injury without a persistent visible aftermath.

## Event versus Scene

`OffenceV5`, `InjuryRecordV1` and `DeathEventV1` are facts about what occurred. `SceneEntityV1` is the visible aftermath occupying a legal location over time. Its stable ID refers to the source death or injury; `SceneTransitionV1` records creation and resolution. The anchor stores integer-millimetre position, `surfaceId`, `levelId`, `placeId` and an optional structure reference. A building ID is resolved only when the static world has that building; the Galleria and overpass use their own references, and open public space has no invented building.

A death aftermath stays `present` until a future explicit cleanup mechanism exists. This release has no cleanup command, medical removal, police cordon or emergency vehicle. An incapacitation aftermath resolves when the injured resident regains mobility; its entity and transitions remain in history. A fatal injury creates a death scene, not a duplicate incapacitation scene. Existing Round 3 `life.scenes` is written only by old configurations; Round 4 uses `state.scene.entities` as the scene authority.

## Discovery and information

The Scene stage indexes residents by `surfaceId` and a deterministic spatial grid. It only evaluates residents in nearby cells. Eligibility requires a distinct living and capable resident, an activity other than `atHome`, the same surface, three-dimensional radius, a clear surface segment, prior non-discovery and an attention-weighted keyed draw. A scene is first eligible the Tick after creation. Same X/Z on another floor is not a discovery.

`SceneDiscoveryV1` is a private provenance record. It stores a resident's perceived scene location, possible status, place and level separately from the true event. Direct discovery adds a bounded owner-local social memory and knowledge claim. It never reveals the offender or true cause. A report is derived from the perceived fields, rounded and sometimes omits level or place; only delivered reports cross `ObserverPort`. Private `sceneId → discoveryId → reportId` links stay in `SceneStateV1`.

Second-hand information requires an actual completed conversation and a prior direct discovery by one participant. A keyed probability controls whether a possible-status and place claim is transmitted. The recipient receives an owner-local `hearsay` memory and knowledge record with lower confidence, but no automatic ObserverPort report. Hearsay does not assert true death, cause or offender identity. This release does not model residents receiving official reports, broad rumor propagation, or police knowledge.

## Researcher reconstruction

`buildEventIndexV1` indexes only events available in the inspected state. The God View Event Explorer lists real offence, injury, death, scene-transition and discovery records, with type/place/Tick filters and observer reports linked through private provenance. Selecting an event focuses the three-dimensional camera and can open the existing Population or Encounter inspector. Researcher annotations remain labelled God View even when the map's event layer is set to Observed.

Before/Event/After and Replay Through Event call `SimulationSessionV5.inspectTick()`. That method restores deterministic checkpoints and advances authoritative state without changing the live Tick. `reconstructWindow()` derives bounded selected-agent Tick positions from the same checkpoints without publishing another snapshot. Map trails and markers do not drive movement. Offences record a within-Tick second; life outcomes, scene creation and death position are Tick-end facts, so no precise within-Tick death animation is claimed.

The Event Explorer's level selection and Galleria roof cutaway use the existing world controls. Present scenes have clickable, surface-anchored God View rings when the explorer is open; the selected event has a distinct highlight. Ordinary static buildings do not yet have modeled interior floors or a per-building roof-removal representation; the UI does not claim a full forensic interior view of those structures. `deck.gl` was not added because the existing R3F scene can draw the selected event, bounded trails and discovery markers without another camera, depth or picking stack.

## Cost and scientific limits

Scene discovery indexes residents once per Tick and checks only same-surface nearby cells. Historical trajectories are reconstructed only for the selected event's involved agents and at most a 61-Tick window. Scene and social histories remain in memory for deterministic replay; they are not a disk archive. Reports and discoveries are synthetic observations, and model probabilities are not calibrated to any real population. The system supports runs with zero crimes, zero deaths and zero discoveries.
