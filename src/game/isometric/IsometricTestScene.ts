/**
 * IsometricTestScene.ts — Standalone scene for testing isometric tilemap rendering.
 *
 * PURPOSE: Verify Phaser's isometric tilemap renderer before committing to the full conversion.
 * Drop this scene into GameContainer.vue's scene array alongside MainScene to test.
 *
 * WHAT IT TESTS:
 * 1. Tiled JSON tilemap loads correctly with isometric orientation
 * 2. Isometric tile size 64x32 (2:1 ratio) renders correctly
 * 3. Depth sorting — player can walk behind and in front of multi-tile objects
 * 4. Optional: Matter.js collision bodies (diamond/convex hull) don't create dead corners
 *
 * USAGE:
 * 1. Add this scene to GameContainer.vue:
 *    scene: [MainScene, TownScene, IsometricTestScene]
 * 2. Set AppConfig.ISOMETRIC.ENABLED = true
 * 3. Create a Tiled map with:
 *    - Map orientation: "isometric"
 *    - Tile size: 64 wide x 32 tall
 *    - Tileset image in assets/
 * 4. Export Tiled as JSON and load it via this.load.tilemapTiledJSON()
 * 5. This scene auto-generates a fallback grid if no Tiled map is provided
 *
 * DELETE THIS FILE after the isometric conversion is complete and verified.
 */

import Phaser from 'phaser'
import {
  ISO_TILE_HEIGHT,
  ISO_TILE_HALF_W,
  ISO_TILE_HALF_H,
  worldToScreen,
  computeIsoDepth,
  ISO_DEPTH_BASE,
} from '../../features/environment/utils/IsometricUtils'

export default class IsometricTestScene extends Phaser.Scene {
  // ── Test Entities ────────────────────────────────────────────────────────────
  private player!: Phaser.GameObjects.Container
  private playerGraphics!: Phaser.GameObjects.Graphics
  private obstacles: Phaser.GameObjects.Graphics[] = []

  // ── Isometric Camera Center ─────────────────────────────────────────────────
  /** The screen position corresponding to world origin (0, 0). */
  private isoCenterX = 0
  private isoCenterY = 0

  // ── Grid position tracking (stored as object properties) ────────────────────
  private playerGridX = 5
  private playerGridY = 5

  // ── Input ───────────────────────────────────────────────────────────────────
  private cursors!: {
    up:    Phaser.Input.Keyboard.Key
    down:  Phaser.Input.Keyboard.Key
    left:  Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  }

  constructor() {
    super({ key: 'IsometricTestScene' })
  }

  // ─── CREATE ────────────────────────────────────────────────────────────────

