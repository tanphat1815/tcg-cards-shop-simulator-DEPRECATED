/**
 * PlayerFSM.ts — Finite State Machine for player movement.
 *
 * SUPPORTS TWO RENDERING MODES:
 *
 * ─── OBLIQUE 2.5D MODE (default) ───────────────────────────────────────────
 *   Arrow keys / WASD map directly to screen directions:
 *     W/Up    → north  (world Y-)
 *     S/Down  → south  (world Y+)
 *     A/Left  → west   (world X-)
 *     D/Right → east   (world X+)
 *   Diagonal: normalized to avoid faster diagonal speed.
 *   Animations: 4 directions (down, left, right, up)
 *
 * ─── ISOMETRIC MODE ───────────────────────────────────────────────────────────
 *   Arrow keys / WASD map to isometric world directions:
 *     W        → NW (world X-, Y-)
 *     S        → SE (world X+, Y+)
 *     A        → SW (world X-, Y+)
 *     D        → NE (world X+, Y-)
 *     W+D      → N  (world X+, Y-)  ← diagonal combination
 *     W+A      → W  (world X-, Y-)
 *     S+D      → E  (world X+, Y+)
 *     S+A      → S  (world X-, Y+)
 *   Movement speed along screen-Y is scaled by ISO_MOVE_Y_SCALE (0.5)
 *   to maintain consistent apparent speed with the 2:1 tile ratio.
 *   Animations: 8 directions (NE, E, SE, S, SW, W, NW, N)
 *
 * ─── PHYSICS ENGINE ──────────────────────────────────────────────────────────
 *   Oblique:   Arcade Physics → body.setVelocity(vx, vy)
 *   Isometric: Matter.js      → body.setVelocity(vx, vy) (Matter API)
 *   The FSM auto-detects which API to use via AppConfig.ISOMETRIC.ENABLED.
 *
 * DEPTH SORTING:
 *   In isometric mode, call updateDepth(sprite, worldX, worldY, worldZ)
 *   each frame to maintain correct occlusion. Use IsometricDepthManager
 *   or IsometricUtils.computeIsoDepth() for this.
 */

import Phaser from 'phaser'
import { GAME_BALANCE } from '../config/gameConfig'
import { AppConfig } from './config/AppConfig'
import { ISO_MOVE_Y_SCALE } from '../features/environment/utils/IsometricUtils'

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ObliqueFacing = 'down' | 'up' | 'left' | 'right'
export type IsoFacing = 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'N' | 'NE' | 'E'
export type Facing = ObliqueFacing | IsoFacing

interface CursorKeys {
  up:    Phaser.Input.Keyboard.Key
  down:  Phaser.Input.Keyboard.Key
  left:  Phaser.Input.Keyboard.Key
  right: Phaser.Input.Keyboard.Key
}

// ─── FSM CLASS ────────────────────────────────────────────────────────────────

export class PlayerFSM {
  private state: 'IDLE' | 'WALK' = 'IDLE'
  private facing: Facing = 'down'
  private sprite: Phaser.GameObjects.Sprite
  private cursors: CursorKeys
  private speed: number
  /** Texture prefix: 'player' | 'npc' | 'staff' */
  private prefix: string
  /** Whether isometric mode is active */
  private readonly isoMode: boolean
  /** Whether Matter.js is the active physics engine */
  private readonly useMatter: boolean

  constructor(
    sprite: Phaser.GameObjects.Sprite,
    cursors: CursorKeys,
    speed: number = GAME_BALANCE.PLAYER.BASE_SPEED,
    prefix: string = 'player',
    isoMode: boolean = AppConfig.ISOMETRIC.ENABLED
  ) {
    this.sprite  = sprite
    this.cursors = cursors
    this.speed   = speed
    this.prefix  = prefix
    this.isoMode = isoMode
    this.useMatter = isoMode && AppConfig.ISOMETRIC.ENABLED
  }

  // ─── UPDATE LOOP ─────────────────────────────────────────────────────────

  /**
   * Call once per frame in scene.update().
   * Returns the raw screen-space velocity for optional external depth sorting.
   *
   * @returns { vx, vy } — screen-space velocity in pixels/sec
   */
  update(): { vx: number; vy: number } {
    if (this.isoMode) {
      return this._updateIsometric()
    }
    return this._updateOblique()
  }

