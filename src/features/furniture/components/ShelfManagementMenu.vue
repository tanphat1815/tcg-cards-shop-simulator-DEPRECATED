<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'
import { useDeliveryStore } from '../../inventory/store/deliveryStore'
import { getPackVisuals, getBoxVisuals } from '../../inventory/config/assetRegistry'

const gameStore = useGameStore()
const inventoryStore = useInventoryStore()
const deliveryStore = useDeliveryStore()

/** ID của item đang được chọn để xếp lên kệ */
const selectedItemId = ref<string | null>(null)
/** Đánh dấu xem có đang chọn item 'đang cầm trên tay' không */
const isSelectedFromHand = ref(false)

/**
 * Tự động chọn item đang cầm trên tay nếu có khi mở menu.
 */
onMounted(() => {
  if (deliveryStore.carriedBox) {
    selectedItemId.value = deliveryStore.carriedBox.itemId
    isSelectedFromHand.value = true
  }
})

/**
 * Danh sách item trong kho inventory.
 */
const inventoryItems = computed(() => {
  return Object.keys(inventoryStore.shopInventory)
    .map(itemId => ({
      id: itemId,
      item: inventoryStore.shopItems[itemId],
      quantity: inventoryStore.shopInventory[itemId]
    }))
    .filter(x => x.item !== undefined && x.quantity > 0)
})

const activeShelf = computed(() => {
  const shelfId = gameStore.activeShelfId
  if (!shelfId) return null
  return gameStore.placedShelves[shelfId]
})

const selectItemFromInventory = (id: string) => { 
  selectedItemId.value = id 
  isSelectedFromHand.value = false
}

const selectItemFromHand = () => {
  if (deliveryStore.carriedBox) {
    selectedItemId.value = deliveryStore.carriedBox.itemId
    isSelectedFromHand.value = true
  }
}

/**
 * Xử lý click vào tầng để xếp hàng.
 */
const handleTierClick = (tierIndex: number, event: MouseEvent) => {
  if (!selectedItemId.value) return
  const shelf = activeShelf.value
  if (!shelf) return

  const deliveryStore = useDeliveryStore()
  const shopItem = inventoryStore.shopItems[selectedItemId.value]

  // TRƯỜNG HỢP 1: Xếp hàng từ thùng đang cầm trên tay
  if (isSelectedFromHand.value && deliveryStore.carriedBox) {
    const carried = deliveryStore.carriedBox
    
    // Thực hiện nạp hàng trực tiếp vào tier của kệ
    gameStore.fillTierFromItem(shelf.id, carried.itemId, tierIndex, carried.quantity)
    
    // Đánh dấu để Phaser xóa thùng hàng vật lý
    deliveryStore.consumeCarriedBox()
    
    // Mở popup định giá (chỉ cho kệ bán và CHỈ KHI chưa có giá đã set)
    if (shelf.role !== 'storage' && (shopItem?.sellPrice || 0) <= 0) {
      openPriceEditor(carried.itemId, tierIndex)
    }
    
    // Reset lựa chọn sau khi xếp xong
    selectedItemId.value = null
    isSelectedFromHand.value = false
    return
  }

  // TRƯỜNG HỢP 2: Xếp hàng từ Inventory shop thông thường
  if (event.shiftKey) {
    gameStore.fillTier(selectedItemId.value, tierIndex)
  } else {
    gameStore.moveToTierSlot(selectedItemId.value, tierIndex)
  }

  // Trigger SetPriceModal (chỉ cho kệ bán và CHỈ KHI chưa có giá đã set)
  if (shopItem && shelf && shelf.role !== 'storage' && (shopItem.sellPrice || 0) <= 0) {
    openPriceEditor(selectedItemId.value, tierIndex)
  }

  // Hết hàng trong kho thì bỏ chọn
  if (!inventoryStore.shopInventory[selectedItemId.value]) {
    selectedItemId.value = null
  }
}

/**
 * Mở modal định giá cho một item cụ thể trên tầng.
 */
