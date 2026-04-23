<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { useDeliveryStore } from '../../inventory/store/deliveryStore'
import { useFurnitureStore } from '../../furniture/store/furnitureStore'
import { usePlayerPocketStore } from '../../inventory/store/playerPocketStore'
import { getPackVisuals, getBoxVisuals } from '../../inventory/config/assetRegistry'
import TcgCard from '../../shared/components/TcgCard.vue'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'

const gameStore = useGameStore()
const inventoryStore = useInventoryStore()
const deliveryStore = useDeliveryStore()
const pocketStore = usePlayerPocketStore()
const apiStore = useApiStore()

// ── activeSelection: item đang được chọn để đặt lên kệ ──
interface ActiveSelection {
  itemId: string
  source: 'pocket' | 'shopInventory'
  quantity: number
}

const activeSelection = ref<ActiveSelection | null>(null)

// Nguồn hàng từ Pocket (lọc bỏ loại không phù hợp với role kệ)
const pocketItems = computed(() =>
  pocketStore.pocketList.filter(entry => {
    if (activeShelf.value?.role === 'display_case') return false
    return entry.type === 'pack' || entry.type === 'box'
  })
)

// Helper: lấy URL ảnh cho item
function getItemImageUrl(itemId: string, type: 'pack' | 'box', sourceSetId?: string): string {
  try {
    // Luôn ưu tiên dùng sourceSetId nếu có để lấy đúng ảnh gốc
    const setId = sourceSetId || itemId;
    return type === 'pack'
      ? getPackVisuals(setId).front
      : getBoxVisuals(setId).front
  } catch (e) {
    console.warn('[ShelfMenu] Image fail:', itemId)
    return ''
  }
}

function getItemType(itemId: string | null): 'pack' | 'box' | null {
  if (!itemId) return null
  const shopItem = inventoryStore.shopItems[itemId]
  if (shopItem) return shopItem.type as any
  if (itemId.startsWith('pack_')) return 'pack'
  if (itemId.startsWith('box_')) return 'box'
  return null
}

function selectFromPocket(itemId: string) {
  const entry = pocketStore.pocket[itemId]
  if (!entry) return
  activeSelection.value = {
    itemId,
    source: 'pocket',
    quantity: entry.quantity,
  }
}

function selectFromInventory(id: string) {
  activeSelection.value = {
    itemId: id,
    source: 'shopInventory',
    quantity: inventoryStore.shopInventory[id] ?? 0,
  }
}

/**
 * Danh sách item trong kho inventory.
 */
const inventoryItems = computed(() => {
  const shelf = activeShelf.value
  if (shelf?.role !== 'display_case') return []

  return Object.keys(inventoryStore.personalBinder)
    .map(cardId => ({
      id: cardId,
      item: apiStore.flatCardMap[cardId],
      quantity: inventoryStore.personalBinder[cardId],
      isCard: true
    }))
    .filter(x => x.item !== undefined && x.quantity > 0)
})

const activeShelf = computed(() => {
  const shelfId = gameStore.activeShelfId
  if (!shelfId) return null
  return gameStore.placedShelves[shelfId]
})

// Đặt hàng lên tầng kệ — logic thống nhất
function placeOnTier(tierIndex: number) {
  if (!activeSelection.value || !activeShelf.value) return

  const { itemId, source } = activeSelection.value
  const shelf = activeShelf.value

  if (source === 'pocket') {
    const tier = shelf.tiers[tierIndex]
    
    // Safety check compatible itemId
    if (tier.itemId !== null && tier.itemId !== itemId) return
    if (tier.slots.length >= tier.maxSlots && tier.itemId !== null) return

    const taken = pocketStore.removeFromPocket(itemId, 1)
    if (taken <= 0) return

    useFurnitureStore().fillTierFromHand(shelf.id, itemId, tierIndex, taken)

    const remaining = pocketStore.pocket[itemId]?.quantity ?? 0
    if (remaining <= 0) {
      activeSelection.value = null
    } else {
      activeSelection.value = { ...activeSelection.value, quantity: remaining }
    }

    const shopItem = inventoryStore.shopItems[itemId]
    if (shelf.role === 'selling' && (!shopItem || (shopItem.sellPrice ?? 0) <= 0)) {
      openPriceEditor(itemId, tierIndex)
    }

  } else {
    // Source: shopInventory — logic cũ
    gameStore.moveToTierSlot(itemId, tierIndex)

    const shopItem = inventoryStore.shopItems[itemId]
    if (shopItem && shelf.role === 'selling' && (shopItem.sellPrice ?? 0) <= 0) {
      openPriceEditor(itemId, tierIndex)
    }

    const remaining = inventoryStore.shopInventory[itemId] ?? 0
    if (remaining <= 0) activeSelection.value = null
  }
}

