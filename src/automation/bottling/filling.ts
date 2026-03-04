import { VolumeReading } from '../../types/bottling-variables'
import { FillingResult } from '../../types/bottling-variables'

/**
 * Simulate the bottle filling process.
 * ~1.5-2.5% breakage, 30-60 bottles/min fill rate.
 */
export function simulateFilling(volumeReading: VolumeReading): FillingResult {
  const breakageRate = 0.015 + Math.random() * 0.01
  const bottlesBroken = Math.round(volumeReading.estimatedBottles * breakageRate)
  const bottlesFilled = volumeReading.estimatedBottles - bottlesBroken
  const fillRate = 30 + Math.random() * 30
  const wastePercentage = Math.round(breakageRate * 10000) / 100

  return {
    bottlesFilled,
    bottlesBroken,
    fillRate: Math.round(fillRate * 10) / 10,
    wastePercentage,
  }
}
