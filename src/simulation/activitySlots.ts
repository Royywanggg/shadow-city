import type { PedestrianAnchor, PedestrianNetwork } from '../city/model'
import type { DeepReadonly, WorldPosition } from './types'

export interface ActivitySlot {
  readonly id: string
  readonly anchorId: string
  readonly siteId: string
  readonly kind: PedestrianAnchor['kind']
  readonly position: WorldPosition
}

const MIN_SLOT_SEPARATION = 0.9

/** Every slot is an existing pedestrian anchor, so routes and occupied positions share a source. */
export function createActivitySlots(network: DeepReadonly<PedestrianNetwork>): readonly ActivitySlot[] {
  const nodeById = new Map(network.nodes.map((node) => [node.id, node]))
  const slots: ActivitySlot[] = []
  const anchors = network.anchors
    .filter((anchor) => anchor.kind === 'plaza' || anchor.kind === 'park' ||
      anchor.kind === 'publicEntrance' || anchor.kind === 'street')
    .sort((a, b) => a.id.localeCompare(b.id))
  for (const anchor of anchors) {
    const node = nodeById.get(anchor.nodeId)
    if (!node) throw new Error(`Missing activity node for ${anchor.id}`)
    const siteId = anchor.kind === 'publicEntrance'
      ? `building:${anchor.buildingId}` : `${anchor.kind}:${anchor.blockId}`
    if (slots.some((slot) =>
      Math.hypot(slot.position.x - node.x, slot.position.z - node.z) < MIN_SLOT_SEPARATION)) continue
    slots.push({
      id: `activity-slot:${anchor.id}`,
      anchorId: anchor.id,
      kind: anchor.kind,
      siteId,
      position: { x: node.x, y: node.surfaceY, z: node.z },
    })
  }
  return slots
}

/** Prefer free capacity at the requested site, then a nearby alternative site. */
export function chooseActivitySlot(
  slots: readonly ActivitySlot[], desiredAnchorId: string, reserved: ReadonlySet<string>,
): ActivitySlot | null {
  const desired = slots.find((slot) => slot.anchorId === desiredAnchorId)
  if (!desired) throw new Error(`Unknown activity slot ${desiredAnchorId}`)
  const available = slots.filter((slot) => !reserved.has(slot.id))
  available.sort((a, b) =>
    Number(a.siteId !== desired.siteId) - Number(b.siteId !== desired.siteId) ||
    Math.hypot(a.position.x - desired.position.x, a.position.z - desired.position.z) -
      Math.hypot(b.position.x - desired.position.x, b.position.z - desired.position.z) ||
    a.id.localeCompare(b.id))
  return available[0] ?? null
}
