import { hashSeed } from '../../simulation/rng'
import { createBuilding } from '../../city/generation/buildings'
import { createRandom } from '../../city/generation/random'
import type { Building, DistrictKind, Parcel } from '../../city/model'
import type {
  DistrictKindV2, GroundPointMm, NavEdgeV2, SemanticPlace, WalkableSurface,
  WorldBox, WorldConfigV2, WorldModelV2, WorldPointMm,
} from '../model'
import { DEFAULT_WORLD_CONFIG_V2 } from '../model'
import { WorldBuilder } from './WorldBuilder'

const GROUND_Y = 250
const UPPER_Y = 5_500
const NAV_X = [-135, -95, -55, -15, -9, 9, 15, 55, 95, 135] as const
const NAV_Z = [-135, -95, -55, -15, 0, 15, 55, 95, 135] as const
const ROAD_X = [-140, -100, -60, -20, 0, 20, 40, 140] as const
const ROAD_Z = [-140, -100, -60, 60, 100, 140] as const

const mm = (value: number) => Math.round(value * 1000)
const point = (x: number, y: number, z: number): WorldPointMm => ({ x: mm(x), y: mm(y), z: mm(z) })
const rect = (x0: number, x1: number, z0: number, z1: number): readonly GroundPointMm[] => [
  { x: mm(x0), z: mm(z0) }, { x: mm(x1), z: mm(z0) },
  { x: mm(x1), z: mm(z1) }, { x: mm(x0), z: mm(z1) },
]

function kindAt(x: number, z: number): DistrictKindV2 {
  if (x >= 35 && z < 65 && z > -65) return 'commercial'
  if (x < -25 && z > 55) return 'transport'
  if (x < -20 && z < -45) return 'public'
  if (x < -20) return 'residential'
  return 'mixedUse'
}

function box(id: string, kind: WorldBox['kind'], center: WorldPointMm, size: WorldPointMm,
  color: string, extras: Partial<WorldBox> = {}): WorldBox {
  return { id, kind, center, size, color, ...extras }
}

function surface(id: string, levelId: string, placeId: string | null,
  polygonXZ: readonly GroundPointMm[], elevationMm: number, indoor = false): WalkableSurface {
  return {
    id, levelId, placeId, interactionZoneId: id, elevationMm, polygonXZ,
    blockedPolygonsXZ: [], clearanceMm: indoor ? 3_800 : 20_000, indoor,
  }
}

function addEdge(builder: WorldBuilder, id: string, fromNodeId: string, toNodeId: string,
  kind: NavEdgeV2['kind'] = 'walk', extras: Partial<NavEdgeV2> = {}): void {
  builder.edge({
    id, fromNodeId, toNodeId, kind,
    surfaceId: Object.hasOwn(extras, 'surfaceId') ? extras.surfaceId ?? null : 'ground',
    connectorId: extras.connectorId ?? null, accessId: extras.accessId ?? null,
    accessIds: extras.accessIds,
    direction: extras.direction ?? 'both', path: extras.path,
  })
}

function addPlace(builder: WorldBuilder, place: SemanticPlace): void {
  builder.places.push(place)
}

const WALL_COLORS: Readonly<Record<Building['kind'], string>> = {
  residential: '#798b96', apartment: '#6f8798', commercial: '#627e8d',
  office: '#688397', tower: '#6f8ca2', industrial: '#79868c',
  civic: '#91a1a6', corner: '#748795', landmark: '#788fa1',
}

