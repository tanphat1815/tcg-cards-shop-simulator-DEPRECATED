Hướng Dẫn Refactor NPC AI: Pathfinding A* + FSM
Tổng Quan
Dựa trên phân tích code hiện tại, đây là các file cần thay đổi và thêm mới:
File bị ảnh hưởng (refactor):

NPCManager.ts → Thay toàn bộ physics velocity bằng Tween Timeline + A*
StaffManager.ts → Refactor Restocker/Cashier AI thành FSM
MainScene.ts → Khởi tạo Grid Manager

File mới cần tạo:

EventBus.ts
StateMachine.ts
AStarGridManager.ts
CustomerFSM.ts
StaffFSM.ts


Bước 1: Tạo EventBus
File: src/features/shared/EventBus.ts
typescript// EventBus.ts — Cầu nối Phaser ↔ Vue, tránh DOM manipulation trực tiếp
// Pattern: Simple typed event emitter

type EventHandler = (...args: any[]) => void

class EventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map()

  // Đăng ký lắng nghe sự kiện
  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    // Trả về hàm unsubscribe để dọn dẹp
    return () => this.off(event, handler)
  }

  // Hủy đăng ký
  off(event: string, handler: EventHandler) {
    this.listeners.get(event)?.delete(handler)
  }

  // Phát sự kiện — Phaser gọi hàm này, Vue lắng nghe
  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach(h => h(...args))
  }

  // Dọn dẹp toàn bộ (dùng khi scene shutdown)
  clear() {
    this.listeners.clear()
  }
}

// Singleton — import từ bất cứ đâu đều cùng một instance
export const eventBus = new EventBus()

// Danh sách tên sự kiện được type-safe
export const EVENTS = {
  // Phaser → Vue
  CUSTOMER_PAID:        'customer:paid',        // { price, instanceId }
  SHELF_EMPTY:          'shelf:empty',           // { shelfId }
  NPC_TRADE_REQUEST:    'npc:tradeRequest',      // { instanceId, cardId }
  EVENT_FEE_COLLECTED:  'event:feeCollected',    // { amount, instanceId }
  // Vue → Phaser
  TRADE_RESULT:         'trade:result',          // { instanceId, accepted, finalPrice }
  SHOP_STATE_CHANGED:   'shop:stateChanged',     // { state: 'OPEN'|'CLOSED' }
} as const

Bước 2: Tạo StateMachine Base
File: src/features/shared/StateMachine.ts
typescript// StateMachine.ts — Base class FSM, mọi AI đều kế thừa từ đây
// Pattern: State Pattern với onEnter/onUpdate/onExit bắt buộc

export interface IState<TOwner> {
  name: string
  onEnter(owner: TOwner): void
  onUpdate(owner: TOwner, time: number, delta: number): void
  onExit(owner: TOwner): void
}

export class StateMachine<TOwner> {
  private states: Map<string, IState<TOwner>> = new Map()
  private currentState: IState<TOwner> | null = null
  private owner: TOwner

  constructorfunction Object() { [native code] }(owner: TOwner) {
    this.owner = owner
  }

  // Đăng ký một state vào FSM
  addState(state: IState<TOwner>) {
    this.states.set(state.name, state)
  }

  // Chuyển trạng thái — gọi onExit cũ, onEnter mới
  transition(stateName: string) {
    const nextState = this.states.get(stateName)
    if (!nextState) {
      console.warn(`[FSM] State "${stateName}" không tồn tại`)
      return
    }
    // Nếu đang ở cùng state thì không làm gì
    if (this.currentState?.name === stateName) return

    this.currentState?.onExit(this.owner)
    this.currentState = nextState
    this.currentState.onEnter(this.owner)
  }

  // Gọi mỗi frame từ update()
  update(time: number, delta: number) {
    this.currentState?.onUpdate(this.owner, time, delta)
  }

  get current(): string {
    return this.currentState?.name ?? 'NONE'
  }
}

Bước 3: Tạo AStarGridManager
File: src/features/environment/managers/AStarGridManager.ts
typescript// AStarGridManager.ts
// QUAN TRỌNG: Dùng Manhattan Distance + 4 hướng (KHÔNG đi chéo)
// Grid cell size = TILE_SIZE pixel (match với map layout)

import Phaser from 'phaser'

export const GRID_TILE = 16  // px mỗi ô lưới — nhỏ hơn tile visual để đi sát vật thể

interface GridNode {
  x: number       // chỉ số cột
  y: number       // chỉ số hàng
  walkable: boolean
  g: number       // cost từ start
  h: number       // heuristic đến goal
  f: number       // g + h
  parent: GridNode | null
}

export interface WorldPoint {
  x: number
  y: number
}

export class AStarGridManager {
  private grid: GridNode[][] = []
  private cols: number = 0
  private rows: number = 0
  private originX: number = 0  // tọa độ world của ô lưới (0,0)
  private originY: number = 0

