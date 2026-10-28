# Screenshot versioning policy

PNG screenshots are excluded from Git. Previously tracked captures remain in an existing working tree when removed from the Git index, but a fresh clone does not contain them. The verification records name local capture paths; versioned JSON reports and browser scripts provide reproducible measurements where available. A missing PNG in a fresh clone is not evidence of a new visual review.

---

# Visual review capture

The `hero-1440x900.png` image is a **v0.1 review candidate**, captured from the running Three.js application rather than from the supplied reference image.

- Date: 2026-10-25 (Europe/London)
- Browser: Google Chrome 155.0.8059.85, headless, macOS
- Viewport: 1440 × 900 CSS pixels
- Device pixel ratio: 1
- Seed: `shadow-city-hero-01`
- Capture command: `npm run visual:check` with the local Vite server running

The same browser pass also checked a 390 × 844 viewport, pan, zoom, reset, and two additional seeds. The script places those captures in `.visual/`; the fixed hero view is kept here for review and later comparison. Human visual approval remains the deciding gate described in `docs/VISUAL_DIRECTION.md`.

Development renderer telemetry during the headless browser pass recorded about 125 draw calls and 55,405 triangles with shadows and postprocessing. The active frame interval sample was too small to establish a reliable frame-rate benchmark; test on a named hardware reference before setting a universal performance claim.

## v0.1.1 comparison capture

`hero-v0.1.1-1440x900.png` is the current v0.1.1 review capture. The v0.1 file above is preserved without edits.

- Date: 2026-10-25 (Europe/London)
- Browser: Google Chrome 155.0.8059.85, headless, macOS
- Viewport: 1440 × 900 CSS pixels; device pixel ratio: 1
- Seed: `shadow-city-hero-01`
- Capture command: `SHADOW_CITY_URL=http://127.0.0.1:5174/ npm run visual:check` with the local Vite server running
- Browser checks: hero and closer detail screenshots, pan, zoom, reset, 390 × 844 viewport, and two alternate seeds; no page errors were reported

The final headless renderer reported 131 draw calls and 92,033 triangles. Its active frame interval came from only four sampled frames and is not a reliable frame-rate result. The geometry increase comes from layered building masses, facades, and street furniture. The new image has a stronger rear skyline, lower foreground, and civic focus; its regular grid and many boxlike mid-rise buildings remain visible. These limitations should inform further art review rather than be hidden behind the passing technical checks.

## v0.1.2 comparison capture

`hero-v0.1.2-1440x900.png` is the current static visual refinement candidate. The v0.1.1 screenshot remains unchanged for direct comparison.

- Date: 2026-10-25 (Europe/London)
- Browser: Google Chrome 155.0.8059.85, headless, macOS
- Viewport: 1440 × 900 CSS pixels; device pixel ratio: 1
- Seed: `shadow-city-hero-01`
- Capture command: `SHADOW_CITY_URL=http://127.0.0.1:5175/ npm run visual:check` with the local Vite server running
- Browser checks: hero and close view, pan, zoom, reset, 390 × 844 viewport, and two alternate seeds; no page errors were reported

The final headless pass reported 131 draw calls and 84,529 triangles. Its active frame interval used only four sampled frames, so it is not a reliable frame-rate benchmark. Compared with v0.1.1, the plaza edges, asymmetric offices, and varied rooflines read more clearly at hero scale. The regular street lattice and many boxlike buildings remain visible; local illumination still has limited contrast. User visual approval remains pending.

## v0.2 camera and simulation review capture

`v02-hero-1440x900.png` preserves the fixed hero seed and initial 315° bearing as a separate v0.2 review image. `v02-bearing-000.png`, `v02-bearing-090.png`, `v02-bearing-180.png`, and `v02-bearing-270.png` show actual camera rotations at the four cardinal map bearings. `v02-narrow-390x844.png` records the touch-size layout.

- Date: 2026-10-26 (Europe/London)
- Browser: Google Chrome 155, headless, macOS; WebGL via ANGLE SwiftShader Vulkan software renderer
- Viewports: 1440 × 900 and 390 × 844 CSS pixels; device pixel ratio: 1
- City seed: `shadow-city-hero-01`; simulation seed: `shadow-city-sim-01`
- Commands: `npm run visual:check` and `npm run visual:v02` against the local Vite server

