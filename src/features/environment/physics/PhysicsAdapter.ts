/**
 * PhysicsAdapter.ts — Physics configuration types for isometric/oblique modes.
 *
 * PURPOSE:
 * Provides TypeScript types and constants for selecting between physics engines.
 * Currently uses Arcade Physics (default for oblique 2.5D).
 * When isometric mode is enabled (AppConfig.ISOMETRIC.ENABLED = true),
 * the game should switch to Matter.js for proper diamond-tile collision.
 *
 * USAGE:
 *   import { PHYSICS_MODE } from './PhysicsAdapter'
 *
 *   const physicsConfig = {
 *     default: AppConfig.ISOMETRIC.ENABLED ? 'matter' : 'arcade',
 *     arcade: { gravity: { y: 0 } },
 *     matter: { gravity: { y: 0 }, debug: false }
 *   }
 *
 * SWITCHING ENGINES:
 *   AppConfig.ISOMETRIC.ENABLED = false → Arcade Physics (oblique 2.5D, default)
 *   AppConfig.ISOMETRIC.ENABLED = true  → Matter.js (isometric, polygon collision)
 */

export const PHYSICS_MODE = {
  ARCADE: 'arcade',
  MATTER: 'matter',
} as const

export type PhysicsMode = typeof PHYSICS_MODE[keyof typeof PHYSICS_MODE]

export interface PhysicsConfig {
  mode: PhysicsMode
  debug?: boolean
  gravityY?: number
}

/** Shape types supported when using Matter.js bodies. */
export type BodyShape = 'rectangle' | 'circle' | 'polygon' | 'diamond' | 'trapezoid'

/** Config for a body shape. */
export interface BodyConfig {
  /** Shape type. Default 'rectangle'. */
  shape?: BodyShape
  /** Width for rectangle/circle. Default = sprite width. */
  width?: number
  /** Height for rectangle. Default = sprite height. */
  height?: number
  /** Radius for circle. Default = min(width, height) / 2. */
  radius?: number
  /** Number of sides for polygon. Default 6. */
  sides?: number
  /** Vertices for custom polygon (overrides shape). */
  vertices?: { x: number; y: number }[]
  /** Offset x from sprite center. Default 0. */
  offsetX?: number
  /** Offset y from sprite center. Default 0. */
  offsetY?: number
  /** For Matter.js only: set isSensor to true for trigger zones. */
  isSensor?: boolean
  /** For Matter.js only: label for collision filtering. */
  label?: string
}
