<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { useInventoryStore } from '../store/inventoryStore'
import { useGradingStore } from '../../grading/store/gradingStore'
import { useApiStore } from '../store/apiStore'
import { useCardDetailStore } from '../store/cardDetailStore'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'
import TcgCard from '../../shared/components/TcgCard.vue'
import SlabDisplay from '../../shared/components/SlabDisplay.vue'
import { getRawPrice } from '../../shared/utils/currency'

const gameStore = useGameStore()
const inventoryStore = useInventoryStore()
const gradingStore = useGradingStore()
const apiStore = useApiStore()
const detailStore = useCardDetailStore()

type TabKey = 'standard' | 'graded'
const activeTab = ref<TabKey>('standard')

// ── Filter state ──────────────────────────────────
interface BinderFilters {
  energyType: string     // 'All' | 'Fire' | 'Water' | ...
  rarity: string         // 'All' | 'Common' | 'Rare' | ...
  cardType: string       // 'All' | 'Holo' | 'VMAX' | 'VSTAR' | 'EX' | ...
  minGrade: number       // 0 = no filter, 1..10 = filter >= này (chỉ cho Graded tab)
}

const filters = ref<BinderFilters>({
  energyType: 'All',
  rarity: 'All',
  cardType: 'All',
  minGrade: 0,
})

// Options cho dropdown
const ENERGY_TYPES = ['All', 'Fire', 'Water', 'Grass', 'Lightning', 'Psychic',
                       'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless']
const RARITIES = ['All', 'Common', 'Uncommon', 'Rare', 'Rare Holo', 'Ultra Rare',
                   'Secret Rare', 'Hyper Rare']
const CARD_TYPES = ['All', 'Normal', 'Holo', 'VMAX', 'VSTAR', 'EX', 'V', 'Full Art']

/**
 * Map raw card + filters → pass/fail.
 */
function matchesFilters(card: any, filters: BinderFilters, grade?: number): boolean {
  if (!card) return false

  // Energy Type filter
  if (filters.energyType !== 'All') {
    const types: string[] = card.types ?? []
    if (!types.includes(filters.energyType)) return false
  }

  // Rarity filter
  if (filters.rarity !== 'All') {
    const cardRarity = (card.rarity ?? 'Common').toLowerCase()
    const filterRarity = filters.rarity.toLowerCase()
    if (!cardRarity.includes(filterRarity)) return false
  }

  // Card Type filter
  if (filters.cardType !== 'All') {
    const rarityStr = (card.rarity ?? '').toUpperCase()
    switch (filters.cardType) {
      case 'VMAX':     if (!rarityStr.includes('VMAX')) return false; break
      case 'VSTAR':    if (!rarityStr.includes('VSTAR')) return false; break
      case 'EX':       if (!rarityStr.includes('EX') || rarityStr.includes('VMAX')) return false; break
      case 'V':
        if (!rarityStr.match(/\bV\b/) || rarityStr.includes('VMAX') || rarityStr.includes('VSTAR')) return false
        break
      case 'Holo':     if (!rarityStr.includes('HOLO')) return false; break
      case 'Full Art': if (!rarityStr.includes('FULL ART')) return false; break
      case 'Normal':
        if (rarityStr.match(/HOLO|VMAX|VSTAR|EX|FULL ART|ULTRA|SECRET/)) return false
        break
    }
  }

  // Grade filter
  if (grade !== undefined && filters.minGrade > 0) {
    if (grade < filters.minGrade) return false
  }

  return true
}

// ── Standard Binder ────────────────────────────
const filteredStandardCards = computed(() => {
  return Object.keys(inventoryStore.personalBinder).map(id => ({
    id,
    card: apiStore.flatCardMap[id],
    qty: inventoryStore.personalBinder[id],
  })).filter(entry =>
    entry.card && matchesFilters(entry.card, filters.value)
  )
})

