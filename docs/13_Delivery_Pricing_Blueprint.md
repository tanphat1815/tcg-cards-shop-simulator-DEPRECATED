# 13_Delivery_Pricing_Blueprint.md
## Module: Phaser Box Delivery, Immersive Storage & Set Price

---

## Sơ đồ thư mục

```
src/features/inventory/
├── store/
│   └── deliveryStore.ts              ← NEW: quản lý trạng thái giao hàng
├── types/
│   └── delivery.ts                   ← NEW: PendingDelivery, DeliveryBox
├── components/
│   └── SetPriceModal.vue             ← NEW: popup định giá khi xếp lên kệ
src/game/
└── MainScene.ts                      ← MODIFY: thêm deliveryManager logic
src/features/environment/
└── managers/
    └── DeliveryManager.ts            ← NEW: Phaser physics box spawn + carry
src/features/shop-ui/
└── store/
    └── gameStore.ts                  ← MODIFY: expose delivery + setPriceTarget
```

---

## Luồng tổng thể

```
CartSidebar.checkout()
    → cartStore.checkout()
    → deliveryStore.schedulDelivery(items)   ← Ghi danh sách cần giao
    → [Phaser] DeliveryManager.spawnBoxes()  ← Đọc deliveryStore, spawn boxes
    → Player bấm [F] gần box                ← Pick up box
    → Tùy loại box:
        Nội thất → kích hoạt Build Mode (furnitureStore)
        Pack/Box → mở StorageShelf UI hoặc đặt lên kệ bán
    → Đặt lên kệ bán → SetPriceModal xuất hiện
```

---

## Step 1 — Tạo Types (`src/features/inventory/types/delivery.ts`)

```typescript
export type DeliveryBoxType = 'pack' | 'box' | 'furniture'

export interface PendingDeliveryItem {
  itemId: string
  name: string
  type: DeliveryBoxType
  quantity: number
  imageUrl: string
  furnitureId?: string    // chỉ dùng nếu type === 'furniture'
}

export interface DeliveryBox {
  id: string              // unique per box instance
  itemId: string
  name: string
  type: DeliveryBoxType
  quantity: number        // số lượng trong thùng này
  phaserSpriteKey?: string // 'box_sprite' hoặc furniture sprite key
}

export interface SetPriceTarget {
  shelfId: string
  tierIndex: number
  itemId: string
  name: string
  imageUrl: string
  currentPrice: number    // giá đang set
  marketPrice: number     // market price từ shopItems.sellPrice
  buyPrice: number        // giá nhập (để tính profit)
}
```

---

## Step 2 — Tạo `deliveryStore.ts`

```typescript
import { defineStore } from 'pinia'
import type { PendingDeliveryItem, SetPriceTarget } from '../types/delivery'

export const useDeliveryStore = defineStore('delivery', {
  state: () => ({
    /** Queue chờ spawn trong Phaser */
    pendingDeliveries: [] as PendingDeliveryItem[],
    /** Khi đang carry 1 thùng hàng */
    carriedBox: null as PendingDeliveryItem | null,
    /** Trigger mở SetPriceModal sau khi xếp hàng lên kệ */
    setPriceTarget: null as SetPriceTarget | null,
  }),

  actions: {
    /**
     * Gọi sau khi Cart checkout thành công.
     * Chuyển cartItems → pendingDeliveries để Phaser spawn.
     */
    scheduleDelivery(items: Array<{ itemId: string; name: string; type: string; quantity: number; imageUrl: string }>) {
      items.forEach(item => {
        // Mỗi đơn vị quantity → 1 delivery item (Phaser sẽ spawn nhiều box)
        this.pendingDeliveries.push({
          itemId: item.itemId,
          name: item.name,
          type: item.type as any,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
        })
      })
    },

    /** Phaser gọi để lấy và xoá khỏi queue */
    consumeDelivery(): PendingDeliveryItem | null {
      return this.pendingDeliveries.shift() ?? null
    },

    pickUpBox(item: PendingDeliveryItem) {
      this.carriedBox = item
    },

    dropBox() {
      this.carriedBox = null
    },

    openSetPrice(target: SetPriceTarget) {
      this.setPriceTarget = target
    },

    closeSetPrice() {
      this.setPriceTarget = null
    },
  },
})
```

