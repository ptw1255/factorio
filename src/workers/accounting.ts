import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { recordRevenue } from '../automation/accounting/record-revenue'
import { recordMaterialsCost } from '../automation/accounting/record-materials-cost'
import { calculateBatchCost } from '../automation/accounting/calculate-batch-cost'
import { recordShippingCost } from '../automation/accounting/record-shipping-cost'
import { AccountingProcessVariables } from '../types/accounting-variables'
import { parkersKolsch } from '../recipes/parkers-kolsch'
import { workerDuration, stepCount, cogsTotal, revenueTotal, cashBalance } from '../metrics/index'

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

export function registerAccountingWorkers(zeebe: ZeebeGrpcClient): void {
  // 1. Record Revenue (automation)
  zeebe.createWorker({
    taskType: 'record-revenue',
    taskHandler: withMetrics('record-revenue', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const order = vars.order
      const pricePerCase = vars.amount || parkersKolsch.pricing.basePricePerCase
      const cases = order?.quantity || 1
      const orderId = vars.correlationId
      const recipeId = order?.recipeId || parkersKolsch.id
      const entry = recordRevenue(orderId, recipeId, cases, pricePerCase)
      revenueTotal.inc({ recipe: recipeId }, entry.amount)
      cashBalance.inc(entry.amount)
      console.log(`[record-revenue] ✓ order=${orderId} amount=$${entry.amount} entry=${entry.entryId}`)
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  // 2. Record Materials Cost (automation)
  zeebe.createWorker({
    taskType: 'record-materials-cost',
    taskHandler: withMetrics('record-materials-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const totalCost = vars.purchase?.totalCost || vars.amount || 0
      const poId = vars.correlationId
      const entry = recordMaterialsCost(poId, totalCost)
      cogsTotal.inc({ category: 'materials' }, entry.amount)
      cashBalance.dec(entry.amount)
      console.log(`[record-materials-cost] ✓ po=${poId} amount=$${entry.amount} entry=${entry.entryId}`)
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  // 3. Calculate Batch Cost (automation)
  zeebe.createWorker({
    taskType: 'calculate-batch-cost',
    taskHandler: withMetrics('calculate-batch-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const batchId = vars.correlationId
      const recipe = parkersKolsch
      const casesProduced = vars.batch?.costPerCase ? Math.round(vars.amount || 10) : 10
      const costSheet = calculateBatchCost(batchId, recipe, casesProduced)
      cogsTotal.inc({ category: 'production' }, costSheet.totalCost)
      console.log(`[calculate-batch-cost] ✓ batch=${batchId} totalCost=$${costSheet.totalCost} costPerCase=$${costSheet.costPerCase.toFixed(2)}`)
      return job.complete({ ledgerEntryId: costSheet.batchId } as any)
    }),
  })

  // 4. Record Shipping Cost (automation)
  zeebe.createWorker({
    taskType: 'record-shipping-cost',
    taskHandler: withMetrics('record-shipping-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const shipmentId = vars.correlationId
      const cost = vars.delivery?.shippingCost || vars.amount || 150
      const entry = recordShippingCost(shipmentId, cost)
      cogsTotal.inc({ category: 'shipping' }, entry.amount)
      cashBalance.dec(entry.amount)
      console.log(`[record-shipping-cost] ✓ shipment=${shipmentId} amount=$${entry.amount} entry=${entry.entryId}`)
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  console.log('[accounting] 4 workers registered: record-revenue, record-materials-cost, calculate-batch-cost, record-shipping-cost')
}
