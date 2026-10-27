import { hashSeed } from '../rng'
import type { CitizenProfileV5, CitizenStateV5, SimulationConfigV5,
  SimulationStateV5 } from '../v5Types'
import { calendarAtTick } from './calendar'
import { appendHabitLog, emptyHabitLog, type ActivityDecisionTraceV1,
  type ActivityHistoryV1, type ActivityIntentionV1, type CitizenHabitStateV1,
  type HabitActivityKind, type HabitChangeV1, type HabitProfileV1,
  type HabitScenarioConfigV1, type HabitsStateV1, type DailyGoalV1 } from './types'

const clamp = (value: number) => Math.max(0, Math.min(1_000, Math.round(value)))
const activityKinds: readonly HabitActivityKind[] =
  ['rest', 'work', 'eat', 'shop', 'leisure', 'social']

function dailyGoals(profile: HabitProfileV1, homePlaceId: string,
  workPlaceId: string | null, day: number): readonly DailyGoalV1[] {
  const goals: DailyGoalV1[] = [
    { id: `habit-goal:${profile.agentId}:${day}:rest`, day, kind: 'rest',
      placeId: homePlaceId, startMinute: profile.restMinute,
      endMinute: profile.wakeMinute, priority: 650, status: 'planned' },
    ...[[7 * 60, 10 * 60], [12 * 60, 14 * 60], [18 * 60, 21 * 60]]
      .map(([startMinute, endMinute], index): DailyGoalV1 => ({
        id: `habit-goal:${profile.agentId}:${day}:eat:${index}`, day,
        kind: 'eat', placeId: null, startMinute, endMinute,
        priority: 450, status: 'planned',
      })),
  ]
  if (workPlaceId && profile.workStartMinute !== null &&
    profile.workEndMinute !== null && profile.workDays.includes(day % 7)) {
    goals.push({ id: `habit-goal:${profile.agentId}:${day}:work`, day,
      kind: 'work', placeId: workPlaceId,
      startMinute: profile.workStartMinute, endMinute: profile.workEndMinute,
      priority: 900, status: 'planned' })
  }
  return goals
}

let preparationObserver: ((sample: { tick: number; durationMs: number }) => void) | null = null

export function setHabitPreparationTimingObserverV1(
  observer: ((sample: { tick: number; durationMs: number }) => void) | null): void {
  preparationObserver = observer
}

export function createInitialHabitsStateV1(profiles: readonly HabitProfileV1[],
  citizens: readonly CitizenProfileV5[],
  config: SimulationConfigV5, scenario: HabitScenarioConfigV1): HabitsStateV1 {
  const day = calendarAtTick(config.startHour, 0, scenario.calendarSecondsPerTick).day
  const homes = new Map(citizens.map((item) => [item.id, item.homePlaceId]))
  const workplaces = new Map(citizens.map((item) => [item.id, item.workPlaceId]))
  return { version: 'habit-v1', citizens: profiles.map((profile) => {
    const draw = (purpose: string) => hashSeed(`${scenario.seed}\u0000initial\u0000${profile.agentId}\u0000${purpose}`) % 101
    const strength = Object.fromEntries(activityKinds.map((kind) =>
      [kind, 160 + draw(`strength:${kind}`)])) as Record<HabitActivityKind, number>
    return { agentId: profile.agentId, day,
      needs: { rest: 120 + draw('rest'), food: 180 + draw('food'),
        shopping: 160 + draw('shopping'), social: 180 + draw('social') },
      activityStrength: strength, placeStrength: {}, placeValence: {},
      completedWorkDay: null,
      dailyGoals: dailyGoals(profile, homes.get(profile.agentId)!,
        workplaces.get(profile.agentId) ?? null, day),
      decisionOrdinal: 0,
      intention: { id: `habit-intention:${profile.agentId}:initial-home`,
        kind: 'rest', placeId: homes.get(profile.agentId)!, status: 'active',
        createdTick: 0, decisionId: 'initial-home', goalId: null,
        reason: 'initial home occupancy' },
      arrivedTick: 0, decisions: emptyHabitLog(),
      history: emptyHabitLog(), changes: emptyHabitLog() }
  }) }
}

