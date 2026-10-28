# Round 4 verification record

Date: 2026-10-28. City seed: `shadow-city-hero-01`. Browser: Chrome 156.0.8078.48, headless, 1440 × 900 CSS pixels, DPR 1, WebGL 2 through ANGLE Metal on Apple M4. The test ran against a temporary local Vite server and used the real integrated city. Screenshots below were produced by Chrome and manually reviewed. [Raw measurements](screenshots/round4-browser-report.json) and the reproducible [browser script](../scripts/scene-browser-check.mjs) contain the exact URL and capture sequence.

## Event reconstruction

The diagnostic life configuration increases harm probabilities; it does not assign a named victim, place or Tick. The fixed 120-resident run produced five deaths, five persistent scenes, 15 direct discoveries and six delayed scene reports by Tick 500. The first death arose at Tick 172 on the L0 `ground` surface at `public:block-1-5`. The researcher selected it in Event Explorer and focused the camera.

| Inspection | Result |
| --- | --- |
| Tick 164, before | The death and scene are absent; the Event Explorer says the selected event is unavailable at this Tick. |
| Tick 172, event | The death and one `present` scene exist at the authoritative millimetre coordinates. |
| Replay through Tick 180 | The inspected state advances by real deterministic Tick reconstruction; the scene remains `present` and the live Tick remains 500. |
| Observer view | No scene report is exposed before its delivery Tick. The God View event selection is explicitly labelled as researcher-only even when the map mode is Observed. |
| Map pointer selection | A real Chrome click on the ground scene ring changed Event Explorer from the death event to its scene creation record. See the [pointer report](screenshots/round4-marker-click-report.json) and [script](../scripts/scene-marker-click-check.mjs). |

Browser screenshots: hero Tick 100 (`screenshots/round4-hero-tick100-1440x900.png`, local capture), selected event at live Tick 500 (`screenshots/round4-death-event-tick500-1440x900.png`, local capture), before (`screenshots/round4-before-event-1440x900.png`, local capture), event Tick (`screenshots/round4-event-tick-1440x900.png`, local capture), after (`screenshots/round4-after-event-1440x900.png`, local capture), narrow event view (`screenshots/round4-event-narrow-720x900.png`, local capture), Galleria L1 at 0° (`screenshots/round4-galleria-l1-bearing-0-1440x900.png`, local capture), 90° (`screenshots/round4-galleria-l1-bearing-90-1440x900.png`, local capture), 180° (`screenshots/round4-galleria-l1-bearing-180-1440x900.png`, local capture), 270° (`screenshots/round4-galleria-l1-bearing-270-1440x900.png`, local capture), and 200-resident hero (`screenshots/round4-hero-200-tick500-1440x900.png`, local capture). Browser console and page errors: zero.

The actual event screenshot shows the ground marker and associated residents at the public space, with the camera centered on the event. The first capture exposed a historical Encounter label covering the marker; the final capture removes that automatic overlay and retains the explicit “Open Encounter” action. The panel is usable but dense, and its detail area requires scrolling at 1440 × 900. The narrow view collapses the population sidebar when Event Explorer opens. The existing Galleria L1 cutaway and camera bearings were inspected; normal buildings have no modeled interior floors, so a generic building roof cutaway is not yet available. L0/L1 spatial separation is covered by fixture tests; a naturally generated L1 event was not captured in this browser run.

## Tests and performance

TypeScript checking, 43 test files with 216 tests, and the production build passed. Focused tests cover stable scene/source IDs, legal surface and elevation, no duplicate creation, cross-floor discovery rejection, delayed report delivery and allowlist isolation, recoverable scene resolution, completed-conversation hearsay, before/during/after replay, and non-mutating trajectory reconstruction. Legacy life tests continue to pass with `scene` omitted. The tests use explicit harm fixtures where needed; the browser chain above uses ordinary simulation decisions under a diagnostic probability configuration.

| Measure | 120 residents, diagnostic run | 200 residents, default run |
| --- | ---: | ---: |
| Tick p50 / p95 | 2.4 / 4.8 ms | 6.2 / 9.0 ms |
| Tick 500 recomputation | not sampled | 3,062.2 ms |
| Draw calls / triangles | 325 / 313,209 | 322 / 313,417 |
| Geometries / textures | 199 / 38 | 196 / 38 |
| JS heap at Tick 500 | 196.0 MB | 192.4 MB |
| Active frame interval p95 | 18.7 ms, 87 samples | 24.6 ms, 32 samples |

The 120-resident JS heap was 133.5 MB at Tick 100 and 196.0 MB at Tick 500 in the final run; garbage collection and browser caching make this a coarse process-wide sample, not a Scene-only memory measurement. The 200-resident default run had zero scenes and discoveries, a valid no-death outcome. Neither the 200-resident Tick p95 target of 5 ms nor the 2-second Tick 500 replay target was met. The frame samples are short and do not establish a reliable sustained FPS distribution. GPU frame time and actual VRAM usage were not measured; the renderer's texture source estimate is not VRAM.

## Open gates

- Run a longer 200-resident moving-frame sample and profile the existing V5 Tick/replay cost.
- Capture a naturally generated L1 or Galleria aftermath in Chrome; current multi-level browser captures exercise camera and cutaway without an event there.
- Improve panel density and marker contrast at close zoom. A per-building interior cutaway requires modeled interior geometry.
- The system has no explicit death-scene cleanup action, official notification to citizens, forensic evidence, policing, or medical response. Death scenes intentionally persist.
- Outcomes and reports use synthetic, uncalibrated probabilities; the diagnostic run is a software fixture, not a real-city estimate.
