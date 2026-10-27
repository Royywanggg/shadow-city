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
  readonly lifeStatus?: 'alive' | 'deceased'
  readonly functionalStatus?: 'unimpaired' | 'impaired' | 'incapacitated' | null
  /** Tick-based pose progress, never browser wall-clock time. */
  readonly collapseProgress?: number
  readonly standProgress?: number
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

export type CharacterPreviewClip = 'Idle' | 'Walk' | 'Run' | 'SitDown' | 'SitIdle' | 'StandUp'
export type CharacterAssetMode = 'upgraded' | 'legacy'

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
  previewActionName: CharacterPreviewClip | null
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
    .filter((clip) => ['Idle', 'Walk', 'Run', 'SitDown', 'SitIdle', 'StandUp'].includes(clip.name))
    .map((clip) => [clip.name, stripHorizontalRootMotion(clip)]))
  if (!clips.has('Idle') || !clips.has('Walk') || !clips.has('Run')) {
    throw new Error(`Missing movement clips: ${definition.presetId}`)
  }
  const scale = 1.76 / height
  const mediumScene = bakeStaticPose(gltf.scene, clips.get('Idle')!)
  return { definition, scene: gltf.scene, mediumScene, clips, scale, feetOffset: -bounds.min.y * scale }
}

const characterAssetPromises: Partial<Record<CharacterAssetMode,
  Promise<ReadonlyMap<string, LoadedAsset>>>> = {}
const characterAssetLoadDurationMs: Partial<Record<CharacterAssetMode, number>> = {}
let resolvedCharacterAssetMode: CharacterAssetMode | null = null

function requestedCharacterAssetMode(): CharacterAssetMode {
  return typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('characterAssets') === 'legacy' ? 'legacy' : 'upgraded'
}

async function loadAllCharacterAssets(mode: CharacterAssetMode): Promise<ReadonlyMap<string, LoadedAsset>> {
  const started = performance.now()
  const loader = new GLTFLoader()
  const loaded = await Promise.all(CHARACTER_ASSETS.map(async (definition) => {
    const url = mode === 'upgraded' ? definition.url.replace('/quaternius-v01/', '/quaternius-ual-v1/') :
      definition.url
    return prepareAsset(definition, await loader.loadAsync(url))
  }))
  characterAssetLoadDurationMs[mode] = performance.now() - started
  resolvedCharacterAssetMode = mode
  return new Map(loaded.map((asset) => [asset.definition.presetId, asset]))
}

/** World and portrait share parsed source assets; each active rig receives its own bones. */
export function loadCharacterAssets(mode = requestedCharacterAssetMode()): Promise<ReadonlyMap<string, LoadedAsset>> {
  characterAssetPromises[mode] ??= loadAllCharacterAssets(mode).catch(async (error: unknown) => {
    delete characterAssetPromises[mode]
    if (mode === 'upgraded') return loadCharacterAssets('legacy')
    throw error
  })
  return characterAssetPromises[mode]
}

export function getResolvedCharacterAssetMode(): CharacterAssetMode | null { return resolvedCharacterAssetMode }
export function getCharacterAssetLoadDurationMs(): number | null {
  return resolvedCharacterAssetMode ? characterAssetLoadDurationMs[resolvedCharacterAssetMode] ?? null : null
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
  if (mixer) for (const name of ['Idle', 'Walk', 'Run']) {
    const clip = asset.clips.get(name)
    if (clip) mixer.clipAction(clip).play().setEffectiveWeight(0)
  }
  return {
    presetId: asset.definition.presetId, tier, root, rig, mixer, materials,
    originalColors: new Map(materials.map((material) => [material, material.color.clone()])),
    clips: asset.clips, meshes, colors: '', previewActionName: null,
  }
}

function colorize(instance: CharacterInstance, appearance: CitizenAppearance): void {
  const signature = `${appearance.primaryClothingColor ?? ''}:${appearance.secondaryClothingColor ?? ''}`
  if (signature === instance.colors) return
  instance.colors = signature
  const definition = CHARACTER_ASSET_BY_ID.get(instance.presetId)
  if (!definition) return
  for (const material of instance.materials) {
    const materialName = material.name.replace(/\.\d+$/, '')
    const color = materialName === definition.primaryMaterial ? appearance.primaryClothingColor
      : materialName === definition.secondaryMaterial ? appearance.secondaryClothingColor : null
    if (color) material.color.set(color)
    else material.color.copy(instance.originalColors.get(material)!)
  }
}

