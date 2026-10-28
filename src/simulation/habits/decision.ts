import type { ActivityKind, SemanticPlace, WorldModelV2 } from '../../world/model'
import { findRoutesFromV2, type AccessMode, type NavigationIndexV2,
  type RouteResultV2 } from '../../world/navigation/routeV2'
import { hashSeed } from '../rng'
import type { CitizenProfileV5, CitizenStateV5, SimulationConfigV5,
  SimulationStateV5 } from '../v5Types'
import { calendarAtTick, minuteInWindow } from './calendar'
import type { ActivityCandidateTraceV1, ActivityDecisionTraceV1, CitizenHabitStateV1,
  HabitActivityKind, HabitProfileV1, HabitScenarioConfigV1 } from './types'

export interface HabitChoiceV1 {
  readonly place: SemanticPlace
  readonly slotId: string
  readonly route: Extract<RouteResultV2, { status: 'ok' }>
  readonly activityKind: ActivityKind
  readonly habitKind: HabitActivityKind
  readonly dwellTicks: number
  readonly trace: ActivityDecisionTraceV1
}

const clamp = (value: number) => Math.max(0, Math.min(1_000, Math.round(value)))
const unit = (key: string) => hashSeed(key) / 4294967296

export interface HabitDecisionTimingV1 {
  readonly phase: 'decision' | 'replan'
  readonly tick: number
  readonly agentId: string
  readonly routeTreeMs: number
  readonly candidateScoringMs: number
  readonly candidateCount: number
}

let timingObserver: ((sample: HabitDecisionTimingV1) => void) | null = null

/** Diagnostic timing never enters replay state or decision inputs. */
export function setHabitDecisionTimingObserverV1(
  observer: ((sample: HabitDecisionTimingV1) => void) | null): void {
  timingObserver = observer
}

export function reportHabitReplanTimingV1(tick: number, agentId: string,
  routeMs: number): void {
  timingObserver?.({ phase: 'replan', tick, agentId, routeTreeMs: routeMs,
    candidateScoringMs: 0, candidateCount: 0 })
}

function kindsFor(place: SemanticPlace, citizen: CitizenProfileV5): readonly HabitActivityKind[] {
  if (place.kind === 'home') return place.id === citizen.homePlaceId ? ['rest'] : []
  if (place.kind === 'workplace') return place.id === citizen.workPlaceId ? ['work'] : []
  const kinds: HabitActivityKind[] = []
  if (place.activityTags.includes('eat')) kinds.push('eat')
  if (place.activityTags.includes('shop')) kinds.push('shop')
  if (place.activityTags.includes('leisure')) kinds.push('leisure')
  if (place.kind === 'cafe' || place.kind === 'plaza' || place.kind === 'park' ||
    place.kind === 'mall') kinds.push('social')
  return kinds
}

function socialAffinity(state: SimulationStateV5, agentId: string, placeId: string): number {
  if (!state.social) return 0
  const relations = new Map(state.social.relationships.filter((item) =>
    item.ownerAgentId === agentId).map((item) => [item.referentAgentId, item.familiarity]))
  let strongest = 0
  for (const interaction of state.social.interactions) {
    if (interaction.placeId !== placeId || interaction.status !== 'completed' ||
      !interaction.participantIds.includes(agentId)) continue
    const other = interaction.participantIds.find((id) => id !== agentId)!
    strongest = Math.max(strongest, relations.get(other) ?? 0)
  }
  return clamp(strongest * 1_000)
}

function needFor(kind: HabitActivityKind, habit: CitizenHabitStateV1): number {
  switch (kind) {
    case 'rest': return habit.needs.rest
    case 'eat': return habit.needs.food
    case 'shop': return habit.needs.shopping
    case 'social': return habit.needs.social
    case 'work': return 0
    case 'leisure': return clamp(500 - habit.needs.rest / 2)
  }
}

function obligationFor(kind: HabitActivityKind, profile: HabitProfileV1,
  habit: CitizenHabitStateV1, day: number, minute: number): number {
  if (kind !== 'work' || profile.workStartMinute === null ||
    profile.workEndMinute === null || habit.completedWorkDay === day ||
    !profile.workDays.includes(day % 7)) return 0
  if (minuteInWindow(minute, profile.workStartMinute, profile.workEndMinute)) return 950
  const untilStart = (profile.workStartMinute - minute + 1_440) % 1_440
  return untilStart <= 90 ? 500 : 0
}

