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
import {
  applyDynamicYSort,
  applyFootCollider,
  createDropShadow,
  updateDropShadow
} from '../features/environment/ySortUtils'
import { PlayerFSM } from './PlayerFSM'
import { useGameStore } from '../features/shop-ui/store/gameStore'
import { useStatsStore } from '../features/stats/store/statsStore'
import { useCustomerStore } from '../features/customer/store/customerStore'
import { useStaffStore } from '../features/staff/store/staffStore'
import { useCheckoutStore } from '../features/inventory/store/checkoutStore'
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
import { aStarGrid } from '../features/environment/managers/AStarGridManager'
import gymBuildingImg from '../assets/images/gym_building.svg'
import { AppConfig } from './config/AppConfig'
import { eventBus, EVENTS } from '../features/shared/EventBus'
import { GAME_BALANCE } from '../config/gameConfig'

export default class MainScene extends Phaser.Scene {
  // ── Entities ─────────────────────────────────────────────────────────────────
  public player!: Phaser.Physics.Arcade.Sprite
  private playerShadow!: Phaser.GameObjects.Graphics
  private playerFSM!: PlayerFSM

  // ── Managers ─────────────────────────────────────────────────────────────────
  public environmentManager!: EnvironmentManager
  public furnitureManager!: FurnitureManager
  public npcManager!: NPCManager
  public staffManager!: StaffManager
  public deliveryManager!: DeliveryManager
  public townManager!: TownManager

  // ── Build mode internals ──────────────────────────────────────────────────────
  private keyE!: Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key
  private ghostSprite: Phaser.GameObjects.Sprite | null = null
  private ghostRectangle: Phaser.GameObjects.Rectangle | null = null
  private ghostText: Phaser.GameObjects.Text | null = null
  private isPlacementValid: boolean = false
  private lastAutoCheckoutTime: number = 0
  public previewGraphics!: Phaser.GameObjects.Graphics
  public placementGraphics!: Phaser.GameObjects.Graphics
  private editOverlay!: Phaser.GameObjects.Graphics
  private editText!: Phaser.GameObjects.Text
  private storeUnsubscribers: (() => void)[] = []
  private lastPlacementTime: number = 0

  // ── Camera drag ──────────────────────────────────────────────────────────────
  private isDraggingCamera: boolean = false
  private dragStartX = 0; private dragStartY = 0
  private camStartX  = 0; private camStartY  = 0

