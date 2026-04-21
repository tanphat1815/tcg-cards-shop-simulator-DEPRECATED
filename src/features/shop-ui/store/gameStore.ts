import { defineStore } from 'pinia'
import { useStatsStore } from '../../stats/store/statsStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { useFurnitureStore } from '../../furniture/store/furnitureStore'
import { useCustomerStore } from '../../customer/store/customerStore'
import { useUIStore } from './uiStore'
import { useStaffStore } from '../../staff/store/staffStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { useGymStore } from '../../gym/store/gymStore'
import { useCartStore } from '../../inventory/store/cartStore'
import { useDeliveryStore } from '../../inventory/store/deliveryStore'
import { usePlayerHandStore } from '../../inventory/store/playerHandStore'
import { useGradingStore } from '../../grading/store/gradingStore'

/**
 * GameStore (Facade Pattern) - Trung tâm điều phối dữ liệu của toàn bộ ứng dụng.
 * 
 * Tại sao cần Facade Store:
 * 1. Tập trung hóa API: Các Scene Phaser hoặc Component Vue chỉ cần import một store duy nhất 
 *    để truy cập mọi dữ liệu thay vì import 5-6 module nhỏ.
 * 2. Đảm bảo tính tương thích: Giữ nguyên cấu trúc API cũ trong khi logic thực tế đã được 
 *    tách nhỏ vào các sub-modules (Stats, Furniture, Customer, UI, Staff, Inventory).
 * 3. Quản lý trạng thái liên kết: Xử lý các nghiệp vụ phức tạp liên quan đến nhiều module 
 *    như Save/Load Game hoặc bắt đầu ngày mới (StartNewDay).
 */
