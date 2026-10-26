# Visual direction

## Status and source of truth

This document is the visual source of truth for Shadow City's city scene and later visual additions. The supplied reference image has been inspected. It shows a dense isometric architectural miniature with layered roof equipment, deep blue-black massing, selective cyan light, and warm pockets of occupancy. Translate its depth, crafted silhouettes, and material richness into a wider fictional city; do not copy its strongly luminous platform edge or turn the entire city into neon science fiction.

The final setting is a **fictional modern metropolis**. London and other European cities may inform its density, street hierarchy, and proportions, but no real city or geographic data is being recreated. The rendering style is **stylized realism**: more detailed and materially considered than a cartoon low-poly scene, while remaining a deliberately composed miniature rather than a photoreal game world.

## North star

**Cinematic isometric city × dark scientific instrument × living architectural miniature.**

The city should look composed and built, with streets that organize real blocks, recognizable architectural families, and depth created by light and atmosphere. It should be inviting to examine at different zoom levels. Avoid a repeated field of cubes, a flat map, loud cyberpunk neon, and a dashboard placed over the scene.

## Canonical hero view

- Use the fixed seed `shadow-city-hero-01` and a **1440 × 900 CSS-pixel viewport** for the canonical v0.1 hero view. Record browser and device pixel ratio with every screenshot. The seed names a review fixture; its final generated arrangement will be selected through visual iteration.
- Start with an orthographic camera near 45° azimuth and 35° elevation. Tune the position and framing by inspection while retaining the miniature isometric character.
- Place a central public square or small park near the visual center. Main streets should lead toward it, making the open space an unmistakable focal point. Frame it with a main height cluster slightly right of center in the rear middle distance. Keep tall silhouettes below the top edge and use lower foreground roofs to lead the eye inward.
- Build three depth bands: detailed foreground, the most legible central blocks, and a softer, less saturated skyline. Preserve enough negative space around the edges that the city feels like a deliberately lit model rather than a wall of geometry.
- Keep the default camera view unobstructed. Interaction should allow smooth, bounded panning and zooming without losing the city or rotating away from the intended view in v0.1.

The hero view is a composition target, not a reason to hard-code one seed's building positions. Other seeds must remain coherent.

The city should have different district densities and irregular block lengths. Its street network can remain broadly legible and connected without becoming a perfectly repeated grid. Do not add a river, bridge, or complex terrain in v0.1.

## Architectural vocabulary and skyline

Use a small family of repeatable building types with varied proportions, not unrelated random primitives:

| Family | Intended character | Typical role |
| --- | --- | --- |
| Low-rise terraces | Narrow frontages, grouped bays, stepped or pitched roof accents | Foreground and quieter side streets |
| Mid-rise blocks | Broader footprints, clear base/middle/top, setbacks, rhythmic window bands | Main streets and most of the central mass |
| Slender towers | Tapered or stepped crowns, distinct silhouette, controlled facade rhythm | A few skyline anchors near the focal cluster |
| Service and industrial forms | Long roofs, loading bays, vents, restrained utility details | Visual relief at district edges |
| Civic hall | Low, broad mass, visible portico, and a modest roof crown | Frames the central square without overpowering it |

Give street corners deliberate treatment: chamfered or rounded masses, a taller corner bay, or a distinct roof cap. Align entries and facades to the street. Vary parcel widths, building depths, roof heights, and setbacks within each family. Use rooftop plant rooms, parapets, vents, mechanical housings, and occasional terraces for silhouette variety. The reference image demonstrates how layered rooftop forms enrich a small building; use that principle at city scale. Keep towers sparse; a handful of peaks should set the skyline while lower masses make those peaks meaningful.

Architectural detail should be readable at the hero scale. Spend geometry on silhouette, frontage rhythm, and roof shape before tiny props. Building variation should arise from district and parcel rules, with seeded local choices that do not break the overall composition.

## Roads and ground plane

Use a street hierarchy: a small number of broad avenues, narrower local streets, and occasional irregular block lengths or offsets. Streets should form connected routes rather than decorative gaps. Make intersections, sidewalks, curbs, and selected lane or crossing marks legible at the hero scale. The road graph's nodes and edges are the source for visible road placement; rendered streets must not imply connections absent from the graph.

