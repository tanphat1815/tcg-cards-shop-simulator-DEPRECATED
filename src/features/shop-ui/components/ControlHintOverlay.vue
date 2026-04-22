<script setup lang="ts">
import { computed } from 'vue'
import { useDeliveryStore } from '../../inventory/store/deliveryStore'
import { useUIStore } from '../../shop-ui/store/uiStore'

const deliveryStore = useDeliveryStore()
const uiStore = useUIStore()

// Danh sách phím tắt cơ bản luôn hiển thị
const basicControls = [
  { key: 'WASD', desc: 'Di chuyển' },
  { key: 'B', desc: 'Mở Túi Ba lô' },
  { key: 'Tab', desc: 'Mở Menu Xây dựng' },
  { key: 'M', desc: 'Mở Shop Online' },
]

// Phím tắt ngữ cảnh (khi đang cầm thùng hoặc gần vật thể)
const contextControls = computed(() => {
  const hints = []
  
  if (uiStore.showShelfMenu) {
    hints.push({ key: 'Chuột trái', desc: 'Đặt hàng' })
    hints.push({ key: 'Chuột phải', desc: 'Dọn tầng (Rút vào Túi)' })
  } else if (deliveryStore.carriedBox) {
    hints.push({ key: 'F', desc: 'Thả thùng xuống' })
    hints.push({ key: 'R', desc: deliveryStore.carriedBox.type === 'furniture' ? 'Mở thùng đặt đồ' : 'Bóc thùng vào Túi' })
  }
  
  return hints
})

const isMenuOpen = computed(() => 
  (uiStore.showBinderMenu || uiStore.showBuildMenu || uiStore.showOnlineShop) && !uiStore.showShelfMenu
)
</script>

<template>
  <Transition name="slide-up">
    <!-- Ẩn hints khi đang mở menu lớn (Binder, Build, OnlineShop) nhưng hiện khi mở ShelfMenu -->
    <div v-if="!isMenuOpen || uiStore.showShelfMenu" class="fixed bottom-6 left-6 z-[260] flex flex-col gap-3 pointer-events-none">
      
      <!-- Contextual Hints (Nổi bật hơn) -->
      <div v-if="contextControls.length > 0" class="flex flex-col gap-2">
        <div 
          v-for="ctrl in contextControls" 
          :key="ctrl.key"
          class="flex items-center gap-3 bg-indigo-600/90 backdrop-blur-md px-4 py-2 rounded-xl border border-indigo-400/50 shadow-lg shadow-indigo-500/20"
        >
          <kbd class="min-w-[28px] h-7 flex items-center justify-center bg-white text-indigo-900 font-black rounded-lg shadow-sm text-sm">
            {{ ctrl.key }}
          </kbd>
          <span class="text-white font-bold text-sm tracking-wide">{{ ctrl.desc }}</span>
        </div>
      </div>

      <!-- Basic Controls (Mờ hơn) -->
      <div class="flex flex-wrap gap-2 max-w-[300px]">
        <div 
          v-for="ctrl in basicControls" 
          :key="ctrl.key"
          class="flex items-center gap-2 bg-gray-900/60 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10"
        >
          <kbd class="min-w-[20px] h-5 flex items-center justify-center bg-gray-200 text-gray-900 font-bold rounded px-1 text-[10px]">
            {{ ctrl.key }}
          </kbd>
          <span class="text-gray-300 text-[11px] font-medium">{{ ctrl.desc }}</span>
        </div>
      </div>

    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from, .slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

@keyframes bounce-subtle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
.animate-bounce-subtle {
  animation: bounce-subtle 2s infinite ease-in-out;
}
</style>
