<script setup lang="ts">
import { computed, watch } from 'vue'
import { useCheckoutStore } from '../store/checkoutStore'
import CashRegister from './CashRegister.vue'
import CreditCardPOS from './CreditCardPOS.vue'

const checkoutStore = useCheckoutStore()

// Phát âm thanh khi thành công
watch(() => checkoutStore.isSuccess, (val) => {
  if (val) playChaChingSound()
})

// Cha-ching sound synthesized via Web Audio API (không cần file âm thanh)
function playChaChingSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()

    // Tiếng "cha": noise burst ngắn
    const bufferSize = ctx.sampleRate * 0.05
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    }
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.3, ctx.currentTime)
    noise.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noise.start()

    // Tiếng "ching": tone cao
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1800, ctx.currentTime + 0.05)
    osc.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.15)
    const oscGain = ctx.createGain()
    oscGain.gain.setValueAtTime(0.4, ctx.currentTime + 0.05)
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.connect(oscGain)
    oscGain.connect(ctx.destination)
    osc.start(ctx.currentTime + 0.05)
    osc.stop(ctx.currentTime + 0.5)
  } catch (_) {
    // Âm thanh là optional — không crash nếu không được phép
  }
}

const customerCount = computed(() => {
  const { useCustomerStore } = require('../../customer/store/customerStore')
  return useCustomerStore().waitingCustomers
})
</script>

<template>
  <Teleport to="body">
    <Transition name="checkout-slide">
      <div
        v-if="checkoutStore.isOpen"
        class="checkout-overlay"
        :class="{ 'checkout-success': checkoutStore.isSuccess }"
      >
        <!-- Header Bar -->
        <div class="checkout-header">
          <div class="checkout-header-left">
            <span class="checkout-icon">🏪</span>
            <h2 class="checkout-title">CHECKOUT STATION</h2>
            <span class="checkout-method-badge" :class="checkoutStore.paymentMethod?.toLowerCase()">
              {{ checkoutStore.paymentMethod === 'CASH' ? '💵 Cash' : '💳 Card' }}
            </span>
          </div>
          <div class="checkout-header-right">
            <span class="queue-indicator">
              👥 {{ customerCount }} in queue
            </span>
          </div>
        </div>

        <!-- Main Content -->
        <div class="checkout-body">
          <!-- Left: Monitor Display -->
          <div class="monitor-panel">
            <div class="monitor-screen">
              <div class="monitor-title">CASH REGISTER</div>

              <div class="monitor-row">
                <span class="monitor-label">TOTAL</span>
                <span class="monitor-value total">{{ checkoutStore.billTotalDisplay }}</span>
              </div>

              <div class="monitor-divider"></div>

              <div v-if="checkoutStore.paymentMethod === 'CASH'">
                <div class="monitor-row">
                  <span class="monitor-label">RECEIVED</span>
                  <span class="monitor-value received">{{ checkoutStore.cashGivenDisplay }}</span>
                </div>
                <div class="monitor-row">
                  <span class="monitor-label">CHANGE</span>
                  <span class="monitor-value change">{{ checkoutStore.changeOwedDisplay }}</span>
                </div>
                <div class="monitor-divider"></div>
                <div class="monitor-row">
                  <span class="monitor-label">GIVING</span>
                  <span
                    class="monitor-value giving"
                    :class="{
                      'giving-correct': checkoutStore.canConfirmCash,
                      'giving-over': checkoutStore.changePreparedCents > checkoutStore.changeOwedCents
                    }"
                  >
                    {{ checkoutStore.changePreparedDisplay }}
                  </span>
                </div>
                <div class="monitor-row remaining" v-if="!checkoutStore.canConfirmCash">
                  <span class="monitor-label">REMAINING</span>
                  <span class="monitor-value remaining-val">
                    ${{ (Math.max(0, checkoutStore.changeRemainingCents) / 100).toFixed(2) }}
                  </span>
                </div>
              </div>

              <div v-else>
                <div class="monitor-row">
                  <span class="monitor-label">CARD</span>
                  <span class="monitor-value received">Awaiting input...</span>
                </div>
                <div class="monitor-row">
                  <span class="monitor-label">ENTERED</span>
                  <span class="monitor-value change">
                    {{ checkoutStore.posInputString || '—' }}
                  </span>
                </div>
              </div>

              <!-- Success Flash -->
              <Transition name="success-flash">
                <div v-if="checkoutStore.isSuccess" class="success-overlay">
                  <span class="success-icon">✓</span>
                  <span class="success-text">PAYMENT COMPLETE</span>
                </div>
              </Transition>
            </div>

            <!-- Monitor stand -->
            <div class="monitor-stand"></div>
          </div>

          <!-- Right: Cash Register or POS -->
          <div class="payment-panel">
            <CashRegister v-if="checkoutStore.paymentMethod === 'CASH'" />
            <CreditCardPOS v-else-if="checkoutStore.paymentMethod === 'CARD'" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.checkout-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.92);
  backdrop-filter: blur(12px);
  font-family: 'Courier New', monospace;
}

