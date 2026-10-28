import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const browser = await chromium.launch({ headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-webgl', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1 })
const populationSize = Number(process.env.SHADOW_CITY_POPULATION ?? 120)
const selectedSeeds = (process.env.SHADOW_CITY_SEEDS ??
  'place-paired-01,place-paired-02,place-paired-03').split(',')
const selectedScenarios = (process.env.SHADOW_CITY_SCENARIOS ??
  'A-mall-open,B-mall-closed,C-bridge-closed').split(',')
const placeMode = process.env.SHADOW_CITY_PLACE_MODE !== 'off'
const typedCrimeMode = process.env.SHADOW_CITY_TYPED_CRIME === 'on'
const targetTicks = Number(process.env.SHADOW_CITY_TICKS ?? 500)
const measureReplay = process.env.SHADOW_CITY_REPLAY === 'on'
try {
  await page.goto(process.env.SHADOW_CITY_URL ??
    'http://127.0.0.1:5185/?seed=shadow-city-hero-01&population=120',
  { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100,
    undefined, { timeout: 60000 })
  const results = await page.evaluate(async ({ populationSize, selectedSeeds,
    selectedScenarios, placeMode, typedCrimeMode, targetTicks, measureReplay }) => {
    const [{ generateIntegratedWorld }, engine, navigation, types, habits, habitDecision,
      encounter, life, scenes, places, offending, typedCrime,
      encounterPipeline, crimeEngine, lifeState, replay, clock,
      offenderProfiles] = await Promise.all([
      import('/src/world/generation/generateIntegratedWorld.ts'),
      import('/src/simulation/engineV5.ts'),
      import('/src/world/navigation/routeV2.ts'),
      import('/src/simulation/v5Types.ts'),
      import('/src/simulation/habits/types.ts'),
      import('/src/simulation/habits/decision.ts'),
      import('/src/simulation/encounter/config.ts'),
      import('/src/simulation/life/types.ts'),
      import('/src/simulation/scenes/types.ts'),
      import('/src/simulation/places/runtime.ts'),
      import('/src/simulation/offending/opportunityV5.ts'),
      import('/src/simulation/crime/types.ts'),
      import('/src/simulation/encounter/pipeline.ts'),
      import('/src/simulation/crime/engine.ts'),
      import('/src/simulation/life/state.ts'),
      import('/src/simulation/replayV5.ts'),
      import('/src/simulation/clock.ts'),
      import('/src/simulation/offending/profiles.ts'),
    ])
    const world = generateIntegratedWorld('shadow-city-hero-01')
    const index = navigation.createNavigationIndexV2(world)
    const quantile = (values, fraction) => {
      const sorted = [...values].sort((a, b) => a - b)
      return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null
    }
    const scenarios = [
      { id: 'A-mall-open', modes: {} },
      { id: 'B-mall-closed', modes: { 'mall-entry': 'entryClosed' } },
      { id: 'C-bridge-closed', modes: { 'bridge-entry': 'entryClosed' } },
    ].filter((item) => selectedScenarios.includes(item.id))
    const seeds = selectedSeeds
    const records = []
    for (const seed of seeds) for (const scenario of scenarios) {
      const config = { ...types.DEFAULT_SIMULATION_CONFIG_V5,
        simulationSeed: seed, offendingSeed: seed + '-offending',
        observationSeed: seed + '-observation', populationSize,
        habit: { ...habits.DEFAULT_HABIT_SCENARIO_V1, seed: seed + '-habits',
          ...(typedCrimeMode ? { calendarSecondsPerTick: 6 } : {}) },
        encounter: { ...encounter.DEFAULT_ENCOUNTER_SCENARIO_V1,
          social: { ...encounter.DEFAULT_ENCOUNTER_SCENARIO_V1.social,
            seed: seed + '-social', greetingWillingness: 0.7,
            conversationWillingness: 0.85, diagnosticTraces: true } },
        life: { ...life.DEFAULT_LIFE_SCENARIO_V1, seed: seed + '-life' },
        scene: scenes.DEFAULT_SCENE_SCENARIO_V1,
        ...(typedCrimeMode ? { typedCrime: typedCrime.DEFAULT_TYPED_CRIME_CONFIG_V1 } : {}),
        ...(placeMode ? { placeInteraction: { version: 'place-v1' } } : {}),
        initialAccessModes: { ...types.DEFAULT_SIMULATION_CONFIG_V5.initialAccessModes,
          ...scenario.modes } }
      const environment = engine.createEnvironmentV5(world, config)
      const highPropensityIds = new Set(offenderProfiles.createOffendingProfiles(
        environment.profiles, { ...config.encounter.offending,
          offendingSeed: config.offendingSeed, startHour: config.startHour })
        .filter((item) => item.logPropensity.minor > 0 ||
          item.logPropensity.serious > 0).map((item) => item.agentId))
      const placeTimes = []
      const encounterTimes = []
      const crimeTimes = []
      const lifeTimes = []
      encounterPipeline.setEncounterTimingObserverV1((sample) => encounterTimes.push(sample))
      crimeEngine.setTypedCrimeTimingObserverV1((sample) => crimeTimes.push(sample))
      lifeState.setLifeTimingObserverV1((sample) => lifeTimes.push(sample))
      const decisionTimes = []
      const routeTreeTimes = []
      const candidateScoringTimes = []
      habitDecision.setHabitDecisionTimingObserverV1((sample) => {
        if (sample.phase === 'decision') decisionTimes.push(
          sample.routeTreeMs + sample.candidateScoringMs)
        routeTreeTimes.push(sample.routeTreeMs)
        candidateScoringTimes.push(sample.candidateScoringMs)
      })
      let state = engine.createInitialStateV5(environment)
      const tickTimes = []
      let occupancySum = 0
      let occupancyMax = 0
      const heapBefore = performance.memory?.usedJSHeapSize ?? null
      const started = performance.now()
      for (let tick = 0; tick < targetTicks; tick += 1) {
        const before = performance.now()
        state = engine.advanceStateV5(state, environment, index)
        tickTimes.push(performance.now() - before)
        if (placeMode) {
          const placeStarted = performance.now()
          places.derivePlaceRuntimeV1(state, environment)
          placeTimes.push(performance.now() - placeStarted)
        }
        const occupied = (state.placeRuntime?.places ?? []).filter((item) =>
          world.places.find((place) => place.id === item.placeId)?.buildingId ===
            'central-galleria').reduce((sum, item) => sum + item.occupantIds.length, 0)
        occupancySum += occupied
        occupancyMax = Math.max(occupancyMax, occupied)
      }
      const visits = state.events.filter((item) => item.type === 'DestinationReached' &&
        world.places.find((place) => place.id === item.placeId)?.buildingId ===
          'central-galleria')
      const histories = state.habits.citizens.flatMap((item) =>
        habits.readHabitLog(item.history))
      const completed = histories.filter((item) => item.outcome === 'completed' &&
        world.places.find((place) => place.id === item.placeId)?.buildingId ===
          'central-galleria')
      const encounters = [...state.social.encounters.active,
        ...state.social.encounters.completed].filter((item) =>
        item.placeId && world.places.find((place) => place.id === item.placeId)?.buildingId ===
          'central-galleria')
      const offences = state.offences.filter((item) =>
        item.placeId && world.places.find((place) => place.id === item.placeId)?.buildingId ===
          'central-galleria')
      const observed = offending.observerViewV5(state)
      let replayDurationMs = null
      let replayEquivalent = null
      if (measureReplay) {
        const replayStarted = performance.now()
        const reconstructed = replay.replayV5(world, { fingerprint: state.fingerprint,
          config, commands: [], targetTick: targetTicks })
        replayDurationMs = performance.now() - replayStarted
        replayEquivalent = JSON.stringify(reconstructed) === JSON.stringify(state)
      }
      const reports = observed.reports.filter((item) => item.reportedPlaceId &&
        world.places.find((place) => place.id === item.reportedPlaceId)?.buildingId ===
          'central-galleria')
      records.push({ seed, scenario: scenario.id, fingerprint: state.fingerprint,
        tick: state.tick, worldClock: clock.worldClockAtTick(config.startHour, state.tick),
        habitDays: [...new Set(state.habits.citizens.map((item) => item.day))].sort(),
        visits: visits.length, visitsByPlace: Object.fromEntries(
          [...new Set(visits.map((item) => item.placeId))].sort().map((placeId) =>
            [placeId, visits.filter((item) => item.placeId === placeId).length])),
        completedActivities: completed.length,
        completedShopping: completed.filter((item) => item.kind === 'shop').length,
        completedEating: completed.filter((item) => item.kind === 'eat').length,
        completedLeisure: completed.filter((item) => item.kind === 'leisure').length,
        failedTrips: state.events.filter((item) => item.type === 'TripFailed').length,
        deferredTrips: state.events.filter((item) => item.type === 'TripDeferred').length,
        meanMallOccupancy: occupancySum / targetTicks, maxMallOccupancy: occupancyMax,
        indoorEncounters: encounters.length,
        distinctIndoorPairs: new Set(encounters.map((item) =>
          item.participantIds.join(':'))).size,
        opportunitySecondsGlobal: state.social.metrics.opportunitySeconds,
        eligibleTypedExposureSeconds: state.typedCrime?.eligibleExposureSeconds ?? null,
        eligibleTypedExposureByType: state.typedCrime?.eligibleExposureSecondsByType ?? null,
        ineligibleTypedContactSeconds: state.typedCrime?.ineligibleContactSeconds ?? null,
        rateDenominators: typedCrimeMode ? {
          residentHours: populationSize * targetTicks * 6 / 3_600,
          highPropensityResidentHours: highPropensityIds.size * targetTicks * 6 / 3_600,
          highPropensityDefinition: 'logPropensity.minor > 0 or serious > 0',
          eligibleTheftHours: state.typedCrime.eligibleExposureSecondsByType.personTheft / 3_600,
          eligibleAssaultHours: state.typedCrime.eligibleExposureSecondsByType.physicalAssault / 3_600,
          attemptsByHighPropensityResidents: state.typedCrime.attempts.filter((item) =>
            highPropensityIds.has(item.actorAgentId)).length,
        } : null,
        indoorEligibleTypedExposureSeconds: Object.entries(
          state.typedCrime?.eligibleExposureSecondsByPlace ?? {}).filter(([placeId]) =>
          world.places.find((place) => place.id === placeId)?.buildingId ===
            'central-galleria').reduce((sum, [, seconds]) => sum + seconds, 0),
        theftAttempts: state.typedCrime?.attempts.filter((item) =>
          item.type === 'personTheft').length ?? null,
        assaultAttempts: state.typedCrime?.attempts.filter((item) =>
          item.type === 'physicalAssault').length ?? null,
        completedThefts: state.offences.filter((item) =>
          item.offenceType === 'personTheft').length,
        completedAssaults: state.offences.filter((item) =>
          item.offenceType === 'physicalAssault').length,
        victimAwareness: state.typedCrime?.awareness.filter((item) =>
          item.acquiredTick !== null).length ?? null,
        indoorOffences: offences.length,
        indoorOffencesByFloor: Object.fromEntries([...new Set(offences.map((item) =>
          item.levelId))].sort().map((levelId) => [levelId,
          offences.filter((item) => item.levelId === levelId).length])),
        indoorReportsWithKnownPlace: reports.length,
        totalTruthOffences: state.offences.length,
        totalAvailableReports: observed.reports.length,
        historyCounts: { events: state.events.length,
          encounterEpisodes: state.social.encounters.completed.length,
          offences: state.offences.length, sceneEntities: state.scene.entities.length,
          typedActiveEpisodes: state.typedCrime?.activeEpisodes.length ?? null,
          typedRecentEpisodes: state.typedCrime?.recentEpisodes.length ?? null,
          typedAttempts: state.typedCrime?.attempts.length ?? null },
        timingMs: { run: performance.now() - started,
          tickP50: quantile(tickTimes, .5), tickP95: quantile(tickTimes, .95),
          tickP99: quantile(tickTimes, .99),
          replayDurationMs, replayEquivalent,
          encounterQueryP95: quantile(encounterTimes.map((x) => x.spatialQueryMs), .95),
          encounterLifecycleP95: quantile(encounterTimes.map((x) => x.lifecycleMs), .95),
          encounterCrimeWitnessP95: quantile(encounterTimes.map((x) => x.crimeAndWitnessMs), .95),
          socialMemoryP95: quantile(encounterTimes.map((x) => x.socialDecisionAndMemoryMs), .95),
          crimeHazardP95: quantile(crimeTimes.map((x) => x.opportunityAndHazardMs), .95),
          crimeActionP95: quantile(crimeTimes.map((x) => x.actionResolutionMs), .95),
          crimeItemUpdateP95: quantile(crimeTimes.map((x) => x.itemUpdateMs), .95),
          crimeAwarenessP95: quantile(crimeTimes.map((x) => x.awarenessUpdateMs), .95),
          crimeLedgerP95: quantile(crimeTimes.map((x) => x.ledgerCommitMs), .95),
          lifeOutcomeP95: quantile(lifeTimes.map((x) => x.outcomeMs), .95),
          lifeSceneP95: quantile(lifeTimes.map((x) => x.discoveryMs), .95),
          heapBefore, heapAfter: performance.memory?.usedJSHeapSize ?? null,
          placeRuntimeP50: quantile(placeTimes, .5),
          placeRuntimeP95: quantile(placeTimes, .95),
          decisionCount: decisionTimes.length,
          decisionP95: quantile(decisionTimes, .95),
          routeTreeP95: quantile(routeTreeTimes, .95),
          candidateScoringP95: quantile(candidateScoringTimes, .95) } })
      habitDecision.setHabitDecisionTimingObserverV1(null)
      encounterPipeline.setEncounterTimingObserverV1(null)
      crimeEngine.setTypedCrimeTimingObserverV1(null)
      lifeState.setLifeTimingObserverV1(null)
      await new Promise((done) => setTimeout(done, 0))
    }
    return records
  }, { populationSize, selectedSeeds, selectedScenarios, placeMode,
    typedCrimeMode, targetTicks, measureReplay })
  const output = { date: new Date().toISOString(), browser: browser.version(),
    viewport: '1440x900', dpr: 1, citySeed: 'shadow-city-hero-01',
    tick: targetTicks, population: populationSize, placeMode, typedCrimeMode,
    calendarNote: typedCrimeMode ?
      `${targetTicks} Ticks are ${targetTicks * 6 / 60} minutes on the unified world clock` :
      `Legacy: ${targetTicks} Ticks are ${targetTicks * 30 / 60} calendar minutes and ${targetTicks * 6 / 60} physical minutes`,
    interpretation: 'Synthetic paired-seed model output, not a real-city causal estimate',
    results }
  await writeFile(resolve(process.env.SHADOW_CITY_EXPERIMENT_OUTPUT ??
    'docs/screenshots/place-experiment-results.json'),
    JSON.stringify(output, null, 2) + '\n')
  console.log(JSON.stringify(results.map((item) => ({ seed: item.seed,
    scenario: item.scenario, visits: item.visits,
    completedShopping: item.completedShopping,
    indoorEncounters: item.indoorEncounters,
    indoorOffences: item.indoorOffences,
    meanMallOccupancy: item.meanMallOccupancy,
    tickP95: item.timingMs.tickP95,
    placeRuntimeP95: item.timingMs.placeRuntimeP95 })), null, 2))
} finally {
  await browser.close()
}
