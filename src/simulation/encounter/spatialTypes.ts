import type { MovementTracePoint } from '../v5Types'

export type EncounterTracePoint = MovementTracePoint & Readonly<{
  headingRadians?: number
}>

export type EncounterPair = readonly [string, string]

export const compareEncounterIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

/** A spatially legal, unordered pair at one simulation second. */
export interface SpatialCandidateSample {
  readonly pairKey: string
  readonly participantIds: EncounterPair
  readonly second: number
  readonly distanceMm: number
  readonly relation: 'sameSurface' | 'openPortal'
  readonly surfaceId: string | null
  readonly placeId: string | null
  readonly first: EncounterTracePoint
  readonly secondTrace: EncounterTracePoint
  readonly firstSpeedMmPerSecond: number
  readonly secondSpeedMmPerSecond: number
}

/** Perception is directed: A noticing B never implies B noticed A. */
export interface DirectedPerceptionSample {
  readonly pairKey: string
  readonly second: number
  readonly observerAgentId: string
  readonly targetAgentId: string
  readonly distanceMm: number
  readonly physicallyNear: true
  readonly potentiallyVisible: boolean
  readonly actuallyPerceived: boolean
  readonly approximation: 'surface-portal-blocker-heading'
}

export function canonicalPair(a: string, b: string): Readonly<{
  key: string; ids: EncounterPair
}> {
  if (a === b) throw new Error('Encounter pair requires distinct agents')
  const ids: EncounterPair = a < b ? [a, b] : [b, a]
  return { key: JSON.stringify(ids), ids }
}
