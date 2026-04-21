# 17 — Card Grading & Advanced Binder Blueprint
### Tính năng: Dịch vụ chấm điểm PSA + Binder nâng cấp đa tab & filter

> **Status:** Ready for implementation  
> **Dependencies:** `inventoryStore.ts`, `apiStore.ts`, `statsStore.ts`, `BinderMenu.vue`, `PokemonCard3D.vue`, `TcgCard.vue`  
> **Architect notes:** Thẻ graded là entity có identity riêng (slab) ≠ stack thẻ thường. Cần tách `personalBinder` thành 2 collection rõ ràng.

---

## 0. Tổng quan luồng

```
Player mở PC App: Grading Service
      │
      ▼
Chọn thẻ từ StandardBinder  →  trả phí $50 → isGrading=true, gradingReturnDay=currentDay+2
      │                                      (thẻ bị lock: không bán, không đấu)
      ▼
─── Ngày sang ngày ───────────────────────────────
│   Mỗi khi startNewDay(): gradingStore.checkGradingStatus()
│       ├─ gradingReturnDay == currentDay?
│       │    YES → Random grade (1-10) + multiplier → tạo Slab object
│       │    NO  → bỏ qua (tiếp tục chờ)
│       │
│       └─ Tạo bưu kiện trong Phaser (spawn package sprite)
─────────────────────────────────────────────────
      │
      ▼
Player click bưu kiện → GradingReveal.vue animation
      │                  (lắc → hiện → chạy số → pháo hoa nếu 10)
      ▼
Slab được thêm vào GradedBinder (Tab "Graded Cards")
```

---

## 1. Cấu trúc Data

### 1.1. Mở rộng `CardData` và thêm `GradedCard`

**File:** `src/features/inventory/types/index.ts`

```typescript
export interface CardData {
  id: string
  name: string
  hp: number
  type: string
  rarity: string
  marketPrice: number
  imageKey: string

  // ── NEW: Trạng thái grading (chỉ áp dụng cho thẻ đang pending) ──
  /** True khi thẻ đang được gửi đi chấm điểm (KHÔNG dùng cho slab đã trả về) */
  isGrading?: boolean
  /** Ngày in-game mà thẻ sẽ được trả về (currentDay + 2) */
  gradingReturnDay?: number
}

/**
 * Thẻ đã được chấm điểm (Graded Slab).
 * Đây là entity RIÊNG, không trộn với personalBinder thường.
 * Mỗi slab có slabId unique — cùng 1 cardId có thể có nhiều slab với grade khác nhau.
 */
export interface GradedCard {
  slabId: string          // "slab_<timestamp>_<rand>"
  cardId: string          // ID gốc của thẻ từ API
  grade: number           // 1..10
  /** Hệ số nhân giá so với marketPrice gốc (đã lookup từ GRADE_TABLE) */
  priceMultiplier: number
  /** Ngày nhận được slab (để sort "mới nhất") */
  gradedOnDay: number
}

/**
 * Một bưu kiện đang chờ Player mở (spawn trong Phaser).
 */
export interface GradingPackage {
  packageId: string
  slabs: GradedCard[]    // Một bưu kiện có thể chứa nhiều slab (nếu Player gửi nhiều ngày trước)
  /** Tọa độ spawn trong shop (gần cửa hoặc quầy) */
  x: number
  y: number
}
```

### 1.2. Constants

**File:** `src/features/grading/config/index.ts` (NEW)

```typescript
/** Phí cho mỗi thẻ gửi chấm */
export const GRADING_FEE = 50

/** Số ngày in-game để chấm xong */
export const GRADING_DURATION_DAYS = 2

/**
 * Bảng tỷ lệ grade theo PSA.
 * prob phải cộng tổng = 1.0.
 * multiplier = hệ số nhân giá bán vs marketPrice.
 */
export interface GradeProbabilityEntry {
  grade: number
  prob: number
  multiplier: number
  label: string       // Hiển thị
  cssClass: string    // CSS class để style slab
}

export const GRADE_TABLE: GradeProbabilityEntry[] = [
  { grade: 10, prob: 0.05, multiplier: 20,  label: 'PRISTINE', cssClass: 'grade-10' },
  { grade: 9,  prob: 0.15, multiplier: 8,   label: 'MINT',     cssClass: 'grade-9'  },
  { grade: 8,  prob: 0.20, multiplier: 4,   label: 'NM-MT',    cssClass: 'grade-8'  },
  { grade: 7,  prob: 0.20, multiplier: 2.5, label: 'NM',       cssClass: 'grade-7'  },
  { grade: 6,  prob: 0.15, multiplier: 1.8, label: 'EX-MT',    cssClass: 'grade-6'  },
  { grade: 5,  prob: 0.10, multiplier: 1.3, label: 'EX',       cssClass: 'grade-5'  },
  { grade: 4,  prob: 0.07, multiplier: 1.0, label: 'VG-EX',    cssClass: 'grade-4'  },
  { grade: 3,  prob: 0.04, multiplier: 0.7, label: 'VG',       cssClass: 'grade-3'  },
  { grade: 2,  prob: 0.02, multiplier: 0.5, label: 'GOOD',     cssClass: 'grade-2'  },
  { grade: 1,  prob: 0.02, multiplier: 0.3, label: 'POOR',     cssClass: 'grade-1'  },
]
```

