import { hashSeed } from './rng'
import type { ActivityKind, SemanticPlace, WorldModelV2 } from '../world/model'
import type { CitizenProfileV5, SimulationConfigV5 } from './v5Types'

function unit(seed: string, purpose: string): number {
  return hashSeed(`${seed}\u0000${purpose}`) / 0x1_0000_0000
}

export function createCitizenProfilesV5(world: WorldModelV2,
  config: SimulationConfigV5): readonly CitizenProfileV5[] {
  if (!Number.isSafeInteger(config.populationSize) || config.populationSize < 0 ||
    config.populationSize > 200 || !config.simulationSeed) throw new Error('Invalid v5 population')
  const homes = world.places.filter((place) => place.kind === 'home').sort((a, b) => a.id.localeCompare(b.id))
  const workplaces = world.places.filter((place) => place.kind === 'workplace')
    .sort((a, b) => a.id.localeCompare(b.id))
  if (config.populationSize > 0 && homes.length === 0) throw new Error('V5 world requires homes')
  return Array.from({ length: config.populationSize }, (_, index) => {
    const id = `citizen-${String(index).padStart(4, '0')}`
    const draw = (purpose: string) => unit(config.simulationSeed, `${id}:${purpose}`)
    const homeIndex = (index + Math.floor(unit(config.simulationSeed, 'home:rotation') * homes.length)) % homes.length
    const home = homes[homeIndex]
    const homeSlotNodeId = home.slotNodeIds[Math.floor(index / homes.length)]
    if (!homeSlotNodeId) throw new Error('V5 world has insufficient individual home slots')
    const homePlaceId = home.id
    const workPlaceId = workplaces.length > 0 && draw('employment') < 0.72
      ? workplaces[Math.floor(draw('workplace') * workplaces.length)].id : null
    const preference = (kind: ActivityKind) => 0.55 + draw(`preference:${kind}`) * 0.9
    return Object.freeze({
      id, homePlaceId, homeSlotNodeId, workPlaceId,
      firstDepartureTick: 1 + Math.floor(draw('departure') * 100),
      homeDwellTicks: 90 + Math.floor(draw('homeDwell') * 140),
      visitDwellTicks: 25 + Math.floor(draw('visitDwell') * 80),
      travellerCosts: Object.freeze({
        speedMmPerSecond: 1_000 + Math.floor(draw('speed') * 550),
        stairMultiplier: 1.08 + draw('stairs') * 1.15,
        rampMultiplier: 1.02 + draw('ramp') * 0.35,
        escalatorMultiplier: 0.58 + draw('escalator') * 0.22,
        bridgeMultiplier: 0.78 + draw('bridge') * 0.95,
        allowStairs: draw('mobility') > 0.1,
        allowRamps: true,
      }),
      preferences: Object.freeze({
        home: preference('home'), work: preference('work'), shop: preference('shop'),
        eat: preference('eat'), leisure: preference('leisure'), transfer: preference('transfer'),
      }),
      jogPreference: draw('jog'),
    })
  })
}

export function localMinute(config: SimulationConfigV5, tick: number): number {
  return (config.startHour * 60 + tick * config.logicalSecondsPerTick / 60) % 1440
}

export function placeIsOpen(place: SemanticPlace, config: SimulationConfigV5, tick: number): boolean {
  const minute = localMinute(config, tick)
  const hours = config.placeOpeningHours?.[place.id] ?? place.openingHours
  return hours.some(({ openMinute, closeMinute }) =>
    openMinute <= closeMinute ? minute >= openMinute && minute < closeMinute
      : minute >= openMinute || minute < closeMinute)
}

export function activityDemand(kind: ActivityKind, minute: number): number {
  if (kind === 'home') return 0
  if (kind === 'work') return minute >= 7 * 60 && minute < 18 * 60 ? 1.25 : 0.12
  if (kind === 'transfer') return minute < 10 * 60 || minute >= 17 * 60 && minute < 20 * 60 ? 0.95 : 0.35
  if (kind === 'shop') return minute >= 9 * 60 && minute < 20 * 60 ? 0.8 : 0.18
  if (kind === 'eat') return minute >= 11 * 60 && minute < 14 * 60 ||
    minute >= 17 * 60 && minute < 22 * 60 ? 1.05 : 0.45
  return minute >= 17 * 60 && minute < 23 * 60 ? 1.0 : 0.58
}
