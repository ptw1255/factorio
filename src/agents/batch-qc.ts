import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { Recipe } from '../types/recipe'
import { BrewingProcessVariables, BatchQCReport } from '../types/brewing-variables'

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.4,
})

const batchQCSchema = z.object({
  qualityScore: z.number().min(0).max(100).describe('Overall quality score'),
  tastingNotes: z.string().describe('Professional tasting notes, 2-3 sentences'),
  appearance: z.string().describe('Visual assessment: color, clarity, head'),
  aroma: z.string().describe('Aroma assessment: hop character, malt, esters'),
  flavor: z.string().describe('Flavor assessment: balance, bitterness, finish'),
  mouthfeel: z.string().describe('Body, carbonation, warmth'),
  overallImpression: z.string().describe('Summary for the label, 1 sentence'),
  passed: z.boolean().describe('Whether this batch meets quality standards'),
  issues: z.array(z.string()).describe('Any quality concerns, empty if none'),
})

const structuredModel = model.withStructuredOutput(batchQCSchema)

export async function batchQCAgent(
  vars: BrewingProcessVariables,
  recipe: Recipe
): Promise<BatchQCReport> {
  const response = await structuredModel.invoke([
    new SystemMessage(`You are a master brewer and BJCP-certified beer judge evaluating a batch of ${recipe.name} (${recipe.style}). Evaluate the brewing data against style guidelines and produce a quality report. Be specific and honest about any deviations from the target parameters.`),
    new HumanMessage(`
Batch ID: ${vars.batchId}
Recipe: ${recipe.name} (${recipe.style})

Brewing Data:
- Target OG: ${recipe.process.targetOG}, Actual OG: ${vars.mashResult?.wortComposition.gravity || 'unknown'}
- Target FG: ${recipe.process.targetFG}, Actual FG: ${vars.fermentationState?.currentGravity || 'unknown'}
- Target IBU: ${recipe.process.targetIBU}, Actual IBU: ${vars.boilResult?.totalIBU || 'unknown'}
- Target ABV: ${recipe.process.targetABV}%, Calculated ABV: ${vars.finalABV || 'unknown'}%
- Fermentation attenuation: ${vars.fermentationState?.attenuation || 'unknown'}%
- Lagering clarity score: ${vars.lageringResult?.clarityScore || 'unknown'}/10
- Lagering days: ${vars.lageringResult?.daysCompleted || 'unknown'} of ${recipe.process.lageringDays} target

Style Guidelines for ${recipe.style}:
- Appearance: Very pale gold, brilliant clarity, persistent white head
- Aroma: Clean, subtle malt sweetness, low noble hop aroma
- Flavor: Crisp, delicate balance of malt and hops, clean fermentation, dry finish
- Mouthfeel: Light to medium body, medium carbonation, smooth

Evaluate this batch.
`),
  ])

  return {
    batchId: vars.batchId,
    recipeId: vars.recipeId,
    ...response,
  }
}
