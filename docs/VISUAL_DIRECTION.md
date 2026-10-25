# Visual direction

## Status and source of truth

This document is the visual source of truth for Shadow City v0.1. The supplied reference image has been inspected. It shows a dense isometric architectural miniature with layered roof equipment, deep blue-black massing, selective cyan light, and warm pockets of occupancy. Translate its depth, crafted silhouettes, and material richness into a wider fictional city; do not copy its strongly luminous platform edge or turn the entire city into neon science fiction.

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
