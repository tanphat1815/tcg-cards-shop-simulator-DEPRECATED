# 21 — Passive Event System Blueprint
### Tính năng: Manage Event — Thu nhập thụ động từ bàn chơi + Buff/Nerf giá thị trường

> **Status:** Ready for implementation  
> **Dependencies:** `NPCManager.ts`, `FurnitureManager.ts`, `statsStore.ts`, `customerStore.ts`, `placedTables` data  
> **Cảm hứng:** TCG Card Shop Simulator — "Passive Event" system.  
> **Architect notes:** Không được import store ở module-level. Tất cả cross-store access phải qua hàm/action.

---

## 0. Kiến trúc tổng thể

```
[Player]
  │ (dùng Smartphone app → ManageEventApp.vue)
  ▼
[eventStore.setNextEvent(id)]  ──► State: nextEventId = 'fire_cup'
  │
  ▼ (ngày sang ngày: gameStore.startNewDay())
[eventStore.applyNextEventOnNewDay()]
  │  ├─ Trừ event.dailyCost từ statsStore.money
  │  ├─ activeEventId = nextEventId
  │  └─ nextEventId = null (hoặc giữ nếu muốn default)
  ▼
[Shop mở cửa — NPC spawn bình thường]
  │
  ▼ (NPC intent='PLAY' ngồi vào bàn)
[table.matchStartedAt = Date.now()]  ← lưu thời điểm ngồi
  │
  ▼ (NPC đứng dậy hoặc 9PM tới)
[eventStore.calculatePayment(sessionMinutes)]
  │  = (sessionMinutes / 60) × activeEvent.hourlyFee
  ▼
[statsStore.addMoney(payment)]  +  Popup "+$X.XX" tại bàn
  │
  ▼ (NPC chuyển state → LEAVE)

[Khi NPC mua thẻ/pack ở shelf]
  ▼
[getEventPriceMultiplier(card)]  ← áp dụng buff/nerf vào giá bán
```

---

## 1. Data Model (`eventsData.ts`)

**File:** `src/features/events/config/eventsData.ts` (NEW)

### 1.1. Interface định nghĩa

```typescript
/** Loại buff/nerf mà Event có thể áp dụng */
export type EventEffectTarget =
  | 'ENERGY_TYPE'    // Hệ: Fire, Water, Grass, Earth, Wind (alias Lightning)
  | 'RARITY'         // Common, Uncommon, Rare, Epic, Legend
  | 'EDITION'        // 1st Edition, Unlimited, Shadowless
  | 'BORDER'         // Silver border, Gold border, Holo border
  | 'CARD_TYPE'      // EX, V, VMAX, VSTAR, Full Art, Holo/Foil
  | 'RANDOM'         // Chọn ngẫu nhiên khi event start

export interface EventEffect {
  target: EventEffectTarget
  /** Giá trị cụ thể để match.
   * Ví dụ: target='ENERGY_TYPE', value='Fire' → tất cả thẻ Fire được buff.
   * Nếu target='RANDOM' → value ignored, sẽ random khi apply. */
  value: string
  /** Hệ số nhân giá. > 1.0 là Buff, < 1.0 là Nerf. */
  multiplier: number
}

export interface GameEvent {
  id: string
  name: string
  format: string           // Hiển thị thêm (vd: 'Pauper Format')
  description: string
  /** Số lượng khách đã từng ngồi chơi cần để unlock */
  unlockAtTotalPlayers: number
  /** Chi phí duy trì mỗi ngày */
  dailyCost: number
  /** Tiền thu mỗi giờ từ mỗi ghế có khách ngồi */
  hourlyFee: number
  /** Các hiệu ứng lên giá thẻ */
  effects: EventEffect[]
  /** Emoji/icon hiển thị UI */
  icon: string
}
```

### 1.2. Data — 12 events đầy đủ

