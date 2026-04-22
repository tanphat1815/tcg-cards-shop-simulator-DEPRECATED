<script setup lang="ts">
import { usePlayerPocketStore } from '../store/playerPocketStore'
import { useInventoryStore } from '../store/inventoryStore'
import { getPackVisuals, getBoxVisuals } from '../config/assetRegistry'

const pocketStore = usePlayerPocketStore()
const inventoryStore = useInventoryStore()

function getImageUrl(entry: any): string {
  const setId = entry.sourceSetId ?? entry.itemId.replace('pack_', '').replace('box_', '')
  return entry.type === 'pack'
    ? getPackVisuals(setId).front
    : getBoxVisuals(setId).front
}

async function openPack(itemId: string) {
  const taken = pocketStore.removeFromPocket(itemId, 1)
  if (taken <= 0) return

  // Cộng vào shopInventory tạm để tearPack hoạt động (tearPack trừ 1 từ shopInventory)
  if (!inventoryStore.shopInventory[itemId]) inventoryStore.shopInventory[itemId] = 0
  inventoryStore.shopInventory[itemId] += 1

  await inventoryStore.tearPack(itemId)
  // Khi PackOpeningOverlay mở, tự đóng PocketModal để không chồng UI
  pocketStore.closePocketModal()
}

function unboxItem(itemId: string) {
  const entry = pocketStore.pocket[itemId]
  if (!entry || entry.type !== 'box') return

  const shopItem = inventoryStore.shopItems[itemId]
  if (!shopItem?.contains) return

  const taken = pocketStore.removeFromPocket(itemId, 1)
  if (taken <= 0) return

  const innerItemId = shopItem.contains.itemId
  const innerAmount = shopItem.contains.amount
  const innerItem = inventoryStore.shopItems[innerItemId]

  pocketStore.addToPocket({
    itemId: innerItemId,
    name: innerItem?.name ?? innerItemId,
    type: 'pack',
    quantity: innerAmount,
    sourceSetId: innerItem?.sourceSetId,
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="pocket-modal">
      <div
        v-if="pocketStore.showPocketModal"
        class="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        @click.self="pocketStore.closePocketModal()"
      >
        <div class="bg-gray-900 border-2 border-yellow-500/40 rounded-2xl w-full max-w-lg shadow-2xl shadow-yellow-500/10 overflow-hidden">

          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 bg-yellow-900/20 border-b border-yellow-500/30">
            <h2 class="text-xl font-black text-yellow-300 flex items-center gap-3">
              🎒 Túi Ba Lô
              <span class="text-sm font-normal text-yellow-500">({{ pocketStore.totalItems }} vật phẩm)</span>
            </h2>
            <button
              @click="pocketStore.closePocketModal()"
              class="text-yellow-500/60 hover:text-yellow-300 text-2xl font-bold transition-colors"
            >✕</button>
          </div>

          <!-- Empty State -->
          <div v-if="pocketStore.isEmpty" class="flex flex-col items-center justify-center py-16 text-gray-600">
            <span class="text-5xl mb-4">🎒</span>
            <p class="font-bold">Túi trống!</p>
            <p class="text-sm mt-1">Hãy nhặt thùng hàng và bấm [R] để bóc.</p>
          </div>

          <!-- Item List -->
          <div v-else class="p-4 space-y-3 max-h-[60vh] overflow-y-auto custom-scroll">
            <div
              v-for="entry in pocketStore.pocketList"
              :key="entry.itemId"
              class="flex items-center gap-4 bg-gray-800/60 border border-gray-700/40 rounded-xl p-3 hover:border-yellow-500/30 transition-all group"
            >
              <!-- Ảnh -->
              <div class="w-14 h-20 flex-shrink-0 bg-slate-900 rounded-lg overflow-hidden border border-slate-700/50">
                <img
                  :src="getImageUrl(entry)"
                  class="w-full h-full object-contain"
                  @error="(e) => (e.target as HTMLImageElement).src = ''"
                />
              </div>

              <!-- Info -->
              <div class="flex-grow min-w-0">
                <p class="font-bold text-sm text-white truncate">{{ entry.name }}</p>
                <p class="text-xs text-gray-500 uppercase font-medium mt-0.5">{{ entry.type }}</p>
                <p class="text-xs text-yellow-400 font-mono mt-1">x{{ entry.quantity }}</p>
              </div>

              <!-- Actions -->
              <div class="flex flex-col gap-2 shrink-0">
                <button
                  v-if="entry.type === 'pack'"
                  @click="openPack(entry.itemId)"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  ✨ Mở Pack
                </button>
                <button
                  v-if="entry.type === 'box'"
                  @click="unboxItem(entry.itemId)"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                >
                  📦 Xé Hộp
                </button>
              </div>
            </div>
          </div>

          <!-- Footer hint -->
          <div class="px-6 py-3 border-t border-gray-700/50 text-center text-xs text-gray-600">
            Hàng trong Túi không mất khi thoát game • Tự động lưu
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pocket-modal-enter-active, .pocket-modal-leave-active {
  transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}
.pocket-modal-enter-from, .pocket-modal-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(20px);
}
.custom-scroll::-webkit-scrollbar { width: 6px; }
.custom-scroll::-webkit-scrollbar-track { background: rgba(17, 24, 39, 0.5); }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(234, 179, 8, 0.4); border-radius: 4px; }
</style>
