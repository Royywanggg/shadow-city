import { describe, expect, it } from 'vitest'
import { sampleAnimationTime } from './animationClock'

describe('character animation clock', () => {
  it('advances continuously across fixed playback ticks', () => {
    expect(sampleAnimationTime(99, 100, 0)).toBeCloseTo(9.9)
    expect(sampleAnimationTime(99, 100, 0.5)).toBeCloseTo(9.95)
    expect(sampleAnimationTime(99, 100, 1)).toBeCloseTo(sampleAnimationTime(100, 101, 0))
    expect(sampleAnimationTime(null, 100, 1)).toBeCloseTo(10)
  })

  it('does not use the six simulated seconds represented by one tick', () => {
    expect(sampleAnimationTime(100, 101, 1) - sampleAnimationTime(100, 101, 0)).toBeCloseTo(0.1)
    expect(sampleAnimationTime(100, 101, 1, 4) - sampleAnimationTime(100, 101, 0, 4)).toBeCloseTo(0.25)
  })
})
