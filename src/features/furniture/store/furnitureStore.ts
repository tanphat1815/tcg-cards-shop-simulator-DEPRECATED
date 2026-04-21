import { defineStore } from 'pinia'
import { FURNITURE_ITEMS } from '../config'
import { useStatsStore } from '../../stats/store/statsStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { useStaffStore } from '../../staff/store/staffStore'
import { useDeliveryStore } from '../../inventory/store/deliveryStore'
import type { ShelfData, PlayTableData, CashierData, ShelfTier, ShelfRole } from '../types'

/**
 * Tạo một tầng kệ hàng (Tier) trống.
 */
const createEmptyTier = (): ShelfTier => ({ itemId: null, slots: [], maxSlots: 0 })

/**
 * Khởi tạo dữ liệu cho một Kệ hàng (Shelf) mới.
 * Hỗ trợ phân loại role: 'selling' hoặc 'storage'.
 */
const createShelf = (id: string, furnitureId: string, x: number, y: number): ShelfData => {
  const config = FURNITURE_ITEMS[furnitureId]
  const numTiers = config?.numTiers || 3
  
  return {
    id,
    furnitureId,
    x,
    y,
    tiers: Array.from({ length: numTiers }, () => createEmptyTier()),
    role: (config?.role || 'selling') as ShelfRole
  }
}

/**
 * Khởi tạo dữ liệu cho một Bàn chơi bài (Play Table).
 */
const createPlayTable = (id: string, furnitureId: string, x: number, y: number, rotation: number = 0): PlayTableData => ({
  id,
  furnitureId,
  x: x,
  y: y,
  occupants: [null, null],
  matchStartedAt: null,
  rotation
})

/**
 * Khởi tạo dữ liệu cho Quầy thu ngân (Cashier).
 */
const createCashier = (id: string, furnitureId: string, x: number, y: number): CashierData => ({
  id,
  furnitureId,
  x,
  y
})

/**
 * FurnitureStore - Quản lý trang thiết bị và nội thất của cửa hàng.
 */
