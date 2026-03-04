import { Recipe } from './recipe'

export interface VolumeReading {
  batchId: string
  tankVolume: number         // gallons
  bottleSize: number         // oz
  estimatedBottles: number
  estimatedCases: number
}

export interface LabelData {
  batchNumber: string
  brewDate: string
  productName: string
  style: string
  abv: string
  ibu: string
  description: string
  tastingNotes: string
  foodPairings: string[]
  servingTemp: string
}

export interface FillingResult {
  bottlesFilled: number
  bottlesBroken: number
  fillRate: number           // bottles/min
  wastePercentage: number
}

export interface QualitySample {
  carbonation: { level: number; target: number; passed: boolean }
  clarity: { score: number; passed: boolean }
  abv: { measured: number; target: number; deviation: number; passed: boolean }
  overallPassed: boolean
}

export interface BottlingProcessVariables {
  batchId: string
  recipeId: string
  recipe: Recipe
  qualityScore: number
  tastingNotes: string

  volumeReading?: VolumeReading
  labelData?: LabelData
  fillingResult?: FillingResult
  qualitySample?: QualitySample
}
