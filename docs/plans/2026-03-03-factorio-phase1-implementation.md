# FACTORIO Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the physical factory — Brewing, Bottling, and Crating processes — as independently runnable BPMN processes with ~19 workers, connected by Zeebe message events.

**Architecture:** 3 BPMN processes connected via message correlation (`BrewComplete` → Bottling, `BottlesReady` → Crating). Each process has its own worker file and automation modules. External state store for inventory and equipment telemetry. Multi-recipe ready from day one via `Recipe` type.

**Tech Stack:** TypeScript 5.9, @camunda8/sdk 8.8.5, @langchain/google-genai, Zod, Jest, Docker Compose (Zeebe + Operate + Tasklist + ES + Prometheus + Grafana), prom-client

**Reference project:** `/tmp/camunda8-exploration` — follow the same patterns for worker registration, metrics, types, and project structure.

**Design doc:** `docs/plans/2026-03-03-factorio-brewery-design.md`

---

## Task 0: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `docker/docker-compose.yaml`
- Create: `docker/prometheus.yml`
- Create: `CLAUDE.md`

**Step 1: Create package.json**

```json
{
  "name": "factorio",
  "version": "0.1.0",
  "description": "FACTORIO: A Camunda 8 brewery simulation — multi-process orchestration with automation, agentic LLM, and robotic control patterns",
  "main": "index.js",
  "type": "commonjs",
  "scripts": {
    "build": "tsc",
    "deploy": "ts-node src/deploy.ts",
    "start:workers": "ts-node src/workers/index.ts",
    "start:factory": "ts-node src/start-factory.ts",
    "start:brew": "ts-node src/start-brew.ts",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "docker:up": "docker compose -f docker/docker-compose.yaml up -d",
    "docker:down": "docker compose -f docker/docker-compose.yaml down"
  },
  "dependencies": {
    "@camunda8/sdk": "^8.8.5",
    "@langchain/core": "^1.1.29",
    "@langchain/google-genai": "^2.1.21",
    "dotenv": "^17.3.1",
    "express": "^5.2.1",
    "prom-client": "^15.1.3",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/jest": "^30.0.0",
    "@types/node": "^25.3.2",
    "jest": "^30.2.0",
    "ts-jest": "^29.4.6",
    "ts-node": "^10.9.2",
    "typescript": "^5.9.3"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create jest.config.js**

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
}
```

**Step 4: Create .env.example**

```
# LLM
GOOGLE_API_KEY=

# Camunda 8 (defaults for Docker Compose)
ZEEBE_GRPC_ADDRESS=localhost:26500
ZEEBE_REST_ADDRESS=http://localhost:8080/v2
CAMUNDA_AUTH_STRATEGY=BASIC
CAMUNDA_BASIC_AUTH_USERNAME=demo
CAMUNDA_BASIC_AUTH_PASSWORD=demo
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
.env
*.js.map
```

**Step 6: Copy docker/ directory from camunda8-exploration**

Copy the docker-compose.yaml, prometheus.yml, and grafana configs from `/tmp/camunda8-exploration/docker/`. Update prometheus.yml to scrape the FACTORIO metrics port.

**Step 7: Create CLAUDE.md**

Write project conventions following the healthcare project's pattern. Include:
- Project overview (brewery simulation, multi-process)
- Architecture (7 independent BPMN processes, message correlation)
- File map (abbreviated for Phase 1)
- Startup sequence
- Coding conventions (same as healthcare: Zod structured output, withMetrics wrapper, pure automation functions, as any only at SDK boundary)
- Common issues

**Step 8: Install dependencies and verify**

Run: `cd /tmp/factorio && npm install`
Expected: clean install, no errors

**Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold FACTORIO project with configs and Docker setup"
```

---

## Task 1: Core Types — Recipe & Shared

**Files:**
- Create: `src/types/recipe.ts`
- Create: `src/types/shared.ts`
- Create: `src/recipes/parkers-kolsch.ts`

**Step 1: Write the Recipe interface**

Create `src/types/recipe.ts` with the full `Recipe` interface from the design doc. This is the foundation everything builds on — grain bill, hop schedule, yeast, water profile, process parameters, packaging, and pricing.

**Step 2: Write shared message types**

Create `src/types/shared.ts` with all cross-process message interfaces: `OrderPlacedMessage`, `MaterialsReadyMessage`, `BrewCompleteMessage`, `BottlesReadyMessage`, `PalletsReadyMessage`, `DeliveryCompleteMessage`. Also include shared ID types and a `generateId()` utility using `crypto.randomUUID()`.

**Step 3: Write Parker's Kolsch recipe**

Create `src/recipes/parkers-kolsch.ts` exporting a `Recipe` object:
- Style: Kolsch
- Grain: 9 lbs pilsner malt (100%)
- Hops: 1 oz Hallertau at 60 min (bittering), 1 oz Hallertau at 15 min (flavor)
- Yeast: Kolsch yeast, 56-60°F
- Process: mash 152°F/60 min, boil 60 min, ferment 58°F/14 days, lager 34°F/28 days
- Targets: OG 1.048, FG 1.008, ABV 4.8%, IBU 22, SRM 3.5
- Packaging: 12 oz bottles, 24/case, 60 cases/pallet
- Pricing: $36/case wholesale, 1.3x premium multiplier

**Step 4: Write tests for recipe validation**

Create `src/recipes/parkers-kolsch.test.ts`:
- Test that the recipe has all required fields
- Test grain bill percentages sum to 100
- Test hop schedule has at least one addition
- Test target OG > target FG
- Test ABV is reasonable for the style (3-6% for Kolsch)

**Step 5: Run tests**

Run: `npm test`
Expected: all recipe tests pass

**Step 6: Commit**

```bash
git add src/types/ src/recipes/
git commit -m "feat: add Recipe type system and Parker's Kolsch recipe"
```

---

## Task 2: Brewing Process Variables & Automation — Mashing through Boiling

**Files:**
- Create: `src/types/brewing-variables.ts`
- Create: `src/automation/brewing/mashing.ts`
- Create: `src/automation/brewing/lautering.ts`
- Create: `src/automation/brewing/boiling.ts`
- Create: `src/automation/brewing/mashing.test.ts`
- Create: `src/automation/brewing/lautering.test.ts`
- Create: `src/automation/brewing/boiling.test.ts`

**Step 1: Define BrewingProcessVariables**

```typescript
// src/types/brewing-variables.ts
import { Recipe } from './recipe'

export interface GravityReading {
  value: number       // specific gravity e.g. 1.048
  timestamp: string
  stage: 'pre-boil' | 'og' | 'fermentation' | 'fg'
}

export interface MashResult {
  mashTemp: number
  duration: number
  wortComposition: {
    volume: number      // gallons
    gravity: number     // pre-boil gravity
    ph: number
  }
}

export interface LauterResult {
  wortVolume: number   // gallons collected
  efficiency: number   // % of theoretical extraction
  spargeWater: number  // gallons used
}

export interface BoilResult {
  preBoilVolume: number
  postBoilVolume: number
  hopAdditions: { hop: string; quantity: number; time: number; ibuContribution: number }[]
  totalIBU: number
  boilDuration: number
  evaporationRate: number
}

export interface CoolingResult {
  startTemp: number
  endTemp: number
  coolingDuration: number
  targetTemp: number
}

export interface FermentationState {
  day: number
  gravityReadings: GravityReading[]
  currentGravity: number
  targetFG: number
  temperatureLog: { temp: number; timestamp: string }[]
  attenuation: number   // % complete
  stuck: boolean
}

export interface LageringResult {
  daysCompleted: number
  targetDays: number
  temp: number
  clarityScore: number  // 1-10
}

export interface BatchQCReport {
  batchId: string
  recipeId: string
  qualityScore: number  // 0-100
  tastingNotes: string
  appearance: string
  aroma: string
  flavor: string
  mouthfeel: string
  overallImpression: string
  passed: boolean
  issues: string[]
}

export interface BrewingProcessVariables {
  batchId: string
  recipeId: string
  recipe: Recipe

  mashResult?: MashResult
  lauterResult?: LauterResult
  boilResult?: BoilResult
  coolingResult?: CoolingResult
  fermentationState?: FermentationState
  lageringResult?: LageringResult
  batchQC?: BatchQCReport

