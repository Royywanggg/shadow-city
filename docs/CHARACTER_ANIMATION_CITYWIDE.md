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

A clean independent rebuild of the corrected `men-suit.glb` with the same Blender and source GLB reproduced SHA-256 `7023bc360af8416a36a975b9a4a060c2e21d9fffaff039f72040ac8712c8de54`.

## Browser review

`npm run visual:characters` compares default upgraded and `?characterAssets=legacy` at the same 200-citizen test setup in installed Chrome, 1440 × 900, DPR 1. It captures one resident for each of the ten presets, movement and sitting preview phases, full sidebar, narrow sidebar, and a real in-world resident at Tick 450. It also checks Pause, Resume, 2× speed, replayed citizen state, and camera bearing/pitch without changing the simulation fingerprint. The screenshots and raw counters are in [character-city](screenshots/character-city/).

Visual inspection of upgraded walk (`screenshots/character-city/after-citizen-0010-portrait-walk.png`, local capture) against legacy walk (`screenshots/character-city/before-citizen-0010-portrait-walk.png`, local capture) shows a more articulated gait. All ten inspected presets retain complete heads, outfit shapes, and feet; desktop sidebar (`screenshots/character-city/after-sidebar-1440x900.png`, local capture) and narrow sidebar (`screenshots/character-city/after-sidebar-390x844.png`, local capture) frame the full resident. The world capture (`screenshots/character-city/after-world-ground-tick450-overhead-1440x900.png`, local capture) confirms the portrait matches the selected worker on a street route. The hero distance still makes foot contact hard to assess.

The browser reports Apple M4 through ANGLE Metal, not SwiftShader. Measurements in `metrics.json` are observed `requestAnimationFrame` intervals and submitted WebGL draw counts. They are not GPU frame time or GPU memory. A single three-second run for each mode gave:

| Mode | Average FPS | p95 frame interval | Character update p95 | Draw calls/frame | Triangles/frame | Catalog load |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Upgraded | 29.25 | 75.7 ms | 1.0 ms | 197 | 243k | 691 ms |
| Legacy | 29.23 | 77.8 ms | 0.8 ms | 177 | 230k | 538 ms |

Both modes used ten close rigs and 34 active character instances. The new GLBs add geometry, draw submissions, and load time; the frame rate did not materially change in this run. Both modes are below a 50 FPS target. A separate GPU profiler and multiple repeat runs are needed for a stable performance conclusion. Foot locking, smooth LOD transitions, a real seated activity, and authored turn/start/stop animation remain open visual work. This table records the first citywide build, before the motion correction below.

## Motion correction and remaining quality work

Review on 2026-10-27 found two concrete faults in the first citywide export. Blender had not refreshed the target pose hierarchy after each parent bone assignment. The target `Walk` clip therefore had an approximately 90° wrist rotation gap at its loop boundary, although the source `Walk_Loop` was continuous. The retarget also ignored 38 finger bones, leaving the hands in a conspicuously open rest pose. The revised export refreshes the target hierarchy while sampling and preserves each character's own authored finger motion. This retains accessory grip and gives the ordinary residents a relaxed hand rather than forcing one source-rig hand shape onto all bodies.

The runtime had a separate Tick timing defect. On some frames, the portrait rendered a new Tick at its endpoint before its effect updated the interpolation pair; the next frame moved the animation time backward by about 0.2 seconds. The world and portrait now update their interpolation pair before painting and read the same `FixedStepScheduler` phase. This also avoids a backward alpha jump when playback speed changes mid-Tick. `scripts/character-motion-diagnostic.mjs` captured 258 portrait frames at 1× and 155 frames while switching 1×→4×→1×, with zero backward time jumps after the fix; the pre-fix diagnostic observed repeated reversals.

The revised `npm run assets:verify-characters` checks all ten GLBs for all 38 finger channels and less than 5° first/last rotation gaps across torso, limbs, wrists, and fingers in `Idle`, `Walk`, and `Run`. Compare the previous spread hand (`screenshots/character-city/after-citizen-0003-portrait-walk.png`, local capture) with the corrected hand (`screenshots/character-motion/after-citizen-0003-walk.png`, local capture). The corrected suit (`screenshots/character-motion/after-citizen-0010-walk.png`, local capture) shows that its existing accessory remains attached. The [motion review captures](screenshots/character-motion/) include one actual Chrome portrait for every preset and a separate full browser regression at 1440 × 900, DPR 1, with 200 citizens.

The final full browser regression on Chrome / ANGLE Metal / Apple M4 passed Pause, Resume, 2× speed, Replay, camera bearing/pitch, ten preset loads, and portrait movement within a Tick with no console errors. One three-second sample measured 54.7 FPS and 49.7 ms p95 frame interval for the corrected catalog versus 48.1 FPS and 76.4 ms for the legacy catalog; both had ten close rigs and 34 active instances. Runs have varied substantially, so this does not establish a repeatable performance improvement, and the corrected p95 still misses the 33 ms frame interval target. The raw [metrics](screenshots/character-motion/full-browser/metrics.json) include draw submissions and load time, but not GPU frame time.

The remaining quality priorities are authored start/stop and turn clips, better stride-to-world-speed matching and foot contact, and a deliberate pass on wrist poses and accessories. The existing suit preset carries a firearm-like prop from its source asset; it is visually incongruous for a neutral synthetic resident and should be replaced or removed in an asset pass. Medium and far LODs still use static poses or impostors. Frame-time variation can also look like stutter even when the clip time is monotonic, so the browser captures and continuity checks do not establish perfect motion on every device.