I inspected the browser screenshots. The initial city composition, plaza, skyline, and night palette match the v0.1.2 candidate; the compact overlays sit in the surrounding negative space and no building is clipped in the hero view. The cardinal captures show true rotation around the city, with the plaza remaining near the center and no platform clipping. North/east/south/west facades have uneven light and some reverse views are darker and flatter; this is a remaining visual limitation of the static lighting, not a camera orientation failure. At 390 × 844, the title, camera controls, city, seed line, and simulation controls remain separate, though the city is small because the inherited orthographic fit prioritizes the full platform.

The browser script exercised Step, Play/Pause, speed selection, a diagnostic command and its event, replay inspection and Return Live, compass north-up, the four cardinal bearings and 360° wrap, right-drag rotation, pitch limits, pan/zoom, reset isolation, keyboard focus handling, resize preservation, a touch bearing button, one-finger pan, and two-finger pinch zoom. It also checks for page errors.

The final headless SwiftShader run reported 131 draw calls and 84,529 triangles, matching the v0.1.2 scene geometry. During 1× simulation plus a 100-step mouse rotation, it rendered 100 frames in 36.78 seconds (about 2.7 rendered frames/s under this software-rendered automation workload) while the simulation advanced from tick 6 to 381 without suspension. The median interval of just 14 close-spaced frames was 33.3 ms; that filtered statistic cannot represent the full interaction. The idle frame count stayed at one across an 800 ms sample, confirming demand rendering did not run continuously while still. These numbers are environment-specific and are not a hardware FPS benchmark. No page errors occurred; Chrome reported a Three.js clock deprecation warning and screenshot-related WebGL readback stalls.

## v0.3 living city review capture

The `v03-hero-tick000-1440x900.png`, `v03-hero-tick100-1440x900.png`, and `v03-hero-tick500-1440x900.png` files show the same fixed city at three authoritative simulation ticks. `v03-selected-tick100.png` records an actual Canvas click on `citizen-0003` and its route inspector; `v03-close-tick100.png` records a closer zoom. The four `v03-bearing-*-tick100.png` files, `v03-narrow-tick100-390x844.png`, and `v03-hundred-tick500-1440x900.png` cover camera, layout, and population checks. All v0.2 images above remain unchanged.

- Date: 2026-10-26 (Europe/London)
- Browser: Google Chrome 155, headless, macOS; WebGL via ANGLE SwiftShader Vulkan software renderer
- Viewports: 1440 × 900 and 390 × 844 CSS pixels; device pixel ratio: 1
- City seed: `shadow-city-hero-01`; simulation seed: `shadow-city-sim-01`; behavior model: `synthetic-v1`
- Population: 80 by default, 100 for the separate performance capture
- Command: `npm run visual:v03` against a local Vite server

I inspected the resulting browser screenshots. Tick 100 has visibly more pale walking figures and restrained ground accents around the parks, square, and streets than Tick 0. The selected route stays on pedestrian edges and the inspector sits outside the main plaza composition. Crossings align with the road surface. The close view helps distinguish people from static street furniture, while the default hero keeps them intentionally small; motion is still easier to perceive during playback than in one still frame. The 390 × 844 layout keeps controls separate, though the city remains small under the inherited full-platform camera fit. The 90° and 180° views still have flatter, darker roof and facade readings than the hero; a small cool fill was retained, but it does not fully solve this older lighting limitation. Human visual approval remains a review decision.

The browser pass checked actual agent click selection, Step, Pause invariance, camera/simulation independence, Reset Simulation, exact Tick 100 and 500 replay, four cardinal bearings, close zoom, the narrow layout, and 100-agent 1× playback. It reported no page errors. At Tick 100 the 80-agent run held 156 events. For 500 synchronous browser-measured ticks, the 80-agent median/p95 transition costs were about 0.1/0.3 ms; the 100-agent median/p95 were about 0.1/0.4 ms. These timings exclude GPU rendering and their browser timer precision is coarse. The 100-agent scene reported 135 draw calls and 103,285 triangles, versus 131 draw calls and 84,529 triangles in the preserved static v0.2 scene. During 1× playback plus a 35-step right-drag, headless SwiftShader rendered 37 frames in 12.18 seconds (about 3.0 rendered frames/s) while the simulation advanced 121 ticks. This is a software-renderer automation sample, not a hardware FPS benchmark. Chrome reported a Three.js clock deprecation warning and screenshot readback stalls.