const openPriceEditor = (itemId: string, tierIndex: number) => {
  const shelf = activeShelf.value
  if (!shelf) return

  const shopItem = inventoryStore.shopItems[itemId]
  if (!shopItem) return

  deliveryStore.openSetPrice({
    shelfId: shelf.id,
    tierIndex: tierIndex,
    itemId: itemId,
    name: shopItem.name,
    imageUrl: shopItem.type === 'pack'
      ? getPackVisuals(shopItem.sourceSetId ?? itemId).front
      : getBoxVisuals(shopItem.sourceSetId ?? itemId).front,
    currentPrice: shopItem.sellPrice,
    marketPrice: shopItem.sellPrice || shopItem.buyPrice * 1.6, // Fallback if no price set
    buyPrice: shopItem.buyPrice,
  })
}

const handleTierRightClick = (tierIndex: number) => {
  const shelfId = gameStore.activeShelfId
  if (!shelfId) return
  gameStore.takeItemFromTier(shelfId, tierIndex)
}

const clearTier = (tierIndex: number) => {
  const shelfId = gameStore.activeShelfId
  if (!shelfId) return
  gameStore.clearTier(shelfId, tierIndex)
}

const canPlaceInTier = (tierIndex: number) => {
  if (!selectedItemId.value || !activeShelf.value) return false
  const tier = activeShelf.value.tiers[tierIndex]
  if (tier.itemId === null) return true
  if (tier.itemId === selectedItemId.value) return tier.slots.length < tier.maxSlots
  return false
}

const tierFillPct = (tierIndex: number): number => {
  if (!activeShelf.value) return 0
  const tier = activeShelf.value.tiers[tierIndex]
  if (!tier.itemId || tier.maxSlots === 0) return 0
  return (tier.slots.length / tier.maxSlots) * 100
}
</script>

