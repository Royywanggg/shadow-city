import { describe, expect, it } from 'vitest'
import { clampWorldCameraTarget, worldHomeTarget } from './worldCameraBounds'

describe('rectangular world camera bounds', () => {
  const bounds = { minX: -150_000, maxX: 150_000,
    minZ: -190_000, maxZ: 150_000, maxY: 120_000 }

  it('centres the dev home view over the whole north extension', () => {
    expect(worldHomeTarget(bounds)).toEqual([0, 0, -20])
  })

  it('can follow a northern citizen while preserving independent X/Z limits', () => {
    expect(clampWorldCameraTarget([-180, 12, -230], bounds)).toEqual([-160, 12, -200])
    expect(clampWorldCameraTarget([180, -8, 180], bounds, -3)).toEqual([160, -3, 160])
  })
})