Road surfaces should be dry, dark charcoal with subtle material variation, visibly distinct from sidewalks and building plinths. Avoid pure black surfaces that erase the street plan. The central public space needs a contrasting ground treatment, a deliberate border, and modest planting or civic detail. Do not use wet-road reflections or a weather system in v0.1.

## Palette, materials, and light

Treat these colors as **starting swatches**, to be tuned in the actual rendered browser view:

| Role | Starting color | Use |
| --- | --- | --- |
| Atmosphere | `#08111f` | Background and distant fog |
| Deep structure | `#142235` | Unlit building faces and ground forms |
| Lit structure | `#30445b` | Surfaces caught by the key light |
| Cool accent | `#72bac8` | Sparse windows, wayfinding or instrument-like accents |
| Warm accent | `#d7a36a` | Most active windows and street warmth |
| Coral accent | `#cc746d` | Rare focal signals only |

Favor matte, rough building surfaces with subtle value and hue differences. Distinguish roofs, walls, plinths, roads, and sidewalks by material response, not just color. Windows should form uneven but plausible occupied clusters. Use emissive windows and fixtures as visible light sources without requiring a real point light at each window.

Lighting hierarchy:

1. A soft, cool moonlike directional key defines building volume and readable shadow direction.
2. Low-intensity ambient or sky fill keeps dark facades visible.
3. Warm windows and selective street fixtures provide human scale and focal warmth.
4. Very sparse cyan and coral highlights add orientation and identity.
5. Gentle distance fog separates depth bands under a clear, dry night sky; restrained bloom may soften emissive highlights but must preserve crisp architecture and road readability.

The image should remain dark but never muddy. Bright highlights should be rare enough to guide attention toward the public space, selected building faces, and streets. Avoid uniformly illuminated windows, saturated outlines on every edge, excessive bloom, and many competing shadow-casting lights. Do not make the whole city glow.

## Motion and camera behavior

The scene is mostly still in v0.1. Use subtle atmosphere or light variation only if it adds life without disrupting screenshot repeatability. Camera pan and zoom should have smooth damping, sensible bounds, and no abrupt jumps or clipping. The default hero pose must be recoverable. Do not add free rotation as a v0.1 requirement.

## Visual verification gates

Visual approval requires actual browser inspection. A successful compile or render initialization is insufficient. When browser access or screenshot capture is unavailable, record the gate as **pending**; never claim that the scene was visually inspected.

1. **Hero composition:** Open `shadow-city-hero-01` at 1440 × 900 CSS pixels. Review and capture a screenshot when tooling permits. Confirm a clear focal cluster, varied skyline, readable foreground, useful negative space, and no accidental cropping.
2. **Architecture and streets:** Inspect at default and closer zoom. Check family variation, rooflines, facade rhythm, intersections, sidewalks, road connectivity as depicted, and absence of visible overlaps, z-fighting, or repeated cube rows.
3. **Light and atmosphere:** Review value separation, warm/cool balance, legibility of dark surfaces, sparse accents, fog depth, shadow softness, and glow restraint. Compare with the approved hero screenshot and supplied references once available.
4. **Interaction and resilience:** Pan and zoom in the browser, then return to the hero pose. Check damping, bounds, clipping, and a narrow viewport. Inspect at least two additional seeds for composition failures.

Save the seed, viewport, browser, device pixel ratio, and date with screenshot evidence. Compare images under the same capture conditions; automated pixel differences may flag regressions, but human review decides whether the visual result improved.

## Settled visual decisions

- Fictional modern city with selective European urban cues, not a replica of a real place.
- Central public square or small park as the primary open-space focal point; no river, bridge, or complex terrain for v0.1.
- Stylized realism and a clear, dry night. Architectural proportions, facade layering, roof detail, and controlled light take priority over photoreal materials or weather effects.

## v0.1.1 refinement notes

The v0.1.1 pass uses nine related building archetypes: low residential forms, apartments with upper setbacks and balconies, commercial frontages, stepped offices, towers with podiums, industrial roofs, a porticoed civic hall, L-shaped corners, and a tiered landmark. Their shared palette should keep the city coherent, while their distinct massing and rooflines prevent a field of identical boxes. Street furniture is generated as static spatial data from avenue edges, parks, and the plaza; it does not alter road connectivity.

