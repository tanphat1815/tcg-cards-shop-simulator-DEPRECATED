# 23 — Player Interaction & Gacha Overhaul Blueprint

**Dự án:** Pokémon TCG Shop Simulator  
**Phạm vi:** Xây dựng lại game loop tương tác vật phẩm + đại tu hiệu ứng Gacha  
**Mức độ ảnh hưởng:** 🔴 BREAKING — Thay đổi kiến trúc Inventory + Phaser interaction layer  
**Ngày soạn:** 2025  

---

## Tổng quan & Lý do thay đổi

### Vấn đề gốc rễ (Root Cause Analysis)

Game loop hiện tại có một sự mâu thuẫn kiến trúc căn bản:

```
[Thùng hàng vật lý ngoài sân] → Nhấn E gần Kệ → Hàng ma thuật chui vào shopInventory
                                                    ↓
                                     Player không thấy, không chạm, không bóc
```

Điều này vi phạm nguyên tắc **Diegetic Interface** (mọi tương tác phải có hành động vật lý tương ứng trong thế giới game). Hậu quả:

1. **Bug kẹt chuột phải** trong `ShelfManagementMenu.vue`: `activeItem` không có nơi "thả", logic xử lý click tầng kệ không nhất quán.
2. **HintText overlay** hiện sai thời điểm — hiện ngay cả khi đang mở UI Modal.
3. **PocketModal thiếu** — không có cách nào xem / mở Pack từ "túi cá nhân".
4. **Gacha UX nghèo nàn** — các lá bài hiện ra flat, thiếu kịch tính.

### Game Loop Sau Khi Hoàn Thiện

```
Phaser World                                   Vue UI Layer
──────────────────────────────────────         ──────────────────────────
Thùng hàng rơi xuống bãi giao hàng
         ↓ [F] Nhặt thùng
Đang vác thùng theo Player
         ↓ [R] Bóc thùng tại chỗ
Hàng chuyển vào playerPocketStore.pocket
         ↓ [E] Gần kệ
                                     →   Mở ShelfManagementMenu (chỉ mở UI)
                                              ↓ Click Pack từ Pocket section
                                         Gán Pack lên tầng kệ
         ↓ Bấm icon Ba Lô (🎒)
                                     →   Mở PocketModal
                                              ↓ Click Pack
                                         PackOpeningOverlay → Gacha
```

---

## Phase A: Đổi kiến trúc Inventory → Player Pocket Store

### A1. Tạo `playerPocketStore.ts` (Thay thế khái niệm shopInventory cho hàng cầm tay)

> **Lưu ý:** `shopInventory` vẫn **tồn tại** trong `inventoryStore` như một "sổ kế toán" — nó ghi nhận tổng hàng tồn kho về mặt số liệu. Điểm thay đổi là **flow nhập hàng vật lý**: thay vì Phaser nuốt thẳng vào `shopInventory`, hàng phải đi qua `playerPocketStore` trước (cầm trong tay), rồi Player tự tay xếp vào kệ hoặc mở Pack.

**File:** `src/features/inventory/store/playerPocketStore.ts`  
*(Hiện tại có `playerHandStore.ts` với max 8 pack. File mới này mở rộng thành "túi ba lô" không giới hạn cứng, thay thế hoàn toàn luồng hàng từ Phaser vào.)*

```typescript
// src/features/inventory/store/playerPocketStore.ts
import { defineStore } from 'pinia'

export interface PocketEntry {
  itemId: string
  name: string
  type: 'pack' | 'box'
  quantity: number
  sourceSetId?: string
  imageUrl?: string
}

export const usePlayerPocketStore = defineStore('playerPocket', {
  state: () => ({
    /** Hàng hóa đang cầm trong tay / ba lô của Player
     *  Key: itemId, Value: PocketEntry */
    pocket: {} as Record<string, PocketEntry>,
    /** Flag hiển thị PocketModal */
    showPocketModal: false,
  }),

  getters: {
    isEmpty: (state) => Object.keys(state.pocket).length === 0,

    totalItems: (state) =>
      Object.values(state.pocket).reduce((sum, e) => sum + e.quantity, 0),

    pocketList: (state) => Object.values(state.pocket),
  },

  actions: {
    /**
     * Nhập hàng vào túi (gọi từ DeliveryManager khi Player bóc thùng).
     * Dùng itemId làm key để gộp cùng loại.
     */
    addToPocket(entry: Omit<PocketEntry, 'quantity'> & { quantity: number }) {
      if (this.pocket[entry.itemId]) {
        this.pocket[entry.itemId].quantity += entry.quantity
      } else {
        this.pocket[entry.itemId] = { ...entry }
      }
    },

    /**
     * Lấy hàng ra khỏi túi (gọi khi xếp lên kệ hoặc mở Pack).
     * @returns số lượng thực sự đã lấy (có thể ít hơn nếu không đủ)
     */
    removeFromPocket(itemId: string, quantity: number = 1): number {
      const entry = this.pocket[itemId]
      if (!entry) return 0

      const taken = Math.min(quantity, entry.quantity)
      entry.quantity -= taken
      if (entry.quantity <= 0) delete this.pocket[itemId]
      return taken
    },

    openPocketModal() { this.showPocketModal = true },
    closePocketModal() { this.showPocketModal = false },

    /** Load từ save */
    loadPocket(parsed: any) {
      this.pocket = parsed.playerPocket ?? {}
    },
  },
})
```

### A2. Cập nhật `gameStore.ts` — Thêm delegation cho playerPocketStore

Trong `gameStore.ts`, thêm vào phần **getters** và **actions**:

