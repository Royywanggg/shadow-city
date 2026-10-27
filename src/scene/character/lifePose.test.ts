import { describe, expect, it } from 'vitest'
import { lifePoseForTick } from './lifePose'

describe('state-driven life pose', () => {
  it('starts a collapse on the death Tick and seeks directly to its stable pose', () => {
    expect(lifePoseForTick(171, 1, 172).collapseProgress).toBe(0)
    expect(lifePoseForTick(172, 0, 172).collapseProgress).toBe(0)
    expect(lifePoseForTick(172, 0.5, 172).collapseProgress).toBe(0.5)
    expect(lifePoseForTick(172, 1, 172).collapseProgress).toBe(1)
    expect(lifePoseForTick(500, 1, 172).collapseProgress).toBe(1)
  })

  it('uses the improvement Tick for a standing transition with stable seek endpoints', () => {
    expect(lifePoseForTick(92, 0, undefined, 92).standProgress).toBe(0)
    expect(lifePoseForTick(92, 0.5, undefined, 92).standProgress).toBe(0.5)
    expect(lifePoseForTick(92, 1, undefined, 92).standProgress).toBe(1)
    expect(lifePoseForTick(93, 1, undefined, 92).standProgress).toBeUndefined()
  })
})
