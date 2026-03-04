import { Camunda8 } from '@camunda8/sdk'
import 'dotenv/config'
import { parkersKolsch } from './recipes/parkers-kolsch'
import { generateId } from './types/shared'

async function startMaterials() {
  const camunda = new Camunda8()
  const zeebe = camunda.getZeebeGrpcApiClient()

  const batchId = generateId('BATCH')
  console.log(`Starting materials process for: ${parkersKolsch.name}`)
  console.log(`Batch ID: ${batchId}`)

  const result = await zeebe.createProcessInstance({
    bpmnProcessId: 'materials-process',
    variables: {
      orderId: generateId('ORD'),
      recipeId: parkersKolsch.id,
      recipe: parkersKolsch as any,
      batchId,
    },
  })
  console.log(`Materials process started: ${result.processInstanceKey}`)
  process.exit(0)
}

startMaterials().catch((err) => { console.error('Failed:', err); process.exit(1) })
