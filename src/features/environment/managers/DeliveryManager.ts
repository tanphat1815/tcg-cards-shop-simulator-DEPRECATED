import Phaser from 'phaser'
import { useDeliveryStore } from '../../inventory/store/deliveryStore'
import { EnvironmentManager } from './EnvironmentManager'
import { DEPTH } from '../config'
import { useFurnitureStore } from '../../furniture/store/furnitureStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { useUIStore } from '../../shop-ui/store/uiStore'

interface LiveBox {
  id: string
  sprite: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  qtyLabel: Phaser.GameObjects.Text
  itemId: string
  type: string
  quantity: number
  name: string
  isBeingCarried: boolean
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
    
    // Tính toán vị trí bãi nhận hàng dựa trên vị trí cửa
    const doorPos = this.environmentManager.getDoorLocation()
    
    // Tạo mặt sàn bãi nhận hàng (Màu xám đường nhựa)
    const zoneRect = this.scene.add.rectangle(doorPos.x, doorPos.y + 120, 300, 40, 0x333333)
    zoneRect.setDepth(DEPTH.FURNITURE - 1)
    this.deliveryZoneGroup.add(zoneRect)
    
    // Vẽ Text tiêu đề trên mặt sàn
    this.scene.add.text(doorPos.x, doorPos.y + 110, "BÃI NHẬN HÀNG", {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#aaaaaa'
    }).setOrigin(0.5).setDepth(DEPTH.FURNITURE)

    // 3. Thiết lập va chạm
    this.scene.physics.add.collider(this.boxGroup, this.boxGroup)
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
    
    this.boxes.forEach(box => {
      if (!box.isBeingCarried) {
        box.label.setPosition(box.sprite.x, box.sprite.y - 22)
        box.qtyLabel.setPosition(box.sprite.x, box.sprite.y + 22)
      }
    })
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

  private spawnBox(item: { itemId: string; name: string; type: string; quantity: number }) {
    const doorPos = this.environmentManager.getDoorLocation()
    
    // Spawn dao động quanh cửa, nhưng rớt bên ngoài (Y > doorPos.y)
    let spawnX = doorPos.x + Phaser.Math.Between(-100, 100)
    let spawnY = doorPos.y + 20 // Spawn ở phía trên bãi nhận hàng một chút để rớt xuống

    const boxRect = this.scene.add.rectangle(spawnX, spawnY, 48, 36, 0x8B4513) as any
    boxRect.setStrokeStyle(2, 0x5D2906)
    boxRect.setDepth(DEPTH.FURNITURE)
    
    this.scene.physics.add.existing(boxRect)
    this.boxGroup.add(boxRect)
    
    const body = boxRect.body as Phaser.Physics.Arcade.Body
    body.setGravityY(500) // Tăng trọng lực để rớt thật hơn
    body.setBounce(0.3)
    body.setVelocityY(50) // Rớt xuống
    body.setCollideWorldBounds(true)

    const label = this.scene.add.text(spawnX, spawnY - 22, item.name.substring(0, 20), {
      fontSize: '9px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 3, y: 2 }
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    const qtyLabel = this.scene.add.text(spawnX, spawnY + 22, `×${item.quantity}`, {
      fontSize: '11px',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    const id = `box_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    this.boxes.push({
      id,
      sprite: boxRect,
      label,
      qtyLabel,
      itemId: item.itemId,
      type: item.type,
      quantity: item.quantity,
      name: item.name,
      isBeingCarried: false,
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
      if (box.isBeingCarried) continue
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
      if (box.isBeingCarried) continue
      const dist = Phaser.Math.Distance.Between(playerX, playerY, box.sprite.x, box.sprite.y)
      if (dist < minDist) {
        minDist = dist
        nearest = box
      }
    }

    if (nearest) {
      this.pickUp(nearest)
    }
  }

  private pickUp(nearest: LiveBox) {
    const deliveryStore = useDeliveryStore()
    nearest.isBeingCarried = true
    const body = nearest.sprite.body as Phaser.Physics.Arcade.Body
    body.setEnable(false)

    deliveryStore.pickUpBox({
      itemId: nearest.itemId,
      name: nearest.name,
      type: nearest.type as any,
      quantity: nearest.quantity,
      imageUrl: '',
    })

    nearest.sprite.setFillStyle(0xffdd77)
    this.scene.time.delayedCall(200, () => nearest.sprite.setFillStyle(0x8B4513))
  }

  private updateCarryPosition(playerX: number, playerY: number) {
    const deliveryStore = useDeliveryStore()
    if (!deliveryStore.carriedBox) return

    const carriedBox = this.boxes.find(b => b.isBeingCarried)
    if (!carriedBox) return

    carriedBox.sprite.setPosition(playerX, playerY - 50)
    carriedBox.label.setPosition(playerX, playerY - 72)
    carriedBox.qtyLabel.setPosition(playerX, playerY - 28)
  }

  private dropCarried() {
    const deliveryStore = useDeliveryStore()
    const box = this.boxes.find(b => b.isBeingCarried)
    if (box) {
      box.isBeingCarried = false
      const body = box.sprite.body as Phaser.Physics.Arcade.Body
      body.setEnable(true)
    }
    deliveryStore.dropBox()
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

  private removeCarriedBox() {
    const idx = this.boxes.findIndex(b => b.isBeingCarried)
    if (idx === -1) return
    const box = this.boxes[idx]
    
    this.boxGroup.remove(box.sprite, true, true)
    box.label.destroy()
    box.qtyLabel.destroy()
    this.boxes.splice(idx, 1)
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
