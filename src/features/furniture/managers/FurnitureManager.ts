import Phaser from 'phaser'
import { DEPTH } from '../../environment/config'
import { TEX } from '../../environment/assetKeys'
import { applyFootCollider, applyStaticYSort } from '../../environment/ySortUtils'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { AppConfig } from '../../../game/config/AppConfig'
import { 
  obliqueToIsoScreen, 
  computeIsoDepthFromScreen 
} from '../../environment/utils/IsometricUtils'
import {
  createStaticDiamondBody
} from '../../environment/physics/PhysicsUtils'
import type { ShelfData, PlayTableData, CashierData } from '../types'


/**
 * FurnitureManager - Quản lý hiển thị và vật lý toàn bộ nội thất trong Shop.
 *
 * ── DUAL-MODE ARCHITECTURE ────────────────────────────────────────────────
 * Oblique 2.5D (ISOMETRIC.ENABLED = false):
 *   → Arcade Physics: StaticGroup, rectangle body, Y-sort depth.
 *
 * Isometric 2.5D (ISOMETRIC.ENABLED = true):
 *   → Matter.js: Diamond polygon bodies, ISO depth formula.
 *   → Hitbox chỉ nằm ở đáy sprite (foot area) để cho phép Y-sorting.
 *   → Không dùng StaticGroup → dùng mảng sprite[] + body[] riêng.
 */
export class FurnitureManager {
  private scene: Phaser.Scene
  
  // ── ARCADE MODE: Physics Groups (chỉ dùng khi oblique) ──────────────────
  public shelvesGroup!: Phaser.Physics.Arcade.StaticGroup
  public tablesGroup!: Phaser.Physics.Arcade.StaticGroup
  public cashierGroup!: Phaser.Physics.Arcade.StaticGroup

  // ── MATTER MODE: Sprite arrays + body tracking (chỉ dùng khi isometric) ─
  private matterShelfSprites: Phaser.GameObjects.Sprite[] = []
  private matterTableSprites: Phaser.GameObjects.Sprite[] = []
  private matterCashierSprites: Phaser.GameObjects.Sprite[] = []
  private matterBodies: MatterJS.BodyType[] = []  // Tất cả Matter bodies để cleanup
  
  private shelfTexts: Record<string, Phaser.GameObjects.Text> = {}
  private tableVisuals: Record<string, { rect: Phaser.GameObjects.Sprite, label: Phaser.GameObjects.Text }> = {}

  /** True khi sử dụng Matter.js (Isometric mode) */
  private readonly useMatter: boolean

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.useMatter = AppConfig.ISOMETRIC.ENABLED

    if (this.useMatter) {
      // Matter mode: KHÔNG tạo Arcade groups — dùng mảng sprites
      // Tạo dummy groups (empty) để các hàm getNearestFromGroup trong MainScene không crash
      try {
        if (this.scene.physics && (this.scene.physics as any).add) {
          this.shelvesGroup = this.scene.physics.add.staticGroup() as any
          this.tablesGroup = this.scene.physics.add.staticGroup() as any
          this.cashierGroup = this.scene.physics.add.staticGroup() as any
        } else {
          this.shelvesGroup = this.scene.add.group() as any
          this.tablesGroup = this.scene.add.group() as any
          this.cashierGroup = this.scene.add.group() as any
        }
      } catch (_err) {
        // Nếu Arcade không available (pure Matter mode), tạo group chuẩn làm fallback
        console.warn('[FurnitureManager] Arcade groups unavailable, using standard groups as dummy.')
        this.shelvesGroup = this.scene.add.group() as any
        this.tablesGroup = this.scene.add.group() as any
        this.cashierGroup = this.scene.add.group() as any
      }
    } else {
      // Arcade mode: Tạo static groups như cũ
      this.initializeGroups()
    }