---

## 2. Quản lý State (`gradingStore.ts`)

**File:** `src/features/grading/store/gradingStore.ts` (NEW)

### 2.1. State structure

```typescript
import { defineStore } from 'pinia'
import { useStatsStore } from '../../stats/store/statsStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import {
  GRADING_FEE, GRADING_DURATION_DAYS, GRADE_TABLE,
  GradeProbabilityEntry
} from '../config'
import type { GradedCard, GradingPackage } from '../../inventory/types'

/** Thẻ đang được gửi đi chấm (trạng thái chờ) */
export interface PendingGradingItem {
  cardId: string
  sentOnDay: number
  returnOnDay: number
}

export const useGradingStore = defineStore('grading', {
  state: () => ({
    /** Thẻ đang gửi đi chấm, chưa về */
    pendingGrading: [] as PendingGradingItem[],

    /** Bộ sưu tập Slab — thẻ đã được chấm và trả về */
    gradedBinder: [] as GradedCard[],

    /** Bưu kiện đang nằm trong shop chờ Player mở */
    pendingPackages: [] as GradingPackage[],

    /** UI state: reveal animation đang hiển thị slab nào */
    revealingSlab: null as GradedCard | null,
    showRevealOverlay: false,
  }),

  getters: {
    pendingCount: (state) => state.pendingGrading.length,
    totalSlabs: (state) => state.gradedBinder.length,
  },

  actions: {
    // ... xem các phần 2.2 - 2.5
  }
})
```

### 2.2. Action `sendCardToGrading()` — Player gửi thẻ đi chấm

```typescript
/**
 * Gửi 1 thẻ từ personalBinder đi chấm điểm.
 * - Kiểm tra: Player có thẻ, đủ tiền ($50), thẻ chưa bị grading.
 * - Trừ thẻ khỏi binder (decrement qty).
 * - Thêm vào pendingGrading.
 */
sendCardToGrading(cardId: string): { success: boolean; reason?: string } {
  const statsStore = useStatsStore()
  const inventoryStore = useInventoryStore()

  // 1. Kiểm tra thẻ có trong binder
  const qty = inventoryStore.personalBinder[cardId] ?? 0
  if (qty <= 0) {
    return { success: false, reason: 'Bạn không có thẻ này trong binder.' }
  }

  // 2. Kiểm tra tiền
  if (statsStore.money < GRADING_FEE) {
    return { success: false, reason: `Không đủ tiền. Cần $${GRADING_FEE}.` }
  }

  // 3. Thực hiện
  statsStore.spendMoney(GRADING_FEE)
  inventoryStore.personalBinder[cardId]--
  if (inventoryStore.personalBinder[cardId] === 0) {
    delete inventoryStore.personalBinder[cardId]
  }

  const currentDay = statsStore.currentDay
  this.pendingGrading.push({
    cardId,
    sentOnDay: currentDay,
    returnOnDay: currentDay + GRADING_DURATION_DAYS,
  })

  return { success: true }
},
```

### 2.3. Action `checkGradingStatus()` — gọi khi qua ngày mới

