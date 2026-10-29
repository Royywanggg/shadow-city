import { hashSeed } from '../../simulation/rng'
import { HERO_SEED } from '../../city/generation/generateCity'
import type { ActivityKind, GroundPointMm, NavEdgeV2, SemanticPlace, UrbanRegionV1,
  WalkableSurface, WorldBox, WorldConfigV2, WorldModelV2, WorldPointMm } from '../model'
import { getTerrainHeight, generateTerrainV1, gradeTerrainPlateau } from '../terrain/terrainV1'
import { placeExistingBuildings, placedBuildingObstacles, planBuildingAccess,
  type BuildingSiteV1 } from './placeExistingBuildings'
import { planOrganicRoad } from './planOrganicRoad'
import { generateIntegratedWorld } from './generateIntegratedWorld'
import { attachGalleriaOverlay } from './attachGalleriaOverlay'
import { WorldBuilder } from './WorldBuilder'

const mm = (value: number) => Math.round(value * 1000)
const xz = (x: number, z: number): GroundPointMm => ({ x: mm(x), z: mm(z) })
const rect = (x: number, z: number, width: number, depth: number): GroundPointMm[] => [
  xz(x - width / 2, z - depth / 2), xz(x + width / 2, z - depth / 2),
  xz(x + width / 2, z + depth / 2), xz(x - width / 2, z + depth / 2),
]
const unit = (seed: string) => hashSeed(seed) / 0x1_0000_0000

export const ORGANIC_WORLD_CONFIG_V2: WorldConfigV2 = Object.freeze({
  version: 2, seed: 'shadow-city-organic-01', extentMm: 300_000,
  generatorVersion: 'organic-city-v1',
})

function surface(id: string, levelId: string, placeId: string | null,
  polygonXZ: readonly GroundPointMm[], elevationMm: number,
  indoor = false, terrain = false): WalkableSurface {
  return { id, levelId, placeId, interactionZoneId: id, polygonXZ, elevationMm,
    elevationMode: terrain ? 'terrain' : 'absolute', blockedPolygonsXZ: [],
    clearanceMm: indoor ? 3_800 : 20_000, indoor }
}

function box(id: string, kind: WorldBox['kind'], x: number, y: number, z: number,
  width: number, height: number, depth: number, color: string,
  extras: Partial<WorldBox> = {}): WorldBox {
  return { id, kind, center: { x: mm(x), y: mm(y), z: mm(z) },
    size: { x: mm(width), y: mm(height), z: mm(depth) }, color, ...extras }
}

function edge(builder: WorldBuilder, id: string, fromNodeId: string, toNodeId: string,
  kind: NavEdgeV2['kind'], surfaceId: string | null,
  path?: readonly WorldPointMm[], connectorId: string | null = null): void {
  builder.edge({ id, fromNodeId, toNodeId, kind, surfaceId, connectorId,
    accessId: null, direction: 'both', path })
}

const ROAD_POINTS: readonly Readonly<{ id: string; x: number; z: number }>[] = [
  { id: 'west', x: -105, z: -32 }, { id: 'northwest', x: -82, z: -88 },
  { id: 'north', x: -20, z: -105 }, { id: 'northeast', x: 80, z: -90 },
  { id: 'east', x: 112, z: -25 }, { id: 'southeast', x: 78, z: 80 },
  { id: 'south', x: -20, z: 108 }, { id: 'southwest', x: -100, z: 68 },
  { id: 'civic', x: -35, z: -22 }, { id: 'market', x: 10, z: -45 },
  { id: 'business', x: 62, z: -20 }, { id: 'galleria', x: 75, z: 35 },
  { id: 'park', x: -25, z: 42 },
]

