import { useMemo, useSyncExternalStore } from 'react'
import type { SimulationSessionV5 } from '../simulation/sessionV5'

export function PlaceExplorer({ session, selectedPlaceId, onSelectPlace, onSelectAgent,
  onSelectEvent, onFocus, onClose }: {
  session: SimulationSessionV5
  selectedPlaceId: string
  onSelectPlace: (id: string) => void
  onSelectAgent: (id: string) => void
  onSelectEvent: (id: string) => void
  onFocus: (placeId: string) => void
  onClose: () => void
}) {
  const snapshot = useSyncExternalStore(session.subscribe,
    session.getSnapshot, session.getSnapshot)
  const world = session.getWorld()
  const buildingPlaces = useMemo(() => world.places.filter((item) =>
    item.buildingId === 'central-galleria'), [world])
  const place = buildingPlaces.find((item) => item.id === selectedPlaceId) ??
    buildingPlaces[0]
  if (!place) return null
  const runtime = snapshot.state.placeRuntime?.places.find((item) =>
    item.placeId === place.id)
  const people = snapshot.state.citizens.filter((citizen) =>
    buildingPlaces.some((item) => item.id === citizen.placeId))
  const surfaceById = new Map(world.surfaces.map((item) => [item.id, item]))
  const activityEvents = snapshot.state.events.filter((item) =>
    item.placeId === place.id && item.type.startsWith('Activity'))
  const encounters = [...(snapshot.state.social?.encounters.active ?? []),
    ...(snapshot.state.social?.encounters.completed ?? [])].filter((item) =>
    item.placeId === place.id)
  const offences = snapshot.state.offences.filter((item) => item.placeId === place.id)
  const observer = session.getObserverView()
  const reports = observer.reports.filter((item) => item.reportedPlaceId === place.id)
  const scenes = snapshot.state.scene?.entities.filter((item) =>
    item.anchor.placeId === place.id) ?? []
  const entranceCount = useMemo(() => {
    const buildingSurfaces = new Set(buildingPlaces.flatMap((item) => item.surfaceIds))
    const nodes = new Map(world.navNodes.map((item) => [item.id, item]))
    return world.navEdges.filter((edge) => {
      if (edge.kind !== 'portal') return false
      const from = nodes.get(edge.fromNodeId)
      const to = nodes.get(edge.toNodeId)
      return from && to && buildingSurfaces.has(from.surfaceId) !==
        buildingSurfaces.has(to.surfaceId)
    }).length
  }, [buildingPlaces, world])
  const floors = [...new Set(buildingPlaces.flatMap((item) => item.surfaceIds)
    .map((id) => surfaceById.get(id)?.levelId).filter(Boolean))]
  return <aside className="v06-place-explorer" aria-label="God View Place Inspector">
    <div className="v06-event-head"><span>RESEARCHER / GOD VIEW</span>
      <button onClick={onClose} aria-label="Close Place Inspector">×</button></div>
    <h2>Central Galleria</h2>
    <p>Functional building · navigation and floor visualization; detailed rooms are not modeled.</p>
    <div className="v06-event-filters"><select aria-label="Inspect Galleria place"
      value={place.id} onChange={(event) => onSelectPlace(event.target.value)}>
      {buildingPlaces.map((item) => <option key={item.id} value={item.id}>
        {item.name}</option>)}
    </select></div>
    <button onClick={() => onFocus(place.id)}>FOCUS PLACE ↗</button>
    <h3>Building</h3>
    <dl><dt>ID</dt><dd>{place.buildingId}</dd>
      <dt>Type</dt><dd>Shopping mall</dd>
      <dt>Floors</dt><dd>{floors.join(', ')}</dd>
      <dt>Entrances</dt><dd>{entranceCount} external portals</dd>
      <dt>Ground access</dt><dd>{snapshot.state.accessModes['mall-entry'] ?? 'open'}</dd>
      <dt>Skybridge</dt><dd>{snapshot.state.accessModes['bridge-entry'] ?? 'open'}</dd></dl>
    <h3>Selected place</h3>
    <dl><dt>ID</dt><dd>{place.id}</dd>
      <dt>Use</dt><dd>{place.kind}</dd>
      <dt>Floor</dt><dd>{place.floorId ?? 'L0 / L1'}</dd>
      <dt>Activities</dt><dd>{place.activityTags.join(', ')}</dd>
      <dt>Open now</dt><dd>{runtime ? String(runtime.isOpen) : 'Place model disabled'}</dd>
      <dt>Capacity</dt><dd>{place.capacity} activity slots</dd>
      <dt>Reserved</dt><dd>{runtime?.reservedAgentIds.length ?? 0}</dd>
      <dt>Free</dt><dd>{runtime?.availableSlots ?? '—'}</dd>
      <dt>Physically here</dt><dd>{runtime?.occupantIds.length ?? 0}</dd>
      <dt>Waiting for this place</dt><dd>{runtime?.waitingAgentIds.length ?? 0}</dd></dl>
    <h3>People in building <em>{people.length}</em></h3>
    {people.length === 0 && <p className="v06-empty">No resident inside at this Tick.</p>}
    {people.map((citizen) => {
      const lastArrival = [...snapshot.state.events].reverse().find((item) =>
        item.agentId === citizen.id && item.type === 'DestinationReached' &&
        buildingPlaces.some((candidate) => candidate.id === item.placeId))
      return <button className="v06-timeline-row" key={citizen.id}
        onClick={() => onSelectAgent(citizen.id)}>
        <span>{citizen.id} · {citizen.activityKind} ·
          {surfaceById.get(citizen.surfaceId)?.levelId ?? '?'}</span>
        <small>{citizen.placeId ?? 'in transit'} · last destination arrival {lastArrival ?
          `T${lastArrival.tick}` : 'not recorded'} · completion {citizen.activity ===
          'atDestination' ? `T${citizen.nextDecisionTick}` : '—'} ↗</small>
      </button>
    })}
    <h3>Recorded activity and events</h3>
    <p>{runtime?.activeActivityIds.length ?? 0} active intentions ·
      {activityEvents.length} activity transitions ·
      {encounters.length} encounters</p>
    {activityEvents.slice(-6).reverse().map((item) =>
      <p key={item.id}>T{item.tick} · {item.agentId} · {item.type}</p>)}
    <p>{offences.length} truth offences · {reports.length} available reports ·
      {scenes.length} scenes</p>
    {offences.map((item) => <button className="v06-timeline-row" key={item.id}
      onClick={() => onSelectEvent(item.id)}>
      T{item.tick} · {item.id} · {item.levelId} ↗</button>)}
    {scenes.map((item) => <button className="v06-timeline-row" key={item.id}
      onClick={() => onSelectEvent(item.id)}>
      T{item.createdTick} · {item.id} ↗</button>)}
  </aside>
}
