// StaffManager.ts — Quản lý Nhân viên (Refactored)
// Dùng StateMachine + NPCLocomotion để đảm bảo nhân viên không đi xuyên tường

import Phaser from 'phaser'
import { DEPTH } from '../../environment/config'
import { applyDynamicYSort, applyFootCollider, createDropShadow, updateDropShadow } from '../../environment/ySortUtils'
import { useStaffStore } from '../store/staffStore'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { useFurnitureStore } from '../../furniture/store/furnitureStore'
import type { WorkerDuty } from '../types'
import { EnvironmentManager } from '../../environment/managers/EnvironmentManager'
import { AppConfig } from '../../../game/config/AppConfig'
import { DeliveryManager } from '../../environment/managers/DeliveryManager'
import { StateMachine } from '../../shared/StateMachine'
import type { IState } from '../../shared/StateMachine'
import { NPCLocomotion } from '../../customer/managers/NPCLocomotion'
import { useInventoryStore } from '../../inventory/store/inventoryStore'

/** Interface cho AI Agent của nhân viên */
export interface IStaffAgent {
  instanceId: string
  sprite: Phaser.Physics.Arcade.Sprite
  scene: Phaser.Scene
  locomotion: NPCLocomotion
  fsm: StateMachine<IStaffAgent>
  statusText: Phaser.GameObjects.Text
  duty: WorkerDuty
  targetDeskId?: string | null
  
  // Data cho Restock
  carriedBoxId?: string | null
  targetShelfId?: string | null
  targetTierIndex?: number | null
  
  // Anti-loop: Tránh cầm lại những thùng mà vừa rồi không tìm được kệ trống
  blacklistedBoxIds: Map<string, number> 
  
  shadow?: Phaser.GameObjects.Graphics;
  
  sync(duty: WorkerDuty, deskId?: string | null): void
  update(time: number, delta: number): void
  updateStatus(text: string): void
  dropAnything(): void
}

