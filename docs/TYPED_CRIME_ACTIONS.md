# Typed criminal actions

`typed-crime-v1` is an opt-in, fingerprinted extension of `SimulationStateV5`. Existing generic `OffenceV5` records remain legacy/unspecified unless `offenceType` is explicitly present. Severity never identifies the action. The integrated browser scenario enables typed crime; older v5 replay/configurations keep their original generic path.

## Portable item theft

Some residents receive a stable synthetic phone at initialization, selected by a seed keyed to their ID. `PortableItemV1` stores a stable item ID, `ownerAgentId`, `possessorAgentId`, type and accessibility. Appearance and offending propensity do not determine item ownership. A theft episode requires that the victim still possess an accessible item at contact. On threshold crossing, an attempt can fail according to the configured synthetic completion probability. On success, the same deterministic transition records one `CrimeAttemptV1`, one `OffenceV5`, and the item's new possessor. Legal ownership remains with the victim. A later attempt against the same item is invalidated after rechecking possession. Theft has `mechanism: nonPhysical`, so the injury pipeline cannot infer a physical injury from it.

## Physical assault

An assault episode requires an actual person on the same reachable surface within contact distance. It may fail. A completed assault emits one `OffenceV5` with `mechanism: physicalAssault`; the existing `life/outcome.ts` independently samples injury, incapacity and rare critical fatal outcomes. Completion therefore does not imply injury or death. Existing life and scene IDs point back to the offence. No agent is scripted to offend, and entering a specific place is never sufficient.

The current synthetic severity rule classifies completed phone theft as minor and physical assault as serious based on conduct, independently of whether a significant injury follows. This is a modelling category, not a legal conclusion. A more granular outcome-based classification is a future model version; legacy generic severity is never retroactively given a typed label.

Attempts are resolved in within-Tick contact order and stable ID order. The item and actor/victim preconditions are checked again immediately before action. Completion RNG is keyed to the attempt ID, so another resident's attempt cannot shift a draw. `attemptId`, `offenceId`, `itemId` and `episodeId` are stable across replay.
