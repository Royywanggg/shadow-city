# Architectural detail asset source

- Source: Kenney, City Kit (Commercial) 2.1, https://kenney.nl/assets/city-kit-commercial
- Downloaded from the official Kenney asset page on 2026-10-26.
- License: Creative Commons Zero (CC0); see `LICENSE.txt` from the archive.
- Files retained: `detail-awning-wide.glb` and `detail-overhang-wide.glb`, each with the source color atlas embedded as a data URI. The complete archive is not included.
- The glTF modules are visual decoration only. CityModel building footprints, entrances, pedestrian routes, and WorldModelV2 navigation remain authoritative.
- Each selected module is drawn as one InstancedMesh, so its instances share one mesh and material. The source awning is 40 triangles; the overhang is 64 triangles. Both assets refer to the same small atlas file, although GLTFLoader may create separate texture objects for the two GLBs.
- The source atlas is embedded in each GLB so the modules load without a separate PNG file.

The Quaternius Downtown City MegaKit was reviewed as a more detailed future source, but its free Standard download was rate-limited by itch.io during this implementation. No Quaternius Downtown asset is bundled here.