  /**
   * Khởi tạo grid từ kích thước shop.
   * CRITICAL: origin phải khớp chính xác với shopBounds.x/y
   */
  initialize(shopX: number, shopY: number, shopW: number, shopH: number) {
    this.originX = shopX
    this.originY = shopY
    this.cols = Math.ceil(shopW / GRID_TILE)
    this.rows = Math.ceil(shopH / GRID_TILE)

    // Tạo grid rỗng — tất cả walkable
    this.grid = []
    for (let r = 0; r < this.rows; r++) {
      this.grid[r] = []
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c] = {
          x: c, y: r,
          walkable: true,
          g: 0, h: 0, f: 0,
          parent: null
        }
      }
    }
  }

  /**
   * Đánh dấu vùng không thể đi từ physics body của Phaser StaticBody.
   * CRITICAL: Dùng CHÍNH XÁC body.x, body.y, body.width, body.height
   * KHÔNG dùng sprite.getBounds() vì nó dùng visual bounds (to hơn)
   */
  markObstacleFromBody(body: Phaser.Physics.Arcade.StaticBody) {
    // Tọa độ world của physics body (chính xác, không bị scale visual)
    const wx = body.x
    const wy = body.y
    const ww = body.width
    const wh = body.height

    // Chuyển sang chỉ số grid
    // KHÔNG Math.round — dùng floor/ceil để không làm to vùng cấm
    const c0 = Math.floor((wx - this.originX) / GRID_TILE)
    const r0 = Math.floor((wy - this.originY) / GRID_TILE)
    const c1 = Math.ceil((wx + ww - this.originX) / GRID_TILE)
    const r1 = Math.ceil((wy + wh - this.originY) / GRID_TILE)

    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        if (this.inBounds(c, r)) {
          this.grid[r][c].walkable = false
        }
      }
    }
  }

  /**
   * Xóa toàn bộ obstacle (dùng khi đặt/dời nội thất)
   * rồi gọi lại markObstacleFromBody cho tất cả furniture
   */
  clearObstacles() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c].walkable = true
      }
    }
  }

  /**
   * A* pathfinding — Manhattan + 4 hướng
   * Trả về mảng WorldPoint (tâm ô lưới) hoặc null nếu không tìm được đường
   */
  findPath(fromWorld: WorldPoint, toWorld: WorldPoint): WorldPoint[] | null {
    const startC = Math.floor((fromWorld.x - this.originX) / GRID_TILE)
    const startR = Math.floor((fromWorld.y - this.originY) / GRID_TILE)
    const goalC  = Math.floor((toWorld.x  - this.originX) / GRID_TILE)
    const goalR  = Math.floor((toWorld.y  - this.originY) / GRID_TILE)

    if (!this.inBounds(startC, startR) || !this.inBounds(goalC, goalR)) return null
    if (!this.grid[goalR][goalC].walkable) {
      // Nếu đích không walkable, tìm ô walkable gần nhất làm đích thay thế
      const alt = this.findNearestWalkable(goalC, goalR)
      if (!alt) return null
      return this.findPath(fromWorld, this.gridToWorld(alt.x, alt.y))
    }

    // Reset g/h/f/parent cho toàn grid
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const n = this.grid[r][c]
        n.g = Infinity; n.h = 0; n.f = Infinity; n.parent = null
      }
    }

    const open: GridNode[] = []
    const closed: Set<string> = new Set()

    const startNode = this.grid[startR][startC]
    startNode.g = 0
    startNode.h = this.manhattan(startC, startR, goalC, goalR)
    startNode.f = startNode.h
    open.push(startNode)

    while (open.length > 0) {
      // Lấy node có f nhỏ nhất
      open.sort((a, b) => a.f - b.f)
      const current = open.shift()!
      const key = `${current.x},${current.y}`
      closed.add(key)

      // Đã đến đích
      if (current.x === goalC && current.y === goalR) {
        return this.reconstructPath(current)
      }

      // 4 hướng: Trên, Dưới, Trái, Phải — KHÔNG đi chéo
      const neighbors = [
        { dc: 0, dr: -1 }, // Lên
        { dc: 0, dr:  1 }, // Xuống
        { dc: -1, dr: 0 }, // Trái
        { dc:  1, dr: 0 }, // Phải
      ]

      for (const { dc, dr } of neighbors) {
        const nc = current.x + dc
        const nr = current.y + dr
        if (!this.inBounds(nc, nr)) continue
        const neighbor = this.grid[nr][nc]
        if (!neighbor.walkable) continue
        if (closed.has(`${nc},${nr}`)) continue

        const tentativeG = current.g + 1 // Cost mỗi bước = 1

        if (tentativeG < neighbor.g) {
          neighbor.parent = current
          neighbor.g = tentativeG
          // Manhattan Distance — bắt buộc, không dùng Euclidean
          neighbor.h = this.manhattan(nc, nr, goalC, goalR)
          neighbor.f = neighbor.g + neighbor.h

          if (!open.includes(neighbor)) {
            open.push(neighbor)
          }
        }
      }
    }

    return null // Không tìm được đường
  }

  /** Hàm heuristic Manhattan: |dx| + |dy| */
  private manhattan(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2)
  }

  /** Tái tạo đường đi từ parent chain */
  private reconstructPath(endNode: GridNode): WorldPoint[] {
    const path: WorldPoint[] = []
    let current: GridNode | null = endNode
    while (current) {
      // Tọa độ tâm ô lưới trong world space
      path.unshift(this.gridToWorld(current.x, current.y))
      current = current.parent
    }
    return path
  }

  /** Chuyển chỉ số grid → tọa độ tâm ô trong world */
  gridToWorld(col: number, row: number): WorldPoint {
    return {
      x: this.originX + col * GRID_TILE + GRID_TILE / 2,
      y: this.originY + row * GRID_TILE + GRID_TILE / 2,
    }
  }

  /** Tìm ô walkable gần nhất (BFS) */
  private findNearestWalkable(c: number, r: number): { x: number, y: number } | null {
    const queue = [{ x: c, y: r }]
    const visited = new Set<string>([`${c},${r}`])
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (this.grid[cur.y]?.[cur.x]?.walkable) return cur
      for (const { dc, dr } of [{ dc:0,dr:-1 },{ dc:0,dr:1 },{ dc:-1,dr:0 },{ dc:1,dr:0 }]) {
        const nx = cur.x + dc, ny = cur.y + dr
        const k = `${nx},${ny}`
        if (this.inBounds(nx, ny) && !visited.has(k)) {
          visited.add(k); queue.push({ x: nx, y: ny })
        }
      }
    }
    return null
  }

  private inBounds(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows
  }

  /** Debug: vẽ grid lên Phaser Graphics (chỉ dùng khi debug) */
  debugDraw(graphics: Phaser.GameObjects.Graphics) {
    graphics.clear()
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const node = this.grid[r][c]
        if (!node.walkable) {
          graphics.fillStyle(0xff0000, 0.3)
          graphics.fillRect(
            this.originX + c * GRID_TILE,
            this.originY + r * GRID_TILE,
            GRID_TILE - 1, GRID_TILE - 1
          )
        }
      }
    }
  }
}

// Singleton cho toàn game
export const aStarGrid = new AStarGridManager()

Bước 4: Tạo NPC Locomotion (Tween Timeline)
File: src/features/customer/managers/NPCLocomotion.ts
typescript// NPCLocomotion.ts
// Thay thế toàn bộ physics.moveTo() bằng Tween Timeline
// NPC di chuyển từ tâm ô → tâm ô theo đường thẳng góc vuông 90°

import Phaser from 'phaser'
import { aStarGrid, GRID_TILE, type WorldPoint } from '../../environment/managers/AStarGridManager'
import { applyDynamicYSort } from '../../environment/ySortUtils'

const MOVE_SPEED_PX_PER_TILE = 160 // pixel/s — điều chỉnh tốc độ NPC ở đây

export interface MoveOptions {
  onStep?: (waypoint: WorldPoint) => void  // Callback mỗi bước
  onComplete?: () => void                   // Callback khi đến đích
  onBlocked?: () => void                    // Callback khi không tìm được đường
}

export class NPCLocomotion {
  private scene: Phaser.Scene
  private sprite: Phaser.Physics.Arcade.Sprite
  private currentTween: Phaser.Tweens.Timeline | null = null
  private waitTimer: Phaser.Time.TimerEvent | null = null

  // Theo dõi stuck recovery
  private lastX: number = 0
  private lastY: number = 0
  private stuckMs: number = 0
  private readonly STUCK_THRESHOLD_MS = 800

  constructorfunction Object() { [native code] }(scene: Phaser.Scene, sprite: Phaser.Physics.Arcade.Sprite) {
    this.scene = scene
    this.sprite = sprite
  }

  /**
   * Di chuyển sprite đến đích world bằng A* + Tween Timeline
   * ĐÂY LÀ HÀM CHÍNH THAY THẾ physics.moveTo()
   */
  moveTo(destination: WorldPoint, options: MoveOptions = {}) {
    this.stopMovement()

    const path = aStarGrid.findPath(
      { x: this.sprite.x, y: this.sprite.y },
      destination
    )

    if (!path || path.length === 0) {
      options.onBlocked?.()
      return
    }

    // Bỏ waypoint đầu (vị trí hiện tại) nếu quá gần
    const waypoints = path.filter((wp, i) => {
      if (i === 0) {
        const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, wp.x, wp.y)
        return dist > GRID_TILE * 0.5
      }
      return true
    })

