<script setup lang="ts">
import { computed } from 'vue'
import type { GradedCard } from '../../inventory/types'
import { GRADE_TABLE } from '../../grading/config'
import TcgCard from './TcgCard.vue'

const props = defineProps<{ slab: GradedCard; card: any }>()

const gradeInfo = computed(() => {
  return GRADE_TABLE.find(g => g.grade === props.slab.grade) ?? GRADE_TABLE[GRADE_TABLE.length - 1]
})

const displayPrice = computed(() => {
  const base = props.card?.pricing?.tcgplayer?.normal?.marketPrice ?? 10 // Fallback price
  return (base * props.slab.priceMultiplier).toFixed(2)
})
</script>

<template>
  <div class="slab-container" :class="gradeInfo.cssClass">
    <!-- PSA Label (top) -->
    <div class="slab-label">
      <span class="psa-logo">PSA</span>
      <span class="grade-number">{{ slab.grade }}</span>
      <span class="grade-text">{{ gradeInfo.label }}</span>
    </div>

    <!-- Card in plastic -->
    <div class="slab-window">
      <TcgCard :card="card" :is-flipped="true" size="small" :show-price="false" />
    </div>

    <!-- Price -->
    <div class="slab-price">${{ displayPrice }}</div>

    <!-- Golden glow cho grade 10 -->
    <div v-if="slab.grade === 10" class="golden-glow"></div>
  </div>
</template>

<style scoped>
.slab-container {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  padding: 8px 6px;
  background: linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4),
              inset 0 1px 2px rgba(255, 255, 255, 0.8);
  border: 2px solid #94a3b8;
  width: 100%;
  max-width: 140px;
  min-height: 220px;
  transition: transform 0.2s;
}

.slab-container:hover {
  transform: translateY(-4px);
}

.slab-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 4px 8px;
  background: linear-gradient(90deg, #dc2626, #991b1b);
  color: white;
  font-family: 'Arial Black', sans-serif;
  font-size: 0.75rem;
  border-radius: 4px;
  margin-bottom: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.psa-logo { font-weight: 900; letter-spacing: 1px; }
.grade-number { font-size: 1.1rem; font-weight: 900; }
.grade-text { font-size: 0.65rem; opacity: 0.9; }

.slab-window {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px;
  border-radius: 4px;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.1);
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slab-price {
  text-align: center;
  font-weight: 800;
  color: #059669;
  margin-top: 6px;
  font-size: 0.85rem;
}

/* Color codes */
.grade-10 {
  border-color: #fbbf24;
  background: linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%);
}

.grade-9 { border-color: #60a5fa; }
.grade-8 { border-color: #34d399; }
.grade-7 { border-color: #a3e635; }

.golden-glow {
  position: absolute;
  inset: -4px;
  border-radius: 12px;
  background: radial-gradient(ellipse at center,
    rgba(251, 191, 36, 0.6) 0%, transparent 70%);
  animation: golden-pulse 2s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}

@keyframes golden-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50%      { opacity: 1.0; transform: scale(1.05); }
}
</style>
