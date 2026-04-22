<script setup lang="ts">
import { onMounted } from 'vue'
import { AppConfig } from './game/config/AppConfig'
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
import HoldingHandHUD from './features/inventory/components/HoldingHandHUD.vue'
import TradeInModal from './features/inventory/components/TradeInModal.vue'
import { useGameStore } from './features/shop-ui/store/gameStore'
import GradingServiceApp from './features/grading/components/GradingServiceApp.vue'
import GradingReveal from './features/grading/components/GradingReveal.vue'
import { useGradingStore } from './features/grading/store/gradingStore'
import { useEventStore } from './features/events/store/eventStore'
import { useUIStore } from './features/shop-ui/store/uiStore'
import ManageEventApp from './features/events/components/ManageEventApp.vue'

import { useStatsStore } from './features/stats/store/statsStore'
import { useInventoryStore } from './features/inventory/store/inventoryStore'
import { useFurnitureStore } from './features/furniture/store/furnitureStore'
import { useCustomerStore } from './features/customer/store/customerStore'
import { useDeliveryStore } from './features/inventory/store/deliveryStore'
import { usePlayerHandStore } from './features/inventory/store/playerHandStore'
import { useTradeInStore } from './features/inventory/store/tradeInStore'

const store = useGameStore()
const statsStore = useStatsStore()
const inventoryStore = useInventoryStore()
const furnitureStore = useFurnitureStore()
const customerStore = useCustomerStore()
const deliveryStore = useDeliveryStore()
const playerHandStore = usePlayerHandStore()
const tradeInStore = useTradeInStore()
const gradingStore = useGradingStore()
const eventStore = useEventStore()
const uiStore = useUIStore()


onMounted(() => {
  store.loadSave()
  
  // Subscribe vào TẤT CẢ store con để auto-save
  const saveCallback = () => {
     if (AppConfig.GAME.SETTINGS.AUTO_SAVE) {
        store.saveGame()
     }
  }

  statsStore.$subscribe(saveCallback, { deep: true })
  inventoryStore.$subscribe(saveCallback, { deep: true })
  furnitureStore.$subscribe(saveCallback, { deep: true })
  customerStore.$subscribe(saveCallback, { deep: true })
  deliveryStore.$subscribe(saveCallback, { deep: true })
  playerHandStore.$subscribe(saveCallback, { deep: true })
  tradeInStore.$subscribe(saveCallback, { deep: true })
  gradingStore.$subscribe(saveCallback, { deep: true })
  eventStore.$subscribe(saveCallback, { deep: true })

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
    <HoldingHandHUD />
    <TradeInModal />
    <GradingServiceApp :is-open="gradingStore.showGradingApp" @close="gradingStore.setShowGradingApp(false)" />
    <GradingReveal />
    <ManageEventApp :is-open="uiStore.showManageEvent" @close="uiStore.showManageEvent = false" />
  </div>

</template>
