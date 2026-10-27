import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, AgXToneMapping, SRGBColorSpace } from 'three'
import { memo, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { createCameraController } from '../camera/cameraController'
import { FixedStepScheduler, browserFrameHost, type PlaybackSpeed } from '../playback/FixedStepScheduler'
import { WorldCameraRig } from '../scene/WorldCameraRig'
import { WorldSceneV2, WorldOffenceLayer, WorldSelectedRoute } from '../scene/WorldSceneV2'
import { WorldAgentLayerV5 } from '../scene/WorldAgentLayerV5'
import { EncounterLayerV1 } from '../scene/EncounterLayerV1'
import { CharacterPortraitV5 } from '../scene/character/CharacterPortraitV5'
import { createCitizenIdentity } from '../simulation/population'
import { DEFAULT_ENCOUNTER_SCENARIO_V1 } from '../simulation/encounter/config'
import { relationshipCategoryV1 } from '../simulation/encounter/relationships'
import { createSocialProfileV1 } from '../simulation/encounter/socialProfiles'
import { SimulationSessionV5 } from '../simulation/sessionV5'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../simulation/v5Types'
import { DEFAULT_WORLD_CONFIG_V2 } from '../world/model'
import { generateWorldV2 } from '../world/generation/generateWorldV2'
import { generateIntegratedWorld, INTEGRATED_WORLD_CONFIG_V2 } from '../world/generation/generateIntegratedWorld'
import { CameraControls } from './CameraControls'
import './v06.css'

const ResidentRow = memo(function ResidentRow({ id, name, activity, selected,
  onSelect }: { id: string; name: string; activity: string; selected: boolean;
    onSelect: (id: string | null) => void }) {
  return <button data-agent-id={id} className={selected ? 'selected' : ''}
    onClick={() => onSelect(id)}>
    <span><strong>{name}</strong><small>{id}</small></span><small>{activity}</small>
  </button>
})

function DynamicWorldOverlays({ session, selectedId, selectedEncounterId, level, mode }: {
  session: SimulationSessionV5; selectedId: string | null; selectedEncounterId: string | null;
  level: 'all' | 'L0' | 'L1';
  mode: 'truth' | 'observed' | 'compare'
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const selected = snapshot.state.citizens.find((citizen) => citizen.id === selectedId) ?? null
  return <>
    <WorldSelectedRoute world={session.getWorld()} citizen={selected} />
    <WorldOffenceLayer state={snapshot.state} mode={mode}
      observationSeed={session.getConfig().observationSeed} />
    <EncounterLayerV1 state={snapshot.state} world={session.getWorld()}
      episodeId={selectedEncounterId} level={level} />
  </>
}

function V5Panel({ session, selectedId, onSelect, selectedEncounterId, onSelectEncounter,
  cameraController, level, setLevel,
  cutaway, setCutaway, debug, setDebug, mode, setMode, playing, setPlaying,
  speed, setSpeed, step, sidebarOpen, setSidebarOpen }: {
  session: SimulationSessionV5; selectedId: string | null; onSelect: (id: string | null) => void;
  selectedEncounterId: string | null;
  onSelectEncounter: (episodeId: string | null, tick?: number) => void;
  cameraController: ReturnType<typeof createCameraController>;
  level: 'all' | 'L0' | 'L1'; setLevel: (level: 'all' | 'L0' | 'L1') => void;
  cutaway: boolean; setCutaway: (value: boolean) => void; debug: boolean; setDebug: (value: boolean) => void;
  mode: 'truth' | 'observed' | 'compare'; setMode: (value: 'truth' | 'observed' | 'compare') => void;
  playing: boolean; setPlaying: (value: boolean) => void; speed: PlaybackSpeed;
  setSpeed: (value: PlaybackSpeed) => void; step: () => void;
  sidebarOpen: boolean; setSidebarOpen: (value: boolean) => void;
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const following = useSyncExternalStore(cameraController.subscribe,
    () => cameraController.getFollowing())
  const [query, setQuery] = useState('')
  const [activityFilter, setActivityFilter] = useState('all')
  const [tab, setTab] = useState<'profile' | 'activity' | 'history' | 'relationships' |
    'encounters' | 'memory' | 'timeline'>('profile')
  const identities = useMemo(() => new Map(session.getProfiles().map((profile) =>
    [profile.id, createCitizenIdentity(profile.id)])), [session])
  useEffect(() => {
    if (!selectedId) return
    const row = document.querySelector(`.v06-list [data-agent-id="${selectedId}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])
  const selected = snapshot.state.citizens.find((citizen) => citizen.id === selectedId) ?? null
  const profile = session.getProfiles().find((item) => item.id === selectedId)
  const identity = selected ? identities.get(selected.id)! : null
  const social = snapshot.state.social
  const socialProfile = selected && session.getConfig().encounter ?
    createSocialProfileV1(selected.id, session.getConfig().encounter!.social.seed) : null
  const relationships = social?.relationships.filter((item) => item.ownerAgentId === selectedId)
    .sort((a, b) => b.familiarity - a.familiarity ||
      a.referentAgentId.localeCompare(b.referentAgentId)) ?? []
  const encounters = social ? [...social.encounters.active, ...social.encounters.completed]
    .filter((item) => item.participantIds.includes(selectedId ?? ''))
    .sort((a, b) => b.startedTick - a.startedTick || a.id.localeCompare(b.id)) : []
  const memories = social?.memories.filter((item) => item.ownerAgentId === selectedId)
    .sort((a, b) => b.createdTick - a.createdTick || a.id.localeCompare(b.id)) ?? []
  const knowledge = social?.knowledge.filter((item) => item.ownerAgentId === selectedId)
    .sort((a, b) => b.acquiredTick - a.acquiredTick || a.id.localeCompare(b.id)) ?? []
  const perceivedRisks = social?.perceivedPlaceRisks.filter((item) =>
    item.ownerAgentId === selectedId).sort((a, b) =>
      b.score - a.score || a.placeId.localeCompare(b.placeId)) ?? []
  const selectedEpisode = encounters.find((item) => item.id === selectedEncounterId)
  const selectedDecisions = social?.interactionDecisions.filter((item) =>
    item.encounterId === selectedEncounterId) ?? []
  const selectedTraces = social?.decisionTraces.filter((item) =>
    item.episodeId === selectedEncounterId) ?? []
  const timeline = selectedId ? [
    ...snapshot.state.events.filter((item) => item.agentId === selectedId).map((item) => ({
      id: item.id, tick: item.tick, label: item.type,
      scope: 'OBJECTIVE' as const, episodeId: null as string | null,
    })),
    ...(social?.encounterEvents.filter((item) => encounters.some((episode) =>
      episode.id === item.episodeId)).map((item) => ({
      id: item.id, tick: item.tick, label: item.type,
      scope: 'OBJECTIVE' as const, episodeId: item.episodeId,
    })) ?? []),
    ...(social?.interactionEvents.filter((item) => item.participantIds.includes(selectedId))
      .map((item) => ({ id: item.id, tick: item.tick,
        label: `Interaction ${item.type}`, scope: 'OBJECTIVE' as const,
        episodeId: social.interactions.find((interaction) =>
          interaction.id === item.interactionId)?.encounterId ?? null,
      })) ?? []),
    ...(social?.witnessObservations.filter((item) => item.ownerAgentId === selectedId)
      .map((item) => ({ id: item.id, tick: item.observedTick,
        label: `${item.source} observation`, scope: 'SUBJECTIVE' as const,
        episodeId: null as string | null,
      })) ?? []),
  ].sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id)) : []
  const selectedSurface = selected ? session.getWorld().surfaces.find((item) => item.id === selected.surfaceId) : null
  const filtered = snapshot.state.citizens.filter((citizen) => {
    const name = identities.get(citizen.id)!.displayName
    return (activityFilter === 'all' || citizen.activity === activityFilter) &&
      (!query || citizen.id.toLowerCase().includes(query.toLowerCase()) ||
        name.toLowerCase().includes(query.toLowerCase()))
  })
  const focus = () => { if (selected) cameraController.focusAt([
    selected.position.x / 1000, selected.position.y / 1000, selected.position.z / 1000]) }
  const follow = () => {
    if (cameraController.getFollowing()) cameraController.stopFollowing()
    else if (selectedId) cameraController.follow(() => {
      const citizen = session.getSnapshot().state.citizens.find((item) => item.id === selectedId)
      return citizen ? [citizen.position.x / 1000, citizen.position.y / 1000,
        citizen.position.z / 1000] : null
    })
  }
  const closeMall = (id: 'bridge-entry' | 'mall-entry') => {
    const mode = snapshot.state.accessModes[id] === 'open' ? 'entryClosed' : 'open'
    session.scheduleAccessCommand({ id: `command:${id}:${snapshot.liveTick + 1}`,
      effectiveTick: snapshot.liveTick + 1, accessId: id, mode })
  }
  const status = following ? 'STOP FOLLOW' : 'FOLLOW'
  return <>
    <aside className={`v06-sidebar ${sidebarOpen ? '' : 'collapsed'}`} aria-label="God View Population Inspector">
      <button className="v06-collapse" onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Collapse population' : 'Expand population'}>
        {sidebarOpen ? '‹' : '›'}
      </button>
      {sidebarOpen && <>
        <div className="v06-sidebar-head"><span>RESEARCHER / GOD VIEW</span>
          <h2>Population <em>{snapshot.state.citizens.length}</em></h2>
          <p>Complete synthetic identities and recorded state, independent of report visibility.</p>
        </div>
        <div className="v06-filters">
          <input aria-label="Search residents" placeholder="Search name or Agent ID" value={query}
            onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="Filter activity" value={activityFilter}
            onChange={(event) => setActivityFilter(event.target.value)}>
            <option value="all">All activities</option>
            {['atHome', 'travelling', 'returningHome', 'atDestination', 'interacting', 'waitingForSpace'].map((activity) =>
              <option key={activity} value={activity}>{activity}</option>)}
          </select>
        </div>
        <div className="v06-list" aria-label="Residents">
          {filtered.map((citizen) => <ResidentRow key={citizen.id}
            id={citizen.id} name={identities.get(citizen.id)!.displayName}
            activity={citizen.activity === 'atDestination' ? citizen.activityKind : citizen.activity}
            selected={citizen.id === selectedId} onSelect={onSelect} />)}
        </div>
        {selected && identity && profile && <section className="v06-inspector" aria-label="Selected resident">
          <div className="v06-selected-head"><span>SELECTED RESIDENT</span>
            <button onClick={() => onSelect(null)} aria-label="Clear selection">×</button></div>
          <h3>{identity.displayName}</h3><small>{selected.id} · {selectedSurface?.levelId ?? 'unknown level'}</small>
          <CharacterPortraitV5 agentId={selected.id} appearance={identity.appearance}
            activity={selected.activity} movementMode={selected.movementMode}
            tick={snapshot.tick} playing={playing && !snapshot.isInspecting}
            ticksPerSecond={4 * speed}
            animationRate={profile.travellerCosts.speedMmPerSecond / 1300} />
          <div className="v06-action-row"><button onClick={focus}>FOCUS</button>
            <button onClick={follow}>{status}</button></div>
          <div className="v06-tabs" aria-label="Researcher resident sections">
            {(['profile', 'activity', 'history', 'relationships', 'encounters',
              'memory', 'timeline'] as const).map((value) =>
              <button key={value} className={tab === value ? 'active' : ''}
                onClick={() => setTab(value)}>{value.toUpperCase()}</button>)}
          </div>
          {tab === 'profile' && <dl>
            <dt>Home</dt><dd>{profile.homePlaceId}</dd>
            <dt>Work</dt><dd>{profile.workPlaceId ?? 'None'}</dd>
            <dt>Appearance</dt><dd>{identity.appearance.presetId}</dd>
            <dt>Outfit</dt><dd>{identity.appearance.primaryClothingColor ?? 'authored'} / {identity.appearance.secondaryClothingColor ?? 'authored'}</dd>
            {socialProfile && <><dt>Sociability</dt><dd>{socialProfile.sociability.toFixed(2)}</dd>
              <dt>Attention</dt><dd>{socialProfile.attention.toFixed(2)}</dd></>}
          </dl>}
          {tab === 'activity' && <dl>
            <dt>Current</dt><dd>{selected.activity}</dd>
            <dt>Place</dt><dd>{selected.placeId ?? 'in transit'}</dd>
            <dt>Surface</dt><dd>{selected.surfaceId}</dd>
            <dt>Position</dt><dd>{(selected.position.x / 1000).toFixed(1)}, {(selected.position.y / 1000).toFixed(1)}, {(selected.position.z / 1000).toFixed(1)} m</dd>
            <dt>Destination</dt><dd>{selected.destinationPlaceId ?? 'None'}</dd>
          </dl>}
          {tab === 'history' && <div className="v06-history">
            {snapshot.state.events.filter((event) => event.agentId === selected.id).slice(-12).reverse().map((event) =>
              <p key={event.id}>T{event.tick} · {event.type} {event.placeId}</p>)}
            {snapshot.state.offences.filter((offence) => offence.offenderAgentId === selected.id ||
              offence.target.kind === 'citizen' && offence.target.id === selected.id).map((offence) =>
              <p key={offence.id}>T{offence.tick} · TRUE OFFENCE · {offence.severity}</p>)}
          </div>}
          {tab === 'relationships' && <div className="v06-research-list">
            <p className="v06-scope">SUBJECTIVE RELATIONSHIPS · RESEARCHER VIEW · {selected.id}</p>
            {relationships.length === 0 && <p className="v06-empty">No relationship state yet.</p>}
            {relationships.map((relation) => <div className="v06-research-card"
              key={`${relation.ownerAgentId}:${relation.referentAgentId}`}>
              <div className="v06-card-head"><strong>{identities.get(relation.referentAgentId)?.displayName ?? relation.referentAgentId}</strong>
                <button onClick={() => onSelect(relation.referentAgentId)}>SELECT ↗</button></div>
              <small>{relation.referentAgentId} · {relationshipCategoryV1(relation)}</small>
              <dl><dt>Familiarity</dt><dd>{relation.familiarity.toFixed(2)}</dd>
                <dt>Recognition</dt><dd>{relation.recognitionStrength.toFixed(2)}</dd>
                <dt>Trust</dt><dd>{relation.trust.toFixed(2)}</dd>
                <dt>Interactions</dt><dd>{relation.greetingCount} greetings · {relation.conversationCount} conversations</dd>
                <dt>Name belief</dt><dd>{relation.believedIdentity ?? 'Unknown to resident'}</dd></dl>
            </div>)}
          </div>}
          {tab === 'encounters' && <div className="v06-research-list">
            <p className="v06-scope">OBJECTIVE ENCOUNTERS · TICK {snapshot.tick}</p>
            {encounters.length === 0 && <p className="v06-empty">No encounters by this Tick.</p>}
            {encounters.map((episode) => {
              const otherId = episode.participantIds.find((id) => id !== selected.id)!
              return <button className={`v06-encounter-row ${selectedEncounterId === episode.id ? 'active' : ''}`}
                key={episode.id} data-encounter-id={episode.id}
                onClick={() => onSelectEncounter(episode.id,
                  episode.status === 'active' ? undefined : episode.startedTick)}>
                <strong>{identities.get(otherId)?.displayName ?? otherId}</strong>
                <small>T{episode.startedTick}{episode.endedTick === null ? ' · active' :
                  `–${episode.endedTick}`} · {episode.contactSeconds}s contact</small>
                <small>{episode.placeId ?? episode.surfaceId ?? 'walkable space'} · INSPECT ↗</small>
              </button>
            })}
            {selectedEpisode && <div className="v06-research-card v06-decision">
              <div className="v06-card-head"><p className="v06-scope">DECISION EXPLANATION</p>
                <button onClick={() => onSelectEncounter(null)}>CLEAR</button></div>
              <small>{selectedEpisode.id}</small>
              <dl><dt>Contact</dt><dd>{selectedEpisode.contactSeconds}s · nearest {(selectedEpisode.minDistanceMm / 1000).toFixed(2)}m</dd>
                <dt>Perceived by</dt><dd>{selectedEpisode.perceivedBy.join(', ') || 'No one'}</dd>
                <dt>Decisions</dt><dd>{selectedDecisions.length === 0 ? 'No mutual decision' :
                  selectedDecisions.map((decision) =>
                    `T${decision.tick} ${decision.phase}: ${decision.type} (${decision.reason}; consent ${decision.firstAccepted ? 'yes' : 'no'} / ${decision.secondAccepted ? 'yes' : 'no'})`).join(' · ')}</dd>
                <dt>Trace</dt><dd>{selectedTraces.length > 0 ?
                  selectedTraces.map((trace) => <div className="v06-trace-row"
                    key={`${trace.episodeId}:${trace.phase}`}>
                    T{trace.tick} {trace.phase} · {trace.spatialRule}<br />
                    A: p={trace.firstChance?.toFixed(3) ?? 'not evaluated'}, draw={trace.firstDraw?.toFixed(3) ?? '—'}, sociability={trace.firstSociability.toFixed(2)}, familiarity={trace.firstFamiliarity.toFixed(2)}, time={trace.firstAvailableTicks} Ticks<br />
                    B: p={trace.secondChance?.toFixed(3) ?? 'not evaluated'}, draw={trace.secondDraw?.toFixed(3) ?? '—'}, sociability={trace.secondSociability.toFixed(2)}, familiarity={trace.secondFamiliarity.toFixed(2)}, time={trace.secondAvailableTicks} Ticks
                  </div>) : 'No diagnostic trace retained'}</dd></dl>
              {selectedEpisode.lastContactGlobalSecond !== snapshot.tick * 6 &&
                <p className="v06-empty">Historical encounter. Map rings show inspected-Tick positions; no current contact link.</p>}
            </div>}
          </div>}
          {tab === 'memory' && <div className="v06-research-list">
            <p className="v06-scope">SUBJECTIVE MEMORY & KNOWLEDGE</p>
            {memories.length === 0 && knowledge.length === 0 && perceivedRisks.length === 0 &&
              <p className="v06-empty">No retained subjective records by this Tick.</p>}
            {memories.map((memory) => <div className="v06-research-card" key={memory.id}>
              <strong>T{memory.createdTick} · {memory.category}</strong>
              <small>{memory.observationCode} · {memory.source}</small>
              <small>{memory.subjectToken ?? 'No person reference'} · {memory.placeId ?? 'No place'}</small>
              <small>confidence {memory.confidence.toFixed(2)} · salience {memory.salience.toFixed(2)}</small>
              <button onClick={() => { setPlaying(false); session.inspectTick(memory.createdTick) }}>INSPECT T{memory.createdTick} ↗</button>
            </div>)}
            {knowledge.map((record) => <div className="v06-research-card" key={record.id}>
              <strong>T{record.acquiredTick} · {record.kind}</strong>
              <small>{record.subjectToken ?? 'No person reference'} · {record.source}</small>
              <small>Believed name: {record.believedIdentity ?? 'Unknown'} · confidence {record.confidence.toFixed(2)}</small>
            </div>)}
            {perceivedRisks.length > 0 && <p className="v06-scope">PERCEIVED PLACE RISK · SUBJECTIVE</p>}
            {perceivedRisks.map((risk) => <div className="v06-research-card"
              key={`${risk.ownerAgentId}:${risk.placeId}`}>
              <strong>{risk.placeId} · {risk.score.toFixed(2)}</strong>
              <small>Updated T{risk.lastUpdatedTick} from {risk.sourceObservationId}</small>
              <small>Personal observation state; route choice does not yet use this value.</small>
            </div>)}
          </div>}
          {tab === 'timeline' && <div className="v06-research-list">
            <p className="v06-scope">RECORDED HISTORY · OBJECTIVE / SUBJECTIVE</p>
            {timeline.length === 0 && <p className="v06-empty">No recorded events by this Tick.</p>}
            {timeline.slice(0, 50).map((item) => <button className="v06-timeline-row"
              key={item.id} onClick={() => {
                setPlaying(false); session.inspectTick(item.tick)
                if (item.episodeId) onSelectEncounter(item.episodeId)
              }}>
              <span>T{item.tick} · {item.label}</span><small>{item.scope} · INSPECT ↗</small>
            </button>)}
          </div>}
        </section>}
      </>}
    </aside>
    <div className="v06-topbar">
      <div><span className="eyebrow">SHADOW CITY / WORLD V2</span><h1>SHADOW <em>CITY</em></h1>
        <p>{session.getWorld().config.extentMm / 1000} × {session.getWorld().config.extentMm / 1000} m · multi-level urban laboratory</p></div>
      <a href="?world=legacy">OPEN LEGACY CITY ↗</a>
    </div>
    <div className="v06-world-controls">
      <label>LEVEL <select aria-label="Visible level" value={level}
        onChange={(event) => setLevel(event.target.value as typeof level)}>
        <option value="all">ALL</option><option value="L0">GROUND L0</option><option value="L1">UPPER L1</option>
      </select></label>
      <button onClick={() => setCutaway(!cutaway)}>{cutaway ? 'SHOW ROOF' : 'HIDE ROOF'}</button>
      <button onClick={() => setDebug(!debug)}>{debug ? 'HIDE NAV' : 'SHOW NAV'}</button>
      <button onClick={() => closeMall('bridge-entry')}>BRIDGE {snapshot.state.accessModes['bridge-entry'] === 'open' ? 'OPEN' : 'CLOSED'}</button>
      <button onClick={() => closeMall('mall-entry')}>GALLERIA {snapshot.state.accessModes['mall-entry'] === 'open' ? 'OPEN' : 'CLOSED'}</button>
    </div>
    <div className="v06-bottom">
      <div className="v06-timeline"><span>TICK {snapshot.tick} {snapshot.isInspecting ? `/ LIVE ${snapshot.liveTick}` : ''}</span>
        <input aria-label="Replay tick" type="range" min={0} max={snapshot.liveTick}
          value={snapshot.tick} onChange={(event) => {
            setPlaying(false); session.inspectTick(Number(event.target.value)) }} />
        {snapshot.isInspecting && <button onClick={() => session.returnLive()}>RETURN LIVE</button>}
      </div>
      <div className="v06-playback"><button onClick={() => setPlaying(!playing)}>{playing ? 'PAUSE' : 'PLAY'}</button>
        <button onClick={step}>STEP</button>
        <select aria-label="Simulation speed" value={speed}
          onChange={(event) => setSpeed(Number(event.target.value) as PlaybackSpeed)}>
          <option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
        </select>
        <select aria-label="Information view" value={mode}
          onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="observed">OBSERVED</option><option value="truth">TRUTH</option>
          <option value="compare">COMPARE</option>
        </select></div>
      <span>{mode === 'truth' ? `${snapshot.state.offences.length} TRUE EVENTS` :
        mode === 'compare' ? `${snapshot.state.offences.length} TRUE EVENTS · ${session.getObserverView().reports.length} REPORTS` :
          `${session.getObserverView().reports.length} REPORTS`}</span>
    </div>
  </>
}

export function MultiLevelApp() {
  const params = new URLSearchParams(window.location.search)
  const renderQuality = params.get('quality') === 'low' ? 'low' : 'high'
  const requestedLookDev = params.get('lookdev')
  const lookdev = requestedLookDev === 'baseline' || requestedLookDev === 'lighting' ||
    requestedLookDev === 'geometry' || requestedLookDev === 'clay' ? requestedLookDev : 'final'
  const postprocessing = params.get('post') !== 'off'
  const bloomEnabled = params.get('bloom') === 'on'
  const lighting = params.get('lighting') === 'day' ? 'day' : 'night'
  const castShadows = params.get('shadows') !== 'off'
  const ambientOcclusion = params.get('ao') === 'on'
  const toneMapping = params.get('tone') === 'aces' ? ACESFilmicToneMapping : AgXToneMapping
  const exposureParam = Number(params.get('exposure'))
  const exposure = Number.isFinite(exposureParam) && exposureParam >= 0.75 && exposureParam <= 2
    ? exposureParam : 1.2
  const prototype = params.get('world') === 'prototype'
  const seed = params.get('seed') || (prototype ? DEFAULT_WORLD_CONFIG_V2.seed :
    INTEGRATED_WORLD_CONFIG_V2.seed)
  const populationParam = Number(params.get('population') ?? DEFAULT_SIMULATION_CONFIG_V5.populationSize)
  const populationSize = Number.isSafeInteger(populationParam) && populationParam >= 0 && populationParam <= 200
    ? populationParam : DEFAULT_SIMULATION_CONFIG_V5.populationSize
  const world = useMemo(() => prototype ? generateWorldV2({ ...DEFAULT_WORLD_CONFIG_V2, seed }) :
    generateIntegratedWorld(seed), [prototype, seed])
  const session = useMemo(() => {
    const next = new SimulationSessionV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize, encounter: { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
        social: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.social,
          greetingWillingness: 0.7, conversationWillingness: 0.85,
          diagnosticTraces: true } } })
    for (let tick = 0; tick < 100; tick += 1) next.advanceOneTick()
    return next
  }, [populationSize, world])
  const cameraController = useMemo(createCameraController, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null)
  const [level, setLevel] = useState<'all' | 'L0' | 'L1'>('all')
  const [pickedSurfaceId, setPickedSurfaceId] = useState<string | null>(null)
  const [cutaway, setCutaway] = useState(false)
  const [debug, setDebug] = useState(false)
  const [mode, setMode] = useState<'truth' | 'observed' | 'compare'>('observed')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)
  const selectedIndoor = useSyncExternalStore(session.subscribe,
    () => Boolean(world.surfaces.find((surface) => surface.id ===
      session.getSnapshot().state.citizens.find((citizen) => citizen.id === selectedId)?.surfaceId)?.indoor))
  const scheduler = useMemo(() => new FixedStepScheduler(browserFrameHost(),
    () => session.advanceOneTick(), () => {}, { baseTicksPerSecond: 4 }), [session])
  useEffect(() => {
    if (playing) scheduler.play()
    else scheduler.pause()
    return () => scheduler.pause()
  }, [playing, scheduler])
  useEffect(() => { scheduler.setSpeed(speed) }, [scheduler, speed])
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const fixture = { advanceToTick(target: number) {
      const durations: number[] = []
      while (session.getSnapshot().liveTick < target) {
        const started = performance.now(); session.advanceOneTick(); durations.push(performance.now() - started)
      }
      return durations
    }, inspectTick: (tick: number) => session.inspectTick(tick),
      getSnapshot: () => session.getSnapshot(),
      getWorld: () => world, getObserverView: () => session.getObserverView(),
      getCameraView: () => cameraController.getSnapshot(),
      focusAtWorld: (x: number, y: number, z: number) => cameraController.focusAt([x, y, z]),
      inspectAtWorld: (x: number, y: number, z: number) => cameraController.inspectAt([x, y, z]),
      benchmarkReplay500() {
        const started = performance.now()
        const replay = new SimulationSessionV5(world, session.getConfig())
        for (let tick = 0; tick < 500; tick += 1) replay.advanceOneTick()
        return { durationMs: performance.now() - started,
          fingerprint: replay.getSnapshot().state.fingerprint,
          offences: replay.getSnapshot().state.offences.length }
      },
    }
    window.__shadowCityV06 = fixture
    return () => { if (window.__shadowCityV06 === fixture) delete window.__shadowCityV06 }
  }, [cameraController, session, world])
  const selectAgent = (id: string | null) => {
    setSelectedId(id)
    setSelectedEncounterId(null)
    if (id) setSidebarOpen(true)
  }
  const selectEncounter = (episodeId: string | null, tick?: number) => {
    setSelectedEncounterId(episodeId)
    if (episodeId) {
      setPlaying(false)
      const inspected = tick === undefined ? session.getSnapshot().state : session.inspectTick(tick)
      const episode = [...(inspected.social?.encounters.active ?? []),
        ...(inspected.social?.encounters.completed ?? [])]
        .find((item) => item.id === episodeId)
      if (episode) {
        const pair = episode.participantIds.map((id) => inspected.citizens.find((item) =>
          item.id === id))
        if (pair[0] && pair[1]) cameraController.inspectAt([
          (pair[0].position.x + pair[1].position.x) / 2000,
          (pair[0].position.y + pair[1].position.y) / 2000,
          (pair[0].position.z + pair[1].position.z) / 2000,
        ])
      }
    }
  }
  const step = () => {
    setPlaying(false)
    if (session.getSnapshot().isInspecting) session.returnLive()
    session.advanceOneTick()
  }
  useEffect(() => {
    const sidebar = document.querySelector('.v06-sidebar')
    if (!sidebar) return
    const observer = new ResizeObserver(() => setSidebarWidth(sidebar.getBoundingClientRect().width))
    observer.observe(sidebar)
    return () => observer.disconnect()
  }, [])
  return <main className="v06-app" style={{ '--v06-sidebar-width': `${sidebarWidth}px` } as CSSProperties}>
    <V5Panel session={session} selectedId={selectedId} onSelect={selectAgent}
      selectedEncounterId={selectedEncounterId} onSelectEncounter={selectEncounter}
      cameraController={cameraController} level={level} setLevel={setLevel}
      cutaway={cutaway} setCutaway={setCutaway} debug={debug} setDebug={setDebug}
      mode={mode} setMode={setMode} playing={playing} setPlaying={setPlaying}
      speed={speed} setSpeed={setSpeed} step={step} sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen} />
    <div className="v06-viewport">
      <Canvas orthographic camera={{ position: [245, 195, 245], near: 0.1, far: 1200, zoom: 1 }}
        dpr={renderQuality === 'low' ? 1 : [1, 1.5]} shadows="percentage"
        gl={{ antialias: true, powerPreference: 'high-performance', outputColorSpace: SRGBColorSpace,
          toneMapping, toneMappingExposure: exposure }}>
        <WorldCameraRig controller={cameraController} world={world} />
        <WorldSceneV2 world={world} level={level} cutaway={cutaway || selectedIndoor}
          quality={renderQuality} postprocessing={postprocessing} lighting={lighting}
          castShadows={castShadows} ambientOcclusion={ambientOcclusion} lookdev={lookdev}
          bloomEnabled={bloomEnabled}
          debugNavigation={debug} onPickSurface={(surfaceId) => {
            setPickedSurfaceId(surfaceId)
            const surface = world.surfaces.find((item) => item.id === surfaceId)
            if (surface?.indoor && (surface.levelId === 'L0' || surface.levelId === 'L1')) {
              setLevel(surface.levelId)
            }
          }} />
        <WorldAgentLayerV5 session={session} selectedId={selectedId} onSelect={selectAgent}
          playing={playing} ticksPerSecond={4 * speed} level={level} />
        <DynamicWorldOverlays session={session} selectedId={selectedId}
          selectedEncounterId={selectedEncounterId} level={level} mode={mode} />
      </Canvas>
      <div className="v06-vignette" />
      {pickedSurfaceId && <div className="v06-surface-chip" aria-label="Picked surface">
        SURFACE {pickedSurfaceId}
      </div>}
      <CameraControls controller={cameraController} />
    </div>
  </main>
}

declare global {
  interface Window {
    __shadowCityV06?: { advanceToTick(target: number): number[];
      inspectTick(tick: number): unknown; getSnapshot(): unknown;
      getWorld(): unknown; getObserverView(): unknown; getCameraView(): unknown;
      focusAtWorld(x: number, y: number, z: number): void;
      inspectAtWorld(x: number, y: number, z: number): void;
      benchmarkReplay500(): unknown }
  }
}
