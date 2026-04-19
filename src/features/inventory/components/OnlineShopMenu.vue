<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { useStatsStore } from '../../stats/store/statsStore'
import { useInventoryStore } from '../store/inventoryStore'
import { useStaffStore } from '../../staff/store/staffStore'
import { useApiStore } from '../store/apiStore'
import { FURNITURE_ITEMS } from '../../furniture/config'
import { WORKERS } from '../../staff/config'
import { EXPANSIONS_LOT_A } from '../../environment/config'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'
import { getPackVisuals, getBoxVisuals, hasCustomVisual } from '../config/assetRegistry'
import { useCartStore } from '../store/cartStore'
import AddToCartModal from './AddToCartModal.vue'

const formatVND = (priceUsd: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(priceUsd * 25000)
}

const gameStore = useGameStore()
const statsStore = useStatsStore()
const inventoryStore = useInventoryStore()
const staffStore = useStaffStore()
const apiStore = useApiStore()
const cartStore = useCartStore()
const activeTab = ref<'STOCK' | 'FURNITURE' | 'STAFF' | 'RENO'>('STOCK')

// Tabs config
const tabs = [
  { id: 'STOCK', label: 'Chợ Nhập Hàng', icon: 'cart' },
  { id: 'FURNITURE', label: 'Nội Thất Shop', icon: 'heart' }, // icon map heart for furniture
  { id: 'STAFF', label: 'Nhân Sự', icon: 'user' },
  { id: 'RENO', label: 'Cải Tạo', icon: 'plus' }
] as const

const groupedShopItems = computed(() => {
  const items = Object.values(inventoryStore.shopItems)
  const groups: Record<string, any[]> = {}
  
  // Sort items first by required level and name
  const sorted = items.sort((a, b) => {
    if (a.requiredLevel !== b.requiredLevel) return a.requiredLevel - b.requiredLevel
    return a.name.localeCompare(b.name)
  })

  // Group by generation
  sorted.forEach(item => {
    // Robust mapping fallback
    const gen = item.generation || 'OTHER SERIES'
    if (!groups[gen]) groups[gen] = []
    groups[gen].push(item)
  })
  
  return groups
})

