# Shadow City

Shadow City is an interactive nighttime city and a reproducible urban simulation prototype. Synthetic citizens move on a connected pedestrian network. The v0.4 model adds ground-truth incidents, delayed reporting, and separate researcher and observer views. These mechanisms are illustrative assumptions, not an empirically validated urban or policing model. There is no police decision model, backend, or database.

## Run locally

Use Node.js 22.12 or newer, then run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Left drag to pan, right drag to rotate, scroll to zoom, and use **Reset view** to restore the initial composition. Simulation controls provide Play, Pause, Step, speed, Reset Simulation, and Tick inspection. Camera Reset View is independent of simulation Reset. Click a visible citizen to inspect its activity and planned route.

The v0.4 panel starts in **Observed** mode, showing only reports available by the current Tick. **Truth** shows all incidents to a researcher; **Compare** shows both with research metrics. Reporting scenarios A/B/C use synthetic baseline probabilities 30%/60%/90%. Switching scenario pauses and resets the simulation to Tick 0. The default city seed is `shadow-city-hero-01`; the citizen simulation seed is `shadow-city-sim-01`, the reporting seed is `shadow-city-observation-01`, and the population is 80. Use `?scenario=A` or `?scenario=C` to start another reporting scenario, `?population=100` for 100 citizens, or `?seed=your-seed` for another city. `?review=1` selects a documented higher synthetic incident rate for fixed screenshot review. The older v0.2/v0.3 simulation path remains available with `?model=v2`; in development only, `?test=1` exposes public v0.4 Tick controls for browser verification.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

With the development server running, `npm run visual:check` covers the static city, `npm run visual:v03` covers citizens and camera behavior, and `npm run visual:v04` checks the observation scenarios, modes, replay, and incident markers. Browser captures are saved in `.visual/`. The scripts use Google Chrome on macOS when present, or Playwright's installed Chromium. If neither is available, run `npx playwright install chromium` first. Set `SHADOW_CITY_CHROME` to a browser executable path if needed. Inspect the images; passing commands alone do not establish visual quality.

The reviewed 1440 × 900 hero capture and its metadata are in [docs/screenshots](docs/screenshots/README.md). The visual source of truth is [docs/VISUAL_DIRECTION.md](docs/VISUAL_DIRECTION.md).

## Architecture

`src/city/generation` produces a deterministic, Three.js-independent `CityModel` with connected roads and pedestrian paths. `src/simulation` keeps citizen state, ground-truth incidents, private reporting outcomes, and public available records separate. The v0.4 observer capability only supplies already available reports. `src/scene` renders the static city and dynamic layers separately; camera state remains independent. See [docs/V04_ARCHITECTURE.md](docs/V04_ARCHITECTURE.md), [docs/V03_ARCHITECTURE.md](docs/V03_ARCHITECTURE.md), [docs/VISION.md](docs/VISION.md), and [docs/ROADMAP.md](docs/ROADMAP.md).