```typescript
export const GAME_EVENTS: GameEvent[] = [
  // ── 1. STANDARD — mặc định free ──
  {
    id: 'standard',
    name: 'Standard',
    format: 'Standard Format',
    description: 'Giải đấu chuẩn mở ngay từ ngày đầu. Không có buff đặc biệt.',
    unlockAtTotalPlayers: 0,
    dailyCost: 0,
    hourlyFee: 7,
    icon: '🎴',
    effects: [
      { target: 'RANDOM', value: '', multiplier: 1.2 },    // Random buff
      { target: 'RANDOM', value: '', multiplier: 0.85 },   // Random nerf
    ],
  },

  // ── 2. PAUPER — Common buff ──
  {
    id: 'pauper',
    name: 'Pauper',
    format: 'Pauper Format',
    description: 'Chỉ dùng thẻ phổ thông. Giá thẻ Common tăng, Rare+ giảm.',
    unlockAtTotalPlayers: 50,
    dailyCost: 50,
    hourlyFee: 8.13,
    icon: '🌱',
    effects: [
      { target: 'RARITY', value: 'Common',   multiplier: 1.5 },
      { target: 'RARITY', value: 'Rare',     multiplier: 0.7 },
      { target: 'RARITY', value: 'Epic',     multiplier: 0.6 },
      { target: 'RARITY', value: 'Legend',   multiplier: 0.5 },
    ],
  },

  // ── 3-6. ELEMENTAL CUPS — 4 hệ ──
  {
    id: 'fire_cup',
    name: 'Fire Cup',
    format: 'Elemental Format',
    description: 'Thẻ hệ Lửa được ưu tiên. Hệ Đất bị giảm.',
    unlockAtTotalPlayers: 100,
    dailyCost: 70,
    hourlyFee: 10,
    icon: '🔥',
    effects: [
      { target: 'ENERGY_TYPE', value: 'Fire',     multiplier: 1.5 },
      { target: 'ENERGY_TYPE', value: 'Fighting', multiplier: 0.7 },  // Earth alias
    ],
  },
  {
    id: 'earth_cup',
    name: 'Earth Cup',
    format: 'Elemental Format',
    description: 'Thẻ hệ Đất được ưu tiên. Hệ Nước bị giảm.',
    unlockAtTotalPlayers: 150,
    dailyCost: 70,
    hourlyFee: 10,
    icon: '⛰️',
    effects: [
      { target: 'ENERGY_TYPE', value: 'Fighting', multiplier: 1.5 },  // Earth alias
      { target: 'ENERGY_TYPE', value: 'Water',    multiplier: 0.7 },
    ],
  },
  {
    id: 'water_cup',
    name: 'Water Cup',
    format: 'Elemental Format',
    description: 'Thẻ hệ Nước được ưu tiên. Hệ Gió bị giảm.',
    unlockAtTotalPlayers: 200,
    dailyCost: 70,
    hourlyFee: 10,
    icon: '💧',
    effects: [
      { target: 'ENERGY_TYPE', value: 'Water',     multiplier: 1.5 },
      { target: 'ENERGY_TYPE', value: 'Lightning', multiplier: 0.7 },  // Wind alias
    ],
  },
  {
    id: 'wind_cup',
    name: 'Wind Cup',
    format: 'Elemental Format',
    description: 'Thẻ hệ Gió được ưu tiên. Hệ Lửa bị giảm.',
    unlockAtTotalPlayers: 250,
    dailyCost: 70,
    hourlyFee: 10,
    icon: '💨',
    effects: [
      { target: 'ENERGY_TYPE', value: 'Lightning', multiplier: 1.5 },  // Wind alias
      { target: 'ENERGY_TYPE', value: 'Fire',      multiplier: 0.7 },
    ],
  },

  // ── 7. VINTAGE — 1st Edition buff ──
  {
    id: 'vintage',
    name: 'Vintage',
    format: 'Vintage Format',
    description: 'Thẻ 1st Edition được ưu tiên. Một số viền bị nerf.',
    unlockAtTotalPlayers: 500,
    dailyCost: 200,
    hourlyFee: 15,
    icon: '📜',
    effects: [
      { target: 'EDITION', value: '1st Edition',      multiplier: 1.8 },
      { target: 'BORDER',  value: 'Shadowless',       multiplier: 0.75 },
    ],
  },

  // ── 8. SILVER LEGACY — Silver border ──
  {
    id: 'silver_legacy',
    name: 'Silver Legacy',
    format: 'Legacy Format',
    description: 'Thẻ viền Bạc được đánh giá cao.',
    unlockAtTotalPlayers: 750,
    dailyCost: 250,
    hourlyFee: 18.94,
    icon: '🥈',
    effects: [
      { target: 'BORDER', value: 'Silver', multiplier: 1.7 },
    ],
  },

  // ── 9. GOLD STAR ──
  {
    id: 'gold_star',
    name: 'Gold Star',
    format: 'Premium Format',
    description: 'Thẻ viền Vàng là vua.',
    unlockAtTotalPlayers: 1000,
    dailyCost: 300,
    hourlyFee: 22.82,
    icon: '🥇',
    effects: [
      { target: 'BORDER', value: 'Gold', multiplier: 2.0 },
    ],
  },

  // ── 10. EX BATTLE ──
  {
    id: 'ex_battle',
    name: 'EX Battle',
    format: 'EX Format',
    description: 'Thẻ EX làm chủ đấu trường.',
    unlockAtTotalPlayers: 1500,
    dailyCost: 400,
    hourlyFee: 28.14,
    icon: '⚔️',
    effects: [
      { target: 'CARD_TYPE', value: 'EX', multiplier: 1.8 },
    ],
  },

  // ── 11. FULL ART ──
  {
    id: 'full_art',
    name: 'Full Art',
    format: 'Art Format',
    description: 'Thẻ Full Art được săn đón.',
    unlockAtTotalPlayers: 2500,
    dailyCost: 500,
    hourlyFee: 35.14,
    icon: '🎨',
    effects: [
      { target: 'CARD_TYPE', value: 'Full Art', multiplier: 2.2 },
    ],
  },

  // ── 12. HOLO HEAVEN ──
  {
    id: 'holo_heaven',
    name: 'Holo Heaven',
    format: 'Foil Format',
    description: 'Thẻ Holo/Foil lên ngôi.',
    unlockAtTotalPlayers: 5000,
    dailyCost: 700,
    hourlyFee: 45.78,
    icon: '✨',
    effects: [
      { target: 'CARD_TYPE', value: 'Holo', multiplier: 2.5 },
    ],
  },
]

/** Helper: lookup by id */
export function getEventById(id: string | null): GameEvent | null {
  if (!id) return null
  return GAME_EVENTS.find(e => e.id === id) ?? null
}

/** Helper: lookup events đã mở khoá dựa trên totalPlayersHosted */
export function getUnlockedEvents(totalPlayers: number): GameEvent[] {
  return GAME_EVENTS.filter(e => e.unlockAtTotalPlayers <= totalPlayers)
}
```

---

## 2. Quản lý State (`eventStore.ts`)

**File:** `src/features/events/store/eventStore.ts` (NEW)

### 2.1. State & Getters

```typescript
import { defineStore } from 'pinia'
import { GAME_EVENTS, getEventById, type GameEvent, type EventEffect } from '../config/eventsData'
import { useStatsStore } from '../../stats/store/statsStore'

/** Effect đã được "resolve" (trường hợp target='RANDOM' đã chọn xong value) */
export interface ResolvedEffect {
  target: EventEffect['target']
  value: string
  multiplier: number
}

export const useEventStore = defineStore('event', {
  state: () => ({
    /** Sự kiện đang chạy HÔM NAY */
    activeEventId: 'standard' as string | null,
    /** Sự kiện đã setup cho NGÀY MAI */
    nextEventId: 'standard' as string | null,
    /** Tổng số khách đã từng ngồi chơi (cumulative, dùng cho unlock) */
    totalPlayersHosted: 0,

    /**
     * Effects đã resolve cho event hôm nay.
     * Cache này tránh resolve lại RANDOM mỗi lần gọi getEventPriceMultiplier.
     */
    resolvedActiveEffects: [] as ResolvedEffect[],

    /** Đếm số khách đã thanh toán event fee hôm nay (thống kê) */
    playersPaidToday: 0,
    /** Tổng doanh thu event hôm nay */
    eventRevenueToday: 0,
  }),

  getters: {
    activeEvent: (state): GameEvent | null => getEventById(state.activeEventId),
    nextEvent: (state): GameEvent | null => getEventById(state.nextEventId),

    /** Danh sách events đã mở khoá theo totalPlayersHosted hiện tại */
    unlockedEvents: (state): GameEvent[] =>
      GAME_EVENTS.filter(e => e.unlockAtTotalPlayers <= state.totalPlayersHosted),
  },

  actions: {
    // ... xem các phần 2.2 - 2.6
  }
})
```

