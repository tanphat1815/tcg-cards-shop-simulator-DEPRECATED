/**
 * NPCLocomotion.ts — Tween-based path following for NPCs.
 *
 * Replaces physics.moveTo() with smooth Tween Timeline movement.
 * Each waypoint is visited in sequence using A* pathfinding.
 *
 * OBLIQUE MODE (default):
 *   Path waypoints are world-space pixel positions.
 *   Animation direction based on dominant axis (dx vs dy).
 *
 * ISOMETRIC MODE:
 *   Path waypoints remain in world/grid space (A* grid unchanged).
 *   Animation direction uses 8 isometric compass directions (NE, E, SE, S, SW, W, NW, N).
 *   Depth sorting updates every frame: depth = worldX + worldY + worldZ
 *   Uses IsometricDepthManager for batch-optimized sorting.
 *
 * USAGE:
 *   const loco = new NPCLocomotion(scene, npcSprite)
 *   loco.moveTo(targetX, targetY, speedMs)  // speedMs = ms per grid cell
 *   loco.update()                            // call in scene update for anti-stuck
 *   loco.stop()                              // emergency stop
 */

import Phaser from 'phaser'
import { aStarGrid } from '../../environment/managers/AStarGridManager'
import type { WorldPoint } from '../../environment/managers/AStarGridManager'
import { AppConfig } from '../../../game/config/AppConfig'
import { velocityToIsoFacing } from '../../../game/utils/characterAnimations'
import { 
  computeIsoDepthFromScreen, 
  DEPTH_OFFSETS 
} from '../../environment/utils/IsometricUtils'

export class NPCLocomotion {
  private scene: Phaser.Scene
  private sprite: Phaser.GameObjects.Sprite
  private path: WorldPoint[] = []
  private currentTween: Phaser.Tweens.Tween | null = null
  private speed: number = 100  // ms per node

  // Stuck detection
  private lastPos: { x: number; y: number } = { x: 0, y: 0 }
  private lastMoveTime: number = 0

  /** Whether isometric mode is active. */
  private readonly isoMode: boolean

  constructor(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite) {
    this.scene = scene
    this.sprite = sprite
    this.isoMode = AppConfig.ISOMETRIC.ENABLED
  }

  // ─── PUBLIC API ────────────────────────────────────────────────────────────

  /**
   * Moves the NPC to a target in world space using A* pathfinding.
   *
   * @param targetX   — Target X in world/grid space
   * @param targetY   — Target Y in world/grid space
   * @param speedMs   — Milliseconds per grid cell (default 100ms)
   * @returns         — true if path found, false otherwise
   */
  moveTo(targetX: number, targetY: number, speedMs: number = 100): boolean {
    if (!this.sprite || !this.sprite.active) return false
    this.speed = speedMs

    // Snap if already very close
    const dist = Phaser.Math.Distance.Between(
      this.sprite.x, this.sprite.y, targetX, targetY
    )
    if (dist < 4) {
      this.sprite.setPosition(targetX, targetY)
      this.stop()
      return true
    }

    const newPath = aStarGrid.findPath(
      { x: this.sprite.x, y: this.sprite.y },
      { x: targetX, y: targetY }
    )

    if (!newPath || newPath.length === 0) {
      this.stop()
      return false
    }

    this.path = newPath
    this.startPathFollowing()
    return true
  }

  /**
   * Immediately stops movement and clears the current path.
   */
  stop(): void {
    if (this.currentTween) {
      this.currentTween.stop()
      this.currentTween = null
    }
    if (!this.sprite || !this.sprite.active) return
    if (this.sprite.anims.isPlaying) this.sprite.anims.stop()
    this.path = []
  }

  get isMoving(): boolean {
    return this.currentTween !== null && this.currentTween.isPlaying()
  }

