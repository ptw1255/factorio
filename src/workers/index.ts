import { Camunda8 } from '@camunda8/sdk'
import 'dotenv/config'
import { startMetricsServer } from '../metrics/middleware'
import { registerBrewingWorkers } from './brewing'
import { registerBottlingWorkers } from './bottling'
import { registerCratingWorkers } from './crating'
import { registerSalesWorkers } from './sales'
import { registerMaterialsWorkers } from './materials'
import { registerDistributionWorkers } from './distribution'
import { registerAccountingWorkers } from './accounting'

const camunda = new Camunda8()
const zeebe = camunda.getZeebeGrpcApiClient()

startMetricsServer()

// Phase 1: Physical factory
registerBrewingWorkers(zeebe)
registerBottlingWorkers(zeebe)
registerCratingWorkers(zeebe)

// Phase 2: Business layer
registerSalesWorkers(zeebe)
registerMaterialsWorkers(zeebe)
registerDistributionWorkers(zeebe)
registerAccountingWorkers(zeebe)

console.log('\n[FACTORIO] All workers registered. Awaiting jobs...')
console.log('[FACTORIO] Processes: brewing, bottling, crating, sales, materials, distribution, accounting')
console.log('[FACTORIO] Workers: 34 (27 automation, 7 LLM)')
