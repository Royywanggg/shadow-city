import { derivePedestrianNetwork } from '../../city/pedestrian/derivePedestrianNetwork'
import type { Building, CityModel, PedestrianNode } from '../../city/model'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { hashSeed } from '../../simulation/rng'
import type { GroundPointMm, NavEdgeV2, SemanticPlace, WalkableSurface, WorldBox,
  WorldConfigV2, WorldModelV2, WorldPointMm } from '../model'
import { WorldBuilder } from './WorldBuilder'
import { expandOriginalCity, EXPANDED_CITY_SIZE } from './expandOriginalCity'

const mm = (value: number) => Math.round(value * 1000)
const point = (x: number, y: number, z: number): WorldPointMm => ({ x: mm(x), y: mm(y), z: mm(z) })
const rect = (x0: number, x1: number, z0: number, z1: number): readonly GroundPointMm[] => [
  { x: mm(x0), z: mm(z0) }, { x: mm(x1), z: mm(z0) },
  { x: mm(x1), z: mm(z1) }, { x: mm(x0), z: mm(z1) },
]

export const INTEGRATED_WORLD_CONFIG_V2: WorldConfigV2 = Object.freeze({
  version: 2, seed: HERO_SEED, extentMm: EXPANDED_CITY_SIZE * 1000,
  generatorVersion: 'heritage-extension-v4',
})

function surface(id: string, levelId: string, placeId: string | null,
  polygonXZ: readonly GroundPointMm[], elevationMm: number, indoor = false): WalkableSurface {
  return { id, levelId, placeId, interactionZoneId: id, elevationMm, polygonXZ,
    blockedPolygonsXZ: [], clearanceMm: indoor ? 3_800 : 20_000, indoor }
}

function box(id: string, kind: WorldBox['kind'], x: number, y: number, z: number,
  width: number, height: number, depth: number, color: string,
  extras: Partial<WorldBox> = {}): WorldBox {
  return { id, kind, center: point(x, y, z), size: point(width, height, depth), color, ...extras }
}

function edge(builder: WorldBuilder, id: string, fromNodeId: string, toNodeId: string,
  kind: NavEdgeV2['kind'] = 'walk', extras: Partial<NavEdgeV2> = {}): void {
  builder.edge({ id, fromNodeId, toNodeId, kind, surfaceId: extras.surfaceId === undefined
    ? 'ground' : extras.surfaceId, connectorId: extras.connectorId ?? null,
  accessId: extras.accessId ?? null, accessIds: extras.accessIds,
  direction: extras.direction ?? 'both', path: extras.path })
}

function buildingPlaceKind(building: Building): SemanticPlace['kind'] {
  if (building.kind === 'residential' || building.kind === 'apartment') return 'home'
  if (building.kind === 'commercial' || building.kind === 'corner') {
    return hashSeed(building.id) % 4 === 0 ? 'cafe' : 'retail'
  }
  return 'workplace'
}

function nearest(nodes: readonly PedestrianNode[], x: number, z: number): PedestrianNode {
  const ordered = [...nodes].sort((a, b) => Math.hypot(a.x - x, a.z - z) -
    Math.hypot(b.x - x, b.z - z) || a.id.localeCompare(b.id))
  if (!ordered[0]) throw new Error('Integrated world has no pedestrian nodes')
  return ordered[0]
}

function curvedPath(waypoints: readonly WorldPointMm[], samplesPerSegment = 5): WorldPointMm[] {
  const result: WorldPointMm[] = []
  for (let segment = 0; segment < waypoints.length - 1; segment += 1) {
    const a = waypoints[Math.max(0, segment - 1)]
    const b = waypoints[segment]
    const c = waypoints[segment + 1]
    const d = waypoints[Math.min(waypoints.length - 1, segment + 2)]
    for (let step = 0; step < samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment
      const interpolate = (key: keyof WorldPointMm) => Math.round(0.5 * (
        2 * b[key] + (-a[key] + c[key]) * t +
        (2 * a[key] - 5 * b[key] + 4 * c[key] - d[key]) * t * t +
        (-a[key] + 3 * b[key] - 3 * c[key] + d[key]) * t * t * t))
      result.push({ x: interpolate('x'), y: interpolate('y'), z: interpolate('z') })
    }
  }
  result.push(waypoints.at(-1)!)
  return result
}