/** Ephemeral Tick writer: previous states and shared history chunks are never mutated. */
export class HabitTickV1 {
  private readonly byId: Map<string, CitizenHabitStateV1>
  private readonly profiles: ReadonlyMap<string, HabitProfileV1>
  private readonly citizenProfiles: ReadonlyMap<string, CitizenProfileV5>
  private readonly config: SimulationConfigV5
  private readonly scenario: HabitScenarioConfigV1
  private readonly tick: number

  constructor(previous: SimulationStateV5, profiles: readonly HabitProfileV1[],
    citizenProfiles: readonly CitizenProfileV5[], config: SimulationConfigV5) {
    const started = preparationObserver ? performance.now() : 0
    if (!previous.habits || !config.habit) {
      throw new Error('Habit Tick requires enabled habit state and config')
    }
    this.byId = new Map(previous.habits.citizens.map((item) => [item.agentId, item]))
    this.profiles = new Map(profiles.map((item) => [item.agentId, item]))
    this.citizenProfiles = new Map(citizenProfiles.map((item) => [item.id, item]))
    this.config = config
    this.scenario = config.habit
    this.tick = previous.tick + 1
    const day = calendarAtTick(this.config.startHour, this.tick,
      this.scenario.calendarSecondsPerTick).day
    const memories = previous.social?.memories.filter((item) =>
      item.createdTick === previous.tick && item.placeId) ?? []
    const memoriesByOwner = new Map<string, typeof memories>()
    const lifeById = new Map(previous.life?.people.map((item) =>
      [item.agentId, item]) ?? [])
    for (const memory of memories) {
      const group = memoriesByOwner.get(memory.ownerAgentId) ?? []
      memoriesByOwner.set(memory.ownerAgentId, [...group, memory])
    }
    for (const citizen of previous.citizens) {
      const life = lifeById.get(citizen.id)
      if (life?.lifeStatus === 'deceased' ||
        life?.functionalStatus === 'incapacitated') continue
      let habit = this.get(citizen.id)
      const profile = this.profiles.get(citizen.id)!
      if (habit.day !== day) {
        for (const kind of activityKinds) {
          const before = habit.activityStrength[kind]
          const after = clamp(200 + (before - 200) * 0.98)
          habit = { ...habit, activityStrength: { ...habit.activityStrength, [kind]: after } }
          if (after !== before) habit = this.change(habit, `activity:${kind}`, before,
            after, `day:${day}`, 'dailyDecay')
        }
        for (const [placeId, before] of Object.entries(habit.placeStrength)) {
          const after = clamp(200 + (before - 200) * 0.985)
          habit = { ...habit, placeStrength: { ...habit.placeStrength, [placeId]: after } }
          if (after !== before) habit = this.change(habit, `place:${placeId}`, before,
            after, `day:${day}`, 'dailyDecay')
        }
        for (const [placeId, before] of Object.entries(habit.placeValence)) {
          const after = clamp(500 + (before - 500) * 0.98)
          habit = { ...habit, placeValence: { ...habit.placeValence, [placeId]: after } }
          if (after !== before) habit = this.change(habit, `valence:${placeId}`, before,
            after, `day:${day}`, 'dailyDecay')
        }
        const citizenProfile = this.citizenProfiles.get(citizen.id)!
        habit = { ...habit, day,
          dailyGoals: dailyGoals(profile, citizenProfile.homePlaceId,
            citizenProfile.workPlaceId, day) }
      }
      const active = habit.intention?.status === 'active' ? habit.intention.kind : null
      habit = { ...habit, needs: {
        rest: clamp(habit.needs.rest + (citizen.activity === 'atHome' ? -2 : 1)),
        food: clamp(habit.needs.food + (active === 'eat' ? -10 : 1)),
        shopping: clamp(habit.needs.shopping + (active === 'shop' ? -8 :
          this.tick % profile.shoppingCadenceTicks === 0 ? 1 : 0)),
        social: clamp(habit.needs.social + (citizen.activity === 'interacting' ? -8 :
          this.tick % 15 === 0 ? 1 : 0)),
      } }
      for (const memory of memoriesByOwner.get(citizen.id) ?? []) {
        const placeId = memory.placeId!
        const before = habit.placeValence[placeId] ?? 500
        const direction = memory.category === 'interaction' ? 1 :
          memory.category === 'victimExperience' ? -1 :
            memory.category === 'witness' ? -0.5 : 0
        const after = clamp(before + direction * 80 * memory.confidence *
          memory.salience)
        if (before !== after) {
          habit = { ...habit, placeValence: { ...habit.placeValence, [placeId]: after } }
          habit = this.change(habit, `valence:${placeId}`, before, after,
            memory.id, 'experience')
        }
      }
      this.byId.set(citizen.id, habit)
    }
    preparationObserver?.({ tick: this.tick, durationMs: performance.now() - started })
  }

