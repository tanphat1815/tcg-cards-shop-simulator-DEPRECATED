// CustomerFSM.ts — Quản lý toàn bộ AI của 1 khách hàng
// Tích hợp ĐẦY ĐỦ các logic từ NPCManager.ts cũ

import Phaser from 'phaser'
import { StateMachine } from '../../shared/StateMachine'
import type { IState} from '../../shared/StateMachine'
import { NPCLocomotion } from './NPCLocomotion'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { useStatsStore } from '../../stats/store/statsStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { useEventStore } from '../../events/store/eventStore'
import { getRawPrice } from '../../shared/utils/currency'
import { DEPTH } from '../../environment/config'
import { eventBus } from '../../shared/EventBus'
import type { CustomerData } from '../types'
import { updateDropShadow } from '../../environment/ySortUtils'

/** Interface mở rộng cho Customer Agency */
export interface ICustomerAgent {
  sprite: Phaser.Physics.Arcade.Sprite
  scene: Phaser.Scene
  locomotion: NPCLocomotion
  fsm: StateMachine<ICustomerAgent>
  data: CustomerData
  statusText: Phaser.GameObjects.Text
  
  // Dynamic stores
  gameStore: any
  statsStore: any

  leaveShop(): void
  updateStatus(text: string): void
}

/** 
 * Lớp đại diện cho 1 thực thể NPC trong game 
 * Thay thế cho object "newCust" rời rạc ở bản cũ
 */
export class CustomerAgent implements ICustomerAgent {
  public sprite: Phaser.Physics.Arcade.Sprite
  public scene: Phaser.Scene
  public locomotion: NPCLocomotion
  public fsm: StateMachine<ICustomerAgent>
  public data: CustomerData
  public statusText: Phaser.GameObjects.Text
  
  public gameStore = useGameStore()
  public statsStore = useStatsStore()

