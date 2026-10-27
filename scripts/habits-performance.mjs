import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, hmr: false },
  appType: 'custom' })
const percentile = (items, ratio) => {
  const sorted = [...items].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? null
}
try {
  const { generateIntegratedWorld } = await vite.ssrLoadModule(
    '/src/world/generation/generateIntegratedWorld.ts')
  const { createNavigationIndexV2 } = await vite.ssrLoadModule(
    '/src/world/navigation/routeV2.ts')
  const { createEnvironmentV5, createInitialStateV5, advanceStateV5 } =
    await vite.ssrLoadModule('/src/simulation/engineV5.ts')
  const { replayV5 } = await vite.ssrLoadModule('/src/simulation/replayV5.ts')
  const { DEFAULT_SIMULATION_CONFIG_V5 } = await vite.ssrLoadModule(
    '/src/simulation/v5Types.ts')
  const { DEFAULT_ENCOUNTER_SCENARIO_V1 } = await vite.ssrLoadModule(
    '/src/simulation/encounter/config.ts')
  const { DEFAULT_HABIT_SCENARIO_V1 } = await vite.ssrLoadModule(
    '/src/simulation/habits/types.ts')
  const { setHabitDecisionTimingObserverV1 } = await vite.ssrLoadModule(
    '/src/simulation/habits/decision.ts')
  const { setHabitPreparationTimingObserverV1 } = await vite.ssrLoadModule(
    '/src/simulation/habits/state.ts')
  const world = generateIntegratedWorld('shadow-city-hero-01')
  const index = createNavigationIndexV2(world)
  const samples = []
  for (const { population, ticks, encounter } of [
    { population: 100, ticks: 500, encounter: true },
    { population: 200, ticks: 500, encounter: true },
    { population: 20, ticks: 7700, encounter: true },
  ].filter((item) => !process.env.HABITS_PERF_CASE ||
    process.env.HABITS_PERF_CASE === 'long' && item.ticks > 500)) {
    const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: population,
      habit: DEFAULT_HABIT_SCENARIO_V1,
      ...(encounter ? { encounter: DEFAULT_ENCOUNTER_SCENARIO_V1 } : {}) }
    const environment = createEnvironmentV5(world, config)
    let state = createInitialStateV5(environment)
    const durations = []
    const decision = []
    const preparation = []
    const waitingStreak = new Map()
    let maximumWaitingStreakTicks = 0
    let maximumWaitingSample = null
    let maximumStepMm = 0
    const surfaceIds = new Set(world.surfaces.map((item) => item.id))
    setHabitDecisionTimingObserverV1((item) => decision.push(item))
    setHabitPreparationTimingObserverV1((item) => preparation.push(item.durationMs))
    const heapBefore = process.memoryUsage().heapUsed
    for (let tick = 0; tick < ticks; tick += 1) {
      const started = performance.now()
      const previous = state
      state = advanceStateV5(state, environment, index)
      durations.push(performance.now() - started)
      const reserved = state.citizens.flatMap((item) => item.reservedSlotNodeId ?
        [item.reservedSlotNodeId] : [])
      if (new Set(reserved).size !== reserved.length) {
        throw new Error(`Duplicate reserved slot at Tick ${state.tick}`)
      }
      state.citizens.forEach((citizen, i) => {
        if (!surfaceIds.has(citizen.surfaceId)) {
          throw new Error(`Illegal surface at Tick ${state.tick}: ${citizen.id}`)
        }
        const prior = previous.citizens[i]
        const stepMm = Math.hypot(citizen.position.x - prior.position.x,
          citizen.position.y - prior.position.y,
          citizen.position.z - prior.position.z)
        maximumStepMm = Math.max(maximumStepMm, stepMm)
        const speed = environment.profiles[i].travellerCosts.speedMmPerSecond
        if (stepMm > speed * 6 * 1.48 + 100) {
          throw new Error(`Implausible single-Tick displacement for ${citizen.id}`)
        }
        const waiting = citizen.activity === 'waitingForSpace' ||
          citizen.activity === 'planningTrip'
        const streak = waiting ? (waitingStreak.get(citizen.id) ?? 0) + 1 : 0
        waitingStreak.set(citizen.id, streak)
        if (streak > maximumWaitingStreakTicks) {
          maximumWaitingStreakTicks = streak
          maximumWaitingSample = { agentId: citizen.id, tick: state.tick,
            activity: citizen.activity, placeId: citizen.placeId,
            destinationPlaceId: citizen.destinationPlaceId,
            currentNodeId: citizen.currentNodeId,
            nextDecisionTick: citizen.nextDecisionTick }
        }
      })
    }
    setHabitDecisionTimingObserverV1(null)
    setHabitPreparationTimingObserverV1(null)
    const replayStarted = performance.now()
    const replay = replayV5(world, { fingerprint: environment.fingerprint,
      config, commands: [], targetTick: ticks })
    const replayMs = performance.now() - replayStarted
    const equal = JSON.stringify(replay) === JSON.stringify(state)
    const routeSamples = decision.filter((item) => item.phase === 'decision')
    const replans = decision.filter((item) => item.phase === 'replan')
    samples.push({ population, ticks, encounter, replayEqual: equal,
      tickMs: { p50: percentile(durations, .5), p95: percentile(durations, .95) },
      preparationMs: { p50: percentile(preparation, .5),
        p95: percentile(preparation, .95) },
      activityDecisions: routeSamples.length,
      decisionRouteTreeMs: { p50: percentile(routeSamples.map((item) => item.routeTreeMs), .5),
        p95: percentile(routeSamples.map((item) => item.routeTreeMs), .95) },
      candidateScoringMs: { p50: percentile(routeSamples.map((item) =>
        item.candidateScoringMs), .5), p95: percentile(routeSamples.map((item) =>
        item.candidateScoringMs), .95) },
      replanning: { count: replans.length,
        p95Ms: percentile(replans.map((item) => item.routeTreeMs), .95) },
      replayMs, stateBytes: Buffer.byteLength(JSON.stringify(state)),
      heapBeforeBytes: heapBefore, heapAfterBytes: process.memoryUsage().heapUsed,
      citizenEvents: state.events.length,
      habitDecisionTraces: state.habits.citizens.reduce((sum, item) =>
        sum + item.decisions.length, 0),
      habitActivityRecords: state.habits.citizens.reduce((sum, item) =>
        sum + item.history.length, 0),
      habitChanges: state.habits.citizens.reduce((sum, item) =>
        sum + item.changes.length, 0),
      socialInteractionEvents: state.social?.interactionEvents.length ?? 0,
      maximumWaitingStreakTicks, maximumWaitingSample, maximumStepMm,
    })
  }
  const report = { dateUtc: new Date().toISOString(),
    conditions: 'Node/Vite SSR CPU sample on integrated 300m world; serial runs; not GPU timings',
    samples }
  await mkdir(resolve('docs/screenshots'), { recursive: true })
  const output = resolve('docs/screenshots/habits-performance-results.json')
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ output, samples }, null, 2))
} finally {
  await vite.close()
}
