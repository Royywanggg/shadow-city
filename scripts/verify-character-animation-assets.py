"""Check every retargeted GLB against its unchanged source character."""

import json
import math
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'public/characters/quaternius-v01'
UPGRADED = ROOT / 'public/characters/quaternius-ual-v1'
CLIPS = {'Idle', 'Walk', 'Run', 'SitDown', 'SitIdle', 'StandUp'}
LOOP_BONES = {'Body', 'Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head',
              'Shoulder.L', 'Shoulder.R', 'UpperArm.L', 'UpperArm.R',
              'LowerArm.L', 'LowerArm.R', 'Wrist.L', 'Wrist.R',
              'UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R',
              'Foot.L', 'Foot.R'}
FINGER_BONES = {f'{finger}{joint}.{side}' for finger in ('Index', 'Middle', 'Ring', 'Pinky')
                for joint in range(1, 5) for side in ('L', 'R')}
FINGER_BONES |= {f'Thumb{joint}.{side}' for joint in range(1, 4) for side in ('L', 'R')}
LOOP_BONES |= FINGER_BONES


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


def rotations(data, binary, accessor_id):
    accessor = data['accessors'][accessor_id]
    assert accessor['type'] == 'VEC4' and accessor['componentType'] == 5126
    view = data['bufferViews'][accessor['bufferView']]
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', 16)
    return [struct.unpack_from('<ffff', binary, offset + index * stride)
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
        finger_channels = set()
        for channel in clip['channels']:
            target = channel['target']
            name = derived['nodes'][target['node']].get('name')
            sampler = clip['samplers'][channel['sampler']]
            if name in FINGER_BONES and target['path'] == 'rotation':
                finger_channels.add(name)
            if clip['name'] in {'Idle', 'Walk', 'Run'} and name in LOOP_BONES and target['path'] == 'rotation':
                values = rotations(derived, binary, sampler['output'])
                dot = abs(sum(left * right for left, right in zip(values[0], values[-1])))
                gap_deg = math.degrees(2 * math.acos(min(1, dot)))
                assert gap_deg < 5, f'{filename}: {clip["name"]} {name} loop gap {gap_deg:.1f}°'
            if name not in {'Root', 'Body'} or target['path'] != 'translation':
                continue
            values = positions(derived, binary, sampler['output'])
            assert max(value[0] for value in values) - min(value[0] for value in values) < 1e-4
            assert max(value[2] for value in values) - min(value[2] for value in values) < 1e-4
        assert finger_channels == FINGER_BONES, f'{filename}: missing authored finger motion in {clip["name"]}'
    print(f'{filename}: 62-joint skeleton, 6 clips, continuous locomotion loops, authored fingers')
