import type { CityBlock } from '../../city/model'
import { createRandomStream, hashSeed, nextRandom } from '../rng'
import type { CitizenState, StaticCity } from '../types'
import type {
  Incident,
  IncidentConfig,
  SimulationConfigV3,
  SyntheticTimeBand,
} from '../v3Types'

export const INCIDENT_GENERATOR_VERSION = '0.4.0-synthetic-opportunity-v1'

type WorldInputs = Pick<SimulationConfigV3, 'citizen' | 'incident'>

function finiteNonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

export function validateIncidentConfig(config: IncidentConfig): void {
  if (config.version !== 'synthetic-opportunity-v1' ||
      !finiteNonnegative(config.baselineRatePerOccupiedBlockHour) ||
      !finiteNonnegative(config.densitySlope) ||
      !Number.isSafeInteger(config.maxDensityCount) || config.maxDensityCount < 1 ||
      !Number.isFinite(config.seriousProbability) || config.seriousProbability < 0 ||
      config.seriousProbability > 1 ||
      !Number.isSafeInteger(config.startHour) || config.startHour < 0 || config.startHour > 23 ||
      !finiteNonnegative(config.publicSpaceMultiplier) ||
      !(['civic', 'core', 'residential', 'works'] as const)
        .every((kind) => finiteNonnegative(config.districtMultipliers[kind])) ||
      !(['day', 'evening', 'night'] as const)
        .every((band) => finiteNonnegative(config.timeBandMultipliers[band]))) {
    throw new Error('Invalid synthetic incident configuration')
  }
}

/** Observation parameters are intentionally absent from this world identifier. */
export function createIncidentWorldRunId(citizenRunId: string, config: IncidentConfig): string {
  validateIncidentConfig(config)
  if (!citizenRunId) throw new Error('Missing citizen run identifier')
  const canonical = JSON.stringify({
    version: config.version,
    baselineRatePerOccupiedBlockHour: config.baselineRatePerOccupiedBlockHour,
    densitySlope: config.densitySlope,
    maxDensityCount: config.maxDensityCount,
    seriousProbability: config.seriousProbability,
    districtMultipliers: {
      civic: config.districtMultipliers.civic,
      core: config.districtMultipliers.core,
      residential: config.districtMultipliers.residential,
      works: config.districtMultipliers.works,
    },
    timeBandMultipliers: {
      day: config.timeBandMultipliers.day,
      evening: config.timeBandMultipliers.evening,
      night: config.timeBandMultipliers.night,
    },
    publicSpaceMultiplier: config.publicSpaceMultiplier,
    startHour: config.startHour,
  })
  const key = `${INCIDENT_GENERATOR_VERSION}\u0000${citizenRunId}\u0000${canonical}`
  return hashSeed(key).toString(16).padStart(8, '0') +
    hashSeed(`incident-world\u0000${key}`).toString(16).padStart(8, '0')
}

export function syntheticTimeBand(
  tick: number,
  logicalSecondsPerTick: number,
  startHour: number,
): SyntheticTimeBand {
  if (!Number.isSafeInteger(tick) || tick < 0 ||
      !Number.isSafeInteger(logicalSecondsPerTick) || logicalSecondsPerTick <= 0 ||
      !Number.isSafeInteger(startHour) || startHour < 0 || startHour > 23) {
    throw new Error('Invalid synthetic time input')
  }
  const hour = Math.floor(((startHour * 3600 + tick * logicalSecondsPerTick) % 86_400) / 3600)
  if (hour >= 7 && hour < 18) return 'day'
  if (hour >= 18 && hour < 23) return 'evening'
  return 'night'
}

function nearestBlock(blocks: readonly CityBlock[], citizen: CitizenState): CityBlock {
  let nearest: CityBlock | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const block of blocks) {
    const dx = Math.max(0, Math.abs(citizen.position.x - block.x) - block.width / 2)
    const dz = Math.max(0, Math.abs(citizen.position.z - block.z) - block.depth / 2)
    const distance = dx * dx + dz * dz
    if (distance < bestDistance || (distance === bestDistance && block.id < (nearest?.id ?? ''))) {
      nearest = block
      bestDistance = distance
    }
  }
  if (!nearest) throw new Error('Incident generation requires city blocks')
  return nearest
}

