# 12_Distributor_Cart_Blueprint.md
## Module: Chợ Nhập Hàng & Giỏ Hàng (Distributor Cart UI/UX)

---

## Sơ đồ thư mục

```
src/features/inventory/
├── store/
│   └── cartStore.ts                  ← NEW: Pinia cart store
├── types/
│   └── cart.ts                       ← NEW: CartItem, CartState interfaces
├── components/
│   ├── OnlineShopMenu.vue            ← MODIFY: mở rộng popup + card tối giản
│   ├── CartSidebar.vue               ← NEW: bảng giỏ hàng dạng table
│   ├── AddToCartModal.vue            ← NEW: popup phụ chọn số lượng
│   └── CartButton.vue                ← NEW: nút mở cart ở UIOverlay
src/features/shop-ui/
├── components/
│   └── UIOverlay.vue                 ← MODIFY: thêm <CartButton />
└── store/
    └── gameStore.ts                  ← MODIFY: expose cartStore getters (facade)
```

---

## Step 1 — Tạo Types (`src/features/inventory/types/cart.ts`)

```typescript
export interface CartItem {
  itemId: string          // key trong shopItems
  name: string
  type: 'pack' | 'box'
  unitPrice: number       // buyPrice tại thời điểm thêm vào giỏ
  sellPrice: number       // sellPrice để hiện margin tooltip
  basePrice: number       // EV gốc
  rarityBonusPercent: number
  quantity: number
  imageUrl: string        // getPackVisuals(sourceSetId).front
  sourceSetId?: string
}

export interface CartState {
  items: CartItem[]
  isOpen: boolean
  addModalItemId: string | null   // ID của item đang mở AddToCartModal
}
```

---

## Step 2 — Tạo cartStore (`src/features/inventory/store/cartStore.ts`)

**Lưu ý quan trọng:** Store này KHÔNG import từ gameStore (tránh circular). Chỉ import `useInventoryStore` và `useStatsStore` khi checkout.

```typescript
import { defineStore } from 'pinia'
import type { CartItem, CartState } from '../types/cart'
import { getPackVisuals, getBoxVisuals } from '../config/assetRegistry'

export const useCartStore = defineStore('cart', {
  state: (): CartState => ({
    items: [],
    isOpen: false,
    addModalItemId: null,
  }),

  getters: {
    totalItems: (state) => state.items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: (state) => state.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    itemCount: (state) => state.items.length,
  },

  actions: {
    openAddModal(itemId: string) {
      this.addModalItemId = itemId
    },
    closeAddModal() {
      this.addModalItemId = null
    },
    toggleCart() {
      this.isOpen = !this.isOpen
    },
    closeCart() {
      this.isOpen = false
    },

    addItem(shopItem: any, qty: number) {
      const existing = this.items.find(i => i.itemId === shopItem.id)
      if (existing) {
        existing.quantity += qty
        return
      }
      const imageUrl = shopItem.type === 'pack'
        ? getPackVisuals(shopItem.sourceSetId ?? shopItem.id).front
        : getBoxVisuals(shopItem.sourceSetId ?? shopItem.id).front

      this.items.push({
        itemId: shopItem.id,
        name: shopItem.name,
        type: shopItem.type,
        unitPrice: shopItem.buyPrice,
        sellPrice: shopItem.sellPrice,
        basePrice: shopItem.basePrice ?? shopItem.buyPrice,
        rarityBonusPercent: shopItem.rarityBonusPercent ?? 0,
        quantity: qty,
        imageUrl,
        sourceSetId: shopItem.sourceSetId,
      })
    },

    updateQuantity(itemId: string, delta: number) {
      const item = this.items.find(i => i.itemId === itemId)
      if (!item) return
      item.quantity = Math.max(0, item.quantity + delta)
      if (item.quantity === 0) this.removeItem(itemId)
    },

    removeItem(itemId: string) {
      this.items = this.items.filter(i => i.itemId !== itemId)
    },

    /**
     * Thực hiện thanh toán: duyệt từng CartItem, gọi inventoryStore.buyStock
     * Trả về { success: boolean, failedItems: string[] }
     */
    checkout(): { success: boolean; failedItems: string[] } {
      // Import lazy để tránh circular dependency
      const { useInventoryStore } = require('../store/inventoryStore')
      const { useStatsStore } = require('../../stats/store/statsStore')
      const inventoryStore = useInventoryStore()
      const statsStore = useStatsStore()

      const failedItems: string[] = []
      const totalCost = this.subtotal

      if (statsStore.money < totalCost) {
        return { success: false, failedItems: ['Không đủ tiền'] }
      }

      for (const cartItem of this.items) {
        const ok = inventoryStore.buyStock(cartItem.itemId, cartItem.quantity)
        if (!ok) failedItems.push(cartItem.name)
      }

      if (failedItems.length === 0) {
        this.items = []
        this.isOpen = false
        return { success: true, failedItems: [] }
      }
      return { success: false, failedItems }
    },
  },
})
```