**Tích hợp vào cartStore.checkout()** — sau khi `checkout()` thành công, thêm:
```typescript
// Trong cartStore.actions.checkout(), sau khi items rỗng:
const { useDeliveryStore } = require('./deliveryStore')
useDeliveryStore().scheduleDelivery(snapshot)
// snapshot = array của items trước khi clear, cần capture trước `this.items = []`
```

Cụ thể, sửa checkout trong cartStore:
```typescript
checkout() {
  // ... validation ...
  const snapshot = this.items.map(i => ({
    itemId: i.itemId,
    name: i.name,
    type: i.type,
    quantity: i.quantity,
    imageUrl: i.imageUrl,
  }))

  // ... gọi buyStock loop ...

  if (failedItems.length === 0) {
    // Import lazy
    const { useDeliveryStore } = require('./deliveryStore')
    useDeliveryStore().scheduleDelivery(snapshot)
    this.items = []
    this.isOpen = false
    return { success: true, failedItems: [] }
  }
  // ...
}
```

---

## Step 3 — Tạo `DeliveryManager.ts` (Phaser)

File: `src/features/environment/managers/DeliveryManager.ts`

**Nguyên tắc quan trọng:**
- KHÔNG dùng Vue reactivity (`ref`, `computed`) — chỉ đọc store bằng `.pendingDeliveries` trong `update()`
- KHÔNG lưu tọa độ Phaser vào Pinia store
- Box sprite là rectangle màu nâu (`0x8B4513`) kích thước 48×36, có label text