### 2.2. Action `setNextEvent()` + resolve RANDOM

```typescript
/**
 * Player chọn sự kiện cho ngày mai.
 * Chỉ set state; KHÔNG trừ tiền (tiền bị trừ lúc chuyển ngày).
 */
setNextEvent(eventId: string): { success: boolean; reason?: string } {
  const event = getEventById(eventId)
  if (!event) return { success: false, reason: 'Event không tồn tại.' }

  // Kiểm tra unlock
  if (event.unlockAtTotalPlayers > this.totalPlayersHosted) {
    return {
      success: false,
      reason: `Cần ${event.unlockAtTotalPlayers} lượt khách (hiện ${this.totalPlayersHosted}).`
    }
  }

  this.nextEventId = eventId
  return { success: true }
},

/**
 * Resolve tất cả effect target='RANDOM' thành 1 giá trị cụ thể.
 * Gọi 1 lần khi event được apply cho ngày mới.
 */
_resolveActiveEffects(event: GameEvent): ResolvedEffect[] {
  const RANDOM_ENERGY = ['Fire', 'Water', 'Grass', 'Lightning', 'Fighting', 'Psychic']
  const RANDOM_RARITY = ['Common', 'Uncommon', 'Rare']

  return event.effects.map(eff => {
    if (eff.target === 'RANDOM') {
      // Random: nếu multiplier > 1 → pick energy type buff; else nerf rarity
      if (eff.multiplier > 1) {
        return {
          target: 'ENERGY_TYPE',
          value: RANDOM_ENERGY[Math.floor(Math.random() * RANDOM_ENERGY.length)],
          multiplier: eff.multiplier,
        }
      } else {
        return {
          target: 'RARITY',
          value: RANDOM_RARITY[Math.floor(Math.random() * RANDOM_RARITY.length)],
          multiplier: eff.multiplier,
        }
      }
    }
    return eff as ResolvedEffect
  })
},
```

### 2.3. Action `applyNextEventOnNewDay()` — gọi khi qua ngày mới

```typescript
/**
 * Xử lý chuyển giao event khi startNewDay():
 *   1. Trừ dailyCost của nextEvent từ Player's money.
 *   2. Nếu không đủ tiền → rollback sang 'standard' (miễn phí).
 *   3. Chuyển nextEvent → activeEvent, resolve effects.
 *   4. Reset counters ngày.
 *
 * Gọi SAU khi statsStore.startNewDay() (để Player đã bị trừ lương trước).
 */
applyNextEventOnNewDay() {
  const statsStore = useStatsStore()

  // Reset counters
  this.playersPaidToday = 0
  this.eventRevenueToday = 0

  const target = getEventById(this.nextEventId)
  if (!target) {
    // Fallback: chuyển về Standard
    this.activeEventId = 'standard'
    this.resolvedActiveEffects = this._resolveActiveEffects(getEventById('standard')!)
    return
  }

  // Trừ phí duy trì
  if (target.dailyCost > 0) {
    if (statsStore.money < target.dailyCost) {
      // Không đủ tiền → fallback Standard (free)
      console.warn(`[Event] Không đủ tiền cho ${target.name}. Fallback Standard.`)
      this.activeEventId = 'standard'
      this.nextEventId = 'standard'
      this.resolvedActiveEffects = this._resolveActiveEffects(getEventById('standard')!)
      return
    }
    statsStore.spendMoney(target.dailyCost)
  }

  // Apply event
  this.activeEventId = target.id
  this.resolvedActiveEffects = this._resolveActiveEffects(target)
  // Next event giữ nguyên để default lặp lại event vừa chọn (hoặc reset về null tuỳ UX)
  // this.nextEventId = target.id  // giữ lại để ngày sau tự áp dụng tiếp nếu Player không đổi
},
```

### 2.4. Action `incrementPlayersHosted()` — gọi khi 1 khách hoàn tất chơi

```typescript
/**
 * Tăng tổng khách đã chơi (cumulative, cho unlock).
 * + Tăng counter hôm nay (thống kê).
 */
incrementPlayersHosted(paidAmount: number) {
  this.totalPlayersHosted++
  this.playersPaidToday++
  this.eventRevenueToday += paidAmount
},
```

### 2.5. Helper `getEventPriceMultiplier()` — **logic CORE**

