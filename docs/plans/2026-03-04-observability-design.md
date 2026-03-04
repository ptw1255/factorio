# FACTORIO Observability Design — OpenTelemetry-First

## Overview

Replace the existing prom-client metrics-only setup with a unified OpenTelemetry SDK that handles all three observability pillars (metrics, logs, traces) through a single API. An OTel Collector routes signals to Prometheus (metrics), Loki (logs), and Tempo (traces). Grafana serves as the command center with 3 provisioned dashboards.

## Architecture

```
Node.js App (OTel SDK + Pino)
  ├─ metrics ──→ OTLP ──→ OTel Collector ──→ :8889/metrics ──→ Prometheus ──→ Grafana
  ├─ logs ─────→ OTLP ──→ OTel Collector ──→ Loki ───────────────────────────→ Grafana
  └─ traces ───→ OTLP ──→ OTel Collector ──→ Tempo ──────────────────────────→ Grafana
```

The app speaks only OTLP — zero vendor-specific code. The Collector handles all routing.

## What Changes

### Removed

- `prom-client` dependency
- `src/metrics/index.ts` (15 metrics defined via prom-client)
- `src/metrics/middleware.ts` (Express server on :9464)
- `withMetrics` function duplicated in 7 worker files
- `console.log` calls in all workers

### New Files

| File | Purpose |
|------|---------|
| `src/telemetry/index.ts` | OTel SDK initialization (NodeSDK, auto-instrumentations, OTLP exporters) |
| `src/telemetry/metrics.ts` | 15 metrics recreated via OTel Meter API (same names/labels) |
| `src/telemetry/logger.ts` | Pino logger instance, bridged to OTel via instrumentation-pino |
| `src/telemetry/with-telemetry.ts` | Shared wrapper replacing 7 copies of `withMetrics` — creates spans, records duration, attaches context |
| `docker/otel-collector.yaml` | OTel Collector pipeline config |

### Modified Files

