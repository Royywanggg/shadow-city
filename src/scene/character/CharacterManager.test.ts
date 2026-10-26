import { AnimationClip, Bone, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  Skeleton, SkinnedMesh, Uint16BufferAttribute, VectorKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'
import { animationWeights, bakeStaticPose, stripHorizontalRootMotion } from './CharacterManager'

describe('character animation isolation', () => {
  it('bakes bone deformation into medium-distance geometry instead of exposing the bind pose', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3))
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(Array(12).fill(0), 4))
    geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
    const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial())
    const bone = new Bone()
    mesh.add(bone)
    mesh.bind(new Skeleton([bone]))
    bone.position.x = 1
    const scene = new Group()
    scene.add(mesh)
    const staticScene = bakeStaticPose(scene, new AnimationClip('Idle', 1, []))
    const baked = staticScene.children[0] as Mesh
    expect(baked).toBeInstanceOf(Mesh)
    expect(baked).not.toBeInstanceOf(SkinnedMesh)
    expect(baked.geometry.getAttribute('position').getX(0)).toBeCloseTo(1)
    expect(geometry.getAttribute('position').getX(0)).toBe(0)
  })

  it('blends activity transitions without resetting to the bind pose', () => {
    expect(animationWeights('travelling', 'atHome', 0)).toEqual({ Idle: 1, Walk: 0, Run: 0 })
    expect(animationWeights('travelling', 'atHome', 0.5)).toEqual({ Idle: 0.5, Walk: 0.5, Run: 0 })
    expect(animationWeights('travelling', 'atHome', 1)).toEqual({ Idle: 0, Walk: 1, Run: 0 })
    expect(animationWeights('atDestination', 'travelling', 0.5)).toEqual({ Idle: 0.5, Walk: 0.5, Run: 0 })
    expect(animationWeights('atHome', undefined, 0)).toEqual({ Idle: 1, Walk: 0, Run: 0 })
    expect(animationWeights('atHome', 'travelling', 0.3, 'Run')).toEqual({ Idle: 0, Walk: 0, Run: 1 })
  })
  it('locks horizontal root translation without changing authored vertical movement', () => {
    const source = new AnimationClip('Walk', 1, [
      new VectorKeyframeTrack('Body.position', [0, 0.5, 1], [1, 2, 3, 5, 4, 7, 9, 6, 11]),
      new VectorKeyframeTrack('Hand.position', [0, 1], [0, 0, 0, 1, 1, 1]),
    ])
    const sanitized = stripHorizontalRootMotion(source)
    expect(Array.from(sanitized.tracks[0].values)).toEqual([1, 2, 3, 1, 4, 3, 1, 6, 3])
    expect(Array.from(sanitized.tracks[1].values)).toEqual([0, 0, 0, 1, 1, 1])
    expect(Array.from(source.tracks[0].values)).toEqual([1, 2, 3, 5, 4, 7, 9, 6, 11])
  })
})
