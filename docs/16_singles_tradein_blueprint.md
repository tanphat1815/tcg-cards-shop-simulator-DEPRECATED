# 16 — Singles Trade-In Blueprint
### Tính năng: Khách hàng bán lại thẻ lẻ (Negotiation System + Display Case)

> **Status:** Ready for implementation  
> **Dependencies:** `NPCManager.ts`, `inventoryStore.ts`, `apiStore.ts`, `statsStore.ts`, `furnitureStore.ts`, `BaseModal.vue`  
> **Architect notes:** KHÔNG được import store ở cấp module-level. Luôn gọi `useXxxStore()` bên trong action/function để tránh circular dependency (xem `PROJECT_ARCHITECTURE.md`).

---

## 0. Tổng quan luồng tương tác

```
NPC Spawn (intent='SELL')
      │
      ▼
[TRADE_IN]  ──────►  đi tới quầy thu ngân
      │
      ▼
[TRADE_IN_WAITING] ──► đứng chờ, icon 🃏 trên đầu
      │  (Player click vào NPC)
      ▼
TradeInModal.vue mở ──► Player nhập offerPrice
      │
      ├─► Accept (ratio >= 0.95 hoặc luck check pass)
      │        ──► statsStore.spendMoney(offerPrice)
      │        ──► inventoryStore.personalBinder[cardId]++
      │        ──► NPC chuyển state 'LEAVE'
      │
      ├─► Counter-Offer (0.4 <= ratio < 0.95, luck check fail)
      │        ──► Modal hiện "Giá đó thấp quá, $X thì sao?"
      │        ──► attemptsLeft--
      │
      └─► Reject (ratio < 0.4 HOẶC attemptsLeft == 0)
               ──► NPC chuyển state 'LEAVE', bỏ đi
```

---

## 1. Customer State Machine (`NPCManager.ts`)

### 1.1. Mở rộng `NPCState` type

**File:** `src/features/customer/types/index.ts`

```typescript
export type NPCState =
  | 'SPAWN'
  | 'WANDER'
  | 'SEEK_ITEM'
  | 'INTERACT'
  | 'GO_CASHIER'
  | 'WAITING'
  | 'LEAVE'
  | 'WANT_TO_PLAY'
  | 'SEEK_TABLE'
  | 'PLAYING'
  // ── NEW: Trade-In States ────────────────────────────────
  | 'TRADE_IN'          // NPC đang di chuyển tới quầy thu ngân để bán thẻ
  | 'TRADE_IN_WAITING'  // NPC đứng tại quầy, đợi Player click tương tác

export type CustomerIntent = 'BUY' | 'PLAY' | 'SELL'  // + 'SELL'

export interface Customer {
  sprite: Phaser.Physics.Arcade.Sprite;
  state: NPCState;
  timer: number;
  targetX: number;
  targetY: number;
  targetPrice: number;
  intent?: CustomerIntent;
  assignedTableId?: string | null;
  seatIndex?: number | null;
  spawnTime: number;
  lastDecisionTime: number;
  statusText?: Phaser.GameObjects.Text;
  lastMoveAttemptTime?: number;
  instanceId: string;
  checkedShelfIds: string[];
  searchStartTime?: number;

  // ── NEW: Trade-In fields ─────────────────────────────────
  /** Card ID mà NPC mang đến bán (lấy từ apiStore.flatCardMap) */
  tradeCardId?: string;
  /** Icon 🃏 lơ lửng trên đầu NPC (destroy khi rời shop) */
  tradeIcon?: Phaser.GameObjects.Text;
}
```

### 1.2. Cập nhật `spawnNPC()` — Thêm intent `'SELL'`

**File:** `src/features/customer/managers/NPCManager.ts`

Hiện tại logic là `30% PLAY / 70% BUY`. Chuyển sang phân phối 3 intent:

```typescript
// ⚠️ THAY THẾ dòng: const isPlayer = Math.random() < 0.3
const rand = Math.random()
let intent: CustomerIntent
if (rand < 0.25) {
  intent = 'PLAY'
} else if (rand < 0.40) {
  intent = 'SELL'   // 15% khách đến bán thẻ
} else {
  intent = 'BUY'    // 60% khách đến mua
}

// Chỉ spawn 'SELL' nếu Player đã mở khóa tính năng (ví dụ: level >= 5)
if (intent === 'SELL' && useStatsStore().level < 5) {
  intent = 'BUY'
}

// Khi intent = 'SELL' → random chọn 1 card từ apiStore để NPC mang đến
let tradeCardId: string | undefined
if (intent === 'SELL') {
  const apiStore = useApiStore()
  const allCards = Object.values(apiStore.flatCardMap)
  if (allCards.length > 0) {
    const pick = allCards[Math.floor(Math.random() * allCards.length)] as any
    tradeCardId = pick.id
  } else {
    // Fallback: nếu chưa load card nào → chuyển sang BUY
    intent = 'BUY'
  }
}

const newCust: Customer = {
  sprite: npcSprite,
  state: 'SPAWN' as NPCState,
  // ... (giữ nguyên các field cũ)
  intent,
  tradeCardId,
}
```

### 1.3. Thêm handler cho 2 state mới trong `handleNPCState()`