The existing `npm run visual:v02` camera regression script was rerun against the v0.3 app. Pan, zoom, pitch bounds, compass and bearing, right-drag rotation, reset isolation, keyboard focus handling, narrow touch pan/pinch, diagnostic probe compatibility, and Play/Pause all passed with no page errors. Its new run wrote only temporary `.visual/v02-*` files; the historical `docs/screenshots/v02-*` files above remain the original v0.2 evidence. In this software-rendered run, the 100-step active drag rendered 101 frames in 38.41 seconds (about 2.6 rendered frames/s) while ticks advanced and playback did not suspend.

## v0.4 truth and observation review capture

The 21 `v04-*.png` files record the v0.4 Observed, Ground Truth, and Comparison modes at Tick 0, 100, and 500. They also include a 1.8506× close marker view, cardinal bearings, Replay at Tick 500, scenario A/C, a 390 × 844 viewport, and a 100-citizen run. The previous v0.3 images remain unchanged. Exact browser output and the full screenshot inventory are in `v04-results.json`.

- Date: 2026-10-26 (Europe/London)
- Browser: Google Chrome 155, headless, macOS; WebGL via ANGLE SwiftShader Vulkan software renderer
- Viewports: 1440 × 900 and 390 × 844 CSS pixels; device pixel ratio: 1
- City seed: `shadow-city-hero-01`; citizen simulation seed: `shadow-city-sim-01`; observation seed: `shadow-city-observation-01`
- Synthetic review configuration: `?review=1&test=1`, incident baseline 2.4 expected incidents per occupied block-hour; reporting scenarios A/B/C use 0.3/0.6/0.9 global probability
- Command: `npm run visual:v04` against the local Vite server

I inspected the resulting browser screenshots after a marker-size and narrow-panel correction. Coral incident diamonds and Cyan report rings are now distinct at 1440 × 900 without overwhelming the plaza or skyline. Observed Mode shows only delivered reports; the desktop panel leaves the central composition clear. The 390 × 844 panel exposes all four core researcher counts, with modest overlap over the city's lower front edge. District rows in the desktop Comparison panel require scrolling, and the inherited mobile full-platform framing leaves the city small with substantial empty sky. These remain visual review issues. The markers are map annotations drawn over scene depth for legibility; they should not be read as physical objects on roofs.

The review scenario produced 10 true incidents at Tick 100: 2 available reports, 1 pending, and 7 unreported. At Tick 500 it produced 43 true incidents: 24 available, 1 pending, and 18 unreported. Under the same citizen world and ground truth, A/B/C exposed 15/24/39 available reports at Tick 500. These counts came from the simulation, with no presentation-only events. The browser pass checked Step, Pause, Reset, citizen selection, camera invariance, all cardinal bearings, historical report availability, Replay and Return Live, and narrow layout; it reported no page errors. The separate `npm run visual:v03` compatibility regression also passed on the explicit `?model=v2` path, with no page errors. Its temporary captures did not replace the preserved v0.3 files here.

The 80-citizen browser run measured simulation Tick p50/p95 of about 0.1/0.5 ms and Replay Tick 500 at 64.7 ms. The 100-citizen run measured Tick p50/p95 of about 0.2/0.5 ms and Replay Tick 500 at 80.1 ms; its Tick 500 had 54 true incidents and 31 available reports. The hero and 100-citizen scenes reported 136/137 draw calls and 104,533/107,189 triangles. During 100-citizen playback and a 35-step right-drag, headless SwiftShader rendered 36 frames in 12.82 seconds (about 2.81 rendered frames/s) while 127 logical ticks advanced. Only three close-spaced frame intervals passed the diagnostic filter during that drag, so its p50/p95 frame interval values are not representative. This software-renderer automation workload is not a hardware GPU benchmark. Chrome emitted a Three.js Clock deprecation warning and screenshot-related WebGL readback stall warnings.

## v0.5 offender and observation review capture

