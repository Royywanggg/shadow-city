import { DEFAULT_OFFENDING_CONFIG, type OffendingConfig } from '../offending/types'
import { DEFAULT_SOCIAL_CONFIG_V1, type SocialConfigV1 } from './socialTypes'
import { DEFAULT_SOCIAL_ENCOUNTER_CONFIG, type SocialEncounterConfig } from './lifecycle'
import { DEFAULT_PERCEPTION_CONFIG, type PerceptionConfig } from './perception'
import { DEFAULT_WITNESS_MODEL_CONFIG, type WitnessModelConfig } from './crimeWitness'

/** Present only for the opt-in v0.6.1 pipeline; absent configs retain legacy v5 semantics. */
export interface EncounterScenarioConfigV1 {
  readonly version: 'encounter-v1'
  readonly offenceMode: 'legacy' | 'encounterAware'
  readonly interactionsEnabled: boolean
  /** An attempt may fail without creating a truth offence. */
  readonly offenceCompletionProbability: number
  /** Familiarity can lower perceived reward only after the offender has perceived the target. */
  readonly socialRestraintWeight: number
  readonly social: SocialConfigV1
  readonly lifecycle: SocialEncounterConfig
  readonly perception: PerceptionConfig
  readonly offending: Omit<OffendingConfig, 'offendingSeed' | 'startHour'>
  readonly witness: Omit<WitnessModelConfig, 'observationSeed' | 'reportingProbability'>
}

const offendingDefaults = Object.fromEntries(Object.entries(DEFAULT_OFFENDING_CONFIG)
  .filter(([key]) => key !== 'offendingSeed' && key !== 'startHour')) as
  EncounterScenarioConfigV1['offending']
const witnessDefaults = Object.fromEntries(Object.entries(DEFAULT_WITNESS_MODEL_CONFIG)
  .filter(([key]) => key !== 'observationSeed' && key !== 'reportingProbability')) as
  EncounterScenarioConfigV1['witness']

export const DEFAULT_ENCOUNTER_SCENARIO_V1: EncounterScenarioConfigV1 = Object.freeze({
  version: 'encounter-v1',
  offenceMode: 'encounterAware',
  interactionsEnabled: true,
  offenceCompletionProbability: 0.82,
  socialRestraintWeight: 0.12,
  social: DEFAULT_SOCIAL_CONFIG_V1,
  lifecycle: DEFAULT_SOCIAL_ENCOUNTER_CONFIG,
  perception: DEFAULT_PERCEPTION_CONFIG,
  offending: Object.freeze(offendingDefaults),
  witness: Object.freeze(witnessDefaults),
})