```typescript
import Phaser from 'phaser'
import { useDeliveryStore } from '../../inventory/store/deliveryStore'
import { EnvironmentManager } from './EnvironmentManager'
import { DEPTH } from '../config'

interface LiveBox {
  id: string
  sprite: Phaser.Physics.Arcade.Sprite
  label: Phaser.GameObjects.Text
  itemId: string
  type: string
  quantity: number
  name: string
  isBeingCarried: boolean
}

export class DeliveryManager {
  private scene: Phaser.Scene
  private boxes: LiveBox[] = []
  private environmentManager: EnvironmentManager
  private lastSpawnTime = 0
  private spawnInterval = 800  // ms giữa mỗi lần spawn
  private keyF!: Phaser.Input.Keyboard.Key

  // Khu vực KHÔNG được spawn (Warp Gate zone)
  private static readonly WARP_GATE_EXCLUSION_RADIUS = 150

  constructor(scene: Phaser.Scene, environmentManager: EnvironmentManager) {
    this.scene = scene
    this.environmentManager = environmentManager
    this.keyF = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F)
  }

  /**
   * Gọi mỗi frame từ MainScene.update()
   */
  update(time: number, playerX: number, playerY: number) {
    this.trySpawnNext(time)
    this.updateCarryPosition(playerX, playerY)
    this.checkPickup(playerX, playerY)
  }

  private trySpawnNext(time: number) {
    if (time < this.lastSpawnTime + this.spawnInterval) return
    const deliveryStore = useDeliveryStore()
    if (deliveryStore.pendingDeliveries.length === 0) return

    const item = deliveryStore.consumeDelivery()
    if (!item) return

    this.lastSpawnTime = time
    this.spawnBox(item)
  }

  private spawnBox(item: { itemId: string; name: string; type: string; quantity: number }) {
    const doorPos = this.environmentManager.getDoorLocation()
    const warpX = doorPos.x
    const warpY = doorPos.y + 150  // vị trí Warp Gate

    // Tìm vị trí spawn không đè Warp Gate
    let spawnX = doorPos.x + Phaser.Math.Between(-80, 80)
    let spawnY = doorPos.y - 50  // spawn từ trên rớt xuống

    // Safety: nếu quá gần warp gate, dịch sang bên
    const distToWarp = Phaser.Math.Distance.Between(spawnX, spawnY, warpX, warpY)
    if (distToWarp < DeliveryManager.WARP_GATE_EXCLUSION_RADIUS) {
      spawnX = doorPos.x - 120
    }

    // Tạo sprite
    const sprite = this.scene.physics.add.sprite(spawnX, spawnY, 'box_delivery')
    sprite.setDepth(DEPTH.FURNITURE)

    // Fallback: nếu không có texture 'box_delivery', vẽ rectangle
    if (!this.scene.textures.exists('box_delivery')) {
      const graphics = this.scene.add.graphics()
      graphics.fillStyle(0x8B4513)
      graphics.fillRect(0, 0, 48, 36)
      graphics.lineStyle(2, 0x5D2906)
      graphics.strokeRect(0, 0, 48, 36)
      // Vẽ nét X trên thùng
      graphics.lineStyle(1, 0xD4A574, 0.6)
      graphics.lineBetween(0, 0, 48, 36)
      graphics.lineBetween(48, 0, 0, 36)
      const texture = graphics.generateTexture('box_delivery', 48, 36)
      graphics.destroy()
    }
    sprite.setTexture('box_delivery')

    // Physics: bounce khi chạm sàn
    const body = sprite.body as Phaser.Physics.Arcade.Body
    body.setGravityY(400)
    body.setBounce(0.3)
    body.setVelocityY(-100)  // bắn nhẹ lên rồi rơi xuống
    body.setCollideWorldBounds(true)

    const label = this.scene.add.text(spawnX, spawnY - 22, item.name.substring(0, 20), {
      fontSize: '9px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 3, y: 2 }
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    const qtyLabel = this.scene.add.text(spawnX, spawnY + 22, `×${item.quantity}`, {
      fontSize: '11px',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    // Tween: nhảy nhẹ khi landing (thêm sau 1.2s)
    this.scene.time.delayedCall(1200, () => {
      this.scene.tweens.add({
        targets: sprite,
        y: sprite.y - 8,
        duration: 150,
        yoyo: true,
        ease: 'Bounce.Out'
      })
    })

    const id = `box_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    this.boxes.push({
      id,
      sprite,
      label,
      itemId: item.itemId,
      type: item.type,
      quantity: item.quantity,
      name: item.name,
      isBeingCarried: false,
    })
  }

  private checkPickup(playerX: number, playerY: number) {
    if (!Phaser.Input.Keyboard.JustDown(this.keyF)) return
    const deliveryStore = useDeliveryStore()

    // Nếu đang carry → thả xuống
    if (deliveryStore.carriedBox) {
      this.dropCarried()
      return
    }

    // Tìm box gần nhất trong 70px
    let nearest: LiveBox | null = null
    let minDist = 70
    for (const box of this.boxes) {
      if (box.isBeingCarried) continue
      const dist = Phaser.Math.Distance.Between(playerX, playerY, box.sprite.x, box.sprite.y)
      if (dist < minDist) {
        minDist = dist
        nearest = box
      }
    }

    if (!nearest) return
    this.pickUp(nearest)
  }

  private pickUp(box: LiveBox) {
    const deliveryStore = useDeliveryStore()
    box.isBeingCarried = true

    // Tắt physics khi đang cầm
    const body = box.sprite.body as Phaser.Physics.Arcade.Body
    body.setEnable(false)

    deliveryStore.pickUpBox({
      itemId: box.itemId,
      name: box.name,
      type: box.type as any,
      quantity: box.quantity,
      imageUrl: '',
    })

    // Flash tint để feedback
    box.sprite.setTint(0xffdd77)
    this.scene.time.delayedCall(200, () => box.sprite.clearTint())
  }

  private updateCarryPosition(playerX: number, playerY: number) {
    const deliveryStore = useDeliveryStore()
    if (!deliveryStore.carriedBox) return

    const carriedBox = this.boxes.find(b => b.isBeingCarried)
    if (!carriedBox) return

    // Box đi theo player, offset lên phía trên
    carriedBox.sprite.setPosition(playerX, playerY - 50)
    carriedBox.label.setPosition(playerX, playerY - 72)
  }

  private dropCarried() {
    const deliveryStore = useDeliveryStore()
    const box = this.boxes.find(b => b.isBeingCarried)
    if (box) {
      box.isBeingCarried = false
      // Bật lại physics
      const body = box.sprite.body as Phaser.Physics.Arcade.Body
      body.setEnable(true)
    }
    deliveryStore.dropBox()
  }

  /**
   * Gọi từ MainScene khi player tương tác [E] với kệ trong lúc đang carry
   * Trả về true nếu đã xử lý interaction
   */
  handleShelfInteraction(shelfId: string): boolean {
    const deliveryStore = useDeliveryStore()
    if (!deliveryStore.carriedBox) return false

    const carried = deliveryStore.carriedBox
    if (carried.type === 'furniture') {
      // Kích hoạt build mode
      const { useFurnitureStore } = require('../../furniture/store/furnitureStore')
      useFurnitureStore().startBuildMode(carried.itemId)
      this.removeCarriedBox()
      deliveryStore.dropBox()
      return true
    }

    // Pack/Box → thêm vào kho inventory và trigger SetPrice
    const { useInventoryStore } = require('../../inventory/store/inventoryStore')
    const inventoryStore = useInventoryStore()
    if (!inventoryStore.shopInventory[carried.itemId]) {
      inventoryStore.shopInventory[carried.itemId] = 0
    }
    inventoryStore.shopInventory[carried.itemId] += carried.quantity
    this.removeCarriedBox()
    deliveryStore.dropBox()
    return true
  }

  private removeCarriedBox() {
    const idx = this.boxes.findIndex(b => b.isBeingCarried)
    if (idx === -1) return
    const box = this.boxes[idx]
    box.sprite.destroy()
    box.label.destroy()
    this.boxes.splice(idx, 1)
  }

  destroy() {
    this.boxes.forEach(b => {
      b.sprite.destroy()
      b.label.destroy()
    })
    this.boxes = []
  }
}
```

---

## Step 4 — Tích hợp DeliveryManager vào `MainScene.ts`

```typescript
// Thêm import
import { DeliveryManager } from '../features/environment/managers/DeliveryManager'

