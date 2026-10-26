import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createServer } from 'vite'

const population = Number(process.env.V061_POPULATION ?? 100)
const ticks = Number(process.env.V061_TICKS ?? 500)
const socialReview = process.env.V061_SOCIAL_REVIEW === '1'
if (!Number.isSafeInteger(population) || population < 0 || population > 200 ||
  !Number.isSafeInteger(ticks) || ticks < 1) {
  throw new Error('Use 0–200 citizens and a positive integer Tick count')
}
const describe = (samples) => {
  const ordered = [...samples].sort((a, b) => a - b)
  const mean = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length)
  return { count: samples.length, meanMs: Number(mean.toFixed(3)),
    p95Ms: Number((ordered[Math.min(ordered.length - 1,
      Math.ceil(ordered.length * 0.95) - 1)] ?? 0).toFixed(3)),
    maxMs: Number((ordered.at(-1) ?? 0).toFixed(3)) }
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { generateIntegratedWorld } = await vite.ssrLoadModule('/src/world/generation/generateIntegratedWorld.ts')
  const { createEnvironmentV5, createInitialStateV5, advanceStateV5 } =
    await vite.ssrLoadModule('/src/simulation/engineV5.ts')
  const { createNavigationIndexV2 } = await vite.ssrLoadModule('/src/world/navigation/routeV2.ts')
  const { DEFAULT_SIMULATION_CONFIG_V5 } = await vite.ssrLoadModule('/src/simulation/v5Types.ts')
  const { DEFAULT_ENCOUNTER_SCENARIO_V1 } = await vite.ssrLoadModule('/src/simulation/encounter/config.ts')
  const { setEncounterTimingObserverV1 } = await vite.ssrLoadModule('/src/simulation/encounter/pipeline.ts')
  const { summarizeSocialMetricsV1 } = await vite.ssrLoadModule('/src/simulation/encounter/socialMetrics.ts')
  const generatedAt = performance.now()
  const world = generateIntegratedWorld()
  const generationMs = performance.now() - generatedAt
  const scenario = { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
    social: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.social,
      ...(socialReview ? { greetingWillingness: 0.70,
        conversationWillingness: 0.85, diagnosticTraces: true } : {}) } }
  const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: population,
    encounter: scenario }
  const environment = createEnvironmentV5(world, config)
  const index = createNavigationIndexV2(world)
  const initial = createInitialStateV5(environment)
  let state = initial
  const timings = []
  const stageTimings = []
  const stationaryDistance = { minMm: null, within2400: 0, within3200: 0,
    within4000: 0, within5000: 0, within6000: 0, within10000: 0 }
  setEncounterTimingObserverV1((sample) => stageTimings.push(sample))
  try {
    for (let tick = 0; tick < ticks; tick += 1) {
      const started = performance.now()
      state = advanceStateV5(state, environment, index)
      timings.push(performance.now() - started)
      if (process.env.V061_SPATIAL_DIAGNOSTICS === '1') {
        const stationary = state.citizens.filter((citizen) => citizen.activity === 'atDestination' &&
          citizen.placeId !== null)
        for (let a = 0; a < stationary.length; a += 1) {
          for (let b = a + 1; b < stationary.length; b += 1) {
            const first = stationary[a]; const second = stationary[b]
            if (first.placeId !== second.placeId || first.surfaceId !== second.surfaceId) continue
            const d = Math.round(Math.hypot(first.position.x - second.position.x,
              first.position.y - second.position.y, first.position.z - second.position.z))
            stationaryDistance.minMm = Math.min(stationaryDistance.minMm ?? d, d)
            for (const limit of [2400, 3200, 4000, 5000, 6000, 10000]) {
              if (d <= limit) stationaryDistance[`within${limit}`] += 1
            }
          }
        }
      }
    }
  } finally { setEncounterTimingObserverV1(null) }
  const replayStarted = performance.now()
  let replay = initial
  for (let tick = 0; tick < ticks; tick += 1) replay = advanceStateV5(replay, environment, index)
  const replayMs = performance.now() - replayStarted
  const replayEqual = JSON.stringify(replay) === JSON.stringify(state)
  const social = state.social
  const report = {
    model: 'WorldModelV2 / SimulationStateV5 / EncounterScenarioV1',
    citySeed: world.config.seed, simulationSeed: config.simulationSeed,
    socialSeed: scenario.social.seed, offendingSeed: config.offendingSeed,
    observationSeed: config.observationSeed, ticks, population, socialReview,
    generationMs: Number(generationMs.toFixed(3)), tickDuration: describe(timings),
    replayFromZeroMs: Number(replayMs.toFixed(3)), replayEqual,
    stageTiming: Object.fromEntries(['spatialQueryMs', 'perceptionMs', 'lifecycleMs',
      'crimeAndWitnessMs', 'socialDecisionAndMemoryMs'].map((key) =>
      [key, describe(stageTimings.map((item) => item[key]))])),
    candidatePairSeconds: social.metrics.candidatePairSeconds,
    perceivedPairSeconds: social.metrics.perceivedPairSeconds,
    episodeCount: social.encounters.active.length + social.encounters.completed.length,
    uniquePairCount: new Set([...social.encounters.active, ...social.encounters.completed]
      .map((item) => item.pairKey)).size,
    interactionDecisionEvaluations: social.interactionDecisions.length,
    interactionAttempts: social.interactionEvents.filter((item) => item.type === 'Attempted').length,
    interactionDecisionReasons: social.interactionDecisions.reduce((counts, item) => {
      counts[item.reason] = (counts[item.reason] ?? 0) + 1
      return counts
    }, {}),
    acceptedInteractions: social.interactions.length,
    completedInteractions: social.interactions.filter((item) => item.status === 'completed').length,
    conversations: social.interactions.filter((item) => item.type === 'conversation').length,
    conversationExamples: social.interactions.filter((item) => item.type === 'conversation')
      .slice(0, 10).map((item) => ({ id: item.id, participantIds: item.participantIds,
        decisionTick: item.decisionTick, startTick: item.startTick,
        plannedEndTick: item.plannedEndTick, status: item.status })),
    memories: social.memories.length, knowledge: social.knowledge.length,
    directedRelationships: social.relationships.length,
    opportunitySeconds: social.metrics.opportunitySeconds,
    offenderAttempts: social.metrics.offenderAttempts,
    truthOffences: state.offences.length,
    offenceExamples: state.offences.slice(0, 20).map((offence) => ({
      id: offence.id, tick: offence.tick, second: offence.second,
      offenderAgentId: offence.offenderAgentId, target: offence.target,
      encounterId: offence.encounterId,
      witnesses: social.witnessObservations.filter((item) => item.offenceId === offence.id)
        .map((item) => ({ ownerAgentId: item.ownerAgentId, source: item.source,
          believedIdentity: item.believedIdentity })),
      reports: social.reportLinks.filter((item) => item.offenceId === offence.id).length,
    })),
    potentialWitnesses: social.metrics.potentialWitnesses,
    actualWitnesses: social.metrics.actualWitnesses,
    deliveredReports: state.reports.length,
    pendingReports: social.pendingWitnessReports.length,
    serializedStateBytes: Buffer.byteLength(JSON.stringify(state)),
    scientificMetrics: summarizeSocialMetricsV1(state, config),
    ...(process.env.V061_SPATIAL_DIAGNOSTICS === '1' ? { stationaryDistance } : {}),
    note: 'Synthetic rules and local Node/Vite CPU measurements. This is not a browser or GPU benchmark.',
  }
  const target = resolve(process.env.V061_OUTPUT ??
    `docs/screenshots/v061-encounter-${population}-${ticks}${socialReview ? '-review' : ''}.json`)
  await mkdir(resolve('docs/screenshots'), { recursive: true })
  await writeFile(target, JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify({ target, ...report }, null, 2) + '\n')
  if (!replayEqual) process.exitCode = 1
} finally { await vite.close() }
