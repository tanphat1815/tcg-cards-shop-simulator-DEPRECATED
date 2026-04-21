<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTradeInStore } from '../store/tradeInStore'
import { useApiStore } from '../store/apiStore'
import BaseModal from '../../shared/components/BaseModal.vue'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'
import TcgCard from '../../shared/components/TcgCard.vue'

const tradeStore = useTradeInStore()
const apiStore = useApiStore()

const offerInput = ref<string>('')

// Card data lấy từ apiStore
const cardData = computed(() => {
  const id = tradeStore.activeTrade?.cardId
  if (!id) return null
  return apiStore.flatCardMap[id] ?? null
})

// Reset input khi modal mới mở
watch(() => tradeStore.showModal, (open) => {
  if (open && tradeStore.activeTrade) {
    // Pre-fill với askPrice để Player có điểm neo
    offerInput.value = tradeStore.activeTrade.askPrice.toFixed(2)
  }
})

// Auto-fill khi NPC counter-offer
watch(() => tradeStore.activeTrade?.currentCounterPrice, (newCounter) => {
  if (newCounter !== null && newCounter !== undefined) {
    // Gợi ý Player xài giá counter làm điểm khởi đầu
    offerInput.value = newCounter.toFixed(2)
  }
})

function submit() {
  const price = parseFloat(offerInput.value)
  tradeStore.submitOffer(price)
}

function reject() {
  tradeStore.rejectTrade()
}

function close() {
  tradeStore.closeModal()
}

// Disable input/nút khi đã ACCEPTED hoặc REJECTED
const isDealClosed = computed(() =>
  tradeStore.activeTrade?.phase === 'ACCEPTED' ||
  tradeStore.activeTrade?.phase === 'REJECTED'
)

const currentAskDisplay = computed(() => {
  const t = tradeStore.activeTrade
  if (!t) return '$0.00'
  // Nếu NPC đã counter → hiển thị giá counter làm "ask hiện tại"
  const p = t.currentCounterPrice ?? t.askPrice
  return `$${p.toFixed(2)}`
})
</script>

<template>
  <BaseModal
    :isOpen="tradeStore.showModal"
    title="🃏 Thu Mua Thẻ Lẻ"
    size="lg"
    @close="close"
  >
    <div v-if="tradeStore.activeTrade && cardData" class="trade-in-body">
      <!-- CỘT TRÁI: Ảnh thẻ + giá -->
      <div class="trade-card-column">
        <TcgCard :card="cardData" :is-flipped="true" size="normal" :show-price="false" />

        <div class="price-block">
          <div class="price-row">
            <span class="label">Market Price:</span>
            <span class="value">${{ tradeStore.activeTrade.marketPrice.toFixed(2) }}</span>
          </div>
          <div class="price-row emphasis">
            <span class="label">Giá chào:</span>
            <span class="value">{{ currentAskDisplay }}</span>
          </div>
        </div>
      </div>

      <!-- CỘT PHẢI: Form đàm phán -->
      <div class="trade-form-column">
        <div class="card-info-header">
           <h3 class="card-title">{{ cardData.name }}</h3>
           <p class="card-rarity">{{ cardData.rarity || 'Common' }}</p>
        </div>

        <!-- Status message từ NPC -->
        <div
          class="status-bubble"
          :class="{
            'bubble-accept': tradeStore.activeTrade.phase === 'ACCEPTED',
            'bubble-reject': tradeStore.activeTrade.phase === 'REJECTED',
            'bubble-counter': tradeStore.activeTrade.phase === 'COUNTER_OFFERED',
          }"
        >
          {{ tradeStore.activeTrade.statusMessage }}
        </div>

        <!-- Input offer -->
        <div v-if="!isDealClosed" class="offer-form">
          <label class="offer-label">Nhập giá bạn muốn mua:</label>
          <div class="offer-input-wrapper">
            <span class="currency-symbol">$</span>
            <input
              v-model="offerInput"
              type="number"
              step="0.01"
              min="0"
              class="offer-input"
              placeholder="0.00"
              @keyup.enter="submit"
            />
          </div>

          <p class="attempts-info">
            Còn <strong>{{ tradeStore.activeTrade.attemptsLeft }}</strong> lần thương lượng
          </p>

          <div class="action-buttons">
            <EnhancedButton
              variant="success"
              size="md"
              @click="submit"
              :disabled="tradeStore.activeTrade.attemptsLeft <= 0"
            >
              Đưa ra mức giá
            </EnhancedButton>
            <EnhancedButton
              variant="danger"
              size="md"
              @click="reject"
            >
              Từ chối
            </EnhancedButton>
          </div>
        </div>

        <!-- Deal đóng → hiện nút close -->
        <div v-else class="close-block">
          <EnhancedButton variant="primary" size="lg" fullWidth @click="close">
            Đóng
          </EnhancedButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.trade-in-body {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 24px;
  padding: 8px;
}

.trade-card-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.price-block {
  width: 100%;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  padding: 12px 14px;
}

.price-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  padding: 4px 0;
  color: #cbd5e1;
}

.price-row.emphasis {
  font-weight: 700;
  color: #fbbf24;
  border-top: 1px dashed rgba(148, 163, 184, 0.3);
  margin-top: 4px;
  padding-top: 8px;
}

.trade-form-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #f1f5f9;
  margin: 0;
}

.card-rarity {
  color: #94a3b8;
  font-size: 0.85rem;
  margin: 0;
}

.status-bubble {
  background: rgba(30, 41, 59, 0.7);
  border-left: 4px solid #3b82f6;
  padding: 12px 14px;
  border-radius: 6px;
  font-style: italic;
  color: #e2e8f0;
  min-height: 56px;
  display: flex;
  align-items: center;
}

.bubble-accept { border-left-color: #10b981; color: #6ee7b7; }
.bubble-reject { border-left-color: #ef4444; color: #fca5a5; }
.bubble-counter { border-left-color: #f59e0b; color: #fcd34d; }

.offer-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.offer-label {
  color: #cbd5e1;
  font-weight: 600;
  font-size: 0.95rem;
}

.offer-input-wrapper {
  display: flex;
  align-items: center;
  background: #0f172a;
  border: 2px solid #334155;
  border-radius: 8px;
  padding: 0 12px;
  transition: border-color 0.2s;
}
.offer-input-wrapper:focus-within { border-color: #3b82f6; }

.currency-symbol {
  color: #94a3b8;
  font-weight: 700;
  font-size: 1.2rem;
  margin-right: 8px;
}

.offer-input {
  background: transparent;
  border: none;
  color: #f1f5f9;
  font-size: 1.25rem;
  font-weight: 700;
  padding: 12px 0;
  width: 100%;
  outline: none;
}

.attempts-info {
  color: #94a3b8;
  font-size: 0.85rem;
  margin: 0;
  text-align: center;
}
.attempts-info strong { color: #fbbf24; }

.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.action-buttons > * { flex: 1; }

.close-block {
  margin-top: 16px;
}
</style>
