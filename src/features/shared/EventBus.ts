// EventBus.ts — Cầu nối Phaser ↔ Vue, tránh DOM manipulation trực tiếp
// Pattern: Simple typed event emitter

type EventHandler = (...args: any[]) => void

class EventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map()

  // Đăng ký lắng nghe sự kiện
  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    // Trả về hàm unsubscribe để dọn dẹp
    return () => this.off(event, handler)
  }

  // Hủy đăng ký
  off(event: string, handler: EventHandler) {
    this.listeners.get(event)?.delete(handler)
  }

  // Phát sự kiện — Phaser gọi hàm này, Vue lắng nghe
  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach(h => h(...args))
  }

  // Dọn dẹp toàn bộ (dùng khi scene shutdown)
  clear() {
    this.listeners.clear()
  }
}

// Singleton — import từ bất cứ đâu đều cùng một instance
export const eventBus = new EventBus()

// Danh sách tên sự kiện được type-safe
export const EVENTS = {
  // Phaser → Vue
  CUSTOMER_PAID:        'customer:paid',        // { price, instanceId }
  SHELF_EMPTY:          'shelf:empty',           // { shelfId }
  NPC_TRADE_REQUEST:    'npc:tradeRequest',      // { instanceId, cardId }
  EVENT_FEE_COLLECTED:  'event:feeCollected',    // { amount, instanceId }
  // Vue → Phaser
  TRADE_RESULT:         'trade:result',          // { instanceId, accepted, finalPrice }
  SHOP_STATE_CHANGED:   'shop:stateChanged',     // { state: 'OPEN'|'CLOSED' }
} as const