The `v05-*.png` files preserve actual v0.5 browser screenshots. They include Observed, Truth, and Compare at Tick 0, 100, and 500; selected researcher citizen; a selected public report detail; cardinal bearings; 1.8506× close marker view; Replay Tick 500; reporting scenarios A/C; 390 × 844 layout and a scrolled public report view; and 100 citizens. `v05-results.json` contains the exact capture inventory, counts, timings, and browser diagnostics. `v05-before-presence-fix-observed-tick100-1440x900.png` preserves the prior Observed view that incorrectly hid pedestrians; the current `v05-observed-tick100-1440x900.png` shows the corrected anonymous presence. Earlier milestone screenshots remain unchanged.

- Date: 2026-10-26 (Europe/London)
- Browser: Google Chrome 155, headless, macOS; WebGL via ANGLE SwiftShader Vulkan software renderer
- Viewports: 1440 × 900 and 390 × 844 CSS pixels; device pixel ratio: 1
- City seed: `shadow-city-hero-01`; citizen seed: `shadow-city-sim-01`; offending seed: `shadow-city-offending-01`; observation seed: `shadow-city-observation-01`
- Configuration: default v4 model, `?review=1&test=1&scenario=B`; population 80 except the separate 100-citizen check. Reporting scenarios A/B/C set declared global probabilities to 0.3/0.6/0.9. The review fixture raises declared synthetic offending odds; its outcomes are not empirical rates.
- Capture command: `SHADOW_CITY_URL=http://127.0.0.1:5176/ npm run visual:v05` against a local Vite server

The final Chrome pass checked the mobile report scroll control. The selector, suspect, and evidence fields are visible in `v05-narrow-public-report-tick100-390x844.png` after scrolling within the compact panel.

I inspected the actual screenshots. At hero scale, the offence markers appear on pedestrian surfaces; the visible ground rings and stems give the raised coral heads a clear anchor, and scene depth hides markers behind buildings. The central plaza and skyline remain readable in the default view. At close zoom, the park near the front edge gathers many overlapping offence and report glyphs by Tick 500, making individual occurrences hard to distinguish. The corrected Observed view shows small pale pedestrians on streets and public spaces; the Tick 100 browser check counted 61 visible anonymous figures without exposing their IDs or positions in development diagnostics. Observed Mode also displays delivered reports and an inspectable public record with reported type, location and ticks, unknown or unverified suspect lead, and evidence references; it does not offer clickable stable citizen identities. The researcher inspector displays a selected agent's movement, synthetic profile, and actual offence history. At 390 × 844, the city is still small under the inherited full-platform orthographic fit. A visible `SCROLL FOR REPORTS ↓` control moves the compact panel to the report selector; report details and lower comparison metrics still require internal scrolling.

The browser check verified Step/Pause/Reset, anonymous pedestrian presence in Observed Mode, selection only in researcher modes, every available report selectable in Observed Mode, public suspect and evidence detail, four cardinal bearings, camera invariance, close zoom, Replay/Return Live, historical report availability, scenario reset and reporting counterfactuals, narrow layout, and 100-citizen playback. No page errors or console errors occurred. At Tick 100, the 80-citizen review world had 21 offences, of which 10 had available reports, 2 were pending, and 9 were unreported. At Tick 500, it had 79 offences, 42 available, 1 pending, and 36 unreported. A/B/C preserved the same 79 true offences while exposing 24/42/73 available reports.

In the archived run, the 80-citizen Tick p50/p95 were about 0.3/0.6 ms, with Replay Tick 500 at 126.3 ms. The 100-citizen Tick p50/p95 were about 0.4/0.6 ms, with Replay Tick 500 at 160.9 ms. Its scene reported 139 draw calls and 121,693 triangles. During 100-citizen playback and a 35-step right-drag, headless SwiftShader rendered 36 frames in 10.46 seconds (about 3.44 frames/s) while 104 logical ticks advanced. `v05-results.json` gives the exact browser timings. This browser automation with software rendering is not a hardware FPS benchmark; the active-frame sample was sparse. Chrome emitted a Three.js Clock deprecation warning and screenshot-related GPU readback stall warnings.

## v0.5.1 God View population and character review capture