```typescript
private handleNPCState(customer: Customer, time: number) {
  switch (customer.state) {
    // ... các case cũ
    case 'TRADE_IN':         this.handleTradeIn(customer); break;
    case 'TRADE_IN_WAITING': this.handleTradeInWaiting(customer, time); break;
  }
}
```

### 1.4. `handleSpawn()` — route intent `'SELL'` sang `TRADE_IN`

```typescript
private handleSpawn(customer: Customer, time: number) {
  if (time > customer.timer) {
    if (customer.intent === 'PLAY') {
      customer.state = 'WANT_TO_PLAY'
    } else if (customer.intent === 'SELL') {
      customer.state = 'TRADE_IN'
      this.spawnTradeIcon(customer)  // Hiện icon 🃏
    } else {
      customer.state = 'WANDER'
    }

    const shopBounds = this.environmentManager.getShopBounds()
    customer.targetX = Phaser.Math.Between(shopBounds.x + 50, shopBounds.x + shopBounds.w - 50)
    customer.targetY = Phaser.Math.Between(shopBounds.y + 50, shopBounds.y + shopBounds.h - 50)
    this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
  }
}
```

### 1.5. Spawn icon 🃏 trên đầu NPC

```typescript
/**
 * Tạo icon lơ lửng 🃏 trên đầu NPC để Player biết đây là khách bán thẻ.
 * Icon bay nhẹ (tween yoyo) để dễ nhận diện.
 */
private spawnTradeIcon(customer: Customer) {
  const icon = this.scene.add.text(
    customer.sprite.x,
    customer.sprite.y - 70,
    '🃏',
    { fontSize: '20px' }
  ).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

  // Tween bouncing animation
  this.scene.tweens.add({
    targets: icon,
    y: icon.y - 6,
    duration: 600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  })

  customer.tradeIcon = icon
}

/**
 * Cập nhật vị trí icon mỗi frame (gọi trong updateNPCAnimation).
 */
private updateTradeIcon(customer: Customer) {
  if (!customer.tradeIcon) return
  customer.tradeIcon.x = customer.sprite.x
  // Y-sort: icon luôn trên cùng (UI_TEXT depth đã cao hơn Layer 3)
}
```

> **Lưu ý:** Trong `updateNPCAnimation()` hiện tại, sau `applyDynamicYSort(sprite)`, thêm `this.updateTradeIcon(customer)`. Cleanup trong `npcLeaveShop()`: `customer.tradeIcon?.destroy()`.

### 1.6. `handleTradeIn()` — NPC đi tới quầy thu ngân

```typescript
/**
 * NPC mang thẻ bán: di chuyển tới quầy thu ngân mặc định.
 */
private handleTradeIn(customer: Customer) {
  const gameStore = useGameStore()
  const cashiers = Object.values(gameStore.placedCashiers)
  if (cashiers.length === 0) {
    // Không có quầy → NPC bỏ đi
    this.npcLeaveShop(customer)
    return
  }

  // Pick quầy đầu tiên (hoặc gần nhất nếu muốn phức tạp hơn)
  const desk = cashiers[0] as any
  customer.targetX = desk.x
  customer.targetY = desk.y + 40   // Đứng trước quầy 40px

  const dist = Phaser.Math.Distance.Between(
    customer.sprite.x, customer.sprite.y,
    customer.targetX, customer.targetY
  )

  if (dist > 12) {
    this.scene.physics.moveTo(
      customer.sprite,
      customer.targetX, customer.targetY,
      this.npcSpeed
    )
  } else {
    // Đã tới quầy → chuyển state
    customer.sprite.body?.velocity.set(0)
    customer.sprite.setPosition(customer.targetX, customer.targetY)
    customer.state = 'TRADE_IN_WAITING'
    customer.timer = this.scene.time.now + 30000  // Chờ tối đa 30s rồi bỏ đi
  }
}
```

### 1.7. `handleTradeInWaiting()` — Đứng chờ Player tương tác

```typescript
/**
 * NPC đứng tại quầy, đợi Player click để mở TradeInModal.
 * Timeout 30s → NPC bỏ đi.
 */
private handleTradeInWaiting(customer: Customer, time: number) {
  customer.sprite.body?.velocity.set(0)

  // Timeout: Nếu Player không tương tác trong 30s → NPC chán, bỏ đi
  if (time > customer.timer) {
    this.npcLeaveShop(customer)
    return
  }

  // Setup click handler (chỉ set 1 lần)
  if (!customer.sprite.input) {
    customer.sprite.setInteractive({ useHandCursor: true })
    customer.sprite.on('pointerdown', () => {
      this.openTradeInModal(customer)
    })
  }
}

/**
 * Player click vào NPC → mở TradeInModal và khởi tạo deal.
 */
private openTradeInModal(customer: Customer) {
  if (!customer.tradeCardId) return

  // Dynamic import để tránh circular dep (theo PROJECT_ARCHITECTURE.md)
  import('../../inventory/store/tradeInStore').then(({ useTradeInStore }) => {
    const tradeStore = useTradeInStore()
    tradeStore.startTrade(customer.instanceId, customer.tradeCardId!)
  })
}
```

### 1.8. Cleanup khi `npcLeaveShop()`

