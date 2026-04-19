<script setup lang="ts">
/**
 * PackOpeningOverlay.vue — Giao diện Gacha mở pack thẻ bài (FINAL UPGRADE)
 *
 * UI FLOW:
 * Phase 1 (packPhase = 'pack_visible'): Hiển thị vỏ Pack (dynamic asset).
 *   → Click vào Pack → rung và xé → chuyển Phase 2.
 * Phase 2 (packPhase = 'cards_visible'): Hiển thị 6 lá bài đang úp mặt.
 *   → Click từng lá để lật (Instant flip + Multi-spin for Rare+).
 *   → Khi đủ 6 lá lật → hiện nút Collect.
 */
import { ref, computed, watch, onUnmounted, reactive } from 'vue'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { getPackVisuals } from '../../inventory/config/assetRegistry'
import PokemonCard3D from '../../shared/components/PokemonCard3D.vue'
import { useCardDetailStore } from '../../inventory/store/cardDetailStore'
import { getRarityConfig } from '../../inventory/config/rarityAnimations'

const inventoryStore = useInventoryStore()
const detailStore = useCardDetailStore()

// ─── UI-only state ──────────────────────────────────────────────────────────
const flipped = ref<boolean[]>([])
const isPackShaking = ref(false)
const revealClasses = ref<string[]>([])
const isAutoRevealing = ref(false)
let autoRevealTimer: ReturnType<typeof setInterval> | null = null

// Fallback tracking for assets
const assetErrors = reactive({
  pack: false
})
const handlePackError = () => { assetErrors.pack = true }

// ─── Computed ───────────────────────────────────────────────────────────────
const cards = computed(() => inventoryStore.currentPack)
const phase = computed(() => inventoryStore.packPhase)
const isVisible = computed(() => inventoryStore.isOpeningPack)

const allFlipped = computed(() => {
  return flipped.value.length > 0 && flipped.value.every(f => f)
})

// Dynamic Pack Image
const packImageUrl = computed(() => {
  const setId = inventoryStore.currentPackSetId
  if (!setId || assetErrors.pack) return null
  return getPackVisuals(setId).front
})

// ─── Watch: Reset state khi pack mới được mở ────────────────────────────────
watch(
  () => [isVisible.value, cards.value.length] as [boolean, number],
  ([isOpening, count]) => {
    if (isOpening && count > 0) {
      flipped.value = new Array(count).fill(false)
      revealClasses.value = new Array(count).fill('')
      isPackShaking.value = false
      stopAutoReveal()
    }
  },
  { immediate: true }
)

// ─── PHASE 1: Pack Interaction ─────────────────────────────────────────────
async function handlePackClick() {
  if (isPackShaking.value || phase.value !== 'pack_visible') return

  isPackShaking.value = true
  playTearSound()

  // Chuyển Phase sau 600ms
  setTimeout(() => {
    isPackShaking.value = false
    inventoryStore.revealCards()
  }, 600)
}

// ─── PHASE 2: Card Interaction ─────────────────────────────────────────────
function flipCard(index: number) {
  if (flipped.value[index] || phase.value !== 'cards_visible') return
  
  const card = cards.value[index]
  const config = getRarityConfig(card?.rarity)
  
  // 1. Set class cho wrapper để trigger CSS spin animation (Rare+)
  revealClasses.value[index] = config.flipClass
  
  // 2. Set trạng thái đã lật NGAY LẬP TỨC để UX mượt
  flipped.value[index] = true
  
  // 3. Âm thanh
  playFlipSound()
  if (config.tier !== 'common' && config.tier !== 'uncommon') {
    setTimeout(() => playRareSound(), 200)
  }
}

function revealAll() {
  if (phase.value !== 'cards_visible') return
  stopAutoReveal()
  
  cards.value.forEach((card, index) => {
    if (!flipped.value[index]) {
      const config = getRarityConfig(card?.rarity)
      revealClasses.value[index] = config.flipClass
      flipped.value[index] = true
    }
  })
  playFlipSound()
}

function startAutoReveal() {
  if (isAutoRevealing.value || phase.value !== 'cards_visible') return
  isAutoRevealing.value = true

  autoRevealTimer = setInterval(() => {
    const nextIndex = flipped.value.findIndex(f => !f)
    if (nextIndex === -1) {
      stopAutoReveal()
      return
    }
    flipCard(nextIndex)
  }, 500)
}

function stopAutoReveal() {
  if (autoRevealTimer) {
    clearInterval(autoRevealTimer)
    autoRevealTimer = null
  }
  isAutoRevealing.value = false
}

function handleCollect() {
  stopAutoReveal()
  inventoryStore.closePackOpening()
}

// ─── Audio & Pricing Helpers ───────────────────────────────────────────────
function createAudioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    return AudioCtx ? new AudioCtx() : null
  } catch { return null }
}

