import { Recipe } from '../../types/recipe'
import { PalletBuildResult } from '../../types/crating-variables'
import { generateId } from '../../types/shared'

/**
 * Simulate palletizing — stack cases onto a pallet.
 */
export function simulatePalletizing(casesToStack: number, recipe: Recipe): PalletBuildResult {
  const palletId = generateId('PLT')

  // Standard pallet: 40"x48", cases are roughly 16"x10"
  // ~6 cases per layer is typical for 24-pack cases
  const casesPerLayer = 6
  const layers = Math.ceil(casesToStack / casesPerLayer)
  const totalCases = Math.min(casesToStack, layers * casesPerLayer)

  // Weight: ~30 lbs per case of 24x12oz bottles
  const caseWeight = 30
  const totalWeight = totalCases * caseWeight

  // Stability check: slight random deviation, fail if > threshold
  const centerWeight = totalWeight * (0.48 + Math.random() * 0.04)
  const edgeWeight = totalWeight - centerWeight
  const deviation = Math.abs(centerWeight - edgeWeight) / totalWeight
  const stable = deviation < 0.15

  return {
    palletId,
    layers,
    casesPerLayer,
    totalCases,
    totalWeight,
    stable,
    weightDistribution: {
      center: Math.round(centerWeight),
      edge: Math.round(edgeWeight),
    },
  }
}
