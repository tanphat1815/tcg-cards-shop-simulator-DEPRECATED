import Phaser from 'phaser'
import { DEPTH } from '../../environment/config'
import { TEX } from '../../environment/assetKeys'
import { applyDynamicYSort, applyFootCollider } from '../../environment/ySortUtils'
import { useStaffStore } from '../store/staffStore'
import { useGameStore } from '../../shop-ui/store/gameStore'
import type { WorkerDuty } from '../types'
import { EnvironmentManager } from '../../environment/managers/EnvironmentManager'
import { useFurnitureStore } from '../../furniture/store/furnitureStore'

import { DeliveryManager } from '../../environment/managers/DeliveryManager'

/** Trạng thái nội bộ của nhân viên khi thực hiện Restock */
export type RestockSubState = 
  | 'IDLE' 
  | 'SEARCH_BOX' 
  | 'MOVE_TO_BOX' 
  | 'SEARCH_SHELF' 
  | 'MOVE_TO_SHELF' 
  | 'RESTOCKING' 
  | 'RETURN_BOX'
  | 'DISPOSE_BOX'

interface WorkerNPC {
  instanceId: string
  sprite: Phaser.Physics.Arcade.Sprite
  statusText: Phaser.GameObjects.Text
  targetX: number
  targetY: number
  duty: WorkerDuty
  subState: RestockSubState
  targetDeskId?: string | null
  
  // Data cho Restock
  carriedBoxId?: string | null
  targetShelfId?: string | null
  targetTierIndex?: number | null
  actionTimer?: number
  
  // Anti-stuck
  stuckTimer: number
  lastX: number
  lastY: number
}

/**
 * StaffManager - Hệ thống quản lý Nhân viên (Staff) trong Phaser.
 */
export class StaffManager {
  private scene: Phaser.Scene
  private environmentManager: EnvironmentManager
  private deliveryManager: DeliveryManager
  private workers: Map<string, WorkerNPC> = new Map()
  private workerSpeed = 100
  private lastUpdate = 0

  constructor(scene: Phaser.Scene, environmentManager: EnvironmentManager, deliveryManager: DeliveryManager) {
    this.scene = scene
    this.environmentManager = environmentManager
    this.deliveryManager = deliveryManager
  }

