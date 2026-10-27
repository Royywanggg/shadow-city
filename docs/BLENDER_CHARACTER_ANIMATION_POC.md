# Blender character animation proof of concept

## Scope and audit

This proof runs on the existing v0.6 application. It does not change `SimulationStateV5`, navigation, encounters, replay, crime, or resident identity. The ten existing Quaternius character GLBs have one skinned armature with 62 joints and authored `Idle`, `Walk`, and `Run` clips. `CharacterManager` already clones close-range skeletons and keeps medium/far LODs. The installed Blender is `/Applications/Blender.app/Contents/MacOS/Blender`, version 5.2.3 LTS.

The free Quaternius Universal Animation Library Standard GLB contains 43 clips and a different 65-joint rig (`root/pelvis/spine_01/...`). Existing character joints begin `Root/Body/Hips/Abdomen/...`. The clips therefore need retargeting; the original characters do **not** need a new rig. The Standard pack provides `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sitting_Enter`, `Sitting_Idle_Loop`, and `Sitting_Exit`. It does not provide a dedicated ordinary turn or pedestrian start/stop clip in this pack. The renderer interpolates simulation heading along the shortest arc and blends Idle/Walk/Jog across a displayed Tick. Sit/stand clips remain diagnostic previews because the simulation has no authoritative seated state or seat occupancy.

## Rebuild

1. Download the free Standard pack from [Quaternius](https://quaternius.itch.io/universal-animation-library). Verify the archive and extracted GLB hashes in [SOURCE.md](../public/characters/quaternius-ual-poc/SOURCE.md).
2. Run from the repository root:

   ```bash
   /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
     --python scripts/retarget-quaternius-ual.py -- \
     --source '/path/to/Unreal-Godot/UAL1_Standard.glb'
   npm run assets:verify-animation-poc
   ```

The Blender script samples source bone poses, maps them onto each existing character's rest skeleton, translates the old rig's independent foot bones, and exports four opt-in GLBs. It preserves the original meshes and material names where possible. The runtime normalizes Blender's duplicate material suffixes when applying deterministic clothing colors. `scripts/verify-animation-poc-assets.py` checks all four derived skeleton names/hierarchies, the six clips, and stationary horizontal Root/Body tracks.

A clean rerun of `men-suit.glb` with the same Blender and source GLB produced the identical SHA-256 `1733a68c1753e020e7d5a7b5b86da00b4acdec49817ea83d72b0cf4be8eaacc2`.

## Runtime contract

Open the existing app with `?animationProof=1`. The first resident ID in each of presets `character-0`, `character-3`, `character-5`, and `character-9` receives the derived animation asset. For the `population=200` fixture these are `citizen-0006`, `citizen-0010`, `citizen-0003`, and `citizen-0007`. All other residents keep the original asset and LOD path. The proof residents still use their existing identity, appearance colors, simulation position, heading, movement mode, activity, and replay state. The selected resident's portrait uses the same derived asset. No animation clip writes a citizen's simulation position.

The world render samples its clip clock from displayed playback time at 4 Ticks/second, rather than the six seconds of simulated city time in each Tick. Visual heading interpolates between consecutive simulation headings. Idle/Walk/Jog weights crossfade between consecutive activities. Simulation playback speed accelerates visible position and the clip clock together; at high speed, perfect foot locking is not physically possible without changing the presentation time scale or authoring motion warping.

In development builds, `window.__shadowCityV5CharacterPreview` on a selected proof resident allows isolated asset inspection: `setClip('SitDown')`, `setClip('SitIdle')`, `setClip('StandUp')`, and `setTime(seconds)`. These previews are not simulation activities and are not shown in the normal UI.

## Browser verification

`npm run visual:animation-poc` runs installed Chrome at 1440×900, DPR 1, with `population=200`, comparing the original and opt-in assets at the same seed and Tick. It saves actual browser captures and machine-readable metrics in [animation-poc screenshots](screenshots/animation-poc/). The close-up images enlarge the existing Population Inspector portrait through test-only CSS; they render the same selected resident asset, not a fabricated resident. The in-world screenshots show the selected resident at Tick 450 on a real ground route. Real Chrome reports `ANGLE Metal Renderer: Apple M4`; this is not SwiftShader.

Key comparisons: [original suit walk](screenshots/animation-poc/before-citizen-0010-portrait-walk.png), [retargeted suit walk](screenshots/animation-poc/after-citizen-0010-portrait-walk.png), [walk phase](screenshots/animation-poc/after-citizen-0010-Walk-0.55.png), [sitting pose preview](screenshots/animation-poc/after-citizen-0010-SitIdle-0.3.png), and [in-world overhead](screenshots/animation-poc/after-world-ground-tick450-overhead-1440x900.png). The [original in-world overhead](screenshots/animation-poc/before-world-ground-tick450-overhead-1440x900.png) uses the same location and camera. All four sampled presets have individual before/after portrait captures.

| Chrome 1440×900, 200 residents | Original | Four-person proof |
| --- | ---: | ---: |
| Average FPS during 3 s sample | 54.3 | 54.5 |
| p95 CPU frame interval | 52.4 ms | 47.6 ms |
| p95 character manager update | 0.6 ms | 1.4 ms |
| Average submitted WebGL draw calls/frame | 175.1 | 175.0 |
| Average submitted triangles/frame | 229,115 | 229,062 |
| Close rigs / active instances | 10 / 34 | 10 / 34 |
| Texture object count, p95 | 61 | 73 |

The four supplemental GLBs took 385.1 ms total to load, parse, and prepare on this local run; each localhost transfer was 12.0–15.4 ms. See [metrics.json](screenshots/animation-poc/metrics.json) for raw results. This is a single-machine proof with run-to-run variation, not a stable cross-device performance claim. Both variants had no page errors. Pause held Tick 114, replay restored the selected resident's exact state at Tick 100, camera bearing/pitch preserved the simulation fingerprint, and 2× playback advanced about five Ticks during the measured interval.

The test checks Pause, Resume, 2× speed, replay of the selected citizen, and camera bearing/pitch without changing the simulation fingerprint. The browser records `requestAnimationFrame` gaps and WebGL draw calls/triangles by wrapping draw APIs before app load. These are CPU-observed frame intervals and submitted geometry counts, **not** GPU frame time or GPU memory. `gl.info.memory.textures` is a texture object count, not texture bytes. Four additional GLBs add about 4.2 MB of transfer; the proof is opt-in and does not scale full skeletons to all residents.

## Visual review and limits

The four sampled residents retain their clothing colors and recognisable silhouettes across before/after portraits. The retargeted walk and jog are visibly distinct and the foot translation correction removes the initial fixed-foot defect. The sitting sequence reaches a bent-knee transition in the diagnostic viewer. World-scale views cannot show small foot contacts well at the current camera zoom. Foot locking, bag/hand contact, authored turning and start/stop, and a semantic seated state remain future work; this proof does not claim those are solved. The world sample may be obscured from some bearings by buildings, so the overhead and portrait captures are both required for review.
