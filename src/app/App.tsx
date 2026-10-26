import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { CameraControls } from './CameraControls'
import { AgentInspector } from './AgentInspector'
import {
  ObservedExperimentPanel,
  ObservedIncidentScene,
  ResearchExperimentPanel,
  ResearchIncidentScene,
} from './ExperimentSurface'
import type { ObservationMode, ReportingScenarioId } from './ExperimentControls'
import { SimulationControls } from './SimulationControls'
import { createAgentSelectionController } from './agentSelection'
import { createCameraController } from '../camera/cameraController'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { PlaybackController } from '../playback/PlaybackController'
import { CityScene } from '../scene/CityScene'
import { AgentLayer } from '../scene/AgentLayer'
import { SimulationSession } from '../simulation/session'
import { DEFAULT_SIMULATION_CONFIG, type SimulationConfig } from '../simulation/types'
import { DEFAULT_V3_SCENARIO_CONFIG, V04_REVIEW_SCENARIO_CONFIG } from '../simulation/v3Types'
import './styles.css'

declare global {
  interface Window {
    __shadowCityV03?: {
      advanceToTick(targetTick: number): number[]
      getSnapshot(): ReturnType<SimulationSession['getSnapshot']>
      getEvents(): ReturnType<SimulationSession['getEventHistory']>
    }
    __shadowCityV04?: {
      advanceToTick(targetTick: number): number[]
      inspectTick(targetTick: number): number
      returnLive(): void
      getPublicSnapshot(): {
        tick: number
        liveTick: number
        isInspecting: boolean
        availableReportCount: number
      }
    }
  }
}

const REPORTING_PROBABILITIES: Readonly<Record<ReportingScenarioId, number>> = {
  A: 0.3,
  B: 0.6,
  C: 0.9,
}