// Thêm property
public deliveryManager!: DeliveryManager

// Trong create(), sau khi khởi tạo environmentManager:
this.deliveryManager = new DeliveryManager(this, this.environmentManager)

// Trong update():
this.deliveryManager.update(time, this.player.x, this.player.y)

// Trong handlePlayerInteraction(), trước khi check cashier (ưu tiên 0.5):
if (this.deliveryManager) {
  const nearestShelfForDelivery = this.getNearestFromGroup(this.furnitureManager.shelvesGroup, 70)
  if (nearestShelfForDelivery) {
    const handled = this.deliveryManager.handleShelfInteraction(nearestShelfForDelivery.getData('id'))
    if (handled) return
  }
}

// Trong phần destroy / cleanup, thêm:
this.deliveryManager?.destroy()
```

---

## Step 5 — `SetPriceModal.vue`

File: `src/features/inventory/components/SetPriceModal.vue`

**Trigger:** Component này được mount vào App.vue và tự hiện/ẩn dựa trên `deliveryStore.setPriceTarget`.

Tuy nhiên, trong MVP, cách đơn giản hơn là trigger SetPriceModal từ `ShelfManagementMenu.vue` khi user kéo item lên tier — thêm nút "Set Giá" sau khi fill tier.

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDeliveryStore } from '../store/deliveryStore'
import { useInventoryStore } from '../store/inventoryStore'

const deliveryStore = useDeliveryStore()
const inventoryStore = useInventoryStore()

const target = computed(() => deliveryStore.setPriceTarget)
const customPrice = ref(0)

// Sync customPrice với target mỗi khi target thay đổi
watch(target, (t) => {
  if (t) customPrice.value = t.currentPrice || t.marketPrice
}, { immediate: true })

const profit = computed(() => {
  if (!target.value) return 0
  return customPrice.value - target.value.buyPrice
})

const profitPct = computed(() => {
  if (!target.value || target.value.buyPrice === 0) return 0
  return ((customPrice.value / target.value.buyPrice - 1) * 100).toFixed(1)
})

const formatVND = (usd: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(usd * 25000)

function applyPrice() {
  if (!target.value) return
  // Ghi giá vào shopItems.sellPrice cho item này
  const item = inventoryStore.shopItems[target.value.itemId]
  if (item) {
    item.sellPrice = customPrice.value
  }
  deliveryStore.closeSetPrice()
}

function setMarket() {
  if (target.value) customPrice.value = target.value.marketPrice
}
function adjustPct(pct: number) {
  if (!target.value) return
  customPrice.value = parseFloat((target.value.marketPrice * (1 + pct / 100)).toFixed(2))
}
function roundPrice() {
  customPrice.value = Math.round(customPrice.value * 10) / 10
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="target"
        class="fixed inset-0 z-[350] flex items-center justify-center bg-black/60"
        @click.self="deliveryStore.closeSetPrice()"
      >
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

          <!-- Header -->
          <div class="bg-emerald-600 px-6 py-5 flex items-center justify-between">
            <h2 class="text-white font-black text-xl">💰 Định giá bán</h2>
            <button @click="deliveryStore.closeSetPrice()" class="text-emerald-200 hover:text-white text-2xl">✕</button>
          </div>

          <!-- Product info -->
          <div class="flex gap-4 px-6 pt-5 pb-3 border-b border-gray-100">
            <div class="w-20 h-28 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 flex items-center justify-center">
              <img v-if="target.imageUrl" :src="target.imageUrl" class="h-full w-auto object-contain" />
              <span v-else class="text-3xl">🎁</span>
            </div>
            <div class="flex flex-col justify-center gap-1">
              <p class="font-black text-gray-800 text-base leading-tight">{{ target.name }}</p>
              <div class="flex gap-3 text-sm">
                <span class="text-gray-500">Nhập: <strong class="text-gray-700">${{ target.buyPrice }}</strong></span>
                <span class="text-blue-600">Market: <strong>${{ target.marketPrice }}</strong></span>
              </div>
            </div>
          </div>

          <!-- Price input -->
          <div class="px-6 py-5 space-y-4">
            <div>
              <label class="text-sm font-bold text-gray-500 uppercase tracking-wider block mb-2">Giá bán / đơn vị</label>
              <div class="flex items-center border-2 border-indigo-300 rounded-xl overflow-hidden focus-within:border-indigo-500">
                <span class="px-4 text-indigo-500 font-black text-xl">$</span>
                <input
                  v-model.number="customPrice"
                  type="number" step="0.01" min="0"
                  class="flex-grow py-3 text-2xl font-black text-gray-800 focus:outline-none"
                />
              </div>
              <p class="text-xs text-gray-400 mt-1 text-right">≈ {{ formatVND(customPrice) }}</p>
            </div>

            <!-- Quick actions -->
            <div class="flex gap-2 flex-wrap">
              <button @click="setMarket()" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors">
                Market Price
              </button>
              <button @click="adjustPct(10)" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
                +10%
              </button>
              <button @click="adjustPct(-10)" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors">
                −10%
              </button>
              <button @click="roundPrice()" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors">
                Làm tròn
              </button>
            </div>

            <!-- Profit display -->
            <div class="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div class="flex justify-between items-center">
                <span class="text-gray-500 text-sm font-medium">Lợi nhuận / đơn vị</span>
                <div class="text-right">
                  <span
                    class="font-black text-xl"
                    :class="profit >= 0 ? 'text-emerald-600' : 'text-red-500'"
                  >${{ profit.toFixed(2) }}</span>
                  <span
                    class="text-xs font-bold ml-2"
                    :class="profit >= 0 ? 'text-emerald-500' : 'text-red-400'"
                  >({{ profit >= 0 ? '+' : '' }}{{ profitPct }}%)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex gap-3 px-6 pb-6">
            <button
              @click="deliveryStore.closeSetPrice()"
              class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm"
            >Huỷ</button>
            <button
              @click="applyPrice()"
              class="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm"
            >✓ Áp dụng giá</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active, .modal-fade-leave-active { transition: all 0.2s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.95); }
</style>
```

