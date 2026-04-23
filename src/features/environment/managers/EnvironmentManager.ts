import MainScene from '../../../game/MainScene'
import { DEPTH } from '../config'
import { TEX } from '../assetKeys'
import { BASE_SHOP_WIDTH, BASE_SHOP_HEIGHT, getExpansionDimensions } from '../../stats/config'
import { useGameStore } from '../../shop-ui/store/gameStore'

/**
 * EnvironmentManager — Quản lý toàn bộ môi trường Shop trong Phaser 3.
 *
 * KIẾN TRÚC 2.5D TOP-DOWN OBLIQUE:
 * ┌──────────────────────────────────────┐  depth 9000  (LAYER4_WALL_TOP)
 * │           WALL TOP CAP               │  ← Đỉnh tường, luôn đè entity
 * ├──────────────────────────────────────┤  depth 100+y (LAYER3_OBJECTS)
 * │           WALL FRONT                 │  ← Mặt trước, Y-sorted
 * ├──────────────────────────────────────┤  depth 11    (LAYER1_FLOOR+1)
 * │               FLOOR                  │  ← Sàn gạch tile
 * └──────────────────────────────────────┘  depth 10
 */
export class EnvironmentManager {
  private scene: MainScene

  // Graphics / TileSprites
  private floorTileSprite!: Phaser.GameObjects.TileSprite
  private sidewalkTileSprite!: Phaser.GameObjects.TileSprite
  private outsideGraphics!: Phaser.GameObjects.Graphics
  private sidewalkGraphics!: Phaser.GameObjects.Graphics

  // Wall system — SPLIT into Front and Top
  /** Wall-Front tiles: Y-sorted, entity can walk behind them */
  private wallFrontSprites: Phaser.GameObjects.TileSprite[] = []
  /** Wall-Top cap tiles: always depth 9000, covers entity head */
  private wallTopCapSprite!: Phaser.GameObjects.TileSprite

  // Physics
  private wallTop!: Phaser.GameObjects.Rectangle
  private wallLeft!: Phaser.GameObjects.Rectangle
  private wallRight!: Phaser.GameObjects.Rectangle
  private wallBottomLeft!: Phaser.GameObjects.Rectangle
  private wallBottomRight!: Phaser.GameObjects.Rectangle

  private doorLocation = { x: 0, y: 0 }
  private shopBounds = { x: 0, y: 0, w: 0, h: 0 }

  // Exterior zones
  public deliveryZone!: { x: number; y: number; width: number; height: number }
  public warpGateZone!: { x: number; y: number }
  public idleStaffZone!: { x: number; y: number; width: number }

  public wallsGroup!: Phaser.Physics.Arcade.StaticGroup

  public static readonly START_X = 1000
  public static readonly START_Y = 1000

  // Visual constants for 2.5D look
  private static readonly DOOR_WIDTH        = 80

