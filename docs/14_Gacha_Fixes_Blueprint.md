# 14_Gacha_Fixes_Blueprint.md
## Module: Gacha Animation Upgrade & Core Bug Fixes

---

## Sơ đồ thư mục

```
src/features/
├── shared/
│   ├── components/
│   │   └── PokemonCard3D.vue         ← FIX BUG 2: CSS Holo wrapper chuẩn
│   └── utils/
│       └── cardRarityMapper.ts       ← FIX BUG 2: rarity class mapping
├── inventory/
│   ├── store/
│   │   └── inventoryStore.ts         ← NO CHANGE
│   └── components/
│       └── PackOpeningOverlay.vue    ← UPGRADE: animation phase + rarity factory
└── api/
    └── services/
        └── dbWorker.ts               ← FIX BUG 1: retreatCost mapping
src/features/shop-ui/
└── components/
    └── CardDetailOverlay.vue         ← FIX BUG 1: hiển thị retreat cost đúng
```

---

## FIX BUG 1 — Retreat Cost hiện "None"

### Root Cause Analysis

Dữ liệu SQLite lưu cột là `retreatCost` (số nguyên), nhưng trong quá trình `processCardRow()` ở `apiStore.ts`, các trường JSON được parse và sau đó `retreatCost` không bị JSON.parse (vì nó là số, không phải chuỗi JSON). Vấn đề thực sự là **key mismatch** trong template hiển thị.

**Kiểm tra trong `CardDetailOverlay.vue`**, dòng hiển thị Retreat Cost:
```html
<!-- Hiện tại (sai): -->
<div v-for="n in (card.retreatCost || 0)" ...>

<!-- Vấn đề: card.retreatCost có thể là undefined nếu SQLite
     trả về key khác như 'retreat' hoặc 'retreat_cost' -->
```

### Step 1 — Chuẩn hóa trong `processCardRow()` (`apiStore.ts`)

Đây là nơi xử lý tất cả dữ liệu từ SQLite. Sửa hàm `processCardRow`:

```typescript
const processCardRow = (row: any) => {
  if (!row) return row
  const card = { ...row }

  // FIX: Chuẩn hóa retreatCost từ nhiều key có thể xuất hiện
  // SQLite scripts/build-db.ts insert cột tên 'retreatCost'
  // nhưng một số source data dùng 'retreat' hoặc 'retreatcost'
  if (card.retreatCost === undefined || card.retreatCost === null) {
    card.retreatCost = row.retreat ?? row.retreat_cost ?? row.retreatcost ?? 0
  }
  // Đảm bảo là number, không phải string
  card.retreatCost = parseInt(String(card.retreatCost ?? 0), 10) || 0

  // Parse các trường JSON thô từ SQLite
  const jsonFields = ['types', 'attacks', 'abilities', 'weaknesses', 'resistances', 'pricing']
  jsonFields.forEach(field => {
    if (typeof card[field] === 'string' && card[field].trim() !== '') {
      try {
        card[field] = JSON.parse(card[field])
      } catch (e) {
        card[field] = ['types', 'attacks', 'abilities', 'weaknesses', 'resistances'].includes(field) ? [] : null
      }
    }
  })

  return card
}
```

### Step 2 — Fix hiển thị trong `CardDetailOverlay.vue`

Tìm đoạn Retreat Cost trong template và sửa:

```html
<!-- TRƯỚC (lỗi nếu retreatCost là undefined): -->
<div
  v-for="n in (card.retreatCost || 0)"
  :key="n"
  class="energy-mini-icon icon-colorless"
>
</div>
<span v-if="!card.retreatCost" class="stat-none">None</span>

<!-- SAU (đúng): -->
<template v-if="card.retreatCost && card.retreatCost > 0">
  <div
    v-for="n in Number(card.retreatCost)"
    :key="n"
    class="energy-mini-icon icon-colorless"
  >
  </div>
</template>
<span v-else class="stat-none">None</span>
```

