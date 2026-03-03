# FACTORIO: Brewery Simulation System Design

> A Camunda 8 multi-process brewery simulation that explores automation, agentic LLM orchestration, and pseudo-robotic control through a continuously running factory.

**Date:** 2026-03-03
**Status:** Approved
**Origin:** Forked patterns from `camunda8-exploration` (Healthcare Patient Communication Pipeline)

---

## 1. Vision & Goals

FACTORIO is a brewery simulation modeled after the game Factorio — a continuously running factory where systems connect like conveyor belts, demand drives supply, and the whole thing runs autonomously. It serves as:

- A **learning platform** for Camunda 8 at scale — multi-process message correlation, timers, compensation, error boundaries, user tasks
- A **sandbox** for exploring three tiers of intelligence: deterministic automation, agentic LLM reasoning, and human-in-the-loop exception handling
- A **pseudo-robotic control system** demonstrating Camunda as a higher-level MES (Manufacturing Execution System)
- A **game** — tune the factory, add beers, manage demand vs supply, navigate shipping challenges

The factory produces **Parker's Kolsch** as the first beer, with the data model designed to horizontally scale to multiple recipes.

---

## 2. Architecture: Multi-Process with Message Correlation

Each system is an **independent BPMN process**. They communicate via Zeebe message events — the "conveyor belts" between systems.

### 2.1 The Seven Processes

| # | Process | BPMN File | Type | Cadence | Phase |
|---|---------|-----------|------|---------|-------|
| 1 | Brewing | `brewing-process.bpmn` | Physical | Hours (batch cycle) | 1 |
| 2 | Bottling Line | `bottling-process.bpmn` | Physical | Minutes (per batch) | 1 |
| 3 | Crating & Palletizing | `crating-process.bpmn` | Physical/Robotic | Minutes | 1 |
| 4 | Sales | `sales-process.bpmn` | Business | Continuous (timer) | 2 |
| 5 | Materials | `materials-process.bpmn` | Business | Event-driven | 2 |
| 6 | Distribution | `distribution-process.bpmn` | Business | Scheduled | 2 |
| 7 | Accounting | `accounting-process.bpmn` | Business | Event-driven | 2 |

### 2.2 Message Flow

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
                                          │
                                   DeliveryComplete
```

### 2.3 Correlation Keys

| Message | Correlation Key | 1:N Relationship |
|---------|----------------|-----------------|
| `OrderPlaced` | `orderId` | 1 order → N batches (if order > tank capacity) |
| `ProductionNeeded` | `orderId` | Materials knows which order to fulfill |
| `MaterialsReady` | `batchId` | 1 batch per brewing instance |
| `BrewComplete` | `batchId` | Bottling picks up specific batch |
| `BottlesReady` | `batchId` | Crating picks up specific batch |
| `PalletsReady` | `shipmentId` | Distribution handles specific shipments |
| `DeliveryComplete` | `shipmentId` | Accounting records delivery |
| `BatchAllocated` | `orderId` | Sales learns batch is ready |

### 2.4 Three-Tier Decision Model

```
Automation (35 workers) → handles 90% of flow — deterministic, fast, testable
    ↓ (complex decision / edge case)
Agentic LLM (9 agents) → handles reasoning — tool-using, multi-step, adaptive
    ↓ (high stakes / exception / override)
