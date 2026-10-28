# v0.6.1 encounter verification record

Date: 2026-10-26. This record covers the opt-in `EncounterScenarioV1` on the existing `WorldModelV2`, not a new city or a calibrated social model. The browser scenario uses city seed `shadow-city-hero-01`, simulation seed `shadow-city-sim-01`, social seed `shadow-city-social-01`, offending seed `shadow-city-offending-01`, observation seed `shadow-city-observation-01`, 120 citizens, greeting willingness 0.70, conversation willingness 0.85, and diagnostic decision traces enabled. All outcomes below came from state and events, with no story injected into the scenario.

## Functional and visual evidence

Chrome 156 with WebGL 2 on `ANGLE (Apple, ANGLE Metal Renderer: Apple M4)` was used at 1440 × 900 CSS pixels and DPR 1. The browser check had zero page or console errors. The reviewer opened the actual captured images. At Tick 121, citizen-0015 and citizen-0071 are 1.9 m apart on the legal ground surface, both have `interacting` activity, and the scene shows the selected encounter rings, link, and `CONVERSATION · T121` label. The conversation arose at Tick 120 from the ordinary activity and interaction rules and completed at Tick 126. The fixed 120-citizen, 500-Tick run produced three conversations, seven truth offences, two subjective offence observations and one delivered report. One witness had an unknown offender identity; the report did not reveal the hidden offender ID.

The reviewer also checked the Tick 100 and 500 hero views, conversation completion, Relationships, Encounters, Memory and Timeline panels, real timeline seek, all four cardinal bearings, and 390 × 844 narrow screens. In the final-code browser pass, the selected Tick 121 encounter showed two retained decision traces whose displayed chances, random draws, sociability, familiarity and available Ticks matched the actual simulation records (`decisionExplanation.grounded=true`); see `v061-decision-explanation-tick121-1440x900.png` (`screenshots/v061-decision-explanation-tick121-1440x900.png`, local capture). God View remained available in Observed mode; the Observed footer showed only delivered reports. Existing city and character positions remained recognizable. Narrow-screen expanded inspector leaves about 120 px for the map, and its bottom report count can be clipped. This is a visual limitation, not a verified responsive design pass.

Evidence: [`v061-browser-results.json`](screenshots/v061-browser-results.json), `v061-conversation-active-tick121-1440x900.png` (`screenshots/v061-conversation-active-tick121-1440x900.png`, local capture), `v061-conversation-complete-tick126-1440x900.png` (`screenshots/v061-conversation-complete-tick126-1440x900.png`, local capture), `v061-hero-tick500-1440x900.png` (`screenshots/v061-hero-tick500-1440x900.png`, local capture), `v061-relationships-tick500-1440x900.png` (`screenshots/v061-relationships-tick500-1440x900.png`, local capture), `v061-memory-tick500-1440x900.png` (`screenshots/v061-memory-tick500-1440x900.png`, local capture), and the narrow-screen captures in `docs/screenshots/`. The reproduction scripts are `scripts/v061-browser-check.mjs` and `scripts/v061-browser-performance.mjs`. The baseline v0.6 screenshots were retained.

## Simulation and performance evidence

The final full suite passed with 184 tests in 35 files. `npm run typecheck`, `npm run build`, and `git diff --check` passed. Tests cover legal spatial contact, disconnected levels, portals, lifecycle and cooldown, directed perception, two-party interaction and Tick cost, encounter-to-interaction ID linkage, bounded subjective memory, scientific metric denominators, witness identity and report allowlists, reporting-only counterfactuals, Tick 100/500 replay, speed parity, closure interruption, and legacy engines. `v061-encounter-*-500-review.json` holds the exact final-code CPU samples, state-derived scientific summaries and seed/config metadata. Replay-from-zero matched the measured state byte for byte in all three samples.

| Citizens | Node Tick p95 | Node replay to Tick 500 | Episodes | Accepted interactions | Conversations | Serialized state at Tick 500 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 13.5 ms | 3.41 s | 592 | 69 | 0 | 2.23 MB |
| 120 | 15.0 ms | 4.41 s | 779 | 84 | 3 | 2.71 MB |
| 200 | 28.3 ms | 8.73 s | 1,720 | 195 | 1 | 5.04 MB |

The 100-citizen sample producing no conversation illustrates that a normal scenario does not force one. The 120-citizen sample supplied the natural visual interaction. Node/Vite timings are local CPU measurements, not Chrome or GPU measurements; earlier runs on the same machine varied substantially, so the timing table is one observed sample rather than a stable distribution. The test harness printed a nonfatal Vite WebSocket bind warning under the restricted shell; the simulations and replay equality completed with exit code 0. Per-owner memory and knowledge are capped, while episode/event/history arrays grow with run length; the whole state is not bounded.

The quiet hardware Chrome samples used the same seed, selected citizen-0015 and Tick 200 at 1440 × 900 / DPR 1, then sampled 3 seconds of playback serially without parallel Vitest or other browser work. Both runs had 48 textures and zero console errors. Earlier browser samples in the JSON overlapped a Vitest run and are not used for the comparison.

| Citizens | Mean FPS | p95 frame interval | Browser advance Tick p95 | Draw calls | Triangles | JS heap used |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 120 | 29.7 | 58.9 ms | 17.9 ms | 327 | 318,599 | 192 MB |
| 200 | 29.6 | 75.3 ms | 31.3 ms | 329 | 319,343 | 225 MB |

The prior v0.6 reference target is ≥50 FPS, p95 frame interval ≤33 ms, Tick p95 ≤5 ms, and Tick 500 replay ≤2 s at 200 citizens. **These targets are not met.** The older `v06-roadside-v6-results.json` records about 60 FPS with a different camera/Tick/asset state, so the comparison cannot isolate the encounter system's contribution. GPU frame time and VRAM were not directly available. `textureSourceBytesEstimated` counts approximate source bytes; `usedJsHeapBytes` is JavaScript heap, not GPU memory.

