# Module 22: Manual Checkout UI — Technical Blueprint
### TCG Shop Simulator | Thiết kế kỹ thuật cho Junior Coder

---

## Mục lục

1. [Tổng quan Kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Floating-Point Math — Nguyên tắc bất biến](#2-floating-point-math--nguyên-tắc-bất-biến)
3. [Tạo `checkoutStore.ts`](#3-tạo-checkstorets)
4. [Cập nhật `gameStore.ts`](#4-cập-nhật-gamestorets)
5. [Tích hợp Phaser — `MainScene.ts`](#5-tích-hợp-phaser--mainsceents)
6. [Kiến trúc Vue UI — Cấu trúc Component](#6-kiến-trúc-vue-ui--cấu-trúc-component)
7. [Component `CheckoutModal.vue`](#7-component-checkoutmodalvue)
8. [Component `CashRegister.vue`](#8-component-cashregistervue)
9. [Component `CreditCardPOS.vue`](#9-component-creditcardposvue)
10. [Tích hợp vào `App.vue`](#10-tích-hợp-vào-appvue)
11. [Luồng hoàn chỉnh từ đầu đến cuối](#11-luồng-hoàn-chỉnh-từ-đầu-đến-cuối)
12. [Checklist kiểm tra trước khi merge](#12-checklist-kiểm-tra-trước-khi-merge)

---

## 1. Tổng quan Kiến trúc

### Nguyên tắc thiết kế cốt lõi

| Quyết định | Lý do |
|---|---|
| **UI chỉ mở khi Player tương tác** | Staff dùng `processAutoCheckout()` ngầm — tách biệt hoàn toàn |
| **`checkoutStore` độc lập** | Không làm `gameStore` to hơn; dễ test, dễ extend |
| **Toàn bộ số tiền lưu dạng integer cents** | Tránh floating-point error triệt để (xem Mục 2) |
| **Payment method được random khi `openCheckout()`** | Không thể đoán trước; tăng tính ngẫu nhiên |
| **Keyboard listener mount/unmount trong Vue** | Không để listener leak khi modal đóng |

### Sơ đồ luồng (Flow Diagram)

```
[Player đi đến cashier_desk]
        │
        ▼
[Bấm phím E trong Phaser]
        │
        ▼
[MainScene kiểm tra proximity < 80px]
        │
[CÓ khách chờ?] ──NO──> [Không làm gì]
        │ YES
        ▼
[checkoutStore.openCheckout(billTotal, instanceId)]
        │
[Random paymentMethod: CASH hoặc CARD]
        │
        ▼
[Phaser gọi gameStore.isPaused = true (optional)]
        │
        ▼
[Vue render CheckoutModal.vue]
        │
    ┌───┴───┐
  CASH     CARD
    │         │
    ▼         ▼
[CashRegister] [CreditCardPOS]
    │         │
[Thối đúng] [Nhập đúng số]
    │         │
    └────┬────┘
         ▼
[checkoutStore.completeCheckout()]
         │
         ▼
[customerStore.serveCustomer(instanceId)]
[statsStore.addMoney() + gainExp()]
[Phát âm thanh cha-ching]
[Modal đóng]
```

---

## 2. Floating-Point Math — Nguyên tắc bất biến

### Vấn đề

JavaScript lưu số thực theo chuẩn IEEE 754. Phép cộng đơn giản:

```javascript
// SAI — ĐỪNG BAO GIỜ LÀM NÀY với tiền tệ
0.1 + 0.2 === 0.3 // false → kết quả thực: 0.30000000000000004
56.25 - 3.75      // → 52.49999999999999 (sai!)
```

### Giải pháp — Quy tắc Cents

**Quy tắc bất biến: Lưu tất cả số tiền dưới dạng integer cents (số nguyên).**

```typescript
// ĐÚNG — Luôn convert sang cents trước khi tính
const toCents = (dollars: number): number => Math.round(dollars * 100)
const fromCents = (cents: number): number => cents / 100
const formatMoney = (cents: number): string => `$${(cents / 100).toFixed(2)}`

// Ví dụ:
const bill    = toCents(56.25) // → 5625 (integer, không bao giờ có lỗi)
const cash    = toCents(80.00) // → 8000
const change  = cash - bill    // → 2375 (integer math, luôn chính xác)
// Hiển thị: formatMoney(2375) → "$23.75"
```

**Tại sao `Math.round(val * 100)` chứ không phải `val * 100`?**

```typescript
// Một số giá trị bị lệch khi nhân 100:
2.55 * 100     // → 254.99999999999997 (Floor sẽ bị sai)
Math.round(2.55 * 100) // → 255 (đúng)
```

**Quy tắc khi nhận input từ người dùng (POS Terminal):**

```typescript
// Input: chuỗi "56.25" từ keyboard
const parseInput = (str: string): number => {
  const parsed = parseFloat(str)
  if (isNaN(parsed)) return 0
  return Math.round(parsed * 100) // Convert ngay sang cents
}
```

**Áp dụng trong toàn bộ `checkoutStore`:** Mọi field lưu tiền đều suffix `Cents` để tránh nhầm lẫn:
- `billTotalCents: number`
- `amountReceivedCents: number`
- `changeOwedCents: number`
- `changePreparedCents: number`

---

## 3. Tạo `checkoutStore.ts`

**Vị trí:** `src/features/inventory/store/checkoutStore.ts`

```typescript
// checkoutStore.ts
import { defineStore } from 'pinia'

export type PaymentMethod = 'CASH' | 'CARD'

// Định nghĩa mệnh giá tiền (đơn vị: cents)
export interface Denomination {
  labelCents: number   // Giá trị tuyệt đối (cents)
  display: string      // Hiển thị trên UI: "$50", "25¢"
  isNote: boolean      // true = tờ bạc, false = đồng xu
}

export const DENOMINATIONS: Denomination[] = [
  { labelCents: 5000, display: '$50',  isNote: true  },
  { labelCents: 2000, display: '$20',  isNote: true  },
  { labelCents: 1000, display: '$10',  isNote: true  },
  { labelCents:  500, display: '$5',   isNote: true  },
  { labelCents:  100, display: '$1',   isNote: true  },
  { labelCents:   50, display: '50¢',  isNote: false },
  { labelCents:   25, display: '25¢',  isNote: false },
  { labelCents:   10, display: '10¢',  isNote: false },
  { labelCents:    5, display: '5¢',   isNote: false },
  { labelCents:    1, display: '1¢',   isNote: false },
]

// Tính tiền khách đưa (selalu lebih besar dari bill)
// Chọn ngẫu nhiên từ danh sách mệnh giá hợp lý
function pickCashAmount(billTotalCents: number): number {
  const bills = [100, 200, 500, 1000, 2000, 5000, 10000] // cents
  // Tìm mệnh giá nhỏ nhất >= bill total
  const suitable = bills.filter(b => b >= billTotalCents)
  if (suitable.length === 0) {
    // Bill quá lớn, khách đưa tờ lớn nhất + thêm lẻ
    return 10000 + billTotalCents
  }
  // Random chọn trong 2 mệnh giá phù hợp đầu tiên để tạo cảm giác đa dạng
  const pool = suitable.slice(0, Math.min(2, suitable.length))
  return pool[Math.floor(Math.random() * pool.length)]
}

export const useCheckoutStore = defineStore('checkout', {
  state: () => ({
    // ── Trạng thái UI ──
    isOpen: false,
    paymentMethod: null as PaymentMethod | null,

    // ── Dữ liệu giao dịch (tất cả đơn vị cents) ──
    billTotalCents: 0,
    customerInstanceId: null as string | null,

    // Cash-specific
    cashGivenCents: 0,       // Tiền khách đưa
    changePreparedCents: 0,  // Tổng tiền đang chuẩn bị thối
    // Map: denominationCents → số lượng đang thối
    changeDenominations: {} as Record<number, number>,

    // Card-specific
    posInputString: '',     // Chuỗi đang gõ trên máy POS ("56.25")
    posError: false,        // Flash đỏ khi nhập sai

    // ── Phản hồi ──
    isSuccess: false,        // Flash xanh khi thành công
  }),

  getters: {
    // Tiền thối đúng phải là bao nhiêu (cents)
    changeOwedCents: (state): number => {
      return Math.max(0, state.cashGivenCents - state.billTotalCents)
    },

    // Chênh lệch còn thiếu để thối đủ (cents) — âm nghĩa là thừa
    changeRemainingCents: (state): number => {
      const owed = Math.max(0, state.cashGivenCents - state.billTotalCents)
      return owed - state.changePreparedCents
    },

    // Có thể bấm OK (tiền thối đúng) không?
    canConfirmCash: (state): boolean => {
      if (state.paymentMethod !== 'CASH') return false
      const owed = Math.max(0, state.cashGivenCents - state.billTotalCents)
      return owed === state.changePreparedCents
    },

    // POS: Input đã đúng số tiền chưa?
    canConfirmCard: (state): boolean => {
      if (state.paymentMethod !== 'CARD') return false
      const inputCents = Math.round(parseFloat(state.posInputString || '0') * 100)
      return inputCents === state.billTotalCents && !isNaN(inputCents)
    },

    // Helpers hiển thị (formatted strings)
    billTotalDisplay: (state): string => `$${(state.billTotalCents / 100).toFixed(2)}`,
    cashGivenDisplay: (state): string => `$${(state.cashGivenCents / 100).toFixed(2)}`,
    changeOwedDisplay(): string {
      return `$${(this.changeOwedCents / 100).toFixed(2)}`
    },
    changePreparedDisplay: (state): string => `$${(state.changePreparedCents / 100).toFixed(2)}`,
  },

  actions: {
    /**
     * Mở checkout modal dành cho Player thủ công.
     * @param billTotalDollars - Tổng bill (dollars, số thực)
     * @param customerInstanceId - ID NPC khách hàng
     */
    openCheckout(billTotalDollars: number, customerInstanceId: string) {
      const billCents = Math.round(billTotalDollars * 100)

      this.isOpen = true
      this.billTotalCents = billCents
      this.customerInstanceId = customerInstanceId
      this.isSuccess = false
      this.posError = false

      // Random payment method (50/50)
      this.paymentMethod = Math.random() < 0.5 ? 'CASH' : 'CARD'

      if (this.paymentMethod === 'CASH') {
        // Khách đưa tiền mặt
        this.cashGivenCents = pickCashAmount(billCents)
        this.changePreparedCents = 0
        this.changeDenominations = {}
      } else {
        // Khách đưa thẻ
        this.posInputString = ''
        this.cashGivenCents = 0
        this.changePreparedCents = 0
        this.changeDenominations = {}
      }
    },

    closeCheckout() {
      this.isOpen = false
      this.paymentMethod = null
      this.billTotalCents = 0
      this.customerInstanceId = null
      this.cashGivenCents = 0
      this.changePreparedCents = 0
      this.changeDenominations = {}
      this.posInputString = ''
      this.posError = false
      this.isSuccess = false
    },

    // ──────────────────────────────────────────────
    // CASH LOGIC
    // ──────────────────────────────────────────────

    /**
     * Player bấm vào tờ tiền/đồng xu để thối.
     * Chỉ cho phép thêm nếu chưa vượt quá changeOwed.
     */
    addChangeDenomination(denomCents: number) {
      const owed = this.changeOwedCents
      const newTotal = this.changePreparedCents + denomCents

      // Không cho thối nhiều hơn số cần thiết
      if (newTotal > owed) return

      this.changePreparedCents = newTotal

      if (!this.changeDenominations[denomCents]) {
        this.changeDenominations[denomCents] = 0
      }
      this.changeDenominations[denomCents]++
    },

    /**
     * Xóa toàn bộ tiền thối đang chuẩn bị — bắt đầu lại.
     */
    clearChangeDenominations() {
      this.changePreparedCents = 0
      this.changeDenominations = {}
    },

    /**
     * Tự động điền tiền thối (Quick Fill) — giúp người dùng test nhanh.
     * Dùng thuật toán tham lam (greedy): chọn mệnh giá lớn nhất có thể.
     */
    autoFillChange() {
      this.clearChangeDenominations()
      let remaining = this.changeOwedCents

      // Sort denominations giảm dần
      const sorted = [...DENOMINATIONS].sort((a, b) => b.labelCents - a.labelCents)

      for (const denom of sorted) {
        while (remaining >= denom.labelCents) {
          this.addChangeDenomination(denom.labelCents)
          remaining -= denom.labelCents
        }
      }
    },

    // ──────────────────────────────────────────────
    // CARD / POS LOGIC
    // ──────────────────────────────────────────────

    /**
     * Thêm ký tự vào POS input (từ virtual keypad hoặc keyboard thật).
     */
    posAppendChar(char: string) {
      this.posError = false
      // Giới hạn format: chỉ số và dấu chấm, tối đa 2 số thập phân
      const current = this.posInputString
      if (char === '.') {
        if (current.includes('.')) return // Không thêm dấu chấm 2 lần
        this.posInputString = current + '.'
        return
      }
      // Không cho nhập quá 2 chữ số sau dấu chấm
      const dotIndex = current.indexOf('.')
      if (dotIndex !== -1 && current.length - dotIndex > 2) return

      this.posInputString = current + char
    },

    posBackspace() {
      this.posError = false
      this.posInputString = this.posInputString.slice(0, -1)
    },

    posClear() {
      this.posInputString = ''
      this.posError = false
    },

    /**
     * Xử lý bấm Enter trên POS.
     * Nếu đúng → completeCheckout(); Nếu sai → flash đỏ.
     */
    posConfirm() {
      if (this.canConfirmCard) {
        this.completeCheckout()
      } else {
        this.posError = true
        // Auto-reset error sau 800ms
        setTimeout(() => { this.posError = false }, 800)
      }
    },

    // ──────────────────────────────────────────────
    // COMPLETION
    // ──────────────────────────────────────────────

    /**
     * Hoàn thành thanh toán.
     * Gọi sau khi đã xác nhận đúng (canConfirmCash hoặc canConfirmCard).
     * Cập nhật stats và đóng modal.
     */
    completeCheckout() {
      if (!this.customerInstanceId) return

      // Import lazy để tránh circular dependency
      const { useCustomerStore } = require('../../customer/store/customerStore')
      const { useStatsStore } = require('../../stats/store/statsStore')

      const customerStore = useCustomerStore()
      const statsStore = useStatsStore()

      // Tiền thực nhận = bill (không phải cash given — change đã thối lại)
      const earned = this.billTotalCents / 100
      statsStore.addMoney(earned)
      statsStore.dailyStats.customersServed++
      statsStore.dailyStats.revenue += earned
      statsStore.gainExp(10) // Bonus XP cho manual checkout

      // Xóa khách khỏi queue (KHÔNG dùng serveCustomer() vì nó cũng addMoney)
      customerStore.removeCustomerFromQueue(this.customerInstanceId)

      this.isSuccess = true

      // Đóng modal sau hiệu ứng success
      setTimeout(() => {
        this.closeCheckout()
      }, 1200)
    },
  },
})
```

---

## 4. Cập nhật `gameStore.ts`

Thêm 2 actions mới vào phần `actions` của `gameStore.ts`:

```typescript
// Trong gameStore.ts — thêm vào actions block

// --- Manual vs Auto Checkout ---

/**
 * Manual checkout dành riêng cho Player.
 * Mở CheckoutModal với thông tin khách đầu hàng đợi.
 */
openManualCheckout() {
  const customerStore = useCustomerStore()
  const { useCheckoutStore } = require('../store/checkoutStore') // lazy import

  if (customerStore.waitingQueue.length === 0) return

  const nextCustomer = customerStore.waitingQueue[0]
  const checkoutStore = useCheckoutStore()

  // Mở modal — KHÔNG xóa khách khỏi queue ngay
  // Queue sẽ được xóa trong checkoutStore.completeCheckout()
  checkoutStore.openCheckout(nextCustomer.price, nextCustomer.instanceId)
},

/**
 * Auto checkout dành cho Staff AI.
 * Chạy ngầm — KHÔNG mở bất kỳ UI nào.
 * Đây là hàm serveCustomer() hiện tại, đổi tên để tường minh hơn.
 */
processAutoCheckout() {
  return useCustomerStore().serveCustomer()
},
```

**Cập nhật `handlePlayerInteraction` trong `MainScene.ts`** (xem Mục 5).

---

## 5. Tích hợp Phaser — `MainScene.ts`

### Thay thế logic hiện tại trong `handlePlayerInteraction`

Tìm đoạn code xử lý cashier trong `MainScene.ts` và thay thế như sau:

```typescript
// Trong MainScene.ts → handlePlayerInteraction()

// ── Ưu tiên 2: Thanh toán tại quầy (PLAYER MANUAL) ──
const CASHIER_INTERACT_RADIUS = 80 // px
let nearestCashier = this.getNearestFromGroup(this.furnitureManager.cashierGroup, CASHIER_INTERACT_RADIUS)

if (nearestCashier && store.waitingCustomers > 0) {
  // Import lazy trong Phaser context để tránh circular dep
  const { useCheckoutStore } = await import('../features/inventory/store/checkoutStore')
  const checkoutStore = useCheckoutStore()

  // Chỉ mở nếu chưa có checkout đang mở
  if (!checkoutStore.isOpen) {
    store.openManualCheckout()
  }
  return
}
```

### Bảo vệ Auto-Checkout của Staff

Trong `handleAutoCheckout()`, thay `store.serveCustomer()` bằng:

```typescript
// Trong MainScene.ts → handleAutoCheckout()
// Chỉ auto-checkout nếu Player KHÔNG đang mở manual checkout modal
const { useCheckoutStore } = await import('../features/inventory/store/checkoutStore')
const checkoutStore = useCheckoutStore()

if (!checkoutStore.isOpen) {
  store.processAutoCheckout()  // Dùng alias mới
  this.lastAutoCheckoutTime = time
}
```

> **Lưu ý quan trọng:** Phaser chạy trong game loop synchronous. Import `checkoutStore` trong Phaser nên dùng singleton pattern như các store khác — gọi `useCheckoutStore()` trực tiếp (Pinia singleton đã được init trong Vue app). Không cần `await import` nếu đã import ở đầu file.

### Proximity Detection Helper (đã có trong `getNearestFromGroup`)

Code hiện tại đã đủ. Chỉ cần điều chỉnh radius:

```typescript
// Cashier interaction radius lớn hơn shelf (dễ tương tác hơn)
const CASHIER_RADIUS = 80
const SHELF_RADIUS   = 70
```

---

## 6. Kiến trúc Vue UI — Cấu trúc Component

### Cây Component

```
CheckoutModal.vue         ← Container chính, overlay toàn màn hình
├── MonitorDisplay.vue    ← Màn hình hiển thị: Total, Received, Change, Giving
├── CashRegister.vue      ← Khay tiền (chỉ render khi paymentMethod === 'CASH')
└── CreditCardPOS.vue     ← Máy POS (chỉ render khi paymentMethod === 'CARD')
```

### Layout tổng thể (Góc nhìn thu ngân)

```
┌────────────────────────────────────────────────────────────┐
│                    CHECKOUT STATION                         │
│  ┌────────────────────┐    ┌──────────────────────────────┐│
│  │   MONITOR DISPLAY  │    │  CASH REGISTER / POS MACHINE ││
│  │                    │    │                              ││
│  │  TOTAL:  $56.25    │    │  [Bills: $50 $20 $10 $5 $1]  ││
│  │  RECEIVED: $80.00  │    │  [Coins: 50¢ 25¢ 10¢ 5¢ 1¢]  ││
│  │  CHANGE:  $23.75   │    │                              ││
│  │  GIVING:  $0.00    │    │  [Auto-Fill]  [Clear]        ││
│  │                    │    │                              ││
│  │  [Customer: 3 wait]│    │  ──────────── OK ──────────  ││
│  └────────────────────┘    └──────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

---

## 7. Component `CheckoutModal.vue`

**Vị trí:** `src/features/inventory/components/CheckoutModal.vue`

```vue
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useCheckoutStore } from '../store/checkoutStore'
import CashRegister from './CashRegister.vue'
import CreditCardPOS from './CreditCardPOS.vue'

const checkoutStore = useCheckoutStore()

// Phát âm thanh khi thành công
watch(() => checkoutStore.isSuccess, (val) => {
  if (val) playChaChingSound()
})

// Cha-ching sound synthesized via Web Audio API (không cần file âm thanh)
function playChaChingSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()

    // Tiếng "cha": noise burst ngắn
    const bufferSize = ctx.sampleRate * 0.05
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    }
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.3, ctx.currentTime)
    noise.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noise.start()

    // Tiếng "ching": tone cao
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1800, ctx.currentTime + 0.05)
    osc.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.15)
    const oscGain = ctx.createGain()
    oscGain.gain.setValueAtTime(0.4, ctx.currentTime + 0.05)
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.connect(oscGain)
    oscGain.connect(ctx.destination)
    osc.start(ctx.currentTime + 0.05)
    osc.stop(ctx.currentTime + 0.5)
  } catch (_) {
    // Âm thanh là optional — không crash nếu không được phép
  }
}

const customerCount = computed(() => {
  const { useCustomerStore } = require('../../customer/store/customerStore')
  return useCustomerStore().waitingCustomers
})
</script>

<template>
  <Teleport to="body">
    <Transition name="checkout-slide">
      <div
        v-if="checkoutStore.isOpen"
        class="checkout-overlay"
        :class="{ 'checkout-success': checkoutStore.isSuccess }"
      >
        <!-- Header Bar -->
        <div class="checkout-header">
          <div class="checkout-header-left">
            <span class="checkout-icon">🏪</span>
            <h2 class="checkout-title">CHECKOUT STATION</h2>
            <span class="checkout-method-badge" :class="checkoutStore.paymentMethod?.toLowerCase()">
              {{ checkoutStore.paymentMethod === 'CASH' ? '💵 Cash' : '💳 Card' }}
            </span>
          </div>
          <div class="checkout-header-right">
            <span class="queue-indicator">
              👥 {{ customerCount }} in queue
            </span>
          </div>
        </div>

        <!-- Main Content -->
        <div class="checkout-body">
          <!-- Left: Monitor Display -->
          <div class="monitor-panel">
            <div class="monitor-screen">
              <div class="monitor-title">CASH REGISTER</div>

              <div class="monitor-row">
                <span class="monitor-label">TOTAL</span>
                <span class="monitor-value total">{{ checkoutStore.billTotalDisplay }}</span>
              </div>

              <div class="monitor-divider"></div>

              <div v-if="checkoutStore.paymentMethod === 'CASH'">
                <div class="monitor-row">
                  <span class="monitor-label">RECEIVED</span>
                  <span class="monitor-value received">{{ checkoutStore.cashGivenDisplay }}</span>
                </div>
                <div class="monitor-row">
                  <span class="monitor-label">CHANGE</span>
                  <span class="monitor-value change">{{ checkoutStore.changeOwedDisplay }}</span>
                </div>
                <div class="monitor-divider"></div>
                <div class="monitor-row">
                  <span class="monitor-label">GIVING</span>
                  <span
                    class="monitor-value giving"
                    :class="{
                      'giving-correct': checkoutStore.canConfirmCash,
                      'giving-over': checkoutStore.changePreparedCents > checkoutStore.changeOwedCents
                    }"
                  >
                    {{ checkoutStore.changePreparedDisplay }}
                  </span>
                </div>
                <div class="monitor-row remaining" v-if="!checkoutStore.canConfirmCash">
                  <span class="monitor-label">REMAINING</span>
                  <span class="monitor-value remaining-val">
                    ${{ (Math.max(0, checkoutStore.changeRemainingCents) / 100).toFixed(2) }}
                  </span>
                </div>
              </div>

              <div v-else>
                <div class="monitor-row">
                  <span class="monitor-label">CARD</span>
                  <span class="monitor-value received">Awaiting input...</span>
                </div>
                <div class="monitor-row">
                  <span class="monitor-label">ENTERED</span>
                  <span class="monitor-value change">
                    {{ checkoutStore.posInputString || '—' }}
                  </span>
                </div>
              </div>

              <!-- Success Flash -->
              <Transition name="success-flash">
                <div v-if="checkoutStore.isSuccess" class="success-overlay">
                  <span class="success-icon">✓</span>
                  <span class="success-text">PAYMENT COMPLETE</span>
                </div>
              </Transition>
            </div>

            <!-- Monitor stand -->
            <div class="monitor-stand"></div>
          </div>

          <!-- Right: Cash Register or POS -->
          <div class="payment-panel">
            <CashRegister v-if="checkoutStore.paymentMethod === 'CASH'" />
            <CreditCardPOS v-else-if="checkoutStore.paymentMethod === 'CARD'" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.checkout-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.92);
  backdrop-filter: blur(12px);
  font-family: 'Courier New', monospace;
}

.checkout-overlay.checkout-success {
  background: rgba(0, 30, 0, 0.95);
}

.checkout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 32px;
  background: linear-gradient(90deg, #1a2a1a, #0d1a0d);
  border-bottom: 2px solid #22c55e;
  flex-shrink: 0;
}

.checkout-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.checkout-icon { font-size: 1.5rem; }

.checkout-title {
  font-size: 1.4rem;
  font-weight: 900;
  color: #22c55e;
  letter-spacing: 0.3em;
  margin: 0;
  text-shadow: 0 0 20px rgba(34, 197, 94, 0.5);
}

.checkout-method-badge {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 700;
}
.checkout-method-badge.cash {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.4);
}
.checkout-method-badge.card {
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.4);
}

