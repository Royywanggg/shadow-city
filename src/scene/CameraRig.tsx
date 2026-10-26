import { MapControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { OrthographicCamera, TOUCH, Vector3 } from 'three'
import type { MapControls as MapControlsType } from 'three-stdlib'
import { createCameraController, type CameraController } from '../camera/cameraController'
import type { CityModel } from '../city/model'
import {
  bearingFromOffset,
  clampCityCameraTarget,
  clampPitch,
  INITIAL_CAMERA_POSITION,
  INITIAL_CAMERA_TARGET,
  MAX_INSPECT_ZOOM_RATIO,
  MAX_PITCH_DEG,
  MAX_ZOOM_RATIO,
  MIN_PITCH_DEG,
  MIN_ZOOM_RATIO,
  normalizeBearing,
  pitchFromOffset,
  type CameraTarget,
} from '../camera/viewState'

const TOUCH_MAPPING = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }

export function CameraRig({
  resetToken = 0,
  controller: suppliedController,
  city,
}: {
  resetToken?: number
  controller?: CameraController
  city: CityModel
}) {
  const fallbackController = useMemo(createCameraController, [])
  const controller = suppliedController ?? fallbackController
  const { camera, size, invalidate } = useThree()
  const controlsRef = useRef<MapControlsType>(null)
  const previousBaseZoom = useRef(0)
  const previousResetToken = useRef(resetToken)
  const trackingTarget = useRef<CameraTarget | null>(null)
  const trackingZoom = useRef<number | null>(null)
  const [inspectMode, setInspectMode] = useState(false)
  const baseZoom = Math.min(size.width / 325, size.height / 235)
  const focusPoints = useMemo(() => {
    const half = city.size / 2
    const points = [
      new Vector3(-half, -3, -half), new Vector3(-half, -3, half),
      new Vector3(half, -3, -half), new Vector3(half, -3, half),
    ]
    for (const building of city.buildings) {
      for (const mass of building.masses) {
        const y = mass.baseY + mass.height
        for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) {
          points.push(new Vector3(building.x + mass.offsetX + mass.width * dx, y,
            building.z + mass.offsetZ + mass.depth * dz))
        }
      }
    }
    return points
  }, [city])

  const publishView = useCallback(() => {
    const controls = controlsRef.current
    if (!controls) return
    const offsetX = camera.position.x - controls.target.x
    const offsetY = camera.position.y - controls.target.y
    const offsetZ = camera.position.z - controls.target.z
    controller.updateFromRig({
      target: [controls.target.x, controls.target.y, controls.target.z],
      bearingDeg: bearingFromOffset(offsetX, offsetZ),
      pitchDeg: pitchFromOffset(offsetX, offsetY, offsetZ),
      zoomRatio: baseZoom > 0 ? camera.zoom / baseZoom : 1,
    })
  }, [baseZoom, camera, controller])

  const keepCityInView = useCallback(() => {
    const controls = controlsRef.current
    if (!controls) return
    const [x, , z] = clampCityCameraTarget([controls.target.x, 0, controls.target.z], city.size)
    const dx = x - controls.target.x
    const dy = -controls.target.y
    const dz = z - controls.target.z
    if (dx !== 0 || dy !== 0 || dz !== 0) {
      controls.target.set(x, 0, z)
      camera.position.x += dx
      camera.position.y += dy
      camera.position.z += dz
      camera.updateMatrixWorld()
      invalidate()
    }
    publishView()
  }, [camera, city.size, invalidate, publishView])

  useLayoutEffect(() => {
    const controls = controlsRef.current
    const oldBase = previousBaseZoom.current
    const relativeZoom = oldBase > 0 ? camera.zoom / oldBase : 1
    camera.zoom = baseZoom * Math.max(MIN_ZOOM_RATIO,
      Math.min(inspectMode ? MAX_INSPECT_ZOOM_RATIO : MAX_ZOOM_RATIO, relativeZoom))
    camera.updateProjectionMatrix()
    previousBaseZoom.current = baseZoom
    controls?.update()
    publishView()
    invalidate()
  }, [baseZoom, camera, invalidate, publishView])

  useLayoutEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const clearDampingAtCurrentPose = () => {
      const target = controls.target.clone()
      const position = camera.position.clone()
      const damping = controls.enableDamping
      controls.enableDamping = false
      controls.update()
      controls.target.copy(target)
      camera.position.copy(position)
      camera.lookAt(target)
      controls.update()
      return damping
    }
    const setBearing = (degrees: number) => {
      // Apply discrete UI and keyboard headings exactly; drag rotation retains damping.
      const pivot = controls.target.clone()
      const damping = clearDampingAtCurrentPose()
      controls.setAzimuthalAngle(-normalizeBearing(degrees) * Math.PI / 180)
      camera.position.add(pivot.clone().sub(controls.target))
      controls.target.copy(pivot)
      controls.update()
      controls.enableDamping = damping
      publishView()
      invalidate()
    }
    const setPitch = (degrees: number) => {
      // Range input should track the selected angle exactly while dragging.
      const pivot = controls.target.clone()
      const damping = clearDampingAtCurrentPose()
      controls.setPolarAngle(clampPitch(degrees) * Math.PI / 180)
      camera.position.add(pivot.clone().sub(controls.target))
      controls.target.copy(pivot)
      controls.update()
      controls.enableDamping = damping
      publishView()
      invalidate()
    }
    const setTarget = (target: CameraTarget, preserveZoom = false) => {
      if (preserveZoom) {
        trackingTarget.current = clampCityCameraTarget(target, city.size)
        trackingZoom.current = null
        invalidate()
        return
      }
      const controlsTarget = controls.target
      if (!(camera instanceof OrthographicCamera)) {
        trackingTarget.current = target
        invalidate()
        return
      }
      const sidebar = document.querySelector('.population-sidebar:not(.is-collapsed)')?.getBoundingClientRect()
      const experiment = document.querySelector('.experiment-panel')?.getBoundingClientRect()
      const simulation = document.querySelector('.simulation-controls')?.getBoundingClientRect()
      const safeLeft = Math.min(size.width * 0.48, (sidebar?.right ?? 0) + 24)
      const safeRight = Math.max(size.width * 0.52, (experiment?.left ?? size.width) - 24)
      const safeTop = Math.min(size.height * 0.4, 178)
      const safeBottom = Math.max(size.height * 0.6, (simulation?.top ?? size.height) - 24)
      const desiredX = (safeLeft + safeRight) / 2
      const desiredY = (safeTop + safeBottom) / 2
      camera.updateMatrixWorld()
      const rightX = camera.matrixWorld.elements[0]
      const rightZ = camera.matrixWorld.elements[2]
      const horizontalShift = (desiredX - size.width / 2) / camera.zoom
      const destinationX = target[0] - rightX * horizontalShift
      const destinationZ = target[2] - rightZ * horizontalShift
      const candidateCamera = camera.clone()
      const originalTarget = controlsTarget.clone()
      const point = new Vector3()
      let bestScore = Number.POSITIVE_INFINITY
      let bestTarget: CameraTarget = [target[0], 0, target[2]]
      let bestZoom = camera.zoom
      for (const scale of [1.12, 1.06, 1, 0.94, 0.88]) {
        const zoom = Math.max(baseZoom * MIN_ZOOM_RATIO,
          Math.min(baseZoom * MAX_ZOOM_RATIO, camera.zoom * scale))
        candidateCamera.zoom = zoom
        candidateCamera.updateProjectionMatrix()
        for (let step = 0; step <= 10; step += 1) {
          const amount = step / 10
          const [x, , z] = clampCityCameraTarget([
            originalTarget.x + (destinationX - originalTarget.x) * amount, 0,
            originalTarget.z + (destinationZ - originalTarget.z) * amount,
          ], city.size)
          const candidateTarget = new Vector3(x, 0, z)
          candidateCamera.position.copy(camera.position).add(candidateTarget.clone().sub(originalTarget))
          candidateCamera.lookAt(candidateTarget)
          candidateCamera.updateMatrixWorld()
          let cityTop = Number.POSITIVE_INFINITY
          let cityBottom = Number.NEGATIVE_INFINITY
          for (const cityPoint of focusPoints) {
            point.copy(cityPoint).project(candidateCamera)
            const pixelY = (1 - point.y) * size.height / 2
            cityTop = Math.min(cityTop, pixelY)
            cityBottom = Math.max(cityBottom, pixelY)
          }
          point.set(...target).project(candidateCamera)
          const subjectX = (point.x + 1) * size.width / 2
          const subjectY = (1 - point.y) * size.height / 2
          const outsideX = Math.max(0, safeLeft - subjectX, subjectX - safeRight)
          const outsideY = Math.max(0, safeTop - subjectY, subjectY - safeBottom)
          const cityClip = Math.max(0, 20 - cityTop) * 12 +
            Math.max(0, cityBottom - (size.height - 105)) * 8
          const subjectOffset = Math.hypot((subjectX - desiredX) * 0.4, (subjectY - desiredY) * 0.75)
          const score = cityClip + 18 * (outsideX + outsideY) + subjectOffset +
            Math.abs(zoom / camera.zoom - 1.06) * 95
          if (score < bestScore) {
            bestScore = score
            bestTarget = [x, 0, z]
            bestZoom = zoom
          }
        }
      }
      trackingTarget.current = bestTarget
      trackingZoom.current = bestZoom
      invalidate()
    }
    const cancelTarget = () => {
      trackingTarget.current = null
      trackingZoom.current = null
    }
    const inspectTarget = (target: CameraTarget) => {
      trackingTarget.current = clampCityCameraTarget(target, city.size)
      trackingZoom.current = baseZoom * MAX_INSPECT_ZOOM_RATIO
      setInspectMode(true)
      invalidate()
    }
    const exitInspectMode = () => {
      setInspectMode(false)
      if (camera.zoom <= baseZoom * MAX_ZOOM_RATIO) return
      trackingTarget.current = [controls.target.x, 0, controls.target.z]
      trackingZoom.current = baseZoom * MAX_ZOOM_RATIO
      invalidate()
    }
    const resetView = () => {
      // Flush any leftover damping before restoring the exact hero pose.
      const damping = controls.enableDamping
      controls.enableDamping = false
      controls.update()
      trackingTarget.current = null
      trackingZoom.current = null
      setInspectMode(false)
      controls.target.set(...INITIAL_CAMERA_TARGET)
      camera.position.set(...INITIAL_CAMERA_POSITION)
      camera.zoom = baseZoom
      camera.lookAt(controls.target)
      camera.updateProjectionMatrix()
      controls.update()
      controls.enableDamping = damping
      publishView()
      invalidate()
    }
    const unbind = controller.bind({ setBearing, setPitch, setTarget, inspectTarget,
      exitInspectMode, cancelTarget, resetView })
    publishView()
    return unbind
  }, [baseZoom, camera, city.size, controller, focusPoints, invalidate, publishView, size.height, size.width])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    if (!controls) return
    const following = controller.getFollowing()
    if (following) trackingTarget.current = controller.getFollowTarget()
    const target = trackingTarget.current
    if (!target) return
    const desiredZoom = trackingZoom.current
    const [x, , z] = clampCityCameraTarget(target, city.size)
    const dx = x - controls.target.x
    const dz = z - controls.target.z
    if (Math.hypot(dx, dz) < 0.02 && (desiredZoom === null || Math.abs(desiredZoom - camera.zoom) < 0.005)) {
      if (!following) {
        trackingTarget.current = null
        trackingZoom.current = null
      }
      return
    }
    const step = 1 - Math.exp(-Math.min(delta, 0.25) * 9)
    const moveX = dx * step
    const moveZ = dz * step
    controls.target.x += moveX
    controls.target.z += moveZ
    camera.position.x += moveX
    camera.position.z += moveZ
    if (desiredZoom !== null && camera instanceof OrthographicCamera) {
      camera.zoom += (desiredZoom - camera.zoom) * step
      camera.updateProjectionMatrix()
    }
    controls.update()
    publishView()
    invalidate()
  })

  useLayoutEffect(() => {
    if (previousResetToken.current === resetToken) return
    previousResetToken.current = resetToken
    controller.resetView()
  }, [controller, resetToken])

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]')) return
      switch (event.key.toLowerCase()) {
        case 'q':
          controller.rotateBy(-15)
          break
        case 'e':
          controller.rotateBy(15)
          break
        case 'r':
          controller.resetView()
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [controller])

  return (
    <MapControls
      ref={controlsRef}
      makeDefault
      enableRotate
      enableDamping
      dampingFactor={0.085}
      rotateSpeed={0.7}
      screenSpacePanning={false}
      minPolarAngle={MIN_PITCH_DEG * Math.PI / 180}
      maxPolarAngle={MAX_PITCH_DEG * Math.PI / 180}
      minZoom={baseZoom * MIN_ZOOM_RATIO}
      maxZoom={baseZoom * (inspectMode ? MAX_INSPECT_ZOOM_RATIO : MAX_ZOOM_RATIO)}
      touches={TOUCH_MAPPING}
      onStart={() => controller.beginDirectInteraction()}
      onChange={keepCityInView}
    />
  )
}