  constructor(scene: MainScene) {
    this.scene = scene
    this.wallsGroup = this.scene.physics.add.staticGroup()
    this.outsideGraphics = this.scene.add.graphics().setDepth(DEPTH.OUTSIDE)
    this.sidewalkGraphics = this.scene.add.graphics().setDepth(DEPTH.FLOOR + 0.5)
    this._createPhysicsWalls()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────

  initializeEnvironment() {
    this.refreshEnvironment()
  }

  refreshEnvironment() {
    if (!this.scene?.cameras?.main) return

    try {
      const store = useGameStore()
      const { extraW, extraH } = getExpansionDimensions(store.expansionLevel)
      const shopW = BASE_SHOP_WIDTH + extraW
      const shopH = BASE_SHOP_HEIGHT + extraH
      const sx    = EnvironmentManager.START_X
      const sy    = EnvironmentManager.START_Y

      this.shopBounds   = { x: sx, y: sy, w: shopW, h: shopH }
      this.doorLocation = { x: sx + shopW / 2, y: sy + shopH }

      this._drawOutside(sx, sy, shopW, shopH)
      this._drawFloor(sx, sy, shopW, shopH)
      this._drawWalls(sx, sy, shopW, shopH)
      this._drawSidewalk()
      this._updatePhysicsWalls()
      this._computeExteriorZones()
      this._drawExpansionPreview(store, sx, sy)

      // Refresh delivery zone visual in DeliveryManager
      if ((this.scene as any).deliveryManager) {
        (this.scene as any).deliveryManager.refreshDeliveryZone()
      }
    } catch (err) {
      console.error('[EnvironmentManager] refreshEnvironment failed:', err)
    }
  }

  getShopBounds()    { return this.shopBounds    }
  getDoorLocation()  { return this.doorLocation  }

  destroy() {
    this.outsideGraphics?.destroy()
    this.sidewalkGraphics?.destroy()
    this.floorTileSprite?.destroy()
    this.sidewalkTileSprite?.destroy()
    this.wallTopCapSprite?.destroy()
    this.wallFrontSprites.forEach(s => s.destroy())
    this.wallFrontSprites = []
    ;[this.wallTop, this.wallLeft, this.wallRight,
      this.wallBottomLeft, this.wallBottomRight].forEach(r => r?.destroy())
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE — DRAWING
  // ─────────────────────────────────────────────────────────────────────────────

  private _drawOutside(sx: number, sy: number, shopW: number, shopH: number) {
    this.outsideGraphics.clear()
    // Dark asphalt base
    this.outsideGraphics.fillStyle(0x1a1a1a, 1)
    this.outsideGraphics.fillRect(0, 0, 5500, 3000)
    // Subtle grass fringe around the shop lot
    this.outsideGraphics.fillStyle(0x2d6a2d, 1)
    this.outsideGraphics.fillRect(sx - 200, sy - 200, shopW + 400, shopH + 400)
  }

  private _drawFloor(sx: number, sy: number, shopW: number, shopH: number) {
    if (!this.floorTileSprite) {
      this.floorTileSprite = this.scene.add
        .tileSprite(sx, sy, shopW, shopH, TEX.FLOOR_TILE)
        .setOrigin(0, 0)
        .setDepth(DEPTH.LAYER1_FLOOR)
    } else {
      this.floorTileSprite
        .setPosition(sx, sy)
        .setSize(shopW, shopH)
    }
  }

  /**
   * Rebuilds the 2.5D wall system.
   *
   * NORTH WALL (top of shop):
   *   ┌────────────────────────────────────────┐  sy - WALL_TOP_HEIGHT
   *   │         WALL TOP CAP (depth 9000)      │  ← always on top of entities
   *   ├────────────────────────────────────────┤  sy
   *   │   WALL FRONT tiles (Y-sorted at sy)    │  ← solid face, depth = 100+sy
   *   └────────────────────────────────────────┘  sy + WALL_FRONT_HEIGHT
   *
   * The physics body covers sy - WALL_FRONT_HEIGHT → sy, so the player is
   * stopped BEFORE they visually overlap the front face.
   */
  private _drawWalls(sx: number, sy: number, shopW: number, shopH: number) {
    // Destroy old sprites
    this.wallFrontSprites.forEach(s => s.destroy())
    this.wallFrontSprites = []
    this.wallTopCapSprite?.destroy()

    const FH  = 48
    const TH  = 32
    const BT  = 16 
    const DW  = 80
    
    // ── NORTH WALL (TOP)
    // Front face: Blocks at sy
    const northFront = this.scene.add
      .tileSprite(sx, sy - FH, shopW, FH, TEX.WALL_SIDE)
      .setOrigin(0, 0)
      .setDepth(DEPTH.LAYER3_OBJECTS + sy) 
    this.wallFrontSprites.push(northFront)

    // Top cap: Fixed at 9000 to cover heads in the backroom/top area
    this.wallTopCapSprite = this.scene.add
      .tileSprite(sx - BT, sy - FH - TH, shopW + BT * 2, TH, TEX.WALL_TOP)
      .setOrigin(0, 0)
      .setDepth(DEPTH.LAYER4_WALL_TOP)

    // ── EAST & WEST WALLS (SIDE BOUNDARIES)
    // We use a thinner 16px strip and shift the tile to show only the cap part
    const westBoundary = this.scene.add
      .tileSprite(sx - BT, sy - FH, BT, shopH + FH, TEX.WALL_TOP)
      .setOrigin(0, 0)
      .setTilePosition(0, 0)
      .setDepth(DEPTH.LAYER3_OBJECTS + sy) // Y-sorted with base for exterior context
    this.wallFrontSprites.push(westBoundary)

    const eastBoundary = this.scene.add
      .tileSprite(sx + shopW, sy - FH, BT, shopH + FH, TEX.WALL_TOP)
      .setOrigin(0, 0)
      .setTilePosition(0, 0)
      .setDepth(DEPTH.LAYER3_OBJECTS + sy)
    this.wallFrontSprites.push(eastBoundary)

    // ── SOUTH WALL (BOTTOM BOUNDARY)
    const southY = sy + shopH
    const sideW = (shopW - DW) / 2

    const bottomBoundaryL = this.scene.add
      .tileSprite(sx, southY, sideW, BT, TEX.WALL_TOP)
      .setOrigin(0, 0)
      .setTilePosition(0, 0)
      .setDepth(DEPTH.LAYER3_OBJECTS + southY)
    this.wallFrontSprites.push(bottomBoundaryL)

    const bottomBoundaryR = this.scene.add
      .tileSprite(sx + sideW + DW, southY, sideW, BT, TEX.WALL_TOP)
      .setOrigin(0, 0)
      .setTilePosition(0, 0)
      .setDepth(DEPTH.LAYER3_OBJECTS + southY)
    this.wallFrontSprites.push(bottomBoundaryR)

    // ── DARK DOOR OPENING
    this.scene.add
      .rectangle(sx + shopW / 2, southY + BT / 2, DW, BT, 0x111111)
      .setDepth(DEPTH.LAYER3_OBJECTS + southY - 2)
  }

  // Remove the vertical wall front method as we no longer use pillar columns

  private _drawSidewalk() {
    const door     = this.doorLocation
    const shopW    = this.shopBounds.w
    const sidewalkY = door.y + 40
    const sidewalkH = 90
    const sidewalkX = this.shopBounds.x - 100
    const sidewalkW = shopW + 200

    if (!this.sidewalkTileSprite) {
      this.sidewalkTileSprite = this.scene.add
        .tileSprite(sidewalkX, sidewalkY, sidewalkW, sidewalkH, TEX.SIDEWALK_TILE)
        .setOrigin(0, 0)
        .setDepth(DEPTH.FLOOR + 0.1)
    } else {
      this.sidewalkTileSprite.setPosition(sidewalkX, sidewalkY).setSize(sidewalkW, sidewalkH)
    }

    this.sidewalkGraphics.clear()

    // Lane divider
    this.sidewalkGraphics.lineStyle(2, 0xffffff, 0.15)
    this.sidewalkGraphics.lineBetween(sidewalkX, sidewalkY + sidewalkH / 2, sidewalkX + sidewalkW, sidewalkY + sidewalkH / 2)

    // Staff rest zone indicator
    const iz = this.idleStaffZone
    if (iz) {
      this.sidewalkGraphics.fillStyle(0x27ae60, 0.3)
      this.sidewalkGraphics.fillRect(iz.x - iz.width / 2, iz.y - 20, iz.width, 40)
    }
  }

  private _drawExpansionPreview(store: any, sx: number, sy: number) {
    if (!this.scene.previewGraphics) return
    this.scene.previewGraphics.clear()
    if (!store.settings.showExpansionPreview) return

    const nextDim = getExpansionDimensions(store.expansionLevel + 1)
    const nextW   = BASE_SHOP_WIDTH  + nextDim.extraW
    const nextH   = BASE_SHOP_HEIGHT + nextDim.extraH

    if (store.settings.expansionPreviewStyle === 'BLUEPRINT') {
      this._drawDashedRect(sx, sy, nextW, nextH, 0x00ffff)
    } else {
      for (let i = 1; i <= 3; i++) {
        this.scene.previewGraphics.lineStyle(2 * i, 0xffffff, 0.08)
        this.scene.previewGraphics.strokeRect(sx - i, sy - i, nextW + i * 2, nextH + i * 2)
      }
      this.scene.previewGraphics.lineStyle(2, 0xffffff, 0.75)
      this.scene.previewGraphics.strokeRect(sx, sy, nextW, nextH)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE — PHYSICS
  // ─────────────────────────────────────────────────────────────────────────────

  private _createPhysicsWalls() {
    const DW  = EnvironmentManager.DOOR_WIDTH
    const sx  = EnvironmentManager.START_X
    const sy  = EnvironmentManager.START_Y
    const store = useGameStore()
    const { extraW, extraH } = getExpansionDimensions(store.expansionLevel)
    const shopW = BASE_SHOP_WIDTH + extraW
    const shopH = BASE_SHOP_HEIGHT + extraH
    const sideW = (shopW - DW) / 2

    // Note: Colliders are now centered on the boundaries with 16px thickness
    // to act as solid physical boundaries.
    this.wallTop = this.scene.add.rectangle(
      sx + shopW / 2, sy - 8,
      shopW, 16, 0x8B4513
    ).setDepth(DEPTH.WALL)

    this.wallLeft = this.scene.add.rectangle(
      sx - 8, sy + shopH / 2,
      16, shopH, 0x8B4513
    ).setDepth(DEPTH.WALL)

    this.wallRight = this.scene.add.rectangle(
      sx + shopW + 8, sy + shopH / 2,
      16, shopH, 0x8B4513
    ).setDepth(DEPTH.WALL)

    this.wallBottomLeft = this.scene.add.rectangle(
      sx + sideW / 2, sy + shopH + 8,
      sideW, 16, 0x8B4513
    ).setDepth(DEPTH.WALL)

    this.wallBottomRight = this.scene.add.rectangle(
      sx + shopW - sideW / 2, sy + shopH + 8,
      sideW, 16, 0x8B4513
    ).setDepth(DEPTH.WALL)

    const walls = [
      this.wallTop, this.wallLeft, this.wallRight,
      this.wallBottomLeft, this.wallBottomRight
    ]
    walls.forEach(w => {
      this.scene.physics.add.existing(w, true)
      this.wallsGroup.add(w)
      w.setVisible(false)
    })

    this._computeExteriorZones()
  }

  private _updatePhysicsWalls() {
    const { x, y, w, h } = this.shopBounds
    const DW   = EnvironmentManager.DOOR_WIDTH
    const sideW = (w - DW) / 2

    const reposition = (
      rect: Phaser.GameObjects.Rectangle,
      rx: number, ry: number, rw: number, rh: number
    ) => {
      rect.setPosition(rx, ry).setSize(rw, rh)
      const body = rect.body as Phaser.Physics.Arcade.StaticBody
      if (body) body.updateFromGameObject()
      else this.scene.physics.add.existing(rect, true)
    }

    reposition(this.wallTop,         x + w / 2,              y - 8,                 w,     16)
    reposition(this.wallLeft,        x - 8,                  y + h / 2,             16,    h)
    reposition(this.wallRight,       x + w + 8,              y + h / 2,             16,    h)
    reposition(this.wallBottomLeft,  x + sideW / 2,          y + h + 8,             sideW, 16)
    reposition(this.wallBottomRight, x + w - sideW / 2,      y + h + 8,             sideW, 16)
  }

  private _computeExteriorZones() {
    const door = this.doorLocation
    this.deliveryZone = { x: door.x - 350, y: door.y + 100, width: 200, height: 50 }
    this.warpGateZone = { x: door.x + 350, y: door.y + 100 }
    this.idleStaffZone = { x: door.x, y: door.y + 180, width: 120 }
  }

  private _drawDashedRect(x: number, y: number, w: number, h: number, color: number) {
    const g = this.scene.previewGraphics
    const dash = 10, gap = 5
    g.lineStyle(3, color, 1.0)

    let cx = x
    while (cx < x + w) { const nx = Math.min(cx + dash, x + w); g.lineBetween(cx, y, nx, y); cx = nx + gap }
    let cy = y
    while (cy < y + h) { const ny = Math.min(cy + dash, y + h); g.lineBetween(x + w, cy, x + w, ny); cy = ny + gap }
    cx = x + w
    while (cx > x) { const nx = Math.max(cx - dash, x); g.lineBetween(cx, y + h, nx, y + h); cx = nx - gap }
    cy = y + h
    while (cy > y) { const ny = Math.max(cy - dash, y); g.lineBetween(x, cy, x, ny); cy = ny - gap }
  }
}