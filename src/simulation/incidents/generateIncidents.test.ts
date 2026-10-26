import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { createInitialCitizenState, stepCitizenSimulation } from '../engineV2'
import { createSimulationEnvironment } from '../environment'
import type { CitizenState } from '../types'
import { V04_REVIEW_SCENARIO_CONFIG } from '../v3Types'
import {
  createIncidentWorldRunId,
  generateIncidentsForTick,
  syntheticTimeBand,
  validateIncidentConfig,
} from './generateIncidents'

const city = generateCity(HERO_SEED)
const config = V04_REVIEW_SCENARIO_CONFIG
const environment = createSimulationEnvironment(city, config.citizen)
const worldRunId = createIncidentWorldRunId(environment.runId, config.incident)

function citizenStateAt(tick: number): readonly CitizenState[] {
  let state = createInitialCitizenState(environment, config.citizen)
  for (let current = 1; current <= tick; current += 1) {
    state = stepCitizenSimulation(environment, config.citizen, state, []).state
  }
  return state.citizens
}

function distanceToSegment(
  point: { x: number; z: number },
  start: { x: number; z: number },
  end: { x: number; z: number },
): number {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const fraction = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(point.x - (start.x + dx * fraction), point.z - (start.z + dz * fraction))
}

describe('synthetic ground truth incident generation', () => {
  it('produces genuine incidents by the fixed visual review checkpoints', () => {
    let state = createInitialCitizenState(environment, config.citizen)
    let through100 = 0
    let through500 = 0
    for (let tick = 1; tick <= 500; tick += 1) {
      state = stepCitizenSimulation(environment, config.citizen, state, []).state
      through500 += generateIncidentsForTick(city, state.citizens, tick, config, worldRunId).length
      if (tick === 100) through100 = through500
    }
    expect(through100).toBeGreaterThanOrEqual(3)
    expect(through500).toBeGreaterThan(through100)
  })

  it('uses stable world-only IDs, samples, and block ordering', () => {
    const citizens = citizenStateAt(100)
    const saturated = {
      ...config,
      incident: { ...config.incident, baselineRatePerOccupiedBlockHour: 1_000_000 },
    }
    const runId = createIncidentWorldRunId(environment.runId, saturated.incident)
    const first = generateIncidentsForTick(city, citizens, 100, saturated, runId)
    const repeated = generateIncidentsForTick(city, citizens, 100, saturated, runId)
    const reordered = generateIncidentsForTick(city, [...citizens].reverse(), 100, saturated, runId)
    const changedObservation = {
      ...saturated,
      observation: { ...config.observation, globalProbability: 0.1 },
    }
    expect(first.length).toBeGreaterThan(1)
    expect(first).toEqual(repeated)
    expect(first).toEqual(reordered)
    expect(first).toEqual(generateIncidentsForTick(city, citizens, 100, changedObservation, runId))
    expect(new Set(first.map((incident) => incident.id)).size).toBe(first.length)
    expect(first.map((incident) => incident.blockId)).toEqual(
      [...first.map((incident) => incident.blockId)].sort(),
    )
    expect(first.every((incident) => incident.involvedAgentIds.length === 0)).toBe(true)
  })

  it('places each incident at a real outdoor citizen position on the pedestrian graph', () => {
    const citizens = citizenStateAt(1)
    const saturated = {
      ...config,
      incident: { ...config.incident, baselineRatePerOccupiedBlockHour: 1_000_000 },
    }
    const runId = createIncidentWorldRunId(environment.runId, saturated.incident)
    const incidents = generateIncidentsForTick(city, citizens, 1, saturated, runId)
    const nodes = new Map(city.pedestrian.nodes.map((node) => [node.id, node]))
    expect(incidents.length).toBeGreaterThan(0)
    for (const incident of incidents) {
      const source = citizens.find((citizen) => citizen.id === incident.provenance.positionSourceCitizenId)
      expect(source).toBeDefined()
      expect(source?.activity).not.toBe('atHome')
      expect(source?.activity).not.toBe('planningTrip')
      expect(incident.position).toEqual(source?.position)
      expect(city.blocks.some((block) => block.id === incident.blockId && block.district === incident.district))
        .toBe(true)
      const onGraph = city.pedestrian.edges.some((edge) => {
        const start = nodes.get(edge.from)!
        const end = nodes.get(edge.to)!
        return distanceToSegment(incident.position, start, end) < 1e-5
      })
      expect(onGraph).toBe(true)
    }
  })

  it('skips indoor citizens and zero hazard without advancing any shared RNG', () => {
    const citizens = citizenStateAt(100)
    const indoor = citizens.map((citizen) => ({ ...citizen, activity: 'atHome' as const }))
    expect(generateIncidentsForTick(city, indoor, 100, config, worldRunId)).toEqual([])
    expect(generateIncidentsForTick(city, citizens, 100,
      { ...config, incident: { ...config.incident, baselineRatePerOccupiedBlockHour: 0 } }, worldRunId))
      .toEqual([])
    expect(generateIncidentsForTick(city, [], 100, config, worldRunId)).toEqual([])
  })

  it('uses logical time bands and validates unsafe parameters', () => {
    expect(syntheticTimeBand(0, 6, 20)).toBe('evening')
    expect(syntheticTimeBand(2_400, 6, 20)).toBe('night')
    expect(syntheticTimeBand(6_600, 6, 20)).toBe('day')
    expect(() => validateIncidentConfig({ ...config.incident, seriousProbability: Number.NaN })).toThrow()
    expect(() => validateIncidentConfig({ ...config.incident, maxDensityCount: 0 })).toThrow()
    expect(() => generateIncidentsForTick(city, citizenStateAt(1), 0, config, worldRunId)).toThrow()
  })

  it('canonicalizes equivalent config objects before computing world IDs', () => {
    const equivalent = {
      startHour: config.incident.startHour,
      publicSpaceMultiplier: config.incident.publicSpaceMultiplier,
      timeBandMultipliers: {
        night: config.incident.timeBandMultipliers.night,
        evening: config.incident.timeBandMultipliers.evening,
        day: config.incident.timeBandMultipliers.day,
      },
      districtMultipliers: {
        works: config.incident.districtMultipliers.works,
        residential: config.incident.districtMultipliers.residential,
        core: config.incident.districtMultipliers.core,
        civic: config.incident.districtMultipliers.civic,
      },
      seriousProbability: config.incident.seriousProbability,
      maxDensityCount: config.incident.maxDensityCount,
      densitySlope: config.incident.densitySlope,
      baselineRatePerOccupiedBlockHour: config.incident.baselineRatePerOccupiedBlockHour,
      version: config.incident.version,
    }
    expect(createIncidentWorldRunId(environment.runId, equivalent)).toBe(worldRunId)
  })
})