function playTearSound() {
  const ctx = createAudioContext()
  if (!ctx) return
  try {
    const bufferSize = ctx.sampleRate * 0.4
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 400
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
    source.start(); source.stop(ctx.currentTime + 0.4)
  } catch {}
}

function playFlipSound() {
  const ctx = createAudioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(300, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.08)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.1)
  } catch {}
}

function playRareSound() {
  const ctx = createAudioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(700, ctx.currentTime)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12)
    osc.frequency.setValueAtTime(2000, ctx.currentTime + 0.28)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.9)
  } catch {}
}

function getMarketPrice(card: any): string {
  const price = card?.pricing?.tcgplayer?.normal?.marketPrice ?? card?.pricing?.cardmarket?.avg ?? 'N/A';
  return price !== 'N/A' ? `$${Number(price).toFixed(2)}` : 'N/A';
}

function getRawPrice(card: any): number {
  const price = card?.pricing?.tcgplayer?.normal?.marketPrice ?? card?.pricing?.cardmarket?.avg ?? 0;
  return Number(price);
}

const formatVND = (priceUsd: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(priceUsd * 25000)
}

onUnmounted(() => stopAutoReveal())
</script>

<template>
  <Transition name="overlay-fade">
    <div v-if="isVisible" class="pack-overlay">
      <Transition name="phase-switch" mode="out-in">
        
        <!-- PHASE 1: PACK -->
        <div v-if="phase === 'pack_visible'" class="pack-phase" key="pack">
          <h2 class="pack-title">Mở Pack Thẻ Bài!</h2>
          <div class="pack-wrapper" :class="{ 'pack-shaking': isPackShaking }" @click="handlePackClick">
            <div class="pack-glow-ring ring-1"></div>
            <div class="pack-image-container">
              <img v-if="packImageUrl" :src="packImageUrl" class="pack-front-img" @error="handlePackError" />
              <div v-else class="pack-emoji">🎴</div>
              <div class="pack-shine"></div>
            </div>
          </div>
          <p class="pack-click-hint">👆 Click để xé</p>
        </div>

        <!-- PHASE 2: CARDS -->
        <div v-else-if="phase === 'cards_visible'" class="cards-phase" key="cards">
          <h2 class="cards-title">⭐ Kết quả mở Pack ⭐</h2>
          
          <div class="cards-grid">
            <div
              v-for="(card, index) in cards"
              :key="index"
              class="card-slot card-flip-container"
              :class="revealClasses[index]"
              :style="{ 
                '--card-index': index,
                '--fly-from-x': `${(index - 2.5) * 40}px`,
                '--fly-from-y': `${Math.abs(index - 2.5) * -30}px`,
                '--fly-rotate': `${(index - 2.5) * 10}deg`,
                '--rarity-glow': flipped[index] ? getRarityConfig(card?.rarity).glowColor : 'transparent'
              }"
              @click="flipped[index] ? detailStore.openCard(card) : flipCard(index)"
            >
              <PokemonCard3D
                :card="card"
                :is-back="!flipped[index]"
                :is-reverse="card.isReverse || false"
                width="100%"
              />
              <div v-if="flipped[index]" class="card-price-tag group/price cursor-help">
                {{ getMarketPrice(card) }}
                <!-- VND Tooltip -->
                <div v-if="getRawPrice(card) > 0" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-slate-900 text-white text-[11px] font-bold rounded px-2 py-1 shadow-lg opacity-0 invisible group-hover/price:opacity-100 group-hover/price:visible transition-all duration-200 z-50 pointer-events-none border border-slate-700 tracking-wider">
                  <span class="text-emerald-400">{{ formatVND(getRawPrice(card)) }}</span>
                  <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-slate-900 rotate-45 border-r border-b border-slate-700"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="controls-panel">
            <div class="controls-buttons">
              <button class="ctrl-btn btn-auto" :class="{ 'btn-active': isAutoRevealing }" :disabled="allFlipped" @click="isAutoRevealing ? stopAutoReveal() : startAutoReveal()">
                {{ isAutoRevealing ? '⏸ Dừng' : '▶ Auto-Reveal' }}
              </button>
              <button class="ctrl-btn btn-reveal" :disabled="allFlipped" @click="revealAll">✨ Reveal All</button>
              <Transition name="collect-appear">
                <button v-if="allFlipped" class="ctrl-btn btn-collect" @click="handleCollect">🎒 Thu thập tất cả</button>
              </Transition>
            </div>
          </div>
        </div>

      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.pack-overlay {
  position: absolute; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, #0d1b2a 0%, #000000 100%);
  overflow: hidden;
}

