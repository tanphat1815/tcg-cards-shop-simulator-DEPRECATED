<script setup lang="ts">
/**
 * CRITICAL: Always use toRaw() when passing Phaser objects to Vue refs.
 * Without toRaw(), Vue's reactivity system will recursively walk the entire
 * WebGL context on every state change, causing severe FPS drops.
 *
 * PHYSICS ENGINE:
 *   When AppConfig.ISOMETRIC.ENABLED is TRUE:
 *     → Uses Matter.js physics for polygon/diamond hitbox collision.
 *     → Gravity disabled (top-down isometric: x=0, y=0).
 *     → Debug mode ON for development (see hitbox wireframes).
 *
 *   When AppConfig.ISOMETRIC.ENABLED is FALSE:
 *     → Uses Arcade Physics (classic oblique 2.5D mode).
 *     → Rectangle-only collision (AABB).
 *
 * DEPTH SORTING:
 *   Isometric: depth = DEPTH_BASE + worldX + worldY (3D formula)
 *   Oblique:   depth = LAYER3_OBJECTS + sprite.y (Y-sort)
 *   Handled in scene code, NOT by the physics engine.
 */
import { onMounted, onUnmounted, ref, toRaw } from 'vue'
import Phaser from 'phaser'
import MainScene from '../../../game/MainScene'
import TownScene from '../../../game/TownScene'
import { AppConfig } from '../../../game/config/AppConfig'

const gameContainer = ref<HTMLElement | null>(null)
// Store game instance as a raw ref — NOT reactive
let game: Phaser.Game | null = null

onMounted(() => {
  if (!gameContainer.value) return

  // ── BUILD PHYSICS CONFIG ────────────────────────────────────────────────
  // We ALWAYS set 'arcade' as default to ensure this.physics is always defined
  // and legacy components don't crash. Matter.js is used explicitly via this.matter
  // when ISOMETRIC mode is enabled.
  const physicsConfig: Phaser.Types.Core.PhysicsConfig = {
    default: 'arcade',
    arcade: {
      gravity: { y: 0, x: 0 },
      debug: false,
    },
    ...(AppConfig.ISOMETRIC.ENABLED ? {
      matter: {
        gravity: { x: 0, y: 0 },
        debug: true,
      }
    } : {})
  }

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: '100%',
    height: '100%',
    physics: physicsConfig,
    scene: [MainScene, TownScene],
  }

  // CRITICAL: Use toRaw on the container element to prevent Vue reactive proxy
  // from intercepting Phaser's DOM manipulation.
  const rawContainer = toRaw(gameContainer.value)
  config.parent = rawContainer

  game = new Phaser.Game(config)

  console.info(
    AppConfig.ISOMETRIC.ENABLED
      ? '[GameContainer] Isometric mode ENABLED — Matter.js physics active (debug: ON)'
      : '[GameContainer] Isometric mode DISABLED — Arcade physics active'
  )
})

onUnmounted(() => {
  if (game) {
    game.destroy(true)
    game = null
  }
})

/**
 * Exposes the raw Phaser game instance to parent components.
 * Usage in parent: const scene = getRawGame()?.scene.getScene('ShopScene')
 */
function getRawGame(): Phaser.Game | null {
  return game
}

defineExpose({ getRawGame })
</script>

<template>
  <div ref="gameContainer" class="w-full h-screen overflow-hidden"></div>
</template>
