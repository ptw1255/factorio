import { Recipe } from '../../types/recipe'
import { MashResult, LauterResult } from '../../types/brewing-variables'

/**
 * Simulates the lautering process — separating sweet wort from grain.
 * Calculates extraction efficiency and sparge water needs.
 */
export function simulateLauter(mashResult: MashResult, recipe: Recipe): LauterResult {
  const totalGrainLbs = recipe.grainBill.reduce((sum, g) => sum + g.quantity, 0)

  // Grain absorbs ~0.125 gallons per pound
  const grainAbsorption = totalGrainLbs * 0.125

  // Sparge water: roughly equal to mash water to rinse remaining sugars
  const spargeWater = mashResult.wortComposition.volume * (0.9 + Math.random() * 0.2)

  // Total wort collected = mash water + sparge water - grain absorption
  const wortVolume = mashResult.wortComposition.volume + spargeWater - grainAbsorption

  // Efficiency: 65-82% is typical for homebrew/craft
  const efficiency = 65 + Math.random() * 17

  return {
    wortVolume: Math.round(wortVolume * 100) / 100,
    efficiency: Math.round(efficiency * 10) / 10,
    spargeWater: Math.round(spargeWater * 100) / 100,
  }
}
