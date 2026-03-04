export interface ArmFault {
  faultCode: 'GRIP_LOST' | 'OVER_TEMP' | 'COLLISION_DETECT' | 'VIBRATION_LIMIT' | 'CRUSH_RISK' | 'ENCODER_ERROR'
  severity: 'warning' | 'error' | 'critical'
  timestamp: string
  jointPositions: { shoulder: number; elbow: number; wrist: number; extension: number }
  recoveryAction: string
  resolved: boolean
}

export interface RoboticArmTelemetry {
  armId: string
  status: 'idle' | 'homing' | 'picking' | 'placing' | 'sealing' | 'stacking' | 'fault' | 'recovering'
  joints: { shoulder: number; elbow: number; wrist: number; extension: number }
  velocity: number
  targetPosition: { x: number; y: number; z: number }
  currentPosition: { x: number; y: number; z: number }
  positionError: number
  gripperState: 'open' | 'closing' | 'closed' | 'releasing'
  gripperPressure: number
  gripperPressureMin: number
  gripperPressureMax: number
  motorTemperature: number
  vibrationLevel: number
  cycleCount: number
  cyclesSinceLastMaintenance: number
  bearingWearIndex: number
  faultHistory: ArmFault[]
  meanTimeBetweenFailures: number
}

export interface ConveyorTelemetry {
  conveyorId: string
  running: boolean
  speed: number
  targetSpeed: number
  photoeyeSensors: { entry: boolean; exit: boolean; count: number }
  bufferLevel: number
  bufferCapacity: number
  backpressure: boolean
  motorCurrent: number
  beltTension: number
  jamDetected: boolean
  jamLocation?: string
  throughputActual: number
  throughputTarget: number
  efficiency: number
}

export interface VisionInspection {
  bottleId: string
  defects: {
    crack: { detected: boolean; confidence: number }
    chip: { detected: boolean; confidence: number }
    underfill: { detected: boolean; confidence: number; fillLevel?: number }
    label: { present: boolean; aligned: boolean; readable: boolean }
    foreignObject: { detected: boolean; confidence: number }
  }
  overallVerdict: 'pass' | 'reject' | 'review'
  confidenceScore: number
}
