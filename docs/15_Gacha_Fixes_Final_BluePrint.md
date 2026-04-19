# 15_Gacha_Fixes_Final_BluePrint.md
## Module: Gacha Animation Upgrade & Core Bug Fixes (FINAL)

---

## 1. SỬA LỖI UX/UI NGHIÊM TRỌNG (CẬP NHẬT)

### 1.1. Ảnh Pack hiển thị động (PackOpeningOverlay.vue)
- **Vấn đề**: Trước đây dùng ảnh tĩnh hoặc emoji làm placeholder cho vỏ Pack.
- **Giải pháp**: Lấy `currentPackSetId` từ `inventoryStore` và dùng `getPackVisuals(setId).front` để hiển thị đúng vỏ bao bì của Set đang mở.

### 1.2. Lật bài Instant & Multi-Spin Wrapper (PackOpeningOverlay.vue)
- **Vấn đề**: Chờ lật xong mới set state gây cảm giác trễ (delay). Keyframes lật bài bị tranh chấp với hiệu ứng 3D Tilt.
- **Giải pháp**:
    - **Instant State**: Set `flipped.value[index] = true` ngay khi click.
    - **Double Wrapper**: Bọc `PokemonCard3D` bên trong `.card-flip-container`. 
    - **Animation**: Các hiệu ứng lật nhiều vòng (cho bài Rare/Ultra) sẽ được áp dụng lên `.card-flip-container`. Bản thân lá bài bên trong vẫn giữ nguyên logic lật 0-180 độ và 3D Tilt mượt mà.

### 1.3. Chuẩn hóa simeydotme (PokemonCard3D.vue)
- **Vấn đề**: Dùng `v-if` xóa thẻ `.card__shine` làm hỏng tính toán CSS.
- **Giải pháp**:
    - Giữ nguyên cấu trúc DOM chuẩn của thư viện.
    - Dùng class `.no-tilt` để tắt hiệu ứng khi cần (trong Battle hoặc khi úp bài).
    - Thêm class `.interacting` (active) khi di chuột để kích hoạt hiệu ứng lấp lánh mạnh hơn.
    - Đảm bảo `--card-opacity: 1` luôn được truyền chính xác.

---

## 2. SOURCE CODE: src/features/shared/components/PokemonCard3D.vue

