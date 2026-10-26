import { describe, expect, it } from 'vitest'
import {
  createInitialReportingStateV4,
  decideIdentityLeadV4,
  decideReportingOutcomeV4,
  stepReportingV4,
  validateObservationConfigV4,
} from './v4Reporting'
import { deriveGroundTruthMetricsV4 } from './v4Metrics'
import { selectObservedWorldViewV4 } from './v4ReadModels'
import {
  DEFAULT_V4_OBSERVATION_CONFIG,
  type ObservationConfigV4,
  type OffenceMetricFactV4,
  type ReportableOccurrenceV4,
} from './v4Types'

function config(
  globalProbability: number,
  options: Partial<ObservationConfigV4> = {},
): ObservationConfigV4 {
  return { ...DEFAULT_V4_OBSERVATION_CONFIG, ...options, globalProbability }
}

function occurrence(
  id: string,
  severity: 'minor' | 'serious' = 'minor',
  nearbyCitizenIds: readonly string[] = ['citizen-witness', 'citizen-other'],
): ReportableOccurrenceV4 {
  return {
    id,
    offenceId: `offence-${id}`,
    occurrenceTick: 1,
    position: { x: 12, y: 0.2, z: -8 },
    blockId: 'block-a',
    district: 'core',
    severity,
    offenderAgentId: 'citizen-offender',
    nearbyCitizenIds,
  }
}

const alwaysNamed: ObservationConfigV4 = config(1, {
  minDelayTicks: 0,
  maxDelayTicks: 0,
  identity: { noticeProbability: 1, recognitionProbability: 1, accuracyProbability: 1 },
})

