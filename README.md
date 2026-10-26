# Shadow City

Shadow City is an interactive nighttime city and a reproducible urban simulation prototype. Synthetic citizens move on a connected pedestrian network. The v0.5.1 researcher God View can inspect every citizen's actual profile, current state, event history, and true offence history at the selected Tick. Ten licensed rigged character presets form a first visual proof of concept. The underlying v0.5 model gives citizens private, varied offending propensities and lets them choose No Offence, Minor Offence, or Serious Offence when a legal spatial opportunity exists. A separate observation process turns some offences into delayed reports with unknown or unverified, evidence-backed named leads. These mechanisms are illustrative assumptions, not an empirically validated urban or policing model. There is no police decision model, backend, or database.

## Run locally

Use Node.js 22.12 or newer, then run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Left drag to pan, right drag to rotate, scroll to zoom, and use **Reset view** to restore the initial composition. Simulation controls provide Play, Pause, Step, speed, Reset Simulation, and Tick inspection. Camera Reset View is independent of simulation Reset. The left **Population** sidebar lists every citizen, including residents currently indoors; search by ID or synthetic name, filter by current activity, and select a row or a visible citizen in the city. **Focus** keeps the wider city in context, **Follow** tracks a moving citizen, and **Inspect 3D** moves to a close orthographic street view. The selected Profile includes a 3D character portrait that remains visible even if a building occludes the world avatar.

The app starts in **Observed** mode. Its event layer shows only reports and leads available by the current Tick. The separate researcher Population sidebar remains available in Observed, Ground Truth, and Comparison modes; selecting a citizen does not grant extra data to the restricted observer capability. **Ground Truth** exposes attributed offences and descriptive metrics to the researcher; **Comparison** shows both event layers. Reporting scenarios A/B/C use synthetic baseline probabilities 30%/60%/90%. Switching scenario pauses and resets the simulation to Tick 0. The default city seed is `shadow-city-hero-01`; the citizen, offending, and observation seeds are `shadow-city-sim-01`, `shadow-city-offending-01`, and `shadow-city-observation-01`; the population is 80. Use `?scenario=A` or `?scenario=C` to start another reporting scenario, `?population=100` for 100 citizens, or `?seed=your-seed` for another city. `?review=1` selects documented higher synthetic offending odds for screenshot review. The v0.4 anonymous incident model remains available with `?model=v3`, and the citizen-only path with `?model=v2`. In development, `?test=1` exposes public v0.5 Tick controls for browser verification.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

With the development server running, `npm run visual:v051` checks the current Population Explorer, character proof of concept, replay, camera interactions, and 100-citizen run at a fixed 1440 × 900 viewport. Older `visual:v05` captures document the previous milestone and retain its former Observed-mode selection expectations; use that script with a v0.5 checkout. Browser captures and diagnostics are saved in `.visual/`. The scripts use Google Chrome on macOS when present, or Playwright's installed Chromium. If neither is available, run `npx playwright install chromium` first. Set `SHADOW_CITY_CHROME` to a browser executable path if needed. Inspect the images; passing commands alone do not establish visual quality. Software WebGL performance numbers are not hardware GPU benchmarks.

The reviewed 1440 × 900 hero capture and its metadata are in [docs/screenshots](docs/screenshots/README.md). The visual source of truth is [docs/VISUAL_DIRECTION.md](docs/VISUAL_DIRECTION.md).

## Architecture

`src/city/generation` produces a deterministic, Three.js-independent `CityModel` with connected roads and pedestrian paths. `src/simulation` keeps citizen state, attributed ground-truth offences, private reporting outcomes, and public available records separate. The observer capability supplies only delivered reports and available evidence; the separate researcher Population port joins static identity, current state, and true history at the inspected Tick. `src/scene` renders static city and dynamic layers separately; character appearance is stable per ID and animation never determines simulation position. Camera state remains independent. See [docs/V051_ARCHITECTURE.md](docs/V051_ARCHITECTURE.md), [docs/CHARACTER_ASSETS.md](docs/CHARACTER_ASSETS.md), [docs/V05_ARCHITECTURE.md](docs/V05_ARCHITECTURE.md), [docs/VISION.md](docs/VISION.md), and [docs/ROADMAP.md](docs/ROADMAP.md).
