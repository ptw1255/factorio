import { Camunda8 } from '@camunda8/sdk'
import path from 'path'
import 'dotenv/config'

async function deploy() {
  const camunda = new Camunda8()
  const zeebe = camunda.getZeebeGrpcApiClient()

  const bpmnFiles = [
    'brewing-process.bpmn',
    'bottling-process.bpmn',
    'crating-process.bpmn',
  ]

  for (const file of bpmnFiles) {
    console.log(`Deploying ${file}...`)
    const result = await zeebe.deployResource({
      processFilename: path.join(process.cwd(), 'bpmn', file),
    })
    console.log(`  ✓ ${file} deployed:`, result.deployments.map((d: any) => d.process?.bpmnProcessId).join(', '))
  }

  process.exit(0)
}

deploy().catch((err) => { console.error('Deploy failed:', err); process.exit(1) })