export const useFurnitureStore = defineStore('furniture', {
  state: () => ({
    /** Danh sách kệ hàng đang đặt trong shop */
    placedShelves: {} as Record<string, ShelfData>,
    /** Danh sách bàn chơi bài đang đặt */
    placedTables: {} as Record<string, PlayTableData>,
    /** Danh sách quầy thu ngân */
    placedCashiers: {
      'cashier_default': createCashier('cashier_default', 'cashier_desk', 1100, 1100)
    } as Record<string, CashierData>,
    /** Kho lưu trữ các món nội thất đã mua nhưng chưa đặt */
    purchasedFurniture: {} as Record<string, number>,
    
    // Trạng thái Logic Xây dựng
    isBuildMode: false,
    buildItemId: null as string | null,
    isEditMode: false,
    editFurnitureData: null as any, 
  }),

  getters: {
    totalPlacedFurniture: (state) => Object.keys(state.placedShelves).length + Object.keys(state.placedTables).length,
    availableFurnitureCount: (state) => (furnitureId: string) => state.purchasedFurniture[furnitureId] || 0,
  },

  actions: {
    /**
     * Xếp 1 món đồ từ kho hàng của shop vào 1 tầng của kệ.
     */
    moveToTierSlot(shelfId: string, itemId: string, tierIndex: number) {
      const inventoryStore = useInventoryStore()
      const shelf = this.placedShelves[shelfId]
      if (!shelf) return
      const itemData = inventoryStore.shopItems[itemId]
      if (!itemData) return
      
      // Fix NaN: Đảm bảo inventory không undefined
      const currentStock = inventoryStore.shopInventory[itemId] ?? 0
      if (currentStock <= 0) return

      const tier = shelf.tiers[tierIndex]
      const isBox = itemData.type === 'box'
      
      const shelfConfig = FURNITURE_ITEMS[shelf.furnitureId]
      const slotsPerTier = shelfConfig?.slotsPerTier || 16
      const maxSlots = isBox ? Math.floor(slotsPerTier / 4) : slotsPerTier

      if (tier.itemId === null) {
        tier.itemId = itemId
        tier.maxSlots = maxSlots
        tier.slots = []
      }
      
      if (tier.itemId !== itemId) return
      if (tier.slots.length >= tier.maxSlots) return

      tier.slots.push(itemId)
      inventoryStore.shopInventory[itemId] = (inventoryStore.shopInventory[itemId] ?? 1) - 1
      if (inventoryStore.shopInventory[itemId] === 0) delete inventoryStore.shopInventory[itemId]
    },

    /**
     * Tự động xếp đầy hàng vào một tầng kệ nếu kho còn đủ.
     */
    fillTier(shelfId: string, itemId: string, tierIndex: number) {
      const inventoryStore = useInventoryStore()
      const shelf = this.placedShelves[shelfId]
      if (!shelf) return
      const itemData = inventoryStore.shopItems[itemId]
      if (!itemData) return

      const tier = shelf.tiers[tierIndex]
      const isBox = itemData.type === 'box'
      
      const shelfConfig = FURNITURE_ITEMS[shelf.furnitureId]
      const slotsPerTier = shelfConfig?.slotsPerTier || 16
      const maxSlots = isBox ? Math.floor(slotsPerTier / 4) : slotsPerTier

      if (tier.itemId === null) {
        tier.itemId = itemId
        tier.maxSlots = maxSlots
        tier.slots = []
      }
      if (tier.itemId !== itemId) return

      const spaceLeft = tier.maxSlots - tier.slots.length
      const available = inventoryStore.shopInventory[itemId] ?? 0
      const toAdd = Math.min(spaceLeft, available)

      for (let i = 0; i < toAdd; i++) {
        tier.slots.push(itemId)
      }
      
      // Fix NaN: Gán lại giá trị an toàn
      inventoryStore.shopInventory[itemId] = (inventoryStore.shopInventory[itemId] ?? toAdd) - toAdd
      if (inventoryStore.shopInventory[itemId] <= 0) delete inventoryStore.shopInventory[itemId]
    },

    /**
     * Đặt hàng từ "Trên Tay" vào kệ.
     */
    fillTierFromHand(shelfId: string, itemId: string, tierIndex: number, quantity: number): number {
      const inventoryStore = useInventoryStore()
      const shelf = this.placedShelves[shelfId]
      if (!shelf) return 0
      const itemData = inventoryStore.shopItems[itemId]
      if (!itemData) return 0

      const tier = shelf.tiers[tierIndex]
      const isBox = itemData.type === 'box'
      const shelfConfig = FURNITURE_ITEMS[shelf.furnitureId]
      const slotsPerTier = shelfConfig?.slotsPerTier || 16
      const maxSlots = isBox ? Math.floor(slotsPerTier / 4) : slotsPerTier

      if (tier.itemId === null) {
        tier.itemId = itemId
        tier.maxSlots = maxSlots
        tier.slots = []
      } else if (tier.itemId !== itemId) {
        return 0
      }

      const spaceLeft = tier.maxSlots - tier.slots.length
      const toAdd = Math.min(spaceLeft, quantity)

      for (let i = 0; i < toAdd; i++) {
        tier.slots.push(itemId)
      }
      return toAdd
    },

    /**
     * Thu hồi toàn bộ hàng từ một tầng kệ về kho.
     */
    clearTier(shelfId: string, tierIndex: number) {
      const inventoryStore = useInventoryStore()
      const shelf = this.placedShelves[shelfId]
      if (!shelf) return
      const tier = shelf.tiers[tierIndex]
      if (!tier.itemId) return

      if (!inventoryStore.shopInventory[tier.itemId]) inventoryStore.shopInventory[tier.itemId] = 0
      inventoryStore.shopInventory[tier.itemId] += tier.slots.length
      
      tier.itemId = null
      tier.slots = []
      tier.maxSlots = 0
    },

    clearEntireShelf(shelfId: string) {
      const shelf = this.placedShelves[shelfId]
      if (!shelf) return
      shelf.tiers.forEach((_, i) => this.clearTier(shelf.id, i))
    },

    /**
     * Lấy 1 món đồ từ kệ (không trả về inventory, chỉ pop khỏi slots).
     * Trả về itemId nếu lấy thành công.
     */
    takeItemFromTierSimple(shelfId: string, tierIndex: number): string | null {
      const shelf = this.placedShelves[shelfId]
      if (!shelf) return null

      const tier = shelf.tiers[tierIndex]
      if (!tier.itemId || tier.slots.length === 0) return null

      const itemId = tier.itemId
      tier.slots.pop()

      // Nếu tầng trống hẳn thì xóa luôn itemId
      if (tier.slots.length === 0) {
        tier.itemId = null
        tier.maxSlots = 0
      }
      return itemId
    },

    /**
     * Lấy 1 món đồ từ kệ trả về kho hàng (Legacy/Accounting).
     */
    takeItemFromTier(shelfId: string, tierIndex: number) {
      const inventoryStore = useInventoryStore()
      const itemId = this.takeItemFromTierSimple(shelfId, tierIndex)
      if (!itemId) return

      // Trả lại vào kho
      if (!inventoryStore.shopInventory[itemId]) inventoryStore.shopInventory[itemId] = 0
      inventoryStore.shopInventory[itemId]++
    },

    /**
     * Logic NPC lấy sản phẩm.
     * NPCs chỉ mua từ kệ bán hàng (selling).
     */
    npcTakeItemFromSlot(shelfId: string) {
      const shelf = this.placedShelves[shelfId]
      if (!shelf) return null

      // NPCs chỉ mua từ kệ bán hàng (selling)
      if (shelf.role === 'storage') return null

      const filledTiers = shelf.tiers.map((t, idx) => ({ t, idx })).filter(x => x.t.itemId && x.t.slots.length > 0)
      if (filledTiers.length === 0) return null

      const picked = filledTiers[Math.floor(Math.random() * filledTiers.length)]
      const tier = picked.t
      const itemId = tier.itemId!

      tier.slots.pop()
      if (tier.slots.length === 0) {
        tier.itemId = null
        tier.maxSlots = 0
      }

      const statsStore = useStatsStore()
      statsStore.dailyStats.itemsSold++
      return itemId
    },

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
      if (slotIndex >= tier.maxSlots || tier.slots[slotIndex] != null) {
        // Fallback: Nếu maxSlots chưa được set (kệ mới đặt)
        const config = FURNITURE_ITEMS[shelf.furnitureId]
        tier.maxSlots = config.slotsPerTier || 3
        if (tier.slots.length === 0) tier.slots = Array(tier.maxSlots).fill(null)
        if (slotIndex >= tier.maxSlots || tier.slots[slotIndex] != null) return false
      }

      // Init tier structure nếu chưa
      if (!tier.customPriceMap) tier.customPriceMap = {}

      tier.slots[slotIndex] = cardId
      tier.itemId = cardId  // Thể hiện item chính trên tầng này
      tier.customPriceMap[cardId] = customPrice

      // Trừ khỏi binder
      inventoryStore.personalBinder[cardId]--
      if (inventoryStore.personalBinder[cardId] === 0) {
        delete inventoryStore.personalBinder[cardId]
      }
      return true
    },

    /**
     * NPC vãng lai xem 1 card trên display_case để cân nhắc mua.
     * Trả về thông tin card nhưng KHÔNG xóa khỏi tủ.
     */
    npcPeekFromDisplayCase(shelfId: string): { cardId: string; price: number; tierIdx: number; slotIdx: number } | null {
      const shelf = this.placedShelves[shelfId]
      if (!shelf || shelf.role !== 'display_case') return null

      const occupied: { tierIdx: number; slotIdx: number; cardId: string }[] = []
      shelf.tiers.forEach((tier, tierIdx) => {
        tier.slots.forEach((card, slotIdx) => {
          if (card) occupied.push({ tierIdx, slotIdx, cardId: card })
        })
      })
      if (occupied.length === 0) return null

      const picked = occupied[Math.floor(Math.random() * occupied.length)]
      const tier = shelf.tiers[picked.tierIdx]
      const price = tier.customPriceMap?.[picked.cardId] ?? 0

      return { price, ...picked }
    },

    /**
     * NPC chốt mua card sau khi đã peek. Xóa card khỏi tủ.
     */
    npcCommitBuyFromDisplayCase(shelfId: string, tierIdx: number, slotIdx: number, cardId: string) {
      const shelf = this.placedShelves[shelfId]
      if (!shelf) return

      const tier = shelf.tiers[tierIdx]
      if (tier.slots[slotIdx] !== cardId) return

      tier.slots[slotIdx] = null
      if (tier.customPriceMap) delete tier.customPriceMap[cardId]

      if (tier.slots.every(s => s === null)) {
        tier.itemId = null
      }
    },

    /**
     * NPC vãng lai mua 1 card trên display_case (Legacy / Auto-commit).
     */
    npcBuyFromDisplayCase(shelfId: string): { cardId: string; price: number } | null {
      const peeked = this.npcPeekFromDisplayCase(shelfId)
      if (!peeked) return null

      this.npcCommitBuyFromDisplayCase(shelfId, peeked.tierIdx, peeked.slotIdx, peeked.cardId)
      return { cardId: peeked.cardId, price: peeked.price }
    },

    /**
     * Mua furniture từ cửa hàng Online.
     */
    buyFurniture(furnitureId: string) {
      const statsStore = useStatsStore()
      const deliveryStore = useDeliveryStore()
      const furnitureData = FURNITURE_ITEMS[furnitureId]
      if (!furnitureData) return false

      if (!statsStore.spendMoney(furnitureData.buyPrice)) return false
      if (statsStore.level < furnitureData.requiredLevel) return false

      // Thay vì cộng trực tiếp, tạo đơn hàng vận chuyển
      deliveryStore.scheduleDelivery([{
        itemId: furnitureId,
        name: furnitureData.name,
        type: 'furniture',
        quantity: 1,
        imageUrl: '', // Sẽ dùng sprite/svg trong game
        furnitureId: furnitureId
      }])
      
      return true
    },

    startBuildMode(furnitureId: string) {
      this.buildItemId = furnitureId
      this.isBuildMode = true
    },

    cancelBuildMode() {
      this.isBuildMode = false
      this.buildItemId = null
    },

    /**
     * Đặt nội thất xuống bản đồ.
     */
    placeFurniture(x: number, y: number, rotation: number = 0) {
      if (this.editFurnitureData) {
        const data = { ...this.editFurnitureData, x, y, rotation }
        if (data.type === 'shelf') {
          this.placedShelves[data.id] = data
        } else if (data.type === 'cashier') {
          this.placedCashiers[data.id] = data
        } else {
          this.placedTables[data.id] = data
        }
        this.editFurnitureData = null
        this.isBuildMode = false
        return data
      }

      const furnitureId = this.buildItemId
      if (!furnitureId) return null

      let placedData = null
      if (furnitureId === 'play_table') {
        const id = 'table_' + Date.now()
        placedData = createPlayTable(id, furnitureId, x, y, rotation)
        this.placedTables[id] = placedData
      } else if (furnitureId === 'cashier_desk') {
        const id = 'cashier_' + Date.now()
        placedData = createCashier(id, furnitureId, x, y)
        this.placedCashiers[id] = placedData
      } else {
        const id = 'shelf_' + Date.now()
        placedData = createShelf(id, furnitureId, x, y)
        this.placedShelves[id] = placedData
      }

      if (this.purchasedFurniture[furnitureId] > 0) {
        this.purchasedFurniture[furnitureId]--
        if (this.purchasedFurniture[furnitureId] === 0) {
          delete this.purchasedFurniture[furnitureId]
        }
      }

      this.cancelBuildMode()
      return placedData
    },

    toggleEditMode() {
      this.isEditMode = !this.isEditMode
      if (!this.isEditMode) {
        this.editFurnitureData = null
      }
    },

    pickUpFurniture(instanceId: string, type: 'shelf' | 'table' | 'cashier') {
      if (type === 'shelf') {
        const data = this.placedShelves[instanceId]
        if (data) {
          this.editFurnitureData = { ...data, type: 'shelf' }
          delete this.placedShelves[instanceId]
          this.isBuildMode = true
          return true
        }
      } else if (type === 'table') {
        const data = this.placedTables[instanceId]
        if (data) {
          this.editFurnitureData = { ...data, type: 'table' }
          delete this.placedTables[instanceId]
          this.isBuildMode = true
          return true
        }
      } else if (type === 'cashier') {
        const data = this.placedCashiers[instanceId]
        if (data) {
          this.editFurnitureData = { ...data, type: 'cashier' }
          delete this.placedCashiers[instanceId]
          this.isBuildMode = true
          return true
        }
      }
      return false
    },

    warehouseFurniture() {
      const inventoryStore = useInventoryStore()
      if (!this.editFurnitureData) return

      const data = this.editFurnitureData
      const furnitureId = data.furnitureId

      if (data.type === 'shelf' && data.tiers) {
        data.tiers.forEach((tier: any) => {
          tier.slots.forEach((itemId: string | null) => {
            if (itemId) {
              inventoryStore.shopInventory[itemId] = (inventoryStore.shopInventory[itemId] || 0) + 1
            }
          })
        })
      }

      this.purchasedFurniture[furnitureId] = (this.purchasedFurniture[furnitureId] || 0) + 1
      this.editFurnitureData = null
      this.isBuildMode = false
      this.buildItemId = null

      if (data.type === 'cashier') {
        const staffStore = useStaffStore()
        staffStore.hiredWorkers.forEach((worker: any) => {
          if (worker.targetDeskId === data.id) {
            staffStore.changeWorkerDuty(worker.instanceId, 'NONE')
          }
        })
      }
    },

    joinTable(tableId: string, instanceId: string): number | null {
      const table = this.placedTables[tableId]
      if (!table) return null

      const seatIndex = table.occupants.indexOf(null)
      if (seatIndex !== -1) {
        table.occupants[seatIndex] = instanceId
        return seatIndex
      }
      return null
    },

    startMatch(tableId: string) {
       const table = this.placedTables[tableId]
       if (table && table.occupants.every(o => o !== null)) {
         table.matchStartedAt = Date.now()
       }
    },

    finishMatch(tableId: string) {
       const table = this.placedTables[tableId]
       if (table) {
         table.matchStartedAt = null
       }
    },

    /**
     * Khôi phục thiết bị từ bản lưu.
     */
    loadFurniture(parsed: any) {
      if (parsed.purchasedFurniture) this.purchasedFurniture = parsed.purchasedFurniture
      if (parsed.placedTables) this.placedTables = parsed.placedTables
      
      if (parsed.placedCashiers) {
        this.placedCashiers = parsed.placedCashiers
      } else if (parsed.cashierPosition) {
        const pos = parsed.cashierPosition
        this.placedCashiers = {
          'cashier_default': createCashier('cashier_default', 'cashier_desk', pos.x, pos.y)
        }
      }

      if (parsed.placedShelves) {
        this.placedShelves = parsed.placedShelves
        Object.values(this.placedShelves).forEach((shelf: any) => {
          if (!shelf.role) {
            shelf.role = 'selling';
          }
        });
      }

      const migratePos = (items: Record<string, any>) => {
        Object.values(items).forEach(item => {
          if (item.x < 1000) {
            item.x += 1000
            item.y += 1000
          }
        })
      }

      if (this.placedShelves) migratePos(this.placedShelves)
      if (this.placedTables) migratePos(this.placedTables)
      if (this.placedCashiers) migratePos(this.placedCashiers)
    }
  }
})
