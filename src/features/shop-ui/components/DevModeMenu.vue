<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStatsStore } from '../../stats/store/statsStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { useGameStore } from '../../shop-ui/store/gameStore'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'

const statsStore = useStatsStore()
const inventoryStore = useInventoryStore()
const gameStore = useGameStore()
const isOpen = ref(false)

const toggleDevMode = () => {
  isOpen.value = !isOpen.value
}

const addMoney = (amount: number) => {
  statsStore.addMoney(amount)
}

const addLevel = (levels: number) => {
  statsStore.level += levels
  statsStore.showLevelUpNext = true
}

const adjustTime = (minutes: number) => {
  statsStore.tickTime(minutes)
}

const nextDay = () => {
  statsStore.startNewDay(0)
}

const addRandomCards = async (criteria: { type?: string, rarity?: string, subtype?: string }) => {
  await inventoryStore.getRandomCardsByCriteria(criteria, 10)
}

const togglePause = () => {
  if (gameStore.isPaused) {
    gameStore.resumeGame()
  } else {
    gameStore.pauseGame()
  }
}

const isPaused = computed(() => gameStore.isPaused)
</script>

<template>
  <div class="fixed bottom-4 left-4 z-[9999] font-sans">
    <!-- Nút bật tắt Dev Mode -->
    <EnhancedButton
      variant="icon"
      size="md"
      :icon="{ name: 'settings' }"
      defaultText=""
      @click="toggleDevMode"
      title="Developer Mode"
    >
    </EnhancedButton>

    <!-- Bảng Dev Mode Menu -->
    <Transition name="slide-up">
      <div v-if="isOpen" class="absolute bottom-16 left-0 bg-gray-900 border-2 border-red-500 rounded-xl shadow-2xl p-0 w-80 text-white relative max-h-[80vh] overflow-y-auto custom-scrollbar">
        <EnhancedButton 
          variant="danger" 
          size="xs" 
          circle
          :icon="{ name: 'close' }" 
          @click="isOpen = false"
          title="Đóng Dev Mode"
          class="absolute top-2 right-2 z-30 shadow-red-500/40"
        />

        <div class="flex justify-between items-center px-4 py-3 bg-red-900/10 border-b border-gray-700/50 rounded-t-[0.7rem]">
          <h3 class="font-black text-red-500 text-lg flex items-center gap-2">
            <span>🔥</span> DEV MODE
          </h3>
        </div>
        
        <div class="p-4 space-y-4">
          <!-- Kinh tế -->
          <div class="space-y-2 border-b border-gray-700 pb-3">
             <div class="text-xs text-gray-400 uppercase font-bold">Kinh tế & Cấp độ</div>
             <div class="grid grid-cols-2 gap-2">
               <EnhancedButton variant="success" size="sm" @click="addMoney(1000)">+$1,000</EnhancedButton>
               <EnhancedButton variant="success" size="sm" @click="addMoney(50000)">+$50K</EnhancedButton>
               <EnhancedButton variant="info" size="sm" @click="addLevel(1)">+1 Level</EnhancedButton>
               <EnhancedButton variant="info" size="sm" @click="addLevel(10)">+10 Levels</EnhancedButton>
             </div>
          </div>

          <!-- Thời gian -->
          <div class="space-y-2 border-b border-gray-700 pb-3">
             <div class="text-xs text-gray-400 uppercase font-bold">Thời gian</div>
             <div class="grid grid-cols-2 gap-2">
               <EnhancedButton variant="primary" size="sm" @click="adjustTime(-30)">-30 Phút</EnhancedButton>
               <EnhancedButton variant="primary" size="sm" @click="adjustTime(30)">+30 Phút</EnhancedButton>
             </div>
             <EnhancedButton
               variant="warning"
               size="sm"
               fullWidth
               :icon="{ name: 'arrow-right' }"
               @click="nextDay"
             >
               Bỏ qua Ngày (Next Day)
             </EnhancedButton>
          </div>

          <!-- Add Cards -->
          <div class="space-y-2 border-b border-gray-700 pb-3">
             <div class="text-xs text-gray-400 uppercase font-bold">Add 10 Random Cards</div>
             
             <!-- Theo Hệ -->
             <div class="text-[10px] text-gray-500 uppercase mt-1">Theo Hệ (Types)</div>
             <div class="grid grid-cols-4 gap-1">
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ type: 'Fire' })">Lửa</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ type: 'Water' })">Nước</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ type: 'Grass' })">Cỏ</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ type: 'Lightning' })">Điện</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ type: 'Psychic' })">Siêu</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ type: 'Fighting' })">Đấm</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ type: 'Darkness' })">Tối</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ type: 'Metal' })">Thép</EnhancedButton>
             </div>

             <!-- Theo Rarity -->
             <div class="text-[10px] text-gray-500 uppercase mt-1">Theo Rarity</div>
             <div class="grid grid-cols-2 gap-1">
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ rarity: 'Rare' })">Rare</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ rarity: 'Secret Rare' })">Secret / Gold</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ rarity: 'Ultra Rare' })">Ultra Rare (V/EX)</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ rarity: 'Illustration Rare' })">Illu. Rare</EnhancedButton>
             </div>

             <!-- Theo Type đặc biệt -->
             <div class="text-[10px] text-gray-500 uppercase mt-1">Loại Đặc Biệt (Subtypes)</div>
             <div class="grid grid-cols-3 gap-1">
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ subtype: 'Holo' })">Holo</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ subtype: 'VMAX' })">VMAX</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ subtype: 'VSTAR' })">VSTAR</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ subtype: 'Full Art' })">Full Art</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ subtype: 'Shiny' })">Shiny</EnhancedButton>
               <EnhancedButton variant="outline" size="xs" @click="addRandomCards({ subtype: 'Radiant' })">Radiant</EnhancedButton>
             </div>
          </div>

          <!-- Game Control -->
          <div class="space-y-2 pb-1">
             <div class="text-xs text-gray-400 uppercase font-bold">Hệ thống</div>
             <EnhancedButton
               :variant="isPaused ? 'success' : 'danger'"
               size="sm"
               fullWidth
               :icon="{ name: isPaused ? 'play' : 'pause' }"
               @click="togglePause"
             >
               {{ isPaused ? 'Tiếp tục Game' : 'Stop Toàn bộ (Pause)' }}
             </EnhancedButton>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0,0,0,0.1);
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #ef4444;
  border-radius: 10px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.2s ease-out;
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
