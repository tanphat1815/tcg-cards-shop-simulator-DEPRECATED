import Phaser from 'phaser'
import { useDeliveryStore } from '../../inventory/store/deliveryStore'
import { EnvironmentManager } from './EnvironmentManager'
import { DEPTH } from '../config'
import { AppConfig } from '../../../game/config/AppConfig'
import { applyDynamicYSort, applyFootCollider } from '../ySortUtils'
import { useFurnitureStore } from '../../furniture/store/furnitureStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { useUIStore } from '../../shop-ui/store/uiStore'

interface LiveBox {
  id: string
  sprite: Phaser.Physics.Arcade.Sprite   // ← ĐỔI từ Rectangle sang Sprite
  label: Phaser.GameObjects.Text
  qtyLabel: Phaser.GameObjects.Text
  itemId: string
  type: string
  quantity: number
  name: string
  isBeingCarried: boolean
  carriedBy: 'player' | 'staff' | null
}

export class DeliveryManager {
  private scene: Phaser.Scene
  private boxes: LiveBox[] = []
  private boxGroup!: Phaser.Physics.Arcade.Group
  /** Nhóm vật lý tĩnh cho bãi nhận hàng ngoài Shop */
  private deliveryZoneGroup!: Phaser.Physics.Arcade.StaticGroup
  private environmentManager: EnvironmentManager
  private lastSpawnTime = 0
  private spawnInterval = 800
  private keyF!: Phaser.Input.Keyboard.Key
  private hintText!: Phaser.GameObjects.Text


  constructor(scene: Phaser.Scene, environmentManager: EnvironmentManager) {
    this.scene = scene
    this.environmentManager = environmentManager
    this.keyF = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F)
    
    // 1. Khởi tạo Box Group (Vật thể động)
    this.boxGroup = this.scene.physics.add.group({
      bounceX: 0.3,
      bounceY: 0.3,
      collideWorldBounds: true
    })

    // 2. Khởi tạo Delivery Zone (Vật thể tĩnh)
    this.deliveryZoneGroup = this.scene.physics.add.staticGroup()
    
    // Lấy zone từ EnvironmentManager (đã được tính trong refreshEnvironment)
    const dz = this.environmentManager.deliveryZone
    
    // Tạo mặt sàn bãi nhận hàng (Màu xám đường nhựa)
    const zoneRect = this.scene.add.rectangle(dz.x, dz.y, dz.width, 50, 0x333333)
    zoneRect.setDepth(DEPTH.FURNITURE - 1)
    this.deliveryZoneGroup.add(zoneRect)
    
    // Vẽ Text tiêu đề trên mặt sàn
    this.scene.add.text(dz.x, dz.y - 20, "BÃI NHẬN HÀNG", {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#aaaaaa'
    }).setOrigin(0.5).setDepth(DEPTH.FURNITURE)

    // 3. Thiết lập va chạm
    // (Bỏ va chạm giữa các thùng với nhau để tránh tình trạng rung/văng khi chồng lấp quá nhiều)
    // this.scene.physics.add.collider(this.boxGroup, this.boxGroup)
    this.scene.physics.add.collider(this.boxGroup, this.environmentManager.wallsGroup)
    this.scene.physics.add.collider(this.boxGroup, this.deliveryZoneGroup)

