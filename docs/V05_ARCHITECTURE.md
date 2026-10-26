# v0.5 offender behaviour and investigative information

This document records the version 4 simulation introduced by v0.5A and v0.5B. It extends the existing citizen movement engine and preserves the v0.4 synthetic incident model as a separate `?model=v3` regression path. All rates, behavioural groups, and witness rules are synthetic assumptions. They are not calibrated to a real city or population, and observed differences do not establish a causal or empirical crime-science finding. `VISION.md`, `VISUAL_DIRECTION.md`, and `ROADMAP.md` remain the product and visual sources of truth.

## Versions and data ownership

```text
CityModel (read-only graph, blocks, districts, public anchors)
       |
       +--> v2 citizen movement --> post-movement position/activity snapshot
                                      |
OffendingConfig + private profiles --+--> spatial opportunities --> agent choice
                                                                  |
                                                            Offence + truth event
                                                                  |
ObservationConfig ----------------------------------------------> reporting decision
                                                                  |
                                                   private outcome / available record
                                                      |                     |
                                                      v                     v
                                             GroundTruthViewV4       ObserverPortV4
                                             (researcher)           (observer only)
```

`SimulationConfigV4` contains a v2 citizen config, an `OffendingConfig`, and an independent `ObservationConfigV4`. `SimulationStateV4` keeps the nested citizen state, offender cooldown states, attributed offences, reportable incident adapters, and reporting state. The renderer consumes these dynamic views alongside the static city; neither behaviour nor observation mutates `CityModel`. `engineV4.ts` advances movement first, evaluates every eligible citizen against the same post-movement snapshot, commits at most one offence per citizen, and then decides and delivers reports. A zero-delay report is available at the end of the occurrence Tick. Camera movement and scene interpolation do not participate in any decision.

`?model=v3` retains v0.4's anonymous block-based incident generator and its v3 reporting semantics. It does not assign offenders. `?model=v2` retains the citizen-only regression path. The default app uses v4 offender-driven incidents. The models are selected exclusively; a v3 synthetic incident is never added to a v4 offence history or counted twice.

## v0.5A: population, opportunity, and choice

Every existing citizen has one stable `citizen-####` ID. `createOffendingProfiles` derives a private, reproducible profile for each ID from the offending seed: a research group (`minorSpecialist`, `seriousSpecialist`, or `generalist`), continuous minor and serious log propensities, and reward/risk sensitivity. Group shares and means are configurable. Two bounded normal samples and a configurable correlation produce individual variation; the category shifts a mean but never forces an offence or a particular type. `OffenderDynamicState` currently holds a cooldown end Tick. Prior offences live in the append-only truth history, rather than being copied into the static profile. Movement and activity continue to belong to the citizen state machine.

An opportunity exists only for an outdoor citizen on a verified pedestrian edge or at a public plaza/park anchor. Home and trip-planning states are ineligible. The snapshot contains the post-movement position, legal graph anchor, nearest block and district, synthetic time band, and nearby outdoor citizen IDs within a configured radius. Nearby IDs express co-location; they designate neither victims nor offenders. District, time, public space, and local crowd factors give separate minor/serious exposure values in `[0, 1]`. Serious exposure defaults to zero without at least one nearby citizen. This exposure describes spatial opportunity, **not** an individual's offending propensity. Reward and perceived risk are synthetic district scores, not measured local facts.

For eligible agent `i` and severity `s`, `decision.ts` computes:

```text
L(i,s) = log(baseOddsPerEligibleAgentHour[s])
       + log(logicalSecondsPerTick / 3600)
       + logPropensity[i,s] + log(exposure[i,s])
       + rewardWeight[s] × rewardSensitivity[i] × rewardScore[i]
       - riskWeight[s] × riskSensitivity[i] × perceivedRiskScore[i]

weights = { none: exp(0), minor: exp(L(i,minor)), serious: exp(L(i,serious)) }
P(choice) = weight(choice) / sum(weights)
```

Zero base odds or exposure gives zero weight for that type. If both are zero, `P(none) = 1`. Implementation subtracts the largest log weight before exponentiating and validates the finite probabilities and input ranges. A single keyed `(offendingSeed, Tick, agent ID)` draw makes exactly one `none`, `minor`, or `serious` choice. After an offence, cooldown excludes that agent until its configured future Tick. The default odds are illustrative weights per eligible agent-hour, not a direct measured rate or an assertion that an eligible agent commits an offence each hour.

An `Offence` stores a stable ID, one `incidentId`, one truth event ID, occurrence Tick, type/severity, true `offenderAgentId`, exact citizen position and pedestrian anchor, block/district, opportunity snapshot, outcome, and generator provenance. v4 uses one committed offence to one reportable incident to one `OffenceOccurred` truth event. IDs derive from the offending world run ID, Tick, and agent ID; they do not depend on report selection or arrival. The truth event and offence attribution are private research data.

## v0.5B: reporting, leads, and information boundary

`observation/v4Reporting.ts` consumes completed reportable occurrences, never changes them, and assigns each exactly one private outcome: `notReported`, `scheduled`, or `available`. Effective report probability for severity `s` is `1 - (1 - globalProbability) ** severityExponent[s]`. Independent incident-keyed draws select reporting, an integer creation delay, and a possible synthetic identity observation. `availableTick = occurrenceTick + creationDelay + ingestDelay`. Scheduled outcomes stay private until their availability Tick. Delivery order is availability Tick, occurrence Tick, then incident ID. Public IDs are assigned only at delivery (`report-000001`, etc.); they are deterministic within a scenario but may be renumbered when a different reporting probability changes the set of delivered reports.

