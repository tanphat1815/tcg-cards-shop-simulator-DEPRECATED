<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useCheckoutStore } from '../store/checkoutStore'

const store = useCheckoutStore()
const isProcessing = ref(false)

// ──────────────────────────────────────────────────
// KEYBOARD EVENT LISTENER
// Bắt phím thật từ bàn phím (Numpad + số thông thường)
// ──────────────────────────────────────────────────
function handleKeyDown(event: KeyboardEvent) {
  // Chỉ xử lý khi POS đang active và không đang trong success state
  if (!store.isOpen || store.paymentMethod !== 'CARD' || store.isSuccess) return

  // Ngăn event bubble lên Phaser (quan trọng!)
  event.stopPropagation()

  const key = event.key

  // Số 0-9 (cả numpad lẫn hàng số thường)
  if (/^[0-9]$/.test(key)) {
    store.posAppendChar(key)
    return
  }

  // Dấu chấm thập phân
  if (key === '.' || key === 'Decimal') {
    store.posAppendChar('.')
    return
  }

  // Backspace / Delete
  if (key === 'Backspace' || key === 'Delete') {
    store.posBackspace()
    return
  }

  // Enter — chốt payment
  if (key === 'Enter' || key === 'NumpadEnter') {
    event.preventDefault() // Ngăn form submit
    handleConfirm()
    return
  }

  // Escape — clear input
  if (key === 'Escape') {
    store.posClear()
    return
  }
}

function handleConfirm() {
  if (store.canConfirmCard) {
    isProcessing.value = true
    // Visual delay cho cảm giác "xử lý thẻ"
    setTimeout(() => {
      store.posConfirm()
      isProcessing.value = false
    }, 600)
  } else {
    store.posConfirm() // Sẽ trigger posError
  }
}

// Mount: Đăng ký listener — PHẢI dùng { capture: true } để bắt trước Phaser
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, { capture: true })
})

// Unmount: Hủy listener để tránh memory leak
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown, { capture: true })
})

// Virtual keypad layout
const keypadButtons = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', '⌫'],
]
</script>

<template>
  <div class="pos-machine" :class="{ 'pos-error': store.posError, 'pos-processing': isProcessing }">

    <!-- POS Header -->
    <div class="pos-header">
      <div class="pos-logo">POS</div>
      <div class="pos-status-light" :class="{ active: store.isOpen, processing: isProcessing }"></div>
    </div>

    <!-- Card Slot Visual -->
    <div class="card-slot-area">
      <div class="card-slot">
        <div class="card-slot-line"></div>
        <span class="card-slot-label">INSERT / TAP CARD</span>
      </div>
    </div>

    <!-- Display Screen -->
    <div class="pos-display" :class="{ 'display-error': store.posError, 'display-ok': store.canConfirmCard }">
      <div class="pos-display-label">AMOUNT</div>
      <div class="pos-display-value">
        <span v-if="store.posInputString" class="pos-amount">
          ${{ store.posInputString }}
        </span>
        <span v-else class="pos-placeholder">0.00</span>
        <span class="pos-cursor">|</span>
      </div>
      <div class="pos-display-hint">
        <span v-if="store.posError" class="hint-error">✗ INCORRECT AMOUNT</span>
        <span v-else-if="store.canConfirmCard" class="hint-ok">✓ PRESS ENTER</span>
        <span v-else class="hint-neutral">Enter ${{ store.billTotalDisplay }}</span>
      </div>
    </div>

    <!-- Virtual Keypad -->
    <div class="keypad">
      <div v-for="(row, ri) in keypadButtons" :key="ri" class="keypad-row">
        <button
          v-for="btn in row"
          :key="btn"
          class="key-btn"
          :class="{
            'key-backspace': btn === '⌫',
            'key-dot': btn === '.'
          }"
          @click="btn === '⌫' ? store.posBackspace() : store.posAppendChar(btn)"
        >
          {{ btn }}
        </button>
      </div>

      <!-- Enter button (full width) -->
      <div class="keypad-row">
        <button
          class="key-btn key-clear"
          @click="store.posClear()"
        >CLR</button>
        <button
          class="key-btn key-enter"
          :class="{ 'key-enter-ready': store.canConfirmCard }"
          :disabled="isProcessing"
          @click="handleConfirm()"
        >
          <span v-if="isProcessing" class="processing-dots">···</span>
          <span v-else>ENTER</span>
        </button>
      </div>
    </div>

    <!-- POS Footer -->
    <div class="pos-footer">
      <div class="pos-chip-icon">💳</div>
      <div class="pos-instructions">
        <span>Type amount on keyboard</span>
        <span>Press ENTER to confirm</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pos-machine {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 280px;
  padding: 20px;
  background: linear-gradient(160deg, #2d2d2d, #1a1a1a);
  border: 2px solid #444;
  border-radius: 16px;
  box-shadow:
    inset 0 2px 4px rgba(255,255,255,0.05),
    0 8px 32px rgba(0,0,0,0.5);
  transition: all 0.2s ease;
  font-family: 'Courier New', monospace;
}

.pos-machine.pos-error {
  border-color: #ef4444;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
  animation: shake 0.5s ease;
}

.pos-machine.pos-processing {
  border-color: #6366f1;
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-6px); }
  40%       { transform: translateX(6px); }
  60%       { transform: translateX(-4px); }
  80%       { transform: translateX(4px); }
}

