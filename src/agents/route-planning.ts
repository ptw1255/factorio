import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.5,
})

const RoutePlanSchema = z.object({
  truckId: z.string().describe('Truck identifier (e.g., "TRUCK-14")'),
  estimatedDistance: z.number().describe('Distance in miles'),
  estimatedHours: z.number().describe('Estimated delivery time in hours'),
  route: z.string().describe('Brief route description'),
})

const structured = model.withStructuredOutput(RoutePlanSchema)

export async function routePlanningAgent(
  deliveryAddress: string,
  palletCount: number,
  totalWeight: number,
): Promise<z.infer<typeof RoutePlanSchema>> {
  const result = await structured.invoke([
    {
      role: 'system',
      content: `You plan brewery delivery routes. Given a delivery address, assign a truck and plan a route from the brewery in Portland, OR. Use realistic distances and times. Truck IDs are TRUCK-01 through TRUCK-08. Consider load size when selecting truck.`,
    },
    {
      role: 'user',
      content: `Plan delivery route:\n- Destination: ${deliveryAddress}\n- Pallets: ${palletCount}\n- Weight: ${totalWeight} lbs`,
    },
  ])
  return result
}