Human (5 user tasks) → handles final authority — Tasklist UI
```

---

## 3. Phase 1: The Physical Factory

### 3.1 Brewing Process

Models the production of a single batch. Real Kolsch brewing takes 4-6 weeks; simulated with compressed timers.

**BPMN Flow:**
1. **Start** — `MaterialsReady` message (or manual trigger for testing)
2. **Mashing** (automation) — grain + water at temp. Timer ~30s simulated. Logs temp readings, grain bill.
3. **Lautering** (automation) — separate wort from grain. Produces `wortVolume`.
4. **Boiling** (automation) — hop additions at 60 min, 15 min, flameout. Timer-based. Calculates IBU.
5. **Cooling** (automation) — crash cool to fermentation temp. Timer + reading.
6. **Fermentation** (timer + automation) — Kolsch at 56-60°F for 2 weeks (simulated ~2 min).
   - Periodic gravity checks via timer loop
   - **Quality Gate**: if gravity doesn't drop enough → BPMN error `FERMENTATION_STUCK`
   - **Error Boundary** → User task: Brewmaster quality hold
7. **Lagering** (timer) — cold conditioning at 32-35°F for 4 weeks (simulated).
8. **Final QC** (LLM agent) — analyzes batch data, generates quality report + tasting notes.
   - If QC fails → User task: Brewmaster decides (approve override, adjust, or dump batch)
9. **Publish `BrewComplete`** message

**Workers (7):**

| Worker | Type | Description |
|--------|------|------------|
| `mashing` | automation | Simulates mash, produces wort composition |
| `lautering` | automation | Calculates wort volume from grain bill |
| `boil-hop-addition` | automation | Manages hop schedule, calculates IBU |
| `cooling` | automation | Temperature reduction simulation |
| `fermentation-check` | automation | Gravity reading, detect stuck fermentation |
| `lagering-complete` | automation | Final gravity + conditioning check |
| `batch-qc` | LLM | Quality analysis, tasting notes generation |

**Human Task:** Brewmaster quality hold — stuck fermentation or failed QC

### 3.2 Bottling Line Process

Receives a completed brew batch, produces labeled bottles.

**BPMN Flow:**
1. **Start** — `BrewComplete` message
2. **Volume Reading** (automation) — measures bright tank volume, calculates bottle count (12oz standard)
3. **Label Generation** (LLM) — generates label data: batch number, brew date, ABV, tasting notes, food pairings, marketing description
4. **Filling Simulation** (automation + timer) — fill bottles proportional to volume. Tracks fill rate, simulates ~2% breakage/waste.
5. **Quality Sampling** (automation) — carbonation, clarity, ABV check. Pass/fail gate.
   - **If fail** → BPMN error `QUALITY_HOLD` → User task for brewmaster
6. **Publish `BottlesReady`** message

**Workers (4):**

| Worker | Type |
|--------|------|
| `volume-reading` | automation |
| `label-generation` | LLM |
| `filling-simulation` | automation |
| `quality-sampling` | automation |

### 3.3 Crating & Palletizing Process (Robotic Depth)

The robotic packaging cell with full sensor simulation.

#### Physical Layout

```
[Bright Tank Outlet]
       │
  ═══ Conveyor A ═══  (bottles in single file)
       │
  [Robotic Arm #1: Bottle Inspector]  ← vision system
       │
  ═══ Conveyor B ═══  (approved bottles, accumulator buffer)
       │
  [Robotic Arm #2: Case Packer]  ← picks 24 bottles, loads into case
       │
  ═══ Conveyor C ═══  (sealed cases)
       │
  [Robotic Arm #3: Palletizer]  ← stacks cases onto pallet
       │
  [Pallet Wrapper]  ← stretch wrap
       │
  [Staging Area]  → PalletsReady message
```

#### Robotic Arm Telemetry

Each arm is a full actuator simulation with:
- **Joint positions**: shoulder, elbow, wrist, extension (degrees/mm)
- **Gripper**: state (open/closing/closed/releasing), pressure (PSI), min/max thresholds
- **Health**: motor temperature, vibration level (mm/s RMS), cycle count, bearing wear index
- **Fault tracking**: fault history, MTBF calculation, recovery actions

#### Vision System (Bottle Inspector)

Per-bottle inspection with:
- Defect detection: cracks, chips, underfill, overfill, label alignment, foreign objects
- Confidence scores per defect type
- Three verdicts: `pass`, `reject`, `review` (low confidence → LLM edge case review)

#### Conveyor Telemetry

Per-conveyor monitoring:
- Photo-eye sensors (entry/exit/count)
- Accumulator buffer level (0-100%)
- Motor current (jam detection), belt tension, temperature
- Throughput actual vs target, efficiency ratio

#### BPMN Flow

1. **Start** — `BottlesReady` message
2. **Initialize Line** (automation) — warm up arms, calibrate sensors, self-diagnostics
3. **Sub-process: Inspection Cell**
   - Multi-instance over bottle batches (groups of 24)
   - `bottle-inspect` (automation) — vision system simulation
   - `vision-review` (LLM) — handles low-confidence edge cases
   - Error boundary: `FOREIGN_OBJECT_DETECTED` → emergency stop → User task: line supervisor
4. **Sub-process: Case Packing Cell**
   - `case-packer-cycle` (automation) — arm state machine: `IDLE → PICKING → PLACING → SEALING → IDLE`
   - Gripper pressure feedback loop
   - Error boundaries: `GRIP_LOST`, `OVER_TEMP`, `COLLISION_DETECT`
   - `arm-recovery` (automation) — recalibration sequence
5. **Sub-process: Palletizing Cell**
   - `palletizer-cycle` (automation) — layer-by-layer stacking, weight checks
   - `stability-check` (automation) — load distribution verification
   - Error boundary: `UNSTABLE_PALLET` → restack last layer
6. **Pallet Wrapping** (automation + timer)
7. **Staging** (automation) — lane assignment, manifest generation
8. **Predictive Maintenance** (LLM, parallel non-blocking) — analyzes session telemetry
   - If urgent → publishes `MaintenanceRequired` message
9. **Publish `PalletsReady`**

#### Error Recovery Matrix

| Fault | Source | Detection | BPMN Pattern | Recovery | Downtime |
|-------|--------|-----------|-------------|----------|----------|
| Cracked bottle | Vision | Confidence > 0.8 | Normal flow (reject) | Auto | 0s |
| Low-confidence defect | Vision | Confidence 0.4-0.8 | Route to LLM | LLM decides | ~2s |
| Foreign object | Vision | Any confidence | Error boundary → e-stop | Human task | Manual |
| Grip lost | Case packer | Pressure < min | Error boundary `GRIP_LOST` | Re-home, retry | ~5s |
| Crush risk | Case packer | Pressure > max | Error boundary `CRUSH_RISK` | E-stop, recalibrate | ~15s |
| Arm overtemp | Any arm | Temp > 80°C | Error boundary `OVER_TEMP` | Cool-down timer | ~30s |
| High vibration | Any arm | >7.0 mm/s RMS | Error boundary `VIBRATION_LIMIT` | Stop, log maintenance | Depends |
| Conveyor jam | Any belt | Current spike + photoeye | Error boundary `CONVEYOR_JAM` | Reverse 2s, clear | ~10s |
| Belt slip | Any belt | Speed deviation >10% | Warning logged | Adjust next stop | 0s |
| Pallet unstable | Palletizer | Weight off-center | Error boundary `UNSTABLE_PALLET` | Restack layer | ~20s |
| Predictive alert | Maintenance LLM | Trend analysis | Non-blocking message | Schedule window | 0s |

**Workers (8):**

| Worker | Type |
|--------|------|
| `line-initialize` | automation |
| `bottle-inspect` | automation |
| `vision-review` | LLM |
| `case-packer-cycle` | automation |
| `arm-recovery` | automation |
| `palletizer-cycle` | automation |
| `pallet-wrap-stage` | automation |
| `predictive-maintenance` | LLM (agentic, multi-tool) |

**Human Task:** Line supervisor on emergency stops / foreign objects

### Phase 1 Totals

- 3 BPMN processes
- 19 workers (15 automation, 4 LLM)
- 3 human approval tasks (brewmaster QC × 2, line supervisor)

---

## 4. Phase 2: The Business Layer

### 4.1 Sales Process

The demand generator — timer-driven continuous order flow.

**BPMN Flow:**
1. **Timer Start Event** — fires every N seconds (configurable; 30s for demo)
2. **Generate Order** (LLM) — creates realistic sales orders with customer name/location, quantity, priority, seasonal demand patterns, special notes
3. **Validate Order** (automation) — check against current inventory:
   - `FULFILL_FROM_STOCK` — enough inventory
   - `PARTIAL_FILL` — some inventory + trigger production
   - `BACKORDER` — no inventory, queue for next batch
4. **Exclusive Gateway** — routes by fulfillment status:
   - Fulfill → publish `ShipmentRequested` → End
   - Partial → publish `ShipmentRequested` (partial) + `ProductionNeeded` → wait for `BatchAllocated` → publish `ShipmentRequested` (remainder) → End
   - Backorder → publish `ProductionNeeded` → wait for `BatchAllocated` → publish `ShipmentRequested` → End
5. **Publish `OrderPlaced`** to accounting (always)

**Workers (3):**

| Worker | Type |
|--------|------|
| `generate-order` | LLM |
| `validate-order` | automation |
| `order-allocation` | automation |

### 4.2 Materials Management Process

Manages ingredient inventory and procurement.

**BPMN Flow:**
1. **Start** — `ProductionNeeded` message OR reorder-point timer
2. **Check Inventory** (automation) — current stock vs recipe requirements
3. **Calculate Requirements** (automation) — total ingredients for N batches
4. **Exclusive Gateway** — enough materials?
   - **Yes** → reserve → publish `MaterialsReady` → End
   - **No** → Procurement sub-process
5. **Procurement Sub-process:**
   - `find-suppliers` (LLM agent, multi-tool) — evaluates suppliers on price, lead time, quality, urgency. Tools: `check_current_prices`, `check_inventory_levels`, `check_pending_orders`, `check_budget_remaining`
   - **Exclusive Gateway** — PO amount > threshold?
     - **Yes** → User task: Operations manager approval
     - **No** → auto-approve
   - `place-purchase-order` (automation) — publish `PurchaseOrderPlaced` to accounting
   - **Timer catch** — simulated delivery lead time
   - `receive-materials` (automation) — update inventory
   - `materials-qc` (automation) — verify quality (grain moisture, hop freshness)
   - **If QC fails** → BPMN error `MATERIALS_REJECTED` → loop back to procurement
6. **Publish `MaterialsPurchased`** to accounting

**Workers (6):**

| Worker | Type |
|--------|------|
| `check-inventory` | automation |
| `calculate-requirements` | automation |
| `find-suppliers` | LLM (agentic, multi-tool) |
| `place-purchase-order` | automation |
| `receive-materials` | automation |
| `materials-qc` | automation |

**Human Task:** Operations manager for high-value PO approval

### 4.3 Distribution Process

Gets pallets from staging to customers.

**BPMN Flow:**
1. **Start** — `ShipmentRequested` message
2. **Route Planning** (LLM agent) — selects truck/route, estimates delivery, considers consolidation
3. **Load Assignment** (automation) — assign pallets, verify weight, generate bill of lading
4. **Dispatch** (automation + timer) — truck departs, transit time simulation
5. **Transit Monitoring** (timer loop, non-interrupting) — periodic GPS simulation, ETA updates
   - Timer boundary: if delivery exceeds 2x expected → `DELIVERY_DELAYED` → User task: dispatcher
6. **Delivery Confirmation** (automation) — proof of delivery
   - Error boundary: `DELIVERY_REFUSED` → User task: dispatcher
7. **Publish `DeliveryComplete`**

**Workers (5):**

| Worker | Type |
|--------|------|
| `route-planning` | LLM |
| `load-assignment` | automation |
| `dispatch-truck` | automation |
| `transit-update` | automation |
| `delivery-confirmation` | automation |

**Human Task:** Dispatcher for delivery exceptions (delayed/refused)

### 4.4 Accounting Process (Full Financial Depth)

Double-entry ledger, batch costing, P&L, cash flow forecasting.

#### Chart of Accounts

| Code | Category | Description |
|------|----------|------------|
| `REV-SALES` | Revenue | Beer sales |
| `REV-REFUNDS` | Revenue | Customer returns |
| `COGS-GRAIN` | COGS | Pilsner malt (and other grains) |
| `COGS-HOPS` | COGS | Hallertau (and other hops) |
| `COGS-YEAST` | COGS | Kolsch yeast (and other strains) |
| `COGS-WATER` | COGS | Water treatment |
| `COGS-PACKAGING` | COGS | Bottles, caps, labels, cases |
| `COGS-LABOR-BREW` | COGS | Brewing labor (time-based) |
| `COGS-LABOR-PACK` | COGS | Packaging labor (time-based) |
| `COGS-ENERGY` | COGS | Gas, electric, refrigeration |
| `OPEX-SHIPPING` | OpEx | Delivery/freight |
| `OPEX-WASTE` | OpEx | Rejected bottles, spoiled ingredients |
| `OPEX-MAINTENANCE` | OpEx | Equipment repair/parts |
| `OPEX-QUALITY` | OpEx | Lab testing, QC |
| `INV-RAW-MATERIALS` | Asset | Ingredients on hand |
| `INV-WIP` | Asset | Beer in fermentation/conditioning |
| `INV-FINISHED-GOODS` | Asset | Cases ready for sale |
| `CASH-OPERATING` | Asset | Main bank account |

#### BPMN Flow

1. **Signal Start** — factory boot. Initialize accounts + opening balances.

2. **Event Sub-processes** (non-interrupting):
   - **`OrderPlaced`** → `record-revenue` — debit CASH, credit REV-SALES
   - **`MaterialsPurchased`** → `record-materials-cost` — debit INV-RAW-MATERIALS, credit CASH
   - **`BrewComplete`** → `calculate-batch-cost` — full batch cost sheet, move value through INV accounts
   - **`DeliveryComplete`** → `record-shipping-cost` — debit OPEX-SHIPPING, credit CASH
   - **`WasteEvent`** → `record-waste` — debit OPEX-WASTE, credit INV-*
   - **`MaintenanceCompleted`** → `record-maintenance` — debit OPEX-MAINTENANCE, credit CASH

3. **Periodic Reports** (timer sub-process):
   - `generate-pnl` (automation) — aggregates ledger → P&L report
   - `margin-analysis` (automation) — unit economics, margin trends
   - `valuate-inventory` (automation) — inventory snapshot, reorder analysis
     - If days-of-supply below threshold → publish `MaterialsLow` signal
   - `budget-variance` (automation) — actuals vs budgets
   - `forecast-cash-flow` (LLM) — projects cash position, flags risks
   - `financial-advisor` (LLM, agentic, multi-tool) — strategic analysis: profitability, breakeven, pricing recommendations, anomaly detection
     - Tools: `query_ledger`, `get_production_metrics`, `get_order_pipeline`
     - If cash forecast negative or budget exceeded >20% → User task: Owner approval

**Workers (10):**

| Worker | Type |
|--------|------|
| `record-revenue` | automation |
| `record-materials-cost` | automation |
| `calculate-batch-cost` | automation |
| `record-shipping-cost` | automation |
| `record-waste` | automation |
| `record-maintenance` | automation |
| `generate-pnl` | automation |
| `valuate-inventory` | automation |
| `forecast-cash-flow` | LLM |
| `financial-advisor` | LLM (agentic, multi-tool) |

**Human Task:** Owner approval for budget overruns / cash flow alerts

### Phase 2 Totals

- 4 BPMN processes
- 24 workers (18 automation, 6 LLM)
- 2 human approval tasks (operations manager, dispatcher)
- Plus accounting owner approval

---

## 5. Data Model

### 5.1 Multi-Recipe Architecture

The `Recipe` type is a first-class object that drives every process. When adding a new beer, create a recipe file and the same BPMN processes adapt.

```typescript
interface Recipe {
  id: string                     // 'parkers-kolsch'
  name: string                   // "Parker's Kolsch"
  style: string                  // 'Kolsch'
  version: number

  grainBill: { grain: string; quantity: number; percentage: number }[]
  hopSchedule: { hop: string; quantity: number; additionTime: number; purpose: string }[]
  yeast: { strain: string; quantity: number; tempRange: { min: number; max: number } }
  waterProfile: { calcium: number; sulfate: number; chloride: number; ratio: number }

  process: {
    mashTemp: number; mashDuration: number; boilDuration: number
    fermentationTemp: number; fermentationDays: number
    lageringTemp?: number; lageringDays?: number
    targetOG: number; targetFG: number; targetABV: number
    targetIBU: number; targetSRM: number
  }

  packaging: { bottleSize: number; casePack: number; casesPerPallet: number }
  pricing: { basePricePerCase: number; premiumMultiplier: number }
}
```

### 5.2 Robotic Telemetry Types

```typescript
interface RoboticArmTelemetry {
  armId: string
  status: 'idle' | 'homing' | 'picking' | 'placing' | 'sealing' | 'stacking' | 'fault' | 'recovering'
  joints: { shoulder: number; elbow: number; wrist: number; extension: number }
  velocity: number
  targetPosition: { x: number; y: number; z: number }
  currentPosition: { x: number; y: number; z: number }
  positionError: number
  gripperState: 'open' | 'closing' | 'closed' | 'releasing'
  gripperPressure: number
  gripperPressureTarget: number
  motorTemperature: number
  vibrationLevel: number
  cycleCount: number
  cyclesSinceLastMaintenance: number
  bearingWearIndex: number
  faultHistory: ArmFault[]
  meanTimeBetweenFailures: number
}

interface ConveyorTelemetry {
  conveyorId: string
  running: boolean; speed: number; targetSpeed: number
  photoeyeSensors: { entry: boolean; exit: boolean; count: number }
  bufferLevel: number; bufferCapacity: number; backpressure: boolean
  motorCurrent: number; beltTension: number; jamDetected: boolean
  throughputActual: number; throughputTarget: number; efficiency: number
}

interface VisionInspection {
  bottleId: string
  defects: {
    crack: { detected: boolean; confidence: number }
    chip: { detected: boolean; confidence: number }
    underfill: { detected: boolean; confidence: number; fillLevel?: number }
    label: { present: boolean; aligned: boolean; readable: boolean }
    foreignObject: { detected: boolean; confidence: number }
  }
  overallVerdict: 'pass' | 'reject' | 'review'
  confidenceScore: number
}
```

### 5.3 Financial Types

```typescript
interface LedgerEntry {
  entryId: string; timestamp: string
  type: 'debit' | 'credit'
  account: AccountCode; amount: number
  description: string; sourceEvent: string; correlationId: string
  category: 'revenue' | 'cogs' | 'opex' | 'capex' | 'inventory'
}

interface BatchCostSheet {
  batchId: string; recipe: string
  materials: { [ingredient: string]: { quantity: number; unitCost: number; total: number } }
  totalMaterials: number
  labor: { brewingHours: number; packagingHours: number; laborRate: number; totalLabor: number }
  overhead: { energyCost: number; equipmentDepreciation: number; totalOverhead: number }
  totalCost: number; unitsProduced: number; costPerCase: number; costPerBottle: number
  waste: { rejectedBottles: number; spillage: number; wasteCost: number }
}

interface ProfitAndLoss {
  period: string
  revenue: { grossSales: number; refunds: number; netRevenue: number }
  costOfGoodsSold: { materials: number; labor: number; overhead: number; totalCOGS: number }
  grossProfit: number; grossMargin: number
  operatingExpenses: { shipping: number; waste: number; maintenance: number; totalOpex: number }
  operatingProfit: number; operatingMargin: number
  revenuePerCase: number; costPerCase: number; profitPerCase: number
}

interface CashFlowForecast {
  inflows: { expectedDeliveries: number; pendingOrders: number; totalExpectedInflow: number }
  outflows: { pendingPOs: number; scheduledMaintenance: number; totalExpectedOutflow: number }
  netCashFlow: number; projectedBalance: number
  alert?: string
}
```

### 5.4 External State Store

Large accumulating state lives **outside Zeebe process variables** (lesson from healthcare project's hipaaAudit merge conflict):

```typescript
interface FactoryState {
  inventory: {
    rawMaterials: Map<string, { quantity: number; unitCost: number }>
    finishedGoods: Map<string, { cases: number; allocated: number }>  // keyed by recipeId
    workInProgress: Map<string, BatchStatus>
  }
  ledger: LedgerEntry[]                       // append-only
  equipment: {
    arms: Map<string, RoboticArmTelemetry>
    conveyors: Map<string, ConveyorTelemetry>
  }
  orders: {
    pending: Map<string, Order>
    fulfilled: Map<string, Order>
    backlog: Map<string, Order>
  }
}
```

Workers read/write to this store and pass only **references + small summaries** through Zeebe variables.

### 5.5 Message Types

```typescript
interface OrderPlacedMessage {
  orderId: string; recipeId: string; quantity: number
  customerId: string; priority: 'standard' | 'express' | 'event'
  deliveryAddress: string
}

interface MaterialsReadyMessage {
  batchId: string; recipeId: string; recipe: Recipe
}

interface BrewCompleteMessage {
  batchId: string; recipeId: string
  volume: number; qualityScore: number; tastingNotes: string
}

interface BottlesReadyMessage {
  batchId: string; bottleCount: number; qualityData: object
}

interface PalletsReadyMessage {
  batchId: string; shipmentId: string
  palletCount: number; totalWeight: number
}

interface DeliveryCompleteMessage {
  shipmentId: string; orderId: string; deliveredAt: string
}
```

---

## 6. Agentic LLM Patterns

Three workers use **multi-tool agentic reasoning** (not just structured output):

### 6.1 Procurement Agent (Materials Process)

```
Tools:
  - check_current_prices(ingredient) → supplier price lists
  - check_inventory_levels() → current stock
  - check_pending_orders() → pipeline demand
  - check_budget_remaining() → accounting constraints

Reasoning example:
  "Grain prices up 12% from Supplier A. Supplier B is cheaper but 5-day lead.
   We have 3 days of supply. Backlog is 8 orders.
   Decision: split — rush 50% from A, standard 50% from B."
```

### 6.2 Financial Advisor Agent (Accounting Process)

```
Tools:
  - query_ledger(account, period) → financial data
  - get_production_metrics() → batch counts, waste rates
  - get_order_pipeline() → upcoming demand

Reasoning: trend analysis, anomaly detection, strategic recommendations
Output: natural-language financial brief ("CFO's weekly email")
```

### 6.3 Predictive Maintenance Agent (Crating Process)

```
Tools:
  - get_telemetry_history(equipment_id, window) → sensor data
  - get_fault_history(equipment_id) → past failures
  - check_maintenance_schedule() → planned maintenance

Reasoning: correlates vibration trends with historical faults, predicts failures
Output: maintenance predictions with confidence + urgency rating
```

---

## 7. Human Approval / Exception Loops

| # | Task | Process | Trigger | Decision Options |
|---|------|---------|---------|-----------------|
| 1 | Brewmaster Quality Hold | Brewing | Stuck fermentation or failed final QC | Approve override, adjust parameters, dump batch |
| 2 | Brewmaster Sampling Hold | Bottling | Failed quality sampling (carbonation, clarity, ABV) | Release, re-carbonate, dump |
| 3 | Line Supervisor E-Stop | Crating | Foreign object or emergency stop | Clear and restart, call maintenance, shut down line |
| 4 | Operations Manager PO | Materials | Purchase order exceeds threshold | Approve, modify quantities, reject |
| 5 | Dispatcher Exception | Distribution | Delivery delayed >2x or refused | Reroute, reschedule, contact customer |
| 6 | Owner Financial Alert | Accounting | Cash forecast negative or budget exceeded >20% | Approve overspend, pause production, adjust pricing |

---

## 8. Project Structure

```
factorio/
├── bpmn/                          # 7 BPMN process files
├── src/
│   ├── workers/                   # Worker registration (one file per process)
│   │   ├── brewing.ts
│   │   ├── bottling.ts
│   │   ├── crating.ts
│   │   ├── sales.ts
│   │   ├── materials.ts
│   │   ├── distribution.ts
│   │   ├── accounting.ts
│   │   └── index.ts              # Registers all workers
│   ├── agents/                    # LLM agents (9 files)
│   ├── automation/                # Deterministic logic, organized by process
│   │   ├── brewing/
│   │   ├── bottling/
│   │   ├── crating/
│   │   ├── sales/
│   │   ├── materials/
│   │   ├── distribution/
│   │   └── accounting/
│   ├── types/                     # Per-process variable types + shared types
│   ├── recipes/                   # Recipe definitions (parkers-kolsch.ts first)
│   ├── metrics/                   # Prometheus metrics
│   ├── state/                     # External state store
│   ├── data/                      # Seed data (initial inventory, balances)
│   ├── deploy.ts                  # Deploy all BPMN files
│   ├── start-factory.ts           # Start simulation
│   └── stop-factory.ts            # Graceful shutdown
├── docker/
├── docs/plans/
├── package.json, tsconfig.json, jest.config.js
├── CLAUDE.md
└── README.md
```

---

## 9. Tech Stack

Same as `camunda8-exploration`:
- TypeScript 5.9 + ts-node
- `@camunda8/sdk` v8.8.5 — Zeebe gRPC
- `@langchain/google-genai` — Gemini 2.5 Flash
- Zod — structured output validation
- Jest + ts-jest — testing
- Docker Compose — Zeebe + Operate + Tasklist + Elasticsearch + Prometheus
- prom-client — Prometheus metrics

Removed: Resend, React Email (not needed)
Added: LangChain tool-calling patterns for agentic workers

---

## 10. Prometheus Metrics

### Production Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `factory_batch_duration_seconds` | Histogram | `recipe`, `stage` |
| `factory_batches_total` | Counter | `recipe`, `status` |
| `factory_bottles_produced_total` | Counter | `recipe` |
| `factory_bottles_rejected_total` | Counter | `recipe`, `reason` |
| `factory_pallets_produced_total` | Counter | `recipe` |
| `factory_arm_cycles_total` | Counter | `arm_id` |
| `factory_arm_faults_total` | Counter | `arm_id`, `fault_code` |
| `factory_conveyor_efficiency` | Gauge | `conveyor_id` |

### Business Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `factory_orders_total` | Counter | `priority`, `fulfillment` |
| `factory_revenue_total` | Counter | `recipe` |
| `factory_cogs_total` | Counter | `category` |
| `factory_opex_total` | Counter | `category` |
| `factory_gross_margin` | Gauge | — |
| `factory_operating_margin` | Gauge | — |
| `factory_cost_per_case` | Gauge | `recipe` |
| `factory_inventory_value` | Gauge | `type` |
| `factory_cash_balance` | Gauge | — |
| `factory_days_of_supply` | Gauge | `material` |

---

## 11. Grand Totals

| | Automation | LLM | LLM (Agentic) | Human Tasks | Total Workers |
|-|-----------|-----|---------------|-------------|--------------|
| Phase 1 | 15 | 2 | 2 | 3 | 19 |
| Phase 2 | 18 | 3 | 3 | 3 | 24 |
| **Total** | **33** | **5** | **5** | **6** | **~46** |

**7 BPMN processes, ~46 workers, 6 human approval tasks, 3 agentic multi-tool LLM agents**
