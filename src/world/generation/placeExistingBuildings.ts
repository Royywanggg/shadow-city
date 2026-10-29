import type { Building, CityModel, StreetFeature } from '../../city/model'
import { hashSeed } from '../../simulation/rng'
import type { BuildingPlacementV1, GroundPointMm, TerrainFieldV1,
  WorldPointMm } from '../model'
import { getTerrainHeight } from '../terrain/terrainV1'

export interface BuildingSiteV1 {
  readonly id: string
  readonly x: number
  readonly z: number
  readonly width: number
  readonly depth: number
  readonly height: number
  readonly kind: 'home' | 'workplace' | 'retail' | 'cafe' | 'mall'
}

function compatible(site: BuildingSiteV1, building: Building): boolean {
  if (site.kind === 'home') return building.kind === 'residential' ||
    building.kind === 'apartment'
  if (site.kind === 'workplace') return building.kind === 'office' ||
    building.kind === 'industrial' || building.kind === 'civic' ||
    building.kind === 'tower' || building.kind === 'landmark'
  if (site.kind === 'cafe') return (building.kind === 'commercial' ||
    building.kind === 'corner') && hashSeed(building.id) % 4 === 0
  return (building.kind === 'commercial' || building.kind === 'corner') &&
    hashSeed(building.id) % 4 !== 0
}

function roadOverlapsBuilding(path: readonly WorldPointMm[], widthMm: number,
  x: number, z: number, building: Building): boolean {
  const hx = building.width * 500 + widthMm / 2 + 2_500
  const hz = building.depth * 500 + widthMm / 2 + 2_500
  const obstacle = { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz }
  return path.slice(1).some((point, index) => segmentHitsBox(path[index], point,
    obstacle))
}

/** Resolve whole-building transforms; no source mass, window, roof or material is edited. */
export function placeExistingBuildings(source: CityModel, sites: readonly BuildingSiteV1[],
  terrain: TerrainFieldV1,
  roads: readonly Readonly<{ widthMm: number; path?: readonly WorldPointMm[] }>[],
  protectedAreas: readonly Readonly<{ minX: number; maxX: number;
    minZ: number; maxZ: number }>[] = []):
  readonly BuildingPlacementV1[] {
  const used = new Set<string>()
  const placements: BuildingPlacementV1[] = []
  for (const site of sites) {
    const candidates = source.buildings.filter((building) => !used.has(building.id) &&
      compatible(site, building) && building.width < 24 && building.depth < 23)
      .sort((a, b) => {
        const score = (item: Building) => Math.abs(item.height - site.height) +
          2 * Math.max(0, item.width - site.width) +
          2 * Math.max(0, item.depth - site.depth)
        return score(a) - score(b) || a.id.localeCompare(b.id)
      })
    const building = candidates[0]
    if (!building && site.id.startsWith('infill-')) continue
    if (!building) throw new Error(`No existing building asset fits ${site.id}`)
    const offsets = [0, -3, 3, -6, 6, -9, 9, -12, 12, -16, 16,
      -20, 20, -24, 24, -28, 28, -32, 32]
    const positions = offsets.flatMap((dx) => offsets.map((dz) =>
      ({ x: site.x + dx, z: site.z + dz,
        displacement: Math.hypot(dx, dz) })))
      .sort((a, b) => a.displacement - b.displacement || a.x - b.x || a.z - b.z)
    const selected = positions.find(({ x, z }) => {
      if (Math.abs(x) + building.width / 2 > 145 ||
        Math.abs(z) + building.depth / 2 > 145) return false
      if (protectedAreas.some((area) => x * 1000 + building.width * 500 > area.minX &&
        x * 1000 - building.width * 500 < area.maxX &&
        z * 1000 + building.depth * 500 > area.minZ &&
        z * 1000 - building.depth * 500 < area.maxZ)) return false
      const entranceX = x * 1000 + Math.round((building.entrance.x - building.x) * 1000)
      const entranceZ = z * 1000 + Math.round((building.entrance.z - building.z + 2.3) * 1000)
      if (placements.some((placed) => {
        const other = source.buildings.find((item) => item.id === placed.buildingId)!
        const oldEntranceX = placed.x + Math.round((other.entrance.x - other.x) * 1000)
        const oldEntranceZ = placed.z + Math.round((other.entrance.z - other.z + 2.3) * 1000)
        return Math.abs(x * 1000 - placed.x) < (building.width + other.width) * 500 + 1_000 &&
          Math.abs(z * 1000 - placed.z) < (building.depth + other.depth) * 500 + 1_000 ||
          Math.abs(entranceX - placed.x) < other.width * 500 + 1_000 &&
          Math.abs(entranceZ - placed.z) < other.depth * 500 + 1_000 ||
          Math.abs(oldEntranceX - x * 1000) < building.width * 500 + 1_000 &&
          Math.abs(oldEntranceZ - z * 1000) < building.depth * 500 + 1_000
      })) return false
      return roads.every((road) => !road.path || !roadOverlapsBuilding(road.path,
        road.widthMm, x * 1000, z * 1000, building))
    })
    if (!selected && site.id.startsWith('infill-')) continue
    if (!selected) throw new Error(`Cannot place existing building ${building.id} at ${site.id}`)
    used.add(building.id)
    const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => getTerrainHeight(terrain,
      Math.round((selected.x + sx * building.width / 2) * 1000),
      Math.round((selected.z + sz * building.depth / 2) * 1000))))
    const top = Math.ceil((Math.max(...corners) + 250) / 250) * 250
    placements.push({ siteId: site.id, buildingId: building.id,
      x: Math.round(selected.x * 1000),
      z: Math.round(selected.z * 1000), elevationMm: top,
      foundationBottomMm: Math.min(...corners) - 450 })
  }
  return placements
}

