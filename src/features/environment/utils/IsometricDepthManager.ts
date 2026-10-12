/**
 * IsometricDepthManager.ts — Depth (Z-index) management for isometric rendering.
 *
 * PROBLEM: In isometric view, a simple "sort by Y" fails for multi-tile objects.
 * For example, a 2x2 building occupies tiles (0,0), (1,0), (0,1), (1,1).
 * A character walking near the bottom-left of the building should be drawn BEHIND it,
 * but a character walking near the top-right should be drawn IN FRONT.
 * Simply sorting by Y (body.bottom) fails here.
 *
 * SOLUTION: Use the isometric depth formula.
 *
 * Isometric space is functionally 3D. We store 3D coordinates per entity:
 *   X, Y = on-ground axes (the 2D grid)
 *   Z    = height above ground (for elevated entities like flying NPCs)
 *
 * The isometric projection (2:1 ratio) maps 3D world coordinates to 2D screen:
 *   screenX = centerX + (X - Y) * tileWidthHalf
 *   screenY = centerY + (X + Y) * tileHeightHalf - Z * tileHeight
 *
 * For correct depth sorting, sort by the sum of all three axes:
 *   depth = X + Y + Z
 *
 * Higher sum = closer to camera = drawn last (on top).
 * This works because objects drawn from farthest (lowest sum) to nearest (highest sum)
 * guarantees correct occlusion for ANY object size.
 *
 * Reference: https://www.reddit.com/r/gamedev/comments/pj3bpr/
 *   "Isometric games are functionally 3D, so internally, you should be storing the
 *    3D coordinates for each entity in the game."
 *
 * OPTIMIZATION: Only recompute sorting for MOVING entities.
 * Static entities (furniture, walls) can be sorted once at spawn time.
 * For entities that never move, sorting is a one-time O(n log n) cost.
 */

import Phaser from 'phaser'
import { computeIsoDepth, ISO_DEPTH_BASE } from './IsometricUtils'

/** Base depth layer for dynamic (moving) game entities. */
export const ISO_DEPTH_BASE_MANAGER = 100

/**
 * Computes and applies depth to a moving entity each frame.
 * Call this in your scene's update() loop.
 *
 * @param sprite    — The sprite to update depth for
 * @param worldX    — X in world/grid space (not screen space!)
 * @param worldY    — Y in world/grid space
 * @param worldZ    — Height above ground (default 0)
 */
export function applyDynamicIsoDepth(
  sprite: Phaser.GameObjects.Sprite,
  worldX: number,
  worldY: number,
  worldZ: number = 0
): void {
  sprite.setDepth(computeIsoDepth(worldX, worldY, worldZ, ISO_DEPTH_BASE))
}

/**
 * Computes and applies depth to a static entity (called once at spawn).
 *
 * @param sprite    — The sprite to set depth for
 * @param worldX    — X in world/grid space
 * @param worldY    — Y in world/grid space
 * @param worldZ    — Height above ground (default 0)
 */
export function applyStaticIsoDepth(
  sprite: Phaser.GameObjects.Sprite,
  worldX: number,
  worldY: number,
  worldZ: number = 0
): void {
  // Static entities get a tiny offset below dynamic entities at the same position
  // to ensure characters always appear in front of static furniture.
  sprite.setDepth(computeIsoDepth(worldX, worldY, worldZ, ISO_DEPTH_BASE) - 0.1)
}

/**
 * Isometric depth manager for efficient batch sorting.
 * Instead of calling applyDynamicIsoDepth() individually in update(),
 * collect all moving sprites and call sortAll() once per frame.
 *
 * This is useful when you have many moving entities and want to
 * minimize per-sprite setDepth() calls.
 *
 * @example
 *   const depthManager = new IsometricDepthManager()
 *
 *   // Register sprites at spawn time
 *   depthManager.register('player', playerSprite, worldX, worldY)
 *   depthManager.register('npc1',   npcSprite,   worldX, worldY)
 *
 *   // In update() — call once per frame for all moving entities
 *   depthManager.updateWorldPos('player', newWorldX, newWorldY)
 *   depthManager.updateWorldPos('npc1',   newWorldX, newWorldY)
 *   depthManager.sortAll()
 */
export class IsometricDepthManager {
  private entities = new Map<string, {
    sprite: Phaser.GameObjects.Sprite
    x: number
    y: number
    z: number
  }>()

  /**
   * Registers a sprite for depth management.
   * Call once when the entity is created.
   */
  register(id: string, sprite: Phaser.GameObjects.Sprite, x: number, y: number, z: number = 0): void {
    this.entities.set(id, { sprite, x, y, z })
    this.apply(id)
  }

  /**
   * Unregisters a sprite (e.g., when the entity is destroyed).
   */
  unregister(id: string): void {
    this.entities.delete(id)
  }

  /**
   * Updates the world position of a registered entity.
   * The actual setDepth() call is deferred until sortAll() is called.
   */
  updateWorldPos(id: string, x: number, y: number, z?: number): void {
    const entry = this.entities.get(id)
    if (!entry) return
    entry.x = x
    entry.y = y
    if (z !== undefined) entry.z = z
  }

  /**
   * Applies depth to all registered entities.
   * Call this once per frame in your scene's update() loop.
   * Uses a single pass over all entities (O(n)).
   */
  sortAll(): void {
    for (const entry of this.entities.values()) {
      entry.sprite.setDepth(
        computeIsoDepth(entry.x, entry.y, entry.z, ISO_DEPTH_BASE)
      )
    }
  }

  /**
   * Applies depth to a single registered entity immediately.
   * Use this if you need per-entity updates outside the batch sort.
   */
  apply(id: string): void {
    const entry = this.entities.get(id)
    if (!entry) return
    entry.sprite.setDepth(
      computeIsoDepth(entry.x, entry.y, entry.z, ISO_DEPTH_BASE)
    )
  }

  /** Returns the current world position of a registered entity. */
  getWorldPos(id: string): { x: number; y: number; z: number } | null {
    const entry = this.entities.get(id)
    if (!entry) return null
    return { x: entry.x, y: entry.y, z: entry.z }
  }

  /** Clears all registered entities. */
  clear(): void {
    this.entities.clear()
  }
}