  /**
   * Call every frame in your scene's update() for anti-stuck detection.
   * Also updates isometric depth sorting.
   */
  update(): void {
    if (this.isMoving) {
      // ── Anti-stuck: If no movement for >1s, force stop ────────────────
      const elapsed = this.scene.time.now - this.lastMoveTime
      const dist = Phaser.Math.Distance.Between(
        this.sprite.x, this.sprite.y,
        this.lastPos.x, this.lastPos.y
      )
      if (elapsed > 1000 && dist < 2) {
        console.warn('[NPCLocomotion] Stuck detected — force stopping')
        this.stop()
      }

      // ── Isometric depth sorting (every frame during movement) ────────
      if (this.isoMode) {
        const { ORIGIN_X, ORIGIN_Y } = AppConfig.ISOMETRIC.MAP
        const depth = computeIsoDepthFromScreen(
          this.sprite.x, 
          this.sprite.y, 
          ORIGIN_X, 
          ORIGIN_Y,
          DEPTH_OFFSETS.PLAYER,
          AppConfig.ISOMETRIC.DEPTH_BASE
        )
        this.sprite.setDepth(depth)
      }
    }
  }

  // ─── PRIVATE: PATH FOLLOWING ─────────────────────────────────────────────

  private startPathFollowing(): void {
    if (this.currentTween) this.currentTween.stop()

    if (this.path.length === 0) return

    const nextNode = this.path.shift()!
    this.moveToNode(nextNode)
  }

  private moveToNode(node: WorldPoint): void {
    // ── 1. Update animation direction ───────────────────────────────────
    this.updateAnimation(node)

    // ── 2. Compute duration ─────────────────────────────────────────────
    const dist = Phaser.Math.Distance.Between(
      this.sprite.x, this.sprite.y, node.x, node.y
    )
    // Use the grid cell size (16px) as the base unit
    const distInCells = dist / 16
    const duration = distInCells * this.speed

    this.currentTween = this.scene.tweens.add({
      targets: this.sprite,
      x: node.x,
      y: node.y,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        // ── Isometric depth sorting ──────────────────────────────────────
        if (this.isoMode) {
          const { ORIGIN_X, ORIGIN_Y } = AppConfig.ISOMETRIC.MAP
          const depth = computeIsoDepthFromScreen(
            this.sprite.x, 
            this.sprite.y, 
            ORIGIN_X, 
            ORIGIN_Y,
            DEPTH_OFFSETS.PLAYER,
            AppConfig.ISOMETRIC.DEPTH_BASE
          )
          this.sprite.setDepth(depth)
        }
      },
      onComplete: () => {
        if (this.path.length > 0) {
          const next = this.path.shift()!
          this.moveToNode(next)
        } else {
          this.stop()
        }
      },
    })

    this.lastMoveTime = this.scene.time.now
    this.lastPos = { x: this.sprite.x, y: this.sprite.y }
  }

  /**
   * Determines which animation to play based on movement direction.
   *
   * OBLIQUE: Uses dominant axis (dx vs dy) → 4 directions (down/left/right/up)
   * ISOMETRIC: Uses velocity angle → 8 directions (SE/S/SW/W/NW/N/NE/E)
   */
  private updateAnimation(target: WorldPoint): void {
    try {
      if (!this.sprite || !this.sprite.active) return
      if (!this.sprite.anims) return

      const dx = target.x - this.sprite.x
      const dy = target.y - this.sprite.y
      const prefix = this.sprite.texture.key

      let animKey: string
      if (this.isoMode) {
        animKey = `${prefix}-${velocityToIsoFacing(dx, dy)}`
      } else {
        animKey = Math.abs(dx) > Math.abs(dy)
          ? (dx < 0 ? `${prefix}-left` : `${prefix}-right`)
          : (dy < 0 ? `${prefix}-up` : `${prefix}-down`)
      }

      if (this.scene.anims.exists(animKey)) {
        try {
          this.sprite.anims.play(animKey, true)
        } catch {
          // Phaser may throw if anim state is corrupted mid-tween
          this.sprite.anims.stop()
        }
      } else {
        this.sprite.anims.stop()
      }
    } catch {
      // Silently ignore any unexpected errors in animation handling
    }
  }
}
