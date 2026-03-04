# FACTORIO Phase 2: Business Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 4 business processes (Sales, Materials, Distribution, Accounting) with 15 workers, double-entry ledger, and Zeebe message correlation connecting all 7 processes end-to-end.

**Architecture:** Timer-driven sales generates orders → materials procures ingredients → existing brewing/bottling/crating processes run → distribution ships pallets → accounting records every financial event as double-entry ledger entries. External state store holds orders, ledger, and account balances. Phase 1 BPMN processes get message start/end events for cross-process triggering.

**Tech Stack:** Same as Phase 1 — TypeScript, @camunda8/sdk, @langchain/google-genai (Gemini 2.5 Flash), Zod, Jest, prom-client. LangChain tool-calling for agentic patterns is NOT used in simplified Phase 2.

**Reference files:** Design doc at `docs/plans/2026-03-03-factorio-phase2-design.md`. Phase 1 design at `docs/plans/2026-03-03-factorio-brewery-design.md`.

---

## Task 0: Extend State Store with Orders, Ledger, and Accounts

**Files:**
- Modify: `src/state/index.ts`
- Modify: `src/state/index.test.ts`

**Step 1: Write failing tests for new state store features**

Add to `src/state/index.test.ts`:

```typescript
// --- Orders ---

describe('factoryState — orders', () => {
  it('addOrder stores a pending order', () => {
    factoryState.addOrder({
      orderId: 'order-1',
      recipeId: 'parkers-kolsch',
      quantity: 10,
      customerId: 'cust-1',
      customerName: 'Test Bar',
      deliveryAddress: '123 Main St',
      priority: 'standard' as const,
    })
    const order = factoryState.getOrder('order-1')
    expect(order).toBeDefined()
    expect(order!.status).toBe('pending')
    expect(order!.quantity).toBe(10)
  })

  it('fulfillOrder changes status to fulfilled', () => {
    factoryState.addOrder({
      orderId: 'order-2',
      recipeId: 'parkers-kolsch',
      quantity: 5,
      customerId: 'cust-2',
      customerName: 'Test Pub',
      deliveryAddress: '456 Oak Ave',
      priority: 'express' as const,
    })
    factoryState.fulfillOrder('order-2')
    expect(factoryState.getOrder('order-2')!.status).toBe('fulfilled')
  })

  it('getPendingOrders returns only pending orders', () => {
    factoryState.addOrder({ orderId: 'o-a', recipeId: 'pk', quantity: 1, customerId: 'c1', customerName: 'A', deliveryAddress: 'a', priority: 'standard' as const })
    factoryState.addOrder({ orderId: 'o-b', recipeId: 'pk', quantity: 2, customerId: 'c2', customerName: 'B', deliveryAddress: 'b', priority: 'standard' as const })
    factoryState.fulfillOrder('o-a')
    expect(factoryState.getPendingOrders()).toHaveLength(1)
    expect(factoryState.getPendingOrders()[0].orderId).toBe('o-b')
  })
})

// --- Ledger ---

describe('factoryState — ledger', () => {
  it('appendLedgerEntry adds to ledger', () => {
    factoryState.appendLedgerEntry({
      entryId: 'entry-1',
      timestamp: new Date().toISOString(),
      debitAccount: 'CASH',
      creditAccount: 'REV-SALES',
      amount: 360,
      description: 'Sale of 10 cases',
      sourceEvent: 'OrderPlaced',
      correlationId: 'order-1',
    })
    expect(factoryState.getLedger()).toHaveLength(1)
  })

  it('getAccountBalance returns correct balance', () => {
    factoryState.appendLedgerEntry({
      entryId: 'e-1',
      timestamp: new Date().toISOString(),
      debitAccount: 'CASH',
      creditAccount: 'REV-SALES',
      amount: 100,
      description: 'test',
      sourceEvent: 'test',
      correlationId: 'test',
    })
    // Assets increase on debit
    expect(factoryState.getAccountBalance('CASH')).toBe(100)
    // Revenue increases on credit
    expect(factoryState.getAccountBalance('REV-SALES')).toBe(100)
  })

  it('multiple entries accumulate balances', () => {
    factoryState.appendLedgerEntry({
      entryId: 'e-1', timestamp: new Date().toISOString(),
      debitAccount: 'CASH', creditAccount: 'REV-SALES',
      amount: 100, description: 'sale 1', sourceEvent: 'OrderPlaced', correlationId: 'o1',
    })
    factoryState.appendLedgerEntry({
      entryId: 'e-2', timestamp: new Date().toISOString(),
      debitAccount: 'OPEX-SHIPPING', creditAccount: 'CASH',
      amount: 25, description: 'shipping', sourceEvent: 'DeliveryComplete', correlationId: 's1',
    })
    expect(factoryState.getAccountBalance('CASH')).toBe(75) // 100 debit - 25 credit
    expect(factoryState.getAccountBalance('REV-SALES')).toBe(100)
    expect(factoryState.getAccountBalance('OPEX-SHIPPING')).toBe(25)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /tmp/factorio && npx jest src/state/index.test.ts --no-coverage 2>&1`
Expected: FAIL — `factoryState.addOrder is not a function`

**Step 3: Implement state store extensions**

Add to `src/state/index.ts` — new interfaces before the class, new private fields and methods inside:

```typescript
// Add after FinishedGoodsEntry interface (line 9):

export interface Order {
  orderId: string
  recipeId: string
  quantity: number
  customerId: string
  customerName: string
  deliveryAddress: string
  priority: 'standard' | 'express' | 'event'
  status: 'pending' | 'fulfilled'
  createdAt: string
}

export interface LedgerEntry {
  entryId: string
  timestamp: string
  debitAccount: string
  creditAccount: string
  amount: number
  description: string
  sourceEvent: string
  correlationId: string
}
```

Inside `FactoryState` class, add new private fields:

```typescript
  private orders = new Map<string, Order>()
  private ledger: LedgerEntry[] = []
  private accountBalances = new Map<string, number>()
```

Add order methods:

```typescript
  addOrder(params: Omit<Order, 'status' | 'createdAt'>): void {
    this.orders.set(params.orderId, {
      ...params,
      status: 'pending',
      createdAt: new Date().toISOString(),
    })
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId)
  }

  fulfillOrder(orderId: string): void {
    const order = this.orders.get(orderId)
    if (order) order.status = 'fulfilled'
  }

  getPendingOrders(): Order[] {
    return Array.from(this.orders.values()).filter(o => o.status === 'pending')
  }
```

Add ledger methods:

```typescript
  appendLedgerEntry(entry: LedgerEntry): void {
    this.ledger.push(entry)
    // Update running balances
    const debitBal = this.accountBalances.get(entry.debitAccount) || 0
    this.accountBalances.set(entry.debitAccount, debitBal + entry.amount)
    const creditBal = this.accountBalances.get(entry.creditAccount) || 0
    this.accountBalances.set(entry.creditAccount, creditBal + entry.amount)
  }

  getLedger(): LedgerEntry[] {
    return this.ledger
  }

  getAccountBalance(account: string): number {
    return this.accountBalances.get(account) || 0
  }
```

Update `reset()` to clear new state:

```typescript
  reset(): void {
    this.rawMaterials.clear()
    this.finishedGoods.clear()
    this.orders.clear()
    this.ledger = []
    this.accountBalances.clear()
  }
```

**Step 4: Run tests to verify they pass**

Run: `cd /tmp/factorio && npx jest src/state/index.test.ts --no-coverage 2>&1`
Expected: All tests PASS (10 existing + 6 new = 16 total)

**Step 5: Commit**

```bash
git add src/state/index.ts src/state/index.test.ts
git commit -m "feat: extend state store with orders, ledger, and account balances"
```

---

## Task 1: Add Phase 2 Types and New Metrics

**Files:**
- Create: `src/types/sales-variables.ts`
- Create: `src/types/materials-variables.ts`
- Create: `src/types/distribution-variables.ts`
- Create: `src/types/accounting-variables.ts`
- Modify: `src/types/shared.ts` — add `MaterialsPurchasedMessage` and `ShipmentRequestedMessage`
- Modify: `src/metrics/index.ts` — add Phase 2 business metrics

**Step 1: Create type files**

`src/types/sales-variables.ts`:

```typescript
import { Recipe } from './recipe'

export interface SalesOrder {
  customerId: string
  customerName: string
  deliveryAddress: string
  quantity: number
  priority: 'standard' | 'express' | 'event'
  notes: string
}

export interface SalesProcessVariables {
  orderId: string
  recipeId: string
  recipe: Recipe
  order?: SalesOrder
  fulfillmentStatus?: 'FULFILL' | 'BACKORDER'
  allocationResult?: {
    allocated: number
    backordered: number
  }
}
```

`src/types/materials-variables.ts`:

```typescript
import { Recipe } from './recipe'

export interface InventoryCheckResult {
  sufficient: boolean
  available: Record<string, number>
  required: Record<string, number>
  shortages: Record<string, number>
}

export interface SupplierDecision {
  supplier: string
  totalCost: number
  leadTimeDays: number
  items: { ingredient: string; quantity: number; unitCost: number }[]
}

export interface MaterialsProcessVariables {
  orderId: string
  recipeId: string
  recipe: Recipe
  batchId: string
  inventoryCheck?: InventoryCheckResult
  supplierDecision?: SupplierDecision
  purchaseOrder?: {
    poId: string
    supplier: string
    totalCost: number
    items: { ingredient: string; quantity: number; unitCost: number }[]
  }
}
```

`src/types/distribution-variables.ts`:

```typescript
export interface Routeplan {
  truckId: string
  estimatedDistance: number
  estimatedHours: number
  route: string
}

export interface LoadAssignment {
  billOfLadingId: string
  palletIds: string[]
  totalWeight: number
  truckId: string
}

export interface DeliveryResult {
  deliveredAt: string
  signedBy: string
  condition: 'good' | 'damaged'
}

export interface DistributionProcessVariables {
  shipmentId: string
  batchId: string
  orderId: string
  palletCount: number
  totalWeight: number
  deliveryAddress: string
  route?: Routeplan
  loadAssignment?: LoadAssignment
  transitTimeSeconds?: number
  deliveryResult?: DeliveryResult
}
```

`src/types/accounting-variables.ts`:

```typescript
import { OrderPlacedMessage, BrewCompleteMessage, DeliveryCompleteMessage } from './shared'

export interface AccountingProcessVariables {
  eventType: string
  correlationId: string
  amount?: number
  order?: OrderPlacedMessage
  purchase?: {
    supplier: string
    totalCost: number
    items: { ingredient: string; quantity: number; unitCost: number }[]
  }
  batch?: BrewCompleteMessage & { costPerCase?: number }
  delivery?: DeliveryCompleteMessage & { shippingCost?: number }
  ledgerEntryId?: string
}
```

**Step 2: Add new message types to shared.ts**

Add to end of `src/types/shared.ts`:

```typescript
export interface MaterialsPurchasedMessage {
  poId: string
  supplier: string
  totalCost: number
  items: { ingredient: string; quantity: number; unitCost: number }[]
}

export interface ShipmentRequestedMessage {
  shipmentId: string
  orderId: string
  recipeId: string
  palletCount: number
  deliveryAddress: string
}

export interface ProductionNeededMessage {
  orderId: string
  recipeId: string
  quantity: number
}
```

**Step 3: Add Phase 2 metrics to metrics/index.ts**

Add after the existing metrics (after line 67, before `collectDefaultMetrics`):

```typescript
export const ordersTotal = new Counter({
  name: 'factory_orders_total',
  help: 'Total orders by priority and fulfillment status',
  labelNames: ['priority', 'fulfillment'] as const,
  registers: [register],
})

export const revenueTotal = new Counter({
  name: 'factory_revenue_total',
  help: 'Total revenue in dollars',
  labelNames: ['recipe'] as const,
  registers: [register],
})

export const cogsTotal = new Counter({
  name: 'factory_cogs_total',
  help: 'Total cost of goods sold',
  labelNames: ['category'] as const,
  registers: [register],
})

export const cashBalance = new Gauge({
  name: 'factory_cash_balance',
  help: 'Current cash balance',
  registers: [register],
})

export const inventoryValue = new Gauge({
  name: 'factory_inventory_value',
  help: 'Current inventory value',
  labelNames: ['type'] as const,
  registers: [register],
})

export const deliveriesTotal = new Counter({
  name: 'factory_deliveries_total',
  help: 'Total deliveries by status',
  labelNames: ['status'] as const,
  registers: [register],
})
```

**Step 4: Verify TypeScript compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1`
Expected: No errors

**Step 5: Commit**

```bash
git add src/types/sales-variables.ts src/types/materials-variables.ts src/types/distribution-variables.ts src/types/accounting-variables.ts src/types/shared.ts src/metrics/index.ts
git commit -m "feat: add Phase 2 types, message interfaces, and business metrics"
```

---

## Task 2: Sales Automation — validate-order and order-allocation

**Files:**
- Create: `src/automation/sales/validate-order.ts`
- Create: `src/automation/sales/order-allocation.ts`
- Create: `src/automation/sales/validate-order.test.ts`
- Create: `src/automation/sales/order-allocation.test.ts`

**Step 1: Write failing tests**

`src/automation/sales/validate-order.test.ts`:

```typescript
import { validateOrder } from './validate-order'
import { factoryState } from '../../state'

beforeEach(() => {
  factoryState.reset()
})

describe('validateOrder', () => {
  it('returns FULFILL when enough stock', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 50)
    const result = validateOrder('parkers-kolsch', 10)
    expect(result.status).toBe('FULFILL')
    expect(result.available).toBe(50)
    expect(result.requested).toBe(10)
  })

  it('returns BACKORDER when no stock', () => {
    const result = validateOrder('parkers-kolsch', 10)
    expect(result.status).toBe('BACKORDER')
    expect(result.available).toBe(0)
  })

  it('returns BACKORDER when insufficient stock', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 3)
    const result = validateOrder('parkers-kolsch', 10)
    expect(result.status).toBe('BACKORDER')
  })

  it('accounts for already-allocated stock', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 20)
    factoryState.allocateFinishedGoods('parkers-kolsch', 15)
    const result = validateOrder('parkers-kolsch', 10)
    expect(result.status).toBe('BACKORDER')
    expect(result.available).toBe(5)
  })
})
```

`src/automation/sales/order-allocation.test.ts`:

```typescript
import { allocateOrder } from './order-allocation'
import { factoryState } from '../../state'

beforeEach(() => {
  factoryState.reset()
})