  private _updateOblique(): { vx: number; vy: number } {
    const vx = this._getInputX()
    const vy = this._getInputY()
    const isMoving = vx !== 0 || vy !== 0

    // Apply velocity via Arcade
    ;(this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0)
    if (isMoving) {
      const len = Math.sqrt(vx * vx + vy * vy)
      ;(this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(
        (vx / len) * this.speed,
        (vy / len) * this.speed
      )
    }

    // Determine facing direction (dominant axis)
    if (isMoving) {
      if (Math.abs(vx) >= Math.abs(vy)) {
        this.facing = vx < 0 ? 'left' : 'right'
      } else {
        this.facing = vy < 0 ? 'up' : 'down'
      }
    }

    this._handleStateTransition(isMoving)
    return { vx: isMoving ? (vx / Math.sqrt(vx * vx + vy * vy)) * this.speed : 0,
             vy: isMoving ? (vy / Math.sqrt(vx * vx + vy * vy)) * this.speed : 0 }
  }

  private _updateIsometric(): { vx: number; vy: number } {
    // ── Read 4-directional input ────────────────────────────────────────
    const wDown = this.cursors.up.isDown
    const sDown = this.cursors.down.isDown
    const aDown = this.cursors.left.isDown
    const dDown = this.cursors.right.isDown

    let worldDx = 0
    let worldDy = 0

    // WASD → isometric world axes
    if (wDown) worldDy -= 1
    if (sDown) worldDy += 1
    if (aDown) worldDx -= 1
    if (dDown) worldDx += 1

    const isMoving = worldDx !== 0 || worldDy !== 0

    // ── Calculate screen velocity ───────────────────────────────────────
    const screenVx = (worldDx - worldDy) * this.speed
    const screenVy = (worldDx + worldDy) * this.speed * ISO_MOVE_Y_SCALE

    // ── Apply velocity — auto-detect physics engine ─────────────────────
    try {
      if (this.useMatter) {
        // Matter.js: sprite is a Matter sprite with setVelocity on body
        const matterSprite = this.sprite as Phaser.Physics.Matter.Sprite
        if (isMoving) {
          // Matter setVelocity works in pixels per physics step (60fps).
          // Phaser's Matter plugin scales this internally.
          // We divide by 60 to convert px/sec to px/step equivalent,
          // but Phaser handles the delta internally, so we pass raw speed.
          matterSprite.setVelocity(screenVx / 60, screenVy / 60)
        } else {
          matterSprite.setVelocity(0, 0)
        }
      } else {
        // Arcade fallback
        ;(this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(screenVx, screenVy)
      }
    } catch (err) {
      // Fallback if body type mismatch
      try {
        ;(this.sprite.body as any).setVelocity(screenVx, screenVy)
      } catch (_e) {
        // ignore
      }
    }

    // ── Determine facing (8 directions) ─────────────────────────────────
    if (isMoving) {
      this.facing = this._determineIsoFacing(worldDx, worldDy)
    }

    this._handleStateTransition(isMoving)
    return { vx: screenVx, vy: screenVy }
  }

  private _determineIsoFacing(dx: number, dy: number): IsoFacing {
    if (dx === 0 && dy === -1) return 'N'
    if (dx === 0 && dy ===  1) return 'S'
    if (dx ===-1 && dy ===  0) return 'W'
    if (dx === 1 && dy ===  0) return 'E'
    if (dx ===-1 && dy ===-1) return 'NW'
    if (dx === 1 && dy ===-1) return 'NE'
    if (dx ===-1 && dy === 1) return 'SW'
    if (dx === 1 && dy === 1) return 'SE'
    return 'S' // fallback
  }

  private _handleStateTransition(isMoving: boolean): void {
    const newState: 'IDLE' | 'WALK' = isMoving ? 'WALK' : 'IDLE'
    if (newState !== this.state) {
      this.state = newState
      this._onStateEnter()
    } else {
      this._onStateUpdate()
    }
  }

  // ─── PUBLIC ACCESSORS ─────────────────────────────────────────────────────

  get currentFacing(): Facing { return this.facing }
  get isMoving(): boolean { return this.state === 'WALK' }
  get worldVelocity(): { vx: number; vy: number } {
    try {
      if (this.useMatter) {
        const body = (this.sprite as Phaser.Physics.Matter.Sprite).body as MatterJS.BodyType
        return {
          vx: body?.velocity?.x ?? 0,
          vy: body?.velocity?.y ?? 0,
        }
      }
      const body = this.sprite.body as Phaser.Physics.Arcade.Body
      return {
        vx: body.velocity.x,
        vy: body.velocity.y,
      }
    } catch (_err) {
      return { vx: 0, vy: 0 }
    }
  }

  /** Call when teleporting / respawning to reset animation */
  resetToIdle(facing: Facing = 'down') {
    this.facing = facing
    this.state  = 'IDLE'
    try {
      if (this.useMatter) {
        ;(this.sprite as Phaser.Physics.Matter.Sprite).setVelocity(0, 0)
      } else {
        ;(this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0)
      }
    } catch (_e) {
      // ignore
    }
    this._onStateEnter()
  }

  /** Updates depth for isometric mode. Call every frame after movement. */
  updateDepth(
    sprite: Phaser.GameObjects.Sprite,
    worldX: number,
    worldY: number,
    worldZ: number = 0
  ): void {
    if (!this.isoMode) return
    const depth = Math.floor(
      AppConfig.ISOMETRIC.DEPTH_BASE + worldX + worldY + worldZ
    )
    sprite.setDepth(depth)
  }

  // ─── PRIVATE ─────────────────────────────────────────────────────────────

  private _getInputX(): number {
    if (this.cursors.left.isDown)  return -1
    if (this.cursors.right.isDown) return  1
    return 0
  }

  private _getInputY(): number {
    if (this.cursors.up.isDown)   return -1
    if (this.cursors.down.isDown) return  1
    return 0
  }

  private _onStateEnter(): void {
    if (this.state === 'WALK') {
      const animKey = `${this.prefix}-${this.facing}`
      if (this.sprite.anims.exists(animKey)) {
        this.sprite.anims.play(animKey, true)
      }
    } else {
      if (this.sprite.anims.isPlaying) {
        this.sprite.anims.stop()
        if (this.isoMode) {
          // 8-direction idle frames: use frame 0 for all isometric facing
          this.sprite.setFrame(0)
        } else {
          const frameMap: Record<ObliqueFacing, number> = {
            down: 0, left: 4, right: 8, up: 12
          }
          this.sprite.setFrame(frameMap[this.facing as ObliqueFacing] ?? 0)
        }
      }
    }
  }

  private _onStateUpdate(): void {
    if (this.state === 'WALK') {
      const expected = `${this.prefix}-${this.facing}`
      if (this.sprite.anims.currentAnim?.key !== expected) {
        try {
          if (this.sprite.anims.exists(expected) && this.sprite.anims.currentAnim) {
            this.sprite.anims.play(expected, true)
          }
        } catch {
          // ignore
        }
      }
    }
  }
}
