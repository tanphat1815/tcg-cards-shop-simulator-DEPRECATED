<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerHandStore } from '../store/playerHandStore'
const handStore = usePlayerHandStore()

const item = computed(() => handStore.item)
const isEmpty = computed(() => handStore.isEmpty)


const itemLabel = computed(() => {
  if (!item.value) return ''
  return item.value.name
})

const quantityLabel = computed(() => {
  if (!item.value) return ''
  return `x${item.value.quantity}`
})

const icon = computed(() => {
  if (!item.value) return ''
  return item.value.type === 'pack' ? '🎁' : '📦'
})
</script>

<template>
  <Transition name="slide-up">
    <div v-if="!isEmpty" 
      class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
      <div class="bg-gray-900/90 backdrop-blur-md border-2 border-indigo-500/50 rounded-2xl px-6 py-3 flex items-center gap-4 shadow-2xl shadow-indigo-500/20">
        <div class="flex flex-col items-center">
          <span class="text-3xl drop-shadow-lg">{{ icon }}</span>
          <span class="text-[10px] font-black text-indigo-400 uppercase tracking-tighter mt-1">HOLDING</span>
        </div>
        
        <div class="h-10 w-[2px] bg-gray-700/50"></div>
        
        <div class="flex flex-col">
          <div class="flex items-center gap-2">
            <span class="text-lg font-black text-white leading-none">{{ itemLabel }}</span>
            <span class="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full border border-indigo-400/50">
              {{ quantityLabel }}
            </span>
          </div>
          <p class="text-[11px] text-gray-400 font-medium mt-1">
            Bấm <span class="text-indigo-400 font-bold">[E]</span> vào kệ để đặt hàng hoặc <span class="text-indigo-400 font-bold">[Q]</span> để vứt (chưa hỗ trợ)
          </p>
        </div>

        <!-- Progress Indicator for multiple items (Packs) -->
        <div v-if="item?.type === 'pack'" class="flex gap-1 ml-2">
          <div v-for="i in 8" :key="i" 
            class="w-2 h-2 rounded-full border border-gray-700 transition-all duration-300"
            :class="i <= (item?.quantity || 0) ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] scale-110' : 'bg-gray-800'">
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 40px);
}
</style>
