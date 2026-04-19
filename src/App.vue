<script setup lang="ts">
import { onMounted } from 'vue'
import GameContainer from './features/shop-ui/components/GameContainer.vue'
import UIOverlay from './features/shop-ui/components/UIOverlay.vue'
import PackOpeningOverlay from './features/shop-ui/components/PackOpeningOverlay.vue'
import EndOfDayModal from './features/stats/components/EndOfDayModal.vue'
import BinderMenu from './features/inventory/components/BinderMenu.vue'
import ShelfManagementMenu from './features/furniture/components/ShelfManagementMenu.vue'
import OnlineShopMenu from './features/inventory/components/OnlineShopMenu.vue'
import DevModeMenu from './features/shop-ui/components/DevModeMenu.vue'
import BuildMenu from './features/furniture/components/BuildMenu.vue'
import SettingsModal from './features/shop-ui/components/SettingsModal.vue'
import CardDetailOverlay from './features/shop-ui/components/CardDetailOverlay.vue'
import BattleArena from './features/battle/components/BattleArena.vue'
import GymOverlay from './features/gym/components/GymOverlay.vue'
import CartSidebar from './features/inventory/components/CartSidebar.vue'
import SetPriceModal from './features/inventory/components/SetPriceModal.vue'
import { useGameStore } from './features/shop-ui/store/gameStore'
import { useStatsStore } from './features/stats/store/statsStore'
import { useInventoryStore } from './features/inventory/store/inventoryStore'
import { useFurnitureStore } from './features/furniture/store/furnitureStore'
import { useCustomerStore } from './features/customer/store/customerStore'

const store = useGameStore()
const statsStore = useStatsStore()
const inventoryStore = useInventoryStore()
const furnitureStore = useFurnitureStore()
const customerStore = useCustomerStore()

onMounted(() => {
  store.loadSave()
  
  // Subscribe vào TẤT CẢ store con để auto-save (Vì Facade không bắt được thay đổi trực tiếp)
  const saveCallback = () => store.saveGame()

  statsStore.$subscribe(saveCallback, { deep: true })
  inventoryStore.$subscribe(saveCallback, { deep: true })
  furnitureStore.$subscribe(saveCallback, { deep: true })
  customerStore.$subscribe(saveCallback, { deep: true })
})
</script>

<template>
  <div class="relative w-full h-screen overflow-hidden bg-gray-900">
    <GameContainer />
    <UIOverlay />
    <PackOpeningOverlay />
    <EndOfDayModal />
    <BinderMenu />
    <ShelfManagementMenu />
    <OnlineShopMenu />
    <DevModeMenu />
    <BuildMenu />
    <SettingsModal />
    <CardDetailOverlay />
    <!-- Battle Arena sử dụng Teleport nên sẽ tự render vào body -->
    <BattleArena />
    <GymOverlay />
    <CartSidebar />
    <SetPriceModal />
  </div>
</template>
