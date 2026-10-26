# Shadow City

Shadow City is an interactive nighttime city and a reproducible urban simulation prototype. Synthetic citizens move on a connected pedestrian network. The default v0.5 model gives citizens private, varied offending propensities and lets them choose No Offence, Minor Offence, or Serious Offence when a legal spatial opportunity exists. A separate observation process turns some offences into delayed reports with unknown or unverified, evidence-backed named leads. These mechanisms are illustrative assumptions, not an empirically validated urban or policing model. There is no police decision model, backend, or database.

## Run locally

Use Node.js 22.12 or newer, then run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Left drag to pan, right drag to rotate, scroll to zoom, and use **Reset view** to restore the initial composition. Simulation controls provide Play, Pause, Step, speed, Reset Simulation, and Tick inspection. Camera Reset View is independent of simulation Reset. In Ground Truth or Comparison mode, click a visible citizen to inspect its activity, profile, and offence history.

The app starts in **Observed** mode, showing only reports and leads available by the current Tick. **Ground Truth** exposes attributed offences, private profiles, and descriptive metrics to a researcher; **Comparison** shows both views. Reporting scenarios A/B/C use synthetic baseline probabilities 30%/60%/90%. Switching scenario pauses and resets the simulation to Tick 0. The default city seed is `shadow-city-hero-01`; the citizen, offending, and observation seeds are `shadow-city-sim-01`, `shadow-city-offending-01`, and `shadow-city-observation-01`; the population is 80. Use `?scenario=A` or `?scenario=C` to start another reporting scenario, `?population=100` for 100 citizens, or `?seed=your-seed` for another city. `?review=1` selects documented higher synthetic offending odds for screenshot review. The v0.4 anonymous incident model remains available with `?model=v3`, and the citizen-only path with `?model=v2`. In development, `?test=1` exposes public v0.5 Tick controls for browser verification.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

With the development server running, `npm run visual:check` covers the static city, `npm run visual:v03` covers citizens and camera behavior, `npm run visual:v04` checks the legacy observation model, and `npm run visual:v05` checks the offender-driven review fixture, public/researcher views, replay, camera behavior, and markers at a fixed 1440 × 900 viewport. Browser captures and diagnostics are saved in `.visual/`. The scripts use Google Chrome on macOS when present, or Playwright's installed Chromium. If neither is available, run `npx playwright install chromium` first. Set `SHADOW_CITY_CHROME` to a browser executable path if needed. Inspect the images; passing commands alone do not establish visual quality. Software WebGL performance numbers are not hardware GPU benchmarks.

The reviewed 1440 × 900 hero capture and its metadata are in [docs/screenshots](docs/screenshots/README.md). The visual source of truth is [docs/VISUAL_DIRECTION.md](docs/VISUAL_DIRECTION.md).

## Architecture

`src/city/generation` produces a deterministic, Three.js-independent `CityModel` with connected roads and pedestrian paths. `src/simulation` keeps citizen state, attributed ground-truth offences, private reporting outcomes, and public available records separate. The v0.5 observer capability supplies only delivered reports and available evidence; researcher APIs separately expose true offender identity. `src/scene` renders static city and dynamic layers separately; camera state remains independent. See [docs/V05_ARCHITECTURE.md](docs/V05_ARCHITECTURE.md), [docs/V04_ARCHITECTURE.md](docs/V04_ARCHITECTURE.md), [docs/V03_ARCHITECTURE.md](docs/V03_ARCHITECTURE.md), [docs/VISION.md](docs/VISION.md), and [docs/ROADMAP.md](docs/ROADMAP.md).
