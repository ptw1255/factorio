import { Camunda8 } from '@camunda8/sdk'
import 'dotenv/config'
import { startMetricsServer } from '../metrics/middleware'
import { registerBrewingWorkers } from './brewing'
import { registerBottlingWorkers } from './bottling'
import { registerCratingWorkers } from './crating'

const camunda = new Camunda8()
const zeebe = camunda.getZeebeGrpcApiClient()

startMetricsServer()

registerBrewingWorkers(zeebe)
registerBottlingWorkers(zeebe)
registerCratingWorkers(zeebe)

console.log('\n[FACTORIO] All Phase 1 workers registered. Awaiting jobs...')
console.log('[FACTORIO] Processes: brewing, bottling, crating')
console.log('[FACTORIO] Workers: 19 (15 automation, 4 LLM)')
