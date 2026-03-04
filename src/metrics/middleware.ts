import express from 'express'
import { register } from './index'

export function startMetricsServer(port = 9464): void {
  const app = express()

  app.get('/metrics', async (_req, res) => {
    try {
      const metrics = await register.metrics()
      res.set('Content-Type', register.contentType)
      res.end(metrics)
    } catch (err) {
      res.status(500).end(String(err))
    }
  })

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.listen(port, () => {
    console.log(`[metrics] Prometheus metrics available at http://localhost:${port}/metrics`)
  })
}
