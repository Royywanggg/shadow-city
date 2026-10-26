import { describe, expect, it } from 'vitest'
import type { SimulationStateV2 } from '../types'
import type { Incident, ObservationRecord, ReportingConfig, ReportingState, SimulationStateV3 } from '../v3Types'
import { DEFAULT_V3_SCENARIO_CONFIG } from '../v3Types'
import { deriveGroundTruthMetrics } from './metrics'
import { selectGroundTruthView, selectObservedWorldView } from './readModels'
import {
  createInitialReportingState,
  decideReport,
  effectiveReportingProbability,
  stepReporting,
  validateReportingConfig,
} from './reporting'

const baseline = DEFAULT_V3_SCENARIO_CONFIG.observation

function incident(index: number, occurrenceTick = 120): Incident {
  return {
    id: `secret-incident-${String(index).padStart(3, '0')}`,
    occurrenceTick,
    position: { x: index + 1, y: 0.24, z: index + 2 },
    blockId: 'block-3-3',
    district: 'civic',
    type: 'disruption',
    severity: index % 2 === 0 ? 'minor' : 'serious',
    involvedAgentIds: [],
    context: { outdoorPresence: 3, timeBand: 'evening', opportunityMultiplier: 1.2 },
    provenance: {
      generatorVersion: 'test-v1',
      spatialTrialId: `private-trial-${index}`,
      positionSourceCitizenId: 'citizen-0000',
    },
  }
}

function stateAt(tick: number, incidents: readonly Incident[], reporting: ReportingState): SimulationStateV3 {
  return {
    version: 3,
    tick,
    logicalTimeSeconds: tick * 6,
    worldFingerprint: 'test-world',
    scenarioFingerprint: 'test-scenario',
    citizen: {} as SimulationStateV2,
    incidents,
    reporting,
  }
}

