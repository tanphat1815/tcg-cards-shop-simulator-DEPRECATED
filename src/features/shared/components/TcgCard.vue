<script setup lang="ts">
import { ref, watch } from 'vue'
import { isHighRarity, getRarityBadge } from '../../inventory/config/rarityRegistry'
import { formatVND, getRawPrice, getMarketPrice } from '../utils/currency'
import { FALLBACK_ASSETS } from '../../../config/gameConfig'

const emit = defineEmits(['click'])

const props = defineProps<{
  card: any
  isFlipped?: boolean
  isHolo?: boolean
  quantity?: number
  showPrice?: boolean
  showQuantity?: boolean
  loading?: boolean
  size?: 'normal' | 'small'
}>()

const imageLoaded = ref(false)
const currentImageUrl = ref('')

// Reset image state when card changes
watch(() => props.card?.image, (newVal) => {
  if (newVal) {
    currentImageUrl.value = `${newVal}/low.webp`
    imageLoaded.value = false
  } else {
    currentImageUrl.value = ''
  }
}, { immediate: true })

const handleImageError = () => {
  if (currentImageUrl.value !== FALLBACK_ASSETS.CARD_IMAGE) {
    currentImageUrl.value = FALLBACK_ASSETS.CARD_IMAGE
    imageLoaded.value = true // Show the fallback immediately
  }
}
</script>

<template>
  <div class="tcg-card-wrapper" :class="{ 'is-small': size === 'small' }">
    <!-- Quantity Badge (External to 3D container to stay on top) -->
    <div 
      v-if="showQuantity && quantity !== undefined" 
      class="quantity-badge"
      @click.stop="emit('click')"
    >
      x{{ quantity }}
    </div>

    <div
      class="card-3d-container"
      :class="{
        'is-flipped': isFlipped,
        'is-holo': (isHolo || isHighRarity(card)) && isFlipped,
        'is-hoverable': isFlipped,
        'small-card': size === 'small',
        'is-clickable': isFlipped
      }"
      @click="isFlipped && emit('click')"
    >
      <!-- BACK SIDE -->
      <div class="card-face card-back">
        <slot name="back">
          <img :src="'/assets/cards/back.webp'" class="card-back-img" alt="Card Back" />
        </slot>
        <div class="flip-hint" v-if="!isFlipped">Click để lật</div>
      </div>

      <!-- FRONT SIDE -->
      <div class="card-face card-front">
        <div v-if="showPrice" class="price-tag group/price">
          {{ getMarketPrice(card) }}
          <!-- VND Tooltip -->
          <div v-if="getRawPrice(card) > 0" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-slate-900 text-white text-[10px] font-bold rounded px-2 py-1 shadow-lg opacity-0 invisible group-hover/price:opacity-100 group-hover/price:visible transition-all duration-200 z-50 pointer-events-none border border-slate-700 tracking-wider">
            <span class="text-emerald-400">{{ formatVND(getRawPrice(card)) }}</span>
            <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-slate-900 rotate-45 border-r border-b border-slate-700"></div>
          </div>
        </div>

        <!-- Card Face Content -->
        <div class="card-content-inner">
          <!-- Spinner -->
          <div v-if="card?.image && !imageLoaded" class="card-loader">
            <div class="spinner"></div>
          </div>

          <img
            v-if="card?.image"
            :src="currentImageUrl"
            :alt="card.name"
            class="card-image"
            :class="{ 'img-hidden': !imageLoaded }"
            loading="lazy"
            @load="imageLoaded = true"
            @error="handleImageError"
          />
          <div v-else class="card-no-image">
            <span class="card-no-image-name">{{ card?.name || 'Unknown Card' }}</span>
          </div>

          <!-- Rarity Badge -->
          <div
            v-if="card?.rarity && card.rarity !== 'Common'"
            class="rarity-badge"
            :class="getRarityBadge(card).cssClass"
          >
            {{ getRarityBadge(card).label }}
          </div>

          <div v-if="isHighRarity(card)" class="holo-overlay"></div>
          
          <!-- Default Slot for overlays (like "Chỉ trưng bày") -->
          <slot></slot>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tcg-card-wrapper {
  position: relative;
  width: 100%;
}

.quantity-badge {
  position: absolute;
  top: -12px;
  right: -12px;
  background: #ef4444;
  color: white;
  font-weight: 900;
  padding: 4px 10px;
  border-radius: 9999px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  border: 2px solid white;
  font-size: 0.85rem;
  z-index: 30;
  pointer-events: none;
}

.is-small .quantity-badge {
  font-size: 0.65rem;
  padding: 2px 6px;
  top: -8px;
  right: -8px;
}

.card-3d-container {
  position: relative;
  width: 100%;
  aspect-ratio: 230 / 322;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 12px;
}

.card-3d-container.is-flipped {
  transform: rotateY(180deg);
}

.card-3d-container.is-hoverable:hover {
  transform: rotateY(180deg) scale(1.05);
  z-index: 20;
}

.card-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 6px 15px rgba(0, 0, 0, 0.4);
}

.is-clickable {
  cursor: pointer;
}

.card-back {
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-back-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.flip-hint {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.55rem;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  white-space: nowrap;
}

.card-front {
  transform: rotateY(180deg);
  background: #111;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: visible;
}

.card-content-inner {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 10px;
}

.card-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: opacity 0.4s ease;
}

.img-hidden { opacity: 0; }

.card-no-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e3a8a, #4338ca);
  padding: 1rem;
  text-align: center;
}

.card-no-image-name {
  font-size: 0.75rem;
  color: white;
  font-weight: bold;
}

.price-tag {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  font-size: 0.75rem;
  font-weight: 900;
  padding: 2px 10px;
  border-radius: 20px;
  border: 2px solid white;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
}

.is-small .price-tag {
  font-size: 0.6rem;
  top: -12px;
  padding: 1px 6px;
}

.rarity-badge {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 2px 4px;
  font-size: 0.55rem;
  font-weight: 900;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  z-index: 10;
}

.is-small .rarity-badge {
  font-size: 0.45rem;
  padding: 1px 2px;
}

.rarity-common   { background: rgba(75, 85, 99, 0.9); color: #f3f4f6; }
.rarity-uncommon { background: rgba(37, 99, 235, 0.9); color: #dbeafe; }
.rarity-rare     { background: rgba(202, 138, 4, 0.95); color: white; }
.rarity-ultra    { background: rgba(124, 58, 237, 0.95); color: white; }
.rarity-ghost    { background: linear-gradient(90deg, #db2777, #7c3aed, #0891b2); color: white; }

.holo-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(125deg, transparent 0%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 55%, transparent 100%);
  mix-blend-mode: overlay;
  pointer-events: none;
  animation: holo-shift 4s ease-in-out infinite alternate;
  z-index: 5;
}

@keyframes holo-shift {
  0% { transform: translateX(-100%) translateY(-100%); }
  100% { transform: translateX(100%) translateY(100%); }
}

.card-loader {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  z-index: 2;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.is-holo .card-front {
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.3), 0 0 40px rgba(124, 58, 237, 0.1);
}
</style>
