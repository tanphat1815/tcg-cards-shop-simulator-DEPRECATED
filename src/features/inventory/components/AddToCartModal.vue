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
