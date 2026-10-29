import { MapControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { OrthographicCamera, TOUCH } from 'three'
import type { MapControls as MapControlsType } from 'three-stdlib'
import type { CameraController } from '../camera/cameraController'
import { INITIAL_CAMERA_POSITION, INITIAL_CAMERA_TARGET } from '../camera/viewState'
import type { WorldModelV2 } from '../world/model'
import { bearingFromOffset, clampPitch, MAX_PITCH_DEG, MIN_PITCH_DEG, normalizeBearing,
  pitchFromOffset, type CameraTarget } from '../camera/viewState'

const HOME_POSITION: CameraTarget = [245, 195, 245]
const HOME_TARGET: CameraTarget = [15, 0, 0]
const TOUCH_MAPPING = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }

export function WorldCameraRig({ controller, world }: { controller: CameraController; world: WorldModelV2 }) {
  const { camera, size, invalidate } = useThree()
  const controls = useRef<MapControlsType>(null)
  const previousBaseZoom = useRef(0)
  const tracking = useRef<CameraTarget | null>(null)
  const wantedZoom = useRef<number | null>(null)
  const integrated = Boolean(world.baseCity && !world.terrain)
  const diagnosticStreetPitch = new URLSearchParams(window.location.search)
    .get('cameraDiagnostic') === 'street'
  const homePosition = integrated ? INITIAL_CAMERA_POSITION : HOME_POSITION
  const homeTarget = integrated ? INITIAL_CAMERA_TARGET : HOME_TARGET
  const half = world.config.extentMm / 2000
  const baseZoom = integrated ? Math.min(size.width / (world.baseCity!.size * 1.53),
    size.height / (world.baseCity!.size * 1.11)) :
    world.terrain ? Math.min(size.width / 425, size.height / 350) :
      Math.min(size.width / 500, size.height / 390)
  const publish = useCallback(() => {
    if (!controls.current) return
    const target = controls.current.target
    const dx = camera.position.x - target.x
    const dy = camera.position.y - target.y
    const dz = camera.position.z - target.z
    controller.updateFromRig({ target: [target.x, target.y, target.z],
      bearingDeg: bearingFromOffset(dx, dz), pitchDeg: pitchFromOffset(dx, dy, dz),
      zoomRatio: camera.zoom / baseZoom })
  }, [baseZoom, camera, controller])
  const clampTarget = useCallback((target: CameraTarget): CameraTarget => [
    Math.max(-half - 10, Math.min(half + 10, target[0])), Math.max(0, Math.min(42, target[1])),
    Math.max(-half - 10, Math.min(half + 10, target[2])),
  ], [half])
  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return
    const previous = previousBaseZoom.current
    camera.zoom = previous > 0 ? baseZoom * camera.zoom / previous : baseZoom
    if (previous === 0) {
      camera.position.set(...homePosition)
      camera.lookAt(...homeTarget)
      controls.current?.target.set(...homeTarget)
    }
    previousBaseZoom.current = baseZoom
    camera.updateProjectionMatrix()
    controls.current?.update()
    publish()
    invalidate()
  }, [camera, invalidate, publish, baseZoom, homePosition, homeTarget])
  useLayoutEffect(() => {
    const control = controls.current
    if (!control) return
    const setTarget = (target: CameraTarget, preserveZoom = false) => {
      tracking.current = clampTarget(target)
      if (!preserveZoom) wantedZoom.current = Math.max(camera.zoom, baseZoom * 3.6)
      invalidate()
    }
    const flushDamping = () => {
      const target = control.target.clone()
      const position = camera.position.clone()
      const damping = control.enableDamping
      control.enableDamping = false
      control.update()
      control.target.copy(target)
      camera.position.copy(position)
      camera.lookAt(target)
      control.update()
      return damping
    }
    const setBearing = (degrees: number) => {
      const damping = flushDamping()
      control.setAzimuthalAngle(-normalizeBearing(degrees) * Math.PI / 180)
      control.update(); control.enableDamping = damping; publish(); invalidate()
    }
    const setPitch = (degrees: number) => {
      const damping = flushDamping()
      control.setPolarAngle(clampPitch(degrees) * Math.PI / 180)
      control.update(); control.enableDamping = damping; publish(); invalidate()
    }
    const resetView = () => {
      tracking.current = null
      wantedZoom.current = null
      control.target.set(...homeTarget)
      camera.position.set(...homePosition)
      camera.zoom = baseZoom
      camera.lookAt(control.target)
      camera.updateProjectionMatrix()
      control.update(); publish(); invalidate()
    }
    return controller.bind({ setBearing, setPitch, setTarget,
      inspectTarget: (target) => { setTarget(target, false); wantedZoom.current = baseZoom * 8 },
      exitInspectMode: () => { wantedZoom.current = baseZoom * 4 },
      cancelTarget: () => { tracking.current = null; wantedZoom.current = null }, resetView })
  }, [baseZoom, camera, clampTarget, controller, homePosition, homeTarget, invalidate, publish])
  useFrame((_, delta) => {
    const control = controls.current
    if (!control) return
    if (controller.getFollowing()) tracking.current = controller.getFollowTarget()
    if (!tracking.current && wantedZoom.current === null) return
    const target = clampTarget(tracking.current ?? [control.target.x, control.target.y, control.target.z])
    const dx = target[0] - control.target.x
    const dy = target[1] - control.target.y
    const dz = target[2] - control.target.z
    const alpha = 1 - Math.exp(-Math.min(delta, 0.1) * 7)
    control.target.x += dx * alpha
    control.target.y += dy * alpha
    control.target.z += dz * alpha
    camera.position.x += dx * alpha
    camera.position.y += dy * alpha
    camera.position.z += dz * alpha
    if (wantedZoom.current !== null && camera instanceof OrthographicCamera) {
      camera.zoom += (wantedZoom.current - camera.zoom) * alpha
      camera.updateProjectionMatrix()
    }
    control.update(); publish(); invalidate()
    if (!controller.getFollowing() && Math.hypot(dx, dy, dz) < 0.02 &&
      (wantedZoom.current === null || Math.abs(camera.zoom - wantedZoom.current) < 0.01)) {
      tracking.current = null; wantedZoom.current = null
    }
  })
  const onChange = useCallback(() => {
    const control = controls.current
    if (!control) return
    const clamped = clampTarget([control.target.x, control.target.y, control.target.z])
    const dx = clamped[0] - control.target.x
    const dy = clamped[1] - control.target.y
    const dz = clamped[2] - control.target.z
    control.target.set(...clamped)
    camera.position.x += dx; camera.position.y += dy; camera.position.z += dz
    publish()
  }, [camera, clampTarget, publish])
  const unused = useMemo(() => 0, [])
  void unused
  return <MapControls ref={controls} makeDefault enableRotate enableDamping dampingFactor={0.085}
    rotateSpeed={0.7} screenSpacePanning={false} touches={TOUCH_MAPPING}
    minPolarAngle={MIN_PITCH_DEG * Math.PI / 180}
    maxPolarAngle={(diagnosticStreetPitch ? 82 : MAX_PITCH_DEG) * Math.PI / 180}
    minZoom={baseZoom * 0.48} maxZoom={baseZoom * 9}
    onStart={() => controller.beginDirectInteraction()} onChange={onChange} />
}