const scrollToGen = (genName: string) => {
  const element = document.getElementById(`gen-${genName.replace(/\s+/g, '-').toLowerCase()}`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const isShopLoading = computed(() => apiStore.isLoading)
const shopError = computed(() => apiStore.error)

watch(() => gameStore.showOnlineShop, (opened) => {
  if (opened) {
    apiStore.initSeriesShop()
  }
})



const purchaseFurniture = (id: string, price: number) => {
  if (statsStore.money < price) {
    alert("Không đủ tiền sắm nội thất!")
    return
  }
  const success = gameStore.buyFurniture(id)
  if (success) {
    // Play cha-ching
  }
}

const hireWorker = (workerId: string) => {
  const success = gameStore.hireWorker(workerId)
  if (!success) {
    alert("Không đủ tiền hoặc Level chưa đạt yêu cầu!")
  }
}

const purchaseExpansion = () => {
  const success = gameStore.buyExpansion()
  if (!success) {
    alert("Không đủ tiền hoặc Level chưa đạt yêu cầu mở rộng!")
  }
}

const getWorkerData = (id: string) => WORKERS.find((w: any) => w.id === id)

// Track image loading errors to show fallback icons
const itemImageErrors = reactive<Record<string, boolean>>({})
const handleImageError = (id: string) => {
  itemImageErrors[id] = true
}
</script>

<template>
  <div v-if="gameStore.showOnlineShop" class="absolute inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto p-4">
    <div class="bg-white rounded-xl w-[90vw] max-w-[1400px] h-[88vh] flex flex-col shadow-2xl overflow-hidden font-sans">
      
      <!-- Browser Header Toolbar -->
      <div class="bg-gray-200 border-b border-gray-300 px-4 py-3 flex items-center gap-3">
        <div class="flex gap-2">
          <div class="w-3 h-3 rounded-full bg-red-400"></div>
          <div class="w-3 h-3 rounded-full bg-yellow-400"></div>
          <div class="w-3 h-3 rounded-full bg-green-400"></div>
        </div>
        <div class="flex-grow flex justify-center">
          <div class="bg-white cursor-pointer px-4 py-1.5 rounded-md text-sm text-gray-500 w-2/3 max-w-lg text-center shadow-inner border border-gray-200 flex items-center justify-center gap-2">
            <span>🔒</span> https://tcg-distributor.market.com
          </div>
        </div>
        <EnhancedButton 
          variant="danger" 
          size="xs" 
          :icon="{ name: 'close' }" 
          defaultText=""
          @click="gameStore.setShowOnlineShop(false)"
          title="Đóng Online Shop"
          class="rounded-full w-8 h-8 p-0 flex items-center justify-center shadow-red-500/40"
        />
      </div>

      <!-- E-commerce Header -->
      <div class="bg-indigo-600 text-white px-8 py-5 flex justify-between items-center shadow-md z-10 relative">
        <div>
          <h1 class="text-3xl font-black italic tracking-tighter shadow-black drop-shadow-sm">TCG DISTRIBUTOR HUB</h1>
          <p class="text-indigo-200 text-sm font-medium">Đối tác cung ứng vật tư & mở rộng kinh doanh</p>
        </div>
        <div class="bg-indigo-800/50 p-2 py-1 rounded border border-indigo-500/50 text-xl font-mono text-yellow-300 font-bold shadow-inner">
          Số dư: ${{ statsStore.money.toFixed(2) }}
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex bg-gray-100 border-b border-gray-300 px-8 pt-3 gap-2 shadow-sm z-0">
        <EnhancedButton 
          v-for="tab in tabs" 
          :key="tab.id"
          :variant="activeTab === tab.id ? 'primary' : 'ghost'"
          :active="activeTab === tab.id"
          size="md"
          :icon="{ name: tab.icon, position: 'left' }"
          class="rounded-t-lg rounded-b-none border-b-0 translate-y-[1px] transition-all duration-300"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </EnhancedButton>
      </div>

      <!-- Main Content -->
      <div class="bg-gray-50 flex-grow p-8 overflow-y-auto custom-scroll">
        
        <!-- Stock Tab -->
        <div v-if="activeTab === 'STOCK'" class="space-y-4">
          <div v-if="isShopLoading" class="rounded-2xl bg-white/90 border border-gray-200 p-6 text-center text-gray-700">
            Đang tải danh sách Set từ TCGdex... Vui lòng đợi.
          </div>
          <div v-if="shopError" class="rounded-2xl bg-red-50 border border-red-200 p-6 text-center text-red-700">
            Lỗi tải shop API: {{ shopError }}
          </div>
          <!-- Table of Contents (Sticky Navigation) -->
          <div v-if="!isShopLoading && Object.keys(groupedShopItems).length > 1" class="sticky -top-8 z-30 bg-white/95 backdrop-blur-sm py-3 px-8 -mx-8 mb-6 border-b border-gray-200 shadow-sm flex items-center gap-4">
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap border-r border-slate-200 pr-4">Jump to</span>
            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-grow py-1">
              <button 
                v-for="genName in Object.keys(groupedShopItems)" 
                :key="genName"
                @click="scrollToGen(genName)"
                class="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-500 hover:bg-white hover:border-indigo-400 hover:text-indigo-600 hover:shadow-md transition-all whitespace-nowrap"
              >
                {{ genName }}
              </button>
            </div>
          </div>

          <div v-if="!isShopLoading && Object.keys(groupedShopItems).length > 0" class="space-y-12">
            <div 
              v-for="(group, genName) in groupedShopItems" 
              :key="genName" 
              :id="`gen-${genName.replace(/\s+/g, '-').toLowerCase()}`"
              class="shop-gen-section scroll-mt-24"
            >
              <!-- Generation Header -->
              <div class="flex items-center gap-4 mb-6">
                <div class="h-8 w-1.5 bg-indigo-600 rounded-full"></div>
                <h2 class="text-2xl font-black text-slate-800 tracking-tight">{{ genName }}</h2>
                <div class="flex-grow h-[1px] bg-slate-200"></div>
              </div>

              <!-- Items Grid for this Generation -->
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <div 
                  v-for="item in group" 
                  :key="item.id"
                  class="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200 relative group flex flex-col transition-all duration-300 hover:shadow-xl"
                >
                  <!-- Lock Overlay -->
                  <div v-if="statsStore.level < item.requiredLevel" class="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center pointer-events-none">
                    <span class="text-4xl mb-2">🔒</span>
                    <div class="bg-red-600 text-white font-bold px-4 py-1.5 rounded-full uppercase tracking-widest text-xs shadow-xl border-2 border-red-800">
                      Lvl {{ item.requiredLevel }}
                    </div>
                  </div>

                  <!-- Product Image / Icon Area -->
                  <div class="h-32 bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden" :class="{ 'grayscale blur-[1px]': statsStore.level < item.requiredLevel }">
                    <div class="absolute -right-4 -bottom-4 text-7xl opacity-5 group-hover:scale-150 transition-transform duration-700 pointer-events-none">
                      {{ item.type === 'box' ? '📦' : '✨' }}
                    </div>
                    
                    <!-- Real Image from Registry -->
                    <template v-if="hasCustomVisual(item.type, item.id) && !itemImageErrors[item.id]">
                      <img 
                        :src="item.type === 'pack' ? getPackVisuals(item.id).front : getBoxVisuals(item.id).front" 
                        class="h-full w-auto object-contain drop-shadow-xl transform group-hover:scale-110 transition-transform duration-500 z-10"
                        :alt="item.name"
                        @error="handleImageError(item.id)"
                      />
                    </template>

                    <!-- Fallback Icon if no image or error -->
                    <div v-else class="text-6xl drop-shadow-lg transform group-hover:scale-110 transition-transform duration-500 z-10 select-none">
                      {{ item.type === 'box' ? '📦' : '🎁' }}
                    </div>
                    
                    <!-- Type Badge -->
                    <div class="absolute top-3 left-3 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter"
                      :class="item.type === 'box' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-blue-100 text-blue-700 border border-blue-200'"
                    >
                      {{ item.type }}
                    </div>
                  </div>

                  <!-- Product Info -->
                  <div class="p-3 flex flex-col gap-2" :class="{ 'grayscale opacity-70': statsStore.level < item.requiredLevel }">
                    <!-- Tên -->
                    <p class="font-semibold text-slate-800 text-sm leading-tight line-clamp-2">{{ item.name }}</p>

                    <!-- Price row + tooltip -->
                    <div class="flex items-center justify-between">
                      <div class="relative group/price">
                        <span class="text-indigo-700 font-black text-base">${{ item.buyPrice }}</span>

                        <!-- Tooltip chi tiết -->
                        <div class="absolute bottom-full left-0 mb-2 w-52 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl
                                    opacity-0 invisible group-hover/price:opacity-100 group-hover/price:visible
                                    transition-all duration-200 z-50 pointer-events-none border border-slate-700">
                          <div class="flex justify-between mb-1">
                            <span class="text-slate-400">EV gốc</span>
                            <span class="font-bold">${{ item.basePrice }}</span>
                          </div>
                          <div class="flex justify-between mb-1">
                            <span class="text-indigo-300">Bonus hiếm</span>
                            <span class="font-bold text-indigo-400">+{{ item.rarityBonusPercent }}%</span>
                          </div>
                          <div class="border-t border-slate-700 mt-2 pt-2 flex justify-between">
                            <span class="text-slate-400">≈ VNĐ</span>
                            <span class="font-bold text-emerald-400">{{ formatVND(item.buyPrice) }}</span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-slate-400">Bán ra</span>
                            <span class="font-bold text-yellow-400">≈ {{ formatVND(item.sellPrice) }}</span>
                          </div>
                          <!-- Arrow tooltip -->
                          <div class="absolute -bottom-1 left-4 w-2 h-2 bg-slate-800 rotate-45 border-r border-b border-slate-700"></div>
                        </div>
                      </div>

                      <!-- Nút Thêm: Icon + chữ -->
                      <button
                        :disabled="statsStore.level < item.requiredLevel"
                        @click.stop="cartStore.openAddModal(item.id)"
                        class="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
                               text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        🛒 Thêm
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Furniture Tab -->
        <div v-if="activeTab === 'FURNITURE'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div 
            v-for="item in Object.values(FURNITURE_ITEMS)" 
            :key="item.id"
            class="bg-white rounded-xl overflow-hidden shadow-md border border-gray-200 relative group flex flex-col"
          >
            <!-- Lock Overlay if Level not met -->
            <div v-if="statsStore.level < item.requiredLevel" class="absolute inset-0 bg-gray-900/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center pointer-events-none">
              <span class="text-4xl mb-2">🔒</span>
              <div class="bg-red-600 text-white font-bold px-4 py-1.5 rounded-full uppercase tracking-widest text-sm shadow-xl border-2 border-red-800">
                Unlock at Level {{ item.requiredLevel }}
              </div>
            </div>

            <div class="h-40 bg-gradient-to-br from-indigo-100 to-white flex items-center justify-center p-4 border-b border-gray-100" :class="{ 'grayscale blur-[1px]': statsStore.level < item.requiredLevel }">
               <div class="text-[80px] drop-shadow-xl transform group-hover:scale-110 transition-transform">
                 🪑
               </div>
            </div>
            <div class="p-5 flex flex-col flex-grow" :class="{ 'grayscale opacity-70': statsStore.level < item.requiredLevel }">
              <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-gray-900 text-lg leading-tight">{{ item.name }}</h3>
                <span v-if="gameStore.purchasedFurniture[item.id]" class="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-200">
                  Kho: {{ gameStore.purchasedFurniture[item.id] }}
                </span>
              </div>
              <p class="text-xs text-gray-500 mb-4 line-clamp-2 h-8">{{ item.description }}</p>
              
              <div class="mt-auto bg-gray-50 p-3 rounded-lg border border-gray-100 mb-4">
                 <div class="flex justify-between text-sm mb-1">
                   <span class="text-gray-500">Giá mua:</span>
                   <span class="font-bold text-gray-800">${{ item.buyPrice }}</span>
                 </div>
              </div>

              <EnhancedButton 
                variant="primary"
                size="md"
                fullWidth
                :disabled="statsStore.level < item.requiredLevel"
                :icon="{ name: 'heart', position: 'left' }"
                @click="purchaseFurniture(item.id, item.buyPrice)"
              >
                Mua Ngay (${{ item.buyPrice }})
              </EnhancedButton>
            </div>
          </div>
        </div>

        <!-- Staff Tab -->
        <div v-if="activeTab === 'STAFF'" class="flex flex-col gap-10">
          
          <!-- Hired Staff Management -->
          <div v-if="staffStore.hiredWorkers.length > 0" class="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
            <h2 class="text-xl font-black text-indigo-900 mb-6 flex items-center gap-2">
              📋 QUẢN LÝ NHÂN VIÊN HIỆN CÓ ({{ staffStore.hiredWorkers.length }})
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div v-for="hw in staffStore.hiredWorkers" :key="hw.instanceId" class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
                <div class="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-3xl shadow-inner">
                  👤
                </div>
                <div class="flex-grow">
                  <h4 class="font-bold text-gray-900">{{ getWorkerData(hw.dataId)?.name }}</h4>
                  <div class="flex flex-col gap-1.5 mt-1">
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold uppercase min-w-[60px]">Nhiệm vụ:</span>
                      <select 
                        v-model="hw.duty" 
                        @change="gameStore.changeWorkerDuty(hw.instanceId, hw.duty, (Object.keys(gameStore.placedCashiers).length === 1 ? Object.keys(gameStore.placedCashiers)[0] : (hw.targetDeskId ?? undefined)))"
                        class="text-xs font-bold text-indigo-700 bg-white border border-indigo-200 rounded px-1 py-0.5 focus:ring-0"
                      >
                        <option value="NONE">Đang nghỉ</option>
                        <option value="CHECKOUT">Thu ngân</option>
                        <option value="RESTOCK">Xếp hàng</option>
                      </select>
                    </div>

                    <!-- Chỉ hiển thị chọn quầy nếu là Thu ngân và có từ 2 quầy trở lên -->
                    <div v-if="hw.duty === 'CHECKOUT' && Object.keys(gameStore.placedCashiers).length > 1" class="flex items-center gap-2">
                       <span class="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold uppercase min-w-[60px]">Quầy:</span>
                       <select 
                         v-model="hw.targetDeskId"
                         @change="gameStore.changeWorkerDuty(hw.instanceId, hw.duty, hw.targetDeskId ?? undefined)"
                         class="text-xs font-bold text-emerald-700 bg-white border border-emerald-200 rounded px-1 py-0.5 focus:ring-0"
                       >
                         <option disabled value="">-- Chọn quầy --</option>
                         <option v-for="desk in gameStore.placedCashiers" :key="desk.id" :value="desk.id">
                           {{ desk.id.includes('default') ? 'Quầy mặc định' : desk.id.replace('cashier_', 'Quầy #') }}
                         </option>
                       </select>
                    </div>
                  </div>
                </div>
                <EnhancedButton 
                  variant="danger"
                  size="sm"
                  :icon="{ name: 'delete' }"
                  defaultText=""
                  @click="gameStore.terminateWorker(hw.instanceId)"
                  title="Đuổi việc"
                />
              </div>
            </div>
          </div>

          <!-- Recruitment App (GO Recruit) -->
          <div>
            <div class="flex items-center gap-3 mb-6">
               <div class="bg-indigo-600 text-white p-2 rounded-lg text-xl font-bold italic shadow-lg">GO</div>
               <h2 class="text-xl font-black text-gray-800 uppercase tracking-tight">Recruit - Ứng tuyển nhân sự</h2>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              <div v-for="w in WORKERS" :key="w.id" class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200 relative group flex flex-col">
                <!-- Level Lock -->
                <div v-if="statsStore.level < w.levelUnlocked" class="absolute inset-0 bg-gray-900/40 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center">
                  <span class="text-2xl mb-1">🔒</span>
                  <div class="bg-gray-800 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase">Level {{ w.levelUnlocked }} Required</div>
                </div>

                <div class="h-24 bg-gradient-to-r from-gray-100 to-white flex items-center px-6 gap-4 border-b border-gray-100">
                  <div class="w-16 h-16 bg-white rounded-full border-2 border-gray-200 flex items-center justify-center text-4xl shadow-sm">👤</div>
                  <div>
                    <h3 class="font-bold text-gray-900 text-lg leading-none">{{ w.name }}</h3>
                    <span class="text-[10px] text-gray-400 uppercase font-black tracking-widest mt-1 block">Level {{ w.levelUnlocked }}</span>
                  </div>
                </div>

                <div class="p-5 flex-grow">
                  <div class="grid grid-cols-2 gap-3 mb-5">
                    <div class="bg-gray-50 p-2 rounded-lg border border-gray-100">
                       <span class="text-[9px] text-gray-500 uppercase block">Checkout</span>
                       <span class="text-xs font-bold" :class="w.checkoutSpeed === 'Very Fast' ? 'text-green-600' : 'text-gray-700'">{{ w.checkoutSpeed }}</span>
                    </div>
                    <div class="bg-gray-50 p-2 rounded-lg border border-gray-100">
                       <span class="text-[9px] text-gray-500 uppercase block">Restock</span>
                       <span class="text-xs font-bold" :class="w.restockSpeed === 'Very Fast' ? 'text-green-600' : 'text-gray-700'">{{ w.restockSpeed }}</span>
                    </div>
                    <div class="bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                       <span class="text-[9px] text-indigo-500 uppercase block">Hiring Fee</span>
                       <span class="text-xs font-bold text-indigo-700">${{ w.hiringFee }}</span>
                    </div>
                    <div class="bg-orange-50 p-2 rounded-lg border border-orange-100">
                       <span class="text-[9px] text-orange-500 uppercase block">Daily Salary</span>
                       <span class="text-xs font-bold text-orange-700">${{ w.salary }}/day</span>
                    </div>
                  </div>

                  <EnhancedButton 
                    variant="primary"
                    size="md"
                    fullWidth
                    :disabled="statsStore.level < w.levelUnlocked || staffStore.hiredWorkers.some(hw => hw.dataId === w.id)"
                    :icon="{ name: staffStore.hiredWorkers.some(hw => hw.dataId === w.id) ? 'check' : 'user', position: 'left' }"
                    @click="hireWorker(w.id)"
                  >
                    {{ staffStore.hiredWorkers.some(hw => hw.dataId === w.id) ? 'Đang Thuê' : 'Thuê Ngay' }}
                  </EnhancedButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RENO BIGG Tab -->
        <div v-if="activeTab === 'RENO'" class="flex flex-col gap-6">
          <div class="bg-gradient-to-r from-orange-100 to-amber-50 p-8 rounded-2xl border border-orange-200 shadow-sm flex items-center justify-between">
            <div>
              <h2 class="text-4xl font-black text-orange-600 italic tracking-tighter flex items-center gap-4">
                RENO <span class="bg-orange-600 text-white px-3 py-1 rounded italic not-italic text-2xl">BIGG</span>
              </h2>
              <p class="text-orange-900/60 font-bold uppercase text-xs tracking-widest mt-2">Dịch vụ đập tường & nới rộng mặt bằng chuyên nghiệp</p>
            </div>
            <div class="text-right">
              <span class="block text-[10px] text-gray-500 font-bold uppercase">Expansion Status</span>
              <span class="text-2xl font-black text-gray-800">LEVEL {{ statsStore.expansionLevel }}</span>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div 
              v-for="exp in EXPANSIONS_LOT_A" 
              :key="exp.id"
              class="bg-white rounded-2xl overflow-hidden shadow-sm border-2 flex flex-col relative transition-all group"
              :class="[
                statsStore.expansionLevel >= exp.id ? 'border-green-500/30 bg-green-50/10' : 'border-gray-100',
                statsStore.expansionLevel + 1 === exp.id ? 'ring-2 ring-orange-500/20 scale-[1.02] shadow-xl z-10' : ''
              ]"
            >
              <!-- Purchased Overlay -->
              <div v-if="statsStore.expansionLevel >= exp.id" class="absolute inset-0 bg-green-500/5 backdrop-blur-[1px] z-10 pointer-events-none flex items-center justify-center">
                <div class="bg-green-500 text-white p-2 rounded-full shadow-lg transform -rotate-12 border-2 border-white">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>
                </div>
              </div>

              <!-- Level Lock -->
              <div v-if="statsStore.level < exp.requiredLevel && statsStore.expansionLevel < exp.id" class="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center">
                 <span class="text-3xl mb-1">🔒</span>
                 <p class="text-white font-black text-[10px] bg-red-600 px-3 py-1 rounded-full uppercase">Level {{ exp.requiredLevel }}</p>
              </div>

              <div class="h-40 bg-gray-100 flex items-center justify-center p-6 border-b border-gray-100">
                <div class="text-[90px] drop-shadow-lg group-hover:rotate-12 transition-transform duration-300">🔨</div>
              </div>

              <div class="p-5 flex-grow flex flex-col">
                <h3 class="font-black text-gray-800 text-sm uppercase tracking-tight mb-4">Shop Expansion {{ exp.id }}</h3>
                
                <div class="space-y-2 mb-6">
                  <div class="flex justify-between text-xs font-bold">
                    <span class="text-gray-400">Chi phí:</span>
                    <span class="text-gray-800">${{ exp.cost }}</span>
                  </div>
                  <div class="flex justify-between text-xs font-bold">
                    <span class="text-gray-400">Tăng diện tích:</span>
                    <span class="text-blue-600">+1 Unit</span>
                  </div>
                  <div class="flex justify-between text-xs font-bold">
                    <span class="text-gray-400">Thuế/Ngày:</span>
                    <span class="text-red-500">+${{ exp.rentIncrease }}</span>
                  </div>
                </div>

                <EnhancedButton 
                  v-if="statsStore.expansionLevel < exp.id"
                  variant="warning"
                  size="sm"
                  fullWidth
                  :disabled="statsStore.expansionLevel + 1 !== exp.id || statsStore.money < exp.cost || statsStore.level < exp.requiredLevel"
                  :icon="{ name: 'plus', position: 'left' }"
                  @click="purchaseExpansion"
                >
                  {{ statsStore.expansionLevel + 1 === exp.id ? 'Mở Rộng Ngay' : 'Đang Khóa' }}
                </EnhancedButton>
                <div v-else class="text-center font-black text-green-600 uppercase text-xs tracking-widest py-3">
                  Đã Hoàn Thành
                </div>
              </div>
            </div>
          </div>
        </div>


      </div>

      <AddToCartModal
        v-if="cartStore.addModalItemId"
        :item-id="cartStore.addModalItemId"
        @close="cartStore.closeAddModal()"
      />
    </div>
  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar { width: 8px; }
.custom-scroll::-webkit-scrollbar-track { background: #f3f4f6; }
.custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
.custom-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