function animate(instance: CharacterInstance, item: CharacterRenderItem, logicalTime: number, preview: CharacterPreviewClip | null): void {
  if (!instance.mixer) return
  if (item.standProgress !== undefined) {
    if (instance.previewActionName) {
      instance.mixer.clipAction(instance.clips.get(instance.previewActionName)!).stop()
      instance.previewActionName = null
    }
    const clip = instance.clips.get('StandUp')
    for (const name of ['Idle', 'Walk', 'Run'] as const) {
      const action = instance.clips.get(name)
      if (action) instance.mixer.clipAction(action)
        .setEffectiveWeight(Number(name === 'Idle' && !clip))
    }
    if (instance.clips.has('SitDown')) instance.mixer.clipAction(instance.clips.get('SitDown')!).stop()
    if (clip) instance.mixer.clipAction(clip).play().setEffectiveWeight(1)
    instance.mixer.setTime(clip ? Math.min(clip.duration - 0.01,
      clip.duration * item.standProgress) : 0.3)
    return
  }
  if (item.lifeStatus === 'deceased' || item.functionalStatus === 'incapacitated') {
    if (instance.previewActionName) {
      instance.mixer.clipAction(instance.clips.get(instance.previewActionName)!).stop()
      instance.previewActionName = null
    }
    const collapseClip = instance.clips.get('SitDown')
    for (const name of ['Idle', 'Walk', 'Run'] as const) {
      const clip = instance.clips.get(name)
      if (clip) instance.mixer.clipAction(clip)
        .setEffectiveWeight(Number(name === 'Idle' && !collapseClip))
    }
    if (collapseClip) instance.mixer.clipAction(collapseClip).play().setEffectiveWeight(1)
    instance.mixer.setTime(collapseClip ? Math.min(collapseClip.duration - 0.01,
      collapseClip.duration * (item.collapseProgress ?? 1)) : 0.3)
    return
  }
  if (instance.clips.has('SitDown') && preview !== 'SitDown') {
    instance.mixer.clipAction(instance.clips.get('SitDown')!).stop()
  }
  if (instance.clips.has('StandUp') && preview !== 'StandUp') {
    instance.mixer.clipAction(instance.clips.get('StandUp')!).stop()
  }
  const weights = animationWeights(item.activity, item.previousActivity, item.transitionProgress,
    preview === 'Idle' || preview === 'Walk' || preview === 'Run' ? preview : null,
    item.movementMode, item.previousMovementMode)
  const walkRate = Math.max(0.75, Math.min(1.35, item.animationRate ?? 1))
  const canPreview = preview && instance.clips.has(preview)
  const previewActionName = canPreview && preview !== 'Idle' && preview !== 'Walk' && preview !== 'Run'
    ? preview : null
  if (instance.previewActionName !== previewActionName) {
    if (instance.previewActionName) instance.mixer.clipAction(instance.clips.get(instance.previewActionName)!).stop()
    if (previewActionName) instance.mixer.clipAction(instance.clips.get(previewActionName)!).reset().play()
    instance.previewActionName = previewActionName
  }
  for (const name of ['Idle', 'Walk', 'Run'] as const) {
    const clip = instance.clips.get(name)
    if (!clip) continue
    instance.mixer.clipAction(clip)
      .setEffectiveWeight(canPreview ? Number(name === preview) :
        weights[name])
      .setEffectiveTimeScale(name === 'Idle' ? 0.72 + item.appearance.animationPhaseOffset * 0.28
        : name === 'Run' ? walkRate * 1.45 : walkRate)
  }
  if (previewActionName) instance.mixer.clipAction(instance.clips.get(previewActionName)!)
    .setEffectiveWeight(1).setEffectiveTimeScale(1)
  instance.mixer.setTime(logicalTime + (canPreview ? 0 : item.appearance.animationPhaseOffset * 2))
}

/** A bounded pool of actual rigged characters. All citizens remain independently simulated. */
export class CharacterManager {
  readonly group = new Group()
  private readonly assets: ReadonlyMap<string, LoadedAsset>
  private readonly active = new Map<string, CharacterInstance>()
  private readonly pool = new Map<string, CharacterInstance[]>()
  private readonly previousTiers = new Map<string, CharacterTier>()
  private previewClip: CharacterPreviewClip | null = null

  constructor(assets: ReadonlyMap<string, LoadedAsset>) {
    this.assets = assets
  }

  /** Development preview only; authored clips do not create simulated activities. */
  setPreviewClip(clip: CharacterPreviewClip | null): void {
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
      const tilted = item.standProgress === undefined ? item.collapseProgress ?? 0 :
        1 - item.standProgress
      instance.root.rotation.set(0, item.pose.yaw, -1.45 * tilted)
      if (tilted) instance.root.position.y += 0.06 * tilted
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
