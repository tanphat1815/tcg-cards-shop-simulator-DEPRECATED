import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { STOCK_ITEMS } from '../config'
import type { StockItemInfo } from '../config'
import { XP_REWARDS } from '../../stats/config'
import { useStatsStore } from '../../stats/store/statsStore'
import { useApiStore } from './apiStore'
import { useGameStore } from '../../shop-ui/store/gameStore'

import { usePlayerPocketStore } from './playerPocketStore'
import { dbService } from '../../api/services/dbService'
import { processCardRow } from './apiStore'

/**
 * InventoryStore - Quản lý dòng chảy hàng hóa và bộ sưu tập thẻ bài.
 * 
 * Các trách nhiệm chính:
 * - Kho hàng (Shop Inventory): Lưu trữ các vật phẩm thương mại (Box, Pack) chờ xếp lên kệ.
 * - Sưu tập (Personal Binder): Lưu trữ các thẻ bài cá nhân mà người chơi sở hữu sau khi xé pack.
 * - Gacha Mechanics: Xử lý logic xé thẻ (tearPack) với tỷ lệ hiếm (Rarity) khác nhau.
 * - Chuyển đổi hàng hóa: Logic khui thùng (unboxItem) để chia nhỏ thùng hàng thành các pack lẻ.
 */