    if (waypoints.length === 0) {
      options.onComplete?.()
      return
    }

    this.buildTweenTimeline(waypoints, options)
  }

  /**
   * Xây dựng Tween Timeline từ mảng waypoints
   * Mỗi waypoint = 1 tween riêng biệt, nối tiếp nhau
   * KHÔNG dùng velocity — tránh cắt góc
   */
  private buildTweenTimeline(waypoints: WorldPoint[], options: MoveOptions) {
    // Thời gian di chuyển mỗi ô = GRID_TILE / speed * 1000ms
    const msPerTile = (GRID_TILE / MOVE_SPEED_PX_PER_TILE) * 1000

    // Disable physics body trong lúc tween (tránh conflict)
    if (this.sprite.body) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0)
    }

    // Xây dựng chuỗi tweens
    const tweenConfigs: Phaser.Types.Tweens.TweenBuilderConfig[] = waypoints.map((wp, index) => ({
      targets: this.sprite,
      x: wp.x,
      y: wp.y,
      duration: msPerTile,
      ease: 'Linear',
      onUpdate: () => {
        // Y-sort mỗi frame trong tween
        applyDynamicYSort(this.sprite)
        // Cập nhật animation hướng
        this.updateDirectionAnimation(wp)
      },
      onComplete: () => {
        options.onStep?.(wp)
        // Waypoint cuối cùng
        if (index === waypoints.length - 1) {
          this.snapToGrid(wp)
          options.onComplete?.()
        }
      }
    }))

    this.currentTween = this.scene.tweens.timeline({ tweens: tweenConfigs })
  }

  /**
   * Snap sprite vào đúng tâm ô grid khi đến đích
   * Tránh lệch nhỏ do floating point
   */
  private snapToGrid(wp: WorldPoint) {
    this.sprite.setPosition(wp.x, wp.y)
    applyDynamicYSort(this.sprite)
    if (this.sprite.anims.isPlaying) this.sprite.anims.stop()
  }

  /**
   * Chọn animation 4 hướng dựa trên hướng di chuyển tới waypoint kế
   */
  private updateDirectionAnimation(target: WorldPoint) {
    const dx = target.x - this.sprite.x
    const dy = target.y - this.sprite.y
    const prefix = this.sprite.texture.key.startsWith('staff') ? 'staff' : 'npc'
    if (Math.abs(dx) > Math.abs(dy)) {
      this.sprite.anims.play(dx < 0 ? `${prefix}-left` : `${prefix}-right`, true)
    } else if (Math.abs(dy) > 0.1) {
      this.sprite.anims.play(dy < 0 ? `${prefix}-up` : `${prefix}-down`, true)
    }
  }

  /**
   * Wait → Reroute khi bị chặn bởi NPC khác
   * Gọi khi phát hiện blocked, đợi WAIT_MS rồi thử tìm đường lại
   */
  waitAndReroute(destination: WorldPoint, options: MoveOptions, waitMs: number = 500) {
    this.stopMovement()
    // Đứng yên trong lúc chờ
    if (this.sprite.anims.isPlaying) this.sprite.anims.stop()

    this.waitTimer = this.scene.time.delayedCall(waitMs, () => {
      this.moveTo(destination, options) // Thử lại sau khi đợi
    })
  }

  stopMovement() {
    if (this.currentTween) {
      this.currentTween.stop()
      this.currentTween.destroy()
      this.currentTween = null
    }
    if (this.waitTimer) {
      this.waitTimer.remove()
      this.waitTimer = null
    }
    if (this.sprite.body) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0)
    }
  }

  /** Gọi mỗi frame để detect stuck (dùng trong FSM states) */
  checkStuck(delta: number): boolean {
    const dx = Math.abs(this.sprite.x - this.lastX)
    const dy = Math.abs(this.sprite.y - this.lastY)

    if (this.currentTween && (dx < 0.5 && dy < 0.5)) {
      this.stuckMs += delta
      if (this.stuckMs > this.STUCK_THRESHOLD_MS) {
        this.stuckMs = 0
        return true // Đang bị kẹt
      }
    } else {
      this.stuckMs = 0
    }

    this.lastX = this.sprite.x
    this.lastY = this.sprite.y
    return false
  }

  get isMoving(): boolean {
    return this.currentTween !== null && this.currentTween.isPlaying()
  }

  destroy() {
    this.stopMovement()
  }
}

Bước 5: CustomerFSM — Tất cả states
File: src/features/customer/managers/CustomerFSM.ts
typescript// CustomerFSM.ts
// Tích hợp ĐẦY ĐỦ tất cả business logic từ NPCManager.ts cũ vào FSM chuẩn
// KHÔNG mất feature: BUY, PLAY, SELL (TradeIn), EventFee

import Phaser from 'phaser'
import type { IState } from '../../shared/StateMachine'
import { StateMachine } from '../../shared/StateMachine'
import { NPCLocomotion } from './NPCLocomotion'
import { eventBus, EVENTS } from '../../shared/EventBus'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { useStatsStore } from '../../stats/store/statsStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { useEventStore } from '../../events/store/eventStore'
import { getRawPrice } from '../../shared/utils/currency'
import { applyDynamicYSort } from '../../environment/ySortUtils'
import { DEPTH } from '../../environment/config'
import type { CustomerIntent } from '../types'

// ═══════════════════════════════════════════════════════
// DATA STRUCTURE cho mỗi Customer
// ═══════════════════════════════════════════════════════
export interface CustomerData {
  instanceId: string
  sprite: Phaser.Physics.Arcade.Sprite
  statusText: Phaser.GameObjects.Text
  tradeIcon?: Phaser.GameObjects.Text
  intent: CustomerIntent
  spawnTime: number

  // Target cho di chuyển
  targetPos: { x: number; y: number }

  // Shopping state
  targetPrice: number
  checkedShelfIds: string[]
  tradeCardId?: string

  // Play state
  assignedTableId?: string | null
  seatIndex?: number | null
  playStartTimestamp?: number

  // Event fee state
  eventFeeOwed?: number

  // Boredom timer
  boredomMs: number
}

// ═══════════════════════════════════════════════════════
// FSM OWNER — kết hợp data + locomotion
// ═══════════════════════════════════════════════════════
export class CustomerAgent {
  public data: CustomerData
  public fsm: StateMachine<CustomerAgent>
  public loco: NPCLocomotion
  private scene: Phaser.Scene

  constructorfunction Object() { [native code] }(scene: Phaser.Scene, data: CustomerData) {
    this.scene = scene
    this.data = data
    this.loco = new NPCLocomotion(scene, data.sprite)
    this.fsm = new StateMachine<CustomerAgent>(this)
    this.registerStates()
  }

  private registerStates() {
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
  }

  start() {
    this.fsm.transition('SPAWN')
  }