export const useGameStore = defineStore('game', {
  state: () => ({
    // Facade không lưu trữ state trực tiếp, chỉ đóng vai trò ủy quyền (Delegation).
    // === Battle Engine Control ===
    /** Phaser scene có đang bị pause không (khi Battle Arena mở) */
    isPaused: false,
  }),
  
  /**
   * Getters: Ánh xạ (Map) các thuộc tính từ các store con để truy cập dễ dàng.
   */
  getters: {
    // === Stats & Progress (Modules: statsStore) ===
    money: () => useStatsStore().money,
    level: () => useStatsStore().level,
    currentExp: () => useStatsStore().currentExp,
    showLevelUpNext: () => useStatsStore().showLevelUpNext,
    dailyStats: () => useStatsStore().dailyStats,
    currentDay: () => useStatsStore().currentDay,
    timeInMinutes: () => useStatsStore().timeInMinutes,
    expansionLevel: () => useStatsStore().expansionLevel,
    showEndDayModal: () => useStatsStore().showEndDayModal,
    showSettings: () => useStatsStore().showSettings,
    settings: () => useStatsStore().settings,

    // === Inventory & Cards (Modules: inventoryStore) ===
    shopInventory: () => useInventoryStore().shopInventory,
    personalBinder: () => useInventoryStore().personalBinder,
    shopItems: () => useInventoryStore().shopItems,
    isOpeningPack: () => useInventoryStore().isOpeningPack,
    currentPack: () => useInventoryStore().currentPack,

    // === Furniture (Modules: furnitureStore) ===
    placedShelves: () => useFurnitureStore().placedShelves,
    placedTables: () => useFurnitureStore().placedTables,
    placedCashiers: () => useFurnitureStore().placedCashiers,
    purchasedFurniture: () => useFurnitureStore().purchasedFurniture,
    isBuildMode: () => useFurnitureStore().isBuildMode,
    buildItemId: () => useFurnitureStore().buildItemId,
    isEditMode: () => useFurnitureStore().isEditMode,
    editFurnitureData: () => useFurnitureStore().editFurnitureData,

    // === Customer & Operation (Modules: customerStore) ===
    shopState: () => useCustomerStore().shopState,
    waitingQueue: () => useCustomerStore().waitingQueue,
    waitingCustomers: () => useCustomerStore().waitingCustomers,
    
    // === UI Toggles (Modules: uiStore) ===
    showShelfMenu: () => useUIStore().showShelfMenu,
    showBinderMenu: () => useUIStore().showBinderMenu,
    showBuildMenu: () => useUIStore().showBuildMenu,
    showOnlineShop: () => useUIStore().showOnlineShop,
    activeShelfId: () => useUIStore().activeShelfId,

    // === Staff & Workers (Modules: staffStore) ===
    hiredWorkers: () => useStaffStore().hiredWorkers,

    // === Gym System (Modules: gymStore) ===
    gymLeaders: () => useGymStore().gymLeaders,
    activeGym: () => useGymStore().activeGym,
    isPlayerInTown: () => useGymStore().isPlayerInTown,

    // === Cart & Orders (Modules: cartStore) ===
    cartItemCount: () => useCartStore().totalItems,

    // === Derived Stats ===
    requiredExp: () => useStatsStore().requiredExp,
  },

  /**
   * Actions: Điểm đến (Endpoint) cho toàn bộ lệnh logic trong game.
   */
  actions: {
    // --- UI State Setters (Delegated to uiStore) ---
    setShowOnlineShop(val: boolean) { useUIStore().showOnlineShop = val },
    setShowBuildMenu(val: boolean) { useUIStore().showBuildMenu = val },
    setShowBinderMenu(val: boolean) { useUIStore().showBinderMenu = val },
    setShowSettings(val: boolean) { useStatsStore().showSettings = val },
    setShowGradingApp(val: boolean) { useGradingStore().setShowGradingApp(val) },
    openShelfManagement(shelfId: string) { useUIStore().openShelfMenu(shelfId) },
    closeShelfManagement() { useUIStore().closeShelfMenu() },

    // --- Stats & Economy Actions ---
    addMoney(amount: number) { useStatsStore().addMoney(amount) },
    spendMoney(amount: number) { return useStatsStore().spendMoney(amount) },
    gainExp(amount: number) { useStatsStore().gainExp(amount) },
    tickTime(minutes: number) { useStatsStore().tickTime(minutes) },
    buyExpansion() { return useStatsStore().buyExpansion() },

    // --- Inventory Management ---
    buyStock(itemId: string, amount: number = 1) { return useInventoryStore().buyStock(itemId, amount) },
    unboxItem(boxId: string) { useInventoryStore().unboxItem(boxId) },
    tearPack(packId: string) { useInventoryStore().tearPack(packId) },
    closePackOpening() { useInventoryStore().closePackOpening() },

    // --- Shop Logistics & NPC Interaction ---
    /** Mở/Đóng cửa hàng */
    setShopState(newState: 'OPEN' | 'CLOSED') { useCustomerStore().setShopState(newState) },
    /** Phục vụ khách hàng tại quầy thu ngân */
    serveCustomer() { return useCustomerStore().serveCustomer() },
    /** Buộc kết thúc ngày (đóng cửa và hiện báo cáo) */
    forceEndDay() { useCustomerStore().forceEndDay() },
    /** Thêm khách hàng vào hàng chờ thanh toán */
    addWaitingCustomer(price: number, instanceId: string) { useCustomerStore().addWaitingCustomer(price, instanceId) },
    
    // --- Furniture Management (Delegated to furnitureStore) ---
    moveToTierSlot(itemId: string, tierIndex: number) { 
        const shelfId = useUIStore().activeShelfId
        if (shelfId) useFurnitureStore().moveToTierSlot(shelfId, itemId, tierIndex) 
    },
    fillTierFromHand(shelfId: string, itemId: string, tierIndex: number, quantity: number) {
        return useFurnitureStore().fillTierFromHand(shelfId, itemId, tierIndex, quantity)
    },
    clearTier(shelfId: string, tierIndex: number) { useFurnitureStore().clearTier(shelfId, tierIndex) },
    takeItemFromTier(shelfId: string, tierIndex: number) { useFurnitureStore().takeItemFromTier(shelfId, tierIndex) },
    takeItemFromTierSimple(shelfId: string, tierIndex: number) { return useFurnitureStore().takeItemFromTierSimple(shelfId, tierIndex) },
    clearEntireShelf() { 
        const shelfId = useUIStore().activeShelfId
        if (shelfId) useFurnitureStore().clearEntireShelf(shelfId) 
    },
    /** NPC lấy một món đồ ngẫu nhiên từ kệ */
    npcTakeItemFromSlot(shelfId: string) { return useFurnitureStore().npcTakeItemFromSlot(shelfId) },
    /** NPC xem card trên display_case */
    npcPeekFromDisplayCase(shelfId: string) { return useFurnitureStore().npcPeekFromDisplayCase(shelfId) },
    /** NPC chốt mua card trên display_case */
    npcCommitBuyFromDisplayCase(shelfId: string, tierIdx: number, slotIdx: number, cardId: string) {
      useFurnitureStore().npcCommitBuyFromDisplayCase(shelfId, tierIdx, slotIdx, cardId)
    },
    placeCardOnDisplayCase(shelfId: string, tierIndex: number, slotIndex: number, cardId: string, customPrice: number) {
      return useFurnitureStore().placeCardOnDisplayCase(shelfId, tierIndex, slotIndex, cardId, customPrice)
    },
    
    // --- Construction & Build Mode ---
    buyFurniture(furnitureId: string) { return useFurnitureStore().buyFurniture(furnitureId) },
    startBuildMode(furnitureId: string) { 
      useUIStore().showBuildMenu = false
      useFurnitureStore().startBuildMode(furnitureId) 
    },
    cancelBuildMode() { useFurnitureStore().cancelBuildMode() },
    /** Bắt đầu đặt một món đồ vào Scene Phaser */
    placeFurniture(x: number, y: number, rotation: number = 0) { return useFurnitureStore().placeFurniture(x, y, rotation) },
    /** Thu hồi đồ vật từ Scene về kho */
    pickUpFurniture(instanceId: string, type: 'shelf' | 'table' | 'cashier') { return useFurnitureStore().pickUpFurniture(instanceId, type) },
    warehouseFurniture() { useFurnitureStore().warehouseFurniture() },
    toggleEditMode() { 
      useFurnitureStore().toggleEditMode()
      // Tự động đóng menu nếu bật Edit Mode
      if (useFurnitureStore().isEditMode) {
        useUIStore().showBuildMenu = false
      }
    },

    // --- Table & Match Logic ---
    joinTable(tableId: string, instanceId: string): number | null { return useFurnitureStore().joinTable(tableId, instanceId) },
    startMatch(tableId: string) { useFurnitureStore().startMatch(tableId) },
    finishMatch(tableId: string) { useFurnitureStore().finishMatch(tableId) },

    // --- Staff Management ---
    hireWorker(workerId: string) { return useStaffStore().hireWorker(workerId) },
    /**
     * Thay đổi nhiệm vụ nhân viên và gán vào quầy thu ngân cụ thể.
     */
    changeWorkerDuty(instanceId: string, duty: any, targetDeskId?: string) { 
      useStaffStore().changeWorkerDuty(instanceId, duty, targetDeskId) 
    },
    terminateWorker(instanceId: string) { useStaffStore().terminateWorker(instanceId) },

    // --- Gym Actions ---
    initGymLeaders() { useGymStore().initializeGymLeaders() },

    /**
     * Tích hợp loadSave từ tất cả các module.
     */
    loadSave() {
      const saved = localStorage.getItem('tcg-shop-save')
      if (saved) {
        try {
          const rawParsed = JSON.parse(saved)
          
          // Sửa lỗi và gán các giá trị mặc định nếu dữ liệu Save bị hỏng hoặc thiếu trường
          const parsed = this.sanitizeSaveData(rawParsed)

          useStatsStore().loadStats(parsed)
          useInventoryStore().loadInventory(parsed)
          useFurnitureStore().loadFurniture(parsed)
          useCustomerStore().loadCustomerState(parsed)
          useStaffStore().loadStaff(parsed)
          useGymStore().loadGymState(parsed)
          useDeliveryStore().activeBoxes = parsed.deliveryBoxes || []
          usePlayerHandStore().loadHand(parsed)
          useGradingStore().loadGradingState(parsed)
          
          console.log('[GameStore] Game loaded successfully')
        } catch (e) {
          console.error("[GameStore] Lỗi nghiêm trọng khi đọc file save. Có thể dữ liệu đã bị hỏng.", e)
          // Tùy chọn: Reset hoặc thông báo cho người dùng
        }
      }
      
      // BẮT BUỘC: Luôn khởi tạo Shop API kể cả khi không có save hoặc load lỗi
      useApiStore().initSeriesShop()
    },

    /**
     * Kiểm tra và làm sạch dữ liệu Save giúp hệ thống chống crash (Robustness).
     */
    sanitizeSaveData(data: any) {
      const safe = { ...data }
      
      // Đảm bảo các thuộc tính cơ bản luôn tồn tại
      safe.money = Number(data.money) || 1000
      safe.level = Number(data.level) || 1
      safe.currentExp = Number(data.currentExp) || 0
      safe.expansionLevel = Number(data.expansionLevel) || 0
      safe.currentDay = Number(data.currentDay) || 1
      
      // Đảm bảo Map/Object không bị null
      safe.shopInventory = data.shopInventory || {}
      safe.personalBinder = data.personalBinder || {}
      safe.placedShelves = data.placedShelves || {}
      safe.placedTables = data.placedTables || {}
      safe.placedCashiers = data.placedCashiers || {}
      safe.purchasedFurniture = data.purchasedFurniture || []
      safe.gymLeaders = data.gymLeaders || []
      safe.deliveryBoxes = data.deliveryBoxes || []
      
      safe.gradingPending = data.gradingPending || []
      safe.gradedBinder = data.gradedBinder || []
      safe.pendingPackages = data.pendingPackages || []
      
      return safe
    },

    /**
     * Tích hợp saveGame: Tổng hợp dữ liệu từ các store con.
     */
    saveGame() {
      const stats = useStatsStore()
      const inv = useInventoryStore()
      const furniture = useFurnitureStore()
      const customer = useCustomerStore()
      
      const saveData = {
        money: stats.money,
        level: stats.level,
        currentExp: stats.currentExp,
        expansionLevel: stats.expansionLevel,
        currentDay: stats.currentDay,
        shopInventory: inv.shopInventory,
        personalBinder: inv.personalBinder,
        placedShelves: furniture.placedShelves,
        placedTables: furniture.placedTables,
        placedCashiers: furniture.placedCashiers,
        purchasedFurniture: furniture.purchasedFurniture,
        shopState: customer.shopState,
        gymLeaders: useGymStore().gymLeaders,
        deliveryBoxes: useDeliveryStore().activeBoxes,
        playerHand: usePlayerHandStore().item,
        gradingPending: useGradingStore().pendingGrading,
        gradedBinder: useGradingStore().gradedBinder,
        pendingPackages: useGradingStore().pendingPackages,
      }
      localStorage.setItem('tcg-shop-save', JSON.stringify(saveData))
    },

    /**
     * startNewDay: Xử lý các thủ tục cuối ngày và bắt đầu ngày mới.
     */
    startNewDay() {
      const statsStore = useStatsStore()
      const furnitureStore = useFurnitureStore()
      const customerStore = useCustomerStore()
      const staffStore = useStaffStore()

      // 1. Thu nhập và Chi phí (Lương)
      const totalSalary = staffStore.getTotalSalary()
      statsStore.startNewDay(totalSalary)
      
      // 2. Refresh hệ thống khách hàng
      customerStore.waitingQueue = []
      customerStore.servedToday = 0
      
      // 3. Giải phóng toàn bộ ghế trên các bàn chơi
      Object.values(furnitureStore.placedTables).forEach(table => {
        table.occupants = [null, null]
        table.matchStartedAt = null
      })

      // 4. Kiểm tra thẻ đã chấm xong
      useGradingStore().checkGradingStatus()

      this.saveGame()
    },

    // === Battle Engine Control ===
    /**
     * Phát tín hiệu tạm dừng Phaser (trong khi Battle Arena đang mở).
     * MainScene lắng nghe isPaused để gọi this.scene.pause().
     */
    pauseGame() {
      this.isPaused = true
    },

    /**
     * Phát tín hiệu tiếp tục Phaser (khi Battle Arena đóng).
     */
    resumeGame() {
      this.isPaused = false
    },
  }
})