```typescript
// Thêm import ở đầu file
import { usePlayerPocketStore } from '../../inventory/store/playerPocketStore'

// Trong getters:
playerPocket: () => usePlayerPocketStore().pocket,
playerPocketList: () => usePlayerPocketStore().pocketList,
showPocketModal: () => usePlayerPocketStore().showPocketModal,

// Trong actions:
openPocketModal() { usePlayerPocketStore().openPocketModal() },
closePocketModal() { usePlayerPocketStore().closePocketModal() },
addToPocket(entry: any) { usePlayerPocketStore().addToPocket(entry) },
removeFromPocket(itemId: string, qty: number) {
  return usePlayerPocketStore().removeFromPocket(itemId, qty)
},
```

### A3. Cập nhật `gameStore.ts` — `saveGame()` & `loadSave()`

```typescript
// Trong saveGame():
saveData = {
  // ... các field hiện có ...
  playerPocket: usePlayerPocketStore().pocket,   // ← THÊM
}

// Trong loadSave() → gọi trong khối try:
usePlayerPocketStore().loadPocket(parsed)        // ← THÊM
```

### A4. Sửa `inventoryStore.ts` — `buyStock` không còn cộng shopInventory trực tiếp

> ⚠️ **Quan trọng:** `buyStock` vẫn giữ nguyên để tương thích với flow mua Pack từ OnlineShopMenu → Cart → CartStore → DeliveryStore. **KHÔNG sửa** hàm này. Điểm thay đổi chỉ nằm ở `DeliveryManager` bên dưới.

---

## Phase B: Sửa Physics Phaser — DeliveryManager & Input

### B1. Thêm phím `[R]` — Bóc thùng hàng tại chỗ

**File:** `src/features/environment/managers/DeliveryManager.ts`

Trong `constructor()`, sau dòng khai báo `this.keyF`:

```typescript
// Thêm sau: this.keyF = scene.input.keyboard!.addKey(...)
private keyR!: Phaser.Input.Keyboard.Key

// Trong constructor:
this.keyR = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)
```

Thêm method mới `unpackCarriedBox()`:

```typescript
/**
 * Bóc thùng hàng đang vác: Giải phóng toàn bộ Pack/Box bên trong
 * vào playerPocketStore của Player.
 * Hộp vật lý Phaser bị hủy.
 */
public unpackCarriedBox() {
  const deliveryStore = useDeliveryStore()
  const pocketStore = usePlayerPocketStore()
  const inventoryStore = useInventoryStore()

  const carried = deliveryStore.carriedBox
  if (!carried) return

  if (carried.type === 'furniture') {
    // Đồ nội thất không bóc được, thông báo Player
    console.warn('[DeliveryManager] Không thể bóc thùng nội thất. Hãy đặt xuống gần kệ.')
    return
  }

  // Lấy thông tin item để biết quantity bên trong
  const shopItem = inventoryStore.shopItems[carried.itemId]
  if (!shopItem) return

  // Nếu là Box → unbox thành Pack trước, rồi vào pocket
  if (carried.type === 'box' && shopItem.contains) {
    const innerItemId = shopItem.contains.itemId
    const innerAmount = shopItem.contains.amount * carried.quantity
    const innerItem = inventoryStore.shopItems[innerItemId]

    pocketStore.addToPocket({
      itemId: innerItemId,
      name: innerItem?.name ?? innerItemId,
      type: 'pack',
      quantity: innerAmount,
      sourceSetId: innerItem?.sourceSetId,
    })
  } else {
    // Đây là Pack trực tiếp
    pocketStore.addToPocket({
      itemId: carried.itemId,
      name: carried.name,
      type: carried.type as 'pack',
      quantity: carried.quantity,
      sourceSetId: shopItem?.sourceSetId,
    })
  }

  // Hủy thùng vật lý
  this.removeCarriedBox()
  deliveryStore.dropBox()
}
```

**Sửa hàm `checkPickup()`** — thêm xử lý phím R:

```typescript
private checkPickup(playerX: number, playerY: number) {
  const deliveryStore = useDeliveryStore()

  // ── PHÍM R: Bóc thùng đang vác ──
  if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
    if (deliveryStore.carriedBox) {
      this.unpackCarriedBox()
      return
    }
    // Nếu không đang cầm gì → R không làm gì
    return
  }

  // ── PHÍM F: Nhặt / Thả thùng ──
  if (!Phaser.Input.Keyboard.JustDown(this.keyF)) return

  if (deliveryStore.carriedBox) {
    this.dropCarried()
    return
  }

  // Tìm thùng gần nhất để nhặt
  let nearest: LiveBox | null = null
  let minDist = 100
  for (const box of this.boxes) {
    if (box.carriedBy !== null) continue
    const dist = Phaser.Math.Distance.Between(playerX, playerY, box.sprite.x, box.sprite.y)
    if (dist < minDist) {
      minDist = dist
      nearest = box
    }
  }

  if (nearest) {
    this.pickUp(nearest)
  }
}
```

### B2. Sửa `handleShelfInteraction()` — Chỉ mở UI, không nuốt hàng

**Hiện tại:** Nhấn E gần kệ → tự động đẩy hàng vào inventory.  
**Sau khi sửa:** Nhấn E gần kệ → CHỈ mở `ShelfManagementMenu`. Việc xếp hàng lên kệ 100% do Player thao tác trong menu.

```typescript
// Trong DeliveryManager.ts
handleShelfInteraction(shelfId: string): boolean {
  const deliveryStore = useDeliveryStore()
  const furnitureStore = useFurnitureStore()
  const uiStore = useUIStore()
  const shelf = furnitureStore.placedShelves[shelfId]
  if (!shelf) return false

  // Nếu đang cầm đồ nội thất → vẫn cho phép đặt đồ
  if (deliveryStore.carriedBox?.type === 'furniture') {
    furnitureStore.startBuildMode(deliveryStore.carriedBox.itemId)
    this.removeCarriedBox()
    deliveryStore.dropBox()
    return true
  }

  // Mọi trường hợp còn lại → chỉ mở Shelf UI
  // Player sẽ tự tay kéo hàng từ Pocket vào tầng kệ trong menu
  uiStore.openShelfMenu(shelfId)
  return true
}
```