```typescript
/**
 * Kiểm tra và xử lý các thẻ đã chấm xong.
 * → Gọi từ gameStore.startNewDay() SAU khi statsStore.startNewDay() đã increment currentDay.
 *
 * Mỗi thẻ đã tới ngày:
 *   1. RNG grade dựa vào GRADE_TABLE.prob
 *   2. Tạo GradedCard (slab) với slabId unique
 *   3. Gom các slab về cùng 1 GradingPackage (bưu kiện)
 */
checkGradingStatus() {
  const statsStore = useStatsStore()
  const currentDay = statsStore.currentDay

  // Split: thẻ đã về vs chưa về
  const returned: PendingGradingItem[] = []
  const stillPending: PendingGradingItem[] = []

  for (const item of this.pendingGrading) {
    if (item.returnOnDay <= currentDay) {
      returned.push(item)
    } else {
      stillPending.push(item)
    }
  }

  this.pendingGrading = stillPending

  if (returned.length === 0) return

  // Tạo slab cho từng thẻ đã về
  const newSlabs: GradedCard[] = returned.map(item => this._rollSlab(item, currentDay))

  // Đóng gói tất cả vào 1 bưu kiện
  const pkg: GradingPackage = {
    packageId: `pkg_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    slabs: newSlabs,
    // Tọa độ spawn — Phaser sẽ pick từ EnvironmentManager
    x: 0, y: 0,
  }
  this.pendingPackages.push(pkg)

  // Phát event cho Phaser biết spawn bưu kiện
  window.dispatchEvent(new CustomEvent('grading:package-arrived', {
    detail: { packageId: pkg.packageId }
  }))
},
```

### 2.4. RNG Logic — `_rollSlab()`

```typescript
/**
 * Random điểm theo xác suất trong GRADE_TABLE.
 *
 * CÁCH: Tạo 1 số random [0, 1), duyệt GRADE_TABLE cộng dồn prob
 * và return entry đầu tiên khi accumulated >= roll.
 */
_rollSlab(item: PendingGradingItem, gradedOnDay: number): GradedCard {
  const roll = Math.random()
  let accumulated = 0
  let picked: GradeProbabilityEntry | null = null

  for (const entry of GRADE_TABLE) {
    accumulated += entry.prob
    if (roll <= accumulated) {
      picked = entry
      break
    }
  }
  // Safety fallback — nếu prob sum < 1 do floating errors, lấy entry cuối
  if (!picked) picked = GRADE_TABLE[GRADE_TABLE.length - 1]

  return {
    slabId: `slab_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    cardId: item.cardId,
    grade: picked.grade,
    priceMultiplier: picked.multiplier,
    gradedOnDay,
  }
},
```

### 2.5. Action `openPackage()` — Player click bưu kiện

```typescript
/**
 * Player click vào bưu kiện trong shop → mở và reveal từng slab.
 *
 * LUỒNG:
 *   - Shift 1 slab ra, trigger showRevealOverlay.
 *   - Sau khi user xem xong, gọi completeReveal() để add vào gradedBinder.
 *   - Nếu package vẫn còn slab → giữ lại trong pendingPackages để Player mở tiếp.
 */
openPackage(packageId: string) {
  const pkg = this.pendingPackages.find(p => p.packageId === packageId)
  if (!pkg || pkg.slabs.length === 0) return

  const slab = pkg.slabs.shift()!
  this.revealingSlab = slab
  this.showRevealOverlay = true

  // Nếu hết slab → remove package
  if (pkg.slabs.length === 0) {
    this.pendingPackages = this.pendingPackages.filter(p => p.packageId !== packageId)
    // Thông báo Phaser despawn sprite bưu kiện
    window.dispatchEvent(new CustomEvent('grading:package-consumed', {
      detail: { packageId }
    }))
  }
},

/**
 * Gọi từ GradingReveal.vue sau khi animation kết thúc.
 * Thêm slab đã reveal vào gradedBinder.
 */
completeReveal() {
  if (this.revealingSlab) {
    this.gradedBinder.push(this.revealingSlab)
  }
  this.revealingSlab = null
  this.showRevealOverlay = false
},
```

### 2.6. Gọi từ `gameStore.startNewDay()`

**File:** `src/features/shop-ui/store/gameStore.ts`

Thêm vào action `startNewDay()`:

```typescript
startNewDay() {
  // ... logic cũ (statsStore.startNewDay, etc.)

  // ── NEW: Kiểm tra thẻ đã chấm xong ──
  useGradingStore().checkGradingStatus()

  this.saveGame()
}
```

### 2.7. Save/Load

Thêm vào `saveGame()`:

```typescript
const saveData = {
  // ... các field cũ
  gradingPending: useGradingStore().pendingGrading,
  gradedBinder: useGradingStore().gradedBinder,
  pendingPackages: useGradingStore().pendingPackages,
}
```

Và `loadGradingState()`:

```typescript
loadGradingState(parsed: any) {
  this.pendingGrading = parsed.gradingPending ?? []
  this.gradedBinder = parsed.gradedBinder ?? []
  this.pendingPackages = parsed.pendingPackages ?? []
  this.revealingSlab = null
  this.showRevealOverlay = false
}
```

---

## 3. PC App — Grading Service UI

**File:** `src/features/grading/components/GradingServiceApp.vue` (NEW)

### 3.1. Layout

```
┌──────────────────────────────────────────────────────┐
│  🏆 PSA Grading Service                        [X]   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Phí dịch vụ: $50 / thẻ   |   Thời gian: 2 ngày     │
│                                                      │
│  ┌─ Đang gửi đi chấm (3) ─────────────────────────┐ │
│  │  • Charizard — Trả về ngày 12 (1 ngày nữa)    │ │
│  │  • Blastoise  — Trả về ngày 12 (1 ngày nữa)   │ │
│  │  • Mewtwo     — Trả về ngày 13 (2 ngày nữa)   │ │
│  └───────────────────────────────────────────────┘ │
│                                                      │
│  ── CHỌN THẺ TỪ BINDER ────────────────────────────  │
│  [Filter: Hệ ▼] [Rarity ▼] [Type ▼]               │
│                                                      │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐               │
│  │card│ │card│ │card│ │card│ │card│ │card│          │
│  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘               │
│                                                      │
│  Đã chọn: 0 thẻ       Tổng phí: $0                  │
│  [GỬI ĐI CHẤM ĐIỂM]                                  │
└──────────────────────────────────────────────────────┘
```

### 3.2. Component skeleton

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGradingStore } from '../store/gradingStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { useStatsStore } from '../../stats/store/statsStore'
import { GRADING_FEE, GRADING_DURATION_DAYS } from '../config'
import TcgCard from '../../shared/components/TcgCard.vue'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ close: [] }>()

