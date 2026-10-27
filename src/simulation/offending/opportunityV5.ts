import { hashSeed } from '../rng'
import type { WorldPointMm } from '../../world/model'
import type { MovementTracePoint, OffenceV5, OpportunityTargetV5,
  ReportV5, SimulationEnvironmentV5, SimulationStateV5 } from '../v5Types'
import { projectObserverViewV5 } from '../encounter/observerProjection'
import { classifyHarmMechanismV1 } from '../life/outcome'

const unit = (key: string) => (hashSeed(key) + 0.5) / 0x1_0000_0000
const distance = (a: WorldPointMm, b: WorldPointMm) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const episodeKey = (offender: string, target: OpportunityTargetV5, surfaceId: string) =>
  `${offender}:${target.kind}:${target.id}:${surfaceId}`

export function reportIdForOffence(offence: OffenceV5, observationSeed: string): string {
  return `report:${hashSeed(`${observationSeed}:opaque:${offence.id}`).toString(16).padStart(8, '0')}`
}

function makeReport(offence: OffenceV5, observationSeed: string): ReportV5 {
  const rounded = (coordinate: number) => Math.round(coordinate / 2_000) * 2_000
  return { id: reportIdForOffence(offence, observationSeed), availableTick: offence.tick + 2,
    reportedOccurrenceTick: offence.tick,
    reportedPosition: { x: rounded(offence.position.x), y: rounded(offence.position.y),
      z: rounded(offence.position.z) },
    reportedLevelId: unit(`${observationSeed}:level:${offence.id}`) < 0.8 ? offence.levelId : null,
    reportedPlaceId: unit(`${observationSeed}:place:${offence.id}`) < 0.72 ? offence.placeId : null,
    reportedSeverity: offence.severity, suspect: { status: 'unknown' } }
}

