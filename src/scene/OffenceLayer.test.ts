import { describe, expect, it } from 'vitest'
import { visibleOffenceMarkers, type OffenceLayerView } from './OffenceLayer'

const incident = {
  id: 'offender-world-incident-1',
  occurrenceTick: 4,
  position: { x: 8, y: 0.2, z: 9 },
  severity: 'serious' as const,
}

const report = {
  reportId: 'public-report-1',
  availableTick: 11,
  reportedPosition: { x: 8, y: 0.2, z: 9 },
}

describe('v4 offence marker boundary', () => {
  it('ignores truth even when an unsafe runtime caller attaches it to observed mode', () => {
    const unsafe = { mode: 'observed', tick: 12, reports: [report], incidents: [incident] } as unknown as OffenceLayerView
    expect(visibleOffenceMarkers(unsafe)).toEqual({ incidents: [], reports: [report] })
  })

  it('shows facts and reports only after their distinct occurrence and arrival ticks', () => {
    const comparison: OffenceLayerView = { mode: 'comparison', tick: 3, incidents: [incident], reports: [report] }
    expect(visibleOffenceMarkers(comparison)).toEqual({ incidents: [], reports: [] })
    expect(visibleOffenceMarkers({ ...comparison, tick: 4 })).toEqual({ incidents: [incident], reports: [] })
    expect(visibleOffenceMarkers({ ...comparison, tick: 11 })).toEqual({ incidents: [incident], reports: [report] })
  })
})