const gradingStore = useGradingStore()
const inventoryStore = useInventoryStore()
const apiStore = useApiStore()
const statsStore = useStatsStore()

const selectedCardIds = ref<Set<string>>(new Set())

// Cards available (in binder, not currently being graded)
const availableCards = computed(() => {
  return Object.keys(inventoryStore.personalBinder)
    .map(id => ({
      id,
      qty: inventoryStore.personalBinder[id],
      card: apiStore.flatCardMap[id],
    }))
    .filter(entry => entry.card != null)
})

const totalFee = computed(() => selectedCardIds.value.size * GRADING_FEE)

function toggleSelect(id: string) {
  if (selectedCardIds.value.has(id)) {
    selectedCardIds.value.delete(id)
  } else {
    selectedCardIds.value.add(id)
  }
}

function submitAll() {
  if (statsStore.money < totalFee.value) {
    alert(`Bạn cần $${totalFee.value} để gửi ${selectedCardIds.value.size} thẻ.`)
    return
  }

  for (const id of selectedCardIds.value) {
    const result = gradingStore.sendCardToGrading(id)
    if (!result.success) {
      console.warn(`[Grading] Failed for ${id}: ${result.reason}`)
      break
    }
  }
  selectedCardIds.value.clear()
}
</script>

<template>
  <div v-if="isOpen" class="grading-app-overlay">
    <div class="grading-app-panel">
      <header>
        <h2>🏆 PSA Grading Service</h2>
        <button @click="emit('close')">✕</button>
      </header>

      <div class="service-info">
        <div>Phí: <strong>${{ GRADING_FEE }}</strong> / thẻ</div>
        <div>Thời gian: <strong>{{ GRADING_DURATION_DAYS }} ngày</strong></div>
      </div>

      <!-- Danh sách pending -->
      <section class="pending-list">
        <h3>Đang gửi đi chấm ({{ gradingStore.pendingGrading.length }})</h3>
        <ul v-if="gradingStore.pendingGrading.length > 0">
          <li v-for="p in gradingStore.pendingGrading" :key="p.cardId + p.sentOnDay">
            <span>{{ apiStore.flatCardMap[p.cardId]?.name ?? p.cardId }}</span>
            <span>Trả về ngày {{ p.returnOnDay }}
              ({{ p.returnOnDay - statsStore.currentDay }} ngày nữa)</span>
          </li>
        </ul>
        <p v-else class="empty">Chưa có thẻ nào đang chấm.</p>
      </section>

      <!-- Picker -->
      <section class="picker">
        <h3>Chọn thẻ từ Binder:</h3>
        <div class="cards-grid">
          <div
            v-for="entry in availableCards" :key="entry.id"
            class="card-wrapper"
            :class="{ selected: selectedCardIds.has(entry.id) }"
            @click="toggleSelect(entry.id)"
          >
            <TcgCard :card="entry.card" :is-flipped="true" size="small" />
            <div class="qty-badge">×{{ entry.qty }}</div>
          </div>
        </div>
      </section>

      <footer>
        <div>Đã chọn: <strong>{{ selectedCardIds.size }}</strong> thẻ</div>
        <div>Tổng phí: <strong>${{ totalFee }}</strong></div>
        <EnhancedButton
          variant="success" size="lg"
          :disabled="selectedCardIds.size === 0 || statsStore.money < totalFee"
          @click="submitAll"
        >
          Gửi đi chấm
        </EnhancedButton>
      </footer>
    </div>
  </div>
