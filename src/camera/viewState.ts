export type CameraTarget = readonly [x: number, y: number, z: number]

export interface CameraViewState {
  readonly target: CameraTarget
  /** Map bearing in degrees: 0 = north (-Z), 90 = east (+X). */
  readonly bearingDeg: number
  /** 0 = directly overhead; larger values approach the horizon. */
  readonly pitchDeg: number
  readonly zoomRatio: number
}

export const INITIAL_CAMERA_POSITION: CameraTarget = [188, 168, 188]
export const INITIAL_CAMERA_TARGET: CameraTarget = [0, 0, 0]
export const MIN_PITCH_DEG = 25
export const MAX_PITCH_DEG = 65
export const MIN_ZOOM_RATIO = 0.72
export const MAX_ZOOM_RATIO = 2.8
export const MAX_TARGET_OFFSET = 66

export function normalizeBearing(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0
  return ((degrees % 360) + 360) % 360
}

export function clampPitch(degrees: number): number {
  return Math.max(MIN_PITCH_DEG, Math.min(MAX_PITCH_DEG, degrees))
}

export function clampZoomRatio(ratio: number): number {
  return Math.max(MIN_ZOOM_RATIO, Math.min(MAX_ZOOM_RATIO, ratio))
}

export function bearingFromOffset(x: number, z: number): number {
  // Three.js azimuth is atan2(x, z); map bearing runs clockwise from north.
  return normalizeBearing(-Math.atan2(x, z) * 180 / Math.PI)
}

export function pitchFromOffset(x: number, y: number, z: number): number {
  return Math.atan2(Math.hypot(x, z), y) * 180 / Math.PI
}

export function offsetFromBearingPitch(
  bearingDeg: number,
  pitchDeg: number,
  radius: number,
): CameraTarget {
  const theta = -normalizeBearing(bearingDeg) * Math.PI / 180
  const phi = clampPitch(pitchDeg) * Math.PI / 180
  const horizontal = radius * Math.sin(phi)
  return [horizontal * Math.sin(theta), radius * Math.cos(phi), horizontal * Math.cos(theta)]
}

export const INITIAL_CAMERA_VIEW: CameraViewState = {
  target: INITIAL_CAMERA_TARGET,
  bearingDeg: bearingFromOffset(INITIAL_CAMERA_POSITION[0], INITIAL_CAMERA_POSITION[2]),
  pitchDeg: pitchFromOffset(...INITIAL_CAMERA_POSITION),
  zoomRatio: 1,
}
