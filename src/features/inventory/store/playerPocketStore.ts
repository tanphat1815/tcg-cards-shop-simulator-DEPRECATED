// src/features/inventory/store/playerPocketStore.ts
import { defineStore } from 'pinia'

export interface PocketEntry {
  itemId: string
  name: string
  type: 'pack' | 'box'
  quantity: number
  sourceSetId?: string
  imageUrl?: string
}

export const usePlayerPocketStore = defineStore('playerPocket', {
  state: () => ({
    /** Hàng hóa đang cầm trong tay / ba lô của Player
     *  Key: itemId, Value: PocketEntry */
    pocket: {} as Record<string, PocketEntry>,
    /** Flag hiển thị PocketModal */
    showPocketModal: false,
  }),

  getters: {
    isEmpty: (state) => Object.keys(state.pocket).length === 0,

    totalItems: (state) =>
      Object.values(state.pocket).reduce((sum, e) => sum + e.quantity, 0),

    pocketList: (state) => Object.values(state.pocket),
  },

  actions: {
    /**
     * Nhập hàng vào túi (gọi từ DeliveryManager khi Player bóc thùng).
     * Dùng itemId làm key để gộp cùng loại.
     */
    addToPocket(entry: Omit<PocketEntry, 'quantity'> & { quantity: number }) {
      if (this.pocket[entry.itemId]) {
        this.pocket[entry.itemId].quantity += entry.quantity
      } else {
        this.pocket[entry.itemId] = { ...entry }
      }
    },

    /**
     * Lấy hàng ra khỏi túi (gọi khi xếp lên kệ hoặc mở Pack).
     * @returns số lượng thực sự đã lấy (có thể ít hơn nếu không đủ)
     */
    removeFromPocket(itemId: string, quantity: number = 1): number {
      const entry = this.pocket[itemId]
      if (!entry) return 0

      const taken = Math.min(quantity, entry.quantity)
      entry.quantity -= taken
      if (entry.quantity <= 0) delete this.pocket[itemId]
      return taken
    },

    openPocketModal() { this.showPocketModal = true },
    closePocketModal() { this.showPocketModal = false },

    /** Load từ save */
    loadPocket(parsed: any) {
      this.pocket = parsed.playerPocket ?? {}
    },
  },
})
