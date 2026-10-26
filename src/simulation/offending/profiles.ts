import { createRandomStream, hashSeed, nextRandom } from '../rng'
import type {
  BehaviourGroup,
  CitizenProfiles,
  OffendingConfig,
  OffendingProfile,
  OffenceSeverity,
  OffenderDynamicState,
} from './types'

const GROUPS: readonly BehaviourGroup[] = ['minorSpecialist', 'seriousSpecialist', 'generalist']
const SEVERITIES: readonly OffenceSeverity[] = ['minor', 'serious']
const DISTRICTS = ['civic', 'core', 'residential', 'works'] as const
const TIME_BANDS = ['day', 'evening', 'night'] as const

function finiteBetween(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum
}

export function validateOffendingConfig(config: OffendingConfig): void {
  if (config.version !== 'offender-choice-v1' || !config.offendingSeed ||
      !Number.isSafeInteger(config.startHour) || config.startHour < 0 || config.startHour > 23 ||
      !finiteBetween(config.propensityCorrelation, -0.99, 0.99) ||
      !finiteBetween(config.sensitivitySpread, 0, 1) ||
      !finiteBetween(config.publicSpaceExposureMultiplier, 0, 2) ||
      !finiteBetween(config.minorCrowdFloor, 0, 1) ||
      !Number.isSafeInteger(config.seriousMinimumNearby) ||
      config.seriousMinimumNearby < 0 || config.seriousMinimumNearby > 200 ||
      !Number.isSafeInteger(config.nearbySaturation) ||
      config.nearbySaturation < 1 || config.nearbySaturation > 200 ||
      !finiteBetween(config.nearbyRadius, Number.EPSILON, 100) ||
      !Number.isSafeInteger(config.cooldownTicks) ||
      config.cooldownTicks < 0 || config.cooldownTicks > 10_000 ||
      !GROUPS.every((group) => finiteBetween(config.groupShares[group], 0, 1) &&
        SEVERITIES.every((severity) => finiteBetween(config.groupMeanLogPropensity[group][severity], -8, 8))) ||
      Math.abs(GROUPS.reduce((sum, group) => sum + config.groupShares[group], 0) - 1) > 1e-9 ||
      !SEVERITIES.every((severity) =>
        finiteBetween(config.propensitySd[severity], 0, 3) &&
        finiteBetween(config.baseOddsPerEligibleAgentHour[severity], 0, 10_000) &&
        finiteBetween(config.rewardWeight[severity], 0, 4) &&
        finiteBetween(config.riskWeight[severity], 0, 4)) ||
      !DISTRICTS.every((district) =>
        finiteBetween(config.rewardByDistrict[district], 0, 1) &&
        finiteBetween(config.perceivedRiskByDistrict[district], 0, 1) &&
        SEVERITIES.every((severity) => finiteBetween(config.districtExposure[district][severity], 0, 1))) ||
      !TIME_BANDS.every((band) =>
        SEVERITIES.every((severity) => finiteBetween(config.timeBandExposure[band][severity], 0, 1)))) {
    throw new Error('Invalid synthetic offending configuration')
  }
}