type Road = Readonly<{ from: string; to: string; hierarchy: 'arterial' | 'collector' | 'local' }>
const ROADS: readonly Road[] = [
  ...Array.from({ length: 8 }, (_, i): Road => ({ from: ROAD_POINTS[i].id,
    to: ROAD_POINTS[(i + 1) % 8].id, hierarchy: 'arterial' })),
  ...(['civic', 'market', 'business', 'galleria', 'park'] as const).map((from, i, all): Road =>
    ({ from, to: all[(i + 1) % all.length], hierarchy: 'collector' })),
  { from: 'west', to: 'civic', hierarchy: 'local' },
  { from: 'northwest', to: 'civic', hierarchy: 'local' },
  { from: 'north', to: 'market', hierarchy: 'local' },
  { from: 'northeast', to: 'business', hierarchy: 'local' },
  { from: 'east', to: 'business', hierarchy: 'local' },
  { from: 'southeast', to: 'galleria', hierarchy: 'local' },
  { from: 'south', to: 'park', hierarchy: 'local' },
  { from: 'southwest', to: 'park', hierarchy: 'local' },
]

function curvedRoad(a: GroundPointMm, b: GroundPointMm, seed: string,
  height: (x: number, z: number) => number, elevation: number): WorldPointMm[] {
  const dx = b.x - a.x; const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  const amplitude = Math.min(7_000, length * 0.12) * (unit(seed) * 1.6 - 0.8)
  const sBend = unit(`${seed}:s`) > 0.64
  const segments = Math.max(12, Math.ceil(length / 4_000))
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments
    const lateral = amplitude * (sBend ? Math.sin(2 * Math.PI * t) : Math.sin(Math.PI * t))
    const x = Math.round(a.x + dx * t - dz / length * lateral)
    const z = Math.round(a.z + dz * t + dx / length * lateral)
    return { x, y: height(x, z) + elevation, z }
  })
}

function regionStrength(region: UrbanRegionV1, point: GroundPointMm): number {
  const distance = Math.hypot(point.x - region.center.x, point.z - region.center.z)
  return region.strength * Math.exp(-0.5 * (distance / region.radiusMm) ** 2)
}

export function organicRegionWeights(regions: readonly UrbanRegionV1[], point: GroundPointMm):
  Readonly<Record<UrbanRegionV1['kind'], number>> {
  const result = { residential: 0.15, commercial: 0.12, mixedUse: 0.2, park: 0.05 }
  for (const region of regions) result[region.kind] += regionStrength(region, point)
  const total = Object.values(result).reduce((sum, value) => sum + value, 0)
  return { residential: result.residential / total, commercial: result.commercial / total,
    mixedUse: result.mixedUse / total, park: result.park / total }
}

type Site = BuildingSiteV1 & Readonly<{ road: string }> | Readonly<{
  id: string; x: number; z: number; road: string; kind: 'park'; width: number;
  depth: number; height: number }>