function architecturalBoxes(building: Building, districtId: string,
  configSeed: string): WorldBox[] {
  const boxes: WorldBox[] = []
  const add = (suffix: string, kind: WorldBox['kind'], x: number, y: number, z: number,
    width: number, height: number, depth: number, color: string) => {
    boxes.push(box(`${building.id}:${suffix}`, kind, point(x, y, z),
      point(width, height, depth), color, { districtId }))
  }
  for (const [index, mass] of building.masses.entries()) {
    const x = building.x + mass.offsetX
    const z = building.z + mass.offsetZ
    const top = mass.baseY + mass.height
    const wall = mass.role === 'base' ? '#4a6473' : mass.role === 'crown' ? '#92aab2'
      : WALL_COLORS[building.kind]
    add(`mass:${index}`, 'building', x, mass.baseY + mass.height / 2, z,
      mass.width, mass.height, mass.depth, wall)
    add(`cap:${index}`, 'roof', x, top + 0.16, z,
      mass.width + 0.55, 0.32, mass.depth + 0.55, '#40576a')
    if (index === building.masses.length - 1 || mass.role === 'base') {
      for (const side of [-1, 1]) {
        add(`cornice-z:${index}:${side}`, 'trim', x, top + 0.48,
          z + side * mass.depth / 2, mass.width + 0.6, 0.42, 0.24, '#9aabb2')
        add(`cornice-x:${index}:${side}`, 'trim', x + side * mass.width / 2,
          top + 0.48, z, 0.24, 0.42, mass.depth + 0.6, '#9aabb2')
      }
    }
  }
  const top = building.masses.at(-1)!
  const roofX = building.x + top.offsetX
  const roofZ = building.z + top.offsetZ
  const roofY = top.baseY + top.height
  if (building.kind === 'residential' || building.kind === 'industrial') {
    add('roof-ridge', 'roof', roofX, roofY + 1.1, roofZ,
      top.width * 0.78, 2.0, top.depth * 0.82, '#50677a')
  } else {
    add('roof-unit', 'trim', roofX + top.width * 0.2, roofY + 0.9,
      roofZ - top.depth * 0.16, Math.max(1.2, top.width * 0.25), 1.35,
      Math.max(1.2, top.depth * 0.28), '#899ca6')
  }
  if (building.kind === 'tower' || building.kind === 'landmark') {
    add('spire', 'trim', roofX, roofY + 3.4, roofZ, 0.22, 5.6, 0.22, '#b5c5ca')
    add('spire-lamp', 'accent', roofX, roofY + 6.3, roofZ, 0.4, 0.28, 0.4, '#79cbce')
  }
  if (building.kind === 'civic') {
    const main = building.masses[0]
    for (let i = 0; i < 6; i += 1) {
      add(`portico:${i}`, 'trim', building.x - main.width * 0.4 +
        i * main.width * 0.16, 4.5, building.z + main.depth / 2 + 0.6,
        0.55, 7.1, 0.55, '#d0dad5')
    }
  }
  for (const [index, window] of building.windows.entries()) {
    const x = building.x + window.offsetX
    const z = building.z + window.offsetZ
    const width = window.face === 'x' ? 0.1 : window.width
    const depth = window.face === 'x' ? window.width : 0.1
    add(`window-frame:${index}`, 'trim', x, window.y, z,
      width + (window.face === 'z' ? 0.18 : 0), window.height + 0.2,
      depth + (window.face === 'x' ? 0.18 : 0), '#394f60')
    add(`window:${index}`, window.light === 0 ? 'darkWindow' : 'accent',
      x + (window.face === 'x' ? 0.045 : 0), window.y,
      z + (window.face === 'z' ? 0.045 : 0), width, window.height, depth,
      window.light === 1 ? '#e4ad78' : window.light === 2 ? '#7db9c6' : '#26475a')
  }
  add('entry', 'darkWindow', building.entrance.x, 1.9, building.entrance.z,
    1.65, 2.7, 0.16, '#24485b')
  if (building.kind === 'commercial' || building.kind === 'corner' || building.kind === 'tower') {
    add('sign', 'accent', building.x, 4.6, building.z + building.depth * 0.47,
      Math.min(4.8, building.width * 0.45), 0.25, 0.2,
      hashSeed(`${configSeed}:${building.id}:sign`) % 3 === 0 ? '#84bdc6' : '#dba976')
  }
  return boxes
}

/** Small route-first fixture; the full world uses the same connector construction. */
export function generateVerticalProofWorld(): WorldModelV2 {
  return generateWorldV2({ ...DEFAULT_WORLD_CONFIG_V2, seed: 'shadow-city-vertical-proof-01' }, true)
}