<template>
  <div v-if="gameStore.showShelfMenu && activeShelf"
    class="absolute inset-0 z-[150] flex items-center justify-center bg-black/85 backdrop-blur-sm pointer-events-auto p-4">
    <div class="bg-gray-900 border-2 border-indigo-500/50 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">

      <!-- Header -->
      <div class="bg-gray-800 px-6 py-4 flex justify-between items-center border-b border-gray-700 shrink-0">
        <div class="flex items-center gap-3">
          <h2 class="text-2xl font-black text-white flex items-center gap-2">
            🗄️ KỆ HÀNG &nbsp;<span class="text-indigo-400 text-base font-medium">({{ activeShelf.id }})</span>
          </h2>
          <span
            class="text-xs font-bold px-2.5 py-1 rounded-full border shadow-sm tracking-wide"
            :class="activeShelf.role === 'storage'
              ? 'bg-amber-900/50 text-amber-400 border-amber-700/60'
              : 'bg-green-900/50 text-green-400 border-green-700/60'"
          >
            {{ activeShelf.role === 'storage' ? '📦 KHO LƯU TRỮ' : '🏷️ KỆ BÁN HÀNG' }}
          </span>
        </div>
        
        <div class="flex items-center gap-3">
          <EnhancedButton
            variant="danger"
            size="sm"
            @click="gameStore.clearEntireShelf()"
          >
            Rút tất cả về Kho
          </EnhancedButton>
          <EnhancedButton
            variant="icon"
            size="sm"
            :icon="{ name: 'close' }"
            defaultText=""
            @click="gameStore.closeShelfManagement()"
          />
        </div>
      </div>

      <div class="flex-grow flex overflow-hidden min-h-0">

        <!-- Left: Inventory & Carried Boxes -->
        <div class="w-[240px] shrink-0 border-r border-gray-700 bg-gray-900/50 p-4 flex flex-col relative">
          
          <!-- SECTION 1: ĐANG CẦM (CARRYING) -->
          <div v-if="deliveryStore.carriedBox" class="mb-6">
            <h3 class="text-sm font-bold text-indigo-400 mb-3 pb-2 border-b border-indigo-500/30 uppercase tracking-wider flex items-center gap-2">
              <span class="animate-pulse">🙌</span> Đang cầm
            </h3>
            <div
              @click="selectItemFromHand"
              class="group relative flex flex-col p-3 rounded-xl border-2 cursor-pointer transition-all overflow-hidden"
              :class="isSelectedFromHand 
                ? 'bg-indigo-600/20 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)]' 
                : 'bg-gray-800 border-gray-700 hover:border-indigo-500/50'"
            >
              <div class="flex justify-between items-start mb-1">
                <span class="font-black text-[13px] text-white truncate pr-2">
                  {{ deliveryStore.carriedBox.name }}
                </span>
                <span class="bg-indigo-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                  x{{ deliveryStore.carriedBox.quantity }}
                </span>
              </div>
              <span class="text-[10px] text-indigo-300 font-medium uppercase">
                {{ deliveryStore.carriedBox.type === 'pack' ? '🎁 Booster Pack' : '📦 Thùng hàng' }}
              </span>

              <!-- Selection Indicator -->
              <div v-if="isSelectedFromHand" class="absolute top-1 right-1">
                <span class="flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
              </div>
            </div>
            <p v-if="isSelectedFromHand" class="mt-2 text-[10px] text-center text-indigo-300 italic">
               Click chuột vào Tầng để xếp hàng ngay
            </p>
          </div>

          <!-- SECTION 2: SHOP INVENTORY -->
          <h3 class="text-sm font-bold text-gray-200 mb-3 pb-2 border-b border-gray-700 uppercase tracking-wider">📦 Kho hàng Shop</h3>

          <div v-if="inventoryItems.length === 0" class="text-center text-gray-500 italic mt-10 text-sm">
            Kho đang trống.
          </div>

          <div v-else class="flex-grow overflow-y-auto pr-1 custom-scroll space-y-2">
            <div
                v-for="inv in inventoryItems" :key="inv.id"
                @click="selectItemFromInventory(inv.id)"
                class="flex justify-between items-center p-3 rounded-xl border-2 cursor-pointer transition-all"
                :class="selectedItemId === inv.id && !isSelectedFromHand
                  ? 'bg-emerald-900/40 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-gray-800/60 border-gray-700/40 hover:bg-gray-700'"
              >
                <div class="flex flex-col min-w-0">
                  <span class="font-bold text-[12px] text-gray-200 truncate">
                    {{ inv.item?.name }}
                  </span>
                  <span class="text-[9px] text-gray-500 mt-0.5 uppercase">
                    {{ inv.item?.type }}
                  </span>
                </div>
                <div class="bg-gray-950 text-emerald-400 px-2 py-0.5 rounded text-xs font-mono border border-gray-800 ml-2 shrink-0">
                  x{{ inv.quantity }}
                </div>
            </div>
          </div>
        </div>

        <!-- Right: Shelf Tiers -->
        <div class="flex-grow p-6 flex flex-col gap-4 overflow-y-auto custom-scroll bg-gray-950/30">
          <div class="flex justify-between items-center shrink-0">
             <p class="text-[11px] text-gray-400 italic">
              Thao tác: Click để Đặt hàng | Chuột phải để Lấy hàng | Click vào Giá để đổi giá.
            </p>
            <div v-if="selectedItemId" class="flex items-center gap-2 bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-500/30">
               <span class="text-[10px] font-bold text-indigo-300 uppercase">Đang chọn:</span>
               <span class="text-[11px] text-white font-black truncate max-w-[150px]">
                  {{ isSelectedFromHand ? deliveryStore.carriedBox?.name : inventoryStore.shopItems[selectedItemId]?.name }}
               </span>
            </div>
          </div>

          <!-- Shelf Tiers Display -->
          <div
            v-for="(tier, tierIdx) in activeShelf.tiers"
            :key="tierIdx"
            class="rounded-xl border-2 overflow-hidden shrink-0 transition-all"
            :class="{
                'border-indigo-500 shadow-[0_0_25px_rgba(99,102,241,0.25)] scale-[1.01] bg-indigo-900/5': selectedItemId && canPlaceInTier(tierIdx),
                'border-gray-700/50 bg-gray-900/50': !selectedItemId || !canPlaceInTier(tierIdx),
                'border-red-900/50 opacity-80': selectedItemId && !canPlaceInTier(tierIdx) && tier.itemId !== null,
            }"
          >
            <!-- Tier Header -->
            <div
              class="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 cursor-pointer group select-none"
              @click="handleTierClick(tierIdx, $event)"
              @contextmenu.prevent="handleTierRightClick(tierIdx)"
            >
              <div class="flex items-center gap-3">
                <span class="text-xs font-black text-gray-500 uppercase tracking-widest">Tầng {{ tierIdx + 1 }}</span>

                <div v-if="tier.itemId" class="flex items-center gap-3">
                  <div class="flex items-center gap-1.5 bg-gray-950 px-2 py-0.5 rounded border border-gray-700">
                    <span class="text-sm">{{ inventoryStore.shopItems[tier.itemId]?.type === 'box' ? '📦' : '🎁' }}</span>
                    <span class="text-xs font-bold text-yellow-500">{{ inventoryStore.shopItems[tier.itemId]?.name }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-mono text-gray-400">{{ tier.slots.length }}/{{ tier.maxSlots }}</span>
                    <div class="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                      <div class="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] transition-all duration-500" :style="{ width: `${tierFillPct(tierIdx)}%` }"></div>
                    </div>
                  </div>

                  <!-- Hiển thị giá và cho phép sửa nhanh (chỉ kệ bán) -->
                  <div
                    v-if="activeShelf.role !== 'storage'"
                    @click.stop="openPriceEditor(tier.itemId, tierIdx)"
                    class="flex items-center gap-2 bg-gray-950 px-2.5 py-1 rounded-lg border border-emerald-500/30 
                           hover:bg-emerald-900/20 hover:border-emerald-500 transition-all cursor-pointer group/price"
                    title="Click để đổi giá"
                  >
                    <span class="text-[10px] text-gray-500 font-bold uppercase">Giá:</span>
                    <span class="text-xs font-black text-emerald-400 font-mono">
                      ${{ inventoryStore.shopItems[tier.itemId]?.sellPrice?.toFixed(2) || '0.00' }}
                    </span>
                    <span class="text-[10px] opacity-0 group-hover/price:opacity-100 transition-opacity">✏️</span>
                  </div>
                </div>
                <span v-else class="text-xs text-gray-600 font-medium italic">[ Trống – Click để đặt hàng tại đây ]</span>
              </div>

                <div class="flex items-center gap-3">
                  <span v-if="selectedItemId && canPlaceInTier(tierIdx)" class="text-[10px] text-indigo-400 font-black uppercase tracking-widest animate-pulse">
                    Click: Đặt hàng
                  </span>
                  <span v-if="tier.itemId" class="text-[10px] text-gray-500 font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                    Chuột phải: Lấy hàng
                  </span>
                  <EnhancedButton
                    v-if="tier.itemId"
                    variant="danger"
                    size="xs"
                    @click.stop="clearTier(tierIdx)"
                  >
                    Dọn tầng
                  </EnhancedButton>
                </div>
            </div>

            <!-- Tier Content Visuals -->
            <div class="bg-gray-900/30 p-4 min-h-[90px] flex flex-col justify-center">
              <div v-if="!tier.itemId" class="flex justify-center items-center h-16 text-gray-800 text-sm font-bold uppercase tracking-widest">
                Empty Slot
              </div>

              <!-- Pack Display -->
              <div v-else-if="inventoryStore.shopItems[tier.itemId]?.type === 'pack'"
                class="grid gap-1.5"
                style="grid-template-columns: repeat(8, 1fr);"
              >
                <div
                    v-for="n in tier.maxSlots"
                    :key="n"
                    class="rounded-sm border-2 flex items-center justify-center transition-all duration-300"
                    :class="n <= tier.slots.length
                      ? 'bg-indigo-600 border-indigo-400 translate-y-[-2px] shadow-lg'
                      : 'bg-gray-800/30 border-gray-800 border-dashed'"
                    style="height: 30px;"
                  >
                    <div v-if="n <= tier.slots.length" class="w-full h-full flex flex-col justify-center items-center">
                       <div class="w-3 h-1 bg-white/30 rounded-full mb-1"></div>
                       <div class="w-3 h-1 bg-white/20 rounded-full"></div>
                    </div>
                </div>
              </div>

              <!-- Box Display -->
              <div v-else-if="inventoryStore.shopItems[tier.itemId]?.type === 'box'"
                class="grid grid-cols-4 gap-4"
              >
                <div
                    v-for="n in tier.maxSlots"
                    :key="n"
                    class="rounded-xl border-2 flex flex-col items-center justify-center py-3 transition-all duration-300"
                    :class="n <= tier.slots.length
                      ? 'bg-amber-900/30 border-amber-600/50 shadow-inner'
                      : 'bg-gray-800/20 border-gray-700/20 border-dashed'"
                    style="height: 100px;"
                  >
                    <span v-if="n <= tier.slots.length" class="text-4xl drop-shadow-md">📦</span>
                    <span v-else class="text-gray-800 text-2xl font-black">?</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar { width: 6px; }
.custom-scroll::-webkit-scrollbar-track { background: rgba(17, 24, 39, 0.5); border-radius: 4px; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.6); border-radius: 4px; }
.custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(99, 102, 241, 0.9); }
</style>
