import { Recipe } from '../../types/recipe'
import { FermentationState, GravityReading } from '../../types/brewing-variables'

/**
 * Initialize fermentation state from recipe and OG reading.
 */
export function initFermentation(recipe: Recipe, ogReading: number): FermentationState {
  const now = new Date().toISOString()
  return {
    day: 0,
    gravityReadings: [{ value: ogReading, timestamp: now, stage: 'og' }],
    currentGravity: ogReading,
    targetFG: recipe.process.targetFG,
    temperatureLog: [{ temp: recipe.process.fermentationTemp, timestamp: now }],
    attenuation: 0,
    stuck: false,
  }
}

/**
 * Simulate one day of fermentation — gravity drops exponentially toward target FG.
 * Detects stuck fermentation if gravity hasn't dropped in 3 consecutive checks.
 */
export function checkFermentation(state: FermentationState, recipe: Recipe): FermentationState {
  const now = new Date().toISOString()
  const day = state.day + 1

  // Exponential decay toward target FG
  // Rate is faster early (days 1-3), slower later
  const decayRate = day <= 3 ? 0.25 : 0.10
  const gravityRange = state.currentGravity - state.targetFG
  const drop = gravityRange * decayRate * (0.8 + Math.random() * 0.4)
  const newGravity = Math.max(state.targetFG, state.currentGravity - drop)

  // Round to 3 decimal places
  const roundedGravity = Math.round(newGravity * 1000) / 1000

  const reading: GravityReading = {
    value: roundedGravity,
    timestamp: now,
    stage: 'fermentation',
  }

  const gravityReadings = [...state.gravityReadings, reading]

  // Calculate attenuation: (OG - current) / (OG - 1.000) * 100
  const og = state.gravityReadings[0].value
  const attenuation = ((og - roundedGravity) / (og - 1.000)) * 100

  // Stuck detection: check last 3 readings — if gravity hasn't dropped
  const recentReadings = gravityReadings.slice(-3)
  let stuck = false
  if (recentReadings.length >= 3) {
    const gravities = recentReadings.map((r) => r.value)
    const maxDiff = Math.max(...gravities) - Math.min(...gravities)
    stuck = maxDiff < 0.001 && roundedGravity > state.targetFG + 0.002
  }

  // Temperature with slight variation
  const tempVariation = (Math.random() - 0.5) * 1
  const temp = recipe.process.fermentationTemp + tempVariation

  return {
    day,
    gravityReadings,
    currentGravity: roundedGravity,
    targetFG: state.targetFG,
    temperatureLog: [...state.temperatureLog, { temp: Math.round(temp * 10) / 10, timestamp: now }],
    attenuation: Math.round(attenuation * 10) / 10,
    stuck,
  }
}
