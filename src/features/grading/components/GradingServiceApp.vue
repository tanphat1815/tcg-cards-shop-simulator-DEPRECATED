<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGradingStore } from '../store/gradingStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { useStatsStore } from '../../stats/store/statsStore'
import { GRADING_FEE, GRADING_DURATION_DAYS } from '../config'
import TcgCard from '../../shared/components/TcgCard.vue'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ close: [] }>()

const gradingStore = useGradingStore()
const inventoryStore = useInventoryStore()
const apiStore = useApiStore()
const statsStore = useStatsStore()

const selectedCardIds = ref<Set<string>>(new Set())

// Cards available (in binder, not currently being graded)
const availableCards = computed(() => {
  return Object.keys(inventoryStore.personalBinder)
    .map(id => ({
      id,
      qty: inventoryStore.personalBinder[id],
      card: apiStore.flatCardMap[id],
    }))
    .filter(entry => entry.card != null)
})

const totalFee = computed(() => selectedCardIds.value.size * GRADING_FEE)

function toggleSelect(id: string) {
  if (selectedCardIds.value.has(id)) {
    selectedCardIds.value.delete(id)
  } else {
    selectedCardIds.value.add(id)
  }
}

function submitAll() {
  if (statsStore.money < totalFee.value) {
    alert(`Bạn cần $${totalFee.value} để gửi ${selectedCardIds.value.size} thẻ.`)
    return
  }

  for (const id of selectedCardIds.value) {
    const result = gradingStore.sendCardToGrading(id)
    if (!result.success) {
      console.warn(`[Grading] Failed for ${id}: ${result.reason}`)
      break
    }
  }
  selectedCardIds.value.clear()
}
</script>

<template>
  <div v-if="isOpen" class="grading-app-overlay" @click.self="emit('close')">
    <div class="grading-app-panel">
      <header>
        <div class="header-left">
          <span class="app-icon">🏆</span>
          <h2>PSA Grading Service</h2>
        </div>
        <button class="close-btn" @click="emit('close')">✕</button>
      </header>

      <div class="service-info">
        <div class="info-item">
          <span class="label">Phí:</span>
          <span class="value">${{ GRADING_FEE }}</span>
        </div>
        <div class="info-item">
          <span class="label">Time:</span>
          <span class="value">{{ GRADING_DURATION_DAYS }}d</span>
        </div>
      </div>

      <div class="main-content">
        <!-- Danh sách pending -->
        <section class="pending-section">
          <h3>Thẻ đang chấm ({{ gradingStore.pendingGrading.length }})</h3>
          <div class="pending-scroll custom-scrollbar">
            <ul v-if="gradingStore.pendingGrading.length > 0">
              <li v-for="p in gradingStore.pendingGrading" :key="p.cardId + p.sentOnDay">
                <div class="pending-item">
                  <div class="card-mini-info">
                    <span class="card-name">{{ apiStore.flatCardMap[p.cardId]?.name ?? p.cardId }}</span>
                  </div>
                  <div class="return-info">
                    <span v-if="p.returnOnDay <= statsStore.currentDay" class="days-left text-green-400 font-bold">✨ Sẵn sàng nhận!</span>
                    <span v-else-if="p.returnOnDay === statsStore.currentDay + 1" class="days-left text-blue-400">🚚 Về vào ngày mai</span>
                    <span v-else class="days-left">Giao trả Ngày {{ p.returnOnDay }} (còn {{ p.returnOnDay - statsStore.currentDay }} ngày)</span>
                  </div>
                </div>
              </li>
            </ul>
            <div v-else class="empty-state">
              <p>Chưa có thẻ nào đang được gửi.</p>
            </div>
          </div>
        </section>

        <!-- Picker -->
        <section class="picker-section">
          <h3>Chọn thẻ từ Binder:</h3>
          <div class="cards-grid-container custom-scrollbar">
            <div v-if="availableCards.length > 0" class="cards-grid">
              <div
                v-for="entry in availableCards" :key="entry.id"
                class="card-wrapper"
                :class="{ selected: selectedCardIds.has(entry.id) }"
                @click="toggleSelect(entry.id)"
              >
                <TcgCard :card="entry.card" :is-flipped="true" size="small" :show-price="false" />
                <div class="qty-badge">×{{ entry.qty }}</div>
                <div class="selection-overlay">
                  <div class="check-icon">✓</div>
                </div>
              </div>
            </div>
            <div v-else class="empty-state">
              <p>Bạn không có thẻ nào trong binder.</p>
            </div>
          </div>
        </section>
      </div>

      <footer>
        <div class="footer-stats">
          <div class="stat">
            <span class="label">Đã chọn:</span>
            <span class="value">{{ selectedCardIds.size }} thẻ</span>
          </div>
          <div class="stat">
            <span class="label">Tổng phí:</span>
            <span class="value highlight">${{ totalFee }}</span>
          </div>
        </div>
        <EnhancedButton
          variant="success" size="lg"
          :disabled="selectedCardIds.size === 0 || statsStore.money < totalFee"
          @click="submitAll"
        >
          GỬI ĐI CHẤM ĐIỂM
        </EnhancedButton>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.grading-app-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
}

