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
