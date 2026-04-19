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
