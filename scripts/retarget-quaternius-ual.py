"""Retarget the free CC0 UAL Standard clips to existing Shadow City characters.

Run with Blender 5.2 in background mode. This script does not alter the source GLBs.
"""

import argparse
import bpy
from pathlib import Path
from mathutils import Matrix, Vector


CLIPS = {
    'PoCIdle': 'Idle_Loop',
    'PoCWalk': 'Walk_Loop',
    'PoCJog': 'Jog_Fwd_Loop',
    'PoCSitDown': 'Sitting_Enter',
    'PoCSitIdle': 'Sitting_Idle_Loop',
    'PoCStandUp': 'Sitting_Exit',
}
MAPPING = {
    'Hips': 'pelvis', 'Abdomen': 'spine_01', 'Torso': 'spine_02',
    'Chest': 'spine_03', 'Neck': 'neck_01', 'Head': 'Head',
}
for side, letter in [('l', 'L'), ('r', 'R')]:
    MAPPING.update({
        f'Shoulder.{letter}': f'clavicle_{side}',
        f'UpperArm.{letter}': f'upperarm_{side}',
        f'LowerArm.{letter}': f'lowerarm_{side}',
        f'Wrist.{letter}': f'hand_{side}',
        f'UpperLeg.{letter}': f'thigh_{side}',
        f'LowerLeg.{letter}': f'calf_{side}',
        f'Foot.{letter}': f'foot_{side}',
    })


def imported_armature(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    arms = [obj for obj in set(bpy.data.objects) - before if obj.type == 'ARMATURE']
    if len(arms) != 1:
        raise RuntimeError(f'Expected one armature in {path}, got {len(arms)}')
    return arms[0], list(set(bpy.data.objects) - before)


def retarget(source, target, source_action, output_name):
    source.animation_data_create()
    source.animation_data.action = source_action
    if source_action.slots:
        source.animation_data.action_slot = source_action.slots[0]
    source.data.pose_position = 'POSE'
    target.data.pose_position = 'POSE'
    for bone in target.pose.bones:
        bone.rotation_mode = 'QUATERNION'
        bone.location = (0, 0, 0)
        bone.rotation_quaternion = (1, 0, 0, 0)
    action = bpy.data.actions.new(output_name)
    target.animation_data_create()
    target.animation_data.action = action
    if action.slots:
        target.animation_data.action_slot = action.slots[0]
    start, end = (round(value) for value in source_action.frame_range)
    source_pelvis_rest = source.data.bones['pelvis'].matrix_local.translation.copy()
    for frame in range(start, end + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        for target_name, source_name in MAPPING.items():
            if target_name not in target.pose.bones or source_name not in source.pose.bones:
                continue
            src_bone = source.pose.bones[source_name]
            dst_bone = target.pose.bones[target_name]
            delta = src_bone.matrix.to_quaternion() @ source.data.bones[source_name].matrix_local.to_quaternion().inverted()
            desired = delta @ target.data.bones[target_name].matrix_local.to_quaternion()
            translation = dst_bone.matrix.translation.copy()
            if target_name.startswith('Foot.'):
                translation = (target.data.bones[target_name].matrix_local.translation +
                               src_bone.matrix.translation -
                               source.data.bones[source_name].matrix_local.translation)
            transform = Matrix.Translation(translation) @ desired.to_matrix().to_4x4()
            dst_bone.matrix = transform
            dst_bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=target_name)
            if target_name.startswith('Foot.'):
                dst_bone.keyframe_insert(data_path='location', frame=frame, group=target_name)
        # The old rig's legs are parented to Body; copy only vertical pelvis bob.
        # Root and horizontal world position stay controlled by SimulationState.
        bob = source.pose.bones['pelvis'].matrix.translation.z - source_pelvis_rest.z
        body = target.pose.bones['Body']
        body_transform = body.matrix.copy()
        body_transform.translation = (target.data.bones['Body'].matrix_local.translation +
                                      Vector((0, 0, bob)))
        body.matrix = body_transform
        body.keyframe_insert(data_path='location', frame=frame, group='Body')
    target.animation_data.action = None
    return action


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--input-dir', type=Path, default=Path('public/characters/quaternius-v01'))
    parser.add_argument('--output-dir', type=Path, default=Path('public/characters/quaternius-ual-poc'))
    parser.add_argument('--characters', nargs='+', default=['men-casual2', 'men-suit', 'women-casual', 'women-worker'])
    args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index('--') + 1:])
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name in args.characters:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        source, source_objects = imported_armature(args.source)
        source_actions = {action.name: action for action in bpy.data.actions}
        target, target_objects = imported_armature(args.input_dir / f'{name}.glb')
        created = [retarget(source, target, source_actions[source_name], output_name)
                   for output_name, source_name in CLIPS.items()]
        for obj in source_objects:
            bpy.data.objects.remove(obj, do_unlink=True)
        target.animation_data_clear()
        target.animation_data_create()
        for action in created:
            track = target.animation_data.nla_tracks.new()
            track.name = action.name
            strip = track.strips.new(action.name, 0, action)
            strip.action_frame_start = action.frame_range[0]
            strip.action_frame_end = action.frame_range[1]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in target_objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = target
        destination = args.output_dir / f'{name}.glb'
        bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
            export_animations=True, export_animation_mode='NLA_TRACKS', export_image_format='AUTO')
        print(f'EXPORTED {destination} clips={[action.name for action in created]}')


if __name__ == '__main__':
    main()