</template>
```

### 3.3. Filter nâng cao (computed)

Xem phần **4. Binder & Filter** — dùng chung logic filter ở đây.

---

## 4. Logic Binder & Filter (`PersonalBinder.vue`)

Tách `BinderMenu.vue` hiện tại thành 2 tab: **Standard** và **Graded**.

### 4.1. Structure mới của BinderMenu

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useInventoryStore } from '../store/inventoryStore'
import { useGradingStore } from '../../grading/store/gradingStore'
import { useApiStore } from '../store/apiStore'
// ... imports khác

const inventoryStore = useInventoryStore()
const gradingStore = useGradingStore()
const apiStore = useApiStore()

type TabKey = 'standard' | 'graded'
const activeTab = ref<TabKey>('standard')

// ── Filter state ──────────────────────────────────
interface BinderFilters {
  energyType: string     // 'All' | 'Fire' | 'Water' | ...
  rarity: string         // 'All' | 'Common' | 'Rare' | ...
  cardType: string       // 'All' | 'Holo' | 'VMAX' | 'VSTAR' | 'EX' | ...
  minGrade: number       // 0 = no filter, 1..10 = filter >= này (chỉ cho Graded tab)
}

const filters = ref<BinderFilters>({
  energyType: 'All',
  rarity: 'All',
  cardType: 'All',
  minGrade: 0,
})

// Options cho dropdown
const ENERGY_TYPES = ['All', 'Fire', 'Water', 'Grass', 'Lightning', 'Psychic',
                       'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless']
const RARITIES = ['All', 'Common', 'Uncommon', 'Rare', 'Rare Holo', 'Ultra Rare',
                   'Secret Rare', 'Hyper Rare']
const CARD_TYPES = ['All', 'Normal', 'Holo', 'VMAX', 'VSTAR', 'EX', 'V', 'Full Art']
</script>
```

### 4.2. Computed filtered — **logic CORE**

```typescript
/**
 * Map raw card + filters → pass/fail.
 * Dùng cho cả Standard tab và Graded tab (khác nhau ở minGrade).
 */
function matchesFilters(card: any, filters: BinderFilters, grade?: number): boolean {
  if (!card) return false

  // Energy Type filter
  if (filters.energyType !== 'All') {
    const types: string[] = card.types ?? []
    if (!types.includes(filters.energyType)) return false
  }

  // Rarity filter — so sánh substring cho linh hoạt ("Rare Holo V" match "Rare Holo")
  if (filters.rarity !== 'All') {
    const cardRarity = (card.rarity ?? 'Common').toLowerCase()
    const filterRarity = filters.rarity.toLowerCase()
    if (!cardRarity.includes(filterRarity)) return false
  }

  // Card Type filter — check rarity string chứa keyword
  if (filters.cardType !== 'All') {
    const rarityStr = (card.rarity ?? '').toUpperCase()
    switch (filters.cardType) {
      case 'VMAX':     if (!rarityStr.includes('VMAX')) return false; break
      case 'VSTAR':    if (!rarityStr.includes('VSTAR')) return false; break
      case 'EX':       if (!rarityStr.includes('EX') || rarityStr.includes('VMAX')) return false; break
      case 'V':
        if (!rarityStr.match(/\bV\b/) || rarityStr.includes('VMAX') || rarityStr.includes('VSTAR')) return false
        break
      case 'Holo':     if (!rarityStr.includes('HOLO')) return false; break
      case 'Full Art': if (!rarityStr.includes('FULL ART')) return false; break
      case 'Normal':
        if (rarityStr.match(/HOLO|VMAX|VSTAR|EX|FULL ART|ULTRA|SECRET/)) return false
        break
    }
  }

  // Grade filter (chỉ áp dụng nếu grade được truyền vào — tức tab Graded)
  if (grade !== undefined && filters.minGrade > 0) {
    if (grade < filters.minGrade) return false
  }

  return true
}

// ── Standard Binder (thẻ thường) ────────────────────────────
const filteredStandardCards = computed(() => {
  return Object.keys(inventoryStore.personalBinder).map(id => ({
    id,
    card: apiStore.flatCardMap[id],
    qty: inventoryStore.personalBinder[id],
  })).filter(entry =>
    entry.card && matchesFilters(entry.card, filters.value)
  )
})

// ── Graded Binder (slab) ─────────────────────────────────────
const filteredGradedSlabs = computed(() => {
  return gradingStore.gradedBinder.map(slab => ({
    slab,
    card: apiStore.flatCardMap[slab.cardId],
  })).filter(entry =>
    entry.card && matchesFilters(entry.card, filters.value, entry.slab.grade)
  ).sort((a, b) => b.slab.grade - a.slab.grade)  // Sort grade desc
})
```

