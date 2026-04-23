/**
 * PlayerFSM.ts — Finite State Machine cho di chuyển người chơi.
 *
 * States:
 *   IDLE  → player standing still, animation frozen on current facing frame
 *   WALK  → player moving, full walk animation plays
 *
 * Transitions:
 *   IDLE → WALK  : any movement key pressed
 *   WALK → IDLE  : all movement keys released
 */
import Phaser from 'phaser'

export type PlayerFacing = 'down' | 'up' | 'left' | 'right'

interface CursorKeys {
  up:    Phaser.Input.Keyboard.Key
  down:  Phaser.Input.Keyboard.Key
  left:  Phaser.Input.Keyboard.Key
  right: Phaser.Input.Keyboard.Key
}

export class PlayerFSM {
  private state: 'IDLE' | 'WALK' = 'IDLE'
  private facing: PlayerFacing = 'down'
  private sprite: Phaser.Physics.Arcade.Sprite
  private cursors: CursorKeys
  private speed: number
  /** Texture prefix: 'player' | 'npc' | 'staff' */
  private prefix: string

  constructor(
    sprite: Phaser.Physics.Arcade.Sprite,
    cursors: CursorKeys,
    speed: number = 160,
    prefix: string = 'player'
  ) {
    this.sprite  = sprite
    this.cursors = cursors
    this.speed   = speed
    this.prefix  = prefix
  }

  /** Call once per frame in scene.update() */
  update(): void {
    const vx = this._getInputX()
    const vy = this._getInputY()
    const isMoving = vx !== 0 || vy !== 0

    // Apply velocity
    this.sprite.setVelocity(0)
    if (isMoving) {
      // Normalise diagonal
      const len = Math.sqrt(vx * vx + vy * vy)
      this.sprite.setVelocity(
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

    // State transitions
    const newState: 'IDLE' | 'WALK' = isMoving ? 'WALK' : 'IDLE'

    if (newState !== this.state) {
      this.state = newState
      this._onStateEnter()
    } else {
      this._onStateUpdate()
    }
  }

  get currentFacing(): PlayerFacing { return this.facing }
  get isMoving(): boolean { return this.state === 'WALK' }

  /** Call when teleporting / respawning to reset animation */
  resetToIdle(facing: PlayerFacing = 'down') {
    this.facing = facing
    this.state  = 'IDLE'
    this.sprite.setVelocity(0)
    this._onStateEnter()
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

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

  private _onStateEnter() {
    if (this.state === 'WALK') {
      this.sprite.anims.play(`${this.prefix}-${this.facing}`, true)
    } else {
      // IDLE: stop animation but keep current facing frame
      if (this.sprite.anims.isPlaying) {
        this.sprite.anims.stop()
        // Snap to the first frame of the current walk cycle so the character
        // stands still facing the correct direction (not mid-step).
        const frameMap: Record<PlayerFacing, number> = {
          down: 0, left: 4, right: 8, up: 12
        }
        this.sprite.setFrame(frameMap[this.facing])
      }
    }
  }

  private _onStateUpdate() {
    if (this.state === 'WALK') {
      // Keep anim in sync if direction changed within WALK state
      const expected = `${this.prefix}-${this.facing}`
      if (this.sprite.anims.currentAnim?.key !== expected) {
        this.sprite.anims.play(expected, true)
      }
    }
  }
}
