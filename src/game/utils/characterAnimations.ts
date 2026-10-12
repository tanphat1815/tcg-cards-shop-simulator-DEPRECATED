/**
 * characterAnimations.ts — Animation registration for all character sprites.
 *
 * OBLIQUE 2.5D MODE (default):
 *   4 directions: down, left, right, up
 *   Each direction = 4 frames (walk cycle)
 *   Spritesheet layout: [down(0-3)] [left(4-7)] [right(8-11)] [up(12-15)]
 *
 * ISOMETRIC MODE:
 *   8 directions: SE, S, SW, W, NW, N, NE, E
 *   Each direction = 4 frames (walk cycle)
 *   Spritesheet layout: [SE(0-3)] [S(4-7)] [SW(8-11)] [W(12-15)] [NW(16-19)] [N(20-23)] [NE(24-27)] [E(28-31)]
 *   Total: 8 x 4 = 32 frames in a single horizontal strip
 *
 * ISOMETRIC ASSET GENERATION:
 *   Generated at runtime by IsoAssetGenerator.ts
 *   Each frame is CHAR_FRAME_W x CHAR_FRAME_H pixels
 *   Frames are arranged: SE(0-3), S(4-7), SW(8-11), W(12-15), NW(16-19), N(20-23), NE(24-27), E(28-31)
 */

import Phaser from 'phaser'
import { AppConfig } from '../config/AppConfig'
import { TEX } from '../../features/environment/assetKeys'

// ─── DIRECTION DEFINITIONS ───────────────────────────────────────────────────

interface DirectionDef {
  /** Animation key suffix (e.g., 'down', 'NE', 'SE') */
  key: string
  /** Starting frame index in the sprite sheet */
  start: number
}

/** 4-direction definitions for oblique 2.5D mode. */
const OBLIQUE_DIRECTIONS: DirectionDef[] = [
  { key: 'down',  start: 0  },
  { key: 'left',  start: 4  },
  { key: 'right', start: 8  },
  { key: 'up',    start: 12 },
]

/** 8-direction definitions for isometric mode.
 * ISO spritesheet: 8 directions x 4 frames = 32 frames in a row
 * Each direction occupies 4 consecutive frames.
 */
const ISO_DIRECTIONS: DirectionDef[] = [
  { key: 'SE', start: 0  },  // Southeast (facing camera-right) — frames 0-3
  { key: 'S',  start: 4  },  // South — frames 4-7
  { key: 'SW', start: 8  },  // Southwest — frames 8-11
  { key: 'W',  start: 12 },  // West — frames 12-15
  { key: 'NW', start: 16 },  // Northwest — frames 16-19
  { key: 'N',  start: 20 },  // North — frames 20-23
  { key: 'NE', start: 24 },  // Northeast — frames 24-27
  { key: 'E',  start: 28 },  // East — frames 28-31
]

// ─── MAIN REGISTRATION FUNCTION ──────────────────────────────────────────────

export function registerCharacterAnimations(scene: Phaser.Scene): void {
  // Safety check: anims might not be available if scene isn't fully initialized
  if (!scene || !scene.anims) {
    console.warn('[Animations] Scene or anims not available, skipping.')
    return
  }

  const isIsoMode = AppConfig.ISOMETRIC.ENABLED
  const directions = isIsoMode ? ISO_DIRECTIONS : OBLIQUE_DIRECTIONS

  // ── Collect all character sprite definitions ──────────────────────────────
  const definitions: Array<{ prefix: string; key: string; isoKey?: string }> = []

  // Player
  definitions.push({
    prefix: 'player',
    key: isIsoMode ? TEX.PLAYER_ISO : TEX.PLAYER,
    isoKey: TEX.PLAYER_ISO
  })

  // NPCs from pool
  AppConfig.ASSETS.NPC_POOLS.forEach((pool) => {
    definitions.push({
      prefix: pool.key,
      key: pool.key,
      isoKey: TEX.NPC_ISO
    })
  })

  // Staff from pool
  AppConfig.ASSETS.STAFF_POOLS.forEach((pool) => {
    definitions.push({
      prefix: pool.key,
      key: pool.key,
      isoKey: TEX.STAFF_ISO
    })
  })

  // Fallback aliases (some code uses 'npc' / 'staff' as texture key)
  definitions.push({
    prefix: 'npc',
    key: isIsoMode ? TEX.NPC_ISO : TEX.NPC,
    isoKey: TEX.NPC_ISO
  })
  definitions.push({
    prefix: 'staff',
    key: isIsoMode ? TEX.STAFF_ISO : TEX.STAFF,
    isoKey: TEX.STAFF_ISO
  })

  // ── Create animations ────────────────────────────────────────────────────
  let registeredCount = 0
  for (const def of definitions) {
    // Skip if the texture doesn't exist
    if (!scene.textures.exists(def.key)) {
      continue
    }

    // Skip if anims not available
    if (!scene.anims) {
      continue
    }

    for (const dir of directions) {
      const animKey = `${def.prefix}-${dir.key}`

      // Skip if already registered (avoids duplicate on scene re-awake)
      if (scene.anims.exists(animKey)) continue

      try {
        // Get texture to check if it's a spritesheet (more than 1 frame = spritesheet)
        const texture = scene.textures.get(def.key)
        // A spritesheet has frame "0", "1", etc. A single-frame texture only has "__BASE"
        const frameCount = texture.has('1') ? 2 : 1

        if (frameCount > 1) {
          // Use spritesheet frames
          scene.anims.create({
            key: animKey,
            frames: scene.anims.generateFrameNumbers(def.key, {
              start: dir.start,
              end: dir.start + 3,
            }),
            frameRate: 8,
            repeat: -1,
          })
        } else {
          // Single frame texture - create animation from single frame
          scene.anims.create({
            key: animKey,
            frames: [{ key: def.key, frame: 0 }],
            frameRate: 1,
            repeat: -1,
          })
        }
        registeredCount++
      } catch (err) {
        console.warn(`[Animations] Failed to create animation ${animKey}:`, err)
      }
    }
  }

  if (isIsoMode) {
    console.info(`[Animations] Isometric 8-direction mode: ${registeredCount} animations registered`)
  } else {
    console.info(`[Animations] Oblique 4-direction mode: ${registeredCount} animations registered`)
  }
}

/**
 * Returns the facing key for a given velocity vector in isometric mode.
 * Use this to convert a velocity to an animation key suffix.
 *
 * @param vx  — World X velocity (positive = east, negative = west)
 * @param vy  — World Y velocity (positive = south, negative = north)
 * @returns   — One of 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE', 'E'
 */
export function velocityToIsoFacing(vx: number, vy: number): string {
  if (vx === 0 && vy === 0) return 'S'

  const angle = Math.atan2(vy, vx) * (180 / Math.PI)

  // angle 0° = east (+x), angles increase clockwise
  //   0°:   E
  //  45°:   SE
  //  90°:   S
  // 135°:   SW
  // 180°:   W
  // -135°:  NW
  // -90°:   N
  // -45°:   NE

  if (angle >= -22.5 && angle < 22.5)  return 'E'
  if (angle >= 22.5  && angle < 67.5)  return 'SE'
  if (angle >= 67.5  && angle < 112.5) return 'S'
  if (angle >= 112.5 && angle < 157.5) return 'SW'
  if (angle >= 157.5 || angle < -157.5) return 'W'
  if (angle >= -157.5 && angle < -112.5) return 'NW'
  if (angle >= -112.5 && angle < -67.5)  return 'N'
  if (angle >= -67.5  && angle < -22.5)  return 'NE'

  return 'S'
}