export function App() {
  const parameters = new URLSearchParams(window.location.search)
  const seed = parameters.get('seed') || HERO_SEED
  const modelV2 = parameters.get('model') === 'v2'
  const reviewScenario = parameters.get('review') === '1'
  const testHarness = parameters.get('test') === '1'
  const requestedScenario = parameters.get('scenario')
  const [scenario, setScenario] = useState<ReportingScenarioId>(
    requestedScenario === 'A' || requestedScenario === 'C' ? requestedScenario : 'B',
  )
  const [observationMode, setObservationMode] = useState<ObservationMode>('observed')
  const populationParameter = parameters.get('population')
  const requestedPopulation = populationParameter === null ? DEFAULT_SIMULATION_CONFIG.populationSize : Number(populationParameter)
  const populationSize = populationParameter !== '' && Number.isSafeInteger(requestedPopulation) &&
    requestedPopulation >= 0 && requestedPopulation <= 200 ? requestedPopulation : DEFAULT_SIMULATION_CONFIG.populationSize
  const city = useMemo(() => generateCity(seed), [seed])
  const cameraController = useMemo(createCameraController, [])
  const agentSelection = useMemo(createAgentSelectionController, [])
  const simulationConfig = useMemo<SimulationConfig>(() => {
    if (modelV2) return { ...DEFAULT_SIMULATION_CONFIG, populationSize }
    const base = reviewScenario ? V04_REVIEW_SCENARIO_CONFIG : DEFAULT_V3_SCENARIO_CONFIG
    return {
      version: 3,
      citizen: { ...base.citizen, populationSize },
      incident: base.incident,
      observation: { ...base.observation, globalProbability: REPORTING_PROBABILITIES[scenario] },
    }
  }, [modelV2, populationSize, reviewScenario, scenario])
  const simulationSession = useMemo(() => new SimulationSession(city, simulationConfig), [city, simulationConfig])
  const playbackController = useMemo(() => new PlaybackController(simulationSession), [simulationSession])
  const observerPort = useMemo(() => modelV2 ? null : simulationSession.createObserverPort(), [modelV2, simulationSession])

  useEffect(() => playbackController.connect(), [playbackController])

  useEffect(() => {
    if (!import.meta.env.DEV || !modelV2) return
    const fixture = {
      advanceToTick(targetTick: number) {
        const currentTick = simulationSession.getSnapshot().liveTick
        if (!Number.isSafeInteger(targetTick) || targetTick < currentTick || targetTick > 1_000) {
          throw new Error('Development fixture target must be a future tick at most 1000')
        }
        const durations: number[] = []
        while (simulationSession.getSnapshot().liveTick < targetTick) {
          const startedAt = performance.now()
          simulationSession.advanceOneTick()
          durations.push(performance.now() - startedAt)
        }
        return durations
      },
      getSnapshot: () => simulationSession.getSnapshot(),
      getEvents: () => simulationSession.getEventHistory(),
    }
    window.__shadowCityV03 = fixture
    return () => {
      if (window.__shadowCityV03 === fixture) delete window.__shadowCityV03
    }
  }, [modelV2, simulationSession])

  useEffect(() => {
    if (!import.meta.env.DEV || modelV2 || !testHarness) return
    const fixture = {
      advanceToTick(targetTick: number) {
        const currentTick = simulationSession.getSnapshot().liveTick
        if (!Number.isSafeInteger(targetTick) || targetTick < currentTick || targetTick > 1_000 ||
            simulationSession.getSnapshot().isInspecting) {
          throw new Error('Development fixture target must be a live future tick at most 1000')
        }
        const durations: number[] = []
        while (simulationSession.getSnapshot().liveTick < targetTick) {
          const startedAt = performance.now()
          simulationSession.advanceOneTick()
          durations.push(performance.now() - startedAt)
        }
        return durations
      },
      inspectTick(targetTick: number) {
        const startedAt = performance.now()
        simulationSession.inspectTick(targetTick)
        return performance.now() - startedAt
      },
      returnLive: () => simulationSession.returnLive(),
      getPublicSnapshot() {
        const snapshot = simulationSession.getSnapshot()
        return {
          tick: snapshot.tick,
          liveTick: snapshot.liveTick,
          isInspecting: snapshot.isInspecting,
          availableReportCount: observerPort!.getView().availableReportCount,
        }
      },
    }
    window.__shadowCityV04 = fixture
    return () => {
      if (window.__shadowCityV04 === fixture) delete window.__shadowCityV04
    }
  }, [modelV2, observerPort, simulationSession, testHarness])

  const changeScenario = (next: ReportingScenarioId) => {
    if (next === scenario) return
    playbackController.pause()
    agentSelection.select(null)
    setScenario(next)
  }

  return (
    <main className="experience" aria-label="Shadow City interactive city">
      <Canvas
        orthographic
        camera={{ position: [188, 168, 188], near: 0.1, far: 1000, zoom: 1 }}
        dpr={[1, 1.7]}
        shadows="percentage"
        frameloop="demand"
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        fallback={<div className="canvas-fallback">This city needs a browser with WebGL support.</div>}
      >
        <CityScene city={city} cameraController={cameraController} />
        <AgentLayer
          session={simulationSession}
          playback={playbackController}
          selection={agentSelection}
          graph={city.pedestrian}
        />
        {observerPort && (observationMode === 'observed'
          ? <ObservedIncidentScene port={observerPort} />
          : <ResearchIncidentScene session={simulationSession} port={observerPort} mode={observationMode} />)}
      </Canvas>
      <div className="scene-vignette" aria-hidden="true" />
      <header className="masthead">
        <span className="eyebrow">A LIVING CITY, IN THE MAKING</span>
        <h1>SHADOW <span>CITY</span></h1>
        <p>A procedural urban miniature after dark.</p>
      </header>
      <CameraControls controller={cameraController} />
      <SimulationControls controller={playbackController} populationSize={populationSize}
        observerPort={observerPort ?? undefined} />
      <AgentInspector session={simulationSession} selection={agentSelection} graph={city.pedestrian} />
      {observerPort && (observationMode === 'observed'
        ? <ObservedExperimentPanel port={observerPort} scenario={scenario}
            onModeChange={setObservationMode} onScenarioChange={changeScenario} />
        : <ResearchExperimentPanel session={simulationSession} port={observerPort} mode={observationMode}
            scenario={scenario} onModeChange={setObservationMode} onScenarioChange={changeScenario} />)}
      <div className="scene-meta" aria-label={`City seed ${seed}`}>
        <span className="meta-rule" />
        <span>FIELD STUDY 001</span>
        <span className="meta-divider">/</span>
        <span>SEED {seed.toUpperCase()}</span>
      </div>
      <p className="interaction-hint">DRAG TO PAN <span>·</span> RIGHT DRAG TO ROTATE <span>·</span> SCROLL TO ZOOM</p>
    </main>
  )
}