    // Final safety: ensure groups are NEVER undefined
    if (!this.shelvesGroup) this.shelvesGroup = this.scene.add.group() as any
    if (!this.tablesGroup)  this.tablesGroup  = this.scene.add.group() as any
    if (!this.cashierGroup) this.cashierGroup = this.scene.add.group() as any
  }

  private initializeGroups() {
    this.shelvesGroup = this.scene.physics.add.staticGroup()
    this.tablesGroup = this.scene.physics.add.staticGroup()
    this.cashierGroup = this.scene.physics.add.staticGroup()
  }

  initializeFurniture() {
    this.displayAllFurniture()
  }

  displayAllFurniture() {
    const gameStore = useGameStore()
    this.clearAllFurniture()

    // 1. Render Kệ hàng
    Object.values(gameStore.placedShelves).forEach((shelf: any) => {
      this.displayShelf(shelf as ShelfData)
    })

    // 2. Render Bàn chơi
    Object.values(gameStore.placedTables).forEach((table: any) => {
      this.displayTable(table as PlayTableData)
    })

    // 3. Render Quầy thu ngân
    Object.values(gameStore.placedCashiers).forEach((cashier: any) => {
      this.displayCashier(cashier as CashierData)
    })
  }

  /**
   * Hiển thị một shelf (Selling hoặc Storage) ở không gian 2.5D.
   * 
   * ⚠️ GIỮ NGUYÊN:
   * - isDouble logic (shelf_double → tint + scale).
   * - shelfTexts map để update info text.
   * - shelf.role split selling/storage.
   *
   * ── MATTER MODE ──────────────────────────────────────────────────────────
   * Thay vì this.shelvesGroup.create():
   *   1. Tạo sprite thuần (this.scene.add.sprite)
   *   2. Tạo diamond Matter body tại vị trí foot area
   *   3. Track cả sprite + body trong mảng riêng
   */
  public displayShelf(shelf: ShelfData) {
    const isDouble  = shelf.furnitureId === 'shelf_double'
    const isStorage = shelf.role === 'storage'
    let textureKey: string = isStorage ? TEX.SHELF_STORAGE
                   : shelf.role === 'display_case' ? TEX.DISPLAY_CASE
                   : TEX.SHELF_SELLING
                   
    if (AppConfig.ISOMETRIC.ENABLED) {
        textureKey = TEX.ISO_SHELF
    }

    // Determine initial position
    let spawnX = shelf.x
    let spawnY = shelf.y

    if (AppConfig.ISOMETRIC.ENABLED) {
        const { ORIGIN_X, ORIGIN_Y } = AppConfig.ISOMETRIC.MAP
        const screenPos = obliqueToIsoScreen(shelf.x, shelf.y, ORIGIN_X, ORIGIN_Y)
        spawnX = screenPos.x
        spawnY = screenPos.y + 16 // Bottom corner of the tile
    }

    if (this.useMatter) {
      // ── MATTER.JS MODE ────────────────────────────────────────────────
      try {
        const sprite = this.scene.add.sprite(spawnX, spawnY, textureKey)
        sprite.setData('id', shelf.id)
        sprite.setData('type', 'shelf')
        sprite.setOrigin(0.5, 1)

        // Scale variants (GIỮ NGUYÊN LOGIC CŨ)
        if (isDouble) {
          sprite.setTint(0x8B4513)
        }

        // Isometric depth
        const { ORIGIN_X, ORIGIN_Y } = AppConfig.ISOMETRIC.MAP
        const depth = computeIsoDepthFromScreen(spawnX, spawnY, ORIGIN_X, ORIGIN_Y)
        sprite.setDepth(depth)

        // ── DIAMOND BODY tại foot area ──────────────────────────────────
        // Hitbox hình thoi chỉ ở 20% dưới đáy sprite
        const footRatio = AppConfig.MATTER.FURNITURE.FOOT_RATIO
        const bodyH = sprite.displayHeight * footRatio

        // Body position: tại đáy sprite
        const bodyX = spawnX
        const bodyY = spawnY - (bodyH / 2) + 2 // Nudge down 2px to sink into ground slightly

        const body = createStaticDiamondBody(
          this.scene, bodyX, bodyY, 
          'iso_shelf',
          `shelf_${shelf.id}`
        )

        // Lưu reference để cleanup
        this.matterShelfSprites.push(sprite)
        this.matterBodies.push(body)

      } catch (err) {
        console.error('[FurnitureManager] Matter shelf creation failed:', err)
      }

    } else {
      // ── ARCADE MODE (giữ nguyên logic cũ) ────────────────────────────
      const sprite = this.shelvesGroup.create(spawnX, spawnY, textureKey) as Phaser.Physics.Arcade.Sprite

      sprite.setData('id', shelf.id)
      sprite.setData('type', 'shelf')

      // R1: Foot Anchor — TRƯỚC setScale, TRƯỚC refreshBody
      sprite.setOrigin(0.5, 1)

      // Áp dụng scale đặc biệt cho các biến thể (GIỮ NGUYÊN LOGIC CŨ)
      if (isDouble) {
        sprite.setTint(0x8B4513)
        sprite.setScale(1.2, 1.0)
      } else if (isStorage && shelf.furnitureId === 'warehouse_shelf') {
        sprite.setScale(1.1, 1.1)
      }

      // Step 1: Sync physics body with sprite scale/position
      sprite.refreshBody()

      // Step 2: Carve out the "foot area" hitbox within that synced body.
      // R3: Foot Collider — only 20% of bottom is solid to allow walking "behind" top visuals.
      applyFootCollider(sprite, 0.2)

      // R2: Static Y-Sort or Iso Depth
      applyStaticYSort(sprite)
    }

    // Label — drawn above the shelf at Layer 4 so it's always readable.
    // Use isometric screen coordinates for label
    const text = this.scene.add.text(spawnX, spawnY - 110, this.getShelfInfo(shelf), {
      fontSize: '11px',
      fontStyle: 'bold',
      color: isDouble ? '#ffeb3b' : '#000',
      backgroundColor: isDouble ? '#212121' : '#fff',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setDepth(DEPTH.LAYER4_WALL_TOP - 500)

    this.shelfTexts[shelf.id] = text
  }

  public displayTable(table: PlayTableData) {
    const rotation = table.rotation || 0
    const isVertical = rotation === 90
    
    // R1: Spawn sprite 2.5D
    const textureKey = AppConfig.ISOMETRIC.ENABLED ? TEX.ISO_TABLE : TEX.PLAY_TABLE
    let spawnX = table.x
    let spawnY = table.y

    if (AppConfig.ISOMETRIC.ENABLED) {
        const { ORIGIN_X, ORIGIN_Y } = AppConfig.ISOMETRIC.MAP
        const screenPos = obliqueToIsoScreen(table.x, table.y, ORIGIN_X, ORIGIN_Y)
        spawnX = screenPos.x
        spawnY = screenPos.y + 16 // Bottom corner of the tile
    }

    if (this.useMatter) {
      // ── MATTER.JS MODE ────────────────────────────────────────────────
      try {
        const sprite = this.scene.add.sprite(spawnX, spawnY, textureKey)
        sprite.setData('id', table.id)
        sprite.setData('type', 'table')
        sprite.setOrigin(0.5, 1)

        if (isVertical) sprite.setAngle(90)

        // Isometric depth
        const { ORIGIN_X, ORIGIN_Y } = AppConfig.ISOMETRIC.MAP
        const depth = computeIsoDepthFromScreen(spawnX, spawnY, ORIGIN_X, ORIGIN_Y)
        sprite.setDepth(depth)

        // ── DIAMOND BODY for table ──────────────────────────────────────
        const footRatio = AppConfig.MATTER.FURNITURE.FOOT_RATIO * 2 // Bàn có hitbox lớn hơn kệ
        const bodyH = sprite.displayHeight * footRatio

        const bodyX = spawnX
        const bodyY = spawnY - (bodyH / 2) + 2

        const body = createStaticDiamondBody(
          this.scene, bodyX, bodyY, 
          'iso_play_table',
          `table_${table.id}`
        )

        this.matterTableSprites.push(sprite)
        this.matterBodies.push(body)

        // Label
        const label = this.scene.add.text(spawnX, spawnY - 85, this.getTableInfo(table), {
          fontSize: '10px',
          color: '#fff',
          backgroundColor: 'rgba(0,0,0,0.5)',
          padding: { x: 2, y: 1 }
        }).setOrigin(0.5).setDepth(DEPTH.LAYER4_WALL_TOP - 500)

        this.tableVisuals[table.id] = { rect: sprite, label }

      } catch (err) {
        console.error('[FurnitureManager] Matter table creation failed:', err)
      }

    } else {
      // ── ARCADE MODE ───────────────────────────────────────────────────
      const sprite = this.tablesGroup.create(spawnX, spawnY, textureKey) as Phaser.Physics.Arcade.Sprite

      sprite.setData('id', table.id)
      sprite.setData('type', 'table')
      
      // Foot Anchor & Physics
      sprite.setOrigin(0.5, 1)
      if (isVertical) sprite.setAngle(90) // Xoay 90 độ nếu cần
      
      sprite.refreshBody()
      applyFootCollider(sprite, 0.4)
      applyStaticYSort(sprite)

      // Label — above entities
      const label = this.scene.add.text(spawnX, spawnY - 85, this.getTableInfo(table), {
        fontSize: '10px',
        color: '#fff',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: { x: 2, y: 1 }
      }).setOrigin(0.5).setDepth(DEPTH.LAYER4_WALL_TOP - 500)
      
      this.tableVisuals[table.id] = { rect: sprite as any, label }
    }
  }

  public displayCashier(cashier: CashierData) {
    const textureKey = AppConfig.ISOMETRIC.ENABLED ? TEX.ISO_CASHIER : TEX.CASHIER_DESK
    let spawnX = cashier.x
    let spawnY = cashier.y

    if (AppConfig.ISOMETRIC.ENABLED) {
        const { ORIGIN_X, ORIGIN_Y } = AppConfig.ISOMETRIC.MAP
        const screenPos = obliqueToIsoScreen(cashier.x, cashier.y, ORIGIN_X, ORIGIN_Y)
        spawnX = screenPos.x
        spawnY = screenPos.y + 16 // Bottom corner of the tile
    }

    if (this.useMatter) {
      // ── MATTER.JS MODE ────────────────────────────────────────────────
      try {
        const sprite = this.scene.add.sprite(spawnX, spawnY, textureKey)
        sprite.setData('id', cashier.id)
        sprite.setData('type', 'cashier')
        sprite.setOrigin(0.5, 1)

        // Isometric depth
        const { ORIGIN_X, ORIGIN_Y } = AppConfig.ISOMETRIC.MAP
        const depth = computeIsoDepthFromScreen(spawnX, spawnY, ORIGIN_X, ORIGIN_Y)
        sprite.setDepth(depth)

        // ── DIAMOND BODY for cashier ────────────────────────────────────
        const footRatio = AppConfig.MATTER.FURNITURE.FOOT_RATIO * 1.5
        const bodyH = sprite.displayHeight * footRatio

        const bodyX = spawnX
        const bodyY = spawnY - (bodyH / 2) + 2

        const body = createStaticDiamondBody(
          this.scene, bodyX, bodyY, 
          'iso_cashier_desk',
          `cashier_${cashier.id}`
        )

        this.matterCashierSprites.push(sprite)
        this.matterBodies.push(body)

      } catch (err) {
        console.error('[FurnitureManager] Matter cashier creation failed:', err)
      }

    } else {
      // ── ARCADE MODE ───────────────────────────────────────────────────
      const sprite = this.cashierGroup.create(spawnX, spawnY, textureKey) as Phaser.Physics.Arcade.Sprite

      sprite.setData('id', cashier.id)
      sprite.setData('type', 'cashier')
      
      sprite.setOrigin(0.5, 1)
      sprite.refreshBody()
      applyFootCollider(sprite, 0.3) 
      applyStaticYSort(sprite)
    }

    // Label indicator (nếu cần update sau này, hiện tại chỉ vẽ sprite)
  }

  public addFurnitureToScene(data: any) {
    if (data.furnitureId === 'play_table' || data.type === 'table') {
      this.displayTable(data)
    } else if (data.furnitureId === 'cashier_desk' || data.type === 'cashier') {
      this.displayCashier(data)
    } else {
      this.displayShelf(data)
    }
  }

  private getShelfInfo(shelf: ShelfData): string {
    const totalItems = shelf.tiers.reduce((sum, tier) => sum + tier.slots.filter(slot => slot !== null).length, 0)
    return `Kệ: ${totalItems} món`
  }

  private getTableInfo(table: PlayTableData): string {
    const occupiedSeats = table.occupants.filter(o => o !== null).length
    // Chỉ hiện "Đang chơi" nếu có ít nhất 1 người (thường là 2)
    const status = (table.matchStartedAt && occupiedSeats > 0) ? 'Đang chơi...' : `${occupiedSeats}/2 Người chơi`
    return status
  }

  private lastUpdateVisualsTime: number = 0

  updateFurnitureVisuals(time: number) {
    const gameStore = useGameStore()

    // Throttle update to every 200ms to save CPU
    if (time < this.lastUpdateVisualsTime + 200) return
    this.lastUpdateVisualsTime = time

    // 1. Cập nhật Text trên các kệ
    Object.values(gameStore.placedShelves).forEach((shelf: any) => {
      if (this.shelfTexts[shelf.id]) {
        this.shelfTexts[shelf.id].setText(this.getShelfInfo(shelf as ShelfData))
      }
    })

    // 2. Cập nhật Status trên các bàn
    Object.values(gameStore.placedTables).forEach((table: any) => {
      if (this.tableVisuals[table.id]) {
        const { label } = this.tableVisuals[table.id]
        label.setText(this.getTableInfo(table as PlayTableData))
      }
    })
  }

  removeFurniture(id: string, type: 'shelf' | 'table' | 'cashier') {
    if (this.useMatter) {
      // ── MATTER MODE: Xóa từ mảng sprites + destroy body ──────────────
      try {
        const findAndRemove = (
          sprites: Phaser.GameObjects.Sprite[]
        ): Phaser.GameObjects.Sprite[] => {
          const remaining: Phaser.GameObjects.Sprite[] = []
          for (const sprite of sprites) {
            if (sprite.getData('id') === id) {
              sprite.destroy()
            } else {
              remaining.push(sprite)
            }
          }
          return remaining
        }

        if (type === 'shelf') {
          this.matterShelfSprites = findAndRemove(this.matterShelfSprites)
        } else if (type === 'table') {
          this.matterTableSprites = findAndRemove(this.matterTableSprites)
        } else if (type === 'cashier') {
          this.matterCashierSprites = findAndRemove(this.matterCashierSprites)
        }

        // Xóa Matter body tương ứng (tìm theo label)
        const bodyLabel = `${type}_${id}`
        this.matterBodies = this.matterBodies.filter(body => {
          if (body.label === bodyLabel) {
            try {
              this.scene.matter.world.remove(body)
            } catch (_e) { /* body may already be removed */ }
            return false
          }
          return true
        })
      } catch (err) {
        console.error(`[FurnitureManager] removeFurniture (Matter) failed for ${type}/${id}:`, err)
      }
    } else {
      // ── ARCADE MODE (giữ nguyên logic cũ) ────────────────────────────
      if (type === 'shelf') {
        const sprite = this.shelvesGroup.getChildren().find(s => s.getData('id') === id) as Phaser.Physics.Arcade.Sprite
        if (sprite) sprite.destroy()
      } else if (type === 'table') {
        const sprite = this.tablesGroup.getChildren().find(s => s.getData('id') === id) as Phaser.Physics.Arcade.Sprite
        if (sprite) sprite.destroy()
      } else if (type === 'cashier') {
        const sprite = this.cashierGroup.getChildren().find(s => s.getData('id') === id) as Phaser.Physics.Arcade.Sprite
        if (sprite) sprite.destroy()
      }
    }

    // Cleanup visual elements (shared between modes)
    if (type === 'shelf' && this.shelfTexts[id]) {
      this.shelfTexts[id].destroy()
      delete this.shelfTexts[id]
    }
    if (type === 'table' && this.tableVisuals[id]) {
      this.tableVisuals[id].rect.destroy()
      this.tableVisuals[id].label.destroy()
      delete this.tableVisuals[id]
    }
  }

  private clearAllFurniture() {
    if (this.useMatter) {
      // ── MATTER MODE: Xóa tất cả sprites và bodies ────────────────────
      try {
        this.matterShelfSprites.forEach(s => s.destroy())
        this.matterTableSprites.forEach(s => s.destroy())
        this.matterCashierSprites.forEach(s => s.destroy())
        this.matterShelfSprites = []
        this.matterTableSprites = []
        this.matterCashierSprites = []

        // Remove all tracked Matter bodies
        this.matterBodies.forEach(body => {
          try {
            this.scene.matter.world.remove(body)
          } catch (_e) { /* ignore */ }
        })
        this.matterBodies = []
      } catch (err) {
        console.error('[FurnitureManager] clearAllFurniture (Matter) failed:', err)
      }
    } else {
      // ── ARCADE MODE ───────────────────────────────────────────────────
      this.shelvesGroup.clear(true, true)
      this.tablesGroup.clear(true, true)
      this.cashierGroup.clear(true, true)
    }

    Object.values(this.shelfTexts).forEach(text => text.destroy())
    this.shelfTexts = {}

    Object.values(this.tableVisuals).forEach(({ rect, label }) => {
      rect.destroy()
      label.destroy()
    })
    this.tableVisuals = {}
  }

  /**
   * Trả về physics groups cho Arcade mode.
   * Trong Matter mode, trả về empty groups (hoặc dummy).
   */
  getPhysicsGroups() {
    return {
      shelves: this.shelvesGroup,
      tables: this.tablesGroup,
      cashiers: this.cashierGroup
    }
  }

  /**
   * Trả về tất cả furniture sprites (cho cả 2 modes).
   * Dùng trong MainScene để tìm nearest furniture.
   */
  getAllFurnitureSprites(): Phaser.GameObjects.Sprite[] {
    if (this.useMatter) {
      return [
        ...this.matterShelfSprites,
        ...this.matterTableSprites,
        ...this.matterCashierSprites,
      ]
    } else {
      return [
        ...this.shelvesGroup.getChildren() as Phaser.GameObjects.Sprite[],
        ...this.tablesGroup.getChildren() as Phaser.GameObjects.Sprite[],
        ...this.cashierGroup.getChildren() as Phaser.GameObjects.Sprite[],
      ]
    }
  }

  /**
   * Tìm furniture sprite gần nhất (chung cho cả 2 modes).
   * Dùng để thay thế getNearestFromGroup trong MainScene.
   *
   * @param type      — 'shelf' | 'table' | 'cashier' hoặc null (tất cả)
   * @param playerX   — Tọa độ X player
   * @param playerY   — Tọa độ Y player
   * @param maxDist   — Khoảng cách tối đa (px)
   * @returns         — Sprite gần nhất hoặc null
   */
  getNearestFurniture(
    type: 'shelf' | 'table' | 'cashier' | null,
    playerX: number,
    playerY: number,
    maxDist: number
  ): Phaser.GameObjects.Sprite | null {
    let candidates: Phaser.GameObjects.Sprite[] = []

    if (this.useMatter) {
      if (type === 'shelf') candidates = this.matterShelfSprites
      else if (type === 'table') candidates = this.matterTableSprites
      else if (type === 'cashier') candidates = this.matterCashierSprites
      else candidates = this.getAllFurnitureSprites()
    } else {
      if (type === 'shelf') candidates = this.shelvesGroup.getChildren() as Phaser.GameObjects.Sprite[]
      else if (type === 'table') candidates = this.tablesGroup.getChildren() as Phaser.GameObjects.Sprite[]
      else if (type === 'cashier') candidates = this.cashierGroup.getChildren() as Phaser.GameObjects.Sprite[]
      else candidates = this.getAllFurnitureSprites()
    }

    let nearest: Phaser.GameObjects.Sprite | null = null
    let minDist = maxDist

    for (const sprite of candidates) {
      if (!sprite.active) continue
      const dist = Phaser.Math.Distance.Between(playerX, playerY, sprite.x, sprite.y)
      if (dist < minDist) {
        minDist = dist
        nearest = sprite
      }
    }

    return nearest
  }

  destroy() {
    this.clearAllFurniture()
  }
}