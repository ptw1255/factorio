import { Camunda8 } from '@camunda8/sdk'
import 'dotenv/config'

async function startAccounting() {
  const camunda = new Camunda8()
  const zeebe = camunda.getZeebeGrpcApiClient()

  const result = await zeebe.createProcessInstance({
    bpmnProcessId: 'accounting-process',
    variables: {
      eventType: 'OrderPlaced',
      correlationId: 'ORD-test-001',
      order: {
        orderId: 'ORD-test-001',
        recipeId: 'parkers-kolsch',
        quantity: 10,
        customerId: 'cust-test',
        priority: 'standard',
        deliveryAddress: '123 Test St',
      },
      amount: 36,
    },
  })
  console.log(`Accounting process started: ${result.processInstanceKey}`)
  process.exit(0)
}

startAccounting().catch((err) => { console.error('Failed:', err); process.exit(1) })