### B3. Sửa `updateHintText()` — Ẩn Hint khi đang mở Modal

```typescript
private updateHintText(playerX: number, playerY: number) {
  const deliveryStore = useDeliveryStore()
  const uiStore = useUIStore()
  const cam = this.scene.cameras.main

  // ── RULE: TUYỆT ĐỐI ẩn hint khi đang mở bất kỳ UI Modal nào ──
  const isAnyModalOpen =
    uiStore.showShelfMenu ||
    uiStore.showBinderMenu ||
    uiStore.showBuildMenu ||
    uiStore.showOnlineShop

  if (isAnyModalOpen) {
    this.hintText.setVisible(false)
    return
  }

  // ── Đang cầm thùng ──
  if (deliveryStore.carriedBox) {
    const typeLabel = deliveryStore.carriedBox.type === 'furniture'
      ? 'đồ nội thất'
      : 'thùng hàng'

    const actionText = deliveryStore.carriedBox.type === 'furniture'
      ? '[F] Thả xuống  •  [E] Sát kệ để đặt đồ'
      : '[F] Thả xuống  •  [R] Bóc thùng → vào Túi'

    this.hintText
      .setText(actionText)
      .setVisible(true)
      .setPosition(cam.width / 2, cam.height - 80)
      .setOrigin(0.5)
    return
  }

  // ── Có thùng gần ──
  let hasNearby = false
  for (const box of this.boxes) {
    if (box.carriedBy !== null) continue
    const dist = Phaser.Math.Distance.Between(playerX, playerY, box.sprite.x, box.sprite.y)
    if (dist < 100) {
      hasNearby = true
      break
    }
  }

  if (hasNearby) {
    this.hintText
      .setText('[F] Nhặt thùng hàng')
      .setVisible(true)
      .setPosition(cam.width / 2, cam.height - 80)
      .setOrigin(0.5)
  } else {
    this.hintText.setVisible(false)
  }
}
```

### B4. Thêm phím `[R]` vào `MainScene.ts`

Trong `MainScene.ts`, đoạn `update()`, thêm xử lý bóc thùng từ scene level (phòng trường hợp DeliveryManager chưa handle kịp):

```typescript
// Trong setupInputs():
// (Phím R đã được xử lý bên trong DeliveryManager.checkPickup()
//  Không cần thêm ở đây nếu DeliveryManager.update() được gọi trước keyE check)
```

> **Thứ tự update quan trọng trong `update(time, delta)`:**
> 1. `this.deliveryManager.update(time, ...)` ← xử lý R/F trước
> 2. `if (JustDown(keyE)) handlePlayerInteraction(...)` ← E xử lý sau

---

## Phase C: Fix Bug `ShelfManagementMenu.vue`

### C1. Thêm Pocket section vào ShelfManagementMenu

Cột trái của menu cần hiển thị **2 nguồn hàng**:
1. **Pocket** (túi cá nhân của Player) — ưu tiên hiện trên cùng
2. **shopInventory** (kho tổng) — phần dưới (legacy, giữ lại để không break code khác)

**Sửa `<script setup>` của `ShelfManagementMenu.vue`:**

```typescript
// Thêm import
import { usePlayerPocketStore } from '../../inventory/store/playerPocketStore'
import { getPackVisuals, getBoxVisuals } from '../../inventory/config/assetRegistry'

const pocketStore = usePlayerPocketStore()

// ── activeItem: item đang được chọn để đặt lên kệ ──
// (tương đương selectedItemId + isSelectedFromHand hiện tại)
// Dùng một object thống nhất thay vì 2 biến rời rạc

interface ActiveSelection {
  itemId: string
  source: 'pocket' | 'shopInventory'
  quantity: number
}

const activeSelection = ref<ActiveSelection | null>(null)

// Nguồn hàng từ Pocket
const pocketItems = computed(() =>
  pocketStore.pocketList.filter(entry => {
    if (activeShelf.value?.role === 'display_case') return false
    return entry.type === 'pack' || entry.type === 'box'
  })
)

// Helper: lấy URL ảnh cho item
function getItemImageUrl(itemId: string, type: 'pack' | 'box', sourceSetId?: string): string {
  const setId = sourceSetId ?? itemId.replace('pack_', '').replace('box_', '')
  return type === 'pack'
    ? getPackVisuals(setId).front
    : getBoxVisuals(setId).front
}

function selectFromPocket(itemId: string) {
  const entry = pocketStore.pocket[itemId]
  if (!entry) return
  activeSelection.value = {
    itemId,
    source: 'pocket',
    quantity: entry.quantity,
  }
}

function selectFromInventory(id: string) {
  activeSelection.value = {
    itemId: id,
    source: 'shopInventory',
    quantity: inventoryStore.shopInventory[id] ?? 0,
  }
}

// Đặt hàng lên tầng kệ — logic thống nhất
function placeOnTier(tierIndex: number) {
  if (!activeSelection.value || !activeShelf.value) return

  const { itemId, source } = activeSelection.value
  const shelf = activeShelf.value

  if (source === 'pocket') {
    // Lấy 1 đơn vị từ Pocket, xếp vào kệ
    const tier = shelf.tiers[tierIndex]
    const shopItem = inventoryStore.shopItems[itemId]
    if (!shopItem) return

    // Kiểm tra tier có chấp nhận item này không
    if (tier.itemId !== null && tier.itemId !== itemId) return
    if (tier.slots.length >= tier.maxSlots) return

    // Thực hiện giao dịch
    const taken = pocketStore.removeFromPocket(itemId, 1)
    if (taken <= 0) return

    // Xếp vào tầng (dùng furnitureStore action)
    useFurnitureStore().fillTierFromHand(shelf.id, itemId, tierIndex, taken)

    // Cập nhật activeSelection
    const remaining = pocketStore.pocket[itemId]?.quantity ?? 0
    if (remaining <= 0) {
      activeSelection.value = null
    } else {
      activeSelection.value = { ...activeSelection.value, quantity: remaining }
    }

    // Mở SetPriceModal nếu chưa có giá
    if (shelf.role === 'selling' && (shopItem.sellPrice ?? 0) <= 0) {
      openPriceEditor(itemId, tierIndex)
    }

  } else {
    // Source: shopInventory — logic cũ
    gameStore.moveToTierSlot(itemId, tierIndex)

    const shopItem = inventoryStore.shopItems[itemId]
    if (shopItem && shelf.role === 'selling' && (shopItem.sellPrice ?? 0) <= 0) {
      openPriceEditor(itemId, tierIndex)
    }

    const remaining = inventoryStore.shopInventory[itemId] ?? 0
    if (remaining <= 0) activeSelection.value = null
  }
}
```