**Mount vào App.vue:**
```typescript
import SetPriceModal from './features/inventory/components/SetPriceModal.vue'
```
```html
<SetPriceModal />
```

---

## Step 6 — Trigger SetPriceModal từ ShelfManagementMenu

Trong `ShelfManagementMenu.vue`, sau khi `fillTier()` hoặc `moveToTierSlot()` thành công, thêm:

```typescript
import { useDeliveryStore } from '../../inventory/store/deliveryStore'
import { getPackVisuals, getBoxVisuals } from '../../inventory/config/assetRegistry'

// Trong handleTierClick, sau khi gọi gameStore.moveToTierSlot hoặc fillTier:
const deliveryStore = useDeliveryStore()
const shopItem = inventoryStore.shopItems[selectedItemId.value]
if (shopItem && activeShelf.value) {
  deliveryStore.openSetPrice({
    shelfId: activeShelf.value.id,
    tierIndex: tierIndex,
    itemId: selectedItemId.value,
    name: shopItem.name,
    imageUrl: shopItem.type === 'pack'
      ? getPackVisuals(shopItem.sourceSetId ?? selectedItemId.value).front
      : getBoxVisuals(shopItem.sourceSetId ?? selectedItemId.value).front,
    currentPrice: shopItem.sellPrice,
    marketPrice: shopItem.sellPrice,
    buyPrice: shopItem.buyPrice,
  })
}
```