```typescript
private npcLeaveShop(customer: Customer) {
  // Destroy trade icon nếu có
  if (customer.tradeIcon) {
    customer.tradeIcon.destroy()
    customer.tradeIcon = undefined
  }

  // Nếu NPC đang ở state trade → thông báo tradeStore để đóng modal
  if (customer.state === 'TRADE_IN_WAITING' || customer.state === 'TRADE_IN') {
    import('../../inventory/store/tradeInStore').then(({ useTradeInStore }) => {
      const tradeStore = useTradeInStore()
      if (tradeStore.activeTrade?.npcInstanceId === customer.instanceId) {
        tradeStore.cancelTrade('npc_left')
      }
    })
  }

  customer.state = 'LEAVE'
  // ... (giữ nguyên logic cũ: pick door, move, timer=now)
}
```

### 1.9. Status text cho 2 state mới

Trong `updateStatusText()`, thêm case:

```typescript
case 'TRADE_IN':          label = '🃏 To Counter'; break;
case 'TRADE_IN_WAITING':  label = '🃏 Offering Card'; break;
```

---

## 2. Quản lý State (`tradeInStore.ts`)

**File:** `src/features/inventory/store/tradeInStore.ts` (NEW)

### 2.1. Cấu trúc State

```typescript
import { defineStore } from 'pinia'
import { useStatsStore } from '../../stats/store/statsStore'
import { useInventoryStore } from './inventoryStore'
import { useApiStore } from './apiStore'
import { getRawPrice } from '../../shared/utils/currency'

/** Trạng thái của một phiên đàm phán (Trade Session) */
export interface ActiveTrade {
  npcInstanceId: string
  cardId: string
  marketPrice: number       // Giá thị trường gốc của thẻ
  askPrice: number          // Giá NPC chào bán (90-110% market)
  currentCounterPrice: number | null  // Giá NPC counter-offer gần nhất (nếu có)
  attemptsLeft: number      // Số lần Player còn được offer (max 3)
  lastOfferPrice: number    // Giá Player vừa đưa (để so sánh)
  /** Message hiển thị ra UI ('npc đang cân nhắc', 'counter $X', 'từ chối', etc.) */
  statusMessage: string
  /** Phase hiện tại của deal */
  phase: 'NEGOTIATING' | 'ACCEPTED' | 'REJECTED' | 'COUNTER_OFFERED'
}

/** Config đàm phán — tinh chỉnh dễ dàng */
const TRADE_CONFIG = {
  MAX_ATTEMPTS: 3,
  ASK_MIN_MULT: 0.9,    // 90% market
  ASK_MAX_MULT: 1.1,    // 110% market
  RATIO_INSULT: 0.4,    // < 40% → NPC tức giận
  RATIO_AUTO_ACCEPT: 0.95,  // >= 95% → gần như chắc chắn accept
  AUTO_ACCEPT_CHANCE: 0.95,    // Prob accept khi ratio >= 0.95
  MID_ACCEPT_BASE_CHANCE: 0.35, // Prob accept tại ratio = 0.4
  MID_ACCEPT_TOP_CHANCE: 0.85,  // Prob accept tại ratio = 0.95
}

export const useTradeInStore = defineStore('tradeIn', {
  state: () => ({
    activeTrade: null as ActiveTrade | null,
    showModal: false,
  }),

  getters: {
    isNegotiating: (state) =>
      state.activeTrade !== null && state.activeTrade.phase === 'NEGOTIATING',
    isCounterOffered: (state) =>
      state.activeTrade?.phase === 'COUNTER_OFFERED',
  },

  actions: {
    // ... (xem phần 2.2, 2.3 bên dưới)
  }
})
```

### 2.2. Action `startTrade()` — khởi tạo deal

```typescript
/**
 * Khởi tạo deal khi Player click vào NPC có intent='SELL'.
 * Random askPrice từ 90-110% marketPrice.
 */
startTrade(npcInstanceId: string, cardId: string) {
  const apiStore = useApiStore()
  const card = apiStore.flatCardMap[cardId]
  if (!card) {
    console.warn('[tradeIn] Card not found in cache:', cardId)
    return
  }

  const marketPrice = getRawPrice(card) || 1.0
  // Random 90% → 110% của market
  const mult = TRADE_CONFIG.ASK_MIN_MULT +
    Math.random() * (TRADE_CONFIG.ASK_MAX_MULT - TRADE_CONFIG.ASK_MIN_MULT)
  const askPrice = Math.round(marketPrice * mult * 100) / 100  // round 2 decimals

  this.activeTrade = {
    npcInstanceId,
    cardId,
    marketPrice,
    askPrice,
    currentCounterPrice: null,
    attemptsLeft: TRADE_CONFIG.MAX_ATTEMPTS,
    lastOfferPrice: 0,
    statusMessage: `Người này muốn bán lá này với giá $${askPrice.toFixed(2)}`,
    phase: 'NEGOTIATING',
  }
  this.showModal = true
},
```

### 2.3. Action `submitOffer()` — **công thức đàm phán CORE**

