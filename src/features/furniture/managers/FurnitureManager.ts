import Phaser from 'phaser'
import { DEPTH } from '../../environment/config'
import { TEX } from '../../environment/assetKeys'
import { applyFootCollider, applyStaticYSort, applyDynamicYSort } from '../../environment/ySortUtils'
import { useGameStore } from '../../shop-ui/store/gameStore'
import type { ShelfData, PlayTableData, CashierData } from '../types'

/**
 * FurnitureManager - Quản lý hiển thị và vật lý toàn bộ nội thất trong Shop.
 */
export class FurnitureManager {
  private scene: Phaser.Scene
  
  // Physics Groups
  public shelvesGroup!: Phaser.Physics.Arcade.StaticGroup
  public tablesGroup!: Phaser.Physics.Arcade.StaticGroup
  public cashierGroup!: Phaser.Physics.Arcade.StaticGroup
  
  private shelfTexts: Record<string, Phaser.GameObjects.Text> = {}
  private tableVisuals: Record<string, { rect: Phaser.GameObjects.Rectangle, label: Phaser.GameObjects.Text }> = {}

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.initializeGroups()
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
   */
  public displayShelf(shelf: ShelfData) {
    const isDouble  = shelf.furnitureId === 'shelf_double'
    const isStorage = shelf.role === 'storage'
    const textureKey = isStorage ? TEX.SHELF_STORAGE : TEX.SHELF_SELLING

    // Tạo sprite trong static group
    const sprite = this.shelvesGroup.create(shelf.x, shelf.y, textureKey) as Phaser.Physics.Arcade.Sprite
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

    // R3: Foot Collider — chỉ 30% đáy là physical body
    applyFootCollider(sprite, 0.3)

    // Sau khi sửa origin + scale + body, BẮT BUỘC refreshBody để StaticBody đồng bộ.
    sprite.refreshBody()

    // R2: Static Y-Sort — called ONCE at spawn.
    // Depth = LAYER3_OBJECTS + sprite.y (set inside applyStaticYSort).
    applyStaticYSort(sprite)

    // Label — drawn above the shelf at Layer 4 so it's always readable.
    const text = this.scene.add.text(shelf.x, shelf.y - 100, this.getShelfInfo(shelf), {
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
    const sprite = this.tablesGroup.create(table.x, table.y, TEX.PLAY_TABLE) as Phaser.Physics.Arcade.Sprite
    sprite.setData('id', table.id)
    sprite.setData('type', 'table')
    
    // Foot Anchor & Physics
    sprite.setOrigin(0.5, 1)
    if (isVertical) sprite.setAngle(90) // Xoay 90 độ nếu cần
    
    applyFootCollider(sprite, 0.7) // Play table is nearly flat
    sprite.refreshBody()
    applyStaticYSort(sprite)

    // Label — above entities
    const label = this.scene.add.text(table.x, table.y - 75, this.getTableInfo(table), {
      fontSize: '10px',
      color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 2, y: 1 }
    }).setOrigin(0.5).setDepth(DEPTH.LAYER4_WALL_TOP - 500)
    
    this.tableVisuals[table.id] = { rect: sprite as any, label }
  }

  public displayCashier(cashier: CashierData) {
    const sprite = this.cashierGroup.create(cashier.x, cashier.y, TEX.CASHIER_DESK) as Phaser.Physics.Arcade.Sprite
    sprite.setData('id', cashier.id)
    sprite.setData('type', 'cashier')
    
    sprite.setOrigin(0.5, 1)
    applyFootCollider(sprite, 0.6) // Quầy thu ngân dày
    sprite.refreshBody()
    applyStaticYSort(sprite)

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
    const status = table.matchStartedAt ? 'Đang chơi...' : `${occupiedSeats}/2 Người chơi`
    return status
  }

  updateFurnitureVisuals() {
    const gameStore = useGameStore()

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
    if (type === 'shelf') {
      const sprite = this.shelvesGroup.getChildren().find(s => s.getData('id') === id) as Phaser.Physics.Arcade.Sprite
      if (sprite) sprite.destroy()
      if (this.shelfTexts[id]) {
        this.shelfTexts[id].destroy()
        delete this.shelfTexts[id]
      }
    } else if (type === 'table') {
      const sprite = this.tablesGroup.getChildren().find(s => s.getData('id') === id) as Phaser.Physics.Arcade.Sprite
      if (sprite) sprite.destroy()
      if (this.tableVisuals[id]) {
        this.tableVisuals[id].rect.destroy()
        this.tableVisuals[id].label.destroy()
        delete this.tableVisuals[id]
      }
    } else if (type === 'cashier') {
      const sprite = this.cashierGroup.getChildren().find(s => s.getData('id') === id) as Phaser.Physics.Arcade.Sprite
      if (sprite) sprite.destroy()
    }
  }

  private clearAllFurniture() {
    this.shelvesGroup.clear(true, true)
    this.tablesGroup.clear(true, true)
    this.cashierGroup.clear(true, true)

    Object.values(this.shelfTexts).forEach(text => text.destroy())
    this.shelfTexts = {}

    Object.values(this.tableVisuals).forEach(({ rect, label }) => {
      rect.destroy()
      label.destroy()
    })
    this.tableVisuals = {}
  }

  getPhysicsGroups() {
    return {
      shelves: this.shelvesGroup,
      tables: this.tablesGroup,
      cashiers: this.cashierGroup
    }
  }

  destroy() {
    this.clearAllFurniture()
  }
}