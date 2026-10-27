# Round 3 verification and requirement traceability

## Evidence and phase boundaries

This is an incremental `SimulationStateV5` extension on branch `codex/life-state`, based on the committed Round 2 branch. The previous worktree was clean; no other branch was merged and nothing was pushed or deployed. Test fixtures construct attributed offences to exercise rare outcomes; the browser fatal demonstration uses the unchanged offence generation path with a development-only, explicit high-harm diagnostic configuration. It does **not** inject a victim, offence or scripted death. The normal configuration is allowed to produce zero deaths.

| Phase | Independent exit check | Result |
| --- | --- | --- |
| A — Core | Discriminated life state, injury/death records, runtime invariants, unit tests. | VERIFIED |
| B — Outcomes | Real citizen victim, explicit physical-assault classification, separate keyed injury/fatal draws, stable event IDs and replay. | VERIFIED |
| C — Consequences | Speed/jog restriction, incapacitation, safe-node recovery, routine/social interruption, no later dead-agent actions. | VERIFIED for tested paths; longer-term social adaptation remains deferred. |
| D — Scene/information | Spatial truth, same-surface later discovery, private knowledge, delayed allowlisted reports, scene persistence. | VERIFIED for v1 foundation; hearsay/official notification deferred. |
| E — God View/animation | Life tab/timeline/3D focus and selected/deceased poses in real Chrome. | PARTIALLY VERIFIED: pose is a placeholder and occluding indoor facades still hide the body. |
| F — Final | Full automated regression, hardware Chrome screenshot and 120/200-person measurements, science limits and matrix. | PARTIALLY VERIFIED: 200-person Tick/replay and some p95 frame samples miss historical targets. |

## Browser review

Real Chrome 156.0.8078.48 on **Apple M4 / ANGLE Metal**, 1440 × 900 CSS pixels, DPR 1, integrated `shadow-city-hero-01` world. [Full machine-readable result](screenshots/life-browser-results.json) and [life-off 200-person comparison](screenshots/life-browser-legacy-results.json) were produced by `scripts/life-browser-check.mjs`. This was hardware WebGL, not SwiftShader. Page errors: none. The renderer records source texture bytes as an estimate; that number is **not GPU VRAM allocation**. WebGL draw calls/triangles are renderer counters. `requestAnimationFrame` intervals are browser frame cadence, **not GPU frame time**. No GPU timer query or shadow-pass timing was collected.

To reproduce locally, start `SHADOW_CITY_VITE_CACHE_DIR=/private/tmp/shadow-city-vite-life npm run dev -- --host 127.0.0.1 --port 5181 --strictPort`, then run `npm run visual:life` in another shell. Run `SHADOW_CITY_LIFE_SCENARIOS=recovery npm run visual:life` for the three-Tick recovery sequence. The script requires the installed `/Applications/Google Chrome.app`, overwrites only its `life-*` screenshot/result files, and uses development-only diagnostic scenarios to make the rare nonfatal/fatal branches visible. The default scenario has no scripted outcome.

| Scenario at Tick 500 | Injury / death / scene | Tick p50 / p95 | 500-Tick replay | Mean FPS / frame p95 | Draws / triangles |
| --- | --- | --- | --- | --- | --- |
| Default, 120 | 0 / 0 / 0 | 2.4 / 4.9 ms | 1,430.9 ms | 59.3 / 34.6 ms | 319 / 312,521 |
| Nonfatal diagnostic, 120 | 5 / 0 / 0 | 2.4 / 4.8 ms | — | 59.3 / 33.7 ms | 319 / 312,521 |
| Fatal diagnostic, 120 | 5 / 5 / 5 | 2.3 / 4.8 ms | — | 59.3 / 33.0 ms | 326 / 313,321 |
| Default, 200 | 1 / 0 / 0 | 5.7 / 9.2 ms | 2,841.5 ms | 59.3 / 39.1 ms | 322 / 313,417 |
| Life disabled, 200 | n/a | 5.7 / 9.1 ms | 2,855.4 ms | 59.3 / 38.6 ms | 322 / 313,425 |

These are short samples on one machine. A preceding run measured 200-person life-on Tick p95 15.0 ms/replay 4,919 ms and life-off Tick p95 23.1 ms/replay 7,550 ms; the spread shows material load/timing variability. The final paired 200-person run is close (9.2 versus 9.1 ms Tick p95); it shows no obvious large life-specific regression, but not a precise zero-cost claim. The **200-person Tick p95 ≤5 ms and Tick 500 replay ≤2 seconds targets are missed in both runs**. Mean FPS exceeds 50, while frame p95 fluctuates above the 33 ms target. At 120 people the final default run used 193 Three.js geometries, 38 textures, about 1.20 MB of estimated source texture bytes, and about 200 MB JS heap. Ten character presets loaded in about 353 ms; the far-view animation manager update was below 0.1 ms in the sampled frame. Injury outcome p95 was below Chrome's timer resolution in the 400-Tick sample; report `0 ms` as **unresolved**, not proof of zero cost. Fatal diagnostic discovery p95 was approximately 0.1 ms. History and scene counts at Tick 500 were 5 injuries and 5 persistent scenes in that diagnostic run. Longer-run memory growth remains unmeasured.

