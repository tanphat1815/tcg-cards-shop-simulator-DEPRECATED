import Phaser from 'phaser'
import { DEPTH } from './config'

/**
 * Applies Y-sort depth for DYNAMIC entities (Player, NPC, Staff, carried boxes).
 *
 * Rules:
 * - Origin is bottom-center (0.5, 1) so (x, y) = foot position.
 * - Depth = LAYER3_OBJECTS + sprite.y so entities sort correctly within Layer 3.
 *   With LAYER3_OBJECTS = 100 and shop y range ~1000-1600, depth will be ~1100-1700,
 *   safely above LAYER2_WALL_BASE (20) and below LAYER4_WALL_TOP (9000).
 *
 * Call EVERY FRAME inside the manager's update loop.
 */
export function applyDynamicYSort(
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
): void {
  sprite.setOrigin(0.5, 1)
  sprite.setDepth(DEPTH.LAYER3_OBJECTS + sprite.y)
}

/**
 * Applies Y-sort depth for STATIC entities (Shelves, Tables, Cashiers, floor boxes).
 *
 * Rules identical to dynamic version, but only called ONCE at spawn/refresh.
 * Do NOT call every frame for static objects.
 */
export function applyStaticYSort(
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
): void {
  sprite.setOrigin(0.5, 1)
  sprite.setDepth(DEPTH.LAYER3_OBJECTS + sprite.y)
}

/**
 * Applies a "foot collider" hitbox — only the bottom portion of the sprite
 * participates in physics, allowing the player to visually walk behind
 * the top 70% of furniture/walls.
 *
 * Hitbox dimensions:
 *   width  = 100% of sprite's TEXTURE width (full width for natural feel)
 *   height = footRatio × sprite's TEXTURE height (default 30% = bottom third)
 *
 * Offset calculation (Phaser uses TEXTURE-space offsets, not display-space):
 *   offsetX = 0  (full width — no horizontal narrowing)
 *   offsetY = textureHeight × (1 - footRatio)  (push body down to the bottom)
 *
 * @param sprite  The physics sprite to modify.
 * @param footRatio  Fraction of sprite height used as the collider (0.3 = bottom 30%).
 */
export function applyFootCollider(
  sprite: Phaser.Physics.Arcade.Sprite,
  footRatio: number = 0.3
): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body
  if (!body) return

  // Use texture (frame) dimensions — these are in TEXTURE SPACE before scale is applied.
  const texW = sprite.width   // raw texture width
  const texH = sprite.height  // raw texture height

  // Body dimensions in TEXTURE space.
  const bodyW = texW          // full width
  const bodyH = texH * footRatio

  // Offset: push the body to the bottom of the texture.
  // Because origin is (0.5, 1), Phaser's body origin is also relative to the texture
  // origin (top-left). So we need to offset from the top-left of the texture.
  const offsetX = 0
  const offsetY = texH * (1 - footRatio)

  body.setSize(bodyW, bodyH)
  body.setOffset(offsetX, offsetY)
}
