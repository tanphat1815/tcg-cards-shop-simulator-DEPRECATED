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
