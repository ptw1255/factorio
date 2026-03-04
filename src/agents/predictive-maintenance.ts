import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { RoboticArmTelemetry } from '../types/telemetry'

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.2,
})

const maintenanceSchema = z.object({
  prediction: z.string().describe('What is likely to fail and when'),
  confidence: z.number().min(0).max(1).describe('Confidence in prediction'),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).describe('How urgently maintenance is needed'),
  recommendedAction: z.string().describe('Specific maintenance action to take'),
  estimatedDowntime: z.string().describe('Estimated downtime if maintenance is performed now'),
  riskIfDeferred: z.string().describe('What happens if maintenance is deferred'),
})

const structuredModel = model.withStructuredOutput(maintenanceSchema)

export async function predictiveMaintenanceAgent(
  armTelemetry: RoboticArmTelemetry
): Promise<{
  prediction: string
  confidence: number
  urgency: 'low' | 'medium' | 'high' | 'critical'
  recommendedAction: string
  estimatedDowntime: string
  riskIfDeferred: string
}> {
  const recentFaults = armTelemetry.faultHistory.slice(-5)

  const response = await structuredModel.invoke([
    new SystemMessage(`You are a predictive maintenance AI for a robotic packaging line. Analyze the arm telemetry data to predict failures and recommend maintenance actions. Consider vibration trends, temperature, cycle counts, fault history, and bearing wear. Be specific and actionable.`),
    new HumanMessage(`
Arm: ${armTelemetry.armId}
Status: ${armTelemetry.status}
Cycle Count: ${armTelemetry.cycleCount}
Cycles Since Maintenance: ${armTelemetry.cyclesSinceLastMaintenance}
Motor Temperature: ${armTelemetry.motorTemperature}°C
Vibration Level: ${armTelemetry.vibrationLevel} mm/s RMS
Bearing Wear Index: ${(armTelemetry.bearingWearIndex * 100).toFixed(1)}%
MTBF: ${armTelemetry.meanTimeBetweenFailures} cycles
Gripper Pressure Range: ${armTelemetry.gripperPressureMin}-${armTelemetry.gripperPressureMax} PSI

Recent Faults (last 5):
${recentFaults.length > 0
  ? recentFaults.map(f => `  ${f.faultCode} (${f.severity}) — ${f.recoveryAction}`).join('\n')
  : '  None'}

Analyze this arm and predict maintenance needs.
`),
  ])

  return response
}
