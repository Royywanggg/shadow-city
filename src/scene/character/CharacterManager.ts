import {
  AnimationClip, AnimationMixer, Box3, Color, Group, Mesh, MeshStandardMaterial, Object3D, SkinnedMesh, Vector3,
  type KeyframeTrack,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import type { CitizenAppearance } from '../../simulation/population'
import type { AgentRenderPose } from '../agentInterpolation'
import { CHARACTER_ASSETS, CHARACTER_ASSET_BY_ID, type CharacterAsset } from './catalog'
import { allocateCharacterTiers, type CharacterTier } from './lod'

export interface CharacterRenderItem {
  readonly id: string
  readonly appearance: CitizenAppearance
  readonly activity: string
  readonly movementMode?: 'walk' | 'jog'
  readonly previousActivity?: string
  readonly previousMovementMode?: 'walk' | 'jog'
  readonly transitionProgress?: number
  readonly animationRate?: number
  readonly pose: AgentRenderPose
  readonly pixelHeight: number
}

export interface CharacterDiagnostics {
  readonly farCount: number
  readonly mediumCount: number
  readonly closeCount: number
  readonly visibleCount: number
  readonly assetPresetCount: number
  readonly activeInstances: number
  readonly pooledInstances: number
}

interface LoadedAsset {
  readonly definition: CharacterAsset
  readonly scene: Object3D
  readonly mediumScene: Object3D
  readonly clips: ReadonlyMap<string, AnimationClip>
  readonly scale: number
  readonly feetOffset: number
}

interface CharacterInstance {
  readonly presetId: string
  readonly tier: 'medium' | 'close'
  readonly root: Group
  readonly rig: Object3D
  readonly mixer: AnimationMixer | null
  readonly materials: readonly MeshStandardMaterial[]
  readonly originalColors: ReadonlyMap<MeshStandardMaterial, Color>
  readonly clips: ReadonlyMap<string, AnimationClip>
  readonly meshes: readonly Mesh[]
  colors: string
}

export function animationWeights(activity: string, previousActivity?: string, transitionProgress = 1,
  preview: 'Idle' | 'Walk' | 'Run' | null = null, movementMode: 'walk' | 'jog' = 'walk',
  previousMovementMode: 'walk' | 'jog' = 'walk'): Readonly<Record<'Idle' | 'Walk' | 'Run', number>> {
  const clipFor = (value: string, mode: 'walk' | 'jog') =>
    value === 'travelling' || value === 'returningHome' ? (mode === 'jog' ? 'Run' : 'Walk') : 'Idle'
  if (preview) return { Idle: Number(preview === 'Idle'), Walk: Number(preview === 'Walk'), Run: Number(preview === 'Run') }
  const next = clipFor(activity, movementMode)
  const prior = previousActivity ? clipFor(previousActivity, previousMovementMode) : next
  const blend = Math.max(0, Math.min(1, transitionProgress))
  return {
    Idle: (prior === 'Idle' ? 1 - blend : 0) + (next === 'Idle' ? blend : 0),
    Walk: (prior === 'Walk' ? 1 - blend : 0) + (next === 'Walk' ? blend : 0),
    Run: (prior === 'Run' ? 1 - blend : 0) + (next === 'Run' ? blend : 0),
  }
}

export function stripHorizontalRootMotion(source: AnimationClip): AnimationClip {
  const clip = source.clone()
  for (const track of clip.tracks as KeyframeTrack[]) {
    if (!/(^|[/.])(Body|Hips)\.position$/i.test(track.name)) continue
    const values = track.values
    if (track.getValueSize() !== 3 || values.length < 3) continue
    const firstX = values[0]
    const firstZ = values[2]
    for (let index = 0; index < values.length; index += 3) {
      values[index] = firstX
      values[index + 2] = firstZ
    }
  }
  return clip
}

/** Convert a sampled skinned pose into shared static geometry for medium-distance residents. */
export function bakeStaticPose(scene: Object3D, idleClip: AnimationClip): Object3D {
  const posed = cloneSkeleton(scene)
  const mixer = new AnimationMixer(posed)
  mixer.clipAction(idleClip).play()
  mixer.setTime(Math.min(0.3, idleClip.duration * 0.25))
  posed.updateMatrixWorld(true)
  const staticRoot = new Group()
  const vertex = new Vector3()
  posed.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const geometry = object.geometry.clone()
    if (object instanceof SkinnedMesh) {
      const source = object.geometry.getAttribute('position')
      const positions = geometry.getAttribute('position')
      for (let index = 0; index < source.count; index += 1) {
        vertex.fromBufferAttribute(source, index)
        object.applyBoneTransform(index, vertex)
        positions.setXYZ(index, vertex.x, vertex.y, vertex.z)
      }
      positions.needsUpdate = true
    }
    geometry.applyMatrix4(object.matrixWorld)
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const mesh = new Mesh(geometry, object.material)
    mesh.name = object.name
    staticRoot.add(mesh)
  })
  mixer.stopAllAction()
  mixer.uncacheRoot(posed)
  return staticRoot
}