.queue-indicator {
  font-size: 0.85rem;
  color: #94a3b8;
}

.checkout-body {
  flex: 1;
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 0;
  overflow: hidden;
}

/* ── Monitor Panel ── */
.monitor-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: #0a0a0a;
  border-right: 2px solid #1a2a1a;
}

.monitor-screen {
  position: relative;
  width: 100%;
  background: #001200;
  border: 3px solid #333;
  border-radius: 8px;
  padding: 24px;
  box-shadow:
    inset 0 0 40px rgba(0, 0, 0, 0.8),
    0 0 30px rgba(34, 197, 94, 0.15),
    inset 0 0 0 1px rgba(34, 197, 94, 0.1);
  overflow: hidden;
}

.monitor-title {
  text-align: center;
  color: #16a34a;
  font-size: 0.75rem;
  letter-spacing: 0.4em;
  margin-bottom: 20px;
  opacity: 0.7;
}

.monitor-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 6px 0;
}

.monitor-label {
  font-size: 0.75rem;
  color: #4ade80;
  letter-spacing: 0.2em;
  opacity: 0.8;
}

.monitor-value {
  font-size: 1.5rem;
  font-weight: 900;
  letter-spacing: 0.05em;
}
.monitor-value.total    { color: #f0fdf4; }
.monitor-value.received { color: #86efac; }
.monitor-value.change   { color: #fbbf24; }
.monitor-value.giving   { color: #94a3b8; }
.monitor-value.giving.giving-correct { color: #4ade80; text-shadow: 0 0 10px rgba(74, 222, 128, 0.6); }
.monitor-value.giving.giving-over    { color: #ef4444; }
.monitor-value.remaining-val { color: #f87171; font-size: 1.1rem; }

.monitor-divider {
  height: 1px;
  background: rgba(74, 222, 128, 0.2);
  margin: 12px 0;
}

.success-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 50, 0, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.success-icon {
  font-size: 4rem;
  color: #4ade80;
  text-shadow: 0 0 30px rgba(74, 222, 128, 0.8);
}

.success-text {
  color: #4ade80;
  font-size: 1.2rem;
  letter-spacing: 0.3em;
  font-weight: 900;
}

.monitor-stand {
  width: 60px;
  height: 20px;
  background: #1a1a1a;
  border-radius: 0 0 8px 8px;
  border: 2px solid #333;
  border-top: none;
  margin-top: -2px;
}

/* ── Payment Panel ── */
.payment-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: linear-gradient(135deg, #0f0f0f, #1a1a1a);
}

/* ── Transitions ── */
.checkout-slide-enter-active,
.checkout-slide-leave-active { transition: all 0.3s ease; }
.checkout-slide-enter-from,
.checkout-slide-leave-to { opacity: 0; transform: translateY(40px); }

.success-flash-enter-active { transition: all 0.3s ease; }
.success-flash-enter-from   { opacity: 0; transform: scale(0.8); }
</style>
```

---

## 8. Component `CashRegister.vue`

**Vị trí:** `src/features/inventory/components/CashRegister.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useCheckoutStore, DENOMINATIONS } from '../store/checkoutStore'

const store = useCheckoutStore()

const notes = computed(() => DENOMINATIONS.filter(d => d.isNote))
const coins = computed(() => DENOMINATIONS.filter(d => !d.isNote))

// Số lượng mệnh giá đang được thối
const getCount = (denomCents: number): number => {
  return store.changeDenominations[denomCents] || 0
}

// Có thể thêm mệnh giá này không (không vượt quá changeOwed)
const canAdd = (denomCents: number): boolean => {
  return store.changePreparedCents + denomCents <= store.changeOwedCents
}
</script>

<template>
  <div class="cash-register">
    <div class="register-label">CASH DRAWER</div>

    <!-- Bills Section -->
    <div class="denom-section">
      <div class="section-label">BILLS</div>
      <div class="bills-row">
        <button
          v-for="denom in notes"
          :key="denom.labelCents"
          class="bill-btn"
          :class="{ 'can-add': canAdd(denom.labelCents), 'depleted': !canAdd(denom.labelCents) }"
          :disabled="!canAdd(denom.labelCents)"
          @click="store.addChangeDenomination(denom.labelCents)"
        >
          <div class="bill-visual">
            <span class="bill-value">{{ denom.display }}</span>
            <div class="bill-lines">
              <div></div><div></div><div></div>
            </div>
          </div>
          <span v-if="getCount(denom.labelCents) > 0" class="denom-count">
            ×{{ getCount(denom.labelCents) }}
          </span>
        </button>
      </div>
    </div>

    <!-- Coins Section -->
    <div class="denom-section">
      <div class="section-label">COINS</div>
      <div class="coins-row">
        <button
          v-for="denom in coins"
          :key="denom.labelCents"
          class="coin-btn"
          :class="{ 'can-add': canAdd(denom.labelCents), 'depleted': !canAdd(denom.labelCents) }"
          :disabled="!canAdd(denom.labelCents)"
          @click="store.addChangeDenomination(denom.labelCents)"
        >
          <span class="coin-value">{{ denom.display }}</span>
          <span v-if="getCount(denom.labelCents) > 0" class="denom-count">
            ×{{ getCount(denom.labelCents) }}
          </span>
        </button>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="register-actions">
      <button class="action-btn auto-fill" @click="store.autoFillChange()">
        ⚡ Auto-Fill
      </button>
      <button class="action-btn clear-btn" @click="store.clearChangeDenominations()">
        ✕ Clear
      </button>
    </div>

    <!-- Confirm Button -->
    <button
      class="confirm-btn"
      :class="{ 'confirm-ready': store.canConfirmCash }"
      :disabled="!store.canConfirmCash"
      @click="store.completeCheckout()"
    >
      <span class="confirm-icon">✓</span>
      <span>{{ store.canConfirmCash ? 'CONFIRM PAYMENT' : `NEED $${(Math.max(0, store.changeRemainingCents) / 100).toFixed(2)} MORE` }}</span>
    </button>
  </div>
</template>

<style scoped>
.cash-register {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 12px;
  width: 100%;
  max-width: 580px;
}

.register-label {
  text-align: center;
  color: #666;
  font-size: 0.7rem;
  letter-spacing: 0.4em;
  font-family: 'Courier New', monospace;
}

.denom-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 0.65rem;
  color: #555;
  letter-spacing: 0.3em;
  font-family: 'Courier New', monospace;
}

/* Bill buttons */
.bills-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.bill-btn {
  position: relative;
  flex: 1;
  min-width: 70px;
  height: 50px;
  border-radius: 6px;
  border: 2px solid #2d5a1b;
  background: linear-gradient(135deg, #1a3d0a, #2d5a1b);
  color: #86efac;
  cursor: pointer;
  transition: all 0.15s ease;
  overflow: hidden;
  padding: 4px;
}

.bill-btn.can-add:hover {
  border-color: #4ade80;
  background: linear-gradient(135deg, #2d5a1b, #166534);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(74, 222, 128, 0.3);
}

.bill-btn.depleted {
  opacity: 0.25;
  cursor: not-allowed;
  border-color: #1a1a1a;
}

.bill-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.bill-value {
  font-size: 0.95rem;
  font-weight: 900;
  font-family: 'Courier New', monospace;
}

.bill-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 60%;
  margin-top: 2px;
}

.bill-lines div {
  height: 1px;
  background: rgba(134, 239, 172, 0.3);
}

/* Coin buttons */
.coins-row {
  display: flex;
  gap: 10px;
}

.coin-btn {
  position: relative;
  flex: 1;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 2px solid #78350f;
  background: radial-gradient(circle at 35% 35%, #fbbf24, #92400e);
  color: #fef3c7;
  font-size: 0.7rem;
  font-weight: 900;
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'Courier New', monospace;
  display: flex;
  align-items: center;
  justify-content: center;
}

.coin-btn.can-add:hover {
  transform: scale(1.12);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.5);
}

.coin-btn.depleted {
  opacity: 0.25;
  cursor: not-allowed;
}

/* Count badge */
.denom-count {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #ef4444;
  color: white;
  font-size: 0.6rem;
  font-weight: 900;
  padding: 1px 4px;
  border-radius: 999px;
  border: 1px solid #1a1a1a;
  z-index: 10;
  font-family: 'Courier New', monospace;
}

/* Action buttons */
.register-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  border: none;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.05em;
}

.auto-fill {
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.3);
}
.auto-fill:hover { background: rgba(99, 102, 241, 0.35); }

.clear-btn {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.2);
}
.clear-btn:hover { background: rgba(239, 68, 68, 0.2); }

/* Confirm button */
.confirm-btn {
  width: 100%;
  padding: 16px;
  border-radius: 8px;
  border: 2px solid #333;
  background: #1a1a1a;
  color: #555;
  font-size: 1rem;
  font-weight: 900;
  cursor: not-allowed;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  letter-spacing: 0.1em;
  font-family: 'Courier New', monospace;
}

.confirm-btn.confirm-ready {
  background: linear-gradient(135deg, #14532d, #166534);
  border-color: #4ade80;
  color: #4ade80;
  cursor: pointer;
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.25);
  animation: pulse-green 1.5s infinite;
}

.confirm-btn.confirm-ready:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 24px rgba(74, 222, 128, 0.4);
}

.confirm-icon { font-size: 1.2rem; }

@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 20px rgba(74, 222, 128, 0.25); }
  50%       { box-shadow: 0 0 35px rgba(74, 222, 128, 0.5); }
}
</style>
```

---

## 9. Component `CreditCardPOS.vue`

**Vị trí:** `src/features/inventory/components/CreditCardPOS.vue`

```vue
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
```

---

## 10. Tích hợp vào `App.vue`

Thêm import và component vào `App.vue`:

```typescript
// App.vue — thêm vào imports
import CheckoutModal from './features/inventory/components/CheckoutModal.vue'
import { useCheckoutStore } from './features/inventory/store/checkoutStore'

