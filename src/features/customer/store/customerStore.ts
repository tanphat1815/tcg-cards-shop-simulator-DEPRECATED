import { defineStore } from 'pinia'
import { useStatsStore } from '../../stats/store/statsStore'

/**
 * CustomerStore - Quản lý hàng chờ khách hàng và trạng thái vận hành của shop.
 */
export const useCustomerStore = defineStore('customer', {
  state: () => ({
    /** Trạng thái đóng/mở cửa của shop */
    shopState: 'CLOSED' as 'OPEN' | 'CLOSED',
    
    /** Hàng chờ thanh toán (First-in, First-out) */
    waitingQueue: [] as { instanceId: string, price: number, arrivedAt: number }[],
    
    /** Số lượng khách đã phục vụ trong ngày (tracking mới) */
    servedToday: 0,
  }),

  getters: {
    /** Số lượng khách đang chờ */
    waitingCustomers: (state) => state.waitingQueue.length,
    
    /** Kiểm tra xem có thể phục vụ khách tiếp theo không */
    canServeNext: (state) => state.waitingQueue.length > 0
  },

  actions: {
    /**
     * Mở hoặc Đóng cửa shop.
     */
    setShopState(newState: 'OPEN' | 'CLOSED') {
      this.shopState = newState
    },

    /**
     * Đưa khách hàng vào hàng chờ thanh toán.
     * @param price Số tiền khách sẽ trả
     * @param instanceId ID của NPC khách hàng
     */
    addWaitingCustomer(price: number, instanceId: string) {
      if (this.waitingQueue.some(q => q.instanceId === instanceId)) {
        return // Đã có trong hàng chờ, không thêm trùng
      }
      this.waitingQueue.push({ 
        instanceId, 
        price, 
        arrivedAt: Date.now() 
      })
    },

    /**
     * Phục vụ khách hàng đứng đầu hàng chờ.
     * Cộng tiền và trả về ID khách để Phaser giải phóng NPC.
     */
    serveCustomer(): string | null {
      const statsStore = useStatsStore()
      
      const entry = this.waitingQueue.shift()
      if (!entry) return null

      const { instanceId, price } = entry
      
      // Cập nhật thống kê tài chính qua statsStore
      statsStore.addMoney(price)
      statsStore.dailyStats.customersServed++
      statsStore.dailyStats.revenue += price
      statsStore.gainExp(5) // Kinh nghiệm cơ bản mỗi đơn hàng
      
      this.servedToday++
      
      return instanceId
    },

    /**
     * Xóa khách hàng khỏi hàng chờ (ví dụ: khách hết kiên nhẫn bỏ đi)
     */
    removeCustomerFromQueue(instanceId: string) {
      const index = this.waitingQueue.findIndex(c => c.instanceId === instanceId)
      if (index !== -1) {
        this.waitingQueue.splice(index, 1)
      }
    },

    /**
     * Buộc kết thúc ngày sớm:
     * - Đóng cửa hàng ngay lập tức.
     * - Hiển thị Modal báo cáo doanh thu.
     */
    forceEndDay() {
      this.shopState = 'CLOSED'
      useStatsStore().showEndDayModal = true
    },

    /**
     * Khôi phục trạng thái shop từ save
     */
    loadCustomerState(parsed: any) {
      this.shopState = parsed.shopState ?? 'CLOSED'
      // Không khôi phục hàng chờ vì NPC sẽ được spawn lại bởi Phaser
      this.waitingQueue = []
      this.servedToday = 0
    }
  }
})
