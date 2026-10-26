import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { PedestrianNetwork } from '../city/model'
import type { CameraController } from '../camera/cameraController'
import type { CameraTarget } from '../camera/viewState'
import type { PlaybackController } from '../playback/PlaybackController'
import { createPedestrianLookup, interpolateAgentPose } from '../scene/agentInterpolation'
import { CharacterPortrait } from '../scene/character/CharacterPortrait'
import type { PopulationResearchPort } from '../simulation/population'
import type { SimulationSession } from '../simulation/session'
import { getCitizenSimulationState, type CitizenActivity, type CitizenEvent } from '../simulation/types'
import type { Offence } from '../simulation/v4Types'
import type { AgentSelectionController } from './agentSelection'

const MIN_WIDTH = 292
const MAX_WIDTH = 450
const ROW_HEIGHT = 52
const HISTORY_PAGE_SIZE = 24

const ACTIVITY_LABELS: Record<CitizenActivity, string> = {
  atHome: 'At home',
  planningTrip: 'Planning trip',
  waitingForSpace: 'Waiting for space',
  travelling: 'Travelling',
  atDestination: 'At destination',
  returningHome: 'Returning home',
}

type DetailTab = 'profile' | 'activity' | 'history'
type ActivityFilter = 'all' | CitizenActivity

function persistedWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem('shadow-city-population-width'))
    if (Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH) return saved
  } catch {
    // Browser storage may be disabled.
  }
  return 340
}

function eventDescription(event: CitizenEvent, anchorNames: ReadonlyMap<string, string>): string {
  const name = (id: string) => anchorNames.get(id) ?? id
  switch (event.type) {
    case 'TripStarted': return `Trip to ${name(event.destinationAnchorId)}`
    case 'DestinationReached': return `Reached ${name(event.destinationAnchorId)}`
    case 'ActivityStarted': return `Activity started at ${name(event.destinationAnchorId)}`
    case 'ActivityFinished': return `Activity finished at ${name(event.destinationAnchorId)}`
    case 'TripFailed': return `Trip failed: ${event.reason}`
    case 'TripDeferred': return `Trip deferred: ${event.reason} at ${name(event.desiredAnchorId)}`
  }
}

function offenceDescription(offence: Offence): string {
  return `${offence.severity === 'minor' ? 'Minor' : 'Serious'} offence · ${offence.district}`
}

