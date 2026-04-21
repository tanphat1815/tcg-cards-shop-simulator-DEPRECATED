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
  
  // Use physics body bottom if available for pixel-perfect feet sorting.
  // This ignores any transparent padding at the bottom of the texture frame.
  const body = sprite.body as Phaser.Physics.Arcade.Body
  const ySort = body ? body.bottom : sprite.y
  
  sprite.setDepth(DEPTH.LAYER3_OBJECTS + ySort)
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
  
  const body = sprite.body as Phaser.Physics.Arcade.Body
  const ySort = body ? body.bottom : sprite.y

  // Static objects (furniture, walls) get a tiny depth penalty (-0.1) 
  // to ensure dynamic entities (Player, NPC) render ON TOP in case of a Y-tie.
  sprite.setDepth(DEPTH.LAYER3_OBJECTS + ySort - 0.1)
}

/**
 * Applies a "foot collider" hitbox — only the bottom portion of the sprite
 * participates in physics, allowing the player to visually walk BEHIND the
 * upper portion of furniture and walls.
 *
 * CRITICAL IMPLEMENTATION NOTE:
 * When setOrigin(0.5, 1) is used, the sprite's (x, y) represents the
 * BOTTOM-CENTER of the display frame. Phaser's physics body offset is always
 * measured in TEXTURE SPACE from the TOP-LEFT corner of the texture frame,
 * regardless of the visual origin. This means:
 *
 *   - sprite.width  → display width  (= texture width  * scaleX)
 *   - sprite.height → display height (= texture height * scaleY)
 *   - body.setSize() takes DISPLAY-space pixel values directly
 *   - body.setOffset() is measured from the TEXTURE top-left in DISPLAY pixels
 *
 * With origin (0.5, 1):
 *   - The body must start at offsetY = displayHeight * (1 - footRatio)
 *     so its top aligns with where the foot region begins.
 *   - The body height = displayHeight * footRatio
 *   - offsetX = 0 (body spans the full width, centred by Phaser automatically)
 *
 * @param sprite     The physics sprite to modify. Must have origin (0.5, 1).
 * @param footRatio  Fraction of display height to use as collider (default 0.3 = bottom 30%).
 */
export function applyFootCollider(
  sprite: Phaser.Physics.Arcade.Sprite,
  footRatio: number = 0.3
): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body
  if (!body) return

  // Use the DISPLAY dimensions (already accounts for scale).
  const displayW = sprite.displayWidth
  const displayH = sprite.displayHeight

  // The collider is a rectangle occupying the bottom `footRatio` of the sprite.
  const bodyW   = displayW
  const bodyH   = displayH * footRatio

  // Offset from the TEXTURE top-left (display pixels).
  // With origin (0.5, 1), the texture top is at -(displayH) relative to the
  // foot anchor. The offset must push the body down so its TOP aligns with
  // the start of the foot region.
  const offsetX = 0
  const offsetY = displayH * (1 - footRatio)

  body.setSize(bodyW, bodyH)
  body.setOffset(offsetX, offsetY)
}