  public syncWorkers() {
    const staffStore = useStaffStore()
    const hiredIds = new Set(staffStore.hiredWorkers.map(w => w.instanceId))

    // 1. Dọn dẹp
    for (const [instanceId, worker] of this.workers.entries()) {
      if (!hiredIds.has(instanceId)) {
        worker.sprite.destroy()
        worker.statusText.destroy()
        this.workers.delete(instanceId)
      }
    }

    // 2. Thêm mới / Cập nhật
    staffStore.hiredWorkers.forEach((w, index) => {
      let worker = this.workers.get(w.instanceId)
      
      if (!worker) {
        const spawnLoc = this.environmentManager.idleStaffZone
        const sprite = this.scene.physics.add.sprite(
          spawnLoc.x,
          spawnLoc.y,
          TEX.STAFF,   // ← Đổi từ 'npc' sang TEX.STAFF (có uniform riêng)
          0
        )
        sprite.setOrigin(0.5, 1)             // R1: foot anchor
        applyFootCollider(sprite, 0.3)       // R3: bottom 30% collider
        sprite.refreshBody()
        sprite.setCollideWorldBounds(true)
        applyDynamicYSort(sprite)            // R2: initial Y-sort depth
        
        const statusText = this.scene.add.text(sprite.x, sprite.y - 55, '', {
            fontSize: '10px',
            color: '#00ffff'
        }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

        worker = {
          instanceId: w.instanceId,
          sprite,
          statusText,
          targetX: sprite.x,
          targetY: sprite.y,
          duty: w.duty,
          subState: 'IDLE',
          targetDeskId: w.targetDeskId,
          stuckTimer: 0,
          lastX: sprite.x,
          lastY: sprite.y
        }
        this.workers.set(w.instanceId, worker)
      }

      const current = this.workers.get(w.instanceId)!
      if (current.duty !== w.duty || current.targetDeskId !== w.targetDeskId) {
        // Reset subState nếu đổi duty
        if (current.duty !== w.duty) {
           this.dropAnything(current)
           current.subState = 'IDLE'
        }
        current.duty = w.duty
        current.targetDeskId = w.targetDeskId
        this.updateWorkerTarget(current, index)
      }
    })
  }

  private dropAnything(worker: WorkerNPC) {
    if (worker.carriedBoxId) {
      this.deliveryManager.staffDropBox(worker.carriedBoxId, worker.sprite.x, worker.sprite.y)
      worker.carriedBoxId = null
    }
    worker.targetShelfId = null
    worker.targetTierIndex = null
  }

  private updateWorkerTarget(worker: WorkerNPC, index: number = 0) {
    const gameStore = useGameStore()

    if (worker.duty === 'CHECKOUT') {
      const deskId = worker.targetDeskId
      const desk = deskId ? (gameStore.placedCashiers as any)[deskId] : Object.values(gameStore.placedCashiers)[0]
      if (desk) {
        worker.targetX = desk.x
        worker.targetY = desk.y - 40
      }
      return
    }

    // Duty: RESTOCK
    switch (worker.subState) {
      case 'IDLE':
      case 'SEARCH_BOX': {
        const idleZone = this.environmentManager.idleStaffZone
        const spacing = 32
        const totalWorkers = useStaffStore().hiredWorkers.length
        const startOffset = -((totalWorkers - 1) * spacing) / 2
        const workerOffset = startOffset + (index * spacing)
        worker.targetX = idleZone.x + workerOffset
        worker.targetY = idleZone.y
        break
      }
      case 'SEARCH_SHELF': {
        // Tạm thời đứng im hoặc move tới giữa shop
        break
      }
      default:
        break
    }
  }

  public update(time: number) {
    this.workers.forEach(worker => {
      this.updateVisuals(worker)
    })

    if (time > this.lastUpdate + 100) {
      this.lastUpdate = time
      const indexArr = Array.from(this.workers.keys())
      this.workers.forEach(worker => {
        const idx = indexArr.indexOf(worker.instanceId)
        this.handleAI(worker, idx)
      })
    }
  }

  private handleAI(worker: WorkerNPC, index: number) {
    // 1. Anti-stuck logic
    const distLast = Phaser.Math.Distance.Between(worker.sprite.x, worker.sprite.y, worker.lastX, worker.lastY)
    if (distLast < 1 && worker.duty !== 'NONE') {
      worker.stuckTimer += 100
    } else {
      worker.stuckTimer = 0
    }
    worker.lastX = worker.sprite.x
    worker.lastY = worker.sprite.y

    if (worker.stuckTimer > 3000) {
       // Warp to target if stuck
       worker.sprite.setPosition(worker.targetX, worker.targetY)
       worker.stuckTimer = 0
    }

    // 2. Dispatcher
    if (worker.duty === 'CHECKOUT') {
      this.handleCheckoutAI(worker)
    } else if (worker.duty === 'RESTOCK') {
      this.handleRestockAI(worker, index)
    } else {
      this.handleIdleAI(worker, index)
    }
  }

  /** Logic cũ cho Checkout */
  private handleCheckoutAI(worker: WorkerNPC) {
    const dist = Phaser.Math.Distance.Between(worker.sprite.x, worker.sprite.y, worker.targetX, worker.targetY)
    if (dist > 10) {
      this.scene.physics.moveTo(worker.sprite, worker.targetX, worker.targetY, this.workerSpeed)
    } else {
      worker.sprite.body?.velocity.set(0)
    }
  }

  private handleIdleAI(worker: WorkerNPC, _index: number) {
    const dist = Phaser.Math.Distance.Between(worker.sprite.x, worker.sprite.y, worker.targetX, worker.targetY)
    if (dist > 10) {
      this.scene.physics.moveTo(worker.sprite, worker.targetX, worker.targetY, this.workerSpeed)
    } else {
      worker.sprite.body?.velocity.set(0)
    }
  }

  /** TOÀN BỘ LOGIC RESTOCK (9 States) */
  private handleRestockAI(worker: WorkerNPC, _index: number) {
    const furnitureStore = useFurnitureStore()

    // Nếu đang có timer (đang Restocking)
    if (worker.actionTimer && worker.actionTimer > this.scene.time.now) {
       worker.sprite.body?.velocity.set(0)
       return
    }

    switch (worker.subState) {
      case 'IDLE':
        if (worker.carriedBoxId) {
          worker.subState = 'SEARCH_SHELF'
        } else {
          worker.subState = 'SEARCH_BOX'
        }
        break

      case 'SEARCH_BOX': {
        if (worker.carriedBoxId) {
          worker.subState = 'SEARCH_SHELF'
          return
        }

        const boxes = this.deliveryManager.getUncarriedBoxes()
        // Chỉ nhặt thùng 'box' hoặc 'pack', không nhặt 'furniture'
        const validBoxes = boxes.filter(b => b.type !== 'furniture')
        
        // KIỂM TRA: Chỉ nhặt nếu shop có ít nhất 1 kệ (bán hàng hoặc kho)
        const hasShelves = Object.values(furnitureStore.placedShelves).length > 0
        
        if (validBoxes.length > 0 && hasShelves) {
          const target = validBoxes[0]
          
          // "Reserve" box ngay lập tức để tránh nhân viên khác nhặt cùng 1 box
          const success = this.deliveryManager.staffPickUpBox(target.id)
          if (success) {
            worker.carriedBoxId = target.id
            worker.targetX = target.sprite.x
            worker.targetY = target.sprite.y
            worker.subState = 'MOVE_TO_BOX'
          }
        } else {
          // Về Idle Zone chờ
          this.updateWorkerTarget(worker, _index)
          this.moveToTarget(worker)
        }
        break
      }

      case 'MOVE_TO_BOX': {
        if (this.moveToTarget(worker)) {
          // Đã tới nơi và đã pick-up từ Search (Fix Issue #3)
          worker.subState = 'SEARCH_SHELF'
        }
        break
      }

      case 'SEARCH_SHELF': {
        // Cập nhật vị trí box theo nhân viên
        this.deliveryManager.updateStaffCarryPosition(worker.carriedBoxId!, worker.sprite.x, worker.sprite.y)
        
        const box = this.deliveryManager.getBoxById(worker.carriedBoxId!)
        if (!box) {
          worker.subState = 'SEARCH_BOX'
          return
        }

        // Tìm kệ cần itemId này
        const shelves = Object.values(furnitureStore.placedShelves) as any[]
        let found = false
        
        for (const shelf of shelves) {
          if (shelf.role !== 'selling') continue

          // Tìm tier cùng itemId hoặc đang trống
          const tierIdx = shelf.tiers.findIndex((t: any) => 
            (t.itemId === box.itemId && t.slots.length < t.maxSlots) || 
            (t.itemId === null)
          )
          
          if (tierIdx !== -1) {
            worker.targetShelfId = shelf.id
            worker.targetTierIndex = tierIdx
            worker.targetX = shelf.x + (worker.sprite.x < shelf.x ? -40 : 40)
            worker.targetY = shelf.y
            worker.subState = 'MOVE_TO_SHELF'
            found = true
            break
          }
        }

        if (!found) {
           // Không tìm thấy kệ phù hợp -> Về bãi trả lại thùng
           const dz = (this.environmentManager as any).deliveryZone
           worker.targetX = dz.x
           worker.targetY = dz.y
           worker.subState = 'RETURN_BOX'
        }
        break
      }

      case 'RETURN_BOX': {
        this.deliveryManager.updateStaffCarryPosition(worker.carriedBoxId!, worker.sprite.x, worker.sprite.y)
        if (this.moveToTarget(worker)) {
          this.dropAnything(worker)
          worker.subState = 'IDLE'
        }
        break
      }

      case 'MOVE_TO_SHELF': {
        this.deliveryManager.updateStaffCarryPosition(worker.carriedBoxId!, worker.sprite.x, worker.sprite.y)
        if (this.moveToTarget(worker)) {
          worker.subState = 'RESTOCKING'
          worker.actionTimer = this.scene.time.now + 1000 // Delay 1s để đổ hàng
        }
        break
      }

      case 'RESTOCKING': {
        this.deliveryManager.updateStaffCarryPosition(worker.carriedBoxId!, worker.sprite.x, worker.sprite.y)
        const box = this.deliveryManager.getBoxById(worker.carriedBoxId!)
        if (!box) {
          worker.subState = 'SEARCH_BOX'
          return
        }

        // Thực hiện nạp hàng
        const placed = furnitureStore.fillTierFromHand(worker.targetShelfId!, box.itemId, worker.targetTierIndex!, box.quantity)
        
        if (placed > 0) {
          box.quantity -= placed
          // Cập nhật text trên box
          box.qtyLabel.setText(`×${box.quantity}`)
        }

        if (box.quantity <= 0) {
          worker.subState = 'DISPOSE_BOX'
        } else {
          // Thùng còn hàng -> Tìm kệ tiếp theo cho món này
          worker.subState = 'SEARCH_SHELF'
        }
        break
      }

      case 'DISPOSE_BOX': {
        this.deliveryManager.removeBoxById(worker.carriedBoxId!)
        worker.carriedBoxId = null
        worker.subState = 'SEARCH_BOX'
        break
      }
    }
  }

  private moveToTarget(worker: WorkerNPC): boolean {
    const dist = Phaser.Math.Distance.Between(worker.sprite.x, worker.sprite.y, worker.targetX, worker.targetY)
    if (dist > 15) {
      this.scene.physics.moveTo(worker.sprite, worker.targetX, worker.targetY, this.workerSpeed)
      return false
    } else {
      worker.sprite.body?.velocity.set(0)
      return true
    }
  }

  /**
   * Cập nhật diện mạo của worker mỗi frame.
   * 
   * ⚠️ CHÚ Ý SỐNG CÒN:
   * - KHÔNG động đến logic subState / duty / workerData.
   * - THÊM MỚI: applyDynamicYSort mỗi frame.
   * - Animation dùng prefix 'staff-' (nếu staff_sheet giống layout npc thì vẫn có thể dùng 'npc-',
   *   nhưng tách namespace để sau này artist phân biệt rõ).
   */
  private updateVisuals(worker: WorkerNPC) {
    // R2: Y-SORT — MUST be first. Depth = LAYER3_OBJECTS + sprite.y.
    applyDynamicYSort(worker.sprite)

    // Label vị trí — offset đúng chiều cao sprite 48px
    worker.statusText.setPosition(worker.sprite.x, worker.sprite.y - 55)

    let label = ''
    if (worker.duty === 'CHECKOUT') {
      label = 'Checkout'
    } else if (worker.duty === 'RESTOCK') {
      label = `Restock: ${worker.subState}`
    } else {
      label = 'Resting'
    }
    worker.statusText.setText(label)

    const anims = worker.sprite.anims
    const vx = worker.sprite.body?.velocity.x || 0
    const vy = worker.sprite.body?.velocity.y || 0

    // R4: Chọn anim theo trục lớn hơn
    if (Math.abs(vx) > Math.abs(vy)) {
      if (vx < -10)      anims.play('staff-left', true)
      else if (vx > 10)  anims.play('staff-right', true)
    } else {
      if (vy < -10)      anims.play('staff-up', true)
      else if (vy > 10)  anims.play('staff-down', true)
    }

    if (Math.abs(vx) < 10 && Math.abs(vy) < 10) {
      if (anims.isPlaying) anims.stop()
    }
  }
}