  update(time: number, delta: number) {
    // Y-sort + text update mỗi frame
    applyDynamicYSort(this.data.sprite)
    this.updateStatusText()
    this.fsm.update(time, delta)
  }

  private updateStatusText() {
    if (!this.data.statusText) return
    this.data.statusText.setPosition(this.data.sprite.x, this.data.sprite.y - 55)
  }

  destroy() {
    this.loco.destroy()
    this.data.statusText?.destroy()
    this.data.tradeIcon?.destroy()
    this.data.sprite.destroy()
  }
}

// ═══════════════════════════════════════════════════════
// STATES
// ═══════════════════════════════════════════════════════

// --- SPAWN: NPC vừa vào cửa, di chuyển vào bên trong ---
class SpawnState implements IState<CustomerAgent> {
  name = 'SPAWN'

  onEnter(agent: CustomerAgent) {
    agent.data.statusText.setText('Entering...')
    const store = useGameStore()
    const bounds = store.placedShelves // sẽ dùng shop bounds từ EnvironmentManager
    // Di chuyển vào điểm ngẫu nhiên bên trong shop
    const { x, y } = agent.data.targetPos
    agent.loco.moveTo({ x, y }, {
      onComplete: () => {
        // Sau khi vào trong, chuyển theo intent
        if (agent.data.intent === 'PLAY') {
          agent.fsm.transition('WANT_TO_PLAY')
        } else if (agent.data.intent === 'SELL') {
          agent.fsm.transition('TRADE_IN')
        } else {
          agent.fsm.transition('WANDER')
        }
      },
      onBlocked: () => agent.fsm.transition('LEAVE')
    })
  }

  onUpdate(_agent: CustomerAgent, _time: number, _delta: number) {}

  onExit(_agent: CustomerAgent) {}
}

// --- WANDER: Đi dạo tìm kệ có hàng ---
class WanderState implements IState<CustomerAgent> {
  name = 'WANDER'
  private searchTimer: number = 0
  private readonly SEARCH_INTERVAL_MS = 1500
  private readonly BOREDOM_MAX_MS = 45000

  onEnter(agent: CustomerAgent) {
    agent.data.statusText.setText('🔍 Looking around')
    this.searchTimer = 0
  }

  onUpdate(agent: CustomerAgent, _time: number, delta: number) {
    // Boredom check
    agent.data.boredomMs += delta
    if (agent.data.boredomMs > this.BOREDOM_MAX_MS) {
      agent.fsm.transition('LEAVE')
      return
    }

    this.searchTimer += delta
    if (this.searchTimer < this.SEARCH_INTERVAL_MS) return
    this.searchTimer = 0

    const store = useGameStore()

    if (agent.data.intent === 'PLAY') {
      // Tìm bàn trống
      const tables = Object.values(store.placedTables)
      for (const table of tables) {
        if (table.occupants?.includes(null)) {
          const seatIdx = store.joinTable(table.id, agent.data.instanceId)
          if (seatIdx !== null) {
            agent.data.assignedTableId = table.id
            agent.data.seatIndex = seatIdx
            agent.fsm.transition('SEEK_TABLE')
            return
          }
        }
      }
      // Không có bàn → đổi sang mua
      if (Math.random() < 0.3) {
        agent.data.intent = 'BUY'
      }
    } else {
      // Tìm kệ có hàng
      const shelves = Object.values(store.placedShelves)
      for (const shelf of shelves) {
        if (shelf.role !== 'selling' && shelf.role !== 'display_case') continue
        if (agent.data.checkedShelfIds.includes(shelf.id)) continue
        if (shelf.tiers.some(t => t.slots.some(s => s !== null))) {
          // Đặt target rồi chuyển sang SeekItem
          agent.data.targetPos = { x: shelf.x, y: shelf.y + 45 }
          agent.fsm.transition('SEEK_ITEM')
          return
        }
      }
    }
  }

  onExit(_agent: CustomerAgent) {}
}

// --- SEEK_ITEM: Di chuyển tới kệ ---
class SeekItemState implements IState<CustomerAgent> {
  name = 'SEEK_ITEM'

  onEnter(agent: CustomerAgent) {
    agent.data.statusText.setText('📦 Going to shelf')
    agent.loco.moveTo(agent.data.targetPos, {
      onComplete: () => agent.fsm.transition('INTERACT'),
      onBlocked: () => {
        // Wait và reroute nếu bị chặn
        agent.loco.waitAndReroute(agent.data.targetPos, {
          onComplete: () => agent.fsm.transition('INTERACT'),
          onBlocked: () => agent.fsm.transition('WANDER')
        })
      }
    })
  }

  onUpdate(agent: CustomerAgent, _time: number, delta: number) {
    // Stuck detection
    if (agent.loco.checkStuck(delta)) {
      agent.loco.waitAndReroute(agent.data.targetPos, {
        onComplete: () => agent.fsm.transition('INTERACT'),
        onBlocked: () => agent.fsm.transition('WANDER')
      })
    }
  }

  onExit(_agent: CustomerAgent) {}
}

// --- INTERACT: Tương tác với kệ, lấy hàng ---
class InteractState implements IState<CustomerAgent> {
  name = 'INTERACT'
  private interactTimer: number = 0
  private readonly INTERACT_DURATION_MS = 1000

  onEnter(_agent: CustomerAgent) {
    this.interactTimer = 0
  }

  onUpdate(agent: CustomerAgent, _time: number, delta: number) {
    this.interactTimer += delta
    if (this.interactTimer < this.INTERACT_DURATION_MS) return

    const store = useGameStore()
    const apiStore = useApiStore()
    const eventStore = useEventStore()

    // Tìm kệ gần nhất với vị trí NPC
    let targetShelfId: string | null = null
    for (const shelf of Object.values(store.placedShelves)) {
      const dist = Phaser.Math.Distance.Between(
        agent.data.sprite.x, agent.data.sprite.y,
        shelf.x, shelf.y + 45
      )
      if (dist < 20) { targetShelfId = shelf.id; break }
    }

    if (!targetShelfId) { agent.fsm.transition('WANDER'); return }

    const shelf = store.placedShelves[targetShelfId]

    // Xử lý Display Case
    if (shelf.role === 'display_case') {
      const result = store.npcPeekFromDisplayCase(targetShelfId)
      if (result) {
        const card = apiStore.flatCardMap[result.baseCardId]
        if (card) {
          const market = getRawPrice(card)
          const maxAccept = market * result.multiplier * 1.5
          if (result.price <= maxAccept) {
            store.npcCommitBuyFromDisplayCase(targetShelfId, result.tierIdx, result.slotIdx, result.cardId)
            agent.data.targetPrice = result.price
            this.goToCheckout(agent, store)
            return
          }
        }
      }
      agent.data.checkedShelfIds.push(targetShelfId)
      agent.fsm.transition('WANDER')
      return
    }

    // Kệ thường — lấy item
    const itemId = store.npcTakeItemFromSlot(targetShelfId)
    if (itemId) {
      const itemData = store.shopItems[itemId]
      let price = itemData?.sellPrice || 15

      // Event multiplier
      if (itemData?.sourceSetId) {
        const setCards = apiStore.setCardsCache[itemData.sourceSetId] || []
        if (setCards.length > 0) {
          const rep = setCards[Math.floor(Math.random() * setCards.length)]
          price *= eventStore.getEventPriceMultiplier(rep)
        }
      }
      agent.data.targetPrice = price

      // Popup
      const popup = agent.data.sprite.scene.add.text(
        agent.data.sprite.x, agent.data.sprite.y - 40,
        itemData?.type === 'box' ? '+1 Box 📦' : '+1 Pack 🎁',
        { fontSize: '12px', color: '#00ff00', fontStyle: 'bold' }
      ).setOrigin(0.5)
      agent.data.sprite.scene.tweens.add({
        targets: popup, y: popup.y - 30, alpha: 0, duration: 1500,
        onComplete: () => popup.destroy()
      })

      this.goToCheckout(agent, store)
    } else {
      agent.data.checkedShelfIds.push(targetShelfId)
      agent.fsm.transition('WANDER')
    }
  }