/**
 * Xử lý click vào tầng để xếp hàng.
 */
const handleTierClick = (tierIndex: number) => {
  const shelf = activeShelf.value
  if (!shelf) return

  if (shelf.role === 'display_case') return

  if (activeSelection.value) {
    placeOnTier(tierIndex)
    return
  }
  // Không có selection → không làm gì
}

/**
 * Xử lý click vào SLOT cụ thể trên Display Case.
 */
const handleDisplaySlotClick = (tierIndex: number, slotIndex: number) => {
   if (!activeSelection.value || !activeShelf.value) return
   const shelf = activeShelf.value
   if (shelf.role !== 'display_case') return

   const card = apiStore.flatCardMap[activeSelection.value.itemId]
   const market = card?.pricing?.tcgplayer?.normal?.marketPrice || 10
   const defaultPrice = Math.round(market * 1.2 * 100) / 100

   const success = gameStore.placeCardOnDisplayCase(
      shelf.id,
      tierIndex,
      slotIndex,
      activeSelection.value.itemId,
      defaultPrice
   )

   if (success) {
      openCardPriceEditor(activeSelection.value.itemId, tierIndex, slotIndex)
      
      if (!inventoryStore.personalBinder[activeSelection.value.itemId]) {
         activeSelection.value = null
      }
   }
}

/**
 * Mở modal định giá cho một card cụ thể trên display case.
 */
const openCardPriceEditor = (cardId: string, tierIndex: number, slotIndex: number) => {
  const shelf = activeShelf.value
  if (!shelf) return

  const card = apiStore.flatCardMap[cardId]
  if (!card) return

  const tier = shelf.tiers[tierIndex]
  const currentPrice = tier.customPriceMap?.[cardId] ?? 0
  const marketPrice = card.pricing?.tcgplayer?.normal?.marketPrice || 10

  deliveryStore.openSetPrice({
    shelfId: shelf.id,
    tierIndex: tierIndex,
    slotIndex: slotIndex,
    itemId: cardId,
    name: card.name,
    imageUrl: card.images?.small || '',
    currentPrice: currentPrice,
    marketPrice: marketPrice,
    buyPrice: marketPrice * 0.7,
    isSingleCard: true
  })
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
    marketPrice: shopItem.sellPrice || shopItem.buyPrice * 1.6,
    buyPrice: shopItem.buyPrice,
  })
}

const handleTierRightClick = (tierIndex: number) => {
  const shelf = activeShelf.value
  if (!shelf) return

  const tier = shelf.tiers[tierIndex]
  if (!tier.itemId || tier.slots.length === 0) return

  const capturedId = tier.itemId // Lưu lại ID trước khi rút món cuối
  const itemData = inventoryStore.shopItems[capturedId]
  if (!itemData) return

  // Lấy 1 đơn vị từ kệ → đưa vào Pocket
  const taken = gameStore.takeItemFromTierSimple(shelf.id, tierIndex)
  if (!taken) return

  pocketStore.addToPocket({
    itemId: capturedId,
    name: itemData.name,
    type: itemData.type as 'pack' | 'box',
    quantity: 1,
    sourceSetId: itemData.sourceSetId,
  })

  // Auto-select item vừa lấy
  activeSelection.value = {
    itemId: capturedId,
    source: 'pocket',
    quantity: pocketStore.pocket[capturedId]?.quantity ?? 1,
  }
}

const handleSlotRightClick = (tierIndex: number, slotIndex: number) => {
  const shelf = activeShelf.value
  if (!shelf || shelf.role !== 'display_case') return

  const tier = shelf.tiers[tierIndex]
  const cardId = tier.slots[slotIndex]
  if (!cardId) return

  if (!inventoryStore.personalBinder[cardId]) inventoryStore.personalBinder[cardId] = 0
  inventoryStore.personalBinder[cardId]++

  tier.slots[slotIndex] = null
  if (tier.customPriceMap) delete tier.customPriceMap[cardId]
  if (tier.slots.every(s => s === null)) tier.itemId = null
}

const clearTier = (tierIndex: number) => {
  const shelfId = gameStore.activeShelfId
  if (!shelfId) return
  gameStore.clearTier(shelfId, tierIndex)
}

