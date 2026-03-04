import { initTelemetry } from '../telemetry'
import 'dotenv/config'

// Initialize OTel SDK BEFORE importing anything else that creates spans/metrics
initTelemetry()

import { Camunda8 } from '@camunda8/sdk'
import { registerBrewingWorkers } from './brewing'
import { registerBottlingWorkers } from './bottling'
import { registerCratingWorkers } from './crating'
import { registerSalesWorkers } from './sales'
import { registerMaterialsWorkers } from './materials'
import { registerDistributionWorkers } from './distribution'
import { registerAccountingWorkers } from './accounting'
import { logger } from '../telemetry/logger'

const camunda = new Camunda8()
const zeebe = camunda.getZeebeGrpcApiClient()

// Phase 1: Physical factory
registerBrewingWorkers(zeebe)
registerBottlingWorkers(zeebe)
registerCratingWorkers(zeebe)

// Phase 2: Business layer
registerSalesWorkers(zeebe)
registerMaterialsWorkers(zeebe)
registerDistributionWorkers(zeebe)
registerAccountingWorkers(zeebe)

logger.info({ processes: ['brewing', 'bottling', 'crating', 'sales', 'materials', 'distribution', 'accounting'], workerCount: 34 }, 'All workers registered. Awaiting jobs...')