### Step 3 — Tương tự fix trong `BattleLogic.ts`

Hàm `parseRetreat` hiện tại xử lý tốt, nhưng đảm bảo `createBattleCard` truyền đúng:

```typescript
// Trong BattleLogic.createBattleCard():
retreat: BattleLogic.parseRetreat(cardData.retreatCost ?? cardData.retreat ?? 0),
// ← Thêm fallback cardData.retreat cho các card cũ trong cache
```

### Kiểm tra (Debug Query)

Chạy query này trong dbWorker để verify:
```sql
SELECT id, name, retreatCost FROM cards WHERE retreatCost IS NOT NULL LIMIT 10;
```
Nếu retreatCost trả về đúng numbers → lỗi chỉ là display. Nếu trả về NULL → lỗi ở scripts/build-db.ts (cột insert sai tên).

Trong `build-db.ts`, dòng insert:
```typescript
const retreat = retreatMatch ? retreatMatch[1] : '0';
// ... và cột trong INSERT là 'retreatCost'
insertCard.run(..., parseInt(retreat), ...)
```
Đối chiếu với `CREATE TABLE cards (... retreatCost INTEGER ...)` — phải khớp chính xác. Nếu cột SQLite là `retreatcost` (lowercase), sửa query trong `processCardRow`:
```typescript
card.retreatCost = row.retreatCost ?? row.retreatcost ?? row.retreat ?? 0
```

---

## FIX BUG 2 — CSS Holo Foil bị lỗi

### Root Cause Analysis

Thư viện `simeydotme/pokemon-cards-css` yêu cầu cấu trúc DOM rất chính xác. Hiện tại `PokemonCard3D.vue` render `.card__shine` và `.card__glare` bên trong `.card__front`, nhưng thiếu một số CSS custom properties (`--rotate-x`, `--rotate-y`, `--pointer-x`, etc.) ở root element `.card`.

### Cấu trúc DOM bắt buộc theo spec thư viện

```
.card[data-rarity="rare holo"]   ← CSS selector theo data-rarity
  .card__translater
    .card__rotator
      .card__front                ← Chứa ảnh thẻ
        img                       ← Ảnh bài (width: 100%, height: 100%, object-fit: cover)
        .card__shine              ← Hiệu ứng holo (z-index: 3)
        .card__glare              ← Hiệu ứng ánh sáng (z-index cao hơn .card__shine)
      .card__back                 ← Mặt sau
```

### Step 1 — Sửa `PokemonCard3D.vue` template

**Thay thế toàn bộ phần template:**

```vue
<template>
  <div
    ref="cardElement"
    class="card"
    :class="[
      rarityClass,
      { 'is-back': isBack },
      { 'is-hit': isHit },
      { 'no-tilt': disableTilt }
    ]"
    :style="{
      width: typeof props.width === 'number' ? props.width + 'px' : props.width,
      '--card-opacity': disableTilt ? '0' : '1'
    }"
    :data-rarity="rarityClass"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
    @click="handleClick"
    @contextmenu="handleContextMenu"
  >
    <div class="card__translater">
      <div class="card__rotator">

        <!-- FRONT SIDE: ảnh + holo effects -->
        <div class="card__front">
          <!-- Ảnh bài — PHẢI đặt trước shine/glare để z-index đúng -->
          <div v-if="!isLoaded" class="card__loading">
            <div class="spinner"></div>
          </div>
          <img
            v-if="imageSrc"
            :src="imageSrc"
            @load="onImgLoad"
            alt="Pokemon Card"
            loading="lazy"
          />

          <!-- Shine + Glare: chỉ render khi không disableTilt để tiết kiệm GPU -->
          <template v-if="!disableTilt">
            <div class="card__shine"></div>
            <div class="card__glare"></div>
          </template>

          <!-- Hit overlay -->
          <div v-if="isHit" class="card__hit-overlay"></div>
        </div>

        <!-- BACK SIDE -->
        <div class="card__back">
          <img src="/assets/cards/back.webp" alt="Card Back" loading="lazy" />
        </div>

      </div>
    </div>
  </div>
</template>
```

