import type { WorldModelV2, WorldPointMm } from '../../world/model'
import type { SimulationStateV5 } from '../v5Types'
import type { SceneEntityV1 } from '../scenes/types'

export type ExplorerEventKindV1 = 'offence' | 'injury' | 'death' |
  'sceneCreated' | 'sceneResolved' | 'sceneDiscovered' |
  'opportunity' | 'attempt' | 'observation' | 'report'

export interface ExplorerEventV1 {
  readonly id: string
  readonly kind: ExplorerEventKindV1
  readonly tick: number
  readonly label: string
  readonly position: WorldPointMm
  readonly surfaceId: string
  readonly levelId: string
  readonly placeId: string | null
  readonly structure: SceneEntityV1['anchor']['structure']
  readonly agentIds: readonly string[]
  readonly sourceId: string
  readonly sceneId: string | null
  readonly encounterId: string | null
}

function structureFor(world: WorldModelV2, placeId: string | null) {
  if (placeId?.startsWith('building:')) {
    const id = placeId.slice('building:'.length)
    if (world.baseCity?.buildings.some((item) => item.id === id)) {
      return { kind: 'building' as const, id }
    }
  }
  if (placeId?.startsWith('galleria') || placeId === 'central-galleria') {
    return { kind: 'galleria' as const, id: 'central-galleria' }
  }
  return null
}

