# Character animation proof assets

These four GLBs are derived from the existing Shadow City Quaternius Ultimate Modular character GLBs in `../quaternius-v01/` and the free **Universal Animation Library Standard** pack by Quaternius. Both source packs are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- Character source and original license records: `../quaternius-v01/manifest.json`, `../quaternius-v01/LICENSE-MEN.txt`, and `../quaternius-v01/LICENSE-WOMEN.txt`.
- Animation source: [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) / [Standard download](https://quaternius.itch.io/universal-animation-library).
- Downloaded archive SHA-256: `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`.
- Extracted `Unreal-Godot/UAL1_Standard.glb` SHA-256: `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997`.
- Exported with Blender 5.2.3 LTS and `scripts/retarget-quaternius-ual.py`. The source archive is not required at runtime and is not stored in the repository.

The four derived files retain the existing meshes and 62-joint character skeleton. They contain retargeted Idle, Walk, Jog, Sitting Enter, Sitting Idle, and Sitting Exit clips. The original GLBs remain the default and are unchanged.