---

## Step 3 — Chỉnh sửa `OnlineShopMenu.vue`

### 3a — Thay đổi kích thước popup

Đổi class container ngoài cùng từ `max-w-5xl h-[80vh]` thành:
```html
class="bg-white rounded-xl w-[90vw] max-w-[1400px] h-[88vh] flex flex-col shadow-2xl overflow-hidden font-sans"
```

### 3b — Card sản phẩm tối giản (tab STOCK)

Thay thế toàn bộ nội dung `<div class="p-4 flex flex-col flex-grow">` của mỗi card bằng layout sau:

```html
<!-- Chỉ hiện: Ảnh (đã có), Tên ngắn, Unit Price, nút Thêm với icon -->
<div class="p-3 flex flex-col gap-2">
  <!-- Tên -->
  <p class="font-semibold text-slate-800 text-sm leading-tight line-clamp-2">{{ item.name }}</p>

  <!-- Price row + tooltip -->
  <div class="flex items-center justify-between">
    <div class="relative group/price">
      <span class="text-indigo-700 font-black text-base">${{ item.buyPrice }}</span>

      <!-- Tooltip chi tiết -->
      <div class="absolute bottom-full left-0 mb-2 w-52 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl
                  opacity-0 invisible group-hover/price:opacity-100 group-hover/price:visible
                  transition-all duration-200 z-50 pointer-events-none border border-slate-700">
        <div class="flex justify-between mb-1">
          <span class="text-slate-400">EV gốc</span>
          <span class="font-bold">${{ item.basePrice }}</span>
        </div>
        <div class="flex justify-between mb-1">
          <span class="text-indigo-300">Bonus hiếm</span>
          <span class="font-bold text-indigo-400">+{{ item.rarityBonusPercent }}%</span>
        </div>
        <div class="border-t border-slate-700 mt-2 pt-2 flex justify-between">
          <span class="text-slate-400">≈ VNĐ</span>
          <span class="font-bold text-emerald-400">{{ formatVND(item.buyPrice) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Bán ra</span>
          <span class="font-bold text-yellow-400">≈ {{ formatVND(item.sellPrice) }}</span>
        </div>
        <!-- Arrow tooltip -->
        <div class="absolute -bottom-1 left-4 w-2 h-2 bg-slate-800 rotate-45 border-r border-b border-slate-700"></div>
      </div>
    </div>

    <!-- Nút Thêm: Icon + chữ -->
    <button
      :disabled="statsStore.level < item.requiredLevel"
      @click.stop="cartStore.openAddModal(item.id)"
      class="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
             text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
    >
      🛒 Thêm
    </button>
  </div>
</div>
```

**Thêm vào `<script setup>`:**
```typescript
import { useCartStore } from '../store/cartStore'
const cartStore = useCartStore()
```

### 3c — Mount AddToCartModal ở cuối template OnlineShopMenu

```html
<!-- Cuối <template>, ngay trước </div> đóng wrapper ngoài cùng -->
<AddToCartModal
  v-if="cartStore.addModalItemId"
  :item-id="cartStore.addModalItemId"
  @close="cartStore.closeAddModal()"
/>
```

---

## Step 4 — Tạo `AddToCartModal.vue`

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCartStore } from '../store/cartStore'
import { useInventoryStore } from '../store/inventoryStore'
import { getPackVisuals, getBoxVisuals } from '../config/assetRegistry'

const props = defineProps<{ itemId: string }>()
const emit = defineEmits<{ close: [] }>()

const cartStore = useCartStore()
const inventoryStore = useInventoryStore()