function timeFit(kind: HabitActivityKind, profile: HabitProfileV1, minute: number): number {
  if (kind === 'rest') return minuteInWindow(minute, profile.restMinute,
    profile.wakeMinute) ? 1_000 : 100
  if (kind === 'eat') return minuteInWindow(minute, 7 * 60, 10 * 60) ||
    minuteInWindow(minute, 12 * 60, 14 * 60) ||
    minuteInWindow(minute, 18 * 60, 21 * 60) ? 850 : 250
  if (kind === 'shop') return minuteInWindow(minute, 9 * 60, 20 * 60) ? 700 : 150
  if (kind === 'social' || kind === 'leisure') return minuteInWindow(minute,
    16 * 60, 23 * 60) ? 750 : 350
  return 500
}

function open(place: SemanticPlace, config: SimulationConfigV5,
  minute: number, modes: ReadonlyMap<string, AccessMode>): boolean {
  if (modes.get(`place:${place.id}`) === 'closed' ||
    modes.get('mall-entry') !== 'open' && (place.id === 'central-galleria' ||
      place.id.startsWith('galleria-'))) return false
  if (place.kind === 'home') return true
  const hours = config.placeOpeningHours?.[place.id] ?? place.openingHours
  return hours.some(({ openMinute, closeMinute }) =>
    minuteInWindow(minute, openMinute, closeMinute))
}