describe('synthetic reporting decisions', () => {
  it('validates scenario parameters and preserves probability endpoints', () => {
    expect(effectiveReportingProbability({ ...baseline, globalProbability: 0 }, 'serious')).toBe(0)
    expect(effectiveReportingProbability({ ...baseline, globalProbability: 1 }, 'minor')).toBe(1)
    expect(effectiveReportingProbability(baseline, 'serious'))
      .toBeGreaterThan(effectiveReportingProbability(baseline, 'minor'))
    expect(() => validateReportingConfig({ ...baseline, globalProbability: Number.NaN })).toThrow()
    expect(() => validateReportingConfig({ ...baseline, maxDelayTicks: -1 })).toThrow()
    expect(() => validateReportingConfig({ ...baseline, severityExponent: { minor: 0, serious: 1 } })).toThrow()
  })

  it('reports none at probability zero and all at probability one', () => {
    const incidents = Array.from({ length: 32 }, (_, index) => incident(index))
    const never = { ...baseline, globalProbability: 0 }
    const always = { ...baseline, globalProbability: 1 }
    expect(incidents.every((item) => decideReport(item, never).status === 'notReported')).toBe(true)
    expect(incidents.every((item) => decideReport(item, always).status === 'scheduled')).toBe(true)
  })

  it('keeps decisions and delays stable, with monotonically nested reported incident sets', () => {
    const incidents = Array.from({ length: 200 }, (_, index) => incident(index))
    const selected = (globalProbability: number) => new Set(incidents
      .filter((item) => decideReport(item, { ...baseline, globalProbability }).status === 'scheduled')
      .map((item) => item.id))
    const a = selected(0.3)
    const b = selected(0.6)
    const c = selected(0.9)
    expect(a.size).toBeGreaterThan(0)
    expect(c.size).toBeGreaterThan(b.size)
    expect([...a].every((id) => b.has(id))).toBe(true)
    expect([...b].every((id) => c.has(id))).toBe(true)
    for (const item of incidents.filter((candidate) => a.has(candidate.id))) {
      const low = decideReport(item, { ...baseline, globalProbability: 0.3 })
      const high = decideReport(item, { ...baseline, globalProbability: 0.9 })
      expect(low).toEqual(high)
    }
    expect(decideReport(incidents[0], baseline)).toEqual(decideReport(incidents[0], baseline))
  })

  it('delivers at the logical arrival tick, including a zero-delay report', () => {
    const item = incident(1, 120)
    const delayed: ReportingConfig = {
      ...baseline,
      globalProbability: 1,
      minDelayTicks: 30,
      maxDelayTicks: 30,
      ingestDelayTicks: 0,
    }
    const atOccurrence = stepReporting(createInitialReportingState(), [item], [item], delayed, 120)
    expect(atOccurrence.state.outcomes).toMatchObject([{
      status: 'scheduled', decisionTick: 120, createdTick: 150, availableTick: 150,
    }])
    expect(selectObservedWorldView(stateAt(130, [item], atOccurrence.state)).reports).toEqual([])
    const before = stepReporting(atOccurrence.state, [item], [], delayed, 149)
    expect(before.newlyAvailable).toEqual([])
    const arrived = stepReporting(before.state, [item], [], delayed, 150)
    expect(arrived.newlyAvailable).toHaveLength(1)
    expect(arrived.newlyAvailable[0]).toMatchObject({
      reportId: 'report-000001', reportedOccurrenceTick: 120, availableTick: 150,
    })
    expect(selectObservedWorldView(stateAt(150, [item], arrived.state)).availableReportCount).toBe(1)
    const repeated = stepReporting(arrived.state, [item], [], delayed, 151)
    expect(repeated.newlyAvailable).toEqual([])
    expect(repeated.state.records).toEqual(arrived.state.records)

    const instant = { ...delayed, minDelayTicks: 0, maxDelayTicks: 0 }
    const sameTick = stepReporting(createInitialReportingState(), [item], [item], instant, 120)
    expect(sameTick.newlyAvailable).toHaveLength(1)
    expect(sameTick.newlyAvailable[0].availableTick).toBe(120)

    const withIngestion = { ...delayed, minDelayTicks: 10, maxDelayTicks: 10, ingestDelayTicks: 5 }
    const submitted = stepReporting(createInitialReportingState(), [item], [item], withIngestion, 120)
    expect(submitted.state.outcomes).toMatchObject([{ createdTick: 130, availableTick: 135 }])
    expect(stepReporting(submitted.state, [item], [], withIngestion, 130).newlyAvailable).toEqual([])
    expect(stepReporting(submitted.state, [item], [], withIngestion, 135).newlyAvailable).toHaveLength(1)
  })

  it('assigns contiguous public report IDs without encoding hidden incident IDs', () => {
    const items = Array.from({ length: 100 }, (_, index) => incident(index))
    const config = { ...baseline, minDelayTicks: 0, maxDelayTicks: 0 }
    const transition = stepReporting(createInitialReportingState(), items, items, config, 120)
    const expected = Array.from({ length: transition.state.records.length }, (_, index) =>
      `report-${String(index + 1).padStart(6, '0')}`)
    expect(transition.state.records.map((record) => record.reportId)).toEqual(expected)
    expect(transition.state.records.every((record) => !record.reportId.includes('incident'))).toBe(true)
    expect(transition.state.outcomes.length).toBe(items.length)
    expect(transition.state.records.length).toBeLessThan(items.length)
  })
})

