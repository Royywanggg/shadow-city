import { createRandomStream, nextRandom } from '../rng'
import { validateOffendingConfig } from './profiles'
import type {
  OffendingConfig,
  OffendingProfile,
  OffenceSeverity,
  OpportunitySnapshot,
} from './types'

export interface OffenceChoiceProbabilities {
  readonly none: number
  readonly minor: number
  readonly serious: number
}

function logWeight(
  severity: OffenceSeverity,
  profile: OffendingProfile,
  opportunity: OpportunitySnapshot,
  config: OffendingConfig,
  logicalSecondsPerTick: number,
): number {
  const base = config.baseOddsPerEligibleAgentHour[severity]
  const exposure = opportunity.exposureBySeverity[severity]
  if (base === 0 || exposure === 0) return Number.NEGATIVE_INFINITY
  return Math.log(base) + Math.log(logicalSecondsPerTick / 3600) +
    profile.logPropensity[severity] + Math.log(exposure) +
    config.rewardWeight[severity] * profile.rewardSensitivity * opportunity.rewardScore -
    config.riskWeight[severity] * profile.riskSensitivity * opportunity.perceivedRiskScore
}

/** A stable three-way choice: No Offence, Minor Offence, or Serious Offence. */
export function offenceChoiceProbabilities(
  profile: OffendingProfile,
  opportunity: OpportunitySnapshot,
  config: OffendingConfig,
  logicalSecondsPerTick: number,
): OffenceChoiceProbabilities {
  validateOffendingConfig(config)
  if (profile.agentId !== opportunity.agentId ||
      !Number.isSafeInteger(logicalSecondsPerTick) || logicalSecondsPerTick <= 0 ||
      !['minor', 'serious'].every((severity) => {
        const key = severity as OffenceSeverity
        return Number.isFinite(profile.logPropensity[key]) &&
          Number.isFinite(opportunity.exposureBySeverity[key]) &&
          opportunity.exposureBySeverity[key] >= 0 && opportunity.exposureBySeverity[key] <= 1
      }) ||
      ![opportunity.rewardScore, opportunity.perceivedRiskScore,
        profile.rewardSensitivity, profile.riskSensitivity].every(Number.isFinite) ||
      opportunity.rewardScore < 0 || opportunity.rewardScore > 1 ||
      opportunity.perceivedRiskScore < 0 || opportunity.perceivedRiskScore > 1 ||
      profile.rewardSensitivity < 0 || profile.riskSensitivity < 0) {
    throw new Error('Invalid synthetic offence choice inputs')
  }
  const minorLog = logWeight('minor', profile, opportunity, config, logicalSecondsPerTick)
  const seriousLog = logWeight('serious', profile, opportunity, config, logicalSecondsPerTick)
  if (minorLog === Number.NEGATIVE_INFINITY && seriousLog === Number.NEGATIVE_INFINITY) {
    return Object.freeze({ none: 1, minor: 0, serious: 0 })
  }
  const maximum = Math.max(0, minorLog, seriousLog)
  const noneWeight = Math.exp(-maximum)
  const minorWeight = Math.exp(minorLog - maximum)
  const seriousWeight = Math.exp(seriousLog - maximum)
  const denominator = noneWeight + minorWeight + seriousWeight
  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error('Invalid synthetic offence choice normalization')
  }
  const none = noneWeight / denominator
  const minor = minorWeight / denominator
  return Object.freeze({ none, minor, serious: seriousWeight / denominator })
}

/** One keyed draw is shared across behavioural counterfactuals with the same offending seed. */
export function chooseOffence(
  profile: OffendingProfile,
  opportunity: OpportunitySnapshot,
  config: OffendingConfig,
  logicalSecondsPerTick: number,
): OffenceSeverity | null {
  const probabilities = offenceChoiceProbabilities(profile, opportunity, config, logicalSecondsPerTick)
  const draw = nextRandom(createRandomStream(
    config.offendingSeed,
    `offence-decision:${opportunity.tick}:${profile.agentId}`,
  )).value
  if (draw < probabilities.none) return null
  return draw < probabilities.none + probabilities.minor ? 'minor' : 'serious'
}