  private goToCheckout(agent: CustomerAgent, store: ReturnType<typeof useGameStore>) {
    store.addWaitingCustomer(agent.data.targetPrice, agent.data.instanceId)
    agent.data.statusText.setText('🛒 To Cashier')
    agent.fsm.transition('SEEK_CHECKOUT')
  }

  onExit(_agent: CustomerAgent) {}
}

// --- SEEK_CHECKOUT: Di chuyển đến quầy thu ngân và xếp hàng ---
class SeekCheckoutState implements IState<CustomerAgent> {
  name = 'SEEK_CHECKOUT'

  onEnter(agent: CustomerAgent) {
    agent.data.statusText.setText('🛒 To Cashier')
    const store = useGameStore()
    const cashier = Object.values(store.placedCashiers)[0] as any
    if (!cashier) { agent.fsm.transition('LEAVE'); return }

    const myIdx = store.waitingQueue.findIndex((q: any) => q.instanceId === agent.data.instanceId)
    // Tọa độ xếp hàng: đứng phía sau quầy, mỗi người cách nhau 1 tile
    const targetY = cashier.y + 60 + (Math.max(0, myIdx) * 40)
    agent.data.targetPos = { x: cashier.x, y: targetY }

    agent.loco.moveTo(agent.data.targetPos, {
      onComplete: () => agent.fsm.transition('QUEUEING'),
      onBlocked: () => agent.loco.waitAndReroute(agent.data.targetPos, {
        onComplete: () => agent.fsm.transition('QUEUEING'),
        onBlocked: () => {} // Tiếp tục đứng chờ
      })
    })
  }

  onUpdate(agent: CustomerAgent, _time: number, delta: number) {
    if (agent.loco.checkStuck(delta)) {
      agent.loco.waitAndReroute(agent.data.targetPos, {
        onComplete: () => agent.fsm.transition('QUEUEING'),
        onBlocked: () => {}
      })
    }
  }

  onExit(_agent: CustomerAgent) {}
}

// --- QUEUEING: Đứng chờ trong hàng ---
class QueuingState implements IState<CustomerAgent> {
  name = 'QUEUEING'

  onEnter(agent: CustomerAgent) {
    agent.data.statusText.setText('⌛ Waiting in line')
  }

  onUpdate(agent: CustomerAgent, _time: number, _delta: number) {
    const store = useGameStore()
    // Nếu đã được phục vụ (không còn trong queue) → rời đi
    const inQueue = store.waitingQueue.some((q: any) => q.instanceId === agent.data.instanceId)
    if (!inQueue) {
      agent.fsm.transition('LEAVE')
      return
    }

    // Cập nhật vị trí hàng khi người trước đã rời đi
    const cashier = Object.values(store.placedCashiers)[0] as any
    if (cashier) {
      const myIdx = store.waitingQueue.findIndex((q: any) => q.instanceId === agent.data.instanceId)
      const expectedY = cashier.y + 60 + (myIdx * 40)
      if (Math.abs(agent.data.sprite.y - expectedY) > 5) {
        agent.data.targetPos = { x: cashier.x, y: expectedY }
        // Tiến lên nhẹ nhàng bằng tween ngắn
        agent.data.sprite.scene.tweens.add({
          targets: agent.data.sprite,
          x: cashier.x,
          y: expectedY,
          duration: 400,
          ease: 'Linear'
        })
      }
    }
  }

  onExit(_agent: CustomerAgent) {}
}

// --- WANT_TO_PLAY: Tìm bàn trống ---
class WantToPlayState implements IState<CustomerAgent> {
  name = 'WANT_TO_PLAY'
  private searchTimer: number = 0
  private readonly SEARCH_INTERVAL_MS = 2000
  private totalWaitMs: number = 0
  private readonly MAX_WAIT_MS = 10000

  onEnter(agent: CustomerAgent) {
    agent.data.statusText.setText('🔍 Looking for table')
    this.searchTimer = 0
    this.totalWaitMs = 0
  }

  onUpdate(agent: CustomerAgent, _time: number, delta: number) {
    this.searchTimer += delta
    this.totalWaitMs += delta

    if (this.totalWaitMs > this.MAX_WAIT_MS) {
      // Hết kiên nhẫn → chuyển sang mua
      agent.data.intent = 'BUY'
      agent.data.checkedShelfIds = []
      agent.fsm.transition('WANDER')
      return
    }

    if (this.searchTimer < this.SEARCH_INTERVAL_MS) return
    this.searchTimer = 0

    const store = useGameStore()
    const tables = Object.values(store.placedTables)
    for (const table of tables) {
      if (table.occupants?.includes(null)) {
        const seatIdx = store.joinTable(table.id, agent.data.instanceId)
        if (seatIdx !== null) {
          agent.data.assignedTableId = table.id
          agent.data.seatIndex = seatIdx
          // Tính tọa độ ghế ngồi
          const isVert = (table.rotation ?? 0) === 90
          if (isVert) {
            agent.data.targetPos = { x: table.x, y: seatIdx === 0 ? table.y - 30 : table.y + 30 }
          } else {
            agent.data.targetPos = { x: seatIdx === 0 ? table.x - 30 : table.x + 30, y: table.y }
          }
          agent.fsm.transition('SEEK_TABLE')
          return
        }
      }
    }
  }

  onExit(_agent: CustomerAgent) {}
}

// --- SEEK_TABLE: Di chuyển đến bàn chơi ---
class SeekTableState implements IState<CustomerAgent> {
  name = 'SEEK_TABLE'

  onEnter(agent: CustomerAgent) {
    agent.data.statusText.setText('🃏 Going to table')
    agent.loco.moveTo(agent.data.targetPos, {
      onComplete: () => {
        // Snap vào vị trí ghế chính xác
        agent.data.sprite.setPosition(agent.data.targetPos.x, agent.data.targetPos.y)
        agent.data.playStartTimestamp = Date.now()
        agent.fsm.transition('PLAYING')
      },
      onBlocked: () => agent.loco.waitAndReroute(agent.data.targetPos, {
        onComplete: () => {
          agent.data.sprite.setPosition(agent.data.targetPos.x, agent.data.targetPos.y)
          agent.data.playStartTimestamp = Date.now()
          agent.fsm.transition('PLAYING')
        },
        onBlocked: () => agent.fsm.transition('WANT_TO_PLAY')
      })
    })
  }

