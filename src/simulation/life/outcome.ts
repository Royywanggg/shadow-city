import { hashSeed } from '../rng'
import type { OffenceV5 } from '../v5Types'
import type { InjurySeverityV1, LifeScenarioConfigV1 } from './types'

const unit = (key: string): number => (hashSeed(key) + 0.5) / 0x1_0000_0000
const probability = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= 1

export function validateLifeConfigV1(config: LifeScenarioConfigV1): void {
  if (config.version !== 'life-v1' || !config.seed ||
    !['minor', 'serious'].every((severity) => {
      const key = severity as 'minor' | 'serious'
      const weights = config.severityWeights[key]
      return probability(config.assaultProbability[key]) &&
        probability(config.injuryProbability[key]) &&
        ['minor', 'serious', 'critical'].every((kind) =>
          probability(weights[kind as InjurySeverityV1])) &&
        Math.abs(weights.minor + weights.serious + weights.critical - 1) < 1e-9
    }) || !probability(config.fatalProbabilityCritical) ||
    !Number.isFinite(config.impairedSpeedFactor) ||
    config.impairedSpeedFactor <= 0 || config.impairedSpeedFactor > 1 ||
    !['minor', 'serious', 'critical'].every((kind) =>
      Number.isSafeInteger(config.recoveryTicks[kind as InjurySeverityV1]) &&
      config.recoveryTicks[kind as InjurySeverityV1] > 0) ||
    !['serious', 'critical'].every((kind) =>
      Number.isSafeInteger(config.incapacitatedTicks[kind as 'serious' | 'critical']) &&
      config.incapacitatedTicks[kind as 'serious' | 'critical'] > 0 &&
      config.incapacitatedTicks[kind as 'serious' | 'critical'] <
        config.recoveryTicks[kind as 'serious' | 'critical']) ||
    !Number.isSafeInteger(config.discoveryRadiusMm) ||
    config.discoveryRadiusMm <= 0 ||
    !probability(config.discoveryProbabilityPerEligibleTick) ||
    !probability(config.sceneReportProbability) ||
    !Number.isSafeInteger(config.sceneReportDelayTicks) ||
    config.sceneReportDelayTicks < 1 ||
    config.scenePolicy !== 'persistUntilExplicitCleanup') {
    throw new Error('Invalid life scenario configuration')
  }
}

/** Explicit physical-assault classification is independent of offence severity. */
export function classifyHarmMechanismV1(offenceId: string,
  targetKind: 'citizen' | 'placeResource', severity: 'minor' | 'serious',
  config: LifeScenarioConfigV1): 'physicalAssault' | 'nonPhysical' {
  return targetKind === 'citizen' && unit(`${config.seed}:mechanism:${offenceId}`) <
    config.assaultProbability[severity] ? 'physicalAssault' : 'nonPhysical'
}

export interface HarmOutcomeV1 {
  readonly severity: InjurySeverityV1
  readonly fatal: boolean
  readonly injuryDraw: number
  readonly severityDraw: number
  readonly fatalDraw: number | null
}

/** Every draw is keyed to its own offence; other incidents cannot shift this result. */
export function evaluateHarmOutcomeV1(offence: OffenceV5,
  config: LifeScenarioConfigV1): HarmOutcomeV1 | null {
  if (offence.mechanism !== 'physicalAssault' || offence.target.kind !== 'citizen') return null
  const injuryDraw = unit(`${config.seed}:injury:${offence.id}`)
  if (injuryDraw >= config.injuryProbability[offence.severity]) return null
  const severityDraw = unit(`${config.seed}:severity:${offence.id}`)
  const weights = config.severityWeights[offence.severity]
  const severity: InjurySeverityV1 = severityDraw < weights.minor ? 'minor' :
    severityDraw < weights.minor + weights.serious ? 'serious' : 'critical'
  const fatalDraw = severity === 'critical' ? unit(`${config.seed}:fatal:${offence.id}`) : null
  return { severity, fatal: fatalDraw !== null &&
    fatalDraw < config.fatalProbabilityCritical,
  injuryDraw, severityDraw, fatalDraw }
}
