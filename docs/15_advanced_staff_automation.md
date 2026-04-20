# Blueprint: Module 15 — Advanced Staff Automation (v2.0 FINAL)

**Dự án:** Pokémon TCG Shop Simulator  
**Phiên bản:** 2.0 — Tích hợp 11 Business Logic Bổ sung  
**Độ ưu tiên:** CRITICAL  
**Files bị tác động:**
- `StaffManager.ts`, `staffStore.ts`, `NPCManager.ts`
- `gameStore.ts`, `furnitureStore.ts`, `inventoryStore.ts`
- `EnvironmentManager.ts`, `DeliveryManager.ts`
- `MainScene.ts`, `App.vue`
- `src/features/staff/types/index.ts`

---

## Mục lục

1. [Tổng quan kiến trúc & Nguyên tắc bất biến](#1-tổng-quan-kiến-trúc--nguyên-tắc-bất-biến)
2. [Cơ chế "Trên Tay" — Xóa bỏ Global Inventory](#2-cơ-chế-trên-tay--xóa-bỏ-global-inventory)
3. [Kệ Kho (Warehouse Shelf) — Nâng cấp](#3-kệ-kho-warehouse-shelf--nâng-cấp)
4. [Anti-Stuck & Anti-Loop](#4-anti-stuck--anti-loop)
5. [Luồng công việc RESTOCKER — State Machine đầy đủ](#5-luồng-công-việc-restocker--state-machine-đầy-đủ)
6. [Cài đặt chế độ Xếp hàng (Restocker Settings)](#6-cài-đặt-chế-độ-xếp-hàng-restocker-settings)
7. [Fallback Logic cho NPC Stocker AI](#7-fallback-logic-cho-npc-stocker-ai)
8. [Fix Bug NPC trộm đồ Kệ Kho](#8-fix-bug-npc-trộm-đồ-kệ-kho)
9. [Nội thất mua về dạng Thùng Hàng (Furniture Box)](#9-nội-thất-mua-về-dạng-thùng-hàng-furniture-box)
10. [Y-Sort & Drop Physics trong môi trường 2.5D](#10-y-sort--drop-physics-trong-môi-trường-25d)
11. [Logic Hết Giờ Làm (End of Shift — 9:00 PM)](#11-logic-hết-giờ-làm-end-of-shift--900-pm)
12. [Giờ làm việc & Idle Zone](#12-giờ-làm-việc--idle-zone)
13. [Persistence (Lưu/Tải dữ liệu an toàn)](#13-persistence-lưutải-dữ-liệu-an-toàn)
14. [Checklist thi công (theo thứ tự bắt buộc)](#14-checklist-thi-công-theo-thứ-tự-bắt-buộc)
15. [Phụ lục: Sơ đồ State Machine đầy đủ](#15-phụ-lục-sơ-đồ-state-machine-đầy-đủ)

---

## 1. Tổng quan kiến trúc & Nguyên tắc bất biến

### Luồng dữ liệu tổng thể

```
Pinia staffStore (source of truth)
        ↓ subscribe
StaffManager.ts (Phaser, orchestrator)
        ↓ điều khiển
WorkerNPC object (instance per worker)
        ↓ state machine
10 States: IDLE → FETCH_FROM_DELIVERY → CARRY_TO_STORAGE
           → FIND_SHELF → FETCH_FROM_STORAGE
           → CARRY_TO_SELLING_SHELF → DIRECT_RESTOCK
           → WAITING_FOR_SPACE → GO_HOME → CASHIER_DUTY

playerHandStore (Pinia, source of truth cho "Trên Tay")
        ↓ sync
DeliveryManager.ts (Phaser, xử lý vật lý thùng hàng)
        ↓ Y-sort aware drop
LiveBox[] (Phaser sprites, tọa độ thực)
```

### Nguyên tắc bất biến (KHÔNG ĐƯỢC vi phạm)

| # | Quy tắc |
|---|---------|
| 1 | **TUYỆT ĐỐI** không để dist < 5px sau 3 giây mà không teleport/reset. |
| 2 | **TUYỆT ĐỐI** không để vòng lặp shelf-find quá 5 lần liên tiếp. |
| 3 | **TUYỆT ĐỐI** không để NPC Customer mua hàng từ `storage` shelf. |
| 4 | **TUYỆT ĐỐI** không để NPC Stocker rơi vào loop nhặt-thả tại bãi giao hàng khi không có Kệ Kho. |
| 5 | **TUYỆT ĐỐI** không mất dữ liệu sau F5 — kể cả thùng hàng đang nằm trên sàn. |
| 6 | **TUYỆT ĐỐI** không để NPC nhặt thùng Nội thất — chỉ người chơi mới được tương tác. |
| 7 | **TUYỆT ĐỐI** không để thùng hàng trôi về đáy màn hình do Y-Sort sai trong 2.5D. |
| 8 | **TUYỆT ĐỐI** không có kẽ hở dupe (nhân bản) item khi chuyển hàng giữa "Trên Tay" và kệ. |

---

## 2. Cơ chế "Trên Tay" — Xóa bỏ Global Inventory

### 2.1 Triết lý thiết kế

Thay vì kho ảo vô hình (`shopInventory`), **tất cả hàng hóa đều tồn tại vật lý** hoặc trên kệ hoặc trong tay người chơi/NPC. Điều này:
- Loại bỏ hoàn toàn `shopInventory` khỏi `inventoryStore` với vai trò "kho trung gian ảo".
- Mọi thùng hàng nhận về từ giao hàng phải được **nhặt lên tay** rồi mới đặt vào kệ.
- Ngăn ngừa trường hợp hàng "biến mất" giữa chừng (disappearing items).

> **Lưu ý Migration:** `shopInventory` vẫn giữ lại nhưng chỉ dùng làm **buffer kế toán** khi cần (ví dụ: khi chơi viên bán đi 1 pack từ kệ). Không còn dùng để "kéo hàng ảo ra kệ".

### 2.2 Khai báo `playerHandStore` mới

```typescript
// src/features/inventory/store/playerHandStore.ts

import { defineStore } from 'pinia'

export type HandItemType = 'pack' | 'box' | 'furniture'

export interface HandItem {
  itemId: string
  name: string
  type: HandItemType
  quantity: number          // Max 8 nếu type=pack, 1 nếu box hoặc furniture
  sourceBoxId?: string      // LiveBox instanceId nếu nhặt từ sàn
  furnitureId?: string      // FURNITURE_ITEMS key nếu type=furniture
}

export const usePlayerHandStore = defineStore('playerHand', {
  state: () => ({
    /** Vật phẩm đang cầm trên tay. null = tay không. */
    item: null as HandItem | null,
  }),

  getters: {
    isEmpty: (state) => state.item === null,
    isFull: (state) => {
      if (!state.item) return false
      if (state.item.type === 'pack') return state.item.quantity >= 8
      return true  // box hoặc furniture luôn là 1
    },
    canPickMorePacks: (state) => {
      if (!state.item) return true
      if (state.item.type !== 'pack') return false
      return state.item.quantity < 8
    }
  },

  actions: {
    /**
     * Nhặt hàng lên tay. Trả về false nếu tay đầy hoặc không khớp loại.
     * ATOMIC: Không bao giờ để tay có 2 loại hàng khác nhau.
     */
    pickup(item: HandItem): boolean {
      if (this.item === null) {
        this.item = { ...item }
        return true
      }

      // Chỉ được gom thêm nếu cùng itemId và là pack
      if (
        this.item.type === 'pack' &&
        item.type === 'pack' &&
        this.item.itemId === item.itemId
      ) {
        const canAdd = 8 - this.item.quantity
        const adding = Math.min(item.quantity, canAdd)
        if (adding <= 0) return false
        this.item.quantity += adding
        return true
      }

      return false  // Tay đang cầm thứ khác
    },

    /**
     * Đặt xuống một lượng nhất định. Trả về số lượng thực sự đã thả.
     */
    putDown(quantity: number): number {
      if (!this.item) return 0
      const actual = Math.min(quantity, this.item.quantity)
      this.item.quantity -= actual
      if (this.item.quantity <= 0) this.item = null
      return actual
    },

    /** Thả toàn bộ tay không (khi vứt xuống đất). */
    dropAll(): HandItem | null {
      const snapshot = this.item ? { ...this.item } : null
      this.item = null
      return snapshot
    },

    /** Load từ save (khi F5). */
    loadHand(parsed: any) {
      this.item = parsed.playerHand ?? null
    }
  }
})
```

### 2.3 Giới hạn sức chứa "Trên Tay"

| Loại vật phẩm | Số lượng tối đa |
|---------------|----------------|
| Pack (Gói bài) | 8 packs |
| Box (Thùng hàng) | 1 thùng |
| Furniture (Nội thất) | 1 món |

Quy tắc: Không được cầm hỗn hợp. Nếu đang cầm Pack thì không nhặt được Box và ngược lại.

### 2.4 Tương tác UI Kệ Hàng khi mở ShelfManagementMenu

Khi `showShelfMenu = true` và người chơi đang cầm đồ trên tay:

```typescript
// Trong ShelfManagementMenu.vue — handleTierClick()

const handleTierClick = (tierIndex: number) => {
  const handStore = usePlayerHandStore()
  const shelf = activeShelf.value
  if (!shelf || !handStore.item) return

  const handItem = handStore.item

  // RULE: Chỉ được đặt từ "Trên Tay" vào kệ
  // RULE: Không cho kéo từ shopInventory nữa (loại bỏ dòng cũ)

  const placed = furnitureStore.fillTierFromHand(
    shelf.id,
    handItem.itemId,
    tierIndex,
    handItem.quantity
  )

  if (placed > 0) {
    handStore.putDown(placed)
  }
}

// Khi rút hàng từ kệ về tay (chuột phải):
const handleTierRightClick = (tierIndex: number) => {
  const handStore = usePlayerHandStore()
  const shelf = activeShelf.value
  if (!shelf) return

  const tier = shelf.tiers[tierIndex]
  if (!tier.itemId || tier.slots.length === 0) return

  // Tính số có thể rút (tối đa 8 pack hoặc 1 box)
  const item = inventoryStore.shopItems[tier.itemId]
  if (!item) return

  const isBox = item.type === 'box'
  const maxCanTake = isBox ? 1 : 8

  // Kiểm tra tay có đang rảnh hoặc đang cầm cùng loại
  if (!handStore.isEmpty && (handStore.item!.itemId !== tier.itemId || isBox)) {
    // Hiển thị thông báo: "Tay đang cầm thứ khác!"
    return
  }

  const actualTake = Math.min(maxCanTake, tier.slots.length)
  // Rút từ kệ
  for (let i = 0; i < actualTake; i++) {
    furnitureStore.takeItemFromTier(shelf.id, tierIndex)
  }

  // Đặt vào tay — ATOMIC check để tránh dupe
  const success = handStore.pickup({
    itemId: tier.itemId,
    name: item.name,
    type: item.type as HandItemType,
    quantity: actualTake,
  })

  if (!success) {
    // Rollback: trả lại kệ nếu pickup thất bại
    furnitureStore.fillTierFromItem(shelf.id, tier.itemId, tierIndex, actualTake)
  }
}
```

---

## 3. Kệ Kho (Warehouse Shelf) — Nâng cấp

### 3.1 Config nâng cấp trong `furniture/config/index.ts`

```typescript
// Cập nhật FURNITURE_ITEMS:

'warehouse_shelf': {
  id: 'warehouse_shelf',
  name: 'Warehouse Rack',
  buyPrice: 200,
  requiredLevel: 1,
  capacityStr: '400 Slots (10x40)',
  description: 'Kệ kho công nghiệp. Sức chứa cực lớn. NPCs KHÔNG mua từ đây.',
  numTiers: 10,       // ← Gấp 3 so với kệ thường
  slotsPerTier: 40,   // ← Gấp 2.5 so với kệ thường
  role: 'storage'
},
```

### 3.2 Sprite / Asset phân biệt với kệ bán hàng

- **Kệ bán hàng** (`shelf_single`, `shelf_double`): Dùng texture `'shelf'` — màu nâu gỗ ấm.
- **Kệ kho** (`warehouse_shelf`, `storage_shelf`): Dùng texture `'warehouse_shelf'` — màu xám kim loại.

Thêm texture load vào `MainScene.preload()`:

```typescript
// src/game/MainScene.ts — preload()
this.load.image('warehouse_shelf', warehouseShelfImg)  // Cần tạo file SVG riêng
```

Trong `FurnitureManager.displayShelf()`:

```typescript
public displayShelf(shelf: ShelfData) {
  const isStorage = shelf.role === 'storage'
  // Chọn texture dựa trên role
  const textureKey = isStorage ? 'warehouse_shelf' : 'shelf'
  const sprite = this.shelvesGroup.create(shelf.x, shelf.y, textureKey)
  // ... phần còn lại giữ nguyên
}
```

---

## 4. Anti-Stuck & Anti-Loop

### 4.1 Cập nhật interface `WorkerNPC` trong `StaffManager.ts`

```typescript
// src/features/staff/managers/StaffManager.ts

interface WorkerNPC {
  instanceId: string
  sprite: Phaser.Physics.Arcade.Sprite
  statusText: Phaser.GameObjects.Text
  targetX: number
  targetY: number
  targetDeskId?: string | null

  // === ANTI-STUCK ===
  lastX: number
  lastY: number
  stuckTimer: number
  stuckCheckInterval: number   // default: 3000ms

  // === ANTI-LOOP ===
  shelfRetries: number
  maxShelfRetries: number      // default: 5
  currentTargetShelfId: string | null

  // === RESTOCKER STATE MACHINE ===
  workerDuty: WorkerDuty
  restockSubState: RestockSubState
  restockMode: RestockMode     // 'AUTO' | 'REFILL_ONLY' | 'FILL_EMPTY'
  carriedItemId: string | null
  carriedQuantity: number
  sourceShelfId: string | null
  targetShelfId: string | null

  // === LIFECYCLE ===
  isActive: boolean            // false = đã GO_HOME
  isCarryingBox: boolean       // true = đang vác thùng vật lý (LiveBox)
  carriedBoxInstanceId: string | null  // LiveBox.id đang vác
}
```

### 4.2 Khai báo State & Sub-State

```typescript
// src/features/staff/types/index.ts

export type WorkerDuty = 'RESTOCK' | 'CHECKOUT' | 'CLEAN' | 'NONE'
export type RestockMode = 'AUTO' | 'REFILL_ONLY' | 'FILL_EMPTY'

export type RestockSubState =
  | 'IDLE'                    // Rảnh, về IdleZone
  | 'FETCH_FROM_DELIVERY'     // Đi nhặt thùng ở bãi giao hàng
  | 'CARRY_TO_STORAGE'        // Vác thùng đến kệ kho
  | 'FIND_SHELF'              // Tìm kệ bán cần hàng
  | 'FETCH_FROM_STORAGE'      // Đến kệ kho lấy hàng
  | 'CARRY_TO_SELLING_SHELF'  // Mang hàng ra kệ bán
  | 'DIRECT_RESTOCK'          // Bypass kho: Vác thẳng thùng ra kệ bán
  | 'WAITING_FOR_SPACE'       // Tất cả kệ đều đầy, chờ tại IdleZone
  | 'GO_HOME'                 // Tan ca, đi về cổng

export interface HiredWorker {
  instanceId: string
  dataId: string
  duty: WorkerDuty
  targetDeskId?: string | null
  restockMode: RestockMode     // default: 'AUTO'
  x: number
  y: number
  state: 'IDLE' | 'WORKING' | 'MOVING'
}
```

### 4.3 `checkAndResolveStuck()` — Anti-Stuck core

```typescript
// Trong class StaffManager

private checkAndResolveStuck(worker: WorkerNPC, currentTime: number): void {
  const MOVING_STATES: RestockSubState[] = [
    'FETCH_FROM_DELIVERY', 'CARRY_TO_STORAGE', 'FIND_SHELF',
    'FETCH_FROM_STORAGE', 'CARRY_TO_SELLING_SHELF',
    'DIRECT_RESTOCK', 'GO_HOME'
  ]

  if (!MOVING_STATES.includes(worker.restockSubState)) {
    worker.stuckTimer = currentTime
    worker.lastX = worker.sprite.x
    worker.lastY = worker.sprite.y
    return
  }

  if (currentTime < worker.stuckTimer + worker.stuckCheckInterval) return

  const distMoved = Phaser.Math.Distance.Between(
    worker.sprite.x, worker.sprite.y,
    worker.lastX, worker.lastY
  )

  if (distMoved < 5) {
    const distToTarget = Phaser.Math.Distance.Between(
      worker.sprite.x, worker.sprite.y,
      worker.targetX, worker.targetY
    )

    if (distToTarget < 400) {
      // Teleport thẳng đến target
      worker.sprite.setPosition(worker.targetX, worker.targetY)
    } else {
      // Target không hợp lệ → Reset về IDLE an toàn
      this.resetWorkerToIdle(worker)
    }

    const body = worker.sprite.body as Phaser.Physics.Arcade.Body
    if (body) body.velocity.set(0)
  }

  worker.stuckTimer = currentTime
  worker.lastX = worker.sprite.x
  worker.lastY = worker.sprite.y
}

private resetWorkerToIdle(worker: WorkerNPC): void {
  // Nếu đang vác thùng hàng vật lý, vứt xuống ngay tại chỗ
  if (worker.isCarryingBox && worker.carriedBoxInstanceId) {
    this.dropBoxAtCurrentPosition(worker)
  }
  worker.restockSubState = 'IDLE'
  worker.carriedItemId = null
  worker.carriedQuantity = 0
  worker.sourceShelfId = null
  worker.targetShelfId = null
  worker.shelfRetries = 0
  worker.currentTargetShelfId = null
  worker.isCarryingBox = false
  worker.carriedBoxInstanceId = null
}
```

### 4.4 `checkShelfRetryLimit()` — Anti-Loop

```typescript
private checkShelfRetryLimit(worker: WorkerNPC): boolean {
  if (worker.shelfRetries >= worker.maxShelfRetries) {
    this.resetWorkerToIdle(worker)
    return true
  }
  return false
}
```

---

## 5. Luồng công việc RESTOCKER — State Machine đầy đủ

### 5.1 Dispatcher chính `handleRestockerStateMachine()`

```typescript
private handleRestockerStateMachine(worker: WorkerNPC, gameStore: any): void {
  switch (worker.restockSubState) {
    case 'IDLE':                   this.handleIdle(worker, gameStore); break
    case 'FETCH_FROM_DELIVERY':    this.handleFetchFromDelivery(worker); break
    case 'CARRY_TO_STORAGE':       this.handleCarryToStorage(worker, gameStore); break
    case 'FIND_SHELF':             this.handleFindShelf(worker, gameStore); break
    case 'FETCH_FROM_STORAGE':     this.handleFetchFromStorage(worker, gameStore); break
    case 'CARRY_TO_SELLING_SHELF': this.handleCarryToSellingShelf(worker, gameStore); break
    case 'DIRECT_RESTOCK':         this.handleDirectRestock(worker, gameStore); break
    case 'WAITING_FOR_SPACE':      this.handleWaitingForSpace(worker, gameStore); break
    case 'GO_HOME':                this.handleGoHome(worker); break
  }
}
```

### 5.2 State: `IDLE` — Điểm quyết định

```typescript
private handleIdle(worker: WorkerNPC, gameStore: any): void {
  const idlePos = this.getIdleZonePosition(worker)
  this.moveWorkerTo(worker, idlePos.x, idlePos.y)

  // Không làm gì nếu shop đóng cửa
  if (gameStore.shopState !== 'OPEN') return

  // Kiểm tra theo thứ tự ưu tiên:

  // PRIORITY 1: Có thùng giao hàng chờ ngoài bãi?
  const deliveryBoxes = this.scene.deliveryManager?.getUncarriedBoxes() ?? []
  if (deliveryBoxes.length > 0) {
    const hasWarehouseShelf = this.hasAvailableWarehouseSpace(gameStore)
    const hasSellingShelf = this.hasSellingShelfNeedingStock(gameStore, worker.restockMode)

    if (hasWarehouseShelf) {
      // Luồng A: Đưa vào kho trước
      worker.restockSubState = 'FETCH_FROM_DELIVERY'
      return
    }

    if (hasSellingShelf) {
      // Luồng B (Bypass kho): Đưa thẳng ra kệ bán
      worker.restockSubState = 'FETCH_FROM_DELIVERY'
      // Flag để chuyển sang DIRECT_RESTOCK sau khi nhặt
      worker.targetShelfId = this.findBestSellingShelf(gameStore, null, worker.restockMode)
      return
    }

    // Cả kho và kệ bán đều đầy → chờ
    worker.restockSubState = 'WAITING_FOR_SPACE'
    return
  }

  // PRIORITY 2: Kệ bán cần hàng + kệ kho còn hàng?
  const needsRestock = this.findSellingShelfNeedingStock(gameStore, worker.restockMode)
  if (needsRestock) {
    const hasStorageStock = this.findStorageWithStock(gameStore)
    if (hasStorageStock) {
      worker.restockSubState = 'FIND_SHELF'
      return
    }
  }

  // Không có việc → tiếp tục ở IDLE, di chuyển về IdleZone
}
```

### 5.3 State: `FETCH_FROM_DELIVERY` — Đến bãi nhặt thùng

```typescript
private handleFetchFromDelivery(worker: WorkerNPC): void {
  const deliveryManager = this.scene.deliveryManager
  if (!deliveryManager) {
    worker.restockSubState = 'IDLE'
    return
  }

  const boxes = deliveryManager.getUncarriedBoxes()
  if (boxes.length === 0) {
    // Không còn thùng → về IDLE
    worker.restockSubState = 'IDLE'
    return
  }

  const nearestBox = boxes[0]
  const dist = Phaser.Math.Distance.Between(
    worker.sprite.x, worker.sprite.y,
    nearestBox.sprite.x, nearestBox.sprite.y
  )

  if (dist > 30) {
    this.moveWorkerTo(worker, nearestBox.sprite.x, nearestBox.sprite.y)
    return
  }

  // Đã đến nơi: nhặt thùng
  const success = deliveryManager.staffPickUpBox(worker.instanceId, nearestBox.id)
  if (!success) {
    worker.restockSubState = 'IDLE'
    return
  }

  worker.isCarryingBox = true
  worker.carriedBoxInstanceId = nearestBox.id
  worker.carriedItemId = nearestBox.itemId
  worker.carriedQuantity = nearestBox.quantity

  // Quyết định đi đâu tiếp theo
  if (worker.targetShelfId) {
    // Đã có target kệ bán (chế độ DIRECT_RESTOCK)
    worker.restockSubState = 'DIRECT_RESTOCK'
  } else {
    worker.restockSubState = 'CARRY_TO_STORAGE'
  }
}
```

### 5.4 State: `CARRY_TO_STORAGE` — Đưa thùng vào kệ kho

```typescript
private handleCarryToStorage(worker: WorkerNPC, gameStore: any): void {
  const warehouseShelf = this.findBestWarehouseShelf(gameStore, worker.carriedItemId)

  if (!warehouseShelf) {
    // Không có kệ kho hoặc đã đầy → chuyển sang Direct Restock
    const sellingShelfId = this.findBestSellingShelf(gameStore, worker.carriedItemId, worker.restockMode)
    if (sellingShelfId) {
      worker.targetShelfId = sellingShelfId
      worker.restockSubState = 'DIRECT_RESTOCK'
    } else {
      // Không đặt được ở đâu → vứt thùng xuống tại chỗ và IDLE
      this.dropBoxAtCurrentPosition(worker)
      worker.restockSubState = 'WAITING_FOR_SPACE'
    }
    return
  }

  const dist = Phaser.Math.Distance.Between(
    worker.sprite.x, worker.sprite.y,
    warehouseShelf.x, warehouseShelf.y
  )

  if (dist > 30) {
    this.moveWorkerTo(worker, warehouseShelf.x, warehouseShelf.y)
    return
  }

  // Đến nơi: đặt thùng vào kệ kho
  this.placeBoxOnStorageShelf(worker, warehouseShelf.id, gameStore)
  worker.isCarryingBox = false
  worker.carriedBoxInstanceId = null
  // Sau khi đặt vào kho, tìm kệ bán cần hàng
  worker.restockSubState = 'FIND_SHELF'
}
```

### 5.5 State: `DIRECT_RESTOCK` — Bypass kho, vác thẳng ra kệ bán

```typescript
private handleDirectRestock(worker: WorkerNPC, gameStore: any): void {
  if (!worker.targetShelfId) {
    worker.restockSubState = 'IDLE'
    return
  }

  const shelf = gameStore.placedShelves[worker.targetShelfId]
  if (!shelf || shelf.role !== 'selling') {
    worker.restockSubState = 'IDLE'
    return
  }

  const dist = Phaser.Math.Distance.Between(
    worker.sprite.x, worker.sprite.y,
    shelf.x, shelf.y
  )

  if (dist > 40) {
    this.moveWorkerTo(worker, shelf.x, shelf.y)
    return
  }

  // Đến nơi: đặt hàng từ thùng lên kệ bán
  const placed = this.stockItemsFromBoxToShelf(
    worker.carriedItemId!,
    worker.carriedQuantity,
    shelf
  )

  if (placed > 0) {
    worker.carriedQuantity -= placed
  }

  // Thùng rỗng → vứt bỏ và IDLE
  if (worker.carriedQuantity <= 0) {
    // Xóa LiveBox sprite (thùng rỗng)
    this.scene.deliveryManager?.staffDropBox(worker.instanceId, true /* destroy */)
    worker.isCarryingBox = false
    worker.carriedBoxInstanceId = null
    worker.carriedItemId = null
    worker.targetShelfId = null
    worker.restockSubState = 'IDLE'
  } else {
    // Còn hàng nhưng kệ đầy → tìm kệ khác
    const nextShelf = this.findBestSellingShelf(gameStore, worker.carriedItemId, worker.restockMode)
    if (nextShelf && nextShelf !== worker.targetShelfId) {
      worker.targetShelfId = nextShelf
    } else {
      // Không còn kệ nào nhận → vứt thùng và chờ
      this.dropBoxAtCurrentPosition(worker)
      worker.restockSubState = 'WAITING_FOR_SPACE'
    }
  }
}
```

### 5.6 State: `FIND_SHELF` — Tìm cặp (kệ kho có hàng + kệ bán cần hàng)

```typescript
private handleFindShelf(worker: WorkerNPC, gameStore: any): void {
  if (this.checkShelfRetryLimit(worker)) return

  const storageShelf = this.findStorageWithStock(gameStore)
  if (!storageShelf) {
    worker.restockSubState = 'IDLE'
    return
  }

  const sellingShelfId = this.findBestSellingShelf(gameStore, storageShelf.itemId, worker.restockMode)
  if (!sellingShelfId) {
    worker.shelfRetries++
    worker.restockSubState = 'IDLE'
    return
  }

  worker.sourceShelfId = storageShelf.id
  worker.targetShelfId = sellingShelfId
  worker.currentTargetShelfId = storageShelf.id
  worker.shelfRetries = 0
  worker.restockSubState = 'FETCH_FROM_STORAGE'
}
```

### 5.7 State: `FETCH_FROM_STORAGE` — Lấy hàng từ kệ kho

```typescript
private handleFetchFromStorage(worker: WorkerNPC, gameStore: any): void {
  if (!worker.sourceShelfId) {
    worker.restockSubState = 'IDLE'
    return
  }

  const storageShelf = gameStore.placedShelves[worker.sourceShelfId]
  if (!storageShelf || storageShelf.role !== 'storage') {
    worker.sourceShelfId = null
    worker.restockSubState = 'FIND_SHELF'
    return
  }

  const dist = Phaser.Math.Distance.Between(
    worker.sprite.x, worker.sprite.y,
    storageShelf.x, storageShelf.y
  )

  if (dist > 40) {
    this.moveWorkerTo(worker, storageShelf.x, storageShelf.y)
    return
  }

  // Đến nơi: lấy hàng từ kệ kho (tối đa 8 pack hoặc 1 box)
  const taken = this.takeItemsFromStorageShelf(worker, storageShelf)
  if (taken === 0) {
    // Kho rỗng
    worker.shelfRetries++
    worker.sourceShelfId = null
    worker.restockSubState = 'FIND_SHELF'
    return
  }

  worker.restockSubState = 'CARRY_TO_SELLING_SHELF'
}
```

### 5.8 State: `CARRY_TO_SELLING_SHELF` — Đem hàng ra kệ bán

```typescript
private handleCarryToSellingShelf(worker: WorkerNPC, gameStore: any): void {
  if (!worker.targetShelfId || !worker.carriedItemId) {
    worker.restockSubState = 'IDLE'
    return
  }

  const sellingShelf = gameStore.placedShelves[worker.targetShelfId]
  if (!sellingShelf || sellingShelf.role !== 'selling') {
    worker.targetShelfId = null
    worker.restockSubState = 'FIND_SHELF'
    return
  }

  const dist = Phaser.Math.Distance.Between(
    worker.sprite.x, worker.sprite.y,
    sellingShelf.x, sellingShelf.y
  )

  if (dist > 40) {
    this.moveWorkerTo(worker, sellingShelf.x, sellingShelf.y)
    return
  }

  // Đến nơi: châm hàng lên kệ bán
  const placed = this.stockItemsFromHandToShelf(
    worker.carriedItemId,
    worker.carriedQuantity,
    sellingShelf,
    worker.restockMode
  )

  worker.carriedItemId = null
  worker.carriedQuantity = 0
  worker.targetShelfId = null
  worker.sourceShelfId = null
  worker.restockSubState = 'IDLE'
}
```

### 5.9 State: `WAITING_FOR_SPACE` — Chờ khi tất cả kệ đều đầy

```typescript
private handleWaitingForSpace(worker: WorkerNPC, gameStore: any): void {
  // Đứng ở IdleZone, re-check mỗi 5 giây
  const idlePos = this.getIdleZonePosition(worker)
  this.moveWorkerTo(worker, idlePos.x, idlePos.y)

  // Re-check mỗi 5000ms
  const now = this.scene.time.now
  if (!worker.lastX || now > worker.stuckTimer + 5000) {
    const hasSpace = this.hasSellingShelfNeedingStock(gameStore, worker.restockMode)
    if (hasSpace) {
      worker.restockSubState = 'IDLE'  // Thử lại
    }
    worker.stuckTimer = now
  }
}
```

### 5.10 Helper Methods

```typescript
// ── Tìm kệ kho có hàng theo itemId ──────────────────────────────
private findStorageWithStock(gameStore: any): { id: string; itemId: string; x: number; y: number } | null {
  for (const shelf of Object.values(gameStore.placedShelves) as any[]) {
    if (shelf.role !== 'storage') continue
    for (const tier of shelf.tiers) {
      if (tier.itemId && tier.slots.length > 0) {
        return { id: shelf.id, itemId: tier.itemId, x: shelf.x, y: shelf.y }
      }
    }
  }
  return null
}

// ── Tìm kệ bán cần hàng theo restockMode ────────────────────────
private findBestSellingShelf(
  gameStore: any,
  itemId: string | null,
  mode: RestockMode
): string | null {
  let bestId: string | null = null
  let bestScore = -1

  for (const shelf of Object.values(gameStore.placedShelves) as any[]) {
    if (shelf.role !== 'selling') continue

    for (const tier of shelf.tiers) {
      // REFILL_ONLY: Chỉ điền thêm vào tầng đã có nhãn
      if (mode === 'REFILL_ONLY') {
        if (!tier.itemId) continue
        if (itemId && tier.itemId !== itemId) continue
        const space = tier.maxSlots - tier.slots.length
        if (space > 0 && space > bestScore) {
          bestScore = space
          bestId = shelf.id
        }
      }

      // FILL_EMPTY: Chỉ điền vào tầng hoàn toàn trống
      if (mode === 'FILL_EMPTY') {
        if (tier.itemId !== null) continue
        if (bestId === null) bestId = shelf.id
      }

      // AUTO: Ưu tiên refill trước, sau đó fill empty
      if (mode === 'AUTO') {
        if (tier.itemId) {
          if (itemId && tier.itemId !== itemId) continue
          const space = tier.maxSlots - tier.slots.length
          if (space > 0 && space > bestScore) {
            bestScore = space
            bestId = shelf.id
          }
        } else if (bestId === null) {
          bestId = shelf.id
        }
      }
    }
  }
  return bestId
}

// ── Kiểm tra còn chỗ trong kệ kho không ───────────────────────────
private hasAvailableWarehouseSpace(gameStore: any): boolean {
  for (const shelf of Object.values(gameStore.placedShelves) as any[]) {
    if (shelf.role !== 'storage') continue
    for (const tier of shelf.tiers) {
      if (tier.slots.length < tier.maxSlots) return true
    }
  }
  return false
}

// ── Kiểm tra kệ bán có cần hàng không ────────────────────────────
private hasSellingShelfNeedingStock(gameStore: any, mode: RestockMode): boolean {
  return this.findBestSellingShelf(gameStore, null, mode) !== null
}

// ── Vứt thùng xuống đất tại vị trí hiện tại (Y-sort aware) ───────
private dropBoxAtCurrentPosition(worker: WorkerNPC): void {
  if (!worker.carriedBoxInstanceId) return
  this.scene.deliveryManager?.staffDropBox(
    worker.instanceId,
    false,                          // Không destroy — để lại trên sàn
    worker.sprite.x,
    worker.sprite.y,                // Tọa độ Y chân nhân vật
    DEPTH.FURNITURE + worker.sprite.y * 0.001  // Depth = Y-sort
  )
  worker.isCarryingBox = false
  worker.carriedBoxInstanceId = null
}
```

---

## 6. Cài đặt chế độ Xếp hàng (Restocker Settings)

### 6.1 Bổ sung RestockMode vào staffStore và UI

```typescript
// src/features/staff/types/index.ts
export type RestockMode = 'AUTO' | 'REFILL_ONLY' | 'FILL_EMPTY'
```

| Mode | Mô tả |
|------|-------|
| `AUTO` | Ưu tiên bù thêm vào ô có sẵn nhãn, nếu không có thì điền ô trống. |
| `REFILL_ONLY` | Chỉ bù thêm vào ô đã có nhãn/itemId. Không mở ô mới. |
| `FILL_EMPTY` | Chỉ điền vào ô hoàn toàn trống. Không châm thêm ô đang có hàng. |

### 6.2 Hiển thị trong OnlineShopMenu / Staff Management UI

```vue
<!-- Trong phần Quản lý nhân viên, thêm select cho RestockMode -->
<div v-if="hw.duty === 'RESTOCK'" class="flex items-center gap-2">
  <span class="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold uppercase">Chế độ xếp:</span>
  <select
    v-model="hw.restockMode"
    @change="staffStore.updateRestockMode(hw.instanceId, hw.restockMode)"
    class="text-xs font-bold text-emerald-700 bg-white border border-emerald-200 rounded px-1 py-0.5"
  >
    <option value="AUTO">Auto (Tự động)</option>
    <option value="REFILL_ONLY">Chỉ bù thêm hàng</option>
    <option value="FILL_EMPTY">Chỉ điền ô trống</option>
  </select>
</div>
```

---

## 7. Fallback Logic cho NPC Stocker AI

### 7.1 Cây quyết định khi không có Kệ Kho

```
NPC nhặt thùng giao hàng
        │
        ▼
  Có Kệ Kho?
  ┌── YES ──┐              ┌── NO ──┐
  ▼         ▼              ▼
Kệ kho    Kệ kho      Có Kệ Bán
có chỗ?   đầy?        cần hàng?
  │           │         ┌──YES──┐   ┌──NO──┐
  YES         YES       ▼       ▼
  │           │  DIRECT Đặt thùng  Vứt xuống
  ▼           ▼  RESTOCK  bán     Idle Zone
CARRY_TO   DIRECT
STORAGE    RESTOCK
```

### 7.2 Quy tắc chống loop khi không có Kệ Kho

```typescript
// Trong handleFetchFromDelivery(), sau khi nhặt thùng:

if (!this.hasAvailableWarehouseSpace(gameStore)) {
  // Không có kho → chọn kệ bán trực tiếp
  const sellingTarget = this.findBestSellingShelf(gameStore, worker.carriedItemId, worker.restockMode)
  if (sellingTarget) {
    worker.targetShelfId = sellingTarget
    worker.restockSubState = 'DIRECT_RESTOCK'
  } else {
    // KHÔNG loop lại FETCH_FROM_DELIVERY
    // Vứt thùng ngay tại cửa → đến WAITING_FOR_SPACE
    this.dropBoxAtCurrentPosition(worker)
    worker.restockSubState = 'WAITING_FOR_SPACE'
  }
  return
}
```

**Rule cứng:** NPC Stocker chỉ được phép chuyển sang `FETCH_FROM_DELIVERY` khi có ít nhất một trong hai:
1. Kệ Kho còn chỗ trống, HOẶC
2. Kệ Bán đang cần hàng (theo restockMode).

Nếu cả hai đều không thỏa mãn, NPC phải vào `WAITING_FOR_SPACE` và **không được nhặt thêm thùng nào nữa**.

---

## 8. Fix Bug NPC trộm đồ Kệ Kho

### 8.1 Vá `handleWander()` trong `NPCManager.ts`

```typescript
// Tìm kệ có hàng trong handleWander():
const shelves = Object.values(store.placedShelves)
let foundShelfId = null
for (const shelf of shelves) {
  // FIX: Chỉ mua từ kệ 'selling', KHÔNG bao giờ từ 'storage'
  if (shelf.role !== 'selling') continue
  if (!customer.checkedShelfIds.includes(shelf.id) &&
      shelf.tiers.some(t => t.slots.length > 0)) {
    foundShelfId = shelf.id
    break
  }
}
```

### 8.2 Vá `handleInteract()` trong `NPCManager.ts`

```typescript
// Trong handleInteract(), khi gọi npcTakeItemFromSlot:
const itemId = shelfIdTaken ? store.npcTakeItemFromSlot(shelfIdTaken) : null
// npcTakeItemFromSlot đã có check role === 'storage' → return null
// Nhưng cần đảm bảo NPC không tìm đến đúng shelf đó:
// Thêm safety check ngay trong handleInteract:
if (shelfIdTaken) {
  const shelf = store.placedShelves[shelfIdTaken]
  if (!shelf || shelf.role !== 'selling') {
    customer.state = 'WANDER'
    return
  }
}
```

### 8.3 Đảm bảo `npcTakeItemFromSlot()` trong `furnitureStore.ts`

```typescript
npcTakeItemFromSlot(shelfId: string) {
  const shelf = this.placedShelves[shelfId]
  if (!shelf) return null
  // RULE: NPCs tuyệt đối không mua từ storage
  if (shelf.role !== 'selling') return null
  // ... phần còn lại giữ nguyên
}
```

---

## 9. Nội thất mua về dạng Thùng Hàng (Furniture Box)

### 9.1 Flow khi mua nội thất

```
Người chơi bấm "Mua Ngay" trong FurnitureTab
        │
        ▼
furnitureStore.buyFurniture(id)
  → Không thêm vào purchasedFurniture nữa
  → Thay vào đó: deliveryStore.scheduleFurnitureDelivery(id)
        │
        ▼
DeliveryManager.spawnFurnitureBox(itemId, furnitureId)
  → Tạo LiveBox đặc biệt với isFurniture = true
  → Màu sắc/icon khác biệt (ví dụ: màu tím, có icon 🏗️)
        │
        ▼
Người chơi đến nhặt bằng phím [F]
  → playerHandStore.pickup({ type: 'furniture', furnitureId, quantity: 1 })
        │
        ▼
Người chơi di chuyển đến vị trí muốn đặt
  → Bấm [E] → Kích hoạt Build Mode với furnitureId từ tay
  → Hiển thị Ghost Preview + Collision Check
        │
        ▼
Người chơi click xác nhận vị trí
  → furnitureStore.placeFurniture(x, y, rotation)
  → playerHandStore.dropAll()
```

### 9.2 Cập nhật `DeliveryManager`

```typescript
// Thêm interface FurnitureBox:
interface LiveBox {
  id: string
  sprite: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  qtyLabel: Phaser.GameObjects.Text
  itemId: string
  type: 'pack' | 'box' | 'furniture'  // ← Thêm 'furniture'
  furnitureId?: string                 // ← Key trong FURNITURE_ITEMS
  quantity: number
  name: string
  isBeingCarried: boolean
  carrierType: 'player' | 'npc' | null  // ← Ai đang cầm?
  carrierId: string | null              // ← instanceId của người cầm
}

// Thêm method:
public spawnFurnitureBox(itemId: string, furnitureId: string, name: string) {
  const doorPos = this.environmentManager.getDoorLocation()
  // Spawn tương tự spawnBox() nhưng:
  // - Màu tím: 0x7e22ce
  // - Label hiển thị icon 🏗️
  // - isFurniture = true
  // ... implement tương tự spawnBox()
}

// Trong checkPickup():
// NPC KHÔNG BAO GIỜ được nhặt furniture box
if (nearest.type === 'furniture') {
  // Chỉ cho player nhặt
  if (/* đây là NPC check */ false) return
}
```

### 9.3 Collision Check khi đặt nội thất từ tay

```typescript
// Trong MainScene.handlePlayerInteraction(), khi tay đang cầm furniture:
const handStore = usePlayerHandStore()
if (handStore.item?.type === 'furniture') {
  const furnitureId = handStore.item.furnitureId!
  useGameStore().startBuildMode(furnitureId)
  // BuildMode sẽ hiển thị Ghost và Collision Check như bình thường
  handStore.dropAll()  // Xóa khỏi tay khi bắt đầu build mode
}
```

---

## 10. Y-Sort & Drop Physics trong môi trường 2.5D

### 10.1 Quy tắc Y-Sort cho thùng hàng

Trong môi trường 2.5D, Depth của một object phải bằng:

```
depth = BASE_DEPTH + (worldY * Y_SORT_FACTOR)
```

Với:
- `BASE_DEPTH = DEPTH.FURNITURE = 10`
- `Y_SORT_FACTOR = 0.001` (điều chỉnh tùy theo scale bản đồ)

### 10.2 Cập nhật `LiveBox` để Y-Sort đúng

```typescript
// Trong update() của DeliveryManager, mỗi frame:
this.boxes.forEach(box => {
  if (!box.isBeingCarried) {
    // === Y-SORT: Depth phải cập nhật theo Y thực tế ===
    box.sprite.setDepth(DEPTH.FURNITURE + box.sprite.y * 0.001)
    box.label.setPosition(box.sprite.x, box.sprite.y - 22)
    box.qtyLabel.setPosition(box.sprite.x, box.sprite.y + 22)
    box.label.setDepth(box.sprite.depth + 0.1)
    box.qtyLabel.setDepth(box.sprite.depth + 0.1)
  }
})
```

### 10.3 Khi Drop thùng hàng — Gán Y đúng

```typescript
// Trong dropBoxAtCurrentPosition() và tương tự:
private dropBoxAtCurrentPosition(worker: WorkerNPC): void {
  if (!worker.carriedBoxInstanceId) return

  const dropX = worker.sprite.x
  // QUAN TRỌNG: Y của thùng phải bằng Y DƯỚI CHÂN nhân vật
  // Trong 2.5D, "dưới chân" = sprite.y (không phải sprite.y - height/2)
  const dropY = worker.sprite.y + 16  // Offset nhỏ về phía dưới

  this.scene.deliveryManager?.staffDropBox(
    worker.instanceId,
    false,   // Không destroy
    dropX,
    dropY,
    DEPTH.FURNITURE + dropY * 0.001  // Depth tính từ Y drop, không phải Y nhân vật
  )

  worker.isCarryingBox = false
  worker.carriedBoxInstanceId = null
}
```

### 10.4 Vật lý khi vứt — tránh "trôi ma"

```typescript
// Khi spawn hoặc drop thùng hàng xuống đất:
const body = boxRect.body as Phaser.Physics.Arcade.Body
body.setGravityY(300)           // Lực rơi vừa phải
body.setBounce(0.1)             // Nảy ít
body.setDrag(200)               // Ma sát cao — không trượt lâu
body.setMaxVelocityY(400)       // Giới hạn tốc độ rơi
body.setCollideWorldBounds(true)

// Sau 2 giây (khi đã chạm đất và dừng lại):
this.scene.time.delayedCall(2000, () => {
  if (body && body.velocity.lengthSq() < 1) {
    body.setVelocity(0)
    body.setGravityY(0)   // Tắt trọng lực khi đã nghỉ (không drift nữa)
    body.allowGravity = false
  }
})
```

---

## 11. Logic Hết Giờ Làm (End of Shift — 9:00 PM)

### 11.1 Trigger End of Shift

```typescript
// Trong MainScene.ts — setupStoreSubscriptions():
const statsStore = useStatsStore()
let wasOpen = false
const unsubTime = statsStore.$subscribe((_m, state) => {
  if (state.timeInMinutes >= 1260 && wasOpen) { // 21:00 = 1260 phút
    wasOpen = false
    this.staffManager?.endWorkday()
  }
  if (state.timeInMinutes < 1200 && state.shopState === 'OPEN') {
    wasOpen = true
  }
})
this.storeUnsubscribers.push(unsubTime)
```

### 11.2 NPC Xếp hàng — Hành vi khi tan ca

```typescript
// Trong StaffManager.endWorkday():
public endWorkday(): void {
  this.workers.forEach(worker => {
    if (!worker.isActive) return

    if (worker.workerDuty === 'RESTOCK') {
      // Nếu đang vác thùng hàng → vứt xuống NGAY TẠI CHỖ, không tiếp tục đi
      if (worker.isCarryingBox && worker.carriedBoxInstanceId) {
        this.dropBoxAtCurrentPosition(worker)
      }
      // Ngay lập tức chuyển sang GO_HOME
      worker.restockSubState = 'GO_HOME'
    }

    if (worker.workerDuty === 'CHECKOUT') {
      // Checkout worker: xử lý nốt khách đang đứng tại quầy
      // State machine sẽ xử lý qua handleCheckoutEndShift()
      worker.restockSubState = 'GO_HOME'
      // Flag: Hoàn tất khách hàng đang tại quầy trước khi về
      worker['finishCurrentCustomer'] = true
    }
  })
}
```

### 11.3 NPC Thu ngân — Hành vi khi tan ca

```typescript
// Trong update() của StaffManager, xử lý Checkout worker khi GO_HOME:
private handleCheckoutGoHome(worker: WorkerNPC, gameStore: any): void {
  const isPendingFinish = worker['finishCurrentCustomer']

  if (isPendingFinish && gameStore.waitingCustomers > 0) {
    // Phục vụ nốt 1 khách đang đứng đầu hàng
    gameStore.serveCustomer()
    worker['finishCurrentCustomer'] = false

    // Các khách hàng phía sau sẽ bị kick ra (bực bội bỏ đi)
    // NPCManager xử lý việc này khi shopState chuyển sang CLOSED
    return
  }

  // Không còn khách → đi về
  this.moveWorkerToExit(worker)
}
```

### 11.4 GO_HOME State Handler

```typescript
private handleGoHome(worker: WorkerNPC): void {
  // Xử lý checkout worker đặc biệt
  if (worker.workerDuty === 'CHECKOUT' && worker['finishCurrentCustomer']) {
    this.handleCheckoutGoHome(worker, useGameStore())
    return
  }

  const doorPos = this.environmentManager.getDoorLocation()
  const dist = Phaser.Math.Distance.Between(
    worker.sprite.x, worker.sprite.y,
    doorPos.x, doorPos.y + 80
  )

  if (dist > 30) {
    this.moveWorkerTo(worker, doorPos.x, doorPos.y + 80)
    return
  }

  // Đến cửa → Despawn
  worker.sprite.destroy()
  worker.statusText.destroy()
  worker.isActive = false
  this.workers.delete(worker.instanceId)
}
```

---

## 12. Giờ làm việc & Idle Zone

### 12.1 Idle Zone trong `EnvironmentManager`

```typescript
// src/features/environment/managers/EnvironmentManager.ts

public idleStaffZone: { x: number; y: number; radius: number } = { x: 0, y: 0, radius: 60 }

// Trong refreshEnvironment():
// Idle Zone nằm bên trái cổng ra vào, trong shop
const doorPos = this.doorLocation
this.idleStaffZone = {
  x: doorPos.x - 120,
  y: doorPos.y - 80,
  radius: 60
}
```

### 12.2 Mỗi worker về đúng vị trí trong Idle Zone

```typescript
// Trong StaffManager:
private getIdleZonePosition(worker: WorkerNPC): { x: number; y: number } {
  const zone = this.environmentManager.idleStaffZone
  // Phân bổ vị trí khác nhau cho mỗi worker theo index
  const workers = Array.from(this.workers.values())
  const index = workers.findIndex(w => w.instanceId === worker.instanceId)
  const angle = (index / Math.max(workers.length, 1)) * Math.PI * 2
  return {
    x: zone.x + Math.cos(angle) * (zone.radius * 0.5),
    y: zone.y + Math.sin(angle) * (zone.radius * 0.3)
  }
}
```

### 12.3 Respawn ngày mới

```typescript
// Trong StaffManager:
public startWorkday(): void {
  const staffStore = useStaffStore()
  // Re-sync workers từ store (đã được persist qua F5)
  this.syncWorkers()

  // Đặt tất cả worker về IDLE
  this.workers.forEach(worker => {
    worker.isActive = true
    worker.restockSubState = 'IDLE'
    worker.shelfRetries = 0
    worker['finishCurrentCustomer'] = false
    const idlePos = this.getIdleZonePosition(worker)
    worker.sprite.setPosition(idlePos.x, idlePos.y)
  })
}
```

---

## 13. Persistence (Lưu/Tải dữ liệu an toàn)

### 13.1 Cập nhật `saveGame()` trong `gameStore.ts`

```typescript
saveGame() {
  const stats = useStatsStore()
  const inv = useInventoryStore()
  const furniture = useFurnitureStore()
  const customer = useCustomerStore()
  const staff = useStaffStore()
  const playerHand = usePlayerHandStore()

  // Lấy trạng thái thùng hàng vật lý từ DeliveryManager (qua Phaser)
  // MainScene phải expose getter cho điều này
  const physicalBoxes = (window as any).__mainSceneDeliveryBoxes ?? []

  const saveData = {
    // === STATS ===
    money: stats.money,
    level: stats.level,
    currentExp: stats.currentExp,
    expansionLevel: stats.expansionLevel,
    currentDay: stats.currentDay,
    timeInMinutes: stats.timeInMinutes,

    // === INVENTORY ===
    shopInventory: inv.shopInventory,
    personalBinder: inv.personalBinder,

    // === FURNITURE ===
    placedShelves: furniture.placedShelves,
    placedTables: furniture.placedTables,
    placedCashiers: furniture.placedCashiers,
    purchasedFurniture: furniture.purchasedFurniture,

    // === CUSTOMER ===
    shopState: customer.shopState,

    // === GYM ===
    gymLeaders: useGymStore().gymLeaders,

    // === STAFF (MỚI) ===
    hiredWorkers: staff.hiredWorkers.map(hw => ({
      instanceId: hw.instanceId,
      dataId: hw.dataId,
      duty: hw.duty,
      targetDeskId: hw.targetDeskId ?? null,
      restockMode: hw.restockMode ?? 'AUTO',
      // Không lưu x, y, state — Phaser tự set khi respawn
    })),

    // === PLAYER HAND (MỚI) ===
    playerHand: playerHand.item,

    // === PHYSICAL BOXES (MỚI) ===
    // Tất cả thùng hàng đang nằm trên sàn (kể cả thùng nội thất)
    physicalBoxes: physicalBoxes.map((box: any) => ({
      id: box.id,
      itemId: box.itemId,
      type: box.type,
      furnitureId: box.furnitureId ?? null,
      quantity: box.quantity,
      name: box.name,
      x: box.sprite?.x ?? 0,
      y: box.sprite?.y ?? 0,
    })).filter((b: any) => !b.isBeingCarried), // Không lưu thùng đang được vác
  }

  localStorage.setItem('tcg-shop-save', JSON.stringify(saveData))
},
```

### 13.2 Expose `physicalBoxes` từ DeliveryManager

```typescript
// src/features/environment/managers/DeliveryManager.ts

/** Getter để gameStore.saveGame() lấy snapshot trạng thái boxes */
public getSerializableBoxes(): Array<{
  id: string; itemId: string; type: string;
  furnitureId?: string; quantity: number; name: string;
  x: number; y: number;
}> {
  return this.boxes
    .filter(b => !b.isBeingCarried)
    .map(b => ({
      id: b.id,
      itemId: b.itemId,
      type: b.type,
      furnitureId: b.furnitureId,
      quantity: b.quantity,
      name: b.name,
      x: b.sprite.x,
      y: b.sprite.y,
    }))
}
```

```typescript
// src/game/MainScene.ts — Trong create() sau khi khởi tạo deliveryManager:
// Expose để gameStore có thể đọc khi save
;(window as any).__getDeliveryBoxes = () =>
  this.deliveryManager?.getSerializableBoxes() ?? []
```

```typescript
// Trong gameStore.saveGame():
const physicalBoxes = (window as any).__getDeliveryBoxes?.() ?? []
```

### 13.3 Load lại thùng hàng vật lý khi F5

```typescript
// src/game/MainScene.ts — Sau khi deliveryManager được khởi tạo trong create():
// Restore các thùng hàng đã lưu

const savedBoxes = (loadedSaveData?.physicalBoxes ?? []) as any[]
savedBoxes.forEach((box: any) => {
  this.deliveryManager.restoreBox(box)
})
```

```typescript
// DeliveryManager.restoreBox():
public restoreBox(data: {
  id: string; itemId: string; type: string;
  furnitureId?: string; quantity: number; name: string;
  x: number; y: number;
}): void {
  // Spawn box tại tọa độ đã lưu, không có velocity/gravity ban đầu
  const boxRect = this.scene.add.rectangle(data.x, data.y, 48, 36, 0x8B4513) as any
  // ... thiết lập vật lý tương tự spawnBox() nhưng:
  body.setVelocity(0)
  body.setGravityY(0)
  body.allowGravity = false  // Đã nghỉ trên đất rồi
  // Gán Y-sort đúng
  boxRect.setDepth(DEPTH.FURNITURE + data.y * 0.001)
  // ... đăng ký vào this.boxes[] với id = data.id
}
```

### 13.4 Cập nhật `loadSave()` trong `gameStore.ts`

```typescript
loadSave() {
  const saved = localStorage.getItem('tcg-shop-save')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      useStatsStore().loadStats(parsed)
      useInventoryStore().loadInventory(parsed)
      useFurnitureStore().loadFurniture(parsed)
      useCustomerStore().loadCustomerState(parsed)
      useStaffStore().loadStaff(parsed)
      useGymStore().loadGymState(parsed)
      usePlayerHandStore().loadHand(parsed)    // ← MỚI

      // physicalBoxes được restore trong MainScene.create() sau khi
      // deliveryManager được khởi tạo (xem 13.3 ở trên)
      // Lưu tạm để MainScene đọc:
      ;(window as any).__pendingBoxRestore = parsed.physicalBoxes ?? []

      useApiStore().initSeriesShop()
    } catch (e) {
      console.error("Lỗi nghiêm trọng khi đọc file save", e)
    }
  }
},
```

### 13.5 Migration an toàn cho save cũ

```typescript
// staffStore.loadStaff():
loadStaff(parsed: any) {
  if (!parsed.hiredWorkers || !Array.isArray(parsed.hiredWorkers)) {
    this.hiredWorkers = []
    return
  }
  this.hiredWorkers = parsed.hiredWorkers.map((hw: any) => ({
    instanceId: hw.instanceId,
    dataId: hw.dataId,
    duty: hw.duty ?? 'NONE',
    targetDeskId: hw.targetDeskId ?? null,
    restockMode: hw.restockMode ?? 'AUTO',   // ← Migration: default AUTO
    x: 0,
    y: 0,
    state: 'IDLE'
  }))
}
```

### 13.6 Auto-save trigger toàn diện trong `App.vue`

```typescript
// src/App.vue — onMounted()
import { usePlayerHandStore } from './features/inventory/store/playerHandStore'
const playerHandStore = usePlayerHandStore()
const staffStore = useStaffStore()

const saveCallback = () => store.saveGame()

statsStore.$subscribe(saveCallback, { deep: true })
inventoryStore.$subscribe(saveCallback, { deep: true })
furnitureStore.$subscribe(saveCallback, { deep: true })
customerStore.$subscribe(saveCallback, { deep: true })
staffStore.$subscribe(saveCallback, { deep: true })        // ← Đã có
playerHandStore.$subscribe(saveCallback, { deep: true })   // ← MỚI
```

---

## 14. Checklist thi công (theo thứ tự bắt buộc)

### Bước 1: Types & Interfaces (không có risk)
- [ ] Cập nhật `src/features/staff/types/index.ts` — thêm `RestockSubState`, `RestockMode` (3 giá trị: AUTO/REFILL_ONLY/FILL_EMPTY), update `HiredWorker`
- [ ] Tạo `src/features/inventory/store/playerHandStore.ts` — implement đầy đủ theo spec
- [ ] Cập nhật `src/features/inventory/types/delivery.ts` — thêm `'furniture'` vào `DeliveryBoxType`, thêm `carrierType`, `carrierId`

### Bước 2: Fix Bug NPC Kệ Kho (độc lập)
- [ ] Vá `handleWander()` trong `NPCManager.ts` — thêm `role === 'selling'` filter
- [ ] Vá `handleInteract()` trong `NPCManager.ts` — thêm safety check role
- [ ] Đảm bảo `npcTakeItemFromSlot()` trong `furnitureStore.ts` có check `role !== 'selling' → return null`

### Bước 3: Warehouse Shelf Asset
- [ ] Tạo `src/assets/images/warehouse_shelf.svg` — phân biệt rõ với kệ gỗ thường (màu xám kim loại)
- [ ] Thêm config `'warehouse_shelf'` vào `FURNITURE_ITEMS` — 10 tầng, 40 slot/tầng
- [ ] Cập nhật `FurnitureManager.displayShelf()` — chọn texture dựa trên `shelf.role`
- [ ] Load texture mới trong `MainScene.preload()`

### Bước 4: PlayerHandStore tích hợp vào UI
- [ ] Cập nhật `ShelfManagementMenu.vue` — chỉ cho phép chuyển từ "Trên Tay" vào kệ (loại bỏ pull từ shopInventory ảo)
- [ ] Thêm hiển thị HUD "Đang cầm" (overlay nhỏ ở góc màn hình)
- [ ] Cập nhật `DeliveryManager.checkPickup()` — gọi `playerHandStore.pickup()` thay vì `deliveryStore.pickUpBox()`

### Bước 5: Furniture Box Flow
- [ ] Cập nhật `furnitureStore.buyFurniture()` — không thêm vào `purchasedFurniture` nữa, thay bằng `deliveryStore.scheduleFurnitureDelivery()`
- [ ] Thêm `spawnFurnitureBox()` trong `DeliveryManager`
- [ ] Cập nhật `checkPickup()` — NPC bỏ qua furniture box (`box.type === 'furniture'`)
- [ ] Cập nhật `MainScene.handlePlayerInteraction()` — detect furniture trong tay → startBuildMode

### Bước 6: EnvironmentManager — Idle Zone
- [ ] Thêm `idleStaffZone` property vào `EnvironmentManager.ts`
- [ ] Assign giá trị trong `initializeEnvironment()` và `refreshEnvironment()`

### Bước 7: DeliveryManager — Staff API
- [ ] Thêm `getUncarriedBoxes()` — lọc boxes không ai đang cầm, không phải furniture
- [ ] Thêm `staffPickUpBox(workerId, boxId)` — gán `carrierType='npc'`, `carrierId=workerId`
- [ ] Thêm `staffDropBox(workerId, destroy, x?, y?, depth?)` — Y-sort aware drop
- [ ] Thêm `getSerializableBoxes()` — snapshot cho save
- [ ] Thêm `restoreBox(data)` — load lại từ save
- [ ] Cập nhật `update()` — Y-sort depth mỗi frame cho boxes không bị vác

### Bước 8: StaffManager — Core (sau khi có đủ dependencies)
- [ ] Cập nhật interface `WorkerNPC` với tất cả fields mới (anti-stuck + restocker + carry)
- [ ] Implement `checkAndResolveStuck()`
- [ ] Implement `checkShelfRetryLimit()`
- [ ] Implement `resetWorkerToIdle()` — bao gồm drop box tại chỗ
- [ ] Implement `handleRestockerStateMachine()` dispatcher — 9 cases
- [ ] Implement tất cả 9 state handlers
- [ ] Implement tất cả helper methods (findStorageWithStock, findBestSellingShelf, stockItemsFromBoxToShelf, v.v.)
- [ ] Implement `endWorkday()` — xử lý riêng RESTOCK vs CHECKOUT
- [ ] Implement `startWorkday()` — respawn và reset IDLE
- [ ] Implement `dropBoxAtCurrentPosition()` — Y-sort aware

### Bước 9: MainScene Integration
- [ ] Hook `staffManager.endWorkday()` vào Stats subscription (timeInMinutes >= 1260)
- [ ] Hook `staffManager.startWorkday()` vào Day subscription
- [ ] Expose `__getDeliveryBoxes` và `__pendingBoxRestore` window globals
- [ ] Restore physical boxes từ `__pendingBoxRestore` sau khi `deliveryManager` init

### Bước 10: Persistence & Migration
- [ ] Cập nhật `saveGame()` trong `gameStore.ts` — thêm hiredWorkers, playerHand, physicalBoxes
- [ ] Cập nhật `loadSave()` trong `gameStore.ts` — thêm playerHand, pendingBoxRestore
- [ ] Cập nhật `loadStaff()` — migration `restockMode` (default AUTO)
- [ ] Thêm `playerHandStore.$subscribe(saveCallback)` trong `App.vue`

### Bước 11: Testing & QA
- [ ] **Anti-Stuck:** Đặt kệ vào góc tường → nhân viên có teleport thoát ra không?
- [ ] **Anti-Loop:** Xóa tất cả kệ kho trong khi NPC đang đi lấy hàng → có rơi vào loop không?
- [ ] **No-Warehouse Fallback:** Shop không có kệ kho → NPC có chuyển thẳng sang DIRECT_RESTOCK không?
- [ ] **Full Shelf Fallback:** Cả kho và kệ bán đều đầy → NPC có vào WAITING_FOR_SPACE không?
- [ ] **NPC Bug:** Đặt kệ kho đầy hàng → NPC Customer có mua được không? (PHẢI LÀ KHÔNG)
- [ ] **End of Shift RESTOCK:** Advance time 9PM → NPC Xếp hàng vứt thùng ngay tại chỗ và về?
- [ ] **End of Shift CHECKOUT:** Advance time 9PM → NPC Thu ngân tính tiền nốt 1 khách rồi mới về?
- [ ] **Y-Sort:** Vứt thùng hàng → depth có đúng không, có "trôi ma" xuống dưới không?
- [ ] **Furniture Box:** Mua nội thất → thùng spawn ngoài → NPC bỏ qua → chỉ người chơi nhặt được?
- [ ] **Persistence F5:** Thuê nhân viên, cấu hình REFILL_ONLY, có thùng trên sàn → F5 → kiểm tra tất cả còn nguyên không?
- [ ] **Hand Limit:** Thử cầm hơn 8 pack hoặc 2 box → hệ thống có chặn không?
- [ ] **Hand Dupe Check:** Rút hàng từ kệ vào tay → kiểm tra kệ trừ đúng và tay cộng đúng.

---

## 15. Phụ lục: Sơ đồ State Machine đầy đủ

### State Machine Restocker (v2.0)

```
                    ┌─────────────────────────────────────────────────┐
                    │                                                 │
                    ▼                                                 │ không có việc
          ┌──────────────────┐                                        │
          │      IDLE        │ ◄──────────────────────────────────────┘
          └──────────────────┘
                    │
         ┌──────────┼──────────┐
         │          │          │
    có thùng    kệ bán cần   không có việc
    giao hàng   hàng + kho     → IDLE
         │      có stock
         │          │
         │     ┌────┘
         │     │
  ┌──────▼─────▼──────────────────────┐
  │     FETCH_FROM_DELIVERY           │
  │   (Đến bãi nhặt thùng)           │
  └───────────────────────────────────┘
         │
         ├──── Có kệ kho còn chỗ ──────────► CARRY_TO_STORAGE ──► FIND_SHELF
         │
         ├──── Không có kệ kho,          ──► DIRECT_RESTOCK ──────► IDLE
         │     có kệ bán cần hàng
         │
         └──── Cả hai đều đầy            ──► (drop tại chỗ) ──────► WAITING_FOR_SPACE


FIND_SHELF:
  Tìm được cặp (kho có hàng + kệ bán cần hàng)
        ↓
  FETCH_FROM_STORAGE ──── kho rỗng ────► FIND_SHELF (retry++) ──max──► IDLE
        ↓ lấy hàng thành công
  CARRY_TO_SELLING_SHELF
        ↓ đặt hàng lên kệ bán
       IDLE


WAITING_FOR_SPACE:
  Đứng tại IdleZone, check mỗi 5 giây
  Có kệ nào trống? ──► IDLE (thử lại)
  Không?           ──► tiếp tục chờ


GO_HOME: (Trigger: timeInMinutes >= 1260)
  CHECKOUT worker:
    → Phục vụ nốt 1 khách đang tại quầy
    → Khách phía sau bị kick
    → Đi ra cửa → Despawn

  RESTOCK worker:
    → Nếu đang vác thùng → vứt xuống ngay tại chỗ (Y-sort aware)
    → Đi ra cửa → Despawn
```

### Sơ đồ "Trên Tay" (PlayerHand State)

```
EMPTY ──── Nhặt Pack (≤8) ────► HAS_PACKS (1-8 packs)
      ──── Nhặt Box ──────────► HAS_BOX (1 box)
      ──── Nhặt Furniture ────► HAS_FURNITURE (1 item)

HAS_PACKS:
  ──── Đặt lên kệ ──► EMPTY (nếu hết) hoặc HAS_PACKS (nếu còn)
  ──── Nhặt thêm Pack cùng loại (chưa đủ 8) ──► HAS_PACKS
  ──── Không được nhặt Box/Furniture

HAS_BOX:
  ──── Đặt lên kệ kho ──► EMPTY
  ──── Không được nhặt gì thêm

HAS_FURNITURE:
  ──── Bấm [E] ──► startBuildMode() ──► EMPTY (sau khi place)
  ──── Bấm ESC ──► dropAll() ──► Furniture Box rơi xuống đất ──► EMPTY
```

---

*Blueprint v2.0 — Thiết kế để Junior Coder thi công từng bước độc lập. Mỗi bước có thể được test riêng trước khi integrate. Nguyên tắc bất biến ở Mục 1 phải được kiểm tra ở từng PR.*