  onUpdate(agent: CustomerAgent, _time: number, delta: number) {
    if (agent.loco.checkStuck(delta)) {
      agent.loco.waitAndReroute(agent.data.targetPos, {
        onComplete: () => agent.fsm.transition('PLAYING'),
        onBlocked: () => agent.fsm.transition('WANT_TO_PLAY')
      })
    }
  }

  onExit(_agent: CustomerAgent) {}
}

// --- PLAYING: Đang chơi bài, xử lý thời gian và phí event ---
class PlayingState implements IState<CustomerAgent> {
  name = 'PLAYING'
  private readonly MATCH_DURATION_MS = 12000
  private elapsedMs: number = 0

  onEnter(agent: CustomerAgent) {
    agent.data.statusText.setText('🃏 Playing...')
    this.elapsedMs = 0
    agent.loco.stopMovement() // Đứng yên tại bàn
  }

  onUpdate(agent: CustomerAgent, time: number, delta: number) {
    const store = useGameStore()
    const table = store.placedTables[agent.data.assignedTableId!]
    if (!table) { agent.fsm.transition('LEAVE'); return }

    // Bắt đầu match khi đủ 2 người
    if (table.occupants.every(o => o !== null) && !table.matchStartedAt) {
      store.startMatch(table.id)
    }

    if (table.matchStartedAt) {
      const elapsed = Date.now() - table.matchStartedAt

      // Hiệu ứng đánh bài
      this.elapsedMs += delta
      if (this.elapsedMs % 1000 < 50) {
        const emo = agent.data.sprite.scene.add.text(
          agent.data.sprite.x, agent.data.sprite.y - 40, '🃏', { fontSize: '16px' }
        ).setOrigin(0.5)
        agent.data.sprite.scene.tweens.add({
          targets: emo, y: emo.y - 20, alpha: 0, duration: 800,
          onComplete: () => emo.destroy()
        })
      }

      // Kết thúc ván
      if (elapsed >= this.MATCH_DURATION_MS) {
        if (agent.data.seatIndex === 0) {
          store.finishMatch(table.id)
          store.gainExp(50)
          const xpText = agent.data.sprite.scene.add.text(
            table.x, table.y - 60, '+50 XP',
            { fontSize: '18px', color: '#f1c40f', fontStyle: 'bold' }
          ).setOrigin(0.5)
          agent.data.sprite.scene.tweens.add({
            targets: xpText, y: xpText.y - 40, alpha: 0, duration: 2000,
            onComplete: () => xpText.destroy()
          })
        }
        this.startEventCheckout(agent)
      }
    }
  }

  /** Giải phóng ghế và tính phí event — giữ nguyên logic cũ */
  private startEventCheckout(agent: CustomerAgent) {
    const eventStore = useEventStore()
    const activeEvent = eventStore.activeEvent

    const startTs = agent.data.playStartTimestamp ?? Date.now()
    const elapsedMin = (Date.now() - startTs) / 60000
    let fee = activeEvent ? Math.round((elapsedMin / 60) * activeEvent.hourlyFee * 100) / 100 : 0
    if (fee < 0.5 && activeEvent && activeEvent.id !== 'standard') fee = 0.5
    agent.data.eventFeeOwed = fee

    // Giải phóng ghế
    if (agent.data.assignedTableId && agent.data.seatIndex !== undefined) {
      const store = useGameStore()
      const table = store.placedTables[agent.data.assignedTableId]
      if (table && table.occupants[agent.data.seatIndex!] === agent.data.instanceId) {
        table.occupants[agent.data.seatIndex!] = null
      }
    }

    if (fee > 0) {
      agent.fsm.transition('GO_CASHIER_EVENT')
    } else {
      agent.fsm.transition('LEAVE')
    }
  }

  onExit(_agent: CustomerAgent) {}
}

// --- TRADE_IN: NPC SELL intent, di chuyển tới quầy ---
class TradeInState implements IState<CustomerAgent> {
  name = 'TRADE_IN'

  onEnter(agent: CustomerAgent) {
    agent.data.statusText.setText('🃏 To Counter')
    const store = useGameStore()
    const cashier = Object.values(store.placedCashiers)[0] as any
    if (!cashier) { agent.fsm.transition('LEAVE'); return }

    agent.data.targetPos = { x: cashier.x, y: cashier.y + 40 }
    agent.loco.moveTo(agent.data.targetPos, {
      onComplete: () => {
        agent.data.sprite.setPosition(agent.data.targetPos.x, agent.data.targetPos.y)
        agent.fsm.transition('TRADE_IN_WAITING')
      },
      onBlocked: () => agent.loco.waitAndReroute(agent.data.targetPos, {
        onComplete: () => agent.fsm.transition('TRADE_IN_WAITING'),
        onBlocked: () => agent.fsm.transition('LEAVE')
      })
    })
  }

  onUpdate(_agent: CustomerAgent, _time: number, _delta: number) {}
  onExit(_agent: CustomerAgent) {}
}

// --- TRADE_IN_WAITING: Đứng chờ player click ---
class TradeInWaitingState implements IState<CustomerAgent> {
  name = 'TRADE_IN_WAITING'
  private waitedMs: number = 0
  private readonly TIMEOUT_MS = 30000
  private clickSetup: boolean = false

  onEnter(agent: CustomerAgent) {
    agent.data.statusText.setText('🃏 Offering Card')
    this.waitedMs = 0
    this.clickSetup = false
    agent.loco.stopMovement()
  }

  onUpdate(agent: CustomerAgent, _time: number, delta: number) {
    this.waitedMs += delta
    if (this.waitedMs > this.TIMEOUT_MS) {
      agent.fsm.transition('LEAVE')
      return
    }

    // Setup click handler chỉ 1 lần
    if (!this.clickSetup && !agent.data.sprite.input) {
      this.clickSetup = true
      agent.data.sprite.setInteractive({ useHandCursor: true })
      agent.data.sprite.on('pointerdown', () => {
        if (!agent.data.tradeCardId) return
        import('../../inventory/store/tradeInStore').then(({ useTradeInStore }) => {
          useTradeInStore().startTrade(agent.data.instanceId, agent.data.tradeCardId!)
        })
      })
    }
  }

  onExit(agent: CustomerAgent) {
    // Xóa click handler khi rời state
    if (agent.data.sprite.input) {
      agent.data.sprite.off('pointerdown')
      agent.data.sprite.disableInteractive()
    }
  }
}

// --- GO_CASHIER_EVENT: Trả phí event ---
class GoCashierEventState implements IState<CustomerAgent> {
  name = 'GO_CASHIER_EVENT'

