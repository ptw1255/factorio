import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { Recipe } from '../types/recipe'
import { LabelData } from '../types/bottling-variables'

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.6,  // more creative for marketing copy
})

const labelSchema = z.object({
  batchNumber: z.string(),
  brewDate: z.string(),
  productName: z.string(),
  style: z.string(),
  abv: z.string(),
  ibu: z.string(),
  description: z.string().describe('2-3 sentence marketing description for the label'),
  tastingNotes: z.string().describe('Concise tasting notes for the label'),
  foodPairings: z.array(z.string()).describe('3-4 food pairing suggestions'),
  servingTemp: z.string(),
})

const structuredModel = model.withStructuredOutput(labelSchema)

export async function labelGenerationAgent(
  batchId: string,
  recipe: Recipe,
  qualityScore: number,
  tastingNotes: string
): Promise<LabelData> {
  const response = await structuredModel.invoke([
    new SystemMessage(`You are a craft brewery marketing specialist creating label content for ${recipe.name}. Generate appealing, accurate label data that highlights the beer's character. Keep the description warm and inviting — this is a small-batch craft beer.`),
    new HumanMessage(`
Batch: ${batchId}
Beer: ${recipe.name} (${recipe.style})
ABV: ${recipe.process.targetABV}%
IBU: ${recipe.process.targetIBU}
Quality Score: ${qualityScore}/100
Brewmaster Tasting Notes: ${tastingNotes}

Grain Bill: ${recipe.grainBill.map(g => g.grain).join(', ')}
Hops: ${recipe.hopSchedule.map(h => h.hop).join(', ')}
Yeast: ${recipe.yeast.strain}

Generate the label content.
`),
  ])

  return response
}