  create(): void {
    // Center the isometric origin on screen
    this.isoCenterX = this.cameras.main.width / 2
    this.isoCenterY = this.cameras.main.height / 2

    // Draw isometric floor grid
    this.drawIsoGrid()

    // Draw isometric obstacles (buildings, pillars)
    this.createObstacles()

    // Spawn player
    this.spawnPlayer()

    // Configure camera
    this.cameras.main.startFollow(this.player, true)
    this.cameras.main.setZoom(1.5)
    this.cameras.main.setBounds(-2000, -2000, 4000, 4000)

    // Setup keyboard input
    const keys = this.input.keyboard
    if (keys) {
      this.cursors = keys.createCursorKeys()
    }

    // Draw info text
    this.add.text(10, 10, [
      'ISOMETRIC TEST SCENE',
      '─────────────────────────────────',
      'Arrow keys to move',
      'Player depth = worldX + worldY',
      'Obstacles block movement',
    ].join('\n'), {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000aa',
      lineSpacing: 4,
    }).setScrollFactor(0).setDepth(9999)

    // ── Optional: Load Tiled map ──────────────────────────────────────────
    // Uncomment to test with a real Tiled JSON file:
    //
    // this.load.image('iso_tiles', 'assets/tilesets/iso_tileset.png')
    // this.load.tilemapTiledJSON('iso_map', 'assets/maps/iso_test.json')
    //
    // this.load.once('complete', () => {
    //   const map = this.make.tilemap({ key: 'iso_map' })
    //   const tileset = map.addTilesetImage('iso_tileset', 'iso_tiles')
    //   const layer = map.createLayer('Ground', tileset, 0, 0)
    //   // Phaser 3.50+ handles isometric tile depth sorting automatically
    //   // when the map orientation is set to 'isometric' in Tiled.
    // })
    // this.load.start()
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  update(): void {
    this.handlePlayerMovement()
    this.updateDepthSorting()
  }

  // ─── ISOMETRIC GRID ────────────────────────────────────────────────────────

  /**
   * Draws an isometric grid to visualize the 2:1 tile layout.
   * Each cell is 64x32 pixels (2:1 isometric ratio).
   */
  private drawIsoGrid(): void {
    const g = this.add.graphics()
    g.setDepth(1)

    const GRID_SIZE = 10   // Draw a 10x10 grid
    const HW = ISO_TILE_HALF_W
    const HH = ISO_TILE_HALF_H

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const { x, y } = worldToScreen(col, row, this.isoCenterX, this.isoCenterY)

        // Alternating tile colors
        const isEven = (col + row) % 2 === 0
        g.fillStyle(isEven ? 0x3a3a5a : 0x2a2a4a, 0.4)

        // Draw isometric diamond using 4 triangles (avoids fillPolygon method)
        // Top triangle
        g.fillStyle(isEven ? 0x3a3a5a : 0x2a2a4a, 0.4)
        g.fillTriangle(x, y - HH, x + HW, y, x - HW, y)
        // Bottom triangle
        g.fillTriangle(x, y + HH, x + HW, y, x - HW, y)

        g.lineStyle(1, 0x6666aa, 0.3)
        g.strokeTriangle(x, y - HH, x + HW, y, x - HW, y)
      }
    }
  }

  // ─── OBSTACLES ─────────────────────────────────────────────────────────────

  /**
   * Creates test obstacles (buildings/pillars) at various grid positions.
   * These test multi-tile depth sorting — player should appear in front
   * or behind based on their grid position relative to the obstacle.
   */
  private createObstacles(): void {
    const obstacleDefs = [
      { col: 2, row: 1, tileW: 2, tileH: 2, color: 0x8B4513, label: '2x2 Building' },
      { col: 7, row: 2, tileW: 1, tileH: 3, color: 0x5555aa, label: '1x3 Pillar' },
      { col: 1, row: 6, tileW: 3, tileH: 1, color: 0xaa5555, label: '3x1 Counter' },
      { col: 6, row: 7, tileW: 1, tileH: 1, color: 0x55aa55, label: '1x1 Box' },
    ]

    for (const def of obstacleDefs) {
      this.createIsoObstacle(def.col, def.row, def.tileW, def.tileH, def.color, def.label)
    }
  }

  private createIsoObstacle(
    col: number,
    row: number,
    tileW: number,
    tileH: number,
    color: number,
    label: string
  ): void {
    // Draw as a stack of isometric box tiles
    const heightTiles = 2  // Visual height (Z axis)

    for (let h = 0; h < heightTiles; h++) {
      const { x, y } = worldToScreen(col + tileW / 2, row + tileH / 2, this.isoCenterX, this.isoCenterY)
      const yOffset = -h * ISO_TILE_HEIGHT * 0.8
      const topY = y + yOffset - ISO_TILE_HALF_H

      const obs = this.add.graphics()
      const alpha = h === 0 ? 0.9 : 0.6

      // Left face (darker)
      obs.fillStyle(Phaser.Display.Color.IntegerToColor(color).darken(30).color, alpha)
      obs.fillTriangle(
        x - tileW * ISO_TILE_HALF_W, topY + ISO_TILE_HALF_H,
        x,                            topY + ISO_TILE_HALF_H + tileH * ISO_TILE_HALF_H,
        x,                            topY + ISO_TILE_HALF_H + tileH * ISO_TILE_HALF_H - ISO_TILE_HEIGHT
      )
      obs.fillTriangle(
        x - tileW * ISO_TILE_HALF_W, topY + ISO_TILE_HALF_H,
        x,                            topY + ISO_TILE_HALF_H + tileH * ISO_TILE_HALF_H - ISO_TILE_HEIGHT,
        x - tileW * ISO_TILE_HALF_W, topY + ISO_TILE_HALF_H - ISO_TILE_HEIGHT
      )

      // Right face (lighter)
      obs.fillStyle(Phaser.Display.Color.IntegerToColor(color).lighten(10).color, alpha)
      obs.fillTriangle(
        x,                            topY + ISO_TILE_HALF_H + tileH * ISO_TILE_HALF_H,
        x + tileW * ISO_TILE_HALF_W, topY + ISO_TILE_HALF_H + tileH * ISO_TILE_HALF_H,
        x + tileW * ISO_TILE_HALF_W, topY + ISO_TILE_HALF_H + tileH * ISO_TILE_HALF_H - ISO_TILE_HEIGHT
      )
      obs.fillTriangle(
        x,                            topY + ISO_TILE_HALF_H + tileH * ISO_TILE_HALF_H,
        x + tileW * ISO_TILE_HALF_W, topY + ISO_TILE_HALF_H + tileH * ISO_TILE_HALF_H - ISO_TILE_HEIGHT,
        x,                            topY + ISO_TILE_HALF_H + tileH * ISO_TILE_HALF_H - ISO_TILE_HEIGHT
      )

      // Top face (brightest)
      obs.fillStyle(color, alpha)
      obs.fillTriangle(
        x - tileW * ISO_TILE_HALF_W, topY + ISO_TILE_HALF_H - ISO_TILE_HEIGHT,
        x,                            topY + ISO_TILE_HALF_H - ISO_TILE_HEIGHT,
        x,                            topY + ISO_TILE_HALF_H - ISO_TILE_HEIGHT + tileH * ISO_TILE_HALF_H
      )
      obs.fillTriangle(
        x - tileW * ISO_TILE_HALF_W, topY + ISO_TILE_HALF_H - ISO_TILE_HEIGHT,
        x,                            topY + ISO_TILE_HALF_H - ISO_TILE_HEIGHT + tileH * ISO_TILE_HALF_H,
        x + tileW * ISO_TILE_HALF_W, topY + ISO_TILE_HALF_H - ISO_TILE_HEIGHT + tileH * ISO_TILE_HALF_H
      )

      // Compute depth based on the obstacle's grid corner (bottom-most, right-most tile)
      const depthX = col + tileW
      const depthY = row + tileH
      const depthZ = h
      obs.setDepth(computeIsoDepth(depthX, depthY, depthZ, ISO_DEPTH_BASE))

      this.obstacles.push(obs)
    }

    // Label
    const { x, y } = worldToScreen(col + tileW / 2, row + tileH / 2, this.isoCenterX, this.isoCenterY)
    this.add.text(x, y - ISO_TILE_HEIGHT * 3, label, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ffffff',
      backgroundColor: '#00000088',
    }).setOrigin(0.5, 1).setDepth(computeIsoDepth(col, row, heightTiles, ISO_DEPTH_BASE) + 1)
  }

  // ─── PLAYER ────────────────────────────────────────────────────────────────

  private spawnPlayer(): void {
    const startCol = 5
    const startRow = 5
    const { x, y } = worldToScreen(startCol, startRow, this.isoCenterX, this.isoCenterY)

    this.playerGridX = startCol
    this.playerGridY = startRow

    // Draw a simple player as an isometric "pawn" using Graphics
    this.playerGraphics = this.add.graphics()
    this.drawIsoPawn(this.playerGraphics, 0, 0, 0x00ff00)

    this.player = this.add.container(x, y, [this.playerGraphics])
    this.player.setDepth(computeIsoDepth(startCol, startRow, 0, ISO_DEPTH_BASE))
  }

  /** Draws a simple isometric pawn/chess piece for the player. */
  private drawIsoPawn(g: Phaser.GameObjects.Graphics, offX: number, offY: number, color: number): void {
    const baseW  = ISO_TILE_HALF_W * 0.6
    const baseH  = ISO_TILE_HEIGHT * 0.3
    const bodyH  = ISO_TILE_HEIGHT * 0.8
    const headR  = baseW * 0.4

    g.clear()

    // Base ellipse
    g.fillStyle(Phaser.Display.Color.IntegerToColor(color).darken(20).color)
    g.fillEllipse(offX, offY, baseW * 2, baseH * 2)

    // Body ellipse
    g.fillStyle(color)
    g.fillEllipse(offX, offY - bodyH * 0.5, baseW * 1.2, bodyH * 0.8)

    // Head circle
    g.fillStyle(Phaser.Display.Color.IntegerToColor(color).lighten(20).color)
    g.fillCircle(offX, offY - bodyH - headR, headR)
  }

  // ─── MOVEMENT ─────────────────────────────────────────────────────────────

  /**
   * Handles WASD/Arrow key movement in isometric coordinates.
   *
   * In isometric view:
   *   Arrow UP    → move toward top-right (screen: ↑ = decreasing screenY, increasing screenX)
   *                 In world: col↑, row↓  (X+, Y-)
   *   Arrow DOWN  → move toward bottom-left (screen: ↓ = increasing screenY, decreasing screenX)
   *                 In world: col↓, row↑   (X-, Y+)
   *   Arrow LEFT  → move toward top-left
   *                 In world: col↓, row↓   (X-, Y-)
   *   Arrow RIGHT → move toward bottom-right
   *                 In world: col↑, row↑    (X+, Y+)
   *
   * We use grid-cell movement for discrete, tile-snapped movement.
   * Speed along the Y screen axis is scaled by ISO_MOVE_Y_SCALE (0.5).
   */
  private handlePlayerMovement(): void {
    if (!this.cursors) return

    let vx = 0
    let vy = 0

    if (this.cursors.up.isDown)    { vx +=  1; vy -=  1 }
    if (this.cursors.down.isDown)  { vx += -1; vy +=  1 }
    if (this.cursors.left.isDown)  { vx += -1; vy += -1 }
    if (this.cursors.right.isDown) { vx +=  1; vy +=  1 }

    if (vx === 0 && vy === 0) return

    // Normalize diagonal movement
    const len = Math.sqrt(vx * vx + vy * vy)
    vx /= len
    vy /= len

    // Grid movement step (1 tile per key press)
    const gridStep = 1
    const newCol = this.playerGridX + Math.round(vx * gridStep)
    const newRow = this.playerGridY + Math.round(vy * gridStep)

    // Collision check (simple AABB against obstacle grid)
    if (this.isBlocked(newCol, newRow)) return

    // Update grid position
    this.playerGridX = newCol
    this.playerGridY = newRow

    // Tween to new screen position
    const { x, y } = worldToScreen(newCol, newRow, this.isoCenterX, this.isoCenterY)

    this.tweens.add({
      targets: this.player,
      x, y,
      duration: 150,
      ease: 'Sine.easeInOut',
    })
  }

  /**
   * Simple collision check — replace with full A* pathfinding + Matter.js
   * bodies in the actual conversion.
   */
  private isBlocked(col: number, row: number): boolean {
    const obstacleDefs = [
      { c: 2, r: 1, w: 2, h: 2 },
      { c: 7, r: 2, w: 1, h: 3 },
      { c: 1, r: 6, w: 3, h: 1 },
      { c: 6, r: 7, w: 1, h: 1 },
    ]
    for (const obs of obstacleDefs) {
      if (col >= obs.c && col < obs.c + obs.w && row >= obs.r && row < obs.r + obs.h) {
        return true
      }
    }
    return false
  }

  // ─── DEPTH SORTING ────────────────────────────────────────────────────────

  /**
   * Updates depth sorting each frame.
   * In isometric, every moving entity needs its depth recalculated based on
   * (worldX + worldY + worldZ) before every render.
   */
  private updateDepthSorting(): void {
    // Update player depth based on current grid position
    this.player.setDepth(computeIsoDepth(
      this.playerGridX,
      this.playerGridY,
      0,
      ISO_DEPTH_BASE
    ))

    // Re-draw player at current interpolated position (smooth movement between tweens)
    this.drawIsoPawn(this.playerGraphics, 0, 0, 0x00ff00)
  }
}
