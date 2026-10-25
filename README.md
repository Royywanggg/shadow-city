# Shadow City

Shadow City v0.1 is an interactive, procedurally generated nighttime city. It is the visual foundation for a future urban simulation laboratory. The current release has no agents, policing model, dashboard, backend, or database.

## Run locally

Use Node.js 22.12 or newer, then run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Drag to pan, use the mouse wheel or trackpad to zoom, and use **Reset view** to return to the initial composition. The default city uses the fixed seed `shadow-city-hero-01`. Add `?seed=your-seed` to the URL to generate another reproducible layout.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

With the development server running, `npm run visual:check` opens the actual application in a headless browser and saves the hero, narrow, alternate-seed, pan, zoom, and reset screenshots in `.visual/`. The script uses Google Chrome on macOS when present, or Playwright's installed Chromium. If neither is available, run `npx playwright install chromium` first. Set `SHADOW_CITY_CHROME` to a browser executable path if needed. Inspect the images; passing commands alone do not establish visual quality.

The reviewed 1440 × 900 hero capture and its metadata are in [docs/screenshots](docs/screenshots/README.md). The visual source of truth is [docs/VISUAL_DIRECTION.md](docs/VISUAL_DIRECTION.md).

## Architecture

`src/city/generation` produces a deterministic, Three.js-independent `CityModel`. Its road graph contains connected nodes and edges and supplies the visible street layout. `src/scene` renders the static model using React Three Fiber and instanced geometry. Future simulation state will be a separate input to the renderer; it will not primarily mutate static city geometry. See [docs/VISION.md](docs/VISION.md) and [docs/ROADMAP.md](docs/ROADMAP.md).
