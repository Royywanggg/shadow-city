import type { WorldModelV2, WorldPointMm } from '../../world/model'
import type { SimulationStateV5 } from '../v5Types'
import type { SceneEntityV1 } from '../scenes/types'

export type ExplorerEventKindV1 = 'offence' | 'injury' | 'death' |
  'sceneCreated' | 'sceneResolved' | 'sceneDiscovered'

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
  for (const offence of state.offences) events.push({
    id: 'event:offence:' + offence.id, kind: 'offence', tick: offence.tick,
    label: 'Offence · ' + (offence.mechanism ?? 'unspecified') + ' · ' + offence.severity,
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
  return events.sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id))
}
