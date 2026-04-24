// NPCManager.ts — Hệ thống điều phối AI khách hàng (Refactored)
// Phiên bản mỏng: Chỉ lo Spawn và Quản lý vòng đời Entity

import Phaser from 'phaser'
import { AppConfig } from '../../../game/config/AppConfig'
import { EnvironmentManager } from '../../environment/managers/EnvironmentManager'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { applyFootCollider } from '../../environment/ySortUtils'
import { useStatsStore } from '../../stats/store/statsStore'
import { useFurnitureStore } from '../../furniture/store/furnitureStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { eventBus } from '../../shared/EventBus'
import { CustomerAgent } from './CustomerFSM'
import type { CustomerIntent, CustomerData } from '../types'
import { aStarGrid, type WorldPoint } from '../../environment/managers/AStarGridManager'
import { createDropShadow } from '../../environment/ySortUtils'
import { GAME_BALANCE } from '../../../config/gameConfig'
import type { NPCWorldSnapshot } from '../../world/constants'

export class NPCManager {
  private scene: Phaser.Scene
  private environmentManager: EnvironmentManager
  private agents: Map<string, CustomerAgent> = new Map()
  private unsubscribers: (() => void)[] = []
  private npcGroup: Phaser.Physics.Arcade.Group
  private _queueSlots: WorldPoint[] = []
  private tradeInLeaveHandler: ((ev: Event) => void) | null = null

  public get queueSlots(): WorldPoint[] {
    return this._queueSlots
  }

  constructor(scene: Phaser.Scene, environmentManager: EnvironmentManager) {
    this.scene = scene
    this.environmentManager = environmentManager
    this.npcGroup = this.scene.physics.add.group()

    // Đăng ký sự kiện từ EventBus
    this.unsubscribers.push(
      eventBus.on('npc:destroyed', (id: string) => this.removeNPCDirectly(id))
    )

    // Listen for Trade-In NPC leave requests
    this.tradeInLeaveHandler = ((ev: CustomEvent) => {
      const { instanceId } = ev.detail
      const agent = this.agents.get(instanceId)
      if (agent) agent.leaveShop()
    }) as EventListener

    window.addEventListener('trade-in:npc-leave', this.tradeInLeaveHandler)
  }

  public update() {
    const now = this.scene.time.now
    const delta = this.scene.game.loop.delta
    this.agents.forEach(agent => agent.update(now, delta))
  }

  public initializeNPCs() {
    this.scene.time.addEvent({
      delay: GAME_BALANCE.NPC.SPAWN_DELAY_MS,
      callback: () => this.spawnNPC(),
      loop: true
    })
  }