```typescript
/**
 * Tính hệ số nhân giá thị trường cho 1 thẻ dựa trên các effect đang active.
 *
 * RULE MATCHING:
 *   - Duyệt tất cả resolvedActiveEffects.
 *   - Effect match nếu thẻ có attribute tương ứng với value.
 *   - Nếu thẻ match NHIỀU effect → nhân dồn (compound multiply).
 *   - Nếu không match effect nào → return 1.0 (neutral).
 *
 * Thẻ card phải có structure từ apiStore (TCGdex format):
 *   card.types: ['Fire']
 *   card.rarity: 'Rare Holo'
 *   card.set?.releaseDate: ...
 *   card.firstEdition: boolean (optional)
 */
getEventPriceMultiplier(card: any): number {
  if (!card) return 1.0
  if (this.resolvedActiveEffects.length === 0) return 1.0

  let multiplier = 1.0

  for (const eff of this.resolvedActiveEffects) {
    if (this._effectMatchesCard(eff, card)) {
      multiplier *= eff.multiplier
    }
  }

  // Clamp để không bị overflow hay âm (safety)
  return Math.max(0.1, Math.min(5.0, multiplier))
},

/**
 * Kiểm tra 1 effect có ảnh hưởng 1 card không.
 */
_effectMatchesCard(eff: ResolvedEffect, card: any): boolean {
  const rarity: string = (card.rarity ?? '').toUpperCase()
  const types: string[] = card.types ?? []

  switch (eff.target) {
    case 'ENERGY_TYPE':
      return types.includes(eff.value)

    case 'RARITY':
      // Match rarity "simple": 'Common', 'Uncommon', 'Rare', 'Epic', 'Legend'
      // 'Rare' → match 'Rare', 'Rare Holo', 'Rare Ultra' (substring OK)
      return rarity.includes(eff.value.toUpperCase())

    case 'EDITION':
      if (eff.value === '1st Edition') {
        return !!card.firstEdition || !!card.variants?.firstEdition
      }
      return false

    case 'BORDER':
      // Border info có thể lưu ở card.border hoặc infer từ rarity
      const border = (card.border ?? '').toLowerCase()
      if (border) return border === eff.value.toLowerCase()
      // Fallback: Gold/Silver border thường đi kèm rarity cao
      if (eff.value === 'Gold')   return rarity.includes('GOLD') || rarity.includes('SECRET')
      if (eff.value === 'Silver') return rarity.includes('SHINY')
      return false

    case 'CARD_TYPE':
      const target = eff.value.toUpperCase()
      if (target === 'EX')       return rarity.includes('EX') && !rarity.includes('VMAX')
      if (target === 'V')        return !!rarity.match(/\bV\b/)
      if (target === 'VMAX')     return rarity.includes('VMAX')
      if (target === 'VSTAR')    return rarity.includes('VSTAR')
      if (target === 'FULL ART') return rarity.includes('FULL ART') || rarity.includes('ILLUSTRATION')
      if (target === 'HOLO')     return rarity.includes('HOLO') || rarity.includes('FOIL')
      return false

    default:
      return false
  }
},
```

### 2.6. Save/Load

```typescript
loadEventState(parsed: any) {
  this.activeEventId = parsed.activeEventId ?? 'standard'
  this.nextEventId = parsed.nextEventId ?? 'standard'
  this.totalPlayersHosted = parsed.totalPlayersHosted ?? 0

  // Re-resolve effects
  const active = getEventById(this.activeEventId)
  this.resolvedActiveEffects = active ? this._resolveActiveEffects(active) : []

  this.playersPaidToday = 0
  this.eventRevenueToday = 0
},
```

Trong `gameStore.saveGame()`:
```typescript
const saveData = {
  // ... fields cũ
  activeEventId: useEventStore().activeEventId,
  nextEventId: useEventStore().nextEventId,
  totalPlayersHosted: useEventStore().totalPlayersHosted,
}
```

Trong `gameStore.startNewDay()`:
```typescript
startNewDay() {
  // ... statsStore.startNewDay, customerStore.reset, ...
  useEventStore().applyNextEventOnNewDay()   // ── NEW ──
  this.saveGame()
}
```

---

## 3. Logic Phaser — Tính tiền + Payment popup

### 3.1. State machine bổ sung cho NPC (intent='PLAY')

Hệ thống hiện tại đã có:
- `SEEK_TABLE` → di chuyển tới bàn.
- `PLAYING` → chơi 12s → rời đi qua `npcLeaveShop()`.

**Thay đổi:** Khi NPC đứng dậy khỏi bàn, thay vì leave ngay, NPC phải đi tới **quầy thu ngân** để thanh toán event fee. Thêm state trung gian **`GO_CASHIER_EVENT`** (khác với `GO_CASHIER` thường để tránh conflict với Cart/Buy flow).

```typescript
// File: src/features/customer/types/index.ts
export type NPCState =
  | 'SPAWN' | 'WANDER' | 'SEEK_ITEM' | 'INTERACT'
  | 'GO_CASHIER' | 'WAITING' | 'LEAVE'
  | 'WANT_TO_PLAY' | 'SEEK_TABLE' | 'PLAYING'
  | 'TRADE_IN' | 'TRADE_IN_WAITING'
  | 'GO_CASHIER_EVENT'   // ── NEW: Đi thanh toán phí event ──

export interface Customer {
  // ... các field cũ
  /** Thời điểm (Date.now()) bắt đầu ngồi chơi — để tính phí event */
  playStartTimestamp?: number
  /** Số tiền sẽ thanh toán khi tới quầy */
  eventFeeOwed?: number
}
```

### 3.2. Lưu `playStartTimestamp` khi NPC ngồi xuống

**File:** `NPCManager.ts` — trong `handleSeekTable()`:

```typescript
private handleSeekTable(customer: Customer) {
  const dist = Phaser.Math.Distance.Between(
    customer.sprite.x, customer.sprite.y, customer.targetX, customer.targetY
  )
  if (dist < 12) {
    customer.sprite.body!.velocity.set(0)
    customer.sprite.setPosition(customer.targetX, customer.targetY)
    customer.state = 'PLAYING'
    customer.timer = 0
    // ── NEW: Lưu timestamp bắt đầu chơi (dùng Date.now để đồng bộ với matchStartedAt) ──
    customer.playStartTimestamp = Date.now()
  }
}
```

### 3.3. Sửa `handlePlaying()` — tính tiền khi chơi xong

