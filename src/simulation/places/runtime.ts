import type { SemanticPlace, WorldModelV2 } from '../../world/model'
import { habitPlaceIsOpenV1 } from '../habits/decision'
import { placeIsOpen } from '../v5Profiles'
import type { SimulationEnvironmentV5, SimulationStateV5 } from '../v5Types'

export interface PlaceOccupancyV1 {
  readonly placeId: string
  readonly isOpen: boolean
  /** Residents physically present on one of this place's surfaces. */
  readonly occupantIds: readonly string[]
  /** Residents travelling to or occupying an assigned activity slot. */
  readonly reservedAgentIds: readonly string[]
  readonly waitingAgentIds: readonly string[]
  readonly slotAssignments: Readonly<Record<string, string>>
  readonly activeActivityIds: readonly string[]
  readonly availableSlots: number
}

export interface PlaceRuntimeStateV1 {
  readonly version: 'place-v1'
  readonly tick: number
  readonly places: readonly PlaceOccupancyV1[]
}

/** Validate spatial references before the optional place model starts. */
export function validateFunctionalPlacesV1(world: WorldModelV2): void {
  const places = new Set<string>()
  const buildingIds = new Set([
    ...(world.baseCity?.buildings.map((building) => building.id) ?? []),
    ...world.boxes.filter((box) => box.kind === 'building')
      .map((box) => box.placeId).filter((id): id is string => Boolean(id)),
  ])
  const surfaces = new Map(world.surfaces.map((surface) => [surface.id, surface]))
  const nodes = new Map(world.navNodes.map((node) => [node.id, node]))
  for (const place of world.places) {
    if (places.has(place.id) || !Number.isSafeInteger(place.capacity) ||
      place.capacity < 1 || place.capacity > place.slotNodeIds.length ||
      !place.surfaceIds.length || !place.accessNodeIds.length ||
      !place.activityTags.length ||
      place.buildingId && !buildingIds.has(place.buildingId) ||
      new Set(place.slotNodeIds).size !== place.slotNodeIds.length ||
      !place.openingHours.length || place.openingHours.some((window) =>
        !Number.isSafeInteger(window.openMinute) ||
        !Number.isSafeInteger(window.closeMinute) ||
        window.openMinute < 0 || window.closeMinute > 1440 ||
        window.openMinute === window.closeMinute)) {
      throw new Error(`Invalid functional place ${place.id}`)
    }
    places.add(place.id)
    if (place.surfaceIds.some((id) => !surfaces.has(id)) ||
      place.accessNodeIds.some((id) => !nodes.has(id)) ||
      place.slotNodeIds.some((id) => !nodes.has(id) ||
        !place.surfaceIds.includes(nodes.get(id)!.surfaceId))) {
      throw new Error(`Invalid place spatial reference ${place.id}`)
    }
    if (place.floorId && place.surfaceIds.some((id) =>
      surfaces.get(id)!.levelId !== place.floorId)) {
      throw new Error(`Place floor does not match surface ${place.id}`)
    }
  }
  for (const resource of world.resources) {
    const place = world.places.find((item) => item.id === resource.placeId)
    if (!place || !place.surfaceIds.includes(resource.surfaceId)) {
      throw new Error(`Invalid place resource ${resource.id}`)
    }
  }
}

/** Build one authoritative, replayable place snapshot from citizen and access state. */
export function derivePlaceRuntimeV1(state: SimulationStateV5,
  environment: SimulationEnvironmentV5): PlaceRuntimeStateV1 {
  const places = environment.world.places
  const byId = new Map(places.map((place) => [place.id, place]))
  const bySlot = new Map<string, SemanticPlace>()
  const nodes = new Map(environment.world.navNodes.map((node) => [node.id, node]))
  for (const place of places) for (const nodeId of place.slotNodeIds) {
    if (bySlot.has(nodeId)) throw new Error(`Activity slot belongs to multiple places: ${nodeId}`)
    bySlot.set(nodeId, place)
  }
  const buckets = new Map(places.map((place) => [place.id, {
    occupants: new Set<string>(), reserved: new Set<string>(), waiting: new Set<string>(),
    slots: {} as Record<string, string>, activities: [] as string[],
  }]))
  for (const citizen of state.citizens) {
    const occupiedPlace = citizen.placeId && byId.get(citizen.placeId) ?
      citizen.placeId : citizen.currentNodeId ? bySlot.get(citizen.currentNodeId)?.id : null
    if (occupiedPlace) buckets.get(occupiedPlace)!.occupants.add(citizen.id)
    const node = citizen.currentNodeId ? nodes.get(citizen.currentNodeId) : null
    const physicalSlot = node && bySlot.has(node.id) &&
      node.position.x === citizen.position.x &&
      node.position.y === citizen.position.y &&
      node.position.z === citizen.position.z ? node.id : null
    for (const slotId of new Set([citizen.reservedSlotNodeId, physicalSlot]
      .filter((id): id is string => Boolean(id)))) {
      const place = bySlot.get(slotId)
      if (!place) throw new Error(`Unknown reserved activity slot ${slotId}`)
      const bucket = buckets.get(place.id)!
      if (bucket.slots[slotId] && bucket.slots[slotId] !== citizen.id) {
        throw new Error(`Duplicate activity slot assignment ${slotId}`)
      }
      bucket.slots[slotId] = citizen.id
      bucket.reserved.add(citizen.id)
    }
    if (citizen.activity === 'waitingForSpace' && citizen.destinationPlaceId &&
      byId.has(citizen.destinationPlaceId)) {
      buckets.get(citizen.destinationPlaceId)!.waiting.add(citizen.id)
    }
  }
  for (const habit of state.habits?.citizens ?? []) {
    if (habit.intention?.status === 'active' && byId.has(habit.intention.placeId)) {
      buckets.get(habit.intention.placeId)!.activities.push(habit.intention.id)
    }
  }
  const modes = new Map(Object.entries(state.accessModes))
  const runtime: PlaceRuntimeStateV1 = { version: 'place-v1', tick: state.tick, places: places.map((place) => {
    const bucket = buckets.get(place.id)!
    const used = Object.keys(bucket.slots).length
    if (used > place.capacity) throw new Error(`Place capacity exceeded: ${place.id}`)
    const isOpen = environment.config.habit ? habitPlaceIsOpenV1(place,
      environment.config, modes, state.tick) :
      placeIsOpen(place, environment.config, state.tick) &&
      modes.get(`place:${place.id}`) !== 'closed' &&
      (place.buildingId !== 'central-galleria' || modes.get('mall-entry') === 'open')
    return { placeId: place.id, isOpen,
      occupantIds: [...bucket.occupants].sort(),
      reservedAgentIds: [...bucket.reserved].sort(),
      waitingAgentIds: [...bucket.waiting].sort(),
      slotAssignments: bucket.slots,
      activeActivityIds: bucket.activities.sort(),
      availableSlots: Math.max(0, Math.min(place.capacity - used,
        place.slotNodeIds.length - used)) }
  }) }
  return runtime
}
