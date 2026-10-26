import type { CityBlock } from '../../city/model'
import { syntheticTimeBand } from '../incidents'
import type { CitizenState, StaticCity, WorldPosition } from '../types'
import type { OffendingConfig, OpportunitySnapshot, PedestrianSpatialAnchor } from './types'

const POSITION_TOLERANCE = 1e-4

function nearPosition(a: WorldPosition, b: WorldPosition): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= POSITION_TOLERANCE
}

function nearestBlock(blocks: readonly CityBlock[], position: WorldPosition): CityBlock {
  let nearest: CityBlock | null = null
  let best = Number.POSITIVE_INFINITY
  for (const block of blocks) {
    const dx = Math.max(0, Math.abs(position.x - block.x) - block.width / 2)
    const dz = Math.max(0, Math.abs(position.z - block.z) - block.depth / 2)
    const distance = dx * dx + dz * dz
    if (distance < best || (distance === best && block.id < (nearest?.id ?? ''))) {
      nearest = block
      best = distance
    }
  }
  if (!nearest) throw new Error('Outdoor offending opportunity requires city blocks')
  return nearest
}

function legalOutdoorAnchor(
  citizen: CitizenState,
  edgeById: ReadonlyMap<string, StaticCity['pedestrian']['edges'][number]>,
  nodeById: ReadonlyMap<string, StaticCity['pedestrian']['nodes'][number]>,
  anchorById: ReadonlyMap<string, StaticCity['pedestrian']['anchors'][number]>,
): PedestrianSpatialAnchor | null {
  if (citizen.activity === 'atHome' || citizen.activity === 'planningTrip' ||
      citizen.activity === 'waitingForSpace') return null
  if (![citizen.position.x, citizen.position.y, citizen.position.z].every(Number.isFinite)) {
    throw new Error(`Invalid outdoor citizen position ${citizen.id}`)
  }
  if (citizen.activity === 'atDestination') {
    const anchor = citizen.currentAnchorId && anchorById.get(citizen.currentAnchorId)
    if (!anchor || (anchor.kind !== 'plaza' && anchor.kind !== 'park' &&
        anchor.kind !== 'publicEntrance' && anchor.kind !== 'street')) return null
    const node = nodeById.get(anchor.nodeId)
    if (!node || !nearPosition(citizen.position, { x: node.x, y: node.surfaceY, z: node.z })) {
      throw new Error(`Citizen ${citizen.id} is not at its public pedestrian anchor`)
    }
    return { kind: 'publicAnchor', id: anchor.id }
  }
  const step = citizen.route[citizen.routeIndex]
  if (!step || !Number.isFinite(step.length) || step.length <= 0 ||
      !Number.isFinite(citizen.distanceOnEdge) || citizen.distanceOnEdge < -POSITION_TOLERANCE ||
      citizen.distanceOnEdge > step.length + POSITION_TOLERANCE) {
    throw new Error(`Citizen ${citizen.id} is missing a valid active pedestrian edge`)
  }
  const edge = edgeById.get(step.edgeId)
  const from = nodeById.get(step.fromNodeId)
  const to = nodeById.get(step.toNodeId)
  if (!edge || !from || !to ||
      !((edge.from === from.id && edge.to === to.id) ||
        (edge.from === to.id && edge.to === from.id))) {
    throw new Error(`Citizen ${citizen.id} has an edge outside the pedestrian graph`)
  }
  const fraction = Math.max(0, Math.min(1, citizen.distanceOnEdge / step.length))
  const expected = {
    x: from.x + (to.x - from.x) * fraction,
    y: from.surfaceY + (to.surfaceY - from.surfaceY) * fraction,
    z: from.z + (to.z - from.z) * fraction,
  }
  if (!nearPosition(citizen.position, expected)) {
    throw new Error(`Citizen ${citizen.id} is not on its active pedestrian edge`)
  }
  return { kind: 'edge', id: edge.id }
}

interface OutdoorCitizen {
  readonly citizen: CitizenState
  readonly anchor: PedestrianSpatialAnchor
}

function bucketKey(x: number, z: number, width: number): string {
  return `${Math.floor(x / width)}:${Math.floor(z / width)}`
}