### 4.3. Template — Tabs + Filter bar

```vue
<template>
  <div v-if="gameStore.showBinderMenu" class="binder-overlay">
    <!-- Close button -->
    <div class="absolute top-6 right-6 z-[200]">
      <EnhancedButton variant="icon" :icon="{ name: 'close' }" @click="..." />
    </div>

    <div class="binder-container">
      <!-- Tab Switcher -->
      <div class="tabs">
        <button
          class="tab-btn" :class="{ active: activeTab === 'standard' }"
          @click="activeTab = 'standard'"
        >
          Standard Cards
          <span class="count">{{ Object.keys(inventoryStore.personalBinder).length }}</span>
        </button>
        <button
          class="tab-btn" :class="{ active: activeTab === 'graded' }"
          @click="activeTab = 'graded'"
        >
          🏆 Graded Cards
          <span class="count">{{ gradingStore.gradedBinder.length }}</span>
        </button>
      </div>

      <!-- Filter Bar -->
      <div class="filter-bar">
        <label>
          Hệ:
          <select v-model="filters.energyType">
            <option v-for="t in ENERGY_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label>
          Rarity:
          <select v-model="filters.rarity">
            <option v-for="r in RARITIES" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>
        <label>
          Type:
          <select v-model="filters.cardType">
            <option v-for="t in CARD_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label v-if="activeTab === 'graded'">
          Min Grade:
          <select v-model.number="filters.minGrade">
            <option :value="0">Any</option>
            <option v-for="g in [10, 9, 8, 7, 6, 5]" :key="g" :value="g">≥ {{ g }}</option>
          </select>
        </label>
      </div>

      <!-- Tab Content -->
      <div v-if="activeTab === 'standard'" class="cards-grid">
        <div v-for="entry in filteredStandardCards" :key="entry.id" class="card-slot">
          <TcgCard :card="entry.card" :is-flipped="true" :show-quantity="true"
                   :quantity="entry.qty" size="small"
                   @click="openDetail(entry.card)" />
        </div>
      </div>

      <div v-else class="cards-grid">
        <div v-for="entry in filteredGradedSlabs" :key="entry.slab.slabId" class="slab-slot">
          <SlabDisplay :slab="entry.slab" :card="entry.card"
                       @click="openSlabDetail(entry.slab)" />
        </div>
      </div>
    </div>
  </div>
</template>
```

### 4.4. Component `SlabDisplay.vue`

Render 1 slab card với khung nhựa bảo vệ + label grade:

```vue
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
  const base = props.card?.pricing?.tcgplayer?.normal?.marketPrice ?? 0
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
  border-radius: 8px;
  padding: 8px 6px;
  background: linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4),
              inset 0 1px 2px rgba(255, 255, 255, 0.8);
  border: 2px solid #94a3b8;
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
}

.slab-price {
  text-align: center;
  font-weight: 800;
  color: #059669;
  margin-top: 6px;
  font-size: 0.85rem;
}

/* Golden glow for Grade 10 */
.grade-10 {
  border-color: #fbbf24;
  background: linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%);
}

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

.grade-9 { border-color: #60a5fa; }
.grade-8 { border-color: #34d399; }
.grade-7 { border-color: #a3e635; }
/* Grade 6 trở xuống giữ grey default */
</style>
```

---

## 5. Animation Component (`GradingReveal.vue`)

**File:** `src/features/grading/components/GradingReveal.vue` (NEW)

### 5.1. Quy trình Animation

```
Phase 1 (0 - 1s):    SHAKE      → Hộp slab lắc qua lại
Phase 2 (1s - 2s):   REVEAL     → Card hiện ra từ mờ (fade + scale)
Phase 3 (2s - 4.5s): NUMBER_ROLL → Số grade chạy ngẫu nhiên 1..10, dừng ở final
Phase 4 (4.5s+):     FINALE     → Hiện label PSA, nếu grade=10 → pháo hoa
```

### 5.2. Component code

```vue
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
```

### 5.3. Mount vào App

```vue
<!-- App.vue -->
<GradingReveal />
```

---

## 6. Phaser — Bưu kiện Package

