import { Recipe } from '../../types/recipe'
import { VolumeReading } from '../../types/bottling-variables'

/**
 * Calculate bottle and case counts from tank volume.
 */
export function calculateVolume(batchId: string, tankVolumeGallons: number, recipe: Recipe): VolumeReading {
  const tankVolumeOz = tankVolumeGallons * 128
  const estimatedBottles = Math.floor(tankVolumeOz / recipe.packaging.bottleSize)
  const estimatedCases = Math.floor(estimatedBottles / recipe.packaging.casePack)

  return {
    batchId,
    tankVolume: tankVolumeGallons,
    bottleSize: recipe.packaging.bottleSize,
    estimatedBottles,
    estimatedCases,
  }
}
