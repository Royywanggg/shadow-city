import { derivePedestrianNetwork } from '../../city/pedestrian/derivePedestrianNetwork'
import type { Building, CityModel, PedestrianNode } from '../../city/model'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { hashSeed } from '../../simulation/rng'
import type { GroundPointMm, NavEdgeV2, SemanticPlace, WalkableSurface, WorldBox,
  WorldConfigV2, WorldModelV2, WorldPointMm } from '../model'
import { WorldBuilder } from './WorldBuilder'

const mm = (value: number) => Math.round(value * 1000)
const point = (x: number, y: number, z: number): WorldPointMm => ({ x: mm(x), y: mm(y), z: mm(z) })
const rect = (x0: number, x1: number, z0: number, z1: number): readonly GroundPointMm[] => [
  { x: mm(x0), z: mm(z0) }, { x: mm(x1), z: mm(z0) },
  { x: mm(x1), z: mm(z1) }, { x: mm(x0), z: mm(z1) },
]

export const INTEGRATED_WORLD_CONFIG_V2: WorldConfigV2 = Object.freeze({
  version: 2, seed: HERO_SEED, extentMm: 212_000, generatorVersion: 'heritage-overlay-v1',
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

/** Adds multi-level places to the existing city's exact roads, blocks and pedestrian graph. */
export function generateIntegratedWorld(seed = HERO_SEED): WorldModelV2 {
  const original = generateCity(seed)
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
  const bridgeWest = plazaEast - 0.5
  const bridgeEast = minX + 0.5
  builder.surface(surface('skybridge', 'L1', 'skybridge-walkway',
    rect(bridgeWest - 0.5, bridgeEast + 0.5, -1.6, 1.6), 5_500))
  builder.surface(surface('connector:west-stair', 'L0-L1', null,
    rect(plazaEast - 12, bridgeWest + 1, -14, 2), 250))
  builder.surface(surface('connector:east-ramp', 'L0-L1', null,
    rect(plazaEast - 13, bridgeWest + 1, -12, 18), 250))
  builder.surface(surface('connector:galleria-stair', 'L0-L1', mallId,
    rect(west - 1.7, west + 1.7, north - 1, south + 1), 250, true))
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
  const l1West = `galleria:l1:${west}:0`
  edge(builder, 'portal:galleria-ground', 'mall:west-mid', l0West,
    'portal', { surfaceId: null, accessId: 'mall-entry' })
  builder.node('bridge:west', point(bridgeWest, 5.5, 0), 'skybridge')
  builder.node('bridge:east', point(bridgeEast, 5.5, 0), 'skybridge')
  edge(builder, 'bridge:deck', 'bridge:west', 'bridge:east', 'walk', { surfaceId: 'skybridge' })
  edge(builder, 'portal:galleria-upper', 'bridge:east', l1West, 'portal',
    { surfaceId: null, accessId: 'mall-entry', accessIds: ['mall-entry', 'bridge-entry'] })
  const plazaNodes = retainedCity.pedestrian.nodes.filter((node) => node.id.startsWith('ped-place-block-3-3'))
  const stairLower = nearest(plazaNodes, bridgeWest - 8, -10)
  const rampLower = nearest(plazaNodes, bridgeWest - 10, 11)
  edge(builder, 'connector:west-stair', stairLower.id, 'bridge:west', 'stair', {
    surfaceId: null, connectorId: 'west-stair', accessId: 'bridge-entry',
    path: [point(stairLower.x, 0.25, stairLower.z),
      point((stairLower.x + bridgeWest) / 2, 2.75, stairLower.z / 2),
      point(bridgeWest, 5.5, 0)],
  })
  edge(builder, 'connector:east-ramp', rampLower.id, 'bridge:west', 'ramp', {
    surfaceId: null, connectorId: 'east-ramp', accessId: 'bridge-entry',
    path: [point(rampLower.x, 0.25, rampLower.z),
      point(bridgeWest - 8, 1.55, 14), point(bridgeWest - 3, 3.5, -7),
      point(bridgeWest, 5.5, 0)],
  })
  edge(builder, 'connector:galleria-stair', `galleria:l0:${west}:${south}`,
    `galleria:l1:${west}:${north}`, 'stair', {
      surfaceId: null, connectorId: 'galleria-stair',
      path: [point(west, 0.25, south), point(west, 2.75, 0), point(west, 5.5, north)],
    })
  edge(builder, 'connector:galleria-escalator', `galleria:l0:${east}:${south}`,
    `galleria:l1:${east}:${north}`, 'escalator', {
      surfaceId: null, connectorId: 'galleria-escalator', accessId: 'galleria-escalator',
      direction: 'forward',
      path: [point(east, 0.25, south), point(east, 2.75, 0), point(east, 5.5, north)],
    })
  builder.connectors.push(
    { id: 'west-stair', kind: 'stair', lowerSurfaceId: 'ground', upperSurfaceId: 'skybridge',
      edgeIds: ['connector:west-stair'], capacity: 10 },
    { id: 'east-ramp', kind: 'ramp', lowerSurfaceId: 'ground', upperSurfaceId: 'skybridge',
      edgeIds: ['connector:east-ramp'], capacity: 10 },
    { id: 'galleria-stair', kind: 'stair', lowerSurfaceId: 'galleria-l0', upperSurfaceId: 'galleria-l1',
      edgeIds: ['connector:galleria-stair'], capacity: 10 },
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
    capacity: 12, attractiveness: 0.94, typicalVisitTicks: [35, 95] })
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
      attractiveness: 0.8, typicalVisitTicks: [20, 60] })
    builder.resources.push({ id: `resource:${id}`, placeId: id, surfaceId,
      position: point(mallBlock.x, y, z), kind: 'retailStock' })
  }
  builder.resources.push({ id: 'resource:galleria-l0', placeId: mallId,
    surfaceId: 'galleria-l0', position: point(mallBlock.x, 0.25, north), kind: 'retailStock' })

  const boxes = builder.boxes
  boxes.push(box('integrated-crosswalk', 'path', (plazaEast + mallWest) / 2, 0.095, 0,
    mallWest - plazaEast - 0.5, 0.02, 1.55, '#aab7af', { surfaceId: 'ground' }))
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
    boxes.push(box(`galleria-wall-z:${side}`, 'building', mallBlock.x, 5.35,
      side < 0 ? minZ : maxZ,
      maxX - minX, 10.7, 0.32, '#455b69', { placeId: mallId }))
    boxes.push(box(`galleria-atrium-rail-z:${side}`, 'rail', mallBlock.x, 6.18,
      side * 5.15, 5.8, 0.12, 0.12, '#a3b8bc',
      { placeId: mallId, levelId: 'L1' }))
    boxes.push(box(`galleria-atrium-rail-x:${side}`, 'rail', mallBlock.x + side * 2.9,
      6.18, 0, 0.12, 0.12, 10.3, '#a3b8bc', { placeId: mallId, levelId: 'L1' }))
  }
  boxes.push(box('galleria-wall-east', 'building', maxX, 5.35, 0,
    0.32, 10.7, maxZ - minZ, '#455b69', { placeId: mallId }))
  for (const [id, z0, z1] of [['north', minZ, -5.3], ['south', 5.3, maxZ]] as const) {
    boxes.push(box(`galleria-roof-${id}`, 'roof', mallBlock.x, 10.85, (z0 + z1) / 2,
      maxX - minX, 0.4, z1 - z0, '#34495b', { roofFor: mallId, levelId: 'L1' }))
  }
  for (let index = 0; index < 18; index += 1) {
    const t = (index + 0.5) / 18
    boxes.push(box(`galleria-stair-step-${index}`, 'step', west, 0.25 + t * 5.25,
      south + (north - south) * t, 1.8, 0.16, (south - north) / 18,
      '#93a7ad', { surfaceId: 'connector:galleria-stair', placeId: mallId }))
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
  boxes.push(box('bridge-deck', 'floor', (bridgeWest + bridgeEast) / 2, 5.3, 0,
    bridgeEast - bridgeWest, 0.36, 2.9, '#738d9a', { levelId: 'L1', surfaceId: 'skybridge' }))
  for (const side of [-1, 1]) boxes.push(box(`bridge-rail-${side}`, 'rail',
    (bridgeWest + bridgeEast) / 2, 6.05, side * 1.42,
    bridgeEast - bridgeWest, 1.2, 0.12, '#a4bdc2', { levelId: 'L1', surfaceId: 'skybridge' }))
  for (let index = 0; index < 12; index += 1) {
    const t = (index + 0.5) / 12
    boxes.push(box(`bridge-stair-step-${index}`, 'step',
      stairLower.x + (bridgeWest - stairLower.x) * t, 0.25 + 5.25 * t,
      stairLower.z * (1 - t), 2.1, 0.16, 1.05, '#879daa',
      { surfaceId: 'connector:west-stair' }))
  }
  const rampPath = [point(rampLower.x, 0.25, rampLower.z),
    point(bridgeWest - 8, 1.55, 14), point(bridgeWest - 3, 3.5, -7),
    point(bridgeWest, 5.5, 0)]
  rampPath.slice(1).forEach((end, index) => {
    const start = rampPath[index]
    const dx = (end.x - start.x) / 1000
    const dz = (end.z - start.z) / 1000
    boxes.push(box(`bridge-ramp-${index}`, 'floor', (start.x + end.x) / 2000,
      (start.y + end.y) / 2000 - 0.12, (start.z + end.z) / 2000,
      2.3, 0.24, Math.hypot(dx, dz), '#7c929e',
      { rotationY: Math.atan2(dx, dz),
        rotationX: -Math.atan2((end.y - start.y) / 1000, Math.hypot(dx, dz)),
        surfaceId: 'connector:east-ramp' }))
  })

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