const checkoutStore = useCheckoutStore()
```

```html
<!-- App.vue — thêm vào template (sau CartSidebar) -->
<CheckoutModal />
```

---

## 11. Luồng hoàn chỉnh từ đầu đến cuối

### Scenario A: Thanh toán tiền mặt

```
1. Player đi đến cashier_desk, bấm [E]
2. MainScene.handlePlayerInteraction() gọi store.openManualCheckout()
3. gameStore lấy nextCustomer.price = 56.25, instanceId = "npc_xxx"
4. checkoutStore.openCheckout(56.25, "npc_xxx")
   - billTotalCents = 5625
   - paymentMethod = 'CASH' (random)
   - cashGivenCents = 8000 (khách đưa $80)
   - changeOwedCents = 2375 ($23.75)
5. CheckoutModal render với CashRegister
6. Player bấm $20 → changePreparedCents = 2000
7. Player bấm $3 × $1 → changePreparedCents = 2300
8. Player bấm 2 × 25¢ + 2 × 10¢ + 1¢ = 75¢ → changePreparedCents = 2375
9. canConfirmCash = true → nút CONFIRM sáng lên
10. Player bấm CONFIRM
11. completeCheckout():
    - statsStore.addMoney(56.25)
    - customerStore.removeCustomerFromQueue("npc_xxx")
    - isSuccess = true → âm thanh cha-ching phát
