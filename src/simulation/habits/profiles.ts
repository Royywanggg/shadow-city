import type { WorldModelV2 } from '../../world/model'
import { hashSeed } from '../rng'
import type { CitizenProfileV5 } from '../v5Types'
import type { HabitActivityKind, HabitProfileV1, HabitScenarioConfigV1 } from './types'

const unit = (seed: string, agentId: string, purpose: string): number =>
  hashSeed(`${seed}\u0000habit-profile-v1\u0000${agentId}\u0000${purpose}`) / 4294967296

export function createHabitProfilesV1(world: WorldModelV2,
  citizens: readonly CitizenProfileV5[], config: HabitScenarioConfigV1): readonly HabitProfileV1[] {
  const destinations = world.places.filter((place) => place.kind !== 'home' &&
    place.kind !== 'walkway' && place.kind !== 'corridor').sort((a, b) =>
    a.id.localeCompare(b.id))
  return citizens.map((citizen) => {
    const draw = (purpose: string) => unit(config.seed, citizen.id, purpose)
    const preference = (kind: HabitActivityKind) => 350 +
      Math.floor(draw(`preference:${kind}`) * 551)
    const durations = (kind: HabitActivityKind, low: number, spread: number) =>
      Math.max(1, Math.round((low + draw(`duration:${kind}`) * spread) * 60 /
        config.calendarSecondsPerTick))
    const ranked = destinations.map((place) => ({ place,
      value: draw(`preferred-place:${place.id}`) })).sort((a, b) =>
      b.value - a.value || a.place.id.localeCompare(b.place.id))
    const workStartMinute = citizen.workPlaceId === null ? null :
      7 * 60 + Math.floor(draw('work-start') * 180)
    const workEndMinute = citizen.workPlaceId === null ? null :
      16 * 60 + Math.floor(draw('work-end') * 180)
    return {
      agentId: citizen.id,
      wakeMinute: 6 * 60 + Math.floor(draw('wake') * 180),
      restMinute: 21 * 60 + Math.floor(draw('rest') * 180),
      workStartMinute, workEndMinute,
      workDays: citizen.workPlaceId === null ? [] : draw('work-days') < 0.22 ?
        [1, 2, 3, 4] : draw('work-days') < 0.4 ? [0, 1, 2, 3, 4, 5] :
          [0, 1, 2, 3, 4],
      preferredPlaces: ranked.slice(0, 3).map(({ place }) => place.id),
      preference: { rest: preference('rest'), work: preference('work'),
        eat: preference('eat'), shop: preference('shop'),
        leisure: preference('leisure'), social: preference('social') },
      sociability: 250 + Math.floor(draw('sociability') * 651),
      regularity: 350 + Math.floor(draw('regularity') * 551),
      changeWillingness: 250 + Math.floor(draw('change-willingness') * 651),
      shoppingCadenceTicks: 3 + Math.floor(draw('shopping-cadence') * 5),
      durations: { rest: durations('rest', 300, 180),
        work: durations('work', 240, 180), eat: durations('eat', 25, 35),
        shop: durations('shop', 20, 40), leisure: durations('leisure', 45, 90),
        social: durations('social', 30, 80) },
    }
  })
}