/* Phase 1 Styles */
.pack-phase { display: flex; flex-direction: column; align-items: center; gap: 2rem; }
.pack-title { font-size: 2.5rem; font-weight: 900; color: #fff; letter-spacing: 0.15em; text-shadow: 0 0 30px rgba(255, 215, 0, 0.6); }
.pack-wrapper { position: relative; cursor: pointer; transition: transform 0.2s; }
.pack-shaking { animation: pack-shake 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97); }
.pack-image-container { position: relative; width: 180px; height: 250px; display: flex; align-items: center; justify-content: center; }
.pack-front-img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 20px rgba(99, 102, 241, 0.4)); }
.pack-emoji { font-size: 6rem; filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.5)); }
.pack-shine { position: absolute; inset: 0; background: linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.12) 50%, transparent 60%); animation: shine-sweep 2.5s infinite; }
.pack-click-hint { color: rgba(255, 255, 255, 0.6); animation: hint-blink 1.5s infinite; }

/* Phase 2 Styles */
.cards-phase { display: flex; flex-direction: column; align-items: center; gap: 4rem; width: 95%; height: 100%; padding-top: 2rem; }
.cards-title { font-size: 1.75rem; font-weight: 900; color: #fff; text-shadow: 0 0 20px rgba(255, 215, 0, 0.5); }
.cards-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 2.5rem 1.5rem; }

/* CARD WRAPPER - FLY IN & MULTI SPIN */
.card-slot {
  flex: 0 1 auto;
  width: clamp(140px, 12vw, 210px);
  position: relative;
  animation: card-fly-in 0.8s cubic-bezier(0.19, 1, 0.22, 1) both;
  animation-delay: calc(var(--card-index) * 80ms);
}

.card-flip-container {
  perspective: 1000px;
}

.card-price-tag {
  position: absolute; bottom: -25px; left: 50%; translate: -50% 0;
  background: rgba(0, 0, 0, 0.7); color: #34d399; font-weight: 900; font-size: 0.75rem;
  padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(52, 211, 153, 0.3);
}

/* Multi-Spin Keyframes (Scoped selector for PokemonCard3D's rotator) */
.flip-extra-spin :deep(.card__rotator) {
  animation: extra-spin 1.0s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.flip-multi-spin :deep(.card__rotator) {
  animation: multi-spin 1.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.flip-ghost-spin :deep(.card__rotator) {
  animation: ghost-spin 2.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes extra-spin {
  0% { transform: rotateY(180deg); }
  50% { transform: rotateY(540deg) scale(1.1); }
  100% { transform: rotateY(0deg) scale(1); }
}

@keyframes multi-spin {
  0% { transform: rotateY(180deg); }
  33% { transform: rotateY(540deg) scale(1.05); }
  66% { transform: rotateY(900deg) scale(1.15); }
  100% { transform: rotateY(0deg) scale(1); }
}

@keyframes ghost-spin {
  0% { transform: rotateY(180deg); }
  25% { transform: rotateY(540deg) scale(1.1); }
  50% { transform: rotateY(900deg) scale(1.2); }
  75% { transform: rotateY(1260deg) scale(1.1); }
  100% { transform: rotateY(0deg) scale(1); }
}

@keyframes card-fly-in {
  0% { transform: translate(var(--fly-from-x), var(--fly-from-y)) scale(0.3) rotate(var(--fly-rotate)); opacity: 0; filter: blur(10px); }
  60% { filter: blur(0); opacity: 1; }
  100% { transform: translate(0, 0) scale(1) rotate(0); opacity: 1; }
}

/* Controls Panel */
.controls-panel { margin-top: auto; padding: 2rem; }
.controls-buttons { display: flex; gap: 1rem; align-items: center; }
.ctrl-btn { padding: 0.6rem 1.5rem; border-radius: 12px; font-weight: 800; text-transform: uppercase; cursor: pointer; transition: 0.2s; border: none; }
.btn-auto { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; }
.btn-reveal { background: linear-gradient(135deg, #d97706, #f59e0b); color: white; }
.btn-collect { background: linear-gradient(135deg, #059669, #10b981); color: white; scale: 1.1; animation: collect-pulse 1.5s infinite; }

/* Animations */
@keyframes pack-shake {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  20% { transform: translate(-8px, 0) rotate(-3deg); }
  40% { transform: translate(8px, 0) rotate(3deg); }
  60% { transform: translate(-10px, -3px) rotate(-4deg); }
  80% { transform: translate(10px, 3px) rotate(4deg); }
}
@keyframes shine-sweep { 0% { transform: translateX(-150%); } 60% { transform: translateX(250%); } 100% { transform: translateX(250%); } }
@keyframes hint-blink { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
@keyframes collect-pulse { 0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); } 50% { box-shadow: 0 0 40px rgba(16, 185, 129, 0.7); } }

/* Generic Animations */
.overlay-fade-enter-active, .overlay-fade-leave-active { transition: opacity 0.4s; }
.overlay-fade-enter-from, .overlay-fade-leave-to { opacity: 0; }
.phase-switch-leave-active { transition: all 0.4s; }
.phase-switch-leave-to { opacity: 0; transform: scale(0.6); filter: blur(15px); }
.phase-switch-enter-active { transition: all 0.5s; }
.phase-switch-enter-from { opacity: 0; transform: scale(0.9) translateY(40px); }
</style>
