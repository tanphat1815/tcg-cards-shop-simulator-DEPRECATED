import { defineStore } from 'pinia'
import { useStatsStore } from '../../stats/store/statsStore'
import { useInventoryStore } from './inventoryStore'
import { useApiStore } from './apiStore'
import { getRawPrice } from '../../shared/utils/currency'

/** Trạng thái của một phiên đàm phán (Trade Session) */
export interface ActiveTrade {
  npcInstanceId: string
  cardId: string
  marketPrice: number       // Giá thị trường gốc của thẻ
  askPrice: number          // Giá NPC chào bán (90-110% market)
  currentCounterPrice: number | null  // Giá NPC counter-offer gần nhất (nếu có)
  attemptsLeft: number      // Số lần Player còn được offer (max 3)
  lastOfferPrice: number    // Giá Player vừa đưa (để so sánh)
  /** Message hiển thị ra UI ('npc đang cân nhắc', 'counter $X', 'từ chối', etc.) */
  statusMessage: string
  /** Phase hiện tại của deal */
  phase: 'NEGOTIATING' | 'ACCEPTED' | 'REJECTED' | 'COUNTER_OFFERED'
}

/** Config đàm phán — tinh chỉnh dễ dàng */
const TRADE_CONFIG = {
  MAX_ATTEMPTS: 3,
  ASK_MIN_MULT: 0.9,    // 90% market
  ASK_MAX_MULT: 1.1,    // 110% market
  RATIO_INSULT: 0.4,    // < 40% → NPC tức giận
  RATIO_AUTO_ACCEPT: 0.95,  // >= 95% → gần như chắc chắn accept
  AUTO_ACCEPT_CHANCE: 0.95,    // Prob accept khi ratio >= 0.95
  MID_ACCEPT_BASE_CHANCE: 0.35, // Prob accept tại ratio = 0.4
  MID_ACCEPT_TOP_CHANCE: 0.85,  // Prob accept tại ratio = 0.95
}

