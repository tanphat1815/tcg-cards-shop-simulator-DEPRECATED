import { defineStore } from 'pinia'

export type HandItemType = 'pack' | 'box' | 'furniture'

export interface HandItem {
  itemId: string
  name: string
  type: HandItemType
  quantity: number          // Max 8 nếu type=pack, 1 nếu box hoặc furniture
  sourceBoxId?: string      // LiveBox instanceId nếu nhặt từ sàn
  furnitureId?: string      // FURNITURE_ITEMS key nếu type=furniture
}

export const usePlayerHandStore = defineStore('playerHand', {
  state: () => ({
    /** Vật phẩm đang cầm trên tay. null = tay không. */
    item: null as HandItem | null,
  }),

  getters: {
    isEmpty: (state) => state.item === null,
    isFull: (state) => {
      if (!state.item) return false
      if (state.item.type === 'pack') return state.item.quantity >= 8
      return true  // box hoặc furniture luôn là 1
    },
    canPickMorePacks: (state) => {
      if (!state.item) return true
      if (state.item.type !== 'pack') return false
      return state.item.quantity < 8
    }
  },

  actions: {
    /**
     * Nhặt hàng lên tay. Trả về false nếu tay đầy hoặc không khớp loại.
     * ATOMIC: Không bao giờ để tay có 2 loại hàng khác nhau.
     */
    pickup(item: HandItem): boolean {
      if (this.item === null) {
        this.item = { ...item }
        return true
      }

      // Chỉ được gom thêm nếu cùng itemId và là pack
      if (
        this.item.type === 'pack' &&
        item.type === 'pack' &&
        this.item.itemId === item.itemId
      ) {
        const canAdd = 8 - this.item.quantity
        const adding = Math.min(item.quantity, canAdd)
        if (adding <= 0) return false
        this.item.quantity += adding
        return true
      }

      return false  // Tay đang cầm thứ khác
    },

    /**
     * Đặt xuống một lượng nhất định. Trả về số lượng thực sự đã thả.
     */
    putDown(quantity: number): number {
      if (!this.item) return 0
      const actual = Math.min(quantity, this.item.quantity)
      this.item.quantity -= actual
      if (this.item.quantity <= 0) this.item = null
      return actual
    },

    /** Thả toàn bộ tay không (khi vứt xuống đất). */
    dropAll(): HandItem | null {
      const snapshot = this.item ? { ...this.item } : null
      this.item = null
      return snapshot
    },

    /** Load từ save (khi F5). */
    loadHand(parsed: any) {
      if (parsed && parsed.playerHand) {
        this.item = parsed.playerHand
      } else {
        this.item = null
      }
    }
  }
})