```vue
<script setup lang="ts">
/**
 * POKEMON CARD 3D COMPONENT (SIMEYDOTME COMPLIANT)
 * - Đảm bảo cấu trúc DOM 100% chuẩn thư viện.
 * - Sử dụng CSS variables để điều khiển hiệu ứng.
 */
import { ref, computed } from 'vue';
import { mapRarityToCSS } from '../utils/cardRarityMapper';

interface Props {
  card: any;
  isBack?: boolean;
  width?: string | number;
  disableTilt?: boolean;
  isHit?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  width: '320px',
  disableTilt: false,
  isHit: false,
});

const emit = defineEmits<{
  (e: 'click', card: any): void
  (e: 'contextmenu', card: any): void
}>();

const cardElement = ref<HTMLElement | null>(null);
const isLoaded = ref(false);
const isInteracting = ref(false);

const rarityClass = computed(() => mapRarityToCSS(props.card?.rarity));
const imageSrc = computed(() => props.card?.image ? `${props.card.image}/high.webp` : '');

const handleMouseMove = (e: MouseEvent) => {
  if (props.disableTilt || !cardElement.value) return;
  isInteracting.value = true;

  const rect = cardElement.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const px = Math.max(Math.min((100 / rect.width) * x, 100), 0);
  const py = Math.max(Math.min((100 / rect.height) * y, 100), 0);

  const pl = px / 100;
  const pt = py / 100;
  const p_xc = Math.abs(px - 50);
  const p_yc = Math.abs(py - 50);
  const pc = Math.sqrt(Math.pow(p_xc, 2) + Math.pow(p_yc, 2)) / 50;

  const rx = (px - 50) * -0.3;
  const ry = (py - 50) * 0.3;

  const st = cardElement.value.style;
  st.setProperty('--pointer-x', `${px}%`);
  st.setProperty('--pointer-y', `${py}%`);
  st.setProperty('--pointer-from-left', `${pl}`);
  st.setProperty('--pointer-from-top', `${pt}`);
  st.setProperty('--pointer-from-center', `${pc}`);
  st.setProperty('--rotate-x', `${rx}deg`);
  st.setProperty('--rotate-y', `${ry}deg`);
  st.setProperty('--background-x', `${px}%`);
  st.setProperty('--background-y', `${py}%`);
};

const handleMouseLeave = () => {
  isInteracting.value = false;
  if (!cardElement.value) return;
  const st = cardElement.value.style;
  st.setProperty('--pointer-x', '50%');
  st.setProperty('--pointer-y', '50%');
  st.setProperty('--rotate-x', '0deg');
  st.setProperty('--rotate-y', '0deg');
  st.setProperty('--pointer-from-center', '0');
};

function onImgLoad() { isLoaded.value = true; }
function handleClick() { emit('click', props.card); }
</script>

<template>
  <div
    ref="cardElement"
    class="card"
    :class="[
      rarityClass,
      { 'is-back': isBack },
      { 'is-hit': isHit },
      { 'no-tilt': disableTilt },
      { 'interacting': isInteracting }
    ]"
    :style="{ 
      width: typeof props.width === 'number' ? props.width + 'px' : props.width,
      '--card-opacity': isBack || disableTilt ? 0 : 1
    }"
    :data-rarity="rarityClass"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
    @click="handleClick"
  >
    <div class="card__translater">
      <div class="card__rotator">
        <div class="card__front">
          <img :src="imageSrc" @load="onImgLoad" alt="Card Front" />
          <!-- Shine & Glare: BẮT BUỘC có trong DOM để thư viện hoạt động -->
          <div class="card__shine"></div>
          <div class="card__glare"></div>
          
          <div v-if="isHit" class="card__hit-overlay"></div>
          <div v-if="!isLoaded" class="card__loading"><div class="spinner"></div></div>
        </div>
        <div class="card__back">
          <img src="/assets/cards/back.webp" alt="Card Back" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  --card-scale: 1;
  --rotate-x: 0deg;
  --rotate-y: 0deg;
  --pointer-x: 50%;
  --pointer-y: 50%;
  --pointer-from-center: 0;
  --card-opacity: 1;

  max-width: 100%;
  aspect-ratio: 0.714;
  position: relative;
  user-select: none;
  cursor: pointer;
  transform-style: preserve-3d;
}

/* Card Rotator: Xử lý lật mặt cơ bản bằng transition */
.card__rotator {
  transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  transform-style: preserve-3d;
}

.card.is-back .card__rotator {
  transform: rotateY(180deg) !important;
}

/* Ẩn mặt phía sau khi lật */
.card__front, .card__back {
  backface-visibility: hidden;
}

.card__front {
  transform: rotateY(0deg);
}

.card__back {
  transform: rotateY(180deg);
}

/* Hỗ trợ tắt Tilt */
.card.no-tilt .card__shine,
.card.no-tilt .card__glare {
  display: none;
}

.card.no-tilt .card__rotator {
  transform: none !important;
  transition: none;
}

/* Hit overlay */
.card__hit-overlay {
  position: absolute;
  inset: 0;
  background: rgba(239, 68, 68, 0.45);
  z-index: 20;
  animation: hit-flash 0.4s ease forwards;
}

@keyframes hit-flash { 0% { opacity: 1; } 100% { opacity: 0; } }

.card__loading {
  position: absolute;
  inset: 0;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.spinner {
  width: 40px; height: 40px;
  border: 4px solid rgba(255,255,255,0.1);
  border-left-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.card__front img, .card__back img {
  width: 100%; height: 100%;
  object-fit: cover; display: block;
}
</style>
```

---

## 3. SOURCE CODE: src/features/inventory/config/rarityAnimations.ts (FILE MỚI)

```typescript
export type RarityTier = 'common' | 'uncommon' | 'rare' | 'ultra' | 'ghost'

export interface RarityAnimConfig {
  tier: RarityTier
  flipClass: string;     // Class của wrapper để quay nhiều vòng
  duration: number;      // ms
  glowColor: string;
}

export const RARITY_ANIM_CONFIG: Record<RarityTier, RarityAnimConfig> = {
  common: { tier: 'common', flipClass: 'flip-normal', duration: 600, glowColor: 'transparent' },
  uncommon: { tier: 'uncommon', flipClass: 'flip-normal', duration: 600, glowColor: 'rgba(59, 130, 246, 0.4)' },
  rare: { tier: 'rare', flipClass: 'flip-extra-spin', duration: 1200, glowColor: 'rgba(234, 179, 8, 0.6)' },
  ultra: { tier: 'ultra', flipClass: 'flip-multi-spin', duration: 1800, glowColor: 'rgba(168, 85, 247, 0.8)' },
  ghost: { tier: 'ghost', flipClass: 'flip-ghost-spin', duration: 2500, glowColor: 'rgba(236, 72, 153, 1)' }
}

export function getRarityConfig(rarity?: string): RarityAnimConfig {
  if (!rarity) return RARITY_ANIM_CONFIG.common;
  const r = rarity.toLowerCase();
  if (r.includes('ghost') || r.includes('hyper')) return RARITY_ANIM_CONFIG.ghost;
  if (r.includes('ultra') || r.includes('full art')) return RARITY_ANIM_CONFIG.ultra;
  if (r.includes('rare') || r.includes('holo')) return RARITY_ANIM_CONFIG.rare;
  if (r.includes('uncommon')) return RARITY_ANIM_CONFIG.uncommon;
  return RARITY_ANIM_CONFIG.common;
}
```

---

