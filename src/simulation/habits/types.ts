export type HabitActivityKind = 'rest' | 'work' | 'eat' | 'shop' | 'leisure' | 'social'
export type HabitNeedKind = 'rest' | 'food' | 'shopping' | 'social'

export interface HabitScenarioConfigV1 {
  readonly version: 'habit-v1'
  readonly seed: string
  readonly calendarSecondsPerTick: number
  readonly habitWeight: number
  readonly feedbackWeight: number
}

export const DEFAULT_HABIT_SCENARIO_V1: HabitScenarioConfigV1 = Object.freeze({
  version: 'habit-v1', seed: 'shadow-city-habits-01', calendarSecondsPerTick: 30,
  habitWeight: 1, feedbackWeight: 1,
})

export interface HabitProfileV1 {
  readonly agentId: string
  readonly wakeMinute: number
  readonly restMinute: number
  readonly workStartMinute: number | null
  readonly workEndMinute: number | null
  readonly workDays: readonly number[]
  readonly preferredPlaces: readonly string[]
  readonly preference: Readonly<Record<HabitActivityKind, number>>
  readonly sociability: number
  readonly regularity: number
  readonly changeWillingness: number
  readonly shoppingCadenceTicks: number
  readonly durations: Readonly<Record<HabitActivityKind, number>>
}

export interface HabitNeedsV1 {
  readonly rest: number
  readonly food: number
  readonly shopping: number
  readonly social: number
}

export type IntentionStatusV1 = 'planned' | 'travelling' | 'active' | 'delayed' |
  'interrupted' | 'cancelled' | 'completed'

export interface ActivityIntentionV1 {
  readonly id: string
  readonly kind: HabitActivityKind
  readonly placeId: string
  readonly status: IntentionStatusV1
  readonly createdTick: number
  readonly decisionId: string
  readonly goalId: string | null
  readonly reason: string
}

export interface DailyGoalV1 {
  readonly id: string
  readonly day: number
  readonly kind: 'rest' | 'work' | 'eat'
  readonly placeId: string | null
  readonly startMinute: number
  readonly endMinute: number
  readonly priority: number
  readonly status: 'planned' | 'active' | 'completed' | 'delayed' | 'cancelled'
}

export interface ActivityHistoryV1 {
  readonly intentionId: string
  readonly agentId: string
  readonly kind: HabitActivityKind
  readonly placeId: string
  readonly startTick: number
  readonly endTick: number
  readonly outcome: 'completed' | 'interrupted' | 'cancelled'
  readonly reason: string
}

export interface HabitChangeV1 {
  readonly id: string
  readonly agentId: string
  readonly tick: number
  readonly key: string
  readonly before: number
  readonly after: number
  readonly sourceId: string
  readonly rule: 'completion' | 'frustration' | 'experience' | 'dailyDecay'
}

export interface ActivityCandidateTraceV1 {
  readonly kind: HabitActivityKind
  readonly placeId: string
  readonly feasible: boolean
  readonly reason: string | null
  readonly terms: Readonly<Record<string, number>>
  readonly score: number | null
}

export interface ActivityDecisionTraceV1 {
  readonly id: string
  readonly agentId: string
  readonly tick: number
  readonly day: number
  readonly minuteOfDay: number
  readonly chosenKind: HabitActivityKind | null
  readonly chosenPlaceId: string | null
  readonly candidates: readonly ActivityCandidateTraceV1[]
  readonly consideredCount: number
  readonly reason: string
}

/** Immutable chunks share earlier history across replay checkpoints. */
export interface HabitLog<T> {
  readonly chunks: readonly (readonly T[])[]
  readonly length: number
}

export const emptyHabitLog = <T>(): HabitLog<T> => ({ chunks: [], length: 0 })

export function appendHabitLog<T>(log: HabitLog<T>, item: T): HabitLog<T> {
  const chunks = log.chunks
  if (chunks.length === 0 || chunks[chunks.length - 1].length >= 64) {
    return { chunks: [...chunks, [item]], length: log.length + 1 }
  }
  return { chunks: [...chunks.slice(0, -1), [...chunks[chunks.length - 1], item]],
    length: log.length + 1 }
}

export function readHabitLog<T>(log: HabitLog<T>): readonly T[] { return log.chunks.flat() }

export interface CitizenHabitStateV1 {
  readonly agentId: string
  readonly day: number
  readonly needs: HabitNeedsV1
  readonly activityStrength: Readonly<Record<HabitActivityKind, number>>
  readonly placeStrength: Readonly<Record<string, number>>
  readonly placeValence: Readonly<Record<string, number>>
  readonly completedWorkDay: number | null
  readonly dailyGoals: readonly DailyGoalV1[]
  readonly decisionOrdinal: number
  readonly intention: ActivityIntentionV1 | null
  readonly arrivedTick: number | null
  readonly decisions: HabitLog<ActivityDecisionTraceV1>
  readonly history: HabitLog<ActivityHistoryV1>
  readonly changes: HabitLog<HabitChangeV1>
}

export interface HabitsStateV1 {
  readonly version: 'habit-v1'
  readonly citizens: readonly CitizenHabitStateV1[]
}
