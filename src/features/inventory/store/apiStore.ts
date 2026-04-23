import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { useInventoryStore } from './inventoryStore'
import { type StockItemInfo, SET_BLACKLIST, MARKUP_PACK, MARKUP_BOX } from '../config'
import { dbService } from '../../api/services/dbService'
import { FALLBACK_SETS, FALLBACK_CARDS } from '../../api/config/fallbackData'
import { GAME_BALANCE } from '../../../config/gameConfig'

const API_CACHE_VERSION = 'v5-pricing'

const sanitizeId = (source: string) => source.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()

/**
 * Quy định Level mở khóa dựa trên Series ID chuẩn TCGdex
 */
const getRequiredLevel = (seriesId: string): number => {
  return GAME_BALANCE.TCGDEX.SERIES_LEVEL_REQUIRED[seriesId] || 80
}

/**
 * Ánh xạ Series ID sang Tên Thế hệ hiển thị
 */
const getGenerationName = (seriesId: string): string => {
  return GAME_BALANCE.TCGDEX.SERIES_GENERATION_NAMES[seriesId] || 'OTHER SERIES'
}

/**
 * Helper to safely parse JSON fields from SQLite
 */
export const processCardRow = (row: any) => {
  if (!row) return row
  const card = { ...row }
  
  // FIX: Chuẩn hóa retreatCost từ nhiều key có thể xuất hiện (SQLite có thể trả về key khác nhau)
  if (card.retreatCost === undefined || card.retreatCost === null) {
    card.retreatCost = row.retreat ?? row.retreat_cost ?? row.retreatcost ?? 0
  }
  // Đảm bảo là number, không phải string để v-for hoạt động đúng
  card.retreatCost = parseInt(String(card.retreatCost ?? 0), 10) || 0

  // Parse các trường JSON thô từ SQLite
  const jsonFields = ['types', 'subtypes', 'attacks', 'abilities', 'weaknesses', 'resistances', 'pricing']
  jsonFields.forEach(field => {
    if (typeof card[field] === 'string' && card[field].trim() !== '') {
      try {
        card[field] = JSON.parse(card[field])
      } catch (e) {
        // Fallback: Trả về mảng rỗng hoặc null tùy trường
        card[field] = ['types', 'attacks', 'abilities', 'weaknesses', 'resistances'].includes(field) ? [] : null
      }
    }
  })

  return card
}

const buildPrice = (value: number) => Number(value.toFixed(2))

export interface TcgSetSummary {
  id: string;
  name: string;
  serie: { id: string; name: string };
  cardCount: number;
  releasedAt?: string;
  boosters?: string[];
  evPrice?: number;
}