describe('v4 reporting and evidence', () => {
  it('validates probability and delay bounds, including endpoint behavior', () => {
    expect(() => validateObservationConfigV4(config(0))).not.toThrow()
    expect(() => validateObservationConfigV4(config(1))).not.toThrow()
    expect(() => validateObservationConfigV4(config(1.01))).toThrow(/Invalid v4/)
    expect(() => validateObservationConfigV4(config(0.5, {
      identity: { noticeProbability: 1.1, recognitionProbability: 1, accuracyProbability: 1 },
    }))).toThrow(/Invalid v4/)
    const incident = occurrence('incident-a')
    expect(decideReportingOutcomeV4(incident, config(0)).status).toBe('notReported')
    expect(decideReportingOutcomeV4(incident, config(1)).status).toBe('scheduled')
  })

  it('keeps report selection monotone under fixed keyed samples', () => {
    const incidents = Array.from({ length: 80 }, (_, index) => occurrence(`incident-${index}`))
    const selected = (probability: number) => incidents
      .filter((incident) => decideReportingOutcomeV4(incident, config(probability)).status !== 'notReported')
      .map((incident) => incident.id)
    const low = selected(0.3)
    const medium = new Set(selected(0.6))
    const high = new Set(selected(0.9))
    expect(low.every((id) => medium.has(id))).toBe(true)
    expect([...medium].every((id) => high.has(id))).toBe(true)
    expect(high.size).toBeGreaterThan(low.length)
  })

  it('delivers only at the logical availability tick and assigns public IDs then', () => {
    const incident = occurrence('incident-delay')
    const delayed = config(1, { minDelayTicks: 2, maxDelayTicks: 2, ingestDelayTicks: 1 })
    const first = stepReportingV4(createInitialReportingStateV4(), [incident], [incident], delayed, 1)
    expect(first.state.outcomes[0]).toMatchObject({ status: 'scheduled', createdTick: 3, availableTick: 4 })
    expect(first.state.records).toEqual([])
    expect(selectObservedWorldViewV4({ tick: 1, reporting: first.state }).reports).toEqual([])
    const second = stepReportingV4(first.state, [incident], [], delayed, 2)
    const third = stepReportingV4(second.state, [incident], [], delayed, 3)
    expect(selectObservedWorldViewV4({ tick: 3, reporting: third.state }).availableReportCount).toBe(0)
    const fourth = stepReportingV4(third.state, [incident], [], delayed, 4)
    expect(fourth.newlyAvailable).toHaveLength(1)
    expect(fourth.newlyAvailable[0].reportId).toBe('report-000001')
    expect(selectObservedWorldViewV4({ tick: 4, reporting: fourth.state }).availableReportCount).toBe(1)
  })

  it('only names an evidence-backed lead; inaccurate candidates are nearby non-offenders', () => {
    const incident = occurrence('incident-identity')
    const accurate = decideIdentityLeadV4(incident, alwaysNamed)
    expect(accurate).toMatchObject({
      status: 'namedLead', candidateAgentId: 'citizen-offender', accurate: true,
    })
    const falseLead = decideIdentityLeadV4(incident, {
      ...alwaysNamed,
      identity: { ...alwaysNamed.identity, accuracyProbability: 0 },
    })
    expect(falseLead.status).toBe('namedLead')
    if (falseLead.status !== 'namedLead') throw new Error('Expected a named false lead')
    expect(falseLead.accurate).toBe(false)
    expect(incident.nearbyCitizenIds).toContain(falseLead.candidateAgentId)
    expect(falseLead.candidateAgentId).not.toBe(falseLead.witnessAgentId)
    expect(falseLead.candidateAgentId).not.toBe(incident.offenderAgentId)
    expect(decideIdentityLeadV4(occurrence('none', 'minor', []), alwaysNamed)).toEqual({ status: 'unknown' })
    expect(decideIdentityLeadV4(occurrence('one', 'minor', ['citizen-witness']), {
      ...alwaysNamed,
      identity: { ...alwaysNamed.identity, accuracyProbability: 0 },
    })).toEqual({ status: 'unknown' })

    const noWitness = occurrence('incident-no-witness', 'minor', [])
    const unknownReport = stepReportingV4(
      createInitialReportingStateV4(), [noWitness], [noWitness], alwaysNamed, 1,
    ).state
    expect(selectObservedWorldViewV4({ tick: 1, reporting: unknownReport }).reports[0])
      .toMatchObject({ suspect: { status: 'unknown' }, evidenceRefs: [] })

    const falseConfig = {
      ...alwaysNamed,
      identity: { ...alwaysNamed.identity, accuracyProbability: 0 },
    }
    const falseReport = stepReportingV4(
      createInitialReportingStateV4(), [incident], [incident], falseConfig, 1,
    ).state
    const publicFalseLead = selectObservedWorldViewV4({ tick: 1, reporting: falseReport }).reports[0]
    expect(publicFalseLead.suspect.status).toBe('namedLead')
    if (publicFalseLead.suspect.status !== 'namedLead') throw new Error('Expected a named false lead')
    expect(incident.nearbyCitizenIds).toContain(publicFalseLead.suspect.candidateAgentId)
    expect(publicFalseLead.suspect.evidenceIds).toEqual([publicFalseLead.evidenceRefs[0].id])
  })

  it('never serializes private incident, offender, witness, accuracy, or future-evidence fields', () => {
    const incident = occurrence('incident-private')
    const transition = stepReportingV4(createInitialReportingStateV4(), [incident], [incident], alwaysNamed, 1)
    const view = selectObservedWorldViewV4({ tick: 1, reporting: transition.state })
    expect(Object.keys(view)).toEqual(['asOfTick', 'reports', 'availableReportCount'])
    const report = view.reports[0]
    expect(report.suspect.status).toBe('namedLead')
    expect(report.evidenceRefs[0]).toMatchObject({ kind: 'syntheticWitnessStatement', availableTick: 1 })
    const serialized = JSON.stringify(view)
    for (const forbidden of ['incident-private', 'offence-incident-private', 'witnessAgentId', 'accurate',
      'incidentId', 'offenceId', 'offenderAgentId']) {
      expect(serialized).not.toContain(forbidden)
    }

    const futureEvidence = {
      ...transition.state,
      records: [{
        ...transition.state.records[0],
        suspect: { status: 'namedLead' as const, candidateAgentId: 'candidate',
          evidenceIds: ['future-evidence'], availableTick: 5, verification: 'unverified' as const },
        evidenceRefs: [{ id: 'future-evidence', kind: 'syntheticWitnessStatement' as const, availableTick: 5 }],
      }],
    }
    const early = selectObservedWorldViewV4({ tick: 1, reporting: futureEvidence }).reports[0]
    expect(early.suspect).toEqual({ status: 'unknown' })
    expect(early.evidenceRefs).toEqual([])
    const later = selectObservedWorldViewV4({ tick: 5, reporting: futureEvidence }).reports[0]
    expect(later.suspect).toMatchObject({ status: 'namedLead', candidateAgentId: 'candidate' })
  })
})