const canPlaceInTier = (tierIndex: number): boolean => {
  if (!activeSelection.value || !activeShelf.value) return false
  if (activeShelf.value.role === 'display_case') return true
  const tier = activeShelf.value.tiers[tierIndex]
  if (tier.itemId === null) return true
  if (tier.itemId === activeSelection.value.itemId) return tier.slots.length < tier.maxSlots
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
            {{ activeShelf.role === 'storage' ? '📦 KHO LƯU TRỮ' : activeShelf.role === 'display_case' ? '🃏 TỦ KÍNH TRƯNG BÀY' : '🏷️ KỆ BÁN HÀNG' }}
          </span>
        </div>
        
        <div class="flex items-center gap-3">
          <EnhancedButton
            variant="danger"
            size="sm"
            @click="gameStore.clearEntireShelf()"
          >
            Rút tất cả vào Túi
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

        <!-- Left: Pocket + Inventory -->
        <div class="w-[260px] shrink-0 border-r border-gray-700 bg-gray-900/50 p-4 flex flex-col relative">

          <!-- SECTION 1: POCKET (túi cá nhân) -->
          <div v-if="pocketItems.length > 0" class="flex-1 flex flex-col min-h-0 mb-4">
            <h3 class="text-sm font-bold text-yellow-400 mb-2 pb-2 border-b border-yellow-500/30 uppercase tracking-wider flex items-center gap-2">
              🎒 Túi Ba Lô ({{ pocketItems.length }})
            </h3>
            <div class="space-y-2 overflow-y-auto pr-1 flex-grow custom-scroll">
              <div
                v-for="entry in pocketItems"
                :key="entry.itemId"
                @click="selectFromPocket(entry.itemId)"
                class="group relative flex items-center gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-all overflow-hidden"
                :class="activeSelection?.itemId === entry.itemId && activeSelection?.source === 'pocket'
                  ? 'bg-yellow-600/20 border-yellow-400 shadow-[0_0_12px_rgba(234,179,8,0.4)]'
                  : 'bg-gray-800 border-gray-700 hover:border-yellow-500/40'"
              >
                <!-- Ảnh nhỏ -->
                <div class="w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-slate-900 border border-slate-700">
                  <img
                    :src="getItemImageUrl(entry.itemId, entry.type, entry.sourceSetId)"
                    class="w-full h-full object-contain"
                    @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
                  />
                </div>
                <div class="flex flex-col min-w-0 flex-grow">
                  <span class="font-bold text-[12px] text-gray-100 truncate">{{ entry.name }}</span>
                  <span class="text-[10px] text-yellow-400 font-medium uppercase">{{ entry.type }}</span>
                </div>
                <div class="bg-yellow-900/50 text-yellow-300 px-2 py-0.5 rounded text-xs font-mono border border-yellow-700 ml-auto shrink-0">
                  x{{ entry.quantity }}
                </div>
              </div>
            </div>
            <p v-if="activeSelection?.source === 'pocket'" class="mt-2 text-[10px] text-center text-yellow-300 italic">
              Click vào Tầng để xếp hàng
            </p>
          </div>

          <!-- SECTION 2: PERSONAL BINDER (Hiện ra nếu là Display Case) -->
          <template v-if="activeShelf.role === 'display_case'">
            <h3 class="text-sm font-bold text-indigo-300 mb-3 pb-2 border-b border-indigo-500/30 uppercase tracking-wider flex items-center gap-2">
              🗂️ Bản thẻ Cá nhân
            </h3>

            <div v-if="inventoryItems.length === 0" class="text-center text-gray-500 italic mt-10 text-sm">
              Bạn không có thẻ bài nào trong Binder.<br/>Hãy mở Pack để thu thập thẻ.
            </div>

            <div v-else class="flex-grow overflow-y-auto pr-1 custom-scroll space-y-2">
              <div
                  v-for="inv in inventoryItems" :key="inv.id"
                  @click="selectFromInventory(inv.id)"
                  class="flex justify-between items-center p-3 rounded-xl border-2 cursor-pointer transition-all"
                  :class="activeSelection?.itemId === inv.id && activeSelection?.source === 'shopInventory'
                    ? 'bg-indigo-900/40 border-indigo-500/60 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                    : 'bg-gray-800/60 border-gray-700/40 hover:bg-gray-700'"
                >
                  <div class="flex flex-col min-w-0" :class="{ 'flex-grow': inv.isCard }">
                    <span class="font-bold text-[12px] text-gray-200 truncate">
                      {{ inv.item?.name }}
                    </span>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <span class="text-[9px] text-gray-500 uppercase">
                        {{ inv.isCard ? (inv.item as any).rarity || 'Common' : (inv.item as any).type }}
                      </span>
                      <span v-if="inv.isCard" class="text-[9px] text-yellow-500/80 font-bold">
                         ${{ (inv.item as any).pricing?.tcgplayer?.normal?.marketPrice?.toFixed(1) || '0.0' }}
                      </span>
                    </div>
                  </div>
                  <div class="bg-gray-950 text-indigo-400 px-2 py-0.5 rounded text-xs font-mono border border-gray-800 ml-2 shrink-0">
                    x{{ inv.quantity }}
                  </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Right: Shelf Tiers -->
        <div class="flex-grow p-6 flex flex-col gap-4 overflow-y-auto custom-scroll bg-gray-950/30">
          <div v-if="activeShelf.role !== 'display_case'" class="flex justify-between items-center shrink-0">
             <p class="text-[11px] text-gray-400 italic">
              Thao tác: Click để Đặt hàng | Chuột phải để Lấy hàng | Click vào Giá để đổi giá.
            </p>
            <div v-if="activeSelection" class="flex items-center gap-2 bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-500/30">
               <span class="text-[10px] font-bold text-indigo-300 uppercase">Đang chọn:</span>
               <span class="text-[11px] text-white font-black truncate max-w-[150px]">
                  {{ activeSelection.source === 'pocket' ? pocketStore.pocket[activeSelection.itemId]?.name : inventoryStore.shopItems[activeSelection.itemId]?.name }}
               </span>
            </div>
          </div>

          <!-- Shelf Tiers Display -->
          <div
            v-for="(tier, tierIdx) in activeShelf.tiers"
            :key="tierIdx"
            class="rounded-xl border-2 overflow-hidden shrink-0 transition-all cursor-pointer group"
            :class="{
                'border-indigo-500 shadow-[0_0_25px_rgba(99,102,241,0.25)] scale-[1.01] bg-indigo-900/5': activeSelection && canPlaceInTier(tierIdx),
                'border-gray-700/50 bg-gray-900/50': !activeSelection || !canPlaceInTier(tierIdx),
                'border-red-900/50 opacity-80': activeSelection && !canPlaceInTier(tierIdx) && tier.itemId !== null,
            }"
            @click="handleTierClick(tierIdx)"
            @contextmenu.prevent="handleTierRightClick(tierIdx)"
          >
            <!-- Tier Header -->
            <div
              class="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 select-none"
            >
              <div class="flex items-center gap-3">
                <span class="text-xs font-black text-gray-500 uppercase tracking-widest">Tầng {{ tierIdx + 1 }}</span>

                <div v-if="tier.itemId && activeShelf.role !== 'display_case'" class="flex items-center gap-3">
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
                    v-if="activeShelf.role === 'selling'"
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

                <div v-if="activeShelf.role === 'display_case'" class="flex items-center gap-2">
                 <span class="text-[10px] text-indigo-400 font-bold italic">Tủ trưng bày Cards</span>
                </div>

                <div v-else-if="!tier.itemId" class="flex items-center gap-2">
                  <span class="text-xs text-gray-600 font-medium italic">[ Trống – Click để đặt hàng tại đây ]</span>
                </div>
              </div>

              <div class="flex items-center gap-3">
                <span v-if="activeSelection && activeShelf.role !== 'display_case' && canPlaceInTier(tierIdx)" class="text-[10px] text-indigo-400 font-black uppercase tracking-widest animate-pulse">
                  Click: Đặt hàng
                </span>
                  <span v-if="tier.itemId && activeShelf.role !== 'display_case'" class="text-[10px] text-gray-500 font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                    Chuột phải: Lấy hàng
                  </span>
                  <EnhancedButton
                    v-if="tier.itemId && activeShelf.role !== 'display_case'"
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
              <div v-if="!tier.itemId && activeShelf.role !== 'display_case'" class="flex justify-center items-center h-16 text-gray-800 text-sm font-bold uppercase tracking-widest">
                Empty Slot
              </div>

              <!-- Display Case (Grid of 3 cards) -->
              <div v-else-if="activeShelf.role === 'display_case'"
                class="grid grid-cols-3 gap-6 py-2"
              >
                 <div
                    v-for="(cardId, slotIdx) in tier.slots"
                    :key="slotIdx"
                    class="relative group/slot flex flex-col items-center"
                 >
                    <!-- Slot placeholder or Card -->
                    <div
                       class="w-full aspect-[2/3] max-w-[120px] rounded-lg border-2 flex items-center justify-center transition-all duration-300 cursor-pointer overflow-hidden"
                       :class="cardId 
                          ? 'border-indigo-400 bg-gray-900 shadow-lg' 
                          : 'border-dashed border-gray-700 bg-gray-950/50 hover:border-indigo-500/50'"
                       @click="handleDisplaySlotClick(tierIdx, slotIdx)"
                       @contextmenu.prevent="handleSlotRightClick(tierIdx, slotIdx)"
                    >
                       <TcgCard 
                          v-if="cardId" 
                          :card="cardId ? apiStore.flatCardMap[cardId] : ({} as any)" 
                          size="small" 
                          :is-flipped="true"
                       />
                       <span v-else class="text-gray-800 text-3xl font-black">+</span>
                    </div>

                    <!-- Price tag for card -->
                    <div 
                       v-if="cardId"
                       class="mt-2 bg-gray-950 px-2 py-0.5 rounded border border-emerald-500/50 flex items-center gap-2 cursor-pointer hover:bg-emerald-900/40"
                       @click="openCardPriceEditor(cardId, tierIdx, slotIdx)"
                    >
                       <span class="text-[10px] font-mono text-emerald-400 font-bold">
                          ${{ tier.customPriceMap?.[cardId]?.toFixed(2) }}
                       </span>
                       <span class="text-[10px]">✏️</span>
                    </div>
                 </div>
              </div>

              <div v-else-if="tier.itemId && getItemType(tier.itemId) === 'pack'"
                class="grid gap-2 py-2"
                style="grid-template-columns: repeat(8, 1fr);"
              >
                <div
                    v-for="n in tier.maxSlots"
                    :key="n"
                    class="relative rounded-lg border-2 flex items-center justify-center transition-all duration-300 group/item overflow-hidden"
                    :class="n <= tier.slots.length
                      ? 'bg-gray-800 border-indigo-500/50 shadow-[0_5px_15px_rgba(99,102,241,0.2)]'
                      : 'bg-gray-900/40 border-gray-800 border-dashed'"
                    style="height: 60px;"
                  >
                    <div v-if="n <= tier.slots.length" class="w-full h-full relative z-10">
                        <img 
                          :src="getItemImageUrl(tier.itemId, 'pack')" 
                          class="w-full h-full object-contain"
                          @error="(e: any) => e.target.style.opacity = '0'"
                        />
                        <!-- Fallback nếu ảnh lỗi -->
                        <div class="absolute inset-0 flex items-center justify-center text-[10px] text-indigo-400 font-bold text-center p-1 bg-indigo-900/20 pointer-events-none opacity-0 group-hover/item:opacity-100 transition-opacity">
                          {{ inventoryStore.shopItems[tier.itemId]?.name.split(' ')[0] }}
                        </div>
                    </div>
                    <div v-else class="text-gray-800 text-lg font-black opacity-20">+</div>
                </div>
              </div>

              <!-- Box Display -->
              <div v-else-if="tier.itemId && getItemType(tier.itemId) === 'box'"
                class="grid grid-cols-4 gap-4 py-2"
              >
                <div
                    v-for="n in tier.maxSlots"
                    :key="n"
                    class="relative rounded-xl border-2 flex flex-col items-center justify-center p-2 transition-all duration-300 group/box overflow-hidden"
                    :class="n <= tier.slots.length
                      ? 'bg-gray-800 border-amber-600/50 shadow-[0_8px_20px_rgba(217,119,6,0.15)]'
                      : 'bg-gray-900/40 border-gray-700/20 border-dashed'"
                    style="height: 120px;"
                  >
                    <div v-if="n <= tier.slots.length" class="w-full h-full relative z-10">
                        <img 
                          :src="getItemImageUrl(tier.itemId, 'box')" 
                          class="w-full h-full object-contain"
                          @error="(e: any) => e.target.style.opacity = '0'"
                        />
                        <!-- Fallback nếu ảnh lỗi -->
                        <div class="absolute inset-0 flex items-center justify-center text-xs text-amber-500 font-black text-center p-2 bg-amber-900/20 pointer-events-none opacity-0 group-hover/box:opacity-100 transition-opacity">
                          {{ inventoryStore.shopItems[tier.itemId]?.name }}
                        </div>
                    </div>
                    <span v-else class="text-gray-800 text-2xl font-black opacity-20">?</span>
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
