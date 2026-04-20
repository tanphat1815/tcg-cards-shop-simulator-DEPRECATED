import Phaser from 'phaser'
import { DEPTH } from '../../environment/config'
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

  public displayShelf(shelf: ShelfData) {
    const isDouble = shelf.furnitureId === 'shelf_double'
    const isStorage = shelf.role === 'storage'
    const textureKey = isStorage ? 'warehouse_shelf' : 'shelf'
    const sprite = this.shelvesGroup.create(shelf.x, shelf.y, textureKey)
    
    sprite.setData('id', shelf.id)
    sprite.setData('type', 'shelf')
    sprite.setDepth(DEPTH.FURNITURE)
    
    if (isDouble) {
      sprite.setTint(0x8B4513)
      sprite.setScale(1.2, 1.0)
    } else if (isStorage && shelf.furnitureId === 'warehouse_shelf') {
      // Kệ kho công nghiệp: Giữ màu xám, scale to hơn 1 chút nếu cần
      sprite.setScale(1.1, 1.1)
    }

    const text = this.scene.add.text(shelf.x, shelf.y - 60, this.getShelfInfo(shelf), {
      fontSize: '11px',
      fontStyle: 'bold',
      color: isDouble ? '#ffeb3b' : '#000',
      backgroundColor: isDouble ? '#212121' : '#fff',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setDepth(DEPTH.UI)
    
    this.shelfTexts[shelf.id] = text
  }

  public displayTable(table: PlayTableData) {
    const rotation = table.rotation || 0
    const isVertical = rotation === 90
    const w = isVertical ? 40 : 80
    const h = isVertical ? 80 : 40

    const sprite = this.tablesGroup.create(table.x, table.y, 'cashier') 
    sprite.setData('id', table.id)
    sprite.setData('type', 'table')
    sprite.setDepth(DEPTH.TABLE).setSize(w, h).setVisible(false)

    const container = this.scene.add.container(table.x, table.y)
    const rect = this.scene.add.rectangle(0, 0, w, h, 0x8B4513).setStrokeStyle(2, 0x5D2906)
    container.add(rect)

    const chairColor = 0xA0522D
    if (isVertical) {
      container.add(this.scene.add.rectangle(0, -h/2 - 10, 24, 20, chairColor).setStrokeStyle(1, 0x5D2906))
      container.add(this.scene.add.rectangle(0, h/2 + 10, 24, 20, chairColor).setStrokeStyle(1, 0x5D2906))
    } else {
      container.add(this.scene.add.rectangle(-w/2 - 10, 0, 20, 24, chairColor).setStrokeStyle(1, 0x5D2906))
      container.add(this.scene.add.rectangle(w/2 + 10, 0, 20, 24, chairColor).setStrokeStyle(1, 0x5D2906))
    }

    const label = this.scene.add.text(0, -h/2 - 25, this.getTableInfo(table), {
      fontSize: '10px',
      color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 2, y: 1 }
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)
    container.add(label)
    
    container.setDepth(DEPTH.FURNITURE)
    this.tableVisuals[table.id] = { rect: container as any, label }
  }

  public displayCashier(cashier: CashierData) {
    const sprite = this.cashierGroup.create(cashier.x, cashier.y, 'cashier')
    sprite.setData('id', cashier.id)
    sprite.setData('type', 'cashier')
    sprite.setDepth(DEPTH.CASHIER)
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