.checkout-overlay.checkout-success {
  background: rgba(0, 30, 0, 0.95);
}

.checkout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 32px;
  background: linear-gradient(90deg, #1a2a1a, #0d1a0d);
  border-bottom: 2px solid #22c55e;
  flex-shrink: 0;
}

.checkout-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.checkout-icon { font-size: 1.5rem; }

.checkout-title {
  font-size: 1.4rem;
  font-weight: 900;
  color: #22c55e;
  letter-spacing: 0.3em;
  margin: 0;
  text-shadow: 0 0 20px rgba(34, 197, 94, 0.5);
}

.checkout-method-badge {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 700;
}
.checkout-method-badge.cash {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.4);
}
.checkout-method-badge.card {
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.4);
}

.queue-indicator {
  font-size: 0.85rem;
  color: #94a3b8;
}

.checkout-body {
  flex: 1;
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 0;
  overflow: hidden;
}

/* ── Monitor Panel ── */
.monitor-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: #0a0a0a;
  border-right: 2px solid #1a2a1a;
}

.monitor-screen {
  position: relative;
  width: 100%;
  background: #001200;
  border: 3px solid #333;
  border-radius: 8px;
  padding: 24px;
  box-shadow:
    inset 0 0 40px rgba(0, 0, 0, 0.8),
    0 0 30px rgba(34, 197, 94, 0.15),
    inset 0 0 0 1px rgba(34, 197, 94, 0.1);
  overflow: hidden;
}

.monitor-title {
  text-align: center;
  color: #16a34a;
  font-size: 0.75rem;
  letter-spacing: 0.4em;
  margin-bottom: 20px;
  opacity: 0.7;
}

.monitor-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 6px 0;
}

.monitor-label {
  font-size: 0.75rem;
  color: #4ade80;
  letter-spacing: 0.2em;
  opacity: 0.8;
}

.monitor-value {
  font-size: 1.5rem;
  font-weight: 900;
  letter-spacing: 0.05em;
}
.monitor-value.total    { color: #f0fdf4; }
.monitor-value.received { color: #86efac; }
.monitor-value.change   { color: #fbbf24; }
.monitor-value.giving   { color: #94a3b8; }
.monitor-value.giving.giving-correct { color: #4ade80; text-shadow: 0 0 10px rgba(74, 222, 128, 0.6); }
.monitor-value.giving.giving-over    { color: #ef4444; }
.monitor-value.remaining-val { color: #f87171; font-size: 1.1rem; }

.monitor-divider {
  height: 1px;
  background: rgba(74, 222, 128, 0.2);
  margin: 12px 0;
}

.success-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 50, 0, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.success-icon {
  font-size: 4rem;
  color: #4ade80;
  text-shadow: 0 0 30px rgba(74, 222, 128, 0.8);
}

.success-text {
  color: #4ade80;
  font-size: 1.2rem;
  letter-spacing: 0.3em;
  font-weight: 900;
}

.monitor-stand {
  width: 60px;
  height: 20px;
  background: #1a1a1a;
  border-radius: 0 0 8px 8px;
  border: 2px solid #333;
  border-top: none;
  margin-top: -2px;
}

/* ── Payment Panel ── */
.payment-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: linear-gradient(135deg, #0f0f0f, #1a1a1a);
}

/* ── Transitions ── */
.checkout-slide-enter-active,
.checkout-slide-leave-active { transition: all 0.3s ease; }
.checkout-slide-enter-from,
.checkout-slide-leave-to { opacity: 0; transform: translateY(40px); }

.success-flash-enter-active { transition: all 0.3s ease; }
.success-flash-enter-from   { opacity: 0; transform: scale(0.8); }
</style>
