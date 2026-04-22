<script setup lang="ts">
import { computed } from 'vue'
import { useCheckoutStore, DENOMINATIONS } from '../store/checkoutStore'

const store = useCheckoutStore()

const notes = computed(() => DENOMINATIONS.filter(d => d.isNote))
const coins = computed(() => DENOMINATIONS.filter(d => !d.isNote))

// Số lượng mệnh giá đang được thối
const getCount = (denomCents: number): number => {
  return store.changeDenominations[denomCents] || 0
}

// Có thể thêm mệnh giá này không (không vượt quá changeOwed)
const canAdd = (denomCents: number): boolean => {
  return store.changePreparedCents + denomCents <= store.changeOwedCents
}
</script>

<template>
  <div class="cash-register">
    <div class="register-label">CASH DRAWER</div>

    <!-- Bills Section -->
    <div class="denom-section">
      <div class="section-label">BILLS</div>
      <div class="bills-row">
        <button
          v-for="denom in notes"
          :key="denom.labelCents"
          class="bill-btn"
          :class="{ 'can-add': canAdd(denom.labelCents), 'depleted': !canAdd(denom.labelCents) }"
          :disabled="!canAdd(denom.labelCents)"
          @click="store.addChangeDenomination(denom.labelCents)"
        >
          <div class="bill-visual">
            <span class="bill-value">{{ denom.display }}</span>
            <div class="bill-lines">
              <div></div><div></div><div></div>
            </div>
          </div>
          <span v-if="getCount(denom.labelCents) > 0" class="denom-count">
            ×{{ getCount(denom.labelCents) }}
          </span>
        </button>
      </div>
    </div>

    <!-- Coins Section -->
    <div class="denom-section">
      <div class="section-label">COINS</div>
      <div class="coins-row">
        <button
          v-for="denom in coins"
          :key="denom.labelCents"
          class="coin-btn"
          :class="{ 'can-add': canAdd(denom.labelCents), 'depleted': !canAdd(denom.labelCents) }"
          :disabled="!canAdd(denom.labelCents)"
          @click="store.addChangeDenomination(denom.labelCents)"
        >
          <span class="coin-value">{{ denom.display }}</span>
          <span v-if="getCount(denom.labelCents) > 0" class="denom-count">
            ×{{ getCount(denom.labelCents) }}
          </span>
        </button>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="register-actions">
      <button class="action-btn auto-fill" @click="store.autoFillChange()">
        ⚡ Auto-Fill
      </button>
      <button class="action-btn clear-btn" @click="store.clearChangeDenominations()">
        ✕ Clear
      </button>
    </div>

    <!-- Confirm Button -->
    <button
      class="confirm-btn"
      :class="{ 'confirm-ready': store.canConfirmCash }"
      :disabled="!store.canConfirmCash"
      @click="store.completeCheckout()"
    >
      <span class="confirm-icon">✓</span>
      <span>{{ store.canConfirmCash ? 'CONFIRM PAYMENT' : `NEED $${(Math.max(0, store.changeRemainingCents) / 100).toFixed(2)} MORE` }}</span>
    </button>
  </div>
</template>

<style scoped>
.cash-register {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 12px;
  width: 100%;
  max-width: 580px;
}

.register-label {
  text-align: center;
  color: #666;
  font-size: 0.7rem;
  letter-spacing: 0.4em;
  font-family: 'Courier New', monospace;
}

.denom-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 0.65rem;
  color: #555;
  letter-spacing: 0.3em;
  font-family: 'Courier New', monospace;
}

/* Bill buttons */
.bills-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.bill-btn {
  position: relative;
  flex: 1;
  min-width: 70px;
  height: 50px;
  border-radius: 6px;
  border: 2px solid #2d5a1b;
  background: linear-gradient(135deg, #1a3d0a, #2d5a1b);
  color: #86efac;
  cursor: pointer;
  transition: all 0.15s ease;
  overflow: hidden;
  padding: 4px;
}

.bill-btn.can-add:hover {
  border-color: #4ade80;
  background: linear-gradient(135deg, #2d5a1b, #166534);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(74, 222, 128, 0.3);
}

.bill-btn.depleted {
  opacity: 0.25;
  cursor: not-allowed;
  border-color: #1a1a1a;
}

.bill-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.bill-value {
  font-size: 0.95rem;
  font-weight: 900;
  font-family: 'Courier New', monospace;
}

.bill-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 60%;
  margin-top: 2px;
}

.bill-lines div {
  height: 1px;
  background: rgba(134, 239, 172, 0.3);
}

/* Coin buttons */
.coins-row {
  display: flex;
  gap: 10px;
}

.coin-btn {
  position: relative;
  flex: 1;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 2px solid #78350f;
  background: radial-gradient(circle at 35% 35%, #fbbf24, #92400e);
  color: #fef3c7;
  font-size: 0.7rem;
  font-weight: 900;
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'Courier New', monospace;
  display: flex;
  align-items: center;
  justify-content: center;
}

.coin-btn.can-add:hover {
  transform: scale(1.12);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.5);
}

.coin-btn.depleted {
  opacity: 0.25;
  cursor: not-allowed;
}

/* Count badge */
.denom-count {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #ef4444;
  color: white;
  font-size: 0.6rem;
  font-weight: 900;
  padding: 1px 4px;
  border-radius: 999px;
  border: 1px solid #1a1a1a;
  z-index: 10;
  font-family: 'Courier New', monospace;
}

/* Action buttons */
.register-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  border: none;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.05em;
}

.auto-fill {
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.3);
}
.auto-fill:hover { background: rgba(99, 102, 241, 0.35); }

.clear-btn {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.2);
}
.clear-btn:hover { background: rgba(239, 68, 68, 0.2); }

/* Confirm button */
.confirm-btn {
  width: 100%;
  padding: 16px;
  border-radius: 8px;
  border: 2px solid #333;
  background: #1a1a1a;
  color: #555;
  font-size: 1rem;
  font-weight: 900;
  cursor: not-allowed;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  letter-spacing: 0.1em;
  font-family: 'Courier New', monospace;
}

.confirm-btn.confirm-ready {
  background: linear-gradient(135deg, #14532d, #166534);
  border-color: #4ade80;
  color: #4ade80;
  cursor: pointer;
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.25);
  animation: pulse-green 1.5s infinite;
}

.confirm-btn.confirm-ready:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 24px rgba(74, 222, 128, 0.4);
}

.confirm-icon { font-size: 1.2rem; }

@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 20px rgba(74, 222, 128, 0.25); }
  50%       { box-shadow: 0 0 35px rgba(74, 222, 128, 0.5); }
}
</style>