/** Evaluate all agents against one post-movement snapshot before any offence is committed. */
export function evaluateOpportunitiesForTick(
  city: StaticCity,
  citizens: readonly CitizenState[],
  tick: number,
  logicalSecondsPerTick: number,
  config: OffendingConfig,
): readonly OpportunitySnapshot[] {
  if (!Number.isSafeInteger(tick) || tick < 1 ||
      !Number.isSafeInteger(logicalSecondsPerTick) || logicalSecondsPerTick <= 0 ||
      !Number.isFinite(config.nearbyRadius) || config.nearbyRadius <= 0) {
    throw new Error('Invalid offending opportunity input')
  }
  const edgeById = new Map(city.pedestrian.edges.map((edge) => [edge.id, edge]))
  const nodeById = new Map(city.pedestrian.nodes.map((node) => [node.id, node]))
  const anchorById = new Map(city.pedestrian.anchors.map((anchor) => [anchor.id, anchor]))
  const outdoor: OutdoorCitizen[] = []
  const ids = new Set<string>()
  for (const citizen of citizens) {
    if (ids.has(citizen.id)) throw new Error(`Duplicate citizen ID ${citizen.id}`)
    ids.add(citizen.id)
    const anchor = legalOutdoorAnchor(citizen, edgeById, nodeById, anchorById)
    if (anchor) outdoor.push({ citizen, anchor })
  }
  outdoor.sort((a, b) => a.citizen.id.localeCompare(b.citizen.id))
  const width = config.nearbyRadius
  const buckets = new Map<string, OutdoorCitizen[]>()
  for (const member of outdoor) {
    const key = bucketKey(member.citizen.position.x, member.citizen.position.z, width)
    const bucket = buckets.get(key) ?? []
    bucket.push(member)
    buckets.set(key, bucket)
  }
  const timeBand = syntheticTimeBand(tick, logicalSecondsPerTick, config.startHour)
  return outdoor.map(({ citizen, anchor }) => {
    const block = nearestBlock(city.blocks, citizen.position)
    const centerX = Math.floor(citizen.position.x / width)
    const centerZ = Math.floor(citizen.position.z / width)
    const nearbyCitizenIds: string[] = []
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        for (const member of buckets.get(`${centerX + dx}:${centerZ + dz}`) ?? []) {
          if (member.citizen.id === citizen.id) continue
          const distanceX = member.citizen.position.x - citizen.position.x
          const distanceZ = member.citizen.position.z - citizen.position.z
          if (distanceX * distanceX + distanceZ * distanceZ <= width * width) {
            nearbyCitizenIds.push(member.citizen.id)
          }
        }
      }
    }
    nearbyCitizenIds.sort()
    const crowd = Math.min(1, nearbyCitizenIds.length / config.nearbySaturation)
    const minorCrowdFactor = config.minorCrowdFloor + (1 - config.minorCrowdFloor) * crowd
    const seriousCrowdFactor = nearbyCitizenIds.length < config.seriousMinimumNearby ? 0 :
      Math.max(1 / config.nearbySaturation, crowd)
    const publicFactor = block.isPark || block.isPlaza ? config.publicSpaceExposureMultiplier : 1
    const exposureBySeverity = Object.freeze({
      minor: Math.min(1, config.districtExposure[block.district].minor *
        config.timeBandExposure[timeBand].minor * publicFactor * minorCrowdFactor),
      serious: Math.min(1, config.districtExposure[block.district].serious *
        config.timeBandExposure[timeBand].serious * publicFactor * seriousCrowdFactor),
    })
    return Object.freeze({
      agentId: citizen.id,
      tick,
      position: Object.freeze({ ...citizen.position }),
      activity: citizen.activity,
      pedestrianAnchor: Object.freeze(anchor),
      blockId: block.id,
      district: block.district,
      timeBand,
      nearbyCitizenIds: Object.freeze(nearbyCitizenIds),
      nearbyOutdoorCount: nearbyCitizenIds.length,
      exposureBySeverity,
      rewardScore: config.rewardByDistrict[block.district],
      perceivedRiskScore: config.perceivedRiskByDistrict[block.district],
    })
  })
}
