import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { checkInventory } from '../automation/materials/check-inventory'
import { calculateRequirements } from '../automation/materials/calculate-requirements'
import { receiveMaterials } from '../automation/materials/receive-materials'
import { findSuppliersAgent } from '../agents/find-suppliers'
import { MaterialsProcessVariables } from '../types/materials-variables'
import { generateId } from '../types/shared'
import { workerDuration, stepCount, cogsTotal, inventoryValue } from '../metrics/index'

function withMetrics<T>(
  workerName: string,
  workerType: 'llm' | 'automation',
  handler: (job: any) => T
): (job: any) => T {
  return (job) => {
    const end = workerDuration.startTimer({ worker: workerName, type: workerType })
    stepCount.inc({ worker: workerName, type: workerType })
    const result = handler(job)
    if (result && typeof (result as any).then === 'function') {
      return (result as any)
        .then((res: any) => { end(); return res })
        .catch((err: any) => { end(); throw err }) as T
    }
    end()
    return result
  }
}

export function registerMaterialsWorkers(zeebe: ZeebeGrpcClient): void {
  // 1. Check Inventory (automation)
  zeebe.createWorker({
    taskType: 'check-inventory',
    taskHandler: withMetrics('check-inventory', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const inventoryCheck = checkInventory(vars.recipe)
      const shortageCount = Object.keys(inventoryCheck.shortages).length
      console.log(`[check-inventory] ✓ batch=${vars.batchId} sufficient=${inventoryCheck.sufficient} shortages=${shortageCount}`)
      return job.complete({ inventoryCheck } as any)
    }),
  })

  // 2. Calculate Requirements (automation)
  zeebe.createWorker({
    taskType: 'calculate-requirements',
    taskHandler: withMetrics('calculate-requirements', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const requirements = calculateRequirements(vars.recipe, 1)
      const ingredientCount = Object.keys(requirements).length
      console.log(`[calculate-requirements] ✓ batch=${vars.batchId} ingredients=${ingredientCount}`)
      return job.complete({ requirements } as any)
    }),
  })

  // 3. Find Suppliers (LLM)
  zeebe.createWorker({
    taskType: 'find-suppliers',
    timeout: 60000,
    taskHandler: withMetrics('find-suppliers', 'llm', async (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const shortages = vars.inventoryCheck?.shortages || {}
      try {
        const supplierDecision = await findSuppliersAgent(shortages, vars.recipeId)
        const poId = generateId('PO')
        console.log(`[find-suppliers] ✓ batch=${vars.batchId} supplier="${supplierDecision.supplier}" cost=$${supplierDecision.totalCost} lead=${supplierDecision.leadTimeDays}d`)
        return job.complete({
          supplierDecision,
          purchaseOrder: {
            poId,
            supplier: supplierDecision.supplier,
            totalCost: supplierDecision.totalCost,
            items: supplierDecision.items,
          },
        } as any)
      } catch (err) {
        console.error(`[find-suppliers] ✗ batch=${vars.batchId} error:`, err)
        throw err
      }
    }),
  })

  // 4. Receive Materials (automation)
  zeebe.createWorker({
    taskType: 'receive-materials',
    taskHandler: withMetrics('receive-materials', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const items = vars.purchaseOrder?.items || vars.supplierDecision?.items || []
      receiveMaterials(items)
      const totalCost = vars.purchaseOrder?.totalCost || vars.supplierDecision?.totalCost || 0
      cogsTotal.inc({ category: 'materials' }, totalCost)
      inventoryValue.set({ type: 'raw' }, totalCost)
      console.log(`[receive-materials] ✓ batch=${vars.batchId} items=${items.length} cost=$${totalCost}`)
      return job.complete({} as any)
    }),
  })

  console.log('[materials] 4 workers registered: check-inventory, calculate-requirements, find-suppliers, receive-materials')
}
