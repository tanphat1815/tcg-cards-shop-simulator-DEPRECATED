import Phaser from 'phaser'
import playerSheet from '../assets/images/player_sheet.png'
import shelfSellingImg from '../assets/images/shelf_selling.png'
import shelfStorageImg from '../assets/images/shelf_storage.png'
import cashierDeskImg from '../assets/images/cashier_desk.png'
import playTableImg from '../assets/images/play_table.png'
import boxItemImg from '../assets/images/box_item.png'
import floorTileImg from '../assets/images/floor_tile.png'
import wallTopImg from '../assets/images/wall_top.png'
import wallSideImg from '../assets/images/wall_side.png'
import sidewalkTileImg from '../assets/images/sidewalk_tile.png'
import { TEX } from '../features/environment/assetKeys'
import { applyDynamicYSort, applyFootCollider } from '../features/environment/ySortUtils'
import { useGameStore } from '../features/shop-ui/store/gameStore'
import { useStatsStore } from '../features/stats/store/statsStore'
import { useCustomerStore } from '../features/customer/store/customerStore'
import { useStaffStore } from '../features/staff/store/staffStore'
import { WORKERS, SPEED_TO_MS } from '../features/staff/config'
import { useDeliveryStore } from '../features/inventory/store/deliveryStore'
import { useFurnitureStore } from '../features/furniture/store/furnitureStore'
import { DEPTH } from '../features/environment/config'
import { EnvironmentManager } from '../features/environment/managers/EnvironmentManager'
import { FurnitureManager } from '../features/furniture/managers/FurnitureManager'
import { NPCManager } from '../features/customer/managers/NPCManager'
import { StaffManager } from '../features/staff/managers/StaffManager'
import { TownManager } from '../features/gym/managers/TownManager'
import { DeliveryManager } from '../features/environment/managers/DeliveryManager'
import { useGymStore } from '../features/gym/store/gymStore'
import gymBuildingImg from '../assets/images/gym_building.svg'
import { AppConfig } from './config/AppConfig'

/**
 * MainScene - Trái tim điều khiển (Orchestrator) của trò chơi trong Phaser.
 * 
 * Vai trò:
 * - Khởi tạo và kết nối tất cả các Managers (Environment, Furniture, NPC, Staff).
 * - Quản lý vòng đời của Game Objects chính (Player, Camera, Graphics).
 * - Xử lý tương tác Input từ người dùng (Di chuyển, Tương tác E, Xây dựng).
 * - Đăng ký lắng nghe sự thay đổi từ Pinia Store để đồng bộ hóa Logic Web và Game Engine.
 * 
 * Cấu trúc chính:
 * 1. preload(): Tải tài nguyên (Images, Spritesheets).
 * 2. create(): Khởi tạo thế giới, Managers, Vật lý và Camera.
 * 3. update(): Vòng lặp game xử lý input và cập nhật trạng thái các Managers.
 */
export default class MainScene extends Phaser.Scene {
  // Đối tượng người chơi chính
  public player!: Phaser.Physics.Arcade.Sprite
  
  // Danh sách các Managers quản lý hệ thống con
  public environmentManager!: EnvironmentManager
  public furnitureManager!: FurnitureManager
  public npcManager!: NPCManager
  public staffManager!: StaffManager
  public deliveryManager!: DeliveryManager

  // Trạng thái điều khiển và hiển thị tạm thời (Ghost) khi xây dựng
  private keyE!: Phaser.Input.Keyboard.Key
  private ghostSprite: Phaser.GameObjects.Sprite | null = null
  private ghostRectangle: Phaser.GameObjects.Rectangle | null = null
  private ghostText: Phaser.GameObjects.Text | null = null
  private isPlacementValid: boolean = false
  private staffSprites: Map<string, Phaser.Physics.Arcade.Sprite> = new Map()
  private lastAutoCheckoutTime: number = 0
  public townManager!: TownManager
  
  // Warp Gate & Teleportation
  private gateHintText!: Phaser.GameObjects.Text
  private shopToTownGate!: Phaser.GameObjects.Text
  private gatePathway!: Phaser.GameObjects.Graphics
  private isTeleporting: boolean = false
  
  // Các lớp đồ họa (Graphics Layers) dùng để vẽ hiệu ứng đặc biệt hoặc Preview
  public previewGraphics!: Phaser.GameObjects.Graphics
  public placementGraphics!: Phaser.GameObjects.Graphics
  private editOverlay!: Phaser.GameObjects.Graphics
  private editText!: Phaser.GameObjects.Text
  private storeUnsubscribers: (() => void)[] = []
  private lastPlacementTime: number = 0

  private cursors!: {
    up: Phaser.Input.Keyboard.Key,
    down: Phaser.Input.Keyboard.Key,
    left: Phaser.Input.Keyboard.Key,
    right: Phaser.Input.Keyboard.Key,
    p: Phaser.Input.Keyboard.Key
  }

  // Các biến phục vụ tính năng kéo Camera (Drag to Pan)
  private isDraggingCamera: boolean = false
  private dragStartX = 0
  private dragStartY = 0
  private camStartX = 0
  private camStartY = 0

  // State xoay đồ vật (0 hoặc 90 độ)
  private currentRotation = 0
  
  // HUD Elements
  private debugGraphic?: Phaser.GameObjects.Graphics

  constructor() {
    super({ key: 'MainScene' })
  }