```typescript
private handlePlaying(customer: Customer, time: number) {
  const gStore = useGameStore()
  const myTable = gStore.placedTables[customer.assignedTableId!]
  if (!myTable) { customer.state = 'LEAVE'; return }

  // Nếu đủ 2 người và trận chưa bắt đầu → Bắt đầu tính giờ match
  if (myTable.occupants.every(o => o !== null) && !myTable.matchStartedAt) {
    gStore.startMatch(myTable.id)
  }

  // ── NEW: Check giờ đóng cửa 9 PM (1260 phút in-game) ──
  const statsStore = useStatsStore()
  const isClosingHour = statsStore.timeInMinutes >= 1260

  if (myTable.matchStartedAt) {
    const elapsed = Date.now() - myTable.matchStartedAt
    const duration = 12000 // 12s match cũ

    // Particle emote giữ nguyên
    if (time % 1000 < 50) {
      const emo = this.scene.add.text(customer.sprite.x, customer.sprite.y - 40, '🃏',
        { fontSize: '16px' }).setOrigin(0.5)
      this.scene.tweens.add({
        targets: emo, y: emo.y - 20, alpha: 0, duration: 800,
        onComplete: () => emo.destroy()
      })
    }

    // Kết thúc match: đủ 12s HOẶC quá 9PM
    if (elapsed >= duration || isClosingHour) {
      if (customer.seatIndex === 0) {
        gStore.finishMatch(myTable.id)
        gStore.gainExp(50)
      }
      this._startEventCheckout(customer, myTable)
    }
  }
}
```

### 3.4. Helper `_startEventCheckout()` — chuyển state và tính tiền

```typescript
/**
 * NPC chơi xong → tính phí event, chuyển sang state GO_CASHIER_EVENT.
 */
private _startEventCheckout(customer: Customer, table: any) {
  const eventStore = useEventStore()
  const activeEvent = eventStore.activeEvent

  // Tính phí theo công thức:
  //   payment = (sessionMinutes / 60) × hourlyFee
  //   sessionMinutes dùng REAL time (Date.now - playStartTimestamp), convert sang "game minutes".
  //
  // Game time scale: xem AppConfig — giả định 1 phút thực = X phút game.
  // Đơn giản hoá: Dùng real minutes với 60s scale-down.
  const startTs = customer.playStartTimestamp ?? Date.now()
  const elapsedMs = Date.now() - startTs
  const elapsedMinutes = elapsedMs / 60000  // real minutes

  let fee = 0
  if (activeEvent) {
    fee = (elapsedMinutes / 60) * activeEvent.hourlyFee
    // Round 2 decimals
    fee = Math.round(fee * 100) / 100
  }

  // Min fee guard — nếu quá ngắn (< 1 phút) vẫn charge base
  if (fee < 0.5 && activeEvent) fee = 0.5

  customer.eventFeeOwed = fee

  // Free seat cho NPC khác
  if (customer.assignedTableId) {
    useGameStore().leaveTable(customer.assignedTableId, customer.instanceId)
  }

  // Chuyển state
  if (fee > 0) {
    customer.state = 'GO_CASHIER_EVENT'
    customer.searchStartTime = this.scene.time.now
  } else {
    // Event free (Standard) → leave luôn
    this._applyEventPayment(customer)
    this.npcLeaveShop(customer)
  }
}
```

### 3.5. Handler `GO_CASHIER_EVENT` — đi thanh toán

```typescript
private handleGoCashierEvent(customer: Customer) {
  const gameStore = useGameStore()
  const cashiers = Object.values(gameStore.placedCashiers) as any[]
  if (cashiers.length === 0) {
    // Không có quầy → coi như thanh toán thẳng
    this._applyEventPayment(customer)
    this.npcLeaveShop(customer)
    return
  }

  const desk = cashiers[0]
  customer.targetX = desk.x
  customer.targetY = desk.y + 45

  const dist = Phaser.Math.Distance.Between(
    customer.sprite.x, customer.sprite.y,
    customer.targetX, customer.targetY
  )

  if (dist > 14) {
    this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
  } else {
    customer.sprite.body?.velocity.set(0)
    // Thanh toán ngay khi tới quầy (không cần click — khách tự trả)
    this._applyEventPayment(customer)
    this.npcLeaveShop(customer)
  }
}
```

Thêm vào `handleNPCState()`:
```typescript
case 'GO_CASHIER_EVENT': this.handleGoCashierEvent(customer); break;
```

### 3.6. Helper `_applyEventPayment()` — cộng tiền + popup bay lên

```typescript
/**
 * Áp dụng thanh toán phí event:
 *   - Cộng tiền vào statsStore
 *   - Tăng counter totalPlayersHosted
 *   - Spawn popup "+ $X.XX" tại bàn chơi
 */
private _applyEventPayment(customer: Customer) {
  const fee = customer.eventFeeOwed ?? 0
  if (fee <= 0) return

  const statsStore = useStatsStore()
  const eventStore = useEventStore()

  statsStore.addMoney(fee)
  statsStore.dailyStats.revenue += fee
  eventStore.incrementPlayersHosted(fee)

  // Popup "+$X.XX" tại vị trí bàn chơi (hoặc chỗ NPC hiện tại nếu chưa rời bàn)
  const popupX = customer.sprite.x
  const popupY = customer.sprite.y - 50

  const popup = this.scene.add.text(popupX, popupY, `+$${fee.toFixed(2)}`, {
    fontSize: '18px',
    color: '#10b981',
    fontStyle: 'bold',
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

  this.scene.tweens.add({
    targets: popup,
    y: popupY - 60,
    alpha: 0,
    duration: 2000,
    ease: 'Cubic.easeOut',
    onComplete: () => popup.destroy(),
  })

  // Reset field để không double-charge
  customer.eventFeeOwed = 0
}
```

### 3.7. Ép buộc thanh toán khi hết giờ (9 PM)

Trong `updateNPCs()`, block xử lý `isClosingTime` hiện tại:

```typescript
// Cờ giờ đóng cửa 9 PM
const isNinePM = gameStore.timeInMinutes >= 1260

if (isNinePM && customer.state === 'PLAYING') {
  // Ép thanh toán ngay
  const table = gameStore.placedTables[customer.assignedTableId!]
  if (table) this._startEventCheckout(customer, table)
  continue
}
```

---

## 4. Giao diện Smartphone (`ManageEventApp.vue`)

**File:** `src/features/events/components/ManageEventApp.vue` (NEW)

### 4.1. Mockup UI (mobile-vertical)