function prepareAsset(definition: CharacterAsset, gltf: GLTF): LoadedAsset {
  const bounds = new Box3().setFromObject(gltf.scene)
  const height = bounds.max.y - bounds.min.y
  if (!(height > 0) || !Number.isFinite(height)) throw new Error(`Invalid character bounds: ${definition.presetId}`)
  const clips = new Map(gltf.animations
    .filter((clip) => ['Idle', 'Walk', 'Run'].includes(clip.name))
    .map((clip) => [clip.name, stripHorizontalRootMotion(clip)]))
  if (!clips.has('Idle') || !clips.has('Walk') || !clips.has('Run')) {
    throw new Error(`Missing movement clips: ${definition.presetId}`)
  }
  const scale = 1.76 / height
  const mediumScene = bakeStaticPose(gltf.scene, clips.get('Idle')!)
  return { definition, scene: gltf.scene, mediumScene, clips, scale, feetOffset: -bounds.min.y * scale }
}

let characterAssetPromise: Promise<ReadonlyMap<string, LoadedAsset>> | null = null

async function loadAllCharacterAssets(): Promise<ReadonlyMap<string, LoadedAsset>> {
  const loader = new GLTFLoader()
  const loaded = await Promise.all(CHARACTER_ASSETS.map(async (definition) =>
    prepareAsset(definition, await loader.loadAsync(definition.url))))
  return new Map(loaded.map((asset) => [asset.definition.presetId, asset]))
}

/** World and portrait share parsed source assets; each active rig receives its own bones. */
export function loadCharacterAssets(): Promise<ReadonlyMap<string, LoadedAsset>> {
  characterAssetPromise ??= loadAllCharacterAssets().catch((error: unknown) => {
    characterAssetPromise = null
    throw error
  })
  return characterAssetPromise
}

function createInstance(asset: LoadedAsset, tier: 'medium' | 'close'): CharacterInstance {
  const rig = tier === 'close' ? cloneSkeleton(asset.scene) : asset.mediumScene.clone(true)
  const root = new Group()
  rig.scale.setScalar(asset.scale)
  rig.position.y = asset.feetOffset
  root.add(rig)
  const materials: MeshStandardMaterial[] = []
  const meshes: Mesh[] = []
  rig.traverse((object) => {
    if (!(object instanceof Mesh)) return
    meshes.push(object)
    object.castShadow = false
    object.receiveShadow = true
    const originals = Array.isArray(object.material) ? object.material : [object.material]
    const clones = originals.map((material) => {
      const next = material.clone()
      if (next instanceof MeshStandardMaterial) materials.push(next)
      return next
    })
    object.material = Array.isArray(object.material) ? clones : clones[0]
  })
  const mixer = tier === 'close' ? new AnimationMixer(rig) : null
  if (mixer) for (const clip of asset.clips.values()) mixer.clipAction(clip).play().setEffectiveWeight(0)
  return {
    presetId: asset.definition.presetId, tier, root, rig, mixer, materials,
    originalColors: new Map(materials.map((material) => [material, material.color.clone()])),
    clips: asset.clips, meshes, colors: '',
  }
}

function colorize(instance: CharacterInstance, appearance: CitizenAppearance): void {
  const signature = `${appearance.primaryClothingColor ?? ''}:${appearance.secondaryClothingColor ?? ''}`
  if (signature === instance.colors) return
  instance.colors = signature
  const definition = CHARACTER_ASSET_BY_ID.get(instance.presetId)
  if (!definition) return
  for (const material of instance.materials) {
    const color = material.name === definition.primaryMaterial ? appearance.primaryClothingColor
      : material.name === definition.secondaryMaterial ? appearance.secondaryClothingColor : null
    if (color) material.color.set(color)
    else material.color.copy(instance.originalColors.get(material)!)
  }
}

function animate(instance: CharacterInstance, item: CharacterRenderItem, logicalTime: number, preview: 'Idle' | 'Walk' | 'Run' | null): void {
  if (!instance.mixer) return
  const weights = animationWeights(item.activity, item.previousActivity, item.transitionProgress, preview,
    item.movementMode, item.previousMovementMode)
  const walkRate = Math.max(0.75, Math.min(1.35, item.animationRate ?? 1))
  for (const name of ['Idle', 'Walk', 'Run'] as const) {
    instance.mixer.clipAction(instance.clips.get(name)!)
      .setEffectiveWeight(weights[name])
      .setEffectiveTimeScale(name === 'Idle' ? 0.72 + item.appearance.animationPhaseOffset * 0.28
        : name === 'Run' ? walkRate * 1.45 : walkRate)
  }
  instance.mixer.setTime(logicalTime + item.appearance.animationPhaseOffset * 2)
}