Use the supplied reference for its layered massing, rich rooftops, and selective light. Keep the wider city's road hierarchy and public square visible. At the fixed hero scale, prioritize the civic focal point and taller rear cluster over small details that only read after zooming. Window light should form occupied room or floor clusters, with warm activity more common than cyan accents. Never increase bloom to conceal weak geometry or lighting.

The preserved `docs/screenshots/hero-1440x900.png` is the v0.1 baseline. Compare the separately captured v0.1.1 hero image under the same browser, seed, viewport, and device pixel ratio. A more layered skyline is progress; repeated facades, a visible square grid, and distant props that vanish at hero scale remain visual issues to call out if present.

## v0.1.2 review focus

The v0.1.2 pass keeps the nine building families and connected road graph. Larger parcel groupings near the square and in selected work blocks, split apartment masses, asymmetric offices, deeper facade ribs, and more varied roofs should be judged in the default hero view. The fixed screenshot is a review candidate, not visual approval. The regular road lattice remains visible, and local light changes should only be retained when they produce a clear improvement in the browser image.

## v0.3 living city review focus

Citizens should reveal movement and human scale without turning the architectural miniature into a bright icon map. Use restrained pale teal and warm amber to separate outward and returning travel. Their silhouettes should be readable at the fixed hero scale and at closer zoom, especially near the plaza and crossings; keep their world size credible beside doorways and street fixtures. Parked or indoor citizens need no exterior mesh. Selection may show a small ground ring, a thin route line following pedestrian edges, and a compact information panel outside the city focal area. Avoid broad neon paths, floating labels over every person, or glowing effects that compete with the skyline.

The v0.3 browser gate uses city seed `shadow-city-hero-01`, simulation seed `shadow-city-sim-01`, 1440 × 900 CSS pixels, and explicit Tick 0, 100, and 500 screenshots. Check that citizens are visible at hero and close scales, stand on walking surfaces, turn along pedestrian edges, remain legible at 0°/90°/180°/270° bearings, and stay selectable. Also inspect the narrow layout and a 100-citizen run. Preserve v0.2 captures for comparison. Record any reverse-view facade darkness and only retain a local fill or material adjustment if the actual browser image improves without flattening the hero lighting hierarchy.

## v0.4 ground truth and observation review focus

Keep the cinematic city as the primary canvas. Ground Truth Mode may show small Coral incident marks; Observed Mode shows only already available Cyan report marks. Comparison Mode may show both layers over the same city with a compact research metrics panel. Use different shapes as well as color so a report's arrival is distinguishable from an incident's occurrence. Emphasize newly occurred incidents and newly available reports by logical Tick age, then let older marks subside. Keep the markers legible at close zoom without turning a dense history into a bright field of symbols. The default Observed UI must not expose hidden incident counts, positions, IDs, or pending-report indicators.

For review, fix city seed `shadow-city-hero-01`, citizen simulation seed `shadow-city-sim-01`, reporting seed `shadow-city-observation-01`, viewport 1440 × 900 CSS pixels, and DPR 1. Capture Tick 0, 100, and 500 in Ground Truth, Observed, and Comparison modes; a close marker view; bearings 0°/90°/180°/270°; a narrow viewport; and Tick 500 replay. Use a documented synthetic review configuration if the default run is too sparse. Every visible mark must originate in the simulation or an available report. Record the browser and rendering environment, performance samples, and any legibility or overlap failures after actual browser inspection. Preserve earlier milestone screenshots.

## v0.5 offender-driven review focus

Keep the city architecture and lighting dominant. In v0.5 Ground Truth, a compact Coral diamond with a short stem and ground ring marks an attributed offence. In Observed, a Cyan ground ring marks an available report; an unavailable report has no visual mark. Comparison may show both. The v0.5 baseline keeps moving pedestrians as anonymous ambient figures in Observed mode, without selection rings, routes, identity labels, or behavioural colors. The v0.5.1 researcher God View overlay below supersedes that baseline selection rule while leaving the Observed event layer restricted. Use scene depth so a marker behind a building is occluded, and verify at close zoom that its ring sits on the pedestrian surface rather than appearing on a roof. Grouped or aging marks should remain distinguishable without filling the scene with glow. Do not encode an agent's private behavioural group or true offender identity in its public appearance.

