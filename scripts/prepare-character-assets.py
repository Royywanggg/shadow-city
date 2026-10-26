"""Create compact GLBs from the official Quaternius modular character glTF files.

The input files are downloaded separately from the original CC0 packs. This script
keeps the authored meshes, rig, and Idle/Walk/Run clips without changing materials.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import struct
from pathlib import Path


SOURCES = (
    ("men-casual2", "1Jn7kULNmrtqP8BUUL19h8MhbdOnwPFhv", "men"),
    ("men-hoodie", "1em1So1xwwQNfHJYMvzKcXkZllvtxpKP5", "men"),
    ("men-punk", "1yHWu5ezXq4dYBcn4sWiNd16YN9fMtXo0", "men"),
    ("men-suit", "1NhXHnGU0zK9hBrT5FoZp8nTz_EmvTPg5", "men"),
    ("men-worker", "14d8n7IDnnlnGt_uiATnNg3uvi_4dyd9V", "men"),
    ("women-casual", "18b3WwlrwrFYWAM7BcnjWeIxKJyxAQiGh", "women"),
    ("women-formal", "1iayBzVv_zLjuPtaNPouw_auwKlQLLmes", "women"),
    ("women-punk", "1ITb_iFiroAsmjQI38z_p6nNXinwliVLA", "women"),
    ("women-suit", "1GjWtofxjmPku25cXJxHrzLLeUbXw7A_s", "women"),
    ("women-worker", "1iwF_fqDErPH9uyol6NmS-MnzGgsZ5ejV", "women"),
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def collect_accessors(document: dict) -> set[int]:
    used: set[int] = set()
    for mesh in document.get("meshes", []):
        for primitive in mesh["primitives"]:
            used.update(primitive.get("attributes", {}).values())
            if "indices" in primitive:
                used.add(primitive["indices"])
            for target in primitive.get("targets", []):
                used.update(target.values())
    for skin in document.get("skins", []):
        if "inverseBindMatrices" in skin:
            used.add(skin["inverseBindMatrices"])
    for animation in document["animations"]:
        for sampler in animation["samplers"]:
            used.add(sampler["input"])
            used.add(sampler["output"])
    return used


def remap_accessors(document: dict, indices: list[int]) -> None:
    mapping = {old: new for new, old in enumerate(indices)}
    document["accessors"] = [document["accessors"][old] for old in indices]
    for mesh in document.get("meshes", []):
        for primitive in mesh["primitives"]:
            primitive["attributes"] = {key: mapping[value] for key, value in primitive.get("attributes", {}).items()}
            if "indices" in primitive:
                primitive["indices"] = mapping[primitive["indices"]]
            for target in primitive.get("targets", []):
                for key, value in target.items():
                    target[key] = mapping[value]
    for skin in document.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = mapping[skin["inverseBindMatrices"]]
    for animation in document["animations"]:
        for sampler in animation["samplers"]:
            sampler["input"] = mapping[sampler["input"]]
            sampler["output"] = mapping[sampler["output"]]


def compact(source: bytes) -> bytes:
    document = json.loads(source)
    if len(document.get("buffers", [])) != 1 or not document["buffers"][0].get("uri", "").startswith("data:"):
        raise ValueError("Expected one embedded glTF buffer")
    if document.get("images") or document.get("extensionsRequired"):
        raise ValueError("Unexpected image or required extension in source asset")
    source_buffer = base64.b64decode(document["buffers"][0]["uri"].split(",", 1)[1])
    document["animations"] = [clip for clip in document["animations"] if clip.get("name") in {"Idle", "Walk", "Run"}]
    if {clip.get("name") for clip in document["animations"]} != {"Idle", "Walk", "Run"}:
        raise ValueError("Source asset does not contain Idle, Walk, and Run")

    used_accessors = sorted(collect_accessors(document))
    remap_accessors(document, used_accessors)
    used_views = sorted({accessor["bufferView"] for accessor in document["accessors"]})
    view_map = {old: new for new, old in enumerate(used_views)}
    old_views = document["bufferViews"]
    binary = bytearray()
    new_views = []
    for old in used_views:
        view = dict(old_views[old])
        while len(binary) % 4:
            binary.append(0)
        offset = view.get("byteOffset", 0)
        length = view["byteLength"]
        view["byteOffset"] = len(binary)
        binary.extend(source_buffer[offset:offset + length])
        new_views.append(view)
    document["bufferViews"] = new_views
    for accessor in document["accessors"]:
        accessor["bufferView"] = view_map[accessor["bufferView"]]
    document["buffers"] = [{"byteLength": len(binary)}]

    json_bytes = json.dumps(document, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((-len(json_bytes)) % 4)
    binary.extend(b"\0" * ((-len(binary)) % 4))
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    return b"".join((
        struct.pack("<4sII", b"glTF", 2, total),
        struct.pack("<I4s", len(json_bytes), b"JSON"), json_bytes,
        struct.pack("<I4s", len(binary), b"BIN\0"), binary,
    ))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    for index, (name, drive_id, pack) in enumerate(SOURCES):
        source = (args.input_dir / f"{name}.gltf").read_bytes()
        result = compact(source)
        destination = args.output_dir / f"{name}.glb"
        destination.write_bytes(result)
        entries.append({
            "presetId": f"character-{index}",
            "name": name,
            "pack": pack,
            "sourceUrl": f"https://drive.google.com/uc?export=download&id={drive_id}",
            "sourceSha256": sha256(source),
            "outputSha256": sha256(result),
            "outputBytes": len(result),
            "clips": ["Idle", "Walk", "Run"],
        })
    (args.output_dir / "manifest.json").write_text(json.dumps(entries, indent=2) + "\n")


if __name__ == "__main__":
    main()