export function renderPlacedBuildings(source: CityModel,
  placements: readonly BuildingPlacementV1[],
  streetFeatures: readonly StreetFeature[] = []): CityModel {
  const assets = new Map(source.buildings.map((building) => [building.id, building]))
  const buildings = placements.map((placement) => {
    const asset = assets.get(placement.buildingId)
    if (!asset) throw new Error(`Missing existing building ${placement.buildingId}`)
    const dx = placement.x / 1000 - asset.x
    const dz = placement.z / 1000 - asset.z
    return { ...asset, x: asset.x + dx, z: asset.z + dz,
      entrance: { ...asset.entrance, x: asset.entrance.x + dx,
        z: asset.entrance.z + dz } }
  })
  return { ...source, seed: 'organic-city-v1', buildings,
    roads: { nodes: [], edges: [] }, streetFeatures: [...streetFeatures],
    plaza: { x: -32, z: -4, width: 24, depth: 24 } }
}

export interface BuildingObstacleV1 {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

export function placedBuildingObstacles(source: CityModel,
  placements: readonly BuildingPlacementV1[]): readonly BuildingObstacleV1[] {
  const assets = new Map(source.buildings.map((item) => [item.id, item]))
  return placements.map((placement) => {
    const asset = assets.get(placement.buildingId)!
    return { minX: Math.round(placement.x - asset.width * 500),
      maxX: Math.round(placement.x + asset.width * 500),
      minZ: Math.round(placement.z - asset.depth * 500),
      maxZ: Math.round(placement.z + asset.depth * 500) }
  })
}

function segmentHitsBox(a: GroundPointMm, b: GroundPointMm,
  box: BuildingObstacleV1): boolean {
  let minimum = 0; let maximum = 1
  for (const [start, delta, low, high] of [
    [a.x, b.x - a.x, box.minX, box.maxX],
    [a.z, b.z - a.z, box.minZ, box.maxZ],
  ]) {
    if (Math.abs(delta) < 1) {
      if (start < low || start > high) return false
      continue
    }
    const first = (low - start) / delta; const second = (high - start) / delta
    minimum = Math.max(minimum, Math.min(first, second))
    maximum = Math.min(maximum, Math.max(first, second))
    if (minimum > maximum) return false
  }
  return true
}

/** Route ground access around the preserved footprints; path samples remain authoritative. */
export function planBuildingAccess(start: GroundPointMm, end: GroundPointMm,
  obstacles: readonly BuildingObstacleV1[],
  terrain: TerrainFieldV1): WorldPointMm[] {
  const margin = 850
  const relevant = obstacles.filter((box) => box.maxX >= Math.min(start.x, end.x) - 25_000 &&
    box.minX <= Math.max(start.x, end.x) + 25_000 &&
    box.maxZ >= Math.min(start.z, end.z) - 25_000 &&
    box.minZ <= Math.max(start.z, end.z) + 25_000)
    .map((box) => ({ minX: box.minX - margin, maxX: box.maxX + margin,
      minZ: box.minZ - margin, maxZ: box.maxZ + margin }))
  const points: GroundPointMm[] = [start, end,
    ...relevant.flatMap((box) => [
      { x: box.minX - 100, z: box.minZ - 100 },
      { x: box.maxX + 100, z: box.minZ - 100 },
      { x: box.maxX + 100, z: box.maxZ + 100 },
      { x: box.minX - 100, z: box.maxZ + 100 },
    ])]
  const safe = (a: GroundPointMm, b: GroundPointMm) => relevant.every((box) =>
    !segmentHitsBox(a, b, box))
  const costs = Array(points.length).fill(Infinity) as number[]
  const previous = Array(points.length).fill(-1) as number[]
  const visited = new Set<number>()
  costs[0] = 0
  while (visited.size < points.length) {
    let current = -1
    for (let index = 0; index < points.length; index += 1) {
      if (visited.has(index)) continue
      if (current === -1 || costs[index] < costs[current]) current = index
    }
    if (current === -1 || !Number.isFinite(costs[current]) || current === 1) break
    visited.add(current)
    for (let next = 1; next < points.length; next += 1) {
      if (visited.has(next) || !safe(points[current], points[next])) continue
      const cost = costs[current] + Math.hypot(points[next].x - points[current].x,
        points[next].z - points[current].z)
      if (cost < costs[next]) { costs[next] = cost; previous[next] = current }
    }
  }
  if (!Number.isFinite(costs[1])) throw new Error(`Building entrance has no safe road access: ` +
    `start=${start.x},${start.z} end=${end.x},${end.z} obstacles=${relevant.length} ` +
    `startInside=${relevant.filter((box) => start.x > box.minX && start.x < box.maxX &&
      start.z > box.minZ && start.z < box.maxZ).length} ` +
    `endInside=${relevant.filter((box) => end.x > box.minX && end.x < box.maxX &&
      end.z > box.minZ && end.z < box.maxZ).length}`)
  const corners: GroundPointMm[] = []
  for (let index = 1; index !== -1; index = previous[index]) corners.unshift(points[index])
  const path: WorldPointMm[] = []
  for (let segment = 1; segment < corners.length; segment += 1) {
    const a = corners[segment - 1]; const b = corners[segment]
    const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2_000))
    for (let step = segment === 1 ? 0 : 1; step <= count; step += 1) {
      const x = Math.round(a.x + (b.x - a.x) * step / count)
      const z = Math.round(a.z + (b.z - a.z) * step / count)
      path.push({ x, y: getTerrainHeight(terrain, x, z) + 250, z })
    }
  }
  return path
}
