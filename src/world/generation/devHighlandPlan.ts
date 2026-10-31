import type { CityModel } from '../../city/model'

export const HIGHLAND_CLOSED_ROAD_IDS = [
  'edge-z-2--1', 'edge-z-3--1', 'edge-z-4--1',
  'edge-z-5--1', 'edge-z-6--1',
] as const

/** The dev highland replaces the through-block roads with one landform. */
export function applyDevHighlandPlan(city: CityModel): CityModel {
  const closed = new Set<string>(HIGHLAND_CLOSED_ROAD_IDS)
  for (const id of closed) {
    if (!city.roads.edges.some((edge) => edge.id === id)) {
      throw new Error(`Missing highland road ${id}`)
    }
  }
  return { ...city,
    roads: { ...city.roads,
      edges: city.roads.edges.filter((edge) => !closed.has(edge.id)) },
    streetFeatures: city.streetFeatures.filter((feature) =>
      !HIGHLAND_CLOSED_ROAD_IDS.some((id) =>
        feature.id.startsWith(`lamp-${id}-`) || feature.id === `bus-stop-${id}`)),
  }
}
