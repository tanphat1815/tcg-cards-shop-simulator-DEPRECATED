import Phaser from 'phaser'
import { AppConfig } from '../../../game/config/AppConfig'
import { EnvironmentManager } from '../../environment/managers/EnvironmentManager'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { applyDynamicYSort, applyFootCollider } from '../../environment/ySortUtils'
import { DEPTH } from '../../environment/config'
import { useStatsStore } from '../../stats/store/statsStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { getRawPrice } from '../../shared/utils/currency'
import { useEventStore } from '../../events/store/eventStore'
import type { NPCState, Customer, CustomerIntent } from '../types'


/**
 * NPCManager - Hệ thống điều phối AI cho toàn bộ khách hàng trong Game.
 * 
 * Chức năng chính:
 * - Spawn khách hàng định kỳ dựa trên trạng thái Shop.
 * - Quản lý AI State Machine (Máy trạng thái) cho từng NPC:
 *   + Mua hàng (BUY): Tìm kệ -> Lấy đồ -> Xếp hàng thanh toán.
 *   + Chơi bài (PLAY): Tìm bàn -> Chờ đối thủ -> Chơi -> Rời đi.
 * - Xử lý vật lý di chuyển và giải quyết kẹt (Stuck Recovery).
 * - Quản lý luồng đóng cửa (Evacuation) khi hết giờ làm việc.
 */
export class NPCManager {
  private scene: Phaser.Scene
  private environmentManager: EnvironmentManager
  private customers: Customer[] = []
  
  // Cấu hình thông số AI
  private npcSpeed = 100
  private stuckCheckInterval = 500 // Kiểm tra kẹt mỗi 0.5s
  private decisionInterval = 1500  // Thay đổi quyết định mỗi 1.5s
  private boredomThreshold = 45000 // Khách rời đi nếu chờ quá 45s mà không làm gì

  constructor(
    scene: Phaser.Scene,
    environmentManager: EnvironmentManager
  ) {
    this.scene = scene
    this.environmentManager = environmentManager

    // Listen for Trade-In NPC leave requests
    window.addEventListener('trade-in:npc-leave', ((ev: CustomEvent) => {
      const { instanceId } = ev.detail
      const npc = this.customers.find(c => c.instanceId === instanceId)
      if (npc) {
        this.npcLeaveShop(npc)
      }
    }) as EventListener)
  }

  /**
   * Phương thức Update chính, được gọi mỗi frame từ MainScene.
   */
  public update() {
    this.updateNPCs(this.scene.time.now)
  }

  /**
   * Lấy số lượng NPC hiện tại
   */
  public getNPCCount(): number {
    return this.customers.length
  }

  /**
   * Giải phóng toàn bộ NPC. Thường dùng khi người chơi bấm "Kết thúc ngày".
   */
  public cleanupAllNPCs() {
    this.customers.forEach(c => {
      if (c.statusText) c.statusText.destroy()
      c.sprite.destroy()
    })
    this.customers = []
  }

  /**
   * Khởi chạy vòng lặp Spawn khách hàng tự động.
   */
  initializeNPCs() {
    this.scene.time.addEvent({
      delay: 3000,
      callback: () => this.spawnNPC(),
      loop: true
    })
  }

