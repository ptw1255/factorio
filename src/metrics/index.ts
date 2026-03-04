import { Registry, Histogram, Counter, Gauge, collectDefaultMetrics } from 'prom-client'

export const register = new Registry()

export const workerDuration = new Histogram({
  name: 'factory_worker_duration_seconds',
  help: 'Duration of individual workers in seconds',
  labelNames: ['worker', 'type'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [register],
})

export const stepCount = new Counter({
  name: 'factory_step_count_total',
  help: 'Total steps executed by worker',
  labelNames: ['worker', 'type'] as const,
  registers: [register],
})

export const batchesTotal = new Counter({
  name: 'factory_batches_total',
  help: 'Total batches by recipe and status',
  labelNames: ['recipe', 'status'] as const,
  registers: [register],
})

export const bottlesProduced = new Counter({
  name: 'factory_bottles_produced_total',
  help: 'Total bottles produced',
  labelNames: ['recipe'] as const,
  registers: [register],
})

export const bottlesRejected = new Counter({
  name: 'factory_bottles_rejected_total',
  help: 'Total bottles rejected',
  labelNames: ['recipe', 'reason'] as const,
  registers: [register],
})

export const armCycles = new Counter({
  name: 'factory_arm_cycles_total',
  help: 'Robotic arm cycle count',
  labelNames: ['arm_id'] as const,
  registers: [register],
})

export const armFaults = new Counter({
  name: 'factory_arm_faults_total',
  help: 'Robotic arm fault count',
  labelNames: ['arm_id', 'fault_code'] as const,
  registers: [register],
})

export const conveyorEfficiency = new Gauge({
  name: 'factory_conveyor_efficiency',
  help: 'Conveyor throughput efficiency ratio',
  labelNames: ['conveyor_id'] as const,
  registers: [register],
})

export const activeProcesses = new Gauge({
  name: 'factory_active_processes',
  help: 'Number of active process instances',
  labelNames: ['process'] as const,
  registers: [register],
})

collectDefaultMetrics({ register })
