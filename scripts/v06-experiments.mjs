import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const seeds = Number(process.env.V06_EXPERIMENT_SEEDS ?? 20)
const ticks = Number(process.env.V06_EXPERIMENT_TICKS ?? 500)
const population = Number(process.env.V06_EXPERIMENT_POPULATION ?? 100)
if (![seeds, ticks, population].every(Number.isSafeInteger) ||
  seeds < 1 || ticks < 1 || population < 1 || population > 200) {
  throw new Error('Use positive integer seed/tick counts and 1–200 citizens')
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { generateWorldV2 } = await vite.ssrLoadModule('/src/world/generation/generateWorldV2.ts')
  const { generateIntegratedWorld } = await vite.ssrLoadModule('/src/world/generation/generateIntegratedWorld.ts')
  const { createNavigationIndexV2 } = await vite.ssrLoadModule('/src/world/navigation/routeV2.ts')
  const { createEnvironmentV5, createInitialStateV5, advanceStateV5 } =
    await vite.ssrLoadModule('/src/simulation/engineV5.ts')
  const { DEFAULT_SIMULATION_CONFIG_V5 } = await vite.ssrLoadModule('/src/simulation/v5Types.ts')
  const scene = process.env.V06_EXPERIMENT_SCENE === 'prototype' ? 'prototype' : 'expanded'
  const world = scene === 'prototype' ? generateWorldV2() : generateIntegratedWorld()
  const index = createNavigationIndexV2(world)
  const levelBySurface = new Map(world.surfaces.map((surface) => [surface.id, surface.levelId]))
  const run = (seedIndex, bridgeOpen) => {
    const seed = `v06-paired-${String(seedIndex).padStart(2, '0')}`
    const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: population,
      simulationSeed: `${seed}:activity`, offendingSeed: `${seed}:offending`,
      observationSeed: `${seed}:reporting`,
      initialAccessModes: { ...DEFAULT_SIMULATION_CONFIG_V5.initialAccessModes,
        'bridge-entry': bridgeOpen ? 'open' : 'entryClosed' } }
    const environment = createEnvironmentV5(world, config)
    let state = createInitialStateV5(environment)
    let bridgeEntries = 0
    const levelPersonTicks = { L0: 0, L1: 0 }
    const seenEpisodes = new Set()
    const hourly = {}
    for (let tick = 0; tick < ticks; tick += 1) {
      const previous = state
      state = advanceStateV5(previous, environment, index)
      const hour = String((config.startHour + Math.floor(state.tick * 6 / 3600)) % 24).padStart(2, '0')
      const bucket = hourly[hour] ??= { bridgeEntries: 0, visits: 0,
        encounters: 0, offences: 0, L0PersonTicks: 0, L1PersonTicks: 0 }
      for (let citizenIndex = 0; citizenIndex < state.citizens.length; citizenIndex += 1) {
        const citizen = state.citizens[citizenIndex]
        const prior = previous.citizens[citizenIndex]
        if (citizen.surfaceId === 'skybridge' && prior.surfaceId !== 'skybridge') {
          bridgeEntries += 1
          bucket.bridgeEntries += 1
        }
        const level = levelBySurface.get(citizen.surfaceId)
        if (level === 'L0' || level === 'L1') {
          levelPersonTicks[level] += 1
          bucket[`${level}PersonTicks`] += 1
        }
      }
      bucket.visits += state.events.slice(previous.events.length)
        .filter((event) => event.type === 'DestinationReached').length
      bucket.offences += state.offences.length - previous.offences.length
      for (const episode of state.encounterEpisodes) if (!seenEpisodes.has(episode.id)) {
        seenEpisodes.add(episode.id)
        bucket.encounters += 1
      }
    }
    return { seed, bridgeOpen, bridgeEntries, levelPersonTicks,
      visits: state.events.filter((event) => event.type === 'DestinationReached').length,
      encounters: seenEpisodes.size, offences: state.offences.length,
      reports: state.reports.length, hourly, finalFingerprint: state.fingerprint }
  }
  const pairs = Array.from({ length: seeds }, (_, index) => ({
    seedIndex: index, open: run(index, true), closed: run(index, false),
  }))
  const metric = (key, mode) => pairs.map((pair) => pair[mode][key]).sort((a, b) => a - b)
  const range = (key, mode) => {
    const values = metric(key, mode)
    return { min: values[0], median: values[Math.floor(values.length / 2)], max: values.at(-1) }
  }
  const report = { model: 'WorldModelV2 / SimulationStateV5', scene, worldSeed: world.config.seed,
    seedPairs: seeds, ticks, logicalSecondsPerTick: 6, population,
    timeWindow: `08:00–${String((8 + Math.floor(ticks * 6 / 3600)) % 24).padStart(2, '0')}:${String(Math.floor(ticks * 6 / 60) % 60).padStart(2, '0')}`,
    intervention: 'bridge-entry open versus entryClosed at Tick 0',
    note: 'Synthetic model output; no real-world causal interpretation. Tick 500 is 50 logical minutes, not a day.',
    summary: Object.fromEntries(['bridgeEntries', 'visits', 'encounters', 'offences', 'reports'].map((key) =>
      [key, { open: range(key, 'open'), closed: range(key, 'closed') }])),
    pairs }
  report.summary.levelPersonTicks = Object.fromEntries(['L0', 'L1'].map((level) => {
    const values = (mode) => pairs.map((pair) => pair[mode].levelPersonTicks[level]).sort((a, b) => a - b)
    const describe = (mode) => { const sorted = values(mode)
      return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) } }
    return [level, { open: describe('open'), closed: describe('closed') }]
  }))
  const target = resolve(process.env.V06_EXPERIMENT_OUTPUT ??
    `docs/screenshots/v06-${scene}-paired-experiments.json`)
  await mkdir(resolve('docs/screenshots'), { recursive: true })
  await writeFile(target, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ target, seedPairs: seeds, ticks, population,
    timeWindow: report.timeWindow, summary: report.summary }, null, 2))
} finally {
  await vite.close()
}
