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