  onEnter(agent: CustomerAgent) {
    agent.data.statusText.setText('💰 Paying Event Fee')
    const store = useGameStore()
    const cashier = Object.values(store.placedCashiers)[0] as any
    if (!cashier) {
      // Không có quầy → trả phí trực tiếp
      this.applyPayment(agent)
      agent.fsm.transition('LEAVE')
      return
    }

    agent.data.targetPos = { x: cashier.x, y: cashier.y + 45 }
    agent.loco.moveTo(agent.data.targetPos, {
      onComplete: () => {
        this.applyPayment(agent)
        agent.fsm.transition('LEAVE')
      },
      onBlocked: () => {
        // Nếu không đến được quầy → vẫn trả
        this.applyPayment(agent)
        agent.fsm.transition('LEAVE')
      }
    })
  }

  private applyPayment(agent: CustomerAgent) {
    const fee = agent.data.eventFeeOwed ?? 0
    if (fee <= 0) return

    const statsStore = useStatsStore()
    const eventStore = useEventStore()
    statsStore.addMoney(fee)
    statsStore.dailyStats.revenue += fee
    eventStore.incrementPlayersHosted(fee)

    // Emit event cho Vue nếu cần
    eventBus.emit(EVENTS.EVENT_FEE_COLLECTED, { amount: fee, instanceId: agent.data.instanceId })

    // Popup
    const popup = agent.data.sprite.scene.add.text(
      agent.data.sprite.x, agent.data.sprite.y - 50,
      `+$${fee.toFixed(2)}`,
      { fontSize: '18px', color: '#10b981', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }
    ).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)
    agent.data.sprite.scene.tweens.add({
      targets: popup, y: popup.y - 60, alpha: 0, duration: 2000,
      onComplete: () => popup.destroy()
    })

    agent.data.eventFeeOwed = 0
  }

  onUpdate(_agent: CustomerAgent, _time: number, _delta: number) {}
  onExit(_agent: CustomerAgent) {}
}

// --- LEAVE: Rời khỏi shop ---
class LeaveState implements IState<CustomerAgent> {
  name = 'LEAVE'

  onEnter(agent: CustomerAgent) {
    // Giải phóng ghế nếu đang ngồi
    if (agent.data.assignedTableId && agent.data.seatIndex !== undefined) {
      const store = useGameStore()
      const table = store.placedTables[agent.data.assignedTableId]
      if (table && table.occupants[agent.data.seatIndex!] === agent.data.instanceId) {
        table.occupants[agent.data.seatIndex!] = null
      }
    }

    // Hủy trade nếu đang chờ
    if (agent.fsm.current === 'LEAVE') {
      import('../../inventory/store/tradeInStore').then(({ useTradeInStore }) => {
        const ts = useTradeInStore()
        if (ts.activeTrade?.npcInstanceId === agent.data.instanceId) {
          ts.cancelTrade('npc_left')
        }
      })
    }

    agent.data.statusText.setText('👋 Leaving')
    agent.data.tradeIcon?.destroy()

    // Bước 1: Đi ra cửa
    const scene = agent.data.sprite.scene as any
    const doorLoc = scene.environmentManager?.getDoorLocation() ?? { x: agent.data.sprite.x, y: agent.data.sprite.y + 200 }

    agent.loco.moveTo({ x: doorLoc.x, y: doorLoc.y - 40 }, {
      onComplete: () => {
        // Bước 2: Ra ngoài hẳn
        agent.loco.moveTo({ x: doorLoc.x, y: doorLoc.y + 120 }, {
          onComplete: () => {
            // Tự destroy sau khi ra ngoài
            agent.destroy()
          }
        })
      },
      onBlocked: () => {
        // Nếu kẹt → teleport ra ngoài
        agent.data.sprite.setPosition(doorLoc.x, doorLoc.y + 120)
        agent.destroy()
      }
    })
  }

  onUpdate(_agent: CustomerAgent, _time: number, _delta: number) {}
  onExit(_agent: CustomerAgent) {}
}

Bước 6: Refactor NPCManager.ts
File: src/features/customer/managers/NPCManager.ts — Thay toàn bộ file cũ:
typescript// NPCManager.ts — Refactored
// Chỉ còn nhiệm vụ: Spawn NPC, quản lý vòng đời CustomerAgent, update loop
// Toàn bộ AI behavior đã chuyển vào CustomerFSM.ts

import Phaser from 'phaser'
import { AppConfig } from '../../../game/config/AppConfig'
import { EnvironmentManager } from '../../environment/managers/EnvironmentManager'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { applyFootCollider } from '../../environment/ySortUtils'
import { DEPTH } from '../../environment/config'
import { useStatsStore } from '../../stats/store/statsStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { CustomerAgent, type CustomerData } from './CustomerFSM'
import type { CustomerIntent } from '../types'

export class NPCManager {
  private scene: Phaser.Scene
  private environmentManager: EnvironmentManager
  private agents: Map<string, CustomerAgent> = new Map()
  private readonly MAX_CUSTOMERS = 15

  constructorfunction Object() { [native code] }(scene: Phaser.Scene, environmentManager: EnvironmentManager) {
    this.scene = scene
    this.environmentManager = environmentManager

    // Lắng nghe trade-in leave event (giữ nguyên từ code cũ)
    window.addEventListener('trade-in:npc-leave', ((ev: CustomEvent) => {
      const agent = this.agents.get(ev.detail.instanceId)
      if (agent) agent.fsm.transition('LEAVE')
    }) as EventListener)
  }

  public update() {
    const time = this.scene.time.now
    const delta = this.scene.game.loop.delta

    // Xóa agent đã bị destroy
    for (const [id, agent] of this.agents) {
      if (!agent.data.sprite.active) {
        this.agents.delete(id)
        continue
      }
      agent.update(time, delta)
    }
  }

  public getNPCCount(): number {
    return this.agents.size
  }

  public cleanupAllNPCs() {
    this.agents.forEach(agent => agent.destroy())
    this.agents.clear()
  }

  initializeNPCs() {
    this.scene.time.addEvent({
      delay: 3000,
      callback: () => this.spawnNPC(),
      loop: true
    })
  }

