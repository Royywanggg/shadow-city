"""Check every retargeted GLB against its unchanged source character."""

import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'public/characters/quaternius-v01'
UPGRADED = ROOT / 'public/characters/quaternius-ual-v1'
CLIPS = {'Idle', 'Walk', 'Run', 'SitDown', 'SitIdle', 'StandUp'}


def glb(path):
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from('<III', raw)
    assert magic == 0x46546C67 and version == 2 and total == len(raw), path
    json_length, json_type = struct.unpack_from('<II', raw, 12)
    assert json_type == 0x4E4F534A, path
    data = json.loads(raw[20:20 + json_length])
    binary_start = 20 + json_length
    binary_length, binary_type = struct.unpack_from('<II', raw, binary_start)
    assert binary_type == 0x004E4942, path
    return data, raw[binary_start + 8:binary_start + 8 + binary_length]


def positions(data, binary, accessor_id):
    accessor = data['accessors'][accessor_id]
    assert accessor['type'] == 'VEC3' and accessor['componentType'] == 5126
    view = data['bufferViews'][accessor['bufferView']]
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', 12)
    return [struct.unpack_from('<fff', binary, offset + index * stride)
            for index in range(accessor['count'])]


for entry in json.loads((BASE / 'manifest.json').read_text()):
    filename = entry['name']
    original, _ = glb(BASE / f'{filename}.glb')
    derived, binary = glb(UPGRADED / f'{filename}.glb')
    source_joints = [original['nodes'][node]['name'] for node in original['skins'][0]['joints']]
    proof_joints = [derived['nodes'][node]['name'] for node in derived['skins'][0]['joints']]
    assert set(source_joints) == set(proof_joints) and len(source_joints) == 62, (
        f'{filename}: skeleton names changed')
    def parents(data):
        return {data['nodes'][child].get('name'): node.get('name')
                for node in data['nodes'] for child in node.get('children', [])}
    original_parents, proof_parents = parents(original), parents(derived)
    assert all(original_parents.get(name) == proof_parents.get(name)
               for name in source_joints), f'{filename}: skeleton hierarchy changed'
    assert len(original['meshes']) == len(derived['meshes']), f'{filename}: mesh count changed'
    assert {material['name'] for material in original['materials']} <= {
        material['name'].split('.')[0] for material in derived['materials']}, filename
    assert {clip['name'] for clip in derived['animations']} == CLIPS, filename
    for clip in derived['animations']:
        for channel in clip['channels']:
            target = channel['target']
            name = derived['nodes'][target['node']].get('name')
            if name not in {'Root', 'Body'} or target['path'] != 'translation':
                continue
            sampler = clip['samplers'][channel['sampler']]
            values = positions(derived, binary, sampler['output'])
            assert max(value[0] for value in values) - min(value[0] for value in values) < 1e-4
            assert max(value[2] for value in values) - min(value[2] for value in values) < 1e-4
    print(f'{filename}: 62-joint skeleton, 6 clips, stationary horizontal root')
