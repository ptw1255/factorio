import { Camunda8 } from '@camunda8/sdk'
import 'dotenv/config'
import { parkersKolsch } from './recipes/parkers-kolsch'
import { generateId } from './types/shared'

async function startBrew() {
  const camunda = new Camunda8()
  const zeebe = camunda.getZeebeGrpcApiClient()

  const batchId = generateId('BATCH')

  console.log(`Starting brew: ${parkersKolsch.name}`)
  console.log(`Batch ID: ${batchId}`)

  const result = await zeebe.createProcessInstance({
    bpmnProcessId: 'brewing-process',
    variables: {
      batchId,
      recipeId: parkersKolsch.id,
      recipe: parkersKolsch as any,
    },
  })

  console.log(`Process instance started: ${result.processInstanceKey}`)
  console.log(`View in Operate: http://localhost:8088/operate`)

  process.exit(0)
}

startBrew().catch((err) => { console.error('Failed:', err); process.exit(1) })
