# FACTORIO Phase 2: The Business Layer (Simplified)

## Overview

Add 4 business processes (Sales, Materials, Distribution, Accounting) connected to the 3 existing Phase 1 physical processes via Zeebe message correlation. Focus on core happy paths and ledger entries. Skip periodic reports, multi-tool agents, and complex exception handling — those can be layered on later.

## Message Chain

```
Sales ──OrderPlaced──→ Accounting (record-revenue)
     └──ProductionNeeded──→ Materials
Materials ──MaterialsReady──→ Brewing (existing, needs message start)
         └──MaterialsPurchased──→ Accounting (record-materials-cost)
Brewing ──BrewComplete──→ Bottling (existing, needs message start)
       └──BrewComplete──→ Accounting (calculate-batch-cost)
Bottling ──BottlesReady──→ Crating (existing, needs message start)
Crating ──PalletsReady──→ Distribution
Distribution ──DeliveryComplete──→ Accounting (record-shipping-cost)
```

## Phase 1 Modifications

Brewing, Bottling, and Crating end events must be upgraded to publish messages so they trigger downstream processes. Bottling and Crating start events must accept message correlation.

Specifically:
- **Brewing**: `End_BrewComplete` publishes `BrewComplete` message (correlationKey: batchId)
- **Bottling**: `Start_Bottling` becomes message start (correlationKey: batchId), `End_BottlesReady` publishes `BottlesReady` message
- **Crating**: `Start_Crating` becomes message start (correlationKey: batchId), `End_PalletsReady` publishes `PalletsReady` message

## Process 1: Sales

Timer-driven order generation.

### BPMN Flow

1. **Timer Start Event** — fires every 30s (configurable)
2. **Generate Order** (LLM) — creates realistic order: customer name, location, quantity (cases), priority, seasonal notes
3. **Validate Order** (automation) — checks finished goods inventory
4. **Exclusive Gateway** — fulfillment status
   - `FULFILL` → reserve stock → publish `ShipmentRequested` → End (fulfilled)
   - `BACKORDER` → publish `ProductionNeeded` → End (backordered)
5. **Publish `OrderPlaced`** to accounting (always, via parallel path before gateway)

### Workers (3)

| Worker | Type | Task Type |
|--------|------|-----------|
| Generate Order | LLM | `generate-order` |
| Validate Order | automation | `validate-order` |
| Order Allocation | automation | `order-allocation` |

### Process Variables

```typescript
interface SalesProcessVariables {
  orderId: string
  recipeId: string
  order?: {
    customerId: string
    customerName: string
    deliveryAddress: string
    quantity: number          // cases
    priority: 'standard' | 'express' | 'event'
    notes: string
  }
  fulfillmentStatus?: 'FULFILL' | 'BACKORDER'
  allocationResult?: {
    allocated: number
    backordered: number
  }
}
```

## Process 2: Materials Management

Procurement triggered by production needs.

### BPMN Flow

1. **Message Start** — `ProductionNeeded` (correlationKey: orderId)
2. **Check Inventory** (automation) — current stock vs recipe requirements
3. **Calculate Requirements** (automation) — ingredient quantities for batch
4. **Exclusive Gateway** — enough materials?
   - **Yes** → Reserve materials → publish `MaterialsReady` → End
   - **No** → Find Suppliers (LLM) → Place PO → Timer (delivery delay, 5s simulated) → Receive Materials → publish `MaterialsReady` → End
5. **Publish `MaterialsPurchased`** to accounting (when PO placed)

### Workers (4)

| Worker | Type | Task Type |
|--------|------|-----------|
| Check Inventory | automation | `check-inventory` |
| Calculate Requirements | automation | `calculate-requirements` |
| Find Suppliers | LLM | `find-suppliers` |
| Receive Materials | automation | `receive-materials` |

### Process Variables

```typescript
interface MaterialsProcessVariables {
  orderId: string
  recipeId: string
  recipe: Recipe
  batchId: string
  inventoryCheck?: {
    sufficient: boolean
    available: Record<string, number>
    required: Record<string, number>
    shortages: Record<string, number>
  }
  supplierDecision?: {
    supplier: string
    totalCost: number
    leadTimeDays: number
    items: { ingredient: string; quantity: number; unitCost: number }[]
  }
  purchaseOrder?: {
    poId: string
    supplier: string
    totalCost: number
    items: { ingredient: string; quantity: number; unitCost: number }[]
  }
}
```

## Process 3: Distribution

Ships pallets to customers.

### BPMN Flow

1. **Message Start** — `PalletsReady` (correlationKey: shipmentId)
2. **Route Planning** (LLM) — picks route, estimates delivery time
3. **Load Assignment** (automation) — assigns pallets to truck, generates bill of lading
4. **Dispatch** (automation) — truck departs
5. **Timer** — simulated transit time (3-8s)
6. **Delivery Confirmation** (automation) — proof of delivery, publish `DeliveryComplete`