```
┌─ 📱 Smartphone ────────────────────┐
│                                    │
│   🎮 MANAGE EVENT                  │
│   ──────────────────────────────   │
│                                    │
│   ┌── NGÀY MAI ───────────────┐   │
│   │  🔥  Fire Cup             │   │
│   │  Elemental Format          │   │
│   │  ─────────────────         │   │
│   │  Fee:   $10/hr             │   │
│   │  Cost:  $70/day            │   │
│   │                            │   │
│   │  Possible Effects:         │   │
│   │  + Fire cards  ×1.5  🟢    │   │
│   │  - Earth cards ×0.7  🔴    │   │
│   │                            │   │
│   │     [   EDIT   ]           │   │
│   └────────────────────────────┘   │
│                                    │
│   ┌── HÔM NAY ────────────────┐   │
│   │  Standard                  │   │
│   │  Revenue today: $12.50     │   │
│   │  Players paid:  3          │   │
│   └────────────────────────────┘   │
│                                    │
│   Total Players Hosted: 156        │
│                                    │
│   [ CONFIRM ]      [ CLOSE ]       │
└────────────────────────────────────┘
```

### 4.2. Component code

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEventStore } from '../store/eventStore'
import { useStatsStore } from '../../stats/store/statsStore'
import { GAME_EVENTS } from '../config/eventsData'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ close: [] }>()

const eventStore = useEventStore()
const statsStore = useStatsStore()

const showPicker = ref(false)

const availableEvents = computed(() => eventStore.unlockedEvents)

function selectEvent(id: string) {
  const result = eventStore.setNextEvent(id)
  if (result.success) {
    showPicker.value = false
  } else {
    alert(result.reason)
  }
}

function confirm() {
  // Already stored via setNextEvent — chỉ cần đóng
  emit('close')
}

function formatEffectLine(eff: { target: string; value: string; multiplier: number }) {
  const sign = eff.multiplier >= 1 ? '+' : '-'
  const color = eff.multiplier >= 1 ? 'positive' : 'negative'
  const emoji = eff.multiplier >= 1 ? '🟢' : '🔴'

  let desc = ''
  if (eff.target === 'RANDOM') {
    desc = 'Random cards'
  } else {
    desc = `${eff.value} cards`
  }
  return { sign, color, emoji, desc, mult: eff.multiplier }
}
</script>

<template>
  <div v-if="isOpen" class="smartphone-overlay">
    <div class="smartphone-frame">
      <!-- Header -->
      <header class="app-header">
        <h2>🎮 Manage Event</h2>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <!-- Picker Modal (Edit) -->
      <div v-if="showPicker" class="picker-sheet">
        <h3>Chọn sự kiện cho ngày mai:</h3>
        <ul class="event-list">
          <li
            v-for="ev in availableEvents" :key="ev.id"
            :class="{ current: ev.id === eventStore.nextEventId }"
            @click="selectEvent(ev.id)"
          >
            <span class="icon">{{ ev.icon }}</span>
            <span class="name">{{ ev.name }}</span>
            <span class="cost">
              <span class="cost-day">${{ ev.dailyCost }}/day</span>
              <span class="cost-hr">${{ ev.hourlyFee }}/hr</span>
            </span>
          </li>
        </ul>
        <EnhancedButton variant="secondary" size="md" fullWidth @click="showPicker = false">
          Huỷ
        </EnhancedButton>
      </div>

      <!-- Main View -->
      <div v-else class="app-body">
        <!-- Next Event Card -->
        <section v-if="eventStore.nextEvent" class="event-card next">
          <div class="card-title">
            <span class="tag-next">NEXT DAY</span>
            <h3>{{ eventStore.nextEvent.icon }} {{ eventStore.nextEvent.name }}</h3>
            <p>{{ eventStore.nextEvent.format }}</p>
          </div>

          <div class="card-stats">
            <div>
              <span class="label">Fee</span>
              <span class="value">${{ eventStore.nextEvent.hourlyFee }}/hr</span>
            </div>
            <div>
              <span class="label">Cost</span>
              <span class="value">${{ eventStore.nextEvent.dailyCost }}/day</span>
            </div>
          </div>

          <p class="card-desc">{{ eventStore.nextEvent.description }}</p>

          <!-- Effects -->
          <div class="effects-list">
            <h4>Possible Effects:</h4>
            <div
              v-for="(eff, idx) in eventStore.nextEvent.effects" :key="idx"
              class="effect-row"
              :class="formatEffectLine(eff).color"
            >
              <span class="effect-emoji">{{ formatEffectLine(eff).emoji }}</span>
              <span class="effect-text">
                {{ formatEffectLine(eff).sign }} {{ formatEffectLine(eff).desc }}
              </span>
              <span class="effect-mult">×{{ formatEffectLine(eff).mult }}</span>
            </div>
          </div>

          <EnhancedButton
            variant="primary" size="md" fullWidth
            @click="showPicker = true"
          >
            Edit Event
          </EnhancedButton>
        </section>

        <!-- Today's Status -->
        <section v-if="eventStore.activeEvent" class="today-card">
          <div class="today-header">
            <span class="today-label">TODAY</span>
            <h4>{{ eventStore.activeEvent.icon }} {{ eventStore.activeEvent.name }}</h4>
          </div>
          <div class="today-stats">
            <div>
              <span class="stat-label">Revenue today</span>
              <span class="stat-value">${{ eventStore.eventRevenueToday.toFixed(2) }}</span>
            </div>
            <div>
              <span class="stat-label">Players paid</span>
              <span class="stat-value">{{ eventStore.playersPaidToday }}</span>
            </div>
          </div>
        </section>

        <!-- Counter -->
        <div class="total-hosted">
          Total Players Hosted:
          <strong>{{ eventStore.totalPlayersHosted }}</strong>
        </div>

        <!-- Confirm btn -->
        <EnhancedButton variant="success" size="lg" fullWidth @click="confirm">
          Confirm Event
        </EnhancedButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.smartphone-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 300;
  display: flex; align-items: center; justify-content: center;
}

.smartphone-frame {
  width: 380px; max-width: 90vw;
  max-height: 85vh;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border: 3px solid #334155;
  border-radius: 28px;
  overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.app-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid #334155;
}
.app-header h2 { color: #f1f5f9; margin: 0; font-size: 1.1rem; }
.close {
  background: transparent; border: none;
  color: #94a3b8; font-size: 1.3rem; cursor: pointer;
}

.app-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  display: flex; flex-direction: column; gap: 16px;
}