### C2. Fix `handleTierClick()` — Xóa bug kẹt

```typescript
// Xóa hoàn toàn handleTierClick() cũ.
// Thay bằng:

const handleTierClick = (tierIndex: number, event: MouseEvent) => {
  const shelf = activeShelf.value
  if (!shelf) return

  // Display Case: xử lý riêng ở handleDisplaySlotClick
  if (shelf.role === 'display_case') return

  // ── Nếu có activeSelection → đặt hàng vào tier này ──
  if (activeSelection.value) {
    placeOnTier(tierIndex)
    return
  }

  // ── Không có selection → không làm gì (xóa bỏ hành vi cũ) ──
}

const handleTierRightClick = (tierIndex: number) => {
  const shelf = activeShelf.value
  if (!shelf) return

  const tier = shelf.tiers[tierIndex]
  if (!tier.itemId || tier.slots.length === 0) return

  const itemData = inventoryStore.shopItems[tier.itemId]
  if (!itemData) return

  // Lấy 1 đơn vị từ kệ → đưa vào Pocket (KHÔNG còn dùng playerHandStore)
  const taken = gameStore.takeItemFromTierSimple(shelf.id, tierIndex)
  if (!taken) return

  pocketStore.addToPocket({
    itemId: tier.itemId,
    name: itemData.name,
    type: itemData.type as 'pack' | 'box',
    quantity: 1,
    sourceSetId: itemData.sourceSetId,
  })

  // Auto-select item vừa lấy vào activeSelection để Player dễ xếp sang tầng khác
  activeSelection.value = {
    itemId: tier.itemId,
    source: 'pocket',
    quantity: pocketStore.pocket[tier.itemId]?.quantity ?? 1,
  }
}
```

### C3. Sửa Template HTML của `ShelfManagementMenu.vue` — Cột trái

Thay thế phần cột trái (Left Panel) trong `<template>`:

```html
<!-- Left: Pocket + Inventory -->
<div class="w-[260px] shrink-0 border-r border-gray-700 bg-gray-900/50 p-4 flex flex-col relative">

  <!-- SECTION 1: POCKET (túi cá nhân) -->
  <div v-if="pocketItems.length > 0" class="mb-4">
    <h3 class="text-sm font-bold text-yellow-400 mb-2 pb-2 border-b border-yellow-500/30 uppercase tracking-wider flex items-center gap-2">
      🎒 Túi Ba Lô ({{ pocketItems.length }})
    </h3>
    <div class="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scroll">
      <div
        v-for="entry in pocketItems"
        :key="entry.itemId"
        @click="selectFromPocket(entry.itemId)"
        class="group relative flex items-center gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-all overflow-hidden"
        :class="activeSelection?.itemId === entry.itemId && activeSelection?.source === 'pocket'
          ? 'bg-yellow-600/20 border-yellow-400 shadow-[0_0_12px_rgba(234,179,8,0.4)]'
          : 'bg-gray-800 border-gray-700 hover:border-yellow-500/40'"
      >
        <!-- Ảnh nhỏ -->
        <div class="w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-slate-900 border border-slate-700">
          <img
            :src="getItemImageUrl(entry.itemId, entry.type, entry.sourceSetId)"
            class="w-full h-full object-contain"
            @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
          />
        </div>
        <div class="flex flex-col min-w-0 flex-grow">
          <span class="font-bold text-[12px] text-gray-100 truncate">{{ entry.name }}</span>
          <span class="text-[10px] text-yellow-400 font-medium uppercase">{{ entry.type }}</span>
        </div>
        <div class="bg-yellow-900/50 text-yellow-300 px-2 py-0.5 rounded text-xs font-mono border border-yellow-700 ml-auto shrink-0">
          x{{ entry.quantity }}
        </div>
      </div>
    </div>
    <p v-if="activeSelection?.source === 'pocket'" class="mt-2 text-[10px] text-center text-yellow-300 italic">
      Click vào Tầng để xếp hàng
    </p>
  </div>

  <!-- SECTION 2: SHOP INVENTORY (kho tổng / legacy) -->
  <h3 class="text-sm font-bold text-gray-200 mb-3 pb-2 border-b border-gray-700 uppercase tracking-wider">
    {{ activeShelf?.role === 'display_case' ? '🗂️ Personal Binder' : '📦 Kho hàng Shop' }}
  </h3>

  <div v-if="inventoryItems.length === 0 && pocketItems.length === 0" class="text-center text-gray-500 italic mt-10 text-sm">
    Kho đang trống.<br/>Hãy bóc thùng hàng [R] để thêm vào Túi.
  </div>

  <div v-else class="flex-grow overflow-y-auto pr-1 custom-scroll space-y-2">
    <div
      v-for="inv in inventoryItems"
      :key="inv.id"
      @click="selectFromInventory(inv.id)"
      class="flex justify-between items-center p-3 rounded-xl border-2 cursor-pointer transition-all"
      :class="activeSelection?.itemId === inv.id && activeSelection?.source === 'shopInventory'
        ? 'bg-emerald-900/40 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
        : 'bg-gray-800/60 border-gray-700/40 hover:bg-gray-700'"
    >
      <div class="flex flex-col min-w-0">
        <span class="font-bold text-[12px] text-gray-200 truncate">{{ inv.item?.name }}</span>
        <span class="text-[9px] text-gray-500 uppercase">{{ (inv.item as any)?.type }}</span>
      </div>
      <div class="bg-gray-950 text-emerald-400 px-2 py-0.5 rounded text-xs font-mono border border-gray-800 ml-2 shrink-0">
        x{{ inv.quantity }}
      </div>
    </div>
  </div>
</div>
```