  /**
   * Tải toàn bộ tài nguyên đồ họa 2.5D.
   * 
   * QUY TẮC:
   * - Spritesheet: 32x48 per frame, layout 4 cột x 4 hàng (DOWN/LEFT/RIGHT/UP).
   * - Image furniture: origin sẽ được setOrigin(0.5, 1) khi instantiate.
   * - TẤT CẢ key phải đi qua TEX constant, không hardcode.
   */
  preload() {
    // --- Core UI & Characters ---
    this.load.spritesheet(TEX.PLAYER, playerSheet, { frameWidth: 32, frameHeight: 48 })

    // --- Dynamic Pools (NPCs & Staff) ---
    // Duyệt qua config để load toàn bộ sheet trong pool
    AppConfig.ASSETS.NPC_POOLS.forEach(pool => {
      // Dùng require() hoặc import cơ bản không hoạt động tốt cho dynamic paths ở build-time Vite. 
      // Tuy nhiên trong phát triển, ta sẽ dùng đường dẫn trực tiếp từ assets folder.
      this.load.spritesheet(pool.key, `src/assets/images/${pool.path}`, { frameWidth: 32, frameHeight: 48 })
    })

    AppConfig.ASSETS.STAFF_POOLS.forEach(pool => {
      this.load.spritesheet(pool.key, `src/assets/images/${pool.path}`, { frameWidth: 32, frameHeight: 48 })
    })

    // --- Furniture (single images) ---
    // ... (rest remains same but uses TEX keys)
    this.load.image(TEX.SHELF_SELLING, shelfSellingImg)
    this.load.image(TEX.SHELF_STORAGE, shelfStorageImg)
    this.load.image(TEX.CASHIER_DESK,  cashierDeskImg)
    this.load.image(TEX.PLAY_TABLE,    playTableImg)

    // --- Delivery ---
    this.load.image(TEX.BOX_ITEM, boxItemImg)

    // --- Environment tiles ---
    this.load.image(TEX.FLOOR_TILE,    floorTileImg)
    this.load.image(TEX.WALL_TOP,      wallTopImg)
    this.load.image(TEX.WALL_SIDE,     wallSideImg)
    this.load.image(TEX.SIDEWALK_TILE, sidewalkTileImg)
    this.load.image('gym_building',    gymBuildingImg)
  }