export function chooseHabitDestinationV1(citizen: CitizenStateV5,
  citizenProfile: CitizenProfileV5, habit: CitizenHabitStateV1,
  habitProfile: HabitProfileV1, world: WorldModelV2,
  config: SimulationConfigV5, scenario: HabitScenarioConfigV1,
  index: NavigationIndexV2, occupied: ReadonlySet<string>,
  modes: ReadonlyMap<string, AccessMode>, tick: number,
  priorEdgeCrowd: ReadonlyMap<string, number>,
  priorPlaceCrowd: ReadonlyMap<string, number>,
  state: SimulationStateV5): Readonly<{ choice: HabitChoiceV1 | null;
    trace: ActivityDecisionTraceV1 }> {
  const calendar = calendarAtTick(config.startHour, tick, scenario.calendarSecondsPerTick)
  const decisionId = `habit-decision:${citizen.id}:${habit.decisionOrdinal}`
  if (!citizen.currentNodeId) throw new Error('Habit decision requires a safe navigation node')
  const currentNode = index.nodeById.get(citizen.currentNodeId)
  const physicalSlot = config.placeInteraction && currentNode &&
    currentNode.position.x === citizen.position.x &&
    currentNode.position.y === citizen.position.y &&
    currentNode.position.z === citizen.position.z ? currentNode.id : null
  const started = timingObserver ? performance.now() : 0
  const routes = findRoutesFromV2(index, citizen.currentNodeId,
    citizenProfile.travellerCosts, modes, priorEdgeCrowd)
  const routed = timingObserver ? performance.now() : 0
  const candidates: ActivityCandidateTraceV1[] = []
  let best: { place: SemanticPlace; slotId: string; kind: HabitActivityKind;
    score: number } | null = null
  for (const place of world.places) for (const kind of kindsFor(place, citizenProfile)) {
    const addExcluded = (reason: string) => candidates.push({ kind, placeId: place.id,
      feasible: false, reason, terms: {}, score: null })
    if (!open(place, config, calendar.minuteOfDay, modes)) { addExcluded('closed'); continue }
    const slots = place.kind === 'home' ? [citizenProfile.homeSlotNodeId] :
      place.slotNodeIds.filter((id) => !occupied.has(id) ||
        id === citizen.reservedSlotNodeId || id === physicalSlot)
    const assignedCount = place.slotNodeIds.filter((id) => occupied.has(id) &&
      id !== citizen.reservedSlotNodeId && id !== physicalSlot).length
    if (!slots.length || config.placeInteraction && place.kind !== 'home' &&
      assignedCount >= place.capacity) {
      addExcluded('capacity'); continue
    }
    const slotId = config.placeInteraction && citizen.placeId === place.id && citizen.currentNodeId &&
      slots.includes(citizen.currentNodeId) ? citizen.currentNodeId :
      slots[Math.floor(unit(`${scenario.seed}\u0000slot\u0000${citizen.id}\u0000${calendar.day}\u0000${habit.decisionOrdinal}\u0000${place.id}`) * slots.length)]
    const routeCostMs = routes.costTo(slotId)
    if (routeCostMs === null) { addExcluded('unreachable'); continue }
    const needs = Math.round(300 * needFor(kind, habit) / 1_000)
    const obligation = Math.round(260 * obligationFor(kind, habitProfile, habit,
      calendar.day, calendar.minuteOfDay) / 1_000)
    const learned = Math.round(160 * scenario.habitWeight * habitProfile.regularity /
      1_000 * ((habit.activityStrength[kind] + (habit.placeStrength[place.id] ?? 200)) / 2_000))
    const preference = Math.round(120 * habitProfile.preference[kind] / 1_000) +
      (habitProfile.preferredPlaces.includes(place.id) ? 30 : 0)
    const social = kind === 'social' ? Math.round(45 * habitProfile.sociability /
      1_000 + 45 * scenario.feedbackWeight * socialAffinity(state, citizen.id,
        place.id) / 1_000) : 0
    const valence = Math.round(80 * scenario.feedbackWeight *
      ((habit.placeValence[place.id] ?? 500) - 500) / 500)
    const risk = Math.round(100 * scenario.feedbackWeight *
      (state.social?.perceivedPlaceRisks.find((item) =>
        item.ownerAgentId === citizen.id && item.placeId === place.id)?.score ?? 0))
    const time = Math.round(100 * timeFit(kind, habitProfile, calendar.minuteOfDay) / 1_000)
    const travel = Math.round(170 * clamp(routeCostMs / 1_800) / 1_000)
    const crowd = Math.round(90 * clamp((priorPlaceCrowd.get(place.id) ?? 0) *
      1_000 / Math.max(1, place.capacity)) / 1_000)
    const commitment = citizen.activity === 'atDestination' &&
      citizen.placeId !== place.id && tick < citizen.nextDecisionTick ?
        Math.round(120 * (1 - habitProfile.changeWillingness / 1_000)) : 0
    const variation = Math.floor(unit(`${scenario.seed}\u0000candidate\u0000${citizen.id}\u0000${calendar.day}\u0000${habit.decisionOrdinal}\u0000${kind}\u0000${place.id}`) * 61) - 30
    const terms = { needs, obligation, learned, preference, social, valence,
      time, variation, travel: -travel, crowd: -crowd, risk: -risk,
      commitment: -commitment }
    const score = Object.values(terms).reduce((sum, value) => sum + value, 0)
    candidates.push({ kind, placeId: place.id, feasible: true, reason: null, terms, score })
    if (!best || score > best.score || score === best.score &&
      `${kind}:${place.id}` < `${best.kind}:${best.place.id}`) {
      best = { place, slotId, kind, score }
    }
  }
  const trace: ActivityDecisionTraceV1 = { id: decisionId, agentId: citizen.id,
    tick, day: calendar.day, minuteOfDay: calendar.minuteOfDay,
    chosenKind: best?.kind ?? null, chosenPlaceId: best?.place.id ?? null,
    candidates, consideredCount: candidates.length,
    reason: best ? 'highest feasible utility' : 'no open reachable place with capacity' }
  if (timingObserver) timingObserver({ phase: 'decision', tick, agentId: citizen.id,
    routeTreeMs: routed - started,
    candidateScoringMs: performance.now() - routed,
    candidateCount: candidates.length })
  if (!best) return { choice: null, trace }
  const route = routes.routeTo(best.slotId)
  if (route.status !== 'ok') throw new Error('Chosen habit destination became unreachable')
  const activityKind: ActivityKind = best.kind === 'rest' ? 'home' :
    best.kind === 'social' ? 'leisure' : best.kind
  return { choice: { place: best.place, slotId: best.slotId, route,
    activityKind, habitKind: best.kind,
    dwellTicks: habitProfile.durations[best.kind], trace }, trace }
}

export function habitPlaceIsOpenV1(place: SemanticPlace, config: SimulationConfigV5,
  modes: ReadonlyMap<string, AccessMode>, tick: number): boolean {
  const seconds = config.habit?.calendarSecondsPerTick ?? config.logicalSecondsPerTick
  return open(place, config, calendarAtTick(config.startHour, tick, seconds).minuteOfDay, modes)
}
