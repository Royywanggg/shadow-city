import type { SimulationEnvironmentV5, SimulationStateV5 } from '../v5Types'
import { calendarAtTick } from './calendar'
import { readHabitLog, type HabitActivityKind } from './types'

export interface DailyHabitMetricsV1 {
  readonly agentId: string
  readonly day: number
  readonly completeDay: boolean
  readonly completedActivities: Readonly<Record<HabitActivityKind, number>>
  readonly activityMinutes: Readonly<Record<HabitActivityKind, number>>
  readonly tripCount: number
  readonly meanTripMotionSeconds: number | null
  readonly meanTripCalendarMinutes: number | null
  readonly uniqueDestinationCount: number
  readonly destinationDiversity: number | null
  readonly repeatVisitShare: number | null
  readonly cancellationRate: number | null
  readonly workStartDeviationMinutes: number | null
  readonly habitStrengthNetChange: number
  readonly socialInteractionCount: number
  readonly socialInteractionMotionSeconds: number
}

export interface RoutineRegularityV1 {
  readonly agentId: string
  readonly firstDay: number
  readonly secondDay: number
  readonly matchingHourBins: number
  readonly comparableHourBins: number
  readonly share: number | null
}

const kinds: readonly HabitActivityKind[] =
  ['rest', 'work', 'eat', 'shop', 'leisure', 'social']

export function summarizeDailyHabitsV1(state: SimulationStateV5,
  environment: SimulationEnvironmentV5, day: number): readonly DailyHabitMetricsV1[] {
  const config = environment.config
  if (!state.habits || !config.habit || !Number.isSafeInteger(day) || day < 0) {
    throw new Error('Daily habit metrics require a valid habit state and day')
  }
  const secondsPerTick = config.habit.calendarSecondsPerTick
  const startSeconds = config.startHour * 3600
  const dayStartTick = Math.max(0, Math.ceil((day * 86_400 - startSeconds) / secondsPerTick))
  const dayEndTick = Math.ceil(((day + 1) * 86_400 - startSeconds) / secondsPerTick)
  const completeDay = dayStartTick > 0 && state.tick >= dayEndTick
  const inDay = (tick: number) => tick >= dayStartTick && tick < dayEndTick
  const profiles = new Map(environment.profiles.map((item) => [item.id, item]))
  const habitProfiles = new Map(environment.habitProfiles?.map((item) =>
    [item.agentId, item]) ?? [])
  return state.habits.citizens.map((habit): DailyHabitMetricsV1 => {
    const completedActivities = Object.fromEntries(kinds.map((kind) =>
      [kind, 0])) as Record<HabitActivityKind, number>
    const activityMinutes = { ...completedActivities }
    const history = readHabitLog(habit.history)
    const intervals = [...history.filter((item) => item.outcome !== 'cancelled'),
      ...(habit.intention?.status === 'active' && habit.arrivedTick !== null ? [{
        kind: habit.intention.kind === 'social' ? 'leisure' as const : habit.intention.kind,
        startTick: habit.arrivedTick, endTick: state.tick,
      }] : [])]
    for (const item of intervals) {
      const overlap = Math.max(0, Math.min(item.endTick, dayEndTick, state.tick) -
        Math.max(item.startTick, dayStartTick))
      activityMinutes[item.kind] += overlap * secondsPerTick / 60
    }
    for (const item of history) if (item.outcome === 'completed' && inDay(item.endTick)) {
      completedActivities[item.kind] += 1
    }
    const events = state.events.filter((item) => item.agentId === habit.agentId)
    const visits = events.filter((item) => item.type === 'DestinationReached' &&
      inDay(item.tick) && item.placeId && item.placeId !==
      profiles.get(habit.agentId)?.homePlaceId).map((item) => item.placeId!)
    const previousPlaces = new Set(events.filter((item) =>
      item.type === 'DestinationReached' &&
      calendarAtTick(config.startHour, item.tick, secondsPerTick).day === day - 1 &&
      item.placeId).map((item) => item.placeId!))
    const tripDurations: number[] = []
    let started: number | null = null
    for (const event of events) {
      if (event.type === 'TripStarted') started = event.tick
      if (started !== null && (event.type === 'DestinationReached' ||
        event.type === 'TripFailed')) {
        if (inDay(started) && event.type === 'DestinationReached') {
          tripDurations.push(event.tick - started)
        }
        started = null
      }
    }
    const decisions = readHabitLog(habit.decisions).filter((item) => inDay(item.tick) &&
      item.chosenKind !== null)
    const cancellations = history.filter((item) => item.outcome === 'cancelled' &&
      inDay(item.endTick)).length
    const workHistory = history.filter((item) => item.kind === 'work' &&
      item.outcome === 'completed' && inDay(item.startTick))
    const workStart = workHistory.length > 0 ?
      calendarAtTick(config.startHour, workHistory[0].startTick, secondsPerTick).minuteOfDay : null
    const changes = readHabitLog(habit.changes).filter((item) => inDay(item.tick))
    const interactions = state.social?.interactions.filter((item) =>
      item.participantIds.includes(habit.agentId) && inDay(item.startTick) &&
      item.status === 'completed') ?? []
    const duration = tripDurations.reduce((sum, item) => sum + item, 0)
    const workStartMinute = habitProfiles.get(habit.agentId)?.workStartMinute
    const workWindow = workStart !== null && workStartMinute !== null &&
      workStartMinute !== undefined ? Math.abs(workStart - workStartMinute) : null
    return { agentId: habit.agentId, day, completeDay, completedActivities,
      activityMinutes, tripCount: tripDurations.length,
      meanTripMotionSeconds: tripDurations.length ? duration * 6 / tripDurations.length : null,
      meanTripCalendarMinutes: tripDurations.length ?
        duration * secondsPerTick / 60 / tripDurations.length : null,
      uniqueDestinationCount: new Set(visits).size,
      destinationDiversity: visits.length ? new Set(visits).size / visits.length : null,
      repeatVisitShare: visits.length && day > 0 ?
        visits.filter((placeId) => previousPlaces.has(placeId)).length / visits.length : null,
      cancellationRate: decisions.length ? cancellations / decisions.length : null,
      workStartDeviationMinutes: workWindow,
      habitStrengthNetChange: changes.reduce((sum, item) => sum + item.after - item.before, 0),
      socialInteractionCount: interactions.length,
      socialInteractionMotionSeconds: interactions.reduce((sum, item) =>
        sum + (item.endTick! - item.startTick) * 6, 0),
    }
  })
}

