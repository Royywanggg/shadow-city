import { useMemo, useSyncExternalStore } from 'react'
import type { PedestrianNetwork } from '../city/model'
import type { SimulationSession } from '../simulation/session'
import { getCitizenSimulationState } from '../simulation/types'
import type { AgentSelectionController } from './agentSelection'

const ACTIVITY_LABELS = {
  atHome: 'AT HOME',
  planningTrip: 'PLANNING TRIP',
  travelling: 'TRAVELLING',
  atDestination: 'AT DESTINATION',
  returningHome: 'RETURNING HOME',
} as const

export function AgentInspector({
  session,
  selection,
  graph,
  researcherV4 = false,
}: {
  session: SimulationSession
  selection: AgentSelectionController
  graph: PedestrianNetwork
  researcherV4?: boolean
}) {
  const selectedId = useSyncExternalStore(selection.subscribe, selection.getSnapshot, selection.getSnapshot)
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const anchorNames = useMemo(() => new Map(graph.anchors.map((anchor) => [anchor.id,
    anchor.kind === 'building' ? `Building ${anchor.buildingId ?? anchor.id}`
      : anchor.kind === 'plaza' ? 'Central plaza' : `Park ${anchor.blockId ?? anchor.id}`])), [graph])
  const citizenState = getCitizenSimulationState(snapshot.state)
  if (!selectedId || !citizenState) return null
  const agent = citizenState.citizens.find((citizen) => citizen.id === selectedId)
  if (!agent) return null
  const currentEdge = agent.route[agent.routeIndex]
  const destination = agent.destinationAnchorId
    ? anchorNames.get(agent.destinationAnchorId) ?? agent.destinationAnchorId
    : 'None'
  const truth = researcherV4 ? session.getGroundTruthViewV4() : null
  const profile = truth?.profiles.find((item) => item.agentId === agent.id)
  const offences = truth?.offences.filter((item) => item.offenderAgentId === agent.id) ?? []
  const groupLabel = profile?.researchGroup === 'minorSpecialist' ? 'MINOR SPECIALIST'
    : profile?.researchGroup === 'seriousSpecialist' ? 'SERIOUS SPECIALIST'
      : profile?.researchGroup === 'generalist' ? 'GENERALIST' : 'UNAVAILABLE'

  return (
    <aside className="agent-inspector" aria-label="Citizen inspector">
      <header className="agent-inspector-heading">
        <div>
          <span className="agent-inspector-kicker">CITIZEN / SYNTHETIC MODEL</span>
          <strong data-testid="selected-agent-id">{agent.id.toUpperCase()}</strong>
        </div>
        <button type="button" aria-label="Close citizen inspector" onClick={() => selection.select(null)}>×</button>
      </header>
      <dl>
        <div><dt>ACTIVITY</dt><dd data-testid="selected-agent-activity">{ACTIVITY_LABELS[agent.activity]}</dd></div>
        <div><dt>DESTINATION</dt><dd data-testid="selected-agent-destination">{destination}</dd></div>
        <div><dt>ROUTE</dt><dd>{agent.route.length ? `${agent.routeIndex + 1} / ${agent.route.length} edges` : 'No active route'}</dd></div>
        <div><dt>EDGE</dt><dd>{currentEdge?.edgeId ?? '—'}{currentEdge ? ` · ${agent.distanceOnEdge.toFixed(1)} units` : ''}</dd></div>
        <div><dt>POSITION</dt><dd data-testid="selected-agent-position">{agent.position.x.toFixed(1)}, {agent.position.z.toFixed(1)}</dd></div>
      </dl>
      {researcherV4 && <div className="agent-offence-research" aria-label="Researcher offender profile and history">
        <span className="agent-inspector-kicker">PRIVATE RESEARCH PROFILE</span>
        <dl>
          <div><dt>GROUP</dt><dd data-testid="selected-agent-group">{groupLabel}</dd></div>
          <div><dt>LOG PROPENSITY</dt><dd>{profile
            ? `M ${profile.logPropensity.minor.toFixed(2)} · S ${profile.logPropensity.serious.toFixed(2)}` : '—'}</dd></div>
          <div><dt>OFFENCES</dt><dd data-testid="selected-agent-offence-count">{offences.length}</dd></div>
          <div><dt>MIN / SER</dt><dd data-testid="selected-agent-severity-counts">
            {offences.filter((offence) => offence.severity === 'minor').length} / {' '}
            {offences.filter((offence) => offence.severity === 'serious').length}
          </dd></div>
        </dl>
        <ol aria-label="Selected agent offence history" data-testid="selected-agent-offence-history">
          {offences.length === 0 ? <li>No offence through Tick {truth?.asOfTick ?? snapshot.tick}</li>
            : offences.slice(-6).map((offence) => <li key={offence.id}>
              Tick {offence.occurrenceTick} · {offence.severity.toUpperCase()} · {offence.district.toUpperCase()}
            </li>)}
        </ol>
      </div>}
      <p className="agent-inspector-note">Tick {snapshot.tick.toLocaleString('en-US')} · Synthetic prototype behavior</p>
    </aside>
  )
}
