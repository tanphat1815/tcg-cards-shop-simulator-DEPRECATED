<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useGradingStore } from '../store/gradingStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { GRADE_TABLE } from '../config'
import TcgCard from '../../shared/components/TcgCard.vue'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'

const gradingStore = useGradingStore()
const apiStore = useApiStore()

type Phase = 'shake' | 'reveal' | 'rolling' | 'finale'
const phase = ref<Phase>('shake')
const rollingNumber = ref<number>(1)
const rollInterval = ref<number | null>(null)

const slab = computed(() => gradingStore.revealingSlab)
const card = computed(() =>
  slab.value ? apiStore.flatCardMap[slab.value.cardId] : null
)
const gradeInfo = computed(() => {
  if (!slab.value) return null
  return GRADE_TABLE.find(g => g.grade === slab.value!.grade)
})

// Watch mở overlay → khởi động animation
watch(() => gradingStore.showRevealOverlay, (show) => {
  if (show && slab.value) {
    startSequence()
  } else {
    cleanup()
  }
})

function startSequence() {
  phase.value = 'shake'

  // Phase 1 → 2
  setTimeout(() => {
    phase.value = 'reveal'
  }, 1000)

  // Phase 2 → 3
  setTimeout(() => {
    phase.value = 'rolling'
    startRolling()
  }, 2000)

  // Phase 3 → 4 (sau 2.5s rolling)
  setTimeout(() => {
    stopRolling()
    phase.value = 'finale'
  }, 4500)
}

function startRolling() {
  rollInterval.value = window.setInterval(() => {
    rollingNumber.value = Math.floor(Math.random() * 10) + 1
  }, 80) // đổi số mỗi 80ms
}

function stopRolling() {
  if (rollInterval.value !== null) {
    clearInterval(rollInterval.value)
    rollInterval.value = null
  }
  // Dừng ở final grade
  if (slab.value) rollingNumber.value = slab.value.grade
}

function confirmAndClose() {
  gradingStore.completeReveal()
}

function cleanup() {
  if (rollInterval.value !== null) clearInterval(rollInterval.value)
  rollInterval.value = null
}

onUnmounted(cleanup)

// Show fireworks nếu grade = 10 và đã tới phase finale
const showFireworks = computed(() =>
  phase.value === 'finale' && slab.value?.grade === 10
)
</script>

<template>
  <div v-if="gradingStore.showRevealOverlay && slab && card" class="reveal-overlay">
    <!-- Fireworks overlay -->
    <div v-if="showFireworks" class="fireworks">
      <div v-for="i in 12" :key="i" class="firework" :style="`--i:${i}`"></div>
    </div>

    <!-- Slab container -->
    <div class="slab-wrapper" :class="[phase, gradeInfo?.cssClass]">
      <!-- PSA Label (chỉ hiện từ phase finale) -->
      <transition name="slide-down">
        <div v-if="phase === 'finale'" class="psa-label">
          <span class="psa-logo">PSA</span>
          <span class="grade-number">{{ rollingNumber }}</span>
          <span class="grade-text">{{ gradeInfo?.label }}</span>
        </div>
      </transition>

      <!-- Card area -->
      <div class="card-area">
        <transition name="fade-scale">
          <TcgCard
            v-if="phase !== 'shake'"
            :card="card" :is-flipped="true" size="normal"
            :show-price="false"
          />
        </transition>
      </div>

      <!-- Rolling number (phase 3) -->
      <div v-if="phase === 'rolling'" class="rolling-indicator">
        {{ rollingNumber }}
      </div>

      <!-- Price on finale -->
      <div v-if="phase === 'finale'" class="price-reveal">
        Giá trị: ${{ (card.pricing?.tcgplayer?.normal?.marketPrice * slab.priceMultiplier || 0).toFixed(2) }}
        <span class="multiplier">(×{{ slab.priceMultiplier }})</span>
      </div>
    </div>

    <!-- Button -->
    <EnhancedButton
      v-if="phase === 'finale'"
      variant="success" size="lg"
      @click="confirmAndClose"
      class="reveal-confirm-btn"
    >
      Thêm vào Binder
    </EnhancedButton>
  </div>
