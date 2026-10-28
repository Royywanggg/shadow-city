# Interaction, crime and causal simulation verification

## Scope and baseline

The clean `main` worktree started with 44 test files / 223 passing tests, a passing type check and production build. The integrated v5 scenario used six seconds per Tick for movement/contact but 30 seconds per Tick for habits. Generic minor/serious offences did not transfer a concrete item. The existing witness, life, scene, observer and replay systems were retained. The pre-change 200-citizen Chrome sample (`place-paired-01`, 500 Ticks, mall open) had Tick p95 **9.7 ms**. It used the former 30-second habit calendar; the new scenario changes time semantics, so its timing is context rather than a controlled algorithm-only comparison.

Raw machine-readable samples: [legacy 200 baseline](screenshots/crime-baseline-legacy-200.json), [typed 200 profile](screenshots/crime-typed-200-profile.json), [five-seed paired runs](screenshots/crime-typed-paired-five-seeds.json), [natural Galleria run](screenshots/crime-galleria-natural-run.json), and [two-day replay](screenshots/crime-two-day-replay.json). The JSON captures the browser version, viewport, seed, population, scenario fingerprint and timing values. The screenshots below are intentionally ignored by Git under the existing `*.png` rule.

The implemented dependency path is:

`needs → destination → legal route/occupancy → one-second spatial candidates → typed eligible episode → cumulative hazard → revalidated attempt → item/life consequence → subjective observation → delayed report → next-Tick habit feedback`.

`WorldModelV2` remains static. `SimulationStateV5.typedCrime` is an optional, fingerprinted extension. A config without it stays on the legacy generic path and is never relabelled as theft or assault. The integrated browser enables the extension with a six-second habit calendar.

## Mechanism checks

| Invariant | Evidence |
| --- | --- |
| One new-scenario time axis | `worldClockAtTick`; movement/contact six one-second samples; habit calendar six seconds; needs evaluated every five Ticks. Tick 28,800 means 172,800 elapsed seconds from an 08:00 start. |
| Hazard mathematics | Unit tests cover zero exposure/rate, `1-exp(-λt)`, increasing exposure, equivalent substep partitions, and 10,000 keyed thresholds within 0.02 of theoretical probability. The latter is a seeded sampling check, not empirical calibration. |
| Theft preconditions and atomic outcome | Unit tests cover absent item, cross-surface exclusion, failed attempt without transfer, completed transfer with owner preserved, and no second successful transfer of the same item. |
| Assault and injury separation | Forced-contact fixture demonstrates completed assault with zero injury probability and with one injury probability; the life system creates the injury from the same offence ID. Natural outcomes remain probabilistic. |
| Subjective knowledge and report delay | Unit test confirms no victim knowledge before a self-check, knowledge without a suspect after discovery, delayed ObserverPort report, and no actor/item ID in the observer projection. |
| Determinism | Full Tick-200 replay with naturally generated theft equals the complete state, including item possession, attempts, knowledge, life and scenes. Changing the model parameter fails fingerprint validation. Changing only reporting probability leaves citizens, truth offences, items and life unchanged. |
| Legacy compatibility | All pre-existing regression tests remain passing; legacy `habit-v1` 30-second configuration retains its explicit fingerprinted path. |

The new RNG uses `nextRandom(hashSeed(key))` for keyed typed-crime draws. An initial statistical test detected correlation in direct FNV hash outputs for adjacent IDs; the extra mixing step is version-local and does not change legacy replay samples.

## Naturally generated Galleria case

Integrated world `shadow-city-hero-01`, simulation seed `place-paired-02`, 120 residents, Galleria open, 2,000 Ticks. The paired offending, observation, social, habit and life seeds use the corresponding `place-paired-02-*` suffixes. No event was injected.

1. `citizen-0003` reached the real `galleria-cafe-l1` activity at Tick 890. `citizen-0015` possessed the initialized `item:phone:citizen-0015`.
2. Both occupied `galleria-shop-cafe-l1` on semantic level L1, 5.5 m above ground. Their theft episode began at Tick 889 and accumulated **129 eligible seconds**. Last synthetic attempt rate was **0.3514 per eligible hour**; cumulative hazard **0.0125915** crossed its fixed threshold **0.0125836**.
3. At Tick 910, second 6, a person-targeted theft attempt completed. Exactly one truth offence was recorded. Item possession moved to `citizen-0003`; legal ownership remained `citizen-0015`. The action was nonphysical and caused no injury.
4. Historical inspection at Tick 909 restores the item to `citizen-0015`; Tick 910 restores the transfer with no victim knowledge; Tick 916 shows one self-check knowledge record. The victim learned only that the property was missing, with no verified suspect identity.
5. **No report was generated for this particular offence.** Two reports visible in the global ObserverPort at Tick 916 concern other events and are not misattributed to it. The selected Event Explorer record correctly says no linked report.

Chrome screenshots at **1440 × 900 CSS pixels, DPR 1** were actually reviewed: [causal timeline](screenshots/crime-galleria-t916.png) and [knowledge/reconstruction controls](screenshots/crime-galleria-knowledge-t916.png). They are local `.png` files ignored by Git. Chrome reported `ANGLE Metal Renderer: Apple M4`; this establishes the renderer used for inspection, not a GPU frame-time measurement. There were no page exceptions. The long causal detail scrolls within the panel; this is usable but dense.