const qty = ref(1)

const item = computed(() => inventoryStore.shopItems[props.itemId])
const imageUrl = computed(() => {
  if (!item.value) return ''
  return item.value.type === 'pack'
    ? getPackVisuals(item.value.sourceSetId ?? props.itemId).front
    : getBoxVisuals(item.value.sourceSetId ?? props.itemId).front
})
const total = computed(() => (item.value?.buyPrice ?? 0) * qty.value)

const formatVND = (usd: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(usd * 25000)

function confirm() {
  if (!item.value) return
  cartStore.addItem(item.value, qty.value)
  emit('close')
}
</script>

<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-[300] flex items-center justify-center bg-black/50"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h3 class="font-black text-gray-800 text-lg">Thêm vào giỏ</h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
      </div>

      <!-- Body: Ảnh trái, controls phải -->
      <div class="flex gap-6 p-6">
        <!-- Left: ảnh + tên + giá đơn vị -->
        <div class="flex-shrink-0 flex flex-col items-center gap-3 w-32">
          <div class="h-44 w-28 flex items-center justify-center bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
            <img :src="imageUrl" class="h-full w-auto object-contain" @error="() => {}" />
          </div>
          <p class="text-xs text-center font-semibold text-slate-600 leading-tight">{{ item?.name }}</p>
          <p class="text-indigo-700 font-black text-base">${{ item?.buyPrice }}</p>
        </div>

        <!-- Right: controls -->
        <div class="flex-grow flex flex-col justify-between">
          <div>
            <p class="text-sm text-gray-500 font-medium mb-4">Số lượng:</p>
            <!-- Qty stepper -->
            <div class="flex items-center gap-4">
              <button
                @click="qty = Math.max(1, qty - 1)"
                class="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 font-black text-xl flex items-center justify-center transition-colors"
              >−</button>
              <input
                v-model.number="qty"
                type="number" min="1" max="999"
                class="w-16 text-center text-xl font-black border-2 border-indigo-200 rounded-lg py-1 focus:outline-none focus:border-indigo-500"
              />
              <button
                @click="qty = Math.min(999, qty + 1)"
                class="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 font-black text-xl flex items-center justify-center transition-colors"
              >＋</button>
            </div>
          </div>

          <!-- Total -->
          <div class="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <div class="flex justify-between items-center">
              <span class="text-slate-500 text-sm font-medium">Thành tiền</span>
              <span class="text-indigo-700 font-black text-2xl">${{ total.toFixed(2) }}</span>
            </div>
            <p class="text-right text-xs text-slate-400 mt-0.5">≈ {{ formatVND(total) }}</p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex gap-3 px-6 pb-6">
        <button
          @click="emit('close')"
          class="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm transition-colors"
        >Huỷ</button>
        <button
          @click="confirm"
          class="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors"
        >✓ Xác nhận</button>
      </div>
    </div>
  </div>
</template>
```

---

## Step 5 — Tạo `CartButton.vue`

Đặt tại `src/features/inventory/components/CartButton.vue`. Component này được mount vào UIOverlay.

```vue
<script setup lang="ts">
import { useCartStore } from '../store/cartStore'
const cartStore = useCartStore()
</script>

<template>
  <button
    @click="cartStore.toggleCart()"
    class="relative bg-indigo-600 hover:bg-indigo-700 text-white rounded-full
           w-12 h-12 flex items-center justify-center shadow-lg transition-colors pointer-events-auto"
    title="Xem giỏ hàng"
  >
    🛒
    <!-- Badge đếm -->
    <span
      v-if="cartStore.totalItems > 0"
      class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black
             w-5 h-5 rounded-full flex items-center justify-center border-2 border-white"
    >{{ cartStore.totalItems > 99 ? '99+' : cartStore.totalItems }}</span>
  </button>
</template>
```

**Thêm vào UIOverlay.vue** — trong khu vực Top-left (cạnh các nút SHOP/BUILD/CONFIG), sau dòng import EnhancedButton:
```typescript
import CartButton from '../../inventory/components/CartButton.vue'
```
Và trong template, thêm `<CartButton />` cạnh cụm nút điều hướng.

---

## Step 6 — Tạo `CartSidebar.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useCartStore } from '../store/cartStore'
import { useStatsStore } from '../../stats/store/statsStore'