A report's suspect starts `unknown`. A synthetic named lead requires a nearby non-offender citizen to notice and recognize an identity. The current rule can choose the true offender or, with configured inaccuracy, another nearby citizen distinct from the synthetic witness; if that false candidate does not exist, the lead stays unknown. A named lead is always marked `unverified` and carries a `syntheticWitnessStatement` evidence reference. The public record reveals the candidate only at or after both report and evidence availability. Co-location alone is not a victim claim, proof of guilt, or a lawful real-world identification process. In this prototype, reported type, severity, and location equal truth; misclassification and location errors are deferred.

`SimulationSession.createObserverPortV4()` supplies only `getView()` and `subscribe()`. `selectObservedWorldViewV4` builds an allowlisted copy containing `asOfTick`, delivered records, and their count. It excludes true offender IDs, private incident/offence IDs, witness IDs, accuracy flags, profiles, pending outcomes, and unreleased evidence. `getGroundTruthViewV4()` is a separate researcher capability with profiles, offence history, private outcomes, and metrics. The Observed report scene and panel use only the observer port. A separate ambient pedestrian layer renders citizen movement in all modes; in Observed mode it disables selection, route highlighting, the inspector, and ID-bearing development diagnostics. Its development diagnostic contains only a visible pedestrian count. Researcher Ground Truth and Comparison modes intentionally expose private model facts. These are software interface boundaries, not authentication or a defense against code with full access to the shared browser process.

The development-only `?test=1` v0.5 fixture exposes public Tick controls and the public observer snapshot. It does not expose the session or ground-truth identity through that fixture. Do not pass a `SimulationSession` or its generic snapshots to future observer-only or Police components. A future investigator must receive a capability based on available records and evidence, with explicit action/cost rules.

The ambient pedestrians are visual context, not evidence or known suspect identities. Their co-location with a marker must not be promoted into a confirmed attribution. If future investigative logic needs public movement observations, it needs a separately defined, time-bounded observation source instead of reading the ambient renderer's simulation input.

## Reproducibility and research measures

Citizen movement RNG, offending profile/decision RNG, and reporting/identity RNG use separate seeds or purpose-keyed streams. The v4 world fingerprint includes city/citizen and offending configuration; the scenario fingerprint additionally includes observation configuration. Therefore changing only report probability can change public knowledge while retaining the same citizen trajectories and attributed offences. With the same model version, city, config, seed, and command history, Reset and Tick replay reconstruct state and event order. Historical inspection projects the records available at that historical Tick. Reporting-only counterfactuals can share ground truth; changing behaviour parameters may change it. Future interventions may alter later movement and opportunity, so fair policy experiments should hold initial conditions and exogenous random samples constant without demanding identical post-intervention histories.

`deriveGroundTruthMetricsV4` counts total, minor, and serious offences; unique and repeat offending agents; a zero/one/two-or-more frequency distribution across the **full citizen population**; district/group counts; and available reports by severity. Its two-by-two table counts agents with both minor and serious history, minor only, serious only, or neither. It reports `P(serious | minor)`, `P(serious | no minor)`, and their difference, plus cross-severity share among offending agents. It also partitions truth into unreported, pending, and available records. Ratios with zero denominators are `null`. These are descriptive synthetic quantities; an apparent association may change through group mix, opportunity, or observation bias and is not a causal SSP effect. The UI must not label a named lead as a proven offender. Detection precision, serious-offence recall, investigation cost/delay, arrests, and prevented offences have no valid v0.5 mechanism or metric.

The metrics summarize one complete simulated population at one seed. A conventional sampling confidence interval would suggest a sampling design that this prototype does not have; no such interval is shown. Uncertainty about model parameters and random seeds needs repeated, prespecified runs in a later experiment milestone.

## Review fixtures and checks

The default city seed is `shadow-city-hero-01`, citizen seed `shadow-city-sim-01`, offending seed `shadow-city-offending-01`, and observation seed `shadow-city-observation-01`. Default population is 80. `?scenario=A`, `B`, or `C` fixes global synthetic reporting probability at 0.3, 0.6, or 0.9; changing scenario resets to Tick 0. `?review=1` selects declared higher synthetic offending odds for visual review only. `?population=100` exercises the larger population; `?seed=...` changes the city. Run the legacy v0.4 path with `?model=v3` and the citizen-only path with `?model=v2`.

Run `npm run typecheck`, `npm test`, and `npm run build`. With the development server running, `npm run visual:v05` uses a fixed 1440 × 900, DPR 1 browser viewport, the review fixture, and `?test=1`. It captures Tick 0/100/500 in Observed, Ground Truth, and Comparison modes; scenario changes, cardinal bearings, a close marker view, a narrow viewport, and 100 citizens; it checks report partitioning, UI boundary conditions, camera isolation, Reset, replay, and browser errors. Captures and numerical diagnostics go to `.visual/v05-*.png` and `.visual/v05-results.json`. Review the images themselves, especially public-mode privacy, marker grounding near roofs, and visual clutter; script assertions alone cannot establish visual quality. Record browser and WebGL renderer, seeds, Tick, viewport, simulation tick/replay costs, draw calls, triangles, and active frame samples. SwiftShader measurements describe software rendering and must not be presented as hardware GPU performance. Preserve v0.4 evidence for comparison.

The v0.5 model has no police patrol, investigation decisions, arrests, target/victim behaviour, false reports, database, or calibrated real-world data. Those mechanisms and any justified SSP comparison belong to a later milestone.
