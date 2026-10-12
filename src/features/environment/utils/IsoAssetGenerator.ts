/**
 * IsoAssetGenerator.ts — Runtime generation of isometric demo assets.
 *
 * PURPOSE:
 * Generates placeholder isometric sprites using Phaser Graphics API.
 * This allows the isometric demo to run without needing pre-made image files.
 *
 * USAGE:
 *   import { generateIsoAssets } from './IsoAssetGenerator'
 *   generateIsoAssets(scene)  // Call once in scene preload()
 *
 * When real isometric assets are ready, replace these with actual texture keys.
 */

import Phaser from 'phaser'
import { TEX } from '../assetKeys'



// ─── COLOR HELPERS ────────────────────────────────────────────────────

function hexToColor(hex: string): Phaser.Display.Color {
  return Phaser.Display.Color.IntegerToColor(
    parseInt(hex.replace('#', ''), 16)
  )
}

function lighten(hex: string, amount: number): number {
  const c = hexToColor(hex)
  c.lighten(amount)
  return c.color
}

function darken(hex: string, amount: number): number {
  const c = hexToColor(hex)
  c.darken(amount)
  return c.color
}

// ─── CHARACTER SPRITESHEET ────────────────────────────────────────────

function createCharacterSheet(scene: Phaser.Scene, key: string, bodyColor: string): void {
  const FRAME_W = 32
  const FRAME_H = 48

  const baseColor = parseInt(bodyColor.replace('#', ''), 16)
  const lightColor = lighten(bodyColor, 60)
  const darkColor = darken(bodyColor, 40)
  const skinColor = lighten(bodyColor, 100)

  // Create a simple single-frame character texture for now
  // (Spritesheet frames would require proper atlas loading)
  const canvasTexture = scene.textures.createCanvas(key, FRAME_W, FRAME_H)
  if (!canvasTexture) {
    console.warn(`[IsoAssetGenerator] Failed to create canvas texture: ${key}`)
    return
  }

  const ctx = canvasTexture.getContext()
  ctx.clearRect(0, 0, FRAME_W, FRAME_H)

  const fx = FRAME_W / 2
  const fy = FRAME_H  // foot at bottom

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(fx, fy, 7, 2.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // Legs
  ctx.fillStyle = `#${darkColor.toString(16).padStart(6, '0')}`
  ctx.beginPath()
  ctx.ellipse(fx - 3, fy - 6, 2, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(fx + 3, fy - 6, 2, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // Body
  ctx.fillStyle = `#${baseColor.toString(16).padStart(6, '0')}`
  ctx.beginPath()
  ctx.ellipse(fx, fy - 20, 6, 8, 0, 0, Math.PI * 2)
  ctx.fill()

  // Body highlight
  const hlR = Math.min(255, (lightColor >> 16) & 0xff)
  const hlG = Math.min(255, (lightColor >> 8) & 0xff)
  const hlB = Math.min(255, lightColor & 0xff)
  ctx.fillStyle = `rgba(${hlR},${hlG},${hlB},0.4)`
  ctx.beginPath()
  ctx.ellipse(fx - 1, fy - 24, 3, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // Head
  ctx.fillStyle = `#${skinColor.toString(16).padStart(6, '0')}`
  ctx.beginPath()
  ctx.arc(fx, fy - 34, 8, 0, Math.PI * 2)
  ctx.fill()

  // Eyes (facing forward)
  ctx.fillStyle = '#222222'
  ctx.beginPath()
  ctx.arc(fx - 2, fy - 35, 1.5, 0, Math.PI * 2)
  ctx.arc(fx + 2, fy - 35, 1.5, 0, Math.PI * 2)
  ctx.fill()

  // Hair
  ctx.fillStyle = `#${darkColor.toString(16).padStart(6, '0')}`
  ctx.beginPath()
  ctx.ellipse(fx, fy - 40, 3.5, 2, 0, 0, Math.PI * 2)
  ctx.fill()

  canvasTexture.refresh()

  console.info(`[IsoAssetGenerator] Created character texture: ${key}`)
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────

/**
 * Generates all isometric demo assets at runtime.
 * Call this ONCE in your scene's preload() method.
 *
 * @param scene - The Phaser scene to generate assets in
 */
export function generateIsoAssets(scene: Phaser.Scene): void {
  console.info('[IsoAssetGenerator] Generating isometric demo assets...')

  // createFloorTile(scene)
  // createSidewalkTile(scene)
  // createWallTile(scene)

  createCharacterSheet(scene, TEX.PLAYER_ISO, '#4a90d9')   // Blue player
  createCharacterSheet(scene, TEX.NPC_ISO, '#d94a6b')      // Red NPC
  createCharacterSheet(scene, TEX.STAFF_ISO, '#4ad96a')    // Green staff

  // createShelfSprite(scene)
  // createCashierDesk(scene)
  // createTableSprite(scene)
  // createBoxSprite(scene)

  console.info('[IsoAssetGenerator] Done. Isometric assets ready.')
}