  // Final outputs
  finalVolume?: number
  finalGravity?: number
  finalABV?: number
}
```

**Step 2: Write mashing automation (TDD)**

Test file `src/automation/brewing/mashing.test.ts`:
- Test that `simulateMash(recipe)` returns a `MashResult`
- Test that mash temp matches recipe
- Test that wort volume is > 0
- Test that gravity is within expected range for the grain bill (roughly: `1 + (points_per_lb * lbs * efficiency) / volume / 1000`)
- Test that pH is in reasonable range (5.2-5.6)

Implementation `src/automation/brewing/mashing.ts`:
- Pure function `simulateMash(recipe: Recipe): MashResult`
- Calculates wort composition from grain bill
- Adds slight randomness (±2%) to simulate real-world variation
- Returns mashTemp, duration, wortComposition

**Step 3: Write lautering automation (TDD)**

Test file `src/automation/brewing/lautering.test.ts`:
- Test that `simulateLauter(mashResult, recipe)` returns a `LauterResult`
- Test wort volume is less than or equal to total water added
- Test efficiency is between 60-85%

Implementation `src/automation/brewing/lautering.ts`:
- Pure function `simulateLauter(mashResult: MashResult, recipe: Recipe): LauterResult`
- Calculates extraction efficiency with randomness
- Determines sparge water needs

**Step 4: Write boiling automation (TDD)**

Test file `src/automation/brewing/boiling.test.ts`:
- Test that `simulateBoil(lauterResult, recipe)` returns a `BoilResult`
- Test post-boil volume < pre-boil volume (evaporation)
- Test hop additions match recipe's hop schedule
- Test IBU calculation (Tinseth formula) is within range of recipe target

Implementation `src/automation/brewing/boiling.ts`:
- Pure function `simulateBoil(lauterResult: LauterResult, recipe: Recipe): BoilResult`
- Implements Tinseth IBU calculation: `IBU = (utilization × ozHops × alphaAcid × 7490) / volumeGallons`
- Tracks evaporation (~1 gal/hr at standard rate)

**Step 5: Run all tests**

Run: `npm test`
Expected: All mashing, lautering, boiling tests pass

**Step 6: Commit**

```bash
git add src/types/brewing-variables.ts src/automation/brewing/
git commit -m "feat: add brewing automation — mashing, lautering, boiling with tests"
```

---

## Task 3: Brewing Automation — Cooling, Fermentation, Lagering

**Files:**
- Create: `src/automation/brewing/cooling.ts`
- Create: `src/automation/brewing/fermentation.ts`
- Create: `src/automation/brewing/lagering.ts`
- Create: `src/automation/brewing/cooling.test.ts`
- Create: `src/automation/brewing/fermentation.test.ts`
- Create: `src/automation/brewing/lagering.test.ts`

**Step 1: Write cooling automation (TDD)**

Test: `simulateCooling(boilResult, recipe)` returns `CoolingResult`
- End temp matches recipe fermentation temp (±1°F)
- Duration is reasonable (10-30 min)

Implementation: pure function with slight randomness on duration.

**Step 2: Write fermentation simulation (TDD)**

This is the most interesting automation — it simulates gravity drop over time.

Test file `src/automation/brewing/fermentation.test.ts`:
- Test `initFermentation(recipe, boilResult)` creates initial state
- Test `checkFermentation(state, recipe)` progresses gravity toward target FG
- Test that after enough checks, attenuation > 70%
- Test stuck detection: if gravity hasn't dropped in 3 checks, `stuck = true`

Implementation `src/automation/brewing/fermentation.ts`:
- `initFermentation(recipe: Recipe, ogReading: number): FermentationState` — creates initial state
- `checkFermentation(state: FermentationState, recipe: Recipe): FermentationState` — simulates one day's gravity drop. Uses exponential decay toward target FG. Small randomness. Calculates attenuation. Detects stuck fermentation (gravity unchanged for 3 readings).

**Step 3: Write lagering automation (TDD)**

Test: `checkLagering(recipe, daysCompleted)` returns `LageringResult`
- Days completed tracks correctly
- Clarity score improves over time (higher days = clearer beer)
- Returns recipe lagering temp

Implementation: pure function. Clarity score calculated as `Math.min(10, 3 + (daysCompleted / targetDays) * 7)`.

**Step 4: Run tests**

Run: `npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/automation/brewing/
git commit -m "feat: add brewing automation — cooling, fermentation, lagering with tests"
```

---

## Task 4: Batch QC LLM Agent

**Files:**
- Create: `src/agents/batch-qc.ts`

**Step 1: Write the batch QC agent**

This is the first LLM worker. It analyzes all brewing data for a batch and produces a quality report with tasting notes.

```typescript
// src/agents/batch-qc.ts
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { Recipe } from '../types/recipe'
import { BrewingProcessVariables, BatchQCReport } from '../types/brewing-variables'

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.4,  // some creativity for tasting notes
})