### C4. Sửa Tier Header — Hiển thị trạng thái active chính xác

Trong phần `<!-- Tier Header -->`, thay biến `selectedItemId` và `canPlaceInTier` thành `activeSelection`:

```html
<!-- Tier Header click/contextmenu -->
<div
  class="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 cursor-pointer group select-none"
  @click="handleTierClick(tierIdx, $event)"
  @contextmenu.prevent="handleTierRightClick(tierIdx)"
>
  <!-- ...nội dung tier như cũ... -->

  <!-- Thay canPlaceInTier(tierIdx) bằng: -->
  <span
    v-if="activeSelection && canPlaceInTier(tierIdx)"
    class="text-[10px] text-indigo-400 font-black uppercase tracking-widest animate-pulse"
  >
    Click: Đặt hàng
  </span>
</div>
```

Sửa computed `canPlaceInTier`:

```typescript
const canPlaceInTier = (tierIndex: number): boolean => {
  if (!activeSelection || !activeShelf.value) return false
  if (activeShelf.value.role === 'display_case') return true
  const tier = activeShelf.value.tiers[tierIndex]
  if (tier.itemId === null) return true
  if (tier.itemId === activeSelection.itemId) return tier.slots.length < tier.maxSlots
  return false
}
```

---

## Phase D: Pocket Modal + Gacha Overlay Rewrite

### D1. Tạo `PocketModal.vue`

**File:** `src/features/inventory/components/PocketModal.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerPocketStore } from '../store/playerPocketStore'
import { useInventoryStore } from '../store/inventoryStore'
import { useApiStore } from '../store/apiStore'
import { getPackVisuals, getBoxVisuals } from '../config/assetRegistry'

const pocketStore = usePlayerPocketStore()
const inventoryStore = useInventoryStore()
const apiStore = useApiStore()

function getImageUrl(entry: any): string {
  const setId = entry.sourceSetId ?? entry.itemId.replace('pack_', '').replace('box_', '')
  return entry.type === 'pack'
    ? getPackVisuals(setId).front
    : getBoxVisuals(setId).front
}

async function openPack(itemId: string) {
  const taken = pocketStore.removeFromPocket(itemId, 1)
  if (taken <= 0) return

  // Cộng vào shopInventory tạm để tearPack hoạt động (tearPack trừ 1 từ shopInventory)
  if (!inventoryStore.shopInventory[itemId]) inventoryStore.shopInventory[itemId] = 0
  inventoryStore.shopInventory[itemId] += 1

  await inventoryStore.tearPack(itemId)
  // Khi PackOpeningOverlay mở, tự đóng PocketModal để không chồng UI
  pocketStore.closePocketModal()
}

function unboxItem(itemId: string) {
  const entry = pocketStore.pocket[itemId]
  if (!entry || entry.type !== 'box') return

  const shopItem = inventoryStore.shopItems[itemId]
  if (!shopItem?.contains) return

  const taken = pocketStore.removeFromPocket(itemId, 1)
  if (taken <= 0) return

  const innerItemId = shopItem.contains.itemId
  const innerAmount = shopItem.contains.amount
  const innerItem = inventoryStore.shopItems[innerItemId]

  pocketStore.addToPocket({
    itemId: innerItemId,
    name: innerItem?.name ?? innerItemId,
    type: 'pack',
    quantity: innerAmount,
    sourceSetId: innerItem?.sourceSetId,
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="pocket-modal">
      <div
        v-if="pocketStore.showPocketModal"
        class="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        @click.self="pocketStore.closePocketModal()"
      >
        <div class="bg-gray-900 border-2 border-yellow-500/40 rounded-2xl w-full max-w-lg shadow-2xl shadow-yellow-500/10 overflow-hidden">

          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 bg-yellow-900/20 border-b border-yellow-500/30">
            <h2 class="text-xl font-black text-yellow-300 flex items-center gap-3">
              🎒 Túi Ba Lô
              <span class="text-sm font-normal text-yellow-500">({{ pocketStore.totalItems }} vật phẩm)</span>
            </h2>
            <button
              @click="pocketStore.closePocketModal()"
              class="text-yellow-500/60 hover:text-yellow-300 text-2xl font-bold transition-colors"
            >✕</button>
          </div>

          <!-- Empty State -->
          <div v-if="pocketStore.isEmpty" class="flex flex-col items-center justify-center py-16 text-gray-600">
            <span class="text-5xl mb-4">🎒</span>
            <p class="font-bold">Túi trống!</p>
            <p class="text-sm mt-1">Hãy nhặt thùng hàng và bấm [R] để bóc.</p>
          </div>

          <!-- Item List -->
          <div v-else class="p-4 space-y-3 max-h-[60vh] overflow-y-auto custom-scroll">
            <div
              v-for="entry in pocketStore.pocketList"
              :key="entry.itemId"
              class="flex items-center gap-4 bg-gray-800/60 border border-gray-700/40 rounded-xl p-3 hover:border-yellow-500/30 transition-all group"
            >
              <!-- Ảnh -->
              <div class="w-14 h-20 flex-shrink-0 bg-slate-900 rounded-lg overflow-hidden border border-slate-700/50">
                <img
                  :src="getImageUrl(entry)"
                  class="w-full h-full object-contain"
                  @error="(e) => (e.target as HTMLImageElement).src = ''"
                />
              </div>

              <!-- Info -->
              <div class="flex-grow min-w-0">
                <p class="font-bold text-sm text-white truncate">{{ entry.name }}</p>
                <p class="text-xs text-gray-500 uppercase font-medium mt-0.5">{{ entry.type }}</p>
                <p class="text-xs text-yellow-400 font-mono mt-1">x{{ entry.quantity }}</p>
              </div>

              <!-- Actions -->
              <div class="flex flex-col gap-2 shrink-0">
                <button
                  v-if="entry.type === 'pack'"
                  @click="openPack(entry.itemId)"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  ✨ Mở Pack
                </button>
                <button
                  v-if="entry.type === 'box'"
                  @click="unboxItem(entry.itemId)"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                >
                  📦 Xé Hộp
                </button>
              </div>
            </div>
          </div>

          <!-- Footer hint -->
          <div class="px-6 py-3 border-t border-gray-700/50 text-center text-xs text-gray-600">
            Hàng trong Túi không mất khi thoát game • Tự động lưu
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pocket-modal-enter-active, .pocket-modal-leave-active {
  transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}
.pocket-modal-enter-from, .pocket-modal-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(20px);
}
.custom-scroll::-webkit-scrollbar { width: 6px; }
.custom-scroll::-webkit-scrollbar-track { background: rgba(17, 24, 39, 0.5); }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(234, 179, 8, 0.4); border-radius: 4px; }
</style>
```

