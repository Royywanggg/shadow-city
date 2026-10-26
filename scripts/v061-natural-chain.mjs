import { writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

// This fixed-seed regression does not assign people, destinations, interactions, or offences.
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { generateIntegratedWorld } = await vite.ssrLoadModule('/src/world/generation/generateIntegratedWorld.ts')
  const { SimulationSessionV5 } = await vite.ssrLoadModule('/src/simulation/sessionV5.ts')
  const { replayV5 } = await vite.ssrLoadModule('/src/simulation/replayV5.ts')
  const { DEFAULT_SIMULATION_CONFIG_V5 } = await vite.ssrLoadModule('/src/simulation/v5Types.ts')
  const { DEFAULT_ENCOUNTER_SCENARIO_V1 } = await vite.ssrLoadModule('/src/simulation/encounter/config.ts')
  const { projectObserverViewV5 } = await vite.ssrLoadModule('/src/simulation/encounter/observerProjection.ts')
  const world = generateIntegratedWorld()
  const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 120,
    offendingSeed: 'shadow-city-offending-chain-4', reportingProbability: 1,
    encounter: { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
      social: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.social,
        greetingWillingness: 0.7, conversationWillingness: 0.85 },
      witness: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.witness,
        eventPerceptionProbability: 0.75, victimPerceptionProbability: 0.95 } } }
  const session = new SimulationSessionV5(world, config)
  for (let tick = 0; tick < 94; tick += 1) session.advanceOneTick()
  const state = session.getSnapshot().state
  const social = state.social
  const observerView = projectObserverViewV5(state)
  const reportById = new Map(observerView.reports.map((report) => [report.id, report]))
  const chain = state.offences.flatMap((offence) => {
    if (offence.target.kind !== 'citizen' ||
      !offence.opportunity.socialContext?.offenderPerceivedTarget ||
      offence.opportunity.socialContext.directedFamiliarity <= 0) return []
    const pair = [offence.offenderAgentId, offence.target.id].sort().join('|')
    const interaction = social.interactions.find((item) =>
      item.participantIds.join('|') === pair && item.status === 'completed' &&
      item.endTick < offence.tick)
    const observations = social.witnessObservations.filter((item) => item.offenceId === offence.id)
    const reports = social.reportLinks.filter((item) => item.offenceId === offence.id)
      .map((item) => reportById.get(item.reportId)).filter(Boolean)
    return interaction && observations.length && reports.length ?
      [{ offence, interaction, observations, reports }] : []
  })[0]
  if (!chain) throw new Error('The fixed-seed natural chain was not reproduced')
  const { offence, interaction, observations, reports } = chain
  const episode = [...social.encounters.active, ...social.encounters.completed].find((item) =>
    item.id === interaction.encounterId)
  if (!episode || !episode.interactionIds.includes(interaction.id)) {
    throw new Error('Interaction is not linked to its encounter episode')
  }
  const relationship = social.relationships.find((item) =>
    item.ownerAgentId === offence.offenderAgentId &&
    item.referentAgentId === offence.target.id)
  const experience = social.memories.filter((item) =>
    item.provenanceId === interaction.id &&
    interaction.participantIds.includes(item.ownerAgentId))
  const trips = state.events.filter((item) => interaction.participantIds.includes(item.agentId) &&
    item.tick <= interaction.decisionTick &&
    (item.type === 'TripStarted' || item.type === 'DestinationReached'))
  const replayEqual = JSON.stringify(replayV5(world, session.exportReplay())) ===
    JSON.stringify(state)
  if (!replayEqual) throw new Error('Natural chain replay mismatch')
  const evidence = { title: 'v0.6.1 fixed-seed natural encounter-to-report chain',
    limitation: 'The greeting and later offence occurred during one continuous social encounter episode; a distinct second episode is not shown here.',
    citySeed: world.config.seed, generatorVersion: world.config.generatorVersion,
    fingerprint: state.fingerprint, tick: state.tick, config,
    researcherOnly: { participantIds: interaction.participantIds,
      destinationEvents: trips,
      encounter: { id: episode.id, status: episode.status,
        startedTick: episode.startedTick, startedSecond: episode.startedSecond,
        contactSeconds: episode.contactSeconds, perceivedBy: episode.perceivedBy,
        surfaceId: episode.surfaceId, placeId: episode.placeId,
        interactionIds: episode.interactionIds },
      interaction, subjectiveInteractionMemories: experience,
      offenderRelationship: relationship,
      offence: { id: offence.id, tick: offence.tick, second: offence.second,
        offenderAgentId: offence.offenderAgentId, target: offence.target,
        encounterId: offence.encounterId, opportunity: offence.opportunity,
        severity: offence.severity },
      witnessObservations: observations },
    observerReports: reports,
    reportDelayTicks: reports.map((report) =>
      report.availableTick - report.reportedOccurrenceTick),
    replayEqual,
    verificationScope: 'Simulation and replay state only; browser visual checks are recorded separately.' }
  const target = 'docs/screenshots/v061-natural-chain-tick94.json'
  await writeFile(target, JSON.stringify(evidence, null, 2) + '\n')
  process.stdout.write(JSON.stringify({ target, tick: state.tick,
    participantIds: interaction.participantIds, interactionTick: interaction.decisionTick,
    offenceTick: offence.tick, witnessCount: observations.length,
    reportCount: reports.length, replayEqual }) + '\n')
} finally { await vite.close() }