.event-card {
  background: rgba(51, 65, 85, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 14px;
  padding: 16px;
}

.event-card.next { border-color: #3b82f6; }

.tag-next {
  display: inline-block;
  font-size: 0.65rem;
  background: #3b82f6; color: white;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.card-title h3 {
  color: #f1f5f9;
  margin: 0;
  font-size: 1.3rem;
}
.card-title p { color: #94a3b8; margin: 2px 0 0; font-size: 0.85rem; }

.card-stats {
  display: flex; gap: 16px;
  margin: 12px 0;
  padding: 10px 0;
  border-top: 1px dashed rgba(148, 163, 184, 0.2);
  border-bottom: 1px dashed rgba(148, 163, 184, 0.2);
}
.card-stats > div { flex: 1; display: flex; flex-direction: column; }
.card-stats .label { color: #94a3b8; font-size: 0.75rem; }
.card-stats .value { color: #fbbf24; font-weight: 700; font-size: 1rem; }

.card-desc { color: #cbd5e1; font-size: 0.85rem; margin: 8px 0; }

.effects-list { margin-top: 10px; }
.effects-list h4 { color: #94a3b8; font-size: 0.8rem; margin-bottom: 6px; }
.effect-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-bottom: 4px;
}
.effect-row.positive { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; }
.effect-row.negative { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
.effect-mult { margin-left: auto; font-weight: 700; }

.today-card {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 10px;
  padding: 12px;
}
.today-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px;
}
.today-label {
  font-size: 0.6rem;
  background: #10b981; color: white;
  padding: 2px 6px; border-radius: 999px;
  font-weight: 700;
}
.today-header h4 { color: #f1f5f9; margin: 0; font-size: 0.95rem; }
.today-stats { display: flex; gap: 14px; }
.today-stats > div { flex: 1; display: flex; flex-direction: column; }
.stat-label { color: #94a3b8; font-size: 0.7rem; }
.stat-value { color: #fbbf24; font-weight: 700; }

.total-hosted {
  text-align: center;
  color: #cbd5e1;
  font-size: 0.85rem;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}
.total-hosted strong { color: #fbbf24; }

.picker-sheet {
  padding: 16px;
  overflow-y: auto;
}
.event-list {
  list-style: none; padding: 0;
  display: flex; flex-direction: column; gap: 8px;
  margin-bottom: 16px;
}
.event-list li {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: rgba(51, 65, 85, 0.4);
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.event-list li:hover { background: rgba(51, 65, 85, 0.8); border-color: #3b82f6; }
.event-list li.current { border-color: #10b981; background: rgba(16, 185, 129, 0.15); }
.event-list .icon { font-size: 1.3rem; }
.event-list .name { color: #f1f5f9; flex: 1; }
.event-list .cost { display: flex; flex-direction: column; align-items: flex-end; font-size: 0.75rem; }
.event-list .cost-day { color: #ef4444; }
.event-list .cost-hr { color: #10b981; }
</style>
```

### 4.3. Mount & trigger

Thêm nút mở trong `UIOverlay.vue`:

```vue
<EnhancedButton
  variant="primary" size="md"
  @click="uiStore.showManageEvent = true"
>
  🎮 Manage Event
</EnhancedButton>
```

Trong `App.vue`:
```vue
<ManageEventApp
  :isOpen="uiStore.showManageEvent"
  @close="uiStore.showManageEvent = false"
/>
```

Cập nhật `uiStore.ts` thêm flag:
```typescript
state: () => ({
  // ... cũ
  showManageEvent: false,
})
```

---

## 5. Tích hợp buff/nerf vào giá bán

### 5.1. Khi NPC mua thẻ từ shelf

Hiện tại `furnitureStore.npcTakeItemFromSlot()` chỉ trả về `itemId`. Tiền được tính ở `NPCManager.handleInteract()` dựa trên `shopItems[itemId].sellPrice`.

**Thay đổi:** Trước khi tính `targetPrice`, nhân thêm `eventStore.getEventPriceMultiplier(card)`.

Trong `NPCManager.handleInteract()` (tạm viết pseudo — adapt theo code hiện tại):

```typescript
private handleInteract(customer: Customer, time: number) {
  // ... logic cũ pick shelf + tier
  const inv = useInventoryStore()
  const eventStore = useEventStore()
  const apiStore = useApiStore()

  const itemId = furnitureStore.npcTakeItemFromSlot(shelfId)
  if (!itemId) return

  const item = inv.shopItems[itemId]
  let price = item.sellPrice

  // ── NEW: Apply event buff/nerf ──
  // Nếu item là pack → các card bên trong bị ảnh hưởng, không phải pack itself.
  // → Cách đơn giản: apply multiplier lên sellPrice của pack/box directly
  //   dựa trên attribute chung (vd: pack có `sourceSetId`, không có types).
  // → Cho milestone đầu, chỉ apply multiplier khi item TYPE=pack có card preview.
  //   Nếu không có card reference → dùng multiplier=1.0.

  // Alternative: Nếu bạn có card reference trong item (tương lai):
  // const card = apiStore.flatCardMap[item.sampleCardId]
  // price *= eventStore.getEventPriceMultiplier(card)

  // Đơn giản hoá: Lookup pack theo sourceSetId → pick random 1 card trong set → apply mult
  if (item.sourceSetId) {
    const setCards = apiStore.setCardsCache[item.sourceSetId]
    if (setCards && setCards.length > 0) {
      const sample = setCards[Math.floor(Math.random() * setCards.length)]
      price *= eventStore.getEventPriceMultiplier(sample)
    }
  }

  customer.targetPrice = Math.round(price * 100) / 100
  // ... rest of logic (addWaitingCustomer, etc.)
}
```

### 5.2. Apply lên Display Case (từ Blueprint 16)

Trong `furnitureStore.npcBuyFromDisplayCase()`:

```typescript
npcBuyFromDisplayCase(shelfId: string): { cardId: string; price: number } | null {
  // ... logic cũ pick card
  const apiStore = useApiStore()
  const eventStore = useEventStore()
  const card = apiStore.flatCardMap[picked.cardId]

  const basePrice = tier.customPriceMap?.[picked.cardId] ?? 0
  const finalPrice = basePrice * eventStore.getEventPriceMultiplier(card)

  // ... rest
  return { cardId: picked.cardId, price: Math.round(finalPrice * 100) / 100 }
}
```

---

## 6. Testing Checklist

### Data & Store

- [ ] `eventStore.unlockedEvents` tăng dần khi `totalPlayersHosted` tăng.
- [ ] `setNextEvent('fire_cup')` khi chưa đủ unlock → return `success:false`.
- [ ] `applyNextEventOnNewDay()` trừ đúng dailyCost.
- [ ] Không đủ tiền → fallback về `standard`.
- [ ] `getEventPriceMultiplier(fireCard)` với Fire Cup → 1.5x.
- [ ] `getEventPriceMultiplier(earthCard)` với Fire Cup → 0.7x.
- [ ] Card match nhiều effect → compound multiply (hiếm gặp).

### Phaser — Payment flow

- [ ] NPC intent='PLAY' ngồi xuống → `playStartTimestamp` được set.
- [ ] Chơi xong 12s → NPC chuyển `GO_CASHIER_EVENT`.
- [ ] NPC đi tới quầy thu ngân → `_applyEventPayment()` chạy → tiền cộng.
- [ ] Popup "+$X.XX" bay lên tại vị trí NPC.
- [ ] `totalPlayersHosted++` sau mỗi lần payment.
- [ ] Quá 9 PM (1260min) → NPC đang PLAYING bị force checkout.
- [ ] Không có quầy cashier → NPC thanh toán thẳng, không crash.
- [ ] Standard event (fee $0 per session vẫn apply vì hourlyFee $7) → vẫn có phí → cần gate `activeEvent.hourlyFee`.

### UI

- [ ] Smartphone app hiện đúng nextEvent.
- [ ] Edit → picker list chỉ hiện unlocked events.
- [ ] Dòng effect hiện đúng xanh/đỏ theo multiplier.
- [ ] Today panel hiện `eventRevenueToday` real-time.

### Price application

- [ ] Fire Cup active → NPC mua pack Fire set → giá bán tăng ~1.5x.
- [ ] EX Battle active → NPC mua thẻ EX từ display case → giá ×1.8.
- [ ] Holo Heaven active → pack toàn Holo → giá ×2.5.
- [ ] Standard (random buff/nerf) → đổi mỗi ngày khác nhau.

### Save/Load

- [ ] Save → reload → `activeEventId`, `nextEventId`, `totalPlayersHosted` khôi phục.
- [ ] Sau reload, `resolvedActiveEffects` được rebuild đúng.

---

## 7. File list tóm tắt

| File | Loại | Mô tả |
|------|------|-------|
| `events/config/eventsData.ts` | NEW | 12 events + types |
| `events/store/eventStore.ts` | NEW | Pinia store + logic match |
| `events/components/ManageEventApp.vue` | NEW | UI Smartphone |
| `customer/types/index.ts` | EDIT | Thêm `GO_CASHIER_EVENT` state |
| `customer/managers/NPCManager.ts` | EDIT | Logic checkout + payment popup |
| `shop-ui/store/gameStore.ts` | EDIT | startNewDay gọi applyNextEventOnNewDay |
| `shop-ui/store/uiStore.ts` | EDIT | flag `showManageEvent` |
| `furniture/store/furnitureStore.ts` | EDIT | Display case apply multiplier |
| `shop-ui/components/UIOverlay.vue` | EDIT | Nút mở Manage Event |
| `App.vue` | EDIT | Mount ManageEventApp |

---

## 8. Rollout Order

1. **Phase A** — Data + Store (1 ngày): `eventsData.ts`, `eventStore.ts`, getEventPriceMultiplier. Test qua dev console.
2. **Phase B** — Smartphone UI (1 ngày): ManageEventApp + picker. Unit test: setNextEvent, unlock guard.
3. **Phase C** — Payment flow Phaser (1.5 ngày): State `GO_CASHIER_EVENT`, `_startEventCheckout`, popup. Bao gồm 9PM force-checkout.
4. **Phase D** — Integration vào giá (0.5 ngày): Apply multiplier vào NPC buy + display case.
5. **Phase E** — Polish: UI tweak, balance hourlyFee theo playtest.

---

## 9. Lưu ý Balance & Design

- **`hourlyFee` trong spec tính theo real-time (Date.now) hay game-time?**
  Spec nói "Phút chơi / 60 × Fee". Ở prod, 12s real = 1 match (quá ngắn với $10/hr = $0.03/match → vô nghĩa).
  **Đề xuất:** Scale game-time — mỗi 12s real tương ứng vài game-minutes (ví dụ 30 min). Điều chỉnh trong `_startEventCheckout` để dùng `gameMinutes = realSeconds * scale` (scale ≈ 150 nếu 1 ngày in-game = 12 giờ real → scale=120). Con số cụ thể để playtest.

- **NPC thanh toán khi nào?**
  Hiện tại: NPC PLAY xong → `GO_CASHIER_EVENT` → chạm quầy → cộng tiền → leave.
  Ưu điểm: Có animation, nhất quán với BUY flow.
  Nhược: Nếu không có cashier, NPC thanh toán "trong không khí".

- **Multi-effect compound có nguy hiểm không?**
  Nếu event có 2 effects đều match 1 card (VD: Fire Cup + card Fire Holo, nếu ra Holo Heaven buff × Fire buff) → compound có thể lên tới 2.5×1.5 = 3.75×.
  Đã clamp `[0.1, 5.0]` trong `getEventPriceMultiplier`. An toàn.

- **Standard event (random)**:
  Random 1 buff + 1 nerf mỗi ngày → làm game đa dạng. Event này được quảng cáo là "mặc định free" → nên có kèm disclaimer trong UI: "Random effects change daily".