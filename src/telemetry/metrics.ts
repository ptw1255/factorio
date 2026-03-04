import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('factorio-brewery', '0.2.0')

// --- Phase 1: Factory metrics ---

export const workerDuration = meter.createHistogram('factory_worker_duration_seconds', {
  description: 'Duration of individual workers in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  },
})

export const stepCount = meter.createCounter('factory_step_count_total', {
  description: 'Total steps executed by worker',
})

export const batchesTotal = meter.createCounter('factory_batches_total', {
  description: 'Total batches by recipe and status',
})

export const bottlesProduced = meter.createCounter('factory_bottles_produced_total', {
  description: 'Total bottles produced',
})

export const bottlesRejected = meter.createCounter('factory_bottles_rejected_total', {
  description: 'Total bottles rejected',
})

export const armCycles = meter.createCounter('factory_arm_cycles_total', {
  description: 'Robotic arm cycle count',
})

export const armFaults = meter.createCounter('factory_arm_faults_total', {
  description: 'Robotic arm fault count',
})

export const conveyorEfficiency = meter.createGauge('factory_conveyor_efficiency', {
  description: 'Conveyor throughput efficiency ratio',
})

export const activeProcesses = meter.createGauge('factory_active_processes', {
  description: 'Number of active process instances',
})

// --- Phase 2: Business metrics ---

export const ordersTotal = meter.createCounter('factory_orders_total', {
  description: 'Total orders by priority and fulfillment status',
})

export const revenueTotal = meter.createCounter('factory_revenue_total', {
  description: 'Total revenue in dollars',
})

export const cogsTotal = meter.createCounter('factory_cogs_total', {
  description: 'Total cost of goods sold',
})

export const cashBalance = meter.createGauge('factory_cash_balance', {
  description: 'Current cash balance',
})

export const inventoryValue = meter.createGauge('factory_inventory_value', {
  description: 'Current inventory value',
})

export const deliveriesTotal = meter.createCounter('factory_deliveries_total', {
  description: 'Total deliveries by status',
})
