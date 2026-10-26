import { writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

// Bounded global-parameter search. No citizen, place, encounter, or crime is prescribed.
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { generateIntegratedWorld } = await vite.ssrLoadModule('/src/world/generation/generateIntegratedWorld.ts')
  const { createEnvironmentV5, createInitialStateV5, advanceStateV5 } =
    await vite.ssrLoadModule('/src/simulation/engineV5.ts')
  const { replayV5 } = await vite.ssrLoadModule('/src/simulation/replayV5.ts')
  const { createNavigationIndexV2 } = await vite.ssrLoadModule('/src/world/navigation/routeV2.ts')
  const { DEFAULT_SIMULATION_CONFIG_V5 } = await vite.ssrLoadModule('/src/simulation/v5Types.ts')
  const { DEFAULT_ENCOUNTER_SCENARIO_V1 } = await vite.ssrLoadModule('/src/simulation/encounter/config.ts')
  const { projectObserverViewV5 } = await vite.ssrLoadModule('/src/simulation/encounter/observerProjection.ts')
  const world = generateIntegratedWorld()
  const index = createNavigationIndexV2(world)
  const ticks = 600
  const seedCount = 8
  const scenario = { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
    offenceCompletionProbability: 1,
    social: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.social,
      greetingWillingness: 0.7, conversationWillingness: 0.85 },
    offending: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.offending,
      baseOddsPerEligibleAgentHour: { minor: 12, serious: 2.8 } },
    witness: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.witness,
      eventPerceptionProbability: 1, victimPerceptionProbability: 1 } }
  const attempts = []
  let found = null
  for (let number = 0; number < seedCount; number += 1) {
    const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 120,
      offendingSeed: `shadow-city-reencounter-${number}`,
      reportingProbability: 1, encounter: scenario }
    const environment = createEnvironmentV5(world, config)
    let state = createInitialStateV5(environment)
    for (let tick = 0; tick < ticks; tick += 1) state = advanceStateV5(state, environment, index)
    const social = state.social
    const episodes = [...social.encounters.active, ...social.encounters.completed]
    const episodeById = new Map(episodes.map((item) => [item.id, item]))
    const reportById = new Map(projectObserverViewV5(state).reports.map((item) => [item.id, item]))
    const globalSecond = (tick, second) => (tick - 1) * 6 + second
    const reencounters = episodes.filter((later) => episodes.some((earlier) =>
      earlier.pairKey === later.pairKey && earlier.id !== later.id &&
      earlier.endedTick !== null &&
      globalSecond(later.startedTick, later.startedSecond) >=
        globalSecond(earlier.endedTick, earlier.endedSecond) + scenario.lifecycle.cooldownSeconds &&
      social.interactions.some((item) => item.encounterId === earlier.id &&
        item.status === 'completed' && item.endTick < later.startedTick)))
    const chain = state.offences.flatMap((offence) => {
      if (offence.target.kind !== 'citizen' ||
        !offence.opportunity.socialContext?.offenderPerceivedTarget ||
        offence.opportunity.socialContext.directedFamiliarity <= 0) return []
      const later = episodeById.get(offence.encounterId)
      if (!later) return []
      const earlier = episodes.find((item) => item.pairKey === later.pairKey &&
        item.id !== later.id && item.endedTick !== null &&
        globalSecond(later.startedTick, later.startedSecond) >=
          globalSecond(item.endedTick, item.endedSecond) + scenario.lifecycle.cooldownSeconds &&
        social.interactions.some((interaction) => interaction.encounterId === item.id &&
          interaction.status === 'completed' && interaction.endTick < later.startedTick))
      if (!earlier) return []
      const interaction = social.interactions.find((item) => item.encounterId === earlier.id &&
        item.status === 'completed' && item.endTick < later.startedTick)
      const observations = social.witnessObservations.filter((item) => item.offenceId === offence.id)
      const reports = social.reportLinks.filter((item) => item.offenceId === offence.id)
        .map((item) => reportById.get(item.reportId)).filter(Boolean)
      return interaction && observations.length && reports.length ?
        [{ earlier, later, interaction, offence, observations, reports }] : []
    })[0]
    const summary = { offendingSeed: config.offendingSeed,
      episodeCount: episodes.length, reencountersAfterInteraction: reencounters.length,
      interactions: social.interactions.length, offences: state.offences.length,
      witnessObservations: social.witnessObservations.length,
      deliveredReports: state.reports.length, matched: Boolean(chain) }
    attempts.push(summary)
    process.stdout.write(JSON.stringify(summary) + '\n')
    if (chain) {
      const record = { fingerprint: state.fingerprint, config, commands: [], targetTick: ticks }
      const replayEqual = JSON.stringify(replayV5(world, record)) === JSON.stringify(state)
      if (!replayEqual) throw new Error('Distinct-episode chain replay mismatch')
      const atInteraction = replayV5(world, { ...record,
        targetTick: chain.interaction.endTick })
      const interactionMemoriesAtCompletion = atInteraction.social.memories.filter((item) =>
        item.provenanceId === chain.interaction.id)
      if (interactionMemoriesAtCompletion.length !== 2) {
        throw new Error('Completed interaction did not create both subjective memories')
      }
      found = { config, fingerprint: state.fingerprint, tick: state.tick,
        researcherOnly: { earlierEncounter: chain.earlier,
          laterEncounter: chain.later, interaction: chain.interaction,
          interactionMemoriesAtCompletion,
          offenderRelationshipAtFinalTick: social.relationships.find((item) =>
            item.ownerAgentId === chain.offence.offenderAgentId &&
            item.referentAgentId === chain.offence.target.id),
          destinationEvents: state.events.filter((item) =>
            chain.interaction.participantIds.includes(item.agentId) &&
            item.tick <= chain.interaction.decisionTick &&
            (item.type === 'TripStarted' || item.type === 'DestinationReached')),
          offence: chain.offence, witnessObservations: chain.observations },
        observerReports: chain.reports,
        reportDelayTicks: chain.reports.map((report) =>
          report.availableTick - report.reportedOccurrenceTick),
        replayEqual,
        verificationScope: 'Simulation and replay state only; browser visual checks are recorded separately.' }
      break
    }
  }
  const evidence = { title: 'v0.6.1 bounded distinct-episode natural chain search',
    citySeed: world.config.seed, generatorVersion: world.config.generatorVersion,
    selectionProcess: 'Ascending offender seeds 0–7; stop at first match; no target-specific injection.',
    globalOverrides: { populationSize: 120, ticks,
      greetingWillingness: 0.7, conversationWillingness: 0.85,
      baseOddsPerEligibleAgentHour: scenario.offending.baseOddsPerEligibleAgentHour,
      offenceCompletionProbability: 1, eventPerceptionProbability: 1,
      victimPerceptionProbability: 1, reportingProbability: 1 },
    criterion: 'Earlier completed interaction; earlier episode ended and cooldown elapsed; independent later episode; offender perceived target with positive directed familiarity; later truth offence; subjective witness; delivered report.',
    attempts, found }
  const target = 'docs/screenshots/v061-reencounter-search.json'
  await writeFile(target, JSON.stringify(evidence, null, 2) + '\n')
  process.stdout.write(JSON.stringify({ target, found: Boolean(found), attempts: attempts.length }) + '\n')
} finally { await vite.close() }
