import { AnimationClip, VectorKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'
import { stripHorizontalRootMotion } from './CharacterManager'

describe('character animation isolation', () => {
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