const SITES: readonly Site[] = [
  { id: 'hill-west', x: -122, z: -55, road: 'west', kind: 'home', width: 14, depth: 12, height: 11 },
  { id: 'hill-north', x: -99, z: -103, road: 'northwest', kind: 'home', width: 14, depth: 12, height: 12 },
  { id: 'north-home', x: -20, z: -124, road: 'north', kind: 'home', width: 15, depth: 12, height: 13 },
  { id: 'northeast-home', x: 94, z: -108, road: 'northeast', kind: 'home', width: 15, depth: 13, height: 15 },
  { id: 'east-home', x: 130, z: -32, road: 'east', kind: 'home', width: 15, depth: 12, height: 15 },
  { id: 'southeast-home', x: 95, z: 99, road: 'southeast', kind: 'home', width: 15, depth: 12, height: 13 },
  { id: 'south-home', x: -18, z: 128, road: 'south', kind: 'home', width: 16, depth: 12, height: 11 },
  { id: 'southwest-home', x: -117, z: 82, road: 'southwest', kind: 'home', width: 14, depth: 12, height: 10 },
  { id: 'terrace-one', x: -68, z: -43, road: 'civic', kind: 'home', width: 13, depth: 12, height: 15 },
  { id: 'terrace-two', x: -70, z: 16, road: 'park', kind: 'home', width: 13, depth: 11, height: 10 },
  { id: 'courtyard-one', x: -11, z: 70, road: 'park', kind: 'home', width: 15, depth: 12, height: 13 },
  { id: 'courtyard-two', x: 80, z: 25, road: 'business', kind: 'home', width: 14, depth: 12, height: 16 },
  { id: 'civic-office', x: -25, z: -57, road: 'civic', kind: 'workplace', width: 16, depth: 13, height: 20 },
  { id: 'market-cafe', x: -18, z: -66, road: 'market', kind: 'cafe', width: 13, depth: 12, height: 9 },
  { id: 'market-retail', x: 30, z: -67, road: 'market', kind: 'retail', width: 13, depth: 12, height: 12 },
  { id: 'business-office', x: 91, z: -18, road: 'business', kind: 'workplace', width: 16, depth: 13, height: 29 },
  { id: 'business-retail', x: 120, z: 4, road: 'business', kind: 'retail', width: 13, depth: 12, height: 10 },
  { id: 'south-cafe', x: 31, z: 73, road: 'galleria', kind: 'cafe', width: 14, depth: 12, height: 9 },
  { id: 'hill-park', x: -55, z: 70, road: 'park', kind: 'park', width: 30, depth: 25, height: 0 },
  { id: 'north-terrace', x: -62, z: -119, road: 'north', kind: 'home', width: 14, depth: 11, height: 10 },
  { id: 'north-mixed', x: 35, z: -117, road: 'northeast', kind: 'home', width: 15, depth: 13, height: 17 },
  { id: 'east-court', x: 130, z: 24, road: 'east', kind: 'home', width: 15, depth: 13, height: 13 },
  { id: 'south-mixed', x: 51, z: 112, road: 'southeast', kind: 'home', width: 16, depth: 12, height: 17 },
  { id: 'south-terrace', x: -53, z: 128, road: 'south', kind: 'home', width: 15, depth: 12, height: 11 },
  { id: 'west-court', x: -126, z: 17, road: 'west', kind: 'home', width: 14, depth: 12, height: 12 },
  { id: 'market-arcade', x: 12, z: -14, road: 'market', kind: 'retail', width: 15, depth: 13, height: 14 },
  { id: 'east-office', x: 48, z: -78, road: 'business', kind: 'workplace', width: 16, depth: 14, height: 24 },
]

const INFILL: readonly Readonly<{ edge: number; side: -1 | 1;
  kind: BuildingSiteV1['kind']; fraction: number }>[] = [
  { edge: 0, side: 1, kind: 'home', fraction: 0.3 },
  { edge: 0, side: -1, kind: 'home', fraction: 0.55 },
  { edge: 0, side: 1, kind: 'home', fraction: 0.78 },
  { edge: 1, side: -1, kind: 'home', fraction: 0.42 },
  { edge: 1, side: 1, kind: 'home', fraction: 0.72 },
  { edge: 2, side: -1, kind: 'home', fraction: 0.28 },
  { edge: 2, side: 1, kind: 'retail', fraction: 0.55 },
  { edge: 2, side: -1, kind: 'retail', fraction: 0.8 },
  { edge: 3, side: 1, kind: 'workplace', fraction: 0.22 },
  { edge: 3, side: -1, kind: 'workplace', fraction: 0.52 },
  { edge: 4, side: -1, kind: 'retail', fraction: 0.48 },
  { edge: 5, side: -1, kind: 'home', fraction: 0.25 },
  { edge: 5, side: 1, kind: 'retail', fraction: 0.55 },
  { edge: 6, side: 1, kind: 'home', fraction: 0.3 },
  { edge: 6, side: -1, kind: 'home', fraction: 0.7 },
  { edge: 7, side: -1, kind: 'workplace', fraction: 0.5 },
  { edge: 7, side: 1, kind: 'home', fraction: 0.72 },
  { edge: 8, side: 1, kind: 'retail', fraction: 0.5 },
  { edge: 9, side: 1, kind: 'retail', fraction: 0.25 },
  { edge: 9, side: -1, kind: 'workplace', fraction: 0.48 },
  { edge: 10, side: -1, kind: 'retail', fraction: 0.7 },
  { edge: 11, side: -1, kind: 'workplace', fraction: 0.45 },
  { edge: 11, side: 1, kind: 'home', fraction: 0.72 },
  { edge: 12, side: 1, kind: 'retail', fraction: 0.52 },
  { edge: 13, side: -1, kind: 'home', fraction: 0.7 },
  { edge: 14, side: -1, kind: 'workplace', fraction: 0.48 },
  { edge: 15, side: 1, kind: 'retail', fraction: 0.35 },
  { edge: 16, side: 1, kind: 'retail', fraction: 0.52 },
  { edge: 17, side: -1, kind: 'home', fraction: 0.72 },
  { edge: 18, side: -1, kind: 'workplace', fraction: 0.5 },
  { edge: 19, side: 1, kind: 'home', fraction: 0.3 },
  { edge: 20, side: 1, kind: 'retail', fraction: 0.5 },
]