  /**
   * Tạo một NPC mới tại cửa Shop với các ý định (Intent) ngẫu nhiên.
   * 
   * Phiên bản 2.5D:
   * - Dùng TEX.NPC (spritesheet 32x48).
   * - setOrigin(0.5, 1) → tọa độ (x, y) = tọa độ chân.
   * - Foot collider 30%.
   * 
   * ⚠️ KHÔNG XOÁ: intent logic, instanceId, statusText, customers.push, timer.
   */
  public spawnNPC() {
    const gameStore = useGameStore()
    
    // Kiểm tra điều kiện Shop: không spawn nếu đóng hoặc quá giờ làm việc (20:00)
    if (gameStore.shopState !== 'OPEN' || gameStore.timeInMinutes >= 1200) return
    if (this.customers.length >= 15) return

    const doorLocation = this.environmentManager.getDoorLocation()

    // --- 2.5D SPRITE SETUP ---
    // Pick a random NPC sheet from the pool defined in AppConfig
    const pool = AppConfig.ASSETS.NPC_POOLS
    const selectedTexture = pool[Math.floor(Math.random() * pool.length)].key

    const npcSprite = this.scene.physics.add.sprite(
      doorLocation.x,
      doorLocation.y + 50,
      selectedTexture,
      0 // Frame đầu tiên (down-idle)
    )
    npcSprite.setOrigin(0.5, 1)              // R1 — foot anchor (bottom-center)
    applyFootCollider(npcSprite, 0.3)        // R3 — only bottom 30% is a collider
    npcSprite.refreshBody()
    npcSprite.setCollideWorldBounds(true)
    applyDynamicYSort(npcSprite)             // R2 — initial Y-sort depth (updated every frame)

    // Quyết định mục đích: 
    // 60% BUY, 25% PLAY, 15% SELL (SELL chỉ khi Level >= 5)
    const rand = Math.random()
    let intent: CustomerIntent
    if (rand < 0.25) {
      intent = 'PLAY'
    } else if (rand < 0.40) {
      intent = 'SELL'
    } else {
      intent = 'BUY'
    }

    // Chỉ spawn 'SELL' nếu Player đã mở khóa tính năng (ví dụ: level >= 5)
    if (intent === 'SELL' && useStatsStore().level < 5) {
      intent = 'BUY'
    }

    // Khi intent = 'SELL' → random chọn 1 card từ apiStore để NPC mang đến
    let tradeCardId: string | undefined
    if (intent === 'SELL') {
      const apiStore = useApiStore()
      const allCards = Object.values(apiStore.flatCardMap)
      if (allCards.length > 0) {
        const pick = allCards[Phaser.Math.Between(0, allCards.length - 1)] as any
        tradeCardId = pick.id
      } else {
        // Fallback: nếu chưa load card nào → chuyển sang BUY
        intent = 'BUY'
      }
    }

    const instanceId = `npc_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const newCust: Customer = {
      sprite: npcSprite,
      state: 'SPAWN' as NPCState,
      timer: this.scene.time.now + 500,
      targetX: doorLocation.x,
      targetY: doorLocation.y - 40,
      targetPrice: 0,
      intent,
      spawnTime: this.scene.time.now,
      lastDecisionTime: this.scene.time.now,
      lastMoveAttemptTime: this.scene.time.now,
      instanceId,
      checkedShelfIds: [],
      searchStartTime: this.scene.time.now,
      tradeCardId
    }

    // Tạo Text hiển thị trạng thái trên đầu NPC (Overhead Label)
    newCust.statusText = this.scene.add.text(npcSprite.x, npcSprite.y - 55, '...', {
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT).setVisible(true)

    this.customers.push(newCust)
  }

  /**
   * Cập nhật trạng thái cho từng khách hàng hiện có.
   * @param time Current game time in milliseconds
   */
  updateNPCs(time: number) {
    const gameStore = useGameStore()
    
    // Cờ báo hiệu Shop đang trong giai đoạn đóng cửa
    const isClosingTime = gameStore.timeInMinutes >= 1200 || gameStore.shopState === 'CLOSED'
    const isNinePM = gameStore.timeInMinutes >= 1260
    
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const customer = this.customers[i]
      const sprite = customer.sprite

      // 1. Cập nhật diện mạo (Animation và Label)
      this.updateNPCAnimation(customer)
      this.updateStatusText(customer, time)
      this.handleStuckRecovery(customer, time)

      // 2. Logic đóng cửa: Ép buộc rời đi dựa trên tình trạng
      if (isClosingTime && customer.state !== 'LEAVE') {
         // Những người đang chơi bài hoặc tìm bàn thì phải về ngay
         if (customer.state === 'PLAYING' || customer.state === 'WANT_TO_PLAY' || customer.state === 'SEEK_TABLE') {
            this.npcLeaveShop(customer)
            continue
         }
         // Những người chưa mua đồ thì mời về ngay
         if ((customer.state === 'WANDER' || customer.state === 'SEEK_ITEM') && customer.targetPrice === 0) {
            this.npcLeaveShop(customer)
            continue
         }
      }

      // ── NEW: Force checkout at 9:00 PM (1260 mins) ──
      if (isNinePM && customer.state === 'PLAYING') {
        this._startEventCheckout(customer)
        continue
      }


      // 3. Đồng bộ với Store: Nếu NPC đã được thanh toán (không còn trong queue) -> Cho phép rời đi
      if (customer.state === 'WAITING' || customer.state === 'GO_CASHIER') {
        const isInQueue = gameStore.waitingQueue.some((item: any) => item.instanceId === customer.instanceId)
        if (!isInQueue) {
          this.npcLeaveShop(customer)
          continue
        }
      }

      // 4. Chạy State Machine điều khiển AI hành vi
      this.handleNPCState(customer, time)

      // 5. Cleanup: Xóa sprite nếu NPC đã rời đi quá xa/lâu
      if (customer.state === 'LEAVE' && time - (customer.timer || 0) > 15000) {
        if (customer.statusText) customer.statusText.destroy()
        sprite.destroy()
        this.customers.splice(i, 1)
      }
    }
  }


  /**
   * Xử lý hướng Animation + Y-Sort cho NPC mỗi frame.
   * 
   * ⚠️ CHÚ Ý:
   * - Giữ nguyên logic "trục lớn hơn" để chọn hướng (R4).
   * - THÊM MỚI: applyDynamicYSort mỗi frame để NPC đúng order 2.5D.
   */
  private updateNPCAnimation(customer: Customer) {
    const sprite = customer.sprite

    // Y-SORT (R2) — MUST run every frame, BEFORE choosing animation direction.
    // Sets depth = LAYER3_OBJECTS + sprite.y so NPCs correctly sort with
    // the player and furniture within Layer 3.
    applyDynamicYSort(sprite)

    if (sprite.body && sprite.body.velocity.lengthSq() > 0) {
      const vx = sprite.body.velocity.x
      const vy = sprite.body.velocity.y
      if (Math.abs(vx) > Math.abs(vy)) {
        sprite.anims.play(vx < 0 ? 'npc-left' : 'npc-right', true)
      } else {
        sprite.anims.play(vy < 0 ? 'npc-up' : 'npc-down', true)
      }
    } else {
      if (sprite.anims.isPlaying) sprite.anims.stop()
    }

    this.updateTradeIcon(customer)
  }

  private lastStatusUpdateTime: number = 0

  /**
   * Hiển thị Text trạng thái hiện tại (đang tìm gì, đang làm gì) trên đầu NPC
   */
  private updateStatusText(customer: Customer, time: number) {
    if (!customer.statusText) return
    customer.statusText.setPosition(customer.sprite.x, customer.sprite.y - 55)

    // Throttle text updates to every 200ms
    if (time < this.lastStatusUpdateTime + 200) return
    this.lastStatusUpdateTime = time

    let label = '...'
    switch (customer.state) {
      case 'SPAWN': label = 'Entering...'; break;
      case 'WANDER': label = customer.intent === 'PLAY' ? '🔍 Seeking Table' : '🔍 Seeking Cards'; break;
      case 'SEEK_ITEM': label = '📦 Going to shelf'; break;
      case 'INTERACT': label = '🛒 Picking items'; break;
      case 'GO_CASHIER': label = '🛒 To Cashier'; break;
      case 'WAITING': label = '⌛ Waiting in line'; break;
      case 'SEEK_TABLE': label = '🃏 Going to table'; break;
      case 'TRADE_IN': label = '🃏 To Counter'; break;
      case 'TRADE_IN_WAITING': label = '🃏 Offering Card'; break;
      case 'PLAYING': {
        const store = useGameStore()
        const table = customer.assignedTableId ? store.placedTables[customer.assignedTableId] : null
        label = (table && table.matchStartedAt) ? '🃏 Playing match' : '⌛ Waiting for Opponent';
        break;
      }
      case 'GO_CASHIER_EVENT': label = '💰 Paying Event Fee'; break;
      case 'LEAVE': label = (time - customer.spawnTime > 40000) ? '😒 Bored - Leaving' : '👋 Leaving'; break;

    }
    customer.statusText.setText(label)
  }

  /**
   * Xử lý thoát kẹt: Nếu NPC bị đứng yên quá lâu mặc dù có mục tiêu thì khởi động lại Physics
   */
  private handleStuckRecovery(customer: Customer, time: number) {
    const moveStates: NPCState[] = ['WANDER', 'SEEK_ITEM', 'SEEK_TABLE', 'GO_CASHIER', 'LEAVE']
    if (!moveStates.includes(customer.state)) return

    if (time > (customer.lastMoveAttemptTime || 0) + this.stuckCheckInterval) {
      customer.lastMoveAttemptTime = time
      const dist = Phaser.Math.Distance.Between(customer.sprite.x, customer.sprite.y, customer.targetX, customer.targetY)
      const isStuck = customer.sprite.body && customer.sprite.body.velocity.lengthSq() < 100 // Vận tốc quá thấp

      if (dist > 15 && isStuck) {
        this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
      }
    }
  }

  /** Central Dispatcher: Điều hướng logic xử lý dựa trên State */
  private handleNPCState(customer: Customer, time: number) {
    switch (customer.state) {
      case 'SPAWN': this.handleSpawn(customer, time); break;
      case 'WANDER': this.handleWander(customer, time); break;
      case 'WANT_TO_PLAY': this.handleWantToPlay(customer, time); break;
      case 'SEEK_TABLE': this.handleSeekTable(customer); break;
      case 'PLAYING': this.handlePlaying(customer, time); break;
      case 'SEEK_ITEM': this.handleSeekItem(customer, time); break;
      case 'INTERACT': this.handleInteract(customer, time); break;
      case 'GO_CASHIER': this.handleGoCashier(customer); break;
      case 'WAITING': this.handleWaiting(customer); break;
      case 'LEAVE': this.handleLeave(customer); break;
      case 'TRADE_IN': this.handleTradeIn(customer); break;
      case 'TRADE_IN_WAITING': this.handleTradeInWaiting(customer, time); break;
      case 'GO_CASHIER_EVENT': this.handleGoCashierEvent(customer); break;
    }

  }

  /** NPC mới xuất hiện đi bộ vào giữa cửa hàng */
  private handleSpawn(customer: Customer, time: number) {
    if (time > customer.timer) {
      if (customer.intent === 'PLAY') {
        customer.state = 'WANT_TO_PLAY'
      } else if (customer.intent === 'SELL') {
        customer.state = 'TRADE_IN'
        this.spawnTradeIcon(customer)
      } else {
        customer.state = 'WANDER'
      }

      const shopBounds = this.environmentManager.getShopBounds()
      customer.targetX = Phaser.Math.Between(shopBounds.x + 50, shopBounds.x + shopBounds.w - 50)
      customer.targetY = Phaser.Math.Between(shopBounds.y + 50, shopBounds.y + shopBounds.h - 50)
      this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
    }
  }

  /** Tìm bàn còn trống để tham gia chơi bài */
  private handleWantToPlay(customer: Customer, time: number) {
    const store = useGameStore()
    const tables = Object.values(store.placedTables)
    let bestTableId = null

    for (const table of tables) {
      if (table.occupants && table.occupants.includes(null)) {
        bestTableId = table.id
        break
      }
    }

    if (bestTableId) {
      // Đăng ký vào bàn trong Store
      const seatIndex = store.joinTable(bestTableId, customer.instanceId)
      if (seatIndex !== null) {
        customer.state = 'SEEK_TABLE'
        customer.assignedTableId = bestTableId
        customer.seatIndex = seatIndex
        const table = store.placedTables[bestTableId]
        const isVertical = (table.rotation ?? 0) === 90

        if (isVertical) {
          customer.targetX = table.x
          customer.targetY = seatIndex === 0 ? table.y - 30 : table.y + 30
        } else {
          customer.targetX = seatIndex === 0 ? table.x - 30 : table.x + 30
          customer.targetY = table.y
        }
        this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
      }
    } else {
      // Nếu không tìm thấy bàn, chờ một lúc hoặc chuyển sang mua hàng
      const searchTime = time - (customer.searchStartTime || 0)
      if (searchTime > 10000 || Math.random() < 0.2) {
        customer.intent = 'BUY'
        customer.checkedShelfIds = []
        customer.state = 'WANDER'
        customer.searchStartTime = time
      } else {
        customer.state = 'WANDER'
      }
    }
  }

  private handleSeekTable(customer: Customer) {
    const dist = Phaser.Math.Distance.Between(customer.sprite.x, customer.sprite.y, customer.targetX, customer.targetY)
    if (dist < 12) {
      customer.sprite.body!.velocity.set(0)
      // Snap to exact seat position so Y-sort depth is correct immediately.
      customer.sprite.setPosition(customer.targetX, customer.targetY)
      // applyDynamicYSort is called every frame in updateNPCAnimation, so
      // depth will be correct on the very next frame automatically.
      customer.state = 'PLAYING'
      customer.timer = 0
      // ── NEW: Lưu timestamp bắt đầu chơi (dùng Date.now để đồng bộ với matchStartedAt) ──
      customer.playStartTimestamp = Date.now()
    }

  }

  /** Xử lý trong trận đấu: tính thời gian và EXP khi thắng */
  private handlePlaying(customer: Customer, time: number) {
    const gStore = useGameStore()
    const myTable = gStore.placedTables[customer.assignedTableId!]
    if (!myTable) { customer.state = 'LEAVE'; return; }

    // Nếu đủ 2 người và trận chưa bắt đầu -> Bắt đầu tính giờ
    if (myTable.occupants.every(o => o !== null) && !myTable.matchStartedAt) {
      gStore.startMatch(myTable.id)
    }

    if (myTable.matchStartedAt) {
      const elapsed = Date.now() - myTable.matchStartedAt
      const duration = 12000 // Một ván bài kéo dài 12s

      // Hiệu ứng Visual "Đánh bài" tung tóe
      if (time % 1000 < 50) {
        const emo = this.scene.add.text(customer.sprite.x, customer.sprite.y - 40, '🃏', { fontSize: '16px' }).setOrigin(0.5)
        this.scene.tweens.add({ targets: emo, y: emo.y - 20, alpha: 0, duration: 800, onComplete: () => emo.destroy() })
      }

      // Khi ván bài kết thúc
      if (elapsed >= duration) {
        if (customer.seatIndex === 0) { // Chỉ tính thưởng XP 1 lần trên mỗi bàn
          gStore.finishMatch(myTable.id)
          gStore.gainExp(50)
          const xpText = this.scene.add.text(myTable.x, myTable.y - 60, '+50 XP', { fontSize: '18px', color: '#f1c40f', fontStyle: 'bold' }).setOrigin(0.5)
          this.scene.tweens.add({ targets: xpText, y: xpText.y - 40, alpha: 0, duration: 2000, onComplete: () => xpText.destroy() })
        }

        // ── NEW: Kiểm tra giờ đóng cửa hoặc kết thúc match ──
        this._startEventCheckout(customer)
      }

    }

  }

  /** Khách đi dạo tìm kiếm kệ hàng có sản phẩm */
  private handleWander(customer: Customer, time: number) {
    // Nếu quá chán nản thì về
    if (time - customer.spawnTime > this.boredomThreshold) {
      this.npcLeaveShop(customer)
      return
    }

    if (time > customer.lastDecisionTime + this.decisionInterval) {
      customer.lastDecisionTime = time
      const store = useGameStore()

      // Trường hợp 1: Muốn chơi -> Tìm bàn trống
      if (customer.intent === 'PLAY') {
         // (Logic tương tự handleWantToPlay nhưng dùng để re-scan định kỳ)
        const tables = Object.values(store.placedTables)
        let found = false
        for (const table of tables) {
          if (table.occupants && table.occupants.includes(null)) {
            const seatIndex = store.joinTable(table.id, customer.instanceId)
            if (seatIndex !== null) {
              customer.state = 'SEEK_TABLE'
              customer.assignedTableId = table.id
              customer.seatIndex = seatIndex
              const isVertical = (table.rotation ?? 0) === 90
              if (isVertical) {
                customer.targetX = table.x
                customer.targetY = seatIndex === 0 ? table.y - 30 : table.y + 30
              } else {
                customer.targetX = seatIndex === 0 ? table.x - 30 : table.x + 30
                customer.targetY = table.y
              }
              this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
              found = true
              break
            }
          }
        }
        if (!found && Math.random() < 0.3) { customer.intent = 'BUY' }
      } else {
        // Trường hợp 2: Muốn mua -> Tìm kệ có hàng
        const shelves = Object.values(store.placedShelves)
        let foundShelfId = null
        for (const shelf of shelves) {
          // NPCs mua từ kệ 'selling' hoặc 'display_case'
          if (shelf.role !== 'selling' && shelf.role !== 'display_case') continue
          if (!customer.checkedShelfIds.includes(shelf.id) && shelf.tiers.some(t => t.slots.some(s => s !== null))) {
            foundShelfId = shelf.id
            break
          }
        }
        if (foundShelfId) {
          const shelf = store.placedShelves[foundShelfId]
          customer.state = 'SEEK_ITEM'
          customer.targetX = shelf.x
          customer.targetY = shelf.y + 45
          this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
        } else if (Math.random() < 0.4) {
          // Nếu không thấy hàng, 40% cơ hội chuyển hướng sang Chơi bài hoặc Về
          if (Math.random() < 0.5) {
            customer.intent = 'PLAY'
            customer.state = 'WANT_TO_PLAY'
            customer.searchStartTime = time
          } else {
            this.npcLeaveShop(customer)
          }
        }
      }
    }

    // Nếu đã tới điểm Wander ngẫu nhiên, tìm mốc Wander mới trong nhà
    if (Phaser.Math.Distance.Between(customer.sprite.x, customer.sprite.y, customer.targetX, customer.targetY) < 12) {
      customer.sprite.body!.velocity.set(0)
      const shopBounds = this.environmentManager.getShopBounds()
      customer.targetX = Phaser.Math.Between(shopBounds.x + 50, shopBounds.x + shopBounds.w - 50)
      customer.targetY = Phaser.Math.Between(shopBounds.y + 50, shopBounds.y + shopBounds.h - 50)
      this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
    }
  }

  private handleSeekItem(customer: Customer, time: number) {
    if (Phaser.Math.Distance.Between(customer.sprite.x, customer.sprite.y, customer.targetX, customer.targetY) < 12) {
      customer.sprite.body!.velocity.set(0)
      customer.state = 'INTERACT' // Bắt đầu lựa chọn hàng
      customer.timer = time + 1000
    }
  }

  /** NPC đứng tại kệ và thực hiện hành động lấy hàng */
  private handleInteract(customer: Customer, time: number) {
    if (time > customer.timer) {
      const store = useGameStore()
      let shelfIdTaken = null
      for (const shelf of Object.values(store.placedShelves)) {
        if (Phaser.Math.Distance.Between(customer.sprite.x, customer.sprite.y, shelf.x, shelf.y + 45) < 15) {
          shelfIdTaken = shelf.id; break;
        }
      }

      // Trừ hàng trong Store và thu thập thông tin giá cả
      if (shelfIdTaken) {
        const shelf = store.placedShelves[shelfIdTaken]
        if (!shelf || (shelf.role !== 'selling' && shelf.role !== 'display_case')) {
          customer.state = 'WANDER'
          return
        }

        // Logic riêng cho Display Case (Thẻ lẻ)
        if (shelf.role === 'display_case') {
          const apiStore = useApiStore()
          
          // NPC tìm card muốn mua trong tủ (chỉ peek thử giá)
          const result = store.npcPeekFromDisplayCase(shelf.id)
          if (result) {
            const { cardId, price, tierIdx, slotIdx, isSlab, baseCardId, multiplier } = result
            const card = apiStore.flatCardMap[baseCardId] // Dùng baseCardId cho slabs
            if (!card) {
                customer.state = 'WANDER'
                return
            }
            const market = getRawPrice(card)
            const acceptableMax = market * multiplier * 1.5 // Áp dụng multiplier cho slabs

            if (price <= acceptableMax) {
              // Chấp nhận mua -> commit hành động thực tế
              store.npcCommitBuyFromDisplayCase(shelf.id, tierIdx, slotIdx, cardId)
              
              customer.targetPrice = price
              
              // Popup
              const popupLabel = isSlab ? `+1 Slab 🏆 ($${price})` : `+1 Card 🃏 ($${price})`
              const popup = this.scene.add.text(customer.sprite.x, customer.sprite.y - 40, popupLabel, { fontSize: '12px', color: '#f1c40f', fontStyle: 'bold' }).setOrigin(0.5)
              this.scene.tweens.add({ targets: popup, y: popup.y - 30, alpha: 0, duration: 1500, onComplete: () => popup.destroy() })

              // Đi thanh toán
              customer.state = 'GO_CASHIER'
              store.addWaitingCustomer(customer.targetPrice, customer.instanceId)
              
              const cashier = Object.values(store.placedCashiers)[0] as any
              if (cashier) {
                const myIndex = store.waitingQueue.findIndex((item: any) => item.instanceId === customer.instanceId)
                customer.targetX = cashier.x
                customer.targetY = cashier.y + 60 + (myIndex * 40)
                this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
              }
              return
            } else {
              // Quá đắt -> Bỏ qua, wander tiếp
              customer.checkedShelfIds.push(shelf.id)
              customer.state = 'WANDER'
              return
            }
          } else {
            customer.state = 'WANDER'
            return
          }
        }
      }

      const itemId = shelfIdTaken ? store.npcTakeItemFromSlot(shelfIdTaken) : null
      if (itemId) {
        const itemData = store.shopItems[itemId]
        let basePrice = itemData ? itemData.sellPrice : 15
        
        // ── NEW: Apply Event Multiplier for Packs/Boxes ──
        let eventMultiplier = 1.0
        if (itemData && itemData.sourceSetId) {
          const apiStore = useApiStore()
          const eventStore = useEventStore()
          const setCards = apiStore.setCardsCache[itemData.sourceSetId] || []
          
          if (setCards.length > 0) {
            // Pick 1 random card as representative for the set's "vibes"
            const repCard = setCards[Math.floor(Math.random() * setCards.length)]
            eventMultiplier = eventStore.getEventPriceMultiplier(repCard)
          }
        }
        
        const finalPrice = basePrice * eventMultiplier
        customer.targetPrice = finalPrice

        // Popup thông báo lấy được hàng
        const popupText = itemData?.type === 'box' ? '+1 Box 📦' : '+1 Pack 🎁'
        const popup = this.scene.add.text(customer.sprite.x, customer.sprite.y - 40, popupText, { fontSize: '12px', color: '#00ff00', fontStyle: 'bold' }).setOrigin(0.5)
        this.scene.tweens.add({ targets: popup, y: popup.y - 30, alpha: 0, duration: 1500, onComplete: () => popup.destroy() })

        // Chuyển sang hàng chờ Thanh toán
        customer.state = 'GO_CASHIER'
        store.addWaitingCustomer(customer.targetPrice, customer.instanceId)

        
        // Di chuyển tới xếp hàng tại quầy Thu Ngân
        const cashier = Object.values(store.placedCashiers)[0] as any
        if (cashier) {
          const myIndex = store.waitingQueue.findIndex((item: any) => item.instanceId === customer.instanceId)
          customer.targetX = cashier.x
          customer.targetY = cashier.y + 60 + (myIndex * 40) // Xếp hàng dọc xuống (Social Distancing)
          this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
        }
      } else {
        // Kệ hết hàng -> Đánh dấu đã kiểm tra và đi tiếp tục Wander
        if (shelfIdTaken) customer.checkedShelfIds.push(shelfIdTaken)
        customer.state = 'WANDER'
      }
    }
  }

  private handleGoCashier(customer: Customer) {
    if (Phaser.Math.Distance.Between(customer.sprite.x, customer.sprite.y, customer.targetX, customer.targetY) > 5) {
      this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
    } else {
      customer.sprite.body!.velocity.set(0)
      customer.state = 'WAITING'
    }
  }

  /** Đứng chờ tới lượt thanh toán. Nếu người trước xong, NPC sẽ tiến lên một bước */
  private handleWaiting(customer: Customer) {
    const store = useGameStore()
    const myIndex = store.waitingQueue.findIndex(item => item.instanceId === customer.instanceId)
    if (myIndex === -1) return // Sẽ được xử lý trong updateNPCs

    const cashier = Object.values(store.placedCashiers)[0] as any
    if (cashier) {
      const expectedY = cashier.y + 60 + (myIndex * 40)
      if (Math.abs(customer.targetY - expectedY) > 5) {
        customer.targetY = expectedY
        customer.state = 'GO_CASHIER' // Di chuyển lên vị trí hàng chờ mới
      }
    }
    customer.sprite.body!.velocity.set(0)
  }

  /** Logic dọn dẹp và di chuyển ra khỏi cửa hàng */
  private handleLeave(customer: Customer) {
    // 1. Giải phóng ghế nếu NPC đang ngồi bàn
    if (customer.assignedTableId && customer.seatIndex !== undefined) {
      const gStore = useGameStore()
      const table = gStore.placedTables[customer.assignedTableId]
      if (table && table.occupants[customer.seatIndex!] === customer.instanceId) {
        table.occupants[customer.seatIndex!] = null
      }
    }

    // 2. Kiểm tra nếu đã ra tới ngoài vỉa hè thì Destroy object
    const doorLocation = this.environmentManager.getDoorLocation()
    if (Phaser.Math.Distance.Between(customer.sprite.x, customer.sprite.y, customer.targetX, customer.targetY) < 15) {
      if (customer.targetY > doorLocation.y) { // Đã đi qua mốc cửa
        if (customer.statusText) customer.statusText.destroy()
        customer.sprite.destroy()
        const idx = this.customers.indexOf(customer)
        if (idx !== -1) this.customers.splice(idx, 1)
      }
    }
  }

  /** Lệnh cưỡng chế NPC rời đi (Dùng khi hoàn tất thanh toán hoặc đóng cửa) */
  private npcLeaveShop(customer: Customer) {
    if (!customer.sprite.active) return

    // Destroy trade icon nếu có
    if (customer.tradeIcon) {
      customer.tradeIcon.destroy()
      customer.tradeIcon = undefined
    }

    // Nếu NPC đang ở state trade → thông báo tradeStore để đóng modal
    if (customer.state === 'TRADE_IN_WAITING' || customer.state === 'TRADE_IN') {
      import('../../inventory/store/tradeInStore').then(({ useTradeInStore }) => {
        const tradeStore = useTradeInStore()
        if (tradeStore.activeTrade?.npcInstanceId === customer.instanceId) {
          tradeStore.cancelTrade('npc_left')
        }
      })
    }

    customer.state = 'LEAVE'
    customer.timer = this.scene.time.now
    const doorLocation = this.environmentManager.getDoorLocation()

    // Điểm mốc 1: Đi tới cửa
    customer.targetX = doorLocation.x
    customer.targetY = doorLocation.y - 40
    this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)

    // Điểm mốc 2: Đi hẳn ra ngoài sau 1s
    this.scene.time.addEvent({
      delay: 1000,
      callback: () => {
        if (customer.sprite.active) {
          customer.targetY = doorLocation.y + 120
          this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
        }
      }
    })
  }

  /**
   * Tạo icon lơ lửng 🃏 trên đầu NPC để Player biết đây là khách bán thẻ.
   * Icon bay nhẹ (tween yoyo) để dễ nhận diện.
   */
  private spawnTradeIcon(customer: Customer) {
    const icon = this.scene.add.text(
      customer.sprite.x,
      customer.sprite.y - 70,
      '🃏',
      { fontSize: '20px' }
    ).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    // Tween bouncing animation
    this.scene.tweens.add({
      targets: icon,
      y: icon.y - 6,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })

    customer.tradeIcon = icon
  }

  /**
   * Cập nhật vị trí icon mỗi frame (gọi trong updateNPCAnimation).
   */
  private updateTradeIcon(customer: Customer) {
    if (!customer.tradeIcon) return
    customer.tradeIcon.x = customer.sprite.x
    customer.tradeIcon.y = customer.sprite.y - 70
  }

  /**
   * NPC mang thẻ bán: di chuyển tới quầy thu ngân mặc định.
   */
  private handleTradeIn(customer: Customer) {
    const gameStore = useGameStore()
    const cashiers = Object.values(gameStore.placedCashiers)
    if (cashiers.length === 0) {
      // Không có quầy → NPC bỏ đi
      this.npcLeaveShop(customer)
      return
    }

    // Pick quầy đầu tiên
    const desk = cashiers[0] as any
    customer.targetX = desk.x
    customer.targetY = desk.y + 40   // Đứng trước quầy 40px

    const dist = Phaser.Math.Distance.Between(
      customer.sprite.x, customer.sprite.y,
      customer.targetX, customer.targetY
    )

    if (dist > 12) {
      this.scene.physics.moveTo(
        customer.sprite,
        customer.targetX, customer.targetY,
        this.npcSpeed
      )
    } else {
      // Đã tới quầy → chuyển state
      customer.sprite.body?.velocity.set(0)
      customer.sprite.setPosition(customer.targetX, customer.targetY)
      customer.state = 'TRADE_IN_WAITING'
      customer.timer = this.scene.time.now + 30000  // Chờ tối đa 30s rồi bỏ đi
    }
  }

  /**
   * NPC đứng tại quầy, đợi Player click để mở TradeInModal.
   * Timeout 30s → NPC bỏ đi.
   */
  private handleTradeInWaiting(customer: Customer, time: number) {
    if (customer.sprite.body) {
      customer.sprite.body.velocity.set(0)
    }

    // Timeout: Nếu Player không tương tác trong 30s → NPC chán, bỏ đi
    if (time > customer.timer) {
      this.npcLeaveShop(customer)
      return
    }

    // Setup click handler (chỉ set 1 lần)
    if (!customer.sprite.input) {
      customer.sprite.setInteractive({ useHandCursor: true })
      customer.sprite.on('pointerdown', () => {
        this.openTradeInModal(customer)
      })
    }
  }

  /**
   * Player click vào NPC → mở TradeInModal và khởi tạo deal.
   */
  private openTradeInModal(customer: Customer) {
    if (!customer.tradeCardId) return

    // Dynamic import để tránh circular dep
    import('../../inventory/store/tradeInStore').then(({ useTradeInStore }) => {
      const tradeStore = useTradeInStore()
      tradeStore.startTrade(customer.instanceId, customer.tradeCardId!)
    })
  }

  getCustomers(): Customer[] { return this.customers }

  /**
   * Giải phóng tài nguyên khi Manager bị hủy.
   */
  destroy() {
    this.cleanupAllNPCs()
  }

  /**
   * ── NEW: PASSIVE EVENT SYSTEM HELPERS ──
   */

  /**
   * NPC chơi xong → tính phí event, chuyển sang state GO_CASHIER_EVENT.
   */
  private _startEventCheckout(customer: Customer) {
    const eventStore = useEventStore()
    const activeEvent = eventStore.activeEvent

    // Tính phí theo công thức: payment = (sessionMinutes / 60) × hourlyFee
    const startTs = customer.playStartTimestamp ?? Date.now()
    const elapsedMs = Date.now() - startTs
    const elapsedMinutes = elapsedMs / 60000  // real minutes

    let fee = 0
    if (activeEvent) {
      fee = (elapsedMinutes / 60) * activeEvent.hourlyFee
      // Round 2 decimals
      fee = Math.round(fee * 100) / 100
    }

    // Min fee guard — nếu quá ngắn (< 1 phút) vẫn charge base nếu có event
    if (fee < 0.5 && activeEvent && activeEvent.id !== 'standard') fee = 0.5

    customer.eventFeeOwed = fee

    // Free seat cho NPC khác
    if (customer.assignedTableId && customer.seatIndex !== undefined) {
      const gStore = useGameStore()
      const table = gStore.placedTables[customer.assignedTableId]
      if (table && table.occupants[customer.seatIndex!] === customer.instanceId) {
        table.occupants[customer.seatIndex!] = null
      }
    }

    // Chuyển state
    if (fee > 0) {
      customer.state = 'GO_CASHIER_EVENT'
      customer.searchStartTime = this.scene.time.now
    } else {
      // Event free → leave luôn
      this._applyEventPayment(customer)
      this.npcLeaveShop(customer)
    }
  }


  private handleGoCashierEvent(customer: Customer) {
    const gameStore = useGameStore()
    const cashiers = Object.values(gameStore.placedCashiers) as any[]
    if (cashiers.length === 0) {
      // Không có quầy → coi như thanh toán thẳng
      this._applyEventPayment(customer)
      this.npcLeaveShop(customer)
      return
    }

    const desk = cashiers[0]
    customer.targetX = desk.x
    customer.targetY = desk.y + 45

    const dist = Phaser.Math.Distance.Between(
      customer.sprite.x, customer.sprite.y,
      customer.targetX, customer.targetY
    )

    if (dist > 14) {
      this.scene.physics.moveTo(customer.sprite, customer.targetX, customer.targetY, this.npcSpeed)
    } else {
      customer.sprite.body?.velocity.set(0)
      // Thanh toán ngay khi tới quầy (không cần click — khách tự trả)
      this._applyEventPayment(customer)
      this.npcLeaveShop(customer)
    }
  }

  /**
   * Áp dụng thanh toán phí event:
   *   - Cộng tiền vào statsStore
   *   - Tăng counter totalPlayersHosted
   *   - Spawn popup "+ $X.XX" tại bàn chơi
   */
  private _applyEventPayment(customer: Customer) {
    const fee = customer.eventFeeOwed ?? 0
    if (fee <= 0) return

    const statsStore = useStatsStore()
    const eventStore = useEventStore()

    statsStore.addMoney(fee)
    statsStore.dailyStats.revenue += fee
    eventStore.incrementPlayersHosted(fee)

    // Popup "+$X.XX" tại vị trí NPC
    const popupX = customer.sprite.x
    const popupY = customer.sprite.y - 50

    const popup = this.scene.add.text(popupX, popupY, `+$${fee.toFixed(2)}`, {
      fontSize: '18px',
      color: '#10b981',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    this.scene.tweens.add({
      targets: popup,
      y: popupY - 60,
      alpha: 0,
      duration: 2000,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy(),
    })

    // Reset field để không double-charge
    customer.eventFeeOwed = 0
  }

}