  public spawnNPC() {
    const gameStore = useGameStore()
    const furnitureStore = useFurnitureStore()
    if (gameStore.shopState !== 'OPEN' || gameStore.timeInMinutes >= 1200 || furnitureStore.isEditMode) return
    if (this.agents.size >= GAME_BALANCE.NPC.MAX_COUNT) return
    
    // Ràng buộc 🆕: Nếu hàng chờ quá dài thì không cho khách mới vào để tránh kẹt
    if (gameStore.waitingCustomers >= GAME_BALANCE.NPC.MAX_WAITING_CUSTOMERS) {
      return
    }

    const agentsArr = Array.from(this.agents.values())
    const activeSeller = agentsArr.find(a => a.data.intent === 'SELL')

    const doorLocation = this.environmentManager.getDoorLocation()
    const pool = AppConfig.ASSETS.NPC_POOLS
    const selectedTexture = pool[Math.floor(Math.random() * pool.length)].key

    // --- OBJECT POOLING LOGIC ---
    let npcSprite = this.npcGroup.get(doorLocation.x, doorLocation.y + 50, selectedTexture) as Phaser.Physics.Arcade.Sprite
    
    if (!npcSprite) {
      // Fallback if group.get fails to create (shouldn't happen with default group settings)
      npcSprite = this.scene.physics.add.sprite(doorLocation.x, doorLocation.y + 50, selectedTexture)
    }

    npcSprite.setActive(true).setVisible(true)
    npcSprite.setFrame(0)
    if (npcSprite.body) npcSprite.body.enable = true
    npcSprite.setOrigin(0.5, 1)
    applyFootCollider(npcSprite, 0.3)
    npcSprite.refreshBody()
    npcSprite.setCollideWorldBounds(true)

    // Xác định Intent
    const rand = Math.random()
    let intent: CustomerIntent = 'BUY'
    
    if (rand < GAME_BALANCE.NPC.INTENT_CHANCES.PLAY) {
      intent = 'PLAY'
    } else if (rand < GAME_BALANCE.NPC.INTENT_CHANCES.PLAY + GAME_BALANCE.NPC.INTENT_CHANCES.SELL && !activeSeller) {
      intent = 'SELL'
    }
    
    if (intent === 'SELL' && useStatsStore().level < GAME_BALANCE.NPC.MIN_LEVEL_FOR_SELL) intent = 'BUY'

    let tradeCardId: string | undefined
    if (intent === 'SELL') {
      const apiStore = useApiStore()
      const allCards = Object.values(apiStore.flatCardMap)
      if (allCards.length > 0) {
        tradeCardId = (allCards[Phaser.Math.Between(0, allCards.length - 1)] as any).id
      } else {
        intent = 'BUY'
      }
    }

    const instanceId = `npc_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    
    // Khởi tạo Data
    const data: CustomerData = {
      sprite: npcSprite,
      state: 'SPAWN',
      timer: 0,
      targetX: doorLocation.x,
      targetY: doorLocation.y - 40,
      targetPrice: 0,
      intent,
      spawnTime: this.scene.time.now,
      lastDecisionTime: this.scene.time.now,
      instanceId,
      checkedShelfIds: [],
      tradeCardId,
      shadow: createDropShadow(this.scene, npcSprite, { radiusX: 11, radiusY: 5 })
    }

    const agent = new CustomerAgent(this.scene, data)
    this.agents.set(instanceId, agent)
  }

  /**
   * Tính toán lại đường đi của hàng đợi (Cơ chế Dynamic Snake)
   * Giúp hàng đợi tự né tránh nội thất.
   */
  public recalculateQueuePath(cashierPos: WorldPoint) {
    this._queueSlots = []
    
    // Điểm bắt đầu xếp hàng (ngay trước quầy, cách 48px thay vì 60px để gần hơn)
    const startX = cashierPos.x
    const startY = cashierPos.y + 48
    
    const SLOT_SPACING = 40 // Pixel giữa mỗi người

    // Thử dùng điểm đầu tiên nếu nó Walkable
    if (aStarGrid.isWalkable(startX, startY)) {
      this._queueSlots.push({ x: startX, y: startY })
    }

    let currentX = this._queueSlots.length > 0 ? startX : cashierPos.x
    let currentY = this._queueSlots.length > 0 ? startY : cashierPos.y + 48

    for (let i = this._queueSlots.length; i < GAME_BALANCE.NPC.MAX_WAITING_CUSTOMERS; i++) {
       const candidates = [
         { x: currentX, y: currentY + SLOT_SPACING }, // DOWN
         { x: currentX + SLOT_SPACING, y: currentY }, // RIGHT
         { x: currentX - SLOT_SPACING, y: currentY }, // LEFT
         { x: currentX, y: currentY - SLOT_SPACING }, // UP
       ]

       let found = false
       for (const cand of candidates) {
         if (aStarGrid.isWalkable(cand.x, cand.y)) {
            const isOverlap = this._queueSlots.some(s => Phaser.Math.Distance.Between(s.x, s.y, cand.x, cand.y) < 20)
            if (!isOverlap) {
              this._queueSlots.push({ x: cand.x, y: cand.y })
              currentX = cand.x
              currentY = cand.y
              found = true
              break
            }
         }
       }

       if (!found) break
    }

    console.log(`[NPCManager] Recalculated queue path: ${this._queueSlots.length} slots found.`)
  }

  public getWaitSlot(index: number): WorldPoint | null {
    return this._queueSlots[index] || null
  }

  private removeNPCDirectly(id: string) {
    const agent = this.agents.get(id)
    if (agent) {
      agent.destroy()
      this.agents.delete(id)
    }
  }

  public cleanupAllNPCs() {
    this.agents.forEach(agent => agent.destroy())
    this.agents.clear()
  }

  public destroy() {
    this.cleanupAllNPCs()
    this.unsubscribers.forEach(u => u())
    if (this.tradeInLeaveHandler) {
      window.removeEventListener('trade-in:npc-leave', this.tradeInLeaveHandler)
      this.tradeInLeaveHandler = null
    }
  }

  public getNPCCount(): number {
    return this.agents.size
  }

  public getWorldSnapshots(): NPCWorldSnapshot[] {
    const now = Date.now()

    return Array.from(this.agents.values()).map((agent) => ({
      instanceId: agent.data.instanceId,
      area: 'shop',
      x: Number.isFinite(agent.sprite.x) ? agent.sprite.x : 0,
      y: Number.isFinite(agent.sprite.y) ? agent.sprite.y : 0,
      state: agent.fsm.current || agent.data.state || 'UNKNOWN',
      intent: agent.data.intent || 'BUY',
      lastUpdatedAt: now
    }))
  }
}