```typescript
/**
 * Xử lý khi Player submit giá offer.
 *
 * Logic theo spec:
 *   ratio = offerPrice / askPrice
 *   - ratio >= 0.95 hoặc offerPrice >= marketPrice  → 95% chance ACCEPT
 *   - ratio < 0.4                                   → ALWAYS REJECT (NPC tức giận)
 *   - 0.4 <= ratio < 0.95                           → random ACCEPT hoặc COUNTER
 *
 * Counter-Offer rule:
 *   counterPrice phải > offerPrice VÀ <= askPrice (NPC nhượng bộ từ askPrice xuống,
 *   không được xuống dưới offer của Player → đảm bảo tính thực tế).
 */
submitOffer(offerPrice: number) {
  if (!this.activeTrade || this.activeTrade.phase !== 'NEGOTIATING') return
  if (this.activeTrade.attemptsLeft <= 0) return

  // Validation input
  if (isNaN(offerPrice) || offerPrice <= 0) {
    this.activeTrade.statusMessage = '⚠️ Vui lòng nhập một số tiền hợp lệ.'
    return
  }

  const { askPrice, marketPrice } = this.activeTrade
  const ratio = offerPrice / askPrice
  this.activeTrade.lastOfferPrice = offerPrice
  this.activeTrade.attemptsLeft--

  // ── CASE 1: OFFER QUÁ CAO → ACCEPT gần như chắc chắn ─────
  if (offerPrice >= marketPrice || ratio >= TRADE_CONFIG.RATIO_AUTO_ACCEPT) {
    const acceptRoll = Math.random()
    if (acceptRoll <= TRADE_CONFIG.AUTO_ACCEPT_CHANCE) {
      this._acceptDeal(offerPrice)
      return
    }
    // 5% unluck → vẫn counter một chút (để không quá dễ)
    this._counterOffer(offerPrice)
    return
  }

  // ── CASE 2: OFFER QUÁ THẤP → NPC TỨC GIẬN, BỎ ĐI ─────────
  if (ratio < TRADE_CONFIG.RATIO_INSULT) {
    this.activeTrade.phase = 'REJECTED'
    this.activeTrade.statusMessage =
      `😡 "Giá đó quá sỉ nhục! Tôi đi đây!"`
    this._notifyNpcToLeave('insulted')
    return
  }

  // ── CASE 3: OFFER TRUNG BÌNH (0.4 <= ratio < 0.95) ───────
  // Lerp prob accept từ MID_ACCEPT_BASE_CHANCE (ở ratio=0.4)
  // đến MID_ACCEPT_TOP_CHANCE (ở ratio=0.95).
  const t = (ratio - TRADE_CONFIG.RATIO_INSULT) /
            (TRADE_CONFIG.RATIO_AUTO_ACCEPT - TRADE_CONFIG.RATIO_INSULT)
  const acceptChance =
    TRADE_CONFIG.MID_ACCEPT_BASE_CHANCE +
    t * (TRADE_CONFIG.MID_ACCEPT_TOP_CHANCE - TRADE_CONFIG.MID_ACCEPT_BASE_CHANCE)

  const roll = Math.random()

  if (roll <= acceptChance) {
    this._acceptDeal(offerPrice)
    return
  }

  // NPC ra counter-offer (nếu còn attempts)
  if (this.activeTrade.attemptsLeft <= 0) {
    // Hết lượt → NPC bỏ đi
    this.activeTrade.phase = 'REJECTED'
    this.activeTrade.statusMessage =
      `😤 "Chúng ta không thoả thuận được. Tạm biệt."`
    this._notifyNpcToLeave('out_of_attempts')
    return
  }

  this._counterOffer(offerPrice)
},
```

### 2.4. Private helpers: `_acceptDeal`, `_counterOffer`, `_notifyNpcToLeave`