/** A bounded pool of actual rigged characters. All citizens remain independently simulated. */
export class CharacterManager {
  readonly group = new Group()
  private readonly assets: ReadonlyMap<string, LoadedAsset>
  private readonly active = new Map<string, CharacterInstance>()
  private readonly pool = new Map<string, CharacterInstance[]>()
  private readonly previousTiers = new Map<string, CharacterTier>()
  private previewClip: 'Idle' | 'Walk' | 'Run' | null = null

  constructor(assets: ReadonlyMap<string, LoadedAsset>) {
    this.assets = assets
  }

  /** Development preview only. A Run clip does not imply a simulated jogging state. */
  setPreviewClip(clip: 'Idle' | 'Walk' | 'Run' | null): void {
    this.previewClip = clip
  }

  update(items: readonly CharacterRenderItem[], selectedId: string | null, logicalTime: number): {
    readonly tiers: ReadonlyMap<string, CharacterTier>
    readonly diagnostics: CharacterDiagnostics
  } {
    const tiers = allocateCharacterTiers(items.map((item) => ({
      id: item.id,
      pixelHeight: item.pixelHeight,
      selected: item.id === selectedId,
      previous: this.previousTiers.get(item.id) ?? 'far',
    })))
    const wanted = new Set(items.filter((item) => tiers.get(item.id) !== 'far').map((item) => item.id))
    for (const [id, instance] of this.active) {
      if (wanted.has(id)) continue
      this.active.delete(id)
      this.group.remove(instance.root)
      instance.root.visible = false
      const poolKey = `${instance.presetId}:${instance.tier}`
      const available = this.pool.get(poolKey) ?? []
      if (available.length < 8) {
        available.push(instance)
        this.pool.set(poolKey, available)
      } else {
        this.disposeInstance(instance)
      }
    }
    for (const item of items) {
      const tier = tiers.get(item.id) ?? 'far'
      this.previousTiers.set(item.id, tier)
      if (tier === 'far') continue
      const asset = this.assets.get(item.appearance.presetId)
      if (!asset) continue
      let instance = this.active.get(item.id)
      if (!instance || instance.presetId !== asset.definition.presetId || instance.tier !== tier) {
        if (instance) {
          this.group.remove(instance.root)
          this.active.delete(item.id)
          instance.root.visible = false
          const poolKey = `${instance.presetId}:${instance.tier}`
          const available = this.pool.get(poolKey) ?? []
          if (available.length < 8) {
            available.push(instance)
            this.pool.set(poolKey, available)
          } else this.disposeInstance(instance)
        }
        instance = this.pool.get(`${asset.definition.presetId}:${tier}`)?.pop() ?? createInstance(asset, tier)
        this.active.set(item.id, instance)
        this.group.add(instance.root)
      }
      instance.root.visible = true
      instance.root.position.set(item.pose.x, item.pose.y, item.pose.z)
      instance.root.rotation.y = item.pose.yaw
      instance.root.userData.agentId = item.id
      for (const mesh of instance.meshes) mesh.userData.agentId = item.id
      colorize(instance, item.appearance)
      animate(instance, item, logicalTime, item.id === selectedId ? this.previewClip : null)
    }
    const visibleIds = new Set(items.map((item) => item.id))
    for (const id of this.previousTiers.keys()) if (!visibleIds.has(id)) this.previousTiers.delete(id)
    const diagnostics = {
      farCount: [...tiers.values()].filter((tier) => tier === 'far').length,
      mediumCount: [...tiers.values()].filter((tier) => tier === 'medium').length,
      closeCount: [...tiers.values()].filter((tier) => tier === 'close').length,
      visibleCount: items.length,
      assetPresetCount: this.assets.size,
      activeInstances: this.active.size,
      pooledInstances: [...this.pool.values()].reduce((count, available) => count + available.length, 0),
    }
    return { tiers, diagnostics }
  }

  private disposeInstance(instance: CharacterInstance): void {
    instance.mixer?.stopAllAction()
    instance.mixer?.uncacheRoot(instance.rig)
    for (const material of instance.materials) material.dispose()
  }

  dispose(): void {
    for (const instance of this.active.values()) this.disposeInstance(instance)
    for (const available of this.pool.values()) for (const instance of available) this.disposeInstance(instance)
    this.active.clear()
    this.pool.clear()
    this.group.clear()
    // The parsed asset catalog is shared with the selected-character portrait.
  }
}
