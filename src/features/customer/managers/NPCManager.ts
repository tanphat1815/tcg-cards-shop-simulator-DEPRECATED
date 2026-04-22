// NPCManager.ts — Hệ thống điều phối AI khách hàng (Refactored)
// Phiên bản mỏng: Chỉ lo Spawn và Quản lý vòng đời Entity

import Phaser from 'phaser'
import { AppConfig } from '../../../game/config/AppConfig'
import { EnvironmentManager } from '../../environment/managers/EnvironmentManager'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { applyFootCollider } from '../../environment/ySortUtils'
import { useStatsStore } from '../../stats/store/statsStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { eventBus } from '../../shared/EventBus'
import { CustomerAgent } from './CustomerFSM'
import type { CustomerIntent, CustomerData } from '../types'

export class NPCManager {
  private scene: Phaser.Scene
  private environmentManager: EnvironmentManager
  private agents: Map<string, CustomerAgent> = new Map()
  private unsubscribers: (() => void)[] = []

  constructor(scene: Phaser.Scene, environmentManager: EnvironmentManager) {
    this.scene = scene
    this.environmentManager = environmentManager

    // Đăng ký sự kiện từ EventBus
    this.unsubscribers.push(
      eventBus.on('npc:destroyed', (id: string) => this.removeNPCDirectly(id))
    )

    // Listen for Trade-In NPC leave requests
    window.addEventListener('trade-in:npc-leave', ((ev: CustomEvent) => {
      const { instanceId } = ev.detail
      const agent = this.agents.get(instanceId)
      if (agent) agent.leaveShop()
    }) as EventListener)
  }

  public update() {
    const now = this.scene.time.now
    const delta = this.scene.game.loop.delta
    this.agents.forEach(agent => agent.update(now, delta))
  }

  public initializeNPCs() {
    this.scene.time.addEvent({
      delay: 3000,
      callback: () => this.spawnNPC(),
      loop: true
    })
  }

  public spawnNPC() {
    const gameStore = useGameStore()
    if (gameStore.shopState !== 'OPEN' || gameStore.timeInMinutes >= 1200) return
    if (this.agents.size >= 15) return

    const doorLocation = this.environmentManager.getDoorLocation()
    const pool = AppConfig.ASSETS.NPC_POOLS
    const selectedTexture = pool[Math.floor(Math.random() * pool.length)].key

    const npcSprite = this.scene.physics.add.sprite(
      doorLocation.x,
      doorLocation.y + 50,
      selectedTexture,
      0
    )
    npcSprite.setOrigin(0.5, 1)
    applyFootCollider(npcSprite, 0.3)
    npcSprite.refreshBody()
    npcSprite.setCollideWorldBounds(true)

    // Xác định Intent
    const rand = Math.random()
    let intent: CustomerIntent = 'BUY'
    if (rand < 0.25) intent = 'PLAY'
    else if (rand < 0.40) intent = 'SELL'
    
    if (intent === 'SELL' && useStatsStore().level < 5) intent = 'BUY'

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
      tradeCardId
    }

    const agent = new CustomerAgent(this.scene, data)
    this.agents.set(instanceId, agent)
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
  }

  public getNPCCount(): number {
    return this.agents.size
  }
}
