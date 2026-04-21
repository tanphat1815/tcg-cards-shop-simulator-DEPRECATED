<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { useInventoryStore } from '../store/inventoryStore'
import { useApiStore } from '../store/apiStore'
import { useCardDetailStore } from '../store/cardDetailStore'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'
import TcgCard from '../../shared/components/TcgCard.vue'

const gameStore = useGameStore()
const inventoryStore = useInventoryStore()
const apiStore = useApiStore()
const detailStore = useCardDetailStore()

const binderItems = computed(() => {
  return Object.keys(inventoryStore.personalBinder).map(cardId => {
    return {
      id: cardId,
      card: apiStore.flatCardMap[cardId] || null,
      quantity: inventoryStore.personalBinder[cardId]
    }
  })
})

// ─── Pagination Logic ──────────────────────────────────────────────────────
const CARDS_PER_PAGE = 6 // Per page (Left or Right)
const CARDS_PER_VIEW = CARDS_PER_PAGE * 2 // 12 cards total in one "open book" view
const currentPage = ref(0) // View index

const totalViews = computed(() => Math.ceil(binderItems.value.length / CARDS_PER_VIEW) || 1)

const leftPageCards = computed(() => {
  const start = currentPage.value * CARDS_PER_VIEW
  return binderItems.value.slice(start, start + CARDS_PER_PAGE)
})

const rightPageCards = computed(() => {
  const start = currentPage.value * CARDS_PER_VIEW + CARDS_PER_PAGE
  return binderItems.value.slice(start, start + CARDS_PER_PAGE)
})

const nextPage = () => {
  if (currentPage.value < totalViews.value - 1) currentPage.value++
}

const prevPage = () => {
  if (currentPage.value > 0) currentPage.value--
}

import { getRawPrice } from '../../shared/utils/currency'

// ─── Value Calculation ─────────────────────────────────────────────────────
const totalEstimatedValue = computed(() => {
  let total = 0
  binderItems.value.forEach(item => {
    if (!item.card) return
    total += getRawPrice(item.card) * item.quantity
  })
  return total.toFixed(2)
})

