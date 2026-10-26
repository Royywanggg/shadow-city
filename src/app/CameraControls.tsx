import { useSyncExternalStore } from 'react'
import type { CameraController } from '../camera/cameraController'
import { MAX_PITCH_DEG, MIN_PITCH_DEG } from '../camera/viewState'

export function CameraControls({ controller }: { controller: CameraController }) {
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const bearing = Math.round(view.bearingDeg) % 360
  const pitch = Math.round(view.pitchDeg)

  return (
    <nav
      className="camera-controls"
      aria-label="Camera navigation"
      data-target-x={view.target[0].toFixed(3)}
      data-target-y={view.target[1].toFixed(3)}
      data-target-z={view.target[2].toFixed(3)}
      data-zoom-ratio={view.zoomRatio.toFixed(4)}
    >
      <button
        className="camera-compass"
        type="button"
        aria-label="Compass: north up"
        title="North up"
        onClick={() => controller.northUp()}
      >
        <span className="camera-compass-needle" style={{ transform: `rotate(${-view.bearingDeg}deg)` }} aria-hidden="true">N</span>
      </button>
      <div className="camera-bearing" aria-live="off">
        <span className="camera-control-label">BEARING</span>
        <output aria-label="Bearing" data-testid="camera-bearing-value">{bearing}°</output>
      </div>
      <div className="camera-rotate" role="group" aria-label="Rotate camera">
        <button type="button" aria-label="Rotate left 15 degrees" title="Rotate left (Q)" onClick={() => controller.rotateBy(-15)}>−</button>
        <button type="button" aria-label="Rotate right 15 degrees" title="Rotate right (E)" onClick={() => controller.rotateBy(15)}>+</button>
      </div>
      <label className="camera-pitch">
        <span className="camera-control-label">PITCH <output>{pitch}°</output></span>
        <input
          type="range"
          aria-label="Pitch control"
          min={MIN_PITCH_DEG}
          max={MAX_PITCH_DEG}
          value={pitch}
          onChange={(event) => controller.setPitch(Number(event.currentTarget.value))}
        />
      </label>
      <button className="camera-reset" type="button" onClick={() => controller.resetView()}>
        RESET VIEW <span aria-hidden="true">↗</span>
      </button>
    </nav>
  )
}