### Step 2 — Sửa CSS trong `PokemonCard3D.vue`

**Thêm/sửa `<style scoped>`:**

```css
.card {
  /* CSS custom properties BẮT BUỘC cho thư viện holo */
  --card-scale: 1;
  --rotate-x: 0deg;
  --rotate-y: 0deg;
  --pointer-x: 50%;
  --pointer-y: 50%;
  --pointer-from-center: 0;
  --pointer-from-left: 0.5;
  --pointer-from-top: 0.5;
  --background-x: 50%;
  --background-y: 50%;
  --card-opacity: 1;

  /* Aspect ratio Pokemon card: 2.5" × 3.5" = 5:7 */
  aspect-ratio: 5 / 7;
  max-width: 100%;
  position: relative;
  transition: transform 0.1s ease;
  user-select: none;
  cursor: pointer;
  /* QUAN TRỌNG: preserve-3d cho rotator hoạt động */
  transform-style: preserve-3d;
}

/* Khi disableTilt: tắt 3D, card phẳng hoàn toàn */
.card.no-tilt .card__rotator {
  transform: none !important;
}

/* Card đang úp mặt */
.card.is-back .card__rotator {
  transform: rotateY(180deg) !important;
}

/* Hit animation */
.card.is-hit {
  animation: card-shake 0.4s ease;
}

.card__hit-overlay {
  position: absolute;
  inset: 0;
  background: rgba(239, 68, 68, 0.45);
  border-radius: inherit;
  pointer-events: none;
  animation: hit-flash 0.4s ease forwards;
  z-index: 20;
}

@keyframes card-shake {
  0%   { transform: translateX(0); }
  15%  { transform: translateX(-6px) rotate(-2deg); }
  30%  { transform: translateX(6px) rotate(2deg); }
  45%  { transform: translateX(-4px) rotate(-1deg); }
  60%  { transform: translateX(4px) rotate(1deg); }
  75%  { transform: translateX(-2px); }
  100% { transform: translateX(0); }
}

@keyframes hit-flash {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

.card__loading {
  position: absolute;
  inset: 0;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  /* PHẢI có border-radius để khớp với card */
  border-radius: var(--card-radius, 4.55% / 3.5%);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255,255,255,0.1);
  border-left-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Ảnh phải FILL toàn bộ mặt trước */
.card__front img,
.card__back img {
  width: 100%;
  height: 100%;
  object-fit: cover;  /* cover chứ không phải contain để fill đúng */
  display: block;
  /* Đảm bảo ảnh nằm dưới shine/glare */
  position: relative;
  z-index: 1;
}
```

### Step 3 — Sửa `handleMouseMove` để set đúng CSS vars

```typescript
const handleMouseMove = (e: MouseEvent) => {
  if (props.disableTilt || !cardElement.value) return

  const rect = cardElement.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const px = Math.max(Math.min((100 / rect.width) * x, 100), 0)
  const py = Math.max(Math.min((100 / rect.height) * y, 100), 0)

  const pl = px / 100
  const pt = py / 100
  const p_xc = Math.abs(px - 50)
  const p_yc = Math.abs(py - 50)
  const pc = Math.sqrt(p_xc ** 2 + p_yc ** 2) / 50

  const rx = (px - 50) * -0.3
  const ry = (py - 50) * 0.3

  const st = cardElement.value.style
  // Set TẤT CẢ CSS vars mà thư viện cần
  st.setProperty('--pointer-x', `${px}%`)
  st.setProperty('--pointer-y', `${py}%`)
  st.setProperty('--pointer-from-left', `${pl}`)
  st.setProperty('--pointer-from-top', `${pt}`)
  st.setProperty('--pointer-from-center', `${pc}`)
  st.setProperty('--rotate-x', `${rx}deg`)
  st.setProperty('--rotate-y', `${ry}deg`)
  st.setProperty('--background-x', `${px}%`)
  st.setProperty('--background-y', `${py}%`)
  st.setProperty('--card-opacity', '1')
}

const handleMouseLeave = () => {
  if (props.disableTilt || !cardElement.value) return
  const st = cardElement.value.style
  st.setProperty('--pointer-x', '50%')
  st.setProperty('--pointer-y', '50%')
  st.setProperty('--rotate-x', '0deg')
  st.setProperty('--rotate-y', '0deg')
  st.setProperty('--pointer-from-center', '0')
  st.setProperty('--background-x', '50%')
  st.setProperty('--background-y', '50%')
}
```