export class StaffAgent implements IStaffAgent {
  public instanceId: string
  public sprite: Phaser.Physics.Arcade.Sprite
  public scene: Phaser.Scene
  public locomotion: NPCLocomotion
  public fsm: StateMachine<IStaffAgent>
  public statusText: Phaser.GameObjects.Text
  public duty: WorkerDuty = 'NONE'
  public targetDeskId?: string | null
  public carriedBoxId?: string | null
  public targetShelfId?: string | null
  public targetTierIndex?: number | null
  public blacklistedBoxIds: Map<string, number>
  public shadow?: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, sprite: Phaser.Physics.Arcade.Sprite, instanceId: string) {
    this.scene = scene
    this.sprite = sprite
    this.instanceId = instanceId
    this.locomotion = new NPCLocomotion(scene, sprite)
    this.fsm = new StateMachine<IStaffAgent>(this)
    this.blacklistedBoxIds = new Map()

    this.statusText = this.scene.add.text(sprite.x, sprite.y - 55, '', {
      fontSize: '10px',
      color: '#00ffff'
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    this.shadow = createDropShadow(this.scene, sprite, { radiusX: 11, radiusY: 5 })

    this.setupFSM()
  }

  private setupFSM() {
    this.fsm.addState(new StaffRestingState())
    this.fsm.addState(new CashierWorkingState())
    this.fsm.addState(new RestockerIdleState())
    this.fsm.addState(new RestockerMoveToBoxState())
    this.fsm.addState(new RestockerMoveToShelfState())
    this.fsm.addState(new RestockerWorkingState())
    this.fsm.addState(new RestockerReturnBoxState())

    this.fsm.transition('RESTING')
  }

  sync(duty: WorkerDuty, deskId?: string | null) {
    const isDutyChanged = this.duty !== duty
    const isDeskChanged = this.targetDeskId !== deskId

    if (isDutyChanged || (duty === 'CHECKOUT' && isDeskChanged)) {
      this.duty = duty
      this.targetDeskId = deskId
      
      if (duty === 'CHECKOUT') this.fsm.transition('CASHIER_WORKING')
      else if (duty === 'RESTOCK') this.fsm.transition('RESTOCKER_IDLE')
      else this.fsm.transition('RESTING')
    } else {
      this.targetDeskId = deskId
    }
  }


  update(time: number, delta: number) {
    this.fsm.update(time, delta)
    this.locomotion.update()
    this.statusText.setPosition(this.sprite.x, this.sprite.y - 55)
    applyDynamicYSort(this.sprite)
    if (this.shadow) updateDropShadow(this.shadow, this.sprite, { radiusX: 11, radiusY: 5 })
  }

  updateStatus(text: string) {
    this.statusText.setText(text)
  }

  dropAnything() {
    if (this.carriedBoxId) {
      const dm = (this.scene as any).deliveryManager
      dm.staffDropBox(this.carriedBoxId, this.sprite.x, this.sprite.y)
      this.carriedBoxId = null
      this.targetShelfId = null
      this.targetTierIndex = null
    }
  }

  destroy() {
    this.sprite.destroy()
    this.statusText.destroy()
    this.shadow?.destroy()
  }
}

// ==========================================
// STAFF STATES
// ==========================================

class StaffRestingState implements IState<IStaffAgent> {
  name = 'RESTING'
  onEnter(agent: IStaffAgent) {
    if (agent.carriedBoxId) {
      agent.fsm.transition('RESTOCKER_RETURN_BOX')
      return
    }
    agent.updateStatus('Resting')
    const idleZone = (agent.scene as any).environmentManager.idleStaffZone
    agent.locomotion.moveTo(idleZone.x, idleZone.y)
  }
  onUpdate() {}
  onExit() {}
}

class CashierWorkingState implements IState<IStaffAgent> {
  name = 'CASHIER_WORKING'
  onEnter(agent: IStaffAgent) {
    agent.updateStatus('Working: Cashier')
    this.goToDesk(agent)
  }
  onUpdate(agent: IStaffAgent) {
    // Nếu quầy thay đổi thì di chuyển lại
    this.goToDesk(agent)
  }
  private goToDesk(agent: IStaffAgent) {
    const gameStore = useGameStore()
    const desk = agent.targetDeskId ? (gameStore.placedCashiers as any)[agent.targetDeskId] : Object.values(gameStore.placedCashiers)[0]
    if (desk) {
       const tx = desk.x
       const ty = desk.y - 40
       const dist = Phaser.Math.Distance.Between(agent.sprite.x, agent.sprite.y, tx, ty)
       if (dist > 10 && !agent.locomotion.isMoving) {
          agent.locomotion.moveTo(tx, ty)
       }
    }
  }
  onExit() {}
}

class RestockerIdleState implements IState<IStaffAgent> {
  name = 'RESTOCKER_IDLE'
  private lastSearchTime = 0
  onEnter(agent: IStaffAgent) {
    agent.updateStatus('Restock: Idle')
    const idleZone = (agent.scene as any).environmentManager.idleStaffZone
    agent.locomotion.moveTo(idleZone.x, idleZone.y)
  }
  onUpdate(agent: IStaffAgent, time: number) {
    if (time > this.lastSearchTime + 2000) {
      this.lastSearchTime = time
      const dm = (agent.scene as any).deliveryManager
      const sm = (agent.scene as any).staffManager as StaffManager
      const boxes = dm.getUncarriedBoxes().filter((b: any) => b.type !== 'furniture')
      
      const furnitureStore = useFurnitureStore()
      const hasShelves = Object.values(furnitureStore.placedShelves).length > 0

      if (boxes.length > 0 && hasShelves) {
        // Lọc bỏ những thùng đang bị blacklist (do không có kệ)
        const reachableBoxes = boxes.filter((b: any) => {
          const expire = agent.blacklistedBoxIds.get(b.id)
          if (expire && time < expire) return false
          
          // 🆕 KIỂM TRA TRƯỚC: Có kệ nào còn chỗ cho món này không?
          // Nếu không tìm thấy kệ trống, không nhặt thùng này
          const shelfSearch = sm.findEligibleShelf(b.itemId)
          if (!shelfSearch) {
             // Tạm thời blacklist để tìm thùng khác trong vòng lặp tiếp theo
             agent.blacklistedBoxIds.set(b.id, time + 10000)
             return false
          }
          
          return true
        })

        if (reachableBoxes.length === 0) {
          // 🆕 THỬ NGHIỆM: Tìm trong kho (Storage Shelves) nếu đất trống
          this.searchStorageToSelling(agent, time)
          return
        }

        const target = reachableBoxes[0]
        if (dm.staffPickUpBox(target.id)) {
          agent.carriedBoxId = target.id
          agent.targetShelfId = null
          agent.targetTierIndex = null
          agent.fsm.transition('RESTOCKER_MOVE_TO_BOX')
        }
      } else if (hasShelves) {
        // Không có thùng trên đất, thử tìm trong kho
        this.searchStorageToSelling(agent, time)
      }
    }
  }

  private searchStorageToSelling(agent: IStaffAgent, _time: number) {
    const furnitureStore = useFurnitureStore()
    const sm = (agent.scene as any).staffManager as StaffManager
    const dm = (agent.scene as any).deliveryManager
    
    const sellingShelves = Object.values(furnitureStore.placedShelves).filter((s: any) => s.role === 'selling')
    
    for (const shelf of sellingShelves as any[]) {
      for (const tier of shelf.tiers) {
        if (!tier.itemId || tier.slots.length >= tier.maxSlots) continue
        
        // Cần thêm hàng cho itemId này. Tìm trong Storage.
        const source = sm.findStorageSource(tier.itemId)
        if (source) {
          // Lấy hàng từ kho
          const amountToTake = Math.min(10, source.quantity) // Giới hạn 10 món mỗi lần vác
          const taken = furnitureStore.takeItemFromTierSimple(source.shelfId, source.tierIndex, amountToTake)
          
          if (taken > 0) {
            const shelfObj = furnitureStore.placedShelves[source.shelfId]
            const itemName = useInventoryStore().shopItems[tier.itemId]?.name || tier.itemId
            
            // Spawn box tại vị trí kệ kho
            const boxId = dm.spawnStaffBoxAt(
              { itemId: tier.itemId, name: itemName, type: 'pack', quantity: taken },
              shelfObj.x, shelfObj.y
            )
            
            agent.carriedBoxId = boxId
            agent.targetShelfId = null
            agent.targetTierIndex = null
            agent.fsm.transition('RESTOCKER_MOVE_TO_BOX')
            return
          }
        }
      }
    }
  }

  onExit() {}
}

class RestockerMoveToBoxState implements IState<IStaffAgent> {
  name = 'RESTOCKER_MOVE_TO_BOX'
  onEnter(agent: IStaffAgent) {
    agent.updateStatus('Restock: To Box')
    const dm = (agent.scene as any).deliveryManager
    const box = dm.getBoxById(agent.carriedBoxId!)
    if (box) {
       agent.locomotion.moveTo(box.sprite.x, box.sprite.y)
    } else {
       agent.fsm.transition('RESTOCKER_IDLE')
    }
  }
  onUpdate(agent: IStaffAgent) {
    const dm = (agent.scene as any).deliveryManager
    const box = dm.getBoxById(agent.carriedBoxId!)
    
    if (box) {
      const dist = Phaser.Math.Distance.Between(agent.sprite.x, agent.sprite.y, box.sprite.x, box.sprite.y)
      if (dist < 32) {
        agent.fsm.transition('RESTOCKER_WORKING')
        return
      }
    }

    if (!agent.locomotion.isMoving) {
       // Nếu bị kẹt hoặc không tìm thấy đường, chờ một chút rồi thử lại
       agent.fsm.transition('RESTOCKER_IDLE')
    }
  }
  onExit() {}
}

class RestockerMoveToShelfState implements IState<IStaffAgent> {
  name = 'RESTOCKER_MOVE_TO_SHELF'
  onEnter(agent: IStaffAgent) {
    agent.updateStatus('Restock: To Shelf')
    const shelf = useGameStore().placedShelves[agent.targetShelfId!]
    if (shelf) {
       const tx = shelf.x + (agent.sprite.x < shelf.x ? -40 : 40)
       agent.locomotion.moveTo(tx, shelf.y)
    } else {
       agent.fsm.transition('RESTOCKER_WORKING')
    }
  }
  onUpdate(agent: IStaffAgent) {
    if (agent.carriedBoxId) {
       const dm = (agent.scene as any).deliveryManager
       dm.updateStaffCarryPosition(agent.carriedBoxId, agent.sprite.x, agent.sprite.y)
    }
    if (!agent.locomotion.isMoving) {
       agent.fsm.transition('RESTOCKER_WORKING')
    }
  }
  onExit() {}
}

class RestockerWorkingState implements IState<IStaffAgent> {
  name = 'RESTOCKER_WORKING'
  private actionTimer = 0
  onEnter(agent: IStaffAgent) {
    agent.updateStatus('Restock: Checking')
    this.actionTimer = agent.scene.time.now + 1000
    agent.locomotion.stop()
  }
  onUpdate(agent: IStaffAgent, time: number) {
    if (agent.carriedBoxId) {
      const dm = (agent.scene as any).deliveryManager
      dm.updateStaffCarryPosition(agent.carriedBoxId, agent.sprite.x, agent.sprite.y)
    }

    if (time > this.actionTimer) {
      const furnitureStore = useFurnitureStore()
      const dm = (agent.scene as any).deliveryManager
      if (!dm) return

      const box = dm.getBoxById(agent.carriedBoxId!)

      if (!box || box.quantity <= 0) {
        if (agent.carriedBoxId) dm.removeBoxById(agent.carriedBoxId)
        agent.carriedBoxId = null
        agent.fsm.transition('RESTOCKER_IDLE')
        return
      }

      // Đã tới kệ?
      if (agent.targetShelfId) {
         // Logic nạp hàng
         const placed = furnitureStore.fillTierFromHand(agent.targetShelfId, box.itemId, agent.targetTierIndex!, box.quantity)
         if (placed > 0) {
            box.quantity -= placed
            box.qtyLabel.setText(`×${box.quantity}`)
         }
         
         if (box.quantity <= 0) {
            dm.removeBoxById(agent.carriedBoxId)
            agent.carriedBoxId = null
            agent.fsm.transition('RESTOCKER_IDLE')
         } else {
            // Thùng còn hàng -> Tìm kệ tiếp theo
            this.searchNextShelf(agent, time)
         }
      } else {
         this.searchNextShelf(agent, time)
      }
    }
  }

  private searchNextShelf(agent: IStaffAgent, time: number) {
    const sm = (agent.scene as any).staffManager as StaffManager
    const dm = (agent.scene as any).deliveryManager
    if (!dm) return
    
    const box = dm.getBoxById(agent.carriedBoxId!)
    if (!box) { agent.fsm.transition('RESTOCKER_IDLE'); return; }

    const shelfSearch = sm.findEligibleShelf(box.itemId)
    let found = false
    if (shelfSearch) {
        agent.targetShelfId = shelfSearch.shelfId
        agent.targetTierIndex = shelfSearch.tierIndex
        agent.fsm.transition('RESTOCKER_MOVE_TO_SHELF')
        found = true
    }

    if (!found) {
       // Nếu không tìm thấy kệ, blacklist thùng này trong 15s để tìm thùng khác
       agent.blacklistedBoxIds.set(agent.carriedBoxId!, time + 15000)
       agent.fsm.transition('RESTOCKER_RETURN_BOX')
    }
  }
  onExit() {}
}

class RestockerReturnBoxState implements IState<IStaffAgent> {
  name = 'RESTOCKER_RETURN_BOX'
  onEnter(agent: IStaffAgent) {
    agent.updateStatus('Restock: Returning box')
    const env = (agent.scene as any).environmentManager
    const dz = env.deliveryZone
    agent.locomotion.moveTo(dz.x, dz.y)
  }
  onUpdate(agent: IStaffAgent) {
    if (agent.carriedBoxId) {
       const dm = (agent.scene as any).deliveryManager
       dm.updateStaffCarryPosition(agent.carriedBoxId, agent.sprite.x, agent.sprite.y)
    }

    const env = (agent.scene as any).environmentManager
    const dz = env.deliveryZone
    const dist = Phaser.Math.Distance.Between(agent.sprite.x, agent.sprite.y, dz.x, dz.y)
    
    // Nếu tới bãi nhận hàng hoặc locomotion dừng (mắc kẹt)
    if (dist < 30 || !agent.locomotion.isMoving) {
       agent.dropAnything()
       
       // Quay về state gốc sau khi drop
       if (agent.duty === 'RESTOCK') agent.fsm.transition('RESTOCKER_IDLE')
       else if (agent.duty === 'CHECKOUT') agent.fsm.transition('CASHIER_WORKING')
       else agent.fsm.transition('RESTING')
    }
  }
  onExit() {}
}

/** Manager chính điều phối Staff Agents */
export class StaffManager {
  private scene: Phaser.Scene
  private environmentManager: EnvironmentManager
  public deliveryManager: DeliveryManager
  private agents: Map<string, StaffAgent> = new Map()

  constructor(scene: Phaser.Scene, environmentManager: EnvironmentManager, deliveryManager: DeliveryManager) {
    this.scene = scene
    this.environmentManager = environmentManager
    this.deliveryManager = deliveryManager
  }

  /**
   * Tìm kệ kho có chứa itemId cụ thể.
   */
  public findStorageSource(itemId: string): { shelfId: string, tierIndex: number, quantity: number } | null {
    const furnitureStore = useFurnitureStore()
    const shelves = Object.values(furnitureStore.placedShelves) as any[]

    for (const shelf of shelves) {
      if (shelf.role !== 'storage') continue
      
      const tierIdx = shelf.tiers.findIndex((t: any) => t.itemId === itemId && t.slots.length > 0)
      if (tierIdx !== -1) {
        return { 
          shelfId: shelf.id, 
          tierIndex: tierIdx, 
          quantity: shelf.tiers[tierIdx].slots.length 
        }
      }
    }
    return null
  }

  /**
   * Tìm kiếm kệ hợp lệ cho một món hàng. 
   * Xét cả kệ bán hàng (selling) và kệ kho (storage) nếu là nhặt từ đất.
   * Nhưng ưu tiên Selling.
   */
  public findEligibleShelf(itemId: string, forceSelling: boolean = false): { shelfId: string, tierIndex: number } | null {
    const furnitureStore = useFurnitureStore()
    const shelves = Object.values(furnitureStore.placedShelves) as any[]

    // Ưu tiên 1: Kệ bán hàng
    for (const shelf of shelves) {
      if (shelf.role !== 'selling') continue
      const tierIdx = shelf.tiers.findIndex((t: any) => 
        (t.itemId === itemId && t.slots.length < t.maxSlots) || (t.itemId === null)
      )
      if (tierIdx !== -1) return { shelfId: shelf.id, tierIndex: tierIdx }
    }

    if (forceSelling) return null

    // Ưu tiên 2: Kệ kho
    for (const shelf of shelves) {
      if (shelf.role !== 'storage') continue
      const tierIdx = shelf.tiers.findIndex((t: any) => 
        (t.itemId === itemId && t.slots.length < t.maxSlots) || (t.itemId === null)
      )
      if (tierIdx !== -1) return { shelfId: shelf.id, tierIndex: tierIdx }
    }

    return null
  }

  public syncWorkers() {
    const staffStore = useStaffStore()
    const hiredIds = new Set(staffStore.hiredWorkers.map(w => w.instanceId))

    // 1. Cleanup
    for (const [id, agent] of this.agents.entries()) {
      if (!hiredIds.has(id)) {
        agent.destroy()
        this.agents.delete(id)
      }
    }

    // 2. Add / Sync
    staffStore.hiredWorkers.forEach(w => {
      let agent = this.agents.get(w.instanceId)
      if (!agent) {
        const spawnLoc = this.environmentManager.idleStaffZone
        if (!spawnLoc) return // Chờ EnvironmentManager sẵn sàng

        const pool = AppConfig.ASSETS.STAFF_POOLS
        const texture = pool[Math.floor(Math.random() * pool.length)].key
        const sprite = this.scene.physics.add.sprite(spawnLoc.x, spawnLoc.y, texture, 0)
        sprite.setOrigin(0.5, 1)
        applyFootCollider(sprite, 0.3)
        
        agent = new StaffAgent(this.scene, sprite, w.instanceId)
        this.agents.set(w.instanceId, agent)
      }
      agent.sync(w.duty, w.targetDeskId)
    })
  }

  public update(time: number) {
    const delta = this.scene.game.loop.delta
    this.agents.forEach(agent => agent.update(time, delta))
  }

  public destroy() {
    this.agents.forEach(a => a.destroy())
    this.agents.clear()
  }
}
