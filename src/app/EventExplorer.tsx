import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { buildEventIndexV1, type ExplorerEventV1,
  type ExplorerEventKindV1 } from '../simulation/events/eventIndex'
import { reportIdForOffence } from '../simulation/offending/opportunityV5'
import type { SimulationSessionV5 } from '../simulation/sessionV5'

export function EventExplorer({ session, selected, onSelect, onFocus,
  onSelectAgent, onFollowAgent, onSelectEncounter, setPlaying, onClose }: {
  session: SimulationSessionV5
  selected: ExplorerEventV1 | null
  onSelect: (event: ExplorerEventV1 | null) => void
  onFocus: (event: ExplorerEventV1) => void
  onSelectAgent: (id: string) => void
  onFollowAgent: (id: string) => void
  onSelectEncounter: (id: string, tick: number) => void
  setPlaying: (playing: boolean) => void
  onClose: () => void
}) {
  const snapshot = useSyncExternalStore(session.subscribe,
    session.getSnapshot, session.getSnapshot)
  const [kind, setKind] = useState<'all' | ExplorerEventKindV1>('all')
  const [place, setPlace] = useState('all')
  const [fromTick, setFromTick] = useState('')
  const [toTick, setToTick] = useState('')
  const [replaying, setReplaying] = useState(false)
  const events = useMemo(() => buildEventIndexV1(snapshot.state,
    session.getWorld()), [session, snapshot.state])
  const places = useMemo(() => [...new Set(events.map((item) => item.placeId)
    .filter((item): item is string => item !== null))].sort(), [events])
  const filtered = events.filter((item) =>
    (kind === 'all' || item.kind === kind) &&
    (place === 'all' || item.placeId === place) &&
    (!fromTick || item.tick >= Number(fromTick)) &&
    (!toTick || item.tick <= Number(toTick)))
  const available = selected ? events.find((item) => item.id === selected.id) : null
  const scene = available?.sceneId ? snapshot.state.scene?.entities.find((item) =>
    item.id === available.sceneId) : null
  const offence = available ? snapshot.state.offences.find((item) =>
    item.id === available.sourceId ||
    item.id === scene?.origin.offenceId) : null
  const injury = available ? snapshot.state.life?.injuries.find((item) =>
    item.id === available.sourceId ||
    item.id === (scene?.origin.injuryId ?? '')) : null
  const death = available ? snapshot.state.life?.deaths.find((item) =>
    item.id === available.sourceId ||
    item.id === (scene?.origin.kind === 'death' ?
      scene.origin.deathEventId : '')) : null
  const observer = session.getObserverView()
  const linkedReportIds = new Set<string>()
  if (offence) {
    for (const link of snapshot.state.social?.reportLinks ?? []) {
      if (link.offenceId === offence.id) linkedReportIds.add(link.reportId)
    }
    linkedReportIds.add(reportIdForOffence(offence,
      session.getConfig().observationSeed))
  }
  if (scene) {
    for (const link of snapshot.state.scene?.reportLinks ?? []) {
      if (link.sceneId === scene.id) linkedReportIds.add(link.reportId)
    }
  }
  const offenceReports = observer.reports.filter((item) =>
    linkedReportIds.has(item.id))
  const sceneReports = (observer.lifeReports ?? []).filter((item) =>
    linkedReportIds.has(item.id))
  const discoveries = scene ? snapshot.state.scene?.discoveries.filter((item) =>
    item.sceneId === scene.id) ?? [] : []
  const hearsay = scene ? snapshot.state.scene?.hearsay.filter((item) =>
    item.sceneId === scene.id) ?? [] : []
  const activities = available ? snapshot.state.events.filter((item) =>
    available.agentIds.includes(item.agentId) &&
    Math.abs(item.tick - available.tick) <= 12).slice(-24) : []
  useEffect(() => {
    if (!replaying || !selected) return
    const end = Math.min(snapshot.liveTick, selected.tick + 8)
    const timer = window.setInterval(() => {
      const next = session.getSnapshot().tick + 1
      if (next > end) { setReplaying(false); return }
      session.inspectTick(next)
      if (next === end) setReplaying(false)
    }, 250)
    return () => window.clearInterval(timer)
  }, [replaying, selected, session, snapshot.liveTick])
  const jump = (tick: number) => {
    if (tick < 0 || tick > snapshot.liveTick) return
    setReplaying(false)
    setPlaying(false)
    session.inspectTick(tick)
  }
  const replay = () => {
    if (!selected) return
    setPlaying(false)
    session.inspectTick(Math.max(0, selected.tick - 8))
    setReplaying(true)
  }
  return <aside className="v06-event-explorer" aria-label="God View Event Explorer">
    <div className="v06-event-head">
      <span>RESEARCHER / GOD VIEW</span>
      <button onClick={onClose} aria-label="Close Event Explorer">×</button>
    </div>
    <h2>Event Explorer <em>{events.length}</em></h2>
    <p>Recorded facts and observer knowledge at Tick {snapshot.tick}.</p>
    <div className="v06-event-filters">
      <select aria-label="Filter event type" value={kind}
        onChange={(event) => setKind(event.target.value as typeof kind)}>
        <option value="all">All types</option>
        {(['offence', 'injury', 'death', 'sceneCreated',
          'sceneResolved', 'sceneDiscovered'] as const).map((value) =>
          <option value={value} key={value}>{value}</option>)}
      </select>
      <select aria-label="Filter event place" value={place}
        onChange={(event) => setPlace(event.target.value)}>
        <option value="all">All places</option>
        {places.map((value) => <option value={value} key={value}>{value}</option>)}
      </select>
      <input aria-label="Events from Tick" type="number" min="0" placeholder="From Tick"
        value={fromTick} onChange={(event) => setFromTick(event.target.value)} />
      <input aria-label="Events through Tick" type="number" min="0" placeholder="To Tick"
        value={toTick} onChange={(event) => setToTick(event.target.value)} />
    </div>
    <div className="v06-event-list" aria-label="Recorded events">
      {filtered.length === 0 && <p className="v06-empty">No matching event by this Tick.</p>}
      {filtered.map((item) => <button key={item.id}
        className={selected?.id === item.id ? 'active' : ''}
        data-event-id={item.id} onClick={() => {
          setReplaying(false); onSelect(item); onFocus(item)
        }}>
        <strong>T{item.tick} · {item.label}</strong>
        <small>{item.placeId ?? item.surfaceId} · {item.levelId}</small>
      </button>)}
    </div>
    {selected && <section className="v06-event-detail" aria-label="Selected event">
      <div className="v06-event-head"><strong>SELECTED EVENT</strong>
        <button onClick={() => onSelect(null)}>CLEAR</button></div>
      {!available ? <p className="v06-empty">
        This event is not available at inspected Tick {snapshot.tick}.
      </p> : <>
        <h3>{available.label}</h3>
        <small>{available.id}</small>
        <dl>
          <dt>Tick</dt><dd>{available.tick}</dd>
          <dt>Place</dt><dd>{available.placeId ?? 'Public space'}</dd>
          <dt>Level</dt><dd>{available.levelId} · {available.surfaceId}</dd>
          <dt>Structure</dt><dd>{available.structure ?
            available.structure.kind + ': ' + available.structure.id : 'Open space'}</dd>
          <dt>Position</dt><dd>{(available.position.x / 1000).toFixed(2)},
            {(available.position.y / 1000).toFixed(2)},
            {(available.position.z / 1000).toFixed(2)} m</dd>
        </dl>
        <h4>Ground Truth</h4>
        {offence && <p>{offence.id} · {offence.mechanism ?? 'unspecified'} ·
          {offence.severity} · second {offence.second} within Tick</p>}
        {injury && <p>{injury.id} · {injury.severity} · {injury.status}</p>}
        {death && <p>{death.id} · {death.causeClassification}</p>}
        {scene && <p>{scene.id} · {scene.kind} · {scene.status}
          {scene.resolvedTick !== null ? ' at T' + scene.resolvedTick : ''}</p>}
        {scene && <p>Incident {scene.origin.incidentId} · source offence
          {scene.origin.offenceId}</p>}
        {available.kind === 'sceneDiscovered' && <p>
          Discovery is an aftermath observation, not direct witnessing of the original event.
        </p>}
        <h4>Observer Knowledge</h4>
        {offenceReports.length === 0 && sceneReports.length === 0 &&
          <p>No linked report available by this Tick.</p>}
        {offenceReports.map((report) => <p key={report.id}>
          T{report.availableTick} · reported {report.reportedSeverity} ·
          {report.reportedPlaceId ?? 'place unknown'} · suspect {report.suspect.status}
        </p>)}
        {sceneReports.map((report) => <p key={report.id}>
          T{report.availableTick} · {report.reportedStatus} ·
          {report.reportedLevelId ?? 'level unknown'}
        </p>)}
        {scene && <><h4>Scene Lifecycle</h4>
          <p>Created T{scene.createdTick} · {scene.status}
            {scene.resolvedTick !== null ? ' T' + scene.resolvedTick : ''}</p>
          <p>{discoveries.length} recorded aftermath discoveries by this Tick.</p>
          {discoveries.slice(-8).map((item) => <p key={item.id}>
            T{item.tick} · {item.observerAgentId} ·
            believed identity: {item.believedIdentity ?? 'unknown'}
          </p>)}
          <p>{hearsay.length} second-hand claims from completed conversations.</p>
          {hearsay.slice(-8).map((item) => <p key={item.id}>
            T{item.tick} · {item.sourceAgentId} → {item.receiverAgentId} ·
            {item.claimedStatus} · name claim {item.claimedName ?? 'none'}
          </p>)}
        </>}
        <h4>Involved Agents</h4>
        <div className="v06-event-actions">
          {available.agentIds.map((id) => <span key={id}>
            <button onClick={() => onSelectAgent(id)}>{id} ↗</button>
            <button onClick={() => onFollowAgent(id)}>FOLLOW</button>
          </span>)}
        </div>
        {available.encounterId && <button onClick={() =>
          onSelectEncounter(available.encounterId!, available.tick)}>
          OPEN ENCOUNTER ↗
        </button>}
        <h4>Recorded Activity Nearby</h4>
        {activities.length === 0 && <p>No activity events in this window.</p>}
        {activities.map((item) => <button key={item.id}
          onClick={() => jump(item.tick)}>T{item.tick} · {item.agentId} ·
          {item.type} ↗</button>)}
      </>}
      <h4>Reconstruction</h4>
      <div className="v06-event-actions">
        <button onClick={() => jump(Math.max(0, selected.tick - 8))}>BEFORE</button>
        <button onClick={() => jump(selected.tick)}>EVENT TICK</button>
        <button onClick={() => jump(selected.tick + 8)}
          disabled={selected.tick + 8 > snapshot.liveTick}>AFTER</button>
        <button onClick={replay} disabled={replaying}>REPLAY THROUGH</button>
        {replaying && <button onClick={() => setReplaying(false)}>STOP</button>}
        <button onClick={() => onFocus(selected)}>FOCUS</button>
      </div>
      <p>Death outcomes are resolved at Tick end. Only offence time has a
        recorded within-Tick second.</p>
    </section>}
  </aside>
}
