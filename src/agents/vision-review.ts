import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { VisionInspection } from '../types/telemetry'

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.1, // conservative for quality decisions
})

const reviewSchema = z.object({
  finalVerdict: z.enum(['pass', 'reject']).describe('Final decision on this bottle'),
  reasoning: z.string().describe('Brief explanation of the decision'),
  confidence: z.number().min(0).max(1).describe('Confidence in this decision'),
  defectType: z.string().optional().describe('Primary defect type if rejected'),
})

const structuredModel = model.withStructuredOutput(reviewSchema)

export async function visionReviewAgent(
  inspection: VisionInspection
): Promise<{ finalVerdict: 'pass' | 'reject'; reasoning: string; confidence: number; defectType?: string }> {
  const defectSummary = Object.entries(inspection.defects)
    .map(([type, data]) => {
      if (type === 'label') {
        const label = data as { present: boolean; aligned: boolean; readable: boolean }
        return `Label: present=${label.present}, aligned=${label.aligned}, readable=${label.readable}`
      }
      const defect = data as { detected: boolean; confidence: number }
      return `${type}: detected=${defect.detected}, confidence=${defect.confidence.toFixed(2)}`
    })
    .join('\n')

  const response = await structuredModel.invoke([
    new SystemMessage(`You are a quality control AI reviewing a bottle inspection with ambiguous results. The automated vision system flagged this bottle for review (confidence between 0.4-0.8). Make a final pass/reject decision based on the defect data. Err on the side of caution — reject if there's meaningful risk.`),
    new HumanMessage(`
Bottle ID: ${inspection.bottleId}
Overall Confidence: ${inspection.confidenceScore}

Defect Analysis:
${defectSummary}

Should this bottle pass or be rejected?
`),
  ])

  return response
}