### D2. Thêm nút Ba Lô vào `UIOverlay.vue`

Trong phần footer actions của Shop Manager panel (cạnh các nút SHOP, BUILD, CONFIG):

```html
<!-- Thêm sau nút CartButton -->
<button
  @click="gameStore.openPocketModal()"
  class="relative bg-yellow-600 hover:bg-yellow-500 text-white rounded-full
         w-12 h-12 flex items-center justify-center shadow-lg transition-colors pointer-events-auto"
  title="Túi Ba Lô (hàng đã bóc thùng)"
>
  🎒
  <span
    v-if="!gameStore.playerPocketList?.length === 0"
    class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black
           w-5 h-5 rounded-full flex items-center justify-center border-2 border-white"
  >
    {{ Object.keys(gameStore.playerPocket ?? {}).length }}
  </span>
</button>
```

### D3. Đăng ký `PocketModal` trong `App.vue`

```typescript
// Thêm import
import PocketModal from './features/inventory/components/PocketModal.vue'

// Thêm vào stores init (onMounted):
const pocketStore = usePlayerPocketStore() // import { usePlayerPocketStore }

// Thêm vào saveCallback subscriptions:
pocketStore.$subscribe(saveCallback, { deep: true })
```

```html
<!-- Trong <template>, sau <HoldingHandHUD /> -->
<PocketModal />
```

### D4. Đại tu `PackOpeningOverlay.vue` — Spread Animation & Quick Actions

**Xóa hoàn toàn phần Phase 2 hiện tại.** Thay bằng hệ thống sau:

#### D4.1 Logic mới trong `<script setup>`:

```typescript
// Thêm vào top của <script setup>
import { usePlayerPocketStore } from '../../inventory/store/playerPocketStore'
import { useDeliveryStore } from '../../inventory/store/deliveryStore'

// State mới cho card actions
const cardActions = ref<Record<number, 'binder' | 'sell' | null>>({})
const collectedCards = ref<Set<number>>(new Set())

// Khi phase chuyển sang cards_visible, reset actions
watch(() => inventoryStore.packPhase, (phase) => {
  if (phase === 'cards_visible') {
    cardActions.value = {}
    collectedCards.value = new Set()
    flipped.value = new Array(inventoryStore.currentPack.length).fill(false)
    revealClasses.value = new Array(inventoryStore.currentPack.length).fill('')
  }
})

// Cất vào Binder
function collectToBinder(index: number) {
  cardActions.value[index] = 'binder'
  collectedCards.value.add(index)
  if (isAllDecided()) finalizeCollection()
}

// Set giá bán (mở SetPriceModal overlay)
function setCardForSell(index: number, card: any) {
  cardActions.value[index] = 'sell'
  collectedCards.value.add(index)
  // Mở SetPriceModal với thông tin card
  // Dùng deliveryStore.openSetPrice
  const deliveryStore = useDeliveryStore()
  deliveryStore.openSetPrice({
    shelfId: 'pocket_sell_staging', // Placeholder — SetPriceModal sẽ cần handle case này
    tierIndex: 0,
    itemId: card.id,
    name: card.name,
    imageUrl: card.image ? `${card.image}/high.webp` : '',
    currentPrice: getRawPrice(card) * 1.2,
    marketPrice: getRawPrice(card),
    buyPrice: getRawPrice(card) * 0.7,
    isSingleCard: true,
  })
  if (isAllDecided()) finalizeCollection()
}

function isAllDecided(): boolean {
  return inventoryStore.currentPack.every((_, i) => collectedCards.value.has(i))
}

// Collect all to binder at once
function collectAllToBinder() {
  stopAutoReveal()
  inventoryStore.currentPack.forEach((_, i) => {
    if (!collectedCards.value.has(i)) {
      cardActions.value[i] = 'binder'
      collectedCards.value.add(i)
    }
  })
  finalizeCollection()
}

function finalizeCollection() {
  stopAutoReveal()
  inventoryStore.closePackOpening()
}
```

#### D4.2 Thay thế template Phase 2 (cards_visible):