**File:** `src/features/environment/managers/DeliveryManager.ts` (hoặc tạo riêng `PackageManager.ts`)

### 6.1. Listen event và spawn sprite

```typescript
// Trong constructor hoặc init()
window.addEventListener('grading:package-arrived', ((ev: CustomEvent) => {
  const { packageId } = ev.detail
  this.spawnGradingPackage(packageId)
}) as EventListener)

window.addEventListener('grading:package-consumed', ((ev: CustomEvent) => {
  const { packageId } = ev.detail
  this.removeGradingPackage(packageId)
}) as EventListener)

private packageSprites: Map<string, Phaser.GameObjects.Sprite> = new Map()

private spawnGradingPackage(packageId: string) {
  // Spawn gần cửa shop
  const door = this.environmentManager.getDoorLocation()
  const x = door.x + 60 + Math.random() * 40
  const y = door.y + 30

  const sprite = this.scene.add.sprite(x, y, TEX.PACKAGE_BOX) // artist cung cấp
    .setOrigin(0.5, 1)
    .setInteractive({ useHandCursor: true })
    .setDepth(DEPTH.LAYER3_OBJECTS + y)

  // Icon ❓ trên đầu để Player biết click được
  const label = this.scene.add.text(x, y - 50, '❓', { fontSize: '20px' })
    .setOrigin(0.5)
    .setDepth(DEPTH.UI_TEXT)

  // Click handler
  sprite.on('pointerdown', () => {
    useGradingStore().openPackage(packageId)
  })

  // Idle bounce
  this.scene.tweens.add({
    targets: [sprite, label],
    y: '-=6',
    duration: 800, yoyo: true, repeat: -1,
  })

  this.packageSprites.set(packageId, sprite)
  sprite.setData('label', label)
}

private removeGradingPackage(packageId: string) {
  const sprite = this.packageSprites.get(packageId)
  if (!sprite) return
  const label = sprite.getData('label') as Phaser.GameObjects.Text
  label?.destroy()
  sprite.destroy()
  this.packageSprites.delete(packageId)
}
```

---

## 7. Integration Checklist

### 7.1. Gắn graded cards vào hệ thống bán

Thẻ graded KHÔNG bán qua NPC tự động (không để lên shelf). Player bán qua:
- **Display Case** (từ Blueprint 16) — graded cards dùng chung shelf `display_case`.
- **Online Marketplace** (future) — nếu có module bán online.

Khi đặt slab lên display_case, `customPrice` default = `marketPrice × priceMultiplier`.

### 7.2. Lock thẻ đang gửi đi chấm khỏi Battle

Trong `battleStore.openBattleWithDeck` / `confirmDeck`:

```typescript
// Skip cards đang được grading
const binderCardIds = Object.keys(inventoryStore.personalBinder)
  .filter(id => !gradingStore.pendingGrading.some(p => p.cardId === id))
  .slice(0, 5)
```

### 7.3. UIOverlay — thêm entry mở Grading App

```vue
<EnhancedButton variant="primary" @click="gameStore.setShowGradingApp(true)">
  🏆 Grading Service
</EnhancedButton>
```

`gameStore.setShowGradingApp()` → set flag trong `uiStore`.

---

## 8. Testing Checklist

- [ ] Gửi 1 thẻ đi chấm → trừ $50, thẻ biến mất khỏi binder, xuất hiện trong pendingGrading.
- [ ] Không đủ tiền → UI báo lỗi, không trừ tiền, không lấy thẻ.
- [ ] Qua 2 ngày → bưu kiện xuất hiện gần cửa shop.
- [ ] Click bưu kiện → GradingReveal animation chạy đủ 4 phase.
- [ ] Mở 5 slab lần lượt — phân phối grade khớp GRADE_TABLE.prob (test 1000 rolls).
- [ ] Grade 10 → có hiệu ứng golden glow + fireworks.
- [ ] Slab được thêm vào gradedBinder sau khi click "Thêm vào Binder".
- [ ] Binder: tab Standard show thẻ thường, tab Graded show slab.
- [ ] Filter Energy Type = Fire → chỉ hiện thẻ có types includes 'Fire'.
- [ ] Filter Rarity = Rare → hiện cả "Rare Holo", "Rare Ultra" (substring match).
- [ ] Filter Card Type = VMAX → chỉ thẻ VMAX.
- [ ] Filter Min Grade = 9 → chỉ slab grade 9, 10.
- [ ] Save/Load → gradedBinder và pendingGrading được restore đúng.
- [ ] Battle → không cho chọn thẻ đang pending grading.

---

