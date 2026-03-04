import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { checkInventory } from '../automation/materials/check-inventory'
import { calculateRequirements } from '../automation/materials/calculate-requirements'
import { receiveMaterials } from '../automation/materials/receive-materials'
import { findSuppliersAgent } from '../agents/find-suppliers'
import { generateId } from '../types/shared'
import { MaterialsProcessVariables } from '../types/materials-variables'
import { workerDuration, stepCount } from '../metrics/index'

function withMetrics<T>(workerName: string, workerType: 'llm' | 'automation', handler: (job: any) => T): (job: any) => T {
  return (job) => {
    const end = workerDuration.startTimer({ worker: workerName, type: workerType })
    stepCount.inc({ worker: workerName, type: workerType })
    const result = handler(job)
    if (result && typeof (result as any).then === 'function') {
      return (result as any).then((res: any) => { end(); return res }).catch((err: any) => { end(); throw err }) as T
    }
    end()
    return result
  }
}

export function registerMaterialsWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'check-inventory',
    taskHandler: withMetrics('check-inventory', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const result = checkInventory(vars.recipe)
      console.log(`[check-inventory] \u2713 ${vars.batchId} sufficient=${result.sufficient} shortages=${Object.keys(result.shortages).length}`)
      return job.complete({ inventoryCheck: result } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'calculate-requirements',
    taskHandler: withMetrics('calculate-requirements', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const requirements = calculateRequirements(vars.recipe, 1)
      console.log(`[calculate-requirements] \u2713 ${vars.batchId} ingredients=${Object.keys(requirements).length}`)
      return job.complete({ requirements } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'find-suppliers',
    timeout: 60000,
    taskHandler: withMetrics('find-suppliers', 'llm', async (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const shortages = vars.inventoryCheck?.shortages || {}
      try {
        const decision = await findSuppliersAgent(shortages, vars.recipeId)
        const poId = generateId('PO')
        console.log(`[find-suppliers] \u2713 ${vars.batchId} supplier="${decision.supplier}" cost=$${decision.totalCost}`)
        return job.complete({ supplierDecision: decision, purchaseOrder: { poId, supplier: decision.supplier, totalCost: decision.totalCost, items: decision.items } } as any)
      } catch (err) {
        console.error(`[find-suppliers] \u2717 ${vars.batchId} error:`, err)
        throw err
      }
    }),
  })

  zeebe.createWorker({
    taskType: 'receive-materials',
    taskHandler: withMetrics('receive-materials', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const items = vars.purchaseOrder?.items || vars.supplierDecision?.items || []
      receiveMaterials(items)
      console.log(`[receive-materials] \u2713 ${vars.batchId} items=${items.length} received into inventory`)
      return job.complete({} as any)
    }),
  })

  console.log('[materials] 4 workers registered: check-inventory, calculate-requirements, find-suppliers, receive-materials')
}
