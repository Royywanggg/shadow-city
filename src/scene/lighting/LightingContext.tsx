import { createContext, useContext } from 'react'
import type { LightingState } from './timeOfDay'

export const LightingContext = createContext<LightingState | null>(null)
export function useLightingState(): LightingState | null { return useContext(LightingContext) }
