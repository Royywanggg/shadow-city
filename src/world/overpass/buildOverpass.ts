import type { GroundPointMm, NavEdgeV2, OverpassInstance, WalkableSurface,
  WorldBox, WorldPointMm } from '../model'
import { WorldBuilder } from '../generation/WorldBuilder'

export interface OverpassSpec {
  readonly id: string
  readonly start: WorldPointMm
  readonly end: WorldPointMm
  readonly widthMm: number
  readonly groundElevationMm: number
  readonly stairRunMm: number
  readonly stairSide: -1 | 1
  readonly groundApproachNodeIds: readonly [string, string]
  readonly districtIds: readonly [string, string]
  readonly terminal?: Readonly<{
    point: WorldPointMm
    indoorNodeId: string
    accessIds: readonly string[]
  }>
}

const add = (p: WorldPointMm, dx: number, dz: number): WorldPointMm =>
  ({ x: Math.round(p.x + dx), y: p.y, z: Math.round(p.z + dz) })

function strip(a: WorldPointMm, b: WorldPointMm, halfWidth: number): readonly GroundPointMm[] {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  const nx = -dz / length * halfWidth
  const nz = dx / length * halfWidth
  return [add(a, nx, nz), add(b, nx, nz), add(b, -nx, -nz), add(a, -nx, -nz)]
    .map(({ x, z }) => ({ x, z }))
}

function surface(id: string, levelId: string, placeId: string,
  polygonXZ: readonly GroundPointMm[], elevationMm: number): WalkableSurface {
  return { id, levelId, placeId, interactionZoneId: id, elevationMm,
    polygonXZ, blockedPolygonsXZ: [], clearanceMm: 20_000, indoor: false }
}

function line(a: WorldPointMm, b: WorldPointMm, segments: number): WorldPointMm[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments
    return { x: Math.round(a.x + (b.x - a.x) * t),
      y: Math.round(a.y + (b.y - a.y) * t), z: Math.round(a.z + (b.z - a.z) * t) }
  })
}