/** Contact is sampled at one-second intervals, with surface membership authoritative. */
export function updateOpportunityV5(state: SimulationStateV5,
  environment: SimulationEnvironmentV5, traces: readonly MovementTracePoint[]): SimulationStateV5 {
  const bySecond = new Map<number, MovementTracePoint[]>()
  const activeIds = new Set(state.citizens.filter((citizen) => citizen.activity !== 'atHome' &&
    citizen.activity !== 'deceased' && citizen.activity !== 'incapacitated' &&
    citizen.activity !== 'standingUp')
    .map((citizen) => citizen.id))
  for (const trace of traces) {
    if (!activeIds.has(trace.agentId)) continue
    const items = bySecond.get(trace.second) ?? []
    items.push(trace)
    bySecond.set(trace.second, items)
  }
  const exposure = new Map<string, { offender: string; target: OpportunityTargetV5;
    surfaceId: string; placeId: string | null; position: WorldPointMm; seconds: number;
    guardianship: number }>()
  const resourcesBySurface = new Map<string, typeof environment.world.resources[number][]>()
  for (const resource of environment.world.resources) {
    const items = resourcesBySurface.get(resource.surfaceId) ?? []
    items.push(resource)
    resourcesBySurface.set(resource.surfaceId, items)
  }
  const propensityById = new Map([...activeIds].map((id) =>
    [id, unit(`${environment.config.offendingSeed}:propensity:${id}`)]))
  const profileById = new Map(environment.profiles.map((profile) => [profile.id, profile]))
  for (let second = 1; second <= environment.config.logicalSecondsPerTick; second += 1) {
    const points = bySecond.get(second) ?? []
    const cells = new Map<string, MovementTracePoint[]>()
    for (const trace of points) {
      const key = `${trace.surfaceId}:${Math.floor(trace.position.x / 3_000)}:${Math.floor(trace.position.z / 3_000)}`
      const group = cells.get(key) ?? []
      group.push(trace)
      cells.set(key, group)
    }
    for (const offender of points) {
      const probability = propensityById.get(offender.agentId)!
      if (probability < 0.55) continue
      const cx = Math.floor(offender.position.x / 3_000)
      const cz = Math.floor(offender.position.z / 3_000)
      const neighbours: MovementTracePoint[] = []
      for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) {
        neighbours.push(...cells.get(`${offender.surfaceId}:${cx + dx}:${cz + dz}`) ?? [])
      }
      const guardianCount = neighbours.filter((item) => item.agentId !== offender.agentId &&
        distance(item.position, offender.position) < 5_000).length
      const targets: { target: OpportunityTargetV5; point: WorldPointMm }[] = neighbours
        .filter((item) => item.agentId !== offender.agentId &&
          distance(item.position, offender.position) <= 1_800)
        .map((item) => ({ target: { kind: 'citizen', id: item.agentId }, point: item.position }))
      for (const resource of resourcesBySurface.get(offender.surfaceId) ?? []) if (
        distance(resource.position, offender.position) <= 1_800) {
        targets.push({ target: { kind: 'placeResource', id: resource.id }, point: resource.position })
      }
      for (const { target } of targets) {
        if (target.kind === 'citizen' && !profileById.has(target.id)) continue
        const key = episodeKey(offender.agentId, target, offender.surfaceId)
        const prior = exposure.get(key)
        exposure.set(key, { offender: offender.agentId, target, surfaceId: offender.surfaceId,
          placeId: offender.placeId, position: offender.position,
          seconds: (prior?.seconds ?? 0) + 1, guardianship: guardianCount })
      }
    }
  }
  const surfaceById = new Map(environment.world.surfaces.map((surface) => [surface.id, surface]))
  const episodes = new Map(state.encounterEpisodes.map((episode) =>
    [episodeKey(episode.offenderAgentId, episode.target, episode.id.split('@').at(-1)!), episode]))
  const offences = [...state.offences]
  const cooldowns = { ...state.offenderCooldowns }
  const resourceCooldowns = { ...state.resourceCooldowns }
  const pendingReports = [...state.pendingReports]
  for (const [key, contact] of [...exposure].sort(([a], [b]) => a.localeCompare(b))) {
    let episode = episodes.get(key)
    if (!episode || state.tick - episode.lastContactTick >= 2) {
      const id = `${contact.offender}:${contact.target.kind}:${contact.target.id}:${state.tick}@${contact.surfaceId}`
      episode = { id, offenderAgentId: contact.offender, target: contact.target,
        startedTick: state.tick, lastContactTick: state.tick, accumulatedHazard: 0,
        totalExposureSeconds: 0,
        threshold: -Math.log(unit(`${environment.config.offendingSeed}:episode:${id}`)),
        consumed: false }
    }
    if (!episode.consumed) {
      const propensity = unit(`${environment.config.offendingSeed}:propensity:${contact.offender}`)
      const hazard = contact.seconds * (0.000045 + propensity * 0.00009) /
        (1 + contact.guardianship * 0.7)
      episode = { ...episode, accumulatedHazard: episode.accumulatedHazard + hazard,
        totalExposureSeconds: episode.totalExposureSeconds + contact.seconds,
        lastContactTick: state.tick }
      if (episode.accumulatedHazard >= episode.threshold) {
        const eligible = (cooldowns[contact.offender] ?? -1) < state.tick &&
        (contact.target.kind !== 'placeResource' ||
          (resourceCooldowns[contact.target.id] ?? -1) < state.tick)
        episode = { ...episode, consumed: true }
        if (eligible) {
        const id = `offence:${episode.id}`
        const surface = surfaceById.get(contact.surfaceId)!
        const opportunity = { id: `encounter:${episode.id}`, offenderAgentId: contact.offender,
          target: contact.target, surfaceId: contact.surfaceId, levelId: surface.levelId,
          placeId: contact.placeId, position: contact.position,
          exposureSeconds: episode.totalExposureSeconds,
          perceivedRisk: Math.min(1, 0.12 + contact.guardianship * 0.16),
          guardianship: contact.guardianship }
        const offence: OffenceV5 = { id, incidentId: `incident:${id}`, tick: state.tick,
          second: environment.config.logicalSecondsPerTick, offenderAgentId: contact.offender,
          target: contact.target,
          severity: unit(`${environment.config.offendingSeed}:severity:${id}`) > 0.87
            ? 'serious' : 'minor', position: contact.position,
          surfaceId: contact.surfaceId, levelId: surface.levelId,
          placeId: contact.placeId, encounterId: episode.id, opportunity }
        if (environment.config.life) {
          const mechanism = classifyHarmMechanismV1(id, contact.target.kind,
            offence.severity, environment.config.life)
          offences.push({ ...offence, mechanism })
        } else offences.push(offence)
        cooldowns[contact.offender] = state.tick + 18
        if (contact.target.kind === 'placeResource') resourceCooldowns[contact.target.id] = state.tick + 30
        if (unit(`${environment.config.observationSeed}:report:${id}`) <
          environment.config.reportingProbability) {
          pendingReports.push({ offenceId: id, availableTick: state.tick + 2 })
        }
        }
      }
    } else episode = { ...episode, lastContactTick: state.tick }
    episodes.set(key, episode)
  }
  const reports = [...state.reports]
  const stillPending: typeof pendingReports[number][] = []
  for (const pending of pendingReports) {
    if (pending.availableTick > state.tick) { stillPending.push(pending); continue }
    const offence = offences.find((item) => item.id === pending.offenceId)
    if (!offence) throw new Error('V5 report without ground truth')
    reports.push(makeReport(offence, environment.config.observationSeed))
  }
  return { ...state, encounterEpisodes: [...episodes.values()].filter((episode) =>
    state.tick - episode.lastContactTick < 2), offences, reports,
    pendingReports: stillPending, offenderCooldowns: cooldowns, resourceCooldowns }
}

export function observerViewV5(state: SimulationStateV5) {
  return projectObserverViewV5(state)
}
