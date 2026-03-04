import { ConveyorTelemetry } from '../../types/telemetry'

/**
 * Initialize a conveyor belt.
 */
export function initConveyor(conveyorId: string, targetSpeed: number, bufferCapacity: number): ConveyorTelemetry {
  return {
    conveyorId,
    running: true,
    speed: targetSpeed,
    targetSpeed,
    photoeyeSensors: { entry: false, exit: false, count: 0 },
    bufferLevel: 0,
    bufferCapacity,
    backpressure: false,
    motorCurrent: 2.0 + Math.random() * 0.5,
    beltTension: 50 + Math.random() * 10,
    jamDetected: false,
    throughputActual: targetSpeed * 0.95,
    throughputTarget: targetSpeed,
    efficiency: 0.95,
  }
}

/**
 * Check conveyor health — update throughput, detect jams.
 */
export function checkConveyorHealth(conveyor: ConveyorTelemetry): ConveyorTelemetry {
  const updated = { ...conveyor }

  // Throughput variation
  updated.throughputActual = updated.throughputTarget * (0.85 + Math.random() * 0.15)
  updated.efficiency = updated.throughputActual / updated.throughputTarget

  // Motor current with random walk
  updated.motorCurrent += (Math.random() - 0.5) * 0.3
  updated.motorCurrent = Math.max(1.5, Math.min(6.0, updated.motorCurrent))

  // Belt tension with random walk
  updated.beltTension += (Math.random() - 0.5) * 2
  updated.beltTension = Math.max(40, Math.min(70, updated.beltTension))

  // Jam detection: motor current spike + simulated photoeye blockage
  const currentSpike = updated.motorCurrent > 5.0
  const photoeyeBlocked = Math.random() < 0.005 // rare
  updated.jamDetected = currentSpike || photoeyeBlocked

  if (updated.jamDetected) {
    updated.jamLocation = photoeyeBlocked ? 'photoeye-entry' : 'motor-overload'
    updated.running = false
    updated.speed = 0
  }

  // Buffer level changes
  updated.bufferLevel = Math.max(0, Math.min(
    updated.bufferCapacity,
    updated.bufferLevel + (Math.random() - 0.5) * 10
  ))
  updated.backpressure = updated.bufferLevel > updated.bufferCapacity * 0.9

  // Photoeye count increments
  updated.photoeyeSensors = {
    ...updated.photoeyeSensors,
    count: updated.photoeyeSensors.count + Math.round(updated.throughputActual / 60),
  }

  return updated
}