    // UI Hint Text
    this.hintText = this.scene.add.text(0, 0, '', {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.75)',
      padding: { x: 10, y: 6 },
      fontStyle: 'bold',
    }).setDepth(999).setScrollFactor(0).setVisible(false)
  }

  update(time: number, playerX: number, playerY: number) {
    this.trySpawnNext(time)
    this.updateCarryPosition(playerX, playerY)
    this.checkPickup(playerX, playerY)
    this.updateHintText(playerX, playerY)
    this.checkCarriedBoxConsumed()
    this.syncToStore()
    
    // R2: Y-SORT for all live boxes every frame
    for (const box of this.boxes) {
      if (box.isBeingCarried) {
        // Carried box must render above the carrier entity.
        // Since carrier depth = LAYER3_OBJECTS + carrier.y, add +1 to guarantee
        // the box draws on top of the carrier sprite.
        box.sprite.setDepth(DEPTH.LAYER3_OBJECTS + box.sprite.y + 1)
      } else {
        applyDynamicYSort(box.sprite)
      }

      // Keep labels positioned above the sprite
      if (box.label)    box.label.setPosition(box.sprite.x, box.sprite.y - 40)
      if (box.qtyLabel) box.qtyLabel.setPosition(box.sprite.x, box.sprite.y - 25)
    }
  }

  /**
   * Đồng bộ với Vue: Nếu Pinia đánh dấu thùng hàng đã được tiêu thụ, thì xóa sprite.
   */
  private checkCarriedBoxConsumed() {
    const deliveryStore = useDeliveryStore()
    if (deliveryStore.isCarriedBoxConsumed) {
      this.removeCarriedBox()
      deliveryStore.dropBox()
      deliveryStore.isCarriedBoxConsumed = false
    }
  }

  private trySpawnNext(time: number) {
    if (time < this.lastSpawnTime + this.spawnInterval) return
    const deliveryStore = useDeliveryStore()
    if (deliveryStore.pendingDeliveries.length === 0) return

    const item = deliveryStore.consumeDelivery()
    if (!item) return

    this.lastSpawnTime = time
    this.spawnBox(item)
  }

  private spawnBox(item: { itemId: string; name: string; type: string; quantity: number }, x?: number, y?: number) {
    const dz = this.environmentManager.deliveryZone
    
    // Default coordinates if not provided
    const halfWidth = dz.width / 2
    const spawnX = x ?? (dz.x + Phaser.Math.Between(-halfWidth * 0.7, halfWidth * 0.7))
    const spawnY = y ?? (dz.y - 200) // Rơi từ trên cao xuống

    // ==================== SPAWN BOX (2.5D) ====================
    const boxTexture = item.type === 'furniture' ? AppConfig.ASSETS.BOXES.FURNITURE : AppConfig.ASSETS.BOXES.ITEM
    const boxSprite = this.scene.physics.add.sprite(spawnX, spawnY, boxTexture)
    boxSprite.setOrigin(0.5, 1)               // R1: foot anchor
    applyFootCollider(boxSprite, 1.0)         // Box is cuboid — full-height collider
    boxSprite.setCollideWorldBounds(true)
    boxSprite.setBounce(0.3)
    // R2: Initial Y-sort depth (updated every frame in update() via applyDynamicYSort)
    applyDynamicYSort(boxSprite)
    
    // Thêm vào physics group
    this.boxGroup.add(boxSprite)
    
    const body = boxSprite.body as Phaser.Physics.Arcade.Body
    body.setGravityY(500) // Tăng trọng lực để rớt thật hơn
    body.setVelocityY(50) // Rớt xuống

    const label = this.scene.add.text(spawnX, spawnY - 40, item.name.substring(0, 20), {
      fontSize: '9px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 3, y: 2 }
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    const qtyLabel = this.scene.add.text(spawnX, spawnY - 25, `×${item.quantity}`, {
      fontSize: '11px',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    const id = `box_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    this.boxes.push({
      id,
      sprite: boxSprite,
      label,
      qtyLabel,
      itemId: item.itemId,
      type: item.type,
      quantity: item.quantity,
      name: item.name,
      isBeingCarried: false,
      carriedBy: null
    })
  }

  private updateHintText(playerX: number, playerY: number) {
    const deliveryStore = useDeliveryStore()
    const cam = this.scene.cameras.main

    if (deliveryStore.carriedBox) {
      this.hintText
        .setText('[F] Đặt xuống  •  [E] Cất vào kệ')
        .setVisible(true)
        .setPosition(cam.width / 2, cam.height - 80)
        .setOrigin(0.5)
      return
    }

    let hasNearby = false
    for (const box of this.boxes) {
      if (box.carriedBy !== null) continue
      const dist = Phaser.Math.Distance.Between(playerX, playerY, box.sprite.x, box.sprite.y)
      if (dist < 100) {
        hasNearby = true
        break
      }
    }

    if (hasNearby) {
      this.hintText
        .setText('[F] Nhặt thùng hàng')
        .setVisible(true)
        .setPosition(cam.width / 2, cam.height - 80)
        .setOrigin(0.5)
    } else {
      this.hintText.setVisible(false)
    }
  }

  private checkPickup(playerX: number, playerY: number) {
    if (!Phaser.Input.Keyboard.JustDown(this.keyF)) return

    const deliveryStore = useDeliveryStore()
    if (deliveryStore.carriedBox) {
      this.dropCarried()
      return
    }

    let nearest: LiveBox | null = null
    let minDist = 100
    for (const box of this.boxes) {
      if (box.carriedBy !== null) continue
      const dist = Phaser.Math.Distance.Between(playerX, playerY, box.sprite.x, box.sprite.y)
      if (dist < minDist) {
        minDist = dist
        nearest = box
      }
    }

    if (nearest) {
      // Safety: NPCs không bao giờ nhặt thùng Furniture
      // (Dù logic NPC chưa gọi checkPickup này, nhưng đây là safety layer)
      this.pickUp(nearest)
    }
}

  private pickUp(nearest: LiveBox) {
    const deliveryStore = useDeliveryStore()
    nearest.isBeingCarried = true
    nearest.carriedBy = 'player'
    const body = nearest.sprite.body as Phaser.Physics.Arcade.Body
    body.setEnable(false)

    deliveryStore.pickUpBox({
      itemId: nearest.itemId,
      name: nearest.name,
      type: nearest.type as any,
      quantity: nearest.quantity,
      imageUrl: '',
    })

    // Hiệu ứng Visual khi nhặt (setTint thay vì fillStyle)
    nearest.sprite.setTint(0xffdd77)
    this.scene.time.delayedCall(200, () => nearest.sprite.clearTint())
  }

  private updateCarryPosition(playerX: number, playerY: number) {
    const deliveryStore = useDeliveryStore()
    if (!deliveryStore.carriedBox) return
    
    // Tìm thùng hàng mà NGƯỜI CHƠI đang cầm
    const idx = this.boxes.findIndex(b => b.carriedBy === 'player')
    if (idx === -1) return
    
    const box = this.boxes[idx]
    box.sprite.setPosition(playerX, playerY - 35) // Offset khi cầm
  }

  private dropCarried() {
    const deliveryStore = useDeliveryStore()
    const idx = this.boxes.findIndex(b => b.carriedBy === 'player')
    if (idx === -1) return
    const box = this.boxes[idx]
    
    box.isBeingCarried = false
    box.carriedBy = null
    const body = box.sprite.body as Phaser.Physics.Arcade.Body
    body.setEnable(true)
    deliveryStore.dropBox()
  }

  // === STAFF AI API ===

  /**
   * Lấy danh sách các thùng hàng đang nằm trên đất (không bị ai cầm).
   */
  public getUncarriedBoxes() {
    return this.boxes.filter(b => b.carriedBy === null)
  }

  public getBoxById(boxId: string) {
    return this.boxes.find(b => b.id === boxId) ?? null
  }

  /**
   * Nhân viên nhặt thùng hàng.
   */
  public staffPickUpBox(boxId: string) {
    const box = this.boxes.find(b => b.id === boxId)
    if (!box || box.carriedBy !== null) return false
    
    box.isBeingCarried = true
    box.carriedBy = 'staff'
    const body = box.sprite.body as Phaser.Physics.Arcade.Body
    body.setEnable(false)

    // Cập nhật trạng thái trong store (tùy chọn, để debug hoặc UI)
    // currently deliveryStore.carriedBox is mainly for player HUD.
    // We could add a list of carried boxes by staff in staffStore or deliveryStore if needed.
    
    return true
  }

  /**
   * Nhân viên đặt thùng hàng xuống hoặc nạp vào kệ.
   */
  public staffDropBox(boxId: string, x: number, y: number) {
    const box = this.boxes.find(b => b.id === boxId)
    if (!box) return
    
    box.isBeingCarried = false
    box.carriedBy = null
    box.sprite.setPosition(x, y)
    const body = box.sprite.body as Phaser.Physics.Arcade.Body
    body.setEnable(true)
  }

  /**
   * Cập nhật vị trí thùng hàng do Nhân viên đang cầm (gọi từ AI loop).
   */
  public updateStaffCarryPosition(boxId: string, x: number, y: number) {
    const box = this.boxes.find(b => b.id === boxId)
    if (!box || box.carriedBy !== 'staff') return
    
    box.sprite.setPosition(x, y - 10) // Offset sát người
  }

  handleShelfInteraction(shelfId: string): boolean {
    const deliveryStore = useDeliveryStore()
    if (!deliveryStore.carriedBox) return false

    const furnitureStore = useFurnitureStore()
    const shelf = furnitureStore.placedShelves[shelfId]
    if (!shelf) return false

    const carried = deliveryStore.carriedBox
    const shelfRole = shelf.role ?? 'selling'

    if (shelfRole === 'selling') {
      if (carried.type === 'furniture') {
        furnitureStore.startBuildMode(carried.itemId)
        this.removeCarriedBox()
        deliveryStore.dropBox()
        return true
      }
      useUIStore().openShelfMenu(shelfId)
      return true
    } else {
      if (carried.type === 'furniture') {
        furnitureStore.startBuildMode(carried.itemId)
      } else {
        const inventoryStore = useInventoryStore()
        if (!inventoryStore.shopInventory[carried.itemId]) {
          inventoryStore.shopInventory[carried.itemId] = 0
        }
        inventoryStore.shopInventory[carried.itemId] += carried.quantity
      }
      
      this.removeCarriedBox()
      deliveryStore.dropBox()
      return true
    }
  }

  public removeCarriedBox() {
    const idx = this.boxes.findIndex(b => b.carriedBy === 'player')
    if (idx === -1) return
    this.removeBoxById(this.boxes[idx].id)
  }

  public removeBoxById(boxId: string) {
    const idx = this.boxes.findIndex(b => b.id === boxId)
    if (idx === -1) return
    const box = this.boxes[idx]
    
    this.boxGroup.remove(box.sprite, true, true)
    box.label.destroy()
    box.qtyLabel.destroy()
    this.boxes.splice(idx, 1)
  }

  private syncToStore() {
    const deliveryStore = useDeliveryStore()
    // Chỉ sync 1 lần 1 lúc hoặc khi có thay đổi. 
    // Cho đơn giản, sync mỗi update (100ms) là đủ.
    deliveryStore.activeBoxes = this.getSerializableBoxes()
  }

  // === PERSISTENCE ===

  public getSerializableBoxes() {
    return this.boxes.map(b => ({
      itemId: b.itemId,
      name: b.name,
      type: b.type,
      quantity: b.quantity,
      x: b.sprite.x,
      y: b.sprite.y
    }))
  }

  public restoreBox(data: any) {
    this.spawnBox(data, data.x, data.y)
  }

  destroy() {
    this.boxes.forEach(b => {
      b.sprite.destroy()
      b.label.destroy()
      b.qtyLabel.destroy()
    })
    this.boxes = []
    this.boxGroup.clear(true, true)
    this.deliveryZoneGroup.clear(true, true)
    this.hintText.destroy()
  }
}
