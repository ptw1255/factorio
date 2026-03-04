import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.8,
})

const OrderSchema = z.object({
  customerId: z.string().describe('Unique customer ID like "cust-brewery-name"'),
  customerName: z.string().describe('Realistic bar, restaurant, or store name'),
  deliveryAddress: z.string().describe('Realistic US address'),
  quantity: z.number().int().min(1).max(50).describe('Number of cases ordered (1-50)'),
  priority: z.enum(['standard', 'express', 'event']).describe('Order priority'),
  notes: z.string().describe('Brief order note'),
})

const structured = model.withStructuredOutput(OrderSchema)

export async function generateOrderAgent(recipeId: string, recipeName: string): Promise<z.infer<typeof OrderSchema>> {
  const result = await structured.invoke([
    {
      role: 'system',
      content: `You generate realistic brewery sales orders. Create varied, believable orders for "${recipeName}" (recipe: ${recipeId}). Mix of bars, restaurants, liquor stores, and event venues. Vary quantity (small=1-5 cases, medium=5-15, large=15-50). Most orders are standard priority, some express, rarely event. Keep notes brief and realistic.`,
    },
    {
      role: 'user',
      content: `Generate a new sales order for ${recipeName}.`,
    },
  ])
  return result
}