export const useInventoryStore = defineStore('inventory', {
  state: () => ({
    /** Hàng hóa thương mại có trong kho: itemId -> số lượng */
    shopInventory: {} as Record<string, number>, 
    /** Bộ sưu tập thẻ bài cá nhân: cardId -> số lượng */
    personalBinder: {} as Record<string, number>, 
    /** Cấu hình các loại mặt hàng có thể nhập về */
    shopItems: markRaw(STOCK_ITEMS),
    
    // Trạng thái Gacha UI
    isOpeningPack: false,
    /** Danh sách thẻ bài vừa nhận được từ việc xé pack */
    currentPack: [] as any[],
    /** Lưu trữ pack cuối cùng đã xé để debug */
    lastPackPulled: [] as any[], 

    /** Phase của UI mở pack: 'idle' | 'pack_visible' | 'cards_visible' */
    packPhase: 'idle' as 'idle' | 'pack_visible' | 'cards_visible',

    /** ID của pack đang được hiển thị (để lấy ảnh booster) */
    currentPackId: null as string | null,
    /** ID của set đang được hiển thị */
    currentPackSetId: null as string | null,
  }),
  actions: {
    /**
     * Nhập hàng vào kho của shop.
     * @param itemId ID mặt hàng cần mua.
     * @param amount Số lượng nhập về.
     */
    buyStock(itemId: string, amount: number = 1) {
      const statsStore = useStatsStore()
      const itemData = this.shopItems[itemId]
      if (!itemData) return false

      const totalCost = itemData.buyPrice * amount
      if (!statsStore.spendMoney(totalCost)) return false
      if (statsStore.level < itemData.requiredLevel) return false

      if (!this.shopInventory[itemId]) this.shopInventory[itemId] = 0
      this.shopInventory[itemId] += amount
      return true
    },

    /**
     * Thêm bộ dữ liệu Shop mới vào danh sách shopItems hiện có.
     */
    mergeShopItems(shopItems: Record<string, StockItemInfo>) {
      this.shopItems = markRaw({
        ...STOCK_ITEMS,
        ...shopItems
      })
    },

    /**
     * Khui một thùng hàng (Box) để lấy các gói nhỏ (Pack) bên trong.
     * Thường dùng khi người chơi muốn xé pack thẻ bài lẻ từ một thùng hàng vừa nhập.
     */
    unboxItem(boxId: string) {
      const box = this.shopItems[boxId]
      if (!box || box.type !== 'box' || !box.contains) return

      const currentQty = this.shopInventory[boxId] || 0
      if (currentQty > 0) {
         this.shopInventory[boxId]--
         if (this.shopInventory[boxId] <= 0) delete this.shopInventory[boxId]

         const innerId = box.contains.itemId
         const innerAmount = box.contains.amount

         // Initialize inner inventory if not exists
         if (this.shopInventory[innerId] === undefined || this.shopInventory[innerId] === null) {
           this.shopInventory[innerId] = 0
         }
         this.shopInventory[innerId] += innerAmount
      }
    },

    /**
     * Logic "Xé Pack" (Gacha): 
     * - Trừ 1 pack từ kho hàng.
     * - Tính toán ngẫu nhiên 6 lá bài dựa trên trọng số hiếm (Weights) từ API TCGdex.
     * - Thêm bài vào Binder cá nhân và thưởng XP cho người chơi.
     * OPTIMIZATION: Chỉ load random cards thay vì toàn bộ set
     */
    async tearPack(packId: string) {
      const statsStore = useStatsStore()
      const apiStore = useApiStore()

      if (!this.shopInventory[packId] || this.shopInventory[packId] <= 0) return

      const packItem = apiStore.shopItems[packId]
      if (!packItem) {
        console.error(`Pack item not found: ${packId}`)
        return
      }

      const setId = packItem.sourceSetId || packId.replace('pack_', '')

      // --- UI IMPROVEMENT: Hiện Pack ngay lập tức để người dùng thấy animation rung ---
      this.currentPack = [] // Clear old cards
      this.currentPackId = packId
      this.currentPackSetId = setId
      this.isOpeningPack = true
      this.packPhase = 'pack_visible'

      // Bắt đầu fetch dữ liệu ngầm
      const randomCardsResult = await apiStore.getWeightedRandomCardsFromSet(setId, 6)

      if (!randomCardsResult || randomCardsResult.length === 0) {
        console.error('Failed to get random cards from set:', setId)
        this.isOpeningPack = false // Revert UI
        return
      }

      // --- RARITY SORT: Đảm bảo thẻ hiếm nhất luôn ở VỊ TRÍ CUỐI (index 5) ---
      const RARITY_RANK: Record<string, number> = {
        'Ghost Rare': 10,
        'Hyper Secret Rare': 9,
        'Mega Secret Rare': 9,
        'Special Illustration Rare': 8,
        'Illustration Rare': 7,
        'Secret Rare': 6,
        'Ultra Rare': 5,
        'Double Rare': 4,
        'Rare Holo': 3,
        'Rare': 3,
        'Uncommon': 1,
        'Common': 0,
        'None': 0,
      }

      const getRarityRank = (card: any): number => {
        const rarity = card.rarity || 'None'
        return RARITY_RANK[rarity] ?? (rarity.includes('Rare') ? 2 : 0)
      }

      // Tách thẻ hiếm nhất ra, đặt ở cuối
      let sortedCards = [...randomCardsResult]
      sortedCards.sort((a, b) => getRarityRank(a) - getRarityRank(b))

      // Trừ kho hàng
      this.shopInventory[packId]--
      if (this.shopInventory[packId] === 0) delete this.shopInventory[packId]

      // --- LƯU ĐẦY ĐỦ dữ liệu vào personalBinder ---
      for (const card of sortedCards) {
        if (!this.personalBinder[card.id]) {
          this.personalBinder[card.id] = 0
        }
        this.personalBinder[card.id]++

        // Thưởng XP dựa trên độ thực (giờ đã có detail nên rank sẽ chính xác)
        const rank = getRarityRank(card)
        if (rank >= 3) { // Rare trở lên
          statsStore.gainExp(XP_REWARDS.OPEN_PACK_RARE)
        } else {
          statsStore.gainExp(XP_REWARDS.OPEN_PACK_COMMON)
        }
      }

      // Cập nhật state đã có data đầy đủ
      const finalCards = markRaw(sortedCards)
      this.lastPackPulled = finalCards
      this.currentPack = finalCards
    },

    /**
     * Chuyển từ Phase 1 (Hiện Pack) sang Phase 2 (Hiện thẻ úp mặt)
     * Được gọi khi người dùng click vào ảnh Pack
     */
    revealCards() {
      this.packPhase = 'cards_visible'
    },

    /**
     * Dọn dẹp trạng thái sau khi người chơi xem xong các lá bài vừa mở.
     */
    closePackOpening() {
      this.isOpeningPack = false
      this.currentPack = []
      this.packPhase = 'idle'
      this.currentPackId = null

      const gameStore = useGameStore()
      gameStore.saveGame()
    },

    loadInventory(parsed: any) {
      // Removed require - using top-level import to fix Vite crash
      const pocketStore = usePlayerPocketStore()

      this.shopInventory = parsed.shopInventory ?? {}
      this.personalBinder = parsed.personalBinder ?? {}

      // MIGRATION: Chuyển toàn bộ shopInventory (kho ảo cũ) vào Túi Ba Lô (Pocket)
      Object.keys(this.shopInventory).forEach(itemId => {
        const qty = this.shopInventory[itemId]
        if (qty > 0) {
          const itemData = this.shopItems[itemId]
          pocketStore.addToPocket({
            itemId,
            name: itemData?.name ?? itemId,
            type: (itemData?.type as any) || (itemId.startsWith('box_') ? 'box' : 'pack'),
            quantity: qty,
            sourceSetId: itemData?.sourceSetId
          })
        }
      })
      // Xoá sạch kho ảo sau khi migrate
      this.shopInventory = {}
    },

    /**
     * [DEV MODE ONLY] Lấy card ngẫu nhiên theo tiêu chí và thêm trực tiếp vào Binder.
     */
    async getRandomCardsByCriteria(criteria: { type?: string, rarity?: string, subtype?: string }, count: number = 10) {
      const apiStore = useApiStore()
      let query = 'SELECT * FROM cards'
      const conditions: string[] = []
      const params: any[] = []

      if (criteria.type) {
        conditions.push('types LIKE ?')
        params.push(`%${criteria.type}%`)
      }
      if (criteria.rarity) {
        conditions.push('rarity = ?')
        params.push(criteria.rarity)
      }
      if (criteria.subtype) {
        conditions.push('(name LIKE ? OR rarity LIKE ?)')
        params.push(`%${criteria.subtype}%`)
        params.push(`%${criteria.subtype}%`)
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ')
      }

      query += ' ORDER BY RANDOM() LIMIT ?'
      params.push(count)

      try {
        const rows = await dbService.query(query, params)
        const cards = (rows || []).map(processCardRow)

        cards.forEach(card => {
          if (!this.personalBinder[card.id]) {
            this.personalBinder[card.id] = 0
          }
          this.personalBinder[card.id]++
          
          // Cache to flat map for UI lookup
          apiStore.flatCardMap[card.id] = markRaw(card)
        })

        return cards
      } catch (e) {
        console.error('[InventoryStore] DevMode card injection failed:', e)
        return []
      }
    }
  }
})