  // ── Misc ─────────────────────────────────────────────────────────────────────
  private currentRotation = 0
  private debugGraphic?: Phaser.GameObjects.Graphics
  private gateHintText!: Phaser.GameObjects.Text
  private shopToTownGate!: Phaser.GameObjects.Text
  private gatePathway!: Phaser.GameObjects.Graphics
  private isTeleporting: boolean = false
  private cursors!: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
    p: Phaser.Input.Keyboard.Key
  }

  constructor() { super({ key: 'MainScene' }) }

  // ─────────────────────────────────────────────────────────────────────────────
  preload() {
    this.load.spritesheet(TEX.PLAYER, playerSheet, { frameWidth: 32, frameHeight: 48 })
    AppConfig.ASSETS.NPC_POOLS.forEach(pool =>
      this.load.spritesheet(pool.key, `src/assets/images/${pool.path}`, { frameWidth: 32, frameHeight: 48 })
    )
    AppConfig.ASSETS.STAFF_POOLS.forEach(pool =>
      this.load.spritesheet(pool.key, `src/assets/images/${pool.path}`, { frameWidth: 32, frameHeight: 48 })
    )
    this.load.image(TEX.SHELF_SELLING,  shelfSellingImg)
    this.load.image(TEX.SHELF_STORAGE,  shelfStorageImg)
    this.load.image(TEX.CASHIER_DESK,   cashierDeskImg)
    this.load.image(TEX.PLAY_TABLE,     playTableImg)
    this.load.image(TEX.BOX_ITEM,       boxItemImg)
    this.load.image(TEX.PACKAGE_BOX,    boxItemImg)
    this.load.image(TEX.FLOOR_TILE,     floorTileImg)
    this.load.image(TEX.WALL_TOP,       wallTopImg)
    this.load.image(TEX.WALL_SIDE,      wallSideImg)
    this.load.image(TEX.SIDEWALK_TILE,  sidewalkTileImg)
    this.load.image('gym_building',     gymBuildingImg)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  create() {
    const gameStore = useGameStore()

    this.registerCharacterAnimations()

    // Graphics layers
    this.previewGraphics   = this.add.graphics().setDepth(DEPTH.PREVIEW)
    this.placementGraphics = this.add.graphics().setDepth(DEPTH.PLACEMENT_VISUALIZER)
    this.editOverlay       = this.add.graphics().setDepth(DEPTH.EDIT_OVERLAY).setScrollFactor(0)
    this.gatePathway       = this.add.graphics().setDepth(DEPTH.FLOOR + 0.5)

    // Managers
    this.environmentManager = new EnvironmentManager(this)
    this.furnitureManager   = new FurnitureManager(this)
    this.npcManager         = new NPCManager(this, this.environmentManager)
    this.deliveryManager    = new DeliveryManager(this, this.environmentManager)
    this.staffManager       = new StaffManager(this, this.environmentManager, this.deliveryManager)

    // A* grid
    const shopBounds = this.environmentManager.getShopBounds()
    aStarGrid.initialize(shopBounds.x, shopBounds.y, shopBounds.w, shopBounds.h)

    // Gym
    const gymStore = useGymStore()
    gymStore.initializeGymLeaders()
    this.townManager = new TownManager(this)

    // World / camera bounds
    this.physics.world.setBounds(0, 0, 5500, 3000)
    this.cameras.main.setBounds(0, 0, 5500, 3000)
      .setBackgroundColor('#000000')
      .setZoom(AppConfig.GAME.CAMERA.ZOOM)
      .setRoundPixels(true)

    // Environment
    this.environmentManager.initializeEnvironment()
    this.furnitureManager.initializeFurniture()
    this.townManager.initializeTown()

    // ── PLAYER SPAWN ──────────────────────────────────────────────────────────
    const doorLoc = this.environmentManager.getDoorLocation()
    this.player = this.physics.add.sprite(doorLoc.x, doorLoc.y - 50, TEX.PLAYER, 0)
    this.player.setOrigin(0.5, 1)
    applyFootCollider(this.player, 0.3)
    this.player.refreshBody()
    this.player.setCollideWorldBounds(true)
    applyDynamicYSort(this.player)

    // Drop shadow — created AFTER player so z-order is correct
    this.playerShadow = createDropShadow(this, this.player, { radiusX: 14, radiusY: 6, alpha: 0.35 })

    // Camera follow
    this.cameras.main.startFollow(this.player, true, 0.05, 0.05)
    this.cameras.main.centerOn(this.player.x, this.player.y)

    // ── INPUT ─────────────────────────────────────────────────────────────────
    this.setupInputs()

    // ── PLAYER FSM ────────────────────────────────────────────────────────────
    this.playerFSM = new PlayerFSM(this.player, this.cursors, GAME_BALANCE.PLAYER.BASE_SPEED, 'player')

    // ── UI OVERLAY TEXT ───────────────────────────────────────────────────────
    this.setupUI()

    // Collisions
    this.physics.add.collider(this.player, this.environmentManager.wallsGroup)
    this.physics.add.collider(this.player, this.furnitureManager.shelvesGroup)
    this.physics.add.collider(this.player, this.furnitureManager.tablesGroup)
    this.physics.add.collider(this.player, this.furnitureManager.cashierGroup)

    // Store subscriptions
    this.setupStoreSubscriptions(gameStore)
    this.staffManager.syncWorkers()

    // NPC spawn loop
    this.npcManager.initializeNPCs()

    // Game clock (1 second real = 1 minute game)
    this.time.addEvent({
      delay: GAME_BALANCE.TIMING.TICK_MS,
      loop: true,
      callback: () => {
        if (gameStore.shopState === 'OPEN' && !gameStore.isBuildMode && !gameStore.isEditMode) {
          gameStore.tickTime(1)
        }
      }
    })

    // Camera drag
    this.setupCameraDrag()
    this.environmentManager.refreshEnvironment()
    this.refreshAStarGrid()

    // Warp gate text
    this.shopToTownGate = this.add.text(0, 0, AppConfig.UI.TITLES.GYM_TOWN, {
      fontSize: '20px', backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 10, y: 5 }, color: '#f6e05e'
    }).setOrigin(0.5).setDepth(DEPTH.FLOOR + 1)
    this.refreshGates()

    // Cleanup on shutdown
    this.events.once('shutdown', () => {
      this.storeUnsubscribers.forEach(u => u())
      this.storeUnsubscribers = []
      this.npcManager.destroy()
      this.staffManager.destroy()
      this.furnitureManager.destroy()
      this.environmentManager.destroy()
      this.deliveryManager.destroy()
      this.townManager.destroy()
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  update(time: number, _delta: number) {
    if (!this.cursors || !this.player.body || !this.keyE) return

    const store = useGameStore()

    // Managers update
    if (!store.isBuildMode && !store.isEditMode) {
      try {
        this.npcManager.update()
        this.furnitureManager.updateFurnitureVisuals(time)
        this.staffManager.update(time)
        this.deliveryManager.update(time, this.player.x, this.player.y)
        this.handleAutoCheckout(time)
      } catch (err) {
        console.error('[MainScene] Manager update error:', err)
      }
    }

    // E key interaction
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.handlePlayerInteraction(store)
    }

    // Build/Edit vs Move
    if (store.isBuildMode || store.isEditMode) {
      this.handleBuildMode(store)
      // Lock player movement in build mode
      this.player.setVelocity(0)
      if (this.player.anims.isPlaying) this.player.anims.stop()
    } else {
      // ── PlayerFSM handles movement + animation ────────────────────────────
      this.playerFSM.update()
      this.clearGhostIfNecessary()
    }

    // ── Y-Sort player each frame ──────────────────────────────────────────────
    applyDynamicYSort(this.player)

    // ── UPDATE DROP SHADOW ────────────────────────────────────────────────────
    // Shadow follows player foot position every frame
    updateDropShadow(this.playerShadow, this.player, { radiusX: 14, radiusY: 6, alpha: 0.35 })

    // Debug physics
    this.updateDebugPhysics()

    // Edit overlay
    this.updateEditOverlay(store)

    // Diagnostic key
    if (Phaser.Input.Keyboard.JustDown(this.cursors.p)) this.runDiagnostics()

    // Area transition
    this.handleAreaTransition()

    // Town manager (gym proximity)
    this.townManager?.update(this.player.x, this.player.y)

    // Gate hints
    this.updateGateHints()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ANIMATION REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────────

  private registerCharacterAnimations() {
    const defs: Array<{ prefix: string, key: string }> = [
      { prefix: 'player', key: TEX.PLAYER }
    ]

    // Register animations for all NPC skins
    AppConfig.ASSETS.NPC_POOLS.forEach(pool => {
      defs.push({ prefix: pool.key, key: pool.key })
    })

    // Register animations for all Staff skins
    AppConfig.ASSETS.STAFF_POOLS.forEach(pool => {
      defs.push({ prefix: pool.key, key: pool.key })
    })

    // Legacy fallback for generic 'npc' and 'staff' keys
    defs.push({ prefix: 'npc', key: TEX.NPC })
    defs.push({ prefix: 'staff', key: TEX.STAFF })

    const dirs = [
      { dir: 'down',  start: 0  },
      { dir: 'left',  start: 4  },
      { dir: 'right', start: 8  },
      { dir: 'up',    start: 12 }
    ]
    for (const { prefix, key } of defs) {
      for (const { dir, start } of dirs) {
        const animKey = `${prefix}-${dir}`
        if (this.anims.exists(animKey)) continue
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(key, { start, end: start + 3 }),
          frameRate: 8,
          repeat: -1
        })
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UI SETUP
  // ─────────────────────────────────────────────────────────────────────────────

  private setupUI() {
    this.editText = this.add.text(this.cameras.main.width / 2, 80, 'SHOP SETUP MODE', {
      fontSize: '32px', color: '#00ffff', fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setDepth(DEPTH.UI).setScrollFactor(0).setVisible(false)

    this.gateHintText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height - 100, 'Bấm [E] để dịch chuyển', {
      fontSize: '24px', color: '#ffffff', fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setDepth(DEPTH.UI).setScrollFactor(0).setVisible(false)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INPUT
  // ─────────────────────────────────────────────────────────────────────────────

  private setupInputs() {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.addKeys({
        up:    Phaser.Input.Keyboard.KeyCodes.W,
        down:  Phaser.Input.Keyboard.KeyCodes.S,
        left:  Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        p:     Phaser.Input.Keyboard.KeyCodes.P
      }) as any

      this.keyE   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E)
      this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)

      this.input.keyboard.on('keydown-X', () => useGameStore().toggleEditMode())
      this.input.keyboard.on('keydown-R', () => {
        this.currentRotation = this.currentRotation === 0 ? 90 : 0
        this.clearGhost()
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CAMERA DRAG
  // ─────────────────────────────────────────────────────────────────────────────

  private setupCameraDrag() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 1 || pointer.button === 2) {
        this.isDraggingCamera = true
        this.cameras.main.stopFollow()
        this.dragStartX = pointer.x; this.dragStartY = pointer.y
        this.camStartX = this.cameras.main.scrollX
        this.camStartY = this.cameras.main.scrollY
      }
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isDraggingCamera) {
        this.cameras.main.scrollX = this.camStartX - (pointer.x - this.dragStartX)
        this.cameras.main.scrollY = this.camStartY - (pointer.y - this.dragStartY)
      }
    })
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 1 || pointer.button === 2) {
        this.isDraggingCamera = false
        this.time.delayedCall(2000, () => {
          if (!this.isDraggingCamera && this.playerFSM.isMoving) {
            this.cameras.main.startFollow(this.player, true, 0.05, 0.05)
          }
        })
      }
    })
    this.input.mouse?.disableContextMenu()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STORE SUBSCRIPTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  private setupStoreSubscriptions(gameStore: any) {
    const statsStore    = useStatsStore()
    const customerStore = useCustomerStore()
    const staffStore    = useStaffStore()

    let lastExpansionLevel = statsStore.expansionLevel
    let lastSettings       = JSON.stringify(statsStore.settings)

    const unsubStats = statsStore.$subscribe((_: any, state: any) => {
      const curSettings = JSON.stringify(state.settings)
      if (state.expansionLevel !== lastExpansionLevel || curSettings !== lastSettings) {
        lastExpansionLevel = state.expansionLevel
        lastSettings       = curSettings
        this.environmentManager.refreshEnvironment()
        this.refreshGates()
        this.refreshAStarGrid()
      }
    })

    const unsubFurniture = useFurnitureStore().$subscribe(() => {
      this.refreshAStarGrid()
    })

    const unsubStaff = staffStore.$subscribe(() => {
      this.staffManager.syncWorkers()
    })

    const unsubCustomer = customerStore.$subscribe(() => {})

    const unsubGame = gameStore.$subscribe((_: any, state: any) => {
      if (state.showEndDayModal) this.npcManager.cleanupAllNPCs()
      if (state.isPaused) { this.scene.pause() }
      else if (this.scene.isPaused()) { this.scene.resume() }
    })

    this.storeUnsubscribers.push(unsubStats, unsubStaff, unsubCustomer, unsubGame, unsubFurniture)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TELEPORT (fade transition)
  // ─────────────────────────────────────────────────────────────────────────────

  private performTeleport(targetX: number, targetY: number, toTown: boolean) {
    if (this.isTeleporting) return
    this.isTeleporting = true
    const gymStore = useGymStore()

    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.player.setPosition(targetX, targetY)
      // Sync shadow immediately to avoid 1-frame gap
      updateDropShadow(this.playerShadow, this.player, { radiusX: 14, radiusY: 6, alpha: 0.35 })

      gymStore.setPlayerInTown(toTown)
      this.player.setVelocity(0)
      this.playerFSM.resetToIdle('down')

      this.cameras.main.fadeIn(300, 0, 0, 0)
      this.isTeleporting = false
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERACTION
  // ─────────────────────────────────────────────────────────────────────────────

  private handlePlayerInteraction(store: any) {
    const doorPos  = this.environmentManager.getDoorLocation()
    const wz       = this.environmentManager.warpGateZone
    const distTown = Phaser.Math.Distance.Between(this.player.x, this.player.y, wz.x, wz.y)
    const distShop = Phaser.Math.Distance.Between(this.player.x, this.player.y, TownManager.TOWN_START_X + 50, 500)

    if (distTown < 80) { this.performTeleport(TownManager.TOWN_START_X + 150, 500, true);  return }
    if (distShop < 80) { this.performTeleport(doorPos.x, doorPos.y + 100, false);          return }

    // Delivery
    if (this.deliveryManager) {
      const deliveryStore = useDeliveryStore()
      const nearShelf     = this.getNearestFromGroup(this.furnitureManager.shelvesGroup, 70)
      if (nearShelf) {
        const handled = this.deliveryManager.handleShelfInteraction(nearShelf.getData('id'))
        if (handled) return
      } else if (deliveryStore.carriedBox?.type === 'furniture') {
        const furnitureStore = useFurnitureStore()
        furnitureStore.startBuildMode(deliveryStore.carriedBox.itemId)
        this.deliveryManager.removeCarriedBox()
        deliveryStore.dropBox()
        return
      }
    }

    // Trade-in NPC
    const agentsArr    = Array.from((this.npcManager as any).agents.values()) as any[]
    const nearestSeller = agentsArr.find(a => {
      if (a.fsm.current !== 'TRADE_IN_WAITING') return false
      return Phaser.Math.Distance.Between(this.player.x, this.player.y, a.sprite.x, a.sprite.y) < 80
    })
    if (nearestSeller) {
      eventBus.emit(EVENTS.NPC_TRADE_REQUEST, {
        instanceId: nearestSeller.data.instanceId,
        cardId:     nearestSeller.data.tradeCardId
      })
      return
    }

    // Manual checkout
    const nearCashier = this.getNearestFromGroup(this.furnitureManager.cashierGroup, 80)
    if (nearCashier && store.waitingCustomers > 0) { store.openManualCheckout(); return }

    // Shelf management
    const nearShelf = this.getNearestFromGroup(this.furnitureManager.shelvesGroup, 70)
    if (nearShelf) store.openShelfManagement(nearShelf.getData('id'))
  }

  private getNearestFromGroup(group: Phaser.Physics.Arcade.StaticGroup, maxDist: number): Phaser.Physics.Arcade.Sprite | null {
    let nearest: Phaser.Physics.Arcade.Sprite | null = null
    let minDist = maxDist
    group.getChildren().forEach(child => {
      const sprite = child as Phaser.Physics.Arcade.Sprite
      const dist   = Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y)
      if (dist < minDist) { minDist = dist; nearest = sprite }
    })
    return nearest
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTO CHECKOUT (Staff)
  // ─────────────────────────────────────────────────────────────────────────────

  private handleAutoCheckout(time: number) {
    const store = useGameStore()
    if (store.waitingCustomers <= 0) return
    const cashier    = store.hiredWorkers.find((w: any) => w.duty === 'CHECKOUT')
    if (!cashier) return
    const workerData = WORKERS.find(w => w.id === cashier.dataId)
    if (!workerData) return
    const cooldown = SPEED_TO_MS[workerData.checkoutSpeed]
    if (time <= this.lastAutoCheckoutTime + cooldown) return
    const checkoutStore = useCheckoutStore()
    if (!checkoutStore.isOpen) {
      store.processAutoCheckout()
      this.lastAutoCheckoutTime = time
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUILD MODE
  // ─────────────────────────────────────────────────────────────────────────────

  private handleBuildMode(store: any) {
    const pointer = this.input.activePointer

    if (store.isEditMode && !store.isBuildMode) {
      if (pointer.isDown && this.time.now > this.lastPlacementTime + 200) {
        this.handleFurniturePickup(pointer, store)
      }
      return
    }
    if (!store.isBuildMode) return

    this.updateGhostPosition(pointer, store)
    this.drawPlacementVisualizer()
    this.isPlacementValid = this.validatePlacement(pointer)
    this.updateGhostVisual()

    if (pointer.isDown && this.isPlacementValid && this.time.now > this.lastPlacementTime + 300) {
      this.placeFurniture(pointer, store)
    }

    if (Phaser.Input.Keyboard.JustDown(this.escKey) || pointer.rightButtonDown()) {
      this.cancelPlacement(store)
    }
  }

  private handleFurniturePickup(pointer: Phaser.Input.Pointer, store: any) {
    let found = false
    const checkGroups = [
      { group: this.furnitureManager.cashierGroup, type: 'cashier' as const },
      { group: this.furnitureManager.shelvesGroup, type: 'shelf'   as const },
      { group: this.furnitureManager.tablesGroup,  type: 'table'   as const }
    ]
    for (const { group, type } of checkGroups) {
      group.getChildren().forEach(child => {
        const sprite = child as Phaser.Physics.Arcade.Sprite
        const bounds = type === 'table'
          ? new Phaser.Geom.Rectangle(sprite.x - 30, sprite.y - 20, 60, 40)
          : sprite.getBounds()
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

  private getFurnitureProfile(furnitureId: string) {
    let texture: string = TEX.SHELF_SELLING, scX = 1, scY = 1, tint = 0xffffff, ratio = 0.2
    switch (furnitureId) {
      case 'play_table':    texture = TEX.PLAY_TABLE;   ratio = 0.2; break
      case 'cashier_desk':  texture = TEX.CASHIER_DESK; ratio = 0.3; break
      case 'shelf_single':  texture = TEX.SHELF_SELLING; scX = 1.1; scY = 1.1; break
      case 'shelf_double':  texture = TEX.SHELF_SELLING; scX = 1.2; tint = 0x8B4513; break
      case 'storage_shelf': texture = TEX.SHELF_STORAGE; break
      case 'warehouse_shelf': texture = TEX.SHELF_STORAGE; scX = 1.1; scY = 1.1; break
    }
    return { texture, scX, scY, tint, ratio }
  }

  private updateGhostPosition(pointer: Phaser.Input.Pointer, store: any) {
    if (!this.ghostSprite && !this.ghostRectangle) {
      const fid     = store.buildItemId || store.editFurnitureData?.furnitureId
      const profile = this.getFurnitureProfile(fid)

      if (fid === 'play_table') {
        const isVer = this.currentRotation === 90
        const w = isVer ? 40 : 80, h = isVer ? 80 : 40
        const container = this.add.container(0, 0)
        const rect      = this.add.rectangle(0, 0, w, h, 0x7f8c8d).setStrokeStyle(2, 0x95a5a6)
        container.add(rect)
        if (isVer) {
          container.add(this.add.rectangle(0, -h / 2 - 10, 24, 20, 0x7f8c8d, 0.5))
          container.add(this.add.rectangle(0,  h / 2 + 10, 24, 20, 0x7f8c8d, 0.5))
        } else {
          container.add(this.add.rectangle(-w / 2 - 10, 0, 20, 24, 0x7f8c8d, 0.5))
          container.add(this.add.rectangle( w / 2 + 10, 0, 20, 24, 0x7f8c8d, 0.5))
        }
        container.setAlpha(0.6).setDepth(DEPTH.GHOST)
        this.ghostRectangle = container as any
        this.ghostText = this.add.text(0, -h / 2 - 20, 'ROTATE: R', { fontSize: '10px', color: '#fff' })
          .setOrigin(0.5).setDepth(DEPTH.GHOST + 1)
      } else {
        this.ghostSprite = this.add.sprite(0, 0, profile.texture)
          .setScale(profile.scX, profile.scY)
          .setTint(profile.tint)
          .setAlpha(0.6)
          .setDepth(DEPTH.GHOST)
      }
    }

    if (this.ghostRectangle) {
      this.ghostRectangle.setPosition(pointer.worldX, pointer.worldY)
      if (this.ghostText) this.ghostText.setPosition(pointer.worldX, pointer.worldY)
    } else if (this.ghostSprite) {
      this.ghostSprite.setOrigin(0.5, 1).setPosition(pointer.worldX, pointer.worldY)
    }
  }

  private validatePlacement(pointer: Phaser.Input.Pointer): boolean {
    const pad    = 10
    const bounds = this.environmentManager.getShopBounds()
    if (pointer.worldX < bounds.x + pad || pointer.worldX > bounds.x + bounds.w - pad ||
        pointer.worldY < bounds.y + pad || pointer.worldY > bounds.y + bounds.h - pad) return false

    const fid     = useGameStore().buildItemId || useGameStore().editFurnitureData?.furnitureId
    const profile = this.getFurnitureProfile(fid || '')
    let w = 30, h = 30
    if (this.ghostSprite) {
      w = this.ghostSprite.displayWidth; h = this.ghostSprite.displayHeight * profile.ratio
    } else if (this.ghostRectangle) {
      w = (this.ghostRectangle as any).width  || 80
      h = ((this.ghostRectangle as any).height || 40) * profile.ratio
    }

    const rect = new Phaser.Geom.Rectangle(pointer.worldX - w / 2, pointer.worldY - h, w, h)
    const groups = [
      this.environmentManager.wallsGroup,
      this.furnitureManager.cashierGroup,
      this.furnitureManager.shelvesGroup,
      this.furnitureManager.tablesGroup
    ]
    for (const group of groups) {
      for (const child of group.getChildren()) {
        const sprite = child as any
        if (useGameStore().editFurnitureData?.id === sprite.getData('id')) continue
        const body = sprite.body as Phaser.Physics.Arcade.Body
        if (!body) continue
        const obstRect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height)
        if (Phaser.Geom.Intersects.RectangleToRectangle(rect, obstRect)) return false
      }
    }
    if (Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, this.player.x, this.player.y) < 50) return false
    return true
  }

  private updateGhostVisual() {
    const alpha = 0.6, depth = DEPTH.GHOST + 10
    if (this.ghostRectangle instanceof Phaser.GameObjects.Container) {
      this.ghostRectangle.setDepth(depth)
      this.ghostRectangle.iterate((child: any) => {
        if (child instanceof Phaser.GameObjects.Shape) {
          child.setFillStyle(this.isPlacementValid ? 0x7f8c8d : 0xff0000, alpha)
        }
      })
    } else if (this.ghostRectangle instanceof Phaser.GameObjects.Rectangle) {
      this.ghostRectangle.setDepth(depth).setFillStyle(this.isPlacementValid ? 0x7f8c8d : 0xff0000, alpha)
    } else if (this.ghostSprite) {
      this.ghostSprite.setDepth(depth).setTint(this.isPlacementValid ? 0xffffff : 0xff0000).setAlpha(alpha)
    }
  }

  private placeFurniture(pointer: Phaser.Input.Pointer, store: any) {
    const placed = store.placeFurniture(pointer.worldX, pointer.worldY, this.currentRotation)
    this.lastPlacementTime = this.time.now
    this.currentRotation   = 0
    if (placed) this.furnitureManager.addFurnitureToScene(placed)
    this.clearGhost()
  }

  private cancelPlacement(store: any) {
    if (store.editFurnitureData) store.warehouseFurniture()
    else store.cancelBuildMode()
    this.clearGhost()
  }

  private clearGhost() {
    this.ghostRectangle?.destroy(); this.ghostRectangle = null
    this.ghostText?.destroy();      this.ghostText      = null
    this.ghostSprite?.destroy();    this.ghostSprite     = null
    this.placementGraphics.clear()
  }

  private clearGhostIfNecessary() {
    if (this.ghostSprite || this.ghostRectangle) this.clearGhost()
  }

  private drawPlacementVisualizer() {
    this.placementGraphics.clear()
    const store      = useGameStore()
    const statsStore = useStatsStore()
    const bounds     = this.environmentManager.getShopBounds()
    const pad        = 10

    if (statsStore.settings.showDebugPhysics) {
      this.placementGraphics.lineStyle(2, 0x00ff00, 0.5)
      this.placementGraphics.strokeRect(bounds.x + pad, bounds.y + pad, bounds.w - pad * 2, bounds.h - pad * 2)
    }

    if (this.ghostSprite || this.ghostRectangle) {
      const isValid = this.validatePlacement(this.input.activePointer)
      this.placementGraphics.fillStyle(isValid ? 0x00ff00 : 0xff0000, 0.4)
      const fid     = store.buildItemId || store.editFurnitureData?.furnitureId
      const profile = this.getFurnitureProfile(fid || '')
      let w = 30, h = 30
      if (this.ghostSprite) {
        w = this.ghostSprite.displayWidth; h = this.ghostSprite.displayHeight * profile.ratio
      } else if (this.ghostRectangle) {
        w = (this.ghostRectangle as any).width  || 80
        h = ((this.ghostRectangle as any).height || 40) * profile.ratio
      }
      this.placementGraphics.fillRect(this.input.activePointer.worldX - w / 2, this.input.activePointer.worldY - h, w, h)
      this.placementGraphics.lineStyle(2, isValid ? 0x00ff00 : 0xff0000, 1)
      this.placementGraphics.strokeRect(this.input.activePointer.worldX - w / 2, this.input.activePointer.worldY - h, w, h)
    }

    this.placementGraphics.fillStyle(0xff00ff, 0.3)
    this.placementGraphics.lineStyle(1, 0xff00ff, 1)
    const groups = [
      this.environmentManager.wallsGroup,
      this.furnitureManager.cashierGroup,
      this.furnitureManager.shelvesGroup,
      this.furnitureManager.tablesGroup
    ]
    groups.forEach(group => {
      group.getChildren().forEach(child => {
        const sprite = child as Phaser.Physics.Arcade.Sprite
        const body   = sprite.body as Phaser.Physics.Arcade.Body
        if (!body) return
        if (useGameStore().editFurnitureData?.id === sprite.getData('id')) return
        this.placementGraphics.fillRect(body.x, body.y, body.width, body.height)
        this.placementGraphics.strokeRect(body.x, body.y, body.width, body.height)
      })
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MISC
  // ─────────────────────────────────────────────────────────────────────────────

  private updateDebugPhysics() {
    const statsStore = useStatsStore()
    if (!this.debugGraphic) {
      this.debugGraphic = this.physics.world.createDebugGraphic()
      this.debugGraphic.setDepth(99999)
    }
    this.debugGraphic.setVisible(statsStore.settings.showDebugPhysics)
  }

  private updateEditOverlay(store: any) {
    this.editOverlay.clear()
    if (store.isEditMode) {
      this.editOverlay.lineStyle(15, 0x00ffff, 0.4)
        .strokeRect(0, 0, this.scale.width, this.scale.height)
      this.editText.setVisible(true)
    } else {
      this.editText.setVisible(false)
    }
  }

  private handleAreaTransition() {
    const gymStore = useGymStore()
    const isInTownX = this.player.x > TownManager.TOWN_START_X - 100
    if (isInTownX !== gymStore.isPlayerInTown) gymStore.setPlayerInTown(isInTownX)
  }

  public refreshGates() {
    if (!this.environmentManager || !this.shopToTownGate) return
    const wz     = this.environmentManager.warpGateZone
    const doorPos = this.environmentManager.getDoorLocation()
    this.shopToTownGate.setPosition(wz.x, wz.y)
    this.gatePathway.clear()
    this.gatePathway.fillStyle(0x34495e, 1)
    const pathW = 60
    this.gatePathway.fillRect(doorPos.x - pathW / 2, doorPos.y, pathW, wz.y - doorPos.y + 20)
    this.gatePathway.fillRect(doorPos.x, doorPos.y + 80, wz.x - doorPos.x + 20, 30)
  }

  public refreshAStarGrid() {
    if (!this.furnitureManager || !this.environmentManager) return
    try {
      const bounds = this.environmentManager.getShopBounds()
      if (!bounds || isNaN(bounds.w) || bounds.w === 0) return

      aStarGrid.initialize(bounds.x, bounds.y, bounds.w, bounds.h)
      aStarGrid.clearObstacles()

      ;[
        this.furnitureManager.shelvesGroup,
        this.furnitureManager.tablesGroup,
        this.furnitureManager.cashierGroup
      ].forEach(group => {
        group?.getChildren().forEach(child => {
          const body = child.body as Phaser.Physics.Arcade.StaticBody
          if (body) aStarGrid.markObstacleFromBody(body)
        })
      })

      const { x: sx, y: sy, w: sw, h: sh } = bounds
      const thickness = 64, doorWidth = 80
      const sideWallW = (sw - doorWidth) / 2
      aStarGrid.markObstacle(sx - thickness, sy - 96, sw + thickness * 2, 96)
      aStarGrid.markObstacle(sx - thickness, sy - thickness, thickness, sh + thickness * 2)
      aStarGrid.markObstacle(sx + sw, sy - thickness, thickness, sh + thickness * 2)
      if (!isNaN(sideWallW)) {
        aStarGrid.markObstacle(sx - thickness, sy + sh, sideWallW + thickness, thickness)
        aStarGrid.markObstacle(sx + sw - sideWallW, sy + sh, sideWallW + thickness, thickness)
      }

      this.environmentManager.wallsGroup?.getChildren().forEach(child => {
        const body = child.body as Phaser.Physics.Arcade.StaticBody
        if (body) aStarGrid.markObstacleFromBody(body)
      })

      const gameStore       = useGameStore()
      const placedCashiers  = gameStore.placedCashiers || {}
      const cashierEntries  = Object.values(placedCashiers) as any[]
      if (cashierEntries.length > 0 && this.npcManager) {
        this.npcManager.recalculateQueuePath({ x: cashierEntries[0].x, y: cashierEntries[0].y })
      }
    } catch (err) {
      console.warn('[MainScene] refreshAStarGrid failed silently:', err)
    }
  }

  private updateGateHints() {
    if (this.isTeleporting) { this.gateHintText.setVisible(false); return }
    const wz          = this.environmentManager.warpGateZone
    const RADIUS      = GAME_BALANCE.MAP.TRANSITION_DIST_THRESHOLD
    const distToTown  = Phaser.Math.Distance.Between(this.player.x, this.player.y, wz.x, wz.y)
    const distToShop  = Phaser.Math.Distance.Between(this.player.x, this.player.y, TownManager.TOWN_START_X + 50, 500)

    if (distToTown < RADIUS)     this.gateHintText.setText(AppConfig.UI.MESSAGES.GO_TO_GYM).setVisible(true)
    else if (distToShop < RADIUS) this.gateHintText.setText(AppConfig.UI.MESSAGES.RETURN_TO_SHOP).setVisible(true)
    else                          this.gateHintText.setVisible(false)
  }

  private runDiagnostics() {
    const store = useGameStore()
    console.log('=== DIAGNOSTIC ===')
    console.log('NPC Count:', this.npcManager.getNPCCount())
    console.log('Placed Tables:', Object.keys(store.placedTables).length)
    console.log('Expansion Level:', store.expansionLevel)
    console.log('Player State:', this.playerFSM.isMoving ? 'WALK' : 'IDLE', '|', this.playerFSM.currentFacing)
    console.log('==================')
  }
}
