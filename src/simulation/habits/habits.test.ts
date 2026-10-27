import { describe, expect, it } from 'vitest'
import { generateIntegratedWorld } from '../../world/generation/generateIntegratedWorld'
import { createNavigationIndexV2, findRouteV2 } from '../../world/navigation/routeV2'
import { createEnvironmentV5, createInitialStateV5, advanceStateV5 } from '../engineV5'
import { replayV5 } from '../replayV5'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../v5Types'
import { createInitialSocialStateV1 } from '../encounter/state'
import { observerViewV5 } from '../offending/opportunityV5'
import { SimulationSessionV5 } from '../sessionV5'
import { summarizeDailyHabitsV1, summarizeRoutineRegularityV1 } from './metrics'
import { calendarAtTick } from './calendar'
import { chooseHabitDestinationV1 } from './decision'
import { HabitTickV1 } from './state'
import { appendHabitLog, DEFAULT_HABIT_SCENARIO_V1, readHabitLog,
  type ActivityHistoryV1 } from './types'

const world = generateIntegratedWorld('shadow-city-hero-01')
const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 6,
  habit: DEFAULT_HABIT_SCENARIO_V1 }

describe('daily habits on the existing v5 world', () => {
  it('maps Tick to a deterministic calendar without changing six-second movement', () => {
    expect(calendarAtTick(8, 0, 30)).toMatchObject({ day: 0, minuteOfDay: 480,
      ticksPerDay: 2880 })
    expect(calendarAtTick(8, 1919, 30).day).toBe(0)
    expect(calendarAtTick(8, 1920, 30)).toMatchObject({ day: 1,
      minuteOfDay: 0 })
    expect(calendarAtTick(8, 4800, 30).day).toBe(2)
  })

  it('generates distinct stable habit profiles without reading appearance', () => {
    const first = createEnvironmentV5(world, config)
    const second = createEnvironmentV5(world, config)
    expect(first.habitProfiles).toEqual(second.habitProfiles)
    expect(new Set(first.habitProfiles!.map((item) => item.wakeMinute)).size).toBeGreaterThan(1)
    expect(first.habitProfiles!.every((item) => item.workStartMinute === null ||
      first.profiles.find((profile) => profile.id === item.agentId)?.workPlaceId)).toBe(true)
    expect(createEnvironmentV5(world, { ...config,
      habit: { ...config.habit, seed: 'different-habit-seed' } }).habitProfiles)
      .not.toEqual(first.habitProfiles)
  })

  it('uses a past personal experience in a later candidate utility', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const citizen = initial.citizens[0]
    const profile = environment.profiles[0]
    const habitProfile = environment.habitProfiles![0]
    const index = createNavigationIndexV2(world)
    const pick = (state: typeof initial, habit = state.habits!.citizens[0]) =>
      chooseHabitDestinationV1(citizen, profile, habit, habitProfile,
        world, config, config.habit, index, new Set(), new Map(), 1,
        new Map(), new Map(), state)
    const baseline = pick(initial)
    const place = baseline.trace.candidates.find((item) => item.feasible &&
      item.kind !== 'rest')!
    expect(place).toBeDefined()
    const memory = { id: 'test-personal-experience', ownerAgentId: citizen.id,
      category: 'victimExperience' as const, subjectToken: null,
      placeId: place.placeId, surfaceId: null, createdTick: 0, lastUpdatedTick: 0,
      source: 'direct' as const, provenanceId: 'test-observation',
      observationCode: 'perceived-personal-incident', confidence: 1, salience: 1 }
    const withMemory = { ...initial, social: { ...createInitialSocialStateV1(),
      memories: [memory] } }
    const nextHabit = new HabitTickV1(withMemory, environment.habitProfiles!,
      environment.profiles, config)
      .get(citizen.id)
    expect(nextHabit.placeValence[place.placeId]).toBeLessThan(500)
    const adapted = pick(withMemory, nextHabit)
    const adaptedCandidate = adapted.trace.candidates.find((item) =>
      item.kind === place.kind && item.placeId === place.placeId)!
    expect(adaptedCandidate.terms.valence).toBeLessThan(place.terms.valence)
    expect(readHabitLog(nextHabit.changes).some((item) =>
      item.sourceId === memory.id)).toBe(true)
  })

  it('replays across a day boundary with real decisions, trips and habit updates', () => {
    const environment = createEnvironmentV5(world, config)
    const index = createNavigationIndexV2(world)
    let state = createInitialStateV5(environment)
    for (let tick = 0; tick < 4801; tick += 1) {
      state = advanceStateV5(state, environment, index)
    }
    const replay = replayV5(world, { fingerprint: environment.fingerprint,
      config, commands: [], targetTick: 4801 })
    expect(replay).toEqual(state)
    expect(calendarAtTick(config.startHour, state.tick, 30).day).toBe(2)
    expect(state.habits!.citizens.some((item) => item.decisions.length > 0)).toBe(true)
    expect(state.habits!.citizens.some((item) => item.history.length > 0)).toBe(true)
    expect(state.habits!.citizens.some((item) => item.changes.length > 0)).toBe(true)
    expect(state.citizens.every((item) => world.surfaces.some((surface) =>
      surface.id === item.surfaceId))).toBe(true)
    const dayOne = summarizeDailyHabitsV1(state, environment, 1)
    expect(dayOne.every((item) => item.completeDay)).toBe(true)
    expect(dayOne.some((item) => item.tripCount > 0)).toBe(true)
    expect(JSON.stringify(observerViewV5(state))).not.toContain('habit-decision')
    expect(createInitialStateV5(environment)).toEqual(replayV5(world, {
      fingerprint: environment.fingerprint, config, commands: [], targetTick: 0 }))
  }, 120_000)

  it('blocks closed places and keeps route and utility decisions deterministic', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const citizen = initial.citizens[0]
    const profile = environment.profiles[0]
    const habitProfile = environment.habitProfiles![0]
    const index = createNavigationIndexV2(world)
    const decide = (modes: Map<string, 'open' | 'closed'>) =>
      chooseHabitDestinationV1(citizen, profile, initial.habits!.citizens[0],
        habitProfile, world, config, config.habit, index, new Set(), modes,
        1, new Map(), new Map(), initial)
    const first = decide(new Map())
    expect(decide(new Map())).toEqual(first)
    const target = first.trace.candidates.find((item) => item.feasible &&
      item.kind !== 'rest')!
    expect(target).toBeDefined()
    const closed = decide(new Map([[`place:${target.placeId}`, 'closed']]))
    expect(closed.trace.candidates.find((item) => item.kind === target.kind &&
      item.placeId === target.placeId)).toMatchObject({ feasible: false, reason: 'closed' })
  })

  it('changes recorded decision input when habit weight changes without changing random draws', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const index = createNavigationIndexV2(world)
    const decide = (habitWeight: number) => chooseHabitDestinationV1(initial.citizens[0],
      environment.profiles[0], initial.habits!.citizens[0], environment.habitProfiles![0],
      world, config, { ...config.habit, habitWeight }, index, new Set(), new Map(),
      1, new Map(), new Map(), initial)
    const low = decide(0)
    const high = decide(2)
    const lowCandidate = low.trace.candidates.find((item) => item.feasible &&
      item.kind !== 'rest')!
    const highCandidate = high.trace.candidates.find((item) =>
      item.placeId === lowCandidate.placeId && item.kind === lowCandidate.kind)!
    expect(lowCandidate.terms.learned).toBe(0)
    expect(highCandidate.terms.learned).toBeGreaterThan(0)
    expect(highCandidate.terms.variation).toBe(lowCandidate.terms.variation)
  })

  it('rolls provisional goals to a new day while Reset restores Tick zero', () => {
    const session = new SimulationSessionV5(world, { ...config, populationSize: 12 })
    const initial = session.getSnapshot().state
    expect(initial.habits!.citizens.every((item) => item.dailyGoals.every((goal) =>
      goal.day === 0 && goal.status === 'planned'))).toBe(true)
    for (let tick = 0; tick < 1930; tick += 1) session.advanceOneTick()
    expect(session.getSnapshot().state.habits!.citizens.every((item) =>
      item.dailyGoals.every((goal) => goal.day === 1))).toBe(true)
    const inspected = session.inspectTick(100)
    expect(inspected.habits!.citizens.every((item) => item.day === 0)).toBe(true)
    session.reset()
    expect(session.getSnapshot().state).toEqual(initial)
  })

  it('does not reward a social intention without a real interaction', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const place = world.places.find((item) => item.kind === 'plaza') ??
      world.places.find((item) => item.kind === 'park')!
    const citizen = { ...initial.citizens[0], activity: 'atDestination' as const,
      placeId: place.id }
    const habit = { ...initial.habits!.citizens[0], arrivedTick: 0,
      intention: { id: 'social-test', kind: 'social' as const,
        placeId: place.id, status: 'active' as const, createdTick: 0,
        decisionId: 'social-test-decision', goalId: null, reason: 'test' } }
    const state = { ...initial, citizens: [citizen, ...initial.citizens.slice(1)],
      habits: { version: 'habit-v1' as const,
        citizens: [habit, ...initial.habits!.citizens.slice(1)] } }
    const without = new HabitTickV1(state, environment.habitProfiles!,
      environment.profiles, config)
    without.finishActivity(citizen, 'completed', 'duration ended', false)
    expect(without.get(citizen.id).activityStrength.social).toBe(habit.activityStrength.social)
    expect(without.get(citizen.id).activityStrength.leisure).toBeGreaterThan(
      habit.activityStrength.leisure)
    expect(readHabitLog(without.get(citizen.id).history).at(-1)).toMatchObject({
      kind: 'leisure', reason: 'social visit ended without an interaction' })
    const withInteraction = new HabitTickV1(state, environment.habitProfiles!,
      environment.profiles, config)
    withInteraction.finishActivity(citizen, 'completed', 'duration ended', true)
    expect(withInteraction.get(citizen.id).activityStrength.social).toBeGreaterThan(
      habit.activityStrength.social)
  })

  it('defines routine regularity only over two complete calendar days', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const first = initial.habits!.citizens[0]
    const home = environment.profiles[0].homePlaceId
    const history = appendHabitLog<ActivityHistoryV1>(appendHabitLog<ActivityHistoryV1>(first.history, {
      intentionId: 'day1', agentId: first.agentId, kind: 'rest', placeId: home,
      startTick: 1920, endTick: 4800, outcome: 'completed', reason: 'test',
    }), { intentionId: 'day2', agentId: first.agentId, kind: 'rest', placeId: home,
      startTick: 4800, endTick: 7680, outcome: 'completed', reason: 'test' })
    const state = { ...initial, tick: 7680, habits: { ...initial.habits!,
      citizens: [{ ...first, history }, ...initial.habits!.citizens.slice(1)] } }
    const item = summarizeRoutineRegularityV1(state, environment, 1, 2)[0]
    expect(item).toMatchObject({ matchingHourBins: 24,
      comparableHourBins: 24, share: 1 })
    expect(() => summarizeRoutineRegularityV1({ ...state, tick: 7679 },
      environment, 1, 2)).toThrow(/incomplete/)
  })

  it('uses prior directed familiarity only at a personally experienced social place', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const citizen = initial.citizens[0]
    const other = initial.citizens[1]
    const index = createNavigationIndexV2(world)
    const decide = (state: typeof initial) => chooseHabitDestinationV1(citizen,
      environment.profiles[0], initial.habits!.citizens[0],
      environment.habitProfiles![0], world, config, config.habit,
      index, new Set(), new Map(), 1, new Map(), new Map(), state)
    const baseline = decide(initial)
    const candidate = baseline.trace.candidates.find((item) =>
      item.feasible && item.kind === 'social')!
    expect(candidate).toBeDefined()
    const social = createInitialSocialStateV1()
    const experience = { ...initial, social: { ...social,
      interactions: [{ id: 'real-past-interaction', encounterId: 'encounter',
        participantIds: [citizen.id, other.id] as const,
        type: 'conversation' as const, status: 'completed' as const,
        decisionTick: 0, startTick: 0, plannedEndTick: 0, endTick: 0,
        placeId: candidate.placeId, surfaceId: null }],
      relationships: [{ ownerAgentId: citizen.id, referentAgentId: other.id,
        subjectToken: 'known-person', familiarity: 0.8,
        recognitionStrength: 0.8, trust: 0.5, encounterCount: 1,
        greetingCount: 0, conversationCount: 1, lastEncounterTick: 0,
        lastUpdatedTick: 0, believedIdentity: null }],
    } }
    const later = decide(experience)
    const affected = later.trace.candidates.find((item) => item.kind === 'social' &&
      item.placeId === candidate.placeId)!
    expect(affected.terms.social).toBeGreaterThan(candidate.terms.social)
    const unrelated = baseline.trace.candidates.find((item) => item.kind === 'social' &&
      item.placeId !== candidate.placeId && item.feasible)!
    expect(later.trace.candidates.find((item) => item.kind === 'social' &&
      item.placeId === unrelated.placeId)?.terms.social).toBe(unrelated.terms.social)
  })

  it('lets subjective personal place risk change an otherwise identical destination choice', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const index = createNavigationIndexV2(world)
    let changed = false
    for (let i = 0; i < initial.citizens.length; i += 1) {
      const citizen = initial.citizens[i]
      const decide = (state: typeof initial) => chooseHabitDestinationV1(citizen,
        environment.profiles[i], initial.habits!.citizens[i],
        environment.habitProfiles![i], world, config, config.habit,
        index, new Set(), new Map(), 1, new Map(), new Map(), state)
      const baseline = decide(initial)
      if (!baseline.choice || baseline.choice.place.kind === 'home') continue
      const personalRisk = { ...initial, social: { ...createInitialSocialStateV1(),
        perceivedPlaceRisks: [{ ownerAgentId: citizen.id,
          placeId: baseline.choice.place.id, score: 1,
          lastUpdatedTick: 0, sourceObservationId: 'personal-observation' }],
      } }
      const later = decide(personalRisk)
      const beforeScore = baseline.trace.candidates.find((item) =>
        item.kind === baseline.choice!.habitKind &&
        item.placeId === baseline.choice!.place.id)!.score!
      const afterScore = later.trace.candidates.find((item) =>
        item.kind === baseline.choice!.habitKind &&
        item.placeId === baseline.choice!.place.id)!.score!
      expect(afterScore).toBeLessThan(beforeScore)
      if (later.choice?.place.id !== baseline.choice.place.id) changed = true
    }
    expect(changed).toBe(true)
  })

  it('keeps competing work and rest obligations in one explainable exclusive decision', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const index = createNavigationIndexV2(world)
    const employedIndex = environment.profiles.findIndex((item) => item.workPlaceId !== null)
    expect(employedIndex).toBeGreaterThanOrEqual(0)
    const citizen = initial.citizens[employedIndex]
    const profile = environment.habitProfiles![employedIndex]
    const overlapping = { ...profile, workStartMinute: 0, workEndMinute: 1440,
      workDays: [0], restMinute: 0, wakeMinute: 1440 }
    const result = chooseHabitDestinationV1(citizen,
      environment.profiles[employedIndex], initial.habits!.citizens[employedIndex],
      overlapping, world, config, config.habit, index, new Set(), new Map(),
      1, new Map(), new Map(), initial)
    expect(result.trace.candidates.some((item) => item.kind === 'work' &&
      item.feasible && item.terms.obligation > 0)).toBe(true)
    expect(result.trace.candidates.some((item) => item.kind === 'rest' &&
      item.feasible)).toBe(true)
    expect(result.choice).not.toBeNull()
    expect(result.trace.chosenKind).toBe(result.choice!.habitKind)
  })

  it('falls back to home when all public activity slots are occupied', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const occupied = new Set(world.places.filter((item) => item.kind !== 'home')
      .flatMap((item) => item.slotNodeIds))
    const result = chooseHabitDestinationV1(initial.citizens[0],
      environment.profiles[0], initial.habits!.citizens[0],
      environment.habitProfiles![0], world, config, config.habit,
      createNavigationIndexV2(world), occupied, new Map(), 1,
      new Map(), new Map(), initial)
    expect(result.choice?.place.id).toBe(environment.profiles[0].homePlaceId)
    expect(result.trace.candidates.some((item) => item.reason === 'capacity')).toBe(true)
  })

  it('keeps a legal shop-to-home evacuation route after mall closing', () => {
    const environment = createEnvironmentV5(world, config)
    const route = findRouteV2(createNavigationIndexV2(world),
      'shop:cafe:l0:slot:1', environment.profiles[0].homeSlotNodeId,
      environment.profiles[0].travellerCosts,
      new Map<string, 'closed'>([['place:galleria-cafe-l0', 'closed'],
        ['place:central-galleria', 'closed'], ['mall-entry', 'closed']]))
    expect(route.status).toBe('ok')
  })

  it('cancels a newly closed destination through the existing route, then redecides', () => {
    const session = new SimulationSessionV5(world, config)
    let traveler = session.getSnapshot().state.citizens.find((item) =>
      item.activity === 'travelling' && item.destinationPlaceId)
    for (let tick = 0; tick < 3600 && !traveler; tick += 1) {
      session.advanceOneTick()
      traveler = session.getSnapshot().state.citizens.find((item) =>
        item.activity === 'travelling' && item.destinationPlaceId)
    }
    expect(traveler?.destinationPlaceId).toBeTruthy()
    const target = traveler!.destinationPlaceId!
    const prior = traveler!.position
    session.scheduleAccessCommand({ id: 'test-close-place',
      effectiveTick: session.getSnapshot().liveTick + 1,
      accessId: `place:${target}`, mode: 'closed' })
    for (let tick = 0; tick < 120; tick += 1) session.advanceOneTick()
    const state = session.getSnapshot().state
    expect(state.events.some((item) => item.agentId === traveler!.id &&
      item.type === 'TripFailed')).toBe(true)
    expect(state.habits!.citizens.find((item) => item.agentId === traveler!.id)!
      .changes.length).toBeGreaterThan(0)
    expect(Math.abs(state.citizens.find((item) => item.id === traveler!.id)!.position.x -
      prior.x)).toBeLessThan(world.config.extentMm)
  })
})