describe('v4 research metrics', () => {
  it('computes the full-population Minor/Serious four-cell association and repeats', () => {
    const facts: OffenceMetricFactV4[] = [
      { id: 'o1', incidentId: 'i1', offenderAgentId: 'a', occurrenceTick: 1, severity: 'minor', district: 'core' },
      { id: 'o2', incidentId: 'i2', offenderAgentId: 'a', occurrenceTick: 1, severity: 'serious', district: 'civic' },
      { id: 'o3', incidentId: 'i3', offenderAgentId: 'b', occurrenceTick: 1, severity: 'minor', district: 'works' },
      { id: 'o4', incidentId: 'i4', offenderAgentId: 'c', occurrenceTick: 1, severity: 'serious', district: 'core' },
    ]
    const occurrences = facts.map((fact) => ({
      ...occurrence(fact.incidentId, fact.severity, []),
      offenderAgentId: fact.offenderAgentId,
      offenceId: fact.id,
      district: fact.district,
    }))
    const state = stepReportingV4(createInitialReportingStateV4(), occurrences, occurrences, config(0), 1).state
    const metrics = deriveGroundTruthMetricsV4(facts, state, ['a', 'b', 'c', 'd'], {
      a: 'generalist', b: 'minorSpecialist', c: 'seriousSpecialist', d: 'generalist',
    }, config(0), 1)
    expect(metrics.totalOffences).toBe(4)
    expect(metrics.minorOffences + metrics.seriousOffences).toBe(metrics.totalOffences)
    expect(metrics.uniqueOffendingAgents).toBe(3)
    expect(metrics.repeatOffendingAgents).toBe(1)
    expect(metrics.frequency).toEqual({ zero: 1, one: 2, twoOrMore: 1 })
    expect(metrics.association).toEqual({
      both: 1, minorOnly: 1, seriousOnly: 1, neither: 1,
      seriousGivenMinor: 0.5, seriousGivenNoMinor: 0.5, riskDifference: 0,
    })
    expect(metrics.crossSeverityRateAmongOffenders).toBeCloseTo(1 / 3)
    expect(metrics.availableReports).toBe(0)
    expect(metrics.unreportedOffences).toBe(4)
  })

  it('uses null for undefined ratios and rejects inconsistent partitions', () => {
    const empty = deriveGroundTruthMetricsV4([], createInitialReportingStateV4(), [], {}, config(0.6), 0)
    expect(empty.meanOffencesPerOffender).toBeNull()
    expect(empty.currentReportingCoverage).toBeNull()
    expect(empty.association.seriousGivenMinor).toBeNull()
    expect(empty.association.seriousGivenNoMinor).toBeNull()
    expect(empty.association.riskDifference).toBeNull()
    expect(() => deriveGroundTruthMetricsV4([
      { id: 'o1', incidentId: 'i1', offenderAgentId: 'a', occurrenceTick: 1, severity: 'minor', district: 'core' },
    ], createInitialReportingStateV4(), ['a'], { a: 'generalist' }, config(0.6), 1)).toThrow(/partition mismatch/)
  })
})
