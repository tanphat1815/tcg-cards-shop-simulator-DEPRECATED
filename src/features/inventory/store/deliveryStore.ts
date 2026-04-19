import { defineStore } from 'pinia'
import type { PendingDeliveryItem, SetPriceTarget } from '../types/delivery'

export const useDeliveryStore = defineStore('delivery', {
  state: () => ({
    /** Queue chờ spawn trong Phaser */
    pendingDeliveries: [] as PendingDeliveryItem[],
    /** Khi đang carry 1 thùng hàng */
    carriedBox: null as PendingDeliveryItem | null,
    /** Trigger mở SetPriceModal sau khi xếp hàng lên kệ */
    setPriceTarget: null as SetPriceTarget | null,
    /** Đánh dấu thùng hàng đã được tiêu thụ bởi UI (khi xếp hàng thủ công) */
    isCarriedBoxConsumed: false,
  }),

  actions: {
    /**
     * Gọi sau khi Cart checkout thành công.
     * Chuyển cartItems → pendingDeliveries để Phaser spawn.
     */
    scheduleDelivery(items: Array<{ itemId: string; name: string; type: string; quantity: number; imageUrl: string; sourceSetId?: string }>) {
      items.forEach(item => {
        // Mỗi đơn vị quantity → 1 delivery item (Phaser sẽ spawn nhiều box)
        this.pendingDeliveries.push({
          itemId: item.itemId,
          name: item.name,
          type: item.type as any,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
          sourceSetId: item.sourceSetId,
        })
      })
    },

    /** Phaser gọi để lấy và xoá khỏi queue */
    consumeDelivery(): PendingDeliveryItem | null {
      return this.pendingDeliveries.shift() ?? null
    },

    pickUpBox(item: PendingDeliveryItem) {
      this.carriedBox = item
    },

    dropBox() {
      this.carriedBox = null
    },

    openSetPrice(target: SetPriceTarget) {
      this.setPriceTarget = target
    },

    closeSetPrice() {
      this.setPriceTarget = null
    },

    /** UI gọi khi đã xếp hàng từ thùng thành công */
    consumeCarriedBox() {
      this.isCarriedBoxConsumed = true
    },
  },
})
