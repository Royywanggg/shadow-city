import type { Building, CityModel } from '../../city/model'

/** The visual trial follows the generated plaza instead of depending on one seed's IDs. */
export function selectHeroBuildings(city: CityModel, count = 8): Building[] {
  const plazaX = city.plaza.x
  const plazaZ = city.plaza.z
  return [...city.buildings]
    .sort((a, b) => {
      const distanceA = Math.hypot(a.x - plazaX, a.z - plazaZ)
      const distanceB = Math.hypot(b.x - plazaX, b.z - plazaZ)
      return distanceA - distanceB || a.id.localeCompare(b.id)
    })
    .slice(0, count)
}