// ── Graded Binder ─────────────────────────────────────
const filteredGradedSlabs = computed(() => {
  return gradingStore.gradedBinder.map(slab => ({
    slab,
    card: apiStore.flatCardMap[slab.cardId],
  })).filter(entry =>
    entry.card && matchesFilters(entry.card, filters.value, entry.slab.grade)
  ).sort((a, b) => b.slab.grade - a.slab.grade)  // Sort grade desc
})

// ── Pagination Logic (Apply on filtered results) ───────────────────────────
const CARDS_PER_PAGE = 12
const currentPage = ref(0)

const activeItems = computed(() => {
  return activeTab.value === 'standard' ? filteredStandardCards.value : filteredGradedSlabs.value
})

const totalPages = computed(() => Math.ceil(activeItems.value.length / CARDS_PER_PAGE) || 1)

const paginatedStandardCards = computed(() => {
  if (activeTab.value !== 'standard') return []
  const start = currentPage.value * CARDS_PER_PAGE
  return filteredStandardCards.value.slice(start, start + CARDS_PER_PAGE)
})

const paginatedGradedSlabs = computed(() => {
  if (activeTab.value !== 'graded') return []
  const start = currentPage.value * CARDS_PER_PAGE
  return filteredGradedSlabs.value.slice(start, start + CARDS_PER_PAGE)
})

const paginatedItemsLength = computed(() => {
  return activeTab.value === 'standard' ? paginatedStandardCards.value.length : paginatedGradedSlabs.value.length
})

const nextPage = () => { if (currentPage.value < totalPages.value - 1) currentPage.value++ }
const prevPage = () => { if (currentPage.value > 0) currentPage.value-- }

// Reset page when tab/filters change
watch([activeTab, filters], () => { currentPage.value = 0 }, { deep: true })

// ── Stats ──────────────────────────────────────────────────────────────────
const totalEstimatedValue = computed(() => {
  let total = 0
  filteredStandardCards.value.forEach(item => {
    total += getRawPrice(item.card) * item.qty
  })
  filteredGradedSlabs.value.forEach(item => {
    const base = getRawPrice(item.card)
    total += base * item.slab.priceMultiplier
  })
  return total.toFixed(2)
})

// Tự động load những card còn thiếu thông tin
const loadMissingCards = async () => {
  if (!gameStore.showBinderMenu) return
  console.log('[BinderMenu] Opening binder, checking for missing cards...');
  
  // Lấy toàn bộ ID từ Binder (Standard + Graded)
  const standardIds = Object.keys(inventoryStore.personalBinder)
  const gradedIds = gradingStore.gradedBinder.map(slab => slab.cardId)
  
  // Gộp lại và loại bỏ trùng lặp
  const allNeededIds = [...new Set([...standardIds, ...gradedIds])]
  
  // Tải theo lô (Batch Hydration)
  if (allNeededIds.length > 0) {
    await apiStore.ensureCardsInCache(allNeededIds)
  }
}

watch(() => gameStore.showBinderMenu, (show) => {
  if (show) loadMissingCards()
})

onMounted(() => {
  if (gameStore.showBinderMenu) loadMissingCards()
})
</script>

