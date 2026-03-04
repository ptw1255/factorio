import { Recipe } from './recipe'
import { RoboticArmTelemetry, ConveyorTelemetry, VisionInspection } from './telemetry'

export interface LineStatus {
  initialized: boolean
  inspectorArm: RoboticArmTelemetry
  casePackerArm: RoboticArmTelemetry
  palletizerArm: RoboticArmTelemetry
  conveyorA: ConveyorTelemetry
  conveyorB: ConveyorTelemetry
  conveyorC: ConveyorTelemetry
}

export interface InspectionBatchResult {
  batchSize: number
  passed: number
  rejected: number
  review: number
  inspections: VisionInspection[]
  defectSummary: Record<string, number>
}

export interface CasePackingResult {
  casesPackedThisCycle: number
  totalCasesPacked: number
  armState: RoboticArmTelemetry
  cyclesThisSession: number
  faultsThisSession: number
}

export interface PalletBuildResult {
  palletId: string
  layers: number
  casesPerLayer: number
  totalCases: number
  totalWeight: number   // lbs
  stable: boolean
  weightDistribution: { center: number; edge: number }
}

export interface CratingProcessVariables {
  batchId: string
  recipeId: string
  recipe: Recipe
  bottleCount: number

  lineStatus?: LineStatus
  inspectionResult?: InspectionBatchResult
  casePackingResult?: CasePackingResult
  palletResult?: PalletBuildResult
  maintenancePrediction?: {
    armId: string
    prediction: string
    confidence: number
    urgency: 'low' | 'medium' | 'high' | 'critical'
    recommendedAction: string
  }
}
