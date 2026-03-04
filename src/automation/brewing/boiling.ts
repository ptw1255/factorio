import { Recipe } from '../../types/recipe'
import { LauterResult, BoilResult } from '../../types/brewing-variables'

/**
 * Tinseth IBU formula:
 * IBU = (utilization × ozHops × alphaAcid × 7490) / volumeGallons
 *
 * Utilization is based on boil time and wort gravity.
 */
function tinsethUtilization(boilTimeMinutes: number, gravity: number): number {
  const bignessFactor = 1.65 * Math.pow(0.000125, gravity - 1)
  const boilTimeFactor = (1 - Math.exp(-0.04 * boilTimeMinutes)) / 4.15
  return bignessFactor * boilTimeFactor
}

/**
 * Simulates the boiling process — hop additions, evaporation, IBU calculation.
 */
export function simulateBoil(lauterResult: LauterResult, recipe: Recipe): BoilResult {
  const preBoilVolume = lauterResult.wortVolume

  // Evaporation: ~1-1.5 gallons per hour
  const evaporationRate = 1.0 + Math.random() * 0.5
  const boilHours = recipe.process.boilDuration / 60
  const evaporationLoss = evaporationRate * boilHours
  const postBoilVolume = preBoilVolume - evaporationLoss

  // Estimate average gravity for IBU calculation
  const avgGravity = 1.045 + Math.random() * 0.010

  const hopAdditions = recipe.hopSchedule.map((hop) => {
    const utilization = tinsethUtilization(hop.additionTime, avgGravity)
    const ibuContribution = (utilization * hop.quantity * (hop.alphaAcid / 100) * 7490) / postBoilVolume
    return {
      hop: hop.hop,
      quantity: hop.quantity,
      time: hop.additionTime,
      ibuContribution: Math.round(ibuContribution * 10) / 10,
    }
  })

  const totalIBU = hopAdditions.reduce((sum, h) => sum + h.ibuContribution, 0)

  return {
    preBoilVolume: Math.round(preBoilVolume * 100) / 100,
    postBoilVolume: Math.round(postBoilVolume * 100) / 100,
    hopAdditions,
    totalIBU: Math.round(totalIBU * 10) / 10,
    boilDuration: recipe.process.boilDuration,
    evaporationRate: Math.round(evaporationRate * 100) / 100,
  }
}
