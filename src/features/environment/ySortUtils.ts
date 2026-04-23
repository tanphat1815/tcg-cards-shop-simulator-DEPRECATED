import Phaser from 'phaser'
import { DEPTH } from './config'

/**
 * Applies Y-sort depth for DYNAMIC entities (Player, NPC, Staff, carried boxes).
 * Origin MUST be (0.5, 1) — foot position.
 */
export function applyDynamicYSort(
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
): void {
  sprite.setOrigin(0.5, 1)
  const body = sprite.body as Phaser.Physics.Arcade.Body
  const ySort = body ? body.bottom : sprite.y
  sprite.setDepth(DEPTH.LAYER3_OBJECTS + ySort)
}

/**
 * Applies Y-sort depth for STATIC entities (Shelves, Tables, Cashiers).
 * Called ONCE at spawn, not every frame.
 */
export function applyStaticYSort(
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
): void {
  sprite.setOrigin(0.5, 1)
  const body = sprite.body as Phaser.Physics.Arcade.Body
  const ySort = body ? body.bottom : sprite.y
  sprite.setDepth(DEPTH.LAYER3_OBJECTS + ySort - 0.1)
}

/**
 * Applies a "foot collider" hitbox — only the bottom portion of the sprite
 * participates in physics, allowing the player to visually walk BEHIND the
 * upper portion of furniture and walls.
 */
export function applyFootCollider(
  sprite: Phaser.Physics.Arcade.Sprite,
  footRatio: number = 0.3
): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body
  if (!body) return

  const displayW = sprite.displayWidth
  const displayH = sprite.displayHeight

  const bodyW   = displayW
  const bodyH   = displayH * footRatio
  const offsetX = 0
  const offsetY = displayH * (1 - footRatio)

  body.setSize(bodyW, bodyH)
  body.setOffset(offsetX, offsetY)
}

// ─── DROP SHADOW SYSTEM ───────────────────────────────────────────────────────

export interface ShadowConfig {
  radiusX?: number   // px, horizontal radius of ellipse (default: sprite.width * 0.3)
  radiusY?: number   // px, vertical radius of ellipse (default: radiusX * 0.4)
  alpha?: number     // 0-1 (default: 0.35)
  color?: number     // hex (default: 0x000000)
  offsetY?: number   // vertical offset from foot position (default: -4)
}

/**
 * Creates a Graphics object that renders as an elliptical drop shadow.
 * Attach the returned object to the scene and call updateShadow() each frame.
 *
 * @example
 *   // In create():
 *   this.playerShadow = createDropShadow(this, this.player, { radiusX: 12 })
 *
 *   // In update():
 *   updateDropShadow(this.playerShadow, this.player)
 */
export function createDropShadow(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  config: ShadowConfig = {}
): Phaser.GameObjects.Graphics {
  const shadow = scene.add.graphics()
  shadow.setDepth(DEPTH.LAYER1_FLOOR + 1) // Just above floor, always below everything
  _drawShadowEllipse(shadow, target, config)
  return shadow
}

/**
 * Updates the drop shadow position each frame.
 * Call this in your scene's update() loop.
 */
export function updateDropShadow(
  shadow: Phaser.GameObjects.Graphics,
  target: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  config: ShadowConfig = {}
): void {
  shadow.clear()
  _drawShadowEllipse(shadow, target, config)
}

function _drawShadowEllipse(
  shadow: Phaser.GameObjects.Graphics,
  target: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  config: ShadowConfig
): void {
  const rX     = config.radiusX ?? target.displayWidth * 0.28
  const rY     = config.radiusY ?? rX * 0.38
  const alpha  = config.alpha ?? 0.32
  const color  = config.color ?? 0x000000
  const offY   = config.offsetY ?? -4

  // foot position
  const fx = target.x
  const fy = target.y + offY

  shadow.fillStyle(color, alpha)
  shadow.fillEllipse(fx, fy, rX * 2, rY * 2)
}