### Step 4 — Đảm bảo `pokemon-cards.css` được import TRƯỚC component styles

Trong `main.ts` (đã đúng), kiểm tra thứ tự:
```typescript
import './style.css'
import './styles/globals.css'
import './assets/styles/pokemon-cards.css'  // ← PHẢI TRƯỚC component styles
```

---

## UPGRADE — Pack Opening Animation Architecture

### Mục tiêu

1. Render vỏ Pack chính xác (dùng `currentPackSetId`)
2. Animation xé vỏ → cards bay tỏa ra
3. Lá úp: box-shadow glow, KHÔNG bật 3D tilt
4. Hệ thống Rarity Factory để dễ mở rộng hiệu ứng

### Step 1 — RarityAnimationFactory

Tạo file `src/features/inventory/config/rarityAnimations.ts`:

```typescript
/**
 * RarityAnimationFactory
 * Định nghĩa config animation cho từng tier độ hiếm.
 * Mở rộng bằng cách thêm vào RARITY_ANIMATION_MAP.
 */

export type RarityTier = 'common' | 'uncommon' | 'rare' | 'ultra' | 'ghost'

export interface RarityAnimConfig {
  tier: RarityTier
  /** Số vòng flip animation (0.5 = nửa vòng lật) */
  flipRotations: number
  /** Duration mỗi vòng flip (ms) */
  flipDurationMs: number
  /** Có dimm màn hình không */
  dimScreen: boolean
  /** Có burst particle không */
  burst: boolean
  /** CSS glow color cho card */
  glowColor: string
  /** CSS class thêm vào wrapper khi reveal */
  revealClass: string
}

export const RARITY_ANIMATION_MAP: Record<RarityTier, RarityAnimConfig> = {
  common: {
    tier: 'common',
    flipRotations: 0.5,
    flipDurationMs: 300,
    dimScreen: false,
    burst: false,
    glowColor: 'transparent',
    revealClass: 'reveal-common',
  },
  uncommon: {
    tier: 'uncommon',
    flipRotations: 0.5,
    flipDurationMs: 350,
    dimScreen: false,
    burst: false,
    glowColor: 'rgba(59, 130, 246, 0.4)',
    revealClass: 'reveal-uncommon',
  },
  rare: {
    tier: 'rare',
    flipRotations: 1.5,     // 1.5 vòng = thêm 1 vòng lấp lánh
    flipDurationMs: 500,
    dimScreen: false,
    burst: false,
    glowColor: 'rgba(202, 138, 4, 0.6)',
    revealClass: 'reveal-rare',
  },
  ultra: {
    tier: 'ultra',
    flipRotations: 2,
    flipDurationMs: 600,
    dimScreen: true,
    burst: true,
    glowColor: 'rgba(124, 58, 237, 0.8)',
    revealClass: 'reveal-ultra',
  },
  ghost: {
    tier: 'ghost',
    flipRotations: 3,
    flipDurationMs: 800,
    dimScreen: true,
    burst: true,
    glowColor: 'rgba(236, 72, 153, 1.0)',
    revealClass: 'reveal-ghost',
  },
}

/**
 * Map rarity string từ database → RarityTier
 */
export function getRarityTier(rarity?: string): RarityTier {
  if (!rarity) return 'common'
  const r = rarity.toLowerCase()
  if (r.includes('ghost') || r.includes('hyper secret') || r.includes('mega secret')) return 'ghost'
  if (r.includes('ultra') || r.includes('illustration') || r.includes('full art') || r.includes('special')) return 'ultra'
  if (r.includes('holo') || r.includes('rare') || r.includes('double') || r.includes('ace spec')) return 'rare'
  if (r.includes('uncommon')) return 'uncommon'
  return 'common'
}

export function getAnimConfig(rarity?: string): RarityAnimConfig {
  const tier = getRarityTier(rarity)
  return RARITY_ANIMATION_MAP[tier]
}
```

