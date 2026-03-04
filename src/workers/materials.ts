import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { checkInventory } from '../automation/materials/check-inventory'
import { calculateRequirements } from '../automation/materials/calculate-requirements'
import { receiveMaterials } from '../automation/materials/receive-materials'
import { findSuppliersAgent } from '../agents/find-suppliers'
import { MaterialsProcessVariables } from '../types/materials-variables'
import { generateId } from '../types/shared'
import { withTelemetry } from '../telemetry/with-telemetry'
import { createWorkerLogger } from '../telemetry/logger'
import { cogsTotal, inventoryValue } from '../telemetry/metrics'

const log = createWorkerLogger('materials', 'materials')

export function registerMaterialsWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'check-inventory',
    taskHandler: withTelemetry('materials', 'check-inventory', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const inventoryCheck = checkInventory(vars.recipe)
      const shortageCount = Object.keys(inventoryCheck.shortages).length
      log.child({ worker: 'check-inventory' }).info({ batchId: vars.batchId, sufficient: inventoryCheck.sufficient, shortages: shortageCount }, 'inventory checked')
      return job.complete({ inventoryCheck } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'calculate-requirements',
    taskHandler: withTelemetry('materials', 'calculate-requirements', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const requirements = calculateRequirements(vars.recipe, 1)
      const ingredientCount = Object.keys(requirements).length
      log.child({ worker: 'calculate-requirements' }).info({ batchId: vars.batchId, ingredients: ingredientCount }, 'requirements calculated')
      return job.complete({ requirements } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'find-suppliers',
    timeout: 60000,
    taskHandler: withTelemetry('materials', 'find-suppliers', 'llm', async (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const shortages = vars.inventoryCheck?.shortages || {}
      const fsLog = log.child({ worker: 'find-suppliers' })
      try {
        const supplierDecision = await findSuppliersAgent(shortages, vars.recipeId)
        const poId = generateId('PO')
        fsLog.info({ batchId: vars.batchId, supplier: supplierDecision.supplier, cost: supplierDecision.totalCost, lead: supplierDecision.leadTimeDays }, 'supplier found')
        return job.complete({
          supplierDecision,
          purchaseOrder: { poId, supplier: supplierDecision.supplier, totalCost: supplierDecision.totalCost, items: supplierDecision.items },
        } as any)
      } catch (err) {
        fsLog.error({ batchId: vars.batchId, err }, 'supplier search failed')
        throw err
      }
    }),
  })

  zeebe.createWorker({
    taskType: 'receive-materials',
    taskHandler: withTelemetry('materials', 'receive-materials', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const items = vars.purchaseOrder?.items || vars.supplierDecision?.items || []
      receiveMaterials(items)
      const totalCost = vars.purchaseOrder?.totalCost || vars.supplierDecision?.totalCost || 0
      cogsTotal.add(totalCost, { category: 'materials' })
      inventoryValue.record(totalCost, { type: 'raw' })
      log.child({ worker: 'receive-materials' }).info({ batchId: vars.batchId, items: items.length, cost: totalCost }, 'materials received')
      return job.complete({} as any)
    }),
  })

  log.info('4 workers registered: check-inventory, calculate-requirements, find-suppliers, receive-materials')
}
