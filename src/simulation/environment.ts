import { createActivitySlots } from './activitySlots'
import { createNavigationIndex } from './navigation'
import { createRandomStream, hashSeed, nextRandom } from './rng'
import type { AgentProfile, SimulationConfigV2, SimulationEnvironment, StaticCity } from './types'

export const CITIZEN_ENGINE_VERSION = '0.5.2-synthetic-v2-occupancy'

export function validateCitizenConfig(config: SimulationConfigV2): void {
  if (config.version !== 2 || !config.simulationSeed || config.behaviorModel !== 'synthetic-v1' ||
      !Number.isSafeInteger(config.logicalSecondsPerTick) || config.logicalSecondsPerTick <= 0 ||
      !Number.isSafeInteger(config.populationSize) || config.populationSize < 0 || config.populationSize > 200) {
    throw new Error('Invalid citizen simulation configuration')
  }
}

function fingerprintCity(city: StaticCity): string {
  // The checksum guards replay context; the full CityModel remains the authoritative input.
  const canonical = JSON.stringify({
    version: 1,
    seed: city.seed,
    size: city.size,
    roads: city.roads,
    pedestrian: city.pedestrian,
    entrances: city.buildings.map((building) => [building.id, building.entrance]),
  })
  const first = hashSeed(canonical).toString(16).padStart(8, '0')
  const second = hashSeed(`city-v1\u0000${canonical}`).toString(16).padStart(8, '0')
  return `${first}${second}`
}

export function createSimulationEnvironment(city: StaticCity, config: SimulationConfigV2): SimulationEnvironment {
  validateCitizenConfig(config)
  const pedestrianNetwork = city.pedestrian
  const navigation = createNavigationIndex(pedestrianNetwork)
  const activitySlots = createActivitySlots(pedestrianNetwork)
  const buildingById = new Map(city.buildings.map((building) => [building.id, building]))
  const homes = pedestrianNetwork.anchors
    .filter((anchor) => anchor.kind === 'building' && anchor.buildingId &&
      ['residential', 'apartment', 'corner'].includes(buildingById.get(anchor.buildingId)?.kind ?? ''))
    .sort((a, b) => a.id.localeCompare(b.id))
  const fallbackHomes = pedestrianNetwork.anchors
    .filter((anchor) => anchor.kind === 'building')
    .sort((a, b) => a.id.localeCompare(b.id))
  const availableHomes = homes.length > 0 ? homes : fallbackHomes
  const publicAnchorIds = activitySlots
    .filter((slot) => slot.kind !== 'street')
    .map((slot) => slot.anchorId)
    .sort((a, b) => a.localeCompare(b))
  if (config.populationSize > 0 && (availableHomes.length === 0 || publicAnchorIds.length === 0)) {
    throw new Error('Citizen population requires accessible home and public anchors')
  }

  const profiles: AgentProfile[] = []
  for (let index = 0; index < config.populationSize; index += 1) {
    const id = `citizen-${String(index).padStart(4, '0')}`
    const jogPreference = hashSeed(`${config.simulationSeed}\u0000gait:${id}`) / 4294967296
    let rng = createRandomStream(config.simulationSeed, `profile:${id}`)
    const draw = () => {
      const sample = nextRandom(rng)
      rng = sample.state
      return sample.value
    }
    const homeAnchorId = availableHomes[Math.floor(draw() * availableHomes.length)].id
    profiles.push(Object.freeze({
      id,
      homeAnchorId,
      speedUnitsPerLogicalSecond: 0.27 + draw() * 0.16,
      jogPreference,
      firstDepartureTick: 1 + Math.floor(draw() * 120),
      homeDwellTicks: 100 + Math.floor(draw() * 200),
      visitDwellTicks: 25 + Math.floor(draw() * 60),
    }))
  }

  const cityFingerprint = fingerprintCity(city)
  // State compatibility includes every v2 behavior input, including population size.
  // Keep runId separate so adding a citizen does not renumber existing citizens' events.
  const fingerprint = JSON.stringify({
    engineVersion: CITIZEN_ENGINE_VERSION,
    cityFingerprint,
    config: {
      version: config.version,
      simulationSeed: config.simulationSeed,
      logicalSecondsPerTick: config.logicalSecondsPerTick,
      populationSize: config.populationSize,
      behaviorModel: config.behaviorModel,
    },
  })
  const runId = hashSeed(
    `${CITIZEN_ENGINE_VERSION}\u0000${cityFingerprint}\u0000${config.simulationSeed}\u0000${config.logicalSecondsPerTick}\u0000${config.behaviorModel}`,
  ).toString(16).padStart(8, '0')
  return Object.freeze({
    city,
    config: Object.freeze({ ...config }),
    pedestrianNetwork,
    navigation,
    profiles: Object.freeze(profiles),
    publicAnchorIds: Object.freeze(publicAnchorIds),
    activitySlots: Object.freeze(activitySlots),
    fingerprint,
    runId,
  })
}
