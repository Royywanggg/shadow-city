import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const ticks = Number(process.env.HABITS_TICKS ?? 7700)
const population = Number(process.env.HABITS_POPULATION ?? 12)
const seedCount = Number(process.env.HABITS_SEEDS ?? 3)
if (![ticks, population, seedCount].every(Number.isSafeInteger) ||
  ticks < 4800 || population < 1 || population > 200 || seedCount < 1) {
  throw new Error('Use at least 4800 Ticks, 1–200 citizens and a positive seed count')
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false },
  appType: 'custom' })
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
  const { DEFAULT_HABIT_SCENARIO_V1, readHabitLog } = await vite.ssrLoadModule(
    '/src/simulation/habits/types.ts')
  const { summarizeDailyHabitsV1, summarizeRoutineRegularityV1 } = await vite.ssrLoadModule(
    '/src/simulation/habits/metrics.ts')
  const world = generateIntegratedWorld('shadow-city-hero-01')
  const index = createNavigationIndexV2(world)
  const run = (seedIndex, habitWeight, commands = []) => {
    const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: population,
      simulationSeed: `habits-paired-${seedIndex}:activity`,
      offendingSeed: `habits-paired-${seedIndex}:offending`,
      observationSeed: `habits-paired-${seedIndex}:observation`,
      habit: { ...DEFAULT_HABIT_SCENARIO_V1,
        seed: `habits-paired-${seedIndex}:habit`, habitWeight } }
    const environment = createEnvironmentV5(world, config, commands)
    let state = createInitialStateV5(environment, commands)
    let preChange = null
    const started = performance.now()
    for (let tick = 0; tick < ticks; tick += 1) {
      state = advanceStateV5(state, environment, index)
      if (state.tick === 1919) preChange = {
        citizens: JSON.stringify(state.citizens),
        habits: JSON.stringify(state.habits?.citizens),
      }
    }
    const metrics = [1, 2].flatMap((day) => summarizeDailyHabitsV1(state,
      environment, day))
    const regularity = ticks >= 7680 ? summarizeRoutineRegularityV1(state,
      environment, 1, 2) : []
    const tripStartsByHour = Array.from({ length: 24 }, (_, hour) =>
      state.events.filter((event) => event.type === 'TripStarted' &&
        event.tick >= 1920 && event.tick < 7680 &&
        Math.floor(((config.startHour * 3600 + event.tick * 30) % 86_400) /
          3600) === hour).length)
    const decisions = state.habits.citizens.flatMap((citizen) =>
      readHabitLog(citizen.decisions).map((decision) => ({
        agentId: citizen.agentId, tick: decision.tick,
        placeId: decision.chosenPlaceId, kind: decision.chosenKind,
        id: decision.id,
      })))
    const homeIds = new Set(environment.profiles.map((item) => item.homePlaceId))
    const visitsBefore = state.events.filter((event) => event.type === 'DestinationReached' &&
      event.tick < 1920 && event.placeId && !homeIds.has(event.placeId))
    const summary = { seedIndex, habitWeight, commands,
      fingerprint: environment.fingerprint, elapsedMs: performance.now() - started,
      stateBytes: Buffer.byteLength(JSON.stringify(state)),
      decisions: decisions.length,
      completedActivities: metrics.reduce((sum, item) => sum +
        Object.values(item.completedActivities).reduce((a, b) => a + b, 0), 0),
      tripCount: metrics.reduce((sum, item) => sum + item.tripCount, 0),
      repeatedVisitShare: metrics.map((item) => item.repeatVisitShare)
        .filter((item) => item !== null).reduce((sum, item, _, items) =>
          sum + item / items.length, 0),
      meanDestinationDiversity: metrics.map((item) => item.destinationDiversity)
        .filter((item) => item !== null).reduce((sum, item, _, items) =>
          sum + item / items.length, 0),
      cancellations: metrics.filter((item) => item.cancellationRate !== null)
        .reduce((sum, item) => sum + item.cancellationRate, 0),
      completeDayMetrics: metrics.filter((item) => item.completeDay).length,
      routineRegularity: regularity.filter((item) => item.share !== null)
        .reduce((sum, item, _, items) => sum + item.share / items.length, 0),
      comparableHourBins: regularity.reduce((sum, item) =>
        sum + item.comparableHourBins, 0),
      tripStartsByHour,
    }
    return { config, environment, state, summary, decisions, preChange,
      visitsBefore }
  }
  const experimentA = []
  const experimentB = []
  let demonstration = null
  for (let seedIndex = 0; seedIndex < seedCount; seedIndex += 1) {
    const low = run(seedIndex, 0.2)
    const high = run(seedIndex, 1.8)
    experimentA.push({ seedIndex, low: low.summary, high: high.summary,
      sameChoiceCount: low.decisions.filter((item) => high.decisions.some((other) =>
        other.agentId === item.agentId && other.id === item.id &&
        other.placeId === item.placeId)).length })
    const visits = new Map()
    for (const event of low.visitsBefore) if (event.placeId) {
      visits.set(event.placeId, (visits.get(event.placeId) ?? 0) + 1)
    }
    const closePlaceId = [...visits.entries()].sort((a, b) =>
      b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
      world.places.find((place) => place.kind === 'retail')?.id
    if (!closePlaceId) throw new Error('No legal intervention place')
    const command = { id: `habit-close:${seedIndex}`, effectiveTick: 1920,
      accessId: `place:${closePlaceId}`, mode: 'closed' }
    const closed = run(seedIndex, 0.2, [command])
    const diverged = low.decisions.find((item) => item.tick >= 1920 &&
      closed.decisions.some((other) => other.agentId === item.agentId &&
        other.id === item.id && other.placeId !== item.placeId))
    const altered = diverged ? closed.decisions.find((item) =>
      item.agentId === diverged.agentId && item.id === diverged.id) : null
    const preChangeEqual = low.preChange.citizens === closed.preChange.citizens &&
      low.preChange.habits === closed.preChange.habits
    experimentB.push({ seedIndex, closePlaceId, preChangeEqual,
      baseline: low.summary, closed: closed.summary,
      firstChangedDecision: diverged && altered ? {
        agentId: diverged.agentId, decisionId: diverged.id,
        baselinePlaceId: diverged.placeId, closedPlaceId: altered.placeId,
        baselineTick: diverged.tick, closedTick: altered.tick,
      } : null })
    if (diverged && altered && (!demonstration ||
      altered.tick < demonstration.decision.closedTick)) {
      const agent = closed.state.habits.citizens.find((item) =>
        item.agentId === altered.agentId)
      const replay = replayV5(world, { fingerprint: closed.environment.fingerprint,
        config: closed.config, commands: [command], targetTick: ticks })
      demonstration = { seedIndex, agentId: altered.agentId, closePlaceId,
        command, decision: experimentB.at(-1).firstChangedDecision,
        decisionTrace: readHabitLog(agent.decisions).find((item) =>
          item.id === altered.id) ?? null,
        actualHistory: readHabitLog(agent.history).filter((item) =>
          item.startTick >= 1800).slice(0, 20),
        habitChanges: readHabitLog(agent.changes).filter((item) =>
          item.tick >= 1800).slice(0, 20),
        replayEqual: JSON.stringify(replay) === JSON.stringify(closed.state) }
    }
  }
  const report = { dateUtc: new Date().toISOString(), worldSeed: world.config.seed,
    population, ticks, calendarSecondsPerTick: 30, motionSecondsPerTick: 6,
    syntheticAssumptions: true,
    experimentA: { intervention: 'habitWeight 0.2 versus 1.8; paired seeds',
      pairs: experimentA },
    experimentB: { intervention: 'close a pre-intervention frequently visited place at Tick 1920',
      pairs: experimentB },
    demonstration }
  await mkdir(resolve('docs/screenshots'), { recursive: true })
  const output = resolve('docs/screenshots/habits-experiment-results.json')
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ output, population, ticks, seedCount,
    experimentA: experimentA.map((item) => ({ seedIndex: item.seedIndex,
      lowTrips: item.low.tripCount, highTrips: item.high.tripCount,
      lowRepeat: item.low.repeatedVisitShare,
      highRepeat: item.high.repeatedVisitShare })),
    experimentB: experimentB.map((item) => ({ seedIndex: item.seedIndex,
      preChangeEqual: item.preChangeEqual,
      firstChangedDecision: item.firstChangedDecision })),
    demonstration: demonstration && { agentId: demonstration.agentId,
      replayEqual: demonstration.replayEqual } }, null, 2))
} finally {
  await vite.close()
}