## Controlled paired experiment

Five paired seeds: `place-paired-01` through `place-paired-05`; 120 residents; 500 Ticks = 50 simulated minutes; same world, personal seeds and typed parameters. Three conditions: open mall and bridge, closed mall entry, closed bridge entry. `scripts/place-experiment.mjs` records each raw result, exposure by type, attempts, awareness, reports, timing and model fingerprint. The values below are arithmetic means over five runs.

| Outcome | Open | Mall closed | Bridge closed |
| --- | ---: | ---: | ---: |
| Galleria arrivals | 7.6 | 0 | 7.8 |
| Galleria social encounters | 5.8 | 0 | 6.4 |
| Total typed eligible exposure seconds | 85,028 | 99,223 | 89,186 |
| Theft attempts | 2.4 | 3.0 | 3.0 |
| Assault attempts | 0.4 | 0.4 | 0.4 |
| Completed truth offences | 2.2 | 2.6 | 2.6 |
| Acquired missing-property awareness | 1.8 | 2.2 | 2.2 |
| Delivered reports | 1.2 | 2.4 | 1.6 |

The paired mean difference in completed offences versus open was **+0.4** for each intervention. Approximate 95% paired Student-t intervals are **−0.28 to +1.08** (mall closed) and **−0.71 to +1.51** (bridge closed). These five-run intervals are wide; no reduction or increase in crime is established. Closing the mall removes its own visits while redistributing contact and eligible exposure elsewhere. Matching seed labels align *initial* inputs and keyed draws, but access changes alter routes and the set of episodes; common random numbers cannot force identical downstream trajectories. The synthetic output is not a real-city causal estimate.

At 200 residents and 500 Ticks, the final open-mall run had **76,710 eligible theft seconds**, **107,546 eligible assault seconds**, six theft attempts, one assault attempt, four completed thefts and one completed assault. These are **21.31** and **29.87** type-specific eligible opportunity hours, not population exposure hours. The run covered 166.67 resident-hours. An optional synthetic “higher propensity” denominator uses `logPropensity.minor > 0 OR logPropensity.serious > 0`; it covered 116.67 resident-hours and six attempts. None of these rates is calibrated to real crime data.

## Performance and storage

Final 200-resident Chrome sample: Tick p50 **4.9 ms**, p95 **8.1 ms**, p99 **10.6 ms**. Full Tick-500 replay **2.55 s** and byte-equivalent serialized state. The project targets p95 ≤ **5 ms** and replay ≤ **2 s**; **both gates remain open**. Phase p95 samples: spatial candidate query 2.0 ms, encounter lifecycle 0.6 ms, crime/witness 1.0 ms, typed hazard 0.7 ms, social decision/memory 0.6 ms, route-tree decision 1.5 ms. Percentiles are separate distributions and must not be added as a total Tick. Blocker/portal filtering and reuse of validation for unchanged within-Tick positions were implemented; repeated Chrome samples did not show a reliable total-Tick improvement. Further profiling should target candidate-query geometry, route decision allocations and social history cost without removing scientific mechanisms.

The same run held 61 active and 1,049 recent typed episodes plus seven attempts. Recent episode summaries are capped at 4,096; older ones require historical replay. Actual attempts and consequences remain in state. Browser `performance.memory` moved from roughly 142 to 287 MB in one run, but garbage collection and reused browser heaps make this an unreliable state-growth measure. GPU frame time, texture memory and GPU allocation were not measured. Do not infer them from JS heap.

## Acceptance status

| Area | Status | Limit |
| --- | --- | --- |
| Unified six-second new-scenario clock and two-day progression | VERIFIED | Historical 30-second habit configurations remain explicit legacy models. |
| Typed theft, assault, item possession and existing harm integration | VERIFIED | Synthetic severity is conduct-based; it is not a legal classification. |
| Cumulative hazard and deterministic attempt sampling | VERIFIED | Fixed-contact math and keyed sampling tested; real-world rates uncalibrated. |
| Negative episode summaries and causal IDs | PARTIALLY VERIFIED | Recent history is bounded; there is no searchable persisted archive across an entire long run. |
| Victim discovery, witness separation and ObserverPort isolation | VERIFIED | Missing-property awareness is a simple self-check model. |
| God View causal inspection and historical before/during/after | VERIFIED | One actual Chrome screenshot pair and selected-event readout reviewed. |
| Natural Galleria event and paired experiment | VERIFIED | Its victim did not report; five paired seeds have wide uncertainty. |
| 200-resident performance gate | NOT MET | Tick p95 8.1 ms; Tick-500 replay 2.55 s. |
| GPU frame-time and long-run memory growth | NOT VERIFIED | Browser renderer and rough JS heap were recorded, not GPU time or isolated state memory. |

The next engineering stage should first reduce 200-resident Tick/replay cost and add a durable, searchable causal archive. Only then should police investigation or strategy evaluation consume the limited report/evidence view; the researcher God View must remain separate. No push, merge or deployment was performed.