```html
<!-- PHASE 2: CARDS — Spread Layout -->
<div v-else-if="phase === 'cards_visible'" class="cards-phase" key="cards">
  <h2 class="cards-title">⭐ Kết quả mở Pack ⭐</h2>

  <!-- Spread Row -->
  <div class="spread-row">
    <div
      v-for="(card, index) in cards"
      :key="index"
      class="spread-card-wrapper"
      :class="[
        revealClasses[index],
        { 'is-collected': collectedCards.has(index) }
      ]"
      :style="{
        '--card-index': index,
        '--total': cards.length,
        '--rarity-glow': flipped[index] ? getRarityConfig(card?.rarity).glowColor : 'transparent'
      }"
    >
      <!-- Card Visual -->
      <div
        class="spread-card"
        @click="flipped[index] ? undefined : flipCard(index)"
        :style="{ cursor: flipped[index] ? 'default' : 'pointer' }"
      >
        <PokemonCard3D
          :card="card"
          :is-back="!flipped[index]"
          :is-reverse="card.isReverse || false"
          width="100%"
        />
      </div>

      <!-- Quick Actions — chỉ hiện sau khi lật -->
      <Transition name="action-slide">
        <div v-if="flipped[index] && !collectedCards.has(index)" class="card-quick-actions">
          <div class="card-price-display">{{ getMarketPrice(card) }}</div>
          <button
            @click="collectToBinder(index)"
            class="action-btn action-binder"
            title="Cất vào Binder cá nhân"
          >
            🗂️ Binder
          </button>
          <button
            @click="setCardForSell(index, card)"
            class="action-btn action-sell"
            title="Đặt giá bán"
          >
            💰 Bán
          </button>
        </div>
        <div v-else-if="collectedCards.has(index)" class="card-collected-badge">
          <span>{{ cardActions[index] === 'binder' ? '🗂️ Đã cất' : '💰 Bán' }}</span>
        </div>
      </Transition>
    </div>
  </div>

  <!-- Controls Bar -->
  <div class="controls-panel">
    <div class="controls-buttons">
      <button
        class="ctrl-btn btn-auto"
        :class="{ 'btn-active': isAutoRevealing }"
        :disabled="allFlipped"
        @click="isAutoRevealing ? stopAutoReveal() : startAutoReveal()"
      >
        {{ isAutoRevealing ? '⏸ Dừng' : '▶ Auto-Reveal' }}
      </button>
      <button class="ctrl-btn btn-reveal" :disabled="allFlipped" @click="revealAll">
        ✨ Reveal All
      </button>
      <Transition name="collect-appear">
        <button
          v-if="allFlipped && collectedCards.size < cards.length"
          class="ctrl-btn btn-collect"
          @click="collectAllToBinder"
        >
          🎒 Thu thập tất cả → Binder
        </button>
      </Transition>
    </div>
  </div>
</div>
```

#### D4.3 CSS Keyframes cho Spread Animation:

```css
/* Thêm vào <style scoped> của PackOpeningOverlay.vue */

/* ── SPREAD ROW LAYOUT ── */
.cards-phase {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  width: 100%;
  height: 100%;
  padding: 2rem 1rem;
}

.spread-row {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 1.5rem;
  padding: 1rem 2rem;
  flex-wrap: nowrap;
}

/* ── SPREAD CARD WRAPPER ── */
.spread-card-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: clamp(120px, 11vw, 180px);
  position: relative;

  /* FLY IN: từng lá bay từ trung tâm ra vị trí */
  animation:
    card-deal-in 0.6s cubic-bezier(0.19, 1, 0.22, 1) both,
    card-fan-settle 0.4s cubic-bezier(0.19, 1, 0.22, 1) 0.5s both;
  animation-delay:
    calc(var(--card-index) * 100ms),
    calc(var(--card-index) * 100ms + 200ms);
}

@keyframes card-deal-in {
  0% {
    opacity: 0;
    transform: translateY(200px) scale(0.5) rotate(0deg);
    filter: blur(8px);
  }
  60% { opacity: 1; filter: blur(0); }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1) rotate(0deg);
  }
}

/* Sau khi bay vào, các lá tỏa ra nhẹ như cầm trên tay */
@keyframes card-fan-settle {
  from {
    transform: translateY(0) rotate(0deg);
  }
  to {
    transform:
      translateY(calc(var(--card-index) * -4px))
      rotate(calc((var(--card-index) - (var(--total) - 1) / 2) * 3deg));
  }
}

/* Hover lift effect */
.spread-card-wrapper:hover {
  transform: translateY(-20px) rotate(0deg) !important;
  z-index: 10;
  transition: transform 0.2s ease;
}

/* Card đã collected → thu nhỏ + mờ */
.spread-card-wrapper.is-collected {
  opacity: 0.5;
  transform: scale(0.9) !important;
  transition: all 0.3s ease;
}

/* ── CARD INNER ── */
.spread-card {
  width: 100%;
  border-radius: 10px;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.08),
    0 20px 40px rgba(0,0,0,0.5),
    0 0 30px var(--rarity-glow);
  transition: box-shadow 0.4s ease;
}

/* ── QUICK ACTIONS ── */
.card-quick-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  width: 100%;
}

.card-price-display {
  font-size: 13px;
  font-weight: 900;
  color: #34d399;
  background: rgba(0,0,0,0.6);
  padding: 2px 10px;
  border-radius: 20px;
  border: 1px solid rgba(52, 211, 153, 0.3);
}

.action-btn {
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.action-btn:hover { opacity: 0.85; transform: scale(1.05); }

.action-binder {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white;
}

.action-sell {
  background: linear-gradient(135deg, #059669, #10b981);
  color: white;
}

/* ── COLLECTED BADGE ── */
.card-collected-badge {
  margin-top: 10px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  text-align: center;
  padding: 4px 8px;
  background: rgba(0,0,0,0.4);
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
}

/* ── TRANSITIONS ── */
.action-slide-enter-active, .action-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.action-slide-enter-from, .action-slide-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.9);
}

/* ── MULTI-SPIN ANIMATIONS (giữ nguyên từ bản cũ) ── */
.flip-extra-spin :deep(.card__rotator) {
  animation: extra-spin 1.0s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
.flip-multi-spin :deep(.card__rotator) {
  animation: multi-spin 1.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
.flip-ghost-spin :deep(.card__rotator) {
  animation: ghost-spin 2.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes extra-spin {
  0% { transform: rotateY(180deg); }
  50% { transform: rotateY(540deg) scale(1.1); }
  100% { transform: rotateY(0deg) scale(1); }
}
@keyframes multi-spin {
  0% { transform: rotateY(180deg); }
  33% { transform: rotateY(540deg) scale(1.05); }
  66% { transform: rotateY(900deg) scale(1.15); }
  100% { transform: rotateY(0deg) scale(1); }
}
@keyframes ghost-spin {
  0% { transform: rotateY(180deg); }
  25% { transform: rotateY(540deg) scale(1.1); }
  50% { transform: rotateY(900deg) scale(1.2); }
  75% { transform: rotateY(1260deg) scale(1.1); }
  100% { transform: rotateY(0deg) scale(1); }
}
```

