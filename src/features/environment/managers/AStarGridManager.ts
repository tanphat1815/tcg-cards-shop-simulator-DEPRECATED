// AStarGridManager.ts
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
  private shopBounds = { x: 0, y: 0, w: 0, h: 0 }

  setShopBounds(x: number, y: number, w: number, h: number) {
    this.shopBounds = { x, y, w, h }
  }

  isInside(wx: number, wy: number): boolean {
    return wx >= this.shopBounds.x && 
           wx <= this.shopBounds.x + this.shopBounds.w && 
           wy >= this.shopBounds.y && 
           wy <= this.shopBounds.y + this.shopBounds.h
  }

  /**
   * Khởi tạo grid từ kích thước shop.
   * CRITICAL: origin phải khớp chính xác với shopBounds.x/y - margin
   */
  initialize(shopX: number, shopY: number, shopW: number, shopH: number) {
    // Thêm margin rộng để cover cả vùng bên ngoài (Gồm cả bãi xe phía trên và vỉa hè phía dưới)
    const hMargin = 1000
    const vMarginLower = 512 
    const vMarginUpper = 256  // Tăng lên để cover toàn bộ North Wall và khoảng trống phía trên

    this.originX = shopX - hMargin
    this.originY = shopY - vMarginUpper
    
    // Safety check: ensure positive dimensions
    this.cols = Math.max(1, Math.ceil((shopW + hMargin * 2) / GRID_TILE))
    this.rows = Math.max(1, Math.ceil((shopH + vMarginUpper + vMarginLower) / GRID_TILE))

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
   * Đánh dấu vật cản theo tọa độ world
   */
  markObstacle(wx: number, wy: number, ww: number, wh: number) {
    // Safety check: prevent NaN or undefined crashes
    if (isNaN(wx) || isNaN(wy) || isNaN(ww) || isNaN(wh)) return

    const c0 = Math.max(0, Math.floor((wx - this.originX) / GRID_TILE))
    const r0 = Math.max(0, Math.floor((wy - this.originY) / GRID_TILE))
    const c1 = Math.min(this.cols, Math.ceil((wx + ww - this.originX) / GRID_TILE))
    const r1 = Math.min(this.rows, Math.ceil((wy + wh - this.originY) / GRID_TILE))

    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        if (this.inBounds(c, r)) {
          this.grid[r][c].walkable = false
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
    this.markObstacle(body.x, body.y, body.width, body.height)
  }

  isWalkable(wx: number, wy: number): boolean {
    const c = Math.floor((wx - this.originX) / GRID_TILE)
    const r = Math.floor((wy - this.originY) / GRID_TILE)
    if (!this.inBounds(c, r)) return false
    return this.grid[r][c].walkable
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
    let startC = Math.floor((fromWorld.x - this.originX) / GRID_TILE)
    let startR = Math.floor((fromWorld.y - this.originY) / GRID_TILE)
    let goalC  = Math.floor((toWorld.x  - this.originX) / GRID_TILE)
    let goalR  = Math.floor((toWorld.y  - this.originY) / GRID_TILE)

    if (!this.inBounds(startC, startR) || !this.inBounds(goalC, goalR)) {
      console.warn(`[AStar] Out of bounds: Start(${startC},${startR}) Goal(${goalC},${goalR})`)
      return null
    }

    // --- START POINT CORRECTION ---
    // 🆕 ZONE AWARE SNAP: Nếu điểm xuất phát kẹt, tìm ô gần nhất TRONG CÙNG VÙNG (Trong/Ngoài Shop)
    if (!this.grid[startR][startC].walkable) {
      const isStartInside = this.isInside(fromWorld.x, fromWorld.y)
      const alt = this.findNearestWalkable(startC, startR, isStartInside ? 'inside' : 'outside')
      if (alt) {
        startC = alt.x; startR = alt.y
      }
    }

    // --- GOAL POINT CORRECTION ---
    if (!this.grid[goalR][goalC].walkable) {
      const isGoalInside = this.isInside(toWorld.x, toWorld.y)
      const alt = this.findNearestWalkable(goalC, goalR, isGoalInside ? 'inside' : 'outside')
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
      if (closed.has(key)) continue
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
  private findNearestWalkable(c: number, r: number, zone?: 'inside' | 'outside'): { x: number, y: number } | null {
    const queue = [{ x: c, y: r }]
    const visited = new Set<string>([`${c},${r}`])
    while (queue.length > 0) {
      const cur = queue.shift()!
      const node = this.grid[cur.y]?.[cur.x]
      
      if (node?.walkable) {
        if (zone) {
          const world = this.gridToWorld(cur.x, cur.y)
          const nodeInside = this.isInside(world.x, world.y)
          if ((zone === 'inside' && nodeInside) || (zone === 'outside' && !nodeInside)) {
            return cur
          }
        } else {
          return cur
        }
      }

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