  constructor(scene: Phaser.Scene, data: CustomerData) {
    this.scene = scene
    this.sprite = data.sprite
    this.data = data
    this.locomotion = new NPCLocomotion(scene, this.sprite)
    this.fsm = new StateMachine<ICustomerAgent>(this)

    // Tạo Label trạng thái
    this.statusText = this.scene.add.text(this.sprite.x, this.sprite.y - 55, '...', {
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    this.setupFSM()
  }

  private setupFSM() {
    this.fsm.addState(new SpawnState())
    this.fsm.addState(new WanderState())
    this.fsm.addState(new SeekItemState())
    this.fsm.addState(new InteractState())
    this.fsm.addState(new SeekCheckoutState())
    this.fsm.addState(new QueuingState())
    this.fsm.addState(new WantToPlayState())
    this.fsm.addState(new SeekTableState())
    this.fsm.addState(new PlayingState())
    this.fsm.addState(new TradeInState())
    this.fsm.addState(new TradeInWaitingState())
    this.fsm.addState(new GoCashierEventState())
    this.fsm.addState(new LeaveState())

    this.fsm.transition('SPAWN')
  }

  update(time: number, delta: number) {
    this.fsm.update(time, delta)
    this.locomotion.update()
    this.statusText.setPosition(this.sprite.x, this.sprite.y - 55)
    
    // Sync Trade Icon nếu có
    if (this.data.tradeIcon) {
       this.data.tradeIcon.setPosition(this.sprite.x, this.sprite.y - 70)
    }

    // Shadow update
    if (this.data.shadow) {
       updateDropShadow(this.data.shadow, this.sprite, { radiusX: 11, radiusY: 5 })
    }
  }

  leaveShop() {
    this.fsm.transition('LEAVE')
  }

  updateStatus(text: string) {
    this.statusText.setText(text)
  }

  destroy() {
    this.statusText.destroy()
    if (this.data.tradeIcon) this.data.tradeIcon.destroy()
    this.sprite.destroy()
    if (this.data.shadow) this.data.shadow.destroy()
  }
}

// ==========================================
// CÁC TRẠNG THÁI AI (STATES)
// ==========================================

/** SPAWN: Đi từ cửa vào trong cửa hàng */
class SpawnState implements IState<ICustomerAgent> {
  name = 'SPAWN'
  onEnter(agent: ICustomerAgent) {
    agent.updateStatus('Entering...')
    const shopBounds = (agent.scene as any).environmentManager.getShopBounds()
    const tx = Phaser.Math.Between(shopBounds.x + 50, shopBounds.x + shopBounds.w - 50)
    const ty = Phaser.Math.Between(shopBounds.y + 50, shopBounds.y + shopBounds.h - 50)
    agent.locomotion.moveTo(tx, ty)
  }
  onUpdate(agent: ICustomerAgent) {
    if (!agent.locomotion.isMoving) {
      if (agent.data.intent === 'PLAY') agent.fsm.transition('WANT_TO_PLAY')
      else if (agent.data.intent === 'SELL') agent.fsm.transition('TRADE_IN')
      else agent.fsm.transition('WANDER')
    }
  }
  onExit() {}
}

/** WANDER: Đi dạo loanh quanh tìm kệ hàng */
class WanderState implements IState<ICustomerAgent> {
  name = 'WANDER'
  private nextDecisionTime = 0

  onEnter(agent: ICustomerAgent) {
    agent.updateStatus(agent.data.intent === 'PLAY' ? '🔍 Seeking Table' : '🔍 Seeking Cards')
    this.nextDecisionTime = agent.scene.time.now + 1500
  }

  onUpdate(agent: ICustomerAgent, time: number) {
    // Logic Boredom - về nếu chờ quá 45s
    if (time - (agent.data.spawnTime || 0) > 45000) {
      agent.leaveShop()
      return
    }

    if (time > this.nextDecisionTime) {
      this.nextDecisionTime = time + 1500
      
      if (agent.data.intent === 'PLAY') {
         agent.fsm.transition('WANT_TO_PLAY')
         return
      }

      // Tìm kệ có hàng
      const shelves = Object.values(agent.gameStore.placedShelves) as any[]
      const foundShelf = shelves.find(s => 
        (s.role === 'selling' || s.role === 'display_case') &&
        !agent.data.checkedShelfIds.includes(s.id) &&
        s.tiers.some((t: any) => t.slots.some((sl: any) => sl !== null))
      )

      if (foundShelf) {
        agent.data.targetShelfId = foundShelf.id
        agent.fsm.transition('SEEK_ITEM')
      } else if (Math.random() < 0.05) {
        // 5% cơ hội rời đi nếu không tìm thấy gì sau mỗi nhịp decision
        agent.leaveShop()
      }
    }

    // Nếu đứng im thì di chuyển tới vị trí dạo mới
    if (!agent.locomotion.isMoving) {
      const shopBounds = (agent.scene as any).environmentManager.getShopBounds()
      const tx = Phaser.Math.Between(shopBounds.x + 50, shopBounds.x + shopBounds.w - 50)
      const ty = Phaser.Math.Between(shopBounds.y + 50, shopBounds.y + shopBounds.h - 50)
      agent.locomotion.moveTo(tx, ty)
    }
  }
  onExit() {}
}

/** SEEK_ITEM: Đi tới kệ hàng đã chọn */
class SeekItemState implements IState<ICustomerAgent> {
  name = 'SEEK_ITEM'
  onEnter(agent: ICustomerAgent) {
    agent.updateStatus('📦 Going to shelf')
    const shelf = agent.gameStore.placedShelves[agent.data.targetShelfId!]
    if (!shelf) { agent.fsm.transition('WANDER'); return; }
    agent.locomotion.moveTo(shelf.x, shelf.y + 45)
  }
  onUpdate(agent: ICustomerAgent) {
    if (!agent.locomotion.isMoving) {
      agent.fsm.transition('INTERACT')
    }
  }
  onExit() {}
}

/** INTERACT: Lấy hàng từ kệ */
class InteractState implements IState<ICustomerAgent> {
  name = 'INTERACT'
  private endTime = 0
  onEnter(agent: ICustomerAgent) {
    agent.updateStatus('🛒 Picking items')
    this.endTime = agent.scene.time.now + 1000
    agent.locomotion.stop()
  }
  onUpdate(agent: ICustomerAgent, time: number) {
    if (time > this.endTime) {
      const shelfId = agent.data.targetShelfId
      const shelf = agent.gameStore.placedShelves[shelfId!]
      
      if (!shelf || (shelf.role !== 'selling' && shelf.role !== 'display_case')) {
        agent.fsm.transition('WANDER')
        return
      }

      // -- LOGIC BUY FROM DISPLAY CASE (Thẻ lẻ) --
      if (shelf.role === 'display_case') {
        const result = agent.gameStore.npcPeekFromDisplayCase(shelf.id)
        if (result) {
          const apiStore = useApiStore()
          const card = apiStore.flatCardMap[result.baseCardId]
          if (card) {
             const market = getRawPrice(card)
             const acceptableMax = market * (result.multiplier || 1.0) * 1.5
             if (result.price <= acceptableMax) {
                // Mua
                agent.gameStore.npcCommitBuyFromDisplayCase(shelf.id, result.tierIdx, result.slotIdx, result.cardId)
                agent.data.targetPrice = result.price
                this.showPopup(agent, result.isSlab ? '🏆 Slab' : '🃏 Card', result.price)
                agent.fsm.transition('SEEK_CHECKOUT')
                return
             }
          }
        }
        agent.data.checkedShelfIds.push(shelf.id)
        agent.fsm.transition('WANDER')
        return
      }

      // -- LOGIC BUY FROM NORMAL SHELF (Pack/Box) --
      const itemId = agent.gameStore.npcTakeItemFromSlot(shelfId!)
      if (itemId) {
        const itemData = agent.gameStore.shopItems[itemId]
        let basePrice = itemData ? itemData.sellPrice : 15
        
        // Event Multiplier
        let eventMultiplier = 1.0
        if (itemData && itemData.sourceSetId) {
          const apiStore = useApiStore()
          const eventStore = useEventStore()
          const setCards = apiStore.setCardsCache[itemData.sourceSetId] || []
          if (setCards.length > 0) {
            const repCard = setCards[Math.floor(Math.random() * setCards.length)]
            eventMultiplier = eventStore.getEventPriceMultiplier(repCard)
          }
        }
        
        agent.data.targetPrice = basePrice * eventMultiplier
        this.showPopup(agent, itemData?.type === 'box' ? '📦 Box' : '🎁 Pack', agent.data.targetPrice)
        agent.fsm.transition('SEEK_CHECKOUT')
      } else {
        agent.data.checkedShelfIds.push(shelfId!)
        agent.fsm.transition('WANDER')
      }
    }
  }
  
  private showPopup(agent: ICustomerAgent, text: string, price: number) {
     const popup = agent.scene.add.text(agent.sprite.x, agent.sprite.y - 40, `+1 ${text} ($${price.toFixed(2)})`, {
        fontSize: '11px', color: '#00ff00', fontStyle: 'bold', backgroundColor: 'rgba(0,0,0,0.5)'
     }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)
     agent.scene.tweens.add({ targets: popup, y: popup.y - 30, alpha: 0, duration: 1500, onComplete: () => popup.destroy() })
  }

  onExit() {}
}

/** SEEK_CHECKOUT: Đi tới quầy thu ngân */
class SeekCheckoutState implements IState<ICustomerAgent> {
  name = 'SEEK_CHECKOUT'
  onEnter(agent: ICustomerAgent) {
    agent.updateStatus('🛒 To Cashier')
    // Đảm bảo chỉ đăng ký vào hàng chờ một lần
    agent.gameStore.addWaitingCustomer(agent.data.targetPrice, agent.data.instanceId)
    this.goToQueuePosition(agent)
  }
  
  onUpdate(agent: ICustomerAgent) {
     if (!agent.locomotion.isMoving) {
        agent.fsm.transition('QUEUING')
     }
  }

  private goToQueuePosition(agent: ICustomerAgent) {
    const npcManager = (agent.scene as any).npcManager
    if (!npcManager) return
    
    const queueIndex = agent.gameStore.waitingQueue.findIndex((q: any) => q.instanceId === agent.data.instanceId)
    if (queueIndex === -1) return

    // 🆕 FETCH DYNAMIC SLOT
    const slot = npcManager.getWaitSlot(queueIndex)
    if (slot) {
      agent.locomotion.moveTo(slot.x, slot.y)
    } else {
      // Fallback nếu không tính được slot (do bị kẹt nội thất hoặc quá đông)
      // Tìm tạm 1 điểm ngẫu nhiên gần Cashier để đứng thay vì đứng im tại chỗ
      const cashiers = Object.values(agent.gameStore.placedCashiers) as any[]
      if (cashiers.length > 0) {
        const c = cashiers[0]
        const rx = c.x + (Math.random() * 100 - 50)
        const ry = c.y + 100 + (Math.random() * 50)
        agent.locomotion.moveTo(rx, ry)
      }
    }
  }

  onExit() {}
}

/** QUEUING: Đứng chờ thanh toán */
class QueuingState implements IState<ICustomerAgent> {
  name = 'QUEUING'
  onEnter(agent: ICustomerAgent) {
    agent.updateStatus('⌛ Waiting in line')
    agent.locomotion.stop()
  }
  onUpdate(agent: ICustomerAgent) {
    const queueIndex = agent.gameStore.waitingQueue.findIndex((q: any) => q.instanceId === agent.data.instanceId)
    if (queueIndex === -1) {
       agent.leaveShop()
       return
    }

    // Nếu vị trí hàng đợi thay đổi (người trước đi rồi hoặc furniture cản đường) -> Tiến lên
    const npcManager = (agent.scene as any).npcManager
    if (npcManager) {
      const slot = npcManager.getWaitSlot(queueIndex)
      if (slot) {
        const dist = Phaser.Math.Distance.Between(agent.sprite.x, agent.sprite.y, slot.x, slot.y)
        // Tăng ngưỡng khoảng cách để tránh nhân viên bị 'giật'
        if (dist > 15) {
          agent.fsm.transition('SEEK_CHECKOUT')
        }
      } else {
          // 🆕 Nếu slot biến mất (do ai đó dời kệ vào), thử SEEK lại để tìm fallback mới
          if (Math.random() < 0.01) agent.fsm.transition('SEEK_CHECKOUT')
      }
    }
  }
  onExit() {}
}

/** WANT_TO_PLAY: Muốn chơi bài, tìm bàn */
class WantToPlayState implements IState<ICustomerAgent> {
  name = 'WANT_TO_PLAY'
  onEnter(agent: ICustomerAgent) {
    const tables = Object.values(agent.gameStore.placedTables) as any[]
    const freeTable = tables.find(t => t.occupants && t.occupants.includes(null))
    
    if (freeTable) {
      const seatIndex = agent.gameStore.joinTable(freeTable.id, agent.data.instanceId)
      if (seatIndex !== null) {
         agent.data.assignedTableId = freeTable.id
         agent.data.seatIndex = seatIndex
         agent.fsm.transition('SEEK_TABLE')
         return
      }
    }
    
    // Không thấy bàn -> Chờ 2s rồi Wander tiếp
    agent.scene.time.delayedCall(2000, () => {
       if (agent.fsm.current === 'WANT_TO_PLAY') agent.fsm.transition('WANDER')
    })
  }
  onUpdate() {}
  onExit() {}
}

/** SEEK_TABLE: Đi tới ghế ngồi */
class SeekTableState implements IState<ICustomerAgent> {
  name = 'SEEK_TABLE'
  onEnter(agent: ICustomerAgent) {
    agent.updateStatus('🃏 Going to table')
    const table = agent.gameStore.placedTables[agent.data.assignedTableId!]
    if (!table) { agent.fsm.transition('WANDER'); return; }
    
    const isVertical = (table.rotation ?? 0) === 90
    if (isVertical) {
      agent.locomotion.moveTo(table.x, agent.data.seatIndex === 0 ? table.y - 30 : table.y + 30)
    } else {
      agent.locomotion.moveTo(agent.data.seatIndex === 0 ? table.x - 30 : table.x + 30, table.y)
    }
  }
  onUpdate(agent: ICustomerAgent) {
    if (!agent.locomotion.isMoving) {
      agent.fsm.transition('PLAYING')
    }
  }
  onExit() {}
}

/** PLAYING: Đang trong trận đấu bài */
class PlayingState implements IState<ICustomerAgent> {
  name = 'PLAYING'
  onEnter(agent: ICustomerAgent) {
    agent.updateStatus('⌛ Waiting for Opponent')
    agent.locomotion.stop()
    agent.data.playStartTimestamp = Date.now()
  }
  onUpdate(agent: ICustomerAgent, time: number) {
    const table = agent.gameStore.placedTables[agent.data.assignedTableId!]
    if (!table) { agent.leaveShop(); return; }

    // Start match if 2 players
    if (table.occupants.every((o: any) => o !== null) && !table.matchStartedAt) {
       agent.gameStore.startMatch(table.id)
    }

    if (table.matchStartedAt) {
       agent.updateStatus('🃏 Playing match')
       const elapsed = Date.now() - table.matchStartedAt
       const duration = 12000 // 12s
       
       if (time % 1000 < 50) {
          const emo = agent.scene.add.text(agent.sprite.x, agent.sprite.y - 40, '🃏', { fontSize: '16px' }).setOrigin(0.5)
          agent.scene.tweens.add({ targets: emo, y: emo.y - 20, alpha: 0, duration: 800, onComplete: () => emo.destroy() })
       }

       if (elapsed >= duration) {
          if (agent.data.seatIndex === 0) {
             agent.gameStore.finishMatch(table.id)
             agent.gameStore.gainExp(50)
          }
          this.checkCheckout(agent)
       }
    }
    
    // Đóng cửa -> Checkout ngay
    const isNinePM = agent.gameStore.timeInMinutes >= 1260
    if (isNinePM) this.checkCheckout(agent)
  }

  private checkCheckout(agent: ICustomerAgent) {
     const fee = 5 // Hardcode entry fee
     agent.data.targetPrice = fee
     agent.fsm.transition('GO_CASHIER_EVENT')
  }

  onExit() {}
}

/** GO_CASHIER_EVENT: Trả phí tham gia (Event Fee) */
class GoCashierEventState implements IState<ICustomerAgent> {
  name = 'GO_CASHIER_EVENT'
  onEnter(agent: ICustomerAgent) {
    agent.updateStatus('💰 Paying Event Fee')
    // Giải phóng ghế
    const table = agent.gameStore.placedTables[agent.data.assignedTableId!]
    if (table) table.occupants[agent.data.seatIndex!] = null
    
    agent.gameStore.addWaitingCustomer(agent.data.targetPrice, agent.data.instanceId)
    this.goToQueuePosition(agent)
  }
  onUpdate(agent: ICustomerAgent) {
    if (!agent.locomotion.isMoving) agent.fsm.transition('QUEUING')
  }
  private goToQueuePosition(agent: ICustomerAgent) {
    const cashiers = Object.values(agent.gameStore.placedCashiers) as any[]
    if (cashiers.length > 0) {
       const cashier = cashiers[0]
       const qPos = agent.gameStore.waitingQueue.findIndex((q: any) => q.instanceId === agent.data.instanceId)
       agent.locomotion.moveTo(cashier.x, cashier.y + 60 + (qPos * 40))
    } else {
       agent.leaveShop()
    }
  }
  onExit() {}
}

/** TRADE_IN: Đi tới quầy để bán thẻ cho Player */
class TradeInState implements IState<ICustomerAgent> {
  name = 'TRADE_IN'
  onEnter(agent: ICustomerAgent) {
    agent.updateStatus('🃏 To Counter')
    this.spawnTradeIcon(agent)
    const cashiers = Object.values(agent.gameStore.placedCashiers) as any[]
    if (cashiers.length > 0) {
       const cashier = cashiers[0]
       agent.locomotion.moveTo(cashier.x + 60, cashier.y)
    } else {
       agent.leaveShop()
    }
  }
  onUpdate(agent: ICustomerAgent) {
    if (!agent.locomotion.isMoving) {
       agent.fsm.transition('TRADE_IN_WAITING')
    }
  }
  private spawnTradeIcon(agent: ICustomerAgent) {
    const icon = agent.scene.add.text(agent.sprite.x, agent.sprite.y - 70, '🃏', { fontSize: '20px' })
      .setOrigin(0.5).setDepth(DEPTH.UI_TEXT)
    agent.scene.tweens.add({ targets: icon, y: icon.y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    agent.data.tradeIcon = icon
  }
  onExit() {}
}

/** TRADE_IN_WAITING: Đứng quầy chờ Player ra mua */
class TradeInWaitingState implements IState<ICustomerAgent> {
  name = 'TRADE_IN_WAITING'
  onEnter(agent: ICustomerAgent) {
    agent.updateStatus('🃏 Offering Card')
    agent.locomotion.stop()
    // Emit sự kiện đã bị loại bỏ -> Sẽ mở qua handlePlayerInteraction (MainScene.ts)
  }
  onUpdate() {}
  onExit() {}
}

/** LEAVE: Đi ra cửa và biến mất */
class LeaveState implements IState<ICustomerAgent> {
  name = 'LEAVE'
  private stage = 0
  onEnter(agent: ICustomerAgent) {
    agent.updateStatus('👋 Leaving')
    // Xóa khỏi hàng chờ (nếu đang ở trong hàng)
    agent.gameStore.removeCustomerFromQueue(agent.data.instanceId)

    // Xóa trade icon
    if (agent.data.tradeIcon) { agent.data.tradeIcon.destroy(); agent.data.tradeIcon = undefined; }
    
    const door = (agent.scene as any).environmentManager.getDoorLocation()
    agent.locomotion.moveTo(door.x, door.y - 40)
    this.stage = 1
  }
  onUpdate(agent: ICustomerAgent) {
    if (!agent.locomotion.isMoving) {
      if (this.stage === 1) {
        const door = (agent.scene as any).environmentManager.getDoorLocation()
        agent.locomotion.moveTo(door.x, door.y + 100)
        this.stage = 2
      } else {
        // Destroy hoàn toàn
        eventBus.emit('npc:destroyed', agent.data.instanceId)
      }
    }
  }
  onExit() {}
}