The `v051-*.png` files preserve the new browser review separately from all v0.5 evidence. Key comparisons are `v05-observed-tick000-1440x900.png` against `v051-observed-population-tick000-1440x900.png`, and `v05-selected-citizen-tick100.png` against `v051-selected-portrait-tick100-1440x900.png` and `v051-detail-character-tick100-1440x900.png`. `v051-results.json` lists all 13 captures and exact diagnostics.

- Date: 2026-10-26 (Europe/London)
- Browser: Google Chrome 155, headless, macOS; WebGL via ANGLE SwiftShader Vulkan software renderer
- Viewports: 1440 × 900 and 390 × 844 CSS pixels; device pixel ratio: 1
- Seeds: city `shadow-city-hero-01`, citizen `shadow-city-sim-01`, observation `shadow-city-observation-01`, identity `shadow-city-identity-01`, appearance `shadow-city-appearance-01`; v4 synthetic review scenario B, 80 citizens by default and 100 in a separate run
- Capture command: `npm run visual:v051` against the local Vite server

I inspected the actual screenshots. The Population Sidebar leaves the plaza visible at hero scale, and the existing event panel moves to the opposite side. Both panels use substantial horizontal space, which reduces the unobstructed city area. The selected citizen portrait visibly shows a rigged Quaternius outfit even when city buildings can occlude the world avatar. The explicit Inspect 3D view centers a selected walking resident on a sidewalk with a restrained ring and stem; its close building facades fill most of the image, as expected for an approximately 9× city zoom. The 390 × 844 sidebar becomes a drawer; the selected Profile scrolls to its real fields. Characters are still intentionally small at hero scale, and the ten base models plus verified clothing tints cannot make 1,000 visibly unique outfits.

The browser script checked all-citizen browsing, ID and name search, activity filtering, map-to-sidebar selection in Observed mode, selection persistence across event layers, Focus, Follow cancellation on map drag, 3D Inspect and exit, bearing/pitch controls during Inspect, Idle/Walk/Run clip preview without moving SimulationState, portrait rendering, Tick 100 and 500 inspection and Return Live, sidebar collapse/resize, narrow selected Profile scroll, and 1×/2×/4× playback. No page errors occurred. Tick 100 selected-character diagnostics counted 36 Far, 24 Medium and 1 Close representations at 1.8×; Inspect counted 59 Far and 2 Close, including the selected agent. The selected portrait uses a second demand-rendered WebGL canvas and is not included in main-scene draw-call diagnostics.

The 100-citizen run measured Tick p50/p95 at approximately 0.3/0.5 ms; the main scene reported 136 draw calls and 109,333 triangles at Tick 500. During four seconds of 1× active playback, headless SwiftShader rendered 21 frames (about 5.25 frames/s) while 37 logical ticks advanced. The frame sample is sparse and software-rendered, so this is not a hardware GPU acceptance result. Chrome emitted the existing Three.js Clock deprecation warning and screenshot-related WebGL readback stall warnings. A named hardware-GPU browser performance gate remains open before a 1,000-citizen release.

## v0.5.1 character playback repair

The original `v051-*` screenshots and `v051-results.json` above remain unchanged. New evidence is `v0511-detail-character-tick100-1440x900.png`, `v0511-active-character-1440x900.png`, and `v0511-after-playback-1440x900.png`; `v0511-regression-results.json` and `v0511-playback-results.json` record the browser checks. The browser was Chrome 155 headless on macOS with ANGLE SwiftShader, at 1440 × 900 CSS pixels and DPR 1 on 2026-10-26. Seeds were city `shadow-city-hero-01` and simulation `shadow-city-sim-01`; the review fixture used scenario B and 80 citizens, with a separate 100-citizen run.

I inspected the new screenshots. The fixed Tick 100 Inspect view still shows the licensed character on the sidewalk. In the active-playback screenshot, Follow and the selected portrait remain engaged while the world avatar can be hidden by intervening buildings; the portrait makes its current appearance visible. The far tier now uses transparent sprites baked from the same ten licensed models, and medium static geometry is baked from an Idle pose instead of exposing the skeleton bind pose. The screenshots alone cannot prove temporal smoothness; the accompanying live browser check sampled the selected Close rig across 33 advanced ticks and 13 rendered frames, found monotonically advancing animation time, and recorded zero primitive fallbacks and zero page errors. The complete v0.5.1 interaction script also passed 1×/2×/4× controls, replay, selection, and 100-citizen playback, with zero primitive fallbacks in its sampled states after assets loaded.