  get(agentId: string): CitizenHabitStateV1 {
    const state = this.byId.get(agentId)
    if (!state) throw new Error(`Unknown habit citizen ${agentId}`)
    return state
  }

  private change(state: CitizenHabitStateV1, key: string, before: number, after: number,
    sourceId: string, rule: HabitChangeV1['rule']): CitizenHabitStateV1 {
    const item: HabitChangeV1 = { id: `habit-change:${state.agentId}:${this.tick}:${key}:${sourceId}`,
      agentId: state.agentId, tick: this.tick, key, before, after, sourceId, rule }
    return { ...state, changes: appendHabitLog(state.changes, item) }
  }

  finishActivity(citizen: CitizenStateV5, outcome: 'completed' | 'interrupted',
    reason: string, hadSocialInteraction = false): void {
    let state = this.get(citizen.id)
    const intention = state.intention
    if (!intention || intention.status !== 'active' || state.arrivedTick === null) return
    const actualKind = intention.kind === 'social' ? 'leisure' : intention.kind
    const history: ActivityHistoryV1 = { intentionId: intention.id,
      agentId: citizen.id, kind: actualKind,
      placeId: intention.placeId,
      startTick: state.arrivedTick, endTick: this.tick, outcome,
      reason: intention.kind === 'social' && !hadSocialInteraction &&
        outcome === 'completed' ? 'social visit ended without an interaction' : reason }
    state = { ...state, history: appendHabitLog(state.history, history),
      intention: { ...intention, status: outcome }, arrivedTick: null }
    if (intention.goalId) state = { ...state,
      dailyGoals: state.dailyGoals.map((goal) => goal.id === intention.goalId ?
        { ...goal, status: outcome === 'completed' ? 'completed' : 'delayed' } : goal) }
    if (outcome === 'completed') {
      const reinforcedKind = intention.kind === 'social' && !hadSocialInteraction ?
        'leisure' : intention.kind
      const beforeActivity = state.activityStrength[reinforcedKind]
      const afterActivity = clamp(beforeActivity + (1_000 - beforeActivity) * 0.045)
      state = { ...state, activityStrength: { ...state.activityStrength,
        [reinforcedKind]: afterActivity } }
      state = this.change(state, `activity:${reinforcedKind}`, beforeActivity,
        afterActivity, intention.id, 'completion')
      const beforePlace = state.placeStrength[intention.placeId] ?? 200
      const afterPlace = clamp(beforePlace + (1_000 - beforePlace) * 0.04)
      state = { ...state, placeStrength: { ...state.placeStrength,
        [intention.placeId]: afterPlace },
        completedWorkDay: intention.kind === 'work' ? state.day : state.completedWorkDay }
      state = this.change(state, `place:${intention.placeId}`, beforePlace,
        afterPlace, intention.id, 'completion')
    }
    this.byId.set(citizen.id, state)
  }

  recordDecision(agentId: string, trace: ActivityDecisionTraceV1): void {
    const prior = this.get(agentId)
    this.byId.set(agentId, { ...prior, decisionOrdinal: prior.decisionOrdinal + 1,
      decisions: appendHabitLog(prior.decisions, trace) })
  }

  startIntention(agentId: string, kind: HabitActivityKind, placeId: string,
    decisionId: string, alreadyThere: boolean): void {
    const prior = this.get(agentId)
    const minute = calendarAtTick(this.config.startHour, this.tick,
      this.scenario.calendarSecondsPerTick).minuteOfDay
    const goal = prior.dailyGoals.find((item) => item.kind === kind &&
      item.status === 'planned' && (item.startMinute < item.endMinute ?
        minute >= item.startMinute && minute < item.endMinute :
        minute >= item.startMinute || minute < item.endMinute))
    const intention: ActivityIntentionV1 = { id: `habit-intention:${agentId}:${this.tick}:${decisionId}`,
      kind, placeId, status: alreadyThere ? 'active' : 'travelling',
      createdTick: this.tick, decisionId, goalId: goal?.id ?? null,
      reason: 'highest feasible utility' }
    this.byId.set(agentId, { ...prior, intention,
      arrivedTick: alreadyThere ? this.tick : null,
      dailyGoals: goal ? prior.dailyGoals.map((item) => item.id === goal.id ?
        { ...item, status: 'active' } : item) : prior.dailyGoals })
  }