```typescript
/**
 * NPC đồng ý bán. Trừ tiền Player, thêm thẻ vào binder, NPC rời shop.
 */
_acceptDeal(finalPrice: number) {
  const statsStore = useStatsStore()
  const inventoryStore = useInventoryStore()

  if (!this.activeTrade) return

  // Kiểm tra tiền
  if (statsStore.money < finalPrice) {
    this.activeTrade.statusMessage = '💸 Bạn không đủ tiền để mua thẻ này!'
    // Không giảm phase, không bỏ NPC — cho Player cơ hội offer lại
    this.activeTrade.attemptsLeft++  // Hoàn trả lượt vì deal không được chốt
    return
  }

  statsStore.spendMoney(finalPrice)

  // Thêm thẻ vào binder cá nhân của Player
  const cardId = this.activeTrade.cardId
  if (!inventoryStore.personalBinder[cardId]) {
    inventoryStore.personalBinder[cardId] = 0
  }
  inventoryStore.personalBinder[cardId]++

  // Thống kê (có thể dùng ở EndOfDayModal)
  statsStore.dailyStats.itemsSold++   // Tạm mượn field này, hoặc thêm field cardsBought

  this.activeTrade.phase = 'ACCEPTED'
  this.activeTrade.statusMessage =
    `✅ "Cảm ơn! Đã chốt giá $${finalPrice.toFixed(2)}."`

  this._notifyNpcToLeave('deal_done')
},

/**
 * NPC ra counter-offer.
 * counterPrice phải nằm trong khoảng (offerPrice, askPrice].
 * → Dùng lerp ngẫu nhiên giữa 2 mốc này, bias về phía askPrice để NPC không
 * nhượng bộ quá nhiều.
 */
_counterOffer(playerOffer: number) {
  if (!this.activeTrade) return

  const { askPrice, currentCounterPrice } = this.activeTrade
  // Cận trên của vùng counter: askPrice ban đầu HOẶC currentCounter trước đó
  // (nếu NPC đã counter rồi, lần counter tiếp theo không được cao hơn)
  const upper = currentCounterPrice ?? askPrice
  const lower = playerOffer

  // Bias 0.6 về phía upper (NPC nhượng bộ nhỏ, thực tế hơn)
  const bias = 0.6
  const raw = lower + (upper - lower) * (bias + Math.random() * (1 - bias))

  // Làm tròn 2 số thập phân và enforce bounds
  let counter = Math.round(raw * 100) / 100
  if (counter <= playerOffer) counter = Math.round((playerOffer + 0.01) * 100) / 100
  if (counter > upper) counter = upper

  this.activeTrade.currentCounterPrice = counter
  this.activeTrade.phase = 'COUNTER_OFFERED'
  this.activeTrade.statusMessage =
    `🤔 "Giá đó thấp quá, $${counter.toFixed(2)} thì sao?" ` +
    `(Còn ${this.activeTrade.attemptsLeft} lần thương lượng)`
},

/**
 * Thông báo cho NPCManager rằng NPC cần rời shop.
 * Dùng window event (không tạo circular dependency).
 */
_notifyNpcToLeave(reason: string) {
  if (!this.activeTrade) return
  window.dispatchEvent(new CustomEvent('trade-in:npc-leave', {
    detail: {
      instanceId: this.activeTrade.npcInstanceId,
      reason,
    }
  }))
},

/** Player chủ động đóng modal (từ chối deal). */
rejectTrade() {
  if (!this.activeTrade) return
  this.activeTrade.phase = 'REJECTED'
  this.activeTrade.statusMessage = '👋 Bạn đã từ chối deal này.'
  this._notifyNpcToLeave('player_rejected')
},

/** Gọi khi NPC timeout hoặc bị force leave — đóng modal. */
cancelTrade(_reason: string) {
  this.activeTrade = null
  this.showModal = false
},

/** Đóng modal sau khi deal đã xong (ACCEPTED/REJECTED phase). */
closeModal() {
  this.activeTrade = null
  this.showModal = false
},
```

### 2.5. Listen event trong `NPCManager.ts`

Trong `constructor()` hoặc `initializeNPCs()`:

```typescript
window.addEventListener('trade-in:npc-leave', ((ev: CustomEvent) => {
  const { instanceId } = ev.detail
  const npc = this.customers.find(c => c.instanceId === instanceId)
  if (npc) {
    this.npcLeaveShop(npc)
  }
}) as EventListener)
```

---

## 3. Giao diện Đàm phán (`TradeInModal.vue`)

**File:** `src/features/inventory/components/TradeInModal.vue` (NEW)

### 3.1. Layout

```
┌─────────────────────────────────────────────────────────────┐
│                    🃏 THU MUA THẺ LẺ                        │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│   [Ảnh thẻ full height]  │  Tên thẻ: Charizard (Base Set)   │
│                          │  Market Price: $350.00           │
│   marketPrice: $350.00   │  NPC đang chào:  $382.50         │
│   NPC ask:     $382.50   │                                  │
│                          │  ── Trạng thái ──                │
│                          │  "Người này muốn bán lá này..."  │
│                          │                                  │
│                          │  Nhập giá bạn muốn mua:          │
│                          │  ┌──────────────────┐ $          │
│                          │  │ 300.00           │            │
│                          │  └──────────────────┘            │
│                          │                                  │
│                          │  Còn 3 lần thương lượng          │
│                          │                                  │
│                          │  [Đưa ra mức giá]  [Từ chối]     │
└──────────────────────────┴──────────────────────────────────┘
```

### 3.2. Component code

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTradeInStore } from '../store/tradeInStore'
import { useApiStore } from '../store/apiStore'
import BaseModal from '../../shared/components/BaseModal.vue'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'
import TcgCard from '../../shared/components/TcgCard.vue'

const tradeStore = useTradeInStore()
const apiStore = useApiStore()

const offerInput = ref<string>('')

// Card data lấy từ apiStore
const cardData = computed(() => {
  const id = tradeStore.activeTrade?.cardId
  if (!id) return null
  return apiStore.flatCardMap[id] ?? null
})

// Reset input khi modal mới mở
watch(() => tradeStore.showModal, (open) => {
  if (open && tradeStore.activeTrade) {
    // Pre-fill với askPrice để Player có điểm neo
    offerInput.value = tradeStore.activeTrade.askPrice.toFixed(2)
  }
})

// Auto-fill khi NPC counter-offer
watch(() => tradeStore.activeTrade?.currentCounterPrice, (newCounter) => {
  if (newCounter !== null && newCounter !== undefined) {
    // Gợi ý Player xài giá counter làm điểm khởi đầu
    offerInput.value = newCounter.toFixed(2)
  }
})

function submit() {
  const price = parseFloat(offerInput.value)
  tradeStore.submitOffer(price)
}

function reject() {
  tradeStore.rejectTrade()
}

function close() {
  tradeStore.closeModal()
}

// Disable input/nút khi đã ACCEPTED hoặc REJECTED
const isDealClosed = computed(() =>
  tradeStore.activeTrade?.phase === 'ACCEPTED' ||
  tradeStore.activeTrade?.phase === 'REJECTED'
)