Actual inspected images:

- [Normal hero, zero deaths](screenshots/life-default-hero-tick500-1440x900.png)
- [Nonfatal injury Inspector](screenshots/life-diagnostic-inspector-tick500-1440x900.png)
- [Fatal event Inspector](screenshots/life-fatal-inspector-tick500-1440x900.png)
- [Death event focus at Tick 172](screenshots/life-fatal-death-event-close-1440x900.png)
- [Same resident alive at Tick 171](screenshots/life-fatal-before-death-1440x900.png)
- [200-person hero](screenshots/life-scale200-hero-tick500-1440x900.png)
- [Incapacitated at Tick 181](screenshots/life-recovery-incapacitated-1440x900.png), [standing at Tick 182](screenshots/life-recovery-standing-1440x900.png), and [resumed at Tick 183](screenshots/life-recovery-resumed-1440x900.png)

The fatal development scenario generated a qualifying offence through the actual encounter/offender pipeline; five victims died by Tick 500, seven later scene reports were delivered, and one inspected death showed `alive` at Tick 171 and `deceased` at Tick 172. A separate [recovery browser result](screenshots/life-browser-recovery-results.json) follows a real injury in the same simulation: the resident is incapacitated at Tick 181, stays at exactly the same millimetre position through the `standingUp` Tick 182, then travels from Tick 183. This recovery run used 120 residents on the same Metal renderer, with Tick p95 5.2 ms, mean 59.5 FPS and frame p95 31.8 ms. The selected portrait retains the character preset and clothing, but its rotated `SitDown` pose is visually stiff. At scene scale the body is tiny; nearby trees can obscure it, and an indoor body remains hidden behind exterior walls. The selected marker identifies the authoritative location. These screenshots verify interface behavior and reveal a **remaining visual-quality gap**; they do not approve the death animation as final art.

## Requirement traceability matrix

Status vocabulary: `VERIFIED`, `PARTIALLY VERIFIED`, `NOT IMPLEMENTED`, `DEFERRED`, `NOT APPLICABLE`. “Browser” means the Chrome evidence above; a blank browser gate is not implied by passing unit tests.