function infillSites(): Site[] {
  const points = new Map(ROAD_POINTS.map((point) => [point.id, point]))
  return INFILL.map((item, index) => {
    const road = ROADS[item.edge]
    const a = points.get(road.from)!; const b = points.get(road.to)!
    const dx = b.x - a.x; const dz = b.z - a.z
    const length = Math.hypot(dx, dz)
    const setback = 20 + (item.kind === 'workplace' ? 2 : 0)
    return { id: `infill-${String(index).padStart(2, '0')}`,
      x: Math.round(a.x + dx * item.fraction - dz / length * item.side * setback),
      z: Math.round(a.z + dz * item.fraction + dx / length * item.side * setback),
      road: item.fraction <= 0.5 ? road.from : road.to,
      kind: item.kind, width: 20, depth: 18,
      height: item.kind === 'workplace' ? 23 : item.kind === 'home' ? 14 : 11 }
  })
}

function curvedStreetInfill(roads: readonly WorldModelV2['roadEdges'][number][]): Site[] {
  return roads.flatMap((road, roadIndex) => {
    if (road.structure === 'viaduct' || !road.path) return []
    const fractions = road.hierarchy === 'arterial' ? [0.24, 0.5, 0.76] :
      road.hierarchy === 'collector' ? [0.32, 0.68] : [0.5]
    return fractions.flatMap((fraction, fractionIndex) => [-1, 1].map((side) => {
      const index = Math.max(1, Math.min(road.path!.length - 2,
        Math.round((road.path!.length - 1) * fraction)))
      const point = road.path![index]
      const before = road.path![index - 1]; const after = road.path![index + 1]
      const dx = after.x - before.x; const dz = after.z - before.z
      const length = Math.hypot(dx, dz) || 1
      const setback = road.widthMm / 2000 + 12.5
      const kind: BuildingSiteV1['kind'] = road.hierarchy === 'arterial' &&
        roadIndex >= 2 && roadIndex <= 4 ? 'retail' :
        road.hierarchy === 'collector' && fractionIndex === 0 ? 'workplace' : 'home'
      return { id: `infill-curve-${roadIndex}-${fractionIndex}-${side}`,
        x: Math.round(point.x / 1000 - dz / length * side * setback),
        z: Math.round(point.z / 1000 + dx / length * side * setback),
        road: fraction < 0.5 ? road.from : road.to,
        kind, width: 19, depth: 17,
        height: kind === 'workplace' ? 21 : kind === 'retail' ? 11 : 14 }
    }))
  })
}

function placeTags(kind: SemanticPlace['kind']): readonly ActivityKind[] {
  if (kind === 'home') return ['home']
  if (kind === 'workplace') return ['work']
  if (kind === 'cafe') return ['eat', 'leisure']
  if (kind === 'park') return ['leisure']
  return ['shop', 'leisure']
}