function keyedSample(worldRunId: string, tick: number, blockId: string, purpose: string): number {
  return nextRandom(createRandomStream(worldRunId, `${tick}\u0000${blockId}\u0000${purpose}`)).value
}

/**
 * One independent Bernoulli trial per occupied block and tick. The source
 * citizen supplies a valid walking coordinate, never an implied offender role.
 */
export function generateIncidentsForTick(
  city: StaticCity,
  citizens: readonly CitizenState[],
  tick: number,
  config: WorldInputs,
  worldRunId: string,
): readonly Incident[] {
  validateIncidentConfig(config.incident)
  if (!Number.isSafeInteger(tick) || tick < 1 ||
      !Number.isSafeInteger(config.citizen.logicalSecondsPerTick) ||
      config.citizen.logicalSecondsPerTick <= 0 || !worldRunId) {
    throw new Error('Invalid incident generation input')
  }
  if (city.blocks.length === 0 || config.incident.baselineRatePerOccupiedBlockHour === 0) return []

  const grouped = new Map<string, CitizenState[]>()
  for (const citizen of citizens) {
    if (citizen.activity !== 'travelling' && citizen.activity !== 'returningHome' &&
        citizen.activity !== 'atDestination') continue
    if (![citizen.position.x, citizen.position.y, citizen.position.z].every(Number.isFinite)) {
      throw new Error(`Invalid outdoor citizen position ${citizen.id}`)
    }
    const block = nearestBlock(city.blocks, citizen)
    const members = grouped.get(block.id) ?? []
    members.push(citizen)
    grouped.set(block.id, members)
  }

  const result: Incident[] = []
  const band = syntheticTimeBand(tick, config.citizen.logicalSecondsPerTick, config.incident.startHour)
  const hoursPerTick = config.citizen.logicalSecondsPerTick / 3600
  for (const block of [...city.blocks].sort((a, b) => a.id.localeCompare(b.id))) {
    const members = grouped.get(block.id)
    if (!members?.length) continue
    members.sort((a, b) => a.id.localeCompare(b.id))
    const densityFactor = 1 + config.incident.densitySlope *
      (Math.min(members.length, config.incident.maxDensityCount) - 1)
    const opportunityMultiplier = densityFactor * config.incident.districtMultipliers[block.district] *
      config.incident.timeBandMultipliers[band] *
      (block.isPlaza || block.isPark ? config.incident.publicSpaceMultiplier : 1)
    const lambda = config.incident.baselineRatePerOccupiedBlockHour * opportunityMultiplier
    if (!Number.isFinite(opportunityMultiplier) || !Number.isFinite(lambda)) {
      throw new Error('Synthetic incident hazard exceeds the finite range')
    }
    const probability = -Math.expm1(-lambda * hoursPerTick)
    if (keyedSample(worldRunId, tick, block.id, 'occurrence') >= probability) continue

    const sourceIndex = Math.floor(keyedSample(worldRunId, tick, block.id, 'position') * members.length)
    const source = members[sourceIndex]
    result.push({
      id: `incident-${worldRunId}-${tick}-${block.id}`,
      occurrenceTick: tick,
      position: { ...source.position },
      blockId: block.id,
      district: block.district,
      type: keyedSample(worldRunId, tick, block.id, 'type') < 0.5 ? 'disruption' : 'safety',
      severity: keyedSample(worldRunId, tick, block.id, 'severity') < config.incident.seriousProbability
        ? 'serious' : 'minor',
      involvedAgentIds: [],
      context: { outdoorPresence: members.length, timeBand: band, opportunityMultiplier },
      provenance: {
        generatorVersion: INCIDENT_GENERATOR_VERSION,
        spatialTrialId: `${tick}:${block.id}`,
        positionSourceCitizenId: source.id,
      },
    })
  }
  return result
}