---

## Giao tiếp Vue → Phaser (Event Bus Pattern)

Để Phaser biết khi có delivery mới mà không dùng `$subscribe` phức tạp, `DeliveryManager.update()` polling `deliveryStore.pendingDeliveries.length` mỗi frame là đủ (không reactive, chỉ đọc plain array length). Đây là cách đúng kiến trúc.

**KHÔNG làm:**
```typescript
// ❌ SAI — Dùng watch từ Vue trong Phaser Manager
import { watch } from 'vue'
watch(() => deliveryStore.pendingDeliveries, ...)
```

**PHẢI làm:**
```typescript
// ✅ ĐÚNG — Polling trong Phaser update loop
update(time: number, ...) {
  if (time > this.lastSpawnTime + this.spawnInterval) {
    const item = useDeliveryStore().consumeDelivery() // đọc trực tiếp
    if (item) this.spawnBox(item)
  }
}
```

---

## Checklist bắt buộc

- [ ] `DeliveryManager` KHÔNG import bất kỳ `ref`, `computed`, `watch` từ Vue — chỉ import store instances và gọi actions/getters thuần
- [ ] Spawn box PHẢI kiểm tra `WARP_GATE_EXCLUSION_RADIUS` (150px quanh `doorPos.x, doorPos.y + 150`)
- [ ] Physics body của box phải `setCollideWorldBounds(true)` và `setGravityY(400)` để rơi tự nhiên
- [ ] Khi carry box, PHẢI `body.setEnable(false)` — không chỉ set velocity = 0
- [ ] `deliveryStore.consumeDelivery()` dùng `.shift()` (FIFO) — KHÔNG dùng `.pop()` (LIFO)
- [ ] `SetPriceModal` dùng `Teleport to="body"` — KHÔNG mount inline trong ShelfManagementMenu
- [ ] `shopItem.sellPrice` được mutate trực tiếp — đây là intentional (shop item config là per-instance không phải global)
- [ ] `customPrice` trong SetPriceModal là `ref<number>`, KHÔNG dùng `v-model` trực tiếp lên store
- [ ] Mỗi lần DeliveryManager.spawnBox() chạy, kiểm tra `this.scene.textures.exists('box_delivery')` trước khi generateTexture để tránh duplicate


