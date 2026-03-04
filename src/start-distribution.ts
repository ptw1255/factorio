import { Camunda8 } from '@camunda8/sdk'
import 'dotenv/config'
import { generateId } from './types/shared'

async function startDistribution() {
  const camunda = new Camunda8()
  const zeebe = camunda.getZeebeGrpcApiClient()

  const shipmentId = generateId('SHIP')
  console.log(`Starting distribution: ${shipmentId}`)

  const result = await zeebe.createProcessInstance({
    bpmnProcessId: 'distribution-process',
    variables: {
      shipmentId,
      batchId: 'BATCH-test',
      orderId: 'ORD-test',
      palletCount: 2,
      totalWeight: 1800,
      deliveryAddress: '456 Tap Room Lane, Seattle, WA 98101',
    },
  })
  console.log(`Distribution process started: ${result.processInstanceKey}`)
  process.exit(0)
}

startDistribution().catch((err) => { console.error('Failed:', err); process.exit(1) })
