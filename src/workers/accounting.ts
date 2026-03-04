import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { recordRevenue } from '../automation/accounting/record-revenue'
import { recordMaterialsCost } from '../automation/accounting/record-materials-cost'
import { calculateBatchCost } from '../automation/accounting/calculate-batch-cost'
import { recordShippingCost } from '../automation/accounting/record-shipping-cost'
import { AccountingProcessVariables } from '../types/accounting-variables'
import { workerDuration, stepCount, revenueTotal, cogsTotal, cashBalance } from '../metrics/index'
import { factoryState } from '../state'

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

export function registerAccountingWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'record-revenue',
    taskHandler: withMetrics('record-revenue', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const order = vars.order!
      const pricePerCase = vars.amount || 36
      const entry = recordRevenue(order.orderId, order.recipeId, order.quantity, pricePerCase)
      revenueTotal.inc({ recipe: order.recipeId }, entry.amount)
      cashBalance.set(factoryState.getAccountBalance('CASH'))
      console.log(`[record-revenue] \u2713 order=${order.orderId} amount=$${entry.amount}`)
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'record-materials-cost',
    taskHandler: withMetrics('record-materials-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const totalCost = vars.purchase?.totalCost || vars.amount || 0
      const entry = recordMaterialsCost(vars.correlationId, totalCost)
      cogsTotal.inc({ category: 'materials' }, entry.amount)
      cashBalance.set(factoryState.getAccountBalance('CASH'))
      console.log(`[record-materials-cost] \u2713 po=${vars.correlationId} amount=$${entry.amount}`)
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'calculate-batch-cost',
    taskHandler: withMetrics('calculate-batch-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const batch = vars.batch!
      const casesProduced = Math.floor((batch.volume || 5) * 128 / 12 / 24) || 50
      const recipe = (vars as any).recipe || require('../recipes/parkers-kolsch').parkersKolsch
      const costSheet = calculateBatchCost(batch.batchId, recipe, casesProduced)
      cogsTotal.inc({ category: 'labor' }, costSheet.totalLabor)
      cogsTotal.inc({ category: 'overhead' }, costSheet.totalOverhead)
      console.log(`[calculate-batch-cost] \u2713 batch=${batch.batchId} total=$${costSheet.totalCost.toFixed(2)} perCase=$${costSheet.costPerCase.toFixed(2)}`)
      return job.complete({ ledgerEntryId: factoryState.getLedger().at(-1)?.entryId, batchCostSheet: costSheet } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'record-shipping-cost',
    taskHandler: withMetrics('record-shipping-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const delivery = vars.delivery!
      const cost = vars.amount || Math.floor(Math.random() * 100) + 50
      const entry = recordShippingCost(delivery.shipmentId, cost)
      cashBalance.set(factoryState.getAccountBalance('CASH'))
      console.log(`[record-shipping-cost] \u2713 shipment=${delivery.shipmentId} amount=$${entry.amount}`)
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  console.log('[accounting] 4 workers registered: record-revenue, record-materials-cost, calculate-batch-cost, record-shipping-cost')
}