const currentAskDisplay = computed(() => {
  const t = tradeStore.activeTrade
  if (!t) return '$0.00'
  // Nếu NPC đã counter → hiển thị giá counter làm "ask hiện tại"
  const p = t.currentCounterPrice ?? t.askPrice
  return `$${p.toFixed(2)}`
})
</script>

<template>
  <BaseModal
    :isOpen="tradeStore.showModal"
    title="🃏 Thu Mua Thẻ Lẻ"
    size="lg"
    @close="close"
  >
    <div v-if="tradeStore.activeTrade && cardData" class="trade-in-body">
      <!-- CỘT TRÁI: Ảnh thẻ + giá -->
      <div class="trade-card-column">
        <TcgCard :card="cardData" :is-flipped="true" size="normal" :show-price="false" />

        <div class="price-block">
          <div class="price-row">
            <span class="label">Market Price:</span>
            <span class="value">${{ tradeStore.activeTrade.marketPrice.toFixed(2) }}</span>
          </div>
          <div class="price-row emphasis">
            <span class="label">Giá chào:</span>
            <span class="value">{{ currentAskDisplay }}</span>
          </div>
        </div>
      </div>

      <!-- CỘT PHẢI: Form đàm phán -->
      <div class="trade-form-column">
        <h3 class="card-title">{{ cardData.name }}</h3>
        <p class="card-rarity">{{ cardData.rarity || 'Common' }}</p>

        <!-- Status message từ NPC -->
        <div
          class="status-bubble"
          :class="{
            'bubble-accept': tradeStore.activeTrade.phase === 'ACCEPTED',
            'bubble-reject': tradeStore.activeTrade.phase === 'REJECTED',
            'bubble-counter': tradeStore.activeTrade.phase === 'COUNTER_OFFERED',
          }"
        >
          {{ tradeStore.activeTrade.statusMessage }}
        </div>

        <!-- Input offer -->
        <div v-if="!isDealClosed" class="offer-form">
          <label class="offer-label">Nhập giá bạn muốn mua:</label>
          <div class="offer-input-wrapper">
            <span class="currency-symbol">$</span>
            <input
              v-model="offerInput"
              type="number"
              step="0.01"
              min="0"
              class="offer-input"
              placeholder="0.00"
              @keyup.enter="submit"
            />
          </div>

          <p class="attempts-info">
            Còn <strong>{{ tradeStore.activeTrade.attemptsLeft }}</strong> lần thương lượng
          </p>

          <div class="action-buttons">
            <EnhancedButton
              variant="success"
              size="md"
              @click="submit"
              :disabled="tradeStore.activeTrade.attemptsLeft <= 0"
            >
              Đưa ra mức giá
            </EnhancedButton>
            <EnhancedButton
              variant="danger"
              size="md"
              @click="reject"
            >
              Từ chối
            </EnhancedButton>
          </div>
        </div>

        <!-- Deal đóng → hiện nút close -->
        <div v-else class="close-block">
          <EnhancedButton variant="primary" size="lg" fullWidth @click="close">
            Đóng
          </EnhancedButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.trade-in-body {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 24px;
  padding: 8px;
}

.trade-card-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.price-block {
  width: 100%;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  padding: 12px 14px;
}

.price-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  padding: 4px 0;
  color: #cbd5e1;
}

.price-row.emphasis {
  font-weight: 700;
  color: #fbbf24;
  border-top: 1px dashed rgba(148, 163, 184, 0.3);
  margin-top: 4px;
  padding-top: 8px;
}

.trade-form-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #f1f5f9;
  margin: 0;
}

.card-rarity {
  color: #94a3b8;
  font-size: 0.85rem;
  margin: 0;
}

.status-bubble {
  background: rgba(30, 41, 59, 0.7);
  border-left: 4px solid #3b82f6;
  padding: 12px 14px;
  border-radius: 6px;
  font-style: italic;
  color: #e2e8f0;
  min-height: 56px;
  display: flex;
  align-items: center;
}