### Workers (4)

| Worker | Type | Task Type |
|--------|------|-----------|
| Route Planning | LLM | `route-planning` |
| Load Assignment | automation | `load-assignment` |
| Dispatch Truck | automation | `dispatch-truck` |
| Delivery Confirmation | automation | `delivery-confirmation` |

### Process Variables

```typescript
interface DistributionProcessVariables {
  shipmentId: string
  batchId: string
  orderId: string
  palletCount: number
  totalWeight: number
  deliveryAddress: string
  route?: {
    truckId: string
    estimatedDistance: number
    estimatedHours: number
    route: string              // description
  }
  loadAssignment?: {
    billOfLadingId: string
    palletIds: string[]
    totalWeight: number
    truckId: string
  }
  deliveryResult?: {
    deliveredAt: string
    signedBy: string
    condition: 'good' | 'damaged'
  }
}
```

## Process 4: Accounting

Event-driven double-entry ledger. Each financial event triggers a separate process instance.

### BPMN Flow

Uses 4 separate simple processes (one per event type), each:
1. **Message Start** — receives financial event
2. **Record Entry** (automation) — creates double-entry ledger entries
3. **End**

Alternative: Single process with 4 message event sub-processes. For simplicity, use 4 separate small processes.

### Workers (4)

| Worker | Type | Task Type |
|--------|------|-----------|
| Record Revenue | automation | `record-revenue` |
| Record Materials Cost | automation | `record-materials-cost` |
| Calculate Batch Cost | automation | `calculate-batch-cost` |
| Record Shipping Cost | automation | `record-shipping-cost` |

### Chart of Accounts

| Code | Category | Description |
|------|----------|------------|
| `CASH` | Asset | Operating cash |
| `INV-RAW` | Asset | Raw materials inventory |
| `INV-WIP` | Asset | Work in progress |
| `INV-FG` | Asset | Finished goods |
| `REV-SALES` | Revenue | Beer sales |
| `COGS-MATERIALS` | COGS | Ingredient costs |
| `COGS-LABOR` | COGS | Brewing + packaging labor |
| `COGS-OVERHEAD` | COGS | Energy, depreciation |
| `OPEX-SHIPPING` | OpEx | Delivery costs |

### Ledger Entry Type

```typescript
interface LedgerEntry {
  entryId: string
  timestamp: string
  debitAccount: string
  creditAccount: string
  amount: number
  description: string
  sourceEvent: string          // 'OrderPlaced' | 'MaterialsPurchased' | etc.
  correlationId: string        // orderId, batchId, shipmentId
}
```

### Accounting Process Variables

```typescript
interface AccountingProcessVariables {
  eventType: string
  correlationId: string
  // Plus the relevant message payload fields
  amount?: number
  order?: OrderPlacedMessage
  purchase?: { supplier: string; totalCost: number; items: any[] }
  batch?: BrewCompleteMessage
  delivery?: DeliveryCompleteMessage
}
```

## State Store Extensions

Extend `FactoryState` with:

```typescript
// Add to existing FactoryState
orders: {
  pending: Map<string, Order>
  fulfilled: Map<string, Order>
}
ledger: LedgerEntry[]           // append-only
accounts: Map<string, number>   // running balances per account code
```

## New Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `factory_orders_total` | Counter | `priority`, `fulfillment` |
| `factory_revenue_total` | Counter | `recipe` |
| `factory_cogs_total` | Counter | `category` |
| `factory_cash_balance` | Gauge | — |
| `factory_inventory_value` | Gauge | `type` (raw, wip, fg) |
| `factory_deliveries_total` | Counter | `status` |

## Phase 2 Totals

- 4 new BPMN processes (sales, materials, distribution, accounting)
- 15 new workers (12 automation, 3 LLM)
- 0 new human tasks
- Chart of accounts + double-entry ledger
- Message correlation connecting all 7 processes

### Combined Totals (Phase 1 + 2)

| | Automation | LLM | Human Tasks | Total |
|-|-----------|-----|-------------|-------|
| Phase 1 | 15 | 4 | 3 | 19 |
| Phase 2 | 12 | 3 | 0 | 15 |
| **Total** | **27** | **7** | **3** | **34** |

## What's Deferred

- Multi-tool agentic LLM patterns (procurement agent, financial advisor)
- Periodic financial reports (P&L, margin analysis, inventory valuation)
- Operations manager PO approval (human task)
- Dispatcher exception handling (human task)
- Transit monitoring loop
- Materials QC loop
- Partial fill order logic
- Owner financial alerts