.grading-app-panel {
  flex: 1;
  background: #1a1a1a;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #eee;
}

header {
  padding: 10px 16px;
  background: #252525;
  border-bottom: 2px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-icon {
  font-size: 1.5rem;
}

header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

.close-btn {
  background: transparent;
  border: none;
  color: #666;
  font-size: 1.25rem;
  cursor: pointer;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #fff;
}

.service-info {
  display: flex;
  gap: 32px;
  padding: 12px 24px;
  background: #2a2a2a;
  border-bottom: 1px solid #333;
}

.info-item {
  display: flex;
  gap: 8px;
  font-size: 0.9rem;
}

.info-item .label {
  color: #888;
}

.info-item .value {
  color: #fbbf24;
  font-weight: 700;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto; /* This is now the main scrollable area */
  padding-bottom: 20px;
}

.pending-section {
  background: #1e1e1e;
  border-bottom: 1px solid #333;
  flex-shrink: 0; /* Don't shrink it */
}

.pending-section h3, .picker-section h3 {
  padding: 10px 16px;
  margin: 0;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #888;
  letter-spacing: 0.5px;
}

.pending-scroll {
  padding: 0 12px 12px;
}

.pending-scroll ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pending-item {
  background: #2a2a2a;
  padding: 12px;
  border-radius: 8px;
  border-left: 3px solid #60a5fa;
}

.card-name {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
  color: #fff;
}

.return-info {
  font-size: 0.75rem;
  color: #888;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-style: italic;
  font-size: 0.9rem;
  text-align: center;
  padding: 20px;
}

.picker-section {
  background: #1a1a1a;
  flex-shrink: 0;
}

.cards-grid-container {
  padding: 0 12px 12px;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr); /* 4 columns */
  gap: 12px;
}

.card-wrapper {
  position: relative;
  cursor: pointer;
  transition: transform 0.2s, filter 0.2s;
}

.card-wrapper:hover {
  transform: translateY(-4px);
}

.card-wrapper.selected {
  transform: scale(0.95);
}

.qty-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: #3b82f6;
  color: white;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 800;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.selection-overlay {
  position: absolute;
  inset: 0;
  background: rgba(59, 130, 246, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  border-radius: 4px;
  border: 2px solid #3b82f6;
}

.card-wrapper.selected .selection-overlay {
  opacity: 1;
}

.check-icon {
  background: #3b82f6;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  box-shadow: 0 2px 10px rgba(0,0,0,0.5);
}

footer {
  padding: 20px 32px;
  background: #252525;
  border-top: 2px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-stats {
  display: flex;
  gap: 40px;
}

.stat {
  display: flex;
  flex-direction: column;
}

.stat .label {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #666;
  margin-bottom: 2px;
}

.stat .value {
  font-size: 1.25rem;
  font-weight: 700;
}

.stat .value.highlight {
  color: #10b981;
}

/* Custom Scrollbar */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: #1a1a1a;
}
::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #444;
}
</style>