</template>

<style scoped>
.reveal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 500;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 24px;
}

.slab-wrapper {
  position: relative;
  width: 320px;
  background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%);
  border: 3px solid #64748b;
  border-radius: 12px;
  padding: 20px 16px;
  box-shadow: 0 0 40px rgba(255, 255, 255, 0.2),
              0 20px 40px rgba(0, 0, 0, 0.6);
}

/* Phase 1: SHAKE animation */
.slab-wrapper.shake {
  animation: slab-shake 0.08s ease-in-out infinite alternate;
}
@keyframes slab-shake {
  0%   { transform: translateX(-5px) rotate(-2deg); }
  100% { transform: translateX(5px)  rotate(2deg);  }
}

.psa-label {
  display: flex; align-items: center; justify-content: center;
  gap: 8px;
  background: linear-gradient(90deg, #dc2626, #991b1b);
  color: white; font-weight: 900;
  padding: 8px 12px; border-radius: 6px;
  margin-bottom: 12px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
}
.psa-logo { font-size: 1rem; letter-spacing: 2px; }
.grade-number { font-size: 2rem; }
.grade-text { font-size: 0.85rem; opacity: 0.9; }

.card-area {
  min-height: 400px;
  display: flex; align-items: center; justify-content: center;
}

/* Phase 3: ROLLING NUMBER overlay */
.rolling-indicator {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 8rem; font-weight: 900;
  color: #fbbf24;
  text-shadow: 0 0 20px rgba(251, 191, 36, 0.8);
  font-family: 'Arial Black', sans-serif;
  z-index: 10;
  animation: number-pulse 0.15s infinite alternate;
}
@keyframes number-pulse {
  0%   { transform: translate(-50%, -50%) scale(1); }
  100% { transform: translate(-50%, -50%) scale(1.1); }
}

.price-reveal {
  text-align: center;
  margin-top: 12px;
  color: #059669;
  font-weight: 800;
  font-size: 1.2rem;
}
.multiplier { opacity: 0.7; font-size: 0.9rem; }

/* Transitions */
.fade-scale-enter-active, .fade-scale-leave-active {
  transition: all 0.4s ease;
}
.fade-scale-enter-from, .fade-scale-leave-to {
  opacity: 0; transform: scale(0.5);
}

.slide-down-enter-active {
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.slide-down-enter-from {
  transform: translateY(-30px); opacity: 0;
}

/* Grade 10 special effects */
.grade-10 {
  border-color: #fbbf24;
  background: linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%);
  box-shadow: 0 0 60px rgba(251, 191, 36, 0.8);
  animation: golden-glow 2s ease-in-out infinite alternate;
}
@keyframes golden-glow {
  from { box-shadow: 0 0 40px rgba(251, 191, 36, 0.5); }
  to   { box-shadow: 0 0 80px rgba(251, 191, 36, 1.0); }
}

/* Grade color borders */
.grade-9 { border-color: #60a5fa; }
.grade-8 { border-color: #34d399; }
.grade-7 { border-color: #a3e635; }

/* Fireworks */
.fireworks {
  position: absolute; inset: 0; pointer-events: none;
}
.firework {
  position: absolute;
  top: 50%; left: 50%;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: radial-gradient(circle, #fbbf24, #f59e0b, transparent);
  animation: firework-shoot 1.2s ease-out forwards;
  animation-delay: calc(var(--i) * 0.08s);
  animation-iteration-count: infinite;
}
@keyframes firework-shoot {
  0%   { transform: translate(0, 0) scale(0); opacity: 1; }
  100% {
    transform:
      translate(calc(cos(var(--i) * 30deg) * 200px),
                calc(sin(var(--i) * 30deg) * 200px))
      scale(2);
    opacity: 0;
  }
}
</style>