// Tự động load những card còn thiếu thông tin
const loadMissingCards = () => {
  if (!gameStore.showBinderMenu) return
  
  binderItems.value.forEach(item => {
    if (!item.card) {
      apiStore.ensureCardInCache(item.id)
    }
  })
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
    <!-- Close Button Top Right -->
    <div class="absolute top-6 right-6 z-[200]">
      <EnhancedButton
        variant="icon"
        size="lg"
        :icon="{ name: 'close' }"
        defaultText=""
        @click="gameStore.setShowBinderMenu(false)"
        class="close-btn"
      />
    </div>

    <!-- MAIN BINDER CONTAINER -->
    <div class="binder-container">
      <!-- Binder Cover/Body -->
      <div class="binder-body">
        
        <!-- LEFT PAGE -->
        <div class="binder-page left-page">
          <div class="page-content">
            <div v-if="leftPageCards.length === 0" class="empty-page">
              <span class="text-4xl opacity-30">🎴</span>
              <p>Trang này còn trống</p>
            </div>
            <div v-else class="cards-grid">
              <div v-for="item in leftPageCards" :key="item.id" v-memo="[item.id, item.quantity, !!item.card]" class="binder-card-slot">
                <TcgCard 
                  v-if="item.card"
                  :card="item.card"
                  :is-flipped="true"
                  :show-quantity="true"
                  :quantity="item.quantity"
                  :show-price="true"
                  size="small"
                  @click="detailStore.openCard(item.card)"
                />
                <div v-else class="card-loading-placeholder">
                  <div class="spinner"></div>
                  <span>Loading...</span>
                </div>
              </div>
            </div>
          </div>
          <!-- Page Number Left -->
          <div class="page-number left">Page {{ currentPage * 2 + 1 }}</div>
        </div>

        <!-- RINGS (CENTER) -->
        <div class="binder-spine">
          <div class="ring" v-for="i in 6" :key="i"></div>
        </div>

        <!-- RIGHT PAGE -->
        <div class="binder-page right-page">
          <div class="page-content">
            <div v-if="rightPageCards.length === 0" class="empty-page">
              <span class="text-4xl opacity-30">🎴</span>
              <p>Trang này còn trống</p>
            </div>
            <div v-else class="cards-grid">
              <div v-for="item in rightPageCards" :key="item.id" v-memo="[item.id, item.quantity, !!item.card]" class="binder-card-slot">
                <TcgCard 
                  v-if="item.card"
                  :card="item.card"
                  :is-flipped="true"
                  :show-quantity="true"
                  :quantity="item.quantity"
                  :show-price="true"
                  size="small"
                  @click="detailStore.openCard(item.card)"
                />
                <div v-else class="card-loading-placeholder">
                  <div class="spinner"></div>
                  <span>Loading...</span>
                </div>
              </div>
            </div>
          </div>
          <!-- Page Number Right -->
          <div class="page-number right">Page {{ currentPage * 2 + 2 }}</div>
        </div>

      </div>

      <!-- Navigation & Info Footer -->
      <div class="binder-footer">
        <div class="nav-controls">
          <button @click="prevPage" :disabled="currentPage === 0" class="nav-btn prev">
            <span class="icon">◀</span> TRANG TRƯỚC
          </button>
          
          <div class="page-indicator">
            VIEW {{ currentPage + 1 }} / {{ totalViews }}
          </div>

          <button @click="nextPage" :disabled="currentPage >= totalViews - 1" class="nav-btn next">
            TRANG SAU <span class="icon">▶</span>
          </button>
        </div>

        <div class="binder-stats">
          <div class="stat-item">
            <span class="label">Tổng số thẻ:</span>
            <span class="value">{{ binderItems.length }}</span>
          </div>
          <div class="stat-item">
            <span class="label">Giá trị ước tính:</span>
            <span class="value text-green-400">${{ totalEstimatedValue }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.binder-overlay {
  position: absolute;
  inset: 0;
  z-index: 150;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  padding: 2rem;
}

.close-btn {
  filter: drop-shadow(0 0 10px rgba(0,0,0,0.5));
}

.binder-container {
  width: 95%;
  max-width: 1400px;
  height: 90vh;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.binder-body {
  flex-grow: 1;
  display: flex;
  background: #2b1d12; /* Leather color */
  border-radius: 20px;
  padding: 15px;
  box-shadow: 
    0 25px 50px -12px rgba(0, 0, 0, 0.8),
    inset 0 0 40px rgba(0,0,0,0.5);
  border: 4px solid #1a110a;
  position: relative;
  overflow: hidden;
}

.binder-spine {
  width: 40px; /* Reduced from 60px */
  height: 100%;
  background: linear-gradient(to right, #1a110a, #3d2b1d, #1a110a);
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: center;
  z-index: 10;
  box-shadow: 0 0 20px rgba(0,0,0,0.5);
}

.ring {
  width: 30px;
  height: 10px;
  background: linear-gradient(to bottom, #d1d5db, #9ca3af, #4b5563);
  border-radius: 5px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.3);
}

.binder-page {
  flex: 1;
  background: #fdfbf7; /* Paper color */
  position: relative;
  padding: 10px 15px; /* Further reduced padding */
  overflow: hidden;
}

.left-page {
  border-radius: 10px 0 0 10px;
  box-shadow: inset -20px 0 30px rgba(0,0,0,0.05);
}

.right-page {
  border-radius: 0 10px 10px 0;
  box-shadow: inset 20px 0 30px rgba(0,0,0,0.05);
}

.page-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 10px;
  height: 100%;
  align-content: stretch;
  justify-content: center;
  align-items: center;
}

.binder-card-slot {
  width: 85%; /* Reduced width of the card within its slot */
  margin: 0 auto; /* Center it */
  aspect-ratio: 230 / 322;
  position: relative;
}

.empty-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-weight: bold;
  gap: 1rem;
}

.page-number {
  position: absolute;
  bottom: 15px;
  font-size: 0.75rem;
  font-weight: 900;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.left { left: 20px; }
.right { right: 20px; }

/* Footer Styling */
.binder-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(30, 41, 59, 0.5);
  padding: 1rem 2rem;
  border-radius: 15px;
  border: 1px solid rgba(255,255,255,0.1);
  color: white;
}

.nav-controls {
  display: flex;
  gap: 2rem;
  align-items: center;
}

.nav-btn {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  border: none;
  padding: 0.5rem 1.5rem;
  border-radius: 10px;
  font-weight: 900;
  font-size: 0.8rem;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-btn:not(:disabled):hover {
  transform: scale(1.05);
  box-shadow: 0 0 15px rgba(79, 70, 229, 0.4);
}

.page-indicator {
  font-weight: 900;
  font-size: 0.9rem;
  letter-spacing: 0.2rem;
  color: #a5b4fc;
}

.binder-stats {
  display: flex;
  gap: 2rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.stat-item .label {
  font-size: 0.65rem;
  text-transform: uppercase;
  color: #94a3b8;
  font-weight: 700;
}

.stat-item .value {
  font-size: 1.1rem;
  font-weight: 900;
}

.card-loading-placeholder {
  width: 100%;
  height: 100%;
  background: #edf2f7;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #a0aec0;
  font-size: 0.7rem;
  font-weight: bold;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e2e8f0;
  border-top-color: #4a5568;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Mobile responsiveness */
@media (max-width: 1024px) {
  .binder-body {
    flex-direction: column;
    overflow-y: auto;
  }
  .binder-spine {
    width: 100%;
    height: 40px;
    flex-direction: row;
  }
  .ring {
    width: 10px;
    height: 20px;
  }
}
</style>
