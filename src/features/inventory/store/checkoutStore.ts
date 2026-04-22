import { defineStore } from 'pinia'
import { useCustomerStore } from '../../customer/store/customerStore'
import { useStatsStore } from '../../stats/store/statsStore'

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

      // Removed require - using top-level import to fix Vite crash


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