## 9. File list tóm tắt

| File | Loại | Mô tả |
|------|------|-------|
| `grading/config/index.ts` | NEW | Constants + GRADE_TABLE |
| `grading/store/gradingStore.ts` | NEW | Pinia store |
| `grading/components/GradingServiceApp.vue` | NEW | PC app UI |
| `grading/components/GradingReveal.vue` | NEW | Animation overlay |
| `shared/components/SlabDisplay.vue` | NEW | Render 1 slab |
| `inventory/components/BinderMenu.vue` | EDIT | Tabs + filters |
| `inventory/types/index.ts` | EDIT | GradedCard, CardData extensions |
| `shop-ui/store/gameStore.ts` | EDIT | startNewDay → checkGradingStatus + save/load |
| `environment/managers/DeliveryManager.ts` | EDIT | Spawn/despawn package sprite |
| `App.vue` | EDIT | Mount GradingServiceApp + GradingReveal |

---

## 10. Rollout Order

1. **Phase A** — Data layer: types + gradingStore + GRADE_TABLE. Không UI.
2. **Phase B** — Grading Service App (gửi thẻ). Test bằng dev console: `gradingStore.checkGradingStatus()` thủ công.
3. **Phase C** — Phaser package sprite + reveal animation. Core loop chạy được.
4. **Phase D** — Binder tabs + filters.
5. **Phase E** — Polish: golden glow, fireworks, integrate với display case.



# Walkthrough - Card Grading & Advanced Binder

I have successfully implemented the complete Card Grading and Advanced Binder system as defined in the project blueprint. This system allows players to send their cards for professional grading (PSA-style), receive them as "slabs" in physical packages, and manage them in an upgraded binder.

## Features Implemented

### 1. Data & State Foundation
- Extended `CardData` with grading metadata.
- Created `GradedCard` (slab) and `GradingPackage` entities.
- Implemented `GradingStore` using Pinia to manage the entire lifecycle:
    - Sending cards to grading (with fees and duration).
    - RNG-based grading logic (Grade 1-10 with weightings).
    - Daily cycle checks.
    - Reveal process management.

### 2. PC App: Grading Service
- Created `GradingServiceApp` component.
- Allows players to select cards from their binder and submit them for grading ($50 fee per card).
- Integrated with the in-game PC interface.

### 3. Immersive Reveal Animation
- Created `GradingReveal` component with a high-stakes animation sequence:
    - **Shake Phase**: Building anticipation.
    - **Rolling Phase**: Randomized numbers flickering.
    - **Finale Phase**: Reveal of the final grade, price multiplier, and special effects.
    - **Grade 10 Effects**: Golden glow and fireworks for "Pristine" cards.

### 4. Advanced Binder Upgrade
- Refactored the Binder interface into a dual-tab system:
    - **Standard Tab**: Existing cards with new filtering options.
    - **Graded Tab**: Displaying slabs using the new `SlabDisplay` component.
- Added advanced filters: Energy Type, Rarity, Card Type, and Min Grade (for slabs).

### 5. World Integration (Phaser)
- Updated `DeliveryManager` to handle physical grading packages.
- Packages "drop" from the sky near the shop door when grading is complete.
- Implemented interactive package sprites that trigger the reveal sequence when clicked.
- Added `PACKAGE_BOX` texture assets.

### 6. Economy & Display Case Integration
- Added `placeSlabOnDisplayCase` to the furniture store.
- NPCs can now purchase graded cards from display cases.
- Heuristic pricing: NPCs will pay up to 1.5x the (market price × grade multiplier).

## Verification Results

### Automated Build
- All phases verified with successful `npm run build`.

### Manual Testing Points
- [x] Card submission correctly deducts money and binder quantity.
- [x] Daily cycle triggers package arrival and world spawn.
- [x] Reveal animation correctly displays and awards slabs.
- [x] Binder tabs and filters correctly isolate and display relevant items.
- [x] Slabs can be placed on display cases and sold to NPCs at premium prices.

> [!IMPORTANT]
> Graded cards are currently locked from Battle use as they are removed from the `personalBinder` and treated as high-value collectibles.

## Key Files
- [gradingStore.ts](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/grading/store/gradingStore.ts)
- [GradingServiceApp.vue](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/grading/components/GradingServiceApp.vue)
- [GradingReveal.vue](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/grading/components/GradingReveal.vue)
- [BinderMenu.vue](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/inventory/components/BinderMenu.vue)
- [DeliveryManager.ts](file:///f:/Phatnt-sources/tcg-cards-shop-webpage/src/features/environment/managers/DeliveryManager.ts)