.bubble-accept { border-left-color: #10b981; color: #6ee7b7; }
.bubble-reject { border-left-color: #ef4444; color: #fca5a5; }
.bubble-counter { border-left-color: #f59e0b; color: #fcd34d; }

.offer-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.offer-label {
  color: #cbd5e1;
  font-weight: 600;
  font-size: 0.95rem;
}

.offer-input-wrapper {
  display: flex;
  align-items: center;
  background: #0f172a;
  border: 2px solid #334155;
  border-radius: 8px;
  padding: 0 12px;
  transition: border-color 0.2s;
}
.offer-input-wrapper:focus-within { border-color: #3b82f6; }

.currency-symbol {
  color: #94a3b8;
  font-weight: 700;
  font-size: 1.2rem;
  margin-right: 8px;
}

.offer-input {
  background: transparent;
  border: none;
  color: #f1f5f9;
  font-size: 1.25rem;
  font-weight: 700;
  padding: 12px 0;
  width: 100%;
  outline: none;
}

.attempts-info {
  color: #94a3b8;
  font-size: 0.85rem;
  margin: 0;
  text-align: center;
}
.attempts-info strong { color: #fbbf24; }

.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.action-buttons > * { flex: 1; }

.close-block {
  margin-top: 16px;
}
</style>
```

### 3.3. Mount trong `App.vue`

Thêm import và render:

```vue
<script setup lang="ts">
// ... imports cũ
import TradeInModal from './features/inventory/components/TradeInModal.vue'
</script>

<template>
  <!-- ... các modal hiện có -->
  <TradeInModal />
</template>
```

---

## 4. Nội thất Tủ Kính (`Display Case`)

Thẻ lẻ Player thu mua từ Trade-In sẽ vào `personalBinder`. Player có thể chưng chúng lên **Display Case** để NPC mua lại với giá cao do Player tự set.

### 4.1. Thêm loại furniture mới

**File:** `src/features/furniture/config/index.ts`

```typescript
export type FurnitureRole =
  | 'selling'
  | 'storage'
  | 'table'
  | 'cashier'
  | 'display_case'   // ── NEW ──

export const FURNITURE_ITEMS: Record<string, FurnitureItemInfo> = {
  // ... các entry cũ (shelf_single, shelf_double, storage_shelf, ...)

  'display_case': {
    id: 'display_case',
    name: 'Glass Display Case',
    buyPrice: 1200,
    requiredLevel: 8,
    capacityStr: '6 Singles (2x3)',
    description:
      'Tủ kính trưng bày thẻ bài lẻ. Chưng thẻ quý bạn thu mua được; ' +
      'NPC vãng lai sẽ trả giá cao nếu bạn đặt đúng giá. ' +
      'Không dùng để chứa Pack/Box.',
    numTiers: 2,          // 2 tầng
    slotsPerTier: 3,      // 3 thẻ mỗi tầng
    role: 'display_case',
  },
}
```

### 4.2. Mở rộng `ShelfRole` và `ShelfTier`

**File:** `src/features/furniture/types/index.ts`

```typescript
export type ShelfRole = 'selling' | 'storage' | 'display_case'

export interface ShelfTier {
  itemId: string | null;
  slots: (string | null)[];
  maxSlots: number;
  /**
   * ── Chỉ dùng cho display_case ──
   * Giá Player tự set cho mỗi cardId trưng bày trên tầng này.
   * Nếu null → dùng marketPrice mặc định.
   */
  customPriceMap?: Record<string, number>;
}
```

### 4.3. Action trong `furnitureStore.ts`

```typescript
/**
 * Đặt 1 card từ personalBinder lên display_case.
 * Mỗi slot chứa 1 card (không stack giống pack).
 */
placeCardOnDisplayCase(
  shelfId: string,
  tierIndex: number,
  slotIndex: number,
  cardId: string,
  customPrice: number
): boolean {
  const inventoryStore = useInventoryStore()
  const shelf = this.placedShelves[shelfId]
  if (!shelf || shelf.role !== 'display_case') return false

  // Check: Player có thẻ này trong binder không?
  if (!inventoryStore.personalBinder[cardId] ||
      inventoryStore.personalBinder[cardId] <= 0) {
    return false
  }

  const tier = shelf.tiers[tierIndex]
  if (slotIndex >= tier.maxSlots || tier.slots[slotIndex] != null) return false

  // Init tier structure nếu chưa
  if (!tier.customPriceMap) tier.customPriceMap = {}
  if (tier.slots.length < tier.maxSlots) {
    tier.slots = Array(tier.maxSlots).fill(null)
  }

  tier.slots[slotIndex] = cardId
  tier.itemId = cardId  // Hoặc giữ null để hybrid; tuỳ chọn
  tier.customPriceMap[cardId] = customPrice

  // Trừ khỏi binder
  inventoryStore.personalBinder[cardId]--
  if (inventoryStore.personalBinder[cardId] === 0) {
    delete inventoryStore.personalBinder[cardId]
  }
  return true
},

/**
 * NPC vãng lai mua 1 card trên display_case.
 * Trả về object { cardId, price } nếu mua thành công, null nếu không.
 */
npcBuyFromDisplayCase(shelfId: string): { cardId: string; price: number } | null {
  const shelf = this.placedShelves[shelfId]
  if (!shelf || shelf.role !== 'display_case') return null

  // Tìm tất cả slot có card
  const occupied: { tierIdx: number; slotIdx: number; cardId: string }[] = []
  shelf.tiers.forEach((tier, tierIdx) => {
    tier.slots.forEach((card, slotIdx) => {
      if (card) occupied.push({ tierIdx, slotIdx, cardId: card })
    })
  })
  if (occupied.length === 0) return null

  // Random pick 1 card (có thể phức tạp hơn: pick card rẻ trước để bán nhanh)
  const picked = occupied[Math.floor(Math.random() * occupied.length)]
  const tier = shelf.tiers[picked.tierIdx]
  const price = tier.customPriceMap?.[picked.cardId] ?? 0

  // Pop card khỏi slot
  tier.slots[picked.slotIdx] = null
  if (tier.customPriceMap) delete tier.customPriceMap[picked.cardId]

  return { cardId: picked.cardId, price }
},
```

### 4.4. Buy-decision rule cho NPC (heuristic giá)

Trong `NPCManager.handleSeekItem()` hiện tại, thêm nhánh display_case:

```typescript
// Khi NPC (intent='BUY') tìm thấy shelf có role='display_case'
// → Apply heuristic: mua nếu customPrice <= 1.5 * marketPrice (50% markup tolerance)
const card = apiStore.flatCardMap[cardId]
const market = getRawPrice(card)
const customPrice = tier.customPriceMap?.[cardId] ?? market
const acceptableMax = market * 1.5

if (customPrice <= acceptableMax) {
  // NPC chịu mua → chuyển sang GO_CASHIER với targetPrice = customPrice
  customer.targetPrice = customPrice
  customer.state = 'GO_CASHIER'
} else {
  // Quá đắt → bỏ qua, wander tiếp
  customer.checkedShelfIds.push(shelfId)
}
```

### 4.5. UI management (lên kế hoạch)

Tạo `DisplayCaseManageMenu.vue` tái sử dụng pattern của `ShelfManagementMenu.vue`:

- Hiển thị grid 2×3 slots.
- Click vào slot trống → popup chọn card từ binder + input `customPrice`.
- Click vào slot đã filled → option "Rút về binder" hoặc "Đổi giá".

Logic cụ thể của UI có thể làm ở Phase 2 (sau khi core trade-in chạy ổn).

### 4.6. Render trong Phaser `FurnitureManager`

Trong `displayShelf()`:

```typescript
const textureKey =
  isStorage ? TEX.SHELF_STORAGE
  : shelf.role === 'display_case' ? TEX.DISPLAY_CASE    // ── NEW ──
  : TEX.SHELF_SELLING
```

Thêm key `DISPLAY_CASE` vào `assetKeys.ts` và load asset tương ứng (dùng sprite kệ kính tạm thời nếu chưa có — artist bổ sung sau).

---

## 5. Testing Checklist

- [ ] Spawn 15% NPC có intent='SELL' (mở khóa từ level 5).
- [ ] Icon 🃏 xuất hiện trên đầu NPC và theo dõi vị trí.
- [ ] NPC đi tới quầy thu ngân, đứng chờ 30s.
- [ ] Click NPC → mở TradeInModal với ảnh thẻ + askPrice 90-110%.
- [ ] Offer >= marketPrice → 95% accept.
- [ ] Offer ratio < 0.4 → NPC tức giận, bỏ đi.
- [ ] Offer 0.4 <= ratio < 0.95 → random accept/counter.
- [ ] Counter-offer luôn ở khoảng (offerPrice, askPrice].
- [ ] Hết 3 lượt → NPC bỏ đi, modal đóng.
- [ ] Deal accepted → trừ tiền Player, binder +1, NPC leave.
- [ ] NPC timeout 30s → modal tự đóng nếu đang mở.
- [ ] Display case mua được ở buyPrice 1200 (level 8+).
- [ ] Đặt card lên display case → trừ binder; gỡ card → trả về binder.
- [ ] NPC wandering có thể mua card từ display case theo heuristic.

---

## 6. Rollout order (Implementation phases)

1. **Phase A — Core negotiation (1 sprint):**
   Trade-in state machine, `tradeInStore`, `TradeInModal`. Display case tạm bỏ qua — card mua được chỉ lưu vào `personalBinder`.

2. **Phase B — Display case basic (0.5 sprint):**
   Thêm furniture type + store actions + Phaser render. Không cần UI management menu.

3. **Phase C — Display case UI + NPC purchase (1 sprint):**
   `DisplayCaseManageMenu.vue` + logic NPC mua.

Ngừng ở Phase A đã là một tính năng độc lập có giá trị. Đừng gộp chung tất cả.




Tôi đã hoàn thành việc triển khai tính năng Singles Trade-In (Thu mua thẻ lẻ) và hệ thống Display Case (Tủ trưng bày) cho TCG Shop Simulator theo đúng blueprint 16.

Các công việc đã hoàn thành:
Hệ thống Thu mua (Trade-In):

AI NPC: NPCs giờ đây có 15% tỉ lệ mang thẻ bài đến bán cho shop (khi bạn đạt Level 5). Họ sẽ hiển thị icon 🃏 trên đầu.
Logic Đàm phán: Triển khai tradeInStore với thuật toán đàm phán thông minh (cho phép trả giá tối đa 3 lần, NPC có khả năng đưa ra counter-offer hoặc bỏ đi nếu bị "sỉ nhục" bằng giá quá thấp).
Giao diện: Tạo TradeInModal.vue chuyên nghiệp để bạn thực hiện thương lượng giá mua thẻ.
Hệ thống Tủ trưng bày (Display Case):

Nội thất mới: Đã đăng ký và tích hợp Glass Display Case vào hệ thống nội thất của shop.
Quản lý Thẻ: Cập nhật menu quản lý kệ để cho phép bạn lấy thẻ từ Personal Binder và đặt lên Tủ kính.
Định giá tùy chỉnh: Mỗi thẻ trên tủ kính có thể được set giá bán riêng biệt thông qua một giao diện định giá trực quan.
Hành vi NPC Vãng lai:

Khách hàng giờ đây có thể tham quan Tủ kính và quyết định mua thẻ lẻ nếu giá bạn đặt hợp lý (dưới 150% giá thị trường).
Tôi đã kiểm tra kỹ lưỡng bằng công cụ build (npm run build) ở mọi giai đoạn để đảm bảo không có lỗi TypeScript hay xung đột kiến trúc nào xảy ra.

Bạn có thể xem chi tiết các thay đổi trong file:

walkthrough.md
Để trải nghiệm tính năng này, hãy đạt Level 5 và tìm các NPC có icon 🃏 nhé! Bạn có yêu cầu điều chỉnh gì thêm về logic đàm phán hay giao diện không?