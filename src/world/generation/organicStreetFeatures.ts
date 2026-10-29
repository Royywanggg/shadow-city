import type { StreetFeature } from '../../city/model'
import type { WorldModelV2 } from '../model'
import { getTerrainHeight } from '../terrain/terrainV1'

/** Reuse the existing instanced street asset library on legal terrain-side sites. */
export function organicStreetFeatures(world: WorldModelV2): StreetFeature[] {
  if (!world.terrain || !world.buildingPlacements || !world.baseCity) return []
  const assets = new Map(world.baseCity.buildings.map((item) => [item.id, item]))
  const safe = (x: number, z: number) => {
    if (Math.abs(x) > 143 || Math.abs(z) > 143 ||
      x > 12 && x < 55 && z > -27 && z < 27) return false
    return world.buildingPlacements!.every((placed) => {
      const asset = assets.get(placed.buildingId)!
      return Math.abs(x - placed.x / 1000) > asset.width / 2 + 3.6 ||
        Math.abs(z - placed.z / 1000) > asset.depth / 2 + 3.6
    })
  }
  const result: StreetFeature[] = []
  for (const road of world.roadEdges) {
    if (!road.path || road.structure === 'viaduct') continue
    const stride = road.hierarchy === 'arterial' ? 8 : 7
    for (let index = 5; index < road.path.length - 5; index += stride) {
      const point = road.path[index]
      const before = road.path[index - 1]; const after = road.path[index + 1]
      const dx = after.x - before.x; const dz = after.z - before.z
      const length = Math.hypot(dx, dz) || 1
      const side = (index / stride) % 2 < 1 ? -1 : 1
      const offset = road.widthMm / 2000 + 3.7
      const x = point.x / 1000 - dz / length * side * offset
      const z = point.z / 1000 + dx / length * side * offset
      if (!safe(x, z)) continue
      const kind = road.hierarchy === 'arterial' && index % (stride * 2) === 5 ?
        'lamp' : 'tree'
      result.push({ id: `organic:street:${road.id}:${index}`, kind, x, z,
        surfaceY: getTerrainHeight(world.terrain, x * 1000, z * 1000) / 1000 + 0.15,
        rotationY: Math.atan2(dx, dz), scale: kind === 'tree' ? 0.75 : 1 })
    }
  }
  for (const [index, x, z, kind] of [
    [0, -66, 62, 'tree'], [1, -62, 78, 'tree'], [2, -52, 61, 'tree'],
    [3, -47, 76, 'tree'], [4, -58, 69, 'bench'], [5, -49, 67, 'planter'],
  ] as const) if (safe(x, z)) result.push({ id: `organic:park:${index}`, kind, x, z,
    surfaceY: getTerrainHeight(world.terrain, x * 1000, z * 1000) / 1000 + 0.15,
    rotationY: 0, scale: 0.85 })
  return result
}