/** Index only facts available at this snapshot; the live index is kept separately by the UI. */
export function buildEventIndexV1(state: SimulationStateV5,
  world: WorldModelV2): readonly ExplorerEventV1[] {
  const offences = new Map(state.offences.map((item) => [item.id, item]))
  const scenes = new Map(state.scene?.entities.map((item) => [item.id, item]) ?? [])
  const sceneByOffence = new Map([...scenes.values()].map((item) =>
    [item.origin.offenceId, item.id]))
  const sceneByInjury = new Map([...scenes.values()].map((item) =>
    [item.origin.injuryId, item.id]))
  const events: ExplorerEventV1[] = []
  for (const episode of [...state.typedCrime?.recentEpisodes ?? [],
    ...state.typedCrime?.activeEpisodes ?? []]) events.push({
    id: 'event:opportunity:' + episode.id, kind: 'opportunity',
    tick: episode.startTick,
    label: 'Opportunity · ' + episode.offenceType + ' · ' + episode.status,
    position: episode.position, surfaceId: episode.surfaceId,
    levelId: episode.levelId, placeId: episode.placeId,
    structure: structureFor(world, episode.placeId),
    agentIds: [episode.actorAgentId, episode.victimAgentId],
    sourceId: episode.id, sceneId: null, encounterId: null })
  for (const attempt of state.typedCrime?.attempts ?? []) {
    const surface = world.surfaces.find((item) => item.id === attempt.surfaceId)
    events.push({ id: 'event:attempt:' + attempt.id,
      kind: 'attempt', tick: attempt.tick,
      label: 'Attempt · ' + attempt.type + ' · ' + attempt.outcome,
      position: attempt.position, surfaceId: attempt.surfaceId,
      levelId: surface?.levelId ?? 'unknown', placeId: attempt.placeId,
      structure: structureFor(world, attempt.placeId),
      agentIds: [attempt.actorAgentId, attempt.victimAgentId],
      sourceId: attempt.id, sceneId: null, encounterId: null })
  }
  for (const offence of state.offences) events.push({
    id: 'event:offence:' + offence.id, kind: 'offence', tick: offence.tick,
    label: 'Offence · ' + (offence.offenceType ?? 'legacy / unspecified') +
      ' · ' + offence.severity,
    position: offence.position, surfaceId: offence.surfaceId,
    levelId: offence.levelId, placeId: offence.placeId,
    structure: structureFor(world, offence.placeId),
    agentIds: [offence.offenderAgentId,
      ...(offence.target.kind === 'citizen' ? [offence.target.id] : [])],
    sourceId: offence.id, sceneId: sceneByOffence.get(offence.id) ?? null,
    encounterId: offence.encounterId,
  })
  for (const injury of state.life?.injuries ?? []) {
    const offence = offences.get(injury.sourceOffenceId)
    events.push({ id: 'event:injury:' + injury.id, kind: 'injury',
      tick: injury.onsetTick, label: 'Injury · ' + injury.severity,
      position: injury.position, surfaceId: injury.surfaceId,
      levelId: injury.levelId, placeId: injury.placeId,
      structure: structureFor(world, injury.placeId),
      agentIds: [injury.victimAgentId,
        ...(offence ? [offence.offenderAgentId] : [])],
      sourceId: injury.id, sceneId: sceneByInjury.get(injury.id) ?? null,
      encounterId: offence?.encounterId ?? null })
  }
  for (const death of state.life?.deaths ?? []) {
    const offence = offences.get(death.relatedOffenceId)
    events.push({ id: 'event:death:' + death.id, kind: 'death',
      tick: death.tick, label: 'Death · physical assault outcome',
      position: death.position, surfaceId: death.surfaceId,
      levelId: death.levelId, placeId: death.placeId,
      structure: structureFor(world, death.placeId),
      agentIds: [death.victimAgentId,
        ...(offence ? [offence.offenderAgentId] : [])],
      sourceId: death.id, sceneId: scenes.has('scene:' + death.id) ?
        'scene:' + death.id : null,
      encounterId: offence?.encounterId ?? null })
  }
  for (const transition of state.scene?.transitions ?? []) {
    const scene = scenes.get(transition.sceneId)
    if (!scene) continue
    events.push({ id: 'event:' + transition.id,
      kind: transition.kind === 'created' ? 'sceneCreated' : 'sceneResolved',
      tick: transition.tick,
      label: 'Scene ' + transition.kind + ' · ' + scene.kind,
      position: scene.anchor.position, surfaceId: scene.anchor.surfaceId,
      levelId: scene.anchor.levelId, placeId: scene.anchor.placeId,
      structure: scene.anchor.structure, agentIds: scene.associatedAgentIds,
      sourceId: transition.sourceId, sceneId: scene.id,
      encounterId: offences.get(scene.origin.offenceId)?.encounterId ?? null })
  }
  for (const discovery of state.scene?.discoveries ?? []) {
    const scene = scenes.get(discovery.sceneId)
    if (!scene) continue
    events.push({ id: 'event:discovery:' + discovery.id,
      kind: 'sceneDiscovered', tick: discovery.tick,
      label: 'Scene discovered · ' + scene.kind,
      position: discovery.observerPosition,
      surfaceId: discovery.observedSurfaceId,
      levelId: scene.anchor.levelId, placeId: scene.anchor.placeId,
      structure: scene.anchor.structure,
      agentIds: [discovery.observerAgentId], sourceId: discovery.id,
      sceneId: scene.id,
      encounterId: offences.get(scene.origin.offenceId)?.encounterId ?? null })
  }
  for (const observation of state.social?.witnessObservations ?? []) {
    const offence = offences.get(observation.offenceId)
    if (!offence) continue
    events.push({ id: 'event:observation:' + observation.id,
      kind: 'observation', tick: observation.observedTick,
      label: 'Observation · ' + observation.source,
      position: observation.perceivedPosition,
      surfaceId: offence.surfaceId,
      levelId: observation.perceivedLevelId ?? offence.levelId,
      placeId: observation.perceivedPlaceId,
      structure: structureFor(world, observation.perceivedPlaceId),
      agentIds: [observation.ownerAgentId], sourceId: observation.id,
      sceneId: null, encounterId: offence.encounterId })
  }
  const reportOffence = new Map((state.social?.reportLinks ?? []).map((item) =>
    [item.reportId, offences.get(item.offenceId)]))
  for (const report of state.reports) {
    const offence = reportOffence.get(report.id)
    if (!offence) continue
    events.push({ id: 'event:report:' + report.id,
      kind: 'report', tick: report.availableTick,
      label: 'Delivered report · ' + report.reportedSeverity,
      position: report.reportedPosition, surfaceId: offence.surfaceId,
      levelId: report.reportedLevelId ?? offence.levelId,
      placeId: report.reportedPlaceId,
      structure: structureFor(world, report.reportedPlaceId),
      agentIds: [], sourceId: report.id, sceneId: null,
      encounterId: offence.encounterId })
  }
  return events.sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id))
}