## 4. SOURCE CODE: src/features/shop-ui/components/PackOpeningOverlay.vue

```vue
<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { getPackVisuals } from '../../inventory/config/assetRegistry'
import PokemonCard3D from '../../shared/components/PokemonCard3D.vue'
import { getRarityConfig } from '../../inventory/config/rarityAnimations'

const inventoryStore = useInventoryStore()
const flipped = ref<boolean[]>([])
const isPackShaking = ref(false)
const revealClasses = ref<string[]>([])

const cards = computed(() => inventoryStore.currentPack)
const phase = computed(() => inventoryStore.packPhase)
const isVisible = computed(() => inventoryStore.isOpeningPack)
const allFlipped = computed(() => flipped.value.length > 0 && flipped.value.every(f => f))

// Lấy ảnh Pack động dựa trên currentPackSetId
const packImageUrl = computed(() => {
  const setId = inventoryStore.currentPackSetId
  return setId ? getPackVisuals(setId).front : '/assets/packs/placeholder.png'
})

watch(() => [isVisible.value, cards.value.length], ([visible, count]) => {
  if (visible && count > 0) {
    flipped.value = new Array(count).fill(false)
    revealClasses.value = new Array(count).fill('')
    isPackShaking.value = false
  }
}, { immediate: true })

function handlePackClick() {
  if (isPackShaking.value || phase.value !== 'pack_visible') return
  isPackShaking.value = true
  // Sound effect logic here...
  setTimeout(() => {
    isPackShaking.value = false
    inventoryStore.revealCards()
  }, 600)
}

function flipCard(index: number) {
  if (flipped.value[index] || phase.value !== 'cards_visible') return
  
  const card = cards.value[index]
  const config = getRarityConfig(card?.rarity)
  
  // Set CLASS cho wrapper TRƯỚC để trigger animation
  revealClasses.value[index] = config.flipClass
  
  // Set flipped NGAY LẬP TỨC để UI mượt
  flipped.value[index] = true
  // playFlipSound()...
}

function handleCollect() {
  inventoryStore.closePackOpening()
}
</script>

<template>
  <Transition name="overlay-fade">
    <div v-if="isVisible" class="pack-overlay">
      <Transition name="phase-switch" mode="out-in">
        
        <!-- PHASE 1: PACK -->
        <div v-if="phase === 'pack_visible'" class="pack-phase" key="pack">
          <div class="pack-wrapper" :class="{ 'pack-shaking': isPackShaking }" @click="handlePackClick">
            <div class="pack-image-container">
              <img :src="packImageUrl" class="pack-front-img" />
              <div class="pack-shine"></div>
            </div>
          </div>
        </div>

        <!-- PHASE 2: CARDS -->
        <div v-else-if="phase === 'cards_visible'" class="cards-phase" key="cards">
          <div class="cards-grid">
            <div
              v-for="(card, index) in cards"
              :key="index"
              class="card-slot card-flip-container"
              :class="revealClasses[index]"
              @click="flipCard(index)"
            >
              <PokemonCard3D
                :card="card"
                :is-back="!flipped[index]"
                width="100%"
              />
              <div v-if="flipped[index]" class="card-price-tag">
                ${{ card?.pricing?.tcgplayer?.normal?.marketPrice || 'N/A' }}
              </div>
            </div>
          </div>

          <div class="controls-panel">
            <button v-if="allFlipped" class="btn-collect" @click="handleCollect">Thu thập tất cả</button>
          </div>
        </div>

      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.pack-overlay {
  position: absolute; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle, #1a2a44 0%, #000 100%);
}

.pack-wrapper { cursor: pointer; transition: transform 0.2s; }
.pack-shaking { animation: pack-shake 0.6s ease; }
.pack-front-img { width: 220px; filter: drop-shadow(0 0 15px rgba(255,255,255,0.2)); }

.cards-grid {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 2rem; width: 90%; max-width: 1200px;
}

/* CARD WRAPPER - XỬ LÝ QUAY NHIỀU VÒNG */
.card-flip-container {
  width: clamp(140px, 12vw, 200px);
  position: relative;
  perspective: 1000px;
}

/* Animation cho class flip-extra-spin */
.flip-extra-spin :deep(.card__rotator) {
  animation: extra-spin 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.flip-multi-spin :deep(.card__rotator) {
  animation: multi-spin 1.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes extra-spin {
  0% { transform: rotateY(180deg); }
  50% { transform: rotateY(540deg) scale(1.1); } /* Quay thêm 1 vòng */
  100% { transform: rotateY(0deg) scale(1); }
}

@keyframes multi-spin {
  0% { transform: rotateY(180deg); }
  33% { transform: rotateY(540deg) scale(1.05); }
  66% { transform: rotateY(900deg) scale(1.15); }
  100% { transform: rotateY(0deg) scale(1); }
}

@keyframes pack-shake {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(5deg); }
}

/* ... existing transitions ... */
</style>
```
