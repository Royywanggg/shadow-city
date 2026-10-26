import type { CityModel } from '../city/model'

export type WorldPointMm = Readonly<{ x: number; y: number; z: number }>
export type GroundPointMm = Readonly<{ x: number; z: number }>
export type DistrictKindV2 = 'residential' | 'commercial' | 'mixedUse' | 'transport' | 'public'
export type PlaceKind = 'home' | 'workplace' | 'retail' | 'cafe' | 'mall' | 'plaza' | 'park' | 'transit' |
  'walkway' | 'corridor'
export type ActivityKind = 'home' | 'work' | 'shop' | 'eat' | 'leisure' | 'transfer'

export interface WorldConfigV2 {
  readonly version: 2
  readonly seed: string
  readonly extentMm: number
  readonly generatorVersion: 'district-world-v1' | 'heritage-overlay-v1' | 'heritage-extension-v2' | 'heritage-extension-v3' | 'heritage-extension-v4' | 'heritage-extension-v5' | 'heritage-extension-v6'
}

export interface DistrictV2 {
  readonly id: string
  readonly kind: DistrictKindV2
  readonly center: GroundPointMm
  readonly widthMm: number
  readonly depthMm: number
}

export interface WalkableSurface {
  readonly id: string
  readonly levelId: string
  readonly placeId: string | null
  readonly interactionZoneId: string
  readonly elevationMm: number
  readonly polygonXZ: readonly GroundPointMm[]
  readonly blockedPolygonsXZ: readonly (readonly GroundPointMm[])[]
  readonly clearanceMm: number
  readonly indoor: boolean
}

export interface NavNodeV2 {
  readonly id: string
  readonly position: WorldPointMm
  readonly surfaceId: string
}

export interface NavEdgeV2 {
  readonly id: string
  readonly fromNodeId: string
  readonly toNodeId: string
  readonly path: readonly WorldPointMm[]
  readonly surfaceId: string | null
  readonly connectorId: string | null
  readonly kind: 'walk' | 'crossing' | 'portal' | 'stair' | 'ramp' | 'escalator'
  readonly lengthMm: number
  readonly accessId: string | null
  readonly accessIds?: readonly string[]
  readonly direction: 'both' | 'forward'
}

export interface VerticalConnector {
  readonly id: string
  readonly kind: 'stair' | 'ramp' | 'escalator'
  readonly lowerSurfaceId: string
  readonly upperSurfaceId: string
  readonly edgeIds: readonly string[]
  readonly capacity: number
}

export interface SemanticPlace {
  readonly id: string
  readonly name: string
  readonly kind: PlaceKind
  readonly districtId: string
  readonly surfaceIds: readonly string[]
  readonly accessNodeIds: readonly string[]
  readonly activityTags: readonly ActivityKind[]
  readonly openingHours: readonly Readonly<{ openMinute: number; closeMinute: number }>[]
  readonly capacity: number
  readonly attractiveness: number
  readonly typicalVisitTicks: readonly [number, number]
  readonly slotNodeIds: readonly string[]
}

export interface PlaceResource {
  readonly id: string
  readonly placeId: string
  readonly surfaceId: string
  readonly position: WorldPointMm
  readonly kind: 'retailStock' | 'transitLocker' | 'streetFixture'
}

export interface WorldBox {
  readonly id: string
  readonly center: WorldPointMm
  readonly size: WorldPointMm
  readonly kind: 'building' | 'floor' | 'roof' | 'rail' | 'step' | 'road' | 'path' |
    'accent' | 'trim' | 'darkWindow' | 'glass' | 'furniture'
  readonly districtId?: string
  readonly placeId?: string
  readonly surfaceId?: string
  readonly levelId?: string
  readonly roofFor?: string
  readonly color: string
  readonly rotationY?: number
  readonly rotationX?: number
  readonly rotationZ?: number
}

/** Navigation IDs and dimensions used to render an overpass from its static world data. */
export interface OverpassInstance {
  readonly id: string
  readonly widthMm: number
  readonly deckEdgeIds: readonly string[]
  readonly stairEdgeIds: readonly [string, string]
  readonly landingSurfaceIds: readonly [string, string]
  readonly surfaceId: string
  readonly terminalPoint: WorldPointMm | null
  readonly stairSide: -1 | 1
}

export interface WorldModelV2 {
  readonly version: 2
  readonly config: WorldConfigV2
  readonly baseCity?: CityModel
  readonly bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }>
  readonly districts: readonly DistrictV2[]
  readonly roadNodes: readonly Readonly<{ id: string; position: GroundPointMm }>[]
  readonly roadEdges: readonly Readonly<{ id: string; from: string; to: string; widthMm: number }>[]
  readonly surfaces: readonly WalkableSurface[]
  readonly navNodes: readonly NavNodeV2[]
  readonly navEdges: readonly NavEdgeV2[]
  readonly connectors: readonly VerticalConnector[]
  readonly places: readonly SemanticPlace[]
  readonly resources: readonly PlaceResource[]
  readonly boxes: readonly WorldBox[]
  readonly overpasses?: readonly OverpassInstance[]
}

export const DEFAULT_WORLD_CONFIG_V2: WorldConfigV2 = Object.freeze({
  version: 2,
  seed: 'shadow-city-multilevel-01',
  extentMm: 320_000,
  generatorVersion: 'district-world-v1',
})

export function metres(point: WorldPointMm): readonly [number, number, number] {
  return [point.x / 1000, point.y / 1000, point.z / 1000]
}
