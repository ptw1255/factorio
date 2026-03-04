import { Camunda8 } from '@camunda8/sdk'
import 'dotenv/config'

async function startSales() {
  const camunda = new Camunda8()
  const zeebe = camunda.getZeebeGrpcApiClient()

  console.log('Starting sales process (manual trigger)...')
  const result = await zeebe.createProcessInstance({
    bpmnProcessId: 'sales-process',
    variables: {},
  })
  console.log(`Sales process instance started: ${result.processInstanceKey}`)
  process.exit(0)
}

startSales().catch((err) => { console.error('Failed:', err); process.exit(1) })