| ID | Priority | Requirement | Implementation | Test / integration evidence | Browser evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R3-01 | P0 | Existing branch, worktree, habits, encounter and v5 review before edits | `docs/LIFE_STATE_ARCHITECTURE.md` | Baseline and prior commit audit; legacy tests | n/a | VERIFIED |
| R3-02 | P0 | Typed alive/deceased plus separate function; reject invalid combinations | `life/types.ts`, `life/state.ts` | `life.test.ts` + runtime invariants | Inspector | VERIFIED |
| R3-03 | P0 | Serious nonviolent offence does not automatically injure or kill | `life/outcome.ts`, `crimeTick.ts`, `opportunityV5.ts` | Nonphysical unit test | Default zero-death run | VERIFIED |
| R3-04 | P0 | Real victim attribution; missing victim rejected | `life/state.ts` | Missing-victim unit test; natural v5 integration | Fatal diagnostic | VERIFIED |
| R3-05 | P0 | Independent harm eligibility, injury and fatal decisions; keyed RNG | `life/outcome.ts` | Outcome fixtures; 500-Tick replay equality | Diagnostic scenarios | VERIFIED |
| R3-06 | P0 | Valid causal, stable death event separate from offence/report | `life/state.ts`, `life/types.ts` | Unit and natural integration | Fatal Inspector | VERIFIED |
| R3-07 | P0 | Real victim position, surface and floor; no ground snapping | `life/state.ts` | Skybridge fixture, invalid position test | L0 natural event only | PARTIALLY VERIFIED |
| R3-08 | P0 | Death irreversible within run; pre-death replay alive | `life/state.ts`, `engineV5.ts` | Natural Tick 171/172/500 replay test | Tick 171/172 screenshots | VERIFIED |
| R3-09 | P0 | Dead residents stop travel, routine, offending and new social contact | `engineV5.ts`, `habits/state.ts`, `life/state.ts` | Natural 500-Tick integration; prior-position check | Fatal diagnostic | VERIFIED |
| R3-10 | P0 | Injury changes speed and capability; serious injury stops current route | `engineV5.ts`, `life/state.ts` | Incapacitation/recovery unit test | Nonfatal Inspector | PARTIALLY VERIFIED |
| R3-11 | P0 | Interrupt actual intentions/interactions once; retain histories | `habits/state.ts`, `life/state.ts` | Existing habits/encounter regression; state checks | Inspector timeline | PARTIALLY VERIFIED |
| R3-12 | P0 | Fixed-Tick recovery, stationary standing and no resurrection | `life/state.ts`, `character/lifePose.ts` | Recovery Tick and pose unit tests | Tick 181/182/183 sequence | VERIFIED |
| R3-13 | P1 | Existing relationships/memories survive death; no global death knowledge | `life/state.ts`, `encounter/state.ts` | Natural integration and observer test | God View remains available | PARTIALLY VERIFIED |
| R3-14 | P1 | Distinguish offence witness from later scene discovery | `life/state.ts`, `life/types.ts` | Cross-floor/discovery tests | 17 observations in fatal diagnostic | VERIFIED |
| R3-15 | P0 | Same-surface, line of sight, attention and scene persistence for discovery | `life/state.ts` | Cross-floor negative and later discovery tests | 5 scenes at Tick 500 | VERIFIED |
| R3-16 | P0 | Delayed scene report, observer field allowlist, no duplicate truth death | `observerProjection.ts`, `life/state.ts` | Delay/leakage/duplicate tests | 7 reports, 5 deaths | VERIFIED |
| R3-17 | P1 | Explicit scene persistence/cleanup semantics | `life/types.ts`, `life/state.ts` | Scene count and replay tests | Persistent selected scene | PARTIALLY VERIFIED |
| R3-18 | P1 | Tick-driven collapse/stand, Pause/Seek, identity and LOD compatibility | `CharacterManager.ts`, `WorldAgentLayerV5.tsx`, `CharacterPortraitV5.tsx` | Existing character and pose tests; natural replay | Portrait, death and recovery screenshots | PARTIALLY VERIFIED |
| R3-19 | P1 | God View life tab, linked history and spatial event focus | `MultiLevelApp.tsx` | Natural state integration | Inspector/event focus screenshots | VERIFIED |
| R3-20 | P0 | Config permits zero death; no scripted product death | `life/types.ts`, `MultiLevelApp.tsx` | Default vs diagnostic natural runs | Default zero-death image | VERIFIED |
| R3-21 | P0 | Replay fingerprint includes life config and fixed-Tick state | `engineV5.ts`, `sessionV5.ts` | Natural replay equality and reset | Tick 171/172 browser seek | VERIFIED |
| R3-22 | P1 | Injury/death metrics with denominators and unavailable values | `life/metrics.ts` | Metrics assertion | Browser counts | PARTIALLY VERIFIED |
| R3-23 | P0 | Full typecheck, tests and build | Entire repo | Final command output recorded below | n/a | VERIFIED |
| R3-24 | P0 | Hardware browser screenshot and 100–200-person performance | `scripts/life-browser-check.mjs` | Chrome result JSON | Six images above | PARTIALLY VERIFIED |
| R3-25 | P1 | Immediate mortality | `life/state.ts` | Fatal fixture and natural event | Fatal Inspector | VERIFIED |
| R3-26 | P2 | Delayed mortality with explicit mechanism | — | No credible model yet | — | DEFERRED |
| R3-27 | P2 | Hearsay, official notification and grief response | — | Beyond foundation scope | — | DEFERRED |
| R3-28 | P1 | Authored collapse/death/standing and indoor body visibility | Existing `SitDown` only | No dedicated asset/occlusion test | Visible gap in close screenshots | PARTIALLY VERIFIED |
| R3-29 | P2 | Medical, emergency, police and forensic workflows | — | Explicit exclusion | — | NOT APPLICABLE |

## Engineering, science and visual acceptance

- **Engineering:** v5 extension is integrated and type safe. Final `npm run typecheck`, `npm test` (41 files, 211 tests) and `npm run build` passed; there is no push/merge/deploy.
- **Simulation correctness:** The tested fatal and nonfatal paths are deterministic and causally attributed. Long-duration memory growth, every possible interaction interruption ordering, and every multi-level scene camera angle have not been exhaustively checked.
- **Scientific validity:** Parameters are synthetic and uncalibrated. `witnessedHarmfulOffence` means witnessing an offence, not witnessing biological death. No real-world causal inference follows from these runs.
- **Visual quality:** God View works and the portrait shows the same resident before/after death, but the current resting pose and indoor occlusion are below the desired cinematic standard.
- **Performance:** No obvious life-specific regression in one 200-person comparison; existing 200-person Tick/replay targets and some frame p95 samples remain open. Actual GPU frame time and VRAM were not measured.

Next art pass: author a real in-place collapse/rest/stand set for the existing rig, inspect all ten presets and LOD transitions close up, then add a selected-floor indoor cutaway that exposes the body without changing static navigation. Next simulation pass: introduce lawful information transfer/official notification only when the observer and social mechanisms are explicitly specified. No medical or policing system should be inferred from the current scene foundation.
