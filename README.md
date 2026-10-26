# Shadow City

Shadow City is an interactive, procedurally generated nighttime city and a reproducible urban simulation prototype. The v0.3 living-city milestone adds synthetic citizens who plan trips and move on a connected pedestrian network. Their behavior is illustrative, not an empirically validated urban model. There is no policing model, dashboard, backend, or database.

## Run locally

Use Node.js 22.12 or newer, then run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Left drag to pan, right drag to rotate, scroll to zoom, and use **Reset view** to restore the initial composition. Simulation controls provide Play, Pause, Step, speed, Reset Simulation, and Tick inspection. Camera Reset View is independent of simulation Reset. Click a visible citizen to inspect its activity and planned route. The default city uses seed `shadow-city-hero-01`, simulation seed `shadow-city-sim-01`, and 80 citizens. Add `?seed=your-seed` for another city or `?population=100` for the 100-citizen review fixture.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

With the development server running, `npm run visual:check` covers the static city and `npm run visual:v03` covers the living city at fixed ticks, camera bearings, narrow viewport, selection, replay, and 100 citizens. Both save browser captures in `.visual/`. The scripts use Google Chrome on macOS when present, or Playwright's installed Chromium. If neither is available, run `npx playwright install chromium` first. Set `SHADOW_CITY_CHROME` to a browser executable path if needed. Inspect the images; passing commands alone do not establish visual quality.

The reviewed 1440 × 900 hero capture and its metadata are in [docs/screenshots](docs/screenshots/README.md). The visual source of truth is [docs/VISUAL_DIRECTION.md](docs/VISUAL_DIRECTION.md).

## Architecture

`src/city/generation` produces a deterministic, Three.js-independent `CityModel`. It includes a connected road graph and a pedestrian graph with sidewalks, crossings, entrances, and public destinations. `src/simulation` keeps static agent profiles separate from dynamic state, advances behavior on fixed ticks, and supports deterministic replay. `src/scene` renders the static city and dynamic instanced citizens as separate inputs; camera state remains independent. See [docs/V03_ARCHITECTURE.md](docs/V03_ARCHITECTURE.md), [docs/VISION.md](docs/VISION.md), and [docs/ROADMAP.md](docs/ROADMAP.md).