12. Sau 1.2s → closeCheckout(), modal tắt
```

### Scenario B: Thanh toán thẻ

```
1-4. Giống trên, nhưng paymentMethod = 'CARD'
5. CheckoutModal render với CreditCardPOS
6. Player gõ "56.25" (keyboard hoặc virtual keypad)
7. canConfirmCard = true → nút ENTER sáng lên
8. Player bấm ENTER (hoặc phím Enter thật)
9. handleConfirm() → isProcessing = true (0.6s delay)
10. store.posConfirm() → completeCheckout()
11. Giống bước 11-12 trên
```

### Các edge case phải xử lý

| Edge Case | Xử lý |
|---|---|
| Player gõ số vượt quá bill (VD: 999.99) | `canConfirmCard` = false, nút vẫn disable |
| Player bấm tiền thối nhiều hơn cần | `addChangeDenomination()` reject silently |
| Staff đang auto-checkout cùng lúc | Guard `if (!checkoutStore.isOpen)` trong auto-checkout loop |
| Phaser nhận keyboard event khi POS đang mở | `{ capture: true }` + `event.stopPropagation()` |
| Khách hàng rời queue trước khi Player đến thanh toán | `completeCheckout()` check `customerInstanceId` còn trong queue không |

---

## 12. Checklist kiểm tra trước khi merge

### Logic & Store

- [ ] `toCents(0.1 + 0.2)` → `30`, không phải `29` hay `31`
- [ ] `autoFillChange()` với bill bất kỳ luôn cho `canConfirmCash = true`
- [ ] `posAppendChar('.')` lần 2 không có tác dụng
- [ ] `posConfirm()` với số sai flash đỏ rồi tự reset sau 800ms
- [ ] Đóng modal bằng `closeCheckout()` reset hoàn toàn state

### Phaser Integration

- [ ] Bấm `[E]` gần cashier không làm gì khi queue rỗng
- [ ] Auto-checkout của Staff không chạy khi modal đang mở
- [ ] Keyboard event không bubble lên Phaser khi POS đang focus

### UI

- [ ] Monitor hiển thị đúng GIVING tăng dần khi thêm tiền
- [ ] Nút CONFIRM Cash chỉ enable khi `changePreparedCents === changeOwedCents` (chính xác, không phải >=)
- [ ] Transition animation mượt khi mở/đóng modal
- [ ] Âm thanh cha-ching phát đúng thời điểm `isSuccess = true`

### Floating Point

- [ ] Bill $56.25 + Cash $80.00 → Change $23.75 hiển thị chính xác
- [ ] Bill $9.99 + Cash $10.00 → Change $0.01 (1 cent) đúng
- [ ] Bill $0.01 (minimum) không gây crash

---

*Blueprint hoàn thành. Junior Coder nên implement theo thứ tự: `checkoutStore.ts` → tích hợp Phaser → `CheckoutModal.vue` → `CashRegister.vue` → `CreditCardPOS.vue` → `App.vue`.*