export interface GrainBillEntry {
  grain: string
  quantity: number      // lbs
  percentage: number    // 0-100
}

export interface HopAddition {
  hop: string
  quantity: number      // oz
  additionTime: number  // minutes from end of boil (60 = first addition, 0 = flameout)
  purpose: string       // 'bittering' | 'flavor' | 'aroma' | 'dry hop'
  alphaAcid: number     // percentage e.g. 4.5
}

export interface YeastProfile {
  strain: string
  quantity: number      // packets or grams
  tempRange: { min: number; max: number }  // °F
}

export interface WaterProfile {
  calcium: number       // ppm
  sulfate: number       // ppm
  chloride: number      // ppm
  ratio: number         // sulfate-to-chloride ratio
}

export interface ProcessParameters {
  mashTemp: number          // °F
  mashDuration: number      // minutes
  boilDuration: number      // minutes
  fermentationTemp: number  // °F
  fermentationDays: number
  lageringTemp?: number     // °F (optional — ales skip this)
  lageringDays?: number
  targetOG: number          // original gravity e.g. 1.048
  targetFG: number          // final gravity e.g. 1.008
  targetABV: number         // %
  targetIBU: number
  targetSRM: number
}

export interface PackagingConfig {
  bottleSize: number        // oz
  casePack: number          // bottles per case
  casesPerPallet: number
}

export interface PricingConfig {
  basePricePerCase: number  // wholesale $
  premiumMultiplier: number // e.g. 1.3 for 30% premium
}

export interface Recipe {
  id: string
  name: string
  style: string
  version: number

  grainBill: GrainBillEntry[]
  hopSchedule: HopAddition[]
  yeast: YeastProfile
  waterProfile: WaterProfile

  process: ProcessParameters
  packaging: PackagingConfig
  pricing: PricingConfig
}
