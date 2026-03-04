import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.4,
})

const SupplierDecisionSchema = z.object({
  supplier: z.string().describe('Supplier name (e.g., "Great Western Malting", "Yakima Chief Hops")'),
  totalCost: z.number().describe('Total purchase cost in dollars'),
  leadTimeDays: z.number().int().min(1).max(14).describe('Delivery lead time in days'),
  items: z.array(z.object({
    ingredient: z.string(),
    quantity: z.number(),
    unitCost: z.number(),
  })).describe('Items to purchase with unit costs'),
  reasoning: z.string().describe('Brief explanation of supplier choice'),
})

const structured = model.withStructuredOutput(SupplierDecisionSchema)

export async function findSuppliersAgent(
  shortages: Record<string, number>,
  recipeId: string,
): Promise<z.infer<typeof SupplierDecisionSchema>> {
  const shortageList = Object.entries(shortages)
    .map(([ingredient, qty]) => `- ${ingredient}: need ${qty} units`)
    .join('\n')

  const result = await structured.invoke([
    {
      role: 'system',
      content: `You are a brewery procurement agent. Given ingredient shortages, select a supplier and determine purchase quantities and costs. Use realistic brewing supply pricing: grains $1-3/lb, hops $2-8/oz, yeast $6-12/pack. Pick from realistic suppliers (Great Western Malting, Briess, Yakima Chief, BSG, White Labs, etc.). Consider bulk discounts for larger orders.`,
    },
    {
      role: 'user',
      content: `Recipe: ${recipeId}\n\nShortages:\n${shortageList}\n\nFind a supplier and calculate purchase cost.`,
    },
  ])
  return result
}
