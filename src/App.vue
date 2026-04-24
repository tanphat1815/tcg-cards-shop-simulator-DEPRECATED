<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
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
import CardDetailOverlay from './features/shop-ui/components/CardDetailOverlay.vue'
import BattleArena from './features/battle/components/BattleArena.vue'
import GymOverlay from './features/gym/components/GymOverlay.vue'
import SetPriceModal from './features/inventory/components/SetPriceModal.vue'
import HoldingHandHUD from './features/inventory/components/HoldingHandHUD.vue'
import TradeInModal from './features/inventory/components/TradeInModal.vue'
import { useGameStore } from './features/shop-ui/store/gameStore'
import GradingReveal from './features/grading/components/GradingReveal.vue'
import { useGradingStore } from './features/grading/store/gradingStore'
import { useEventStore } from './features/events/store/eventStore'
import AdminTablet from './features/shop-ui/components/AdminTablet.vue'
import CheckoutModal from './features/inventory/components/CheckoutModal.vue'
import PocketModal from './features/inventory/components/PocketModal.vue'
import SettingsModal from './features/shop-ui/components/SettingsModal.vue'

import { useStatsStore } from './features/stats/store/statsStore'
import { useInventoryStore } from './features/inventory/store/inventoryStore'
import { useFurnitureStore } from './features/furniture/store/furnitureStore'
import { useCustomerStore } from './features/customer/store/customerStore'
import { useDeliveryStore } from './features/inventory/store/deliveryStore'
import { useStaffStore } from './features/staff/store/staffStore'
import { usePlayerHandStore } from './features/inventory/store/playerHandStore'
import { useTradeInStore } from './features/inventory/store/tradeInStore'
import { usePlayerPocketStore } from './features/inventory/store/playerPocketStore'
import { eventBus, EVENTS } from './features/shared/EventBus'
import { WorldSimulationController } from './features/world/WorldSimulationController'

const store = useGameStore()
const statsStore = useStatsStore()
const inventoryStore = useInventoryStore()
const furnitureStore = useFurnitureStore()
const customerStore = useCustomerStore()
const deliveryStore = useDeliveryStore()
const staffStore = useStaffStore()
const playerHandStore = usePlayerHandStore()
const tradeInStore = useTradeInStore()
const gradingStore = useGradingStore()
const eventStore = useEventStore()
const pocketStore = usePlayerPocketStore()
const simulationController = new WorldSimulationController()
const cleanupCallbacks: Array<() => void> = []


onMounted(() => {
  store.loadSave()
  simulationController.start()
  
  // Subscribe vào TẤT CẢ store con để auto-save (có giới hạn tần suất - throttle)
  let lastSaveTime = 0
  const SAVE_THROTTLE_MS = 2000

  const saveCallback = () => {
     if (AppConfig.GAME.SETTINGS.AUTO_SAVE) {
        const now = Date.now()
        if (now - lastSaveTime > SAVE_THROTTLE_MS) {
           store.saveGame()
           lastSaveTime = now
        }
     }
  }

  cleanupCallbacks.push(statsStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(inventoryStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(furnitureStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(customerStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(deliveryStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(staffStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(playerHandStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(tradeInStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(gradingStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(eventStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(pocketStore.$subscribe(saveCallback, { deep: true }))


  // Lắng nghe sự kiện từ NPC AI (Phaser -> Vue)
  const offTradeRequest = eventBus.on(EVENTS.NPC_TRADE_REQUEST, ({ instanceId, cardId }) => {
    tradeInStore.startTrade(instanceId, cardId)
  })
  cleanupCallbacks.push(offTradeRequest)

})

onUnmounted(() => {
  simulationController.stop()

  while (cleanupCallbacks.length > 0) {
    const cleanup = cleanupCallbacks.pop()
    cleanup?.()
  }
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
    <SetPriceModal />
    <HoldingHandHUD />
    <TradeInModal />
    <AdminTablet />
    <GradingReveal />
    <CheckoutModal />
    <PocketModal />
  </div>

</template>