/** Builds both the walkable route and the visual supports from one oriented bridge specification. */
export function buildOverpass(builder: WorldBuilder, spec: OverpassSpec): OverpassInstance {
  const { id, start, end, widthMm, groundElevationMm, stairRunMm, stairSide } = spec
  const length = Math.hypot(end.x - start.x, end.z - start.z)
  if (length < widthMm * 3 || widthMm < 1_500 || stairRunMm < 5_000 ||
    start.y !== end.y || start.y <= groundElevationMm ||
    (spec.terminal && spec.terminal.point.y !== start.y)) {
    throw new Error(`Invalid overpass specification ${id}`)
  }
  const ax = (end.x - start.x) / length
  const az = (end.z - start.z) / length
  const nx = -az
  const nz = ax
  if (spec.terminal) {
    const dx = spec.terminal.point.x - end.x
    const dz = spec.terminal.point.z - end.z
    if (dx * ax + dz * az < 50 || Math.abs(dx * nx + dz * nz) > 5) {
      throw new Error(`Overpass terminal must continue the deck centreline: ${id}`)
    }
  }
  const offset = (p: WorldPointMm, along: number, across: number,
    y = p.y): WorldPointMm => ({ x: Math.round(p.x + ax * along + nx * across),
    y, z: Math.round(p.z + az * along + nz * across) })
  const legacy = id === 'bridge'
  const name = (part: string) => legacy ? part : `${id}:${part}`
  const walkwayId = name('skybridge-walkway')
  const deckSurfaceId = name('skybridge')
  const terminal = spec.terminal?.point ?? end
  const deckEnd = spec.terminal ? terminal : end
  const deckStart = offset(start, -widthMm / 2, 0)
  builder.surface(surface(deckSurfaceId, 'L1', walkwayId,
    strip(deckStart, deckEnd, widthMm / 2 + 150), start.y))

  const bridgeNodes = [name('bridge:west'), name('bridge:east')] as const
  builder.node(bridgeNodes[0], start, deckSurfaceId)
  builder.node(bridgeNodes[1], end, deckSurfaceId)
  const deckEdgeId = name('bridge:deck')
  builder.edge({ id: deckEdgeId, fromNodeId: bridgeNodes[0], toNodeId: bridgeNodes[1],
    kind: 'walk', surfaceId: deckSurfaceId, connectorId: null, accessId: null,
    direction: 'both', path: line(start, end, 18) })
  const deckEdges = [deckEdgeId]
  if (spec.terminal) {
    const terminalNode = name('bridge:galleria')
    builder.node(terminalNode, terminal, deckSurfaceId)
    const approachId = name('bridge:galleria-approach')
    builder.edge({ id: approachId, fromNodeId: bridgeNodes[1], toNodeId: terminalNode,
      kind: 'walk', surfaceId: deckSurfaceId, connectorId: null, accessId: null,
      direction: 'both' })
    deckEdges.push(approachId)
    builder.edge({ id: name('portal:galleria-upper'), fromNodeId: terminalNode,
      toNodeId: spec.terminal.indoorNodeId, kind: 'portal', surfaceId: null,
      connectorId: null, accessId: spec.terminal.accessIds[0] ?? null,
      accessIds: spec.terminal.accessIds, direction: 'both' })
  }

  const stairEdges: string[] = []
  const landings: string[] = []
  const rotationY = -Math.atan2(az, ax)
  const box = (boxId: string, kind: WorldBox['kind'], center: WorldPointMm,
    size: WorldPointMm, color: string, extras: Partial<WorldBox> = {}): void => {
    builder.boxes.push({ id: name(boxId), kind, center, size, color, rotationY, ...extras })
  }
  for (const [index, side] of ['west', 'east'].entries()) {
    const center = index === 0 ? start : end
    const placeId = name(`overpass-${side}-access`)
    const footSurface = name(`overpass-${side}-foot`)
    const landingSurface = name(`overpass-${side}-landing`)
    const connectorId = name(`${side}-stair`)
    const stairEdgeId = name(`connector:${side}-stair`)
    const foot = offset(center, 0, stairSide * (stairRunMm + 900), groundElevationMm)
    const stairStart = offset(center, 0, stairSide * stairRunMm, groundElevationMm)
    const stairEnd = offset(center, 0, stairSide * 900)
    const landing = offset(center, 0, stairSide * 200)
    builder.surface(surface(footSurface, 'L0', placeId,
      strip(offset(foot, 0, -1_250), offset(foot, 0, 1_250), widthMm / 2),
      groundElevationMm))
    builder.surface(surface(landingSurface, 'L1', placeId,
      strip(offset(center, 0, -1_650), offset(center, 0, 1_350), widthMm / 2),
      center.y))
    builder.surface(surface(name(`connector:${side}-stair`), 'L0-L1', placeId,
      strip(stairStart, stairEnd, widthMm / 2), groundElevationMm))
    const footId = name(`overpass:${side}:foot`)
    const startId = name(`overpass:${side}:stair-start`)
    const endId = name(`overpass:${side}:stair-end`)
    const landingId = name(`overpass:${side}:landing`)
    builder.node(footId, foot, footSurface)
    builder.node(startId, stairStart, footSurface)
    builder.node(endId, stairEnd, landingSurface)
    builder.node(landingId, landing, landingSurface)
    const edge = (edgeId: string, fromNodeId: string, toNodeId: string,
      kind: NavEdgeV2['kind'], surfaceId: string | null,
      extra: Partial<NavEdgeV2> = {}) => builder.edge({ id: name(edgeId), fromNodeId, toNodeId,
        kind, surfaceId, connectorId: extra.connectorId ?? null,
        accessId: extra.accessId ?? null, direction: 'both', path: extra.path })
    edge(`portal:overpass-${side}-ground`, spec.groundApproachNodeIds[index], footId, 'portal', null)
    edge(`overpass:${side}:foot-access`, footId, startId, 'walk', footSurface)
    edge(`connector:${side}-stair`, startId, endId, 'stair', null,
      { connectorId, path: line(stairStart, stairEnd, 30) })
    edge(`overpass:${side}:landing-access`, endId, landingId, 'walk', landingSurface)
    edge(`portal:overpass-${side}-bridge`, landingId, bridgeNodes[index], 'portal', null,
      { accessId: name('bridge-entry') })
    builder.connectors.push({ id: connectorId, kind: 'stair', lowerSurfaceId: footSurface,
      upperSurfaceId: landingSurface, edgeIds: [stairEdgeId], capacity: 10 })
    builder.places.push({ id: placeId, name: `${side === 'west' ? 'Near' : 'Far'} Overpass Stair`,
      kind: 'walkway', districtId: spec.districtIds[index],
      surfaceIds: [footSurface, landingSurface], accessNodeIds: [footId, landingId],
      slotNodeIds: [footId, landingId], activityTags: ['transfer'],
      openingHours: [{ openMinute: 0, closeMinute: 1440 }], capacity: 2,
      attractiveness: 0.3, typicalVisitTicks: [5, 15] })
    stairEdges.push(stairEdgeId)
    landings.push(landingSurface)
    box(`overpass-${side}-footpad`, 'path', offset(foot, 0, stairSide * -400, 200),
      { x: widthMm + 250, y: 120, z: 2_600 }, '#577484',
      { placeId, levelId: 'L0', surfaceId: footSurface })
  }
  for (const [index, center] of [start, terminal].entries()) {
    for (const side of [-1, 1]) {
      const post = offset(center, index === 0 ? 0 : spec.terminal ? -600 : -150,
        side * widthMm / 2, 2_600)
      box(`overpass-${index}-pier-${side}`, 'trim', post,
        { x: 300, y: 5_200, z: 300 }, '#177ba8', { placeId: walkwayId })
      box(`overpass-${index}-footing-${side}`, 'trim', { ...post, y: 160 },
        { x: 650, y: 320, z: 650 }, '#3b6176', { placeId: walkwayId, levelId: 'L0' })
    }
    box(`overpass-${index}-crosshead`, 'trim',
      offset(center, index === 1 && spec.terminal ? -350 : 0, 0, 5_100),
      { x: index === 1 && spec.terminal ? 850 : 420,
        y: 300, z: widthMm + 500 }, '#197fae',
      { placeId: walkwayId, levelId: 'L1' })
  }
  if (spec.terminal) {
    for (const side of [-1, 1]) {
      box(`overpass-terminal-jamb-${side}`, 'trim',
        offset(terminal, 0, side * (widthMm / 2 + 180), 7_100),
        { x: 500, y: 3_200, z: 360 }, '#197fae', { placeId: walkwayId, levelId: 'L1' })
    }
    box('overpass-terminal-lintel', 'trim', { ...terminal, y: 8_700 },
      { x: 500, y: 350, z: widthMm + 720 }, '#197fae',
      { placeId: walkwayId, levelId: 'L1' })
  }
  builder.places.push({ id: walkwayId, name: 'Pedestrian Overpass', kind: 'walkway',
    districtId: spec.districtIds[1], surfaceIds: [deckSurfaceId],
    accessNodeIds: bridgeNodes, slotNodeIds: bridgeNodes,
    activityTags: ['transfer'], openingHours: [{ openMinute: 0, closeMinute: 1440 }],
    capacity: 2, attractiveness: 0.3, typicalVisitTicks: [5, 15] })
  return { id, widthMm, deckEdgeIds: deckEdges, stairEdgeIds: stairEdges as [string, string],
    landingSurfaceIds: landings as [string, string], surfaceId: deckSurfaceId,
    terminalPoint: spec.terminal?.point ?? null, stairSide }
}