/** Fixed key order keeps equivalent configuration objects on the same world run. */
export function canonicalOffendingConfig(config: OffendingConfig) {
  validateOffendingConfig(config)
  const severityPair = (pair: Readonly<Record<OffenceSeverity, number>>) => ({
    minor: pair.minor,
    serious: pair.serious,
  })
  return {
    version: config.version,
    offendingSeed: config.offendingSeed,
    startHour: config.startHour,
    groupShares: {
      minorSpecialist: config.groupShares.minorSpecialist,
      seriousSpecialist: config.groupShares.seriousSpecialist,
      generalist: config.groupShares.generalist,
    },
    groupMeanLogPropensity: {
      minorSpecialist: severityPair(config.groupMeanLogPropensity.minorSpecialist),
      seriousSpecialist: severityPair(config.groupMeanLogPropensity.seriousSpecialist),
      generalist: severityPair(config.groupMeanLogPropensity.generalist),
    },
    propensitySd: severityPair(config.propensitySd),
    propensityCorrelation: config.propensityCorrelation,
    sensitivitySpread: config.sensitivitySpread,
    baseOddsPerEligibleAgentHour: severityPair(config.baseOddsPerEligibleAgentHour),
    districtExposure: {
      civic: severityPair(config.districtExposure.civic),
      core: severityPair(config.districtExposure.core),
      residential: severityPair(config.districtExposure.residential),
      works: severityPair(config.districtExposure.works),
    },
    timeBandExposure: {
      day: severityPair(config.timeBandExposure.day),
      evening: severityPair(config.timeBandExposure.evening),
      night: severityPair(config.timeBandExposure.night),
    },
    publicSpaceExposureMultiplier: config.publicSpaceExposureMultiplier,
    minorCrowdFloor: config.minorCrowdFloor,
    seriousMinimumNearby: config.seriousMinimumNearby,
    nearbySaturation: config.nearbySaturation,
    nearbyRadius: config.nearbyRadius,
    rewardByDistrict: {
      civic: config.rewardByDistrict.civic,
      core: config.rewardByDistrict.core,
      residential: config.rewardByDistrict.residential,
      works: config.rewardByDistrict.works,
    },
    perceivedRiskByDistrict: {
      civic: config.perceivedRiskByDistrict.civic,
      core: config.perceivedRiskByDistrict.core,
      residential: config.perceivedRiskByDistrict.residential,
      works: config.perceivedRiskByDistrict.works,
    },
    rewardWeight: severityPair(config.rewardWeight),
    riskWeight: severityPair(config.riskWeight),
    cooldownTicks: config.cooldownTicks,
  }
}

export function createOffendingRunId(citizenRunId: string, config: OffendingConfig): string {
  if (!citizenRunId) throw new Error('Missing citizen run identifier')
  const key = `offender-choice-v1\u0000${citizenRunId}\u0000${JSON.stringify(canonicalOffendingConfig(config))}`
  return hashSeed(key).toString(16).padStart(8, '0') +
    hashSeed(`offending-world\u0000${key}`).toString(16).padStart(8, '0')
}

function sample(config: OffendingConfig, agentId: string, purpose: string): number {
  return nextRandom(createRandomStream(config.offendingSeed, `profile:${agentId}:${purpose}`)).value
}

function normalSample(config: OffendingConfig, agentId: string, purpose: string): number {
  const first = Math.max(Number.EPSILON, sample(config, agentId, `${purpose}:u`))
  const second = sample(config, agentId, `${purpose}:v`)
  return Math.max(-3, Math.min(3, Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second)))
}

export function createOffendingProfiles(
  citizenProfiles: CitizenProfiles,
  config: OffendingConfig,
): readonly OffendingProfile[] {
  validateOffendingConfig(config)
  const ordered = [...citizenProfiles].sort((a, b) => a.id.localeCompare(b.id))
  if (new Set(ordered.map((profile) => profile.id)).size !== ordered.length) {
    throw new Error('Duplicate citizen profile ID in offending population')
  }
  return ordered.map((citizen) => {
    const selection = sample(config, citizen.id, 'group')
    let cumulative = 0
    let researchGroup: BehaviourGroup = 'generalist'
    for (const group of GROUPS) {
      cumulative += config.groupShares[group]
      if (selection < cumulative) {
        researchGroup = group
        break
      }
    }
    const z1 = normalSample(config, citizen.id, 'propensity-1')
    const z2 = normalSample(config, citizen.id, 'propensity-2')
    const correlated = config.propensityCorrelation * z1 +
      Math.sqrt(1 - config.propensityCorrelation ** 2) * z2
    const means = config.groupMeanLogPropensity[researchGroup]
    return Object.freeze({
      agentId: citizen.id,
      researchGroup,
      logPropensity: Object.freeze({
        minor: means.minor + config.propensitySd.minor * z1,
        serious: means.serious + config.propensitySd.serious * correlated,
      }),
      rewardSensitivity: 1 + config.sensitivitySpread * (2 * sample(config, citizen.id, 'reward') - 1),
      riskSensitivity: 1 + config.sensitivitySpread * (2 * sample(config, citizen.id, 'risk') - 1),
    })
  })
}

export function createInitialOffenderStates(profiles: readonly OffendingProfile[]): readonly OffenderDynamicState[] {
  if (new Set(profiles.map((profile) => profile.agentId)).size !== profiles.length) {
    throw new Error('Duplicate offending profile ID')
  }
  return profiles.map((profile) => Object.freeze({ agentId: profile.agentId, cooldownUntilTick: 0 }))
}
