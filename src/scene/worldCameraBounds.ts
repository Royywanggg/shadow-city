import type { CameraTarget } from '../camera/viewState'
import type { WorldModelV2 } from '../world/model'

type WorldBounds = WorldModelV2['bounds']

export function worldBoundsMetres(bounds: WorldBounds) {
  return {
    minX: bounds.minX / 1000,
    maxX: bounds.maxX / 1000,
    minZ: bounds.minZ / 1000,
    maxZ: bounds.maxZ / 1000,
  }
}

export function clampWorldCameraTarget(target: CameraTarget, bounds: WorldBounds,
  minY = 0): CameraTarget {
  const { minX, maxX, minZ, maxZ } = worldBoundsMetres(bounds)
  return [
    Math.max(minX - 10, Math.min(maxX + 10, target[0])),
    Math.max(minY, Math.min(42, target[1])),
    Math.max(minZ - 10, Math.min(maxZ + 10, target[2])),
  ]
}

export function worldHomeTarget(bounds: WorldBounds): CameraTarget {
  const { minX, maxX, minZ, maxZ } = worldBoundsMetres(bounds)
  return [(minX + maxX) / 2, 0, (minZ + maxZ) / 2]
}
