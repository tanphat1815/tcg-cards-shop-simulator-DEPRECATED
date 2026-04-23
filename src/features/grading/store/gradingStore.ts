import { defineStore } from 'pinia'
import { useStatsStore } from '../../stats/store/statsStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import {
  GRADING_FEE, GRADING_DURATION_DAYS, GRADE_TABLE,
  type GradeProbabilityEntry
} from '../config'
import type { GradedCard, GradingPackage } from '../../inventory/types'

/** Thẻ đang được gửi đi chấm (trạng thái chờ) */
export interface PendingGradingItem {
  uid: string
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

    /** PC App state */
    showGradingApp: false,
  }),

  getters: {
    pendingCount: (state) => state.pendingGrading.length,
    totalSlabs: (state) => state.gradedBinder.length,
  },

  actions: {
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
        uid: `grad_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        cardId,
        sentOnDay: currentDay,
        returnOnDay: currentDay + GRADING_DURATION_DAYS,
      })

      return { success: true }
    },

    /**
     * Kiểm tra và xử lý các thẻ đã chấm xong.
     * → Gọi từ gameStore.startNewDay() SAU khi statsStore.startNewDay() đã increment currentDay.
     *
     * Mỗi thẻ đã tới ngày:
     *   1. RNG grade dựa vào GRADE_TABLE.prob
     *   2. Tạo GradedCard (slab) với slabId unique
     *   3. Gom các slab về cùng 1 GradingPackage (bưu kiện)
     */
    /**
     * Nhận một thẻ bài cụ thể: Chuyển nó từ pendingGrading sang bưu kiện vật lý.
     */
    claimGradingItem(uid: string) {
      const statsStore = useStatsStore()
      const idx = this.pendingGrading.findIndex(item => item.uid === uid)
      if (idx === -1) return

      const item = this.pendingGrading[idx]
      const currentDay = statsStore.currentDay

      // Xóa khỏi danh sách chờ
      this.pendingGrading.splice(idx, 1)

      // Tạo slab (kết quả chấm điểm)
      const slab = this._rollSlab(item, currentDay)

      const pkg: GradingPackage = {
        packageId: `grad_pkg_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        slabs: [slab],
        x: 0, y: 0,
      }
      this.pendingPackages.push(pkg)

      // Phát event cho Phaser spawn thùng hàng
      window.dispatchEvent(new CustomEvent('grading:package-arrived', {
        detail: { packageId: pkg.packageId }
      }))

      console.log(`[GradingStore] Item ${item.cardId} claimed and sent to delivery zone.`)
    },

    checkGradingStatus() {
      // Logic cũ bị xóa bỏ để nhường cho việc Nhận 1-1 qua claimGradingItem
    },

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

    /**
     * Tích hợp loadSave.
     */
    loadGradingState(parsed: any) {
      this.pendingGrading = parsed.gradingPending ?? []
      this.gradedBinder = parsed.gradedBinder ?? []
      this.pendingPackages = parsed.pendingPackages ?? []
      this.revealingSlab = null
      this.showRevealOverlay = false
      this.showGradingApp = false
    },

    setShowGradingApp(val: boolean) {
      this.showGradingApp = val
    }
  }
})
