import type { WorldModelV2 } from '../model'
import { WorldBuilder } from './WorldBuilder'

function pinnedSurface(id: string): boolean {
  return id.startsWith('galleria') || id === 'skybridge' ||
    id.startsWith('overpass-') || id === 'connector:east-ramp' ||
    id === 'connector:galleria-escalator' ||
    id === 'connector:west-stair' || id === 'connector:east-stair'
}

/** Copy the existing functional Galleria and overpass without remodelling them. */
export function attachGalleriaOverlay(builder: WorldBuilder,
  source: WorldModelV2): void {
  const surfaces = source.surfaces.filter((surface) => pinnedSurface(surface.id))
  const surfaceIds = new Set(surfaces.map((surface) => surface.id))
  for (const surface of surfaces) builder.surface(surface)
  const nodes = source.navNodes.filter((node) => surfaceIds.has(node.surfaceId) ||
    node.id === 'plaza:east-mid' || node.id === 'mall:west-mid')
  const nodeIds = new Set(nodes.map((node) => node.id))
  for (const node of nodes) builder.node(node.id, node.position,
    node.surfaceId === 'ground' ? 'organic:ground' : node.surfaceId)
  const edges = source.navEdges.filter((edge) => nodeIds.has(edge.fromNodeId) &&
    nodeIds.has(edge.toNodeId))
  for (const edge of edges) builder.edge({ id: edge.id,
    fromNodeId: edge.fromNodeId, toNodeId: edge.toNodeId,
    surfaceId: edge.surfaceId === 'ground' ? 'organic:ground' : edge.surfaceId,
    connectorId: edge.connectorId, kind: edge.kind,
    accessId: edge.accessId, accessIds: edge.accessIds,
    direction: edge.direction, path: edge.path })
  const edgeIds = new Set(edges.map((edge) => edge.id))
  for (const connector of source.connectors.filter((item) =>
    item.edgeIds.every((id) => edgeIds.has(id)))) builder.connectors.push(connector)
  const places = source.places.filter((place) =>
    place.surfaceIds.length > 0 && place.surfaceIds.every((id) => surfaceIds.has(id)))
  const placeIds = new Set(places.map((place) => place.id))
  builder.places.push(...places)
  builder.resources.push(...source.resources.filter((resource) =>
    placeIds.has(resource.placeId)))
  builder.boxes.push(...source.boxes.filter((box) => placeIds.has(box.placeId ?? '') ||
    box.id.startsWith('bridge-') || box.id.startsWith('overpass-') ||
    box.id.startsWith('galleria-')))
}