const batchQCSchema = z.object({
  qualityScore: z.number().min(0).max(100).describe('Overall quality score'),
  tastingNotes: z.string().describe('Professional tasting notes, 2-3 sentences'),
  appearance: z.string().describe('Visual assessment: color, clarity, head'),
  aroma: z.string().describe('Aroma assessment: hop character, malt, esters'),
  flavor: z.string().describe('Flavor assessment: balance, bitterness, finish'),
  mouthfeel: z.string().describe('Body, carbonation, warmth'),
  overallImpression: z.string().describe('Summary for the label, 1 sentence'),
  passed: z.boolean().describe('Whether this batch meets quality standards'),
  issues: z.array(z.string()).describe('Any quality concerns, empty if none'),
})

const structuredModel = model.withStructuredOutput(batchQCSchema)

export async function batchQCAgent(
  vars: BrewingProcessVariables,
  recipe: Recipe
): Promise<BatchQCReport> {
  const response = await structuredModel.invoke([
    new SystemMessage(`You are a master brewer and BJCP-certified beer judge evaluating a batch of ${recipe.name} (${recipe.style}). Evaluate the brewing data against style guidelines and produce a quality report. Be specific and honest about any deviations from the target parameters.`),
    new HumanMessage(`
Batch ID: ${vars.batchId}
Recipe: ${recipe.name} (${recipe.style})

Brewing Data:
- Target OG: ${recipe.process.targetOG}, Actual OG: ${vars.mashResult?.wortComposition.gravity || 'unknown'}
- Target FG: ${recipe.process.targetFG}, Actual FG: ${vars.fermentationState?.currentGravity || 'unknown'}
- Target IBU: ${recipe.process.targetIBU}, Actual IBU: ${vars.boilResult?.totalIBU || 'unknown'}
- Target ABV: ${recipe.process.targetABV}%, Calculated ABV: ${vars.finalABV || 'unknown'}%
- Fermentation attenuation: ${vars.fermentationState?.attenuation || 'unknown'}%
- Lagering clarity score: ${vars.lageringResult?.clarityScore || 'unknown'}/10
- Lagering days: ${vars.lageringResult?.daysCompleted || 'unknown'} of ${recipe.process.lageringDays} target

Style Guidelines for ${recipe.style}:
- Appearance: Very pale gold, brilliant clarity, persistent white head
- Aroma: Clean, subtle malt sweetness, low noble hop aroma
- Flavor: Crisp, delicate balance of malt and hops, clean fermentation, dry finish
- Mouthfeel: Light to medium body, medium carbonation, smooth

Evaluate this batch.
`),
  ])

  return {
    batchId: vars.batchId,
    recipeId: vars.recipeId,
    ...response,
  }
}
```

**Step 2: Commit**

```bash
git add src/agents/batch-qc.ts
git commit -m "feat: add batch QC LLM agent — quality analysis and tasting notes"
```

---

## Task 5: Metrics & State Store

**Files:**
- Create: `src/metrics/index.ts`
- Create: `src/metrics/middleware.ts`
- Create: `src/state/index.ts`
- Create: `src/state/index.test.ts`

**Step 1: Write Prometheus metrics**

Create `src/metrics/index.ts` with Phase 1 production metrics:

```typescript
import { Registry, Histogram, Counter, Gauge, collectDefaultMetrics } from 'prom-client'

export const register = new Registry()

