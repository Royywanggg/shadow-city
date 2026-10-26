import type { Building, CityModel } from '../../city/model'
import { HERO_SEED } from '../../city/generation/generateCity'

export interface LookDevArea {
  readonly civic: Building
  readonly commercial: Building
  readonly center: readonly [number, number]
}

/** Choose two visible frontages on opposite sides of the generated central square. */
export function selectLookDevArea(city: CityModel): LookDevArea | null {
  if (city.seed !== HERO_SEED) return null
  const distanceToPlaza = (building: Building) =>
    Math.hypot(building.x - city.plaza.x, building.z - city.plaza.z)
  const civic = city.buildings.filter((building) => building.kind === 'civic')
    .sort((a, b) => distanceToPlaza(a) - distanceToPlaza(b) || a.id.localeCompare(b.id))[0]
  if (!civic) return null
  const opposite = city.buildings.filter((building) => building.kind === 'commercial' &&
    (building.x - city.plaza.x) * (civic.x - city.plaza.x) +
      (building.z - city.plaza.z) * (civic.z - city.plaza.z) < 0)
  const commercial = opposite.sort((a, b) => distanceToPlaza(a) - distanceToPlaza(b) ||
    a.id.localeCompare(b.id))[0]
  if (!commercial) return null
  return { civic, commercial,
    center: [(civic.x + commercial.x) / 2, (civic.z + commercial.z) / 2] }
}