A final-code single-page attribution test at 200 citizens, Tick 200 and 1× found about 30 FPS even while paused, with or without a selected resident; there were no paused long tasks. Playing advanced 12 Ticks per three-second sample at 28.7–29.6 FPS, added 1–7 main-thread long tasks and raised p95 frame intervals to 70–86 ms. An isolated `SimulationSessionV5` without UI subscribers took 22.4 ms mean and 35.9 ms p95 per Tick across Ticks 101–200. Earlier same-hardware single-page runs reached 60 FPS while paused and about 53–55 FPS while playing; they are preserved as run 1/2 in `docs/screenshots/`. Thus both a variable paused frame baseline and synchronous simulation/state-update spikes matter. GPU frame time was not measured, so this record cannot assign the paused 30 FPS to a specific GPU or compositor cause, nor precisely split simulation from React cost. See [`v061-browser-attribution.json`](screenshots/v061-browser-attribution.json) and `scripts/v061-browser-attribution.mjs`.

## Mandatory acceptance audit

| # | Result | Evidence or remaining boundary |
| ---: | --- | --- |
| 1 | Verified | Surface/time contact and natural Tick 121 conversation; no scenario meeting script. |
| 2 | Verified | 779 episodes yielded 84 accepted interactions at 120 citizens. |
| 3 | Verified | Separate candidate, directed perception, recognition, identity belief, and interaction state/tests. |
| 4 | Verified | Canonical pair/episode IDs, hysteresis, duration, ending, cooldown and replay tests. |
| 5 | Verified | Conversation sets both participants to `interacting` for simulation Ticks and delays activity. |
| 6 | Verified | Directed familiarity and later willingness depend on previous encounters/interactions. |
| 7 | Verified | Per-owner bounded memory/knowledge, unknown tokens and deterministic replay tests. |
| 8 | Verified | Exclusive encounter-aware opportunity feeds the existing offender decision function. |
| 9 | Verified | 120 citizens: 46,786 eligible opportunity-seconds, eight attempts, seven truth offences. |
| 10 | Verified | Actual witnesses can retain unknown identity; ObserverPort report allowlist. |
| 11 | Verified | Real state-backed God View tabs and truth/subjective witness detail in browser. |
| 12 | Verified | Runtime report allowlist, delivery delay, Observed footer fix, browser field check. |
| 13 | Verified | Fixed Tick, Tick 100/500, reset and byte-equal replay tests. |
| 14 | Verified | 1×/2×/4× same-Tick state parity integration test. |
| 15 | Verified | Simulation owns position and decisions; scene reads state; camera/FPS do not enter RNG. |
| 16 | Verified | Full v2–v5 regression suite passed: 184/184 tests in 35 files. |
| 17 | Verified | Surface-keyed spatial index and canonical pair deduplication/high-density tests. |
| 18 | Verified with poor results | 100/120/200 CPU and 120/200 hardware Chrome samples recorded; targets remain open. |
| 19 | Verified | Actual Chrome Tick 121 active natural conversation image and Tick 126 completion. |
| 20 | Verified | UI and benchmark metrics read simulation arrays, counters, and real browser renderer info. |

A separate fixed-seed mechanism scenario establishes one naturally generated same-pair chain without naming any resident or event in the configuration: citizen-0041 and citizen-0091 reached the same legal place through their own trips, mutually perceived each other and greeted at Tick 77, formed individual memories and directed familiarity, and later had an actual human-target offence at Tick 92 second 3. The offender decision read the previous familiarity (about 0.0905), two other citizens formed subjective witness observations, and two observer reports arrived at Tick 94 with unknown suspect identity. The exact config, truth-versus-observer separation and byte-equal replay are recorded in [`v061-natural-chain-tick94.json`](screenshots/v061-natural-chain-tick94.json) and `scripts/v061-natural-chain.mjs`; an integration test searches the fixed run for the chain rather than specifying its participant IDs. The greeting and offence occur in **one continuous encounter episode**.

A second mechanism search verifies the stronger repeated-meeting path. `scripts/v061-reencounter-search.mjs` searches ascending global offender seeds and stops at the first match, with no resident, location, or event selected by the scenario. At seed `shadow-city-reencounter-4`, citizen-0013 and citizen-0061 greet during an episode beginning at Tick 82, retain individual memory, separate at Tick 151 second 1, and meet in a distinct episode at Tick 571 second 1 after cooldown. The offender decision at Tick 571 second 3 reads prior directed familiarity (0.0861), produces a truth offence, and a victim and third party form separate subjective observations; two reports arrive at Tick 573. Replay from zero is byte-equal. The full configuration and failed preceding seeds are in [`v061-reencounter-search.json`](screenshots/v061-reencounter-search.json). This is an intentionally high-opportunity **synthetic stress scenario**: global minor/serious base odds are 12/2.8 per eligible agent-hour, and completion, event perception and reporting probabilities are 1. It proves a mechanism path, not default rates or a real-world crime estimate. The first interaction is an immediate greeting with zero Tick duration; a **same-pair** sustained conversation followed by an offence remains unverified, although sustained natural conversation is separately shown in the browser evidence.

The verification statements above do not claim complete geometric line of sight, realistic human memory or crime prediction, shared activity/service interaction, route adaptation from subjective risk, 1,000-citizen scalability, or a passing 200-citizen frame budget. An independent performance workstream should use a matched single-page baseline and profile both render and simulation stages before treating the low frame rate as caused by one subsystem.
