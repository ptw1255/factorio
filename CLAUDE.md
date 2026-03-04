# CLAUDE.md — FACTORIO Brewery Simulation

## Project Overview

Camunda 8 multi-process brewery simulation exploring automation, agentic LLM orchestration, and pseudo-robotic control. 7 independent BPMN processes connected via Zeebe message events ("conveyor belts"). Three tiers of intelligence: deterministic automation (35 workers), agentic LLM reasoning (9 agents), and human-in-the-loop exception handling (5 user tasks). Node.js/TypeScript workers connect to Zeebe via gRPC.

## Architecture

### Seven Processes (Phase 1: processes 1-3)

| # | Process | Type | Phase |
|---|---------|------|-------|
| 1 | Brewing | Physical | 1 |
| 2 | Bottling Line | Physical | 1 |
| 3 | Crating & Palletizing | Physical/Robotic | 1 |
| 4 | Sales | Business | 2 |
| 5 | Materials | Business | 2 |
| 6 | Distribution | Business | 2 |
| 7 | Accounting | Business | 2 |

### Message Flow

```
Sales ──OrderPlaced──→ Materials ──MaterialsReady──→ Brewing
                                                        │
                        Accounting ←─BrewComplete───────┘
                            ↑             │
                            │        Bottling Line
                            │             │
                            │      BottlesReady
                            │             │
                            │     Crating & Palletizing
                            │             │
                            │       PalletsReady
                            │             │
                            └──────Distribution
```

### Three-Tier Decision Model

- **Automation** — handles 90% of flow (deterministic, fast, testable)
- **Agentic LLM** — handles reasoning (tool-using, multi-step, adaptive)
- **Human** — handles final authority (Tasklist UI)

## Tech Stack

- **Runtime**: Node.js / TypeScript (CommonJS, ES2022 target)
- **Camunda SDK**: `@camunda8/sdk` — Zeebe gRPC client
- **LLM**: Google Gemini 2.5 Flash via `@langchain/google-genai`
- **LangChain**: `@langchain/core` for messages, structured output with Zod
- **Metrics**: prom-client + Express on port 9464
- **Process Engine**: Camunda 8 / Zeebe (self-managed, basic auth: demo/demo)

## Startup

```bash
npm install
cp .env.example .env       # Add GOOGLE_API_KEY
npm run docker:up           # Wait ~90s for Camunda
npm run deploy              # Deploy all BPMN processes
npm run start:workers       # Start all workers (terminal 1)
npm run start:brew          # Trigger a brew (terminal 2)
```

## File Map (Phase 1)

| Path | Purpose |
|------|---------|
| `bpmn/*.bpmn` | BPMN process definitions |
| `src/workers/brewing.ts` | 7 brewing workers |
| `src/workers/bottling.ts` | 4 bottling workers |
| `src/workers/crating.ts` | 8 crating workers |
| `src/workers/index.ts` | Worker registry — registers all workers |
| `src/agents/` | LLM agents (batch-qc, label-gen, vision-review, predictive-maint) |
| `src/automation/brewing/` | Pure functions: mashing, lautering, boiling, cooling, fermentation, lagering |
| `src/automation/bottling/` | Pure functions: volume, filling, quality sampling |
| `src/automation/crating/` | Pure functions: inspection, case-packing, palletizing, conveyor |
| `src/types/` | TypeScript interfaces per process |
| `src/recipes/` | Recipe definitions (multi-recipe ready) |
| `src/metrics/` | Prometheus metrics + Express middleware |
| `src/state/` | External state store (inventory, equipment telemetry) |

## Coding Conventions

- All agents: create model → define Zod schema → `model.withStructuredOutput(schema)` → export async function
- Automation modules are pure functions — no side effects, no LLM calls
- Workers organized one file per process, registered in `src/workers/index.ts`
- Every worker uses `withMetrics(name, type, handler)` wrapper for Prometheus
- AI workers have 60-second timeouts
- Use `as any` casts only at the Camunda SDK boundary (`job.complete`), never inside agent logic
- External state store for large/accumulating data — only pass references through Zeebe variables

## npm Scripts

| Script | What It Does |
|--------|--------------|
| `npm run deploy` | Deploy BPMN to Zeebe |
| `npm run start:workers` | Start all workers |
| `npm run start:brew` | Create a brew process instance |
| `npm test` | Run Jest tests |
| `npm run docker:up` | Start Camunda 8 in Docker |
| `npm run docker:down` | Stop Camunda 8 Docker |

## Environment Variables

Stored in `.env` (not committed). Template in `.env.example`.

## Common Issues

- **Gemini 429 rate limit**: Use a paid API key
- **Port 26500 conflict**: Check with `lsof -i :26500`
- **Workers not picking up jobs**: Run `npm run deploy` after BPMN changes, restart workers after code changes
- **Task not showing in Tasklist**: BPMN user task needs `<zeebe:userTask />` extension