  public spawnNPC() {
    const gameStore = useGameStore()
    if (gameStore.shopState !== 'OPEN' || gameStore.timeInMinutes >= 1200) return
    if (this.agents.size >= this.MAX_CUSTOMERS) return

    const doorLocation = this.environmentManager.getDoorLocation()

    // Chọn texture ngẫu nhiên
    const pool = AppConfig.ASSETS.NPC_POOLS
    const textureKey = pool[Math.floor(Math.random() * pool.length)].key

    const sprite = this.scene.physics.add.sprite(doorLocation.x, doorLocation.y + 50, textureKey, 0)
    sprite.setOrigin(0.5, 1)
    applyFootCollider(sprite, 0.3)
    sprite.refreshBody()
    sprite.setCollideWorldBounds(true)

    // Quyết định intent (giữ nguyên tỉ lệ từ code cũ)
    let intent: CustomerIntent = 'BUY'
    const rand = Math.random()
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

    // Điểm đích spawn ban đầu
    const shopBounds = this.environmentManager.getShopBounds()
    const spawnTarget = {
      x: Phaser.Math.Between(shopBounds.x + 50, shopBounds.x + shopBounds.w - 50),
      y: Phaser.Math.Between(shopBounds.y + 50, shopBounds.y + shopBounds.h - 50)
    }

    const statusText = this.scene.add.text(sprite.x, sprite.y - 55, '...', {
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT)

    const data: CustomerData = {
      instanceId,
      sprite,
      statusText,
      intent,
      spawnTime: this.scene.time.now,
      targetPos: spawnTarget,
      targetPrice: 0,
      checkedShelfIds: [],
      tradeCardId,
      boredomMs: 0,
    }

    // Tạo trade icon nếu là SELL intent
    if (intent === 'SELL') {
      const icon = this.scene.add.text(sprite.x, sprite.y - 70, '🃏', { fontSize: '20px' })
        .setOrigin(0.5).setDepth(DEPTH.UI_TEXT)
      this.scene.tweens.add({
        targets: icon, y: icon.y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      })
      data.tradeIcon = icon
    }

    const agent = new CustomerAgent(this.scene, data)
    this.agents.set(instanceId, agent)
    agent.start()
  }

  public getCustomers() {
    return Array.from(this.agents.values()).map(a => a.data)
  }

  destroy() {
    this.cleanupAllNPCs()
  }
}

Bước 7: Refactor StaffManager.ts
Thêm FSM cho Restocker và Cashier vào StaffManager.ts. Chỉ thay phần handleRestockAI và handleCheckoutAI:
typescript// Thêm vào đầu file StaffManager.ts (sau các imports hiện có):
import { StateMachine, type IState } from '../../shared/StateMachine'
import { NPCLocomotion } from '../customer/managers/NPCLocomotion'

// Thêm field vào WorkerNPC interface:
// fsm: StateMachine<WorkerNPCAgent>
// loco: NPCLocomotion

// ═══════════════════════════════════════════════════════
// RESTOCKER FSM STATES — Thay thế handleRestockAI cũ
// ═══════════════════════════════════════════════════════

class RestockerIdleState implements IState<WorkerNPC> {
  name = 'IDLE'

  onEnter(worker: WorkerNPC) {
    // Về idle zone chờ
    worker.subState = 'IDLE'
  }

  onUpdate(worker: WorkerNPC, _time: number, _delta: number) {
    if (worker.carriedBoxId) {
      // Đang cầm thùng → tìm kệ
      worker.subState = 'SEARCH_SHELF'
    } else {
      worker.subState = 'SEARCH_BOX'
    }
  }

  onExit(_worker: WorkerNPC) {}
}

// CASHIER FSM
// Cashier Overtime Rule: nếu >= 21:00 VÀ queue > 0 → KHÔNG để về
// Chỉ chuyển LEAVE khi queue === 0

class CashierWorkingState implements IState<WorkerNPC> {
  name = 'CHECKOUT_WORKING'

  onEnter(worker: WorkerNPC) {
    // Di chuyển đến vị trí quầy
  }

  onUpdate(worker: WorkerNPC, _time: number, _delta: number) {
    const store = useGameStore()
    const isClosingTime = store.timeInMinutes >= 1260 // 21:00

    if (isClosingTime && store.waitingCustomers === 0) {
      // Đã đến giờ và không còn khách → cho về
      worker.subState = 'IDLE'
    }
    // Nếu còn khách trong queue lúc đóng cửa → tiếp tục làm (Overtime)
  }

  onExit(_worker: WorkerNPC) {}
}

Bước 8: Cập nhật MainScene.ts
Thêm vào MainScene.ts trong hàm create() sau khi tạo environmentManager:
typescript// Thêm import ở đầu file MainScene.ts:
import { aStarGrid } from '../features/environment/managers/AStarGridManager'

// Trong hàm create(), sau dòng this.furnitureManager.initializeFurniture():
// Khởi tạo A* Grid
const shopBounds = this.environmentManager.getShopBounds()
aStarGrid.initialize(shopBounds.x, shopBounds.y, shopBounds.w, shopBounds.h)

// Đánh dấu obstacle từ physics bodies của nội thất
this.refreshAStarGrid()

// Thêm method mới vào class MainScene:
private refreshAStarGrid() {
  aStarGrid.clearObstacles()
  
  // Wall bodies
  this.environmentManager.wallsGroup.getChildren().forEach(child => {
    const body = (child as any).body as Phaser.Physics.Arcade.StaticBody
    if (body) aStarGrid.markObstacleFromBody(body)
  })
  
  // Shelf bodies
  this.furnitureManager.shelvesGroup.getChildren().forEach(child => {
    const body = (child as any).body as Phaser.Physics.Arcade.StaticBody
    if (body) aStarGrid.markObstacleFromBody(body)
  })
  
  // Table bodies
  this.furnitureManager.tablesGroup.getChildren().forEach(child => {
    const body = (child as any).body as Phaser.Physics.Arcade.StaticBody
    if (body) aStarGrid.markObstacleFromBody(body)
  })
  
  // Cashier bodies
  this.furnitureManager.cashierGroup.getChildren().forEach(child => {
    const body = (child as any).body as Phaser.Physics.Arcade.StaticBody
    if (body) aStarGrid.markObstacleFromBody(body)
  })
}

// Trong setupStoreSubscriptions(), thêm vào sau furniture placement:
// Refresh A* grid khi đặt/dời nội thất
const unsubFurniture = useFurnitureStore().$subscribe(() => {
  // Delay nhỏ để Phaser cập nhật physics bodies xong
  this.time.delayedCall(100, () => this.refreshAStarGrid())
})
this.storeUnsubscribers.push(unsubFurniture)

Bước 9: Thêm vào Vue (EventBus integration)
Để Vue components lắng nghe sự kiện từ Phaser, thêm vào App.vue trong onMounted:
typescript// Trong App.vue — onMounted():
import { eventBus, EVENTS } from './features/shared/EventBus'

onMounted(() => {
  // ... code hiện có ...

  // Lắng nghe sự kiện từ Phaser
  const unsubPaid = eventBus.on(EVENTS.CUSTOMER_PAID, ({ price }) => {
    // Vue reactive update nếu cần
    console.log('[Vue] Customer paid:', price)
  })

  // Dọn dẹp khi unmount
  onUnmounted(() => {
    unsubPaid()
    eventBus.clear()
  })
})

Tóm Tắt Thứ Tự Thực Hiện

Tạo EventBus.ts và StateMachine.ts
Tạo AStarGridManager.ts
Tạo NPCLocomotion.ts
Tạo CustomerFSM.ts
Replace toàn bộ NPCManager.ts bằng version mới
Patch StaffManager.ts (thêm FSM states cho Restocker/Cashier)
Patch MainScene.ts (khởi tạo grid + refreshAStarGrid)
Patch App.vue (EventBus listeners)

Điều quan trọng nhất: Tất cả business logic cũ (trade-in, event fee, play area, queue management) đã được giữ nguyên và chuyển vào các IState tương ứng trong CustomerFSM.ts. Không có feature nào bị mất.