## v0.5.1 population and character review focus

The Population Sidebar and its selection highlight are explicit **researcher God View** overlays, available while any of the three event layers is selected. In Observed, the event marks still show only available reports; the researcher sidebar may show private citizen truth because it is a separate capability. Label this distinction clearly. Keep the central square and active camera focus clear of the open sidebar at 1440 × 900, and provide a compact drawer or rail on narrow screens.

Each citizen has a stable appearance assembled from a restrained, coherent wardrobe and body catalog. At the hero scale, people should read as living city occupants without bright outlines on everyone. At medium zoom, clothing color and silhouette should distinguish nearby individuals; at close zoom, selected citizens should show a rigged character and readable idle or walking motion. A selected-only portrait provides an unobstructed 3D inspection of the actual assigned character when city geometry hides them. Clothing, color, accessories, and animation must not signal a private propensity or proven offence. A citizen must keep the same recognizable appearance through camera changes, playback speeds, replay, and far/medium/close transitions. Use sparse selection rings and route aids only for the selected researcher subject.

Review the fixed city seed `shadow-city-hero-01`, simulation seed `shadow-city-sim-01`, observation seed `shadow-city-observation-01`, viewport 1440 × 900 CSS pixels, and DPR 1 at Tick 0, 100, and 500. Capture the default view, open and collapsed sidebar, selected close character, cardinal bearings, replay, and a narrow viewport. Inspect whether the character style fits the dark architectural miniature, whether feet stay on legal walking surfaces, whether focus avoids the sidebar, and whether LOD changes or co-located citizens cause visible popping. Record the actual browser, renderer, visible population, full-rig count, draw calls, triangles, and frame-time samples. Keep the visual gate pending until screenshots are reviewed in a browser.

Inspect the fixed `shadow-city-hero-01` seed at 1440 × 900 CSS pixels and DPR 1 with the declared `?review=1` synthetic fixture. Capture Tick 0, 100, and 500 in all three modes, cardinal bearings, a close marker view, a narrow layout, and a 100-citizen run. Check that Observed mode contains no selectable citizen identities or private counts. Preserve the v0.4 screenshots and record browser, renderer, Tick, scenario, performance samples, and any marker clutter or occlusion limitations. A passing script alone does not establish visual acceptance; review its actual screenshots.

## v0.6 multi-level city direction and review

The v0.6 default world uses the **original** `shadow-city-hero-01` map at 1440 × 900 CSS pixels and DPR 1. Preserve its existing roads, civic square, density, skyline, window clusters, nighttime materials, lighting hierarchy and hero framing. The Galleria replaces one block east of the square and should look like a deliberate addition to that city, not a second city placed beside it. The bridge is a short urban connection over the avenue, not a compulsory visual or behavioural centrepiece. Residents need a readable far-range presence without inventing a render-only position. The earlier separate 320 m scene is a prototype archive, not a new visual baseline.

The Galleria uses separate L0 and L1 surfaces, corridors and shop thresholds. The L1 atrium opening must remain visibly open, with guardrails around the void. At close range, inspect the west stair, east ramp, bridge deck, Galleria ground and upper entrances, escalator, indoor counters, floor edges, rails and overhead clearance. Roof cutaway and level filtering should reveal activity without suggesting a person is on a roof or inside a wall. Selected routes and incident markers must retain world elevation. Clicking a visible surface must identify its semantic surface rather than infer a floor from X/Z alone.

Review the original v0.5.2 and integrated v0.6 hero captures side by side, then inspect upper-floor cutaway and selected-person focus in a real browser. Repeat with 0°, 90°, 180° and 270° bearings, pan/zoom/Reset, a 390 × 844 viewport, a second world seed, the legacy model, and Tick 100/500 replay. Record the browser, WebGL renderer, viewport, DPR, seed and Tick with each capture. The reference performance gate and measured result belong in `V06_ARCHITECTURE.md`; screenshots are evidence of what was inspected, not proof that every artistic target is resolved. In particular, monitor the narrow Galleria facade, bridge visibility, occasional roof occlusion, indoor legibility and selected-person visibility at hero scale.
