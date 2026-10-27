import type { SimulationStateV5 } from '../v5Types'

export interface LifeMetricsV1 {
  readonly label: 'Synthetic Simulation Results'
  readonly asOfTick: number
  readonly livingPopulation: number
  readonly deceasedPopulation: number
  readonly injuredAgents: number
  readonly incapacitatedAgents: number
  readonly injuriesBySeverity: Readonly<Record<'minor' | 'serious' | 'critical', number>>
  readonly fatalEvents: number
  readonly recoveryEvents: number
  /** Numerator: fatal injuries. Denominator: all modelled injury events. */
  readonly injuryToFatalRate: number | null
  readonly deathsByLevel: Readonly<Record<string, number>>
  readonly deathsRelatedToViolentOffences: number
  readonly witnessedHarmEvents: number
  /** Direct perception of the death itself is not established by witnessing an assault. */
  readonly witnessedDeathEvents: null
  readonly discoveredDeathEvents: number
  /** Immediate mortality only in life-v1; delayed mortality is not modelled. */
  readonly harmfulEventToDeathTicks: number | null
}

export function computeLifeMetricsV1(state: SimulationStateV5): LifeMetricsV1 | null {
  const life = state.life
  if (!life) return null
  const injuriesBySeverity = { minor: 0, serious: 0, critical: 0 }
  for (const injury of life.injuries) injuriesBySeverity[injury.severity] += 1
  const deathsByLevel: Record<string, number> = {}
  for (const death of life.deaths) deathsByLevel[death.levelId] =
    (deathsByLevel[death.levelId] ?? 0) + 1
  return {
    label: 'Synthetic Simulation Results', asOfTick: state.tick,
    livingPopulation: life.people.filter((item) => item.lifeStatus === 'alive').length,
    deceasedPopulation: life.people.filter((item) => item.lifeStatus === 'deceased').length,
    injuredAgents: life.people.filter((item) => item.lifeStatus === 'alive' &&
      item.functionalStatus !== 'unimpaired').length,
    incapacitatedAgents: life.people.filter((item) => item.lifeStatus === 'alive' &&
      item.functionalStatus === 'incapacitated').length,
    injuriesBySeverity, fatalEvents: life.deaths.length,
    recoveryEvents: life.recoveryEvents.filter((item) => item.kind === 'recovered').length,
    injuryToFatalRate: life.injuries.length ? life.deaths.length / life.injuries.length : null,
    deathsByLevel, deathsRelatedToViolentOffences: life.deaths.filter((item) =>
      state.offences.some((offence) => offence.id === item.relatedOffenceId &&
        offence.mechanism === 'physicalAssault')).length,
    witnessedHarmEvents: new Set(life.observations.filter((item) =>
      item.kind === 'witnessedHarmfulOffence').map((item) => item.sourceOffenceId)).size,
    witnessedDeathEvents: null,
    discoveredDeathEvents: new Set(life.observations.filter((item) =>
      item.kind === 'discoveredDeathScene').map((item) => item.sourceDeathEventId)).size,
    harmfulEventToDeathTicks: life.deaths.length ? 0 : null,
  }
}