describe('allocateOrder', () => {
  it('allocates stock for FULFILL orders', () => {
    factoryState.addFinishedGoods('parkers-kolsch', 50)
    const result = allocateOrder('order-1', 'parkers-kolsch', 10, 'FULFILL')
    expect(result.allocated).toBe(10)
    expect(result.backordered).toBe(0)
    expect(factoryState.getFinishedGoods('parkers-kolsch')!.allocated).toBe(10)
  })

  it('records backorder without allocation', () => {
    const result = allocateOrder('order-2', 'parkers-kolsch', 10, 'BACKORDER')
    expect(result.allocated).toBe(0)
    expect(result.backordered).toBe(10)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /tmp/factorio && npx jest src/automation/sales/ --no-coverage 2>&1`
Expected: FAIL — modules not found

**Step 3: Implement**

`src/automation/sales/validate-order.ts`:

```typescript
import { factoryState } from '../../state'

export interface ValidationResult {
  status: 'FULFILL' | 'BACKORDER'
  available: number
  requested: number
}

export function validateOrder(recipeId: string, quantity: number): ValidationResult {
  const fg = factoryState.getFinishedGoods(recipeId)
  const available = fg ? fg.cases - fg.allocated : 0

  return {
    status: available >= quantity ? 'FULFILL' : 'BACKORDER',
    available,
    requested: quantity,
  }
}
```

`src/automation/sales/order-allocation.ts`:

```typescript
import { factoryState } from '../../state'

export interface AllocationResult {
  allocated: number
  backordered: number
}

export function allocateOrder(
  orderId: string,
  recipeId: string,
  quantity: number,
  status: 'FULFILL' | 'BACKORDER'
): AllocationResult {
  if (status === 'FULFILL') {
    factoryState.allocateFinishedGoods(recipeId, quantity)
    return { allocated: quantity, backordered: 0 }
  }

  return { allocated: 0, backordered: quantity }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /tmp/factorio && npx jest src/automation/sales/ --no-coverage 2>&1`
Expected: 6 tests PASS

**Step 5: Commit**

```bash
git add src/automation/sales/
git commit -m "feat: add sales automation — validate-order and order-allocation"
```

---

## Task 3: Sales LLM Agent — generate-order

**Files:**
- Create: `src/agents/generate-order.ts`

**Step 1: Create the agent**

`src/agents/generate-order.ts`:

```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.8,
})

const OrderSchema = z.object({
  customerId: z.string().describe('Unique customer ID like "cust-brewery-name"'),
  customerName: z.string().describe('Realistic bar, restaurant, or store name'),
  deliveryAddress: z.string().describe('Realistic US address'),
  quantity: z.number().int().min(1).max(50).describe('Number of cases ordered (1-50)'),
  priority: z.enum(['standard', 'express', 'event']).describe('Order priority'),
  notes: z.string().describe('Brief order note — seasonal event, repeat customer, etc.'),
})

const structured = model.withStructuredOutput(OrderSchema)

export async function generateOrderAgent(recipeId: string, recipeName: string): Promise<z.infer<typeof OrderSchema>> {
  const result = await structured.invoke([
    {
      role: 'system',
      content: `You generate realistic brewery sales orders. Create varied, believable orders for "${recipeName}" (recipe: ${recipeId}). Mix of bars, restaurants, liquor stores, and event venues. Vary quantity (small=1-5 cases, medium=5-15, large=15-50). Most orders are standard priority, some express, rarely event. Keep notes brief and realistic.`,
    },
    {
      role: 'user',
      content: `Generate a new sales order for ${recipeName}.`,
    },
  ])
  return result
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agents/generate-order.ts
git commit -m "feat: add generate-order LLM agent for sales process"
```

---

## Task 4: Materials Automation — check-inventory and calculate-requirements

**Files:**
- Create: `src/automation/materials/check-inventory.ts`
- Create: `src/automation/materials/calculate-requirements.ts`
- Create: `src/automation/materials/receive-materials.ts`
- Create: `src/automation/materials/check-inventory.test.ts`

**Step 1: Write failing tests**

`src/automation/materials/check-inventory.test.ts`:

```typescript
import { checkInventory } from './check-inventory'
import { calculateRequirements } from './calculate-requirements'
import { receiveMaterials } from './receive-materials'
import { factoryState } from '../../state'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

beforeEach(() => {
  factoryState.reset()
})

describe('checkInventory', () => {
  it('returns sufficient=false when no stock', () => {
    const result = checkInventory(parkersKolsch)
    expect(result.sufficient).toBe(false)
    expect(Object.keys(result.shortages).length).toBeGreaterThan(0)
  })

  it('returns sufficient=true when stock is adequate', () => {
    // Parker's Kolsch needs 9 lbs Pilsner Malt, 2 oz hops, 2 packs yeast
    factoryState.addRawMaterial('Pilsner Malt', 20, 1.50)
    factoryState.addRawMaterial('Hallertau', 10, 2.00)
    factoryState.addRawMaterial('Kolsch Yeast (WLP029)', 5, 8.00)
    const result = checkInventory(parkersKolsch)
    expect(result.sufficient).toBe(true)
    expect(Object.keys(result.shortages).length).toBe(0)
  })
})

describe('calculateRequirements', () => {
  it('calculates ingredients for 1 batch', () => {
    const result = calculateRequirements(parkersKolsch, 1)
    expect(result['Pilsner Malt']).toBe(9)
    expect(result['Hallertau']).toBe(2) // 1oz × 2 additions
    expect(result['Kolsch Yeast (WLP029)']).toBe(2)
  })

  it('scales for multiple batches', () => {
    const result = calculateRequirements(parkersKolsch, 3)
    expect(result['Pilsner Malt']).toBe(27)
  })
})

describe('receiveMaterials', () => {
  it('adds purchased materials to inventory', () => {
    receiveMaterials([
      { ingredient: 'Pilsner Malt', quantity: 50, unitCost: 1.50 },
      { ingredient: 'Hallertau', quantity: 10, unitCost: 2.50 },
    ])
    expect(factoryState.getRawMaterial('Pilsner Malt')!.quantity).toBe(50)
    expect(factoryState.getRawMaterial('Hallertau')!.quantity).toBe(10)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /tmp/factorio && npx jest src/automation/materials/ --no-coverage 2>&1`
Expected: FAIL

**Step 3: Implement**

`src/automation/materials/check-inventory.ts`:

```typescript
import { Recipe } from '../../types/recipe'
import { factoryState } from '../../state'
import { calculateRequirements } from './calculate-requirements'

export interface InventoryCheckResult {
  sufficient: boolean
  available: Record<string, number>
  required: Record<string, number>
  shortages: Record<string, number>
}

export function checkInventory(recipe: Recipe): InventoryCheckResult {
  const required = calculateRequirements(recipe, 1)
  const available: Record<string, number> = {}
  const shortages: Record<string, number> = {}

  for (const [ingredient, qty] of Object.entries(required)) {
    const stock = factoryState.getRawMaterial(ingredient)
    available[ingredient] = stock?.quantity || 0
    if ((stock?.quantity || 0) < qty) {
      shortages[ingredient] = qty - (stock?.quantity || 0)
    }
  }

  return {
    sufficient: Object.keys(shortages).length === 0,
    available,
    required,
    shortages,
  }
}
```

`src/automation/materials/calculate-requirements.ts`:

```typescript
import { Recipe } from '../../types/recipe'

export function calculateRequirements(recipe: Recipe, batches: number): Record<string, number> {
  const requirements: Record<string, number> = {}

  for (const grain of recipe.grainBill) {
    requirements[grain.grain] = (requirements[grain.grain] || 0) + grain.quantity * batches
  }

  for (const hop of recipe.hopSchedule) {
    requirements[hop.hop] = (requirements[hop.hop] || 0) + hop.quantity * batches
  }

  requirements[recipe.yeast.strain] = (requirements[recipe.yeast.strain] || 0) + recipe.yeast.quantity * batches

  return requirements
}
```

`src/automation/materials/receive-materials.ts`:

```typescript
import { factoryState } from '../../state'

export function receiveMaterials(items: { ingredient: string; quantity: number; unitCost: number }[]): void {
  for (const item of items) {
    factoryState.addRawMaterial(item.ingredient, item.quantity, item.unitCost)
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /tmp/factorio && npx jest src/automation/materials/ --no-coverage 2>&1`
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add src/automation/materials/
git commit -m "feat: add materials automation — inventory check, requirements calc, receive"
```

---

## Task 5: Materials LLM Agent — find-suppliers

**Files:**
- Create: `src/agents/find-suppliers.ts`

**Step 1: Create the agent**

`src/agents/find-suppliers.ts`:

```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.4,
})

const SupplierDecisionSchema = z.object({
  supplier: z.string().describe('Supplier name (e.g., "Great Western Malting", "Yakima Chief Hops")'),
  totalCost: z.number().describe('Total purchase cost in dollars'),
  leadTimeDays: z.number().int().min(1).max(14).describe('Delivery lead time in days'),
  items: z.array(z.object({
    ingredient: z.string(),
    quantity: z.number(),
    unitCost: z.number(),
  })).describe('Items to purchase with unit costs'),
  reasoning: z.string().describe('Brief explanation of supplier choice'),
})

const structured = model.withStructuredOutput(SupplierDecisionSchema)

export async function findSuppliersAgent(
  shortages: Record<string, number>,
  recipeId: string,
): Promise<z.infer<typeof SupplierDecisionSchema>> {
  const shortageList = Object.entries(shortages)
    .map(([ingredient, qty]) => `- ${ingredient}: need ${qty} units`)
    .join('\n')

  const result = await structured.invoke([
    {
      role: 'system',
      content: `You are a brewery procurement agent. Given ingredient shortages, select a supplier and determine purchase quantities and costs. Use realistic brewing supply pricing: grains $1-3/lb, hops $2-8/oz, yeast $6-12/pack. Pick from realistic suppliers (Great Western Malting, Briess, Yakima Chief, BSG, White Labs, etc.). Consider bulk discounts for larger orders.`,
    },
    {
      role: 'user',
      content: `Recipe: ${recipeId}\n\nShortages:\n${shortageList}\n\nFind a supplier and calculate purchase cost.`,
    },
  ])
  return result
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agents/find-suppliers.ts
git commit -m "feat: add find-suppliers LLM agent for materials procurement"
```

---

## Task 6: Distribution Automation — load-assignment, dispatch, delivery

**Files:**
- Create: `src/automation/distribution/load-assignment.ts`
- Create: `src/automation/distribution/dispatch.ts`
- Create: `src/automation/distribution/delivery-confirmation.ts`
- Create: `src/automation/distribution/distribution.test.ts`

**Step 1: Write failing tests**

`src/automation/distribution/distribution.test.ts`:

```typescript
import { assignLoad } from './load-assignment'
import { calculateTransitTime } from './dispatch'
import { confirmDelivery } from './delivery-confirmation'

describe('assignLoad', () => {
  it('generates bill of lading with pallets', () => {
    const result = assignLoad('truck-01', 'ship-123', 3, 2400)
    expect(result.billOfLadingId).toMatch(/^BOL-/)
    expect(result.palletIds).toHaveLength(3)
    expect(result.totalWeight).toBe(2400)
    expect(result.truckId).toBe('truck-01')
  })
})

describe('calculateTransitTime', () => {
  it('returns transit time in seconds based on distance', () => {
    const result = calculateTransitTime(100)
    // 100 miles, simulated: 3-8 seconds
    expect(result).toBeGreaterThanOrEqual(3)
    expect(result).toBeLessThanOrEqual(8)
  })
})

describe('confirmDelivery', () => {
  it('returns delivery result', () => {
    const result = confirmDelivery('ship-123')
    expect(result.deliveredAt).toBeDefined()
    expect(result.signedBy).toBeDefined()
    expect(['good', 'damaged']).toContain(result.condition)
  })

  it('most deliveries are in good condition', () => {
    // Run 50 times, expect >80% good
    let goodCount = 0
    for (let i = 0; i < 50; i++) {
      if (confirmDelivery(`ship-${i}`).condition === 'good') goodCount++
    }
    expect(goodCount).toBeGreaterThan(40)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /tmp/factorio && npx jest src/automation/distribution/ --no-coverage 2>&1`
Expected: FAIL

**Step 3: Implement**

`src/automation/distribution/load-assignment.ts`:

```typescript
import { generateId } from '../../types/shared'

export interface LoadAssignmentResult {
  billOfLadingId: string
  palletIds: string[]
  totalWeight: number
  truckId: string
}

export function assignLoad(
  truckId: string,
  shipmentId: string,
  palletCount: number,
  totalWeight: number
): LoadAssignmentResult {
  const palletIds = Array.from({ length: palletCount }, (_, i) =>
    `${shipmentId}-PLT-${String(i + 1).padStart(2, '0')}`
  )

  return {
    billOfLadingId: generateId('BOL'),
    palletIds,
    totalWeight,
    truckId,
  }
}
```

`src/automation/distribution/dispatch.ts`:

```typescript
export function calculateTransitTime(distanceMiles: number): number {
  // Simulated: 3-8 seconds regardless of actual distance
  return Math.floor(Math.random() * 6) + 3
}
```

`src/automation/distribution/delivery-confirmation.ts`:

```typescript
export interface DeliveryResult {
  deliveredAt: string
  signedBy: string
  condition: 'good' | 'damaged'
}

const RECEIVERS = [
  'J. Martinez', 'A. Williams', 'K. Johnson', 'M. Brown',
  'R. Davis', 'S. Lee', 'T. Wilson', 'L. Anderson',
]

export function confirmDelivery(shipmentId: string): DeliveryResult {
  return {
    deliveredAt: new Date().toISOString(),
    signedBy: RECEIVERS[Math.floor(Math.random() * RECEIVERS.length)],
    condition: Math.random() < 0.95 ? 'good' : 'damaged',
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /tmp/factorio && npx jest src/automation/distribution/ --no-coverage 2>&1`
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add src/automation/distribution/
git commit -m "feat: add distribution automation — load assignment, dispatch, delivery"
```

---

## Task 7: Distribution LLM Agent — route-planning

**Files:**
- Create: `src/agents/route-planning.ts`

**Step 1: Create the agent**

`src/agents/route-planning.ts`:

```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.5,
})

const RoutePlanSchema = z.object({
  truckId: z.string().describe('Truck identifier (e.g., "TRUCK-14")'),
  estimatedDistance: z.number().describe('Distance in miles'),
  estimatedHours: z.number().describe('Estimated delivery time in hours'),
  route: z.string().describe('Brief route description (e.g., "I-95 N to Exit 42, local roads to destination")'),
})

const structured = model.withStructuredOutput(RoutePlanSchema)

export async function routePlanningAgent(
  deliveryAddress: string,
  palletCount: number,
  totalWeight: number,
): Promise<z.infer<typeof RoutePlanSchema>> {
  const result = await structured.invoke([
    {
      role: 'system',
      content: `You plan brewery delivery routes. Given a delivery address, assign a truck and plan a route from the brewery in Portland, OR. Use realistic distances and times. Truck IDs are TRUCK-01 through TRUCK-08. Consider load size when selecting truck (small loads <5 pallets can use smaller trucks).`,
    },
    {
      role: 'user',
      content: `Plan delivery route:\n- Destination: ${deliveryAddress}\n- Pallets: ${palletCount}\n- Weight: ${totalWeight} lbs`,
    },
  ])
  return result
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agents/route-planning.ts
git commit -m "feat: add route-planning LLM agent for distribution"
```

---

## Task 8: Accounting Automation — ledger entry workers

**Files:**
- Create: `src/automation/accounting/record-revenue.ts`
- Create: `src/automation/accounting/record-materials-cost.ts`
- Create: `src/automation/accounting/calculate-batch-cost.ts`
- Create: `src/automation/accounting/record-shipping-cost.ts`
- Create: `src/automation/accounting/accounting.test.ts`

**Step 1: Write failing tests**

`src/automation/accounting/accounting.test.ts`:

```typescript
import { recordRevenue } from './record-revenue'
import { recordMaterialsCost } from './record-materials-cost'
import { calculateBatchCost } from './calculate-batch-cost'
import { recordShippingCost } from './record-shipping-cost'
import { factoryState } from '../../state'
import { parkersKolsch } from '../../recipes/parkers-kolsch'

beforeEach(() => {
  factoryState.reset()
})

describe('recordRevenue', () => {
  it('creates ledger entry debiting CASH, crediting REV-SALES', () => {
    const entry = recordRevenue('order-1', 'parkers-kolsch', 10, 36)
    expect(entry.debitAccount).toBe('CASH')
    expect(entry.creditAccount).toBe('REV-SALES')
    expect(entry.amount).toBe(360) // 10 cases × $36
    expect(factoryState.getAccountBalance('CASH')).toBe(360)
    expect(factoryState.getAccountBalance('REV-SALES')).toBe(360)
  })
})

describe('recordMaterialsCost', () => {
  it('creates ledger entry debiting INV-RAW, crediting CASH', () => {
    const entry = recordMaterialsCost('po-1', 150)
    expect(entry.debitAccount).toBe('INV-RAW')
    expect(entry.creditAccount).toBe('CASH')
    expect(entry.amount).toBe(150)
  })
})

describe('calculateBatchCost', () => {
  it('creates batch cost sheet with materials, labor, and overhead', () => {
    const result = calculateBatchCost('batch-1', parkersKolsch, 50)
    expect(result.totalMaterials).toBeGreaterThan(0)
    expect(result.totalLabor).toBeGreaterThan(0)
    expect(result.totalOverhead).toBeGreaterThan(0)
    expect(result.totalCost).toBe(result.totalMaterials + result.totalLabor + result.totalOverhead)
    expect(result.costPerCase).toBe(result.totalCost / 50)
  })

  it('creates ledger entries moving value from RAW to WIP to FG', () => {
    calculateBatchCost('batch-1', parkersKolsch, 50)
    // Should have created ledger entries
    expect(factoryState.getLedger().length).toBeGreaterThanOrEqual(1)
  })
})

describe('recordShippingCost', () => {
  it('creates ledger entry debiting OPEX-SHIPPING, crediting CASH', () => {
    const entry = recordShippingCost('ship-1', 75)
    expect(entry.debitAccount).toBe('OPEX-SHIPPING')
    expect(entry.creditAccount).toBe('CASH')
    expect(entry.amount).toBe(75)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /tmp/factorio && npx jest src/automation/accounting/ --no-coverage 2>&1`
Expected: FAIL

**Step 3: Implement**

`src/automation/accounting/record-revenue.ts`:

```typescript
import { factoryState, LedgerEntry } from '../../state'
import { generateId } from '../../types/shared'

export function recordRevenue(
  orderId: string,
  recipeId: string,
  cases: number,
  pricePerCase: number,
): LedgerEntry {
  const amount = cases * pricePerCase
  const entry: LedgerEntry = {
    entryId: generateId('LED'),
    timestamp: new Date().toISOString(),
    debitAccount: 'CASH',
    creditAccount: 'REV-SALES',
    amount,
    description: `Sale of ${cases} cases of ${recipeId} @ $${pricePerCase}/case`,
    sourceEvent: 'OrderPlaced',
    correlationId: orderId,
  }
  factoryState.appendLedgerEntry(entry)
  return entry
}
```

`src/automation/accounting/record-materials-cost.ts`:

```typescript
import { factoryState, LedgerEntry } from '../../state'
import { generateId } from '../../types/shared'

export function recordMaterialsCost(poId: string, totalCost: number): LedgerEntry {
  const entry: LedgerEntry = {
    entryId: generateId('LED'),
    timestamp: new Date().toISOString(),
    debitAccount: 'INV-RAW',
    creditAccount: 'CASH',
    amount: totalCost,
    description: `Purchase order ${poId}`,
    sourceEvent: 'MaterialsPurchased',
    correlationId: poId,
  }
  factoryState.appendLedgerEntry(entry)
  return entry
}
```

`src/automation/accounting/calculate-batch-cost.ts`:

```typescript
import { Recipe } from '../../types/recipe'
import { factoryState, LedgerEntry } from '../../state'
import { generateId } from '../../types/shared'

export interface BatchCostSheet {
  batchId: string
  recipeId: string
  totalMaterials: number
  totalLabor: number
  totalOverhead: number
  totalCost: number
  casesProduced: number
  costPerCase: number
}

export function calculateBatchCost(
  batchId: string,
  recipe: Recipe,
  casesProduced: number,
): BatchCostSheet {
  // Materials: grain ~$1.50/lb, hops ~$3/oz, yeast ~$8/pack
  const grainCost = recipe.grainBill.reduce((sum, g) => sum + g.quantity * 1.50, 0)
  const hopCost = recipe.hopSchedule.reduce((sum, h) => sum + h.quantity * 3.00, 0)
  const yeastCost = recipe.yeast.quantity * 8.00
  const totalMaterials = grainCost + hopCost + yeastCost

  // Labor: ~2 hrs brewing @ $25/hr, ~1 hr packaging @ $20/hr
  const totalLabor = 2 * 25 + 1 * 20

  // Overhead: energy + depreciation ~$15/batch
  const totalOverhead = 15

  const totalCost = totalMaterials + totalLabor + totalOverhead

  // Record ledger entry: move value from INV-RAW to INV-FG
  const entry: LedgerEntry = {
    entryId: generateId('LED'),
    timestamp: new Date().toISOString(),
    debitAccount: 'INV-FG',
    creditAccount: 'INV-RAW',
    amount: totalCost,
    description: `Batch ${batchId} — ${casesProduced} cases of ${recipe.id}`,
    sourceEvent: 'BrewComplete',
    correlationId: batchId,
  }
  factoryState.appendLedgerEntry(entry)

  return {
    batchId,
    recipeId: recipe.id,
    totalMaterials,
    totalLabor,
    totalOverhead,
    totalCost,
    casesProduced,
    costPerCase: totalCost / casesProduced,
  }
}
```

`src/automation/accounting/record-shipping-cost.ts`:

```typescript
import { factoryState, LedgerEntry } from '../../state'
import { generateId } from '../../types/shared'

export function recordShippingCost(shipmentId: string, cost: number): LedgerEntry {
  const entry: LedgerEntry = {
    entryId: generateId('LED'),
    timestamp: new Date().toISOString(),
    debitAccount: 'OPEX-SHIPPING',
    creditAccount: 'CASH',
    amount: cost,
    description: `Shipping cost for ${shipmentId}`,
    sourceEvent: 'DeliveryComplete',
    correlationId: shipmentId,
  }
  factoryState.appendLedgerEntry(entry)
  return entry
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /tmp/factorio && npx jest src/automation/accounting/ --no-coverage 2>&1`
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add src/automation/accounting/
git commit -m "feat: add accounting automation — revenue, materials cost, batch cost, shipping"
```

---

## Task 9: Sales BPMN Process

**Files:**
- Create: `bpmn/sales-process.bpmn`

**Step 1: Create the BPMN**

The sales process: Timer start (30s) → Generate Order → Validate Order → Exclusive Gateway → Fulfill path (allocate → publish OrderPlaced → end) or Backorder path (publish ProductionNeeded → publish OrderPlaced → end).

Write `bpmn/sales-process.bpmn` with full process model AND bpmndi:BPMNDiagram section.

Key elements:
- `Timer_Start_Sales` — timer start event, `R/PT30S` (repeating every 30s)
- `Task_GenerateOrder` — service task, type `generate-order`
- `Task_ValidateOrder` — service task, type `validate-order`
- `Gateway_Fulfillment` — exclusive gateway
- `Task_AllocateOrder` — service task, type `order-allocation` (fulfill path)
- `Task_PublishOrderPlaced` — service task, type `publish-order-placed` (common end, no worker needed — just logs)
- `End_Fulfilled` — end event
- `End_Backordered` — end event
- Process variables: orderId, recipeId, recipe set at start via the generate-order worker

FEEL conditions:
- `= fulfillmentStatus = "FULFILL"` → allocate path
- `= fulfillmentStatus = "BACKORDER"` → backorder path

Include bpmndi section with coordinates for diagram rendering in Operate.

**Step 2: Verify XML is well-formed**

Run: `cd /tmp/factorio && python3 -c "import xml.etree.ElementTree as ET; ET.parse('bpmn/sales-process.bpmn'); print('Valid XML')" 2>&1`
Expected: `Valid XML`

**Step 3: Commit**

```bash
git add bpmn/sales-process.bpmn
git commit -m "feat: add sales process BPMN with timer start"
```

---

## Task 10: Materials BPMN Process

**Files:**
- Create: `bpmn/materials-process.bpmn`

**Step 1: Create the BPMN**

Materials process: Plain start → Check Inventory → Calculate Requirements → Gateway (enough?) → Yes: publish MaterialsReady → End. No: Find Suppliers → Place PO (timer 5s for delivery) → Receive Materials → Publish MaterialsReady → End.

Key elements:
- `Start_Materials` — plain start event (for Phase 2 simplified; message start can be added later)
- `Task_CheckInventory` — service task, type `check-inventory`
- `Task_CalculateRequirements` — service task, type `calculate-requirements`
- `Gateway_MaterialsAvailable` — exclusive gateway
- `Task_FindSuppliers` — service task, type `find-suppliers` (LLM, 60s timeout)
- `Timer_DeliveryWait` — intermediate timer catch event, `PT5S`
- `Task_ReceiveMaterials` — service task, type `receive-materials`
- `End_MaterialsReady` — end event

FEEL conditions:
- `= inventoryCheck.sufficient = true` → reserve path
- `= inventoryCheck.sufficient = false` → procurement path

Include bpmndi section.

**Step 2: Verify XML is well-formed**

Run: `cd /tmp/factorio && python3 -c "import xml.etree.ElementTree as ET; ET.parse('bpmn/materials-process.bpmn'); print('Valid XML')" 2>&1`
Expected: `Valid XML`

**Step 3: Commit**

```bash
git add bpmn/materials-process.bpmn
git commit -m "feat: add materials management process BPMN"
```

---

## Task 11: Distribution BPMN Process

**Files:**
- Create: `bpmn/distribution-process.bpmn`

**Step 1: Create the BPMN**

Distribution process: Plain start → Route Planning → Load Assignment → Dispatch → Timer (transit) → Delivery Confirmation → End.

Key elements:
- `Start_Distribution` — plain start event
- `Task_RoutePlanning` — service task, type `route-planning` (LLM, 60s timeout)
- `Task_LoadAssignment` — service task, type `load-assignment`
- `Task_Dispatch` — service task, type `dispatch-truck`
- `Timer_Transit` — intermediate timer catch event, `PT5S`
- `Task_DeliveryConfirmation` — service task, type `delivery-confirmation`
- `End_Delivered` — end event

Linear flow, no gateways. Include bpmndi section.

**Step 2: Verify XML is well-formed**

Run: `cd /tmp/factorio && python3 -c "import xml.etree.ElementTree as ET; ET.parse('bpmn/distribution-process.bpmn'); print('Valid XML')" 2>&1`
Expected: `Valid XML`

**Step 3: Commit**

```bash
git add bpmn/distribution-process.bpmn
git commit -m "feat: add distribution process BPMN"
```

---

## Task 12: Accounting BPMN Process

**Files:**
- Create: `bpmn/accounting-process.bpmn`

**Step 1: Create the BPMN**

Since accounting responds to 4 different event types, create a single process with a plain start and an exclusive gateway that routes by `eventType` variable:

Plain start → Gateway (eventType?) → 4 branches:
- `"OrderPlaced"` → Task_RecordRevenue → End
- `"MaterialsPurchased"` → Task_RecordMaterialsCost → End
- `"BrewComplete"` → Task_CalculateBatchCost → End
- `"DeliveryComplete"` → Task_RecordShippingCost → End

Key elements:
- `Start_Accounting` — plain start event
- `Gateway_EventType` — exclusive gateway
- `Task_RecordRevenue` — service task, type `record-revenue`
- `Task_RecordMaterialsCost` — service task, type `record-materials-cost`
- `Task_CalculateBatchCost` — service task, type `calculate-batch-cost`
- `Task_RecordShippingCost` — service task, type `record-shipping-cost`
- 4 end events

FEEL conditions:
- `= eventType = "OrderPlaced"`
- `= eventType = "MaterialsPurchased"`
- `= eventType = "BrewComplete"`
- `= eventType = "DeliveryComplete"`

Include bpmndi section with a fan-out layout (gateway in center, 4 branches going to different Y positions).

**Step 2: Verify XML is well-formed**

Run: `cd /tmp/factorio && python3 -c "import xml.etree.ElementTree as ET; ET.parse('bpmn/accounting-process.bpmn'); print('Valid XML')" 2>&1`
Expected: `Valid XML`

**Step 3: Commit**

```bash
git add bpmn/accounting-process.bpmn
git commit -m "feat: add accounting process BPMN with event-type routing"
```

---

## Task 13: Sales Workers

**Files:**
- Create: `src/workers/sales.ts`

**Step 1: Create the worker file**

`src/workers/sales.ts`:

```typescript
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { generateOrderAgent } from '../agents/generate-order'
import { validateOrder } from '../automation/sales/validate-order'
import { allocateOrder } from '../automation/sales/order-allocation'
import { factoryState } from '../state'
import { parkersKolsch } from '../recipes/parkers-kolsch'
import { generateId } from '../types/shared'
import { SalesProcessVariables } from '../types/sales-variables'
import { workerDuration, stepCount, ordersTotal } from '../metrics/index'

function withMetrics<T>(
  workerName: string,
  workerType: 'llm' | 'automation',
  handler: (job: any) => T
): (job: any) => T {
  return (job) => {
    const end = workerDuration.startTimer({ worker: workerName, type: workerType })
    stepCount.inc({ worker: workerName, type: workerType })
    const result = handler(job)
    if (result && typeof (result as any).then === 'function') {
      return (result as any)
        .then((res: any) => { end(); return res })
        .catch((err: any) => { end(); throw err }) as T
    }
    end()
    return result
  }
}

export function registerSalesWorkers(zeebe: ZeebeGrpcClient): void {
  // 1. Generate Order (LLM)
  zeebe.createWorker({
    taskType: 'generate-order',
    timeout: 60000,
    taskHandler: withMetrics('generate-order', 'llm', async (job) => {
      const orderId = generateId('ORD')
      const recipe = parkersKolsch // Phase 2 simplified: single recipe

      try {
        const order = await generateOrderAgent(recipe.id, recipe.name)

        factoryState.addOrder({
          orderId,
          recipeId: recipe.id,
          quantity: order.quantity,
          customerId: order.customerId,
          customerName: order.customerName,
          deliveryAddress: order.deliveryAddress,
          priority: order.priority,
        })

        console.log(`[generate-order] ✓ ${orderId} customer="${order.customerName}" qty=${order.quantity} priority=${order.priority}`)
        return job.complete({
          orderId,
          recipeId: recipe.id,
          recipe: recipe as any,
          order,
        } as any)
      } catch (err) {
        console.error(`[generate-order] ✗ error:`, err)
        throw err
      }
    }),
  })

  // 2. Validate Order
  zeebe.createWorker({
    taskType: 'validate-order',
    taskHandler: withMetrics('validate-order', 'automation', (job) => {
      const vars = job.variables as unknown as SalesProcessVariables
      const result = validateOrder(vars.recipeId, vars.order!.quantity)

      console.log(`[validate-order] ✓ ${vars.orderId} status=${result.status} available=${result.available} requested=${result.requested}`)
      return job.complete({ fulfillmentStatus: result.status } as any)
    }),
  })

  // 3. Order Allocation
  zeebe.createWorker({
    taskType: 'order-allocation',
    taskHandler: withMetrics('order-allocation', 'automation', (job) => {
      const vars = job.variables as unknown as SalesProcessVariables

      const result = allocateOrder(
        vars.orderId,
        vars.recipeId,
        vars.order!.quantity,
        vars.fulfillmentStatus!,
      )

      ordersTotal.inc({ priority: vars.order!.priority, fulfillment: vars.fulfillmentStatus! })

      if (vars.fulfillmentStatus === 'FULFILL') {
        factoryState.fulfillOrder(vars.orderId)
      }

      console.log(`[order-allocation] ✓ ${vars.orderId} allocated=${result.allocated} backordered=${result.backordered}`)
      return job.complete({ allocationResult: result } as any)
    }),
  })

  console.log('[sales] 3 workers registered: generate-order, validate-order, order-allocation')
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1`
Expected: No errors

**Step 3: Commit**

```bash
git add src/workers/sales.ts
git commit -m "feat: add sales workers — generate-order, validate-order, order-allocation"
```

---

## Task 14: Materials Workers

**Files:**
- Create: `src/workers/materials.ts`

**Step 1: Create the worker file**

`src/workers/materials.ts`:

```typescript
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { checkInventory } from '../automation/materials/check-inventory'
import { calculateRequirements } from '../automation/materials/calculate-requirements'
import { receiveMaterials } from '../automation/materials/receive-materials'
import { findSuppliersAgent } from '../agents/find-suppliers'
import { factoryState } from '../state'
import { generateId } from '../types/shared'
import { MaterialsProcessVariables } from '../types/materials-variables'
import { workerDuration, stepCount } from '../metrics/index'

function withMetrics<T>(
  workerName: string,
  workerType: 'llm' | 'automation',
  handler: (job: any) => T
): (job: any) => T {
  return (job) => {
    const end = workerDuration.startTimer({ worker: workerName, type: workerType })
    stepCount.inc({ worker: workerName, type: workerType })
    const result = handler(job)
    if (result && typeof (result as any).then === 'function') {
      return (result as any)
        .then((res: any) => { end(); return res })
        .catch((err: any) => { end(); throw err }) as T
    }
    end()
    return result
  }
}

export function registerMaterialsWorkers(zeebe: ZeebeGrpcClient): void {
  // 1. Check Inventory
  zeebe.createWorker({
    taskType: 'check-inventory',
    taskHandler: withMetrics('check-inventory', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const result = checkInventory(vars.recipe)

      console.log(`[check-inventory] ✓ ${vars.batchId} sufficient=${result.sufficient} shortages=${Object.keys(result.shortages).length}`)
      return job.complete({ inventoryCheck: result } as any)
    }),
  })

  // 2. Calculate Requirements
  zeebe.createWorker({
    taskType: 'calculate-requirements',
    taskHandler: withMetrics('calculate-requirements', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const requirements = calculateRequirements(vars.recipe, 1)

      console.log(`[calculate-requirements] ✓ ${vars.batchId} ingredients=${Object.keys(requirements).length}`)
      return job.complete({ requirements } as any)
    }),
  })

  // 3. Find Suppliers (LLM)
  zeebe.createWorker({
    taskType: 'find-suppliers',
    timeout: 60000,
    taskHandler: withMetrics('find-suppliers', 'llm', async (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const shortages = vars.inventoryCheck?.shortages || {}

      try {
        const decision = await findSuppliersAgent(shortages, vars.recipeId)
        const poId = generateId('PO')

        console.log(`[find-suppliers] ✓ ${vars.batchId} supplier="${decision.supplier}" cost=$${decision.totalCost}`)
        return job.complete({
          supplierDecision: decision,
          purchaseOrder: {
            poId,
            supplier: decision.supplier,
            totalCost: decision.totalCost,
            items: decision.items,
          },
        } as any)
      } catch (err) {
        console.error(`[find-suppliers] ✗ ${vars.batchId} error:`, err)
        throw err
      }
    }),
  })

  // 4. Receive Materials
  zeebe.createWorker({
    taskType: 'receive-materials',
    taskHandler: withMetrics('receive-materials', 'automation', (job) => {
      const vars = job.variables as unknown as MaterialsProcessVariables
      const items = vars.purchaseOrder?.items || vars.supplierDecision?.items || []

      receiveMaterials(items)

      console.log(`[receive-materials] ✓ ${vars.batchId} items=${items.length} received into inventory`)
      return job.complete({} as any)
    }),
  })

  console.log('[materials] 4 workers registered: check-inventory, calculate-requirements, find-suppliers, receive-materials')
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1`
Expected: No errors

**Step 3: Commit**

```bash
git add src/workers/materials.ts
git commit -m "feat: add materials workers — inventory check, requirements, suppliers, receive"
```

---

## Task 15: Distribution Workers

**Files:**
- Create: `src/workers/distribution.ts`

**Step 1: Create the worker file**

`src/workers/distribution.ts`:

```typescript
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { routePlanningAgent } from '../agents/route-planning'
import { assignLoad } from '../automation/distribution/load-assignment'
import { calculateTransitTime } from '../automation/distribution/dispatch'
import { confirmDelivery } from '../automation/distribution/delivery-confirmation'
import { DistributionProcessVariables } from '../types/distribution-variables'
import { workerDuration, stepCount, deliveriesTotal } from '../metrics/index'

function withMetrics<T>(
  workerName: string,
  workerType: 'llm' | 'automation',
  handler: (job: any) => T
): (job: any) => T {
  return (job) => {
    const end = workerDuration.startTimer({ worker: workerName, type: workerType })
    stepCount.inc({ worker: workerName, type: workerType })
    const result = handler(job)
    if (result && typeof (result as any).then === 'function') {
      return (result as any)
        .then((res: any) => { end(); return res })
        .catch((err: any) => { end(); throw err }) as T
    }
    end()
    return result
  }
}

export function registerDistributionWorkers(zeebe: ZeebeGrpcClient): void {
  // 1. Route Planning (LLM)
  zeebe.createWorker({
    taskType: 'route-planning',
    timeout: 60000,
    taskHandler: withMetrics('route-planning', 'llm', async (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables

      try {
        const route = await routePlanningAgent(
          vars.deliveryAddress,
          vars.palletCount,
          vars.totalWeight,
        )

        console.log(`[route-planning] ✓ ${vars.shipmentId} truck=${route.truckId} distance=${route.estimatedDistance}mi`)
        return job.complete({ route } as any)
      } catch (err) {
        console.error(`[route-planning] ✗ ${vars.shipmentId} error:`, err)
        throw err
      }
    }),
  })

  // 2. Load Assignment
  zeebe.createWorker({
    taskType: 'load-assignment',
    taskHandler: withMetrics('load-assignment', 'automation', (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables
      const truckId = vars.route?.truckId || 'TRUCK-01'

      const loadAssignment = assignLoad(truckId, vars.shipmentId, vars.palletCount, vars.totalWeight)

      console.log(`[load-assignment] ✓ ${vars.shipmentId} BOL=${loadAssignment.billOfLadingId} pallets=${loadAssignment.palletIds.length}`)
      return job.complete({ loadAssignment } as any)
    }),
  })

  // 3. Dispatch Truck
  zeebe.createWorker({
    taskType: 'dispatch-truck',
    taskHandler: withMetrics('dispatch-truck', 'automation', (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables
      const distance = vars.route?.estimatedDistance || 50
      const transitTimeSeconds = calculateTransitTime(distance)

      console.log(`[dispatch-truck] ✓ ${vars.shipmentId} departed, transit=${transitTimeSeconds}s (simulated)`)
      return job.complete({ transitTimeSeconds } as any)
    }),
  })

  // 4. Delivery Confirmation
  zeebe.createWorker({
    taskType: 'delivery-confirmation',
    taskHandler: withMetrics('delivery-confirmation', 'automation', (job) => {
      const vars = job.variables as unknown as DistributionProcessVariables
      const deliveryResult = confirmDelivery(vars.shipmentId)

      deliveriesTotal.inc({ status: deliveryResult.condition })

      console.log(`[delivery-confirmation] ✓ ${vars.shipmentId} delivered condition=${deliveryResult.condition} signed=${deliveryResult.signedBy}`)
      return job.complete({ deliveryResult } as any)
    }),
  })

  console.log('[distribution] 4 workers registered: route-planning, load-assignment, dispatch-truck, delivery-confirmation')
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1`
Expected: No errors

**Step 3: Commit**

```bash
git add src/workers/distribution.ts
git commit -m "feat: add distribution workers — route planning, load, dispatch, delivery"
```

---

## Task 16: Accounting Workers

**Files:**
- Create: `src/workers/accounting.ts`

**Step 1: Create the worker file**

`src/workers/accounting.ts`:

```typescript
import { ZeebeGrpcClient } from '@camunda8/sdk/dist/zeebe'
import { recordRevenue } from '../automation/accounting/record-revenue'
import { recordMaterialsCost } from '../automation/accounting/record-materials-cost'
import { calculateBatchCost } from '../automation/accounting/calculate-batch-cost'
import { recordShippingCost } from '../automation/accounting/record-shipping-cost'
import { AccountingProcessVariables } from '../types/accounting-variables'
import { workerDuration, stepCount, revenueTotal, cogsTotal, cashBalance } from '../metrics/index'
import { factoryState } from '../state'

function withMetrics<T>(
  workerName: string,
  workerType: 'llm' | 'automation',
  handler: (job: any) => T
): (job: any) => T {
  return (job) => {
    const end = workerDuration.startTimer({ worker: workerName, type: workerType })
    stepCount.inc({ worker: workerName, type: workerType })
    const result = handler(job)
    if (result && typeof (result as any).then === 'function') {
      return (result as any)
        .then((res: any) => { end(); return res })
        .catch((err: any) => { end(); throw err }) as T
    }
    end()
    return result
  }
}

export function registerAccountingWorkers(zeebe: ZeebeGrpcClient): void {
  // 1. Record Revenue
  zeebe.createWorker({
    taskType: 'record-revenue',
    taskHandler: withMetrics('record-revenue', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const order = vars.order!
      const pricePerCase = vars.amount || 36 // default price

      const entry = recordRevenue(order.orderId, order.recipeId, order.quantity, pricePerCase)
      revenueTotal.inc({ recipe: order.recipeId }, entry.amount)
      cashBalance.set(factoryState.getAccountBalance('CASH'))

      console.log(`[record-revenue] ✓ order=${order.orderId} amount=$${entry.amount}`)
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  // 2. Record Materials Cost
  zeebe.createWorker({
    taskType: 'record-materials-cost',
    taskHandler: withMetrics('record-materials-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const totalCost = vars.purchase?.totalCost || vars.amount || 0

      const entry = recordMaterialsCost(vars.correlationId, totalCost)
      cogsTotal.inc({ category: 'materials' }, entry.amount)
      cashBalance.set(factoryState.getAccountBalance('CASH'))

      console.log(`[record-materials-cost] ✓ po=${vars.correlationId} amount=$${entry.amount}`)
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  // 3. Calculate Batch Cost
  zeebe.createWorker({
    taskType: 'calculate-batch-cost',
    taskHandler: withMetrics('calculate-batch-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const batch = vars.batch!
      const casesProduced = Math.floor((batch.volume || 5) * 128 / 12 / 24) || 50 // rough conversion

      // Need recipe — pass as part of batch or look up
      const recipe = (vars as any).recipe || require('../recipes/parkers-kolsch').parkersKolsch
      const costSheet = calculateBatchCost(batch.batchId, recipe, casesProduced)

      cogsTotal.inc({ category: 'labor' }, costSheet.totalLabor)
      cogsTotal.inc({ category: 'overhead' }, costSheet.totalOverhead)

      console.log(`[calculate-batch-cost] ✓ batch=${batch.batchId} total=$${costSheet.totalCost.toFixed(2)} perCase=$${costSheet.costPerCase.toFixed(2)}`)
      return job.complete({ ledgerEntryId: factoryState.getLedger().at(-1)?.entryId, batchCostSheet: costSheet } as any)
    }),
  })

  // 4. Record Shipping Cost
  zeebe.createWorker({
    taskType: 'record-shipping-cost',
    taskHandler: withMetrics('record-shipping-cost', 'automation', (job) => {
      const vars = job.variables as unknown as AccountingProcessVariables
      const delivery = vars.delivery!
      const cost = vars.amount || Math.floor(Math.random() * 100) + 50 // $50-$150 simulated

      const entry = recordShippingCost(delivery.shipmentId, cost)
      cashBalance.set(factoryState.getAccountBalance('CASH'))

      console.log(`[record-shipping-cost] ✓ shipment=${delivery.shipmentId} amount=$${entry.amount}`)
      return job.complete({ ledgerEntryId: entry.entryId } as any)
    }),
  })

  console.log('[accounting] 4 workers registered: record-revenue, record-materials-cost, calculate-batch-cost, record-shipping-cost')
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1`
Expected: No errors

**Step 3: Commit**

```bash
git add src/workers/accounting.ts
git commit -m "feat: add accounting workers — revenue, materials cost, batch cost, shipping"
```

---

## Task 17: Update Worker Registry, Deploy Script, and Start Scripts

**Files:**
- Modify: `src/workers/index.ts`
- Modify: `src/deploy.ts`
- Create: `src/start-sales.ts`
- Create: `src/start-distribution.ts`
- Create: `src/start-materials.ts`
- Create: `src/start-accounting.ts`

**Step 1: Update workers/index.ts**

Replace contents of `src/workers/index.ts`:

```typescript
import { Camunda8 } from '@camunda8/sdk'
import 'dotenv/config'
import { startMetricsServer } from '../metrics/middleware'
import { registerBrewingWorkers } from './brewing'
import { registerBottlingWorkers } from './bottling'
import { registerCratingWorkers } from './crating'
import { registerSalesWorkers } from './sales'
import { registerMaterialsWorkers } from './materials'
import { registerDistributionWorkers } from './distribution'
import { registerAccountingWorkers } from './accounting'

const camunda = new Camunda8()
const zeebe = camunda.getZeebeGrpcApiClient()

startMetricsServer()

// Phase 1: Physical factory
registerBrewingWorkers(zeebe)
registerBottlingWorkers(zeebe)
registerCratingWorkers(zeebe)

// Phase 2: Business layer
registerSalesWorkers(zeebe)
registerMaterialsWorkers(zeebe)
registerDistributionWorkers(zeebe)
registerAccountingWorkers(zeebe)

console.log('\n[FACTORIO] All workers registered. Awaiting jobs...')
console.log('[FACTORIO] Processes: brewing, bottling, crating, sales, materials, distribution, accounting')
console.log('[FACTORIO] Workers: 34 (27 automation, 7 LLM)')
```

**Step 2: Update deploy.ts**

Add the 4 new BPMN files to the deploy array in `src/deploy.ts`:

```typescript
  const bpmnFiles = [
    'brewing-process.bpmn',
    'bottling-process.bpmn',
    'crating-process.bpmn',
    'sales-process.bpmn',
    'materials-process.bpmn',
    'distribution-process.bpmn',
    'accounting-process.bpmn',
  ]
```

**Step 3: Create start scripts**

`src/start-sales.ts` — starts a single sales order cycle (for manual testing; the timer in the BPMN handles automatic):

```typescript
import { Camunda8 } from '@camunda8/sdk'
import 'dotenv/config'

async function startSales() {
  const camunda = new Camunda8()
  const zeebe = camunda.getZeebeGrpcApiClient()

  console.log('Starting sales process (manual trigger)...')

  const result = await zeebe.createProcessInstance({
    bpmnProcessId: 'sales-process',
    variables: {},
  })

  console.log(`Sales process instance started: ${result.processInstanceKey}`)
  process.exit(0)
}

startSales().catch((err) => { console.error('Failed:', err); process.exit(1) })
```

`src/start-distribution.ts`:

```typescript
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
```

`src/start-materials.ts`:

```typescript
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
```

`src/start-accounting.ts`:

```typescript
import { Camunda8 } from '@camunda8/sdk'
import 'dotenv/config'

async function startAccounting() {
  const camunda = new Camunda8()
  const zeebe = camunda.getZeebeGrpcApiClient()

  // Test with an OrderPlaced event
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
```

**Step 4: Add npm scripts to package.json**

Add to `scripts` section of `package.json`:

```json
"start:sales": "ts-node src/start-sales.ts",
"start:distribution": "ts-node src/start-distribution.ts",
"start:materials": "ts-node src/start-materials.ts",
"start:accounting": "ts-node src/start-accounting.ts"
```

**Step 5: Verify TypeScript compiles and all tests pass**

Run: `cd /tmp/factorio && npx tsc --noEmit 2>&1 && npx jest --no-coverage 2>&1`
Expected: No TS errors, all tests pass

**Step 6: Commit**

```bash
git add src/workers/index.ts src/deploy.ts src/start-sales.ts src/start-distribution.ts src/start-materials.ts src/start-accounting.ts package.json
git commit -m "feat: update worker registry, deploy script, and add start scripts for all Phase 2 processes"
```

---

## Task 18: Integration Verification — Deploy and Test Each Process

**Step 1: Deploy all 7 BPMN processes**

Run: `cd /tmp/factorio && npx ts-node src/deploy.ts 2>&1`
Expected: All 7 BPMN files deploy successfully

**Step 2: Start workers**

Run: `cd /tmp/factorio && npx ts-node src/workers/index.ts 2>&1` (background)
Expected: `[FACTORIO] All workers registered. Awaiting jobs...` with 34 workers across 7 processes

**Step 3: Test accounting process**

Run: `cd /tmp/factorio && npx ts-node src/start-accounting.ts 2>&1`
Expected: Process starts, `[record-revenue]` worker fires

**Step 4: Test distribution process**

Run: `cd /tmp/factorio && npx ts-node src/start-distribution.ts 2>&1`
Expected: Process starts, route-planning (LLM) → load-assignment → dispatch → transit timer → delivery-confirmation

**Step 5: Test materials process**

Run: `cd /tmp/factorio && npx ts-node src/start-materials.ts 2>&1`
Expected: Process starts, check-inventory → calculate-requirements → (likely insufficient) → find-suppliers (LLM) → timer → receive-materials

**Step 6: Test sales process**

Run: `cd /tmp/factorio && npx ts-node src/start-sales.ts 2>&1`
Expected: Process starts, generate-order (LLM) → validate-order → order-allocation → end

**Step 7: Run full test suite**

Run: `cd /tmp/factorio && npx jest --no-coverage 2>&1`
Expected: All tests pass (77 existing + ~17 new = ~94 total)

**Step 8: Commit any fixes and push**

```bash
git add -A
git commit -m "fix: integration fixes for Phase 2 deployment"
git push origin main
```

---

## Summary

| Task | What | Files | Tests |
|------|------|-------|-------|
| 0 | State store (orders, ledger) | 2 modify | 6 new |
| 1 | Types + metrics | 5 create, 2 modify | 0 (type-only) |
| 2 | Sales automation | 4 create | 6 new |
| 3 | Sales LLM agent | 1 create | 0 (LLM) |
| 4 | Materials automation | 4 create | 5 new |
| 5 | Materials LLM agent | 1 create | 0 (LLM) |
| 6 | Distribution automation | 4 create | 4 new |
| 7 | Distribution LLM agent | 1 create | 0 (LLM) |
| 8 | Accounting automation | 5 create | 5 new |
| 9 | Sales BPMN | 1 create | 0 |
| 10 | Materials BPMN | 1 create | 0 |
| 11 | Distribution BPMN | 1 create | 0 |
| 12 | Accounting BPMN | 1 create | 0 |
| 13 | Sales workers | 1 create | 0 |
| 14 | Materials workers | 1 create | 0 |
| 15 | Distribution workers | 1 create | 0 |
| 16 | Accounting workers | 1 create | 0 |
| 17 | Registry + scripts | 2 modify, 4 create | 0 |
| 18 | Integration test | 0 | manual |

**Total: 19 tasks, ~40 files, ~26 new tests, 4 BPMN processes, 15 workers**
