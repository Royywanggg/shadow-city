import { AmbientLight, AnimationMixer, Box3, DirectionalLight, Group, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { loadCharacterAssets } from './CharacterManager'

/** Build small, transparent sprites from the licensed source rigs for the far tier. */
export async function bakeCharacterImpostors(): Promise<readonly { presetId: string; dataUrl: string }[]> {
  const assets = await loadCharacterAssets()
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(128, 256, false)
  renderer.setClearColor('#000000', 0)
  const camera = new OrthographicCamera(-0.575, 0.575, 1.15, -1.15, 0.1, 20)
  const scene = new Scene()
  scene.add(new AmbientLight('#bed1dd', 2.0))
  const key = new DirectionalLight('#fff2d6', 2.5)
  key.position.set(2, 5, 4)
  scene.add(key)
  const rim = new DirectionalLight('#7bb4c2', 1.2)
  rim.position.set(-3, 3, -2)
  scene.add(rim)
  const output: { presetId: string; dataUrl: string }[] = []
  for (const [presetId, asset] of assets) {
    const rig = cloneSkeleton(asset.scene)
    const root = new Group()
    rig.scale.setScalar(asset.scale)
    rig.position.y = asset.feetOffset
    root.add(rig)
    scene.add(root)
    const mixer = new AnimationMixer(rig)
    mixer.clipAction(asset.clips.get('Idle')!).play()
    mixer.setTime(0.3)
    const bounds = new Box3().setFromObject(root)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const viewHeight = Math.max(size.y * 1.2, size.x * 2.6, size.z * 2.2)
    camera.left = -viewHeight / 4
    camera.right = viewHeight / 4
    camera.top = viewHeight / 2
    camera.bottom = -viewHeight / 2
    camera.position.copy(center).add(new Vector3(2.5, 1.8, 3.5).normalize().multiplyScalar(5))
    camera.lookAt(center)
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
    output.push({ presetId, dataUrl: renderer.domElement.toDataURL('image/webp', 0.95) })
    scene.remove(root)
    mixer.stopAllAction()
    mixer.uncacheRoot(rig)
  }
  renderer.dispose()
  return output
}