---

## Checklist Triển khai (Implementation Order)

Thực hiện **đúng thứ tự** để tránh break existing code:

```
[ ] Phase A1 — Tạo playerPocketStore.ts
[ ] Phase A2 — Cập nhật gameStore.ts (getters + actions delegation)
[ ] Phase A3 — Cập nhật saveGame() và loadSave()

[ ] Phase B1 — Thêm keyR, method unpackCarriedBox() vào DeliveryManager.ts
[ ] Phase B2 — Sửa handleShelfInteraction() → chỉ mở UI
[ ] Phase B3 — Sửa updateHintText() → check isAnyModalOpen
[ ] Phase B4 — Verify thứ tự update() trong MainScene.ts

[ ] Phase C1 — Thêm pocketStore + activeSelection vào ShelfManagementMenu.vue
[ ] Phase C2 — Rewrite handleTierClick() và handleTierRightClick()
[ ] Phase C3 — Sửa template cột trái (Pocket section)
[ ] Phase C4 — Cập nhật canPlaceInTier() và tier header bindings

[ ] Phase D1 — Tạo PocketModal.vue
[ ] Phase D2 — Thêm nút 🎒 vào UIOverlay.vue
[ ] Phase D3 — Đăng ký PocketModal trong App.vue
[ ] Phase D4 — Rewrite PackOpeningOverlay.vue (script + template + CSS)
```

---

## Ghi chú & Caveats quan trọng

### Về `shopInventory` (giữ nguyên hay bỏ?)

`shopInventory` trong `inventoryStore` **KHÔNG bị xóa**. Nó vẫn được dùng để:
- Kế toán số liệu (tracking tổng hàng tồn)
- Legacy compatibility với ShelfManagementMenu section 2 (kho shop)
- Backup flow khi Player mua từ OnlineShop → Cart → DeliveryStore → spawn box

Điểm thay đổi: **Thùng hàng vật lý PHẢI qua [R] → Pocket** thay vì tự động vào shopInventory.

### Về `playerHandStore.ts` (không xóa, giữ để tương thích)

`playerHandStore` vẫn tồn tại nhưng không còn là trung tâm. Nó vẫn có thể dùng cho Staff AI (nhân viên cầm thùng). Trong ShelfManagementMenu, thay thế logic `handStore` bằng `pocketStore`.

### Về PocketModal + tearPack compatibility

`inventoryStore.tearPack()` hiện tại trừ 1 từ `shopInventory`. Để tương thích, khi Player click "Mở Pack" từ PocketModal:

```
1. pocketStore.removeFromPocket(itemId, 1)  // lấy khỏi túi
2. inventoryStore.shopInventory[itemId] += 1 // thêm tạm vào kho
3. await inventoryStore.tearPack(itemId)     // tearPack trừ đi 1 → xé pack
```

Flow này hơi vòng vèo nhưng đảm bảo không cần sửa `tearPack()`. Về lâu dài, có thể refactor `tearPack()` nhận packId + bỏ qua shopInventory check.

### Về HintText keyR

Nên thêm vào HintText khi đang cầm thùng: `[R] Bóc thùng → Túi`. Điều này dạy Player phím mới một cách tự nhiên.

---

## Diagram Luồng Dữ liệu Sau Overhaul

```
CartStore.checkout()
    ↓
DeliveryStore.scheduleDelivery()
    ↓
DeliveryManager.spawnBox() [Phaser]
    ↓ [F] Player nhặt thùng
DeliveryStore.carriedBox = box
    ↓ [R] Bóc thùng
playerPocketStore.pocket[itemId] += quantity
    ↓ Mở 🎒 PocketModal
Player chọn Pack → openPack(itemId)
    ↓
PackOpeningOverlay → Spread Animation
    ↓ Click lật từng lá
Quick Actions: [Binder] hoặc [Bán]
    ↓ [Binder]
inventoryStore.personalBinder[cardId]++
    ↓ [Bán]
deliveryStore.openSetPrice() → SetPriceModal
Player nhập giá → Kệ bán được định giá
```

```
playerPocketStore.pocket[itemId] (Pack)
    ↓ Mở ShelfManagementMenu [E] gần kệ
Chọn Pack từ Pocket section
    ↓ Click tầng kệ
pocketStore.removeFromPocket(1)
furnitureStore.fillTierFromHand()
    ↓ openPriceEditor() nếu chưa có giá
SetPriceModal → inventoryStore.shopItems[id].sellPrice = X
```