/** A separately versioned scenario; the heritage generator and its replay data are untouched. */
export function generateOrganicWorld(seed = ORGANIC_WORLD_CONFIG_V2.seed): WorldModelV2 {
  const config = { ...ORGANIC_WORLD_CONFIG_V2, seed }
  const pinnedWorld = generateIntegratedWorld(HERO_SEED)
  const terrain = gradeTerrainPlateau(generateTerrainV1(seed, config.extentMm),
    { minX: 16_000, maxX: 51_000, minZ: -23_000, maxZ: 23_000 }, 17_000)
  const height = (x: number, z: number) => getTerrainHeight(terrain, x, z)
  const builder = new WorldBuilder(terrain)
  builder.districts.push({ id: 'organic-main', kind: 'mixedUse', center: xz(0, 0),
    widthMm: config.extentMm, depthMm: config.extentMm })
  builder.surface(surface('organic:ground', 'L0', null, rect(0, 0, 300, 300), 250, false, true))
  const regions: UrbanRegionV1[] = [
    { id: 'hill-residential', kind: 'residential', center: xz(-88, -67), radiusMm: 73_000, strength: 0.85 },
    { id: 'river-residential', kind: 'residential', center: xz(-10, 100), radiusMm: 67_000, strength: 0.68 },
    { id: 'central-commerce', kind: 'commercial', center: xz(43, -12), radiusMm: 71_000, strength: 0.92 },
    { id: 'market-mix', kind: 'mixedUse', center: xz(3, -38), radiusMm: 74_000, strength: 0.8 },
    { id: 'west-green', kind: 'park', center: xz(-59, 65), radiusMm: 48_000, strength: 0.78 },
  ]
  const pointById = new Map(ROAD_POINTS.map((item) => [item.id, xz(item.x, item.z)]))
  for (const node of ROAD_POINTS) {
    const p = pointById.get(node.id)!
    builder.node(`road:${node.id}`, { ...p, y: height(p.x, p.z) + 250 }, 'organic:ground')
  }
  const roadEdges: WorldModelV2['roadEdges'][number][] = []
  ROADS.forEach((road, index) => {
    const a = pointById.get(road.from)!
    const b = pointById.get(road.to)!
    const id = `organic:road:${String(index).padStart(2, '0')}`
    const widthMm = road.hierarchy === 'arterial' ? 10_500 :
      road.hierarchy === 'collector' ? 8_000 : 6_000
    const obstacles = SITES.filter((site) => site.kind !== 'park').map((site) => ({
      x: mm(site.x), z: mm(site.z),
      halfWidthMm: mm(site.width * 0.42), halfDepthMm: mm(site.depth * 0.42),
    }))
    obstacles.push({ x: 40_000, z: 0, halfWidthMm: 8_000,
      halfDepthMm: 22_000 })
    let centerline = planOrganicRoad(a, b, `${seed}:${id}`, height, widthMm, obstacles,
      road.hierarchy)
    const viaduct = index === 4
    const deckStart = Math.round(centerline.length * 0.34)
    const deckEnd = Math.round(centerline.length * 0.66)
    const deckRoadY = Math.max(...centerline.slice(deckStart, deckEnd + 1)
      .map((point) => point.y)) + 2_600
    if (viaduct) centerline = centerline.map((point, pointIndex) => {
      const fraction = pointIndex <= deckStart ? pointIndex / deckStart :
        pointIndex >= deckEnd ? (centerline.length - 1 - pointIndex) /
          (centerline.length - 1 - deckEnd) : 1
      return { ...point, y: Math.round(point.y * (1 - fraction) + deckRoadY * fraction) }
    })
    const pedestrianPath = centerline.map((point, pointIndex) => {
      const before = centerline[Math.max(0, pointIndex - 1)]
      const after = centerline[Math.min(centerline.length - 1, pointIndex + 1)]
      const dx = after.x - before.x; const dz = after.z - before.z
      const length = Math.hypot(dx, dz) || 1
      const taper = Math.min(1, pointIndex / 3,
        (centerline.length - 1 - pointIndex) / 3)
      const setback = (widthMm / 2 + 1_100) * taper
      const x = Math.round(point.x - dz / length * setback)
      const z = Math.round(point.z + dx / length * setback)
      const lift = point.y - height(point.x, point.z) - 75
      return { x, y: lift > 200 ? point.y + 175 : height(x, z) + 250, z }
    })
    roadEdges.push({ id, from: road.from, to: road.to, widthMm,
      hierarchy: road.hierarchy, structure: viaduct ? 'viaduct' : undefined,
      path: centerline })
    if (!viaduct) edge(builder, `walk:${id}`, `road:${road.from}`, `road:${road.to}`,
      'walk', 'organic:ground', pedestrianPath)
    else {
      const bridgeId = 'organic:viaduct'
      const deckPath = pedestrianPath.slice(deckStart, deckEnd + 1)
        .map((point) => ({ ...point, y: deckRoadY + 175 }))
      pedestrianPath.splice(deckStart, deckEnd - deckStart + 1, ...deckPath)
      const minX = Math.min(...deckPath.map((point) => point.x)) - 12_000
      const maxX = Math.max(...deckPath.map((point) => point.x)) + 12_000
      const minZ = Math.min(...deckPath.map((point) => point.z)) - 12_000
      const maxZ = Math.max(...deckPath.map((point) => point.z)) + 12_000
      builder.surface(surface(bridgeId, 'L1', null, [
        { x: minX, z: minZ }, { x: maxX, z: minZ },
        { x: maxX, z: maxZ }, { x: minX, z: maxZ },
      ], deckRoadY + 175))
      builder.node(`${bridgeId}:start`, pedestrianPath[deckStart], bridgeId)
      builder.node(`${bridgeId}:end`, pedestrianPath[deckEnd], bridgeId)
      for (const [side, from, to, path] of [
        ['west', `road:${road.from}`, `${bridgeId}:start`,
          pedestrianPath.slice(0, deckStart + 1)],
        ['east', `${bridgeId}:end`, `road:${road.to}`,
          pedestrianPath.slice(deckEnd)],
      ] as const) {
        const connectorId = `${bridgeId}:${side}`
        builder.surface(surface(`connector:${connectorId}`, 'L0-L1', null,
          [{ x: minX, z: minZ }, { x: maxX, z: minZ },
            { x: maxX, z: maxZ }, { x: minX, z: maxZ }], deckRoadY + 175))
        edge(builder, `walk:${id}:${side}`, from, to, 'ramp', null, path, connectorId)
        builder.connectors.push({ id: connectorId, kind: 'ramp',
          lowerSurfaceId: 'organic:ground', upperSurfaceId: bridgeId,
          edgeIds: [`walk:${id}:${side}`], capacity: 30 })
      }
      edge(builder, `walk:${id}:deck`, `${bridgeId}:start`, `${bridgeId}:end`,
        'walk', bridgeId, deckPath)
    }
  })
  const ground = 'organic:ground'
  const sourceCity = pinnedWorld.baseCity!
  const allSites: readonly Site[] = [...SITES, ...infillSites(),
    ...curvedStreetInfill(roadEdges)]
  const buildingSites = allSites.filter((site): site is BuildingSiteV1 & { road: string } =>
    site.kind !== 'park')
  const placements = placeExistingBuildings(sourceCity, buildingSites, terrain, roadEdges,
    [{ minX: 16_000, maxX: 51_000, minZ: -23_000, maxZ: 23_000 },
      { minX: -71_000, maxX: -39_000, minZ: 56_000, maxZ: 84_000 }])
  const buildingObstacles = placedBuildingObstacles(sourceCity, placements)
  const galleriaFootprint = pinnedWorld.surfaces.find((item) =>
    item.id === 'galleria-l0')!.polygonXZ
  const galleriaObstacle = { minX: Math.min(...galleriaFootprint.map((point) => point.x)),
    maxX: Math.max(...galleriaFootprint.map((point) => point.x)),
    minZ: Math.min(...galleriaFootprint.map((point) => point.z)),
    maxZ: Math.max(...galleriaFootprint.map((point) => point.z)) }
  const assetById = new Map(sourceCity.buildings.map((building) => [building.id, building]))
  const placedBySite = new Map(placements.map((placement) =>
    [placement.siteId, placement] as const))
  for (const site of allSites) {
    const isPark = site.kind === 'park'
    const placement = placedBySite.get(site.id)
    if (!isPark && !placement) continue
    const asset = placement ? assetById.get(placement.buildingId) : undefined
    const siteId = isPark ? 'organic:hill-park' : `building:${asset?.id}`
    const cx = placement ? placement.x : mm(site.x)
    const cz = placement ? placement.z : mm(site.z)
    const width = asset?.width ?? site.width
    const depth = asset?.depth ?? site.depth
    const localY = height(cx, cz) + 250
    const floorY = placement ? placement.elevationMm + 250 : localY
    const surfaceId = isPark ? `${siteId}:surface` : `interior:${asset!.id}`
    const shiftX = asset && placement ? placement.x - mm(asset.x) : 0
    const shiftZ = asset && placement ? placement.z - mm(asset.z) : 0
    const originalSurface = asset ? pinnedWorld.surfaces.find((item) =>
      item.id === surfaceId) : undefined
    if (asset && !originalSurface) throw new Error(`Missing preserved interior ${surfaceId}`)
    builder.surface(originalSurface ? { ...originalSurface,
      polygonXZ: originalSurface.polygonXZ.map((point) =>
        ({ x: point.x + shiftX, z: point.z + shiftZ })),
      elevationMm: originalSurface.elevationMm + placement!.elevationMm } :
      surface(surfaceId, 'L0', siteId,
        rect(cx / 1000, cz / 1000, width * 0.78, depth * 0.78),
        250, false, true))
    const road = pointById.get(site.road)!
    const entryId = isPark ? `${siteId}:entry` : `${surfaceId}:entry`
    const outsideId = isPark ? `${siteId}:outside` : `ped-entrance-${asset!.id}`
    const originalEntry = asset ? pinnedWorld.navNodes.find((node) =>
      node.id === entryId) : undefined
    const originalOutside = asset ? pinnedWorld.navNodes.find((node) =>
      node.id === outsideId) : undefined
    if (asset && (!originalEntry || !originalOutside)) {
      throw new Error(`Missing preserved building entrance ${asset.id}`)
    }
    const door = originalEntry ? { x: originalEntry.position.x + shiftX,
      z: originalEntry.position.z + shiftZ } : { x: cx, z: cz }
    const outside = asset && placement ? {
      x: placement.x + mm(asset.entrance.x - asset.x),
      z: placement.z + mm(asset.entrance.z - asset.z + 2.3),
    } : { x: cx + mm(width / 2 + 1.5), z: cz }
    builder.node(outsideId, { ...outside,
      y: height(outside.x, outside.z) + 250 }, ground)
    builder.node(entryId, { ...door,
      y: isPark ? height(door.x, door.z) + 250 : floorY }, surfaceId)
    let groundPath: WorldPointMm[]
    try { groundPath = planBuildingAccess(road, outside, [...buildingObstacles,
      galleriaObstacle], terrain) }
    catch (error) { throw new Error(`No legal access path for ${siteId}: ${String(error)}`) }
    edge(builder, `${siteId}:access`, `road:${site.road}`, outsideId,
      'walk', ground, groundPath)
    edge(builder, isPark ? `${siteId}:portal` : `portal:${asset!.id}`,
      outsideId, entryId,
      'portal', null)
    const slotIds: string[] = []
    for (let index = 0; index < 16; index += 1) {
      const slot = isPark ? `${siteId}:slot:${index}` : `${surfaceId}:slot:${index}`
      const originalSlot = asset ? pinnedWorld.navNodes.find((node) =>
        node.id === slot) : undefined
      if (asset && !originalSlot) throw new Error(`Missing preserved activity slot ${slot}`)
      const x = originalSlot ? originalSlot.position.x + shiftX :
        cx + mm((index % 4 - 1.5) * width * 0.15)
      const z = originalSlot ? originalSlot.position.z + shiftZ :
        cz + mm((Math.floor(index / 4) - 1.5) * depth * 0.14)
      builder.node(slot, { x, y: isPark ? height(x, z) + 250 : floorY, z }, surfaceId)
      edge(builder, isPark ? `${slot}:walk` : `access:${slot}`,
        entryId, slot, 'walk', surfaceId,
        isPark ? curvedRoad(door, { x, z }, `${seed}:${slot}`, height, 250) : undefined)
      slotIds.push(slot)
    }
    const weights = organicRegionWeights(regions, { x: cx, z: cz })
    const housingCost = Math.round(100 * (0.22 + 0.48 * weights.commercial +
      0.28 * weights.residential + 0.22 * unit(`${seed}:${site.id}:housing`))) / 100
    const tags = placeTags(site.kind)
    const originalPlace = asset ? pinnedWorld.places.find((item) =>
      item.id === siteId) : undefined
    if (asset && !originalPlace) throw new Error(`Missing preserved place ${siteId}`)
    builder.places.push(originalPlace ? { ...originalPlace, buildingId: asset!.id,
      districtId: 'organic-main', surfaceIds: [surfaceId],
      accessNodeIds: [entryId], slotNodeIds: slotIds } :
    { id: siteId, name: isPark ? 'Hill Park' :
      `${asset!.kind} ${asset!.id.slice(-5)}`, kind: site.kind,
      buildingId: asset?.id, districtId: 'organic-main',
      surfaceIds: [surfaceId], accessNodeIds: [entryId],
      slotNodeIds: slotIds, activityTags: tags, capacity: 16,
      attractiveness: 0.55 + 0.35 * weights[site.kind === 'home' ? 'residential' :
        site.kind === 'park' ? 'park' : 'commercial'],
      housingCost: site.kind === 'home' ? housingCost : undefined,
      openingHours: [{ openMinute: site.kind === 'home' || site.kind === 'park' ? 0 : 420,
        closeMinute: site.kind === 'home' || site.kind === 'park' ? 1440 : 1320 }],
      typicalVisitTicks: site.kind === 'workplace' ? [90, 240] : [20, 85] })
    const originalResources = asset ? pinnedWorld.resources.filter((item) =>
      item.placeId === siteId) : []
    for (const resource of originalResources) builder.resources.push({ ...resource,
      surfaceId, position: { x: resource.position.x + shiftX,
        y: resource.position.y + placement!.elevationMm,
        z: resource.position.z + shiftZ } })
    if (!isPark && placement && asset) {
      const baseY = Math.min(...asset.masses.map((mass) => mass.baseY))
      const top = placement.elevationMm + mm(baseY)
      const bottom = placement.foundationBottomMm
      builder.boxes.push(box(`${siteId}:foundation`, 'building',
        cx / 1000, (top + bottom) / 2000, cz / 1000,
        asset.width + 0.4, (top - bottom) / 1000, asset.depth + 0.4,
        '#405460', { placeId: siteId }))
    }
  }
  attachGalleriaOverlay(builder, pinnedWorld)
  builder.surfaces[0] = { ...builder.surfaces[0], blockedPolygonsXZ: [
    ...buildingObstacles.map((item) => [
      { x: item.minX, z: item.minZ }, { x: item.maxX, z: item.minZ },
      { x: item.maxX, z: item.maxZ }, { x: item.minX, z: item.maxZ },
    ]), pinnedWorld.surfaces.find((item) => item.id === 'galleria-l0')!.polygonXZ,
  ] }
  edge(builder, 'organic:galleria:plaza-access', 'road:civic', 'plaza:east-mid',
    'walk', ground, planBuildingAccess(pointById.get('civic')!,
      { x: 22_070, z: 0 }, buildingObstacles, terrain))
  edge(builder, 'organic:galleria:west-stair-access', 'plaza:east-mid',
    'overpass:west:foot', 'walk', ground)
  edge(builder, 'organic:galleria:east-stair-access', 'mall:west-mid',
    'overpass:east:foot', 'walk', ground)
  builder.buildValidation()
  const maxY = Math.max(...builder.boxes.map((item) => item.center.y + item.size.y / 2),
    ...placements.map((item) => item.elevationMm +
      Math.round(assetById.get(item.buildingId)!.height * 1000) + 5_000))
  return { version: 2, config, terrain, regions,
    bounds: { minX: -150_000, maxX: 150_000, minZ: -150_000, maxZ: 150_000, maxY },
    baseCity: sourceCity, buildingPlacements: placements,
    districts: builder.districts, roadNodes: ROAD_POINTS.map(({ id, x, z }) =>
      ({ id, position: xz(x, z) })), roadEdges, surfaces: builder.surfaces,
    navNodes: builder.nodes, navEdges: builder.edges, connectors: builder.connectors,
    places: builder.places, resources: builder.resources, boxes: builder.boxes,
    overpasses: pinnedWorld.overpasses }
}
