import { Recipe } from '../types/recipe'

export const parkersKolsch: Recipe = {
  id: 'parkers-kolsch',
  name: "Parker's Kolsch",
  style: 'Kolsch',
  version: 1,

  grainBill: [
    { grain: 'Pilsner Malt', quantity: 9, percentage: 100 },
  ],

  hopSchedule: [
    {
      hop: 'Hallertau',
      quantity: 1,
      additionTime: 60,
      purpose: 'bittering',
      alphaAcid: 4.5,
    },
    {
      hop: 'Hallertau',
      quantity: 1,
      additionTime: 15,
      purpose: 'flavor',
      alphaAcid: 4.5,
    },
  ],

  yeast: {
    strain: 'Kolsch Yeast (WLP029)',
    quantity: 2,
    tempRange: { min: 56, max: 60 },
  },

  waterProfile: {
    calcium: 50,
    sulfate: 60,
    chloride: 70,
    ratio: 0.86,
  },

  process: {
    mashTemp: 152,
    mashDuration: 60,
    boilDuration: 60,
    fermentationTemp: 58,
    fermentationDays: 14,
    lageringTemp: 34,
    lageringDays: 28,
    targetOG: 1.048,
    targetFG: 1.008,
    targetABV: 4.8,
    targetIBU: 22,
    targetSRM: 3.5,
  },

  packaging: {
    bottleSize: 12,
    casePack: 24,
    casesPerPallet: 60,
  },

  pricing: {
    basePricePerCase: 36,
    premiumMultiplier: 1.3,
  },
}
