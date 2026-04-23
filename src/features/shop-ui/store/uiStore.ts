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
    activeShopTab: 'STOCK' as 'STOCK' | 'FURNITURE' | 'STAFF' | 'RENO' | 'CART',
    showManageEvent: false,

    // Smartphone State
    showSmartphone: false,
    activeApp: 'home' as 'home' | 'events' | 'grading' | 'settings',
    
    // Tham chiếu đến vật phẩm UI đang tương tác
    activeShelfId: null as string | null,
    
    // Các trạng thái UI khác có thể mở rộng sau này (v.v. Staff Dialog, Stats Modal)
  }),
  
  actions: {
    toggleSmartphone(show?: boolean) {
      this.showSmartphone = show ?? !this.showSmartphone
      if (this.showSmartphone) {
        this.activeApp = 'home'
      }
    },

    setActiveApp(app: 'home' | 'events' | 'grading' | 'settings') {
      this.activeApp = app
    },

    toggleOnlineShop(show?: boolean, tab: 'STOCK' | 'FURNITURE' | 'STAFF' | 'RENO' | 'CART' = 'STOCK') {
      this.showOnlineShop = show ?? !this.showOnlineShop
      if (this.showOnlineShop) {
        this.activeShopTab = tab
      }
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