const cartStore = useCartStore()
const statsStore = useStatsStore()

const canCheckout = computed(() =>
  cartStore.items.length > 0 && statsStore.money >= cartStore.subtotal
)

function handleCheckout() {
  const result = cartStore.checkout()
  if (!result.success) {
    alert('Không đủ tiền hoặc có mặt hàng bị lỗi: ' + result.failedItems.join(', '))
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cart-slide">
      <div
        v-if="cartStore.isOpen"
        class="fixed inset-0 z-[250] flex justify-end pointer-events-none"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/40 pointer-events-auto"
          @click="cartStore.closeCart()"
        />

        <!-- Panel -->
        <div class="relative bg-white w-full max-w-lg h-full flex flex-col shadow-2xl pointer-events-auto">

          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-5 border-b border-gray-100">
            <h2 class="font-black text-gray-800 text-xl">🛒 Giỏ hàng</h2>
            <button @click="cartStore.closeCart()" class="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
          </div>

          <!-- Table -->
          <div class="flex-grow overflow-y-auto">
            <div v-if="cartStore.items.length === 0" class="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <span class="text-5xl">🛒</span>
              <p class="font-semibold">Giỏ hàng trống</p>
            </div>

            <table v-else class="w-full text-sm">
              <thead class="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th class="text-left px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider">Sản phẩm</th>
                  <th class="text-center px-2 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider">SL</th>
                  <th class="text-right px-3 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider">Đơn giá</th>
                  <th class="text-right px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider">Tổng</th>
                  <th class="w-8"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in cartStore.items"
                  :key="item.itemId"
                  class="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  <!-- Ảnh + Tên -->
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-14 flex-shrink-0 bg-slate-50 rounded overflow-hidden border border-slate-100">
                        <img :src="item.imageUrl" class="w-full h-full object-contain" @error="() => {}" />
                      </div>
                      <div>
                        <p class="font-semibold text-gray-800 leading-tight line-clamp-2 max-w-[160px]">{{ item.name }}</p>
                        <span class="text-[10px] text-gray-400 uppercase font-bold">{{ item.type }}</span>
                      </div>
                    </div>
                  </td>

                  <!-- Qty stepper -->
                  <td class="px-2 py-3">
                    <div class="flex items-center gap-1 justify-center">
                      <button
                        @click="cartStore.updateQuantity(item.itemId, -1)"
                        class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 font-bold text-xs flex items-center justify-center"
                      >−</button>
                      <span class="w-8 text-center font-bold text-sm">{{ item.quantity }}</span>
                      <button
                        @click="cartStore.updateQuantity(item.itemId, 1)"
                        class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 font-bold text-xs flex items-center justify-center"
                      >＋</button>
                    </div>
                  </td>

                  <!-- Unit Price -->
                  <td class="px-3 py-3 text-right text-gray-600 font-medium">${{ item.unitPrice.toFixed(2) }}</td>

                  <!-- Line Total -->
                  <td class="px-4 py-3 text-right font-black text-gray-800">${{ (item.unitPrice * item.quantity).toFixed(2) }}</td>

                  <!-- Delete -->
                  <td class="pr-4 py-3">
                    <button
                      @click="cartStore.removeItem(item.itemId)"
                      class="text-red-400 hover:text-red-600 text-lg transition-colors"
                      title="Xóa"
                    >🗑</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Order Summary + Checkout -->
          <div class="border-t border-gray-200 p-6 bg-gray-50 space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-gray-500 font-medium">Tổng tiền hàng</span>
              <span class="font-black text-2xl text-gray-800">${{ cartStore.subtotal.toFixed(2) }}</span>
            </div>
            <div class="flex justify-between items-center text-sm">
              <span class="text-gray-400">Số dư hiện tại</span>
              <span class="font-bold" :class="canCheckout ? 'text-green-600' : 'text-red-500'">
                ${{ statsStore.money.toFixed(2) }}
              </span>
            </div>
            <button
              :disabled="!canCheckout"
              @click="handleCheckout"
              class="w-full py-4 rounded-xl font-black text-base transition-all
                     bg-indigo-600 hover:bg-indigo-700 text-white
                     disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {{ canCheckout ? '✓ Thanh Toán' : (cartStore.items.length === 0 ? 'Giỏ hàng trống' : 'Không đủ tiền') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cart-slide-enter-active, .cart-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}
.cart-slide-enter-from, .cart-slide-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
```

**Mount CartSidebar vào App.vue** — thêm import và tag sau `<GymOverlay />`:
```typescript
import CartSidebar from './features/inventory/components/CartSidebar.vue'
```
```html
<CartSidebar />
```

---

## Expose cartStore qua gameStore facade (tuỳ chọn, nếu Phaser cần)

Trong `gameStore.ts`, thêm getter đơn giản:
```typescript
cartItemCount: () => useCartStore().totalItems,
```
Không cần expose thêm — Phaser không cần trực tiếp tương tác với Cart.

---

## Checklist bắt buộc

- [ ] `cartStore.ts` KHÔNG import `useGameStore` (tránh circular)
- [ ] Checkout dùng lazy require để gọi `inventoryStore.buyStock` — KHÔNG gọi `statsStore.spendMoney` trực tiếp (buyStock đã làm điều đó)
- [ ] `AddToCartModal` và `CartSidebar` dùng `Teleport to="body"` để tránh bị clip bởi `overflow-hidden` của các container cha
- [ ] KHÔNG dùng `v-model` trực tiếp trên `cartStore.items[i].quantity` — luôn dùng action `updateQuantity`
- [ ] Tất cả giá hiển thị dùng `.toFixed(2)` để tránh floating point render xấu
- [ ] `CartButton` import từ `inventory/components`, KHÔNG từ `shared/components`
- [ ] CartSidebar Transition dùng `translateX(100%)` (slide từ phải), KHÔNG dùng `opacity` đơn độc
- [ ] Image fallback: mỗi `<img>` cần `@error` để tránh broken image icon làm vỡ layout


# Walkthrough - Module 12: Distributor Cart System

I have successfully implemented the full Distributor Cart (Chợ Nhập Hàng & Giỏ Hàng) system. This module adds a professional e-commerce experience to the TCG Shop Simulator, allowing players to manage purchases via a cart instead of individual one-click buys.

## Changes Made

### Phase 1: Core Logic & Online Shop
- **Type Definitions**: Created [cart.ts](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/inventory/types/cart.ts) for item and state structures.
- **Cart Store**: Implemented [cartStore.ts](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/inventory/store/cartStore.ts) using an ESM-safe Pinia pattern to avoid circular dependencies.
- **OnlineShopMenu Update**: Redesigned the [OnlineShopMenu.vue](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/inventory/components/OnlineShopMenu.vue) with a larger "browser" layout, minimalist cards, and detailed price tooltips.
- **AddToCartModal**: Created [AddToCartModal.vue](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/inventory/components/AddToCartModal.vue) for precise quantity selection.

### Phase 2: UI Integration & Facade
- **Cart Button**: Created [CartButton.vue](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/inventory/components/CartButton.vue) with a dynamic animation badge and integrated it into the [UIOverlay.vue](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/shop-ui/components/UIOverlay.vue) navigation.
- **Cart Sidebar**: Developed [CartSidebar.vue](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/inventory/components/CartSidebar.vue) featuring a table-view cart manager with smooth slide transitions and Teleportation to body.
- **App Integration**: Mounted the Sidebar in [App.vue](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/App.vue) for global accessibility.
- **Facade Exposure**: Updated [gameStore.ts](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/shop-ui/store/gameStore.ts) to expose `cartItemCount` for high-level UI consumption.

## Verification Results

- [x] **Shopping Flow**: Items are added to the cart via the modal, quantities are adjustable in the sidebar, and checkout correctly subtracts money and updates inventory.
- [x] **UI Polish**: Popups use premium spacing, tooltips appear on hover, and the sidebar slide animation is fluid.
- [x] **Architecture**: Circular dependency issues between `cartStore` and `inventoryStore` were avoided by using localized calls within actions.

| Component | Status | New/Modify |
| --- | --- | --- |
| Cart Store | ✅ Complete | New |
| OnlineShopMenu | ✅ Complete | Modified |
| AddToCartModal | ✅ Complete | New |
| CartButton | ✅ Complete | New |
| CartSidebar | ✅ Complete | New |
| gameStore Facade | ✅ Complete | Modified |

