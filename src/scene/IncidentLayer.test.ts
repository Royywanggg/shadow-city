import { describe, expect, it } from 'vitest'
import type { Incident, ObservationRecord } from '../simulation/v3Types'
import { visibleIncidentMarkers, type IncidentLayerView } from './IncidentLayer'

const incident: Incident = {
  id: 'private-incident-1',
  occurrenceTick: 3,
  position: { x: 12, y: 0.24, z: 8 },
  blockId: 'block-1-1',
  district: 'core',
  type: 'disruption',
  severity: 'minor',
  involvedAgentIds: [],
  context: { outdoorPresence: 2, timeBand: 'evening', opportunityMultiplier: 1 },
  provenance: { generatorVersion: 'test', spatialTrialId: 'trial-1', positionSourceCitizenId: 'citizen-0001' },
}

const report: ObservationRecord = {
  reportId: 'report-1',
  reportedOccurrenceTick: 3,
  availableTick: 8,
  reportedPosition: { x: 12, y: 0.24, z: 8 },
  reportedBlockId: 'block-1-1',
  reportedType: 'disruption',
  reportedSeverity: 'minor',
}

describe('incident layer visibility boundary', () => {
  it('never forwards truth in observed mode, even if an unsafe caller attaches it at runtime', () => {
    const unsafe = { mode: 'observed', tick: 10, reports: [report], incidents: [incident] } as unknown as IncidentLayerView
    expect(visibleIncidentMarkers(unsafe)).toEqual({ incidents: [], reports: [report] })
  })

  it('hides future facts and report arrivals at a historical tick', () => {
    const comparison: IncidentLayerView = { mode: 'comparison', tick: 2, incidents: [incident], reports: [report] }
    expect(visibleIncidentMarkers(comparison)).toEqual({ incidents: [], reports: [] })
    const observed: IncidentLayerView = { mode: 'observed', tick: 7, reports: [report] }
    expect(visibleIncidentMarkers(observed)).toEqual({ incidents: [], reports: [] })
    expect(visibleIncidentMarkers({ ...comparison, tick: 8 })).toEqual({ incidents: [incident], reports: [report] })
  })
})
