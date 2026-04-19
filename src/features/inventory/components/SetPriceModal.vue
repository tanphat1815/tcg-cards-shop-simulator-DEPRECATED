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
  customPrice.value = parseFloat((customPrice.value * (1 + pct / 100)).toFixed(2))
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
