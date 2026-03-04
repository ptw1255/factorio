import { Recipe } from '../../types/recipe'
import { BoilResult, CoolingResult } from '../../types/brewing-variables'

/**
 * Simulates wort cooling from boiling to fermentation temperature.
 */
export function simulateCooling(boilResult: BoilResult, recipe: Recipe): CoolingResult {
  const startTemp = 212 // boiling point °F
  const targetTemp = recipe.process.fermentationTemp

  // Cooling duration: 10-30 minutes with slight randomness
  const coolingDuration = 10 + Math.random() * 20

  // End temp within ±1°F of target
  const tempVariation = (Math.random() - 0.5) * 2
  const endTemp = targetTemp + tempVariation

  return {
    startTemp,
    endTemp: Math.round(endTemp * 10) / 10,
    coolingDuration: Math.round(coolingDuration),
    targetTemp,
  }
}