export const workerDuration = new Histogram({
  name: 'factory_worker_duration_seconds',
  help: 'Duration of individual workers in seconds',
  labelNames: ['worker', 'type'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [register],
})

export const stepCount = new Counter({
  name: 'factory_step_count_total',
  help: 'Total steps executed by worker',
  labelNames: ['worker', 'type'] as const,
  registers: [register],
})

export const batchesTotal = new Counter({
  name: 'factory_batches_total',
  help: 'Total batches by recipe and status',
  labelNames: ['recipe', 'status'] as const,
  registers: [register],
})

export const bottlesProduced = new Counter({
  name: 'factory_bottles_produced_total',
  help: 'Total bottles produced',
  labelNames: ['recipe'] as const,
  registers: [register],
})

export const bottlesRejected = new Counter({
  name: 'factory_bottles_rejected_total',
  help: 'Total bottles rejected',
  labelNames: ['recipe', 'reason'] as const,
  registers: [register],
})

export const armCycles = new Counter({
  name: 'factory_arm_cycles_total',
  help: 'Robotic arm cycle count',
  labelNames: ['arm_id'] as const,
  registers: [register],
})

export const armFaults = new Counter({
  name: 'factory_arm_faults_total',
  help: 'Robotic arm fault count',
  labelNames: ['arm_id', 'fault_code'] as const,
  registers: [register],
})

export const conveyorEfficiency = new Gauge({
  name: 'factory_conveyor_efficiency',
  help: 'Conveyor throughput efficiency ratio',
  labelNames: ['conveyor_id'] as const,
  registers: [register],
})

export const activeProcesses = new Gauge({
  name: 'factory_active_processes',
  help: 'Number of active process instances',
  labelNames: ['process'] as const,
  registers: [register],
})

collectDefaultMetrics({ register })
```

**Step 2: Write metrics middleware**

Copy the pattern from healthcare project — Express server on port 9464 with `/metrics` and `/health` endpoints.

**Step 3: Write external state store (TDD)**

This is critical — it avoids the Zeebe variable size explosion problem.

Test file `src/state/index.test.ts`:
- Test `addRawMaterial(id, quantity, unitCost)` adds to inventory
- Test `consumeRawMaterial(id, quantity)` decrements and returns true, or returns false if insufficient
- Test `addFinishedGoods(recipeId, cases)` adds to inventory
- Test `allocateFinishedGoods(recipeId, cases)` reserves stock
- Test `getInventorySnapshot()` returns current state

Implementation `src/state/index.ts`:
- In-memory Maps (upgradeable to Redis/DB later)
- Thread-safe operations (not needed for Node single-thread, but good practice)
- Export singleton `factoryState`

**Step 4: Run tests**

Run: `npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/metrics/ src/state/
git commit -m "feat: add Prometheus metrics and external state store"
```

---

## Task 6: Brewing BPMN Process

**Files:**
- Create: `bpmn/brewing-process.bpmn`

**Step 1: Write the BPMN XML**

Create the brewing process with:
- Start event: message `MaterialsReady` with correlation key `batchId` (also allow manual start for testing)
- Service tasks: `mashing`, `lautering`, `boil-hop-addition`, `cooling`
- Timer event: fermentation (non-interrupting timer loop for gravity checks)
- Service task: `fermentation-check`
- Exclusive gateway: fermentation complete? (check attenuation)
  - Yes → lagering timer → `lagering-complete` service task
  - No, not stuck → loop back to fermentation timer
  - Stuck → error boundary → user task "Brewmaster Quality Hold"
- Service task: `batch-qc` (LLM)
- Exclusive gateway: QC passed?
  - Yes → end event publishes `BrewComplete` message
  - No → user task "Brewmaster QC Hold" → approve/reject gateway
    - Approve override → publish `BrewComplete`
    - Dump batch → terminate end event
- Throughout: use FEEL expressions for gateway conditions

Note: Use Camunda 8 BPMN with `zeebe:taskDefinition` for service tasks and `zeebe:userTask` for user tasks. Reference the healthcare project's BPMN for exact XML patterns.

**Step 2: Commit**

```bash
git add bpmn/brewing-process.bpmn
git commit -m "feat: add brewing process BPMN — mash to QC with fermentation loop"
```

---

## Task 7: Brewing Workers

**Files:**
- Create: `src/workers/brewing.ts`

**Step 1: Write all 7 brewing workers**

Follow the healthcare project's worker pattern exactly. Each worker:
1. Extracts variables with `job.variables as unknown as BrewingProcessVariables`
2. Calls the pure automation function (or LLM agent for batch-qc)
3. Returns via `job.complete({ ...result } as any)`
4. Wraps with `withMetrics(name, type, handler)`
5. Logs with `[worker-name] ✓` pattern

Workers to implement:
- `mashing` — calls `simulateMash(recipe)`, returns `mashResult`
- `lautering` — calls `simulateLauter(mashResult, recipe)`, returns `lauterResult`
- `boil-hop-addition` — calls `simulateBoil(lauterResult, recipe)`, returns `boilResult`
- `cooling` — calls `simulateCooling(boilResult, recipe)`, returns `coolingResult`
- `fermentation-check` — calls `checkFermentation(state, recipe)`, returns updated `fermentationState`. If stuck, throws BPMN error.
- `lagering-complete` — calls `checkLagering(recipe, days)`, returns `lageringResult`
- `batch-qc` — calls `batchQCAgent(vars, recipe)`, returns `batchQC`. Wrapped in try/catch.

Export a `registerBrewingWorkers(zeebe)` function that registers all 7.

**Step 2: Commit**

```bash
git add src/workers/brewing.ts
git commit -m "feat: add 7 brewing workers — mash through QC"
```

---

## Task 8: Bottling Process Variables & Automation

**Files:**
- Create: `src/types/bottling-variables.ts`
- Create: `src/automation/bottling/volume-reading.ts`
- Create: `src/automation/bottling/filling.ts`
- Create: `src/automation/bottling/quality-sampling.ts`
- Create: `src/automation/bottling/volume-reading.test.ts`
- Create: `src/automation/bottling/filling.test.ts`
- Create: `src/automation/bottling/quality-sampling.test.ts`

**Step 1: Define BottlingProcessVariables**

```typescript
export interface VolumeReading {
  batchId: string
  tankVolume: number         // liters
  bottleSize: number         // oz
  estimatedBottles: number
  estimatedCases: number
}

export interface FillingResult {
  bottlesFilled: number
  bottlesBroken: number      // ~2% waste
  fillRate: number           // bottles/min
  wastePercentage: number
}

export interface QualitySample {
  carbonation: { level: number; target: number; passed: boolean }
  clarity: { score: number; passed: boolean }
  abv: { measured: number; target: number; deviation: number; passed: boolean }
  overallPassed: boolean
}

export interface BottlingProcessVariables {
  batchId: string
  recipeId: string
  recipe: Recipe
  qualityScore: number
  tastingNotes: string

  volumeReading?: VolumeReading
  labelData?: LabelData
  fillingResult?: FillingResult
  qualitySample?: QualitySample
}
```

**Step 2: Write volume-reading automation (TDD)**

Test: `calculateVolume(tankVolume, recipe)` returns `VolumeReading`
- Bottle count = floor(tankVolume in oz / bottleSize)
- Case count = floor(bottles / casePack)

Implementation: pure arithmetic from recipe packaging config.

**Step 3: Write filling simulation (TDD)**

Test: `simulateFilling(volumeReading)` returns `FillingResult`
- Bottles filled = estimatedBottles - broken
- Broken is ~1.5-2.5% (randomized)
- Fill rate is 30-60 bottles/min (randomized)

**Step 4: Write quality sampling (TDD)**

Test: `sampleQuality(recipe, actualABV)` returns `QualitySample`
- Carbonation: random 2.3-2.8 volumes CO2, pass if within style range
- Clarity: score 7-10, pass if > 7
- ABV: deviation from target, pass if within ±0.3%
- overallPassed: all three pass

**Step 5: Run tests, commit**

```bash
npm test
git add src/types/bottling-variables.ts src/automation/bottling/
git commit -m "feat: add bottling automation — volume, filling, quality sampling with tests"
```

---

## Task 9: Label Generation LLM Agent

**Files:**
- Create: `src/agents/label-generation.ts`

**Step 1: Write the label generation agent**

Similar pattern to batch-qc. Takes recipe + batch QC data, produces marketing-ready label content.

Zod schema for output:
```typescript
const labelSchema = z.object({
  batchNumber: z.string(),
  brewDate: z.string(),
  productName: z.string(),
  style: z.string(),
  abv: z.string(),
  ibu: z.string(),
  description: z.string().describe('2-3 sentence marketing description for the label'),
  tastingNotes: z.string().describe('Concise tasting notes for the label'),
  foodPairings: z.array(z.string()).describe('3-4 food pairing suggestions'),
  servingTemp: z.string(),
})
```

**Step 2: Commit**

```bash
git add src/agents/label-generation.ts
git commit -m "feat: add label generation LLM agent"
```

---

## Task 10: Bottling BPMN & Workers

**Files:**
- Create: `bpmn/bottling-process.bpmn`
- Create: `src/workers/bottling.ts`

**Step 1: Write bottling BPMN**

- Start: message `BrewComplete` with correlation key `batchId`
- Service tasks: `volume-reading`, `label-generation`, `filling-simulation`, `quality-sampling`
- Gateway: quality passed?
  - Yes → publish `BottlesReady` message → end
  - No → user task "Brewmaster Sampling Hold" → approve/reject → end or loop

**Step 2: Write bottling workers**

4 workers following the standard pattern. Export `registerBottlingWorkers(zeebe)`.

**Step 3: Commit**

```bash
git add bpmn/bottling-process.bpmn src/workers/bottling.ts
git commit -m "feat: add bottling process BPMN and 4 workers"
```

---

## Task 11: Crating Types — Robotic Telemetry

**Files:**
- Create: `src/types/telemetry.ts`
- Create: `src/types/crating-variables.ts`

**Step 1: Write telemetry types**

Create `src/types/telemetry.ts` with full robotic types from the design doc:
- `RoboticArmTelemetry` — joints, gripper, pressure, temperature, vibration, fault history, MTBF
- `ArmFault` — fault code, severity, positions, recovery
- `ConveyorTelemetry` — sensors, buffer, motor current, belt tension, jam detection, throughput
- `VisionInspection` — defect detection (crack, chip, underfill, label, foreign object), verdict, confidence

**Step 2: Write crating process variables**

Create `src/types/crating-variables.ts` with:
- `LineStatus` — initialized state of all equipment
- `InspectionBatchResult` — aggregated inspection results for a batch of 24
- `CasePackingResult` — arm state, cycles, faults
- `PalletBuildResult` — layers, weight, stability
- `CratingProcessVariables` — combines all above

**Step 3: Commit**

```bash
git add src/types/telemetry.ts src/types/crating-variables.ts
git commit -m "feat: add robotic telemetry and crating process variable types"
```

---

## Task 12: Crating Automation — Inspection, Case Packing, Palletizing

**Files:**
- Create: `src/automation/crating/inspection.ts`
- Create: `src/automation/crating/case-packing.ts`
- Create: `src/automation/crating/palletizing.ts`
- Create: `src/automation/crating/conveyor-health.ts`
- Create: `src/automation/crating/inspection.test.ts`
- Create: `src/automation/crating/case-packing.test.ts`
- Create: `src/automation/crating/palletizing.test.ts`

**Step 1: Write inspection simulation (TDD)**

Test: `inspectBottleBatch(batchSize)` returns `InspectionBatchResult`
- Most bottles pass (confidence > 0.8)
- ~2% have defects (randomized across crack/chip/underfill/label)
- ~0.5% get `review` verdict (confidence 0.4-0.8)
- Foreign object detection is rare (~0.1%)

Implementation: simulates vision system per bottle, aggregates results.

**Step 2: Write case packing simulation (TDD)**

Test: `simulateCasePackingCycle(armState)` returns updated `RoboticArmTelemetry` + `CasePackingResult`
- State machine: `IDLE → PICKING → PLACING → SEALING → IDLE`
- Gripper pressure within min/max thresholds
- Motor temp increases slightly per cycle
- Vibration level has random walk
- Fault injection: ~1% chance of grip lost, ~0.5% of overtemp warning

**Step 3: Write palletizing simulation (TDD)**

Test: `simulatePalletizing(casesToStack, recipe)` returns `PalletBuildResult`
- Calculates layers (cases per layer based on case dimensions)
- Weight accumulates per layer
- Stability check: random small deviations, fail if > threshold

**Step 4: Write conveyor health check (TDD)**

Test: `checkConveyorHealth(conveyor)` returns updated `ConveyorTelemetry`
- Updates throughput, motor current, belt tension
- Detects jam: motor current spike + photoeye blockage
- Returns jam location if detected

**Step 5: Run tests, commit**

```bash
npm test
git add src/automation/crating/
git commit -m "feat: add crating automation — inspection, packing, palletizing, conveyor with tests"
```

---

## Task 13: Vision Review & Predictive Maintenance LLM Agents

**Files:**
- Create: `src/agents/vision-review.ts`
- Create: `src/agents/predictive-maintenance.ts`

**Step 1: Write vision review agent**

Handles low-confidence bottle inspection edge cases. Takes the `VisionInspection` data for a `review` verdict bottle and makes a final pass/reject decision with reasoning.

**Step 2: Write predictive maintenance agent**

Multi-tool agentic pattern. Analyzes telemetry trends from the state store:
- Tool: `get_telemetry_history(armId)` — reads from factory state
- Tool: `get_fault_history(armId)` — reads fault records
- Tool: `check_maintenance_schedule()` — reads scheduled maintenance

Produces predictions with confidence scores and urgency ratings.

**Step 3: Commit**

```bash
git add src/agents/vision-review.ts src/agents/predictive-maintenance.ts
git commit -m "feat: add vision review and predictive maintenance LLM agents"
```

---

## Task 14: Crating BPMN & Workers

**Files:**
- Create: `bpmn/crating-process.bpmn`
- Create: `src/workers/crating.ts`

**Step 1: Write crating BPMN**

The most complex BPMN — subprocesses, error boundaries, parallel monitoring:
- Start: message `BottlesReady` with correlation key `batchId`
- `line-initialize` service task
- Sub-process: Inspection (multi-instance or loop for batches of 24)
  - `bottle-inspect` → gateway: any `review` verdicts? → `vision-review` (LLM)
  - Error boundary: `FOREIGN_OBJECT_DETECTED` → user task: line supervisor
- Sub-process: Case Packing
  - `case-packer-cycle` loop
  - Error boundaries: `GRIP_LOST`, `OVER_TEMP`, `COLLISION_DETECT` → `arm-recovery`
- Sub-process: Palletizing
  - `palletizer-cycle`
  - `stability-check`
  - Error boundary: `UNSTABLE_PALLET` → restack
- `pallet-wrap-stage` service task
- `predictive-maintenance` (parallel, non-interrupting)
- End: publish `PalletsReady` message

**Step 2: Write 8 crating workers**

Export `registerCratingWorkers(zeebe)`.

Workers: `line-initialize`, `bottle-inspect`, `vision-review` (LLM), `case-packer-cycle`, `arm-recovery`, `palletizer-cycle`, `pallet-wrap-stage`, `predictive-maintenance` (LLM).

**Step 3: Commit**

```bash
git add bpmn/crating-process.bpmn src/workers/crating.ts
git commit -m "feat: add crating process BPMN and 8 workers with robotic simulation"
```

---

## Task 15: Worker Index, Deploy, and Start Scripts

**Files:**
- Create: `src/workers/index.ts`
- Create: `src/deploy.ts`
- Create: `src/start-brew.ts`

**Step 1: Write workers/index.ts**

```typescript
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
```

**Step 2: Write deploy.ts**

Deploy all 3 BPMN files to Zeebe:

```typescript
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
```

**Step 3: Write start-brew.ts**

Manual trigger to start a brew (for testing without the sales system):

```typescript
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
```

**Step 4: Commit**

```bash
git add src/workers/index.ts src/deploy.ts src/start-brew.ts
git commit -m "feat: add worker registry, deploy script, and manual brew starter"
```

---

## Task 16: Integration Test — Full Brew-to-Pallet Flow

**Step 1: Run the full stack**

```bash
npm run docker:up       # Start Camunda (wait ~90s)
npm run deploy          # Deploy all 3 BPMN processes
npm run start:workers   # Start all 19 workers (in terminal 1)
npm run start:brew      # Trigger a brew (in terminal 2)
```

**Step 2: Verify in Operate**

Open http://localhost:8088/operate (demo/demo). Verify:
- Brewing process instance started
- Workers execute through mashing → lautering → boiling → cooling → fermentation loop → lagering → QC
- `BrewComplete` message triggers bottling process
- Bottling executes: volume → label → filling → quality
- `BottlesReady` message triggers crating process
- Crating executes: initialize → inspect → pack → palletize → wrap → stage
- `PalletsReady` message published

**Step 3: Check Grafana**

Open http://localhost:3000 (admin/admin). Verify:
- `factory_worker_duration_seconds` shows timing for all workers
- `factory_batches_total` incremented
- `factory_bottles_produced_total` shows bottles from the batch
- `factory_arm_cycles_total` shows robotic activity

**Step 4: Check for any errors in worker logs**

Review terminal 1 output. All workers should show `✓` completion messages.

**Step 5: Commit any fixes**

If any issues found during integration, fix and commit.

```bash
git commit -m "fix: resolve integration issues from end-to-end brew test"
```

---

## Task 17: Push to GitHub

**Step 1: Push all commits**

```bash
cd /tmp/factorio
git push origin main
```

**Step 2: Verify repo**

Check https://github.com/ptw1255/factorio — should show all files, docs, and BPMN processes.

---

## Summary

| Task | What | Workers | Tests |
|------|------|---------|-------|
| 0 | Project scaffolding | — | — |
| 1 | Recipe types + Parker's Kolsch | — | 5 |
| 2 | Brewing automation (mash/lauter/boil) | — | ~15 |
| 3 | Brewing automation (cool/ferment/lager) | — | ~10 |
| 4 | Batch QC LLM agent | — | — |
| 5 | Metrics + state store | — | ~5 |
| 6 | Brewing BPMN | — | — |
| 7 | Brewing workers | 7 | — |
| 8 | Bottling automation | — | ~10 |
| 9 | Label generation LLM agent | — | — |
| 10 | Bottling BPMN + workers | 4 | — |
| 11 | Telemetry types | — | — |
| 12 | Crating automation | — | ~15 |
| 13 | Vision + maintenance LLM agents | — | — |
| 14 | Crating BPMN + workers | 8 | — |
| 15 | Worker index + deploy + start scripts | — | — |
| 16 | Integration test | — | Manual |
| 17 | Push to GitHub | — | — |

**Total: 19 workers (15 automation, 4 LLM), ~60 unit tests, 3 BPMN processes**