  arrival(agentId: string): void {
    const prior = this.get(agentId)
    if (!prior.intention) return
    this.byId.set(agentId, { ...prior, intention: { ...prior.intention, status: 'active' },
      arrivedTick: this.tick,
      dailyGoals: prior.intention.goalId ? prior.dailyGoals.map((item) =>
        item.id === prior.intention!.goalId ? { ...item, status: 'active' } : item) :
        prior.dailyGoals })
  }

  delay(agentId: string, reason: string): void {
    const prior = this.get(agentId)
    if (!prior.intention || prior.intention.status === 'completed') return
    this.byId.set(agentId, { ...prior, intention: { ...prior.intention,
      status: 'delayed', reason },
      dailyGoals: prior.intention.goalId ? prior.dailyGoals.map((item) =>
        item.id === prior.intention!.goalId ? { ...item, status: 'delayed' } : item) :
        prior.dailyGoals })
  }

  cancel(agentId: string, reason: string): void {
    let prior = this.get(agentId)
    if (!prior.intention || prior.intention.status === 'completed') return
    const intention = prior.intention
    const history: ActivityHistoryV1 = { intentionId: intention.id, agentId,
      kind: intention.kind, placeId: intention.placeId,
      startTick: intention.createdTick, endTick: this.tick,
      outcome: 'cancelled', reason }
    const before = prior.placeStrength[intention.placeId] ?? 200
    const after = clamp(before * 0.92)
    prior = { ...prior, intention: { ...intention, status: 'cancelled', reason },
      arrivedTick: null, history: appendHabitLog(prior.history, history),
      placeStrength: { ...prior.placeStrength, [intention.placeId]: after },
      dailyGoals: intention.goalId ? prior.dailyGoals.map((item) =>
        item.id === intention.goalId ? { ...item, status: 'cancelled' } : item) :
        prior.dailyGoals }
    prior = this.change(prior, `place:${intention.placeId}`, before, after,
      intention.id, 'frustration')
    this.byId.set(agentId, prior)
  }

  finish(): HabitsStateV1 {
    return { version: 'habit-v1', citizens: [...this.byId.values()] }
  }
}

/** A life event terminates one existing intention without inventing an activity. */
export function interruptHabitForLifeV1(habits: HabitsStateV1, agentId: string,
  tick: number, reason: string, terminal: boolean): HabitsStateV1 {
  return { ...habits, citizens: habits.citizens.map((habit) => {
    if (habit.agentId !== agentId) return habit
    const goals = terminal ? habit.dailyGoals.map((goal) =>
      goal.status === 'planned' || goal.status === 'active' || goal.status === 'delayed' ?
        { ...goal, status: 'cancelled' as const } : goal) : habit.dailyGoals
    if (!habit.intention ||
      habit.intention.status === 'completed' ||
      habit.intention.status === 'cancelled') return terminal ?
      { ...habit, dailyGoals: goals } : habit
    const intention = habit.intention
    const outcome = habit.arrivedTick === null ? 'cancelled' as const :
      'interrupted' as const
    const record: ActivityHistoryV1 = { intentionId: intention.id, agentId,
      kind: intention.kind === 'social' ? 'leisure' : intention.kind,
      placeId: intention.placeId,
      startTick: habit.arrivedTick ?? intention.createdTick, endTick: tick,
      outcome, reason }
    return { ...habit, intention: { ...intention,
      status: terminal ? 'cancelled' as const : 'interrupted' as const,
      reason }, arrivedTick: null,
    history: appendHabitLog(habit.history, record),
    dailyGoals: goals.map((goal) => goal.id === intention.goalId ?
      { ...goal, status: terminal ? 'cancelled' as const : 'delayed' as const } : goal) }
  }) }
}
