import { useState, useSyncExternalStore, type FormEvent } from 'react'
import { type PlaybackController } from '../playback/PlaybackController'
import { type PlaybackSpeed } from '../playback/FixedStepScheduler'

interface SimulationControlsProps {
  controller: PlaybackController
}

const SPEEDS: readonly PlaybackSpeed[] = [1, 2, 4]

export function SimulationControls({ controller }: SimulationControlsProps) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const [targetTick, setTargetTick] = useState('')

  function jumpToTick(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (targetTick.trim() === '') return
    const parsed = Number(targetTick)
    if (!Number.isSafeInteger(parsed)) return
    controller.inspectTick(parsed)
  }

  const statusText = snapshot.isInspecting
    ? 'INSPECTING'
    : snapshot.status === 'playing'
      ? 'RUNNING'
      : snapshot.status === 'suspended'
        ? 'SUSPENDED'
        : 'PAUSED'

  return (
    <section className="simulation-controls" aria-label="Simulation controls">
      <div className="simulation-readout">
        <span className="simulation-kicker">SIMULATION / {statusText}</span>
        <span className="simulation-tick">
          TICK {snapshot.tick.toLocaleString('en-US')}
          {snapshot.isInspecting && <span className="simulation-live-tick"> / LIVE {snapshot.liveTick.toLocaleString('en-US')}</span>}
        </span>
        <span className="simulation-events">{snapshot.commandCount} probes submitted · {snapshot.eventCount} diagnostic events</span>
      </div>
      <div className="simulation-actions">
        <button
          type="button"
          onClick={() => snapshot.status === 'playing' ? controller.pause() : controller.play()}
          disabled={snapshot.isInspecting}
          aria-label={snapshot.status === 'playing' ? 'Pause' : 'Play'}
        >
          {snapshot.status === 'playing' ? 'PAUSE' : 'PLAY'}
        </button>
        <button type="button" onClick={() => controller.step()} disabled={snapshot.isInspecting} aria-label="Step">
          STEP
        </button>
        <button type="button" onClick={() => controller.reset()} aria-label="Reset Simulation">
          RESET SIM
        </button>
        <button
          type="button"
          onClick={() => controller.queueDiagnosticProbe()}
          disabled={snapshot.isInspecting}
          aria-label="Queue Diagnostic Probe"
          title="Queue a diagnostic probe; it samples one tick after the command is applied"
        >
          PROBE
        </button>
        <div className="simulation-speed" role="group" aria-label="Playback speed">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => controller.setSpeed(speed)}
              aria-label={`${speed}× speed`}
              aria-pressed={snapshot.speed === speed}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>
      <div className="simulation-navigation">
        <form onSubmit={jumpToTick}>
          <label htmlFor="simulation-jump-tick">TICK</label>
          <input
            id="simulation-jump-tick"
            aria-label="Tick to inspect"
            type="number"
            inputMode="numeric"
            min="0"
            max={snapshot.liveTick}
            step="1"
            value={targetTick}
            onChange={(event) => setTargetTick(event.target.value)}
            placeholder="0"
          />
          <button type="submit" aria-label="Jump to Tick">JUMP</button>
        </form>
        {snapshot.isInspecting && (
          <div className="simulation-inspection-actions">
            <button type="button" onClick={() => controller.inspectTick(snapshot.tick - 1)} disabled={snapshot.tick === 0} aria-label="Previous Tick">←</button>
            <button type="button" onClick={() => controller.inspectTick(snapshot.tick + 1)} disabled={snapshot.tick === snapshot.liveTick} aria-label="Next Tick">→</button>
            <button type="button" onClick={() => controller.returnLive()} aria-label="Return Live">RETURN LIVE</button>
          </div>
        )}
      </div>
      {snapshot.reason && <p className="simulation-notice" role="status">{snapshot.reason}</p>}
    </section>
  )
}
