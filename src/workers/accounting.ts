import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { recordRevenue } from '../automation/accounting/record-revenue'
import { recordMaterialsCost } from '../automation/accounting/record-materials-cost'
import { calculateBatchCost } from '../automation/accounting/calculate-batch-cost'
import { recordShippingCost } from '../automation/accounting/record-shipping-cost'
import { AccountingProcessVariables } from '../types/accounting-variables'
import { parkersKolsch } from '../recipes/parkers-kolsch'
import { withTelemetry } from '../telemetry/with-telemetry'
import { createWorkerLogger } from '../telemetry/logger'
import { cogsTotal, revenueTotal, cashBalance } from '../telemetry/metrics'

const log = createWorkerLogger('accounting', 'accounting')

export function registerAccountingWorkers(zeebe: ZeebeGrpcClient): void {
  zeebe.createWorker({
    taskType: 'record-revenue',
    taskHandler: withTelemetry('accounting', 'record-revenue', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const order = vars.order
      const pricePerCase = vars.amount || parkersKolsch.pricing.basePricePerCase
      const cases = order?.quantity || 1
      const orderId = vars.correlationId
      const recipeId = order?.recipeId || parkersKolsch.id
      const entry = recordRevenue(orderId, recipeId, cases, pricePerCase)
      revenueTotal.add(entry.amount, { recipe: recipeId })
      cashBalance.record(entry.amount)
      log.child({ worker: 'record-revenue' }).info({ orderId, amount: entry.amount, entryId: entry.entryId }, 'revenue recorded')
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'record-materials-cost',
    taskHandler: withTelemetry('accounting', 'record-materials-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const totalCost = vars.purchase?.totalCost || vars.amount || 0
      const poId = vars.correlationId
      const entry = recordMaterialsCost(poId, totalCost)
      cogsTotal.add(entry.amount, { category: 'materials' })
      cashBalance.record(-entry.amount)
      log.child({ worker: 'record-materials-cost' }).info({ poId, amount: entry.amount, entryId: entry.entryId }, 'materials cost recorded')
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'calculate-batch-cost',
    taskHandler: withTelemetry('accounting', 'calculate-batch-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const batchId = vars.correlationId
      const recipe = parkersKolsch
      const casesProduced = vars.amount ? Math.round(vars.amount) : 10
      const costSheet = calculateBatchCost(batchId, recipe, casesProduced)
      cogsTotal.add(costSheet.totalCost, { category: 'production' })
      log.child({ worker: 'calculate-batch-cost' }).info({ batchId, totalCost: costSheet.totalCost, costPerCase: costSheet.costPerCase }, 'batch cost calculated')
      return job.complete({ ledgerEntryId: costSheet.batchId } as any)
    }),
  })

  zeebe.createWorker({
    taskType: 'record-shipping-cost',
    taskHandler: withTelemetry('accounting', 'record-shipping-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const shipmentId = vars.correlationId
      const cost = vars.delivery?.shippingCost || vars.amount || 150
      const entry = recordShippingCost(shipmentId, cost)
      cogsTotal.add(entry.amount, { category: 'shipping' })
      cashBalance.record(-entry.amount)
      log.child({ worker: 'record-shipping-cost' }).info({ shipmentId, amount: entry.amount, entryId: entry.entryId }, 'shipping cost recorded')
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  log.info('4 workers registered: record-revenue, record-materials-cost, calculate-batch-cost, record-shipping-cost')
}
