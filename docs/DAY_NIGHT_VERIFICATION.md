# Unified world clock and dynamic day–night verification

## Architecture and clock audit

The integrated `WorldModelV2` application starts at 08:00 and advances exactly six simulated seconds per v5 Tick. `worldClockAtTick` is the authority for the viewed Tick; movement and encounter contact each use six one-second samples, and the integrated Habit calendar uses six seconds per Tick while updating needs every five Ticks. Place hours, typed-crime time bands, and the rendered lighting use that same Tick-derived time. A complete day is 14,400 Ticks. Pause leaves the Tick fixed; replay inspection calculates the historical time; speed changes only how quickly Ticks are delivered.

Legacy `habit-v1` runs with an explicit 30-second calendar still exist to preserve their fingerprints and replay meaning. They are **not** reinterpreted as six-second runs. The default integrated browser scenario explicitly opts into six seconds; typed crime rejects the 30-second calendar. This is a versioned compatibility exception to a universal clock, not a second clock in the new scenario.

The dynamic renderer receives only the viewed Tick and scenario start hour. `getLightingState(worldSeconds)` is pure and cyclic. Its keyframes interpolate light intensity and colour, solar direction, ambient and hemisphere fill, sky/fog, environment intensity, window and street emission, and exposure. No animation frame, camera state, or visual preview value enters `SimulationStateV5`. The old `?lighting=night` and `?lighting=day` static diagnostic scenes remain available.

The existing scene used sRGB output, AgX tone mapping by default, an optional postprocessing composer, a fixed cool key plus fill, 2048² high-quality shadow maps, a low-intensity night environment texture, clustered instanced windows, and sparse real point lights at selected entries and street locations. Those material and geometry sources remain in place. Daytime changes the light and visible glass response; it does not replace building meshes or textures. No per-window real lights or stronger bloom were added.

## Browser evidence

- Captured: 2026-10-28, Google Chrome 156.0.8078.48, headless, **ANGLE Metal Renderer: Apple M4**, 1440 × 900 CSS pixels, DPR 1. City seed `shadow-city-hero-01`, simulation seed `shadow-city-sim-01`, population 100, viewed Tick 100, fixed camera pose. The seven times are **visual-only development previews**; actual world time in every capture is 08:10.
- Original pre-change static night: [`docs/screenshots/day-night-before-night.png`](screenshots/day-night-before-night.png). New matched night: [`21:00`](../.visual/day-night/hero-2100-1440x900.png). All PNGs are local and ignored by Git; the reproducible script is `npm run visual:day-night` against a running Vite server (`SHADOW_CITY_URL` may override its default port 5173).
- Seven captures: [`02:00`](../.visual/day-night/hero-0200-1440x900.png), [`05:00`](../.visual/day-night/hero-0500-1440x900.png), [`07:00`](../.visual/day-night/hero-0700-1440x900.png), [`12:00`](../.visual/day-night/hero-1200-1440x900.png), [`16:00`](../.visual/day-night/hero-1600-1440x900.png), [`18:30`](../.visual/day-night/hero-1830-1440x900.png), [`21:00`](../.visual/day-night/hero-2100-1440x900.png).
- I inspected the exported images. Noon reveals roof, facade and road detail and suppresses the warm window pixels. The 21:00 capture retains the same cool structures and warm occupied windows as the static-night baseline, with a slightly darker sky. The 05:00 and 18:30 frames show distinct pre-dawn violet and sunset rose atmosphere without obscuring the plaza after fog tuning. The 07:00 view still has deep low-sun shadows and can read too dark at hero scale; this is an unresolved art-direction question. The sky is a low-cost gradient on an orthographic dome, so it has limited spatial variation and no sun disc.
- A Chrome scrub sampled 17:00–21:00 every 15 visual minutes: sun intensity decreased, window/street emission increased, and the largest adjacent window-emission change was 0.094. This verifies the sampled transition and pure interpolation; it is not a recorded continuous-video approval.
- Browser checks passed for visual preview not mutating the simulation object, preview reset, paused clock, Tick 50 replay time, 4× playback clock tracking, and camera bearing/pitch not rotating the sun. The prototype and legacy scene loaded without page errors; the prototype used the dynamic noon state, while the legacy route retained its own static renderer. A 390 × 844 capture was reviewed after collapsing the population sidebar by default and moving the time panel above the bottom bar. No page errors occurred.

## Shadow strategy and performance

