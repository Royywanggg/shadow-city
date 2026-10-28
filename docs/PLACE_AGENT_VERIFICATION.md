# Central Galleria verification record

## Method and reproducibility

All measurements below were made on 2026-10-28 in local Chrome 156 at 1440 × 900, DPR 1, using the integrated `shadow-city-hero-01` city and versioned v5 `place-v1` mode. WebGL identified the renderer as **ANGLE Metal on Apple M4**. Browser scripts are `scripts/place-browser-check.mjs`, `scripts/place-experiment.mjs` and `scripts/place-case-check.mjs`; machine-readable outputs are in `docs/screenshots/`. The PNG captures in that folder are local evidence and ignored by Git under the repository's existing `*.png` rule. The three paired scenario seeds are `place-paired-01`, `place-paired-02` and `place-paired-03`; all per-domain seeds and fingerprints are recorded in JSON.

`Tick 500` means 250 synthetic calendar minutes in the habit schedule and 50 physical movement minutes. This is an existing two-clock approximation. Scenario counts are synthetic model outputs, not empirical estimates or causal conclusions.

## Functional vertical slice

At default app seeds and 120 citizens, Tick 500 contained **23 mall destination arrivals**, **3 completed retail shopping activities**, **2 indoor encounter episodes**, and **0 indoor offences**. `citizen-0090` selected L0 retail, began travel at Tick 153, started shopping on arrival at Tick 167, and finished at Tick 230. This is a need-driven simulated trip, not a scripted fixture. The arrival route uses a real mall portal and activity slot; route legality, blocked-entry rejection and millimetre movement bounds are tested in `placeInteraction.test.ts`. The paired seed `place-paired-01` with an open mall recorded **9 completed eating** and **9 completed leisure** activities at Galleria places, alongside 2 completed shopping activities. This verifies timed café activity, while seats and eating animation remain unmodeled.

A separate unforced case uses `place-paired-03` for the simulation seed, with matching `-habits`, `-offending`, `-observation`, `-social` and `-life` suffixes. `citizen-0102` made a **leisure** decision at Tick 34 for the L1 café: decision score 319, with need 134, learned value 28, preference 107, time 35, variation 30 and travel penalty −15. They reached and started activity at Tick 59. `citizen-0044` independently chose the same café at Tick 97 and arrived at Tick 123. A same-surface contact episode started at Tick 123; their closest simulated distance was 365 mm. The offender model accumulated 806 seconds of eligible exposure and produced a **minor nonphysical person-target offence** at Tick 257, second 2. Ground truth is at `(41213, 5500, 15573)` mm on `galleria-shop-cafe-l1`, floor `L1`, place `galleria-cafe-l1`. The case has no recorded conversation, witness observation, report, injury, death or scene. Those absences are valid outcomes; the God View Event Explorer still shows the truth. See `place-case-report.json` for exact IDs, decisions and event records. This case demonstrates place contact and opportunity; it does not claim that the offence was shoplifting or that a café visit inevitably causes crime.

## Three paired scenarios

Each row below is a deterministic 120-citizen Tick 500 run. A and C leave the mall open; C closes bridge entry while the legal ground entrance remains. B closes mall entry for new visits and allows the existing egress rule. “Activity” counts include repeat activities within a visit. Reports shown here are reports with a known Galleria place, not all reports.

| Seed | Scenario | Visits | Completed activities | Shopping | Indoor encounters | Indoor offences | Known-place reports |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 01 | A open | 18 | 20 | 2 | 15 | 0 | 0 |
| 01 | B closed | 0 | 0 | 0 | 0 | 0 | 0 |
| 01 | C bridge closed | 18 | 20 | 2 | 17 | 0 | 0 |
| 02 | A open | 17 | 16 | 2 | 11 | 1 | 0 |
| 02 | B closed | 0 | 0 | 0 | 0 | 0 | 0 |
| 02 | C bridge closed | 20 | 17 | 3 | 13 | 0 | 0 |
| 03 | A open | 19 | 17 | 2 | 17 | 3 | 0 |
| 03 | B closed | 0 | 0 | 0 | 0 | 0 | 0 |
| 03 | C bridge closed | 19 | 17 | 2 | 16 | 3 | 0 |