/** Compare observed activities at each hour midpoint across two complete calendar days. */
export function summarizeRoutineRegularityV1(state: SimulationStateV5,
  environment: SimulationEnvironmentV5, firstDay: number,
  secondDay: number): readonly RoutineRegularityV1[] {
  const config = environment.config
  if (!state.habits || !config.habit || firstDay < 1 ||
    secondDay <= firstDay || !Number.isSafeInteger(firstDay) ||
    !Number.isSafeInteger(secondDay)) {
    throw new Error('Routine regularity requires two complete later days')
  }
  const secondsPerTick = config.habit.calendarSecondsPerTick
  const endTick = Math.ceil(((secondDay + 1) * 86_400 - config.startHour * 3600) /
    secondsPerTick)
  if (state.tick < endTick) throw new Error('Routine regularity days are incomplete')
  const sampleTick = (day: number, hour: number) =>
    ((day * 86_400 + hour * 3600 + 1800) - config.startHour * 3600) /
      secondsPerTick
  return state.habits.citizens.map((citizen) => {
    const intervals = readHabitLog(citizen.history).filter((item) =>
      item.outcome !== 'cancelled')
    const activityAt = (tick: number): HabitActivityKind | null => {
      const interval = intervals.find((item) => item.startTick <= tick &&
        tick < item.endTick)
      if (interval) return interval.kind
      return citizen.intention?.status === 'active' && citizen.arrivedTick !== null &&
        citizen.arrivedTick <= tick ? citizen.intention.kind === 'social' ?
          'leisure' : citizen.intention.kind : null
    }
    let matchingHourBins = 0
    let comparableHourBins = 0
    for (let hour = 0; hour < 24; hour += 1) {
      const first = activityAt(sampleTick(firstDay, hour))
      const second = activityAt(sampleTick(secondDay, hour))
      if (first === null || second === null) continue
      comparableHourBins += 1
      if (first === second) matchingHourBins += 1
    }
    return { agentId: citizen.agentId, firstDay, secondDay,
      matchingHourBins, comparableHourBins,
      share: comparableHourBins ? matchingHourBins / comparableHourBins : null }
  })
}