export const useApiStore = defineStore('api', {
  state: () => ({
    sets: [] as TcgSetSummary[],
    shopItems: {} as Record<string, StockItemInfo>,
    isLoading: false,
    error: '',
    /** Cache theo Set ID */
    setCardsCache: {} as Record<string, any[]>, 
    /** Flat map để lookup nhanh O(1) theo Card ID: cardId -> Card Object */
    flatCardMap: {} as Record<string, any>,
  }),
  getters: {
    sortedShopItems: (state) => Object.values(state.shopItems).sort((a, b) => {
      if (a.requiredLevel !== b.requiredLevel) return a.requiredLevel - b.requiredLevel
      return a.name.localeCompare(b.name)
    })
  },
  actions: {
    async initSeriesShop() {
      // 1. First try to load from LocalStorage
      this.loadFromStorage()

      if (Object.keys(this.shopItems).length > 0) {
        this.mergeShopItemsIntoInventory()
        return
      }

      this.isLoading = true

      try {
        console.log('[ApiStore] Starting SQLite Shop initialization...')
        
        // Fetch ALL sets and series from SQLite, bao gồm cả giá trị thẻ bài trung bình
        const rows = await dbService.query(`
          SELECT s.*, ser.name as serieName,
                 (
                   SELECT AVG(CAST(json_extract(pricing, '$.tcgplayer.normal.marketPrice') AS REAL))
                   FROM cards 
                   WHERE set_id = s.id 
                   AND pricing IS NOT NULL 
                   AND json_extract(pricing, '$.tcgplayer.normal.marketPrice') IS NOT NULL
                 ) as evPrice
          FROM sets s 
          JOIN series ser ON s.serieId = ser.id
          ORDER BY s.id ASC
        `);

        if (rows && rows.length > 0) {
          this.sets = rows.map((row: any) => ({
            id: row.id,
            name: row.name,
            serie: { id: row.serieId, name: row.serieName },
            cardCount: row.cardCount,
            evPrice: row.evPrice || Math.random() * 2,
            boosters: []
          }));
          
          this.shopItems = await this.generateShopItemsFromSets(this.sets)
          this.mergeShopItemsIntoInventory()
          this.saveToStorage()
        } else {
          // No rows returned (DB might be empty or newly initialized)
          this.loadFallbackData()
        }
      } catch (e) {
        this.error = 'Failed to initialize Local Database Shop data'
        console.warn('[ApiStore] SQLite initialization failed, using fallback data:', e)
        this.loadFallbackData()
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Tải dữ liệu dự phòng (Fallback) khi database không khả dụng.
     */
    async loadFallbackData() {
      console.log('[ApiStore] Loading Fallback Shop Data...');
      this.sets = FALLBACK_SETS;
      this.shopItems = await this.generateShopItemsFromSets(this.sets);
      this.mergeShopItemsIntoInventory();
      
      // Inject fallback cards into cache
      Object.entries(FALLBACK_CARDS).forEach(([setId, cards]) => {
        this.setCardsCache[setId] = markRaw(cards);
        cards.forEach(c => this.flatCardMap[c.id] = markRaw(c));
      });
      
      this.saveToStorage();
    },

    saveToStorage() {
      try {
        const data = {
          version: API_CACHE_VERSION,
          sets: this.sets,
          shopItems: this.shopItems
        }
        localStorage.setItem('tcg-shop-api-cache', JSON.stringify(data))
      } catch (e) {
        console.warn('[ApiStore] Failed to save cache:', e)
      }
    },

    loadFromStorage() {
      try {
        const saved = localStorage.getItem('tcg-shop-api-cache')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.version !== API_CACHE_VERSION) {
            localStorage.removeItem('tcg-shop-api-cache')
            return
          }
          this.sets = parsed.sets || []
          this.shopItems = parsed.shopItems || {}
          this.setCardsCache = parsed.setCardsCache || {}
        }
      } catch (e) {
        console.warn('[ApiStore] Failed to load cache:', e)
      }
    },

    async generateShopItemsFromSets(sets: TcgSetSummary[]) {
      const items: Record<string, StockItemInfo> = {}
      
      sets.forEach((set, index) => {
        if (SET_BLACKLIST.includes(set.id)) return

        const slug = sanitizeId(set.id || set.name || `set_${index}`)
        const boxId = `box_${slug}`
        const packId = `pack_${slug}`
        
        const seriesId = set.serie?.id || 'misc'
        const generation = getGenerationName(seriesId)
        const requiredLevel = getRequiredLevel(seriesId)

        // Tính EV (Giá trị kì vọng) cho Pack
        const ev = (set as any).evPrice || 2; 
        const baseEVPrice = ev * 10; // Giả định mỗi pack chứa 10 cards, EV thực tế scale theo trung bình giá marketPrice
        
        // Bonus giá trị dựa vào độ hot của set/độ hiếm (scale theo requiredLevel, min 10%, max 60%)
        const rarityBonusPercent = Math.min(60, Math.max(10, (requiredLevel / 80) * 60));
        
        // Base Price (cho logic tooltip)
        const basePackPrice = buildPrice(Math.max(baseEVPrice, 2.5)); // Min pack price $2.5
        const packPrice = buildPrice(basePackPrice * (1 + rarityBonusPercent / 100)); // Giá nhập đã bao gồm bonus value
        
        const baseBoxPrice = buildPrice(basePackPrice * 64 * 0.85); // 85% discount for bulk
        const boxPrice = buildPrice(packPrice * 64 * 0.85);

        const sourceSetId = set.id || slug

        items[packId] = {
          id: packId,
          name: `${set.name} Booster Pack`,
          buyPrice: packPrice, // Giá cửa hàng mua vào từ hệ thống
          sellPrice: buildPrice(packPrice * MARKUP_PACK), // Base markup from config
          basePrice: basePackPrice,
          rarityBonusPercent: buildPrice(rarityBonusPercent),
          requiredLevel,
          type: 'pack',
          volume: 1,
          description: `Pack của bộ ${set.name}. Thế hệ: ${generation}.`,
          sourceSetId,
          generation
        }

        items[boxId] = {
          id: boxId,
          name: `${set.name} Booster Box (64 Packs)`,
          buyPrice: boxPrice,
          sellPrice: buildPrice(boxPrice * MARKUP_BOX), // Base markup from config
          basePrice: baseBoxPrice,
          rarityBonusPercent: buildPrice(rarityBonusPercent),
          requiredLevel: Math.max(requiredLevel, 5),
          type: 'box',
          volume: 16,
          contains: { itemId: packId, amount: 64 },
          description: `Hộp ${set.name} gồm 64 Booster Pack. Giá sỉ cực tốt.`,
          sourceSetId,
          generation
        }
      })
      return items
    },

    mergeShopItemsIntoInventory() {
      const inventoryStore = useInventoryStore()
      inventoryStore.mergeShopItems(this.shopItems)
    },

    async ensureCardInCache(cardId: string) {
      if (this.flatCardMap[cardId]) return true

      const rows = await dbService.query('SELECT * FROM cards WHERE id = ?', [cardId]);
      if (rows && rows.length > 0) {
        const card = processCardRow(rows[0]);
        const rawCard = markRaw(card);
        this.flatCardMap[cardId] = rawCard;
        return true
      }
      return false
    },

    /**
     * Đảm bảo một danh sách các thẻ có mặt trong cache (Tối ưu hóa Batch Load)
     */
    async ensureCardsInCache(cardIds: string[]) {
      const missingIds = cardIds.filter(id => !this.flatCardMap[id]);
      if (missingIds.length === 0) return;

      console.log(`[ApiStore] Hydrating ${missingIds.length} missing cards...`, missingIds);

      // Chia nhỏ batch nếu quá lớn (SQLite limit variables hoặc performance)
      const batchSize = 50;
      for (let i = 0; i < missingIds.length; i += batchSize) {
        const chunk = missingIds.slice(i, i + batchSize);
        const placeholders = chunk.map(() => '?').join(',');
        
        try {
          const rows = await dbService.query(`SELECT * FROM cards WHERE id IN (${placeholders})`, chunk);
          console.log(`[ApiStore] Batch result: found ${rows?.length || 0} cards in database.`);
          
          if (rows) {
            rows.forEach((row: any) => {
              const card = processCardRow(row);
              this.flatCardMap[card.id] = markRaw(card);
            });
          }
        } catch (e) {
          console.error('[ApiStore] Batch hydration error:', e);
        }
      }
      this.saveToStorage();
    },

    async loadSetCards(setId: string): Promise<any[]> {
      if (this.setCardsCache[setId]) return this.setCardsCache[setId]

      const rows = await dbService.query('SELECT * FROM cards WHERE set_id = ?', [setId]);
      const cards = markRaw((rows || []).map(processCardRow));
      this.setCardsCache[setId] = cards;
      
      // Update flat map
      cards.forEach((c: any) => {
        if (c.id) this.flatCardMap[c.id] = c;
      });
      
      return cards
    },

    async getWeightedRandomCardsFromSet(setId: string, count: number = 6) {
      // Logic mở pack: Sử dụng SQL RANDOM() siêu tốc
      const rows = await dbService.query(
        'SELECT * FROM cards WHERE set_id = ? ORDER BY RANDOM() LIMIT ?', 
        [setId, count]
      );
      
      const cards = markRaw((rows || []).map(processCardRow));
      
      if (!this.setCardsCache[setId]) this.setCardsCache[setId] = markRaw([]);
      for (const card of cards) {
        const rawCard = markRaw(card);
        if (!this.setCardsCache[setId].find((c: any) => c.id === rawCard.id)) {
          this.setCardsCache[setId].push(rawCard)
        }
        if (rawCard.id) this.flatCardMap[rawCard.id] = rawCard;
      }
      this.saveToStorage()
      return cards
    },

  }
})
