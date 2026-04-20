import Phaser from 'phaser'
import { DEPTH } from '../../environment/config'
import { useStaffStore } from '../store/staffStore'
import { useGameStore } from '../../shop-ui/store/gameStore'
import type { WorkerDuty } from '../types'
import { EnvironmentManager } from '../../environment/managers/EnvironmentManager'

interface WorkerNPC {
  instanceId: string
  sprite: Phaser.Physics.Arcade.Sprite
  statusText: Phaser.GameObjects.Text
  targetX: number
  targetY: number
  state: WorkerDuty
  targetDeskId?: string | null // Khớp với HiredWorker
}

/**
 * StaffManager - Hệ thống quản lý Nhân viên (Staff) trong Phaser.
 */
export class StaffManager {
  private scene: Phaser.Scene
  private environmentManager: EnvironmentManager
  private workers: Map<string, WorkerNPC> = new Map()
  private workerSpeed = 80
  private lastUpdate = 0

  constructor(scene: Phaser.Scene, environmentManager: EnvironmentManager) {
    this.scene = scene
    this.environmentManager = environmentManager
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
        const doorPos = EnvironmentManager.START_X + 200
        const sprite = this.scene.physics.add.sprite(doorPos, EnvironmentManager.START_Y + 500, 'npc')
        sprite.setDepth(DEPTH.NPC).setTint(0xaaaaff)
        
        const statusText = this.scene.add.text(sprite.x, sprite.y - 35, '', {
            fontSize: '10px',
            color: '#00ffff'
        }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

        worker = {
          instanceId: w.instanceId,
          sprite,
          statusText,
          targetX: sprite.x,
          targetY: sprite.y,
          state: w.duty,
          targetDeskId: w.targetDeskId
        }
        this.workers.set(w.instanceId, worker)
        this.updateWorkerTarget(worker, index)
      }

      const current = this.workers.get(w.instanceId)!
      if (current.state !== w.duty || current.targetDeskId !== w.targetDeskId) {
        current.state = w.duty
        current.targetDeskId = w.targetDeskId
        this.updateWorkerTarget(current, index)
      }
    })
  }

  private updateWorkerTarget(worker: WorkerNPC, index: number = 0) {
    const gameStore = useGameStore()
    const startX = EnvironmentManager.START_X
    const startY = EnvironmentManager.START_Y

    const hiredData = useStaffStore().hiredWorkers.find(w => w.instanceId === worker.instanceId)

    switch (worker.state) {
      case 'CHECKOUT': {
        const deskId = hiredData?.targetDeskId
        const desk = deskId ? (gameStore.placedCashiers as any)[deskId] : Object.values(gameStore.placedCashiers)[0]
        
        if (desk) {
          worker.targetX = desk.x
          worker.targetY = desk.y - 40
        }
        break
      }
      case 'RESTOCK': {
        const shelves = Object.values(gameStore.placedShelves) as any[]
        if (shelves.length > 0) {
          const shelf = shelves[Math.floor(Math.random() * shelves.length)]
          worker.targetX = shelf.x + (Math.random() > 0.5 ? 40 : -40)
          worker.targetY = shelf.y
        } else {
          worker.targetX = startX + 100 + Math.random() * 200
          worker.targetY = startY + 100 + Math.random() * 200
        }
        break
      }
      case 'NONE':
      default: {
        // Lấy tọa độ Idle Zone từ EnvironmentManager
        const idleZone = this.environmentManager.idleStaffZone
        const zoneWidth = idleZone.width

        // Tính offset ngang để các nhân viên đứng thành hàng, không đè lên nhau
        const spacing = 32 // pixel cách nhau giữa các nhân viên
        const totalWorkers = useStaffStore().hiredWorkers.length
        const startOffset = -((totalWorkers - 1) * spacing) / 2
        const workerOffset = startOffset + (index * spacing)

        // Giới hạn offset trong phạm vi zone width
        const clampedOffset = Phaser.Math.Clamp(
          workerOffset,
          -(zoneWidth / 2),
          zoneWidth / 2
        )

        worker.targetX = idleZone.x + clampedOffset
        worker.targetY = idleZone.y
        break
      }
    }
  }

  public update(time: number) {
    this.workers.forEach(worker => {
      this.updateVisuals(worker)
    })

    if (time > this.lastUpdate + 100) {
      this.lastUpdate = time
      this.workers.forEach(worker => {
        this.handleAI(worker)
      })
    }
  }

  private handleAI(worker: WorkerNPC) {
    const dist = Phaser.Math.Distance.Between(worker.sprite.x, worker.sprite.y, worker.targetX, worker.targetY)
    
    if (dist > 10) {
      this.scene.physics.moveTo(worker.sprite, worker.targetX, worker.targetY, this.workerSpeed)
    } else {
      worker.sprite.body?.velocity.set(0)
      
      if (worker.state === 'RESTOCK' && Math.random() < 0.02) {
        const index = Array.from(this.workers.keys()).indexOf(worker.instanceId)
        this.updateWorkerTarget(worker, index)
      }
    }
  }

  private updateVisuals(worker: WorkerNPC) {
    worker.statusText.setPosition(worker.sprite.x, worker.sprite.y - 35)
    
    let label = ''
    switch (worker.state) {
      case 'CHECKOUT': label = 'Working (Cashier)'; break
      case 'RESTOCK': label = 'Working (Shelving)'; break
      default: label = 'Resting'; break
    }
    worker.statusText.setText(label)

    const anims = worker.sprite.anims
    const vx = worker.sprite.body?.velocity.x || 0
    const vy = worker.sprite.body?.velocity.y || 0

    if (Math.abs(vx) > Math.abs(vy)) {
        if (vx < -10) anims.play('npc-left', true)
        else if (vx > 10) anims.play('npc-right', true)
    } else {
        if (vy < -10) anims.play('npc-up', true)
        else if (vy > 10) anims.play('npc-down', true)
    }
    
    if (Math.abs(vx) < 10 && Math.abs(vy) < 10) {
        anims.stop()
    }
  }
}