# Walkthrough - Delivery & Pricing (Phase 1)

Phase 1 of the Delivery & Pricing system is now fully implemented. This phase establishes the core logic for ordering items, spawning delivery boxes in the game world, and allowing the player to carry and deliver them to shelves.

## Key Changes

### 1. Delivery Data & Store
- **[Types](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/inventory/types/delivery.ts)**: Defined `PendingDeliveryItem` and `DeliveryBox` to track goods from order to world spawn.
- **[Delivery Store](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/inventory/store/deliveryStore.ts)**: A Pinia store that acts as a bridge between the Web UI (ordering) and Phaser (spawning).
- **[Cart Integration](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/inventory/store/cartStore.ts)**: The `checkout()` method now snapshots the cart items and schedules a delivery before clearing the cart.

### 2. Phaser Delivery Manager
- **[DeliveryManager](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/environment/managers/DeliveryManager.ts)**:
    - **Physics Spawning**: Boxes spawn near the shop door with gravity and a slight bounce.
    - **Carry Logic**: Pressing **[F]** near a box picks it up. The box follows the player with a visual offset.
    - **Collision Safety**: Physics bodies are disabled while carrying to ensure smooth movement.
    - **Warp Gate Exclusion**: Boxes are guaranteed to spawn outside a 150px radius of the warp gate to avoid overlap.
    - **Shelf Integration**: Pressing **[E]** near a shelf while carrying a box "delivers" the items into the shop's inventory.

### 3. Scene Integration
- **[MainScene](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/game/MainScene.ts)**: Now initializes and updates the `DeliveryManager` every frame. It also handles the priority of delivery interactions over cashier actions.

### 4. Set Price Workflow (Phase 2)
- **[SetPriceModal](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/inventory/components/SetPriceModal.vue)**: A premium Vue modal triggered after shelf stocking.
    - Displays product image, buy price, and market price.
    - Dynamic profit and profit percentage calculation.
    - Quick actions: Set to Market, +10%, -10%, Rounding.
    - VND currency conversion display.
- **Integration**:
    - **[App.vue](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/App.vue)**: Global mounting of the modal.
    - **[ShelfManagementMenu](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/furniture/components/ShelfManagementMenu.vue)**: Automatically triggers price setting when items are added to a tier.

### 5. Build & Reliability Fixes
- **Type Safety**: Fixed unused variable warnings and updated `LiveBox` interface.
- **ESM Compatibility**: Resolved `require` errors by switching to ESM imports.
- **Build Verified**: Clean build with zero errors.

## User Actions to Test

1. **Order Items**: Add some packs or boxes to your cart and checkout.
2. **Receive Boxes**: Walk outside the shop door to see boxes dropping.
3. **Carry Box**: Walk up to a box and press **[F]**.
4. **Deliver Box**: Carry it to any shelf and press **[E]** (items go to warehouse).
5. **Manage Shelf**: Open **Shelf Management** ([E] on shelf), select an item from warehouse, and click/Shift+Click a tier.
6. **Set Price**: Observe the **SetPriceModal** appearing automatically. Adjust the price and click **✓ Áp dụng giá**.

---

> [!NOTE]
> I am ready to proceed with **Step 5 & 6 (Vue UI: SetPriceModal)** whenever you are!
