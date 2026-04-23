import Phaser from 'phaser'
import { useDeliveryStore } from '../../inventory/store/deliveryStore'
import { EnvironmentManager } from './EnvironmentManager'
import { DEPTH } from '../config'
import { AppConfig } from '../../../game/config/AppConfig'
import { applyDynamicYSort, applyFootCollider } from '../ySortUtils'
import { useFurnitureStore } from '../../furniture/store/furnitureStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { useUIStore } from '../../shop-ui/store/uiStore'
import { useGradingStore } from '../../grading/store/gradingStore'
import { usePlayerPocketStore } from '../../inventory/store/playerPocketStore'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { TEX } from '../assetKeys'

interface LiveBox {
  id: string
  sprite: Phaser.Physics.Arcade.Sprite
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
  private keyR!: Phaser.Input.Keyboard.Key
  private keyB!: Phaser.Input.Keyboard.Key
  private hintText!: Phaser.GameObjects.Text
  private packageSprites: Map<string, Phaser.GameObjects.Sprite> = new Map()
  private gradingArrivedHandler: ((ev: Event) => void) | null = null
  private gradingConsumedHandler: ((ev: Event) => void) | null = null


  constructor(scene: Phaser.Scene, environmentManager: EnvironmentManager) {
    this.scene = scene
    this.environmentManager = environmentManager
    this.keyF = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F)
    this.keyR = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)
    this.keyB = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B)
    
    // 1. Khởi tạo Box Group (Vật thể động)
    this.boxGroup = this.scene.physics.add.group({
      bounceX: 0.3,
      bounceY: 0.3,
      collideWorldBounds: true
    })

    // 2. Khởi tạo Delivery Zone Group
    this.deliveryZoneGroup = this.scene.physics.add.staticGroup()
    
    // Ban đầu có thể chưa có zone, chúng ta sẽ vẽ lại trong refreshDeliveryZone
    this.refreshDeliveryZone()

    // 3. Thiết lập va chạm
    // KHÔNG chặn thùng hàng bằng collider của bãi nhận hàng nữa để thùng có thể rơi vào "lòng" hình vuông
    this.scene.physics.add.collider(this.boxGroup, this.environmentManager.wallsGroup)

    // UI Hint Text
    this.hintText = this.scene.add.text(0, 0, '', {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.75)',
      padding: { x: 10, y: 6 },
      fontStyle: 'bold',
    }).setDepth(999).setScrollFactor(0).setVisible(false)

    // 4. Event listeners
    this.gradingArrivedHandler = ((ev: CustomEvent) => {
      const { packageId } = ev.detail
      this.spawnGradingPackage(packageId)
    }) as EventListener

    this.gradingConsumedHandler = ((ev: CustomEvent) => {
      const { packageId } = ev.detail
      this.removeGradingPackage(packageId)
    }) as EventListener

    window.addEventListener('grading:package-arrived', this.gradingArrivedHandler)
    window.addEventListener('grading:package-consumed', this.gradingConsumedHandler)
  }

  /**
   * Vẽ lại khu vực nhận hàng dựa trên tọa độ mới nhất
   */
  public refreshDeliveryZone() {
    this.deliveryZoneGroup.clear(true, true)
    const dz = this.environmentManager.deliveryZone
    if (!dz) return

    // Vẽ nền bãi nhận hàng (để sâu hẳn xuống dưới)
    const zoneRect = this.scene.add.rectangle(dz.x, dz.y, dz.width, dz.height, 0x333333, 0.6)
    zoneRect.setDepth(DEPTH.LAYER1_FLOOR + 0.2) // Trên sàn vỉa hè một chút
    zoneRect.setStrokeStyle(2, 0x555555)
    this.deliveryZoneGroup.add(zoneRect)

    // Vẽ nhãn tiêu đề
    const label = this.scene.add.text(dz.x, dz.y, "BÃI NHẬN HÀNG", {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.3)',
      padding: { x: 5, y: 2 }
    }).setOrigin(0.5).setDepth(DEPTH.LAYER1_FLOOR + 0.3)
    this.deliveryZoneGroup.add(label)
  }

  update(time: number, playerX: number, playerY: number) {
    this.trySpawnNext(time)
    this.updateCarryPosition(playerX, playerY)
    this.checkPickup(playerX, playerY)
    this.updateHintText(playerX, playerY)
    this.checkCarriedBoxConsumed()
    this.syncToStore()
    
    // Sử dụng vòng lặp ngược (reverse) để an toàn khi xóa phần tử trong mảng
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const box = this.boxes[i]
      if (!box || !box.sprite || !box.sprite.active) continue

      // Logic rơi tự do cho đến khi chạm "đất" (Target Y)
      const isBeingCarried = box.isBeingCarried || box.carriedBy !== null
      if (!isBeingCarried) {
        const targetY = box.sprite.getData('targetY')
        if (targetY !== undefined) {
          if (box.sprite.y < targetY) {
            // Đang rơi
            const body = box.sprite.body as Phaser.Physics.Arcade.Body
            if (body && body.velocity.y === 0) body.setVelocityY(300)
            box.sprite.setData('isLanded', false)
          } else {
            // Đã chạm đất
            box.sprite.y = targetY
            const body = box.sprite.body as Phaser.Physics.Arcade.Body
            if (body) {
                body.setVelocityY(0)
                body.setAccelerationY(0)
                body.setGravityY(0)
            }
            box.sprite.setData('isLanded', true)
          }
        }
      }

      // Xử lý Depth & Labels
      if (box.isBeingCarried) {
        box.sprite.setDepth(DEPTH.LAYER3_OBJECTS + box.sprite.y + 1)
      } else {
        applyDynamicYSort(box.sprite)
      }

      if (box.label && box.label.active)    box.label.setPosition(box.sprite.x, box.sprite.y - 40)
      if (box.qtyLabel && box.qtyLabel.active) box.qtyLabel.setPosition(box.sprite.x, box.sprite.y - 25)
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
    
    // Randomize target position within the zone bounds
    const padding = 10
    const targetX = x ?? (dz.x + Phaser.Math.Between(-dz.width/2 + padding, dz.width/2 - padding))
    const targetY = y ?? (dz.y + Phaser.Math.Between(-dz.height/2 + padding, dz.height/2 - padding))
    
    // Spawn high above to fall down
    const spawnY = targetY - 300

    // ==================== SPAWN BOX (2.5D) ====================
    const boxTexture = item.type === 'furniture' ? AppConfig.ASSETS.BOXES.FURNITURE : AppConfig.ASSETS.BOXES.ITEM
    const boxSprite = this.scene.physics.add.sprite(targetX, spawnY, boxTexture)
    boxSprite.setOrigin(0.5, 1)               
    applyFootCollider(boxSprite, 1.0)         
    boxSprite.setCollideWorldBounds(true)
    boxSprite.setBounce(0.3)
    boxSprite.setData('targetY', targetY) // Đánh dấu tọa độ tiếp đất mong muốn
    
    applyDynamicYSort(boxSprite)
    this.boxGroup.add(boxSprite)
    
    const body = boxSprite.body as Phaser.Physics.Arcade.Body
    body.setVelocityY(300) 

    const label = this.scene.add.text(targetX, spawnY - 40, item.name.substring(0, 20), {
      fontSize: '9px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 3, y: 2 }
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    const qtyLabel = this.scene.add.text(targetX, spawnY - 25, `×${item.quantity}`, {
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
    const uiStore = useUIStore()
    const cam = this.scene.cameras.main

    // ── RULE: TUYỆT ĐỐI ẩn hint khi đang mở bất kỳ UI Modal nào ──
    const isAnyModalOpen =
      uiStore.showShelfMenu ||
      uiStore.showBinderMenu ||
      uiStore.showBuildMenu ||
      uiStore.showOnlineShop

    if (isAnyModalOpen) {
      this.hintText.setVisible(false)
      return
    }

    // ── Đang cầm thùng ──
    if (deliveryStore.carriedBox) {
      const actionText = deliveryStore.carriedBox.type === 'furniture'
        ? '[F] Thả xuống  •  [R] Mở thùng để đặt đồ'
        : '[F] Thả xuống  •  [R] Bóc thùng → vào Túi'

      this.hintText
        .setText(actionText)
        .setVisible(true)
        .setPosition(cam.width / 2, cam.height - 80)
        .setOrigin(0.5)
      return
    }

    // ── Có thùng gần ──
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
    const deliveryStore = useDeliveryStore()

    // ── PHÍM R: Bóc thùng đang vác ──
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
      if (deliveryStore.carriedBox) {
        if (deliveryStore.carriedBox.type === 'furniture') {
          // Bóc thùng furniture -> vào chế độ đặt đồ
          useFurnitureStore().startBuildMode(deliveryStore.carriedBox.itemId)
          this.removeCarriedBox()
          deliveryStore.dropBox()
        } else {
          // Bóc thùng hàng -> vào Túi
          this.unpackCarriedBox()
        }
        return
      }
    }

    // ── PHÍM B: Mở túi (Pocket) ──
    if (Phaser.Input.Keyboard.JustDown(this.keyB)) {
      useGameStore().openPocketModal()
    }

    // ── PHÍM F: Nhặt / Thả thùng ──
    if (!Phaser.Input.Keyboard.JustDown(this.keyF)) return

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
      this.pickUp(nearest)
    }
  }

  /**
   * Bóc thùng hàng đang vác: Giải phóng toàn bộ Pack/Box bên trong
   * vào playerPocketStore của Player.
   * Hộp vật lý Phaser bị hủy.
   */
  public unpackCarriedBox() {
    const deliveryStore = useDeliveryStore()
    const pocketStore = usePlayerPocketStore()
    const inventoryStore = useInventoryStore()

    const carried = deliveryStore.carriedBox
    if (!carried) return

    if (carried.type === 'furniture') {
      // Đồ nội thất không bóc được, thông báo Player
      console.warn('[DeliveryManager] Không thể bóc thùng nội thất. Hãy đặt xuống gần kệ.')
      return
    }

    // Lấy thông tin item để biết quantity bên trong
    const shopItem = inventoryStore.shopItems[carried.itemId]
    if (!shopItem) {
      // Fallback: đẩy thẳng vào pocket dù không có shopItem
      pocketStore.addToPocket({
        itemId: carried.itemId,
        name: carried.name,
        type: carried.type as 'pack' | 'box',
        quantity: carried.quantity,
      })
      this.removeCarriedBox()
      deliveryStore.dropBox()
      return
    }

    // Nếu là Box → unbox thành Pack trước, rồi vào pocket
    if (carried.type === 'box' && shopItem.contains) {
      const innerItemId = shopItem.contains.itemId
      const innerAmount = shopItem.contains.amount * carried.quantity
      const innerItem = inventoryStore.shopItems[innerItemId]

      pocketStore.addToPocket({
        itemId: innerItemId,
        name: innerItem?.name ?? innerItemId,
        type: 'pack',
        quantity: innerAmount,
        sourceSetId: innerItem?.sourceSetId,
      })
    } else {
      // Đây là Pack trực tiếp
      pocketStore.addToPocket({
        itemId: carried.itemId,
        name: carried.name,
        type: carried.type as 'pack',
        quantity: carried.quantity,
        sourceSetId: shopItem?.sourceSetId,
      })
    }

    // Hủy thùng vật lý
    this.removeCarriedBox()
    deliveryStore.dropBox()
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
    return this.boxes.filter(b => b.carriedBy === null && b.sprite.getData('isLanded') === true)
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
    if (body) {
      body.setEnable(false)
    }

    return true
  }

  /**
   * Tạo một thùng hàng tại chỗ (dành cho nhân viên lấy từ kho)
   */
  public spawnStaffBoxAt(item: { itemId: string; name: string; type: string; quantity: number }, x: number, y: number): string {
    const boxId = `box_storage_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    
    // Tạo sprite
    const boxTexture = item.type === 'furniture' ? AppConfig.ASSETS.BOXES.FURNITURE : AppConfig.ASSETS.BOXES.ITEM
    const boxSprite = this.scene.physics.add.sprite(x, y, boxTexture)
    boxSprite.setOrigin(0.5, 1)
    applyFootCollider(boxSprite, 1.0)
    boxSprite.setCollideWorldBounds(true)
    
    this.boxGroup.add(boxSprite)
    const body = boxSprite.body as Phaser.Physics.Arcade.Body
    body.setEnable(false) // Tắt vật lý ngay lập tức vì sẽ được vác đi

    const label = this.scene.add.text(x, y - 40, item.name.substring(0, 20), {
      fontSize: '9px', color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 3, y: 2 }
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    const qtyLabel = this.scene.add.text(x, y - 25, `×${item.quantity}`, {
      fontSize: '11px', color: '#fbbf24', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    this.boxes.push({
      id: boxId,
      sprite: boxSprite,
      label,
      qtyLabel,
      itemId: item.itemId,
      type: item.type,
      quantity: item.quantity,
      name: item.name,
      isBeingCarried: true,
      carriedBy: 'staff'
    })

    return boxId
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
    body.setGravityY(0)    // 🆕 Tắt trọng lực để không rơi xuyên map
    body.setVelocity(0, 0) // 🆕 Dừng mọi chuyển động thừa
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
    const furnitureStore = useFurnitureStore()
    const uiStore = useUIStore()
    const shelf = furnitureStore.placedShelves[shelfId]
    if (!shelf) return false

    // Nếu đang cầm đồ nội thất → vẫn cho phép đặt đồ
    if (deliveryStore.carriedBox?.type === 'furniture') {
      furnitureStore.startBuildMode(deliveryStore.carriedBox.itemId)
      this.removeCarriedBox()
      deliveryStore.dropBox()
      return true
    }

    // Mọi trường hợp còn lại → chỉ mở Shelf UI
    // Player sẽ tự tay kéo hàng từ Pocket vào tầng kệ trong menu
    uiStore.openShelfMenu(shelfId)
    return true
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

  private lastSyncData: string = ''

  private syncToStore() {
    const deliveryStore = useDeliveryStore()
    const currentData = JSON.stringify(this.getSerializableBoxes())
    
    // Only sync if data changed to prevent massive auto-save overhead
    if (this.lastSyncData !== currentData) {
      deliveryStore.activeBoxes = JSON.parse(currentData)
      this.lastSyncData = currentData
    }
  }

  // === PERSISTENCE ===

  public getSerializableBoxes() {
    return this.boxes.map(b => ({
      itemId: b.itemId,
      name: b.name,
      type: b.type,
      quantity: b.quantity,
      x: Math.round(b.sprite.x), 
      y: Math.round(b.sprite.y)
    }))
  }


  public restoreBox(data: any) {
    this.spawnBox(data, data.x, data.y)
  }

  // === GRADING PACKAGES ===

  private spawnGradingPackage(packageId: string) {
    console.log('[DeliveryManager] Spawning grading package:', packageId)
    // Spawn gần cửa shop
    const door = this.environmentManager.getDoorLocation()
    const x = door.x + 60 + Math.random() * 40
    const y = door.y + 30

    const sprite = this.scene.add.sprite(x, y, TEX.PACKAGE_BOX)
      .setOrigin(0.5, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(DEPTH.LAYER3_OBJECTS + y)

    // Icon ❓ trên đầu để Player biết click được
    const label = this.scene.add.text(x, y - 50, '❓', { 
        fontSize: '20px',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: { x: 4, y: 2 }
    })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI_TEXT)

    // Click handler
    sprite.on('pointerdown', () => {
      useGradingStore().openPackage(packageId)
    })

    // Idle bounce animation
    this.scene.tweens.add({
      targets: [sprite, label],
      y: '-=6',
      duration: 800, 
      yoyo: true, 
      repeat: -1,
      ease: 'Sine.easeInOut'
    })

    this.packageSprites.set(packageId, sprite)
    sprite.setData('label', label)
  }

  private removeGradingPackage(packageId: string) {
    console.log('[DeliveryManager] Removing grading package:', packageId)
    const sprite = this.packageSprites.get(packageId)
    if (!sprite) return
    const label = sprite.getData('label') as Phaser.GameObjects.Text
    label?.destroy()
    sprite.destroy()
    this.packageSprites.delete(packageId)
  }

  destroy() {
    this.boxes.forEach(b => {
      b.sprite.destroy()
      b.label.destroy()
      b.qtyLabel.destroy()
    })
    this.boxes = []
    
    // Clear packages
    this.packageSprites.forEach((_, packageId) => {
        this.removeGradingPackage(packageId)
    })
    this.packageSprites.clear()

    this.boxGroup.clear(true, true)
    this.deliveryZoneGroup.clear(true, true)
    this.hintText.destroy()

    if (this.gradingArrivedHandler) {
      window.removeEventListener('grading:package-arrived', this.gradingArrivedHandler)
      this.gradingArrivedHandler = null
    }
    if (this.gradingConsumedHandler) {
      window.removeEventListener('grading:package-consumed', this.gradingConsumedHandler)
      this.gradingConsumedHandler = null
    }
  }
}