The 100-citizen headless SwiftShader run rendered 22 frames in four seconds (about 5.50 frames/s), compared with 21 frames (about 5.25 frames/s) in the preserved v0.5.1 run. Main-scene draw calls increased from 136 to 154 at Tick 500 because of the far sprite batches; these sparse software-rendered samples do not establish a meaningful FPS improvement or a hardware performance result. A separate 4× stress attempt with approximately 9× Inspect zoom, Follow, a live portrait, and software rendering did not complete reliably under browser automation. A named hardware-GPU playback and occlusion review remains open.

## v0.5.2 spatial occupancy and character behaviour

The preserved v0.5.1 files above were not replaced. New 200-citizen evidence is `v052-population-200-tick000-1440x900.png`, `v052-population-200-tick100-1440x900.png`, `v052-population-200-plaza-close-tick100-1440x900.png`, `v052-population-200-tick500-1440x900.png`, `v052-population-200-narrow-tick100-390x844.png`, and `v052-results.json`. A fresh run of the existing v0.5.1 interaction check after the v0.5.2 changes is saved as `v052-regression-results.json` with separate selected-portrait and Inspect 3D captures. Both checks ran against the local Vite app on 2026-10-26 with Chrome 155 headless, Apple M4 via ANGLE Metal, DPR 1, city seed `shadow-city-hero-01`, simulation seed `shadow-city-sim-01`, and scenario B. The v0.5.2 capture command was `SHADOW_CITY_WEBGL=hardware npm run visual:v052`; the regression used `SHADOW_CITY_WEBGL=hardware npm run visual:v051`.

I inspected the actual 1440 × 900 and 390 × 844 screenshots. The fixed hero keeps its central plaza and dark architectural composition. At Tick 100 the public-space figures occupy separate small positions; the closer plaza capture makes their distribution easier to see. The figures remain too small at hero scale to judge individual clothing or movement from a still. The narrow drawer shows a rendered selected portrait, but it covers nearly all of the already small city view. In the regression Inspect 3D capture, the selected character stands on a sidewalk outside the building; even there its world silhouette is small against the nearby facade. The ten preset assets and bounded LOD pool remain the main appearance limitation.

The 200-citizen browser check verified independent simulated and rendered residents at Tick 0/100/500 and Replay 100: outdoor/rendered counts were 50/50, 167/167, and 128/128; 54 occupied slots at Tick 100 and 40 at Tick 500 were all unique and at legal positions. Nine sites at Tick 100 and 12 at Tick 500 held multiple residents in separate slots. No resident waited for capacity in this fixed fixture; a focused test forces capacity exhaustion and verifies explicit waiting and a `TripDeferred` event. The browser also checked map selection, portrait preset and colour against the selected world appearance, Focus/Follow, bearing/pitch, Follow cancellation, all three event views, replayed selected position, Return Live, and narrow selection. The existing regression covered sidebar history, collapse/resize, 3D Inspect, selected Close LOD, and 1×/2×/4× controls. Both browser runs reported zero page errors and zero primitive character fallbacks; Chrome emitted the known Three.js Clock deprecation warning.

At the 200-citizen hero view, 500 simulation steps had Tick p50/p95 about 0.5/0.9 ms. Four seconds of 1× playback rendered 240 frames (about 59.4 FPS) and advanced 39 ticks on the Apple M4. The main scene reported 154 draw calls, 107,445 triangles, 90 geometries, and 40 textures; JavaScript heap was about 116 MB at that sample. Its 120-frame active interval sample had p50/p95 about 16.6/32.8 ms, so individual frame spikes remain despite the near-60 average. The separate 100-citizen hardware regression rendered 240 frames in four seconds (about 60.0 FPS) at the hero view, with 154 draw calls, 97,209 triangles, Tick p50/p95 about 0.3/0.7 ms, and a selected Close rig in its focused view. These are timed headless browser samples on one GPU, not a cross-device guarantee or a GPU-memory measurement. The 200-citizen active sample used Far sprites at the hero scale; sustained 200-citizen close-zoom performance and visible animation smoothness under camera motion remain to be measured.