### Step 2 — CSS cho Reveal Classes

Thêm vào `src/styles/globals.css` (không phải scoped):

```css
/* ===== PACK OPENING RARITY REVEALS ===== */
.reveal-common .card__rotator { animation: flip-simple 0.3s ease forwards; }
.reveal-uncommon .card__rotator { animation: flip-simple 0.35s ease forwards; }
.reveal-rare .card__rotator { animation: flip-rare 0.75s ease forwards; }
.reveal-ultra .card__rotator { animation: flip-ultra 1.2s ease forwards; }
.reveal-ghost .card__rotator { animation: flip-ghost 2.4s ease forwards; }

@keyframes flip-simple {
  0%   { transform: rotateY(180deg); }
  100% { transform: rotateY(0deg); }
}

@keyframes flip-rare {
  0%   { transform: rotateY(180deg); }
  33%  { transform: rotateY(540deg); }      /* 1.5 vòng */
  100% { transform: rotateY(0deg); }
}

@keyframes flip-ultra {
  0%   { transform: rotateY(180deg); }
  50%  { transform: rotateY(540deg) scale(1.05); }
  75%  { transform: rotateY(720deg) scale(1.08); }
  100% { transform: rotateY(0deg) scale(1); }
}

@keyframes flip-ghost {
  0%   { transform: rotateY(180deg); }
  20%  { transform: rotateY(540deg) scale(1.05); }
  40%  { transform: rotateY(900deg) scale(1.1); }
  60%  { transform: rotateY(1260deg) scale(1.08); }
  80%  { transform: rotateY(1260deg) scale(1.05); }
  100% { transform: rotateY(0deg) scale(1); }
}

/* Glow cho các lá bài đang úp (chưa lật) */
.gacha-card-back {
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.4), 0 8px 32px rgba(0,0,0,0.5);
  border-radius: 10px;
}

/* Ultra glow (thêm khi lật Ultra) */
.reveal-ultra .card__front,
.reveal-ghost .card__front {
  box-shadow: 0 0 40px var(--rarity-glow, rgba(124, 58, 237, 0.6)), 0 0 80px var(--rarity-glow, rgba(124, 58, 237, 0.3));
}
```

### Step 3 — Sửa `PackOpeningOverlay.vue` — Phase Animation

**Thêm imports và state:**

```typescript
import { getAnimConfig } from '../../inventory/config/rarityAnimations'

// Thêm state
const revealClasses = ref<string[]>([])   // class theo rarity cho mỗi card
const isDimmed = ref(false)               // màn hình tối khi reveal rare
const isBursting = ref(false)             // particle burst state (dùng CSS hoặc canvas nhỏ)
```

**Sửa watch khi cards load (Phase 1 → 2):**

```typescript
watch(
  () => [inventoryStore.isOpeningPack, cards.value.length] as [boolean, number],
  ([isOpening, count]) => {
    if (isOpening && count > 0) {
      flipped.value = new Array(count).fill(false)
      imageLoaded.value = new Array(count).fill(false)
      revealClasses.value = new Array(count).fill('')   // ← Thêm
      isPackShaking.value = false
      isDimmed.value = false
      stopAutoReveal()
    }
  },
  { immediate: true }
)
```

**Sửa `flipCard()` để áp dụng RarityFactory:**

