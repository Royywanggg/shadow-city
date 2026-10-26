import {
  INITIAL_CAMERA_VIEW,
  normalizeBearing,
  type CameraTarget,
  type CameraViewState,
} from './viewState'

export interface CameraAdapter {
  setBearing(degrees: number): void
  setPitch(degrees: number): void
  setTarget(target: CameraTarget, preserveZoom?: boolean): void
  inspectTarget(target: CameraTarget): void
  exitInspectMode(): void
  cancelTarget(): void
  resetView(): void
}

export class CameraController {
  private snapshot: CameraViewState = INITIAL_CAMERA_VIEW
  private adapter: CameraAdapter | null = null
  private requestedBearing: number | null = null
  private followTarget: (() => CameraTarget | null) | null = null
  private inspectingCharacter = false
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): CameraViewState => this.snapshot
  getFollowing = (): boolean => this.followTarget !== null
  getInspectingCharacter = (): boolean => this.inspectingCharacter
  getFollowTarget = (): CameraTarget | null => this.followTarget?.() ?? null

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  bind(adapter: CameraAdapter): () => void {
    this.adapter = adapter
    return () => {
      if (this.adapter === adapter) this.adapter = null
    }
  }

  updateFromRig(next: CameraViewState): void {
    if (this.requestedBearing !== null) {
      const distance = Math.abs(((next.bearingDeg - this.requestedBearing + 540) % 360) - 180)
      if (distance < 0.05) this.requestedBearing = null
    }
    const previous = this.snapshot
    const targetChanged = next.target.some((value, index) => Math.abs(value - previous.target[index]) > 0.001)
    if (
      !targetChanged &&
      Math.abs(next.bearingDeg - previous.bearingDeg) < 0.01 &&
      Math.abs(next.pitchDeg - previous.pitchDeg) < 0.01 &&
      Math.abs(next.zoomRatio - previous.zoomRatio) < 0.0001
    ) return
    this.snapshot = next
    this.listeners.forEach((listener) => listener())
  }

  northUp(): void {
    this.requestedBearing = 0
    this.adapter?.setBearing(0)
  }

  rotateBy(degrees: number): void {
    const nextBearing = normalizeBearing((this.requestedBearing ?? this.snapshot.bearingDeg) + degrees)
    this.requestedBearing = nextBearing
    this.adapter?.setBearing(nextBearing)
  }

  beginDirectInteraction(): void {
    this.requestedBearing = null
    this.stopFollowing()
    this.adapter?.cancelTarget()
  }

  setPitch(degrees: number): void {
    this.adapter?.setPitch(degrees)
  }

  focusAt(target: CameraTarget): void {
    this.stopFollowing()
    this.exitInspectMode()
    this.adapter?.setTarget(target)
  }

  inspectAt(target: CameraTarget): void {
    this.stopFollowing()
    if (!this.inspectingCharacter) {
      this.inspectingCharacter = true
      this.listeners.forEach((listener) => listener())
    }
    this.adapter?.inspectTarget(target)
  }

  exitInspectMode(): void {
    if (!this.inspectingCharacter) return
    this.inspectingCharacter = false
    this.adapter?.exitInspectMode()
    this.listeners.forEach((listener) => listener())
  }

  follow(getTarget: () => CameraTarget | null): void {
    this.followTarget = getTarget
    const target = getTarget()
    if (target) this.adapter?.setTarget(target, true)
    this.listeners.forEach((listener) => listener())
  }

  stopFollowing(): void {
    if (!this.followTarget) return
    this.followTarget = null
    this.listeners.forEach((listener) => listener())
  }

  resetView(): void {
    this.requestedBearing = null
    this.stopFollowing()
    this.exitInspectMode()
    this.adapter?.cancelTarget()
    this.adapter?.resetView()
  }
}

export function createCameraController(): CameraController {
  return new CameraController()
}
