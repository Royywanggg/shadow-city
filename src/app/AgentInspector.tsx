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
}: {
  session: SimulationSession
  selection: AgentSelectionController
  graph: PedestrianNetwork
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
      <p className="agent-inspector-note">Tick {snapshot.tick.toLocaleString('en-US')} · Synthetic prototype behavior</p>
    </aside>
  )
}