export const useTradeInStore = defineStore('tradeIn', {
  state: () => ({
    activeTrade: null as ActiveTrade | null,
    showModal: false,
  }),

  getters: {
    isNegotiating: (state) =>
      state.activeTrade !== null && state.activeTrade.phase === 'NEGOTIATING',
    isCounterOffered: (state) =>
      state.activeTrade?.phase === 'COUNTER_OFFERED',
  },

  actions: {
    /**
     * Khởi tạo deal khi Player click vào NPC có intent='SELL'.
     * Random askPrice từ 90-110% marketPrice.
     */
    startTrade(npcInstanceId: string, cardId: string) {
      const apiStore = useApiStore()
      const card = apiStore.flatCardMap[cardId]
      if (!card) {
        console.warn('[tradeIn] Card not found in cache:', cardId)
        return
      }

      const marketPrice = getRawPrice(card) || 1.0
      // Random 90% → 110% của market
      const mult = TRADE_CONFIG.ASK_MIN_MULT +
        Math.random() * (TRADE_CONFIG.ASK_MAX_MULT - TRADE_CONFIG.ASK_MIN_MULT)
      const askPrice = Math.round(marketPrice * mult * 100) / 100  // round 2 decimals

      this.activeTrade = {
        npcInstanceId,
        cardId,
        marketPrice,
        askPrice,
        currentCounterPrice: null,
        attemptsLeft: TRADE_CONFIG.MAX_ATTEMPTS,
        lastOfferPrice: 0,
        statusMessage: `Người này muốn bán lá này với giá $${askPrice.toFixed(2)}`,
        phase: 'NEGOTIATING',
      }
      this.showModal = true
    },

    /**
     * Xử lý khi Player submit giá offer.
     */
    submitOffer(offerPrice: number) {
      if (!this.activeTrade || (this.activeTrade.phase !== 'NEGOTIATING' && this.activeTrade.phase !== 'COUNTER_OFFERED')) return
      if (this.activeTrade.attemptsLeft <= 0) return

      // Validation input
      if (isNaN(offerPrice) || offerPrice <= 0) {
        this.activeTrade.statusMessage = '⚠️ Vui lòng nhập một số tiền hợp lệ.'
        return
      }

      const { askPrice, marketPrice } = this.activeTrade
      const ratio = offerPrice / askPrice
      this.activeTrade.lastOfferPrice = offerPrice
      this.activeTrade.attemptsLeft--

      // ── CASE 1: OFFER QUÁ CAO → ACCEPT gần như chắc chắn ─────
      if (offerPrice >= marketPrice || ratio >= TRADE_CONFIG.RATIO_AUTO_ACCEPT) {
        const acceptRoll = Math.random()
        if (acceptRoll <= TRADE_CONFIG.AUTO_ACCEPT_CHANCE) {
          this._acceptDeal(offerPrice)
          return
        }
        // 5% unluck → vẫn counter một chút (để không quá dễ)
        this._counterOffer(offerPrice)
        return
      }

      // ── CASE 2: OFFER QUÁ THẤP → NPC TỨC GIẬN, BỎ ĐI ─────────
      if (ratio < TRADE_CONFIG.RATIO_INSULT) {
        this.activeTrade.phase = 'REJECTED'
        this.activeTrade.statusMessage =
          `😡 "Giá đó quá sỉ nhục! Tôi đi đây!"`
        this._notifyNpcToLeave('insulted')
        return
      }

      // ── CASE 3: OFFER TRUNG BÌNH (0.4 <= ratio < 0.95) ───────
      // Lerp prob accept từ MID_ACCEPT_BASE_CHANCE (ở ratio=0.4)
      // đến MID_ACCEPT_TOP_CHANCE (ở ratio=0.95).
      const t = (ratio - TRADE_CONFIG.RATIO_INSULT) /
                (TRADE_CONFIG.RATIO_AUTO_ACCEPT - TRADE_CONFIG.RATIO_INSULT)
      const acceptChance =
        TRADE_CONFIG.MID_ACCEPT_BASE_CHANCE +
        t * (TRADE_CONFIG.MID_ACCEPT_TOP_CHANCE - TRADE_CONFIG.MID_ACCEPT_BASE_CHANCE)

      const roll = Math.random()

      if (roll <= acceptChance) {
        this._acceptDeal(offerPrice)
        return
      }

      // NPC ra counter-offer (nếu còn attempts)
      if (this.activeTrade.attemptsLeft <= 0) {
        // Hết lượt → NPC bỏ đi
        this.activeTrade.phase = 'REJECTED'
        this.activeTrade.statusMessage =
          `😤 "Chúng ta không thoả thuận được. Tạm biệt."`
        this._notifyNpcToLeave('out_of_attempts')
        return
      }

      this._counterOffer(offerPrice)
    },

    /**
     * NPC đồng ý bán. Trừ tiền Player, thêm thẻ vào binder, NPC rời shop.
     */
    _acceptDeal(finalPrice: number) {
      const statsStore = useStatsStore()
      const inventoryStore = useInventoryStore()

      if (!this.activeTrade) return

      // Kiểm tra tiền
      if (statsStore.money < finalPrice) {
        this.activeTrade.statusMessage = '💸 Bạn không đủ tiền để mua thẻ này!'
        // Không giảm phase, không bỏ NPC — cho Player cơ hội offer lại
        this.activeTrade.attemptsLeft++  // Hoàn trả lượt vì deal không được chốt
        return
      }

      statsStore.spendMoney(finalPrice)

      // Thêm thẻ vào binder cá nhân của Player
      const cardId = this.activeTrade.cardId
      if (!inventoryStore.personalBinder[cardId]) {
        inventoryStore.personalBinder[cardId] = 0
      }
      inventoryStore.personalBinder[cardId]++

      // Thống kê
      statsStore.dailyStats.itemsSold++ 

      this.activeTrade.phase = 'ACCEPTED'
      this.activeTrade.statusMessage =
        `✅ "Cảm ơn! Đã chốt giá $${finalPrice.toFixed(2)}."`

      this._notifyNpcToLeave('deal_done')
    },

    /**
     * NPC ra counter-offer.
     * counterPrice phải nằm trong khoảng (offerPrice, askPrice].
     */
    _counterOffer(playerOffer: number) {
      if (!this.activeTrade) return

      const { askPrice, currentCounterPrice } = this.activeTrade
      const upper = currentCounterPrice ?? askPrice
      const lower = playerOffer

      // Bias 0.6 về phía upper (NPC nhượng bộ nhỏ, thực tế hơn)
      const bias = 0.6
      const raw = lower + (upper - lower) * (bias + Math.random() * (1 - bias))

      // Làm tròn 2 số thập phân và enforce bounds
      let counter = Math.round(raw * 100) / 100
      if (counter <= playerOffer) counter = Math.round((playerOffer + 0.01) * 100) / 100
      if (counter > upper) counter = upper

      this.activeTrade.currentCounterPrice = counter
      this.activeTrade.phase = 'COUNTER_OFFERED'
      this.activeTrade.statusMessage =
        `🤔 "Giá đó thấp quá, $${counter.toFixed(2)} thì sao?" ` +
        `(Còn ${this.activeTrade.attemptsLeft} lần thương lượng)`
    },

    /**
     * Thông báo cho NPCManager rằng NPC cần rời shop.
     */
    _notifyNpcToLeave(reason: string) {
      if (!this.activeTrade) return
      window.dispatchEvent(new CustomEvent('trade-in:npc-leave', {
        detail: {
          instanceId: this.activeTrade.npcInstanceId,
          reason,
        }
      }))
    },

    /** Player chủ động đóng modal (từ chối deal). */
    rejectTrade() {
      if (!this.activeTrade) return
      this.activeTrade.phase = 'REJECTED'
      this.activeTrade.statusMessage = '👋 Bạn đã từ chối deal này.'
      this._notifyNpcToLeave('player_rejected')
    },

    /** Gọi khi NPC timeout hoặc bị force leave — đóng modal. */
    cancelTrade(_reason: string) {
      this.activeTrade = null
      this.showModal = false
    },

    /** Đóng modal sau khi deal đã xong (ACCEPTED/REJECTED phase). */
    closeModal() {
      this.activeTrade = null
      this.showModal = false
    }
  }
})