<template>
  <div v-if="gameStore.showBinderMenu" class="binder-overlay">
    <!-- Close button -->
    <div class="absolute top-6 right-6 z-[200]">
      <EnhancedButton variant="icon" :icon="{ name: 'close' }" @click="gameStore.setShowBinderMenu(false)" />
    </div>

    <div class="binder-container">
      <!-- Header with Tabs -->
      <header class="binder-header">
        <div class="tabs">
          <button
            class="tab-btn" :class="{ active: activeTab === 'standard' }"
            @click="activeTab = 'standard'"
          >
            <span class="icon">🎴</span>
            Standard Cards
            <span class="count">{{ Object.keys(inventoryStore.personalBinder).length }}</span>
          </button>
          <button
            class="tab-btn" :class="{ active: activeTab === 'graded' }"
            @click="activeTab = 'graded'"
          >
            <span class="icon">🏆</span>
            Graded Cards
            <span class="count">{{ gradingStore.gradedBinder.length }}</span>
          </button>
        </div>

        <!-- Filter Bar -->
        <div class="filter-bar">
          <div class="filter-group">
            <label>Hệ:</label>
            <select v-model="filters.energyType">
              <option v-for="t in ENERGY_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Rarity:</label>
            <select v-model="filters.rarity">
              <option v-for="r in RARITIES" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Type:</label>
            <select v-model="filters.cardType">
              <option v-for="t in CARD_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div v-if="activeTab === 'graded'" class="filter-group">
            <label>Min Grade:</label>
            <select v-model.number="filters.minGrade">
              <option :value="0">Any</option>
              <option v-for="g in [10, 9, 8, 7, 6, 5]" :key="g" :value="g">≥ {{ g }}</option>
            </select>
          </div>
        </div>
      </header>

      <!-- Grid Content -->
      <div class="binder-content">
        <div v-if="paginatedItemsLength === 0" class="empty-state">
          <span class="icon">🔍</span>
          <p>Không tìm thấy thẻ nào phù hợp với bộ lọc.</p>
        </div>
        
        <div v-else class="cards-grid">
          <template v-if="activeTab === 'standard'">
            <div v-for="entry in paginatedStandardCards" :key="entry.id" class="card-slot">
              <TcgCard 
                :card="entry.card" 
                :is-flipped="true" 
                :show-quantity="true"
                :quantity="entry.qty" 
                :show-price="true"
                size="small"
                @click="detailStore.openCard(entry.card)" 
              />
            </div>
          </template>
          
          <template v-else>
            <div v-for="entry in paginatedGradedSlabs" :key="entry.slab.slabId" class="slab-slot">
              <SlabDisplay 
                :slab="entry.slab" 
                :card="entry.card"
                @click="detailStore.openCard(entry.card)" 
              />
            </div>
          </template>
        </div>
      </div>

      <!-- Navigation & Stats Footer -->
      <footer class="binder-footer">
        <div class="nav-controls">
          <button @click="prevPage" :disabled="currentPage === 0" class="nav-btn prev">
            ◀ PREV
          </button>
          <div class="page-indicator">
            PAGE {{ currentPage + 1 }} / {{ totalPages }}
          </div>
          <button @click="nextPage" :disabled="currentPage >= totalPages - 1" class="nav-btn next">
            NEXT ▶
          </button>
        </div>

        <div class="binder-stats">
          <div class="stat-item">
            <span class="label">Tổng giá trị Binder:</span>
            <span class="value text-green-400">${{ totalEstimatedValue }}</span>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.binder-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  padding: 2rem;
}

.binder-container {
  width: 95%;
  max-width: 1200px;
  height: 90vh;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border-radius: 20px;
  border: 4px solid #333;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
  overflow: hidden;
}

.binder-header {
  padding: 20px;
  background: #252525;
  border-bottom: 2px solid #333;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.tabs {
  display: flex;
  gap: 10px;
}

.tab-btn {
  padding: 10px 20px;
  background: #333;
  border: none;
  border-radius: 8px;
  color: #888;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.2s;
}

.tab-btn.active {
  background: #4f46e5;
  color: white;
}

.tab-btn .count {
  background: rgba(0,0,0,0.3);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8rem;
}

.filter-bar {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-group label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #666;
  text-transform: uppercase;
}

.filter-group select {
  background: #1a1a1a;
  border: 1px solid #444;
  color: #eee;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
}

.binder-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background: #141414;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 20px;
  justify-content: center;
}

.card-slot, .slab-slot {
  display: flex;
  justify-content: center;
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #444;
  gap: 10px;
}

.empty-state .icon { font-size: 3rem; }

.binder-footer {
  padding: 15px 30px;
  background: #252525;
  border-top: 2px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-controls {
  display: flex;
  align-items: center;
  gap: 20px;
}

.nav-btn {
  background: #333;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.page-indicator {
  font-size: 0.9rem;
  font-weight: 700;
  color: #666;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.stat-item .label {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: #666;
  font-weight: 700;
}

.stat-item .value {
  font-size: 1.2rem;
  font-weight: 800;
}

/* Custom Scrollbar */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: #1a1a1a; }
::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
</style>