| File | Change |
|------|--------|
| `src/workers/*.ts` (7 files) | Replace `withMetrics` with `withTelemetry`, replace `console.log` with `logger` |
| `src/workers/index.ts` | Import telemetry init instead of metrics middleware |
| `docker/docker-compose.yaml` | Add otel-collector, loki, tempo containers; update grafana datasources |
| `docker/prometheus.yml` | Scrape from otel-collector:8889 instead of host.docker.internal:9464 |
| `docker/grafana/provisioning/datasources/` | Add Loki + Tempo datasources with derived fields |
| `package.json` | Replace prom-client with @opentelemetry/* packages, add pino |

### Unchanged

- All automation modules (`src/automation/*`)
- All LLM agents (`src/agents/*`)
- All BPMN files
- All type definitions
- State store

## Telemetry Data Model

### Correlation Attributes

Every signal carries the same context keys for cross-signal drill-down:

| Attribute | Example | Carried In |
|-----------|---------|-----------|
| `factory.process` | `brewing`, `sales` | Spans, logs, metric labels |
| `factory.worker` | `mashing`, `generate-order` | Spans, logs, metric labels |
| `factory.worker_type` | `llm`, `automation` | Spans, logs, metric labels |
| `factory.batch_id` | `BATCH-49a3b1e9` | Span attributes, log fields |
| `factory.order_id` | `ORD-cf1bad6a` | Span attributes, log fields |
| `factory.shipment_id` | `SHIP-53a769b3` | Span attributes, log fields |

### Trace Hierarchy

```
Process Instance (root span)
  └─ Worker: mashing (child span)
      ├─ attribute: factory.batch_id = BATCH-xxx
      ├─ attribute: factory.worker_type = automation
      ├─ event: "mash started at 155°F"
      └─ Zeebe gRPC call (auto-instrumented child span)
```

LLM worker spans additionally capture:
- `llm.model` — `gemini-2.5-flash`
- `llm.duration_ms` — LLM call time
- `llm.error` — true/false

### Metrics (OTel Meter API)

All 15 existing metrics recreated 1:1 with identical names and labels:

| Metric | OTel Type | Labels |
|--------|-----------|--------|
| `factory_worker_duration_seconds` | Histogram | `worker`, `type` |
| `factory_step_count_total` | Counter | `worker`, `type` |
| `factory_batches_total` | Counter | `recipe`, `status` |
| `factory_bottles_produced_total` | Counter | `recipe` |
| `factory_bottles_rejected_total` | Counter | `recipe`, `reason` |
| `factory_arm_cycles_total` | Counter | `arm_id` |
| `factory_arm_faults_total` | Counter | `arm_id`, `fault_code` |
| `factory_conveyor_efficiency` | Gauge | `conveyor_id` |
| `factory_active_processes` | Gauge | `process` |
| `factory_orders_total` | Counter | `priority`, `fulfillment` |
| `factory_revenue_total` | Counter | `recipe` |
| `factory_cogs_total` | Counter | `category` |
| `factory_cash_balance` | Gauge | — |
| `factory_inventory_value` | Gauge | `type` |
| `factory_deliveries_total` | Counter | `status` |

## Infrastructure

### New Docker Containers

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| `otel-collector` | `otel/opentelemetry-collector-contrib` | 4317 (gRPC), 4318 (HTTP), 8889 (Prom) | Receives OTLP, routes to backends |
| `loki` | `grafana/loki:3.4` | 3100 | Log storage |
| `tempo` | `grafana/tempo:2.7` | 3200 | Trace storage |

### OTel Collector Pipeline

```
Receivers:
  otlp:
    protocols:
      grpc: :4317
      http: :4318

Exporters:
  prometheus:
    endpoint: :8889
  otlphttp/loki:
    endpoint: http://loki:3100/otlp
  otlp/tempo:
    endpoint: tempo:4317

Pipelines:
  metrics:  receivers: [otlp] → exporters: [prometheus]
  logs:     receivers: [otlp] → exporters: [otlphttp/loki]
  traces:   receivers: [otlp] → exporters: [otlp/tempo]
```

### Prometheus Config Update

```yaml
scrape_configs:
  - job_name: "factorio-brewery"
    scrape_interval: 5s
    static_configs:
      - targets: ["otel-collector:8889"]  # was host.docker.internal:9464
```

### Grafana Datasources

- Prometheus: `http://prometheus:9090` (existing)
- Loki: `http://loki:3100` (new) — derived field: traceId → Tempo
- Tempo: `http://tempo:3200` (new)

## Grafana Dashboards

### 1. Factory Overview (command center)

- Row 1: Process throughput (7 processes, instances/min), active instances gauge, error rate
- Row 2: Worker duration heatmap (all 34 workers), p50/p95/p99 latency
- Row 3: Recent traces table (click → Tempo), recent error logs from Loki
- Variables: `$process` dropdown to filter

### 2. LLM Performance

- Row 1: LLM call latency histogram per agent, success/failure rate
- Row 2: Calls per minute by agent, error log panel filtered to LLM workers
- Row 3: Trace search scoped to LLM spans

### 3. Business Metrics

- Row 1: Orders/min, revenue gauge, fulfillment rate (FULFILL vs BACKORDER)
- Row 2: COGS breakdown (materials, labor, overhead, shipping), cash balance over time
- Row 3: Inventory levels (raw, WIP, finished goods), deliveries by status

All dashboards use Grafana variables and have correlated Logs + Traces panels.

## NPM Dependencies

### Remove
- `prom-client`
- `express` (if only used for metrics endpoint)

### Add
- `@opentelemetry/sdk-node`
- `@opentelemetry/auto-instrumentations-node`
- `@opentelemetry/exporter-metrics-otlp-http`
- `@opentelemetry/exporter-trace-otlp-http`
- `@opentelemetry/exporter-logs-otlp-http`
- `@opentelemetry/api`
- `pino`
- `@opentelemetry/instrumentation-pino`

## What's Deferred

- Alerting rules (Prometheus alertmanager / Grafana alerting)
- SLO dashboards (error budgets, burn rates)
- Custom OTel processors (sampling, filtering)
- Exemplars (linking specific metric data points to traces)