`none` removes dynamic shadow maps. `full` updates shadow maps every rendered frame. `optimized` refreshes maps only when rendered world time, quality, level or roof cutaway changes. The current rigged citizens already have `castShadow = false`; they use their existing contact/footlight representation. Consequently, the cache contains static architectural casters and does not leave delayed moving-character shadows. Both sun and moon can cast during twilight, with low-intensity lights omitted from the optimized pass. No new point light casts shadows. High/low shadow maps remain 2048²/1024² with the existing bounded light frustum and bias.

The fixed night full/optimized zero-resident images were inspected side by side and showed no visible architecture-shadow difference. With 100 or 200 residents paused after playback, optimized mode reported 211 draw calls versus 317 for full updates. This confirms fewer render passes. It does **not** prove a matching GPU-time saving. Chrome exposed `EXT_disjoint_timer_query_webgl2`, but this pass did not instrument GPU queries or isolate exact shadow GPU milliseconds; JavaScript frame times and draw calls must not be labelled GPU timings.

Each row below uses a two-second Chrome `requestAnimationFrame` playback sample at 21:00 and a separate 40–50-Tick synchronous CPU sample. These are short, environment-specific samples, not cross-device guarantees. `textureSourceBytesEstimated` was about 5.75 MB in each populated run; that is source data, **not GPU memory**. Night variants used 38 GPU textures (36 with shadows off). Shader-program counts ranged from 21 to 31; the 17-sample twilight scrub held 73 programs after warmup, but exact shader recompilation cost was not measured.

| Residents | Mode | Mean FPS | Frame p50 / p95 ms | Tick p95 ms | Draw calls | Triangles |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 100 | Existing static night | 58.0 | 16.7 / 43.6 | 2.9 | 316 | 312,129 |
| 100 | Dynamic, no shadows | 55.5 | 16.7 / 47.8 | 3.4 | 211 | 223,071 |
| 100 | Dynamic, full shadows | 56.7 | 16.7 / 45.5 | 3.4 | 317 | 312,657 |
| 100 | Dynamic, optimized | 57.5 | 16.7 / 44.5 | 3.7 | 211 | 223,071 |
| 200 | Existing static night | 56.0 | 16.7 / 51.3 | 7.6 | 316 | 312,889 |
| 200 | Dynamic, no shadows | 55.8 | 16.7 / 53.4 | 6.1 | 211 | 223,831 |
| 200 | Dynamic, full shadows | 55.7 | 16.7 / 50.2 | 5.7 | 317 | 313,417 |
| 200 | Dynamic, optimized | 56.5 | 16.7 / 53.0 | 7.4 | 211 | 223,831 |

Average FPS remained close to the baseline, but all p95 frame intervals exceed the repository's 33 ms reference target. The 200-person Tick p95 also exceeds 5 ms. The variation across four short runs is large enough that the 1–2 FPS differences should not be treated as a stable speedup. CPU Tick spikes and existing city/character work remain possible contributors. The 200-person performance gate stays open.

## Acceptance matrix

| Deliverable | Status | Evidence or limit |
| --- | --- | --- |
| World Clock audit and correction | PARTIALLY VERIFIED | Integrated six-second clock verified; versioned legacy 30-second calendars intentionally remain. |
| Dynamic lighting implementation | VERIFIED | Default integrated scene reads the viewed World Clock; actual browser captures. |
| Configurable keyframes | VERIFIED | Pure cyclic keyframe table and interpolation tests. |
| Smooth time transitions | PARTIALLY VERIFIED | Unit continuity and 17 browser scrub samples passed; no continuous video inspection. |
| Sun, sky and atmosphere | VERIFIED | World-space solar direction, gradient sky, fog and seven inspected images. |
| Night emissive integration | VERIFIED | Same instanced windows and shared materials respond to world time; no random render-time selection. |
| Shadow optimization | PARTIALLY VERIFIED | Static-caster cache and image comparison passed; GPU shadow milliseconds unmeasured. |
| Visual-only preview | VERIFIED | Distinct world/preview labels, fixed times and minute scrub; simulation identity and reset checked. |
| Seven time-of-day screenshots | VERIFIED | Seven real Chrome files at one pose and Tick. |
| Before/after performance comparison | PARTIALLY VERIFIED | Four variants × 100/200 measured; GPU time and VRAM unavailable, p95 target fails. |
| TypeScript, tests and build | VERIFIED | Typecheck, 46 test files / 236 tests, and production build passed. |
| Existing-scene compatibility | PARTIALLY VERIFIED | Default/prototype/legacy loaded; full camera/scene regression matrix not repeated. |
| Visual acceptance | PARTIALLY VERIFIED | Screenshots reviewed; sunrise darkness and restrained gradient merit user art review. |

No CityModel, navigation, crime-decision or asset generation rules were changed for this lighting workstream. No push, merge or deployment was performed.