export function generateWorldV2(config: WorldConfigV2 = DEFAULT_WORLD_CONFIG_V2,
  proofOnly = false): WorldModelV2 {
  if (config.version !== 2 || config.generatorVersion !== 'district-world-v1' ||
    !config.seed || config.extentMm !== 320_000) throw new Error('Invalid v2 world configuration')
  const builder = new WorldBuilder()
  const districts = [
    ['residential-west', 'residential', -92, 0, 130, 185],
    ['commercial-east', 'commercial', 82, 0, 130, 145],
    ['mixed-south', 'mixedUse', 26, 104, 250, 95],
    ['transport-north', 'transport', -90, 104, 125, 90],
    ['civic-northwest', 'public', -75, -100, 155, 100],
  ] as const
  for (const [id, kind, x, z, width, depth] of districts) {
    builder.districts.push({ id, kind, center: { x: mm(x), z: mm(z) },
      widthMm: mm(width), depthMm: mm(depth) })
  }
  builder.surface(surface('ground', 'L0', null, rect(-160, 160, -160, 160), GROUND_Y))
  builder.surface(surface('skybridge', 'L1', 'skybridge-walkway', rect(-10, 55, -3, 3), UPPER_Y))
  builder.surface(surface('galleria-l0', 'L0', 'central-galleria', rect(50, 105, -34, 34), GROUND_Y, true))
  builder.surface({ ...surface('galleria-l1', 'L1', 'central-galleria', rect(50, 105, -34, 34), UPPER_Y, true),
    blockedPolygonsXZ: [rect(65, 85, -10, 10)] })
  builder.surface(surface('connector:west-stair', 'L0-L1', null, rect(-17, -7, -17, 2), GROUND_Y))
  builder.surface(surface('connector:east-ramp', 'L0-L1', null, rect(7, 17, -2, 57), GROUND_Y))
  builder.surface(surface('connector:galleria-stair', 'L0-L1', 'central-galleria',
    rect(53, 57, -24, 24), GROUND_Y, true))
  builder.surface(surface('connector:galleria-escalator', 'L0-L1', 'central-galleria',
    rect(93, 97, -24, 24), GROUND_Y, true))
  for (const level of ['l0', 'l1'] as const) for (const type of ['retail', 'cafe'] as const) {
    const x = type === 'retail' ? 75 : 95
    const placeId = `galleria-${type}-${level}`
    builder.surface(surface(`galleria-shop-${type}-${level}`, level.toUpperCase(),
      placeId, rect(x - 5, x + 5, -33, -24), level === 'l0' ? GROUND_Y : UPPER_Y, true))
  }

  const groundId = (x: number, z: number) => `ground:${x}:${z}`
  const groundExists = (x: number, z: number) => !(x >= 55 && x <= 95 && z >= -15 && z <= 15)
  for (const x of NAV_X) for (const z of NAV_Z) {
    if (groundExists(x, z)) builder.node(groundId(x, z), point(x, 0.25, z), 'ground')
  }
  for (const z of NAV_Z) for (let index = 1; index < NAV_X.length; index += 1) {
    const a = NAV_X[index - 1]
    const b = NAV_X[index]
    if (!groundExists(a, z) || !groundExists(b, z)) continue
    if (a === -9 && b === 9 && z !== -55 && z !== 55) continue
    addEdge(builder, `walk:x:${a}:${b}:${z}`, groundId(a, z), groundId(b, z),
      a === -9 && b === 9 ? 'crossing' : 'walk')
  }
  for (const x of NAV_X) for (let index = 1; index < NAV_Z.length; index += 1) {
    const a = NAV_Z[index - 1]
    const b = NAV_Z[index]
    if (!groundExists(x, a) || !groundExists(x, b)) continue
    addEdge(builder, `walk:z:${x}:${a}:${b}`, groundId(x, a), groundId(x, b))
  }

  // The two street crossings remain alternatives to the elevated route.
  builder.node('bridge:west', point(-9, 5.5, 0), 'skybridge')
  builder.node('bridge:east', point(9, 5.5, 0), 'skybridge')
  builder.node('bridge:mall-approach', point(50, 5.5, 0), 'skybridge')
  addEdge(builder, 'bridge:deck', 'bridge:west', 'bridge:east', 'walk', { surfaceId: 'skybridge' })
  addEdge(builder, 'bridge:approach', 'bridge:east', 'bridge:mall-approach', 'walk', { surfaceId: 'skybridge' })
  addEdge(builder, 'connector:west-stair', groundId(-15, -15), 'bridge:west', 'stair', {
    surfaceId: null, connectorId: 'west-stair', accessId: 'bridge-entry',
    path: [point(-15, 0.25, -15), point(-13, 2.75, -8), point(-9, 5.5, 0)],
  })
  addEdge(builder, 'connector:east-ramp', 'bridge:east', groundId(15, 55), 'ramp', {
    surfaceId: null, connectorId: 'east-ramp', accessId: 'bridge-entry',
    path: [point(9, 5.5, 0), point(15, 4.2, 15), point(9, 2.1, 35), point(15, 0.25, 55)],
  })
  builder.connectors.push(
    { id: 'west-stair', kind: 'stair', lowerSurfaceId: 'ground', upperSurfaceId: 'skybridge',
      edgeIds: ['connector:west-stair'], capacity: 12 },
    { id: 'east-ramp', kind: 'ramp', lowerSurfaceId: 'ground', upperSurfaceId: 'skybridge',
      edgeIds: ['connector:east-ramp'], capacity: 15 },
  )
  addPlace(builder, {
    id: 'skybridge-walkway', name: 'Avenue Skybridge', kind: 'walkway',
    districtId: 'mixed-south', surfaceIds: ['skybridge'],
    accessNodeIds: ['bridge:west', 'bridge:east'],
    slotNodeIds: ['bridge:west', 'bridge:east'], activityTags: ['transfer', 'leisure'],
    openingHours: [{ openMinute: 0, closeMinute: 1440 }],
    capacity: 2, attractiveness: 0.28, typicalVisitTicks: [5, 15],
  })

  builder.node('galleria:l1:entry', point(55, 5.5, 0), 'galleria-l1')
  addEdge(builder, 'portal:galleria-upper', 'bridge:mall-approach', 'galleria:l1:entry', 'portal', {
    surfaceId: null, accessId: 'mall-entry', accessIds: ['mall-entry', 'bridge-entry'],
  })
  const ring: readonly [number, number][] = [[55, -22], [75, -22], [95, -22],
    [95, 22], [75, 22], [55, 22]]
  for (const level of ['l0', 'l1'] as const) {
    const y = level === 'l0' ? 0.25 : 5.5
    const surfaceId = level === 'l0' ? 'galleria-l0' : 'galleria-l1'
    for (const [x, z] of ring) builder.node(`galleria:${level}:${x}:${z}`, point(x, y, z), surfaceId)
    for (let index = 1; index < ring.length; index += 1) {
      const [ax, az] = ring[index - 1]
      const [bx, bz] = ring[index]
      addEdge(builder, `galleria:${level}:corridor:${index}`, `galleria:${level}:${ax}:${az}`,
        `galleria:${level}:${bx}:${bz}`, 'walk', { surfaceId })
    }
    addEdge(builder, `galleria:${level}:ring-close`, 'galleria:' + level + ':55:22',
      'galleria:' + level + ':55:-22', 'walk', { surfaceId })
  }
  addEdge(builder, 'galleria:l1:entry-north', 'galleria:l1:entry', 'galleria:l1:55:-22',
    'walk', { surfaceId: 'galleria-l1' })
  addEdge(builder, 'galleria:l1:entry-south', 'galleria:l1:entry', 'galleria:l1:55:22',
    'walk', { surfaceId: 'galleria-l1' })
  builder.node('galleria:l0:outside', point(75, 0.25, 38), 'ground')
  builder.node('galleria:l0:entry', point(75, 0.25, 25), 'galleria-l0')
  addEdge(builder, 'galleria:outside-path', groundId(95, 55), 'galleria:l0:outside')
  addEdge(builder, 'portal:galleria-ground', 'galleria:l0:outside', 'galleria:l0:entry',
    'portal', { surfaceId: null, accessId: 'mall-entry' })
  addEdge(builder, 'galleria:l0:entry-corridor', 'galleria:l0:entry', 'galleria:l0:75:22',
    'walk', { surfaceId: 'galleria-l0' })
  addEdge(builder, 'connector:galleria-stair', 'galleria:l0:55:22',
    'galleria:l1:55:-22', 'stair', {
      surfaceId: null, connectorId: 'galleria-stair',
      path: [point(55, 0.25, 22), point(55, 2.75, 0), point(55, 5.5, -22)],
    })
  addEdge(builder, 'connector:galleria-escalator', 'galleria:l0:95:22',
    'galleria:l1:95:-22', 'escalator', {
      surfaceId: null, connectorId: 'galleria-escalator', direction: 'forward',
      accessId: 'galleria-escalator',
      path: [point(95, 0.25, 22), point(95, 2.75, 0), point(95, 5.5, -22)],
    })
  builder.connectors.push(
    { id: 'galleria-stair', kind: 'stair', lowerSurfaceId: 'galleria-l0',
      upperSurfaceId: 'galleria-l1', edgeIds: ['connector:galleria-stair'], capacity: 12 },
    { id: 'galleria-escalator', kind: 'escalator', lowerSurfaceId: 'galleria-l0',
      upperSurfaceId: 'galleria-l1', edgeIds: ['connector:galleria-escalator'], capacity: 10 },
  )

  addPlace(builder, {
    id: 'central-galleria', name: 'Central Galleria', kind: 'mall', districtId: 'commercial-east',
    surfaceIds: ['galleria-l0', 'galleria-l1'],
    accessNodeIds: ['galleria:l0:entry', 'galleria:l1:entry'],
    slotNodeIds: ring.flatMap(([x, z]) => [`galleria:l0:${x}:${z}`, `galleria:l1:${x}:${z}`]),
    activityTags: ['shop', 'eat', 'leisure'],
    openingHours: [{ openMinute: 8 * 60, closeMinute: 22 * 60 }],
    capacity: 12, attractiveness: 0.95, typicalVisitTicks: [40, 110],
  })
  for (const level of ['l0', 'l1'] as const) for (const type of ['retail', 'cafe'] as const) {
    const x = type === 'retail' ? 75 : 95
    const y = level === 'l0' ? 0.25 : 5.5
    const surfaceId = `galleria-shop-${type}-${level}`
    const placeId = `galleria-${type}-${level}`
    const nodeId = `shop:${type}:${level}:entry`
    builder.node(nodeId, point(x, y, -28), surfaceId)
    addEdge(builder, `portal:${nodeId}`, `galleria:${level}:${x}:-22`, nodeId,
      'portal', { surfaceId: null, accessId: 'mall-entry' })
    const slots = [-2, 0, 2].map((offset, index) => {
      const id = `shop:${type}:${level}:slot:${index}`
      builder.node(id, point(x + offset, y, -30), surfaceId)
      addEdge(builder, `shop-access:${type}:${level}:${index}`, nodeId, id,
        'walk', { surfaceId })
      return id
    })
    addPlace(builder, { id: placeId, name: `${level.toUpperCase()} ${type === 'cafe' ? 'Atrium Café' : 'Arcade Shop'}`,
      kind: type, districtId: 'commercial-east', surfaceIds: [surfaceId],
      accessNodeIds: [nodeId], slotNodeIds: slots,
      activityTags: type === 'cafe' ? ['eat', 'leisure'] : ['shop'],
      openingHours: [{ openMinute: 8 * 60, closeMinute: 22 * 60 }],
      capacity: slots.length, attractiveness: type === 'cafe' ? 0.86 : 0.79,
      typicalVisitTicks: [25, 65] })
    builder.resources.push({ id: `resource:${placeId}`, placeId, surfaceId,
      position: point(x, y, -30), kind: 'retailStock' })
  }
  const homeSites = [
    ['west-court-a', -95, -135, -109, -115],
    ['west-court-b', -95, -95, -109, -75],
    ['west-court-c', -95, -15, -109, -35],
    ['west-court-d', -95, 15, -109, 35],
    ['west-court-e', -95, 95, -109, 75],
    ['west-court-f', -95, 135, -109, 115],
    ['north-court-a', -55, -135, -69, -115],
    ['north-court-b', -55, 15, -69, 35],
    ['south-court-a', 15, 95, 30, 75],
    ['south-court-b', 15, 135, 30, 115],
  ] as const
  const simplePlaces = [
    ['civic-plaza', 'plaza', 'Civic Plaza', -55, -55, ['leisure'], 16, 0.74],
    ['north-park', 'park', 'North Park', -95, 95, ['leisure'], 16, 0.66],
    ['transport-hub', 'transit', 'North Interchange', -55, 95, ['transfer'], 12, 0.72],
    ['workplace-west', 'workplace', 'West Offices', -15, -95, ['work'], 12, 0.7],
    ['workplace-east', 'workplace', 'East Offices', 95, -55, ['work'], 12, 0.78],
    ['street-cafe', 'cafe', 'South Café', -15, 95, ['eat', 'leisure'], 8, 0.65],
    ['south-retail', 'retail', 'South Arcade', 55, 95, ['shop'], 10, 0.68],
  ] as const
  for (const [id, x, z, interiorX, interiorZ] of homeSites) {
    const placeId = `home:${id}`
    const surfaceId = `${placeId}:interior`
    const entryId = `${placeId}:entry`
    builder.surface(surface(surfaceId, 'L0', placeId,
      rect(interiorX - 3.6, interiorX + 3.6, interiorZ - 9, interiorZ + 9), GROUND_Y, true))
    builder.node(entryId, point(interiorX, 0.25, interiorZ), surfaceId)
    addEdge(builder, `portal:${placeId}`, groundId(x, z), entryId, 'portal', { surfaceId: null })
    const slots = Array.from({ length: 20 }, (_, index) => {
      const slotId = `${placeId}:slot:${index}`
      const sx = interiorX + (index % 4 - 1.5) * 1.35
      const sz = interiorZ + (Math.floor(index / 4) - 2) * 3.2
      builder.node(slotId, point(sx, 0.25, sz), surfaceId)
      addEdge(builder, `access:${slotId}`, entryId, slotId, 'walk', { surfaceId })
      return slotId
    })
    addPlace(builder, { id: placeId, name: id.replaceAll('-', ' '), kind: 'home',
      districtId: x < -20 ? 'residential-west' : 'mixed-south',
      surfaceIds: [surfaceId], accessNodeIds: [entryId], slotNodeIds: slots,
      activityTags: ['home'], openingHours: [{ openMinute: 0, closeMinute: 1440 }],
      capacity: slots.length, attractiveness: 0.5, typicalVisitTicks: [90, 230] })
  }
  for (const [id, kind, name, x, z, tags, capacity, attractiveness] of simplePlaces) {
    const nodeId = groundId(x, z)
    const interior = id === 'workplace-west' ? [-29, -75, 3] :
      id === 'workplace-east' ? [82, -75, 8] :
        id === 'street-cafe' ? [-29, 75, 3] :
          id === 'south-retail' ? [66.5, 75, 5] : null
    const interiorSurfaceId = interior ? `${id}-l0` : null
    if (interior && interiorSurfaceId) {
      builder.surface(surface(interiorSurfaceId, 'L0', id,
        rect(interior[0] - interior[2], interior[0] + interior[2],
          interior[1] - 10, interior[1] + 10),
        GROUND_Y, true))
      builder.node(`interior:${id}:entry`, point(interior[0], 0.25, interior[1]), interiorSurfaceId)
      addEdge(builder, `portal:${id}`, nodeId, `interior:${id}:entry`, 'portal',
        { surfaceId: null })
    }
    const slotNodeIds = interior && interiorSurfaceId
      ? [-2, -0.7, 0.7, 2].flatMap((dx) => [-6, -2, 2, 6].map((dz) => [dx, dz]))
        .map(([dx, dz], index) => {
          const slotId = `interior:${id}:slot:${index}`
          builder.node(slotId, point(interior[0] + dx, 0.25, interior[1] + dz), interiorSurfaceId)
          addEdge(builder, `interior-access:${id}:${index}`, `interior:${id}:entry`, slotId,
            'walk', { surfaceId: interiorSurfaceId })
          return slotId
        }) :
      [-6, -2, 2, 6].flatMap((dx) => [-6, -2, 2, 6].map((dz) => [dx, dz])).map(([dx, dz], index) => {
        const slotId = `slot:${id}:${index}`
        builder.node(slotId, point(x + dx, 0.25, z + dz), 'ground')
        addEdge(builder, `slot-access:${id}:${index}`, nodeId, slotId)
        return slotId
      })
    addPlace(builder, {
      id, name, kind, districtId: kindAt(x, z) === 'commercial' ? 'commercial-east' :
        x < -20 ? 'residential-west' : 'mixed-south',
      surfaceIds: [interiorSurfaceId ?? 'ground'],
      accessNodeIds: interiorSurfaceId ? [`interior:${id}:entry`] : [nodeId], slotNodeIds,
      activityTags: tags, openingHours: kind === 'plaza' || kind === 'park'
        ? [{ openMinute: 0, closeMinute: 1440 }] : [{ openMinute: 6 * 60, closeMinute: 23 * 60 }],
      capacity: Math.min(capacity, slotNodeIds.length),
      attractiveness, typicalVisitTicks: kind === 'workplace' ? [100, 300] : [20, 80],
    })
  }
  for (const [id, placeId, surfaceId, position, kind] of [
    ['stock-east', 'central-galleria', 'galleria-l1', point(75, 5.5, -22), 'retailStock'],
    ['stock-ground', 'central-galleria', 'galleria-l0', point(75, 0.25, 22), 'retailStock'],
    ['locker-north', 'transport-hub', 'ground', point(-55, 0.25, 95), 'transitLocker'],
    ['fixture-plaza', 'civic-plaza', 'ground', point(-55, 0.25, -55), 'streetFixture'],
  ] as const) builder.resources.push({ id, placeId, surfaceId, position, kind })

  const roadNodes: WorldModelV2['roadNodes'][number][] = []
  const roadEdges: WorldModelV2['roadEdges'][number][] = []
  for (const x of ROAD_X) for (const z of ROAD_Z) {
    roadNodes.push({ id: `road:${x}:${z}`, position: { x: mm(x), z: mm(z) } })
  }
  for (const z of ROAD_Z) for (let index = 1; index < ROAD_X.length; index += 1) {
    roadEdges.push({ id: `road:x:${ROAD_X[index - 1]}:${ROAD_X[index]}:${z}`,
      from: `road:${ROAD_X[index - 1]}:${z}`, to: `road:${ROAD_X[index]}:${z}`,
      widthMm: ROAD_X[index] === 0 || ROAD_X[index - 1] === 0 ? 8_800 : 5_500 })
  }
  for (const x of ROAD_X) for (let index = 1; index < ROAD_Z.length; index += 1) {
    const a = ROAD_Z[index - 1]
    const b = ROAD_Z[index]
    if (x === 40 && a === -60 && b === 60) continue
    roadEdges.push({ id: `road:z:${x}:${a}:${b}`,
      from: `road:${x}:${a}`, to: `road:${x}:${b}`,
      widthMm: x === 0 ? 8_800 : 5_500 })
  }

  const boxes = builder.boxes
  boxes.push(box('civic-plaza-paving', 'floor', point(-55, 0.13, -55),
    point(27, 0.16, 27), '#5e777e', { placeId: 'civic-plaza', levelId: 'L0' }))
  boxes.push(box('civic-plaza-centre', 'trim', point(-55, 0.42, -55),
    point(1.8, 0.48, 1.8), '#a4b2ad', { placeId: 'civic-plaza', levelId: 'L0' }))
  boxes.push(box('north-park-lawn', 'floor', point(-95, 0.12, 95),
    point(27, 0.14, 27), '#405d61', { placeId: 'north-park', levelId: 'L0' }))
  boxes.push(box('bridge-deck', 'floor', point(23, 5.32, 0), point(66, 0.36, 4.8), '#637b89',
    { levelId: 'L1', surfaceId: 'skybridge' }))
  for (const side of [-1, 1]) {
    boxes.push(box(`bridge-rail-${side}`, 'rail', point(23, 6.12, side * 2.36),
      point(66, 1.25, 0.16), '#91a4a8', { levelId: 'L1' }))
  }
  for (let index = 0; index < 14; index += 1) {
    const t = (index + 0.5) / 14
    boxes.push(box(`west-stair-step-${index}`, 'step', point(-15 + t * 6, 0.25 + t * 5.25 - 0.11,
      -15 + t * 15), point(2.9, 0.22, 1.1), '#627582',
      { surfaceId: 'connector:west-stair' }))
  }
  for (const side of [-1, 1]) {
    boxes.push(box(`west-stair-rail-${side}`, 'rail', point(-12 + side * 1.5, 3.35, -7.5),
      point(0.12, 0.12, 17.5), '#9aadb2',
      { rotationX: -Math.atan2(5.25, 16.2) }))
  }
  const rampPath = [point(9, 5.5, 0), point(15, 4.2, 15), point(9, 2.1, 35), point(15, 0.25, 55)]
  rampPath.slice(1).forEach((end, index) => {
    const start = rampPath[index]
    const dx = (end.x - start.x) / 1000
    const dz = (end.z - start.z) / 1000
    boxes.push(box(`east-ramp-${index}`, 'floor', {
      x: Math.round((start.x + end.x) / 2), y: Math.round((start.y + end.y) / 2) - 120,
      z: Math.round((start.z + end.z) / 2),
    }, point(3.2, 0.24, Math.hypot(dx, dz)), '#657b86',
    { rotationY: Math.atan2(dx, dz), rotationX: -Math.atan2((end.y - start.y) / 1000, Math.hypot(dx, dz)),
      surfaceId: 'connector:east-ramp' }))
    for (const side of [-1, 1]) {
      const normalX = dz / Math.hypot(dx, dz)
      const normalZ = -dx / Math.hypot(dx, dz)
      boxes.push(box(`east-ramp-rail-${index}-${side}`, 'rail',
        { x: Math.round((start.x + end.x) / 2 + side * normalX * 1_550),
          y: Math.round((start.y + end.y) / 2 + 700),
          z: Math.round((start.z + end.z) / 2 + side * normalZ * 1_550) },
        point(0.11, 0.11, Math.hypot(dx, dz)), '#9aadb2',
        { rotationY: Math.atan2(dx, dz),
          rotationX: -Math.atan2((end.y - start.y) / 1000, Math.hypot(dx, dz)) }))
    }
  })

  // The atrium is open at L1; perimeter slabs carry actual upper-floor routes.
  boxes.push(box('galleria-ground-floor', 'floor', point(77.5, 0.12, 0), point(55, 0.24, 68),
    '#4a626d', { placeId: 'central-galleria', levelId: 'L0', surfaceId: 'galleria-l0' }))
  for (const [id, x, z, width, depth] of [
    ['north', 77.5, -22, 55, 24], ['south', 77.5, 22, 55, 24],
    ['west', 55, 0, 10, 20], ['east', 100, 0, 10, 20],
  ] as const) {
    boxes.push(box(`galleria-upper-${id}`, 'floor', point(x, 5.38, z), point(width, 0.24, depth),
      '#607989', { placeId: 'central-galleria', levelId: 'L1', surfaceId: 'galleria-l1' }))
  }
  for (let index = 0; index < 22; index += 1) {
    const fraction = (index + 0.5) / 22
    boxes.push(box(`galleria-stair-step-${index}`, 'step', point(55, 0.25 + fraction * 5.25,
      22 - fraction * 44), point(2.8, 0.16, 1.9), '#8da2aa',
    { surfaceId: 'connector:galleria-stair', placeId: 'central-galleria' }))
  }
  boxes.push(box('galleria-escalator-tread', 'step', point(95, 2.65, 0),
    point(2.7, 0.3, 44.3), '#8397a1', { rotationX: Math.atan2(5.25, 44),
      surfaceId: 'connector:galleria-escalator', placeId: 'central-galleria' }))
  for (const [id, x] of [['left', 93.45], ['right', 96.55]] as const) {
    boxes.push(box(`galleria-escalator-rail-${id}`, 'rail', point(x, 3.45, 0),
      point(0.13, 0.16, 44.3), '#b4c4c6', { rotationX: Math.atan2(5.25, 44),
        surfaceId: 'connector:galleria-escalator', placeId: 'central-galleria' }))
  }
  for (const [id, x, z, width, depth] of [
    ['north', 75, -10.2, 20.3, 0.12], ['south', 75, 10.2, 20.3, 0.12],
    ['west', 64.8, 0, 0.12, 20.3], ['east', 85.2, 0, 0.12, 20.3],
  ] as const) boxes.push(box(`atrium-rail-${id}`, 'rail', point(x, 6.3, z),
    point(width, 0.12, depth), '#a4b6b8', { placeId: 'central-galleria', levelId: 'L1' }))
  for (const [id, x, z, width, depth] of [
    ['north', 77.5, -35, 55, 1], ['east', 105, 0, 1, 70],
    ['south-left', 60, 35, 20, 1], ['south-right', 95, 35, 20, 1],
  ] as const) {
    boxes.push(box(`galleria-wall-${id}`, 'building', point(x, 5.6, z), point(width, 10.7, depth),
      '#42586a', { placeId: 'central-galleria' }))
  }
  for (const [id, x, z, width, depth] of [
    ['north', 77.5, -22, 55, 25], ['south', 77.5, 22, 55, 25],
  ] as const) boxes.push(box(`galleria-roof-${id}`, 'roof', point(x, 11.3, z),
    point(width, 0.45, depth), '#354858', { roofFor: 'central-galleria', levelId: 'L1' }))
  boxes.push(box('galleria-atrium-light', 'accent', point(75, 0.27, 0), point(16, 0.04, 13),
    '#748f93', { placeId: 'central-galleria' }))
  for (const [site, x, z] of [
    ['plaza-north', -55, -68], ['plaza-south', -55, -42],
    ['plaza-east', -42, -55], ['plaza-west', -68, -55],
    ['galleria-entry', 75, 41], ['bridge-west', -17, -18],
    ['park-north', -95, 108], ['transit', -55, 108],
  ] as const) {
    boxes.push(box(`lamp:${site}:pole`, 'furniture', point(x, 2.1, z),
      point(0.16, 3.8, 0.16), '#8ca3aa'))
    boxes.push(box(`lamp:${site}:head`, 'accent', point(x, 4.0, z),
      point(0.55, 0.28, 0.55), '#e1b785'))
  }
  for (const [site, x, z] of [
    ['plaza-a', -65, -65], ['plaza-b', -45, -65],
    ['plaza-c', -65, -45], ['plaza-d', -45, -45],
    ['park-a', -104, 104], ['park-b', -86, 104],
  ] as const) {
    boxes.push(box(`tree:${site}:trunk`, 'furniture', point(x, 1.5, z),
      point(0.4, 2.7, 0.4), '#6a6b60'))
    boxes.push(box(`tree:${site}:canopy`, 'furniture', point(x, 3.4, z),
      point(3.2, 2.4, 3.2), '#3c6c67'))
  }
  for (const level of ['l0', 'l1'] as const) for (const type of ['retail', 'cafe'] as const) {
    const x = type === 'retail' ? 75 : 95
    const y = level === 'l0' ? 0.25 : 5.5
    const placeId = `galleria-${type}-${level}`
    for (const side of [-1, 1]) {
      boxes.push(box(`${placeId}:front:${side}`, 'trim', point(x + side * 3.15, y + 2.15, -24),
        point(3.7, 3.8, 0.18), '#91acb4', { placeId, levelId: level.toUpperCase() }))
      boxes.push(box(`${placeId}:side:${side}`, 'building', point(x + side * 4.9, y + 2.1, -29),
        point(0.2, 3.75, 9.3), '#597583', { placeId, levelId: level.toUpperCase() }))
    }
    boxes.push(box(`${placeId}:counter`, 'furniture', point(x, y + 0.65, -31.8),
      point(7.8, 1.3, 0.65), '#9aabb0', { placeId, levelId: level.toUpperCase() }))
    boxes.push(box(`${placeId}:sign`, 'accent', point(x, y + 3.1, -32.9),
      point(4.5, 0.34, 0.18), type === 'retail' ? '#84c2c6' : '#e4b37d',
      { placeId, levelId: level.toUpperCase() }))
  }

  if (!proofOnly) {
    const blockedGround: (readonly GroundPointMm[])[] = [rect(50, 105, -34, 34)]
    const lotX = [-115, -75, -35, 30, 75, 115]
    const lotZ = [-115, -75, -35, 35, 75, 115]
    const lotWidths = [24, 24, 24, 10, 34, 34]
    for (const [column, x] of lotX.entries()) for (const [row, z] of lotZ.entries()) {
      if ((x === 75 || x === 115) && Math.abs(z) === 35) continue
      if (x === -35 && z === -35 || x === -75 && z === 75 || x === -35 && z === 75) continue
      const district = kindAt(x, z)
      if (district === 'public' && hashSeed(`${config.seed}:open:${x}:${z}`) % 7 === 0) continue
      const districtId = x === -75 && z === -35 ? 'civic-northwest' :
        district === 'residential' ? 'residential-west' :
        district === 'commercial' ? 'commercial-east' : district === 'transport' ? 'transport-north' :
          district === 'public' ? 'civic-northwest' : 'mixed-south'
      const count = lotWidths[column] > 20 &&
        !(x === -75 && z === -35) && !(x === 75 && z === -75) &&
        !(x === -35 && z === -75) ? 2 : 1
      for (let parcelIndex = 0; parcelIndex < count; parcelIndex += 1) {
        const width = lotWidths[column] / count - 1.3
        const px = x - lotWidths[column] / 2 + (parcelIndex + 0.5) * lotWidths[column] / count
        const id = `${districtId}:${column}:${row}:${parcelIndex}`
        const parcel: Parcel = { id, blockId: `${districtId}:${column}:${row}`,
          x: px, z, width, depth: 24 }
        const oldDistrict: DistrictKind = x === -75 && z === -35 ? 'civic' :
          district === 'commercial' || district === 'mixedUse' ? 'core' :
            district === 'transport' ? 'works' : district === 'public' ? 'civic' : 'residential'
        const kindColumn = x === 75 && z === -75 ? 4 : parcelIndex > 0 && column === 2 ? 5 : column
        const kindRow = x === 75 && z === -75 ? 2 : row
        const building = createBuilding(parcel, oldDistrict, kindColumn, kindRow,
          createRandom(`${config.seed}:district:${districtId}:parcel:${id}`))
        for (const mass of building.masses.filter((item) => item.baseY < 2)) {
          blockedGround.push(rect(building.x + mass.offsetX - mass.width / 2,
            building.x + mass.offsetX + mass.width / 2,
            building.z + mass.offsetZ - mass.depth / 2,
            building.z + mass.offsetZ + mass.depth / 2))
        }
        boxes.push(...architecturalBoxes(building, districtId, config.seed))
      }
    }
    builder.surfaces[0] = { ...builder.surfaces[0], blockedPolygonsXZ: blockedGround }
  }
  builder.buildValidation()
  return {
    version: 2, config: { ...config },
    bounds: { minX: -160_000, maxX: 160_000, minZ: -160_000, maxZ: 160_000, maxY: 80_000 },
    districts: builder.districts, roadNodes, roadEdges,
    surfaces: builder.surfaces, navNodes: builder.nodes, navEdges: builder.edges,
    connectors: builder.connectors, places: builder.places, resources: builder.resources,
    boxes,
  }
}