```typescript
function flipCard(index: number) {
  if (flipped.value[index] || phase.value !== 'cards_visible') return

  const card = cards.value[index]
  const animConfig = getAnimConfig(card?.rarity)

  // Apply rarity class để trigger CSS animation
  revealClasses.value[index] = animConfig.revealClass

  // Dim màn hình nếu ultra+
  if (animConfig.dimScreen) {
    isDimmed.value = true
    setTimeout(() => { isDimmed.value = false }, animConfig.flipDurationMs + 300)
  }

  // Delay để match với flip animation duration
  setTimeout(() => {
    flipped.value[index] = true
  }, animConfig.flipDurationMs)

  // Sound effect
  playFlipSound()
  if (animConfig.tier === 'ultra' || animConfig.tier === 'ghost') {
    setTimeout(() => playRareSound(), animConfig.flipDurationMs * 0.3)
  }
}
```

**Sửa template cards-phase — thêm dim overlay + glow vars:**

```html
<!-- Dim overlay khi reveal rare/ultra -->
<Transition name="dim-fade">
  <div
    v-if="isDimmed"
    class="fixed inset-0 bg-black/70 z-10 pointer-events-none"
  />
</Transition>

<!-- Cards grid — thêm class reveal + CSS var glow -->
<div
  v-for="(card, index) in cards"
  :key="index"
  class="card-slot gacha-card"
  :class="revealClasses[index]"
  :style="flipped[index] && cards[index]
    ? { '--rarity-glow': getAnimConfig(cards[index]?.rarity).glowColor }
    : {}"
  @click="flipped[index] ? detailStore.openCard(card) : flipCard(index)"
>
  <PokemonCard3D
    :card="card"
    :is-back="!flipped[index]"
    :disable-tilt="!flipped[index]"   <!-- Lá úp: KHÔNG tilt -->
  />
  <!-- ... price tag ... -->
</div>
```

**Thêm CSS vào style scoped:**
```css
/* Lá bài đang úp mặt: glow không tilt */
.gacha-card :deep(.card.is-back .card__rotator) {
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.4), 0 8px 32px rgba(0,0,0,0.5);
  border-radius: 10px;
}

/* Dim transition */
.dim-fade-enter-active, .dim-fade-leave-active { transition: opacity 0.2s ease; }
.dim-fade-enter-from, .dim-fade-leave-to { opacity: 0; }
```

### Step 4 — Pack Tear Animation

Nâng cấp `handlePackClick()` để thêm tear animation trước khi reveal:

```typescript
async function handlePackClick() {
  if (isPackShaking.value || phase.value !== 'pack_visible') return

  isPackShaking.value = true
  playTearSound()

  // Phase 1a: Shake (600ms đã có)
  // Phase 1b: Sau shake, tween tear effect (CSS class)
  setTimeout(() => {
    isPackShaking.value = false

    // Thêm class tear để chạy CSS cut animation
    const packEl = document.querySelector('.pack-image-container')
    if (packEl) {
      packEl.classList.add('pack-tearing')
    }

    // Phase 2: Reveal cards sau tear animation
    setTimeout(() => {
      inventoryStore.revealCards()
    }, 400)

  }, 600)
}
```

**CSS cho pack tear (thêm vào style scoped PackOpeningOverlay):**

```css
@keyframes pack-tear {
  0%   { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); transform: scale(1); }
  30%  { clip-path: polygon(0 0, 100% 0, 100% 60%, 55% 45%, 45% 55%, 0 60%); transform: scale(1.05); }
  60%  { clip-path: polygon(0 0, 100% 0, 100% 30%, 60% 15%, 40% 25%, 0 20%); transform: scale(1.1) translateY(-10px); }
  100% { clip-path: polygon(0 0, 100% 0, 100% 0%, 50% 0%, 50% 0%, 0 0%); opacity: 0; transform: scale(0.8) translateY(-30px); }
}

.pack-tearing .pack-image-container {
  animation: pack-tear 0.4s ease-in forwards;
}
```

