import { defineStore } from 'pinia'
import type { CartState } from '../types/cart'
import { getPackVisuals, getBoxVisuals } from '../config/assetRegistry'
import { useStatsStore } from '../../stats/store/statsStore'
import { useDeliveryStore } from './deliveryStore'

export const useCartStore = defineStore('cart', {
  state: (): CartState => ({
    items: [],
    isOpen: false,
    addModalItemId: null,
  }),

  getters: {
    totalItems: (state) => state.items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: (state) => state.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    itemCount: (state) => state.items.length,
  },

  actions: {
    openAddModal(itemId: string) {
      this.addModalItemId = itemId
    },
    closeAddModal() {
      this.addModalItemId = null
    },
    toggleCart() {
      this.isOpen = !this.isOpen
    },
    closeCart() {
      this.isOpen = false
    },

    addItem(shopItem: any, qty: number) {
      const existing = this.items.find(i => i.itemId === shopItem.id)
      if (existing) {
        existing.quantity += qty
        return
      }
      const imageUrl = shopItem.type === 'pack'
        ? getPackVisuals(shopItem.sourceSetId ?? shopItem.id).front
        : getBoxVisuals(shopItem.sourceSetId ?? shopItem.id).front

      this.items.push({
        itemId: shopItem.id,
        name: shopItem.name,
        type: shopItem.type,
        unitPrice: shopItem.buyPrice,
        sellPrice: shopItem.sellPrice,
        basePrice: shopItem.basePrice ?? shopItem.buyPrice,
        rarityBonusPercent: shopItem.rarityBonusPercent ?? 0,
        quantity: qty,
        imageUrl,
        sourceSetId: shopItem.sourceSetId,
      })
    },

    updateQuantity(itemId: string, delta: number) {
      const item = this.items.find(i => i.itemId === itemId)
      if (!item) return
      item.quantity = Math.max(0, item.quantity + delta)
      if (item.quantity === 0) this.removeItem(itemId)
    },

    removeItem(itemId: string) {
      this.items = this.items.filter(i => i.itemId !== itemId)
    },

    /**
     * Thực hiện thanh toán:
     * - KIỂM TRA đủ tiền.
     * - TRỪ TIỀN (statsStore.spendMoney).
     * - SCHEDULE giao hàng (deliveryStore).
     * - KHÔNG add thẳng vào inventoryStore.buyStock (Hàng phải giao mới có).
     */
    checkout(): { success: boolean; failedItems: string[] } {
      const statsStore = useStatsStore()
      const deliveryStore = useDeliveryStore()

      if (this.items.length === 0) return { success: false, failedItems: ['Giỏ hàng trống'] }

      const totalCost = this.subtotal
      if (statsStore.money < totalCost) {
        return { success: false, failedItems: ['Không đủ tiền'] }
      }

      // 1. Trừ tiền
      const ok = statsStore.spendMoney(totalCost)
      if (!ok) return { success: false, failedItems: ['Giao dịch tiền tệ thất bại'] }

      // 2. Chụp snapshot để giao hàng
      const snapshot = this.items.map(i => ({
        itemId: i.itemId,
        name: i.name,
        type: i.type,
        quantity: i.quantity,
        imageUrl: i.imageUrl,
        sourceSetId: i.sourceSetId,
      }))

      // 3. Đưa vào hàng chờ giao (Phaser sẽ spawn box)
      deliveryStore.scheduleDelivery(snapshot)

      // 4. Clear giỏ hàng
      this.items = []
      this.isOpen = false

      return { success: true, failedItems: [] }
    },
  },
})
