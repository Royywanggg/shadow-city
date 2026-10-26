import { MapControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { TOUCH } from 'three'
import type { MapControls as MapControlsType } from 'three-stdlib'
import { createCameraController, type CameraController } from '../camera/cameraController'
import {
  bearingFromOffset,
  clampPitch,
  INITIAL_CAMERA_POSITION,
  INITIAL_CAMERA_TARGET,
  MAX_PITCH_DEG,
  MAX_TARGET_OFFSET,
  MAX_ZOOM_RATIO,
  MIN_PITCH_DEG,
  MIN_ZOOM_RATIO,
  normalizeBearing,
  pitchFromOffset,
} from '../camera/viewState'

const TOUCH_MAPPING = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }

export function CameraRig({
  resetToken = 0,
  controller: suppliedController,
}: {
  resetToken?: number
  controller?: CameraController
}) {
  const fallbackController = useMemo(createCameraController, [])
  const controller = suppliedController ?? fallbackController
  const { camera, size, invalidate } = useThree()
  const controlsRef = useRef<MapControlsType>(null)
  const previousBaseZoom = useRef(0)
  const previousResetToken = useRef(resetToken)
  const baseZoom = Math.min(size.width / 325, size.height / 235)

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
    const x = Math.max(-MAX_TARGET_OFFSET, Math.min(MAX_TARGET_OFFSET, controls.target.x))
    const z = Math.max(-MAX_TARGET_OFFSET, Math.min(MAX_TARGET_OFFSET, controls.target.z))
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
  }, [camera, invalidate, publishView])

  useLayoutEffect(() => {
    const controls = controlsRef.current
    const oldBase = previousBaseZoom.current
    const relativeZoom = oldBase > 0 ? camera.zoom / oldBase : 1
    camera.zoom = baseZoom * Math.max(MIN_ZOOM_RATIO, Math.min(MAX_ZOOM_RATIO, relativeZoom))
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
    const resetView = () => {
      // Flush any leftover damping before restoring the exact hero pose.
      const damping = controls.enableDamping
      controls.enableDamping = false
      controls.update()
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
    const unbind = controller.bind({ setBearing, setPitch, resetView })
    publishView()
    return unbind
  }, [baseZoom, camera, controller, invalidate, publishView])

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
      maxZoom={baseZoom * MAX_ZOOM_RATIO}
      touches={TOUCH_MAPPING}
      onStart={() => controller.beginDirectInteraction()}
      onChange={keepCityInView}
    />
  )
}