### Step 5 — Cards bay ra (Spread Animation)

Khi Phase 2 bắt đầu (cards_visible), các card xuất hiện với animation bay từ trung tâm ra vị trí:

```css
/* Thêm vào style scoped PackOpeningOverlay */
@keyframes card-fly-in {
  0% {
    transform: translate(var(--fly-from-x, 0), var(--fly-from-y, 0)) scale(0.3) rotate(var(--fly-rotate, 0deg));
    opacity: 0;
    filter: blur(8px);
  }
  60% {
    filter: blur(0);
    opacity: 1;
  }
  100% {
    transform: translate(0, 0) scale(1) rotate(0deg);
    opacity: 1;
  }
}

.gacha-card {
  animation: card-fly-in 0.6s cubic-bezier(0.19, 1, 0.22, 1) both;
  /* Delay staggered theo index */
  animation-delay: calc(var(--card-index, 0) * 80ms);
}
```

**Trong template, thêm CSS vars theo index:**
```html
<div
  v-for="(card, index) in cards"
  :key="index"
  class="card-slot gacha-card"
  :style="{
    '--card-index': index,
    '--fly-from-x': `${(index - 2.5) * 30}px`,
    '--fly-from-y': `${Math.abs(index - 2.5) * -20}px`,
    '--fly-rotate': `${(index - 2.5) * 8}deg`,
    '--rarity-glow': flipped[index] ? getAnimConfig(cards[index]?.rarity).glowColor : 'transparent'
  }"
  ...
>
```

---

## Checklist bắt buộc

**Bug 1 (Retreat Cost):**
- [ ] Kiểm tra bằng raw SQL query trước khi sửa code: `SELECT retreatCost FROM cards LIMIT 5`
- [ ] Sửa `processCardRow()` thêm fallback chain: `retreatCost ?? retreat ?? retreat_cost ?? 0`
- [ ] Parse về `parseInt()` — SQLite có thể trả về string nếu column type mismatch
- [ ] Template dùng `Number(card.retreatCost)` trong `v-for` — KHÔNG `card.retreatCost || 0` (falsy với số 0)

**Bug 2 (Holo CSS):**
- [ ] `.card__shine` và `.card__glare` phải là direct children của `.card__front` — KHÔNG wrap thêm div
- [ ] `.card__front img` phải có `object-fit: cover` (không phải `contain`) để fill full mặt thẻ
- [ ] Set `--card-opacity: 1` trong CSS vars ban đầu — thiếu biến này khiến shine invisible
- [ ] `pokemon-cards.css` import TRƯỚC component styles trong `main.ts`
- [ ] Test với `data-rarity="rare holo"` — nếu vẫn sai, check CSS specificity: `.card[data-rarity="rare holo"] .card__shine` cần chọn đúng element

**Gacha Animation:**
- [ ] `RarityAnimationFactory` PHẢI là pure TypeScript (không import Vue, không import Pinia)
- [ ] `revealClasses` là `ref<string[]>` (array), reset về `[]` mỗi lần mở pack mới
- [ ] Lá bài ĐANG ÚP phải có `:disable-tilt="true"` — tilt chỉ bật sau khi `flipped[index] === true`
- [ ] Dim overlay dùng `v-if` + `Transition`, KHÔNG dùng `v-show` (để tránh overlay block click)
- [ ] `flipCard()` set `revealClasses.value[index]` TRƯỚC khi set `flipped.value[index] = true` (delay setTimeout)
- [ ] Auto-reveal vẫn phải hoạt động sau khi upgrade — kiểm tra `startAutoReveal()` vẫn gọi `flipCard(i)`
- [ ] CSS animation `card-fly-in` chỉ chạy khi phase === 'cards_visible', KHÔNG chạy lại khi lật bài
- [ ] Import `getAnimConfig` từ `rarityAnimations.ts`, KHÔNG hardcode rarity check trong component
