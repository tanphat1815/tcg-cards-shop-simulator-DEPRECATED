import { defineStore } from 'pinia'
import { calculateRequiredXP, EXPANSION_LEVELS } from '../config'

/**
 * StatsStore - Quản lý các chỉ số cơ bản về tiến trình của người chơi.
 * 
 * Các trách nhiệm chính:
 * - Kinh tế: Quản lý tiền tệ (Money), trừ tiền (Spend), cộng tiền (Add).
 * - Cấp độ: Quản lý Level, XP và logic thăng cấp tự động.
 * - Thời gian: Quản lý vòng lặp ngày/đêm và đồng hồ của shop.
 * - Phát triển: Quản lý việc mở rộng diện tích shop (Expansion).
 * - Cài đặt: Lưu trữ các tùy chỉnh cá nhân (Settings).
 */
export const useStatsStore = defineStore('stats', {
  state: () => ({
    /** Tiền mặt hiện có của người chơi */
    money: 1000,
    /** Cấp độ hiện tại của shop */
    level: 1,
    /** Điểm kinh nghiệm tích lũy trong cấp hiện tại */
    currentExp: 0,
    /** Flag hiển thị thông báo thăng cấp khi Shop đạt đủ XP */
    showLevelUpNext: false,
    
    /** Thống kê hoạt động của ngày hiện tại (Revenue, Customers, Items) */
    dailyStats: {
      revenue: 0,
      customersServed: 0,
      itemsSold: 0
    },
    
    /** Ngày thứ bao nhiêu kể từ khi mở shop */
    currentDay: 1,
    /** Thời gian hiện tại tính theo phút (480 = 8:00 AM) */
    timeInMinutes: 480, 
    /** Cấp độ mở rộng diện tích shop (Lot A) */
    expansionLevel: 0,
    
    // Toggles hiển thị Modals
    showEndDayModal: false,
    showSettings: false,
    
    /** Cấu hình hiển thị và trải nghiệm người dùng */
    settings: {
      /** Cho phép hiển thị vùng thông báo mở rộng diện tích */
      showExpansionPreview: true,
      /** Phong cách hiển thị vùng mở rộng (BLUEPRINT: Bản vẽ xanh, GLOW: Hiệu ứng tỏa sáng) */
      expansionPreviewStyle: 'GLOW' as 'BLUEPRINT' | 'GLOW',
      /** Hiển thị khung va chạm vật lý (Debug) cho các thực thể */
      showDebugPhysics: false
    },
  }),
  getters: {
    /** 
     * Tính toán số XP cần thiết để đạt cấp độ tiếp theo.
     * Dữ liệu được tính toán dựa trên config leveling.
     */
    requiredExp: (state) => calculateRequiredXP(state.level),
  },
  actions: {
    /** nạp thêm tiền vào ví người chơi */
    addMoney(amount: number) {
      this.money += amount
    },

    /** 
     * Rút tiền để mua sắm.
     * @returns {boolean} True nếu đủ tiền thực hiện giao dịch.
     */
    spendMoney(amount: number) {
      if (this.money >= amount) {
        this.money -= amount
        return true
      }
      return false
    },

    /** 
     * Cộng XP cho shop. 
     * Logic đệ quy đảm bảo nếu nhận được lượng XP cực lớn, người chơi vẫn có thể thăng nhiều cấp cùng lúc.
     */
    gainExp(amount: number) {
      this.currentExp += amount
      const req = calculateRequiredXP(this.level)
      if (this.currentExp >= req) {
        this.level++
        this.currentExp = this.currentExp - req
        this.showLevelUpNext = true
        this.gainExp(0) // Đệ quy kiểm tra cấp tiếp theo
      }
    },

    /** 
     * Cập nhật thời gian. 
     * Thời gian shop kết thúc cố định ở 1200 phút (20:00).
     */
    tickTime(minutes: number) {
      this.timeInMinutes += minutes
      if (this.timeInMinutes >= 1200) {
        this.timeInMinutes = 1200
      }
    },

    /** 
     * Xử lý thủ tục chuyển sang ngày tiếp theo (Day Transition).
     * - Trừ lương nhân viên.
     * - Trừ tiền thuê mặt bằng (Tăng theo mức độ mở rộng shop).
     * - Reset các chỉ số thống kê ngày.
     */
    startNewDay(totalSalary: number) {
      // 1. Trừ chi phí nhân sự
      this.money -= totalSalary

      // 2. Tính toán và trừ tiền thuê nhà
      let totalRent = 50 // Tiền thuê cơ bản ban đầu
      for (let i = 0; i < this.expansionLevel; i++) {
        totalRent += EXPANSION_LEVELS[i].rentIncrease
      }
      this.money -= totalRent

      // 3. Cập nhật trạng thái ngày
      this.currentDay++
      this.timeInMinutes = 480 // Reset đồng hồ về 8:00 AM
      this.showEndDayModal = false
      this.dailyStats = { revenue: 0, customersServed: 0, itemsSold: 0 }
    },

    /** 
     * Kiểm tra và thực hiện nâng cấp diện tích Shop.
     */
    buyExpansion() {
      const nextId = this.expansionLevel + 1
      const config = EXPANSION_LEVELS.find(e => e.id === nextId)
      if (!config) return false // Đã đạt cấp độ tối đa

      if (this.money < config.cost) return false
      if (this.level < config.requiredLevel) return false

      this.money -= config.cost
      this.expansionLevel = nextId
      return true
    },

    /**
     * Khôi phục các chỉ số thống kê từ nguồn lưu trữ.
     */
    loadStats(parsed: any) {
      this.money = parsed.money ?? 1000
      this.level = parsed.level ?? 1
      this.currentExp = parsed.currentExp ?? 0
      this.currentDay = parsed.currentDay ?? 1
      this.timeInMinutes = parsed.timeInMinutes ?? 480
      this.expansionLevel = parsed.expansionLevel ?? 0
      if (parsed.settings) {
        this.settings = { ...this.settings, ...parsed.settings }
      }
    }
  }
})