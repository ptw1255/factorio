import { Recipe } from '../../types/recipe'
import { MashResult } from '../../types/brewing-variables'

/**
 * Simulates the mashing process — grain + hot water to extract sugars.
 * Pure function with slight randomness to simulate real-world variation.
 */
export function simulateMash(recipe: Recipe): MashResult {
  const totalGrainLbs = recipe.grainBill.reduce((sum, g) => sum + g.quantity, 0)

  // Standard mash ratio: ~1.25 quarts per pound of grain
  const mashWaterQuarts = totalGrainLbs * 1.25
  const mashWaterGallons = mashWaterQuarts / 4

  // Points per pound per gallon (PPG) for base malt is ~36-37
  const ppg = 36
  const mashEfficiency = 0.70 + Math.random() * 0.05 // 70-75%
  const totalPoints = totalGrainLbs * ppg * mashEfficiency
  const gravity = 1 + totalPoints / (mashWaterGallons * 1000)

  // pH typically 5.2-5.6 for a normal mash
  const ph = 5.2 + Math.random() * 0.4

  // Slight temp variation ±2°F
  const tempVariation = (Math.random() - 0.5) * 4
  const actualTemp = recipe.process.mashTemp + tempVariation

  return {
    mashTemp: Math.round(actualTemp * 10) / 10,
    duration: recipe.process.mashDuration,
    wortComposition: {
      volume: Math.round(mashWaterGallons * 100) / 100,
      gravity: Math.round(gravity * 1000) / 1000,
      ph: Math.round(ph * 100) / 100,
    },
  }
}