function linearPath(start: WorldPointMm, end: WorldPointMm, segments: number): WorldPointMm[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments
    return { x: Math.round(start.x + (end.x - start.x) * t),
      y: Math.round(start.y + (end.y - start.y) * t),
      z: Math.round(start.z + (end.z - start.z) * t) }
  })
}

/** Adds multi-level places to the existing city's exact roads, blocks and pedestrian graph. */
export function generateIntegratedWorld(seed = HERO_SEED): WorldModelV2 {
  const original = expandOriginalCity(generateCity(seed))
  const mallBlock = original.blocks.find((block) => block.id === 'block-4-3')!
  const removedParcelIds = new Set(original.parcels.filter((parcel) =>
    parcel.blockId === mallBlock.id).map((parcel) => parcel.id))
  const retainedCity: CityModel = { ...original,
    parcels: original.parcels.filter((parcel) => !removedParcelIds.has(parcel.id)),
    buildings: original.buildings.filter((building) => !removedParcelIds.has(building.parcelId)),
  }
  retainedCity.pedestrian = derivePedestrianNetwork(retainedCity)
  const config: WorldConfigV2 = { ...INTEGRATED_WORLD_CONFIG_V2, seed }
  const builder = new WorldBuilder()
  const half = original.size / 2
  builder.surface(surface('ground', 'L0', null, rect(-half, half, -half, half), 250))
  for (const block of original.blocks) builder.districts.push({ id: block.id,
    kind: block.district === 'civic' ? 'public' : block.district === 'core' ? 'mixedUse' :
      block.district === 'works' ? 'commercial' : 'residential',
    center: { x: mm(block.x), z: mm(block.z) },
    widthMm: mm(block.width), depthMm: mm(block.depth) })
  for (const node of retainedCity.pedestrian.nodes) builder.node(node.id,
    point(node.x, 0.25, node.z), 'ground')
  for (const pedestrianEdge of retainedCity.pedestrian.edges) edge(builder, pedestrianEdge.id,
    pedestrianEdge.from, pedestrianEdge.to,
    pedestrianEdge.kind === 'crossing' ? 'crossing' : 'walk')

  const blockedGround: (readonly GroundPointMm[])[] = []
  for (const building of retainedCity.buildings) {
    for (const mass of building.masses.filter((part) => part.baseY < 2)) {
      blockedGround.push(rect(building.x + mass.offsetX - mass.width / 2,
        building.x + mass.offsetX + mass.width / 2,
        building.z + mass.offsetZ - mass.depth / 2,
        building.z + mass.offsetZ + mass.depth / 2))
    }
    const base = building.masses.find((part) => part.baseY < 2)!
    const cx = building.x + base.offsetX
    const cz = building.z + base.offsetZ
    const placeId = `building:${building.id}`
    const surfaceId = `interior:${building.id}`
    const kind = buildingPlaceKind(building)
    builder.surface(surface(surfaceId, 'L0', placeId,
      rect(cx - base.width * 0.45, cx + base.width * 0.45,
        cz - base.depth * 0.45, cz + base.depth * 0.45), 250, true))
    const entryId = `${surfaceId}:entry`
    const entryX = Math.max(cx - base.width * 0.36,
      Math.min(cx + base.width * 0.36, building.entrance.x))
    builder.node(entryId, point(entryX, 0.25, cz + base.depth * 0.35), surfaceId)
    edge(builder, `portal:${building.id}`, `ped-entrance-${building.id}`, entryId,
      'portal', { surfaceId: null })
    const slots = Array.from({ length: 16 }, (_, index) => {
      const id = `${surfaceId}:slot:${index}`
      const sx = cx + (index % 4 - 1.5) * base.width * 0.18
      const sz = cz + (Math.floor(index / 4) - 1.5) * base.depth * 0.18
      builder.node(id, point(sx, 0.25, sz), surfaceId)
      edge(builder, `access:${id}`, entryId, id, 'walk', { surfaceId })
      return id
    })
    const blockId = retainedCity.parcels.find((parcel) => parcel.id === building.parcelId)!.blockId
    const tags = kind === 'home' ? ['home'] : kind === 'cafe' ? ['eat', 'leisure'] :
      kind === 'retail' ? ['shop'] : ['work']
    builder.places.push({ id: placeId, name: `${building.kind} ${building.id.slice(-5)}`,
      kind, districtId: blockId, surfaceIds: [surfaceId], accessNodeIds: [entryId],
      slotNodeIds: slots, activityTags: tags as SemanticPlace['activityTags'],
      openingHours: [{ openMinute: kind === 'home' ? 0 : kind === 'workplace' ? 360 : 480,
        closeMinute: kind === 'home' ? 1440 : kind === 'workplace' ? 1200 : 1380 }],
      capacity: slots.length, attractiveness: kind === 'home' ? 0.5 : 0.55 +
        hashSeed(`${seed}:${building.id}:attraction`) % 25 / 100,
      typicalVisitTicks: kind === 'workplace' ? [90, 240] : [20, 85] })
    if (kind === 'retail' || kind === 'cafe') builder.resources.push({
      id: `resource:${building.id}`, placeId, surfaceId,
      position: point(cx, 0.25, cz), kind: 'retailStock' })
  }
  for (const block of retainedCity.blocks.filter((item) => item.isPlaza || item.isPark)) {
    const kind = block.isPlaza ? 'plaza' : 'park'
    const slots = retainedCity.pedestrian.anchors.filter((anchor) => anchor.blockId === block.id &&
      anchor.kind === kind).map((anchor) => anchor.nodeId)
    builder.places.push({ id: `public:${block.id}`, name: block.isPlaza ? 'Civic Plaza' : 'Neighbourhood Park',
      kind, districtId: block.id, surfaceIds: ['ground'], accessNodeIds: slots.slice(0, 2),
      slotNodeIds: slots, activityTags: ['leisure'],
      openingHours: [{ openMinute: 0, closeMinute: 1440 }], capacity: slots.length,
      attractiveness: block.isPlaza ? 0.88 : 0.7, typicalVisitTicks: [20, 75] })
  }

  const minX = mallBlock.x - mallBlock.width / 2 + 0.5
  const maxX = mallBlock.x + mallBlock.width / 2 - 0.5
  const minZ = mallBlock.z - mallBlock.depth / 2 + 0.7
  const maxZ = mallBlock.z + mallBlock.depth / 2 - 0.7
  const west = minX + 1.8
  const east = maxX - 1.8
  const north = minZ + 3.5
  const south = maxZ - 3.5
  const plaza = retainedCity.blocks.find((block) => block.isPlaza)!
  const plazaEast = plaza.x + plaza.width / 2 + 0.72
  const mallWest = mallBlock.x - mallBlock.width / 2 - 0.72
  const plazaRing = retainedCity.pedestrian.nodes.filter((node) => node.id.startsWith('ped-block-3-3-') &&
    Math.abs(node.x - plazaEast) < 0.001)
  const mallRing = retainedCity.pedestrian.nodes.filter((node) => node.id.startsWith('ped-block-4-3-') &&
    Math.abs(node.x - mallWest) < 0.001)
  builder.node('plaza:east-mid', point(plazaEast, 0.25, 0), 'ground')
  builder.node('mall:west-mid', point(mallWest, 0.25, 0), 'ground')
  for (const [mid, ring] of [['plaza:east-mid', plazaRing], ['mall:west-mid', mallRing]] as const) {
    const northNode = [...ring].sort((a, b) => a.z - b.z)[0]
    const southNode = [...ring].sort((a, b) => b.z - a.z)[0]
    if (!northNode || !southNode) throw new Error('Missing original block sidewalk ring')
    edge(builder, `${mid}:north`, mid, northNode.id)
    edge(builder, `${mid}:south`, mid, southNode.id)
  }
  edge(builder, 'crossing:plaza-galleria', 'plaza:east-mid', 'mall:west-mid', 'crossing')

  const mallId = 'central-galleria'
  builder.surface(surface('galleria-l0', 'L0', mallId, rect(minX, maxX, minZ, maxZ), 250, true))
  builder.surface({ ...surface('galleria-l1', 'L1', mallId,
    rect(minX, maxX, minZ, maxZ), 5_500, true),
    blockedPolygonsXZ: [rect(mallBlock.x - 2.8, mallBlock.x + 2.8, -5, 5)] })
  const bridgeZ = plaza.z - plaza.depth * 0.24
  const bridgeWest = plazaEast - 1.9
  const bridgeEast = mallWest - 0.12
  const bridgeGalleria = minX + 0.5
  const stairFootZ = bridgeZ - 9.1
  const stairTopZ = bridgeZ - 0.9
  for (const [side, x] of [['west', bridgeWest], ['east', bridgeEast]] as const) {
    builder.surface(surface(`overpass-${side}-foot`, 'L0', `overpass-${side}-access`,
      rect(x - 1.25, x + 1.25, stairFootZ - 1.25, stairFootZ + 1.25), 250))
    builder.surface(surface(`overpass-${side}-landing`, 'L1', `overpass-${side}-access`,
      rect(x - 1.25, x + 1.25, bridgeZ - 1.65, bridgeZ + 1.35), 5_500))
    builder.surface(surface(`connector:${side}-stair`, 'L0-L1', `overpass-${side}-access`,
      rect(x - 1.25, x + 1.25, stairFootZ - 0.4, bridgeZ + 0.4), 250))
  }
  builder.surface(surface('skybridge', 'L1', 'skybridge-walkway',
    rect(bridgeWest - 0.5, bridgeGalleria + 0.5, bridgeZ - 1.4, bridgeZ + 1.4), 5_500))
  const rampA = minX + 1.25
  const rampB = minX + 3.2
  builder.surface(surface('connector:east-ramp', 'L0-L1', mallId,
    rect(minX + 0.3, minX + 4.1, north - 1, south + 1), 250, true))
  builder.surface(surface('connector:galleria-escalator', 'L0-L1', mallId,
    rect(east - 1.7, east + 1.7, north - 1, south + 1), 250, true))

  const ring = [[west, north], [east, north], [east, 0], [east, south],
    [west, south], [west, 0]] as const
  for (const level of ['l0', 'l1'] as const) {
    const y = level === 'l0' ? 0.25 : 5.5
    const surfaceId = `galleria-${level}`
    for (const [x, z] of ring) builder.node(`galleria:${level}:${x}:${z}`, point(x, y, z), surfaceId)
    const pairs = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]] as const
    for (const [a, b] of pairs) edge(builder, `galleria:${level}:ring:${a}:${b}`,
      `galleria:${level}:${ring[a][0]}:${ring[a][1]}`,
      `galleria:${level}:${ring[b][0]}:${ring[b][1]}`, 'walk', { surfaceId })
  }
  const l0West = `galleria:l0:${west}:0`
  const l1West = 'galleria:l1:bridge-entry'
  builder.node(l1West, point(west, 5.5, bridgeZ), 'galleria-l1')
  edge(builder, 'galleria:l1:bridge-access', `galleria:l1:${west}:${north}`,
    l1West, 'walk', { surfaceId: 'galleria-l1' })
  edge(builder, 'portal:galleria-ground', 'mall:west-mid', l0West,
    'portal', { surfaceId: null, accessId: 'mall-entry' })
  builder.node('bridge:west', point(bridgeWest, 5.5, bridgeZ), 'skybridge')
  builder.node('bridge:east', point(bridgeEast, 5.5, bridgeZ), 'skybridge')
  builder.node('bridge:galleria', point(bridgeGalleria, 5.5, bridgeZ), 'skybridge')
  edge(builder, 'bridge:deck', 'bridge:west', 'bridge:east', 'walk', {
    surfaceId: 'skybridge', path: linearPath(point(bridgeWest, 5.5, bridgeZ),
      point(bridgeEast, 5.5, bridgeZ), 18),
  })
  edge(builder, 'bridge:galleria-approach', 'bridge:east', 'bridge:galleria',
    'walk', { surfaceId: 'skybridge' })
  edge(builder, 'portal:galleria-upper', 'bridge:galleria', l1West, 'portal',
    { surfaceId: null, accessId: 'mall-entry', accessIds: ['mall-entry', 'bridge-entry'] })
  const plazaNodes = retainedCity.pedestrian.nodes.filter((node) => node.id.startsWith('ped-place-block-3-3'))
  for (const [side, x, approachId, bridgeId] of [
    ['west', bridgeWest, nearest(plazaNodes, bridgeWest, stairFootZ).id, 'bridge:west'],
    ['east', bridgeEast, nearest(mallRing, bridgeEast, stairFootZ).id, 'bridge:east'],
  ] as const) {
    const foot = `overpass:${side}:foot`
    const stairStart = `overpass:${side}:stair-start`
    const stairEnd = `overpass:${side}:stair-end`
    const landing = `overpass:${side}:landing`
    builder.node(foot, point(x, 0.25, stairFootZ - 0.6), `overpass-${side}-foot`)
    builder.node(stairStart, point(x, 0.25, stairFootZ), `overpass-${side}-foot`)
    builder.node(stairEnd, point(x, 5.5, stairTopZ), `overpass-${side}-landing`)
    builder.node(landing, point(x, 5.5, bridgeZ - 0.2), `overpass-${side}-landing`)
    edge(builder, `portal:overpass-${side}-ground`, approachId, foot,
      'portal', { surfaceId: null })
    edge(builder, `overpass:${side}:foot-access`, foot, stairStart,
      'walk', { surfaceId: `overpass-${side}-foot` })
    edge(builder, `connector:${side}-stair`, stairStart, stairEnd, 'stair', {
      surfaceId: null, connectorId: `${side}-stair`,
      path: linearPath(point(x, 0.25, stairFootZ), point(x, 5.5, stairTopZ), 30),
    })
    edge(builder, `overpass:${side}:landing-access`, stairEnd, landing,
      'walk', { surfaceId: `overpass-${side}-landing` })
    edge(builder, `portal:overpass-${side}-bridge`, landing, bridgeId,
      'portal', { surfaceId: null, accessId: 'bridge-entry' })
    builder.places.push({ id: `overpass-${side}-access`,
      name: `${side === 'west' ? 'Plaza' : 'Galleria'} Overpass Stair`, kind: 'walkway',
      districtId: side === 'west' ? plaza.id : mallBlock.id,
      surfaceIds: [`overpass-${side}-foot`, `overpass-${side}-landing`],
      accessNodeIds: [foot, landing], slotNodeIds: [foot, landing],
      activityTags: ['transfer'], openingHours: [{ openMinute: 0, closeMinute: 1440 }],
      capacity: 2, attractiveness: 0.3, typicalVisitTicks: [5, 15] })
  }
  const rampLower = 'galleria:l0:ramp-lower'
  const rampUpper = 'galleria:l1:ramp-upper'
  builder.node(rampLower, point(rampA, 0.25, south), 'galleria-l0')
  builder.node(rampUpper, point(rampB, 5.5, south), 'galleria-l1')
  edge(builder, 'galleria:l0:ramp-access', `galleria:l0:${west}:${south}`,
    rampLower, 'walk', { surfaceId: 'galleria-l0' })
  edge(builder, 'galleria:l1:ramp-access', rampUpper,
    `galleria:l1:${west}:${south}`, 'walk', { surfaceId: 'galleria-l1' })
  edge(builder, 'connector:east-ramp', rampLower, rampUpper, 'ramp', {
    surfaceId: null, connectorId: 'east-ramp',
    path: curvedPath([point(rampA, 0.25, south),
      point(rampA, 2.8, north + 3.5), point(rampB, 2.85, north + 3.5),
      point(rampB, 5.5, south)], 9),
  })
  edge(builder, 'connector:galleria-escalator', `galleria:l0:${east}:${south}`,
    `galleria:l1:${east}:${north}`, 'escalator', {
      surfaceId: null, connectorId: 'galleria-escalator', accessId: 'galleria-escalator',
      direction: 'forward',
      path: [point(east, 0.25, south), point(east, 2.75, 0), point(east, 5.5, north)],
    })
  builder.connectors.push(
    { id: 'west-stair', kind: 'stair', lowerSurfaceId: 'overpass-west-foot', upperSurfaceId: 'overpass-west-landing',
      edgeIds: ['connector:west-stair'], capacity: 10 },
    { id: 'east-stair', kind: 'stair', lowerSurfaceId: 'overpass-east-foot', upperSurfaceId: 'overpass-east-landing',
      edgeIds: ['connector:east-stair'], capacity: 10 },
    { id: 'east-ramp', kind: 'ramp', lowerSurfaceId: 'galleria-l0', upperSurfaceId: 'galleria-l1',
      edgeIds: ['connector:east-ramp'], capacity: 10 },
    { id: 'galleria-escalator', kind: 'escalator', lowerSurfaceId: 'galleria-l0', upperSurfaceId: 'galleria-l1',
      edgeIds: ['connector:galleria-escalator'], capacity: 8 },
  )
  builder.places.push({ id: 'skybridge-walkway', name: 'Civic Skybridge', kind: 'walkway',
    districtId: mallBlock.id, surfaceIds: ['skybridge'],
    accessNodeIds: ['bridge:west', 'bridge:east'], slotNodeIds: ['bridge:west', 'bridge:east'],
    activityTags: ['transfer'], openingHours: [{ openMinute: 0, closeMinute: 1440 }],
    capacity: 2, attractiveness: 0.3, typicalVisitTicks: [5, 15] })
  builder.places.push({ id: mallId, name: 'Central Galleria', kind: 'mall',
    districtId: mallBlock.id, surfaceIds: ['galleria-l0', 'galleria-l1'],
    accessNodeIds: [l0West, l1West],
    slotNodeIds: ring.flatMap(([x, z]) => [`galleria:l0:${x}:${z}`, `galleria:l1:${x}:${z}`]),
    activityTags: ['shop', 'eat', 'leisure'],
    openingHours: [{ openMinute: 480, closeMinute: 1320 }],
    capacity: 12, attractiveness: 1.52, typicalVisitTicks: [35, 95] })
  for (const level of ['l0', 'l1'] as const) for (const [kind, z] of [['retail', north + 2],
    ['cafe', south - 2]] as const) {
    const y = level === 'l0' ? 0.25 : 5.5
    const id = `galleria-${kind}-${level}`
    const surfaceId = `galleria-shop-${kind}-${level}`
    builder.surface(surface(surfaceId, level.toUpperCase(), id,
      rect(mallBlock.x - 2.3, mallBlock.x + 2.3, z - 1.6, z + 1.6), mm(y), true))
    const entryId = `shop:${kind}:${level}:entry`
    builder.node(entryId, point(mallBlock.x, y, z), surfaceId)
    const parentZ = kind === 'retail' ? north : south
    edge(builder, `portal:${entryId}`, `galleria:${level}:${east}:${parentZ}`,
      entryId, 'portal', { surfaceId: null, accessId: 'mall-entry' })
    const slots = [-1.2, 0, 1.2].map((offset, index) => {
      const slotId = `shop:${kind}:${level}:slot:${index}`
      builder.node(slotId, point(mallBlock.x + offset, y, z + 0.8), surfaceId)
      edge(builder, `access:${slotId}`, entryId, slotId, 'walk', { surfaceId })
      return slotId
    })
    builder.places.push({ id, name: `${level.toUpperCase()} ${kind === 'cafe' ? 'Atrium Café' : 'Arcade Shop'}`,
      kind, districtId: mallBlock.id, surfaceIds: [surfaceId], accessNodeIds: [entryId],
      slotNodeIds: slots, activityTags: kind === 'cafe' ? ['eat', 'leisure'] : ['shop'],
      openingHours: [{ openMinute: 480, closeMinute: 1320 }], capacity: 3,
      attractiveness: 1.28, typicalVisitTicks: [20, 60] })
    builder.resources.push({ id: `resource:${id}`, placeId: id, surfaceId,
      position: point(mallBlock.x, y, z), kind: 'retailStock' })
  }
  builder.resources.push({ id: 'resource:galleria-l0', placeId: mallId,
    surfaceId: 'galleria-l0', position: point(mallBlock.x, 0.25, north), kind: 'retailStock' })

  const boxes = builder.boxes
  boxes.push(box('integrated-crosswalk', 'path', (plazaEast + mallWest) / 2, 0.095, 0,
    mallWest - plazaEast - 0.5, 0.02, 1.55, '#aab7af', { surfaceId: 'ground' }))
  for (const [side, x] of [['west', bridgeWest], ['east', bridgeEast]] as const) {
    boxes.push(box(`overpass-${side}-footpad`, 'path', x, 0.2, stairFootZ - 0.2,
      2.75, 0.12, 2.6, '#577484',
      { placeId: `overpass-${side}-access`, levelId: 'L0', surfaceId: `overpass-${side}-foot` }))
  }
  for (const [side, x] of [['west', bridgeWest], ['east', minX - 0.15]] as const) {
    for (const edgeSide of [-1, 1]) {
      boxes.push(box(`overpass-${side}-pier-${edgeSide}`, 'trim', x, 2.6,
        bridgeZ + edgeSide * 1.25, 0.3, 5.2, 0.3, '#177ba8',
        { placeId: 'skybridge-walkway' }))
      boxes.push(box(`overpass-${side}-footing-${edgeSide}`, 'trim', x, 0.16,
        bridgeZ + edgeSide * 1.25, 0.65, 0.32, 0.65, '#3b6176',
        { placeId: 'skybridge-walkway', levelId: 'L0' }))
    }
    boxes.push(box(`overpass-${side}-crosshead`, 'trim', x, 5.1, bridgeZ,
      0.42, 0.3, 3.0, '#197fae', { placeId: 'skybridge-walkway', levelId: 'L1' }))
  }
  boxes.push(box('galleria-ground-floor', 'floor', mallBlock.x, 0.15, 0,
    maxX - minX, 0.2, maxZ - minZ, '#4b6270',
    { placeId: mallId, levelId: 'L0', surfaceId: 'galleria-l0' }))
  for (const [id, z0, z1] of [['north', minZ, -5], ['south', 5, maxZ]] as const) {
    boxes.push(box(`galleria-upper-${id}`, 'floor', mallBlock.x, 5.38, (z0 + z1) / 2,
      maxX - minX, 0.24, z1 - z0, '#607989',
      { placeId: mallId, levelId: 'L1', surfaceId: 'galleria-l1' }))
  }
  for (const [id, x0, x1] of [['west', minX, mallBlock.x - 2.8],
    ['east', mallBlock.x + 2.8, maxX]] as const) {
    boxes.push(box(`galleria-upper-${id}`, 'floor', (x0 + x1) / 2, 5.38, 0,
      x1 - x0, 0.24, 10, '#607989',
      { placeId: mallId, levelId: 'L1', surfaceId: 'galleria-l1' }))
  }
  for (const side of [-1, 1]) {
    boxes.push(box(`galleria-plinth-z:${side}`, 'building', mallBlock.x, 0.9,
      side < 0 ? minZ : maxZ,
      maxX - minX, 1.8, 0.42, '#455b69', { placeId: mallId }))
    boxes.push(box(`galleria-cornice-z:${side}`, 'trim', mallBlock.x, 10.55,
      side < 0 ? minZ : maxZ,
      maxX - minX, 0.85, 0.55, '#6b8592', { placeId: mallId }))
    for (let index = 0; index <= 5; index += 1) {
      const x = minX + (maxX - minX) * index / 5
      boxes.push(box(`galleria-rib-z:${side}:${index}`, 'trim', x, 5.8,
        side < 0 ? minZ : maxZ, 0.32, 9.4, 0.42, '#738c99', { placeId: mallId }))
    }
    boxes.push(box(`galleria-atrium-rail-z:${side}`, 'rail', mallBlock.x, 6.18,
      side * 5.15, 5.8, 0.12, 0.12, '#a3b8bc',
      { placeId: mallId, levelId: 'L1' }))
    boxes.push(box(`galleria-atrium-rail-x:${side}`, 'rail', mallBlock.x + side * 2.9,
      6.18, 0, 0.12, 0.12, 10.3, '#a3b8bc', { placeId: mallId, levelId: 'L1' }))
  }
  boxes.push(box('galleria-wall-east', 'building', maxX, 5.35, 0,
    0.32, 10.7, maxZ - minZ, '#455b69', { placeId: mallId }))
  for (const [id, z0, z1] of [['north', minZ, -3.2], ['south', 3.2, maxZ]] as const) {
    boxes.push(box(`galleria-west-plinth-${id}`, 'building', minX, 0.9, (z0 + z1) / 2,
      0.42, 1.8, z1 - z0, '#4b6474', { placeId: mallId }))
    boxes.push(box(`galleria-west-cornice-${id}`, 'trim', minX, 10.55, (z0 + z1) / 2,
      0.55, 0.85, z1 - z0, '#6b8592', { placeId: mallId }))
    for (let index = 0; index <= 5; index += 1) {
      const z = z0 + (z1 - z0) * index / 5
      if (Math.abs(z - bridgeZ) < 1.9) continue
      boxes.push(box(`galleria-west-rib-${id}-${index}`,
        'trim', minX, 5.8, z, 0.42, 9.4, 0.32, '#738c99', { placeId: mallId }))
    }
  }
  for (const side of [-1, 1]) boxes.push(box(`galleria-bridge-jamb-${side}`,
    'trim', minX - 0.1, 7.1, bridgeZ + side * 1.5,
    0.5, 3.2, 0.4, '#197fae', { placeId: mallId, levelId: 'L1' }))
  boxes.push(box('galleria-bridge-lintel', 'trim', minX - 0.1, 8.7,
    bridgeZ, 0.5, 0.35, 3.3, '#197fae', { placeId: mallId, levelId: 'L1' }))
  for (const side of [-1, 1]) {
    boxes.push(box(`galleria-portal-column-${side}`, 'trim', minX - 0.12, 4.2,
      side * 2.85, 0.7, 8.4, 0.72, '#829ba3', { placeId: mallId }))
    boxes.push(box(`galleria-portal-light-${side}`, 'accent', minX - 0.55, 7.8,
      side * 2.85, 0.08, 0.6, 0.16, '#8bc7c7', { placeId: mallId }))
  }
  boxes.push(box('galleria-portal-lintel', 'trim', minX - 0.15, 8.35, 0,
    0.9, 0.55, 6.4, '#91aab0', { placeId: mallId }))
  for (const [id, z0, z1] of [['north', minZ, -5.3], ['south', 5.3, maxZ]] as const) {
    boxes.push(box(`galleria-roof-${id}`, 'roof', mallBlock.x, 10.85, (z0 + z1) / 2,
      maxX - minX, 0.4, z1 - z0, '#34495b', { roofFor: mallId, levelId: 'L1' }))
  }
  boxes.push(box('galleria-escalator-tread', 'step', east, 2.7, 0, 1.9, 0.26,
    south - north, '#8497a1', { rotationX: Math.atan2(5.25, south - north),
      surfaceId: 'connector:galleria-escalator', placeId: mallId }))
  for (const side of [-1, 1]) boxes.push(box(`galleria-escalator-rail:${side}`, 'rail',
    east + side * 1.1, 3.45, 0, 0.1, 0.12, south - north, '#b2c2c6',
    { rotationX: Math.atan2(5.25, south - north), placeId: mallId }))
  for (const level of ['l0', 'l1'] as const) for (const [kind, z] of [['retail', north + 2],
    ['cafe', south - 2]] as const) {
    const y = level === 'l0' ? 0.25 : 5.5
    boxes.push(box(`galleria-${kind}-${level}:sign`, 'accent', mallBlock.x, y + 3.5,
      z, 3.2, 0.24, 0.16, kind === 'cafe' ? '#dfad7b' : '#81b9bf',
      { placeId: `galleria-${kind}-${level}`, levelId: level.toUpperCase() }))
    boxes.push(box(`galleria-${kind}-${level}:counter`, 'furniture', mallBlock.x,
      y + 0.6, z, 3.2, 1.1, 0.5, '#9aabb0',
      { placeId: `galleria-${kind}-${level}`, levelId: level.toUpperCase() }))
  }
  builder.surfaces[0] = { ...builder.surfaces[0], blockedPolygonsXZ: blockedGround }
  builder.buildValidation()
  return { version: 2, config, baseCity: retainedCity,
    bounds: { minX: -mm(half), maxX: mm(half), minZ: -mm(half), maxZ: mm(half), maxY: 120_000 },
    districts: builder.districts,
    roadNodes: original.roads.nodes.map((node) => ({ id: node.id,
      position: { x: mm(node.x), z: mm(node.z) } })),
    roadEdges: original.roads.edges.map((road) => ({ id: road.id,
      from: road.from, to: road.to, widthMm: mm(road.width) })),
    surfaces: builder.surfaces, navNodes: builder.nodes, navEdges: builder.edges,
    connectors: builder.connectors, places: builder.places, resources: builder.resources,
    boxes }
}