describe('research and observer read models', () => {
  it('does not expose hidden incidents, outcomes, future reports, or extra record properties', () => {
    const item = incident(4)
    const hiddenRecord = {
      reportId: 'report-000001',
      incidentId: item.id,
      privateTruthType: 'hidden',
      reportedOccurrenceTick: 120,
      availableTick: 150,
      reportedPosition: { x: 1, y: 0.24, z: 2, hiddenCoordinate: 99 },
      reportedBlockId: 'block-3-3',
      reportedType: 'disruption',
      reportedSeverity: 'minor',
    } as unknown as ObservationRecord
    const reporting: ReportingState = {
      outcomes: [{ status: 'scheduled', incidentId: item.id, decisionTick: 120, createdTick: 150, availableTick: 150 }],
      records: [hiddenRecord],
      nextReportOrdinal: 1,
    }
    const futureView = selectObservedWorldView(stateAt(130, [item], reporting))
    expect(futureView).toEqual({ asOfTick: 130, reports: [], availableReportCount: 0 })
    expect(selectObservedWorldView(stateAt(150, [item], reporting)).reports).toEqual([])
    const delivered: ReportingState = {
      ...reporting,
      outcomes: [{ status: 'available', incidentId: item.id, decisionTick: 120,
        createdTick: 150, availableTick: 150, reportId: 'report-000001' }],
    }
    const arrivedView = selectObservedWorldView(stateAt(150, [item], delivered))
    expect(Object.keys(arrivedView)).toEqual(['asOfTick', 'reports', 'availableReportCount'])
    expect(Object.keys(arrivedView.reports[0])).toEqual([
      'reportId', 'reportedOccurrenceTick', 'availableTick', 'reportedPosition',
      'reportedBlockId', 'reportedType', 'reportedSeverity',
    ])
    expect(Object.keys(arrivedView.reports[0].reportedPosition)).toEqual(['x', 'y', 'z'])
    expect(JSON.stringify(arrivedView)).not.toContain(item.id)
    expect(JSON.stringify(arrivedView)).not.toContain('privateTruthType')
    expect(JSON.stringify(arrivedView)).not.toContain('hiddenCoordinate')
    expect(JSON.stringify(arrivedView)).not.toContain('pending')
  })

  it('distinguishes configured probability, eventual selection, current coverage, and mature cohort', () => {
    const first = incident(1, 90)
    const second = incident(2, 120)
    const reporting: ReportingState = {
      outcomes: [
        { status: 'available', incidentId: first.id, decisionTick: 90,
          createdTick: 120, availableTick: 120, reportId: 'report-000001' },
        { status: 'scheduled', incidentId: second.id, decisionTick: 120,
          createdTick: 150, availableTick: 150 },
      ],
      records: [{
        reportId: 'report-000001', reportedOccurrenceTick: 90, availableTick: 120,
        reportedPosition: first.position, reportedBlockId: first.blockId,
        reportedType: first.type, reportedSeverity: first.severity,
      }],
      nextReportOrdinal: 1,
    }
    const config = { ...baseline, maxDelayTicks: 30 }
    const metrics = deriveGroundTruthMetrics([first, second], reporting, config, 130)
    expect(metrics).toMatchObject({
      totalIncidents: 2, availableReports: 1, pendingReports: 1, unreportedIncidents: 0,
      configuredGlobalProbability: baseline.globalProbability, currentCoverage: 0.5,
      eventuallyReportedShare: 1, maturedReportingShare: 1, meanReportDelayTicks: 30,
      truthBySeverity: { minor: 1, serious: 1 },
      availableBySeverity: { minor: 0, serious: 1 },
    })
    const research = selectGroundTruthView(stateAt(130, [first, second], reporting), config)
    expect(research.incidents).toEqual([first, second])
    expect(research.outcomes).toEqual(reporting.outcomes)
    expect(research.metrics).toEqual(metrics)
  })

  it('returns null for ratios without a denominator and rejects inconsistent partitions', () => {
    const empty = deriveGroundTruthMetrics([], createInitialReportingState(), baseline, 0)
    expect(empty.currentCoverage).toBeNull()
    expect(empty.eventuallyReportedShare).toBeNull()
    expect(empty.maturedReportingShare).toBeNull()
    expect(empty.meanReportDelayTicks).toBeNull()
    const item = incident(0)
    expect(() => deriveGroundTruthMetrics([item], createInitialReportingState(), baseline, 120))
      .toThrow(/partition/)
  })

  it('retains unreported incidents in research truth while the observer receives nothing', () => {
    const item = incident(3)
    const config = { ...baseline, globalProbability: 0 }
    const transition = stepReporting(createInitialReportingState(), [item], [item], config, 120)
    const state = stateAt(120, [item], transition.state)
    expect(selectGroundTruthView(state, config).metrics).toMatchObject({
      totalIncidents: 1, unreportedIncidents: 1, pendingReports: 0,
      availableReports: 0, currentCoverage: 0, eventuallyReportedShare: 0,
    })
    expect(selectObservedWorldView(state)).toEqual({ asOfTick: 120, reports: [], availableReportCount: 0 })
  })
})
