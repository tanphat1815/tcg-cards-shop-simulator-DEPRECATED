import { defineStore } from 'pinia'
import { GAME_EVENTS, getEventById, type GameEvent, type EventEffect } from '../config/eventsData'
import { useStatsStore } from '../../stats/store/statsStore'

/** Effect đã được "resolve" (trường hợp target='RANDOM' đã chọn xong value) */
export interface ResolvedEffect {
  target: EventEffect['target']
  value: string
  multiplier: number
}

export const useEventStore = defineStore('event', {
  state: () => ({
    /** Sự kiện đang chạy HÔM NAY */
    activeEventId: 'standard' as string | null,
    /** Sự kiện đã setup cho NGÀY MAI */
    nextEventId: 'standard' as string | null,
    /** Tổng số khách đã từng ngồi chơi (cumulative, dùng cho unlock) */
    totalPlayersHosted: 0,

    /**
     * Effects đã resolve cho event hôm nay.
     * Cache này tránh resolve lại RANDOM mỗi lần gọi getEventPriceMultiplier.
     */
    resolvedActiveEffects: [] as ResolvedEffect[],

    /** Đếm số khách đã thanh toán event fee hôm nay (thống kê) */
    playersPaidToday: 0,
    /** Tổng doanh thu event hôm nay */
    eventRevenueToday: 0,
  }),

  getters: {
    activeEvent: (state): GameEvent | null => getEventById(state.activeEventId),
    nextEvent: (state): GameEvent | null => getEventById(state.nextEventId),

    /** Danh sách events đã mở khoá theo totalPlayersHosted hiện tại */
    unlockedEvents: (state): GameEvent[] =>
      GAME_EVENTS.filter(e => e.unlockAtTotalPlayers <= state.totalPlayersHosted),
  },

  actions: {
    /**
     * Player chọn sự kiện cho ngày mai.
     * Chỉ set state; KHÔNG trừ tiền (tiền bị trừ lúc chuyển ngày).
     */
    setNextEvent(eventId: string): { success: boolean; reason?: string } {
      const event = getEventById(eventId)
      if (!event) return { success: false, reason: 'Event không tồn tại.' }

      // Kiểm tra unlock
      if (event.unlockAtTotalPlayers > this.totalPlayersHosted) {
        return {
          success: false,
          reason: `Cần ${event.unlockAtTotalPlayers} lượt khách (hiện ${this.totalPlayersHosted}).`
        }
      }

      this.nextEventId = eventId
      return { success: true }
    },

    /**
     * Resolve tất cả effect target='RANDOM' thành 1 giá trị cụ thể.
     * Gọi 1 lần khi event được apply cho ngày mới.
     */
    _resolveActiveEffects(event: GameEvent): ResolvedEffect[] {
      const RANDOM_ENERGY = ['Fire', 'Water', 'Grass', 'Lightning', 'Fighting', 'Psychic']
      const RANDOM_RARITY = ['Common', 'Uncommon', 'Rare']

      return event.effects.map(eff => {
        if (eff.target === 'RANDOM') {
          // Random: nếu multiplier > 1 → pick energy type buff; else nerf rarity
          if (eff.multiplier > 1) {
            return {
              target: 'ENERGY_TYPE',
              value: RANDOM_ENERGY[Math.floor(Math.random() * RANDOM_ENERGY.length)],
              multiplier: eff.multiplier,
            }
          } else {
            return {
              target: 'RARITY',
              value: RANDOM_RARITY[Math.floor(Math.random() * RANDOM_RARITY.length)],
              multiplier: eff.multiplier,
            }
          }
        }
        return eff as ResolvedEffect
      })
    },

    /**
     * Xử lý chuyển giao event khi startNewDay():
     *   1. Trừ dailyCost của nextEvent từ Player's money.
     *   2. Nếu không đủ tiền → rollback sang 'standard' (miễn phí).
     *   3. Chuyển nextEvent → activeEvent, resolve effects.
     *   4. Reset counters ngày.
     *
     * Gọi SAU khi statsStore.startNewDay() (để Player đã bị trừ lương trước).
     */
    applyNextEventOnNewDay() {
      const statsStore = useStatsStore()

      // Reset counters
      this.playersPaidToday = 0
      this.eventRevenueToday = 0

      const target = getEventById(this.nextEventId)
      if (!target) {
        // Fallback: chuyển về Standard
        this.activeEventId = 'standard'
        this.resolvedActiveEffects = this._resolveActiveEffects(getEventById('standard')!)
        return
      }

      // Trừ phí duy trì
      if (target.dailyCost > 0) {
        if (statsStore.money < target.dailyCost) {
          // Không đủ tiền → fallback Standard (free)
          console.warn(`[Event] Không đủ tiền cho ${target.name}. Fallback Standard.`)
          this.activeEventId = 'standard'
          this.nextEventId = 'standard'
          this.resolvedActiveEffects = this._resolveActiveEffects(getEventById('standard')!)
          return
        }
        statsStore.spendMoney(target.dailyCost)
      }

      // Apply event
      this.activeEventId = target.id
      this.resolvedActiveEffects = this._resolveActiveEffects(target)
      // Next event giữ nguyên để default lặp lại event vừa chọn
    },

    /**
     * Tăng tổng khách đã chơi (cumulative, cho unlock).
     * + Tăng counter hôm nay (thống kê).
     */
    incrementPlayersHosted(paidAmount: number) {
      this.totalPlayersHosted++
      this.playersPaidToday++
      this.eventRevenueToday += paidAmount
    },

    /**
     * Tính hệ số nhân giá thị trường cho 1 thẻ dựa trên các effect đang active.
     */
    getEventPriceMultiplier(card: any): number {
      if (!card) return 1.0
      if (this.resolvedActiveEffects.length === 0) return 1.0

      let multiplier = 1.0

      for (const eff of this.resolvedActiveEffects) {
        if (this._effectMatchesCard(eff, card)) {
          multiplier *= eff.multiplier
        }
      }

      // Clamp để không bị overflow hay âm (safety)
      return Math.max(0.1, Math.min(5.0, multiplier))
    },

    /**
     * Kiểm tra 1 effect có ảnh hưởng 1 card không.
     */
    _effectMatchesCard(eff: ResolvedEffect, card: any): boolean {
      const rarity: string = (card.rarity ?? '').toUpperCase()
      const types: string[] = card.types ?? []

      switch (eff.target) {
        case 'ENERGY_TYPE':
          return types.includes(eff.value)

        case 'RARITY':
          // Match rarity "simple": 'Common', 'Uncommon', 'Rare', 'Epic', 'Legend'
          return rarity.includes(eff.value.toUpperCase())

        case 'EDITION':
          if (eff.value === '1st Edition') {
            return !!card.firstEdition || !!card.variants?.firstEdition
          }
          return false

        case 'BORDER':
          const border = (card.border ?? '').toLowerCase()
          if (border) return border === eff.value.toLowerCase()
          if (eff.value === 'Gold')   return rarity.includes('GOLD') || rarity.includes('SECRET')
          if (eff.value === 'Silver') return rarity.includes('SHINY')
          return false

        case 'CARD_TYPE':
          const target = eff.value.toUpperCase()
          if (target === 'EX')       return rarity.includes('EX') && !rarity.includes('VMAX')
          if (target === 'V')        return !!rarity.match(/\bV\b/)
          if (target === 'VMAX')     return rarity.includes('VMAX')
          if (target === 'VSTAR')    return rarity.includes('VSTAR')
          if (target === 'FULL ART') return rarity.includes('FULL ART') || rarity.includes('ILLUSTRATION')
          if (target === 'HOLO')     return rarity.includes('HOLO') || rarity.includes('FOIL')
          return false

        default:
          return false
      }
    },

    /**
     * Khôi phục state từ save data.
     */
    loadEventState(parsed: any) {
      this.activeEventId = parsed.activeEventId ?? 'standard'
      this.nextEventId = parsed.nextEventId ?? 'standard'
      this.totalPlayersHosted = parsed.totalPlayersHosted ?? 0

      // Re-resolve effects
      const active = getEventById(this.activeEventId)
      this.resolvedActiveEffects = active ? this._resolveActiveEffects(active) : []

      this.playersPaidToday = 0
      this.eventRevenueToday = 0
    }
  }
})