export function PopulationSidebar({
  port,
  session,
  playback,
  selection,
  cameraController,
  graph,
}: {
  port: PopulationResearchPort
  session: SimulationSession
  playback: PlaybackController
  selection: AgentSelectionController
  cameraController: CameraController
  graph: PedestrianNetwork
}) {
  const view = useSyncExternalStore(port.subscribe, port.getView, port.getView)
  const selectedId = useSyncExternalStore(selection.subscribe, selection.getSnapshot, selection.getSnapshot)
  const following = useSyncExternalStore(cameraController.subscribe, cameraController.getFollowing,
    cameraController.getFollowing)
  const inspectingCharacter = useSyncExternalStore(cameraController.subscribe,
    cameraController.getInspectingCharacter, cameraController.getInspectingCharacter)
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 650px)').matches)
  const [mobileBrowse, setMobileBrowse] = useState(true)
  const [width, setWidth] = useState(persistedWidth)
  const [search, setSearch] = useState('')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [tab, setTab] = useState<DetailTab>('profile')
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE)
  const [scrollTop, setScrollTop] = useState(0)
  const [listHeight, setListHeight] = useState(260)
  const listRef = useRef<HTMLDivElement>(null)
  const previousSelectedId = useRef<string | null>(null)
  const anchorNames = useMemo(() => new Map(graph.anchors.map((anchor) => [anchor.id,
    anchor.kind === 'building' ? `Building ${anchor.buildingId ?? anchor.id}`
      : anchor.kind === 'plaza' ? 'Central plaza'
        : anchor.kind === 'publicEntrance' ? `Public entrance ${anchor.buildingId ?? anchor.id}`
          : anchor.kind === 'street' ? `Sidewalk ${anchor.blockId ?? anchor.id}`
          : `Park ${anchor.blockId ?? anchor.id}`])), [graph])
  const pedestrianLookup = useMemo(() => createPedestrianLookup(graph), [graph])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return view.citizens.filter((citizen) =>
      (activityFilter === 'all' || citizen.state.activity === activityFilter) &&
      (!query || citizen.id.toLowerCase().includes(query) ||
        citizen.identity.displayName.toLowerCase().includes(query)))
  }, [activityFilter, search, view])
  const selected = selectedId ? view.citizens.find((citizen) => citizen.id === selectedId) : undefined
  const history = useMemo(() => selectedId ? port.getAgentHistory(selectedId) : null,
    [port, selectedId, view.asOfTick])
  const historyEntries = useMemo(() => {
    if (!history) return []
    return [
      ...history.activityEvents.map((event) => ({ key: event.id, tick: event.tick, kind: 'activity' as const,
        description: eventDescription(event, anchorNames) })),
      ...history.offences.map((offence) => ({ key: offence.id, tick: offence.occurrenceTick,
        kind: 'offence' as const, description: offenceDescription(offence) })),
    ].sort((a, b) => b.tick - a.tick || a.key.localeCompare(b.key))
  }, [anchorNames, history])

  useEffect(() => {
    const element = listRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setListHeight(element.clientHeight))
    observer.observe(element)
    setListHeight(element.clientHeight)
    return () => observer.disconnect()
  }, [collapsed])

  useEffect(() => {
    if (previousSelectedId.current !== selectedId) {
      cameraController.stopFollowing()
      cameraController.exitInspectMode()
    }
    previousSelectedId.current = selectedId
    if (!selectedId) {
      setMobileBrowse(true)
      return
    }
    setCollapsed(false)
    if (window.innerWidth <= 650) setMobileBrowse(false)
    if (!filtered.some((citizen) => citizen.id === selectedId)) {
      setSearch('')
      setActivityFilter('all')
    }
  }, [cameraController, selectedId])

  useEffect(() => {
    if (!selectedId) return
    const index = filtered.findIndex((citizen) => citizen.id === selectedId)
    if (index < 0 || !listRef.current) return
    const top = index * ROW_HEIGHT
    const bottom = top + ROW_HEIGHT
    if (top < listRef.current.scrollTop || bottom > listRef.current.scrollTop + listRef.current.clientHeight) {
      listRef.current.scrollTop = Math.max(0, top - ROW_HEIGHT)
    }
  }, [activityFilter, search, selectedId])

  useEffect(() => setHistoryLimit(HISTORY_PAGE_SIZE), [selectedId, tab])

  useEffect(() => () => cameraController.stopFollowing(), [cameraController, session])

  useEffect(() => {
    if (selectedId && !selected) selection.select(null)
  }, [selected, selectedId, selection])

  const trackingTarget = (id: string, interpolate: boolean): CameraTarget | null => {
    const snapshot = session.getSnapshot()
    const state = getCitizenSimulationState(snapshot.state)
    const citizen = state?.citizens.find((item) => item.id === id)
    if (!state || !citizen) return null
    if (!interpolate || snapshot.isInspecting || playback.getSnapshot().status !== 'playing') {
      return [citizen.position.x, 0, citizen.position.z]
    }
    const previousState = session.getPreviousLiveState()
    const previous = previousState && getCitizenSimulationState(previousState)
    const prior = previous && previous.tick === state.tick - 1
      ? previous.citizens.find((item) => item.id === id) ?? null : null
    const pose = interpolateAgentPose(prior, citizen, pedestrianLookup, playback.getInterpolationAlpha())
    return [pose.x, 0, pose.z]
  }

  const startFollow = () => {
    if (!selectedId) return
    cameraController.follow(() => trackingTarget(selectedId, true))
  }

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const originX = event.clientX
    const originWidth = width
    const move = (next: PointerEvent) => {
      const nextWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, originWidth + next.clientX - originX))
      setWidth(nextWidth)
    }
    const finish = (next: PointerEvent) => {
      const nextWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, originWidth + next.clientX - originX))
      setWidth(nextWidth)
      try { window.localStorage.setItem('shadow-city-population-width', String(nextWidth)) } catch { /* Optional UI preference. */ }
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4)
  const endIndex = Math.min(filtered.length, Math.ceil((scrollTop + listHeight) / ROW_HEIGHT) + 4)
  const rows = filtered.slice(startIndex, endIndex)
  const currentEdge = selected?.state.route[selected.state.routeIndex]
  const destination = selected?.state.destinationAnchorId
    ? anchorNames.get(selected.state.destinationAnchorId) ?? selected.state.destinationAnchorId : 'None'

  return (
    <aside className={`population-sidebar${collapsed ? ' is-collapsed' : ''}${selectedId
      ? mobileBrowse ? ' mobile-browsing' : ' mobile-detail' : ''}`}
      style={{ '--population-width': `${width}px` } as React.CSSProperties}
      aria-label="God View population inspector" data-testid="population-sidebar">
      <button type="button" className="population-toggle" aria-expanded={!collapsed}
        aria-label={collapsed ? 'Open population sidebar' : 'Collapse population sidebar'}
        onClick={() => setCollapsed((value) => !value)}>{collapsed ? '☰' : '‹'}</button>
      {!collapsed && <>
        <header className="population-heading">
          <span>RESEARCHER · GOD VIEW</span>
          <strong>Population</strong>
          <small>Tick {view.asOfTick.toLocaleString('en-US')} · {view.citizens.length} citizens · independent of event view</small>
        </header>
        {selected && <button type="button" className="population-mobile-switch"
          onClick={() => setMobileBrowse((value) => !value)}
          aria-label={mobileBrowse ? 'View selected citizen' : 'Browse citizens'}>
          {mobileBrowse ? `VIEW ${selected.identity.displayName.toUpperCase()} →` : '← BROWSE CITIZENS'}
        </button>}
        <div className="population-browser">
        <div className="population-search">
          <label htmlFor="population-query">SEARCH CITIZENS</label>
          <input id="population-query" type="search" value={search} onChange={(event) => {
            setSearch(event.target.value)
            if (listRef.current) listRef.current.scrollTop = 0
          }} placeholder="Name or citizen ID" data-testid="population-search" />
          <label htmlFor="population-activity">CURRENT ACTIVITY</label>
          <select id="population-activity" value={activityFilter} onChange={(event) => {
            setActivityFilter(event.target.value as ActivityFilter)
            if (listRef.current) listRef.current.scrollTop = 0
          }} data-testid="population-activity-filter">
            <option value="all">All activities</option>
            {Object.entries(ACTIVITY_LABELS).map(([value, label]) =>
              <option value={value} key={value}>{label}</option>)}
          </select>
        </div>
        <div className="population-count">{filtered.length} matching · Every citizen is listed, including those indoors</div>
        <div className="population-list" ref={listRef} role="listbox" aria-label="Citizens"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} data-testid="population-list">
          <div className="population-list-space" style={{ height: filtered.length * ROW_HEIGHT }}>
            {filtered.length === 0 && <p className="population-no-results">No citizens match these filters.</p>}
            {rows.map((citizen, index) => <button type="button" role="option" key={citizen.id}
              aria-selected={citizen.id === selectedId} data-testid={`population-row-${citizen.id}`}
              className="population-row" style={{ top: (startIndex + index) * ROW_HEIGHT }}
              onClick={() => {
                selection.select(citizen.id)
                if (window.innerWidth <= 650) setMobileBrowse(false)
              }}>
              <span className="population-row-name">{citizen.identity.displayName}</span>
              <span className="population-row-meta">{citizen.id} · {ACTIVITY_LABELS[citizen.state.activity]}</span>
            </button>)}
          </div>
        </div>
        </div>
        {selected ? <section className="population-detail" aria-label="Selected citizen details">
          <div className="population-detail-heading">
            <div><span>SELECTED CITIZEN</span><strong>{selected.identity.displayName}</strong>
              <small data-testid="selected-agent-id">{selected.id.toUpperCase()}</small></div>
            <button type="button" aria-label="Clear citizen selection" onClick={() => selection.select(null)}>×</button>
          </div>
          <div className="population-navigation">
            <button type="button" onClick={() => {
              const target = trackingTarget(selected.id, false)
              if (!target) return
              if (window.innerWidth <= 650) {
                setCollapsed(true)
                window.requestAnimationFrame(() => cameraController.focusAt(target))
              } else cameraController.focusAt(target)
            }} aria-label="Focus camera on citizen" data-testid="population-focus">FOCUS</button>
            <button type="button" onClick={() => following ? cameraController.stopFollowing() : startFollow()}
              aria-pressed={following} aria-label={following ? 'Stop following citizen' : 'Follow citizen'}
              data-testid="population-follow">{following ? 'FOLLOWING' : 'FOLLOW'}</button>
            <button type="button" onClick={() => {
              if (inspectingCharacter) {
                cameraController.exitInspectMode()
                return
              }
              const target = trackingTarget(selected.id, false)
              if (!target) return
              if (window.innerWidth <= 650) {
                setCollapsed(true)
                window.requestAnimationFrame(() => cameraController.inspectAt(target))
              } else cameraController.inspectAt(target)
            }} aria-pressed={inspectingCharacter}
              aria-label={inspectingCharacter ? 'Exit 3D inspection' : 'Inspect citizen in 3D'}
              data-testid="population-inspect">{inspectingCharacter ? 'EXIT DETAIL' : 'INSPECT 3D'}</button>
          </div>
          <div className="population-tabs" role="tablist" aria-label="Citizen details">
            {(['profile', 'activity', 'history'] as const).map((value) => <button type="button" role="tab"
              key={value} aria-selected={tab === value} data-testid={`population-tab-${value}`}
              onClick={() => setTab(value)}>{value.toUpperCase()}</button>)}
          </div>
          <div className="population-tab-content" role="tabpanel">
            {tab === 'profile' && <>
              <p className="population-profile-cue">DRAG TO TURN · SCROLL FOR PROFILE DATA ↓</p>
              <div className="population-portrait" role="group" aria-label="Selected citizen 3D portrait">
                <CharacterPortrait appearance={selected.identity.appearance} activity={selected.state.activity}
                  movementMode={selected.state.movementMode}
                  animationRate={selected.profile.speedUnitsPerLogicalSecond / 0.35}
                  logicalTimeSeconds={session.getSnapshot().state.logicalTimeSeconds}
                  agentId={selected.identity.id} playback={playback} session={session} />
              </div>
              <dl>
              <div><dt>HOME</dt><dd>{anchorNames.get(selected.profile.homeAnchorId) ?? selected.profile.homeAnchorId}</dd></div>
              <div><dt>OCCUPATION</dt><dd>Not modelled</dd></div>
              <div><dt>WALK SPEED</dt><dd>{selected.profile.speedUnitsPerLogicalSecond.toFixed(2)} units / logical sec</dd></div>
              <div><dt>HOME DWELL</dt><dd>{selected.profile.homeDwellTicks} ticks</dd></div>
              <div><dt>VISIT DWELL</dt><dd>{selected.profile.visitDwellTicks} ticks</dd></div>
              <div><dt>FIRST TRIP</dt><dd>Tick {selected.profile.firstDepartureTick}</dd></div>
              <div><dt>MODEL PRESET</dt><dd>{selected.identity.appearance.presetId}</dd></div>
              <div><dt>OUTFIT</dt><dd>{selected.identity.appearance.outfitPresetId ?? 'Built into character model'}</dd></div>
              <div><dt>HAIR / ACCESSORY</dt><dd>{selected.identity.appearance.hairstylePresetId ?? 'Built in'} / {selected.identity.appearance.accessoryPresetId ?? 'Built in'}</dd></div>
              {(selected.identity.appearance.primaryClothingColor || selected.identity.appearance.secondaryClothingColor) &&
                <div><dt>CLOTHING COLORS</dt><dd>{[selected.identity.appearance.primaryClothingColor,
                  selected.identity.appearance.secondaryClothingColor].filter(Boolean).join(' · ')}</dd></div>}
              {selected.offendingProfile && <>
                <div><dt>RESEARCH GROUP</dt><dd data-testid="selected-agent-group">{selected.offendingProfile.researchGroup}</dd></div>
                <div><dt>LOG PROPENSITY</dt><dd>Minor {selected.offendingProfile.logPropensity.minor.toFixed(2)} · Serious {selected.offendingProfile.logPropensity.serious.toFixed(2)}</dd></div>
                <div><dt>REWARD / RISK</dt><dd>{selected.offendingProfile.rewardSensitivity.toFixed(2)} / {selected.offendingProfile.riskSensitivity.toFixed(2)}</dd></div>
              </>}
              </dl>
            </>}
            {tab === 'activity' && <dl>
              <div><dt>ACTIVITY</dt><dd data-testid="selected-agent-activity">{ACTIVITY_LABELS[selected.state.activity]}</dd></div>
              <div><dt>DESTINATION</dt><dd data-testid="selected-agent-destination">{destination}</dd></div>
              <div><dt>POSITION</dt><dd data-testid="selected-agent-position">{selected.state.position.x.toFixed(1)}, {selected.state.position.z.toFixed(1)}</dd></div>
              <div><dt>MOVEMENT</dt><dd>{selected.state.activity === 'travelling' ||
                selected.state.activity === 'returningHome'
                ? selected.state.movementMode === 'jog' ? 'Jogging' : 'Walking' : 'Idle'}</dd></div>
              <div><dt>HEADING</dt><dd>{Math.round(selected.state.headingRadians * 180 / Math.PI)}°</dd></div>
              <div><dt>ROUTE</dt><dd>{selected.state.route.length ? `${selected.state.routeIndex + 1} / ${selected.state.route.length} edges` : 'No active route'}</dd></div>
              <div><dt>EDGE</dt><dd>{currentEdge?.edgeId ?? '—'}</dd></div>
              <div><dt>NEXT DECISION</dt><dd>Tick {selected.state.nextDecisionTick}</dd></div>
              <div><dt>TRIPS</dt><dd>{selected.state.tripOrdinal}</dd></div>
              <div><dt>ACTIVITY SLOT</dt><dd>{selected.state.occupancySlotId ??
                (selected.state.activity === 'waitingForSpace' ? 'Waiting for capacity' : 'None')}</dd></div>
              <div><dt>VISIBILITY</dt><dd>{selected.state.activity === 'atHome' ||
                selected.state.activity === 'planningTrip' || selected.state.activity === 'waitingForSpace'
                ? 'Indoors / no street avatar' : 'Outdoors'}</dd></div>
            </dl>}
            {tab === 'history' && <div className="population-history" data-testid="selected-agent-offence-history">
              <p>Initial activity: {history ? ACTIVITY_LABELS[history.initialActivity] : 'Unavailable'} at Tick 0.</p>
              {historyEntries.length === 0 ? <p>No recorded activity or offence through Tick {view.asOfTick}.</p>
                : <ol>{historyEntries.slice(0, historyLimit).map((entry) => <li key={entry.key}
                    className={entry.kind === 'offence' ? 'is-offence' : ''}>
                    <span>Tick {entry.tick}</span><strong>{entry.description}</strong>
                  </li>)}</ol>}
              {historyEntries.length > historyLimit && <button type="button" onClick={() =>
                setHistoryLimit((limit) => limit + HISTORY_PAGE_SIZE)}>Show earlier history</button>}
              <small>{history?.offences.length ?? 0} true offences through Tick {view.asOfTick}</small>
            </div>}
          </div>
        </section> : <p className="population-empty">Select a citizen here or on the map to inspect their simulation state.</p>}
        <div className="population-resize" role="separator" aria-orientation="vertical" tabIndex={0}
          aria-label="Resize population sidebar" aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH}
          aria-valuenow={width} onPointerDown={startResize} onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            const nextWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH,
              width + (event.key === 'ArrowRight' ? 16 : -16)))
            setWidth(nextWidth)
            try { window.localStorage.setItem('shadow-city-population-width', String(nextWidth)) } catch { /* Optional UI preference. */ }
          }} />
      </>}
    </aside>
  )
}