  /**
   * Khởi tạo thế giới game. Thứ tự thực thi ở đây rất quan trọng.
   */
  create() {
    const gameStore = useGameStore()

    // 🆕 BẮT BUỘC — đăng ký anims TRƯỚC khi spawn bất kỳ entity nào
    this.registerCharacterAnimations()

    // 1. Khởi tạo Layers đồ họa trước để các Managers có thể vẽ lên
    this.previewGraphics = this.add.graphics().setDepth(DEPTH.PREVIEW)
    this.placementGraphics = this.add.graphics().setDepth(DEPTH.PLACEMENT_VISUALIZER)
    this.editOverlay = this.add.graphics().setDepth(DEPTH.EDIT_OVERLAY).setScrollFactor(0)
    this.gatePathway = this.add.graphics().setDepth(DEPTH.FLOOR + 0.5)
    
    // 2. Khởi tạo các Managers (Dependency Injection)
    this.environmentManager = new EnvironmentManager(this)
    this.furnitureManager = new FurnitureManager(this)
    this.npcManager = new NPCManager(this, this.environmentManager)
    this.deliveryManager = new DeliveryManager(this, this.environmentManager)
    this.staffManager = new StaffManager(this, this.environmentManager, this.deliveryManager)

    // 5. Khởi tạo Gym Leaders (chỉ lần đầu) - TRƯỚC khi init Town để tránh Race Condition
    const gymStore = useGymStore()
    gymStore.initializeGymLeaders()

    this.townManager = new TownManager(this)

    // 3. Thiết lập Visuals (Animations & UI tĩnh)
    // this.setupAnimations() // XOÁ logic anim cũ
    this.setupUI()

    // 4. Thiết lập vật lý và môi trường khởi đầu
    this.physics.world.setBounds(0, 0, 5500, 3000)
    
    // 3. Khởi tạo Camera
    this.cameras.main.setBounds(0, 0, 5500, 3000)
    this.cameras.main.setBackgroundColor('#000000')
    this.cameras.main.setZoom(AppConfig.GAME.CAMERA.ZOOM)

    if (AppConfig.GAME.CAMERA.CLAMP_BOUNDS) {
      this.cameras.main.setRoundPixels(true)
    }
    
    // 5. Khởi tạo Nhân vật người chơi (Đặt tại cửa shop)
    // ==================== SPAWN PLAYER (2.5D Stardew Style) ====================
    this.environmentManager.initializeEnvironment()
    this.furnitureManager.initializeFurniture()
    this.townManager.initializeTown()

    const doorLoc = this.environmentManager.getDoorLocation()
    console.log('[MainScene] Spawning player at:', doorLoc)
    this.player = this.physics.add.sprite(doorLoc.x, doorLoc.y - 50, TEX.PLAYER, 0)
    
    // Set camera follow AFTER player is created
    this.cameras.main.startFollow(this.player, true, 0.05, 0.05)
    // Snap camera to player immediately
    this.cameras.main.centerOn(this.player.x, this.player.y)

    // R1: Foot Anchor — (x, y) represents the FOOT position (bottom-center).
    this.player.setOrigin(0.5, 1)

    // R3: Foot Collider — only the bottom 30% of the sprite is solid.
    // This allows the player's body to visually overlap shelves/walls
    // while the feet correctly collide with the base physics bodies.
    applyFootCollider(this.player, 0.3)
    this.player.refreshBody()

    // Physics
    this.player.setCollideWorldBounds(true)

    // Initial depth via Y-sort (updated every frame in update())
    applyDynamicYSort(this.player)

    // Default animation — stand facing down
    this.player.anims.play('player-down', true)
    this.player.anims.stop()

    // 6. Cấu hình va chạm (Collisions)
    this.physics.add.collider(this.player, this.environmentManager.wallsGroup)
    this.physics.add.collider(this.player, this.furnitureManager.shelvesGroup)
    this.physics.add.collider(this.player, this.furnitureManager.tablesGroup)
    this.physics.add.collider(this.player, this.furnitureManager.cashierGroup)

    // 7. Cấu hình Input (Keyboard/Mouse)
    this.setupInputs()

    // 8. Cấu hình Camera — đã được init ở mục 4 thông qua AppConfig

    // 9. Đăng ký Store Subscriptions
    this.setupStoreSubscriptions(gameStore)
    this.staffManager.syncWorkers()

    // 10. Kích hoạt các vòng lặp AI và Thời gian
    this.npcManager.initializeNPCs()

    // Vòng lặp thời gian cốt lõi: 1 giây thực = 1 phút game
    this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (gameStore.shopState === 'OPEN' && !gameStore.isBuildMode && !gameStore.isEditMode) {
          gameStore.tickTime(1)
        }
      },
      loop: true
    })

    // 11. Các tính năng mở rộng (Kéo camera, vẽ shop)
    this.setupCameraDrag()
    this.environmentManager.refreshEnvironment()

    // 12. Vẽ Cổng đi sang Gym Town (Ban đầu)
    this.shopToTownGate = this.add.text(0, 0, AppConfig.UI.TITLES.GYM_TOWN, { 
      fontSize: '20px', 
      backgroundColor: 'rgba(0,0,0,0.6)', 
      padding: { x: 10, y: 5 },
      color: '#f6e05e'
    }).setOrigin(0.5).setDepth(DEPTH.FLOOR + 1)
    
    this.refreshGates()

    // 12. Cleanup on scene shutdown/destroy
    this.events.once('shutdown', () => {
      console.log("[MainScene] Shutting down, cleaning up store subscriptions...")
      this.storeUnsubscribers.forEach(unsub => unsub())
      this.storeUnsubscribers = []
    })
  }

  /**
   * Đăng ký animation 4 hướng cho tất cả entity dùng spritesheet 4x4.
   * Naming convention: `<prefix>-<direction>`, ví dụ: 'player-down', 'npc-left', 'staff-up'.
   * 
   * Hàng 0 = DOWN (frame 0-3)
   * Hàng 1 = LEFT (frame 4-7)
   * Hàng 2 = RIGHT (frame 8-11)
   * Hàng 3 = UP   (frame 12-15)
   */
  private registerCharacterAnimations() {
    const defs: Array<{ prefix: string, key: string }> = [
      { prefix: 'player', key: TEX.PLAYER },
      { prefix: 'npc',    key: TEX.NPC },
      { prefix: 'staff',  key: TEX.STAFF }
    ]

    const dirRows: Array<{ dir: string, start: number }> = [
      { dir: 'down',  start: 0 },
      { dir: 'left',  start: 4 },
      { dir: 'right', start: 8 },
      { dir: 'up',    start: 12 }
    ]

    for (const { prefix, key } of defs) {
      for (const { dir, start } of dirRows) {
        const animKey = `${prefix}-${dir}`
        if (this.anims.exists(animKey)) continue // Idempotent — tránh re-register khi scene restart
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(key, { start, end: start + 3 }),
          frameRate: 8,
          repeat: -1
        })
      }
    }
  }



  /**
   * Khởi tạo các phần tử UI overlay trong Phaser (như text báo chế độ Setup)
   */
  private setupUI() {
    this.editText = this.add.text(this.cameras.main.width / 2, 80, 'SHOP SETUP MODE', { 
      fontSize: '32px', 
      color: '#00ffff', 
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setDepth(DEPTH.UI).setScrollFactor(0).setVisible(false)

    this.gateHintText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height - 100, 'Bấm [E] để dịch chuyển', {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setDepth(DEPTH.UI).setScrollFactor(0).setVisible(false)
  }

  /**
   * Gán các phím điều khiển từ bàn phím.
   */
  private setupInputs() {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        p: Phaser.Input.Keyboard.KeyCodes.P
      }) as any
      
      this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E)
      
      // Phím X để bật/tắt nhanh chế độ chỉnh sửa nội thất
      this.input.keyboard.on('keydown-X', () => {
        useGameStore().toggleEditMode()
      })

      // Phím R để xoay đồ vật khi đang trong chế độ Build/Edit
      this.input.keyboard.on('keydown-R', () => {
        this.currentRotation = (this.currentRotation === 0) ? 90 : 0
        // Xóa Ghost cũ để vẽ lại theo hướng mới
        this.clearGhost()
      })

    }
  }

  /**
   * Thiết lập tính năng kéo Camera bằng chuột phải hoặc chuột giữa.
   * Giúp người chơi quan sát shop rộng khi không di chuyển.
   */
  private setupCameraDrag() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Chuột phải (2) hoặc chuột giữa (1)
      if (pointer.button === 1 || pointer.button === 2) {
        this.isDraggingCamera = true
        this.cameras.main.stopFollow() // Tạm dừng bám theo Player
        
        this.dragStartX = pointer.x
        this.dragStartY = pointer.y
        this.camStartX = this.cameras.main.scrollX
        this.camStartY = this.cameras.main.scrollY
      }
    })

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isDraggingCamera) {
        const dx = pointer.x - this.dragStartX
        const dy = pointer.y - this.dragStartY
        this.cameras.main.scrollX = this.camStartX - dx
        this.cameras.main.scrollY = this.camStartY - dy
      }
    })

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 1 || pointer.button === 2) {
        this.isDraggingCamera = false
        // Quay trở lại bám theo Player nếu Player có di chuyển
        this.time.delayedCall(2000, () => {
          if (!this.isDraggingCamera && (this.player.body!.velocity.x !== 0 || this.player.body!.velocity.y !== 0)) {
            this.cameras.main.startFollow(this.player, true, 0.05, 0.05)
          }
        })
      }
    })

    this.input.mouse?.disableContextMenu()
  }

  /**
   * Đăng ký lắng nghe các Store (Pinia) thay đổi. 
   */
  private setupStoreSubscriptions(gameStore: any) {
    const statsStore = useStatsStore()
    const customerStore = useCustomerStore()
    const staffStore = useStaffStore()

    let lastExpansionLevel = statsStore.expansionLevel
    let lastSettings = JSON.stringify(statsStore.settings)

    // Theo dõi Cài đặt và Mở rộng diện tích
    const unsubStats = statsStore.$subscribe((_mutation, state) => {
      const currentSettings = JSON.stringify(state.settings)
      if (state.expansionLevel !== lastExpansionLevel || currentSettings !== lastSettings) {
        lastExpansionLevel = state.expansionLevel
        lastSettings = currentSettings
        this.environmentManager.refreshEnvironment()
        this.refreshGates() // Tự động dời cổng đi theo sự mở rộng của Shop
      }
    })

    // Theo dõi thay đổi nhân sự (Thuê/Sa thải nhân viên)
    const unsubStaff = staffStore.$subscribe(() => {
      this.staffManager.syncWorkers()
    })

    // Lắng nghe shopState thay đổi (ví dụ: spawn NPC khi mở cửa)
    const unsubCustomer = customerStore.$subscribe((_mutation, state) => {
       // Refresh khi mở rộng hoặc thay đổi trạng thái shop
       if (state.shopState === 'OPEN') {
         // Thực hiện các logic khi mở cửa nếu cần
       }
    })

    // Theo dõi trạng thái kết thúc ngày (Xóa sạch NPC khách)
    const unsubGame = gameStore.$subscribe((_mutation: any, state: any) => {
      if (state.showEndDayModal) {
        this.npcManager.cleanupAllNPCs()
      }

      // Tạm dừng/Tiếp tục Phaser khi Battle Arena mở/đóng để tiết kiệm CPU
      if (state.isPaused) {
        // Pause vòng lặp game — NPC, physics, animation đều dừng lại
        this.scene.pause()
      } else {
        // Resume lại khi Battle kết thúc
        if (this.scene.isPaused()) {
          this.scene.resume()
        }
      }
    })

    // CHỐT: Thu thập tất cả các hàm hủy đăng ký để dọn dẹp khi scene shutdown
    this.storeUnsubscribers.push(unsubStats, unsubStaff, unsubCustomer, unsubGame)
  }

  /**
   * Cập nhật trạng thái hiển thị Debug Physics dựa trên Settings.
   *
   * When enabled, Phaser draws purple outlines around every active physics body.
   * Use this to verify that applyFootCollider() is correctly placing hitboxes
   * at the bottom 30% of sprites. The purple box should sit strictly at the
   * feet/base of the Player, NPCs, and furniture sprites.
   *
   * To enable in-game: open Settings (⚙️) and toggle "Hiển thị vùng va chạm".
   * To enable immediately for debugging, temporarily set:
   *   this.physics.world.debugGraphic — see createDebugGraphic() below.
   */
  private updateDebugPhysics() {
    const statsStore = useStatsStore()
    if (!this.debugGraphic) {
      // createDebugGraphic() returns a Graphics object that Phaser auto-populates
      // each frame with coloured outlines:
      //   Purple  = static body (walls, furniture)
      //   Red     = dynamic body (player, NPC)
      //   Green   = overlap/sensor zone
      this.debugGraphic = this.physics.world.createDebugGraphic()
      this.debugGraphic.setDepth(99999) // Always render on top of everything
    }
    this.debugGraphic.setVisible(statsStore.settings.showDebugPhysics)
  }

  /**
   * Vòng lặp Game chính (60fps).
   */
  update(time: number, _delta: number) {
    if (!this.cursors || !this.player.body || !this.keyE) return

    const store = useGameStore()

    // 1. Cập nhật logic các Managers (Tạm dừng khi đang Edit/Build)
    if (!store.isBuildMode && !store.isEditMode) {
      this.npcManager.update()
      this.furnitureManager.updateFurnitureVisuals()
      this.staffManager.update(time)
      this.deliveryManager.update(time, this.player.x, this.player.y)

      // 3. Xử lý nhân viên hỗ trợ thanh toán (Auto Checkout)
      this.handleAutoCheckout(time)
    }

    // 2. Xử lý tương tác nhấn phím E (Thanh toán/Quản lý kệ)
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.handlePlayerInteraction(store)
    }

    // 4. Phân luồng điều khiển: Chế độ Xây dựng/Chỉnh sửa vs Chế độ Di chuyển
    if (store.isBuildMode || store.isEditMode) {
      this.handleBuildMode(store)
      this.player.setVelocity(0) // Khóa người chơi khi đang đặt đồ
      this.player.anims.stop()
    } else {
      this.handlePlayerMovement()
      this.clearGhostIfNecessary()
    }

    // Cập nhật trạng thái Debug Physics
    this.updateDebugPhysics()
    
    // 1. Phục hồi Scale nếu Camera bị thay đổi
    // (Logic này sẽ được bổ sung nếu cần thiết)

    // 5. Cập nhật hiệu ứng lớp phủ Border khi ở chế độ chỉnh sửa
    this.updateEditOverlay(store)

    // 6. Phím tắt Diagnostic (Chạy báo cáo hệ thống khi nhấn P)
    if (Phaser.Input.Keyboard.JustDown(this.cursors.p)) {
      this.runDiagnostics()
    }

    // 8. Chuyển vùng Shop/Town (Phân tích tọa độ để sync store)
    this.handleAreaTransition()

    // 9. Update Town Manager (detect Gym proximity)
    if (this.townManager) {
      this.townManager.update(this.player.x, this.player.y)
    }

    // 10. Hiển thị gợi ý phím [E] khi gần cổng
    this.updateGateHints()

    // 🆕 R2: Y-Sort cho Player mỗi frame
    applyDynamicYSort(this.player)
  }

  /** Đồng bộ trạng thái isPlayerInTown dựa trên tọa độ thực tế */
  private handleAreaTransition() {
    const gymStore = useGymStore()
    const isInTownX = this.player.x > TownManager.TOWN_START_X - 100

    if (isInTownX !== gymStore.isPlayerInTown) {
      gymStore.setPlayerInTown(isInTownX)
    }
  }

  /** Làm mới vị trí cổng và vẽ đoạn đường dựa trên kích thước Shop hiện tại */
  public refreshGates() {
    if (!this.environmentManager || !this.shopToTownGate) return

    // Lấy tọa độ từ zone đã tính (KHÔNG hardcode)
    const wz = this.environmentManager.warpGateZone
    const doorPos = this.environmentManager.getDoorLocation()

    // 1. Di chuyển text cổng Gym sang warpGateZone
    this.shopToTownGate.setPosition(wz.x, wz.y)

    // 2. Vẽ lại pathway — chỉ nối từ cửa đến warpGateZone (không kéo dài sang trái)
    this.gatePathway.clear()
    this.gatePathway.fillStyle(0x34495e, 1)

    const pathW = 60
    // Đường dọc từ doorPos xuống giao với sidewalk
    const pathFromY = doorPos.y
    const pathToY = wz.y + 20

    this.gatePathway.fillRect(doorPos.x - pathW / 2, pathFromY, pathW, pathToY - pathFromY)

    // Đường ngang từ cửa sang phải đến warpGate (trên nền sidewalk)
    const hPathY = doorPos.y + 80 // Giữa sidewalk
    const hPathH = 30
    this.gatePathway.fillRect(doorPos.x, hPathY, wz.x - doorPos.x + 20, hPathH)
  }

  /** Hiển thị hint [E] khi đứng gần cổng dịch chuyển */
  private updateGateHints() {
    if (this.isTeleporting) {
      this.gateHintText.setVisible(false)
      return
    }

    // Dùng tọa độ từ zone (không dùng magic numbers)
    const wz = this.environmentManager.warpGateZone
    const GATE_DETECT_RADIUS = 80 // px

    const distToTownGate = Phaser.Math.Distance.Between(
      this.player.x, this.player.y,
      wz.x, wz.y
    )

    // Cổng quay về Shop (vẫn giữ logic cũ với TownManager.TOWN_START_X)
    const distToShopGate = Phaser.Math.Distance.Between(
      this.player.x, this.player.y,
      TownManager.TOWN_START_X + 50, 500
    )

    if (distToTownGate < GATE_DETECT_RADIUS) {
      this.gateHintText.setText(AppConfig.UI.MESSAGES.GO_TO_GYM).setVisible(true)
    } else if (distToShopGate < GATE_DETECT_RADIUS) {
      this.gateHintText.setText(AppConfig.UI.MESSAGES.RETURN_TO_SHOP).setVisible(true)
    } else {
      this.gateHintText.setVisible(false)
    }
  }

  /** Thực hiện hiệu ứng dịch chuyển chuyên nghiệp */
  private performTeleport(targetX: number, targetY: number, toTown: boolean) {
    if (this.isTeleporting) return
    this.isTeleporting = true
    
    const gymStore = useGymStore()

    // 1. Fade Out
    this.cameras.main.fadeOut(300, 0, 0, 0)
    
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      // 2. Dịch chuyển tọa độ
      this.player.setPosition(targetX, targetY)
      gymStore.setPlayerInTown(toTown)
      
      // Khóa di chuyển 1 chút để tránh lỗi kẹt
      this.player.setVelocity(0)
      
      // 3. Fade In
      this.cameras.main.fadeIn(300, 0, 0, 0)
      this.isTeleporting = false
    })
  }

  /**
   * Tương tác của người chơi với vật thể gần nhất khi nhấn E.
   */
  private handlePlayerInteraction(store: any) {
    // Ưu tiên 0: Cổng dịch chuyển (Teleport)
    const doorPos = this.environmentManager.getDoorLocation()
    const wz = this.environmentManager.warpGateZone
    const distToTown = Phaser.Math.Distance.Between(this.player.x, this.player.y, wz.x, wz.y)
    const distToShop = Phaser.Math.Distance.Between(this.player.x, this.player.y, TownManager.TOWN_START_X + 50, 500)

    if (distToTown < 80) {
      this.performTeleport(TownManager.TOWN_START_X + 150, 500, true)
      return
    } else if (distToShop < 80) {
      this.performTeleport(doorPos.x, doorPos.y + 100, false)
      return
    }

    // Ưu tiên 1: Giao hàng lên kệ (nếu đang cầm box) hoặc mở Build Mode (nếu cầm Furniture)
    if (this.deliveryManager) {
      const deliveryStore = useDeliveryStore()
      const nearestShelfForDelivery = this.getNearestFromGroup(this.furnitureManager.shelvesGroup, 70)
      
      if (nearestShelfForDelivery) {
        const handled = this.deliveryManager.handleShelfInteraction(nearestShelfForDelivery.getData('id'))
        if (handled) return
      } else if (deliveryStore.carriedBox?.type === 'furniture') {
        const furnitureStore = useFurnitureStore()
        furnitureStore.startBuildMode(deliveryStore.carriedBox.itemId)
        this.deliveryManager.removeCarriedBox()
        deliveryStore.dropBox()
        return
      }
    }

    // Ưu tiên 2: Thanh toán tại quầy
    let nearestCashier = this.getNearestFromGroup(this.furnitureManager.cashierGroup, 80)
    if (nearestCashier && store.waitingCustomers > 0) {
      store.serveCustomer()
      return
    }

    // Ưu tiên 2: Quản lý hàng hóa trên kệ
    let nearestShelf = this.getNearestFromGroup(this.furnitureManager.shelvesGroup, 70)
    if (nearestShelf) {
      store.openShelfManagement(nearestShelf.getData('id'))
    }
  }

  /**
   * Tìm kiếm vật thể gần nhất trong một Physics Group.
   */
  private getNearestFromGroup(group: Phaser.Physics.Arcade.StaticGroup, maxDist: number): Phaser.Physics.Arcade.Sprite | null {
    let nearest: Phaser.Physics.Arcade.Sprite | null = null
    let minDist = maxDist
    group.getChildren().forEach(child => {
      const sprite = child as Phaser.Physics.Arcade.Sprite
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y)
      if (dist < minDist) {
        minDist = dist
        nearest = sprite
      }
    })
    return nearest
  }

  /**
   * Xử lý di chuyển vật lý của Player (2.5D).
   * 
   * Thay đổi so với phiên bản cũ:
   * - Chọn animation 4 hướng theo trục vận tốc LỚN HƠN (R4).
   * - Idle = dừng anim ở frame đầu tiên của hướng hiện tại (không phải stop trắng).
   * - Y-sort được update ở cuối update() — không gọi ở đây.
   */
  private handlePlayerMovement() {
    this.player.setVelocity(0)
    const speed = 160
    let isMoving = false

    // --- X axis ---
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-speed)
      isMoving = true
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(speed)
      isMoving = true
    }

    // --- Y axis ---
    if (this.cursors.up.isDown) {
      this.player.setVelocityY(-speed)
      isMoving = true
    } else if (this.cursors.down.isDown) {
      this.player.setVelocityY(speed)
      isMoving = true
    }

    // Normalize diagonal movement so speed is consistent
    if (isMoving) {
      this.player.body!.velocity.normalize().scale(speed)

      // R4: Choose animation direction based on dominant axis
      const vx = this.player.body!.velocity.x
      const vy = this.player.body!.velocity.y

      if (Math.abs(vx) > Math.abs(vy)) {
        this.player.anims.play(vx < 0 ? 'player-left' : 'player-right', true)
      } else {
        this.player.anims.play(vy < 0 ? 'player-up' : 'player-down', true)
      }
    } else {
      // Idle — freeze at current frame
      if (this.player.anims.isPlaying) {
        this.player.anims.stop()
      }
    }
    // R2: Y-Sort is applied every frame in update() via applyDynamicYSort(this.player)
    // — do NOT call setDepth here to avoid double-writes.
  }

  /**
   * Tự động thanh toán nếu có nhân viên được phân công Duty 'CHECKOUT'.
   */
  private handleAutoCheckout(time: number) {
    const store = useGameStore()
    if (store.waitingCustomers <= 0) return

    const cashier = store.hiredWorkers.find((w: any) => w.duty === 'CHECKOUT')
    if (!cashier) return

    const workerData = WORKERS.find(w => w.id === cashier.dataId)
    if (!workerData) return

    const cooldown = SPEED_TO_MS[workerData.checkoutSpeed]
    if (time > this.lastAutoCheckoutTime + cooldown) {
      store.serveCustomer()
      this.lastAutoCheckoutTime = time
      
      const cashierSprite = this.staffSprites.get(cashier.instanceId)
      if (cashierSprite) {
        const pulse = this.add.text(cashierSprite.x, cashierSprite.y - 40, '💳 Auto', { fontSize: '10px', color: '#ffffff' }).setOrigin(0.5)
        this.tweens.add({ targets: pulse, y: pulse.y - 20, alpha: 0, duration: 1000, onComplete: () => pulse.destroy() })
      }
    }
  }

  /**
   * Xử lý luồng Xây dựng & Chỉnh sửa nội thất.
   */
  private handleBuildMode(store: any) {
    const pointer = this.input.activePointer

    // 1. Logic Chỉnh sửa (Cầm đồ vật hiện có lên)
    if (store.isEditMode && !store.isBuildMode) {
      if (pointer.isDown && this.time.now > this.lastPlacementTime + 200) {
        this.handleFurniturePickup(pointer, store)
      }
      return
    }

    if (!store.isBuildMode) return

    // 2. Logic Đặt đồ mới (Hiển thị Ghost Preview)
    this.updateGhostPosition(pointer, store)
    this.drawPlacementVisualizer()

    // Kiểm tra tính hợp lệ (có bị chạm tường hay đè lên đồ khác không)
    this.isPlacementValid = this.validatePlacement(pointer)
    this.updateGhostVisual()

    // Thực hiện đặt đồ khi nhấn chuột
    if (pointer.isDown && this.isPlacementValid && this.time.now > this.lastPlacementTime + 300) {
       this.placeFurniture(pointer, store)
    }

    // Thoát chế độ khi nhấn chuột phải hoặc phím ESC
    const escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    if (Phaser.Input.Keyboard.JustDown(escKey!) || pointer.rightButtonDown()) {
      this.cancelPlacement(store)
    }
  }

  /**
   * Thu hồi nội thất đang đặt trong shop về kho.
   */
  private handleFurniturePickup(pointer: Phaser.Input.Pointer, store: any) {
    let found = false
    const checkGroups = [
      { group: this.furnitureManager.cashierGroup, type: 'cashier' as const },
      { group: this.furnitureManager.shelvesGroup, type: 'shelf' as const },
      { group: this.furnitureManager.tablesGroup, type: 'table' as const }
    ]

    for (const { group, type } of checkGroups) {
      group.getChildren().forEach(child => {
        const sprite = child as Phaser.Physics.Arcade.Sprite
        const bounds = type === 'table' ? new Phaser.Geom.Rectangle(sprite.x - 30, sprite.y - 20, 60, 40) : sprite.getBounds()
        
        if (bounds.contains(pointer.worldX, pointer.worldY)) {
          const id = sprite.getData('id')
          if (store.pickUpFurniture(id, type)) {
            found = true
            this.furnitureManager.removeFurniture(id, type)
            sprite.destroy()
            this.lastPlacementTime = this.time.now
          }
        }
      })
      if (found) break
    }
  }

  /**
   * Central mapping logic for furniture visual profiles.
   * Matches FurnitureManager.ts logic exactly.
   */
  private getFurnitureProfile(furnitureId: string) {
    let texture: string = TEX.SHELF_SELLING
    let scX = 1.0
    let scY = 1.0
    let tint = 0xffffff
    let ratio = 0.2

    switch (furnitureId) {
      case 'play_table':
        texture = TEX.PLAY_TABLE
        ratio = 0.2
        break
      case 'cashier_desk':
        texture = TEX.CASHIER_DESK
        ratio = 0.3
        break
      case 'shelf_single':
        texture = TEX.SHELF_SELLING
        scX = 1.1; scY = 1.1
        break
      case 'shelf_double':
        texture = TEX.SHELF_SELLING
        scX = 1.2; scY = 1.0
        tint = 0x8B4513 // Dark Brown
        break
      case 'storage_shelf':
        texture = TEX.SHELF_STORAGE
        break
      case 'warehouse_shelf':
        texture = TEX.SHELF_STORAGE
        scX = 1.1; scY = 1.1
        break
    }

    return { texture, scX, scY, tint, ratio }
  }

  /**
   * Cập nhật vị trí bóng mờ (Ghost) của vật dụng đang định đặt.
   */
  private updateGhostPosition(pointer: Phaser.Input.Pointer, store: any) {
    if (!this.ghostSprite && !this.ghostRectangle) {
      const furnitureId = store.buildItemId || store.editFurnitureData?.furnitureId
      const profile = this.getFurnitureProfile(furnitureId)
      
      if (furnitureId === 'play_table') {
        const isVer = this.currentRotation === 90
        const w = isVer ? 40 : 80
        const h = isVer ? 80 : 40
        
        const container = this.add.container(0, 0)
        const rect = this.add.rectangle(0, 0, w, h, 0x7f8c8d).setStrokeStyle(2, 0x95a5a6)
        container.add(rect)
        
        if (isVer) {
           container.add(this.add.rectangle(0, -h/2 - 10, 24, 20, 0x7f8c8d, 0.5))
           container.add(this.add.rectangle(0, h/2 + 10, 24, 20, 0x7f8c8d, 0.5))
        } else {
           container.add(this.add.rectangle(-w/2 - 10, 0, 20, 24, 0x7f8c8d, 0.5))
           container.add(this.add.rectangle(w/2 + 10, 0, 20, 24, 0x7f8c8d, 0.5))
        }
        
        container.setAlpha(0.6).setDepth(DEPTH.GHOST)
        this.ghostRectangle = container as any
        
        this.ghostText = this.add.text(0, -h/2 - 20, AppConfig.UI.MESSAGES.PLACE_HINT, { fontSize: '10px', color: '#fff' }).setOrigin(0.5)
        this.ghostText.setDepth(DEPTH.GHOST + 1)
      } else {
        this.ghostSprite = this.add.sprite(0, 0, profile.texture)
        this.ghostSprite.setScale(profile.scX, profile.scY)
        this.ghostSprite.setTint(profile.tint)
        this.ghostSprite.setAlpha(0.6).setDepth(DEPTH.GHOST)
      }
    }

    if (this.ghostRectangle) {
      this.ghostRectangle.setPosition(pointer.worldX, pointer.worldY)
      if (this.ghostText) this.ghostText.setPosition(pointer.worldX, pointer.worldY)
    } else if (this.ghostSprite) {
      // R1: Foot anchor (0.5, 1) to match placed furniture
      this.ghostSprite.setOrigin(0.5, 1)
      this.ghostSprite.setPosition(pointer.worldX, pointer.worldY)
    }
  }

  /**
   * Kiểm tra điều kiện đặt đồ:
   * - Phải nằm trong diện tích shop.
   * - Không được đè lên đồ nội thất khác hoặc tường.
   * - Không được đè lên vị trí người chơi đang đứng.
   */
  private validatePlacement(pointer: Phaser.Input.Pointer): boolean {
    const pad = 10 // Giảm từ 30 xuống 10 để cho phép đặt đồ sát tường hơn
    const bounds = this.environmentManager.getShopBounds()
    
    // Kiểm tra nằm ngoài Shop
    if (pointer.worldX < bounds.x + pad || pointer.worldX > bounds.x + bounds.w - pad ||
        pointer.worldY < bounds.y + pad || pointer.worldY > bounds.y + bounds.h - pad) {
      return false
    }

    // R3: 2.5D Placement Check — calculate narrow "footprint" box
    const furnitureId = useGameStore().buildItemId || useGameStore().editFurnitureData?.furnitureId
    const profile = this.getFurnitureProfile(furnitureId || '')

    let w = 30
    let h = 30
    if (this.ghostSprite) {
      w = this.ghostSprite.displayWidth
      h = this.ghostSprite.displayHeight * profile.ratio
    } else if (this.ghostRectangle) {
      w = (this.ghostRectangle as any).width || 80
      h = ((this.ghostRectangle as any).height || 40) * profile.ratio
    }

    // Since Origin is (0.5, 1), pointer is at the feet.
    const rect = new Phaser.Geom.Rectangle(pointer.worldX - w/2, pointer.worldY - h, w, h)

    const obstacleGroups = [
      this.environmentManager.wallsGroup,
      this.furnitureManager.cashierGroup,
      this.furnitureManager.shelvesGroup,
      this.furnitureManager.tablesGroup
    ]

    for (const group of obstacleGroups) {
      for (const child of group.getChildren()) {
        const sprite = child as any
        if (useGameStore().editFurnitureData?.id === sprite.getData('id')) continue
        
        // CHECK PHYSICS BODY, NOT VISUAL BOUNDS
        const body = sprite.body as Phaser.Physics.Arcade.Body
        if (!body) continue

        const obstacleRect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height)
        if (Phaser.Geom.Intersects.RectangleToRectangle(rect, obstacleRect)) return false
      }
    }

    // Không được đặt đè lên người chơi
    if (Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, this.player.x, this.player.y) < 50) return false

    return true
  }

  private updateGhostVisual() {
    const alpha = 0.6
    const depth = DEPTH.GHOST + 10 // Đảm bảo luôn nằm trên cùng
    
    // Nếu là Container (Bàn chơi)
    if (this.ghostRectangle instanceof Phaser.GameObjects.Container) {
      this.ghostRectangle.setDepth(depth)
      this.ghostRectangle.iterate((child: any) => {
        if (child instanceof Phaser.GameObjects.Shape) {
          child.setFillStyle(this.isPlacementValid ? 0x7f8c8d : 0xff0000, alpha)
        }
      })
    } 
    // Nếu là Rectangle thông thường
    else if (this.ghostRectangle instanceof Phaser.GameObjects.Rectangle) {
      this.ghostRectangle.setDepth(depth)
      this.ghostRectangle.setFillStyle(this.isPlacementValid ? 0x7f8c8d : 0xff0000, alpha)
    }
    // Nếu là Sprite
    else if (this.ghostSprite) {
      this.ghostSprite.setDepth(depth)
      this.ghostSprite.setTint(this.isPlacementValid ? 0xffffff : 0xff0000)
      this.ghostSprite.setAlpha(alpha)
    }
  }

  private placeFurniture(pointer: Phaser.Input.Pointer, store: any) {
    const placedData = store.placeFurniture(pointer.worldX, pointer.worldY, this.currentRotation)
    this.lastPlacementTime = this.time.now
    this.currentRotation = 0 // Reset rotation cho lần tới
    
    if (placedData) {
      this.furnitureManager.addFurnitureToScene(placedData)
    }
    this.clearGhost()
  }

  private cancelPlacement(store: any) {
    if (store.editFurnitureData) store.warehouseFurniture()
    else store.cancelBuildMode()
    this.clearGhost()
  }

  private clearGhost() {
    if (this.ghostRectangle) {
      this.ghostRectangle.destroy()
      this.ghostRectangle = null
      if (this.ghostText) this.ghostText.destroy()
      this.ghostText = null
    }
    if (this.ghostSprite) {
      this.ghostSprite.destroy()
      this.ghostSprite = null
    }
    this.placementGraphics.clear()
  }

  private clearGhostIfNecessary() {
    if (this.ghostSprite || this.ghostRectangle) this.clearGhost()
  }

  /**
   * Vẽ vùng báo hiệu vật cản (vùng đỏ) khi ở chế độ đặt đồ.
   * Nếu ở chế độ Debug, vẽ thêm biên giới shop để người dùng nhận diện vùng pad.
   */
  private drawPlacementVisualizer() {
    this.placementGraphics.clear()
    
    const store = useGameStore()
    const statsStore = useStatsStore()
    const bounds = this.environmentManager.getShopBounds()
    const pad = 10

    // 1. Vẽ vùng biên giới shop (Chỉ hiện khi Debug G được bật)
    if (statsStore.settings.showDebugPhysics) {
      this.placementGraphics.lineStyle(2, 0x00ff00, 0.5)
      this.placementGraphics.strokeRect(bounds.x + pad, bounds.y + pad, bounds.w - pad*2, bounds.h - pad*2)
      
      // Vẽ vùng "Cấm" phía ngoài pad
      this.placementGraphics.fillStyle(0xff0000, 0.1)
      this.placementGraphics.fillRect(bounds.x, bounds.y, bounds.w, pad) // Top
      this.placementGraphics.fillRect(bounds.x, bounds.y + bounds.h - pad, bounds.w, pad) // Bottom
      this.placementGraphics.fillRect(bounds.x, bounds.y, pad, bounds.h) // Left
      this.placementGraphics.fillRect(bounds.x + bounds.w - pad, bounds.y, pad, bounds.h) // Right
    }

    // 2. Vẽ vùng chân (Ghost Footprint) đang định đặt
    if (this.ghostSprite || this.ghostRectangle) {
      const isValid = this.validatePlacement(this.input.activePointer)
      this.placementGraphics.fillStyle(isValid ? 0x00ff00 : 0xff0000, 0.4)
      
      const furnitureId = store.buildItemId || store.editFurnitureData?.furnitureId
      const profile = this.getFurnitureProfile(furnitureId || '')

      let w = 30
      let h = 30
      if (this.ghostSprite) {
        w = this.ghostSprite.displayWidth
        h = this.ghostSprite.displayHeight * profile.ratio
      } else if (this.ghostRectangle) {
        w = (this.ghostRectangle as any).width || 80
        h = ((this.ghostRectangle as any).height || 40) * profile.ratio
      }

      this.placementGraphics.fillRect(this.input.activePointer.worldX - w/2, this.input.activePointer.worldY - h, w, h)
      this.placementGraphics.lineStyle(2, isValid ? 0x00ff00 : 0xff0000, 1)
      this.placementGraphics.strokeRect(this.input.activePointer.worldX - w/2, this.input.activePointer.worldY - h, w, h)
    }

    // 2. Vẽ vùng va chạm (Physics Bodies) của các nội thất và tường
    // Chúng ta dùng màu Hồng (Magenta) để người chơi dễ dàng kiểm chứng tỷ lệ chân.
    this.placementGraphics.fillStyle(0xff00ff, 0.3)
    this.placementGraphics.lineStyle(1, 0xff00ff, 1)

    const obstacleGroups = [
      this.environmentManager.wallsGroup,
      this.furnitureManager.cashierGroup,
      this.furnitureManager.shelvesGroup,
      this.furnitureManager.tablesGroup
    ]

    obstacleGroups.forEach(group => {
      group.getChildren().forEach(child => {
        const sprite = child as Phaser.Physics.Arcade.Sprite
        const body   = sprite.body as Phaser.Physics.Arcade.Body
        if (!body) return
        
        if (store.editFurnitureData?.id === sprite.getData('id')) return
        
        // Vẽ chính xác hình chữ nhật va chạm (Physical Hitbox)
        this.placementGraphics.fillRect(body.x, body.y, body.width, body.height)
        this.placementGraphics.strokeRect(body.x, body.y, body.width, body.height)
      })
    })
  }

  /**
   * Cập nhật lớp phủ (Overlay) thông báo người chơi đang ở chế độ Chỉnh sửa nội thất.
   */
  private updateEditOverlay(store: any) {
    this.editOverlay.clear()
    if (store.isEditMode) {
      this.editOverlay.lineStyle(15, 0x00ffff, 0.4)
      this.editOverlay.strokeRect(0, 0, this.scale.width, this.scale.height)
      this.editText.setVisible(true)
    } else {
      this.editText.setVisible(false)
    }
  }

  /**
   * Chạy báo cáo tình trạng hệ thống Game hiện tại (Diagnostic). 
   * Hữu ích cho việc Debug.
   */
  private runDiagnostics() {
    const store = useGameStore()
    console.log("=== DIAGNOSTIC REPORT ===")
    console.log("NPC Count:", this.npcManager.getNPCCount())
    console.log("Placed Tables:", Object.keys(store.placedTables).length)
    console.log("Expansion Level:", store.expansionLevel)
    console.log("===============================")
  }
}
