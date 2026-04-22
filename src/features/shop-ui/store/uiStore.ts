import { defineStore } from 'pinia'

/**
 * UIStore - Quản lý trạng thái hiển thị của các menu và dialog trong game.
 * Giúp tách biệt logic giao diện khỏi logic nghiệp vụ (Business logic).
 */
export const useUIStore = defineStore('ui', {
  state: () => ({
    // Trạng thái hiển thị menu
    showShelfMenu: false,
    showBinderMenu: false,
    showBuildMenu: false,
    showOnlineShop: false,
    showManageEvent: false,

    
    // Tham chiếu đến vật phẩm UI đang tương tác
    activeShelfId: null as string | null,
    
    // Các trạng thái UI khác có thể mở rộng sau này (v.v. Staff Dialog, Stats Modal)
  }),
  
  actions: {
    toggleOnlineShop(show?: boolean) {
      this.showOnlineShop = show ?? !this.showOnlineShop
    },
    
    toggleBinderMenu(show?: boolean) {
      this.showBinderMenu = show ?? !this.showBinderMenu
    },
    
    toggleBuildMenu(show?: boolean) {
      this.showBuildMenu = show ?? !this.showBuildMenu
    },

    openShelfMenu(shelfId: string) {
      this.activeShelfId = shelfId
      this.showShelfMenu = true
    },

    closeShelfMenu() {
      this.activeShelfId = null
      this.showShelfMenu = false
    }
  }
})