/* POS Header */
.pos-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pos-logo {
  font-size: 0.75rem;
  font-weight: 900;
  color: #555;
  letter-spacing: 0.4em;
}

.pos-status-light {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #333;
}
.pos-status-light.active { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
.pos-status-light.processing {
  background: #6366f1;
  box-shadow: 0 0 8px #6366f1;
  animation: blink 0.5s infinite;
}

@keyframes blink { 50% { opacity: 0; } }

/* Card Slot */
.card-slot-area {
  display: flex;
  justify-content: center;
}

.card-slot {
  width: 90%;
  height: 32px;
  border: 2px dashed #333;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #111;
}

.card-slot-line {
  width: 30%;
  height: 2px;
  background: #444;
  border-radius: 1px;
}

.card-slot-label {
  font-size: 0.55rem;
  color: #444;
  letter-spacing: 0.15em;
}

/* Display Screen */
.pos-display {
  background: #0d1117;
  border: 2px solid #22303c;
  border-radius: 8px;
  padding: 12px 16px;
  transition: border-color 0.2s;
}

.pos-display.display-error { border-color: #ef4444; }
.pos-display.display-ok    { border-color: #22c55e; }

.pos-display-label {
  font-size: 0.6rem;
  color: #4a5568;
  letter-spacing: 0.3em;
  margin-bottom: 4px;
}

.pos-display-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.pos-amount {
  font-size: 2rem;
  font-weight: 900;
  color: #f0fdf4;
  letter-spacing: 0.05em;
}

.pos-placeholder {
  font-size: 2rem;
  color: #2d3748;
  letter-spacing: 0.05em;
}

.pos-cursor {
  color: #4ade80;
  animation: blink-cursor 1s infinite;
  font-size: 1.5rem;
}

@keyframes blink-cursor { 50% { opacity: 0; } }

.pos-display-hint {
  margin-top: 6px;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  min-height: 14px;
}

.hint-error   { color: #ef4444; }
.hint-ok      { color: #4ade80; }
.hint-neutral { color: #4a5568; }

/* Keypad */
.keypad {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.keypad-row {
  display: flex;
  gap: 6px;
}

.key-btn {
  flex: 1;
  padding: 14px 0;
  border-radius: 8px;
  border: 1px solid #333;
  background: #252525;
  color: #e2e8f0;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.1s ease;
  font-family: 'Courier New', monospace;
  letter-spacing: 0;
}

.key-btn:hover {
  background: #333;
  border-color: #555;
  transform: translateY(-1px);
}

.key-btn:active {
  transform: translateY(1px);
  background: #1a1a1a;
}

.key-backspace { color: #f87171; }
.key-dot       { color: #fbbf24; }

.key-clear {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.key-enter {
  flex: 2;
  background: #1a2a1a;
  border-color: #333;
  color: #555;
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  transition: all 0.2s ease;
}

.key-enter.key-enter-ready {
  background: linear-gradient(135deg, #14532d, #166534);
  border-color: #4ade80;
  color: #4ade80;
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.3);
  animation: pulse-green 1.5s infinite;
}

.key-enter.key-enter-ready:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(74, 222, 128, 0.5);
}

.processing-dots {
  animation: dots-blink 0.8s infinite;
  font-size: 1.5rem;
  letter-spacing: 0.2em;
}

@keyframes dots-blink { 50% { opacity: 0.3; } }
@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 12px rgba(74, 222, 128, 0.3); }
  50%       { box-shadow: 0 0 24px rgba(74, 222, 128, 0.6); }
}

/* POS Footer */
.pos-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid #222;
}

.pos-chip-icon { font-size: 1.2rem; }

.pos-instructions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pos-instructions span {
  font-size: 0.6rem;
  color: #4a5568;
  letter-spacing: 0.05em;
}
</style>