The paired differences arise from route and activity decisions. The zero-offence runs are valid, as are the naturally generated indoor offences. Three seeds are useful for mechanism inspection, not a distributional estimate. `place-experiment-results.json` also records occupancy, failures/deferrals, distinct encounter pairs, global opportunity seconds, truth/report totals and event growth.

## Tests, replay and information boundaries

- `placeInteraction.test.ts` checks stable Galleria identities and floor references, legal ground/upper routes and egress, blocked entry, slot uniqueness and capacity, physically occupied waiting slots, severe-injury interruption, natural shopping, bounded movement, exact Tick 500 replay and ObserverPort isolation.
- Existing `encounterIntegration.test.ts`, `spatial.test.ts`, `crimeWitness.test.ts`, `life.test.ts`, world-generation and v2–v4 regression tests cover shared-surface eligibility, different floors, offender/witness separation and earlier versions.
- Final TypeScript check, production build and `git diff --check` passed. The full Vitest suite passed **44 files / 223 tests**. Vite reported an existing large-bundle warning (about 1.9 MB before gzip). Exact replay equality includes citizens, habits, place runtime, encounters, ground truth and reports; this is a model-state comparison, not visual animation reversal.

## Browser visuals and cost

Actual Chrome screenshots were taken for the 1440 × 900 hero, L0/L1 shop close views, selected L1 café, natural L1 offence in Event Explorer and a 720 × 900 narrow layout. A map click on the visible upper floor returned `SURFACE galleria-l1` and reopened the Place Inspector. The inspector shows real capacity, visitors, current activities and links; floor cutaway makes upper positions visible. It still occupies much of a narrow viewport, and Galleria interiors remain schematic navigation/floor visualization. They are **not** finished detailed rooms. The close cutaway and panel were visually inspected; the visual-quality gate is partial.

At the final default 120-citizen app run, Chrome recorded 254 draw calls, 314,107 triangles, 324 geometries, 63 textures and about 251 MB **JS heap** at the sampled Tick. The renderer's texture-source estimate is about 5.7 MB; it is not GPU VRAM. A stationary 120-frame `requestAnimationFrame` sample had p50 33.3 ms and p95 33.4 ms; these are frame intervals, not GPU frame time. UI-mediated Tick p50 was 8.1 ms and p95 17.0 ms. Tick 500 replay took 6.75 seconds. Chrome error log was empty. Earlier repeats on the same machine produced p95 frame intervals of 16.8–33.3 ms, Tick p95 values of 12.4–14.2 ms and replay times of 3.14–4.15 seconds; this spread limits precision. The final run misses the earlier reference thresholds of frame p95 ≤33 ms, Tick p95 ≤5 ms and replay ≤2 seconds. The clean paired scenario pure simulation Tick p95 ranged 13.6–19.0 ms; separate place-runtime derivation p95 was 0.4–0.8 ms, and the per-decision timing is in JSON. The overall bottleneck cannot be attributed to place runtime from these numbers alone.

One clean-session 200-citizen Chrome benchmark with seed `place-paired-01` measured a pure simulation Tick p50/p95 of **13.6/24.2 ms** with `place-v1`, versus **13.9/23.8 ms** without it. The enabled run recorded 32 visits, 50 indoor encounters and 2 indoor offences; the disabled run recorded different outcomes because capacity rules differ. The enabled run separately measured place-runtime derivation p95 at **0.5 ms**, decision p95 at **5.1 ms** and route-tree p95 at **4.7 ms**. At Tick 500 the enabled state held 1,660 citizen events, 799 completed social encounter episodes and 13 total truth offences; no persistent scene arose in this run. These runs are not a controlled estimate of marginal place cost: trajectories differ, and CPU/GPU scheduling noise is present. Exact JSON is in `place-performance-200-on.json` and `place-performance-200-off.json`.

## Open limits and next gate

The next work should improve the existing v5 route/decision and replay cost, then repeat 200-citizen app frame and replay measurements. Detailed rooms, seating, inventory/ownership, staff-service interactions and a place-specific service economy remain deferred. Do not infer real-world crime risk from the synthetic counterfactuals. The one-mall vertical slice is the scope boundary; further building conversion requires a new review.
