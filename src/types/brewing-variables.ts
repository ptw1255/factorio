import { Recipe } from './recipe'

export interface GravityReading {
  value: number       // specific gravity e.g. 1.048
  timestamp: string
  stage: 'pre-boil' | 'og' | 'fermentation' | 'fg'
}

export interface MashResult {
  mashTemp: number
  duration: number
  wortComposition: {
    volume: number      // gallons
    gravity: number     // pre-boil gravity
    ph: number
  }
}

export interface LauterResult {
  wortVolume: number   // gallons collected
  efficiency: number   // % of theoretical extraction
  spargeWater: number  // gallons used
}

export interface BoilResult {
  preBoilVolume: number
  postBoilVolume: number
  hopAdditions: { hop: string; quantity: number; time: number; ibuContribution: number }[]
  totalIBU: number
  boilDuration: number
  evaporationRate: number
}

export interface CoolingResult {
  startTemp: number
  endTemp: number
  coolingDuration: number
  targetTemp: number
}

export interface FermentationState {
  day: number
  gravityReadings: GravityReading[]
  currentGravity: number
  targetFG: number
  temperatureLog: { temp: number; timestamp: string }[]
  attenuation: number   // % complete
  stuck: boolean
}

export interface LageringResult {
  daysCompleted: number
  targetDays: number
  temp: number
  clarityScore: number  // 1-10
}

export interface BatchQCReport {
  batchId: string
  recipeId: string
  qualityScore: number  // 0-100
  tastingNotes: string
  appearance: string
  aroma: string
  flavor: string
  mouthfeel: string
  overallImpression: string
  passed: boolean
  issues: string[]
}

export interface BrewingProcessVariables {
  batchId: string
  recipeId: string
  recipe: Recipe

  mashResult?: MashResult
  lauterResult?: LauterResult
  boilResult?: BoilResult
  coolingResult?: CoolingResult
  fermentationState?: FermentationState
  lageringResult?: LageringResult
  batchQC?: BatchQCReport

  finalVolume?: number
  finalGravity?: number
  finalABV?: number
}
