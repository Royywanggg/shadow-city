# Citywide character animation

## Scope and asset provenance

All ten existing Quaternius character presets now have Blender-retargeted `Idle`, `Walk`, `Run`, `SitDown`, `SitIdle`, and `StandUp` clips. Every citizen keeps its deterministic preset, color inputs, simulation position, activity, and heading. The new GLBs are the default visual assets for close-range characters and the Population Inspector portrait. `?characterAssets=legacy` loads the unchanged original GLBs for review. The source and CC0 license records are in [SOURCE.md](../public/characters/quaternius-ual-v1/SOURCE.md).

The runtime retains the existing LOD budget: at most ten close SkinnedMesh characters, up to 24 medium static characters, and instanced far impostors. This applies to all citizens by camera distance and selection. Far and medium characters do not run individual bone animation, so a wide hero view cannot show all 200 residents performing full skeletal motion at once. The medium pose and far impostors keep the existing outfit silhouettes and per-citizen color treatment. The selected citizen receives a close rig and its portrait uses the same preset and clothing colors.

The Standard animation pack has a 65-joint source rig; the ten existing characters use a common 62-joint target rig. The Blender script maps bone motion to each target rig, keeps its original mesh and material slots, and removes horizontal root motion. World translation remains controlled by `SimulationStateV5`; animation cannot move a citizen through the city. The renderer blends `Idle`, `Walk`, and `Run` from displayed activity and movement mode. Sitting actions are inspectable in the development portrait only because there is no authoritative seated state or seat occupancy. Heading is interpolated from simulation; there is no authored turn, start, or stop clip in this source set.

## Rebuild and validation

Use Blender 5.2.3 LTS with the licensed Standard source GLB whose SHA-256 is recorded in `SOURCE.md`. From the repository root:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
  --python scripts/retarget-quaternius-ual.py -- \
  --source '/path/to/Unreal-Godot/UAL1_Standard.glb'
npm run assets:verify-characters
npm test
npm run build
```

The verifier checks all ten exports for the target skeleton hierarchy, six required clips, and stationary horizontal Root/Body tracks. The original GLBs are retained under `public/characters/quaternius-v01/`. Parsed source assets are shared by the world and portrait, while close rigs clone bones independently. If an upgraded catalog fails to load, the renderer falls back to the original catalog.

A clean independent rebuild of `men-suit.glb` with the same Blender and source GLB reproduced SHA-256 `a8f27cad3a6c2b0d205a32a29c16656dc95f0790e5735a67acd7f2bfb67b6a70`.

## Browser review

`npm run visual:characters` compares default upgraded and `?characterAssets=legacy` at the same 200-citizen test setup in installed Chrome, 1440 × 900, DPR 1. It captures one resident for each of the ten presets, movement and sitting preview phases, full sidebar, narrow sidebar, and a real in-world resident at Tick 450. It also checks Pause, Resume, 2× speed, replayed citizen state, and camera bearing/pitch without changing the simulation fingerprint. The screenshots and raw counters are in [character-city](screenshots/character-city/).

Visual inspection of [upgraded walk](screenshots/character-city/after-citizen-0010-portrait-walk.png) against [legacy walk](screenshots/character-city/before-citizen-0010-portrait-walk.png) shows a more articulated gait. All ten inspected presets retain complete heads, outfit shapes, and feet; [desktop sidebar](screenshots/character-city/after-sidebar-1440x900.png) and [narrow sidebar](screenshots/character-city/after-sidebar-390x844.png) frame the full resident. The [world capture](screenshots/character-city/after-world-ground-tick450-overhead-1440x900.png) confirms the portrait matches the selected worker on a street route. The hero distance still makes foot contact hard to assess.

The browser reports Apple M4 through ANGLE Metal, not SwiftShader. Measurements in `metrics.json` are observed `requestAnimationFrame` intervals and submitted WebGL draw counts. They are not GPU frame time or GPU memory. A single three-second run for each mode gave:

| Mode | Average FPS | p95 frame interval | Character update p95 | Draw calls/frame | Triangles/frame | Catalog load |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Upgraded | 29.25 | 75.7 ms | 1.0 ms | 197 | 243k | 691 ms |
| Legacy | 29.23 | 77.8 ms | 0.8 ms | 177 | 230k | 538 ms |

Both modes used ten close rigs and 34 active character instances. The new GLBs add geometry, draw submissions, and load time; the frame rate did not materially change in this run. Both modes are below a 50 FPS target. A separate GPU profiler and multiple repeat runs are needed for a stable performance conclusion. Foot locking, smooth LOD transitions, a real seated activity, and authored turn/start/stop animation remain open visual work.
